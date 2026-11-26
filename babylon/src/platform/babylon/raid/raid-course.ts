import {
  Color3,
  Color4,
  DirectionalLight,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type AbstractEngine,
} from '@babylonjs/core';
import { instantiateHumanoid } from '../actors/sample-humanoid.ts';
import { createCastleExterior } from '../citadel/castle-exterior.ts';
import {
  HEROES,
  HERO_IDS,
  RAID_HZ,
  WAGON,
  jumpHeight,
  type RaidPoint,
  type RaidView,
  type RaidTarget,
  type RaidHero,
} from '../../../game/raid/raid-match.ts';

/** The course scrolls past the formation. Picking returns the same wagon-relative metres as the rules. */
export async function createRaidCourse(engine: AbstractEngine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.035, 0.045, 0.085, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0.016, 0.02, 0.036);
  scene.fogStart = 19;
  scene.fogEnd = 66;
  const camera = new FreeCamera('chase camera', new Vector3(0, 6.7, -12), scene);
  camera.fov = 0.94;
  camera.minZ = 0.3;
  camera.maxZ = 125;
  const sky = createCastleExterior(scene);
  const fill = new HemisphericLight('starlight', Vector3.Up(), scene);
  fill.diffuse = new Color3(0.78, 0.84, 1);
  fill.groundColor = new Color3(0.22, 0.16, 0.19);
  fill.intensity = 1;
  const sun = new DirectionalLight('low warm sidelight', new Vector3(0.55, -0.9, 0.32), scene);
  sun.diffuse = new Color3(1, 0.78, 0.54);
  sun.intensity = 1.15;
  function mat(name: string, hex: string, glow = 0) {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = m.diffuseColor.scale(0.22);
    m.emissiveColor = m.diffuseColor.scale(glow);
    return m;
  }
  const stone = mat('bridge stone', '#969396'),
    iron = mat('tempered iron', '#424451'),
    oak = mat('wagon oak', '#aa8263'),
    brass = mat('bronze bands', '#cba264'),
    ember = mat('ward amber', '#ffb355', 0.65);
  const blue = mat('allied ward', '#61dad0', 0.65),
    red = mat('rival ward', '#ff667a', 0.65);
  const stoneTexture = new Texture('./assets/citadel/ashlar.jpg', scene);
  stone.diffuseTexture = stoneTexture;
  oak.diffuseTexture = new Texture('./assets/polyhaven/old_wooden_floor_01_diff_1k.jpg', scene);
  function box(
    name: string,
    parent: TransformNode | null,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: StandardMaterial,
  ) {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
  const ground = MeshBuilder.CreateGround('raid causeway', { width: 14, height: 104 }, scene);
  ground.position.z = 28;
  const road = mat('paved causeway', '#bec0c6');
  const paving = new Texture('./assets/citadel/flagstone.jpg', scene);
  paving.uScale = 3;
  paving.vScale = 24;
  road.diffuseTexture = paving;
  ground.material = road;
  ground.metadata = { raidGround: true };
  // Instance each architectural piece. Only one segment's transform per span changes per frame.
  const span = new TransformNode('first bridge span', scene);
  for (const side of [-1, 1]) {
    box('coping', span, side * 6.9, 0.38, 0, 0.55, 0.76, 8, stone);
    for (const z of [-3, 1]) box('merlon', span, side * 6.9, 0.95, z, 0.58, 0.5, 1.8, stone);
    box('lamp pedestal', span, side * 6.9, 1.5, 3, 0.72, 2.15, 0.75, stone);
    box('lamp cornice', span, side * 6.9, 2.55, 3, 0.9, 0.19, 0.9, brass);
    box('beacon', span, side * 6.9, 2.86, 3, 0.38, 0.46, 0.38, ember);
  }
  const pieces = span.getChildMeshes();
  const spans = [span];
  for (let i = 1; i < 12; i++) {
    const next = new TransformNode('bridge span ' + i, scene);
    for (const mesh of pieces) {
      const part = mesh as ReturnType<typeof MeshBuilder.CreateBox>;
      const copy = part.createInstance(part.name);
      copy.parent = next;
      copy.isPickable = false;
    }
    spans.push(next);
  }
  const wagon = new TransformNode('siege wagon', scene);
  wagon.position.z = WAGON.z + 1;
  box('wagon bed', wagon, 0, 1.05, 0, 3.4, 0.4, 3.55, iron);
  box('wagon keep', wagon, 0, 1.95, 0, 2.88, 1.6, 3.25, oak);
  box('armored crown', wagon, 0, 2.85, 0, 3.28, 0.32, 3.6, iron);
  for (const x of [-1.25, 1.25]) {
    box('band', wagon, x, 1.98, 0, 0.18, 1.85, 3.35, brass);
    for (const z of [-1.4, 1.4]) box('crown spike', wagon, x, 3.12, z, 0.3, 0.55, 0.35, brass);
  }
  box('rear standard', wagon, 0, 1.92, -1.66, 1.25, 1.38, 0.09, red);
  const seal = box('boss seal', wagon, 0, 2.02, -1.74, 0.53, 0.53, 0.1, ember);
  seal.rotation.z = Math.PI / 4;
  const wheels: TransformNode[] = [];
  for (const side of [-1, 1])
    for (const z of [-1.13, 1.13]) {
      const pivot = new TransformNode('axle', scene);
      pivot.parent = wagon;
      pivot.position.set(side * 1.62, 0.77, z);
      wheels.push(pivot);
      const wheel = MeshBuilder.CreateTorus(
        'iron wheel',
        { diameter: 1.36, thickness: 0.21, tessellation: 18 },
        scene,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.parent = pivot;
      wheel.material = iron;
      for (const ang of [0, Math.PI / 3, (Math.PI * 2) / 3])
        box('wheel spokes', pivot, 0, 0, 0, 0.18, 1.34, 0.12, brass).rotation.x = ang;
    }
  for (const m of wagon.getChildMeshes()) {
    m.metadata = { raidTarget: 'wagon' };
    m.isPickable = true;
  }
  const shadowMat = mat('runner contact shade', '#1a1b23');
  shadowMat.alpha = 0.55;
  const implementsByHero = new Map<RaidHero, TransformNode>();
  for (const hero of HERO_IDS) {
    const grip = new TransformNode(hero + ' grip', scene);
    if (hero === 'longshot') {
      const curve = [
        new Vector3(0, -0.54, -0.08),
        new Vector3(0, -0.27, 0.08),
        new Vector3(0, 0, 0.12),
        new Vector3(0, 0.27, 0.08),
        new Vector3(0, 0.54, -0.08),
      ];
      const bow = MeshBuilder.CreateTube(
        'recurve bow',
        { path: curve, radius: 0.028, tessellation: 6 },
        scene,
      );
      bow.material = oak;
      bow.parent = grip;
      bow.isPickable = false;
      box('bowstring', grip, 0, 0, -0.08, 0.009, 1.08, 0.009, brass);
    } else {
      box('haft', grip, 0, 0.18, 0, 0.056, 0.78, 0.056, oak);
      if (hero === 'hammer') box('hammer head', grip, 0, 0.54, 0, 0.47, 0.22, 0.22, iron);
      else {
        const jewel = MeshBuilder.CreatePolyhedron('focus crystal', { type: 1, size: 0.13 }, scene);
        jewel.parent = grip;
        jewel.position.y = 0.59;
        jewel.material = hero === 'jade' ? blue : red;
        jewel.isPickable = false;
      }
    }
    grip.rotation.x = 0.45;
    implementsByHero.set(hero, grip);
  }
  const actors = await Promise.all(
    [0, 1, 2, 3].map(async (slot) => {
      const root = new TransformNode('runner ' + slot, scene);
      const rig = await instantiateHumanoid(
        scene,
        root,
        slot === 0 ? 'player' : slot === 1 ? 'ally' : 'enemy',
      );
      for (const m of root.getChildMeshes()) {
        m.metadata = { ...m.metadata, raidTarget: slot };
        m.isPickable = slot >= 2;
      }
      const ring = MeshBuilder.CreateTorus(
        'team marking',
        { diameter: 1.02, thickness: 0.065, tessellation: 24 },
        scene,
      );
      ring.material = slot < 2 ? blue : red;
      ring.isPickable = false;
      const shadow = MeshBuilder.CreateDisc(
        'foot contact',
        { radius: 0.47, tessellation: 18 },
        scene,
      );
      shadow.rotation.x = Math.PI / 2;
      shadow.material = shadowMat;
      shadow.isPickable = false;
      const shot = MeshBuilder.CreateSphere('attack trace', { diameter: 0.22, segments: 6 }, scene);
      shot.material = slot < 2 ? blue : red;
      shot.isPickable = false;
      const crest = box('health backing', root, 0, 1.95, 0, 0.78, 0.09, 0.05, iron);
      const life = box(
        'runner health',
        root,
        0,
        1.95,
        -0.033,
        0.74,
        0.055,
        0.012,
        slot < 2 ? blue : red,
      );
      return { root, rig, ring, shadow, shot, crest, life };
    }),
  );
  const hazardPaint = mat('wagon warning paint', '#ec6156', 0.22);
  hazardPaint.alpha = 0.48;
  const warning = box('wagon strike warning', null, 0, 0.024, 1, 2.5, 0.025, 19, hazardPaint);
  const lock = MeshBuilder.CreateTorus(
    'target lock',
    { diameter: 1.6, thickness: 0.09, tessellation: 28 },
    scene,
  );
  lock.material = ember;
  lock.isPickable = false;
  // Reuse one road marker throughout the gesture; it must never intercept a pick.
  const preview = MeshBuilder.CreateTorus(
    'skill aim',
    { diameter: 2, thickness: 0.055, tessellation: 56 },
    scene,
  );
  preview.isPickable = false;
  preview.setEnabled(false);
  function showAim(point: { x: number; z: number } | null, radius = 1, valid = true) {
    preview.setEnabled(point !== null);
    if (!point) return;
    preview.material = valid ? blue : red;
    preview.scaling.set(radius, 1, radius);
    preview.position.set(point.x, 0.12, point.z);
  }
  await scene.whenReadyAsync();
  const look = new Vector3();
  function render(view: RaidView, dt: number, subtick: number) {
    const player = view.runners[0]!;
    const time = (view.tick + subtick) / RAID_HZ,
      scroll = time * 6;
    paving.vOffset = (scroll * 24) / 104;
    spans.forEach((s, i) => {
      s.position.z = i * 8 - 16 - (scroll % 8);
    });
    for (const wheel of wheels) wheel.rotation.x = scroll / 0.77;
    sky.update(dt);
    for (const r of view.runners) {
      const a = actors[r.slot]!;
      const isAlive = r.respawn === 0;
      a.root.setEnabled(isAlive);
      a.ring.setEnabled(isAlive);
      a.shadow.setEnabled(isAlive);
      const age = view.tick + subtick - r.swing;
      a.shot.setEnabled(isAlive && age >= 0 && age < 7);
      if (!isAlive) continue;
      const fraction = ((r.slowed ? 0.55 : 1) * subtick) / RAID_HZ;
      const x = Math.max(-5, Math.min(5, r.x + r.side * 4.8 * fraction));
      const z = Math.max(-6, Math.min(8.4, r.z + (r.walk ? -3.1 : 2.25) * fraction));
      a.root.position.set(x, jumpHeight(Math.max(0, r.jumping - subtick)), z);
      a.ring.position.set(x, 0.055, z);
      a.shadow.position.set(x, 0.032, z);
      a.life.scaling.x = r.hp / HEROES[r.hero].hp;
      a.life.position.x = -0.37 * (1 - a.life.scaling.x);
      a.crest.material = r.shield ? brass : iron;
      const grip = implementsByHero.get(r.hero)!;
      const hand = a.rig.joints.get(r.hero === 'longshot' ? 'LeftHand' : 'RightHand')!;
      if (grip.parent !== hand) grip.parent = hand;
      a.rig.update(r.walk ? 2.9 : 6, false, dt, 0, !r.walk);
      if (a.shot.isEnabled()) {
        const t = age / 7;
        a.shot.position.set(
          x + (r.impact.x - x) * t,
          1.13 + Math.sin(Math.PI * t) * 0.4,
          z + (r.impact.z - z) * t,
        );
      }
    }
    const target = player.target === 'wagon' ? WAGON : view.runners[player.target];
    lock.setEnabled(!!target && !('respawn' in target && target.respawn));
    if (target) lock.position.set(target.x, 0.085, target.z);
    warning.setEnabled(!!view.hazard);
    if (view.hazard) {
      warning.position.x = view.hazard.x;
      warning.scaling.x = 0.75 + 0.25 * Math.cos(view.hazard.ticks * 0.55);
    }
    camera.position.set(player.x * 0.37, 6.3, player.z * 0.62 - 10.5);
    look.set(player.x * 0.18, 1.3, player.z * 0.55 + 7.4);
    camera.setTarget(look);
    scene.render();
  }
  function pick(
    event: PointerEvent,
    groundOnly: boolean,
    allies = false,
  ): { point: RaidPoint; target?: RaidTarget } | null {
    const rect = canvas.getBoundingClientRect();
    const hit = scene.pick(event.clientX - rect.left, event.clientY - rect.top, (m) => {
      if (!m.isEnabled() || !m.isVisible) return false;
      if (m.metadata?.raidGround) return true;
      const id = m.metadata?.raidTarget;
      return (
        !groundOnly && (allies ? id === 0 || id === 1 : id === 'wagon' || id === 2 || id === 3)
      );
    });
    if (!hit.pickedPoint) return null;
    return {
      point: { x: hit.pickedPoint.x, z: hit.pickedPoint.z },
      target: hit.pickedMesh?.metadata?.raidTarget,
    };
  }
  return { render, pick, showAim };
}
