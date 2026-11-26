import { MeshBuilder, type Scene } from '@babylonjs/core';
import { RAID_COUNTERS, type RaidCounter } from '../../../game/raid/raid-boss.ts';
import { raidMaterial } from './raid-material.ts';

/** Ground markings keep their collision dimensions throughout the warning and impact. */
export function createRaidCounterVisual(scene: Scene) {
  const paint = raidMaterial(scene, 'wagon strike zone', '#ff704b', 0.85);
  const fire = raidMaterial(scene, 'wagon counter flare', '#ffd477', 0.95);
  const strip = MeshBuilder.CreateGround('wagon strike strip', { width: 1, height: 1 }, scene);
  const disc = MeshBuilder.CreateDisc(
    'wagon mortar zone',
    { radius: RAID_COUNTERS.mortar.radius, tessellation: 48 },
    scene,
  );
  disc.rotation.x = Math.PI / 2;
  disc.material = strip.material = paint;
  const shell = MeshBuilder.CreateSphere(
    'descending mortar shell',
    { diameter: 0.54, segments: 8 },
    scene,
  );
  const crest = MeshBuilder.CreateBox(
    'wagon shockwave crest',
    { width: 2 * RAID_COUNTERS.wave.halfWidth, height: 0.45, depth: 0.24 },
    scene,
  );
  shell.material = crest.material = fire;
  for (const mesh of [strip, disc, shell, crest]) {
    mesh.isPickable = false;
    mesh.setEnabled(false);
  }
  return (counter: RaidCounter | null, subtick: number) => {
    const mortar = counter?.kind === 'mortar';
    const impact = counter?.phase === 'impact';
    disc.setEnabled(mortar);
    strip.setEnabled(!!counter && !mortar);
    shell.setEnabled(mortar && !impact);
    crest.setEnabled(counter?.kind === 'wave' && impact);
    if (!counter) return;
    paint.alpha = impact ? 0.85 : 0.38 + 0.16 * Math.cos((counter.ticks - subtick) * 0.45);
    if (counter.kind === 'mortar') {
      disc.position.set(counter.x, 0.046, counter.z);
      shell.position.set(
        counter.x,
        0.32 + (5 * (counter.ticks - subtick)) / RAID_COUNTERS.mortar.windup,
        counter.z,
      );
    } else {
      const shape = RAID_COUNTERS[counter.kind];
      const z =
        counter.kind === 'wave' && impact
          ? counter.z - RAID_COUNTERS.wave.metresPerTick * subtick
          : counter.z;
      strip.scaling.set(shape.halfWidth * 2, 1, shape.halfDepth * 2);
      strip.position.set(counter.x, 0.046, z);
      crest.position.set(counter.x, 0.26, z);
    }
  };
}
