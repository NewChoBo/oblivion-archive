import { RAID_SKILL_RANGE } from '../raid-rules.ts';
import type { CombatRead, HeroCombat } from '../heroes/hero-definition.ts';
import type { HeroSkill, ResolvedCast, SkillCast } from './skill-rule.ts';
import type { ProjectileProfile } from '../raid-projectiles.ts';
export const selfRadius = (combat: CombatRead) => combat.stats.radius;
export const fieldRadius = (combat: CombatRead) => combat.stats.radius + 0.6;
export const nearby = (combat: CombatRead, center: ResolvedCast['point'], radius: number) =>
  combat.enemies(center, radius);
export function sweep(multiplier: number): HeroSkill<unknown> {
  return {
    kind: 'pulse',
    radius: selfRadius,
    targets: nearby,
    apply(combat, cast) {
      combat.record(cast.skill, combat.self, 'ground');
      for (const id of cast.enemies) combat.strike(id, combat.stats.power * multiplier, cast.skill);
    },
  };
}
export const field: HeroSkill<unknown> = {
  kind: 'field',
  range: RAID_SKILL_RANGE.field,
  radius: fieldRadius,
  targets: nearby,
  apply(combat, cast) {
    combat.record(cast.skill, cast.point, 'ground');
    combat.placeField(cast.skill, cast.point, cast.radius);
    for (const id of cast.enemies) combat.strike(id, combat.stats.power * 3, cast.skill);
  },
};
export function bolt(
  multiplier: number,
  after?: (combat: HeroCombat, cast: SkillCast<'target'>) => void,
): HeroSkill<unknown> {
  return {
    kind: 'target',
    range: RAID_SKILL_RANGE.shot,
    apply(combat, cast) {
      combat.record(cast.skill, cast.point);
      combat.strike(cast.target, combat.stats.power * multiplier, cast.skill, true);
      after?.(combat, cast);
    },
  };
}
export function projectile(profile: ProjectileProfile, multiplier: number): HeroSkill<unknown> {
  return {
    kind: 'direction',
    range: profile.reach,
    projectile: profile,
    onProjectileHit(combat, id, skill) {
      combat.strike(id, combat.stats.power * multiplier, skill);
    },
    apply(combat, cast) {
      combat.fire(cast.skill, cast.direction, profile);
    },
  };
}
export function spin(ticks: number): HeroSkill<unknown> {
  return {
    kind: 'pulse',
    radius: selfRadius,
    apply(combat, cast) {
      combat.self.spinTicks = ticks;
      combat.self.slowed = 0;
      combat.record(cast.skill, combat.self);
    },
  };
}
