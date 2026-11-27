import type { HeroCombat, HeroEvents, Hit } from '../heroes/hero-definition.ts';
import { RAID_HZ, raidRespawnTicks, WAGON_HP } from '../raid-rules.ts';
import type { RaidRunner, Runner } from '../raid-view.ts';
import { applyCrowdControl } from '../raid-control.ts';
export function raidBossBonusPercent(runners: readonly RaidRunner[], attackingTeam: number) {
  return (
    15 * runners.filter((runner) => runner.team !== attackingTeam && runner.respawn > 0).length
  );
}
export function gainRage(runner: Runner, amount: number) {
  runner.rage = Math.min(100, runner.rage + amount);
}

/** Owns the damage ledger and resolves queued hits in insertion order, including parries. */
export class RaidHitResolution {
  readonly damage: [number, number] = [0, 0];
  readonly #hits: Hit[] = [];
  readonly #contributors: Array<Map<number, number>>;
  private readonly contexts: readonly HeroCombat[];
  private readonly events: (slot: number) => HeroEvents;
  private readonly resetHero: (slot: number) => void;
  constructor(
    contexts: readonly HeroCombat[],
    events: (slot: number) => HeroEvents,
    resetHero: (slot: number) => void,
  ) {
    this.contexts = contexts;
    this.events = events;
    this.resetHero = resetHero;
    this.#contributors = contexts.map(() => new Map());
  }
  enqueue(hit: Hit) {
    this.#hits.push(hit);
  }
  resolve(tick: number) {
    if (!this.#hits.length) return;
    // Hits land simultaneously. A knockout in this batch affects hits from the next tick.
    const runners = this.contexts.map((c) => c.self);
    const bonuses = [raidBossBonusPercent(runners, 0), raidBossBonusPercent(runners, 1)] as const;
    for (const hit of this.#hits) {
      const attacker = hit.from === null ? undefined : this.contexts[hit.from]?.self;
      const victim = hit.target === 'wagon' ? undefined : this.contexts[hit.target]?.self;
      const source = attacker && this.contexts[attacker.slot];
      const outgoing = attacker && this.events(attacker.slot);
      if (
        victim &&
        (victim.respawn ||
          this.events(victim.slot).onIncomingHit?.(this.contexts[victim.slot]!, hit))
      )
        continue;
      const base =
        source && outgoing?.onOutgoingHit
          ? outgoing.onOutgoingHit(source, hit, victim)
          : hit.amount;
      if (hit.target === 'wagon') {
        if (attacker) {
          const boosted = Math.round((base * (100 + bonuses[attacker.team])) / 100);
          const damage = Math.min(boosted, WAGON_HP - this.damage[attacker.team]);
          this.damage[attacker.team] += damage;
          attacker.wagonDamage += damage;
          if (hit.designated && damage > 0) attacker.lastStrike = 'wagon';
          if (hit.skill !== 3) gainRage(attacker, damage);
        }
        continue;
      }
      if (!victim) continue;
      const damage = Math.min(
        victim.hp,
        victim.shield && !hit.rule?.piercesShield ? Math.ceil(base / 2) : base,
      );
      victim.hp -= damage;
      if (attacker && hit.designated && damage > 0) attacker.lastStrike = victim.slot;
      gainRage(victim, damage);
      const contributors = this.#contributors[victim.slot]!;
      if (attacker) {
        contributors.set(attacker.slot, tick);
        // Fury can charge its victim, but cannot refund its own cost.
        if (hit.skill !== 3) gainRage(attacker, damage);
        if (hit.rule?.control && !this.events(victim.slot).resistsControl?.(victim))
          applyCrowdControl(victim, hit.rule.control);
        outgoing?.onDamageDealt?.(this.contexts[attacker.slot]!, hit, victim, damage);
      }
      if (victim.hp === 0) {
        if (attacker) {
          attacker.kills++;
          for (const [slot, lastHitTick] of contributors)
            if (slot !== attacker.slot && tick - lastHitTick <= 5 * RAID_HZ)
              this.contexts[slot]!.self.assists++;
        }
        contributors.clear();
        victim.deaths++;
        victim.silenced = 0;
        victim.slowed = 0;
        victim.staggered = victim.staggerGuard = 0;
        victim.marked = 0;
        victim.respawn = raidRespawnTicks(victim.deaths);
        victim.jumping = 0;
        victim.leap = null;
        victim.dash = null;
        this.resetHero(victim.slot);
        victim.spin = null;
        victim.side = 0;
        victim.brake = 0;
      }
    }
    this.#hits.length = 0;
  }
}
