import type { RaidCommandName } from './raid-feature.ts';
import { RaidSimulation } from './raid-simulation.ts';
import { HERO_IDS, RaidMatch } from './raid-match.ts';
import { isRaidRoster, type RaidSeat } from './raid-draft.ts';

export const seatOrder = [0, 2, 1, 3] as const;
interface Order {
  slot: number;
  action: RaidCommandName;
  payload: unknown;
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function action(v: unknown): v is RaidCommandName {
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
  readonly #simulation: RaidSimulation;
  readonly #seq = new Map<number, number>();
  readonly #pending: Order[] = [];
  readonly #pendingCounts = new Uint8Array(4);
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
    this.#simulation = new RaidSimulation(this.match, this.#human);
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
      this.#pendingCounts[slot]! >= perSeatLimit
    )
      return false;
    this.#seq.set(actor, input.seq);
    this.#pendingCounts[slot] = this.#pendingCounts[slot]! + 1;
    this.#pending.push({ slot, action: input.action, payload: input.payload ?? null });
    return true;
  }
  advance(ticks: number): RaidFrames {
    const batch: RaidFrames = { tick: this.match.tick, frames: [] };
    for (let i = 0; i < ticks && !this.match.result; i++) {
      const accepted: Order[] = [];
      if (this.#pending.length) {
        for (const order of this.#pending) {
          if (this.#simulation.dispatch(order.slot, order.action, order.payload))
            accepted.push(order);
        }
        this.#pending.length = 0;
        this.#pendingCounts.fill(0);
      }
      batch.frames.push(accepted);
      this.#simulation.step();
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
          !this.#simulation.dispatch(o.slot, o.action, o.payload)
        )
          return false;
      }
      this.#simulation.step();
    }
    return true;
  }
}
