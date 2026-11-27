import type { Skill } from '../raid-view.ts';
import type { CombatRead } from '../heroes/hero-definition.ts';
import { areaRadius } from './attack-area.ts';
import { attackArea } from './attack-rule.ts';
import type { SkillInfo } from './skill-rule.ts';

export interface SkillRange {
  /** Maximum input or travel distance, and horizontal impact radius, in metres. */
  readonly range: number;
  readonly radius: number;
}

export function measureSkill(rule: SkillInfo, combat: CombatRead, slot: Skill): SkillRange {
  const { attack } = rule;
  const area = attackArea(attack);
  const recast = rule.kind === 'pulse' && rule.recastDuringDash && combat.self.dash?.skill === slot;
  const hidden =
    attack.kind === 'area' && (attack.on === 'counter' || (attack.on === 'dashEnd' && !recast));
  const radius = area && !hidden ? areaRadius(area, combat) : 0;
  if (attack.kind === 'projectile') return { range: attack.flight.reach, radius };
  return { range: !recast && 'range' in rule ? (rule.range ?? radius) : radius, radius };
}
