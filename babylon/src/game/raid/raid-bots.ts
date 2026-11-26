import { raidProjectileProfile } from './raid-projectiles.ts';
import {
  HEROES,
  RAID_HZ,
  RAID_LEAP_TICKS,
  RAID_SKILL_RANGE,
  raidRoadTravel,
  WAGON,
  WAGON_HP,
  type Skill,
  type RaidMatch,
} from './raid-match.ts';
export type RaidOrder = (
  slot: number,
  action: 'move' | 'jump' | 'lock' | 'cast',
  payload?: unknown,
) => void;

/** Bots see the same positions, danger warning and target availability as a local player. */
export function driveRaidBots(
  view: Pick<RaidMatch, 'runners' | 'damage' | 'tick' | 'hazard' | 'canTarget' | 'canShield'>,
  send: RaidOrder,
) {
  for (const r of view.runners.slice(1)) {
    // Mirror the two formation positions across teams. Both teams open on the objective.
    const rank = r.slot % 2;
    if (r.respawn || (view.tick + rank * 4) % 8 !== 0) continue;
    const opponents = view.runners.filter((other) => view.canTarget(r.slot, other.slot));
    const nearest = opponents.sort(
      (a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z),
    )[0];
    const phase = Math.floor(view.tick / (8 * RAID_HZ)) % 3;
    const duel =
      nearest && (nearest.hp < 32 || (phase === 1 && rank === 1) || (phase === 2 && rank === 0));
    // A team trailing by a fifth of the boss's health returns to the scoring objective.
    const behind = view.damage[1 - r.team]! - view.damage[r.team]! > WAGON_HP * 0.2;
    const target = duel && !behind ? nearest : undefined;
    const partner = view.runners.find((other) => other.team === r.team && other.slot !== r.slot)!;
    const goalX = target?.x ?? (r.team === 0 ? -1 : 1) * (r.slot % 2 ? 1.8 : 0.65);
    send(r.slot, 'move', {
      side: Math.abs(goalX - r.x) < 0.5 ? 0 : Math.sign(goalX - r.x),
      walk: !target && partner.respawn > 0 && r.hp < 40 && r.z > 0,
    });
    if (view.hazard && Math.abs(view.hazard.x - r.x) < 1.25 && view.hazard.ticks <= 16)
      send(r.slot, 'jump');
    send(r.slot, 'lock', target?.slot ?? 'wagon');
    // Space casts just over a second apart. Steering and hazard reactions still run every eight ticks.
    if (r.silenced || view.tick < RAID_HZ || (view.tick + rank * 20) % 32 !== 0) continue;
    const point = target ?? WAGON;
    const needsHealing =
      r.hero === 'jade' &&
      (r.hp <= HEROES.jade.hp - 15 ||
        (partner.hp <= HEROES[partner.hero].hp - 15 && view.canShield(r.slot, partner.slot)));
    const distance = Math.hypot(point.x - r.x, point.z - r.z);
    // The marker is a road tile. Lead the moving formation by the road travel during the jump.
    const leapAim = { x: point.x, z: point.z + raidRoadTravel(RAID_LEAP_TICKS) };
    const canLeap =
      !r.jumping && Math.hypot(leapAim.x - r.x, leapAim.z - r.z) <= RAID_SKILL_RANGE.leap;
    const pulseRange = raidProjectileProfile(r.hero, 0)?.reach ?? HEROES[r.hero].radius;
    const usePulse =
      r.hero === 'hammer' ? canLeap : r.hero === 'jade' ? needsHealing : distance <= pulseRange;
    let skill: Skill;
    if (r.rage === 100 && !r.cooldowns[3]) skill = 3;
    else if (usePulse && !r.cooldowns[0]) skill = 0;
    else if (!r.cooldowns[1]) skill = 1;
    else if (!r.cooldowns[2]) skill = 2;
    else continue;
    if (skill === 0 && r.hero === 'hammer') send(r.slot, 'cast', { skill, ...leapAim });
    else if (skill === 2) send(r.slot, 'cast', { skill, x: point.x, z: point.z });
    else if (raidProjectileProfile(r.hero, skill))
      send(r.slot, 'cast', { skill, dx: point.x - r.x, dz: point.z - r.z });
    else send(r.slot, 'cast', { skill });
  }
}
