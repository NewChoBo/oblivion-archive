import type { SkillKind } from './skills/skill-rule.ts';
import type { HeroView } from './heroes/hero-definition.ts';
import type { RaidHero } from './heroes/hero-id.ts';
import type { RaidControl } from './raid-control.ts';
import type { RaidCounter } from './raid-boss.ts';
import type { RaidProjectile } from './raid-projectiles.ts';
import type { ProjectileProfile } from './skills/attack-rule.ts';
export interface RaidDash {
  skill: Skill;
  // Road endpoints in the wagon frame at cast time, including the sampled aim of a targeted dash.
  from: RaidPoint;
  to: RaidPoint;
  elapsed: number;
  ticks: number;
  target?: RaidTarget;
  readonly struck?: RaidTarget[];
}
/** Positions are metres relative to the moving wagon, +Z in the direction of travel. */
export interface RaidPoint {
  x: number;
  z: number;
}
export type RaidTarget = 'wagon' | number;
/** Effective HP delta at the impact position, in the wagon frame. A null source is the boss. */
export interface RaidHealthChange extends Readonly<RaidPoint> {
  readonly tick: number;
  readonly from: number | null;
  readonly target: RaidTarget;
  readonly amount: number;
  readonly elevation: number;
}
export type Skill = 0 | 1 | 2 | 3;
export interface RaidAim {
  kind: SkillKind;
  flight?: Pick<ProjectileProfile, 'angles' | 'guide'>;
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
  // Capture the footprint at emission so later buffs or movement cannot resize an old impact.
  readonly footprint?: { readonly radius: number; readonly halfAngle?: number };
  readonly fromY: number;
  readonly toY: number;
}

export interface Runner extends RaidPoint, RaidControl {
  readonly spinTicks: number;
  spin: { skill: Skill; remaining: number; interval: number } | null;
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
  leap: Readonly<{
    skill: Skill;
    from: Readonly<RaidPoint>;
    to: Readonly<RaidPoint>;
    elapsed: number;
  }> | null;
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
  readonly healthChanges: readonly RaidHealthChange[];
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
