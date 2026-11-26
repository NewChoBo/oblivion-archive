import {
  Color3,
  ImportMeshAsync,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  type Scene,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { ModelMotion } from '../actors/model-motion.ts';
import {
  HEROES,
  RAID_HZ,
  RESPAWN_TICKS,
  jumpHeight,
  type RaidAction,
  type RaidHero,
  type RaidPoint,
  type RaidRunner,
} from '../../../game/raid/raid-match.ts';

export const raidColors = {
  hammer: '#ffac51',
  abyss: '#b685ff',
  longshot: '#ffdf79',
  jade: '#6affc1',
};
const capes = { hammer: '#a64028', abyss: '#693bad', longshot: '#a57629', jade: '#168768' };
const clips = ['pulse', 'bolt', 'field', 'fury'] as const;
const duration = (a: RaidAction) => (a.skill === 'basic' ? 10 : a.skill === 3 ? 24 : 16);

function raidMaterial(scene: Scene, name: string, hex: string, glow = 0) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.specularColor = material.diffuseColor.scale(0.22);
  material.emissiveColor = material.diffuseColor.scale(glow);
  return material;
}

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

export async function loadRaidActor(
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
  const model = await ImportMeshAsync('./assets/raid/' + hero + '.glb', scene, {
    pluginOptions: { gltf: { animationStartMode: 0 } },
  });
  model.meshes[0]!.parent = rig;
  const cape = model.meshes.find((m) => m.name.endsWith('_Cape'))!;
  cape.material = raidMaterial(scene, hero + ' mantle', capes[hero], 0.12);
  if (hero === 'longshot') {
    const quiver = MeshBuilder.CreateCylinder(
      'leather bolt case',
      { height: 0.92, diameterTop: 0.28, diameterBottom: 0.19, tessellation: 8 },
      scene,
    );
    quiver.parent = cape;
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
  for (const mesh of rig.getChildMeshes()) mesh.isPickable = false;
  const motion = new ModelMotion(model.animationGroups, [
    'run',
    'walk',
    'jump',
    'fall',
    'basic',
    ...clips,
  ]);
  // The moving hand, cape and weapon do not change the touch target's size.
  const hit = MeshBuilder.CreateCapsule(
    hero + ' body target',
    { height: 1.86, radius: 0.42 },
    scene,
  );
  hit.parent = root;
  hit.position.y = 0.93;
  hit.visibility = 0;
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
  return (
    r: RaidRunner,
    position: RaidPoint,
    actions: readonly RaidAction[],
    tick: number,
    subtick: number,
    dt: number,
  ) => {
    const now = tick + subtick;
    const fallAge = RESPAWN_TICKS - r.respawn;
    root.setEnabled(!r.respawn || fallAge < 18);
    hit.setEnabled(!r.respawn);
    if (hit.metadata?.raidTarget !== r.slot) {
      hit.metadata = { raidTarget: r.slot };
      life.material = ring.material = r.team === 0 ? blue : red;
    }
    ring.setEnabled(!r.respawn);
    shadow.setEnabled(root.isEnabled());
    if (!root.isEnabled()) return;
    bar.setEnabled(!r.respawn);
    mark.setEnabled(r.marked > 0);
    ward.setEnabled(!r.respawn && r.shield > 0);
    const { x, z } = position;
    root.position.set(x, jumpHeight(Math.max(0, r.jumping - subtick)), z);
    ring.position.set(x, 0.055, z);
    shadow.position.set(x, 0.032, z);
    life.scaling.x = r.hp / HEROES[hero].hp;
    life.position.x = -0.39 * (1 - life.scaling.x);
    if (r.respawn) {
      motion.seek('fall', (fallAge + subtick) / 17, dt);
      return;
    }
    // Bots can use multiple slots in the same tick. Keep the strongest active cast readable.
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
    if (active) {
      if (active.skill !== 0 || hero === 'jade')
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
  };
}
