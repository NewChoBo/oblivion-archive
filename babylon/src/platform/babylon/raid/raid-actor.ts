import { appearance } from './hero-appearance.ts';
import { equipRaidGear } from './raid-equipment.ts';
import {
  LoadAssetContainerAsync,
  MeshBuilder,
  type StandardMaterial,
  TransformNode,
  type Scene,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { raidColors, raidMaterial } from './raid-material.ts';
import { ModelMotion } from '../actors/model-motion.ts';
import { raidActionTicks, raidActiveAction, raidFacing } from '../../../game/raid/raid-facing.ts';
import {
  HEROES,
  RAID_HZ,
  raidRespawnTicks,
  RAID_LEAP_TICKS,
  raidRunnerHeight,
  type RaidAction,
  type RaidHero,
  type RaidPoint,
  type RaidRunner,
} from '../../../game/raid/raid-match.ts';

const clips = ['pulse', 'bolt', 'field', 'fury'] as const;

async function loadModel(scene: Scene, hero: RaidHero, rig: TransformNode) {
  const model = await LoadAssetContainerAsync('./assets/raid/' + hero + '.glb', scene, {
    pluginOptions: { gltf: { animationStartMode: 0 } },
  });
  try {
    if (scene.isDisposed) throw new Error('Raid scene disposed');
    const motion = new ModelMotion(model.animationGroups, [
      'run',
      'walk',
      'jump',
      'fall',
      'basic',
      ...clips,
    ]);
    model.addAllToScene();
    model.meshes[0]!.parent = rig;
    const cape = model.meshes.find((m) => m.name.endsWith('_Cape') || m.name.endsWith('_Cloak'));
    if (cape) cape.material = raidMaterial(scene, hero + ' mantle', appearance[hero].cape, 0.12);
    equipRaidGear(scene, hero, model.transformNodes, cape ?? rig);
    for (const mesh of rig.getChildMeshes()) mesh.isPickable = false;
    return motion;
  } catch (error) {
    model.dispose();
    throw error;
  }
}

export function createRaidActor(
  scene: Scene,
  hero: RaidHero,
  blue: StandardMaterial,
  red: StandardMaterial,
  shadowMat: StandardMaterial,
) {
  const art = appearance[hero];
  const root = new TransformNode(hero + ' runner', scene);
  const rig = new TransformNode(hero + ' facing', scene);
  rig.parent = root;
  rig.scaling.setAll(art.scale ?? 0.8);
  // The moving hand, cape and weapon do not change the touch target's size.
  const hit = MeshBuilder.CreateCapsule(
    hero + ' body target',
    { height: 1.86, radius: 0.42 },
    scene,
  );
  hit.parent = root;
  hit.position.y = 0.93;
  let motion: ModelMotion | undefined;
  let greatsword: TransformNode | undefined;
  let loading = false;
  // The team-colored body remains visible and pickable until its animated model is ready.
  function prepareModel() {
    if (motion || loading) return;
    loading = true;
    return loadModel(scene, hero, rig).then(
      (loaded) => {
        motion = loaded;
        if (art.empoweredMesh)
          greatsword = rig.getChildMeshes().find((mesh) => mesh.name === art.empoweredMesh);
        hit.visibility = 0;
      },
      (error: unknown) => {
        loading = false;
        if (!scene.isDisposed) console.warn('Could not load raid model', hero, error);
      },
    );
  }
  const ring = MeshBuilder.CreateTorus(
    hero + ' team marking',
    { diameter: 1.18, thickness: 0.07, tessellation: 28 },
    scene,
  );
  const spinTrail = art.spinClip
    ? MeshBuilder.CreateTorus(
        hero + ' moving sweep',
        { diameter: HEROES[hero].radius * 2, thickness: 0.055, tessellation: 48 },
        scene,
      )
    : null;
  if (spinTrail) {
    spinTrail.parent = root;
    spinTrail.position.y = 0.25;
    spinTrail.material = raidMaterial(scene, hero + ' sweep light', raidColors[hero], 0.8);
    spinTrail.isPickable = false;
    spinTrail.setEnabled(false);
  }
  const shadow = MeshBuilder.CreateDisc(
    hero + ' foot contact',
    { radius: 0.5, tessellation: 18 },
    scene,
  );
  shadow.rotation.x = Math.PI / 2;
  shadow.material = shadowMat;
  const bar = MeshBuilder.CreateBox(
    hero + ' health backing',
    { width: 0.82, height: 0.09, depth: 0.05 },
    scene,
  );
  bar.parent = root;
  bar.position.y = art.barHeight ?? 2.2;
  bar.material = raidMaterial(scene, hero + ' health surround', '#303341');
  const life = MeshBuilder.CreateBox(
    hero + ' health',
    { width: 0.78, height: 0.065, depth: 0.012 },
    scene,
  );
  life.parent = bar;
  life.position.z = -0.034;
  const ward = MeshBuilder.CreateSphere(hero + ' ward', { diameter: 1.5, segments: 14 }, scene);
  ward.parent = root;
  ward.position.y = 0.99;
  ward.scaling.y = 1.39;
  const shield = raidMaterial(scene, hero + ' ward glow', raidColors.jade, 0.8);
  shield.alpha = 0.19;
  ward.material = shield;
  const mark = MeshBuilder.CreateTorus(
    hero + ' tracking mark',
    { diameter: 0.36, thickness: 0.05, tessellation: 4 },
    scene,
  );
  mark.parent = bar;
  mark.position.y = 0.24;
  mark.rotation.x = Math.PI / 2;
  mark.material = raidMaterial(scene, hero + ' tracking glint', raidColors.longshot, 0.8);
  for (const part of [shadow, ring, life, bar, ward, mark]) part.isPickable = false;
  function hide() {
    root.setEnabled(false);
    shadow.setEnabled(false);
    ring.setEnabled(false);
  }
  hide();
  function draw(
    r: RaidRunner,
    position: RaidPoint,
    actions: readonly RaidAction[],
    tick: number,
    subtick: number,
    dt: number,
    localTeam = 0,
  ) {
    const now = tick + subtick;
    spinTrail?.setEnabled(r.spinTicks > 0 && !r.respawn);
    const fallAge = raidRespawnTicks(r.deaths) - r.respawn;
    root.setEnabled(!r.respawn || fallAge < 18);
    hit.setEnabled(!r.respawn);
    hit.material = life.material = ring.material = r.team === localTeam ? blue : red;
    ring.setEnabled(!r.respawn);
    shadow.setEnabled(root.isEnabled());
    if (!root.isEnabled()) return;
    bar.setEnabled(!r.respawn);
    mark.setEnabled(r.marked > 0);
    ward.setEnabled(!r.respawn && (r.shield > 0 || (r.heroView.guardUntil ?? 0) > tick));
    const { x, z } = position;
    root.position.set(x, raidRunnerHeight(r, subtick), z);
    ring.position.set(x, 0.055, z);
    shadow.position.set(x, 0.032, z);
    life.scaling.x = r.hp / HEROES[hero].hp;
    life.position.x = -0.39 * (1 - life.scaling.x);
    rig.rotation.z = r.staggered ? 0.26 * Math.min(1, r.staggered / 4) : 0;
    if (!motion) return;
    if (greatsword) greatsword.scaling.setAll((r.heroView.empoweredUntil ?? 0) > tick ? 1.45 : 1);
    if (r.respawn) {
      motion.seek('fall', (fallAge + subtick) / 17, dt);
      return;
    }
    if (r.staggered && !r.leap && !r.jumping) {
      motion.seek('fall', 0.13, dt);
      return;
    }
    const active = raidActiveAction(actions, r.slot, now);
    let facing = raidFacing(r, active);
    if (r.leap) {
      const { elapsed } = r.leap;
      const progress = (elapsed + subtick) / RAID_LEAP_TICKS;
      if (progress < 0.5) motion.seek('jump', progress * 2, dt);
      else motion.seek('bolt', progress - 0.5, dt);
    } else if (art.dashClip && r.dash) {
      motion.seek(art.dashClip, (r.dash.elapsed + subtick) / r.dash.ticks, dt);
    } else if (r.heroView.rootedTicks && r.heroView.rootDuration) {
      motion.seek('fury', 1 - (r.heroView.rootedTicks - subtick) / r.heroView.rootDuration, dt);
    } else if (r.spinTicks) {
      motion.seek(art.spinClip ?? 'fury', ((75 - r.spinTicks + subtick) % 15) / 15, dt);
    } else if (active?.phase === 'ground' && active.skill === 0 && art.landingChop) {
      // Finish the overhead chop from its contact pose, facing the landing direction.
      facing = rig.rotation.y;
      motion.seek('bolt', 0.5 + (0.5 * (now - active.tick)) / raidActionTicks(active), dt);
    } else if (active) {
      motion.seek(
        active.skill === 'basic' ? 'basic' : clips[active.skill],
        (now - active.tick) / raidActionTicks(active),
        dt,
      );
    } else if (r.jumping) motion.loop('jump', now / RAID_HZ, dt);
    else
      motion.loop(r.slowed || r.brake >= 0.5 ? 'walk' : 'run', now / RAID_HZ + r.slot * 0.13, dt);
    const turn = facing - rig.rotation.y;
    rig.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 20);
  }
  return { draw, hide, prepareModel, hit };
}
