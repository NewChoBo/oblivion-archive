import type { RaidAim, RaidPoint } from './raid-view.ts';

export const RAID_CAMERA = { fov: 0.94, near: 0.3, far: 125 } as const;
const halfSlope = Math.tan(RAID_CAMERA.fov / 2);

// Metres of extra chase distance. The original footage shows the ground ring at about
// 70% of its running width for direction/placement and 50% for target selection.
export function raidAimPullback(kind?: RaidAim['kind']) {
  switch (kind) {
    case 'target':
    case 'ward':
      return 10.8;
    case 'direction':
    case 'field':
    case 'leap':
      return 5.8;
    default:
      return 0;
  }
}

// Translate eye and look together so the horizon stays level as the runner moves or aims.
export function raidCameraPose(runner: RaidPoint, pullback = 0) {
  const lift = pullback * 0.055;
  return {
    eye: { x: runner.x, y: 6.3 + lift, z: runner.z - 10.5 - pullback },
    look: { x: runner.x, y: 1.3 + lift, z: runner.z + 7.4 - pullback },
  };
}

// The attack cone faces +Z even while strafing. Its ground outline uses the same half-angle.
export const RAID_BASIC_HALF_ANGLE = Math.PI / 4;
export function inBasicAttackArc(runner: RaidPoint, target: RaidPoint) {
  return Math.atan2(Math.abs(target.x - runner.x), target.z - runner.z) <= RAID_BASIC_HALF_ANGLE;
}

export function inRaidSight(
  runner: RaidPoint,
  target: RaidPoint,
  height: number,
  aspect: number,
  pullback = 0,
) {
  const { eye, look } = raidCameraPose(runner, pullback);
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
