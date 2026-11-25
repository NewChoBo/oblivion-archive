import type { Material, Scene } from '@babylonjs/core';
import type { Bounds, DoorFrame, Opening, Point2 } from '../content/level-geometry.ts';
import { Mesh, Vector3, VertexData } from '@babylonjs/core';
import { pointedSegments } from './pointed-profile.ts';

interface FramedWall {
  id: string;
  bounds: Bounds;
  openingAxis: string;
}

// The opening is an extrusion of the frame's inner profile through the wall.
// Triangulate the masonry left by that cut once, when the chapter is assembled.
export function openingForFrame(wall: FramedWall, frame: DoorFrame): Opening {
  const [bottom, top] = wall.bounds[1];
  const width = frame.width,
    crown = frame.spring + (frame.rise ?? 0);
  const span: Point2 = [frame.center - width / 2, frame.center + width / 2];
  const [left, right] = wall.bounds[wall.openingAxis === 'x' ? 0 : 2];
  if (!(
    width > 0 &&
    span[0] > left &&
    span[1] < right &&
    frame.spring > bottom &&
    crown < top &&
    (frame.shape === 'flat' ||
      (['round', 'pointed'].includes(frame.shape) && (frame.rise ?? 0) > 0))
  )) {
    throw Error('Door frame does not fit wall ' + wall.id);
  }
  return { span, height: [bottom, crown] };
}

export function createDoorwayWall(
  scene: Scene,
  wall: FramedWall & { name: string; exteriorFace?: { side: string } },
  frame: DoorFrame,
  material: Material | null,
  outerMaterial?: Material,
) {
  const {
    span: [left, right],
  } = openingForFrame(wall, frame);
  const alongX = wall.openingAxis === 'x';
  const [west, east] = wall.bounds[alongX ? 0 : 2];
  const [near, far] = wall.bounds[alongX ? 2 : 0];
  const [base, top] = wall.bounds[1];
  const v = (u: number, y: number, d: number) =>
    alongX ? new Vector3(u, y, d) : new Vector3(d, y, u);
  const buffers = () => ({
    positions: [] as number[],
    indices: [] as number[],
    normals: [] as number[],
    uvs: [] as number[],
  });
  const inside = buffers(),
    outside = buffers();
  function quad(points: [Vector3, Vector3, Vector3, Vector3], outward: Vector3, data = inside) {
    const start = data.positions.length / 3;
    const [a, b, c] = points;
    const reverse = Vector3.Dot(Vector3.Cross(b.subtract(a), c.subtract(a)), outward) > 0;
    for (const p of points) {
      data.positions.push(p.x, p.y, p.z);
      data.uvs.push(Math.abs(outward.x) > 0.7 ? p.z : p.x, Math.abs(outward.y) > 0.7 ? p.z : p.y);
    }
    for (const i of reverse ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) data.indices.push(start + i);
  }
  function strip(u0: number, y0: number, u1: number, y1: number) {
    for (const [d, side] of [
      [near, -1],
      [far, 1],
    ] as const) {
      const exterior = outerMaterial && wall.exteriorFace?.side === (side < 0 ? 'min' : 'max');
      quad(
        [v(u0, y0, d), v(u1, y1, d), v(u1, top, d), v(u0, top, d)],
        v(0, 0, side),
        exterior ? outside : inside,
      );
    }
    quad(
      [v(u0, y0, near), v(u1, y1, near), v(u1, y1, far), v(u0, y0, far)],
      v(y1 - y0, u0 - u1, 0),
    );
  }
  strip(west, base, left, base);
  const radius = frame.width / 2;
  const halfSteps = frame.shape === 'pointed' ? pointedSegments : 8;
  for (const side of [-1, 1]) {
    let u = frame.center + side * radius,
      y = frame.spring;
    for (let k = 1; k <= halfSteps; k++) {
      const angle = (k / halfSteps) * (frame.shape === 'pointed' ? Math.PI / 3 : Math.PI / 2);
      const t = frame.shape === 'pointed' ? 2 * Math.cos(angle) - 1 : Math.cos(angle);
      const next = frame.center + side * radius * t;
      const h =
        frame.spring +
        ((frame.rise ?? 0) * Math.sin(angle)) /
          (frame.shape === 'pointed' ? Math.sin(Math.PI / 3) : 1);
      if (side < 0) strip(u, y, next, h);
      else strip(next, h, u, y);
      u = next;
      y = h;
    }
  }
  strip(right, base, east, base);
  for (const [x, low, high, sign] of [
    [west, base, top, -1],
    [east, base, top, 1],
    [left, base, frame.spring, 1],
    [right, base, frame.spring, -1],
  ] as const) {
    quad([v(x, low, near), v(x, high, near), v(x, high, far), v(x, low, far)], v(sign, 0, 0));
  }
  quad(
    [v(west, top, near), v(east, top, near), v(east, top, far), v(west, top, far)],
    Vector3.Up(),
  );
  function mesh(
    data: typeof inside,
    name: string,
    finish: Material | null,
    metadata: { lightingZone?: string; castShadow?: boolean },
  ) {
    const result = new Mesh(name, scene);
    VertexData.ComputeNormals(data.positions, data.indices, data.normals);
    Object.assign(new VertexData(), data).applyToMesh(result);
    result.material = finish;
    result.receiveShadows = true;
    result.metadata = { contouredDoorway: true, ...metadata };
    return result;
  }
  const body = mesh(inside, wall.name, material, {});
  if (!outerMaterial) return [body];
  return [
    body,
    mesh(outside, wall.name + ' · exterior', outerMaterial, {
      lightingZone: 'ramparts',
      castShadow: true,
    }),
  ];
}
