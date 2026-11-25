import { Vector3 } from '@babylonjs/core';
import type { Face } from './citadel-geometry.ts';

function clipAtHeight(polygon: Vector3[], height: number, above: boolean) {
  const clipped: Vector3[] = [];
  for (const [i, a] of polygon.entries()) {
    const b = polygon[(i + 1) % polygon.length]!;
    if (above ? a.y >= height : a.y <= height) clipped.push(a);
    if ((a.y < height && height < b.y) || (b.y < height && height < a.y)) {
      const cut = Vector3.Lerp(a, b, (height - a.y) / (b.y - a.y));
      cut.y = height;
      clipped.push(cut);
    }
  }
  return clipped;
}

// Form each riser halfway between adjacent tread heights on the actual walking
// surface. The landing seams and curved boundaries then agree across the flight.
export function stairTreadFaces(ramp: Face[], bottom: number, top: number, steps: number): Face[] {
  const result: Face[] = [];
  const rise = (top - bottom) / steps;
  const atHeight = (p: Vector3, y: number) => new Vector3(p.x, y, p.z);
  for (const [triangle] of ramp) {
    const [a, b, c] = triangle;
    const downhill = Vector3.Cross(b!.subtract(a!), c!.subtract(a!));
    if (downhill.y < 0) downhill.negateInPlace();
    downhill.y = 0;
    for (let i = 0; i <= steps; i++) {
      const height = bottom + i * rise;
      const lowerCut = bottom + (i - 0.5) * rise;
      const upperCut = bottom + (i + 0.5) * rise;
      const band = clipAtHeight(clipAtHeight(triangle, lowerCut, true), upperCut, false);
      if (band.length < 3) continue;
      result.push([band.map((p) => atHeight(p, height)), Vector3.UpReadOnly]);
      const edge = band.filter((p) => p.y === lowerCut);
      if (i > 0 && edge.length === 2) {
        const [left, right] = edge;
        result.push([
          [
            atHeight(left!, height - rise),
            atHeight(right!, height - rise),
            atHeight(right!, height),
            atHeight(left!, height),
          ],
          downhill,
        ]);
      }
    }
  }
  return result;
}
