import { WAGON, type RaidView } from './raid-match.ts';
export type RaidOrder = (
  slot: number,
  action: 'move' | 'jump' | 'lock' | 'cast',
  payload?: unknown,
) => void;

/** Bots see the same positions, danger warning and target availability as a local player. */
export function driveRaidBots(view: RaidView, send: RaidOrder) {
  for (const r of view.runners.slice(1)) {
    if (r.respawn || (view.tick + r.slot * 2) % 8 !== 0) continue;
    const opponents = view.runners.filter((other) => other.team !== r.team && !other.respawn);
    const nearest = opponents.sort(
      (a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z),
    )[0];
    const duel = nearest && (nearest.hp < 32 || (Math.floor(view.tick / 180) + r.slot) % 3 === 0);
    const target = duel ? nearest : undefined;
    const partner = view.runners.find((other) => other.team === r.team && other.slot !== r.slot)!;
    const goalX = target?.x ?? (r.team === 0 ? -1 : 1) * (r.slot % 2 ? 1.8 : 0.65);
    send(r.slot, 'move', {
      side: Math.abs(goalX - r.x) < 0.5 ? 0 : Math.sign(goalX - r.x),
      walk: target ? r.z > target.z + 1 : partner.respawn > 0 && r.hp < 40 && r.z > 0,
    });
    if (
      view.hazard &&
      Math.abs(view.hazard.x - r.x) < 1.25 &&
      view.hazard.ticks <= 16 &&
      r.slot !== Math.floor(view.tick / 132) % 4
    )
      send(r.slot, 'jump');
    send(r.slot, 'lock', target?.slot ?? 'wagon');
    const point = target ?? WAGON;
    if (r.rage === 100) send(r.slot, 'cast', { skill: 3 });
    if (Math.hypot(point.x - r.x, point.z - r.z) < 3) send(r.slot, 'cast', { skill: 0 });
    send(r.slot, 'cast', { skill: 1 });
    send(r.slot, 'cast', { skill: 2, x: point.x, z: point.z });
  }
}
