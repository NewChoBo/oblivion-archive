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
import { loadRaidActor } from './raid-actor.ts';
import { createRaidEffects } from './raid-effects.ts';
import { nearestRaidTarget } from './raid-target-pick.ts';
import { createRaidAimGuide } from './raid-aim-guide.ts';
import { createCastleExterior } from '../citadel/castle-exterior.ts';
import { RAID_CAMERA, raidCameraPose } from '../../../game/raid/raid-sight.ts';
import {
  HERO_IDS,
  WAGON,
  raidRoadTravel,
  raidRunnerPositionAfter,
  type RaidPoint,
  type RaidView,
  type RaidTarget,
} from '../../../game/raid/raid-match.ts';

/** The course scrolls past the formation. Picking returns the same wagon-relative metres as the rules. */
export async function createRaidCourse(engine: AbstractEngine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);
  // The HUD marks claimed touches as handled. Let ordinary canvas clicks reach the course picker.
  scene.preventDefaultOnPointerDown = false;
  scene.skipPointerMovePicking = true;
  scene.clearColor = new Color4(0.035, 0.045, 0.085, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0.016, 0.02, 0.036);
  scene.fogStart = 19;
  scene.fogEnd = 66;
  const camera = new FreeCamera('chase camera', new Vector3(0, 6.7, -12), scene);
  camera.fov = RAID_CAMERA.fov;
  camera.minZ = RAID_CAMERA.near;
  camera.maxZ = RAID_CAMERA.far;
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
  const actors = new Map(
    await Promise.all(
      HERO_IDS.map(
        async (hero) => [hero, await loadRaidActor(scene, hero, blue, red, shadowMat)] as const,
      ),
    ),
  );
  const effects = createRaidEffects(scene);
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
  const showAim = createRaidAimGuide(scene);
  await scene.whenReadyAsync();
  const look = new Vector3();
  function render(view: RaidView, dt: number, subtick: number) {
    const player = view.runners[0]!;
    const scroll = raidRoadTravel(view.tick + subtick);
    paving.vOffset = (scroll * 24) / 104;
    spans.forEach((s, i) => {
      s.position.z = i * 8 - 16 - (scroll % 8);
    });
    for (const wheel of wheels) wheel.rotation.x = scroll / 0.77;
    sky.update(dt);
    const positions = view.runners.map((r) => raidRunnerPositionAfter(r, subtick));
    for (const r of view.runners)
      actors.get(r.hero)!(r, positions[r.slot]!, view.actions, view.tick, subtick, dt);
    effects(view, subtick);
    const target =
      player.target === null ? null : player.target === 'wagon' ? WAGON : positions[player.target];
    lock.setEnabled(!!target);
    if (target) lock.position.set(target.x, 0.085, target.z);
    warning.setEnabled(!!view.hazard);
    if (view.hazard) {
      warning.position.x = view.hazard.x;
      warning.scaling.x = 0.75 + 0.25 * Math.cos(view.hazard.ticks * 0.55);
    }
    const pose = raidCameraPose(positions[player.slot]!);
    camera.position.copyFromFloats(pose.eye.x, pose.eye.y, pose.eye.z);
    look.set(pose.look.x, pose.look.y, pose.look.z);
    camera.setTarget(look);
    scene.render();
  }
  type ScreenPoint = Pick<PointerEvent, 'clientX' | 'clientY'>;
  // Project the cursor onto an infinite plane. Actors, the wagon and road geometry cannot shift a cast.
  function planePoint(event: ScreenPoint, height = 0): RaidPoint | null {
    const rect = canvas.getBoundingClientRect();
    const ray = scene.createPickingRay(
      event.clientX - rect.left,
      event.clientY - rect.top,
      null,
      camera,
    );
    if (ray.direction.y >= -0.00001) return null;
    const t = (height - ray.origin.y) / ray.direction.y;
    return t < 0
      ? null
      : { x: ray.origin.x + t * ray.direction.x, z: ray.origin.z + t * ray.direction.z };
  }
  function pick(
    event: Pick<PointerEvent, 'clientX' | 'clientY'>,
    allies = false,
  ): { point: RaidPoint; target?: RaidTarget } | null {
    const rect = canvas.getBoundingClientRect();
    const hit = scene.pick(event.clientX - rect.left, event.clientY - rect.top, (m) => {
      if (!m.isEnabled() || !m.isVisible) return false;
      if (m.metadata?.raidGround) return true;
      const id = m.metadata?.raidTarget;
      return allies ? id === 0 || id === 1 : id === 'wagon' || id === 2 || id === 3;
    });
    if (!hit.pickedPoint) return null;
    return {
      point: { x: hit.pickedPoint.x, z: hit.pickedPoint.z },
      target: hit.pickedMesh?.metadata?.raidTarget,
    };
  }
  function pickTarget(
    event: Pick<PointerEvent, 'clientX' | 'clientY'>,
    allies: boolean,
    radius: number,
    eligible: (target: RaidTarget) => boolean,
  ) {
    const hit = pick(event, allies);
    if (hit?.target !== undefined && eligible(hit.target)) return hit;
    const bounds = canvas.getBoundingClientRect();
    const target =
      nearestRaidTarget(scene, bounds, event, radius, eligible) ??
      hit?.target ??
      nearestRaidTarget(scene, bounds, event, radius, (id) =>
        allies ? id === 0 || id === 1 : id === 'wagon' || id === 2 || id === 3,
      );
    return { target, point: hit?.point ?? null };
  }
  return {
    render,
    placement: (event: ScreenPoint) => planePoint(event),
    pickTarget,
    showAim,
    viewAspect: () => engine.getAspectRatio(camera),
  };
}
