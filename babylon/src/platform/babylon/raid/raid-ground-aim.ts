import { Matrix, Ray, Vector3, Viewport, type Camera } from '@babylonjs/core';
import type { RaidPoint } from '../../../game/raid/raid-match.ts';
import { limitRaidPlacement } from '../../../game/raid/runner-motion.ts';

/** Map a CSS cursor to the cast disc on the road, regardless of render resolution. */
export function pickRaidGroundAim(
  camera: Camera,
  bounds: DOMRectReadOnly,
  cursor: Pick<PointerEvent, 'clientX' | 'clientY'>,
  caster: RaidPoint,
  range: number,
  kind: 'field' | 'leap',
) {
  const ray = Ray.CreateNew(
    cursor.clientX - bounds.left,
    cursor.clientY - bounds.top,
    bounds.width,
    bounds.height,
    Matrix.IdentityReadOnly,
    camera.getViewMatrix(),
    camera.getProjectionMatrix(),
  );
  // Keep the ground offset multiplied by the ray's downward slope. This preserves the
  // bearing even at or above the horizon, where the forward ray never meets the road.
  const down = -ray.direction.y;
  const dx = (ray.origin.x - caster.x) * down + ray.origin.y * ray.direction.x;
  const dz = (ray.origin.z - caster.z) * down + ray.origin.y * ray.direction.z;
  const length = Math.hypot(dx, dz);
  const inside = down > 0 && length <= range * down;
  // Keep a sub-micrometre margin so rounding cannot put a rim cast outside the authority's range.
  const scale = inside ? 1 / down : (range - 1e-7) / length;
  const picked = { x: caster.x + dx * scale, z: caster.z + dz * scale };
  const point = kind === 'leap' ? limitRaidPlacement(picked) : picked;
  if (inside && point === picked) return { point };
  const screen = Vector3.Project(
    new Vector3(point.x, 0, point.z),
    Matrix.IdentityReadOnly,
    camera.getTransformationMatrix(),
    new Viewport(bounds.left, bounds.top, bounds.width, bounds.height),
  );
  return { point, limitedCursor: { clientX: screen.x, clientY: screen.y } };
}
