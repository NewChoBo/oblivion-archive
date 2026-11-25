import type { AbstractMesh, Camera, Scene } from '@babylonjs/core';
import type { WallLightOcclusion } from '../../../app/lighting/wall-light-occlusion.ts';
import type { Point3 } from '../../../content/level-geometry.ts';

interface Extents {
  min: Point3;
  max: Point3;
}
export interface OccludingStructure {
  source: AbstractMesh;
  surfaces: AbstractMesh[];
}
type Axis = 0 | 1 | 2;
const tangents = [
  [1, 2],
  [2, 0],
  [0, 1],
] as const;

const slabMargin = 0.025;
const depthMargin = 0.04;
const observerMargin = 0.1;

export function occludesBounds(observer: Point3, slab: Extents & { axis: Axis }, target: Extents) {
  const { axis, min, max } = slab;
  const eye = observer[axis];
  const direction =
    eye < min[axis] - observerMargin ? 1 : eye > max[axis] + observerMargin ? -1 : 0;
  if (!direction) return false;
  const wall = direction === 1 ? min[axis] - eye : eye - max[axis];
  const near = direction === 1 ? target.min[axis] - eye : eye - target.max[axis];
  if (near <= wall + depthMargin) return false;
  const far = direction === 1 ? target.max[axis] - eye : eye - target.min[axis];
  const nearRatio = wall / near,
    farRatio = wall / far;

  // Project the entire target box onto the wall. Checking both depth extremes
  // bounds its projection, including targets that span a corner of the wall.
  for (const tangent of tangents[axis]) {
    const center = observer[tangent];
    const low = target.min[tangent] - center;
    const high = target.max[tangent] - center;
    if (
      center + Math.min(low * nearRatio, low * farRatio) <= min[tangent] + slabMargin ||
      center + Math.max(high * nearRatio, high * farRatio) >= max[tangent] - slabMargin
    )
      return false;
  }
  return true;
}

function meshBounds(mesh: AbstractMesh) {
  mesh.computeWorldMatrix(true);
  const bounds = mesh.getBoundingInfo().boundingBox;
  return { min: bounds.minimumWorld.asArray(), max: bounds.maximumWorld.asArray() };
}

function canOcclude(mesh: AbstractMesh) {
  const { material } = mesh;
  return (
    mesh.isEnabled() &&
    mesh.isVisible &&
    mesh.visibility === 1 &&
    material?.alpha === 1 &&
    !material.needAlphaBlendingForMesh(mesh) &&
    !material.needAlphaTesting()
  );
}

function collectSlabs(structures: OccludingStructure[]) {
  const walls = [];
  for (const { source, surfaces } of structures) {
    const bounds = meshBounds(source);
    const sizes = bounds.min.map((min, index) => bounds.max[index]! - min);
    const axis = sizes.indexOf(Math.min(...sizes)) as Axis;
    if (
      sizes[axis]! > 0.45 ||
      sizes.filter((_, index) => index !== axis).some((size) => size < 1.75)
    )
      continue;
    walls.push({ ...bounds, axis, surfaces, active: false });
  }
  return walls;
}

export function createWallLightOcclusion(structures: OccludingStructure[]): WallLightOcclusion {
  const walls = collectSlabs(structures);
  return (position, range = Infinity) => {
    const origin: Point3 = [position.x, position.y, position.z];
    const closed = walls.filter((wall) => {
      const distance = Math.hypot(
        ...origin.map((value, i) => Math.max(wall.min[i]! - value, 0, value - wall.max[i]!)),
      );
      return distance < range && wall.surfaces.every(canOcclude);
    });
    if (!closed.length) return undefined;
    const target: Extents = { min: [0, 0, 0], max: [0, 0, 0] };
    return (minimum, maximum) => {
      target.min[0] = minimum.x;
      target.min[1] = minimum.y;
      target.min[2] = minimum.z;
      target.max[0] = maximum.x;
      target.max[1] = maximum.y;
      target.max[2] = maximum.z;
      return closed.some((wall) => occludesBounds(origin, wall, target));
    };
  };
}

export function cullBehindOpaqueWalls(
  scene: Scene,
  camera: Camera,
  structures: OccludingStructure[],
  staticMeshes: AbstractMesh[],
) {
  const walls = collectSlabs(structures);
  const targets = staticMeshes.map((mesh) => ({ mesh, ...meshBounds(mesh) }));
  const hidden = new Set<AbstractMesh>();
  const occluders: typeof walls = [];
  const candidates = { data: [] as AbstractMesh[], length: 0 };
  const defaultCandidates = scene.getActiveMeshCandidates;
  let lastObserver: number[] = [];

  // Replace the render candidate list only. Picking, collision and shadow lists
  // still address the complete scene.
  scene.getActiveMeshCandidates = () => {
    const eye = (scene.activeCamera ?? camera).position.asArray();
    let changed = eye.some((value, index) => value !== lastObserver[index]);
    for (const wall of walls) {
      const active = wall.surfaces.every(canOcclude);
      if (active !== wall.active) {
        wall.active = active;
        changed = true;
      }
    }
    if (changed) {
      lastObserver = eye;
      hidden.clear();
      occluders.length = 0;
      for (const wall of walls) if (wall.active) occluders.push(wall);
      for (const target of targets) {
        if (occluders.some((wall) => occludesBounds(eye, wall, target))) hidden.add(target.mesh);
      }
    }
    const source = defaultCandidates();
    let count = 0;
    for (let i = 0; i < source.length; i++) {
      const mesh = source.data[i]!;
      if (!hidden.has(mesh)) candidates.data[count++] = mesh;
    }
    candidates.data.length = candidates.length = count;
    return candidates;
  };
}
