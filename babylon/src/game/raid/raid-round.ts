import { GameSession } from '../session/game-session.ts';
import { driveRaidBots, type RaidOrder } from './raid-bots.ts';
import { createRaidFeature } from './raid-feature.ts';
import { HERO_IDS, RaidMatch, type RaidHero } from './raid-match.ts';

export interface RaidSeat {
  actor: number;
  hero: RaidHero;
}
export const seatOrder = [0, 2, 1, 3] as const;
export function isHero(value: unknown): value is RaidHero {
  return HERO_IDS.some((hero) => hero === value);
}
export function raidSeats(players: readonly { actor: number; preference: unknown }[]): RaidSeat[] {
  const free = new Set(HERO_IDS);
  return [...players]
    .sort((a, b) => a.actor - b.actor)
    .map(({ actor, preference }) => {
      const hero = isHero(preference) && free.has(preference) ? preference : [...free][0]!;
      free.delete(hero);
      return { actor, hero };
    });
}
export function isRaidRoster(value: unknown): value is RaidSeat[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 4 &&
    value.every(
      (p, i) =>
        p &&
        Number.isSafeInteger(p.actor) &&
        p.actor > (i ? value[i - 1].actor : 0) &&
        isHero(p.hero),
    ) &&
    new Set(value.map((p) => p.hero)).size === value.length
  );
}
type Action = Parameters<RaidOrder>[1];
interface Order {
  slot: number;
  action: Action;
  payload: unknown;
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function action(v: unknown): v is Action {
  return v === 'move' || v === 'jump' || v === 'lock' || v === 'cast';
}
export interface RaidFrames {
  tick: number;
  frames: Order[][];
}
const perSeatLimit = 12;
export class RaidRound {
  readonly match: RaidMatch;
  readonly #slots = new Map<number, number>();
  readonly #human: Set<number>;
  readonly #session: GameSession<{ slot: number }>;
  readonly #seq = new Map<number, number>();
  #pending: Order[] = [];
  constructor(roster: RaidSeat[]) {
    if (!isRaidRoster(roster)) throw new Error('Invalid raid roster');
    const vacant = HERO_IDS.filter((hero) => !roster.some((p) => p.hero === hero));
    const heroes = Array.from({ length: 4 }, (_, slot) => {
      const seat = roster[seatOrder.findIndex((s) => s === slot)];
      if (!seat) return vacant.shift()!;
      this.#slots.set(seat.actor, slot);
      return seat.hero;
    });
    this.match = new RaidMatch(heroes);
    this.#human = new Set(this.#slots.values());
    this.#session = new GameSession([createRaidFeature(this.match)]);
    for (const r of this.match.runners) this.#session.addPlayer(String(r.slot), { slot: r.slot });
  }
  slot(actor: number) {
    return this.#slots.get(actor);
  }
  // Only the transport's authenticated sender identifies the player.
  enqueue(actor: number, input: unknown) {
    const slot = this.slot(actor);
    if (
      slot === undefined ||
      !record(input) ||
      !action(input.action) ||
      typeof input.seq !== 'number' ||
      !Number.isSafeInteger(input.seq) ||
      input.seq <= (this.#seq.get(actor) ?? 0) ||
      this.#pending.filter((o) => o.slot === slot).length >= perSeatLimit
    )
      return false;
    this.#seq.set(actor, input.seq);
    this.#pending.push({ slot, action: input.action, payload: input.payload ?? null });
    return true;
  }
  #dispatch = (slot: number, action: Action, payload?: unknown) =>
    this.#session.dispatch(String(slot), { kind: 'raid.' + action, payload }).ok;
  #step() {
    driveRaidBots(this.match, this.#dispatch, this.#human);
    this.match.step();
  }
  advance(ticks: number): RaidFrames {
    const batch: RaidFrames = { tick: this.match.tick, frames: [] };
    for (let i = 0; i < ticks && !this.match.result; i++) {
      batch.frames.push(this.#pending.filter((o) => this.#dispatch(o.slot, o.action, o.payload)));
      this.#pending = [];
      this.#step();
    }
    return batch;
  }
  replay(batch: unknown): boolean {
    if (
      !record(batch) ||
      batch.tick !== this.match.tick ||
      !Array.isArray(batch.frames) ||
      batch.frames.length < 1 ||
      batch.frames.length > 6
    )
      return false;
    for (const frame of batch.frames) {
      if (this.match.result || !Array.isArray(frame) || frame.length > perSeatLimit * 4)
        return false;
      for (const o of frame) {
        if (
          !record(o) ||
          typeof o.slot !== 'number' ||
          !this.#human.has(o.slot) ||
          !action(o.action) ||
          !this.#dispatch(o.slot, o.action, o.payload)
        )
          return false;
      }
      this.#step();
    }
    return true;
  }
}
