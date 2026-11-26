import { Matrix, Vector3, Viewport, type Scene } from '@babylonjs/core';
import type { RaidTarget } from '../../../game/raid/raid-match.ts';

/** Compare the cursor disc to the projected hit volumes in CSS pixels, independent of render scale. */
export function nearestRaidTarget(
  scene: Scene,
  bounds: DOMRectReadOnly,
  cursor: { clientX: number; clientY: number },
  radius: number,
  eligible: (target: RaidTarget) => boolean,
) {
  const viewport = new Viewport(bounds.x, bounds.y, bounds.width, bounds.height);
  const projected = new Vector3();
  let nearest: RaidTarget | undefined;
  let best = radius * radius;
  let nearestDepth = Infinity;
  for (const mesh of scene.meshes) {
    const target: RaidTarget | undefined = mesh.metadata?.raidTarget;
    if (target === undefined || !mesh.isEnabled() || !eligible(target)) continue;
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
    if (distance < best || (distance === best && depth < nearestDepth)) {
      nearest = target;
      best = distance;
      nearestDepth = depth;
    }
  }
  return nearest;
}
