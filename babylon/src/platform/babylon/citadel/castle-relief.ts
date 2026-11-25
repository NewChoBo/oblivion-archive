import type { PBRMaterial, Scene } from '@babylonjs/core';
import type { MaterialFactory } from '../chapter/chapter-geometry.ts';
import { Color3, Mesh, MeshBuilder } from '@babylonjs/core';

// A relief on the reading-room arch repeats the silhouettes visible across the court.
export function createCastleRelief(scene: Scene, material: MaterialFactory) {
  const base = material('blackstone citadel relief', '#344048'),
    rim = material('metal relief border', '#a07c4a');
  const shades = ['#c8b78e', '#e69e6c', '#aeccce', '#cba164', '#f6cb74'];
  const finishes = shades.map((color, i) => material('returning castle memory ' + (i + 1), color));
  const parts = new Map<PBRMaterial, Mesh[]>();
  function piece(w: number, h: number, x: number, y: number, mat: PBRMaterial, angle = 0) {
    const mesh = MeshBuilder.CreateBox(
      'relief detail',
      { width: w, height: h, depth: mat === base ? 0.065 : 0.032 },
      scene,
    );
    mesh.position.set(3.02 + x, 2.55 + y, mat === base ? 6.7 : 6.635);
    mesh.rotation.z = angle;
    mesh.material = mat;
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat)!.push(mesh);
  }
  piece(2.36, 1.02, 0, 0, base);
  for (const y of [-0.5, 0.5]) piece(2.39, 0.035, 0, y, rim);
  for (const x of [-1.17, 1.17]) piece(0.035, 1.02, x, 0, rim);
  // Gate towers, the sawtooth bindery, library stacks, cargo boom and the central star.
  for (const x of [-0.97, -0.8]) {
    piece(0.12, 0.26, x, -0.19, finishes[0]!);
    piece(0.16, 0.06, x, -0.05, finishes[0]!);
  }
  piece(0.18, 0.06, -0.88, -0.15, finishes[0]!);
  piece(0.41, 0.18, -0.51, -0.23, finishes[1]!);
  for (const x of [-0.62, -0.43]) piece(0.21, 0.05, x, -0.1, finishes[1]!, 0.31);
  piece(0.053, 0.31, -0.65, -0.05, finishes[1]!);
  for (const x of [-0.14, 0.21]) {
    piece(0.29, 0.31, x, -0.15, finishes[2]!);
    piece(0.28, 0.07, x, 0.04, finishes[2]!, 0.18);
  }
  piece(0.18, 0.54, 0.035, -0.045, finishes[2]!);
  piece(0.06, 0.45, 0.75, -0.1, finishes[3]!);
  piece(0.38, 0.055, 0.81, 0.11, finishes[3]!, 0.19);
  piece(0.022, 0.16, 0.96, 0.065, finishes[3]!);
  piece(0.09, 0.08, 0.96, -0.05, finishes[3]!);
  for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4])
    piece(0.026, 0.26, 0.04, 0.325, finishes[4]!, a);
  for (const [m, objects] of parts) {
    const mesh = Mesh.MergeMeshes(objects, true, true)!;
    mesh.name = m.name;
    mesh.metadata = { lightingZone: 'readingRoom', castShadow: false };
  }
  return (phase: number) => {
    for (const [i, m] of finishes.entries()) {
      const lit = i < phase;
      m.albedoColor = Color3.FromHexString(lit ? shades[i]! : '#53616a');
      m.emissiveColor = lit
        ? Color3.FromHexString(shades[i]!).scale(0.63)
        : Color3.FromHexString('#101820');
    }
  };
}
