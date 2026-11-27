import { HERO_IDS, type RaidHero } from './heroes/hero-id.ts';

export interface DraftSeat {
  actor: number;
  hero: RaidHero | null;
}
export interface RaidSeat extends DraftSeat {
  hero: RaidHero;
}
export function isHero(value: unknown): value is RaidHero {
  return HERO_IDS.some((hero) => hero === value);
}
export function isDraft(value: unknown): value is DraftSeat[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return false;
  const claimed = new Set<RaidHero>();
  return value.every((seat, i) => {
    if (!seat || !Number.isSafeInteger(seat.actor) || seat.actor <= (i ? value[i - 1].actor : 0))
      return false;
    if (seat.hero === null) return true;
    if (!isHero(seat.hero) || claimed.has(seat.hero)) return false;
    claimed.add(seat.hero);
    return true;
  });
}
export function isRaidRoster(value: unknown): value is RaidSeat[] {
  return isDraft(value) && value.length >= 2 && value.every((s) => s.hero !== null);
}
/** Authority preserves existing locks across joins, departures and lobby host changes. */
export function draftMembers(
  previous: readonly DraftSeat[],
  actors: readonly number[],
): DraftSeat[] {
  return [...actors]
    .sort((a, b) => a - b)
    .map((actor) => ({ actor, hero: previous.find((s) => s.actor === actor)?.hero ?? null }));
}
/** The sender may release their own seat or claim a free runner, in receive order. */
export function applyPick(seats: DraftSeat[], actor: number, hero: unknown): boolean {
  const seat = seats.find((s) => s.actor === actor);
  if (
    !seat ||
    (hero !== null && (!isHero(hero) || seat.hero !== null || seats.some((s) => s.hero === hero)))
  )
    return false;
  seat.hero = hero;
  return true;
}
