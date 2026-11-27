import {
  Color3,
  Color4,
  DirectionalLight,
  FreeCamera,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  type StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type AbstractEngine,
} from '@babylonjs/core';
import { raidMaterial } from './raid-material.ts';
import { createRaidActor } from './raid-actor.ts';
import { createRenderer } from '../rendering/renderer.ts';
import { observeRaidResolution } from './raid-resolution.ts';
import { createRaidCounterVisual } from './raid-counter-visual.ts';
import { createRaidEffects } from './raid-effects.ts';
import { hitRaidTarget, nearestRaidTarget, type RaidTargetBody } from './raid-target-pick.ts';
import { createRaidAimGuide } from './raid-aim-guide.ts';
import { pickRaidGroundAim } from './raid-ground-aim.ts';
import { createCastleExterior } from '../citadel/castle-exterior.ts';
import { loadInkApparition } from '../chapter/chapter-creatures.ts';
import { RAID_COUNTERS } from '../../../game/raid/raid-boss.ts';
import {
  RAID_BASIC_HALF_ANGLE,
  RAID_CAMERA,
  raidAimPullback,
  raidCameraPose,
} from '../../../game/raid/raid-sight.ts';
import {
  type RaidHero,
  raidBasicReach,
  WAGON,
  raidRoadTravel,
  raidRunnerHeight,
  raidRunnerPositionAfter,
  type RaidAim,
  type RaidPoint,
  type RaidView,
  type RaidTarget,
} from '../../../game/raid/raid-match.ts';

/** The lobby can be used before a renderer or animation loop exists. */
export async function openRaidCourse(
  canvas: HTMLCanvasElement,
  fpsLimit: number | null,
  onResize: () => void,
) {
  const engine = await createRenderer(canvas, new URLSearchParams(location.search), {
    antialias: true,
  });
  engine.maxFPS = fpsLimit ?? undefined;
  try {
    observeRaidResolution(canvas, engine);
    const course = await createRaidCourse(engine, canvas);
    engine.onResizeObservable.add(onResize);
    return {
      ...course,
      startRendering: (frame: () => void) => engine.runRenderLoop(frame),
      stopRendering: (frame: () => void) => engine.stopRenderLoop(frame),
    };
  } catch (error) {
    engine.dispose();
    throw error;
  }
}

/** The course scrolls past the formation. Picking returns the same wagon-relative metres as the rules. */
async function createRaidCourse(engine: AbstractEngine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);
  // The HUD marks claimed touches as handled. Let ordinary canvas clicks reach the course picker.
  scene.preventDefaultOnPointerDown = false;
  // Gameplay picks its own target bodies after the HUD has handled the gesture.
  scene.skipPointerMovePicking = scene.skipPointerDownPicking = scene.skipPointerUpPicking = true;
  scene.clearColor = new Color4(0.035, 0.045, 0.085, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0.016, 0.02, 0.036);
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
  const stone = raidMaterial(scene, 'bridge stone', '#969396'),
    iron = raidMaterial(scene, 'tempered iron', '#424451'),
    oak = raidMaterial(scene, 'wagon oak', '#aa8263'),
    brass = raidMaterial(scene, 'bronze bands', '#cba264'),
    ember = raidMaterial(scene, 'ward amber', '#ffb355', 0.65);
  const blue = raidMaterial(scene, 'allied ward', '#61dad0', 0.65),
    red = raidMaterial(scene, 'rival ward', '#ff667a', 0.65);
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
  // Keep two extra rear spans under the wider aiming camera, including after a backward leap.
  const roadLength = 120;
  const pavingTilesPerMetre = 24 / 104;
  const ground = MeshBuilder.CreateGround(
    'raid causeway',
    { width: 14, height: roadLength },
    scene,
  );
  ground.position.z = 20;
  const road = raidMaterial(scene, 'paved causeway', '#bec0c6');
  const paving = new Texture('./assets/citadel/flagstone.jpg', scene);
  paving.uScale = 3;
  paving.vScale = roadLength * pavingTilesPerMetre;
  road.diffuseTexture = paving;
  ground.material = road;
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
  for (let i = 1; i < 14; i++) {
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
  const wagonBody: RaidTargetBody = { target: 'wagon', meshes: wagon.getChildMeshes() };
  const bossMount = new TransformNode('wagon commander', scene);
  bossMount.parent = wagon;
  bossMount.position.set(0, 3.02, -0.35);
  let boss: Awaited<ReturnType<typeof loadInkApparition>> | undefined;
  // A missing decorative model must not prevent joining a running match.
  void loadInkApparition(scene, bossMount).then(
    (model) => {
      if (scene.isDisposed) return;
      boss = model;
      // The animated cloak and fingers share the wagon's target and one inexpensive pick volume.
      const body = box('commander hit volume', bossMount, 0, 1.28, 0, 1.55, 2.55, 0.98, iron);
      body.visibility = 0;
      wagonBody.meshes = [...wagonBody.meshes, body];
    },
    () => bossMount.setEnabled(false),
  );
  const alliedBodies: RaidTargetBody[] = [];
  const rivalBodies: RaidTargetBody[] = [];
  const shadowMat = raidMaterial(scene, 'runner contact shade', '#1a1b23');
  shadowMat.alpha = 0.55;
  const actors = new Map<RaidHero, ReturnType<typeof createRaidActor>>();
  const effects = createRaidEffects(scene);
  const drawCounter = createRaidCounterVisual(scene);
  const lock = MeshBuilder.CreateTorus(
    'target lock',
    { diameter: 1.6, thickness: 0.09, tessellation: 28 },
    scene,
  );
  lock.material = ember;
  lock.isPickable = false;
  const callMarker = MeshBuilder.CreateLines(
    'team attack request',
    {
      points: [
        new Vector3(-0.44, 0.34, 0),
        Vector3.Zero(),
        new Vector3(0.44, 0.34, 0),
        new Vector3(0, 0.78, 0),
        new Vector3(-0.44, 0.34, 0),
      ],
    },
    scene,
  );
  callMarker.color = Color3.FromHexString('#ffd253');
  callMarker.isPickable = false;
  const quarryMark = MeshBuilder.CreateTorus(
    'tracking dagger',
    { diameter: 0.8, thickness: 0.09, tessellation: 4 },
    scene,
  );
  quarryMark.rotation.x = Math.PI / 2;
  quarryMark.material = raidMaterial(scene, 'tracking dagger amber', '#ffa341', 0.8);
  quarryMark.isPickable = false;
  // The local runner remains identifiable when a teammate overlaps the same team ring.
  const selfMark = MeshBuilder.CreateRibbon(
    'local runner chevron',
    {
      pathArray: [
        [new Vector3(-0.34, 0, -0.34), new Vector3(0, 0, -0.1), new Vector3(0.34, 0, -0.34)],
        [new Vector3(-0.34, 0, -0.53), new Vector3(0, 0, -0.29), new Vector3(0.34, 0, -0.53)],
      ],
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  selfMark.material = raidMaterial(scene, 'local runner ivory', '#f5ffed', 0.8);
  selfMark.isPickable = false;
  const edge = Array.from({ length: 33 }, (_, i) => {
    const angle = RAID_BASIC_HALF_ANGLE * (i / 16 - 1);
    return new Vector3(Math.sin(angle), 0, Math.cos(angle));
  });
  const basicRange = MeshBuilder.CreateLines(
    'basic attack range',
    { points: [Vector3.Zero(), ...edge, Vector3.Zero()] },
    scene,
  );
  basicRange.color = Color3.FromHexString('#98dccd');
  basicRange.alpha = 0.62;
  basicRange.isPickable = false;
  const drawAim = createRaidAimGuide(scene);
  let aimKind: RaidAim['kind'] | undefined;
  function showAim(aim: RaidAim | null) {
    aimKind = aim?.kind;
    canvas.classList.toggle('raid-placement-aim', aimKind === 'field' || aimKind === 'leap');
    drawAim(aim);
  }
  await scene.whenReadyAsync();
  const look = new Vector3();
  let displayedMatch: RaidView | undefined;
  let pullback = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function render(view: RaidView, dt: number, subtick: number, slot = 0) {
    const player = view.runners[slot]!;
    const localTeam = player.team;
    const scroll = raidRoadTravel(view.tick + subtick);
    paving.vOffset = scroll * pavingTilesPerMetre;
    spans.forEach((s, i) => {
      s.position.z = i * 8 - 32 - (scroll % 8);
    });
    for (const wheel of wheels) wheel.rotation.x = scroll / 0.77;
    sky.update(dt);
    const positions = view.runners.map((r) => raidRunnerPositionAfter(r, subtick));
    const runnerPosition = positions[player.slot]!;
    selfMark.setEnabled(!player.respawn && !view.result);
    selfMark.position.set(runnerPosition.x, 0.09, runnerPosition.z - 0.78);
    basicRange.setEnabled(!aimKind && !player.respawn && !view.result);
    basicRange.position.set(runnerPosition.x, 0.065, runnerPosition.z);
    basicRange.scaling.setAll(raidBasicReach(player, view.tick));
    if (displayedMatch !== view) {
      pullback = 0;
      alliedBodies.length = rivalBodies.length = 0;
      rivalBodies.push(wagonBody);
      for (const actor of actors.values()) actor.hide();
      for (const { hero, slot: target, team } of view.runners) {
        let actor = actors.get(hero);
        if (!actor) {
          actor = createRaidActor(scene, hero, blue, red, shadowMat);
          actors.set(hero, actor);
        }
        actor.prepareModel();
        (team === localTeam ? alliedBodies : rivalBodies).push({ target, meshes: [actor.hit] });
      }
      displayedMatch = view;
    }
    for (const r of view.runners)
      actors
        .get(r.hero)!
        .draw(r, positions[r.slot]!, view.actions, view.tick, subtick, dt, localTeam);
    effects(view, subtick);
    const quarry = view.runners.find((r) => r.heroView.quarry != null)?.heroView.quarry;
    quarryMark.setEnabled(quarry != null);
    if (quarry != null) {
      const p = quarry === 'wagon' ? WAGON : positions[quarry]!;
      quarryMark.position.set(
        p.x,
        quarry === 'wagon' ? 4.3 : 2.7 + raidRunnerHeight(view.runners[quarry]!),
        p.z,
      );
    }
    const target =
      player.target === null ? null : player.target === 'wagon' ? WAGON : positions[player.target];
    lock.setEnabled(!!target && (!aimKind || aimKind === 'field' || aimKind === 'pulse'));
    if (target) lock.position.set(target.x, 0.085, target.z);
    const call = view.calls[localTeam];
    callMarker.setEnabled(!!call && !view.result);
    if (call) {
      const onWagon = call.target === 'wagon';
      const point = onWagon ? WAGON : positions[call.target]!;
      const height = onWagon
        ? boss
          ? 5.85
          : 4.4
        : 2.4 + raidRunnerHeight(view.runners[call.target]!, subtick);
      callMarker.position.set(
        point.x,
        height + 0.12 * Math.sin((view.tick + subtick) / 4),
        point.z,
      );
    }
    const hazard = view.hazard;
    if (boss) {
      const windup = hazard?.phase === 'warning';
      const duration = hazard ? RAID_COUNTERS[hazard.kind][windup ? 'windup' : 'active'] : 1;
      boss.pose(dt, false, 0, {
        kind: 'ranged',
        phase: hazard ? (windup ? 'windup' : 'recovery') : 'ready',
        progress: hazard ? Math.min(1, 1 - (hazard.ticks - subtick) / duration) : 0,
      });
    }
    drawCounter(hazard, subtick);
    const goal = player.respawn || view.result ? 0 : raidAimPullback(aimKind);
    // Frame-rate independent easing. Switching skills reverses from the current position.
    pullback =
      view.result || reducedMotion.matches || Math.abs(goal - pullback) < 0.01
        ? goal
        : goal + (pullback - goal) * Math.exp(-dt / 0.1);
    const pose = raidCameraPose(runnerPosition, pullback);
    scene.fogStart = 19 + pullback;
    scene.fogEnd = 66 + pullback;
    camera.position.copyFromFloats(pose.eye.x, pose.eye.y, pose.eye.z);
    look.set(pose.look.x, pose.look.y, pose.look.z);
    camera.setTarget(look);
    scene.render();
  }
  type ScreenPoint = Pick<PointerEvent, 'clientX' | 'clientY'>;
  function directionPoint(event: ScreenPoint): RaidPoint | null {
    const rect = canvas.getBoundingClientRect();
    const ray = scene.createPickingRay(
      event.clientX - rect.left,
      event.clientY - rect.top,
      null,
      camera,
    );
    if (ray.direction.y >= -0.00001)
      return {
        x: ray.origin.x + ray.direction.x * camera.maxZ,
        z: ray.origin.z + ray.direction.z * camera.maxZ,
      };
    const t = (1 - ray.origin.y) / ray.direction.y;
    return t < 0
      ? null
      : { x: ray.origin.x + t * ray.direction.x, z: ray.origin.z + t * ray.direction.z };
  }
  function pickTarget(
    event: ScreenPoint,
    side: 'allies' | 'enemies' | 'either',
    radius: number,
    eligible: (target: RaidTarget) => boolean,
  ) {
    const bounds = canvas.getBoundingClientRect();
    const ray = scene.createPickingRay(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      null,
      camera,
    );
    const bodies =
      side === 'either'
        ? [...rivalBodies, ...alliedBodies]
        : side === 'allies'
          ? alliedBodies
          : rivalBodies;
    const hit = hitRaidTarget(ray, ground, bodies);
    if (hit.target !== undefined && eligible(hit.target)) return hit;
    const target = nearestRaidTarget(scene, bodies, bounds, event, radius, eligible, hit.target);
    return { target, point: hit.point };
  }
  return {
    render,
    placement: (event: ScreenPoint, caster: RaidPoint, range: number) =>
      pickRaidGroundAim(camera, canvas.getBoundingClientRect(), event, caster, range),
    directionPoint,
    pickTarget,
    showAim,
    cameraPosition: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
    viewAspect: () => engine.getAspectRatio(camera),
  };
}
