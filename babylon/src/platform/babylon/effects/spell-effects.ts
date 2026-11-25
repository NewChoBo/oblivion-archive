import type { AbstractMesh, Camera, Material, PickingInfo, Scene } from '@babylonjs/core';
import type { ImpactSurface } from '../../browser/weapon-audio.ts';
import {
  Mesh,
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Quaternion,
  Ray,
  Matrix,
} from '@babylonjs/core';
import { glowMaterial, glowPlane } from './spell-glow.ts';
import {
  PROJECTILE_LIGHTS,
  type ProjectileLightProfile,
} from '../../../content/catalogs/projectile-lights.ts';
import { EffectLights, type EffectEmitter } from '../lighting/effect-lights.ts';
import type { WallLightOcclusion } from '../../../app/lighting/wall-light-occlusion.ts';

export interface SpellShot {
  id: 'blaster-a' | 'blaster-j';
  origin: Vector3;
  bowPower?: number;
  arrowModel?: TransformNode;
  arrowLength?: number;
  light?: ProjectileLightProfile | null;
}

export interface SpellHitEvent {
  number: number;
  id: SpellShot['id'];
  bowPower: number;
  speed: number;
  bindSeconds: number;
  start: number[];
  muzzle: number[];
  aim: number[];
  cameraOrigin: number[];
  cameraDirection: number[];
  direction: number[];
  end: number[];
  surface: ImpactSurface;
  hit: boolean;
  mesh: string | null;
  meshId: number | null;
  cameraMesh: string | null;
  muzzleBlocked: boolean;
  distance: number;
  arrived: boolean;
}

interface RetainedImpact {
  root: TransformNode;
  meshes: Mesh[];
  age: number;
  kind: 'arrow' | 'wand';
  surface: AbstractMesh;
  number: number;
  light: ProjectileLightProfile | null;
  lightOffset: Vector3 | null;
  lightPower: number;
}

// A slot owns its meshes for the lifetime of the scene. Firing fills in the
// flight data before the first update and hiding releases the impact frame.
class FlightSlot {
  head: Mesh;
  ink: Mesh;
  tail: Mesh;
  arrow: TransformNode;
  aura: Mesh;
  mark: TransformNode;
  ring: Mesh;
  glyph: Mesh;
  dust: Mesh[];
  active = false;
  age = 0;
  impactAge = -1;
  arrowModel?: TransformNode;
  impactFrame: Matrix | null = null;
  light: ProjectileLightProfile | null = null;
  lightFade = 1;
  lightPower = 1;

  kind!: 0 | 1;
  start!: Vector3;
  end!: Vector3;
  direction!: Vector3;
  pickedMesh?: AbstractMesh | null;
  surface!: ImpactSurface;
  power!: number;
  arrowLength!: number;
  normal!: Vector3;
  rotation!: Quaternion;
  distance!: number;
  travel!: number;
  hit!: boolean;
  speed!: number;
  bindSeconds!: number;
  velocity!: Vector3 | null;
  point!: Vector3;
  flight!: Mesh;
  event!: SpellHitEvent;

  constructor(
    head: Mesh,
    ink: Mesh,
    tail: Mesh,
    arrow: TransformNode,
    aura: Mesh,
    mark: TransformNode,
    ring: Mesh,
    glyph: Mesh,
    dust: Mesh[],
  ) {
    this.head = head;
    this.ink = ink;
    this.tail = tail;
    this.arrow = arrow;
    this.aura = aura;
    this.mark = mark;
    this.ring = ring;
    this.glyph = glyph;
    this.dust = dust;
  }
}

const align = (direction: Vector3) => {
  const z = Vector3.Forward(),
    d = direction.normalizeToNew(),
    cross = Vector3.Cross(z, d),
    dot = Math.max(-1, Math.min(1, Vector3.Dot(z, d)));
  return cross.lengthSquared() < 1e-8
    ? dot > 0
      ? Quaternion.Identity()
      : Quaternion.RotationAxis(Vector3.Up(), Math.PI)
    : Quaternion.RotationAxis(cross.normalize(), Math.acos(dot));
};
const arrowGravity = 9.8,
  arrowStep = 1 / 90,
  arrowRange = 26;
const IMPACT_LIFETIMES = { arrow: 18, wand: 6 };
const retainedLimit = 24;
const impactLightOffset = new Vector3(0, 0, 0.146);

function afterglowIntensity(profile: ProjectileLightProfile | null, age: number) {
  const afterglow = profile?.afterglow;
  return afterglow && age < afterglow.duration
    ? afterglow.intensity * (1 - age / afterglow.duration) ** 2
    : 0;
}
function surfaceOf(mesh?: AbstractMesh | null): ImpactSurface {
  if (mesh?.metadata?.inkThreat) return 'ink';
  const surface: unknown = mesh?.metadata?.impactSurface ?? mesh?.material?.metadata?.impactSurface;
  if (surface === 'wood' || surface === 'metal' || surface === 'stone') return surface;
  // Untagged models and procedural scenery use their material first, then their mesh name.
  for (const label of [mesh?.material?.name, mesh?.name]) {
    if (/brass|metal/i.test(label ?? '')) return 'metal';
    if (/slate|stone|brick|rubble|masonry|paving/i.test(label ?? '')) return 'stone';
    if (
      /walnut|wood|timber|leather|folio|book|shelf|shelves|ledger|register|frame|floorboard/i.test(
        label ?? '',
      )
    )
      return 'wood';
  }
  return 'stone';
}
export function createSpellEffects(
  scene: Scene,
  camera: Camera,
  getPlayerEye: () => Vector3,
  onImpact: (mesh: AbstractMesh, seconds: number, event: SpellHitEvent) => void = () => {},
) {
  const pool: FlightSlot[] = [],
    retained: RetainedImpact[] = [],
    events: SpellHitEvent[] = [];
  const stats = { fired: 0, hits: 0, misses: 0, resets: 0 };
  let clock = 0;
  function glow(name: string, color: string) {
    const mat = new StandardMaterial(name, scene);
    mat.disableLighting = true;
    mat.emissiveColor = Color3.FromHexString(color);
    return mat;
  }
  const cyan = glow('vesper blue ink', '#68cadd'),
    silver = glow('vesper silver edge', '#d7fcff');
  const gold = glow('dawn gold', '#ffbd53'),
    amber = glow('arrow amber trail', '#e28238');
  const auras = [
    glowMaterial(scene, 'moonstone halo', new Color3(0.2, 0.75, 1)),
    glowMaterial(scene, 'sunstone halo', new Color3(1, 0.58, 0.13)),
  ] as const;
  const dustMats = {
    stone: glow('stone dust', '#a5a6a1'),
    wood: glow('wood splinters', '#bb875a'),
    metal: glow('brass sparks', '#fff2ad'),
    ink: glow('shadow ink droplets', '#a88ebf'),
  };
  function effect(mesh: Mesh, material: Material) {
    mesh.material = material;
    mesh.isPickable = false;
    mesh.metadata = { spellEffect: true };
    mesh.setEnabled(false);
    return mesh;
  }
  // Two tapered brush lines form one twisting stroke.
  function brushLine(phase: number) {
    const path = Array.from({ length: 17 }, (_, n) => {
      const t = n / 16,
        angle = phase + 4.8 * t,
        r = 0.044 * Math.sin(t * Math.PI);
      return new Vector3(r * Math.cos(angle), r * Math.sin(angle), t - 1);
    });
    return MeshBuilder.CreateTube(
      'forked ink stroke',
      { path, tessellation: 5, radiusFunction: (n) => 0.003 + 0.01 * Math.sin((n * Math.PI) / 16) },
      scene,
    );
  }
  const brush = effect(Mesh.MergeMeshes([brushLine(0), brushLine(Math.PI)], true, true)!, cyan);
  const wake = effect(
    MeshBuilder.CreateCylinder(
      'thin arrow trail',
      { height: 1, diameterTop: 0.028, diameterBottom: 0.002, tessellation: 6 },
      scene,
    ),
    amber,
  );
  // Bake the point at local z=0, with the tail extending toward -Z.
  wake.rotation.x = Math.PI / 2;
  wake.position.z = -0.5;
  wake.bakeCurrentTransformIntoVertices();
  const segments = [];
  const points: [number, number][] = [
    [0, 0.12],
    [0, 0.08],
    [0.055, 0],
    [0, -0.08],
    [-0.055, 0],
    [0, 0.08],
  ];
  const edges: [[number, number], [number, number]][] = points
    .slice(1)
    .map((p, i) => [points[i]!, p]);
  edges.push([
    [0, -0.08],
    [0, -0.12],
  ]);
  for (const [a, b] of edges) {
    const line = MeshBuilder.CreateBox(
      'seal stroke',
      { width: Math.hypot(b[0] - a[0], b[1] - a[1]), height: 0.008, depth: 0.004 },
      scene,
    );
    line.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    line.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
    segments.push(line);
  }
  const seal = effect(Mesh.MergeMeshes(segments, true, true)!, silver);
  for (let i = 0; i < 10; i++) {
    const head = effect(
      MeshBuilder.CreatePolyhedron('vesper crystal tip', { type: 1, size: 0.034 }, scene),
      silver,
    );
    const ink = brush.clone('flying seal stroke'),
      tail = wake.clone('flying arrow trail');
    const arrow = new TransformNode('dawn arrow in flight', scene);
    const mark = new TransformNode('surface impact anchor', scene);
    const aura = glowPlane(scene, 'projectile and impact halo', auras[0]);
    aura.metadata = { spellEffect: true };
    const ring = effect(
      MeshBuilder.CreateTorus(
        'impact ripple',
        { diameter: 0.32, thickness: 0.01, tessellation: 32 },
        scene,
      ),
      cyan,
    );
    ring.parent = mark;
    ring.rotation.x = Math.PI / 2;
    const glyph = seal.clone('impact seal');
    glyph.parent = mark;
    const dust = Array.from({ length: 7 }, () => {
      const chip = effect(
        MeshBuilder.CreatePolyhedron('surface chip', { type: 1, size: 0.014 }, scene),
        gold,
      );
      chip.parent = mark;
      return chip;
    });
    const slot = new FlightSlot(head, ink, tail, arrow, aura, mark, ring, glyph, dust);
    hide(slot);
    pool.push(slot);
  }
  const effectLights = new EffectLights(scene, pool[0]!.head);
  const world = (mesh: AbstractMesh) =>
    mesh.isVisible &&
    mesh.isEnabled() &&
    mesh.isPickable &&
    !mesh.metadata?.playerVisual &&
    !mesh.metadata?.toolVisual &&
    !mesh.metadata?.spellEffect &&
    mesh.getTotalVertices() > 0;
  function pick(origin: Vector3, direction: Vector3, length: number) {
    return scene.pickWithRay(new Ray(origin, direction, length), world, false);
  }
  const range = 10;
  // Camera distance includes the chase arm. Weapon reach still starts at the
  // muzzle: 10m for the wand and 26m of swept, gravity-affected arrow flight.
  const aimRange = arrowRange + 4;
  let aimFrame = -1,
    aimPoint: Vector3,
    cameraHit: PickingInfo | null,
    aimOrigin: Vector3,
    aimDirection: Vector3;
  function reticlePoint() {
    const frame = scene.getFrameId();
    const look = camera.getForwardRay(aimRange);
    if (
      frame !== aimFrame ||
      !aimOrigin?.equals(look.origin) ||
      !aimDirection?.equals(look.direction)
    ) {
      cameraHit = pick(look.origin, look.direction, aimRange);
      aimPoint = cameraHit?.hit
        ? cameraHit.pickedPoint!
        : look.origin.add(look.direction.scale(aimRange));
      aimOrigin = look.origin.clone();
      aimDirection = look.direction.clone();
      aimFrame = frame;
    }
    return aimPoint;
  }
  function hide(slot: FlightSlot) {
    for (const mesh of [
      slot.head,
      slot.ink,
      slot.tail,
      slot.arrow,
      slot.aura,
      slot.ring,
      slot.glyph,
      ...slot.dust,
    ])
      mesh.setEnabled(false);
    slot.aura.parent = null;
    slot.mark.parent = null;
    slot.impactFrame = null;
    slot.active = false;
  }
  function launch(slot: FlightSlot, arrowModel?: TransformNode) {
    const bow = slot.kind === 1;
    if (bow && arrowModel && !slot.arrowModel) {
      // Reuse the actual nocked arrow, including its faceted head and three fletchings.
      const copy = arrowModel.clone('dawn light arrow', slot.arrow)!;
      copy.position.set(0, 0, -slot.arrowLength);
      copy.scaling.setAll(1);
      copy.setEnabled(true);
      for (const mesh of [copy, ...copy.getChildMeshes()]) {
        Object.assign(mesh, {
          isPickable: false,
          metadata: { spellEffect: true },
          renderingGroupId: 0,
        });
        if (mesh instanceof Mesh && mesh.material)
          mesh.material = mesh.material.name === 'Sunstone' ? silver : gold;
      }
      slot.arrowModel = copy;
    }
    slot.flight = bow ? slot.tail : slot.ink;
    slot.flight.setEnabled(true);
    slot.flight.visibility = 1;
    slot.flight.rotationQuaternion = slot.rotation;
    slot.flight.position.copyFrom(slot.start);
    slot.flight.scaling.set(1, 1, 0.001);
    slot.head.setEnabled(!bow || !slot.arrowModel);
    slot.head.visibility = 1;
    slot.head.position.copyFrom(slot.start);
    slot.head.rotationQuaternion = slot.rotation;
    slot.head.scaling.set(0.8, 0.8, 1.5);
    slot.arrow.setEnabled(bow);
    slot.arrow.position.copyFrom(slot.start);
    slot.arrow.rotationQuaternion = slot.rotation;
    slot.arrow.scaling.setAll(0.001);
    slot.aura.material = auras[slot.kind];
    slot.aura.position.copyFrom(slot.start);
    slot.aura.scaling.setAll(bow ? 0.12 + 0.13 * slot.power : 0.22);
    slot.aura.visibility = 0.86;
    slot.aura.setEnabled(true);
  }
  function arrive(slot: FlightSlot) {
    slot.impactAge = 0;
    slot.event.arrived = true;
    slot.head.setEnabled(false);
    slot.arrow.setEnabled(false);
    if (!slot.hit) {
      slot.aura.setEnabled(false);
      stats.misses++;
      return;
    }
    stats.hits++;
    onImpact(slot.pickedMesh!, slot.bindSeconds, slot.event);
    const wand = slot.kind === 0,
      shadow = slot.surface === 'ink';
    const mark = slot.mark;
    mark.position.copyFrom(slot.end).addInPlace(slot.normal.scale(0.014));
    mark.scaling.setAll(1);
    mark.rotationQuaternion = align(slot.normal);
    slot.impactFrame = mark
      .computeWorldMatrix(true)
      .multiply(Matrix.Invert(slot.pickedMesh!.computeWorldMatrix(true)));
    slot.aura.parent = mark;
    slot.aura.position.set(0, 0, 0.024);
    slot.aura.scaling.setAll(wand ? 0.52 : 0.27 + 0.31 * slot.power);
    slot.ring.material = wand ? cyan : gold;
    slot.ring.setEnabled(wand || shadow || slot.power > 0.7);
    slot.glyph.setEnabled(wand);
    slot.glyph.visibility = slot.ring.visibility = 1;
    slot.glyph.scaling.setAll(1.05);
    slot.ring.scaling.setAll(0.48);
    for (const [i, chip] of slot.dust.entries()) {
      chip.material = i % 3 === 0 ? (wand ? silver : gold) : dustMats[slot.surface];
      chip.scaling.set(
        0.65,
        slot.surface === 'metal' ? 3.5 : slot.surface === 'wood' ? 2.7 : 1.3,
        0.7,
      );
      chip.visibility = 1;
      chip.position.setAll(0);
      chip.setEnabled(wand || i < 4 + Math.round(3 * slot.power));
    }
    retainImpact(slot);
  }
  function removeImpact(index: number) {
    const [impact] = retained.splice(index, 1);
    impact!.root.dispose();
  }
  function retainImpact(slot: FlightSlot) {
    const wand = slot.kind === 0;
    if (!wand && (slot.surface === 'ink' || slot.surface === 'metal')) return;
    if (retained.length === retainedLimit) removeImpact(0);
    const root = new TransformNode(wand ? 'retained seal' : 'lodged dawn arrow', scene);
    root.position.copyFrom(slot.end);
    root.rotationQuaternion = (wand ? align(slot.normal) : slot.rotation).clone();
    if (wand) root.position.addInPlace(slot.normal.scale(0.018));
    const visual = wand
      ? seal.clone('retained seal stroke', root)
      : slot.arrowModel
        ? slot.arrowModel.clone('retained dawn arrow', root)!
        : slot.head.clone('lodged crystal tip', root);
    if (wand) {
      visual.position.setAll(0);
      visual.rotationQuaternion = Quaternion.Identity();
      visual.scaling.setAll(1.47);
    } else if (!slot.arrowModel) {
      visual.position.setAll(0);
      visual.rotationQuaternion = Quaternion.Identity();
    }
    visual.setEnabled(true);
    const meshes = [visual, ...visual.getChildMeshes()].filter((mesh) => mesh instanceof Mesh);
    for (const mesh of meshes) {
      mesh.isPickable = false;
      mesh.metadata = { spellEffect: true };
      mesh.visibility = 1;
    }
    const lightOffset = slot.light?.afterglow
      ? Vector3.TransformCoordinates(
          slot.end.add(slot.normal.scale(0.16)),
          Matrix.Invert(root.computeWorldMatrix(true)),
        )
      : null;
    root.setParent(slot.pickedMesh!);
    retained.push({
      root,
      meshes,
      age: 0,
      kind: wand ? 'wand' : 'arrow',
      surface: slot.pickedMesh!,
      number: slot.event.number,
      light: slot.light,
      lightOffset,
      lightPower: slot.lightPower,
    });
  }
  function advanceArrow(slot: FlightSlot, dt: number) {
    let ended = false;
    while (dt > 0 && !ended) {
      const step = Math.min(dt, arrowStep);
      const segment = slot.velocity!.scale(step);
      segment.y -= 0.5 * arrowGravity * step * step;
      const length = segment.length();
      dt -= step;
      if (length < 1e-8) {
        slot.velocity!.y -= arrowGravity * step;
        continue;
      }
      const sweep = Math.min(length, arrowRange - slot.travel);
      const direction = segment.scaleInPlace(1 / length);
      const hit = pick(slot.point, direction, sweep);
      const distance = hit?.hit ? Vector3.Distance(slot.point, hit.pickedPoint!) : sweep;
      slot.point.addInPlace(direction.scale(distance));
      slot.travel += distance;
      slot.velocity!.y -= arrowGravity * step * (distance / length);
      if (hit?.hit) {
        slot.point.copyFrom(hit.pickedPoint!);
        slot.hit = true;
        slot.pickedMesh = hit.pickedMesh;
        slot.surface = surfaceOf(hit.pickedMesh);
        slot.normal = hit.getNormal(true) || direction.negate();
        if (Vector3.Dot(slot.normal, direction) > 0) slot.normal.scaleInPlace(-1);
      }
      ended = slot.hit || sweep < length || slot.travel >= arrowRange;
    }
    slot.distance = slot.travel;
    slot.end.copyFrom(slot.point);
    slot.rotation = align(slot.velocity!);
    Object.assign(slot.event, {
      end: slot.end.asArray(),
      distance: slot.travel,
      hit: slot.hit,
      surface: slot.surface,
      mesh: slot.pickedMesh?.name ?? null,
      meshId: slot.pickedMesh?.uniqueId ?? null,
    });
    return ended;
  }
  function fly(slot: FlightSlot, dt: number) {
    const bow = slot.kind === 1;
    let point, ended;
    if (bow && slot.velocity) {
      ended = advanceArrow(slot, dt);
      point = slot.point;
      slot.arrow.rotationQuaternion =
        slot.head.rotationQuaternion =
        slot.flight.rotationQuaternion =
          slot.rotation;
    } else {
      slot.travel = Math.min(slot.distance, slot.travel + slot.speed * dt);
      point = slot.start.add(slot.direction.scale(slot.travel));
      ended = slot.travel >= slot.distance;
    }
    slot.head.position.copyFrom(point);
    slot.arrow.position.copyFrom(point);
    slot.flight.position.copyFrom(point);
    slot.aura.position.copyFrom(point);
    const length = Math.min(slot.travel, bow ? 0.36 + 0.58 * slot.power : 0.57);
    slot.flight.scaling.set(
      bow ? 0.65 + 0.85 * slot.power : 1,
      bow ? 0.65 + 0.85 * slot.power : 1,
      Math.max(0.001, length),
    );
    if (bow) slot.arrow.scaling.setAll(Math.min(1, slot.travel / slot.arrowLength));
    else
      slot.flight.rotationQuaternion = slot.rotation.multiply(
        Quaternion.RotationAxis(Vector3.Forward(), slot.age * 12),
      );
    if (ended) arrive(slot);
  }
  function dissipate(slot: FlightSlot, dt: number) {
    if (slot.hit) {
      if (slot.pickedMesh!.isDisposed() || !slot.pickedMesh!.isEnabled()) {
        hide(slot);
        return;
      }
      slot
        .impactFrame!.multiply(slot.pickedMesh!.computeWorldMatrix(true))
        .decompose(slot.mark.scaling, slot.mark.rotationQuaternion!, slot.mark.position);
    }
    slot.impactAge += dt;
    const t = slot.impactAge,
      wand = slot.kind === 0;
    const life = wand
      ? 0.5
      : slot.surface === 'wood'
        ? 0.48 + 0.24 * slot.power
        : 0.31 + 0.18 * slot.power;
    const fade = Math.max(0, 1 - t / life);
    slot.lightFade = fade * fade;
    slot.flight.visibility = Math.max(0, 1 - t / 0.052);
    slot.aura.visibility = 0.86 * fade * fade;
    slot.ring.visibility = fade * fade;
    slot.glyph.visibility = Math.min(1, fade * 2);
    slot.ring.scaling.setAll(0.48 + (1 - fade) * (wand ? 2.1 : 1.15 + slot.power));
    slot.glyph.scaling.setAll(1.05 + 0.42 * Math.min(t / 0.06, 1));
    for (const [i, p] of slot.dust.entries()) {
      if (!p.isEnabled()) continue;
      const angle = i * 2.4 + slot.event.number * 0.51,
        speed = (0.34 + 0.1 * (i % 3)) * (wand ? 1 : 0.76 + 0.95 * slot.power);
      p.position.set(
        Math.cos(angle) * t * speed,
        Math.sin(angle) * t * speed,
        t * (0.24 + 0.1 * (i % 3)),
      );
      p.rotation.z = angle + clock * (i % 2 ? 5 : -3);
      p.visibility = fade;
    }
    if (t >= life) hide(slot);
  }
  function updateLights() {
    const emitters: EffectEmitter[] = [];
    for (const slot of pool) {
      if (!slot.active || !slot.light) continue;
      const travelling = slot.impactAge < 0;
      if (!travelling && !slot.hit) continue;
      const { light } = slot;
      const position = travelling
        ? slot.head.position
        : Vector3.TransformCoordinates(impactLightOffset, slot.mark.computeWorldMatrix(true));
      const intensity =
        (travelling
          ? light.flight
          : Math.max(light.impact * slot.lightFade, afterglowIntensity(light, slot.impactAge))) *
        slot.lightPower;
      if (intensity > 0)
        emitters.push({
          id: slot.event.number,
          position,
          color: light.color,
          range: light.range,
          intensity,
        });
    }
    for (let i = retained.length - 1; i >= 0; i--) {
      const impact = retained[i]!;
      const { light, lightOffset } = impact;
      if (!light?.afterglow || !lightOffset) continue;
      const intensity = afterglowIntensity(light, impact.age) * impact.lightPower;
      if (intensity <= 0 || emitters.some((emitter) => emitter.id === impact.number)) continue;
      const position = Vector3.TransformCoordinates(
        lightOffset,
        impact.root.computeWorldMatrix(true),
      );
      emitters.push({
        id: impact.number,
        position,
        color: light.color,
        range: light.afterglow.range,
        intensity,
      });
    }
    effectLights.update(emitters, clock);
  }
  return {
    reticlePoint,
    assignLightSurfaces: (occlusion?: WallLightOcclusion) => effectLights.assignSurfaces(occlusion),
    prepareLighting: (waitForScene: () => Promise<void>) => effectLights.prepare(waitForScene),
    fire({
      id,
      origin,
      bowPower = 0,
      arrowModel,
      arrowLength = 0.625,
      light = id === 'blaster-a' ? PROJECTILE_LIGHTS.wand : PROJECTILE_LIGHTS.runeArrow,
    }: SpellShot) {
      aimFrame = -1; // World animation may have moved a target after the pose query.
      const kind = id === 'blaster-a' ? 0 : 1,
        aim = reticlePoint();
      const speed = kind === 0 ? 14 : 8 + 24 * bowPower;
      const bindSeconds = kind === 0 ? 3.5 : 1.25 + 3.25 * bowPower;
      const eye = getPlayerEye(),
        toTip = origin.subtract(eye),
        tipDistance = toTip.length(),
        obstacle = tipDistance > 0.01 ? pick(eye, toTip.normalize(), tipDistance) : null;
      let start = origin.clone(),
        hit,
        direction;
      if (obstacle?.hit) {
        hit = obstacle;
        direction = obstacle.pickedPoint!.subtract(eye).normalize();
        start = obstacle.pickedPoint!.subtract(direction.scale(0.012));
      } else {
        direction = aim.subtract(start).normalize();
        if (direction.lengthSquared() < 1e-8) direction = camera.getForwardRay().direction;
        if (kind === 0) hit = pick(start, direction, range);
      }
      const velocity = kind === 1 && !obstacle?.hit ? direction.scale(speed) : null;
      const end = hit?.hit
          ? hit.pickedPoint!.clone()
          : velocity
            ? start.clone()
            : start.add(direction.scale(range)),
        distance = Vector3.Distance(start, end),
        slot = pool.find((p) => !p.active) || pool.reduce((a, b) => (a.age > b.age ? a : b));
      hide(slot);
      const surface = surfaceOf(hit?.pickedMesh);
      Object.assign(slot, {
        active: true,
        kind,
        start,
        end,
        direction,
        pickedMesh: hit?.pickedMesh,
        surface,
        power: bowPower,
        arrowLength,
        normal: hit?.hit ? hit.getNormal(true) || direction.scale(-1) : Vector3.Up(),
        rotation: align(direction),
        distance,
        travel: 0,
        age: 0,
        impactAge: -1,
        hit: !!hit?.hit,
        speed,
        bindSeconds,
        velocity,
        point: start.clone(),
        light,
        lightFade: 1,
        lightPower: kind === 0 ? 1 : 0.5 + 0.5 * bowPower,
      });
      if (Vector3.Dot(slot.normal, direction) > 0) slot.normal.scaleInPlace(-1);
      launch(slot, arrowModel);
      stats.fired++;
      const event = {
        number: stats.fired,
        id,
        bowPower,
        speed,
        bindSeconds,
        start: start.asArray(),
        muzzle: origin.asArray(),
        aim: aim.asArray(),
        cameraOrigin: aimOrigin.asArray(),
        cameraDirection: aimDirection.asArray(),
        direction: direction.asArray(),
        end: end.asArray(),
        surface,
        hit: !!hit?.hit,
        mesh: hit?.pickedMesh?.name || null,
        meshId: hit?.pickedMesh?.uniqueId || null,
        cameraMesh: cameraHit?.pickedMesh?.name || null,
        muzzleBlocked: !!obstacle?.hit,
        distance,
        arrived: false,
      };
      slot.event = event;
      events.push(event);
      if (events.length > 60) events.shift();
    },
    update(dt: number) {
      if (dt <= 0) return;
      clock += dt;
      for (let i = retained.length - 1; i >= 0; i--) {
        const impact = retained[i]!,
          life = IMPACT_LIFETIMES[impact.kind];
        impact.age += dt;
        if (impact.age >= life || impact.surface.isDisposed() || !impact.surface.isEnabled()) {
          removeImpact(i);
          continue;
        }
        const fade = Math.min(1, (life - impact.age) / (impact.kind === 'arrow' ? 2 : 1));
        for (const mesh of impact.meshes) mesh.visibility = fade;
      }
      for (const slot of pool) {
        if (!slot.active) continue;
        slot.age += dt;
        if (slot.impactAge < 0) fly(slot, dt);
        else dissipate(slot, dt);
      }
      updateLights();
    },
    reset() {
      for (const p of pool) hide(p);
      while (retained.length) removeImpact(0);
      effectLights.reset();
      aimFrame = -1;
      events.length = 0;
      stats.fired = 0;
      stats.hits = 0;
      stats.misses = 0;
      stats.resets++;
    },
    ready: () =>
      Promise.all(
        [cyan, silver, gold, amber, ...Object.values(dustMats)].map((m) =>
          m.forceCompilationAsync(pool[0]!.head),
        ),
      ),
    snapshot: () => ({
      ...stats,
      active: pool.filter((p) => p.active).length,
      travelling: pool.filter((p) => p.active && p.impactAge < 0).length,
      lights: effectLights.snapshot(),
      retained: retained.map((p) => ({
        number: p.number,
        kind: p.kind,
        age: p.age,
        life: IMPACT_LIFETIMES[p.kind],
        mesh: p.surface.name,
        position: p.root.computeWorldMatrix(true).getTranslation().asArray(),
        visibility: p.meshes[0]?.visibility,
      })),
      events: events.map((e) => ({ ...e })),
    }),
  };
}
