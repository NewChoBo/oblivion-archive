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
import {
  HEROES,
  RAID_HZ,
  RESPAWN_TICKS,
  RAID_LEAP_TICKS,
  raidRunnerHeight,
  type RaidAction,
  type RaidHero,
  type RaidPoint,
  type RaidRunner,
} from '../../../game/raid/raid-match.ts';

const capes = {
  hammer: '#a64028',
  abyss: '#693bad',
  longshot: '#a57629',
  jade: '#168768',
  rend: '#912f29',
  bastion: '#395878',
  rime: '#43829a',
};
const clips = ['pulse', 'bolt', 'field', 'fury'] as const;
const duration = (a: RaidAction) => (a.skill === 'basic' ? 10 : a.skill === 3 ? 24 : 16);

function equipHand(scene: Scene, hero: 'hammer' | 'jade', socket: TransformNode) {
  const iron = raidMaterial(scene, hero + ' weapon steel', '#4d566a');
  const trim = raidMaterial(scene, hero + ' weapon inlay', raidColors[hero], 0.5);
  const haft = MeshBuilder.CreateCylinder(
    hero + ' haft',
    { height: 1.54, diameter: 0.11, tessellation: 8 },
    scene,
  );
  haft.material = raidMaterial(scene, hero + ' weapon haft', '#684129');
  haft.parent = socket;
  haft.position.y = 0.25;
  if (hero === 'hammer') {
    const head = MeshBuilder.CreateBox(
      'warhammer head',
      { width: 0.93, height: 0.46, depth: 0.44 },
      scene,
    );
    head.parent = haft;
    head.position.y = 0.71;
    head.material = iron;
    for (const x of [-0.38, 0, 0.38]) {
      const band = MeshBuilder.CreateBox(
        'hammer bronze band',
        { width: 0.1, height: 0.49, depth: 0.47 },
        scene,
      );
      band.parent = head;
      band.position.x = x;
      band.material = trim;
    }
  } else {
    const bud = MeshBuilder.CreatePolyhedron('jade blossom', { type: 1, size: 0.24 }, scene);
    bud.parent = haft;
    bud.material = trim;
    bud.scaling.y = 1.45;
    bud.position.y = 0.99;
    for (const sign of [-1, 1]) {
      const leaf = MeshBuilder.CreatePolyhedron('bronze calyx', { type: 1, size: 0.16 }, scene);
      leaf.parent = haft;
      leaf.position.set(0.17 * sign, 0.82, 0);
      leaf.scaling.set(0.55, 1.6, 0.7);
      leaf.rotation.z = -0.5 * sign;
      leaf.material = iron;
    }
  }
}

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
    if (cape) cape.material = raidMaterial(scene, hero + ' mantle', capes[hero], 0.12);
    if (hero === 'longshot') {
      const quiver = MeshBuilder.CreateCylinder(
        'leather bolt case',
        { height: 0.92, diameterTop: 0.28, diameterBottom: 0.19, tessellation: 8 },
        scene,
      );
      quiver.parent = cape ?? rig;
      quiver.position.set(0, -0.49, -0.43);
      quiver.rotation.z = -0.48;
      quiver.material = raidMaterial(scene, 'quiver leather', '#69462f');
      const feathers = raidMaterial(scene, 'bolt fletching', '#e5e1bd');
      for (const x of [-0.08, 0, 0.08]) {
        const bolt = MeshBuilder.CreateCylinder(
          'fletched bolt',
          { height: 0.36, diameterTop: 0.075, diameterBottom: 0.024, tessellation: 4 },
          scene,
        );
        bolt.parent = quiver;
        bolt.position.set(x, 0.52 + x * 0.5, -0.04);
        bolt.material = feathers;
      }
    }
    if (hero === 'jade' || hero === 'hammer')
      equipHand(
        scene,
        hero,
        model.transformNodes.find((node) => node.name === 'handslot.r')!,
      );
    if (hero === 'bastion' || hero === 'rime') {
      const socket = model.transformNodes.find((n) => n.name === 'handslot.r')!;
      const weapon =
        hero === 'bastion'
          ? MeshBuilder.CreateBox('tomb blade', { width: 0.25, height: 1.4, depth: 0.09 }, scene)
          : MeshBuilder.CreatePolyhedron('rime crystal', { type: 1, size: 0.29 }, scene);
      weapon.parent = socket;
      weapon.position.y = 0.52;
      weapon.material = raidMaterial(scene, hero + ' relic', raidColors[hero], 0.4);
      if (hero === 'bastion') {
        const buckler = MeshBuilder.CreateCylinder(
          'tomb shield',
          { height: 0.13, diameter: 0.92, tessellation: 8 },
          scene,
        );
        buckler.parent = model.transformNodes.find((n) => n.name === 'handslot.l')!;
        buckler.rotation.z = Math.PI / 2;
        buckler.material = raidMaterial(scene, 'tomb shield bronze', '#b5996d');
      }
    }
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
  const root = new TransformNode(hero + ' runner', scene);
  const rig = new TransformNode(hero + ' facing', scene);
  rig.parent = root;
  rig.scaling.setAll(hero === 'hammer' ? 0.84 : hero === 'abyss' ? 0.73 : 0.8);
  // The moving hand, cape and weapon do not change the touch target's size.
  const hit = MeshBuilder.CreateCapsule(
    hero + ' body target',
    { height: 1.86, radius: 0.42 },
    scene,
  );
  hit.parent = root;
  hit.position.y = 0.93;
  let motion: ModelMotion | undefined;
  let loading = false;
  // The team-colored body remains visible and pickable until its animated model is ready.
  function prepareModel() {
    if (motion || loading) return;
    loading = true;
    void loadModel(scene, hero, rig).then(
      (loaded) => {
        motion = loaded;
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
  bar.position.y = hero === 'abyss' ? 2.48 : 2.2;
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
    const fallAge = RESPAWN_TICKS - r.respawn;
    root.setEnabled(!r.respawn || fallAge < 18);
    hit.setEnabled(!r.respawn);
    hit.material = life.material = ring.material = r.team === localTeam ? blue : red;
    ring.setEnabled(!r.respawn);
    shadow.setEnabled(root.isEnabled());
    if (!root.isEnabled()) return;
    bar.setEnabled(!r.respawn);
    mark.setEnabled(r.marked > 0);
    ward.setEnabled(!r.respawn && r.shield > 0);
    const { x, z } = position;
    root.position.set(x, raidRunnerHeight(r, subtick), z);
    ring.position.set(x, 0.055, z);
    shadow.position.set(x, 0.032, z);
    life.scaling.x = r.hp / HEROES[hero].hp;
    life.position.x = -0.39 * (1 - life.scaling.x);
    if (!motion) return;
    if (r.respawn) {
      motion.seek('fall', (fallAge + subtick) / 17, dt);
      return;
    }
    // Keep the strongest animation readable when recent attacks overlap.
    let active: RaidAction | undefined;
    for (const cue of actions) {
      if (cue.slot !== r.slot || now - cue.tick >= duration(cue)) continue;
      if (
        !active ||
        cue.skill === 3 ||
        (active.skill !== 3 && (active.skill === 'basic' || cue.skill !== 'basic'))
      )
        active = cue;
    }
    let facing = r.side * 0.25;
    if (r.leap) {
      const { from, to, elapsed } = r.leap;
      const progress = (elapsed + subtick) / RAID_LEAP_TICKS;
      facing = Math.atan2(to.x - from.x, to.z - from.z);
      if (progress < 0.5) motion.seek('jump', progress * 2, dt);
      else motion.seek('field', progress - 0.5, dt);
    } else if (active?.skill === 0 && hero === 'hammer') {
      // Finish the overhead chop from its contact pose, facing the landing direction.
      facing = rig.rotation.y;
      motion.seek('field', 0.5 + (0.5 * (now - active.tick)) / duration(active), dt);
    } else if (active) {
      if (active.skill !== 0 || hero === 'jade' || hero === 'longshot')
        facing = Math.atan2(active.to.x - active.from.x, active.to.z - active.from.z);
      motion.seek(
        active.skill === 'basic' ? 'basic' : clips[active.skill],
        (now - active.tick) / duration(active),
        dt,
      );
    } else if (r.jumping) motion.loop('jump', now / RAID_HZ, dt);
    else motion.loop(r.brake >= 0.5 ? 'walk' : 'run', now / RAID_HZ + r.slot * 0.13, dt);
    const turn = facing - rig.rotation.y;
    rig.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 20);
  }
  return { draw, hide, prepareModel, hit };
}
