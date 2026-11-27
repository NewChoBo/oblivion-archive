export interface RaidControl {
  slowed: number;
  silenced: number;
  staggered: number;
  staggerGuard: number;
}

// Durations in simulation ticks. Effects apply on contact with an opposing runner.
export type HitControl = Partial<Pick<RaidControl, 'slowed' | 'silenced' | 'staggered'>>;
export function applyRaidHitControl(victim: RaidControl, effect: HitControl | undefined) {
  if (!effect) return;
  if (effect.slowed) victim.slowed = Math.max(victim.slowed, effect.slowed);
  if (effect.silenced) victim.silenced = Math.max(victim.silenced, effect.silenced);
  if (effect.staggered && !victim.staggerGuard) {
    victim.staggered = effect.staggered;
    victim.staggerGuard = effect.staggered + 24;
  }
}
