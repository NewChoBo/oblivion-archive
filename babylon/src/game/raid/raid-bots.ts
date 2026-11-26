import { RAID_COUNTERS, inRaidCounter } from './raid-boss.ts';
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
  type RaidRunner,
} from './raid-match.ts';
import type { RaidOrder } from './raid-feature.ts';

const soloSlot = new Set([0]);

/** Bots see the same positions, danger warning and target availability as a local player. */
export function driveRaidBots(
  view: Pick<RaidMatch, 'runners' | 'damage' | 'tick' | 'hazard' | 'canTarget' | 'canShield'>,
  send: RaidOrder,
  humanSlots: ReadonlySet<number> = soloSlot,
) {
  for (const r of view.runners) {
    if (humanSlots.has(r.slot)) continue;
    // Mirror the two formation positions across teams. Both teams open on the objective.
    const rank = r.slot % 2;
    if (r.respawn || (view.tick + rank * 4) % 8 !== 0) continue;
    let nearest: RaidRunner | undefined;
    let nearestDistance = Infinity;
    for (const other of view.runners) {
      if (!view.canTarget(r.slot, other.slot)) continue;
      const distance = Math.hypot(other.x - r.x, other.z - r.z);
      if (distance < nearestDistance) {
        nearest = other;
        nearestDistance = distance;
      }
    }
    const phase = Math.floor(view.tick / (8 * RAID_HZ)) % 3;
    const duel =
      nearest && (nearest.hp < 32 || (phase === 1 && rank === 1) || (phase === 2 && rank === 0));
    // A team trailing by a fifth of the boss's health returns to the scoring objective.
    const behind = view.damage[1 - r.team]! - view.damage[r.team]! > WAGON_HP * 0.2;
    const target = duel && !behind ? nearest : undefined;
    const partner = view.runners.find((other) => other.team === r.team && other.slot !== r.slot)!;
    let goalX = target?.x ?? (r.team === 0 ? -1 : 1) * (r.slot % 2 ? 1.8 : 0.65);
    const counter = view.hazard;
    if (
      counter?.kind === 'mortar' &&
      counter.phase === 'warning' &&
      Math.abs(r.z - counter.z) <= RAID_COUNTERS.mortar.radius + 1
    ) {
      const offset = RAID_COUNTERS.mortar.radius + 0.7;
      const left = counter.x - offset,
        right = counter.x + offset;
      goalX = left < -5 || (right <= 5 && r.x > counter.x) ? right : left;
    }
    send(r.slot, 'move', {
      side: Math.abs(goalX - r.x) < 0.5 ? 0 : Math.sign(goalX - r.x),
      walk: !target && partner.respawn > 0 && r.hp < 40 && r.z > 0,
    });
    if (
      counter?.kind === 'lane' &&
      counter.phase === 'warning' &&
      counter.ticks <= 16 &&
      inRaidCounter(counter, r)
    )
      send(r.slot, 'jump');
    if (counter?.kind === 'wave') {
      const arrival =
        (counter.phase === 'warning' ? counter.ticks : 0) +
        (counter.z - r.z) / RAID_COUNTERS.wave.metresPerTick;
      if (arrival >= 0 && arrival <= 16) send(r.slot, 'jump');
    }
    send(r.slot, 'lock', target?.slot ?? 'wagon');
    // Space casts just over a second apart. Steering and hazard reactions still run every eight ticks.
    if (r.staggered || r.silenced || view.tick < RAID_HZ || (view.tick + rank * 20) % 32 !== 0)
      continue;
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
    else if (skill === 0 && r.hero === 'jade') {
      const healPartner =
        view.canShield(r.slot, partner.slot) &&
        partner.hp / HEROES[partner.hero].hp < r.hp / HEROES[r.hero].hp;
      send(r.slot, 'cast', { skill, ally: healPartner ? partner.slot : r.slot });
    } else if (skill === 0) send(r.slot, 'cast', { skill });
    else send(r.slot, 'cast', { skill, target: target?.slot ?? 'wagon' });
  }
}
