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

interface Runner extends RaidPoint {
  slot: number;
  team: Team;
  hero: RaidHero;
  hp: number;
  rage: number;
  target: RaidTarget;
  side: number;
  walk: boolean;
  jumping: number;
  respawn: number;
  basic: number;
  cooldowns: number[];
  shield: number;
  silenced: number;
  slowed: number;
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
  readonly runners: readonly RaidRunner[];
  readonly damage: readonly number[];
  readonly tick: number;
  readonly result: Readonly<{ reason: 'destruction' | 'time'; winner: Team | 'draw' }> | null;
  readonly hazard: Readonly<{ x: number; ticks: number }> | null;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const distance = (a: RaidPoint, b: RaidPoint) => Math.hypot(a.x - b.x, a.z - b.z);
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
  readonly #damage: [number, number] = [0, 0];
  #tick = 0;
  #result: RaidView['result'] = null;
  #hazard: { x: number; ticks: number } | null = null;
  #hits: Hit[] = [];
  // Last PvP hit per attacker, cleared at knockout so an assist cannot cross lives.
  #contributors = Array.from({ length: 4 }, () => new Map<number, number>());
  constructor(hero: RaidHero = 'hammer') {
    this.#runners = [hero, ...HERO_IDS.filter((id) => id !== hero)].map(makeRunner);
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
  lock(slot: number, target: RaidTarget) {
    const r = this.#active(slot);
    if (!r || !this.#position(r, target)) return false;
    r.target = target;
    return true;
  }
  #strike(r: Runner, target: RaidTarget, amount: number, skill?: Skill) {
    const point = this.#position(r, target);
    if (!point) return;
    r.swing = this.#tick;
    r.impact = { x: point.x, z: point.z };
    this.#hits.push({ from: r.slot, target, amount, skill });
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
        (other) =>
          other.slot !== slot && other.team === r.team && !other.respawn && distance(r, other) <= 8,
      );
      let recipient = r;
      if (typeof aim === 'number') {
        if (aim !== slot && aim !== ally?.slot) return false;
        if (ally?.slot === aim) recipient = ally;
      } else if (ally && ally.hp / HEROES[ally.hero].hp < r.hp / hero.hp) recipient = ally;
      recipient.shield = 75;
    } else if (skill === 0 || skill === 2) {
      const center = skill === 0 ? r : typeof aim === 'object' ? aim : undefined;
      if (!center || !inRaidCastRange(r, center, skill)) return false;
      const radius = hero.radius + (skill === 2 ? 0.6 : 0);
      for (const target of ['wagon', 0, 1, 2, 3] as const) {
        const point = this.#position(r, target);
        if (point && distance(center, point) <= radius)
          this.#strike(r, target, hero.power * (skill === 0 ? 2 : 3), skill);
      }
    } else {
      const targetId = typeof aim === 'number' || aim === 'wagon' ? aim : r.target;
      const target = this.#position(r, targetId);
      if (!target || !inRaidCastRange(r, target, skill)) return false;
      r.target = targetId;
      this.#strike(r, targetId, hero.power * (skill === 3 ? 7 : 3), skill);
      if (skill === 3) r.rage = 0;
    }
    r.cooldowns[skill] = SKILL_COOLDOWNS[skill];
    return true;
  }
  #autoAttack(r: Runner) {
    const stats = HEROES[r.hero];
    // Prefer the lock in reach, then the nearest legal target. A distant lock cannot suppress melee.
    let target = r.target;
    const point = this.#position(r, target);
    // Basic attacks face forward. Dropping behind an opponent opens a window to attack their back.
    if (!point || point.z < r.z - 0.45 || distance(r, point) > stats.reach) {
      let nearest: number = stats.reach;
      let found: RaidTarget | undefined;
      for (const candidate of ['wagon', 0, 1, 2, 3] as const) {
        const p = this.#position(r, candidate);
        if (p && p.z >= r.z - 0.45 && distance(r, p) <= nearest) {
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
        if (attacker) this.#damage[attacker.team] += hit.amount;
        continue;
      }
      const victim = this.#runners[hit.target]!;
      if (victim.respawn) continue;
      const damage = Math.min(victim.hp, victim.shield ? Math.ceil(hit.amount / 2) : hit.amount);
      victim.hp -= damage;
      const contributors = this.#contributors[victim.slot]!;
      if (attacker) {
        contributors.set(attacker.slot, this.#tick);
        victim.rage = Math.min(100, victim.rage + damage);
        if (attacker.hero === 'abyss' && hit.skill === 1) victim.silenced = 24;
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
        victim.respawn = RESPAWN_TICKS;
        victim.jumping = 0;
        victim.side = 0;
        victim.walk = false;
      }
    }
    this.#hits.length = 0;
  }
  step() {
    if (this.#result) return;
    this.#tick++;
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
    this.#resolveHits();
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
