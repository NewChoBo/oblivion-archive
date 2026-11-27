import type { HeroCombat } from '../heroes/hero-definition.ts';
import type { RaidTarget, Skill } from '../raid-view.ts';
import { distance } from '../raid-rules.ts';
import type { AreaHit, AreaAttack, SkillAttack } from './attack-rule.ts';
import { areaTargets, areaRadius } from './attack-area.ts';
import type { HeroSkill, ResolvedCast } from './skill-rule.ts';

function strikeArea(combat: HeroCombat, attack: AreaHit, skill: Skill) {
  for (const id of areaTargets(combat, attack.area, combat.self, areaRadius(attack.area, combat)))
    combat.strike(id, attack.hit, skill);
}
// Motion and defense publish impact events for the slot that started them.
export function triggerAttack(
  combat: HeroCombat,
  skill: Skill,
  attack: SkillAttack,
  event: Exclude<AreaAttack['on'], 'cast'>,
  target?: RaidTarget,
) {
  if (attack.kind === 'area' && attack.on === event) strikeArea(combat, attack, skill);
  if (
    attack.kind === 'direct' &&
    attack.on === 'dashEnd' &&
    event === 'dashEnd' &&
    target !== undefined
  ) {
    const point = combat.position(target);
    if (point && distance(combat.self, point) <= attack.contactRange)
      combat.strike(target, attack.hit, skill, true);
  }
}
// The registered attack drives both prediction and execution, including for a customized factory skill.
// A successful slot may update its caster or start motion before its immediate impact is queued.
export function applySkill<S>(
  rule: HeroSkill<S>,
  combat: HeroCombat,
  cast: ResolvedCast,
  state: S,
) {
  switch (rule.kind) {
    case 'direction': {
      if (!cast.direction) break;
      const cooldown = rule.apply?.(combat, { ...cast, direction: cast.direction }, state);
      if (rule.attack.kind === 'projectile') combat.fire(cast.skill, cast.direction, rule.attack);
      return cooldown;
    }
    case 'ward':
      if (typeof cast.target === 'number')
        return rule.apply?.(combat, { ...cast, target: cast.target }, state);
      break;
    case 'target': {
      if (cast.target === undefined) break;
      const cooldown = rule.apply?.(combat, { ...cast, target: cast.target }, state);
      const attack = rule.attack;
      if (attack.on === 'cast') {
        combat.strike(cast.target, attack.hit, cast.skill, true);
        if (attack.splash) {
          for (const id of areaTargets(combat, attack.splash.area, cast.point, cast.radius))
            if (id !== cast.target && combat.canTarget(id))
              combat.strike(id, attack.splash.hit, cast.skill);
        }
      }
      return cooldown;
    }
    case 'field':
    case 'leap':
    case 'pulse': {
      const cooldown = rule.apply?.(combat, cast, state);
      const attack = rule.attack;
      if (attack.kind === 'field' && attack.pulse)
        combat.placeField(cast.skill, cast.point, cast.radius, attack.pulse);
      if (attack.kind === 'field' || (attack.kind === 'area' && attack.on === 'cast')) {
        for (const id of cast.enemies) combat.strike(id, attack.hit, cast.skill);
      }
      return cooldown;
    }
  }
  throw new Error('Missing resolved skill input: ' + rule.kind);
}
