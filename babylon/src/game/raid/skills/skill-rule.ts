import type { HeroCombat } from '../heroes/hero-definition.ts';
import type { RaidPoint, RaidTarget, Skill } from '../raid-view.ts';
import type { RaidDirection } from '../raid-projectiles.ts';
import type {
  AreaAttack,
  DashStrike,
  DashPathAttack,
  DirectAttack,
  FieldAttack,
  NonAttacking,
  ProjectileAttack,
  SkillAttack,
} from './attack-rule.ts';

/** Input describes the player's gesture; attack describes what can hit after it succeeds. */
export interface SkillDefinition<K extends string, A extends SkillAttack> {
  readonly kind: K;
  readonly attack: A;
  readonly cooldownTicks?: number;
}
interface RangedSkill<K extends string, A extends SkillAttack> extends SkillDefinition<K, A> {
  readonly range: number;
}
export type SkillInfo =
  | (SkillDefinition<'pulse', NonAttacking | AreaAttack<'cast' | 'counter' | 'spinPulse'>> & {
      readonly recastDuringDash?: never;
    })
  | (RangedSkill<'pulse', AreaAttack<'dashEnd'>> & { readonly recastDuringDash: true })
  | RangedSkill<'ward', NonAttacking>
  | (RangedSkill<'target', DirectAttack | DashStrike> & { readonly allowAlly?: true })
  | RangedSkill<'field', FieldAttack>
  | RangedSkill<'leap', AreaAttack<'land'>>
  | SkillDefinition<'direction', ProjectileAttack>
  | RangedSkill<'direction', NonAttacking | DashPathAttack>;

export interface ResolvedCast {
  skill: Skill;
  point: RaidPoint;
  target?: RaidTarget;
  direction?: RaidDirection;
  radius: number;
  enemies: readonly RaidTarget[];
}
export type SkillKind = SkillInfo['kind'];
export type SkillCast<K extends SkillKind> = ResolvedCast &
  (K extends 'ward'
    ? { target: number }
    : K extends 'target'
      ? { target: RaidTarget }
      : K extends 'direction'
        ? { direction: RaidDirection }
        : {});
export type HeroSkill<S, Mode extends SkillKind = SkillKind> = {
  [K in Mode]: Extract<SkillInfo, { kind: K }> & {
    apply?(combat: HeroCombat, cast: SkillCast<K>, state: S): number | void;
  };
}[Mode];
