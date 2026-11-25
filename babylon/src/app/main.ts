import { readingShelfSubject } from '../content/locales/chapter-world.ts';
import { playText } from '../content/locales/play.ts';
import type { AbstractMesh, Material, Mesh, ShadowLight } from '@babylonjs/core';
import type { JournalCommand } from './journal-session.ts';
import type { ChapterTarget } from '../game/chapter/chapter-progress.ts';
import type { InteractionTarget } from '../platform/babylon/arena/arena-objectives.ts';
import type { createArenaFirearms } from '../platform/babylon/arena/arena-firearms.ts';
import type { Point3 } from '../platform/babylon/chapter/plaque.ts';
import type { Posture } from '../platform/babylon/player/player-posture.ts';
import type { ShadowQuality } from '../platform/babylon/lighting/shadow-quality.ts';
import type { createFrameProfiler } from '../platform/babylon/rendering/frame-profiler.ts';
import { prepareSceneLighting } from '../platform/babylon/rendering/scene-warmup.ts';
import { LightingVariants } from '../platform/babylon/rendering/lighting-variants.ts';
import { createRenderer } from '../platform/babylon/rendering/renderer.ts';
import { buildChapterScene } from '../platform/babylon/chapter/chapter-scene.ts';
import {
  Scene,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  PBRMaterial,
  Texture,
  CubeTexture,
  ShadowGenerator,
  FreeCamera,
  ImageProcessingConfiguration,
  Effect,
  PostProcess,
} from '@babylonjs/core';
import archiveDisplay from '../platform/babylon/rendering/archive-display.fragment.glsl?raw';
import erasedPhotoUrl from '../../../asset-sources/Art/Chapter1/archive-photo-erased.webp';
import { createPrologue } from '../intro/prologue.ts';
import { createStorySubtitles } from '../ui/story-subtitles.ts';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { createChapterState } from './chapter.ts';
import { chapterTraversal } from '../platform/browser/chapter-save.ts';
import {
  chapterAction,
  chapterObjective,
  describeChapterEvent,
} from '../content/locales/chapter.ts';
import { focusedInteraction } from '../platform/babylon/player/interaction-focus.ts';
import { createInventory } from '../ui/inventory.ts';
import {
  bakeFloorContactShadows,
  createEnvironment,
  createEnvironmentMaterials,
  tileEnvironmentSurfaces,
} from '../platform/babylon/chapter/chapter-scenery.ts';
import { createCastleExterior } from '../platform/babylon/citadel/castle-exterior.ts';
import { citadelArrival } from '../platform/babylon/citadel/floating-citadel.ts';
import { chapterLevel, construction } from '../content/citadel-layout.ts';
import { createArenaArmoryUi } from '../ui/arena-armory.ts';
import { createWeapons } from '../platform/babylon/equipment/weapons.ts';
import { createPlayerInput, lookPitch } from '../platform/browser/player-input.ts';
import { createPlayerView } from '../platform/babylon/player/player-view.ts';
import { applyPosture, POSTURES } from '../platform/babylon/player/player-posture.ts';
import {
  createPreferences,
  type InputAction,
  type InputSettings,
} from '../platform/browser/preferences.ts';
import { createSettingsPanel } from '../ui/settings-panel.ts';
import { requireElement } from '../ui/dom.ts';
import {
  createPlanarMotor,
  movementIntent,
  movementSteps,
  moveCollider,
  WALK_SPEED,
  SPRINT_SPEED,
} from '../platform/babylon/player/movement.ts';
import { createJumpMotor } from '../game/player/jump-motor.ts';
import { createSpellEffects } from '../platform/babylon/effects/spell-effects.ts';
import {
  canRaiseCollider,
  createGroundProbe,
  createPlayerViewClearance,
} from '../platform/babylon/player/collider-contact.ts';
import { createRenderQuality } from '../platform/babylon/rendering/render-quality.ts';
import { createPerformanceHud } from '../ui/performance-hud.ts';
import { createWallLamps } from '../platform/babylon/lighting/wall-lamps.ts';
import { applyStaticShadowQuality } from '../platform/babylon/lighting/shadow-quality.ts';
import {
  reserveWorldLightSlots,
  scopeFixedLights,
} from '../platform/babylon/lighting/light-surfaces.ts';
import {
  createWallLightOcclusion,
  cullBehindOpaqueWalls,
} from '../platform/babylon/rendering/opaque-occlusion.ts';
import { playableViewport } from '../ui/viewport-limit.ts';
import {
  BAG_LIMIT,
  createExpeditionState,
  GEAR,
  SKILLS,
  STORAGE_LIMIT,
} from '../expedition/state.ts';
import { createLocalSession } from './local-session.ts';
import { createExperience } from './experience.ts';
import { readPlayEntry } from './play-entry.ts';
import { getStorage } from '../platform/browser/storage.ts';
import { playUrl } from '../platform/browser/play-url.ts';
import { createPlaqueFactory } from '../platform/babylon/chapter/plaque.ts';
import { experienceText } from '../content/locales/experience.ts';
import { createExperienceHud, describeExperienceResult } from '../ui/experience-hud.ts';
import { createExpeditionWorld, DUNGEON_SPAWN, CHAPTER_RETURN } from '../expedition/world.ts';
import { createExpeditionHud } from '../expedition/hud.ts';
type Target = ChapterTarget | InteractionTarget;
type WeaponSystem =
  Awaited<ReturnType<typeof createWeapons>> | ReturnType<typeof createArenaFirearms>;
type FrameProfiler = ReturnType<typeof createFrameProfiler>;
type MovementState = {
  speed: number;
  posture: Posture;
  running: boolean;
  elapsed: number;
  substeps: number;
  walkSpeed?: number;
  sprintSpeed?: number;
};

function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw Error('Missing game element: ' + id);
  return element;
}
const canvas = requireElement(document, '#game', HTMLCanvasElement);
const inventoryDialog = requireElement(document, '#inventory', HTMLDialogElement);
const entry = readPlayEntry(new URLSearchParams(location.search));
const experience = entry?.intent === 'arena' ? createExperience(entry.mode, entry.level) : null;
const levelId = experience?.levelId ?? (entry?.intent === 'expedition' ? 'ink-quarry' : null);
const traversal = chapterTraversal(getStorage('sessionStorage'));
function navigate(next: ReturnType<typeof readPlayEntry>) {
  if (next?.intent !== 'expedition' && next?.intent !== 'return') traversal.clear();
  location.replace(playUrl(location.href, next));
}
const readingShelves = chapterLevel.zones.readingShelves;
const campaignStorage = entry?.intent === 'arena' ? undefined : getStorage('localStorage');
const session = createChapterState(campaignStorage);
const expedition = createExpeditionState(campaignStorage);
const preferences = createPreferences();
const jumpMotor = createJumpMotor();
const planarMotor = createPlanarMotor();
let lastFrameTime = performance.now(),
  movementRuntime: MovementState = {
    speed: 0,
    posture: 'standing',
    running: false,
    elapsed: 0,
    substeps: 0,
  };
let started = false,
  paused = true,
  ready = false,
  weaponSystem: WeaponSystem | null = null,
  shownTarget: Target | null = null,
  walkDistance = 0,
  restorationStart = -1,
  defeated = false;
const armory = experience?.armory;
let frameProfiler: FrameProfiler | undefined;
let beganOnIsland = false;
let viewDirty = true,
  chapterViewState: ReturnType<typeof session.snapshot>,
  restorationSettled = false,
  lastRestorationStart: number | undefined;
const engine = await createRenderer(canvas, new URLSearchParams(location.search));
const baseRenderScale = Math.max(1, window.devicePixelRatio / 1.5);
engine.setHardwareScalingLevel(baseRenderScale);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.008, 0.014, 0.024, 1);
scene.collisionsEnabled = true;
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.011, 0.012, 0.014);
scene.fogDensity = 0.0065;
const rampartReflections = CubeTexture.CreateFromPrefilteredData(
  './assets/chapter-art/rampart-indirect.env',
  scene,
);
scene.environmentTexture = levelId
  ? rampartReflections
  : CubeTexture.CreateFromPrefilteredData('./assets/chapter-art/archive-indirect.env', scene);
scene.environmentIntensity = 0.27;
const imageProcessing = scene.imageProcessingConfiguration;
imageProcessing.toneMappingEnabled = true;
imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
imageProcessing.exposure = 1.55;
const camera = new FreeCamera(
  'scribe camera',
  new Vector3(0, POSTURES.standing.eyeHeight, -4.5),
  scene,
);
camera.minZ = 0.04;
camera.maxZ = 145;
camera.fov = 1.12;
camera.updateUpVectorFromRotation = true;
camera.inputs.clear();
scene.activeCamera = camera;
Effect.ShadersStore.archiveDisplayPixelShader = archiveDisplay;
const scenePass = new PostProcess(
  'scene composite',
  'archiveDisplay',
  null,
  null,
  1,
  camera,
  Texture.BILINEAR_SAMPLINGMODE,
);
const msaaSamples = Math.min(engine.getCaps().maxMSAASamples, engine.isWebGPU ? 4 : 2);
scenePass.samples = msaaSamples;
scene.postProcessesEnabled = msaaSamples > 1;
const renderQuality = createRenderQuality(
  ({ scale, samples }) => {
    // An opaque canvas can receive the scene directly when MSAA is disabled.
    const actualSamples = samples > 1 ? msaaSamples : 1;
    scene.postProcessesEnabled = actualSamples > 1;
    if (scenePass.samples !== actualSamples) scenePass.samples = actualSamples;
    const nextScale = baseRenderScale * scale;
    if (engine.getHardwareScalingLevel() !== nextScale) engine.setHardwareScalingLevel(nextScale);
  },
  { fixedMsaa: engine.isWebGPU },
);
const performanceHud = createPerformanceHud($('performance-hud'), scene, {
  baseRenderScale,
  scenePass,
});
function applyDisplayPreferences({ showPerformance, fpsLimit }: InputSettings) {
  performanceHud.setVisible(showPerformance);
  const maxFPS = fpsLimit ?? undefined;
  if (engine.maxFPS === maxFPS) return;
  engine.maxFPS = maxFPS;
  renderQuality.setFrameLimit(fpsLimit);
}
applyDisplayPreferences(preferences.get());
preferences.subscribe(applyDisplayPreferences);
const body = MeshBuilder.CreateBox(
  'player-collision',
  { width: 0.5, height: POSTURES.standing.halfHeight * 2, depth: 0.5 },
  scene,
);
const entrySpawn =
  experience?.level.spawn ??
  (entry?.intent === 'expedition'
    ? DUNGEON_SPAWN
    : entry?.intent === 'return'
      ? CHAPTER_RETURN
      : [0, 0.86, -4.5]);
Vector3.FromArrayToRef(entrySpawn, 0, body.position);
if (entry?.intent === 'citadel') body.position.copyFrom(citadelArrival);
body.isVisible = false;
body.ellipsoid = new Vector3(0.25, POSTURES.standing.halfHeight, 0.25);
const chestPosition = chapterLevel.zones.readingRoom.find(
  (entry) => entry.id === 'reading-chest-east',
)?.position;
if (!chestPosition || chestPosition.length !== 3)
  throw Error('Missing reading-chest-east position');
const storagePosition: Point3 = [chestPosition[0]!, chestPosition[1]!, chestPosition[2]!];
const inventoryCatalog = {
  gear: GEAR,
  skills: SKILLS,
  bagLimit: BAG_LIMIT,
  storageLimit: STORAGE_LIMIT,
};
const localSession = createLocalSession({
  expedition,
  inventoryRules: { ...inventoryCatalog, storagePosition },
  arena: experience
    ? {
        match: experience.match,
        armory,
        canReachWard: (id) => currentTarget()?.id === id,
        canReachObjective: (id) => currentTarget()?.id === id,
        inBuyZone,
      }
    : undefined,
  chapter: levelId ? undefined : { progress: session, focusedTargetId: () => currentTarget()?.id },
  readPosition: () => body.position,
});
const interactionButton = $('interact'),
  interactionLabel = interactionButton.querySelector('span')!;
const areaLabel = $('nearby-label'),
  dangerLabel = $('danger'),
  notice = $('notice');
const {
  show: showNotice,
  clear: clearNotice,
  update: advanceSubtitles,
} = createStorySubtitles(notice, erasedPhotoUrl);
const headshotFlash = new Animation(
  new KeyframeEffect(
    $('headshot-marker'),
    [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }],
    420,
  ),
  document.timeline,
);
const postureButtons = [...$('posture-select').querySelectorAll('button')],
  postureFeedback = $('posture-feedback');
let posture: Posture = 'standing',
  postureFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
const groundProbe = createGroundProbe(scene, body);
function updateHudLine(element: HTMLElement, text: string) {
  if (element.hidden !== !text) element.hidden = !text;
  if (text && element.textContent !== text) element.textContent = text;
}
let yaw =
    experience?.level.heading ??
    (entry?.intent === 'return' ? Math.PI : entry?.intent === 'citadel' ? 0.32 : 0),
  pitch = entry?.intent === 'citadel' ? -0.11 : 0.06,
  viewMode = 'first';
const ambient = new HemisphericLight('interior ambient fill', new Vector3(-0.35, 1, -0.25), scene);
ambient.intensity = construction.lighting.interiorBounce;
ambient.diffuse = new Color3(0.66, 0.62, 0.57);
ambient.groundColor = new Color3(0.18, 0.13, 0.1);
const sun = new DirectionalLight(
  'nebula sunlight',
  new Vector3(0.73, -0.68, -0.21).normalize(),
  scene,
);
sun.position.set(-12, 8, 6);
sun.intensity = construction.lighting.stellarKey;
sun.diffuse = new Color3(0.72, 0.79, 0.91);
sun.shadowMinZ = 0.1;
sun.shadowMaxZ = 34;
sun.shadowFrustumSize = 30;
const shadow = levelId ? null : new ShadowGenerator(1024, sun);
if (shadow) {
  shadow.usePercentageCloserFiltering = true;
  shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadow.bias = 0.0015;
  shadow.normalBias = 0.018;
  shadow.setDarkness(0.25);
} else {
  ambient.setEnabled(false);
  sun.setEnabled(false);
}
scene.setRenderingAutoClearDepthStencil(2, true, true, true);
scene.setRenderingAutoClearDepthStencil(3, true, true, true);
function material(name: string, color: string) {
  const m = new PBRMaterial(name, scene);
  m.maxSimultaneousLights = 4;
  m.albedoColor = Color3.FromHexString(color);
  m.metallic = 0;
  m.roughness = 0.9;
  m.useGLTFLightFalloff = true;
  return m;
}
const arenaMaterials = ['rampartStone', 'rampartFloor', 'rampartTrim'];
const environmentMaterials = createEnvironmentMaterials(
  scene,
  material,
  levelId
    ? experience
      ? arenaMaterials
      : [...arenaMaterials, 'wood', 'darkWood', 'chestHardware']
    : undefined,
);
function rampartMaterial(id: 'rampartStone' | 'rampartFloor' | 'rampartTrim'): PBRMaterial {
  const result = environmentMaterials[id];
  if (!(result instanceof PBRMaterial)) throw Error('Missing environment material: ' + id);
  return result;
}
const rampartMaterials = {
  rampartStone: rampartMaterial('rampartStone'),
  rampartFloor: rampartMaterial('rampartFloor'),
  rampartTrim: rampartMaterial('rampartTrim'),
};
const { rampartStone, rampartFloor, rampartTrim } = rampartMaterials;
for (const surface of [rampartStone, rampartFloor, rampartTrim]) {
  surface.reflectionTexture = rampartReflections;
  surface.environmentIntensity = construction.lighting.exteriorProbe;
}
const collisionBoxes: Mesh[] = [];
function box(name: string, p: Point3, size: Point3, mat?: Material, solid = false) {
  const m = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
  m.position.copyFromFloats(...p);
  m.material = mat ?? null;
  m.receiveShadows = true;
  if (solid) {
    m.checkCollisions = true;
    collisionBoxes.push(m);
  }
  return m;
}
const wallLamps = createWallLamps(scene, { material });
const fieldChest = chapterLevel.zones.readingRoom.find(({ id }) => id === 'reading-chest-west');
if (!fieldChest) throw Error('Missing field cache prefab');
const environment = experience
  ? null
  : createEnvironment(
      scene,
      levelId
        ? {
            ...chapterLevel,
            zones: { field: [{ ...fieldChest, id: 'field-cache', position: [4.63, 0, 8.8] }] },
          }
        : chapterLevel,
      {
        box,
        collisionBoxes,
        materials: environmentMaterials,
        trackPlacements: import.meta.env.DEV,
      },
    );
if (levelId && environment) environment.placeZone('field');
const sky = createCastleExterior(scene);
const {
  readingRoom,
  citadel,
  loreProps,
  rampartSurfaces,
  leviathan,
  voidEncounter,
  openingLights,
  portal,
  portalLight,
  erasedPhoto,
  restoredPhoto,
  printMaterial,
  deskLight,
  archiveMagic,
  restoreRelief,
  chapterWorld,
} =
  levelId || !environment
    ? {}
    : buildChapterScene(scene, {
        environment,
        material,
        box,
        collisionBoxes,
        environmentMaterials,
        rampartReflections,
        sun,
        ambient,
        sky,
        wallLamps,
        onVoidStart: (duration: number) => weaponSystem?.voidRumble(duration),
        onDamage: (amount: number) => expedition.damage(amount),
        readHealth: () => expedition.health,
      });
const interactionMeshes: Map<string, AbstractMesh[]> = chapterWorld?.interactionMeshes ?? new Map();
const expeditionWorld = createExpeditionWorld(scene, {
  state: expedition,
  box,
  material,
  materials: rampartMaterials,
  environment,
  sign: createPlaqueFactory(scene, material),
  interactionMeshes,
  storagePosition,
  notify: showNotice,
  navigate(next) {
    if (next.intent === 'expedition') traversal.remember(session.snapshot());
    navigate(next);
  },
  openStorage: () => openInventory('storage'),
  levelId,
  practice: experience?.match.kind,
  tacticalMatch: armory ? experience?.match : undefined,
  onHeadshot() {
    headshotFlash.currentTime = 0;
    headshotFlash.play();
  },
  onEnemyDefeated() {
    armory?.awardElimination();
    experience?.match.recordElimination();
  },
  onEnemyFire: (start, end) => {
    if (weaponSystem && 'enemyFire' in weaponSystem) weaponSystem.enemyFire(start, end);
  },
});
const expeditionHud = createExpeditionHud(
  expedition,
  expeditionWorld.mapPoints,
  portal && chapterWorld ? [portal, ...chapterWorld.movingColliders] : [],
  levelId,
);
const experienceHud = createExperienceHud($('objective'));
tileEnvironmentSurfaces(scene, {
  ...environmentMaterials,
  ...(archiveMagic ? { archStone: archiveMagic.archStone } : {}),
  ...(portal?.material instanceof PBRMaterial ? { portalStone: portal.material } : {}),
});
const spells = createSpellEffects(
  scene,
  camera,
  () => playerView.eye,
  (mesh, seconds, event) => {
    if (!expeditionWorld.hit(mesh, event)) chapterWorld?.hit(mesh, seconds);
    weaponSystem?.impactSound(event.id, event.surface, event.bowPower ?? 0, event.distance);
  },
);
const viewClearance = createPlayerViewClearance(collisionBoxes);
const playerView = createPlayerView(scene, camera, body, viewClearance.sweep, spells.reticlePoint);
function updateRestoration(now: number) {
  if (!archiveMagic || !portalLight || !portal) {
    restorationSettled = true;
    return;
  }
  if (lastRestorationStart !== restorationStart) {
    lastRestorationStart = restorationStart;
    restorationSettled = false;
  }
  if (restorationSettled) return;
  const elapsed = restorationStart < 0 ? -1 : (now - restorationStart) / 1000,
    light = archiveMagic.update(elapsed);
  if (portalLight.isEnabled() !== light > 0) portalLight.setEnabled(light > 0);
  portalLight.intensity = light * 0.38;
  const open = session.completed >= 1 && elapsed > 1.3;
  portal.position.x = open ? 2.5 : 0;
  portal.checkCollisions = !open;
  portal.setEnabled(!open);
  archiveMagic.doorRoot?.setEnabled(!open);
  restorationSettled = elapsed < 0 || elapsed >= 3.3;
}
function refresh() {
  viewDirty = true;
  const previousPhase = chapterViewState?.phase;
  chapterViewState = session.snapshot();
  if (previousPhase !== chapterViewState.phase) {
    citadel?.restore(chapterViewState.phase, !started || paused);
    restoreRelief?.(chapterViewState.phase);
  }
  loreProps?.sync(chapterViewState.lore);
  if (experience) experienceHud.update(experience.id, experience.match.snapshot());
  else {
    experienceHud.restoreChapter();
    const step = chapterObjective(session.completed);
    $('progress').textContent = session.done
      ? playText('play.chapter.complete')
      : playText('play.chapter.progress', { step: session.completed + 1 });
    $('step-title').textContent = step.title;
    $('step-text').textContent = step.objective;
    for (const [index, dot] of [...$('step-dots').children].entries()) {
      dot.classList.toggle('done', index < session.completed);
      dot.classList.toggle('current', index === session.completed);
    }
  }
  const print = session.done ? restoredPhoto : erasedPhoto;
  if (printMaterial && print) printMaterial.albedoTexture = print;
  if (session.completed < 1) restorationStart = -1;
  else if (restorationStart < 0) restorationStart = performance.now();
  $('inventory-open').hidden = !started || paused || Boolean(experience);
  $('inventory-menu').hidden = !started || defeated || Boolean(experience);
  $('retry-checkpoint').hidden =
    !started || !session.hasSave || session.done || defeated || Boolean(experience);
  $('return-title').hidden = false;
  if (previousPhase !== chapterViewState.phase) shadow?.getShadowMap()?.resetRefreshCounter();
}
let newestRecord: string | null = null;
function currentTarget(): Target | null {
  if (!started || paused) return null;
  if (experience) return expeditionWorld.inReach(body.position)[0] ?? null;
  if (camera.rotation.x !== pitch || camera.rotation.y !== yaw) return null;
  const candidates = [
    ...(!levelId ? session.inReach(body.position) : []),
    ...expeditionWorld.inReach(body.position),
  ];
  if (!candidates.length) return null;
  return focusedInteraction(
    candidates,
    interactionMeshes,
    camera.getForwardRay(),
    playerView.eye,
    collisionBoxes,
  );
}
function showTarget(target: Target | null) {
  shownTarget = target;
  if (interactionButton.hidden !== !target) interactionButton.hidden = !target;
  if (target) {
    const action = 'expedition' in target ? target.action : chapterAction(target);
    if (interactionLabel.textContent !== action) interactionLabel.textContent = action;
  }
}
function interact() {
  if (experience) {
    const wardId = shownTarget?.id;
    if (armory) {
      if (
        wardId &&
        localSession.dispatch({ kind: 'experience.objective', payload: { id: wardId } }).ok
      ) {
        expeditionWorld.useObjective(wardId);
      }
      showTarget(currentTarget());
      return;
    }
    if (
      wardId &&
      localSession.dispatch({ kind: 'experience.activate-ward', payload: { wardId } }).ok
    ) {
      expeditionWorld.activateWard(wardId);
      showNotice(experienceText('ward.activated', { ward: experienceText(wardId) }));
      showTarget(null);
    } else {
      showTarget(currentTarget());
    }
    return;
  }
  const target = shownTarget;
  if (!target) {
    showTarget(currentTarget());
    return;
  }
  if ('expedition' in target) {
    const focused = currentTarget();
    if (focused?.id !== target.id) {
      showTarget(focused);
      return;
    }
    expeditionWorld.use(target.id);
    weaponSystem?.syncEquipment();
    showTarget(null);
    viewDirty = true;
    return;
  }
  const previousRecords = session.records,
    previousPhase = session.completed;
  const result = localSession.dispatch({
    kind: 'chapter.interact',
    payload: { targetId: target.id },
  });
  showTarget(currentTarget());
  if (!result.ok || !result.event) return;
  const { text, inscription } = describeChapterEvent(result.event);
  if (result.event.kind === 'lore-collected') {
    newestRecord = result.event.id;
    showNotice(
      `“${inscription}”`,
      playText('play.journal.entry', { title: text, key: preferences.label('inventory') }),
    );
    refresh();
    return;
  }
  const added = session.records.find((id) => !previousRecords.includes(id));
  if (added) newestRecord = added;
  refresh();
  if (session.done) {
    clearNotice();
    showOverlay(
      playText('play.ending.title'),
      playText('play.ending.description'),
      playText('play.ending.stay'),
      true,
    );
    return;
  }
  const detail = [];
  if (added) detail.push(playText('play.journal.saved', { key: preferences.label('inventory') }));
  if (session.completed !== previousPhase) detail.push(playText('play.checkpoint.saved'));
  showNotice(text, detail.join(' · '), target.id === 'photo');
}
function pauseGame() {
  paused = true;
  headshotFlash.cancel();
  $('shop-open').hidden = true;
  jumpMotor.pause();
  weaponSystem?.pauseAudio();
  input.deactivate();
  canvas.inert = true;
  viewDirty = true;
}
function showOverlay(title: string, text: string, button: string, showRestoredPhoto = false) {
  pauseGame();
  const overlay = $('overlay');
  overlay.dataset.screen = 'game-menu';
  overlay.setAttribute('aria-labelledby', 'overlay-title');
  $('title-copy').hidden = true;
  $('pause-copy').hidden = false;
  $('ending-photo').hidden = !showRestoredPhoto;
  $('overlay-title').textContent = title;
  $('overlay-text').innerHTML = text;
  $('start').textContent = button;
  $('restart').hidden = !started || Boolean(experience);
  overlay.hidden = false;
  refresh();
  $('start').focus({ preventScroll: true });
}
function resume() {
  if (
    !playableViewport.matches ||
    !ready ||
    defeated ||
    document.querySelector('dialog[open]') ||
    (experience && experience.match.phase !== 'playing')
  )
    return;
  if (!started) engine.runRenderLoop(renderFrame);
  started = true;
  paused = false;
  lastFrameTime = performance.now();
  $('overlay').hidden = true;
  canvas.inert = false;
  document.body.classList.add('playing');
  input.activate();
  weaponSystem?.unlock();
  refresh();
}
function setPosture(next: Posture) {
  posture = next;
  movementRuntime.posture = posture;
  applyPosture(body, posture);
  groundProbe.invalidate();
  clearTimeout(postureFeedbackTimer);
  postureFeedback.textContent = '';
  $('stand-key').hidden = posture === 'standing';
  for (const button of postureButtons)
    button.setAttribute('aria-pressed', String(button.dataset.posture === posture));
}
function changePosture(requested: Posture) {
  if (!started || paused) return;
  const { grounded, queued } = jumpMotor.snapshot();
  if (!grounded || queued) return;
  const next = requested === posture ? 'standing' : requested;
  if (next === posture) return;
  if (!canRaiseCollider(body, POSTURES[next].halfHeight, collisionBoxes)) {
    clearTimeout(postureFeedbackTimer);
    postureFeedback.textContent =
      next === 'standing'
        ? playText('play.posture.standBlocked')
        : playText('play.posture.crouchBlocked');
    postureFeedbackTimer = setTimeout(() => {
      postureFeedback.textContent = '';
    }, 2300);
    return;
  }
  setPosture(next);
}
function restoreCheckpoint(fromMenu = false) {
  if (levelId) {
    expedition.retry();
    navigate({ intent: 'continue' });
    return;
  }
  const fresh = defeated && !session.hasSave;
  let spawn: readonly number[] | null;
  if (fresh) spawn = beganOnIsland ? citadelArrival.asArray() : [0, 0.86, -4.5];
  else spawn = fromMenu ? session.continue() : session.retry();
  if (!spawn && fromMenu && expedition.hasSave) spawn = [0, 0.86, -4.5];
  if (!spawn) return;
  if (fromMenu && expedition.area === 'dungeon' && !expedition.dead) {
    navigate({ intent: 'expedition' });
    return;
  } else if (!fromMenu || expedition.dead) expedition.retry();
  clearNotice();
  setPosture('standing');
  playerView.resetPosture();
  Vector3.FromArrayToRef(spawn, 0, body.position);
  body.computeWorldMatrix(true);
  jumpMotor.reset();
  planarMotor.reset();
  chapterWorld?.reset();
  voidEncounter?.reset();
  weaponSystem?.reset();
  expeditionWorld.sync();
  defeated = false;
  if (fresh) yaw = beganOnIsland ? 0.32 : 0;
  else
    yaw =
      expedition.area === 'dungeon'
        ? 0
        : session.completed < 4
          ? Math.PI / 2
          : session.completed === 4
            ? -Math.PI / 2
            : 0;
  pitch = fresh && beganOnIsland ? -0.11 : 0.06;
  groundProbe.invalidate();
  restorationStart = session.completed ? performance.now() - 4000 : -1;
  refresh();
  resume();
}
function restartChapter() {
  if (levelId) {
    navigate({ intent: 'chapter' });
    return;
  }
  beganOnIsland = false;
  clearNotice();
  newestRecord = null;
  session.reset();
  expedition.newGame();
  expeditionWorld.sync();
  defeated = false;
  chapterWorld?.reset();
  voidEncounter?.reset();
  jumpMotor.reset();
  planarMotor.reset();
  setPosture('standing');
  playerView.resetPosture();
  body.position.set(0, 0.86, -4.5);
  body.computeWorldMatrix(true);
  yaw = 0;
  pitch = 0.06;
  viewMode = 'first';
  playerView.setMode(viewMode);
  weaponSystem?.setPerspective(viewMode);
  weaponSystem?.reset();
  refresh();
  resume();
}
function teleportExpedition(position: Point3, heading: number) {
  input.clear();
  spells.reset();
  jumpMotor.reset();
  planarMotor.reset();
  setPosture('standing');
  playerView.resetPosture();
  body.position.set(...position);
  body.computeWorldMatrix(true);
  groundProbe.invalidate();
  yaw = heading;
  pitch = 0.06;
  viewDirty = true;
}
function toggleView() {
  if (!started || paused) return;
  viewMode = viewMode === 'first' ? 'third' : 'first';
  showTarget(null);
  playerView.setMode(viewMode);
  weaponSystem?.setPerspective(viewMode);
  canvas.focus();
  updateInputHint();
}
const equipmentSlots = [...$('weapon-hud').querySelectorAll<HTMLButtonElement>('[data-slot]')];
function updateInputHint() {
  const label =
      viewMode === 'first' ? playText('play.camera.first') : playText('play.camera.third'),
    key = preferences.label,
    state = input.snapshot();
  $('view-toggle').querySelector('span')!.textContent = label;
  $('view-toggle').querySelector('kbd')!.textContent = key('view');
  $('shop-open').querySelector('kbd')!.textContent = key('shop');
  $('view-toggle').title = playText('play.camera.toggle', { key: key('view') });
  $('inventory-open').querySelector('kbd')!.textContent = key('inventory');
  $('controls').hidden = state.mode !== 'free-look';
  $('pointer-status').textContent = state.locked
    ? playText('play.pointer.locked')
    : state.lastError
      ? playText('play.pointer.denied')
      : playText('play.pointer.free');
  $('lock-retry').hidden = !started || paused || state.captureChoice !== 'denied';
  $('free-cursor').hidden = !started || paused || state.captureChoice !== 'denied';
  $('interact').querySelector('kbd')!.textContent = key('interact');
  for (const button of postureButtons) {
    const hint = button.querySelector('kbd');
    const next = button.dataset.posture;
    if (hint && (next === 'standing' || next === 'crouch' || next === 'prone'))
      hint.textContent = key(next === 'standing' ? 'jump' : next);
  }
  const slotActions = ['tool1', 'tool2', 'tool3'] as const;
  for (const [index, slot] of equipmentSlots.entries()) {
    const action = slotActions[index];
    if (action) slot.querySelector('kbd')!.textContent = key(action);
  }
  const move = (['forward', 'left', 'back', 'right'] as const).map(key).join(' / ');
  const controls = { move, reload: key('reload'), view: key('view'), interact: key('interact') };
  $('overlay-controls').textContent = armory
    ? playText('play.controls.arena', {
        ...controls,
        pistol: key('tool1'),
        rifle: key('tool2'),
        shop: key('shop'),
      })
    : playText('play.controls.chapter', {
        ...controls,
        sprint: key('sprint'),
        jump: key('jump'),
        crouch: key('crouch'),
        prone: key('prone'),
        slots: slotActions.map(key).join(' / '),
        inventory: key('inventory'),
      });
  canvas.setAttribute(
    'aria-label',
    playText('play.controls.canvas', {
      forward: key('forward'),
      jump: key('jump'),
      crouch: key('crouch'),
      prone: key('prone'),
      view: key('view'),
      interact: key('interact'),
    }),
  );
}
function dispatchJournal(command: JournalCommand) {
  const result = localSession.dispatch(command);
  if (result.ok && command.kind !== 'progression.spend-skill') {
    weaponSystem?.syncEquipment();
    viewDirty = true;
  }
  return result;
}
function selectEquipment(slot: number) {
  if (armory) {
    const id = equipmentSlots[slot]?.dataset.firearm;
    if (id && weaponSystem && 'select' in weaponSystem) weaponSystem.select(id);
    return;
  }
  dispatchJournal({ kind: 'inventory.select', payload: { slot } });
}
function handleAction(action: InputAction) {
  if (action === 'crouch' || action === 'prone') changePosture(action);
  if (action === 'jump') {
    if (posture === 'standing') jumpMotor.request();
    else changePosture('standing');
  }
  if (action === 'inventory') openInventory();
  if (action === 'shop' && armory) openArmory();
  if (action === 'interact') interact();
  if (action === 'view') toggleView();
  if (action === 'tool1') selectEquipment(0);
  if (action === 'tool2') selectEquipment(1);
  if (action === 'tool3') selectEquipment(2);
  if (action === 'reload') weaponSystem?.reload();
}
const input = createPlayerInput({
  canvas,
  preferences,
  canPlay: () => started && !paused && playableViewport.matches,
  onLook: (dx: number, dy: number) => {
    const sensitivity = 0.0026 * preferences.get().sensitivity;
    yaw += dx * sensitivity;
    pitch = lookPitch(pitch, dy * sensitivity);
  },
  onFire: () => weaponSystem?.hold(),
  onAim: (value: boolean) => weaponSystem?.aim(value),
  onRelease: () => weaponSystem?.release(),
  onCancel: () => weaponSystem?.cancelHold(),
  onAction: handleAction,
  onPause: (reason: string) =>
    showOverlay(
      reason === 'blur' ? playText('play.pause.return') : playText('play.pause.title'),
      playText('play.pause.location'),
      playText('play.pause.resume'),
    ),
  onMode: () => queueMicrotask(updateInputHint),
});
playableViewport.addEventListener('change', ({ matches }) => {
  if (!matches && started && !paused)
    showOverlay(
      playText('play.pause.title'),
      playText('play.pause.location'),
      playText('play.pause.resume'),
    );
  if (matches && !$('overlay').hidden && !inventoryDialog.open)
    $('start').focus({ preventScroll: true });
});
let journalFromMenu = false;
const inventory = createInventory({
  preferences,
  catalog: inventoryCatalog,
  dispatch: dispatchJournal,
  readJournal: localSession.readJournal,
  readChapterJournal: () => ({ lore: session.lore, records: session.records }),
  bowNocked: () => !!weaponSystem && 'bowNocked' in weaponSystem && weaponSystem.bowNocked,
  onClose() {
    if (journalFromMenu) {
      $('inventory-menu').focus();
      return;
    }
    resume();
  },
});
function openInventory(source: 'journal' | 'storage' = 'journal') {
  if (!started || defeated || experience || inventoryDialog.open) return;
  journalFromMenu = paused;
  pauseGame();
  if (source === 'storage') inventory.openStorage();
  else {
    inventory.open(newestRecord ?? undefined);
    newestRecord = null;
  }
}
function inBuyZone() {
  if (!experience || !armory) return false;
  const [x, y, z] = experience.level.spawn;
  return (
    Math.abs(body.position.y - y) < 1.25 &&
    Math.hypot(body.position.x - x, body.position.z - z) < 2.1
  );
}
const armoryUi = armory
  ? createArenaArmoryUi($, {
      read: () => armory.snapshot(),
      canBuy: () => started && !paused && inBuyZone() && !!experience?.match.canBuy,
      buy: (id: string) => localSession.dispatch({ kind: 'experience.buy', payload: { id } }),
      close: () => resume(),
    })
  : null;
function openArmory() {
  if (!started || paused || !armoryUi) return;
  if (!inBuyZone() || !experience?.match.canBuy) {
    showNotice(experienceText('shop.zone'));
    return;
  }
  pauseGame();
  armoryUi.open();
}
$('shop-open').addEventListener('click', openArmory);
$('inventory-open').addEventListener('click', () => openInventory());
$('inventory-menu').addEventListener('click', () => openInventory());
for (const [index, slot] of equipmentSlots.entries())
  slot.addEventListener('click', () => {
    if (!started || paused) return;
    selectEquipment(index);
    canvas.focus();
  });
for (const button of postureButtons)
  button.addEventListener('click', () => {
    if (!started || paused) return;
    const next = button.dataset.posture;
    if (next === 'standing' || next === 'crouch' || next === 'prone') changePosture(next);
    canvas.focus();
  });
const prologue = createPrologue(requireElement(document, '#prologue', HTMLDialogElement));
function spawnExperiencePlayer() {
  if (!experience) return;
  clearNotice();
  teleportExpedition(experience.level.spawn, experience.level.heading);
  weaponSystem?.reset();
}
function beginExperienceRound() {
  if (!experience) return;
  expedition.beginPractice();
  armory?.startRound(experience.match.snapshot().round === 1);
  expeditionWorld.resetRound();
  spawnExperiencePlayer();
  resume();
}
function advanceExperience(elapsed: number, fallen: boolean) {
  if (!experience) return;
  const objectives = expeditionWorld.advanceObjectives(Math.min(elapsed, 0.1), body.position);
  const respawn = experience.match.advance(elapsed, {
    defeated: fallen || expedition.dead,
    contested: expeditionWorld.wardContested(),
    ...objectives,
  });
  if (experience.match.phase !== 'playing') {
    const result = describeExperienceResult(experience.match.snapshot());
    clearNotice();
    showOverlay(result.title, result.detail, result.action);
    return;
  }
  if (respawn) {
    expedition.respawnPractice();
    armory?.restock();
    spawnExperiencePlayer();
    showNotice(experienceText('respawned'));
  }
  if ((!armory || experience.match.kind === 'score') && expedition.renewPracticeWave())
    expeditionWorld.sync();
}
function returnToTitle() {
  if (started) pauseGame();
  navigate(null);
}
function startExpedition() {
  session.reset();
  chapterWorld?.reset();
  voidEncounter?.reset();
  expedition.newGame();
  expeditionWorld.sync();
  weaponSystem?.reset();
  resume();
}
function enterLoadedLevel() {
  if (!ready || !playableViewport.matches) return;
  if (experience) {
    beginExperienceRound();
    return;
  }
  if (entry?.intent === 'expedition') {
    if (expedition.area !== 'dungeon' || expedition.dead) {
      navigate({ intent: 'continue' });
      return;
    }
    session.continue();
    teleportExpedition(DUNGEON_SPAWN, 0);
    resume();
  } else if (entry?.intent === 'return') {
    session.continue();
    session.restoreTraversal(traversal.take());
    if (expedition.area === 'dungeon') expedition.leave();
    teleportExpedition(CHAPTER_RETURN, Math.PI);
    restorationStart = session.completed ? performance.now() - 4000 : -1;
    resume();
  } else if (entry?.intent === 'continue') {
    if (session.hasSave || expedition.hasSave) restoreCheckpoint(true);
    else startExpedition();
  } else if (entry?.intent === 'citadel') {
    beganOnIsland = true;
    body.position.copyFrom(citadelArrival);
    body.computeWorldMatrix(true);
    yaw = 0.32;
    pitch = -0.11;
    startExpedition();
  } else prologue.begin(startExpedition);
}
$('start').addEventListener('click', () => {
  if (!started) enterLoadedLevel();
  else if (experience?.match.phase === 'between-rounds') {
    if (playableViewport.matches && experience.match.nextRound()) beginExperienceRound();
  } else if (experience?.match.phase === 'complete') {
    if (playableViewport.matches && experience.match.restart()) beginExperienceRound();
  } else if (defeated) restoreCheckpoint();
  else resume();
});
$('return-title').addEventListener('click', returnToTitle);
$('view-toggle').addEventListener('click', toggleView);
interactionButton.addEventListener('click', () => {
  interact();
  if (started && !paused) canvas.focus({ preventScroll: true });
});
$('lock-retry').addEventListener('click', () => input.retry());
$('free-cursor').addEventListener('click', () => input.chooseFree());
$('restart').addEventListener('click', restartChapter);
$('retry-checkpoint').addEventListener('click', () => restoreCheckpoint());
$('help').addEventListener('click', () =>
  showOverlay(
    playText('play.pause.title'),
    playText('play.pause.help'),
    playText('play.pause.resume'),
  ),
);
const settingsPanel = createSettingsPanel(preferences, {
  toggleMute: () => weaponSystem?.toggleMute() ?? false,
  onOpen() {
    pauseGame();
    $('overlay').hidden = true;
  },
  onClose() {
    $('overlay').hidden = false;
    $('settings-open').focus();
  },
});
window.addEventListener('keydown', (event) => {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.code !== 'Escape' ||
    document.querySelector('dialog[open]') ||
    settingsPanel.openState
  )
    return;
  if (
    started &&
    paused &&
    !defeated &&
    !$('overlay').hidden &&
    (!experience || experience.match.phase === 'playing')
  ) {
    event.preventDefault();
    resume();
  }
});
$('settings-open').addEventListener('click', () => settingsPanel.open());
preferences.subscribe((value: { dominantHand: string }) => {
  playerView.setDominantHand(value.dominantHand);
  weaponSystem?.setDominantHand(value.dominantHand);
  input.clear();
  updateInputHint();
  viewDirty = true;
});
updateInputHint();
$('inventory-equip').addEventListener('click', () => {
  viewDirty = true;
});
const loadedAssets: string[] = [];
if (chapterWorld && environment && readingRoom) {
  environment.placeZone('readingShelves');
  const floorFixtures = readingRoom.filter(({ prefab }: { prefab: string }) =>
    ['reading-counter', 'archive-chest', 'reading-bench'].includes(prefab),
  );
  const floor = environment.get('reading-floor');
  if (!floor) throw Error('Missing reading-floor mesh');
  const fixtures = [...floorFixtures, ...readingShelves].map(({ id }) => {
    const fixture = environment.get(id);
    if (!fixture) throw Error('Missing chapter fixture: ' + id);
    return fixture;
  });
  bakeFloorContactShadows(scene, floor, fixtures);
  for (const { id, position, label } of readingShelves) {
    if (!position || !label) continue;
    const [x, , z] = position;
    if (x === undefined || z === undefined) continue;
    chapterWorld.sign(
      `${id} plaque`,
      readingShelfSubject(id, label),
      [x + (x < 0 ? 0.35 : -0.35), 2.7, z],
      1.8,
      0.34,
      x < 0 ? -Math.PI / 2 : Math.PI / 2,
      'readingRoom',
    );
  }
}
function renderFrame() {
  // The profiler records the full frame interval. Animation advances in bounded seconds.
  const now = performance.now(),
    raw = (now - lastFrameTime) / 1000,
    dt = Math.min(raw, 0.25);
  lastFrameTime = now;
  if (import.meta.env.DEV) frameProfiler?.begin(raw, paused);
  if (paused && !viewDirty && restorationSettled) {
    if (import.meta.env.DEV) frameProfiler?.end(false);
    return;
  }
  let distance = 0,
    actualLocalX = 0,
    actualLocalZ = 0;
  input.updateLook(dt);
  const intent = movementIntent(input, yaw, posture),
    steps = movementSteps(raw);
  if (!paused) {
    const old = body.position.clone();
    groundProbe.invalidate();
    for (let i = 0; i < steps.count; i++) {
      const horizontal = planarMotor.displace(intent, steps.step);
      const atRest = horizontal.x === 0 && horizontal.z === 0;
      jumpMotor.step(
        steps.step,
        () => body.position.y,
        (dy, verticalOnly) =>
          moveCollider(
            body,
            new Vector3(verticalOnly ? 0 : horizontal.x, dy, verticalOnly ? 0 : horizontal.z),
          ),
        groundProbe.sample,
        atRest,
      );
    }
    distance = Math.hypot(body.position.x - old.x, body.position.z - old.z);
    walkDistance += Vector3.Distance(old, body.position);
    if (distance > 0.00001) {
      const mx = body.position.x - old.x,
        mz = body.position.z - old.z;
      actualLocalX = (Math.cos(yaw) * mx - Math.sin(yaw) * mz) / distance;
      actualLocalZ = (Math.sin(yaw) * mx + Math.cos(yaw) * mz) / distance;
    }
  } else planarMotor.reset();
  const fallen = body.position.y < -24;
  if (started && !paused && fallen && !experience) {
    defeated = true;
    clearNotice();
    weaponSystem?.pauseAudio();
    showOverlay(
      playText('play.fall.title'),
      session.hasSave ? playText('play.fall.saved') : playText('play.fall.unsaved'),
      session.hasSave ? playText('play.retry.checkpoint') : playText('play.retry.start'),
    );
  }
  const speed = steps.elapsed ? distance / steps.elapsed : 0,
    moving = speed > 0.035;
  movementRuntime = {
    speed,
    posture,
    running: moving && intent.running,
    elapsed: steps.elapsed,
    substeps: steps.count,
    walkSpeed: WALK_SPEED,
    sprintSpeed: SPRINT_SPEED,
  };
  if (import.meta.env.DEV) frameProfiler?.mark('movement');
  const jumpPose = jumpMotor.snapshot();
  playerView.update(
    dt,
    {
      yaw,
      pitch,
      moving,
      distance,
      speed,
      posture,
      airborne: !jumpPose.grounded,
      groundY: jumpPose.grounded ? groundProbe.sample()?.pickedPoint?.y : undefined,
      verticalSpeed: jumpPose.velocity,
      localX: actualLocalX,
      localZ: actualLocalZ,
      paused: paused || !started,
    },
    weaponSystem?.characterPose(dt, paused || !started),
    preferences.get().cameraShoulder,
  );
  if (import.meta.env.DEV) frameProfiler?.mark('pose');
  if (started && !paused) {
    if (chapterWorld) chapterWorld.update(Math.min(raw, 0.1), chapterViewState, body.position);
    expeditionWorld.update(Math.min(raw, 0.1), body.position, playerView.eye);
    if (experience) advanceExperience(raw, fallen);
    else if (expedition.dead) {
      defeated = true;
      showOverlay(
        playText('play.defeat.title'),
        playText('play.defeat.description'),
        playText('play.retry.checkpoint'),
      );
    }
  }
  const match = experience?.match.snapshot();
  if (experience && match) experienceHud.update(experience.id, match);
  expeditionHud.update(
    started && !paused,
    body.position,
    yaw,
    experience && match
      ? {
          kind: match.kind,
          ward: match.ward,
          bombSite: match.bombSite,
          levelId: experience.levelId,
        }
      : undefined,
  );
  showTarget(currentTarget());
  updateHudLine(dangerLabel, chapterWorld?.dangerLabel() ?? '');
  let label = '';
  if (
    chapterWorld &&
    Math.abs(body.position.x) < 8.25 &&
    body.position.z > -5.875 &&
    body.position.z < 6.8
  ) {
    for (const [i, shelf] of readingShelves.entries()) {
      if (!shelf.position || !shelf.label) continue;
      const [x, , z] = shelf.position;
      if (
        x !== undefined &&
        z !== undefined &&
        Math.hypot(body.position.x - x, body.position.z - z) < 2.5
      ) {
        label = playText('play.shelf.near', {
          number: i + 1,
          label: readingShelfSubject(shelf.id, shelf.label),
        });
      }
    }
  }
  updateHudLine(areaLabel, label);
  if (!paused && !document.hidden) advanceSubtitles(dt);
  updateRestoration(now);
  if (import.meta.env.DEV) frameProfiler?.mark('world');
  weaponSystem?.tick(dt, moving, paused || !started, playerView.bowSpan);
  spells.update(started && !paused ? Math.min(raw, 0.5) : 0);
  const active = !paused && !document.hidden;
  if (active) {
    wallLamps.update(now, camera.position);
    sky.update(Math.min(raw, 0.1));
    citadel?.update(Math.min(raw, 0.1));
  }
  if (started && active) voidEncounter?.update(dt, body.position, yaw, pitch);
  renderQuality.sample(raw, active);
  if (import.meta.env.DEV) frameProfiler?.mark('effects');
  scene.render();
  viewDirty = false;
  if (import.meta.env.DEV) {
    frameProfiler?.mark('render');
    frameProfiler?.end();
  }
  performanceHud.sample(raw, active);
}
const resizeObserver = new ResizeObserver(() => {
  engine.resize();
  viewDirty = true;
});
resizeObserver.observe(canvas);
window.addEventListener(
  'pagehide',
  () => {
    resizeObserver.disconnect();
    engine.dispose();
  },
  { once: true },
);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});
engine.onContextRestoredObservable.add(() => {
  viewDirty = true;
});
let appliedShadowQuality: ShadowQuality | undefined;
function applyShadowQuality(preset: ShadowQuality) {
  if (preset === appliedShadowQuality) return;
  applyStaticShadowQuality(
    scene.lights.filter((light) => !light.metadata?.carriedTorch),
    preset,
  );
  weaponSystem?.setShadowQuality(preset);
  appliedShadowQuality = preset;
}
preferences.subscribe(({ shadowQuality }: { shadowQuality: ShadowQuality }) => {
  if (ready) applyShadowQuality(shadowQuality);
});
export async function prepareLevel(showLoadingStep: (step: number, message: string) => void) {
  showLoadingStep(
    1,
    levelId
      ? playText('play.load.level', { level: experienceText(levelId) })
      : playText('play.load.archive'),
  );
  if (experience) expedition.beginPractice();
  await Promise.all([
    environment?.loadModels(),
    chapterWorld?.load(),
    leviathan?.load(),
    expeditionWorld.load(),
    entry?.intent === 'chapter' ? prologue.prepare() : undefined,
  ]);
  body.surroundingMeshes = collisionBoxes;
  const chapterColliders =
    chapterWorld && citadel && portal
      ? [portal, ...chapterWorld.movingColliders, ...citadel.movingColliders]
      : [];
  viewClearance.prepare([...chapterColliders, ...expeditionWorld.movingColliders]);

  showLoadingStep(2, playText('play.load.equipment'));
  await playerView.load();
  loadedAssets.push('Ante Apocalypse · Y Bot');
  if (levelId !== 'gothic-arena') loadedAssets.push('Ink apparition GLB');
  if (chapterWorld)
    loadedAssets.push(
      'Chapter 1 modelled furnishings',
      'Walnut folio bookcase',
      'Poly Haven old_wooden_floor_01',
      'Outer leviathan GLB',
    );
  else if (levelId === 'gothic-arena') loadedAssets.push('Gothic arena GLB · CC0');
  const structures =
    chapterWorld && environment && portal
      ? [...environment.occluders, { source: portal, surfaces: [portal] }]
      : [];
  const wallLightOcclusion = createWallLightOcclusion(structures);
  const opaqueWalls = new Set(structures.flatMap(({ surfaces }) => surfaces));
  if (armory && armoryUi && experience) {
    const { createArenaFirearms } = await import('../platform/babylon/arena/arena-firearms.ts');
    weaponSystem = createArenaFirearms(scene, camera, {
      armory,
      eye: () => playerView.eye,
      anchor: playerView.toolAnchor,
      canFire: () => started && !paused && !expedition.dead && experience.match.phase === 'playing',
      hit: (mesh, damage) => expeditionWorld.hit(mesh, { damage }),
      readHud: armoryUi.update,
    });
  } else
    weaponSystem = await createWeapons(scene, camera, {
      $,
      reticlePoint: spells.reticlePoint,
      thirdPersonAnchor: playerView.toolAnchor,
      sweepView: viewClearance.sweep,
      wallLightOcclusion,
      opaqueWalls,
      supplies: expedition,
      reloadLabel: () => preferences.label('reload'),
      onEmpty: showNotice,
      onShot: (shot) => spells.fire(shot),
      onReset: () => spells.reset(),
    });
  await weaponSystem.prepareAudio();
  playerView.setDominantHand(preferences.get().dominantHand);
  weaponSystem.setDominantHand(preferences.get().dominantHand);

  showLoadingStep(3, playText('play.load.lights'));
  // glTF 9.37 raises every material's light cap to the scene light count on load.
  // Reapply a bounded budget after the final import, before the first render.
  for (const mat of scene.materials)
    if ('maxSimultaneousLights' in mat && mat.maxSimultaneousLights !== undefined) {
      mat.maxSimultaneousLights = 4;
      new LightingVariants(mat);
    }
  const movingDoors = new Set<AbstractMesh>(
    chapterWorld && environment
      ? ['vault-gate', 'vault-shortcut-door', 'reading-shortcut-door'].flatMap((id) => {
          const mount = environment.get(id);
          if (!mount) throw Error('Missing moving door: ' + id);
          return [mount, ...mount.getChildMeshes()];
        })
      : [],
  );
  for (const mesh of citadel?.movingShadowCasters ?? []) movingDoors.add(mesh);
  for (const mesh of movingDoors) mesh.metadata = { ...mesh.metadata, movingShadowCaster: true };
  if (portalLight)
    scopeFixedLights(
      [
        portalLight,
        ...scene.lights.filter(
          (light): light is ShadowLight =>
            light.metadata?.lightingZone === 'ramparts' && 'position' in light,
        ),
      ],
      scene.meshes,
      body,
    );
  // Exterior beacons illuminate their nearby masonry. Assigning all eight to
  // every moving tool would exhaust WebGL's uniform blocks before play starts.
  for (const light of scene.lights.filter((light) => light.metadata?.lightingZone === 'ramparts')) {
    light.includedOnlyMeshes = light.includedOnlyMeshes.filter(
      (mesh) => mesh.metadata?.lightingZone === 'ramparts',
    );
  }
  const opaqueArchitecture = new Set<AbstractMesh>(
    environment && readingRoom
      ? readingRoom
          .filter(
            ({ bounds, prefab }: { bounds?: unknown; prefab: string }) =>
              bounds || prefab === 'archive-window',
          )
          .flatMap(({ id }: { id: string }) => environment.parts(id))
      : [],
  );
  for (const openingLight of openingLights ?? [])
    openingLight.assignSurfaces(scene.meshes, opaqueArchitecture, movingDoors, body);
  wallLamps.assignSurfaces(movingDoors);
  spells.assignLightSurfaces(wallLightOcclusion);
  reserveWorldLightSlots(scene.lights, scene.meshes);
  for (const mesh of rampartSurfaces ?? [])
    if (mesh.metadata?.castShadow !== false && mesh.isVisible && mesh.getTotalVertices() > 0) {
      shadow?.addShadowCaster(mesh, false);
    }
  const shadowMap = shadow?.getShadowMap();
  if (shadowMap) shadowMap.refreshRate = 0;
  applyShadowQuality(preferences.get().shadowQuality);
  refresh();
  updateRestoration(performance.now());
  await spells.ready();
  const staticMeshes = scene.meshes.filter(
    (mesh) =>
      mesh.metadata?.lightingZone &&
      mesh.isVisible &&
      mesh.getTotalVertices() &&
      !movingDoors.has(mesh),
  );
  cullBehindOpaqueWalls(scene, camera, structures, staticMeshes);
  // Scope the entry light from the same ground contact and eye offset as the first playable frame.
  const entryFloor = groundProbe.sample()?.pickedPoint?.y;
  playerView.update(
    0,
    {
      yaw,
      pitch,
      moving: false,
      speed: 0,
      paused: true,
      airborne: entryFloor === undefined,
      groundY: entryFloor,
      verticalSpeed: 0,
      localX: 0,
      localZ: 0,
    },
    null,
    preferences.get().cameraShoulder,
  );
  await prepareSceneLighting(scene, camera, async (prepareDraw) => {
    const prepareReceivers = async () => {
      await prepareDraw();
      await spells.prepareLighting(prepareDraw);
    };
    await weaponSystem!.prepareEquipment(prepareReceivers, () => prepareDraw(true));
    await prepareReceivers();
    await prepareDraw();
  });
  // Run the real entry pose behind the loading screen and wait for its GPU work.
  wallLamps.update(performance.now(), camera.position);
  engine.beginFrame();
  let firstDraw: Promise<ArrayBufferView>;
  try {
    renderFrame();
    firstDraw = engine.readPixels(0, 0, 1, 1);
  } finally {
    engine.endFrame();
  }
  await firstDraw;
  if (import.meta.env.DEV) {
    await import('../levels/level-diagnostics.ts')
      .then(({ installLevelDiagnostics }) =>
        installLevelDiagnostics(scene, levelId ?? chapterLevel.id),
      )
      .catch((error) => console.warn('[Level inspection] Failed to load diagnostics.', error));
    await import('../platform/babylon/rendering/frame-profiler.ts')
      .then(({ createFrameProfiler }) => {
        frameProfiler = createFrameProfiler(scene);
        const { start, stop, report } = frameProfiler;
        Object.assign(window, { __FRAME_PROFILE__: Object.freeze({ start, stop, report }) });
      })
      .catch((error) => console.warn('[Frame profiler] Failed to load diagnostics.', error));
  }
  ready = true;
}
Object.defineProperty(window, '__ROOM_DEMO__', {
  value: Object.freeze({
    snapshot: () => ({
      ready,
      started,
      paused,
      viewMode,
      yaw,
      pitch,
      preferences: preferences.get(),
      jump: jumpMotor.snapshot(),
      spells: spells.snapshot(),
      movement: movementRuntime,
      input: input.snapshot(),
      player: playerView.snapshot(),
      phase: session.completed,
      experience: experience
        ? { id: experience.id, levelId: experience.levelId, ...experience.match.snapshot() }
        : null,
      expedition: expeditionWorld.snapshot(),
      chapter: session.snapshot(),
      levelId: levelId ?? chapterLevel.id,
      citadel: citadel?.snapshot() ?? null,
      world: chapterWorld?.snapshot() ?? null,
      encounter: voidEncounter?.snapshot() ?? null,
      defeated,
      position: body.position.asArray(),
      camera: {
        position: camera.position.asArray(),
        rotation: camera.rotation.asArray(),
        fov: camera.fov,
        viewport: [innerWidth, innerHeight],
      },
      lighting: {
        ambient: ambient.intensity,
        moon: sun.intensity,
        desk: deskLight?.intensity ?? 0,
        portal: portalLight?.intensity ?? 0,
        portalEnabled: portalLight?.isEnabled() ?? false,
        clueEnabled: false,
        shadowCasters: shadow?.getShadowMap()?.renderList?.length ?? 0,
        restorationProgress:
          restorationStart < 0 ? 0 : Math.min(1, (performance.now() - restorationStart) / 3300),
        seals: archiveMagic?.snapshot() ?? null,
      },
      loadedAssets: [...loadedAssets],
      walkDistance,
      fps: engine.getFps(),
      weapon: weaponSystem?.snapshot() || null,
      meshCount: scene.meshes.length,
    }),
    audioStream: () => weaponSystem?.audioStream(),
    renderStatus: () => ({
      backend: engine.description,
      adapter: engine.getInfo(),
      activeMeshes: scene.getActiveMeshes().length,
      materials: scene.materials.map((m) => ({
        name: m.name,
        lights: 'maxSimultaneousLights' in m ? m.maxSimultaneousLights : undefined,
        internal: '_maxSimultaneousLights' in m ? m._maxSimultaneousLights : undefined,
        ready: m.isReady(),
      })),
    }),
  }),
});
Object.defineProperty(window, '__EXPEDITION__', {
  value: Object.freeze({
    snapshot: () => ({
      state: expedition.snapshot(),
      world: expeditionWorld.snapshot(),
      target: shownTarget?.id ?? null,
    }),
  }),
});
