import {
  Matrix,
  Vector3,
  Viewport,
  type AbstractMesh,
  type Ray,
  type Scene,
} from '@babylonjs/core';
import type { RaidTarget } from '../../../game/raid/raid-match.ts';

export interface RaidTargetBody {
  target: RaidTarget;
  meshes: readonly AbstractMesh[];
}

/** Only the ground and the current side's target bodies participate in an exact ray hit. */
export function hitRaidTarget(ray: Ray, ground: AbstractMesh, bodies: readonly RaidTargetBody[]) {
  let hit = ray.intersectsMesh(ground);
  let target: RaidTarget | undefined;
  for (const body of bodies) {
    for (const mesh of body.meshes) {
      if (!mesh.isEnabled() || !mesh.isVisible) continue;
      const next = ray.intersectsMesh(mesh);
      if (next.hit && (!hit.hit || next.distance < hit.distance)) {
        hit = next;
        target = body.target;
      }
    }
  }
  const point = hit.pickedPoint;
  return { target, point: point ? { x: point.x, z: point.z } : null };
}

/** Compare the cursor disc to the projected hit volumes in CSS pixels, independent of render scale. */
export function nearestRaidTarget(
  scene: Scene,
  bodies: readonly RaidTargetBody[],
  bounds: DOMRectReadOnly,
  cursor: { clientX: number; clientY: number },
  radius: number,
  eligible: (target: RaidTarget) => boolean,
  direct: RaidTarget | undefined,
) {
  const viewport = new Viewport(bounds.x, bounds.y, bounds.width, bounds.height);
  const projected = new Vector3();
  let nearest: RaidTarget | undefined;
  let best = radius * radius;
  let nearestDepth = Infinity;
  let foundEligible = false;
  for (const { target, meshes } of bodies) {
    const valid = eligible(target);
    if (!valid && (foundEligible || direct !== undefined)) continue;
    for (const mesh of meshes) {
      if (!mesh.isEnabled() || !mesh.isVisible) continue;
      let left = Infinity,
        top = Infinity,
        right = -Infinity,
        bottom = -Infinity,
        depth = Infinity;
      for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
        Vector3.ProjectToRef(
          corner,
          Matrix.IdentityReadOnly,
          scene.getTransformMatrix(),
          viewport,
          projected,
        );
        if (projected.z < 0 || projected.z > 1) continue;
        left = Math.min(left, projected.x);
        right = Math.max(right, projected.x);
        top = Math.min(top, projected.y);
        bottom = Math.max(bottom, projected.y);
        depth = Math.min(depth, projected.z);
      }
      if (right < bounds.left || left > bounds.right || bottom < bounds.top || top > bounds.bottom)
        continue;
      const dx = Math.max(0, left - cursor.clientX, cursor.clientX - right);
      const dy = Math.max(0, top - cursor.clientY, cursor.clientY - bottom);
      const distance = dx * dx + dy * dy;
      if (distance > radius * radius) continue;
      if (
        (valid && !foundEligible) ||
        distance < best ||
        (distance === best && depth < nearestDepth)
      ) {
        foundEligible = valid;
        nearest = target;
        best = distance;
        nearestDepth = depth;
      }
    }
  }
  return foundEligible ? nearest : (direct ?? nearest);
}
