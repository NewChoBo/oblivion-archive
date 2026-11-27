import { unitDirection, type RaidDirection } from '../raid-projectiles.ts';
import { distance } from '../raid-rules.ts';
import type { RaidAim, RaidPoint, RaidTarget, Skill } from '../raid-view.ts';
import type { CombatRead } from '../heroes/hero-definition.ts';
import type { ResolvedCast, SkillInfo } from './skill-rule.ts';

export interface TargetRead extends CombatRead {
  targetPoint(id: RaidTarget): RaidPoint | null;
  canTarget(id: RaidTarget): boolean;
  canShield(id: number): boolean;
  alliesInArea(center: RaidPoint, radius: number): number;
}
// Prediction and authoritative execution resolve the same footprint in wagon-relative metres.
export function resolveSkill(
  combat: TargetRead,
  rule: SkillInfo,
  skill: Skill,
  available: boolean,
  ground: RaidPoint | null,
  id?: RaidTarget,
  rawDirection?: RaidDirection,
) {
  const { kind } = rule;
  const radius = rule.radius?.(combat) ?? 0;
  const range = rule.recastDuringDash && combat.self.dash ? radius : (rule.range ?? radius);
  const target = kind === 'target' || kind === 'ward' ? id : undefined;
  const point =
    kind === 'pulse' ? combat.self : target === undefined ? ground : combat.targetPoint(target);
  const metres = point ? distance(combat.self, point) : null;
  let status: RaidAim['status'] = 'ready';
  const direction =
    kind === 'direction' && point
      ? unitDirection(
          rawDirection?.dx ?? point.x - combat.self.x,
          rawDirection?.dz ?? point.z - combat.self.z,
        )
      : null;
  if (!available) status = 'unavailable';
  else if (kind === 'direction') {
    if (!direction) status = 'needDirection';
  } else if (metres !== null && metres > range) status = 'outOfRange';
  else if ((kind === 'field' || kind === 'leap') && (metres === null || !Number.isFinite(metres)))
    status = 'invalidGround';
  else if (kind === 'target' && (target === undefined || !combat.canTarget(target)))
    status = 'needTarget';
  else if (kind === 'ward' && (typeof target !== 'number' || !combat.canShield(target)))
    status = 'needTarget';
  const enemies =
    point && radius > 0 && status === 'ready' ? rule.targets?.(combat, point, radius) : undefined;
  const preview: RaidAim = {
    kind,
    status,
    origin: combat.self,
    point,
    range,
    radius,
    distance: metres,
    target,
    spread: rule.projectile?.angles.at(-1),
    dash: !!rule.dash,
    count: enemies?.length,
    allies:
      point && status === 'ready' && rule.healsField
        ? combat.alliesInArea(point, radius)
        : undefined,
  };
  const resolved: ResolvedCast | null =
    status === 'ready' && point
      ? {
          skill,
          target,
          direction: direction ?? undefined,
          point: direction
            ? { x: combat.self.x + direction.dx * range, z: combat.self.z + direction.dz * range }
            : point,
          radius,
          enemies: enemies ?? [],
        }
      : null;
  return { preview, resolved };
}
export type SkillInput = RaidPoint | RaidTarget | RaidDirection;
export function castInput(
  rule: SkillInfo,
  runner: RaidPoint,
  input?: SkillInput,
): { point: RaidPoint | null; target?: RaidTarget; direction?: RaidDirection } | null {
  switch (rule.kind) {
    case 'pulse':
      return input === undefined ? { point: null } : null;
    case 'direction': {
      if (!input || typeof input !== 'object' || !('dx' in input)) return null;
      return { point: { x: runner.x + input.dx, z: runner.z + input.dz }, direction: input };
    }
    case 'ward':
      return typeof input === 'number' ? { point: null, target: input } : null;
    case 'target':
      return typeof input === 'number' || input === 'wagon' ? { point: null, target: input } : null;
    case 'leap':
    case 'field':
      return input && typeof input === 'object' && 'x' in input ? { point: input } : null;
  }
}
