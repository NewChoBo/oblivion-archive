import { Color3, DynamicTexture, Texture } from '@babylonjs/core';
import { getCodexEntries } from '../../../content/catalogs/codex.ts';

import type { Scene, Mesh } from '@babylonjs/core';
import type { BoxFactory, MaterialFactory } from './chapter-geometry.ts';
import type { Point3 } from '../../../content/level-geometry.ts';

function point(values: number[]): Point3 {
  if (values.length !== 3 || !values.every(Number.isFinite))
    throw Error('A folio needs three coordinates');
  return values as Point3;
}

function folioMaterial(scene: Scene, material: MaterialFactory) {
  const texture = new DynamicTexture(
    'collectible folio cover',
    { width: 128, height: 160 },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const paper = ctx.createLinearGradient(0, 0, 116, 158);
  paper.addColorStop(0, '#e1c899');
  paper.addColorStop(0.7, '#c2a177');
  paper.addColorStop(1, '#8f684f');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 128, 160);
  ctx.strokeStyle = '#805e45';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 112, 144);
  ctx.fillStyle = '#664e39';
  ctx.fillRect(22, 27, 45, 4);
  for (const [row, width] of [83, 82, 70, 82, 76, 49].entries())
    ctx.fillRect(22, 43 + row * 11, width, 2);
  ctx.fillStyle = '#753530';
  ctx.beginPath();
  ctx.arc(94, 122, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ab6357';
  ctx.beginPath();
  ctx.arc(94, 122, 9, 0, Math.PI * 2);
  ctx.stroke();
  texture.update();

  const surface = material('aged folio paper', '#ffffff');
  surface.albedoTexture = texture;
  surface.emissiveTexture = texture;
  surface.emissiveColor = new Color3(0.055, 0.043, 0.031);
  surface.roughness = 0.91;
  return surface;
}

export function createLoreProps(
  scene: Scene,
  { box, material }: { box: BoxFactory; material: MaterialFactory },
) {
  const paper = folioMaterial(scene, material);
  const props = new Map<string, Mesh>(
    getCodexEntries().map((entry) => {
      const mesh = box(entry.id, point(entry.position), [0.28, 0.018, 0.36], paper);
      // Codex rotations are authored in degrees. Babylon stores local Euler angles in radians.
      const [x, y, z] = point(entry.rotation);
      mesh.rotation.set((x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180);
      mesh.isPickable = false;
      mesh.metadata = { lightingZone: entry.zone, castShadow: false, lorePickup: true };
      return [entry.id, mesh];
    }),
  );
  return {
    props,
    sync(discovered: Iterable<string>) {
      const collected = new Set(discovered);
      for (const [id, mesh] of props) mesh.setEnabled(!collected.has(id));
    },
  };
}
