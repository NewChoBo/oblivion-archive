import { Vector3 } from '@babylonjs/core';

import type { AbstractMesh } from '@babylonjs/core';
import type { Point2, Point3 } from '../content/level-geometry.ts';

type Triangle<T> = [T, T, T];
type Axis = 0 | 1 | 2;
interface Face {
  normal: Vector3;
  components: Point3;
  axis: Axis;
  distance: number;
  points: Triangle<Vector3>;
}
interface Label {
  zone: string;
  id: string;
  part: string | number;
  name?: string;
}
interface Piece {
  mesh: AbstractMesh;
  min: Vector3;
  max: Vector3;
  label: Label;
  faces?: Face[];
}
export interface SurfaceFinding {
  code: string;
  objects: Label[];
  point: Point3;
  area: number;
  separation: number;
}

const distanceLimit = 0.0005;
const areaLimit = 0.0001;
const directionLimit = 0.999999;
const projectionAxes = [
  [1, 2],
  [0, 2],
  [0, 1],
] as const;
const cross2 = (a: Point2, b: Point2, p: Point2) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function triangles(mesh: AbstractMesh): Face[] {
  const positions = mesh.getVerticesData('position');
  const indices = mesh.getIndices();
  if (!positions?.length || !indices?.length) return [];
  const matrix = mesh.getWorldMatrix();
  const points = [];
  for (let i = 0; i < positions.length; i += 3) {
    points.push(Vector3.TransformCoordinates(Vector3.FromArray(positions, i), matrix));
  }
  const result: Face[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [points[indices[i]!]!, points[indices[i + 1]!]!, points[indices[i + 2]!]!];
    const normal = Vector3.Cross(b.subtract(a), c.subtract(a));
    if (normal.lengthSquared() < areaLimit * areaLimit) continue;
    normal.normalize();
    const components = normal.asArray();
    const axis = components.reduce(
      (best, value, index) => (Math.abs(value) > Math.abs(components[best]!) ? index : best),
      0,
    ) as Axis;
    const distance = Vector3.Dot(normal, a);
    result.push({ normal, components, axis, distance, points: [a, b, c] });
  }
  return result;
}

function clipPolygon(subject: Point2[], clipper: Triangle<Point2>) {
  const winding = Math.sign(cross2(...clipper));
  for (let index = 0; index < clipper.length && subject.length; index++) {
    const a = clipper[index]!,
      b = clipper[(index + 1) % clipper.length]!;
    const polygon: Point2[] = [];
    let previous = subject.at(-1)!,
      previousSide = winding * cross2(a, b, previous);
    for (const point of subject) {
      const side = winding * cross2(a, b, point);
      if (previousSide >= 0 !== side >= 0) {
        const t = previousSide / (previousSide - side);
        polygon.push([
          previous[0] + t * (point[0] - previous[0]),
          previous[1] + t * (point[1] - previous[1]),
        ]);
      }
      if (side >= 0) polygon.push(point);
      previous = point;
      previousSide = side;
    }
    subject = polygon;
  }
  return subject;
}

function patch(a: Face, b: Face) {
  // Back-to-back faces are common where two solid pieces touch.
  if (Vector3.Dot(a.normal, b.normal) < directionLimit) return null;
  const separation = Math.max(
    ...b.points.map((point) => Math.abs(Vector3.Dot(a.normal, point) - a.distance)),
  );
  if (separation > distanceLimit) return null;
  const [u, v] = projectionAxes[a.axis];
  const project = (point: Vector3): Point2 => {
    const xyz = point.asArray();
    return [xyz[u], xyz[v]];
  };
  const triangle = ([p, q, r]: Triangle<Vector3>): Triangle<Point2> => [
    project(p),
    project(q),
    project(r),
  ];
  const overlap = clipPolygon(triangle(a.points), triangle(b.points));
  if (overlap.length < 3) return null;
  let twiceArea = 0;
  for (let i = 1; i + 1 < overlap.length; i++)
    twiceArea += cross2(overlap[0]!, overlap[i]!, overlap[i + 1]!);
  const area = Math.abs(twiceArea) / (2 * Math.abs(a.components[a.axis]));
  if (area < areaLimit) return null;

  const point: Point3 = [0, 0, 0];
  point[u] = overlap.reduce((sum, xy) => sum + xy[0], 0) / overlap.length;
  point[v] = overlap.reduce((sum, xy) => sum + xy[1], 0) / overlap.length;
  point[a.axis] =
    (a.distance - a.components[u] * point[u] - a.components[v] * point[v]) / a.components[a.axis];
  return { point, area, separation };
}

export function findSurfaceOverlaps(meshes: readonly AbstractMesh[]): SurfaceFinding[] {
  const pieces: Piece[] = [];
  for (const mesh of meshes) {
    const exterior = mesh.checkCollisions && mesh.metadata?.lightingZone === 'ramparts';
    const placement = mesh.metadata?.levelPlacement;
    if (
      (!placement && !exterior) ||
      !mesh.isEnabled() ||
      !mesh.isVisible ||
      mesh.visibility !== 1 ||
      mesh.material?.needAlphaBlendingForMesh?.(mesh)
    )
      continue;
    mesh.computeWorldMatrix(true);
    const { minimumWorld: min, maximumWorld: max } = mesh.getBoundingInfo().boundingBox;
    const label = placement ?? {
      zone: 'citadel',
      id: mesh.name,
      part: min
        .asArray()
        .map((n) => n.toFixed(3))
        .join(','),
    };
    pieces.push({ mesh, min, max, label: { ...label, name: mesh.name } });
  }
  pieces.sort((a, b) => a.min.x - b.min.x);
  const findings = [];
  for (const [i, a] of pieces.entries()) {
    for (let j = i + 1; j < pieces.length; j++) {
      const b = pieces[j]!;
      if (b.min.x > a.max.x + distanceLimit) break;
      if (
        a.min.y > b.max.y + distanceLimit ||
        b.min.y > a.max.y + distanceLimit ||
        a.min.z > b.max.z + distanceLimit ||
        b.min.z > a.max.z + distanceLimit
      )
        continue;
      a.faces ??= triangles(a.mesh);
      b.faces ??= triangles(b.mesh);
      let largest = null;
      for (const left of a.faces)
        for (const right of b.faces) {
          const result = patch(left, right);
          if (result && (!largest || result.area > largest.area)) largest = result;
        }
      if (largest)
        findings.push({ code: 'COPLANAR_SURFACES', objects: [a.label, b.label], ...largest });
    }
  }
  return findings;
}
