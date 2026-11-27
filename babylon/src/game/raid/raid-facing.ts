import type { RaidAction, RaidRunner } from './raid-match.ts';

export const raidActionTicks = (a: RaidAction) =>
  a.skill === 'basic' ? 10 : a.skill === 3 ? 24 : 16;

// A stronger attack keeps its facing when a basic attack overlaps its pose.
export function raidActiveAction(actions: readonly RaidAction[], slot: number, tick: number) {
  let active: RaidAction | undefined;
  for (const cue of actions) {
    if (cue.slot !== slot || tick - cue.tick >= raidActionTicks(cue)) continue;
    if (
      !active ||
      cue.skill === 3 ||
      (active.skill !== 3 && (active.skill === 'basic' || cue.skill !== 'basic'))
    )
      active = cue;
  }
  return active;
}

/** Gameplay and the rig share this heading in radians, measured from forward (+Z). */
export function raidFacing(r: RaidRunner, active?: RaidAction) {
  const motion = r.leap ?? r.blade.dash ?? active;
  if (motion && (motion.from.x !== motion.to.x || motion.from.z !== motion.to.z))
    return Math.atan2(motion.to.x - motion.from.x, motion.to.z - motion.from.z);
  return r.side * 0.25;
}
