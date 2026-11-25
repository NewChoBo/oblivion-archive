import type { FirearmPose } from '../equipment/equipment-pose.ts';
import { createArenaGun } from './arena-gun.ts';
import { MeshBuilder, PointLight, Ray, TransformNode, Vector3 } from '@babylonjs/core';
import { ARENA_PISTOL, ARENA_RIFLE } from '../../../content/catalogs/firearms.ts';
import type { ArenaArmory } from '../../../game/experiences/armory.ts';
import type { AbstractMesh, Camera, Scene } from '@babylonjs/core';
import { createWeaponAudio } from '../../browser/weapon-audio.ts';

interface FirearmOptions {
  armory: Pick<
    ArenaArmory,
    'shoot' | 'reloading' | 'select' | 'automatic' | 'reload' | 'update' | 'snapshot'
  >;
  eye(): Vector3;
  anchor: TransformNode;
  hit(mesh: AbstractMesh, damage: number): void;
  canFire(): boolean;
  readHud(stock: ReturnType<ArenaArmory['snapshot']>): void;
}

export function createArenaFirearms(
  scene: Scene,
  camera: Camera,
  { armory, eye, anchor, hit, canFire, readHud }: FirearmOptions,
) {
  const sound = createWeaponAudio({ onPlay() {}, onError() {} });
  const first = new TransformNode('first-person arena equipment', scene);
  first.parent = camera;
  const models = new Map<string, ReturnType<typeof createArenaGun>>();
  const localMuzzle = new Vector3();
  let third = false,
    held = false,
    aiming = false,
    muted = false,
    kick = 0,
    flash = 0,
    enemyFlash = 0;
  const light = new PointLight('arena muzzle flash', Vector3.Zero(), scene);
  light.range = 2.3;
  light.diffuse.set(1, 0.62, 0.24);
  light.intensity = 0;
  const trace = MeshBuilder.CreateLines(
    'player tracer',
    { points: [Vector3.Zero(), Vector3.Forward()], updatable: true },
    scene,
  );
  const enemyTrace = MeshBuilder.CreateLines(
    'enemy tracer',
    { points: [Vector3.Zero(), Vector3.Forward()], updatable: true },
    scene,
  );
  enemyTrace.color.set(1, 0.25, 0.12);
  enemyTrace.isPickable = false;
  enemyTrace.setEnabled(false);
  trace.color.set(1, 0.71, 0.35);
  trace.isPickable = false;
  trace.setEnabled(false);
  for (const definition of [ARENA_PISTOL, ARENA_RIFLE]) {
    const model = createArenaGun(scene, definition.id, definition.automatic, 2);
    model.root.parent = first;
    model.root.setEnabled(!definition.automatic);
    models.set(definition.id, model);
  }
  const viewLight = new PointLight('arena viewmodel fill', new Vector3(-0.27, 0.3, 0.2), scene);
  viewLight.parent = first;
  viewLight.intensity = 0.85;
  viewLight.range = 2;
  viewLight.includedOnlyMeshes = [...models.values()].flatMap(({ root }) => root.getChildMeshes());

  function shot() {
    if (!canFire()) return;
    const definition = armory.shoot();
    if (!definition) return;
    const valid = (mesh: AbstractMesh) =>
      mesh.isPickable &&
      mesh.isVisible &&
      mesh.isEnabled() &&
      !mesh.metadata?.playerVisual &&
      !mesh.metadata?.toolVisual;
    // The camera selects the aim point. Cover along the eye-to-target ray determines the hit.
    const ray = camera.getForwardRay(45);
    const focus =
      scene.pickWithRay(ray, valid)?.pickedPoint ?? ray.origin.add(ray.direction.scale(ray.length));
    const origin = eye(),
      delta = focus.subtract(origin),
      length = delta.length();
    if (length > 0.01) {
      const impact = scene.pickWithRay(
        new Ray(origin, delta.scale(1 / length), length + 0.1),
        valid,
      );
      const end = impact?.pickedPoint ?? focus;
      const { root, muzzle } = models.get(definition.id)!;
      const muzzlePoint = Vector3.TransformCoordinates(
        localMuzzle.set(0, 0.062, muzzle),
        root.computeWorldMatrix(true),
      );
      if (impact?.pickedMesh) hit(impact.pickedMesh, definition.damage);
      MeshBuilder.CreateLines(trace.name, { instance: trace, points: [muzzlePoint, end] }, scene);
      light.position.copyFrom(muzzlePoint);
      trace.setEnabled(true);
      light.intensity = 0.85;
      flash = 0.055;
    }
    kick = Math.min(0.11, kick + 0.042);
    sound.firearm(definition.automatic);
    if (armory.reloading) sound.firearmReload();
  }
  function cancelHold() {
    held = false;
    aiming = false;
  }
  function reset() {
    cancelHold();
    kick = 0;
    flash = 0;
    enemyFlash = 0;
    trace.setEnabled(false);
    light.intensity = 0;
    enemyTrace.setEnabled(false);
  }
  return {
    syncEquipment() {},
    select(id: string) {
      if (armory.select(id)) reset();
    },
    setDominantHand(hand: string) {
      first.scaling.x = hand === 'left' ? -1 : 1;
    },
    setPerspective(mode: string) {
      third = mode === 'third';
      viewLight.intensity = third ? 0 : 0.85;
      for (const { root, meshes } of models.values()) {
        root.parent = third ? anchor : first;
        for (const mesh of meshes) mesh.renderingGroupId = third ? 0 : 2;
      }
    },
    enemyFire(origin: Vector3, end: Vector3) {
      MeshBuilder.CreateLines(
        enemyTrace.name,
        { instance: enemyTrace, points: [origin, end] },
        scene,
      );
      enemyTrace.setEnabled(true);
      enemyFlash = 0.1;
    },
    characterPose(): FirearmPose {
      const rifle = armory.automatic;
      return { firearm: true, rifle, stroke: { alignment: 1 }, ready: 1, castAge: Infinity };
    },
    aim(value: boolean) {
      aiming = value;
    },
    hold() {
      if (!held) {
        held = true;
        shot();
      }
    },
    release() {
      held = false;
    },
    cancelHold,
    reload() {
      if (armory.reload()) sound.firearmReload();
    },
    reset,
    tick(dt: number, _moving: boolean, paused: boolean) {
      if (!paused) {
        armory.update(dt);
        if (held && armory.automatic) shot();
      }
      const stock = armory.snapshot();
      const { id, reloadLeft } = stock;
      if (!paused) {
        kick = Math.max(0, kick - dt * 0.38);
        flash = Math.max(0, flash - dt);
        enemyFlash = Math.max(0, enemyFlash - dt);
      }
      if (!enemyFlash) enemyTrace.setEnabled(false);
      if (!flash) {
        trace.setEnabled(false);
        light.intensity = 0;
      }
      for (const [weapon, { root }] of models) {
        root.setEnabled(weapon === id);
        root.position.set(
          third ? 0 : aiming ? 0.075 : 0.285,
          third ? 0 : aiming ? -0.18 : -0.27,
          third ? -kick : 0.42 - kick,
        );
        root.rotation.x = (reloadLeft > 0 ? 0.23 : 0) - kick * 0.9;
      }
      readHud(stock);
    },
    pauseAudio() {
      reset();
      sound.pause();
    },
    prepareAudio: sound.prepare,
    unlock() {
      sound.unlock();
    },
    toggleMute() {
      muted = !muted;
      sound.setMuted(muted);
      return muted;
    },
    audioStream: () => sound.stream(),
    impactSound() {},
    setShadowQuality() {},
    async prepareEquipment(_prepareAll: () => Promise<void>, drawEntry: () => Promise<void>) {
      const saved = [...models.values()].map(({ root }) => [root, root.isEnabled(false)] as const);
      try {
        for (const [root] of saved) root.setEnabled(true);
        await drawEntry();
      } finally {
        for (const [root, enabled] of saved) root.setEnabled(enabled);
      }
    },
    voidRumble() {},
    snapshot: () => armory.snapshot(),
  };
}
