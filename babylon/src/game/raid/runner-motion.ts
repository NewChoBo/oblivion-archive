import type { RaidRunner, RaidPoint } from './raid-view.ts';
import { RAID_HZ, RAID_LEAP_TICKS } from './raid-rules.ts';
/** Distance in metres travelled by the wagon over this many match ticks (including sub-ticks). */
export const raidRoadTravel = (ticks: number) => (ticks * 6) / RAID_HZ;
/** A stationary patch of road, expressed in the wagon's frame at cast time and again after age ticks. */
export function raidGroundPointAfter(point: Readonly<RaidPoint>, age: number): RaidPoint {
  return { x: point.x, z: point.z - raidRoadTravel(age) };
}
export const raidLeapHeight = (fraction: number) => 2.2 * 4 * fraction * (1 - fraction);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
// Metres per second relative to the wagon, from a free run to full braking.
const forwardSpeed = (brake: number) => 2.25 * (1 - brake) - 3.1 * brake;
// Outside the running corridor after a leap, return at running speed without snapping to its edge.
function runAxis(position: number, delta: number, low: number, high: number, recovery: number) {
  return clamp(
    position + delta,
    Math.min(low, position + recovery),
    Math.max(high, position - recovery),
  );
}
export function raidRunnerHeight(r: RaidRunner, subtick = 0) {
  return r.leap
    ? raidLeapHeight(Math.min(1, (r.leap.elapsed + subtick) / RAID_LEAP_TICKS))
    : jumpHeight(Math.max(0, r.jumping - subtick));
}
/** Predict up to one tick from the current ground position for both the match and the camera. */
export function raidRunnerPositionAfter(r: RaidRunner, ticks: number): RaidPoint {
  if (r.heroView.rootedTicks) return { x: r.x, z: r.z };
  const dash = r.dash;
  if (dash && !r.staggered) {
    const t = Math.min(1, (dash.elapsed + ticks) / dash.ticks);
    return {
      x: dash.from.x + (dash.to.x - dash.from.x) * t,
      z: dash.from.z + (dash.to.z - dash.from.z) * t,
    };
  }
  if (r.leap) {
    const { from, to, elapsed } = r.leap;
    const age = Math.min(RAID_LEAP_TICKS, elapsed + ticks);
    const t = age / RAID_LEAP_TICKS;
    return raidGroundPointAfter(
      { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t },
      age,
    );
  }
  // Keep steering intent through a stagger so held controls resume on recovery.
  const seconds = r.respawn || r.staggered ? 0 : (ticks / RAID_HZ) * (r.slowed ? 0.55 : 1);
  return {
    x: runAxis(r.x, r.side * 4.8 * seconds, -5, 5, 4.8 * seconds),
    z: runAxis(r.z, forwardSpeed(r.brake) * seconds, -6, 8.4, 3.1 * seconds),
  };
}
export const jumpHeight = (ticks: number) =>
  ticks > 0 ? 1.5 * Math.sin((Math.PI * ticks) / 24) : 0;
