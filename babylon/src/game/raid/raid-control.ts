import type { RaidHero, Skill } from './raid-match.ts';

export interface RaidControl {
  slowed: number;
  silenced: number;
  staggered: number;
  staggerGuard: number;
}

// Durations in simulation ticks. Effects apply on contact with an opposing runner.
type HitControl = Partial<Pick<RaidControl, 'slowed' | 'silenced' | 'staggered'>>;
const effects: Partial<Record<RaidHero, Partial<Record<Skill, HitControl>>>> = {
  rildin: { 1: { staggered: 15 } },
  kaiken: { 2: { staggered: 12 } },
  swift: { 0: { slowed: 30 }, 3: { slowed: 30 } },
  hammer: { 0: { slowed: 30 }, 1: { staggered: 12 } },
  bastion: { 0: { staggered: 12 } },
  abyss: { 1: { silenced: 24 }, 2: { slowed: 60 }, 3: { silenced: 60 } },
  rime: { 0: { slowed: 45 }, 1: { slowed: 30 }, 3: { slowed: 90 } },
};

export function applyRaidHitControl(victim: RaidControl, hero: RaidHero, skill: Skill) {
  const effect = effects[hero]?.[skill];
  if (!effect) return;
  if (effect.slowed) victim.slowed = Math.max(victim.slowed, effect.slowed);
  if (effect.silenced) victim.silenced = Math.max(victim.silenced, effect.silenced);
  if (effect.staggered && !victim.staggerGuard) {
    victim.staggered = effect.staggered;
    victim.staggerGuard = effect.staggered + 24;
  }
}
