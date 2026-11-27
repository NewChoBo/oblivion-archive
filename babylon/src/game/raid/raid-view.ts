import type { HeroView } from './heroes/hero-definition.ts';
import type { RaidHero } from './heroes/hero-id.ts';
import type { RaidControl } from './raid-control.ts';
import type { RaidCounter } from './raid-boss.ts';
import type { RaidProjectile } from './raid-projectiles.ts';
export interface RaidDash {
  from: RaidPoint;
  to: RaidPoint;
  elapsed: number;
  ticks: number;
  target?: RaidTarget;
}
/** Positions are metres relative to the moving wagon, +Z in the direction of travel. */
export interface RaidPoint {
  x: number;
  z: number;
}
export type RaidTarget = 'wagon' | number;
export type Skill = 0 | 1 | 2 | 3;
export interface RaidAim {
  kind: 'leap' | 'field' | 'target' | 'direction' | 'ward' | 'pulse';
  spread?: number;
  dash?: boolean;
  status: 'needDirection' | 'ready' | 'needTarget' | 'outOfRange' | 'invalidGround' | 'unavailable';
  origin: Readonly<RaidPoint>;
  point: Readonly<RaidPoint> | null;
  range: number;
  radius: number;
  distance: number | null;
  target?: RaidTarget;
  count?: number;
  allies?: number;
}
export type Team = 0 | 1;
export interface RaidAction {
  readonly id: number;
  readonly tick: number;
  readonly slot: number;
  readonly hero: RaidHero;
  readonly skill: Skill | 'basic';
  readonly phase?: 'ground' | 'dash' | 'spin';
  readonly from: Readonly<RaidPoint>;
  readonly to: Readonly<RaidPoint>;
  readonly fromY: number;
  readonly toY: number;
}

export interface Runner extends RaidPoint, RaidControl {
  spinTicks: number;
  dash: RaidDash | null;
  readonly heroView: HeroView;
  slot: number;
  team: Team;
  hero: RaidHero;
  hp: number;
  rage: number;
  target: RaidTarget | null;
  lastStrike: RaidTarget | null;
  lastWard: number | null;
  side: number;
  brake: number;
  jumping: number;
  // Both endpoints describe fixed road positions in the wagon frame at takeoff.
  leap: Readonly<{ from: Readonly<RaidPoint>; to: Readonly<RaidPoint>; elapsed: number }> | null;
  respawn: number;
  basic: number;
  cooldowns: number[];
  shield: number;
  marked: number;
  kills: number;
  wagonDamage: number;
  deaths: number;
  assists: number;
}
export type RaidRunner = Readonly<Omit<Runner, 'cooldowns'>> & {
  readonly cooldowns: readonly number[];
};
export interface RaidView {
  readonly calls: readonly (Readonly<{ from: number; target: RaidTarget; until: number }> | null)[];
  readonly projectiles: readonly RaidProjectile[];
  readonly actions: readonly RaidAction[];
  readonly runners: readonly RaidRunner[];
  readonly damage: readonly number[];
  readonly leadChanges: number;
  readonly tick: number;
  readonly result: Readonly<{ reason: 'destruction' | 'time'; winner: Team | 'draw' }> | null;
  readonly hazard: RaidCounter | null;
}
