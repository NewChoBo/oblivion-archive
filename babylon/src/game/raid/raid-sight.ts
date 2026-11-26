import type { RaidPoint } from './raid-match.ts';

export const RAID_CAMERA = { fov: 0.94, near: 0.3, far: 125 } as const;
const halfSlope = Math.tan(RAID_CAMERA.fov / 2);

// Anchor the camera to the runner's feet in X/Z; jumping and attack poses leave the horizon level.
export function raidCameraPose(runner: RaidPoint) {
  return {
    eye: { x: runner.x, y: 6.3, z: runner.z - 10.5 },
    look: { x: runner.x, y: 1.3, z: runner.z + 7.4 },
  };
}

// Basic attacks face +Z even while strafing. Their 90-degree cone starts at the runner.
export function inBasicAttackArc(runner: RaidPoint, target: RaidPoint) {
  return target.z - runner.z >= Math.abs(target.x - runner.x);
}

export function inRaidSight(runner: RaidPoint, target: RaidPoint, height: number, aspect: number) {
  const { eye, look } = raidCameraPose(runner);
  const dx = look.x - eye.x,
    dy = look.y - eye.y,
    dz = look.z - eye.z;
  const horizontal = Math.hypot(dx, dz),
    length = Math.hypot(horizontal, dy);
  const x = target.x - eye.x,
    y = height - eye.y,
    z = target.z - eye.z;
  // Project the aim point onto the camera's right, up and forward axes (vertical FOV).
  const right = (dz * x - dx * z) / horizontal;
  const along = (dx * x + dz * z) / horizontal;
  const up = (horizontal * y - dy * along) / length;
  const depth = (horizontal * along + dy * y) / length;
  return (
    depth >= RAID_CAMERA.near &&
    depth <= RAID_CAMERA.far &&
    Math.abs(up) <= depth * halfSlope &&
    Math.abs(right) <= depth * halfSlope * aspect
  );
}
