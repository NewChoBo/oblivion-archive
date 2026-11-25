import type { AbstractMesh, Camera, Mesh, Scene } from '@babylonjs/core';
import type { BowMotion, BowRelease, WandMotion } from './arcane-tools.ts';
import type { BowPose, HandToolPose } from './equipment-pose.ts';
import type { SweepView } from '../player/player-view.ts';
import type { SpellShot } from '../effects/spell-effects.ts';
import type { ShadowPreset } from './torch.ts';
import type { WallLightOcclusion } from '../../../app/lighting/wall-light-occlusion.ts';
import type {
  BowDefinition,
  TorchDefinition,
  WandDefinition,
  WeaponPreparation,
  WeaponStock,
  WeaponType,
} from '../../../app/equipment/weapon-types.ts';
import {
  TransformNode,
  Vector3,
  Color3,
  PointLight,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  Matrix,
  Quaternion,
  Texture,
} from '@babylonjs/core';
import { createWeaponAudio } from '../../browser/weapon-audio.ts';
import { createArcaneTool } from './arcane-tools.ts';
import { WAND_RELEASE, wandStroke } from '../../../game/combat/wand-stroke.ts';
import {
  BOW_RELEASE_SECONDS,
  bowNockMotion,
  bowReleaseMotion,
  rechargeMotion,
} from './recharge-motion.ts';
import { createTorch, torchFlameRadius, torchNearPlane } from './torch.ts';
import { gearTitle, WEAPON_TYPES } from '../../../app/equipment/weapon-types.ts';

type ArcaneModel = Awaited<ReturnType<typeof createArcaneTool>>;
type ArmedModel =
  | (WandDefinition & { arcane: Extract<ArcaneModel, { form: 'crystal-wand' }> })
  | (BowDefinition & { arcane: Extract<ArcaneModel, { form: 'rune-bow' }> });
type MountedTool =
  | (ArmedModel & ReturnType<typeof createShotFlash>)
  | (TorchDefinition & { arcane: ReturnType<typeof createTorch>; flash?: never; muzzle?: never });
interface Sleeve {
  palm: Mesh;
  sleeve: Mesh;
  cuff: Mesh;
  side: number;
  fingers: Mesh[];
}
type EquippedTool = MountedTool & {
  rig: TransformNode;
  visuals: TransformNode;
  tip: Vector3;
  viewMeshes: AbstractMesh[];
  viewHands: readonly [Mesh, Mesh];
  sleeves: Sleeve[];
  runeCharge: number;
  ammo?: number;
  preparation?: WeaponPreparation;
};
type FiringTool = Exclude<EquippedTool, { item: 'torch' }>;

interface Supplies {
  ammo(item: WeaponType['item']): WeaponStock | null | undefined;
  consume(item: FiringTool['item']): boolean;
  reload(item: FiringTool['item']): void;
  gear(slot: number): { id?: string; title: string } | null | undefined;
  equipped(slot: number): string | null | undefined;
  selected(): number;
  setTorch(lit: boolean): void;
  torchLit(): boolean;
}
interface WeaponOptions {
  $(id: string): HTMLElement;
  reticlePoint(): Vector3;
  thirdPersonAnchor: TransformNode;
  sweepView: SweepView;
  wallLightOcclusion?: WallLightOcclusion;
  opaqueWalls?: ReadonlySet<AbstractMesh>;
  supplies?: Supplies;
  reloadLabel?(): string;
  onEmpty?(message: string): void;
  onShot?(shot: SpellShot): void;
  onReset?(): void;
}
const drawSeconds = 1.1;
const definitions = [WEAPON_TYPES.wand, WEAPON_TYPES.bow, WEAPON_TYPES.torch];

function createShotFlash(
  scene: Scene,
  rig: TransformNode,
  definition: WeaponType,
  tip: Vector3,
  bow: boolean,
) {
  const material = new StandardMaterial(`${definition.id} cast flash`, scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.FromHexString(bow ? '#ffe2a1' : '#96ecff');
  let flash;
  if (bow) {
    flash = MeshBuilder.CreateTorus(
      'bow release ripple',
      { diameter: 0.13, thickness: 0.006, tessellation: 32 },
      scene,
    );
    flash.rotation.x = Math.PI / 2;
  } else {
    const path = Array.from({ length: 19 }, (_, n) => {
      const t = n / 18,
        angle = -2.2 + t * 3.9;
      return new Vector3(0.1 * Math.cos(angle), 0.072 * Math.sin(angle), 0.036 * t);
    });
    flash = MeshBuilder.CreateTube(
      'moonstone cast stroke',
      {
        path,
        tessellation: 5,
        radiusFunction: (n) => 0.001 + 0.008 * Math.sin((Math.PI * n) / 18),
      },
      scene,
    );
  }
  flash.parent = rig;
  flash.material = material;
  flash.isPickable = false;
  flash.metadata = { toolVisual: true };
  flash.setEnabled(false);
  const muzzle = new PointLight('shot light', tip.add(new Vector3(0, 0, 0.02)), scene);
  muzzle.parent = rig;
  muzzle.diffuse = material.emissiveColor;
  muzzle.range = 2;
  muzzle.intensity = 0;
  muzzle.renderPriority = 20;
  return { flash, muzzle };
}

export async function createWeapons(
  scene: Scene,
  camera: Camera,
  {
    $,
    reticlePoint,
    thirdPersonAnchor,
    sweepView,
    wallLightOcclusion,
    opaqueWalls,
    supplies,
    reloadLabel = () => 'R',
    onEmpty = () => {},
    onShot = () => {},
    onReset = () => {},
  }: WeaponOptions,
) {
  const viewmodelMeshes = new Set<AbstractMesh>();
  const weapons: EquippedTool[] = [],
    stats = { shots: 0, switches: 0, reloads: 0, audioPlays: 0, audioErrors: 0 };
  let selected = 0,
    equip = 0.45,
    cooldown = 0,
    kick = 0,
    flashTime = 0,
    clock = 0,
    held = false,
    muted = false,
    thirdPerson = false;
  const firstPersonRig = new TransformNode('first-person hand and tool rig', scene);
  firstPersonRig.parent = camera;
  const drawGauge = $('bow-draw-gauge') as HTMLProgressElement;
  const flameOffset = Vector3.Zero();
  const sound = createWeaponAudio({
    onPlay: () => stats.audioPlays++,
    onError: () => stats.audioErrors++,
  });
  let shotAge = Infinity,
    aimed = false,
    readiness = 0;
  let wandMotion: WandMotion | null = null,
    bowMotion: BowMotion | null = null;
  let completionGlow = 0,
    torchLit = true;
  const pendingShots: { weapon: FiringTool; bowPower?: number; origin: Vector3 }[] = [];
  let castAge = Infinity,
    strokeDirection = 1,
    awaitingRelease = false,
    reloadAfterCast = false;
  let stroke = wandStroke(Infinity, 1);
  let drawStarted: number | null = null,
    releasedDraw = 0,
    draw = 0,
    bowRelease: BowRelease = null;
  const drawFraction = (start: number) =>
    Math.min(1, (performance.now() - start) / (drawSeconds * 1000));
  let emptyNoticeAt = -Infinity;
  function stock(w: EquippedTool) {
    return supplies?.ammo(w.item) ?? { loaded: w.ammo ?? 0, reserve: 0 };
  }
  function empty(w: FiringTool) {
    if (performance.now() - emptyNoticeAt <= 2000) return;
    const message = w.empty?.(stock(w), reloadLabel());
    if (message) {
      emptyNoticeAt = performance.now();
      onEmpty(message);
    }
  }
  function syncAmmo(w: EquippedTool) {
    const ammo = supplies?.ammo(w.item);
    if (ammo) w.ammo = ammo.loaded;
  }
  function cancelHold() {
    held = false;
    drawStarted = null;
    drawGauge.hidden = true;
    sound.endDraw();
  }
  function endCast() {
    castAge = Infinity;
    awaitingRelease = false;
    reloadAfterCast = false;
    stroke = wandStroke(Infinity, 1);
  }
  function emitShot(w: FiringTool, bowPower?: number) {
    if (supplies) {
      if (!supplies.consume(w.item)) {
        empty(w);
        return;
      }
      syncAmmo(w);
    } else {
      if (!w.ammo) return;
      w.ammo--;
    }
    w.preparation?.afterShot?.();
    kick = Math.min(0.15, kick + w.kick);
    flashTime = 0.065;
    shotAge = 0;
    stats.shots++;
    w.rig.computeWorldMatrix(true);
    pendingShots.push({
      weapon: w,
      bowPower,
      origin: Vector3.TransformCoordinates(w.tip, w.rig.getWorldMatrix()),
    });
    sound.release(w.id, bowPower);
  }
  function clothingSurface(name: string, path: string, color: string, roughness: number) {
    const surface = new PBRMaterial(name, scene);
    surface.maxSimultaneousLights = 4;
    surface.albedoTexture = new Texture('./assets/chapter-art/' + path, scene);
    surface.albedoColor = Color3.FromHexString(color);
    surface.metallic = 0;
    surface.roughness = roughness;
    surface.useGLTFLightFalloff = true;
    return surface;
  }
  const glove = clothingSurface('scribe leather gloves', 'leather.jpg', '#dfb597', 0.66);
  const cloth = clothingSurface('scribe linen sleeves', 'linen.jpg', '#d4c4ac', 0.95);
  async function mount(definition: WeaponType, rig: TransformNode): Promise<MountedTool> {
    if (definition.item === 'torch')
      return {
        ...definition,
        arcane: createTorch(scene, rig, wallLightOcclusion, opaqueWalls, viewmodelMeshes),
      };
    const arcane = await createArcaneTool(scene, rig, definition.item === 'bow');
    const flash = createShotFlash(scene, rig, definition, arcane.tip, definition.item === 'bow');
    if (arcane.form === 'rune-bow') return { ...WEAPON_TYPES.bow, arcane, ...flash };
    return { ...WEAPON_TYPES.wand, arcane, ...flash };
  }
  for (const [i, definition] of definitions.entries()) {
    const rig = new TransformNode(definition.id + ' viewmodel', scene);
    rig.parent = firstPersonRig;
    const mounted = await mount(definition, rig);
    const { arcane, muzzle } = mounted;
    const tip = arcane.tip;
    const hand = MeshBuilder.CreateCapsule(
      'gripping hand',
      { height: 0.116, radius: 0.034, tessellation: 10 },
      scene,
    );
    hand.parent = rig;
    hand.position.set(0.015, -0.1, -0.1);
    hand.rotation.x = -0.22;
    hand.material = glove;
    hand.renderingGroupId = 2;
    hand.isPickable = false;
    const viewMeshes = [...arcane.meshes, hand];
    for (const mesh of viewMeshes) {
      mesh.renderingGroupId = 2;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.metadata = { ...mesh.metadata, toolVisual: true };
    }
    const support = hand.clone('support hand');
    support.parent = rig;
    support.rotation.z = -0.1;
    viewMeshes.push(support);
    const viewHands = [hand, support] as const;
    const sleeves = [];
    for (const [j, palm] of viewHands.entries()) {
      const side = j === 0 ? 1 : -1;
      const sleeve = MeshBuilder.CreateCylinder(
        'scribe sleeve',
        { height: 1, diameterTop: 0.094, diameterBottom: 0.14, tessellation: 12 },
        scene,
      );
      sleeve.parent = firstPersonRig;
      sleeve.rotationQuaternion = Quaternion.Identity();
      sleeve.material = cloth;
      const cuff = MeshBuilder.CreateCylinder(
        'leather wristband',
        { height: 0.092, diameterTop: 0.067, diameterBottom: 0.098, tessellation: 10 },
        scene,
      );
      cuff.parent = firstPersonRig;
      cuff.rotationQuaternion = Quaternion.Identity();
      cuff.material = glove;
      const thumb = MeshBuilder.CreateCapsule(
        'gripping thumb',
        { height: 0.073, radius: 0.013, tessellation: 8 },
        scene,
      );
      thumb.parent = palm;
      thumb.position.set(-side * 0.022, 0.03, 0.012);
      thumb.rotation.z = -side * 0.83;
      thumb.material = glove;
      const fingers = [];
      for (let finger = 0; finger < 4; finger++) {
        const knuckle = MeshBuilder.CreateCapsule(
          'curled finger',
          { height: 0.046, radius: 0.009, tessellation: 8 },
          scene,
        );
        knuckle.parent = palm;
        knuckle.position.set(-side * 0.022, 0.019 - finger * 0.017, -0.015);
        knuckle.rotation.z = side * 1.14;
        knuckle.material = glove;
        fingers.push(knuckle);
      }
      sleeves.push({ palm, sleeve, cuff, side, fingers });
      for (const mesh of [sleeve, cuff, thumb, ...fingers]) {
        mesh.isPickable = false;
        mesh.renderingGroupId = 2;
        mesh.metadata = { toolVisual: true };
        viewMeshes.push(mesh);
      }
    }
    // A restrained camera-space key and rim keep dark iron readable without
    // lifting the room's shadows or letting the muzzle replace a clue light.
    for (const light of scene.lights)
      if (light !== muzzle) light.excludedMeshes.push(...viewMeshes);
    if (muzzle) muzzle.includedOnlyMeshes = viewMeshes;
    const keyLight = new PointLight('viewmodel soft key', new Vector3(-0.3, 0.32, -0.62), scene);
    keyLight.parent = rig;
    keyLight.diffuse = new Color3(0.72, 0.66, 0.57);
    keyLight.specular = keyLight.diffuse.scale(0.6);
    keyLight.intensity = 0.94;
    keyLight.range = 2;
    keyLight.renderPriority = 15;
    keyLight.includedOnlyMeshes = viewMeshes;
    const rim = new PointLight('viewmodel worn edge', new Vector3(0.35, 0.1, 0.24), scene);
    rim.parent = rig;
    rim.diffuse = i === 0 ? new Color3(0.53, 0.61, 0.69) : new Color3(0.77, 0.64, 0.48);
    rim.specular = rim.diffuse.scale(0.58);
    rim.intensity = 0.68;
    rim.range = 1.4;
    rim.renderPriority = 14;
    rim.includedOnlyMeshes = viewMeshes;
    // Keep the dedicated view lights attached to their own meshes between selections.
    // Hiding the transform that owns a light would change shader defines on those meshes.
    const visuals = new TransformNode(definition.id + ' geometry', scene);
    for (const child of rig.getChildren())
      if (!(child instanceof PointLight)) child.parent = visuals;
    visuals.parent = rig;
    visuals.setEnabled(i === 0);
    for (const { sleeve, cuff } of sleeves) {
      sleeve.metadata.animatedScale = true;
      sleeve.setEnabled(i === 0);
      cuff.setEnabled(i === 0);
    }
    const weapon: EquippedTool = {
      ...mounted,
      rig,
      visuals,
      tip,
      viewMeshes,
      viewHands,
      sleeves,
      runeCharge: 0,
      ammo: supplies?.ammo(definition.item)?.loaded ?? mounted.capacity,
    };
    for (const mesh of viewMeshes) viewmodelMeshes.add(mesh);
    if (weapon.item !== 'torch') {
      const hooks = {
        stock: () => (supplies ? stock(weapon) : { loaded: weapon.ammo!, reserve: Infinity }),
        refill() {
          if (supplies) {
            supplies.reload(weapon.item);
            syncAmmo(weapon);
          } else weapon.ammo = weapon.capacity;
        },
        sound,
        onChargeComplete: () => {
          completionGlow = 1;
        },
      };
      weapon.preparation =
        weapon.item === 'bow'
          ? weapon.createPreparation(WEAPON_TYPES.bow, hooks)
          : weapon.createPreparation(WEAPON_TYPES.wand, hooks);
    }
    weapons.push(weapon);
  }
  const hud = $('weapon-hud'),
    title = $('weapon-title'),
    ammo = $('ammo'),
    ammoCurrent = $('ammo-current');
  const ammoLabel = $('ammo-label'),
    ammoUnit = $('ammo-unit'),
    ammoTotal = ammo.querySelector<HTMLElement>('.ammo-total')!;
  const ammoCapacity = $('ammo-capacity'),
    ammoDetail = $('ammo-detail'),
    weaponState = $('weapon-state'),
    crosshair = $('crosshair');
  function text(element: HTMLElement, value = '') {
    if (element.textContent !== value) element.textContent = value;
  }
  function visible(element: HTMLElement, show: boolean) {
    if (element.hidden === show) element.hidden = !show;
  }
  const slots = [...hud.querySelectorAll<HTMLButtonElement>('[data-slot]')];
  hud.hidden = false;
  const torch = weapons.find((w) => w.item === 'torch')!;
  const bowTool = weapons.find((w) => w.item === 'bow')!;
  function applySelection(index: number) {
    const next = weapons[index];
    if (index === selected || !next) return;
    cancelHold();
    sound.cancelReload();
    const previous = weapons[selected]!;
    if (previous.item === 'torch') previous.arcane.update({ lit: false, clock });
    previous.preparation?.reset();
    previous.visuals.setEnabled(false);
    for (const { sleeve, cuff } of previous.sleeves) {
      sleeve.setEnabled(false);
      cuff.setEnabled(false);
    }
    selected = index;
    endCast();
    wandMotion = null;
    bowMotion = null;
    completionGlow = 0;
    readiness = 0;
    next.visuals.setEnabled(true);
    equip = next.equip;
    cooldown = 0;
    kick = 0;
    flashTime = 0;
    shotAge = Infinity;
    stats.switches++;
  }
  const api = {
    setShadowQuality(preset: ShadowPreset) {
      torch.arcane.setShadowQuality(preset);
    },
    async prepareEquipment(prepareAll: () => Promise<void>, drawEntry: () => Promise<void>) {
      const previousSlot = selected;
      const previousEquip = equip;
      const previousLit = torchLit;
      try {
        // Pose the actual first-person models. In their unmounted pose the bowstring,
        // hands and fire sprites can all fall outside the camera pass.
        equip = 0;
        torchLit = false;
        for (const [index, weapon] of weapons.entries()) {
          selected = index;
          weapon.visuals.setEnabled(true);
          api.tick(0, false, true);
        }
        const restore = torch.arcane.prepareLighting();
        try {
          await prepareAll();
        } finally {
          restore();
        }
        selected = weapons.indexOf(torch);
        torchLit = true;
        api.tick(0, false, true);
        const restoreArrows = bowTool.arcane.prepareArrows();
        try {
          await drawEntry();
        } finally {
          restoreArrows();
        }
      } finally {
        torch.arcane.update({ lit: false, clock });
        selected = previousSlot;
        equip = previousEquip;
        torchLit = previousLit;
        for (const weapon of weapons) {
          const equipped = weapon === weapons[selected];
          weapon.visuals.setEnabled(equipped);
          for (const { sleeve, cuff } of weapon.sleeves) {
            sleeve.setEnabled(equipped && !thirdPerson);
            cuff.setEnabled(equipped && !thirdPerson);
          }
        }
        api.tick(0, false, true);
      }
    },
    prepareAudio: sound.prepare,
    unlock() {
      sound.unlock();
    },
    hold() {
      if (held) return;
      held = true;
      if (weapons[selected]!.item === 'torch') {
        if (equip === 0) {
          torchLit = !torchLit;
          supplies?.setTorch(torchLit);
        }
      } else api.prepare();
    },
    release() {
      if (drawStarted !== null) {
        releasedDraw = drawFraction(drawStarted);
        const w = weapons[selected]!;
        if (w.item === 'bow') {
          emitShot(w, releasedDraw);
          cooldown = w.interval;
        }
      }
      cancelHold();
    },
    cancelHold,
    syncEquipment() {
      applySelection(supplies?.selected() ?? selected);
      for (const w of weapons) syncAmmo(w);
    },
    get bowNocked() {
      return bowTool.preparation?.nocked ?? false;
    },
    audioStream: () => sound.stream(),
    impactSound: sound.impact,
    voidRumble: sound.voidRumble,
    pauseAudio: () => sound.pause(),
    setDominantHand(hand: string) {
      firstPersonRig.scaling.x = hand === 'left' ? -1 : 1;
    },
    setPerspective(mode: string) {
      thirdPerson = mode === 'third';
      for (const w of weapons) {
        w.rig.parent = thirdPerson ? thirdPersonAnchor : firstPersonRig;
        w.rig.scaling.setAll(thirdPerson ? (w.arcane.form === 'rune-bow' ? 1.36 : 0.9) : 1);
        for (const mesh of w.viewMeshes) mesh.renderingGroupId = thirdPerson ? 0 : 2;
        for (const hand of w.viewHands) hand.setEnabled(!thirdPerson);
        for (const { sleeve, cuff } of w.sleeves) {
          sleeve.setEnabled(!thirdPerson && w === weapons[selected]);
          cuff.setEnabled(!thirdPerson && w === weapons[selected]);
        }
        if (w.flash) w.flash.renderingGroupId = thirdPerson ? 0 : 2;
      }
    },
    aim(value: boolean) {
      aimed = value;
    },
    reload() {
      const w = weapons[selected]!;
      if (w.item === 'torch' || !w.preparation) return;
      if (awaitingRelease) {
        reloadAfterCast = true;
        return;
      }
      if (equip > 0 || w.preparation.timer.active || w.ammo === w.capacity) return;
      if (supplies && !stock(w).reserve) {
        empty(w);
        return;
      }
      if (w.preparation.request()) {
        if (w.item === 'wand') held = false;
        stats.reloads++;
      }
    },
    prepare() {
      const w = weapons[selected]!;
      if (
        w.item === 'torch' ||
        !w.preparation ||
        equip > 0 ||
        w.preparation.timer.active ||
        cooldown > 0 ||
        awaitingRelease ||
        drawStarted !== null
      )
        return;
      if (!w.ammo) {
        empty(w);
        return;
      }
      if (w.item === 'bow') {
        if (w.preparation.nocked) {
          drawStarted = performance.now();
          sound.beginDraw(0, drawSeconds);
        }
        return;
      }
      sound.castStroke();
      cooldown = w.interval;
      strokeDirection = castAge < 0.48 ? -strokeDirection : 1;
      castAge = 0;
      awaitingRelease = true;
    },
    toggleMute() {
      muted = !muted;
      sound.setMuted(muted);
      if (!muted && drawStarted !== null) sound.beginDraw(drawFraction(drawStarted), drawSeconds);
      return muted;
    },
    reset() {
      endCast();
      wandMotion = null;
      bowMotion = null;
      completionGlow = 0;
      cancelHold();
      draw = 0;
      releasedDraw = 0;
      shotAge = Infinity;
      aimed = false;
      readiness = 0;
      torchLit = supplies?.torchLit() ?? true;
      sound.stopAll();
      pendingShots.length = 0;
      onReset();
      for (const w of weapons) {
        if (supplies) syncAmmo(w);
        else w.ammo = w.capacity;
        w.preparation?.reset();
        if (w.item === 'torch') w.arcane.update({ lit: false, clock });
        w.visuals.setEnabled(false);
        for (const { sleeve, cuff } of w.sleeves) {
          sleeve.setEnabled(false);
          cuff.setEnabled(false);
        }
      }
      selected = supplies?.selected() ?? 0;
      weapons[selected]!.visuals.setEnabled(true);
      for (const { sleeve, cuff } of weapons[selected]!.sleeves) {
        sleeve.setEnabled(!thirdPerson);
        cuff.setEnabled(!thirdPerson);
      }
      equip = 0.45;
      cooldown = 0;
      kick = 0;
      flashTime = 0;
    },
    characterPose(dt: number, blocked: boolean): BowPose | HandToolPose {
      const w = weapons[selected]!,
        bow = w.item === 'bow',
        launchBow = bow && pendingShots.length > 0;
      syncAmmo(w);
      if (!blocked) {
        completionGlow = Math.max(0, completionGlow - dt / 0.16);
        if (!launchBow) {
          shotAge += dt;
          flashTime = Math.max(0, flashTime - dt);
        }
        clock += dt;
        equip = Math.max(0, equip - dt);
        cooldown = Math.max(0, cooldown - dt);
        kick *= Math.exp(-w.recover * dt);
        w.preparation?.timer.advance(dt);
        castAge += dt;
        if (awaitingRelease && castAge >= WAND_RELEASE) {
          awaitingRelease = false;
          if (w.item === 'wand') emitShot(w);
          if (reloadAfterCast) {
            reloadAfterCast = false;
            api.reload();
          }
        }
        if (
          equip === 0 &&
          w.preparation?.request({
            automatic: true,
            cooled: cooldown === 0,
            settled: shotAge >= BOW_RELEASE_SECONDS && pendingShots.length === 0,
          }) &&
          w.item === 'wand'
        ) {
          held = false;
          stats.reloads++;
        }
        if (held) api.prepare();
      }
      // Sample the exact release pose even if a slow frame steps past the key.
      const target =
        w.preparation && (aimed || held || shotAge < (bow ? BOW_RELEASE_SECONDS : 0.22)) ? 1 : 0;
      if (!blocked)
        readiness = pendingShots.length
          ? 1
          : readiness + (target - readiness) * (1 - Math.exp(-dt * (target ? 16 : 8)));
      stroke = wandStroke(
        w.item === 'wand' && pendingShots.length ? WAND_RELEASE : castAge,
        strokeDirection,
      );
      const progress = w.preparation?.timer.progress ?? 0;
      const reload = bow ? 0 : progress,
        nock = bow ? progress : 0;
      if (!blocked) {
        bowMotion = bow ? bowNockMotion(nock) : null;
        wandMotion = bow ? null : rechargeMotion(reload);
      }
      bowRelease = bow ? bowReleaseMotion(shotAge, releasedDraw) : null;
      draw =
        drawStarted !== null ? drawFraction(drawStarted) : releasedDraw * (bowRelease?.hold ?? 0);
      const pose = {
        stroke,
        castAge,
        draw,
        tip: w.tip,
        grip: w.arcane.grips().support,
        scale: w.rig.scaling.x,
        held,
        ready: readiness,
        reload,
        nock,
      };
      if (bow)
        return {
          ...pose,
          bow: true,
          torch: false,
          bowRelease,
          bowRest: w.arcane.rest,
          motion: bowMotion,
        };
      return {
        ...pose,
        bow: false,
        torch: w.item === 'torch',
        bowRelease: null,
        bowRest: undefined,
        motion: wandMotion,
      };
    },
    tick(dt: number, moving: boolean, blocked: boolean, bowSpan?: number) {
      const w = weapons[selected]!;
      const motion = bowMotion ?? wandMotion;
      const reload = motion?.present ?? 0;
      const lowered = equip > 0 ? Math.pow(equip / w.equip, 2) : 0;
      const bob = moving ? Math.sin(clock * 9) * 0.008 : Math.sin(clock * 1.7) * 0.002;
      const bow = w.item === 'bow',
        torch = w.item === 'torch';
      const drawing = bow && drawStarted !== null && !blocked;
      if (drawGauge.hidden === drawing) drawGauge.hidden = !drawing;
      if (drawing) {
        const progress = Math.floor(draw * 100);
        if (drawGauge.value !== progress) {
          drawGauge.value = progress;
          drawGauge.classList.toggle('full', progress === 100);
        }
      }
      const ready = torch ? 0 : (bow ? readiness : stroke.alignment) * (1 - reload);
      if (!torch) {
        w.runeCharge = Math.min(
          1,
          0.1 +
            (wandMotion?.seat ?? 0) * reload * 0.8 +
            completionGlow +
            flashTime * 7 +
            (bow ? 0.9 * draw : 0.35 * Math.max(0, stroke.lift)),
        );
        if (bow)
          w.arcane.update({
            charge: w.runeCharge,
            draw,
            drawing,
            clock,
            nocked: w.preparation?.nocked || bowMotion?.seated,
            bowSpan: thirdPerson && bowSpan !== undefined ? bowSpan / w.rig.scaling.x : undefined,
            release: bowRelease,
          });
        else
          w.arcane.update({ charge: w.runeCharge, motion: wandMotion, complete: completionGlow });
        w.flash.position.copyFrom(w.tip);
        w.muzzle.position.copyFrom(w.tip);
        w.muzzle.position.z += 0.02;
      }
      const grips = w.arcane.grips(),
        pivot = bow ? grips.support : grips.trigger;
      if (thirdPerson) {
        w.rig.position.copyFrom(pivot).scaleInPlace(-w.rig.scaling.x);
        w.rig.rotation.set(0, 0, 0);
      } else {
        // Keep the grip on screen on tall viewports and give the casting line a real pivot.
        const aspect = scene.getEngine().getAspectRatio(camera);
        const spread = Math.min(1, aspect / 1.5);
        const hand = torch
          ? new Vector3(0.32 * spread, -0.32 - 0.22 * lowered + bob, 0.66)
          : new Vector3(
              (bow ? 0.23 - 0.055 * ready : 0.27 + 0.085 * stroke.sweep) * spread,
              -0.2 -
                0.045 * (1 - readiness) -
                0.22 * lowered -
                0.035 * reload +
                bob +
                (bow ? 0.12 * ready : 0.055 * stroke.lift),
              bow ? 0.7 : 0.51,
            );
        const carry = torch
          ? new Vector3(0.17, 0.91, 0.36)
          : bow
            ? new Vector3(-0.36 * spread, -0.32, 0.88)
            : new Vector3(
                -0.24 + 0.65 * stroke.sweep,
                0.9 + 0.18 * stroke.lift,
                0.36 + 0.16 * readiness,
              );
        if (motion) {
          Vector3.LerpToRef(
            hand,
            new Vector3((bow ? 0.16 : 0.19) * spread, bow ? -0.045 : -0.19, bow ? 0.78 : 0.67),
            reload,
            hand,
          );
          Vector3.LerpToRef(
            carry,
            bow ? new Vector3(-0.45 * spread, 0.12, 0.88) : new Vector3(-0.72, 0.61, 0.33),
            reload,
            carry,
          );
        }
        carry.normalize();
        let axis = carry;
        if (ready > 0.001) {
          const target = Vector3.TransformCoordinates(reticlePoint(), camera.getViewMatrix(true));
          target.x *= firstPersonRig.scaling.x;
          // Draw the grip in as the reticle nears a wall. At touching distance
          // the shaft faces forward while the eye-to-tip obstruction takes effect.
          hand.z = Math.min(hand.z, Math.max(0.11, target.z - 0.55));
          const sight =
            target.z > hand.z + 0.03 ? target.subtract(hand).normalize() : Vector3.Forward();
          axis = Vector3.Lerp(carry, sight, ready).normalize();
        }
        const roll = bow
          ? 0.48 - 0.3 * ready - 0.88 * reload + (bowRelease?.back ?? 0)
          : -0.12 - 0.4 * stroke.sweep + 0.36 * reload;
        w.rig.rotation.set(-Math.asin(axis.y), Math.atan2(axis.x, axis.z), roll);
        const basis = Matrix.RotationYawPitchRoll(
          w.rig.rotation.y,
          w.rig.rotation.x,
          w.rig.rotation.z,
        );
        w.rig.position.copyFrom(
          hand.subtract(Vector3.TransformNormal(bow ? w.arcane.rest : pivot, basis)),
        );
        let viewScale = 1;
        if (torch) {
          camera.getViewMatrix(true);
          Vector3.TransformNormalToRef(w.tip, basis, flameOffset);
          flameOffset.addInPlace(w.rig.position);
          Vector3.TransformNormalToRef(
            flameOffset,
            firstPersonRig.computeWorldMatrix(true),
            flameOffset,
          );
          const fraction = sweepView(
            camera.position,
            flameOffset,
            torchNearPlane + 0.008,
            torchFlameRadius,
          );
          const previous = w.rig.scaling.x;
          viewScale = Math.max(0.001, Math.min(fraction, previous + dt * 4));
          // Retract the complete viewmodel around the eye so the light stays in
          // the flame while its projected shape and the hand grip stay aligned.
          w.rig.position.scaleInPlace(viewScale);
          w.rig.scaling.setAll(viewScale);
        }
        w.viewHands[0].position.copyFrom(grips.trigger).addInPlaceFromFloats(0.018, -0.018, 0);
        if (bow)
          w.viewHands[1].position.copyFrom(grips.support).addInPlaceFromFloats(-0.018, -0.018, 0);
        const free = w.viewHands[bow ? 0 : 1];
        const letGo = bowRelease?.open ?? 0;
        if (bowRelease) free.position.addInPlaceFromFloats(bowRelease.side, 0, -bowRelease.back);
        if (bow && bowMotion) {
          const inverse = Matrix.Transpose(basis);
          const behind = new Vector3(
            0.37 * spread,
            0.1 + 0.2 * bowMotion.withdraw,
            -0.18 + 0.12 * bowMotion.withdraw,
          );
          const reach = Vector3.TransformNormal(behind.subtract(w.rig.position), inverse);
          const transfer = Vector3.Lerp(reach, grips.trigger, bowMotion.carry);
          Vector3.LerpToRef(free.position, transfer, bowMotion.touch, free.position);
          bowMotion.grasp = free.position;
          bowMotion.looseDirection = Vector3.TransformNormal(Vector3.DownReadOnly, inverse);
        } else if (wandMotion) {
          const rest = Vector3.TransformNormal(
            new Vector3(-0.36 * spread, -0.55, 0.26).subtract(w.rig.position),
            Matrix.Transpose(basis),
          );
          Vector3.LerpToRef(rest, wandMotion.freeHand, wandMotion.touch, free.position);
        }
        free.rotation.z = bow
          ? -0.54 * (motion?.touch ?? 0) - 0.36 * letGo
          : -0.1 + 0.76 * (motion?.touch ?? 0);
        for (const [i, finger] of w.sleeves[bow ? 0 : 1]!.fingers.entries()) {
          const side = bow ? 1 : -1,
            open = bow ? letGo : (wandMotion?.light ?? 0);
          finger.rotation.z = side * (1.14 - 0.92 * open + i * 0.065 * open);
          finger.rotation.x = 0.32 * letGo;
          finger.position.y = 0.019 - i * 0.017 + 0.027 * open;
        }
        // Elbows stay below the player's shoulders as the tool rotates in the wrist.
        for (const { palm, sleeve, cuff, side } of w.sleeves) {
          const visible = bow || side > 0 || (motion?.touch ?? 0) > 0.001;
          palm.setEnabled(visible);
          sleeve.setEnabled(visible);
          cuff.setEnabled(visible);
          if (!visible) continue;
          const wrist = w.rig.position.add(
            Vector3.TransformNormal(palm.position.scale(viewScale), basis),
          );
          const elbowX = bow && side < 0 ? -0.19 : side * 0.37;
          const elbow = new Vector3(elbowX * spread, -0.47, 0.09).scaleInPlace(viewScale);
          const towardElbow = elbow.subtract(wrist);
          const span = towardElbow.length();
          towardElbow.normalize();
          sleeve.position
            .copyFrom(wrist)
            .addInPlace(towardElbow.scale((span + 0.055 * viewScale) * 0.5));
          sleeve.scaling.set(viewScale, span - 0.055 * viewScale, viewScale);
          cuff.position.copyFrom(wrist).addInPlace(towardElbow.scale(0.048 * viewScale));
          cuff.scaling.setAll(viewScale);
          Quaternion.FromUnitVectorsToRef(
            Vector3.DownReadOnly,
            towardElbow,
            sleeve.rotationQuaternion!,
          );
          cuff.rotationQuaternion!.copyFrom(sleeve.rotationQuaternion!);
        }
      }
      if (bow) w.arcane.placeLooseArrow(bowMotion);
      if (torch)
        w.arcane.update({
          lit: torchLit && equip === 0,
          equipped: true,
          clock,
          viewScale: thirdPerson ? 1 : w.rig.scaling.x,
        });
      if (!blocked)
        while (pendingShots.length) {
          const shot = pendingShots.shift()!;
          shot.weapon.rig.computeWorldMatrix(true);
          onShot({
            id: shot.weapon.id,
            bowPower: shot.bowPower,
            arrowModel: shot.weapon.arcane.arrowModel,
            arrowLength: shot.weapon.arcane.arrowLength,
            origin:
              shot.weapon === w
                ? Vector3.TransformCoordinates(w.tip, w.rig.getWorldMatrix())
                : shot.origin,
          });
        }
      if (!torch) {
        const releaseGlow = flashTime / 0.065;
        const tracing = !bow && awaitingRelease;
        w.flash.setEnabled(!blocked && (flashTime > 0 || tracing));
        if (bow) {
          w.flash.scaling.setAll((0.38 + 0.86 * (1 - releaseGlow)) * (0.67 + 0.65 * releasedDraw));
          w.flash.visibility = releaseGlow;
        } else {
          w.flash.rotation.z =
            strokeDirection * (tracing ? stroke.sweep * 0.9 : 1.15 - releaseGlow);
          w.flash.scaling.setAll(
            tracing ? 0.25 + 0.56 * Math.abs(stroke.sweep) : 0.72 + 0.32 * (1 - releaseGlow),
          );
          w.flash.visibility = tracing ? 0.65 : releaseGlow;
        }
        w.muzzle.intensity = blocked ? 0 : releaseGlow * 2.6;
      }
      crosshair.classList.toggle('firing', !blocked && flashTime > 0);
      const gear = supplies?.gear(selected);
      const equippedTitle =
        (gear?.id ? gearTitle(gear.id) : undefined) ?? gear?.title ?? WEAPON_TYPES[w.item].title;
      if (title.textContent !== equippedTitle) {
        title.textContent = equippedTitle;
        for (const [index, slot] of slots.entries())
          slot.setAttribute('aria-pressed', String(index === selected));
      }
      for (const [index, slot] of slots.entries())
        slot.disabled = Boolean(supplies && !supplies.equipped(index));
      const readout = w.hud(stock(w), {
        equipping: equip > 0,
        preparing: w.preparation?.timer.active,
        nocked: w.preparation?.nocked,
        releasing: !!bowRelease,
        phase: motion?.phase,
        drawing,
        draw,
        lit: torchLit,
      });
      visible(ammo, readout.count !== undefined);
      visible(ammoLabel, !!readout.label);
      text(ammoLabel, readout.label);
      visible(ammoUnit, !!readout.unit);
      text(ammoUnit, readout.unit);
      visible(ammoTotal, readout.limit !== undefined);
      text(ammoCapacity, readout.limit === undefined ? '' : String(readout.limit));
      visible(ammoDetail, !!readout.detail);
      text(ammoDetail, readout.detail);
      text(ammoCurrent, readout.count);
      text(weaponState, readout.status);
    },
    snapshot() {
      const w = weapons[selected]!,
        grips = w.arcane?.grips();
      const motion = bowMotion ?? wandMotion;
      const world = w.rig.computeWorldMatrix(true);
      const dominantHand = firstPersonRig.scaling.x < 0 ? 'left' : 'right';
      const otherHand = dominantHand === 'left' ? 'right' : 'left';
      const handContacts = grips
        ? {
            [dominantHand]: Vector3.TransformCoordinates(grips.trigger, world).asArray(),
            [otherHand]: Vector3.TransformCoordinates(grips.support, world).asArray(),
          }
        : null;
      const bow = w.item === 'bow',
        progress = w.preparation?.timer.progress ?? 0;
      const charging = !bow && w.preparation?.timer.active;
      const recharge = {
        phase: bow ? null : (motion?.phase ?? null),
        light: wandMotion?.light ?? 0,
        completionGlow,
        ...(!bow && wandMotion
          ? { markWorld: Vector3.TransformCoordinates(wandMotion.freeHand, world).asArray() }
          : {}),
      };

      const nock = bow
        ? {
            ready: w.preparation!.nocked,
            phase: motion?.phase ?? null,
            progress,
            handWorld: bowMotion?.grasp
              ? Vector3.TransformCoordinates(bowMotion.grasp, world).asArray()
              : null,
          }
        : null;
      const bowPose = bow
        ? {
            string: Vector3.TransformCoordinates(w.arcane.stringCenter, world).asArray(),
            drawingHand: thirdPerson
              ? null
              : w.viewHands[0].computeWorldMatrix(true).getTranslation().asArray(),
            forward: Vector3.TransformNormal(Vector3.Forward(), world).normalize().asArray(),
            releaseAge: bowRelease ? shotAge : null,
          }
        : null;
      const muzzle = w.flash
        ? {
            world: Vector3.TransformCoordinates(w.tip, world).asArray(),
            tip: w.tip.asArray(),
            flash: w.flash.position.asArray(),
            group: w.flash.renderingGroupId,
            enabled: w.flash.isEnabled(),
            intensity: w.muzzle.intensity,
          }
        : null;
      return {
        recharge,
        nock,
        bowPose,
        handContacts,
        dominantHand,
        drawing: drawStarted !== null,
        draw: bow ? draw : 0,
        stroke: { ...stroke },
        id: w.id,
        title: WEAPON_TYPES[w.item].title,
        ammo: w.ammo ?? null,
        reserve: supplies?.ammo(w.item)?.reserve ?? null,
        torchLit,
        state:
          equip > 0
            ? 'equipping'
            : charging
              ? 'reloading'
              : flashTime > 0
                ? 'firing'
                : bow && !nock?.ready
                  ? 'nocking'
                  : 'ready',
        perspective: thirdPerson ? 'third' : 'first',
        held,
        recoil: kick,
        reloadProgress: charging ? progress : 0,
        modelPosition: w.rig.position.asArray(),
        muzzle,
        effectLight: w.item === 'torch' ? w.arcane.lightState() : null,
        arcane: { form: w.arcane.form, charge: w.runeCharge },
        audio: sound.snapshot(),
        aimed,
        readiness,
        model: w.arcane.file,
        models: weapons.map((w) => ({ id: w.id, ammo: w.ammo ?? null, model: w.arcane.file })),
        ...stats,
      };
    },
  };
  if (supplies) api.reset();
  return api;
}
