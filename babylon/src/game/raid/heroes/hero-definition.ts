import type { RaidAction, RaidPoint, RaidRunner, Runner, RaidTarget, Skill } from '../raid-view.ts';
import type { FieldPulse, HitRule, ProjectileAttack } from '../skills/attack-rule.ts';
import type { RaidDirection } from '../raid-projectiles.ts';
import { applySkill } from '../skills/skill-execution.ts';
import type { HeroSkill, SkillInfo, ResolvedCast } from '../skills/skill-rule.ts';

export interface HeroStats {
  readonly hp: number;
  readonly power: number;
  readonly reach: number;
  readonly cooldown: number;
  readonly radius: number;
}
export interface HeroView {
  readonly poisonArmed?: boolean;
  readonly comboPoints?: number;
  readonly ultimateRecasts?: number;
  readonly slashes?: number;
  readonly empoweredUntil?: number;
  readonly guardUntil?: number;
  readonly quarry?: RaidTarget | null;
  readonly rootedTicks?: number;
  readonly rootDuration?: number;
}
export interface CombatRead {
  readonly self: RaidRunner;
  tick(): number;
  readonly stats: HeroStats;
  position(target: RaidTarget): RaidRunner | RaidPoint | undefined;
  enemies(center: RaidPoint, radius: number): RaidTarget[];
  height(runner: RaidRunner): number;
}
export interface HeroCombat extends CombatRead {
  readonly self: Runner;
  facing(target?: RaidTarget): number;
  record(skill: Skill, point: RaidPoint, phase?: RaidAction['phase']): void;
  strike(target: RaidTarget, hit: HitRule, skill: Skill, designated?: boolean): void;
  placeField(skill: Skill, center: RaidPoint, radius: number, pulse: FieldPulse): void;
  dash(skill: Skill, to: RaidPoint, ticks: number, target?: RaidTarget): void;
  finishDash(): void;
  counter(skill: Skill): void;
  fire(skill: Skill, direction: RaidDirection, attack: ProjectileAttack): void;
  gainRage(amount: number): void;
  heal(ally: number, amount: number): void;
  shield(ally: number, ticks: number, replace?: boolean): void;
  shieldRecipients(): number[];
  canTarget(id: RaidTarget): boolean;
}
export interface Hit {
  from: number | null;
  target: RaidTarget;
  amount: number;
  skill?: Skill;
  designated?: boolean;
  rule?: HitRule;
}
/** Synchronous participant hooks. The defender can consume a hit before attacker modifiers
 * run. Damage-dealt receives the final amount on an opposing runner, after shields. */
export interface HeroEvents {
  readonly view?: HeroView;
  onCast?(combat: HeroCombat, skill: Skill): void;
  onTimersAdvanced?(combat: HeroCombat): void;
  onDashEnd?(combat: HeroCombat, target?: RaidTarget): void;
  onBasicAttack?(combat: HeroCombat): { amount: number; cooldown: number };
  onIncomingHit?(combat: HeroCombat, hit: Hit): boolean;
  onOutgoingHit?(combat: HeroCombat, hit: Hit, victim?: Runner): number;
  onDamageDealt?(combat: HeroCombat, hit: Hit, victim: Runner, damage: number): void;
  resistsControl?(runner: RaidRunner): boolean;
  onRespawn?(combat: HeroCombat): void;
  onTickEnd?(combat: HeroCombat): void;
}
type Slots<T> = readonly [T, T, T, T];
export interface RaidHeroRuntime {
  readonly events: HeroEvents;
  cast(combat: HeroCombat, cast: ResolvedCast): number | void;
}
export interface RaidHeroDefinition {
  readonly stats: HeroStats;
  readonly skills: Slots<SkillInfo>;
  basicReach(runner: RaidRunner, tick: number): number;
  create(): RaidHeroRuntime;
}
// Rules are shared. Only the participant's bound callbacks can reach its private counters.
export function defineHero<S extends HeroEvents>(
  stats: HeroStats,
  create: () => S,
  skills: Slots<HeroSkill<NoInfer<S>>>,
  basicReach: RaidHeroDefinition['basicReach'] = () => stats.reach,
): RaidHeroDefinition {
  return {
    stats,
    skills,
    basicReach,
    create() {
      const events = create();
      return {
        events,
        cast: (combat, cast) => applySkill(skills[cast.skill], combat, cast, events),
      };
    },
  };
}
