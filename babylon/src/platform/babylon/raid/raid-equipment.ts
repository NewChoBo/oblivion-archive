import { MeshBuilder, type Scene, type TransformNode } from '@babylonjs/core';
import type { RaidHero } from '../../../game/raid/heroes/hero-id.ts';
import { raidMaterial, raidColors } from './raid-material.ts';
import { appearance } from './hero-appearance.ts';
function equipHand(
  scene: Scene,
  hero: RaidHero,
  gear: 'warhammer' | 'staff',
  socket: TransformNode,
) {
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
  if (gear === 'warhammer') {
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

export function equipRaidGear(
  scene: Scene,
  hero: RaidHero,
  nodes: readonly TransformNode[],
  back: TransformNode,
) {
  const gear = appearance[hero].equipment;
  if (gear === 'rapier' || gear === 'saber') {
    const rapier = gear === 'rapier';
    const socket = nodes.find((n) => n.name === 'handslot.r')!;
    const steel = raidMaterial(scene, hero + ' blade steel', '#dce5ec', 0.28);
    const blade = MeshBuilder.CreateCylinder(
      hero + ' blade',
      {
        height: 1.35,
        diameterTop: 0.018,
        diameterBottom: rapier ? 0.072 : 0.18,
        tessellation: 4,
      },
      scene,
    );
    blade.parent = socket;
    blade.position.y = 0.79;
    blade.material = steel;
    if (!rapier) {
      blade.scaling.z = 0.34;
      blade.rotation.z = -0.065;
    }
    const guard = MeshBuilder.CreateSphere(
      hero + ' guard',
      { diameter: rapier ? 0.31 : 0.25, segments: 10 },
      scene,
    );
    guard.parent = socket;
    guard.position.y = 0.12;
    guard.scaling.y = rapier ? 0.54 : 0.2;
    guard.material = raidMaterial(scene, hero + ' guard metal', rapier ? '#d5a645' : '#515267');
  }
  if (gear === 'quiver') {
    const quiver = MeshBuilder.CreateCylinder(
      'leather bolt case',
      { height: 0.92, diameterTop: 0.28, diameterBottom: 0.19, tessellation: 8 },
      scene,
    );
    quiver.parent = back;
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
  if (gear === 'staff' || gear === 'warhammer')
    equipHand(
      scene,
      hero,
      gear,
      nodes.find((node) => node.name === 'handslot.r')!,
    );
  if (gear === 'shieldBlade' || gear === 'crystal') {
    const socket = nodes.find((n) => n.name === 'handslot.r')!;
    const weapon =
      gear === 'shieldBlade'
        ? MeshBuilder.CreateBox('tomb blade', { width: 0.25, height: 1.4, depth: 0.09 }, scene)
        : MeshBuilder.CreatePolyhedron('rime crystal', { type: 1, size: 0.29 }, scene);
    weapon.parent = socket;
    weapon.position.y = 0.52;
    weapon.material = raidMaterial(scene, hero + ' relic', raidColors[hero], 0.4);
    if (gear === 'shieldBlade') {
      const buckler = MeshBuilder.CreateCylinder(
        'tomb shield',
        { height: 0.13, diameter: 0.92, tessellation: 8 },
        scene,
      );
      buckler.parent = nodes.find((n) => n.name === 'handslot.l')!;
      buckler.rotation.z = Math.PI / 2;
      buckler.material = raidMaterial(scene, 'tomb shield bronze', '#b5996d');
    }
  }
}
