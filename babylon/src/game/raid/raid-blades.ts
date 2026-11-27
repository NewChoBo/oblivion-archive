import type { RaidHero, RaidPoint, RaidTarget, Skill } from './raid-match.ts';

export function bladeDashRange(hero: RaidHero, skill: Skill) {
  if (skill !== 2) return 0;
  return hero === 'rildin' ? 3 : hero === 'kaiken' ? 5.5 : 0;
}

// Dash endpoints are in the wagon frame. The target of a thrust can escape or parry before arrival.
export interface BladeDash {
  from: RaidPoint;
  to: RaidPoint;
  elapsed: number;
  ticks: number;
  target?: RaidTarget;
}
export const DASH_TICKS = 6;
export const FULL_MOON_SPIN_TICKS = 16;
export function bladeState() {
  return {
    dash: null as BladeDash | null,
    slashes: 0,
    strides: 0,
    slashUntil: 0,
    strideUntil: 0,
    parryUntil: 0,
    swordUntil: 0,
    invulnerableUntil: 0,
    quarry: null as RaidTarget | null,
    quarryUntil: 0,
    lastMoonHit: 0,
    moonSpinTicks: 0,
    vengeance: 0,
  };
}
