import { inBasicAttackArc, inRaidSight } from './raid-sight.ts';

/** Positions are metres relative to the moving wagon, +Z in the direction of travel. */
export interface RaidPoint {
  x: number;
  z: number;
}
export const WAGON = { x: 0, z: 10 } as const;
export const HEROES = {
  hammer: { hp: 140, power: 12, reach: 3.1, cooldown: 28, radius: 3.5 },
  abyss: { hp: 105, power: 10, reach: 3.9, cooldown: 29, radius: 4.2 },
  longshot: { hp: 95, power: 8, reach: 5.2, cooldown: 23, radius: 2.8 },
  jade: { hp: 100, power: 10, reach: 4.7, cooldown: 27, radius: 3.4 },
} as const;
export type RaidHero = keyof typeof HEROES;
export const HERO_IDS = Object.keys(HEROES) as RaidHero[];
export const RAID_HZ = 30;
export const ROUND_TICKS = 180 * RAID_HZ;
export const WAGON_HP = 2600;
export const SKILL_COOLDOWNS = [150, 105, 210, 30] as const;
export const RESPAWN_TICKS = 5 * RAID_HZ;
export type RaidTarget = 'wagon' | number;
export type Skill = 0 | 1 | 2 | 3;
type Team = 0 | 1;
export interface RaidAction {
  readonly id: number;
  readonly tick: number;
  readonly slot: number;
  readonly hero: RaidHero;
  readonly skill: Skill | 'basic';
  readonly from: Readonly<RaidPoint>;
  readonly to: Readonly<RaidPoint>;
  readonly fromY: number;
  readonly toY: number;
}

interface Runner extends RaidPoint {
  slot: number;
  team: Team;
  hero: RaidHero;
  hp: number;
  rage: number;
  target: RaidTarget | null;
  side: number;
  walk: boolean;
  jumping: number;
  respawn: number;
  basic: number;
  cooldowns: number[];
  shield: number;
  silenced: number;
  slowed: number;
  marked: number;
  kills: number;
  deaths: number;
  assists: number;
  swing: number;
  impact: RaidPoint;
}
export type RaidRunner = Readonly<Omit<Runner, 'cooldowns' | 'impact'>> & {
  readonly cooldowns: readonly number[];
  readonly impact: Readonly<RaidPoint>;
};
export interface RaidView {
  readonly actions: readonly RaidAction[];
  readonly runners: readonly RaidRunner[];
  readonly damage: readonly number[];
  readonly tick: number;
  readonly result: Readonly<{ reason: 'destruction' | 'time'; winner: Team | 'draw' }> | null;
  readonly hazard: Readonly<{ x: number; ticks: number }> | null;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const distance = (a: RaidPoint, b: RaidPoint) => Math.hypot(a.x - b.x, a.z - b.z);
function gainRage(runner: Runner, amount: number) {
  runner.rage = Math.min(100, runner.rage + amount);
}
const standardAspect = 16 / 9;
export function inRaidCastRange(caster: RaidPoint, point: RaidPoint, skill: Skill) {
  if (skill === 2 || skill === 0) {
    return (
      Math.abs(point.x) <= 6 && point.z >= -7 && point.z <= 12 && distance(caster, point) <= 15
    );
  }
  return distance(caster, point) <= 16;
}
export const jumpHeight = (ticks: number) =>
  ticks > 0 ? 1.5 * Math.sin((Math.PI * ticks) / 24) : 0;
const spawnX = [-1.6, -3.3, 1.6, 3.3];
const makeRunner = (hero: RaidHero, slot: number): Runner => ({
  hero,
  slot,
  team: slot < 2 ? 0 : 1,
  x: spawnX[slot]!,
  z: slot % 2 === 0 ? 0 : -2,
  hp: HEROES[hero].hp,
  rage: 0,
  target: 'wagon',
  side: 0,
  walk: false,
  jumping: 0,
  respawn: 0,
  basic: 0,
  cooldowns: [0, 0, 0, 0],
  shield: 0,
  silenced: 0,
  slowed: 0,
  marked: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  swing: -100,
  impact: { ...WAGON },
});

type Hit = { from: number | null; target: RaidTarget; amount: number; skill?: Skill };
/** The authority advances exactly one tick per step. All damage in a tick resolves together. */
export class RaidMatch implements RaidView {
  readonly #runners: Runner[];
  readonly #playerAspect: () => number;
  readonly #damage: [number, number] = [0, 0];
  #tick = 0;
  #result: RaidView['result'] = null;
  #hazard: { x: number; ticks: number } | null = null;
  #hits: Hit[] = [];
  #sequence = 0;
  #actions: RaidAction[] = [];
  // Placed fields share the cast's immutable centre and outlive the casting gesture.
  #fields: RaidAction[] = [];
  get actions(): readonly RaidAction[] {
    return this.#actions;
  }
  // Last PvP hit per attacker, cleared at knockout so an assist cannot cross lives.
  #contributors = Array.from({ length: 4 }, () => new Map<number, number>());
  constructor(hero: RaidHero = 'hammer', playerAspect: () => number = () => standardAspect) {
    this.#runners = [hero, ...HERO_IDS.filter((id) => id !== hero)].map(makeRunner);
    this.#playerAspect = playerAspect;
  }
  get runners(): readonly RaidRunner[] {
    return this.#runners;
  }
  get damage(): readonly number[] {
    return this.#damage;
  }
  get tick() {
    return this.#tick;
  }
  get result() {
    return this.#result;
  }
  get hazard(): RaidView['hazard'] {
    return this.#hazard;
  }
  #active(slot: number) {
    const r = this.#runners[slot];
    return r && !r.respawn && !this.#result ? r : undefined;
  }
  move(slot: number, side: number, walk: boolean) {
    const r = this.#active(slot);
    if (!r || ![-1, 0, 1].includes(side) || typeof walk !== 'boolean') return false;
    r.side = side;
    r.walk = walk;
    return true;
  }
  jump(slot: number) {
    const r = this.#active(slot);
    if (!r || r.jumping) return false;
    r.jumping = 24;
    return true;
  }
  #position(r: Runner, target: RaidTarget) {
    if (target === 'wagon') return WAGON;
    const other = this.#runners[target];
    return other && other.team !== r.team && !other.respawn ? other : undefined;
  }
  #visibleTarget(r: Runner, target: RaidTarget | null) {
    if (target === null) return;
    const point = this.#position(r, target);
    if (!point) return;
    const height = 'jumping' in point ? 1 + jumpHeight(point.jumping) : 2;
    if (this.#inSight(r, point, height)) return point;
  }
  #inSight(r: Runner, point: RaidPoint, height: number) {
    // Bots see their own chase view, independently of the local player's device.
    return inRaidSight(r, point, height, r.slot === 0 ? this.#playerAspect() : standardAspect);
  }
  canAimGround(slot: number, point: RaidPoint) {
    const r = this.#active(slot);
    return !!r && inRaidCastRange(r, point, 2) && this.#inSight(r, point, 0);
  }
  canShield(slot: number, ally: number) {
    const caster = this.#active(slot);
    const recipient = this.#active(ally);
    return (
      !!caster &&
      caster.hero === 'jade' &&
      !!recipient &&
      recipient.team === caster.team &&
      (slot === ally ||
        (distance(caster, recipient) <= 8 &&
          this.#inSight(caster, recipient, 1 + jumpHeight(recipient.jumping))))
    );
  }
  canTarget(slot: number, target: RaidTarget) {
    const r = this.#active(slot);
    return !!r && !!this.#visibleTarget(r, target);
  }
  lock(slot: number, target: RaidTarget) {
    const r = this.#active(slot);
    if (!r || !this.#visibleTarget(r, target)) return false;
    r.target = target;
    return true;
  }
  #strike(r: Runner, target: RaidTarget, amount: number, skill?: Skill) {
    const point = this.#position(r, target);
    if (!point) return;
    r.swing = this.#tick;
    r.impact = { x: point.x, z: point.z };
    this.#hits.push({ from: r.slot, target, amount, skill });
    if (skill === undefined) this.#record(r, 'basic', point);
  }
  #record(r: Runner, skill: RaidAction['skill'], point: RaidPoint, ground = false) {
    const target = this.#runners.find((other) => other === point);
    const action = {
      id: ++this.#sequence,
      tick: this.#tick,
      slot: r.slot,
      hero: r.hero,
      skill,
      from: { x: r.x, z: r.z },
      fromY: 1 + jumpHeight(r.jumping),
      to: { x: point.x, z: point.z },
      toY: ground ? 0.08 : target ? 1 + jumpHeight(target.jumping) : 1.9,
    };
    this.#actions.push(action);
    if (skill === 2 && r.hero !== 'hammer') this.#fields.push(action);
  }
  #heal(caster: Runner, recipient: Runner, amount: number) {
    const healed = Math.min(amount, HEROES[recipient.hero].hp - recipient.hp);
    recipient.hp += healed;
    gainRage(caster, healed);
  }
  cast(slot: number, skill: Skill, aim?: RaidPoint | RaidTarget) {
    const r = this.#active(slot);
    if (
      !r ||
      r.silenced ||
      ![0, 1, 2, 3].includes(skill) ||
      r.cooldowns[skill] ||
      (skill === 3 && r.rage < 100)
    )
      return false;
    const hero = HEROES[r.hero];
    if (r.hero === 'jade' && skill === 0) {
      const ally = this.#runners.find(
        (other) => other.slot !== slot && this.canShield(slot, other.slot),
      );
      let recipient = r;
      if (typeof aim === 'number') {
        if (aim !== slot && aim !== ally?.slot) return false;
        if (ally?.slot === aim) recipient = ally;
      } else if (ally && ally.hp / HEROES[ally.hero].hp < r.hp / hero.hp) recipient = ally;
      recipient.shield = 75;
      this.#heal(r, recipient, hero.power * 2);
      this.#record(r, skill, recipient);
    } else if (skill === 0 || skill === 2) {
      const center = skill === 0 ? r : typeof aim === 'object' ? aim : undefined;
      if (!center || (skill === 2 && !this.canAimGround(slot, center))) return false;
      const radius = hero.radius + (skill === 2 ? 0.6 : 0);
      this.#record(r, skill, center, true);
      for (const target of ['wagon', 0, 1, 2, 3] as const) {
        const point = this.#visibleTarget(r, target);
        if (point && distance(center, point) <= radius)
          this.#strike(r, target, hero.power * (skill === 0 ? 2 : 3), skill);
      }
    } else {
      const targetId = typeof aim === 'number' || aim === 'wagon' ? aim : r.target;
      if (targetId === null) return false;
      const target = this.#visibleTarget(r, targetId);
      if (!target || !inRaidCastRange(r, target, skill)) return false;
      r.target = targetId;
      this.#record(r, skill, target);
      this.#strike(r, targetId, hero.power * (skill === 3 ? 7 : 3), skill);
      if (skill === 3) {
        r.rage = 0;
        if (r.hero === 'hammer') {
          for (const id of ['wagon', 0, 1, 2, 3] as const) {
            const nearby = this.#visibleTarget(r, id);
            if (id !== targetId && nearby && distance(nearby, target) <= hero.radius)
              this.#strike(r, id, hero.power * 2, skill);
          }
        }
        if (r.hero === 'jade') {
          for (const ally of this.#runners)
            if (this.canShield(slot, ally.slot)) ally.shield = Math.max(ally.shield, 75);
        }
      }
    }
    r.cooldowns[skill] = SKILL_COOLDOWNS[skill];
    return true;
  }
  #basicTarget(r: Runner, target: RaidTarget | null) {
    const point = this.#visibleTarget(r, target);
    return point && inBasicAttackArc(r, point) ? point : undefined;
  }
  #autoAttack(r: Runner) {
    const stats = HEROES[r.hero];
    // Prefer the lock in reach, then the nearest legal target. A distant lock cannot suppress melee.
    let target = r.target;
    const point = this.#basicTarget(r, target);
    if (target === null || !point || distance(r, point) > stats.reach) {
      let nearest: number = stats.reach;
      let found: RaidTarget | undefined;
      for (const candidate of ['wagon', 0, 1, 2, 3] as const) {
        const p = this.#basicTarget(r, candidate);
        if (p && distance(r, p) <= nearest) {
          nearest = distance(r, p);
          found = candidate;
        }
      }
      if (found === undefined) return;
      target = found;
    }
    this.#strike(r, target, stats.power);
    r.basic = stats.cooldown;
  }
  #resolveHits() {
    for (const hit of this.#hits) {
      const attacker = hit.from === null ? undefined : this.#runners[hit.from];
      if (hit.target === 'wagon') {
        if (attacker) {
          const damage = Math.min(hit.amount, WAGON_HP - this.#damage[attacker.team]);
          this.#damage[attacker.team] += damage;
          if (hit.skill !== 3) gainRage(attacker, damage);
        }
        continue;
      }
      const victim = this.#runners[hit.target]!;
      if (victim.respawn) continue;
      const markedShot =
        attacker?.hero === 'longshot' && hit.skill === undefined && victim.marked > 0;
      const amount = hit.amount + (markedShot ? HEROES.longshot.power : 0);
      if (markedShot) victim.marked = 0;
      const piercesShield = attacker?.hero === 'longshot' && hit.skill === 3;
      const damage = Math.min(
        victim.hp,
        victim.shield && !piercesShield ? Math.ceil(amount / 2) : amount,
      );
      victim.hp -= damage;
      gainRage(victim, damage);
      const contributors = this.#contributors[victim.slot]!;
      if (attacker) {
        contributors.set(attacker.slot, this.#tick);
        // Fury can charge its victim, but cannot refund its own cost.
        if (hit.skill !== 3) gainRage(attacker, damage);
        if (attacker.hero === 'hammer' && hit.skill === 0)
          victim.slowed = Math.max(victim.slowed, 30);
        if (attacker.hero === 'longshot' && hit.skill === 1) victim.marked = 3 * RAID_HZ;
        if (attacker.hero === 'abyss' && (hit.skill === 1 || hit.skill === 3))
          victim.silenced = Math.max(victim.silenced, hit.skill === 3 ? 60 : 24);
        if (attacker.hero === 'abyss' && hit.skill === 2) victim.slowed = 60;
      }
      if (victim.hp === 0) {
        if (attacker) {
          attacker.kills++;
          for (const [slot, tick] of contributors)
            if (slot !== attacker.slot && this.#tick - tick <= 5 * RAID_HZ)
              this.#runners[slot]!.assists++;
        }
        contributors.clear();
        victim.deaths++;
        victim.silenced = 0;
        victim.slowed = 0;
        victim.marked = 0;
        victim.respawn = RESPAWN_TICKS;
        victim.jumping = 0;
        victim.side = 0;
        victim.walk = false;
      }
    }
    this.#hits.length = 0;
  }
  #pulseFields() {
    for (const field of this.#fields) {
      const age = this.#tick - field.tick;
      if (age !== 15 && age !== 30) continue;
      const caster = this.#runners[field.slot]!;
      const stats = HEROES[caster.hero];
      if (caster.respawn) continue;
      for (const target of ['wagon', 0, 1, 2, 3] as const) {
        const ally = target === 'wagon' ? undefined : this.#runners[target]!;
        if (
          caster.hero === 'jade' &&
          ally &&
          !ally.respawn &&
          ally.team === caster.team &&
          this.#inSight(caster, ally, 1 + jumpHeight(ally.jumping)) &&
          distance(ally, field.to) <= stats.radius + 0.6
        )
          this.#heal(caster, ally, stats.power);
        const foe = this.#visibleTarget(caster, target);
        if (!foe || distance(foe, field.to) > stats.radius + 0.6) continue;
        if (caster.hero === 'longshot')
          this.#hits.push({ from: caster.slot, target, amount: stats.power, skill: 2 });
        if (caster.hero === 'abyss' && ally) ally.slowed = Math.max(ally.slowed, 30);
      }
    }
    while (this.#fields.length && this.#tick - this.#fields[0]!.tick >= 30) this.#fields.shift();
  }
  step() {
    if (this.#result) return;
    this.#tick++;
    while (this.#actions.length && this.#tick - this.#actions[0]!.tick > 39) this.#actions.shift();
    for (const r of this.#runners) {
      if (r.respawn) {
        if (--r.respawn === 0) {
          r.hp = HEROES[r.hero].hp;
          r.x = spawnX[r.slot]!;
          r.z = -6;
          r.target = 'wagon';
          r.shield = 45;
        }
        continue;
      }
      if (r.silenced) r.silenced--;
      if (r.slowed) r.slowed--;
      if (r.marked) r.marked--;
      const pace = r.slowed ? 0.55 : 1;
      r.x = clamp(r.x + (r.side * 4.8 * pace) / RAID_HZ, -5, 5);
      r.z = clamp(r.z + ((r.walk ? -3.1 : 2.25) * pace) / RAID_HZ, -6, 8.4);
      if (r.jumping) r.jumping--;
      if (r.shield) r.shield--;
      for (const skill of [0, 1, 2, 3]) if (r.cooldowns[skill]!) r.cooldowns[skill]!--;
      if (r.basic) r.basic--;
    }
    // Everyone moves before checking range so runner ordering cannot change who gets a hit.
    for (const r of this.#runners) if (!r.respawn && !r.basic) this.#autoAttack(r);
    if (this.#tick % 132 === 60) {
      const alive = this.#runners.filter((r) => !r.respawn);
      const marked = alive[Math.floor(this.#tick / 132) % alive.length];
      if (marked) this.#hazard = { x: marked.x, ticks: 30 };
    } else if (this.#hazard && --this.#hazard.ticks === 0) {
      for (const r of this.#runners) {
        if (!r.respawn && Math.abs(r.x - this.#hazard.x) < 1.25 && jumpHeight(r.jumping) < 0.6)
          this.#hits.push({ from: null, target: r.slot, amount: 26 });
      }
      this.#hazard = null;
    }
    this.#pulseFields();
    this.#resolveHits();
    for (const r of this.#runners) {
      if (r.target !== null && (r.respawn || !this.#visibleTarget(r, r.target))) r.target = null;
    }
    const [blue, red] = this.#damage;
    if (Math.max(blue, red) >= WAGON_HP || this.#tick >= ROUND_TICKS) {
      const destroyed = Math.max(blue, red) >= WAGON_HP;
      const draw = blue === red || (blue >= WAGON_HP && red >= WAGON_HP);
      this.#result = {
        reason: destroyed ? 'destruction' : 'time',
        winner: draw ? 'draw' : blue > red ? 0 : 1,
      };
    }
  }
}
