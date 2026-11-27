import { RAID_SKILL_RANGE } from '../raid-rules.ts';
import type { HeroCombat } from '../heroes/hero-definition.ts';
import type { HeroSkill, SkillCast } from './skill-rule.ts';
import { casterCircle, fieldCircle } from './attack-area.ts';
import type { AreaHit, AreaAttack, FieldPulse, HitRule, ProjectileProfile } from './attack-rule.ts';

export function sweep(hit: HitRule): HeroSkill<unknown, 'pulse'> {
  return {
    kind: 'pulse',
    attack: { kind: 'area', on: 'cast', area: casterCircle, hit },
    apply(combat, cast) {
      combat.record(cast.skill, combat.self, 'ground');
    },
  };
}
export function field(
  hit: HitRule = { powerScale: 3 },
  pulse?: FieldPulse,
): HeroSkill<unknown, 'field'> {
  return {
    kind: 'field',
    range: RAID_SKILL_RANGE.field,
    attack: { kind: 'field', area: fieldCircle, hit, pulse },
    apply(combat, cast) {
      combat.record(cast.skill, cast.point, 'ground');
    },
  };
}
export function bolt(
  hit: HitRule,
  options: {
    range?: number;
    splash?: AreaHit;
    onCast?: (combat: HeroCombat, cast: SkillCast<'target'>) => void;
  } = {},
): HeroSkill<unknown, 'target'> {
  return {
    kind: 'target',
    range: options.range ?? RAID_SKILL_RANGE.shot,
    attack: { kind: 'direct', on: 'cast', hit, splash: options.splash },
    apply(combat, cast) {
      combat.record(cast.skill, cast.point);
      options.onCast?.(combat, cast);
    },
  };
}
export function projectile(
  flight: ProjectileProfile,
  hit: HitRule,
): HeroSkill<unknown, 'direction'> {
  return { kind: 'direction', attack: { kind: 'projectile', flight, hit } };
}
export function spin(ticks: number, attack: AreaAttack<'spinPulse'>): HeroSkill<unknown, 'pulse'> {
  return {
    kind: 'pulse',
    attack,
    apply(combat, cast) {
      combat.self.spin = { skill: cast.skill, remaining: ticks, interval: 15 };
      combat.self.slowed = 0;
      combat.record(cast.skill, combat.self);
    },
  };
}
