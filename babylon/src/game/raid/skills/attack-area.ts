import type { CombatRead } from '../heroes/hero-definition.ts';
import type { RaidPoint } from '../raid-view.ts';

/** Horizontal metres in the wagon frame. Sectors face forward (+Z), with angles in radians. */
interface AreaRange {
  readonly radius: number | ((read: CombatRead) => number);
}
export interface CircleArea extends AreaRange {
  readonly kind: 'circle';
}
export interface SectorArea extends AreaRange {
  readonly kind: 'sector';
  readonly halfAngle: number;
  readonly belowHeight?: number;
}
export type AttackArea = CircleArea | SectorArea;
export const casterCircle: CircleArea = { kind: 'circle', radius: (read) => read.stats.radius };
export const fieldCircle: CircleArea = {
  kind: 'circle',
  radius: (read) => read.stats.radius + 0.6,
};
export function areaRadius(area: AttackArea, read: CombatRead) {
  return typeof area.radius === 'number' ? area.radius : area.radius(read);
}
export function areaTargets(read: CombatRead, area: AttackArea, center: RaidPoint, radius: number) {
  const enemies = read.enemies(center, radius);
  if (area.kind === 'circle') return enemies;
  return enemies.filter((id) => {
    const point = read.position(id)!;
    if (
      area.belowHeight !== undefined &&
      'jumping' in point &&
      read.height(point) >= area.belowHeight
    )
      return false;
    return Math.atan2(Math.abs(point.x - center.x), point.z - center.z) <= area.halfAngle;
  });
}
