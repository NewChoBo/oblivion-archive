import { Ray, type AbstractMesh, type Vector3 } from '@babylonjs/core';

// Check the centre of the rendered view and the character's reach separately.
// A shoulder camera can see around a corner or pass over a prop behind the player.
export function focusedInteraction<T extends { id: string }>(
  targets: readonly T[],
  meshesById: ReadonlyMap<string, readonly AbstractMesh[]>,
  view: Ray,
  eye: Vector3,
  colliders: readonly AbstractMesh[],
) {
  let closest = null;
  let distance = Infinity;
  for (const target of targets) {
    for (const mesh of meshesById.get(target.id) ?? []) {
      if (!mesh.isEnabled()) continue;
      mesh.computeWorldMatrix();
      const hit = view.intersectsMesh(mesh);
      if (!hit.hit || hit.distance >= distance) continue;
      const point = hit.pickedPoint;
      if (!point) continue;
      if ((point.x - eye.x) * view.direction.x + (point.z - eye.z) * view.direction.z < 0) continue;
      if (blocked(view.origin, point, mesh, colliders)) continue;
      if (!eye.equals(view.origin) && blocked(eye, point, mesh, colliders)) continue;
      closest = target;
      distance = hit.distance;
    }
  }
  return closest;
}

function blocked(
  origin: Vector3,
  point: Vector3,
  target: AbstractMesh,
  colliders: readonly AbstractMesh[],
) {
  const offset = point.subtract(origin);
  const distance = offset.length();
  if (distance <= 0.005) return false;
  const ray = new Ray(origin, offset.scaleInPlace(1 / distance), distance - 0.005);
  for (const mesh of colliders) {
    if (mesh === target || !mesh.checkCollisions || !mesh.isEnabled()) continue;
    mesh.getWorldMatrix();
    const { minimumWorld, maximumWorld } = mesh.getBoundingInfo().boundingBox;
    if (!ray.intersectsBoxMinMax(minimumWorld, maximumWorld)) continue;
    // Test actual triangles so openings in a wall remain usable.
    if (ray.intersectsMesh(mesh, true).hit) return true;
  }
  return false;
}
