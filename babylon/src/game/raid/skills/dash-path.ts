import { RAID_TARGETS } from '../raid-rules.ts';
import type { RaidPoint, RaidTarget, Skill } from '../raid-view.ts';
import type { HeroCombat } from '../heroes/hero-definition.ts';
import type { DashPathAttack } from './attack-rule.ts';

// Closest approach in the moving target's frame, including both endpoints of this tick.
export function strikeAlongDash(
  combat: HeroCombat,
  skill: Skill,
  attack: DashPathAttack,
  struck: RaidTarget[],
  previous: readonly RaidPoint[],
) {
  const caster = combat.self;
  const start = previous[caster.slot]!;
  for (const id of RAID_TARGETS) {
    const target = combat.position(id);
    if (!target || struck.includes(id)) continue;
    const old = id === 'wagon' ? target : previous[id]!;
    const x = start.x - old.x,
      z = start.z - old.z;
    const dx = caster.x - target.x - x,
      dz = caster.z - target.z - z;
    const length2 = dx * dx + dz * dz;
    const fraction = length2 ? Math.max(0, Math.min(1, -(x * dx + z * dz) / length2)) : 0;
    if (Math.hypot(x + dx * fraction, z + dz * fraction) <= attack.halfWidth) {
      struck.push(id);
      combat.strike(id, attack.hit, skill);
    }
  }
}
