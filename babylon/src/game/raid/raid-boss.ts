import type { RaidPoint, RaidRunner } from './raid-view.ts';

// Telegraphs and impacts use metres relative to the wagon, including the locked mortar target.
export const RAID_COUNTERS = {
  lane: { windup: 30, active: 7, damage: 26, halfWidth: 1.25, halfDepth: 20 },
  mortar: { windup: 42, active: 8, damage: 32, radius: 2.1 },
  wave: {
    windup: 26,
    active: 52,
    damage: 22,
    halfWidth: 7,
    halfDepth: 0.65,
    originZ: 10.5,
    metresPerTick: 0.4,
  },
} as const;
const firstWarningTick = 60;
const attackInterval = 132;
const rotation = ['lane', 'mortar', 'wave'] as const;
export interface RaidCounter extends Readonly<RaidPoint> {
  readonly kind: keyof typeof RAID_COUNTERS;
  readonly phase: 'warning' | 'impact';
  readonly ticks: number;
}

export function inRaidCounter(counter: RaidCounter, point: RaidPoint) {
  const dx = point.x - counter.x,
    dz = point.z - counter.z;
  if (counter.kind === 'mortar') return dx * dx + dz * dz <= RAID_COUNTERS.mortar.radius ** 2;
  const shape = RAID_COUNTERS[counter.kind];
  return Math.abs(dx) < shape.halfWidth && Math.abs(dz) < shape.halfDepth;
}

export class RaidBoss {
  #counter: RaidCounter | null = null;
  readonly #struck = new Set<number>();

  get counter() {
    return this.#counter;
  }

  step(
    tick: number,
    runners: readonly RaidRunner[],
    height: (r: RaidRunner) => number,
    hit: (slot: number, damage: number) => void,
  ) {
    if (tick >= firstWarningTick && (tick - firstWarningTick) % attackInterval === 0) {
      const turn = (tick - firstWarningTick) / attackInterval;
      const alive = runners.filter((r) => !r.respawn);
      if (!alive.length) return;
      const target = alive[turn % alive.length]!;
      const kind = rotation[turn % rotation.length]!;
      this.#struck.clear();
      this.#counter = {
        kind,
        phase: 'warning',
        ticks: RAID_COUNTERS[kind].windup,
        x: kind === 'wave' ? 0 : target.x,
        z: kind === 'wave' ? RAID_COUNTERS.wave.originZ : kind === 'lane' ? 0 : target.z,
      };
      return;
    }
    const current = this.#counter;
    if (!current) return;
    const pattern = RAID_COUNTERS[current.kind];
    let ticks = current.ticks - 1,
      phase = current.phase;
    if (ticks === 0) {
      if (phase === 'impact') {
        this.#counter = null;
        return;
      }
      phase = 'impact';
      ticks = pattern.active;
    }
    const wave = current.kind === 'wave' && phase === 'impact';
    const z = wave
      ? RAID_COUNTERS.wave.originZ - (pattern.active - ticks) * RAID_COUNTERS.wave.metresPerTick
      : current.z;
    const counter = { ...current, phase, ticks, z };
    this.#counter = counter;
    // A lane or shell resolves once. A travelling wave can meet runners on different ticks.
    if (phase !== 'impact' || (!wave && ticks !== pattern.active)) return;
    for (const runner of runners) {
      if (runner.respawn || this.#struck.has(runner.slot) || !inRaidCounter(counter, runner))
        continue;
      if (counter.kind !== 'mortar' && height(runner) >= 0.6) continue;
      this.#struck.add(runner.slot);
      hit(runner.slot, pattern.damage);
    }
  }
}
