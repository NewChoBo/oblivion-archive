import type { Scene, Material } from '@babylonjs/core';
import { createRaidArrow } from './raid-arrow.ts';
import type { RaidPoint } from '../../../game/raid/raid-view.ts';

/** Reuse one arrow mesh across the whole road-fixed footprint for every volley. */
export function createRaidArrowRain(scene: Scene) {
  const arrow = createRaidArrow(scene);
  const drops = Array.from({ length: 24 }, (_, i) => {
    const a = i * Math.PI * (3 - Math.sqrt(5));
    const distance = Math.sqrt((i + 0.5) / 24) * 0.97;
    const mesh = arrow.createInstance('falling arrow');
    mesh.rotation.x = -0.22;
    mesh.isPickable = false;
    return { mesh, x: Math.cos(a) * distance, z: Math.sin(a) * distance };
  });
  function hide() {
    for (const { mesh } of drops) mesh.setEnabled(false);
  }
  hide();
  return {
    hide,
    draw(
      center: Readonly<RaidPoint>,
      radius: number,
      age: number,
      interval: number,
      lastHit: number,
      material: Material,
    ) {
      arrow.material = material;
      for (const [i, drop] of drops.entries()) {
        // Stagger landings by two ticks around each authority pulse. Every tip lands inside the circle.
        const delay = (i % 5) / 2;
        const local = age - delay;
        drop.mesh.setEnabled(local <= lastHit + 2);
        const phase = ((local % interval) + interval) % interval;
        const height = phase <= 2 ? 0 : (1 - phase / interval) * 4;
        drop.mesh.position.set(
          center.x + drop.x * radius,
          0.09 + height,
          center.z + drop.z * radius - height * 0.22,
        );
      }
    },
  };
}
