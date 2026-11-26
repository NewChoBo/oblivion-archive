import {
  RaidProjectiles,
  raidProjectileProfile,
  unitDirection,
  type RaidDirection,
  type RaidProjectile,
} from './raid-projectiles.ts';
import { inBasicAttackArc, inRaidSight } from './raid-sight.ts';

/** Positions are metres relative to the moving wagon, +Z in the direction of travel. */
export interface RaidPoint {
  x: number;
  z: number;
}
export const WAGON = { x: 0, z: 10 } as const;
export const HEROES = {
  hammer: { hp: 140, power: 12, reach: 3.1, cooldown: 28, radius: 3.5 },
  abyss: { hp: 105, power: 10, reach: 8, cooldown: 29, radius: 4.2 },
  longshot: { hp: 95, power: 8, reach: 12, cooldown: 23, radius: 2.8 },
  jade: { hp: 100, power: 10, reach: 9, cooldown: 27, radius: 3.4 },
} as const;
export type RaidHero = keyof typeof HEROES;
export const HERO_IDS = Object.keys(HEROES) as RaidHero[];
export const RAID_HZ = 30;
/** Distance in metres travelled by the wagon over this many match ticks (including sub-ticks). */
export const raidRoadTravel = (ticks: number) => (ticks * 6) / RAID_HZ;
/** A stationary patch of road, expressed in the wagon's frame at cast time and again after age ticks. */
export function raidGroundPointAfter(point: Readonly<RaidPoint>, age: number): RaidPoint {
  return { x: point.x, z: point.z - raidRoadTravel(age) };
}
export const ROUND_TICKS = 180 * RAID_HZ;
export const WAGON_HP = 2600;
export const SKILL_COOLDOWNS = [150, 105, 210, 30] as const;
export const RESPAWN_TICKS = 5 * RAID_HZ;
export type RaidTarget = 'wagon' | number;
export type Skill = 0 | 1 | 2 | 3;
export const RAID_LEAP_TICKS = 15;
export const isRaidLeap = (hero: RaidHero, skill: Skill) => hero === 'hammer' && skill === 0;
export const raidLeapHeight = (fraction: number) => 2.2 * 4 * fraction * (1 - fraction);
export const RAID_SKILL_RANGE = { field: 15, shot: 16, ward: 8, leap: 10 } as const;
export const raidAreaRadius = (hero: RaidHero, skill: 0 | 2) =>
  HEROES[hero].radius + (skill === 2 ? 0.6 : 0);
export interface RaidAim {
  kind: 'leap' | 'field' | 'target' | 'direction' | 'ward' | 'pulse';
  spread?: number;
  status: 'needDirection' | 'ready' | 'needTarget' | 'outOfRange' | 'invalidGround' | 'unavailable';
  origin: Readonly<RaidPoint>;
  point: Readonly<RaidPoint> | null;
  range: number;
  radius: number;
  distance: number | null;
  target?: RaidTarget;
  count?: number;
  allies?: number;
}
export function raidAimKind(hero: RaidHero, skill: Skill): RaidAim['kind'] {
  if (isRaidLeap(hero, skill)) return 'leap';
  if (raidProjectileProfile(hero, skill)) return 'direction';
  if (skill === 2) return 'field';
  if (skill === 0) return hero === 'jade' ? 'ward' : 'pulse';
  return 'target';
}
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
  brake: number;
  jumping: number;
  // Both endpoints describe fixed road positions in the wagon frame at takeoff.
  leap: Readonly<{ from: Readonly<RaidPoint>; to: Readonly<RaidPoint>; elapsed: number }> | null;
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
}
export type RaidRunner = Readonly<Omit<Runner, 'cooldowns'>> & {
  readonly cooldowns: readonly number[];
};
export interface RaidView {
  readonly projectiles: readonly RaidProjectile[];
  readonly actions: readonly RaidAction[];
  readonly runners: readonly RaidRunner[];
  readonly damage: readonly number[];
  readonly tick: number;
  readonly result: Readonly<{ reason: 'destruction' | 'time'; winner: Team | 'draw' }> | null;
  readonly hazard: Readonly<{ x: number; ticks: number }> | null;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
// Metres per second relative to the wagon, from a free run to full braking.
const forwardSpeed = (brake: number) => 2.25 * (1 - brake) - 3.1 * brake;
// Outside the running corridor after a leap, return at running speed without snapping to its edge.
function runAxis(position: number, delta: number, low: number, high: number, recovery: number) {
  return clamp(
    position + delta,
    Math.min(low, position + recovery),
    Math.max(high, position - recovery),
  );
}
export function raidRunnerHeight(r: RaidRunner, subtick = 0) {
  return r.leap
    ? raidLeapHeight(Math.min(1, (r.leap.elapsed + subtick) / RAID_LEAP_TICKS))
    : jumpHeight(Math.max(0, r.jumping - subtick));
}
export function canUseRaidSkill(r: RaidRunner, skill: Skill) {
  return (
    !r.respawn &&
    !r.silenced &&
    !r.leap &&
    !r.cooldowns[skill] &&
    !(isRaidLeap(r.hero, skill) && r.jumping) &&
    (skill !== 3 || r.rage >= 100)
  );
}
/** Predict up to one tick from the current ground position for both the match and the camera. */
export function raidRunnerPositionAfter(r: RaidRunner, ticks: number): RaidPoint {
  if (r.leap) {
    const { from, to, elapsed } = r.leap;
    const age = Math.min(RAID_LEAP_TICKS, elapsed + ticks);
    const t = age / RAID_LEAP_TICKS;
    return raidGroundPointAfter(
      { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t },
      age,
    );
  }
  // Status timers tick down before movement. The last slow tick resumes normal speed.
  const seconds = r.respawn ? 0 : (ticks / RAID_HZ) * (r.slowed > 1 ? 0.55 : 1);
  return {
    x: runAxis(r.x, r.side * 4.8 * seconds, -5, 5, 4.8 * seconds),
    z: runAxis(r.z, forwardSpeed(r.brake) * seconds, -6, 8.4, 3.1 * seconds),
  };
}
const distance = (a: RaidPoint, b: RaidPoint) => Math.hypot(a.x - b.x, a.z - b.z);
function gainRage(runner: Runner, amount: number) {
  runner.rage = Math.min(100, runner.rage + amount);
}
const standardAspect = 16 / 9;
export function inRaidCastRange(caster: RaidPoint, point: RaidPoint, skill: Skill) {
  return distance(caster, point) <= (skill === 2 ? RAID_SKILL_RANGE.field : RAID_SKILL_RANGE.shot);
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
  brake: 0,
  jumping: 0,
  leap: null,
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
  readonly #projectiles = new RaidProjectiles();
  get projectiles() {
    return this.#projectiles.active;
  }
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
  move(slot: number, side: number, brake: number) {
    const r = this.#active(slot);
    if (!r || !(side >= -1 && side <= 1 && brake >= 0 && brake <= 1)) return false;
    r.side = side;
    r.brake = brake;
    return true;
  }
  jump(slot: number) {
    const r = this.#active(slot);
    if (!r || r.jumping || r.leap) return false;
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
    const height = 'jumping' in point ? 1 + raidRunnerHeight(point) : 2;
    if (this.#inSight(r, point, height)) return point;
  }
  #inSight(r: Runner, point: RaidPoint, height: number) {
    // Bots see their own chase view, independently of the local player's device.
    return inRaidSight(r, point, height, r.slot === 0 ? this.#playerAspect() : standardAspect);
  }
  canAimGround(slot: number, point: RaidPoint) {
    const r = this.#active(slot);
    return !!r && inRaidCastRange(r, point, 2);
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
        (distance(caster, recipient) <= RAID_SKILL_RANGE.ward &&
          this.#inSight(caster, recipient, 1 + raidRunnerHeight(recipient))))
    );
  }
  canTarget(slot: number, target: RaidTarget) {
    const r = this.#active(slot);
    return !!r && !!this.#visibleTarget(r, target);
  }
  #areaTargets(r: Runner, center: RaidPoint, radius: number) {
    return (['wagon', 0, 1, 2, 3] as const).filter((id) => {
      const point = this.#position(r, id);
      return point && distance(center, point) <= radius;
    });
  }
  #inHealingArea(caster: Runner, ally: Runner, center: RaidPoint, radius: number) {
    return !ally.respawn && ally.team === caster.team && distance(ally, center) <= radius;
  }
  /** Predict the immediate cast in the current tick. Ground pulses can reach different runners later. */
  previewSkill(slot: number, skill: Skill, ground: RaidPoint | null, target?: RaidTarget): RaidAim {
    const r = this.#runners[slot]!;
    const kind = raidAimKind(r.hero, skill);
    const projectile = kind === 'direction' ? raidProjectileProfile(r.hero, skill) : null;
    const area = kind === 'field' || kind === 'pulse';
    const radius =
      area || kind === 'leap'
        ? raidAreaRadius(r.hero, kind === 'field' ? 2 : 0)
        : skill === 3 && r.hero === 'hammer'
          ? HEROES.hammer.radius
          : 0;
    const range =
      kind === 'pulse'
        ? radius
        : kind === 'direction'
          ? projectile!.reach
          : kind === 'target'
            ? RAID_SKILL_RANGE.shot
            : RAID_SKILL_RANGE[kind];
    const unitTarget = kind === 'target' || kind === 'ward' ? target : undefined;
    const point =
      kind === 'pulse'
        ? r
        : unitTarget === undefined
          ? ground
          : unitTarget === 'wagon'
            ? WAGON
            : (this.#runners[unitTarget] ?? null);
    const metres = point ? distance(r, point) : null;
    let status: RaidAim['status'] = 'ready';
    if (!this.#active(slot) || !canUseRaidSkill(r, skill)) status = 'unavailable';
    else if (kind === 'direction') {
      if (!point || !unitDirection(point.x - r.x, point.z - r.z)) status = 'needDirection';
    } else if (metres !== null && metres > range) status = 'outOfRange';
    else if (kind === 'leap' && (!point || !Number.isFinite(metres))) status = 'invalidGround';
    else if (kind === 'field' && (!point || !this.canAimGround(slot, point)))
      status = 'invalidGround';
    else if (kind === 'target' && (target === undefined || !this.canTarget(slot, target)))
      status = 'needTarget';
    else if (kind === 'ward' && (typeof target !== 'number' || !this.canShield(slot, target)))
      status = 'needTarget';
    const count =
      area && point && status === 'ready' ? this.#areaTargets(r, point, radius).length : undefined;
    const allies =
      kind === 'field' && r.hero === 'jade' && point && status === 'ready'
        ? this.#runners.filter((ally) => this.#inHealingArea(r, ally, point, radius)).length
        : undefined;
    return {
      kind,
      status,
      origin: r,
      point,
      range,
      radius,
      distance: metres,
      target: unitTarget,
      spread: projectile?.angles.at(-1),
      count,
      allies,
    };
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
      fromY: 1 + raidRunnerHeight(r),
      to: { x: point.x, z: point.z },
      toY: ground ? 0.08 : target ? 1 + raidRunnerHeight(target) : 1.9,
    };
    this.#actions.push(action);
    if (skill === 2 && r.hero !== 'hammer') this.#fields.push(action);
  }
  #heal(caster: Runner, recipient: Runner, amount: number) {
    const healed = Math.min(amount, HEROES[recipient.hero].hp - recipient.hp);
    recipient.hp += healed;
    gainRage(caster, healed);
  }
  cast(slot: number, skill: Skill, aim?: RaidPoint | RaidTarget | RaidDirection) {
    const r = this.#active(slot);
    if (!r || ![0, 1, 2, 3].includes(skill) || !canUseRaidSkill(r, skill)) return false;
    const hero = HEROES[r.hero];
    const projectile = raidProjectileProfile(r.hero, skill);
    if (isRaidLeap(r.hero, skill)) {
      if (
        !aim ||
        typeof aim !== 'object' ||
        !('x' in aim) ||
        !(distance(r, aim) <= RAID_SKILL_RANGE.leap)
      )
        return false;
      r.leap = {
        from: { x: r.x, z: r.z },
        to: { x: aim.x, z: aim.z },
        elapsed: 0,
      };
    } else if (projectile) {
      if (!aim || typeof aim !== 'object' || !('dx' in aim)) return false;
      const direction = unitDirection(aim.dx, aim.dz);
      if (!direction) return false;
      this.#projectiles.launch(r, skill, direction, projectile, RAID_HZ);
      this.#record(r, skill, {
        x: r.x + direction.dx * projectile.reach,
        z: r.z + direction.dz * projectile.reach,
      });
      if (skill === 3) r.rage = 0;
    } else if (r.hero === 'jade' && skill === 0) {
      if (typeof aim !== 'number' || !this.canShield(slot, aim)) return false;
      const recipient = this.#runners[aim]!;
      recipient.shield = 75;
      this.#heal(r, recipient, hero.power * 2);
      this.#record(r, skill, recipient);
    } else if (skill === 0 || skill === 2) {
      const center =
        skill === 0 ? r : aim && typeof aim === 'object' && 'x' in aim ? aim : undefined;
      if (!center || (skill === 2 && !this.canAimGround(slot, center))) return false;
      const radius = raidAreaRadius(r.hero, skill);
      this.#record(r, skill, center, true);
      for (const target of this.#areaTargets(r, center, radius))
        this.#strike(r, target, hero.power * (skill === 0 ? 2 : 3), skill);
    } else {
      if (typeof aim !== 'number' && aim !== 'wagon') return false;
      const targetId = aim;
      const target = this.#visibleTarget(r, targetId);
      if (!target || !inRaidCastRange(r, target, skill)) return false;
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
        victim.leap = null;
        victim.side = 0;
        victim.brake = 0;
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
      const center = raidGroundPointAfter(field.to, age);
      for (const target of ['wagon', 0, 1, 2, 3] as const) {
        const ally = target === 'wagon' ? undefined : this.#runners[target]!;
        if (
          caster.hero === 'jade' &&
          ally &&
          this.#inHealingArea(caster, ally, center, raidAreaRadius(caster.hero, 2))
        )
          this.#heal(caster, ally, stats.power);
        const foe = this.#position(caster, target);
        if (!foe || distance(foe, center) > raidAreaRadius(caster.hero, 2)) continue;
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
    const previous = this.projectiles.length ? this.runners.map(({ x, z }) => ({ x, z })) : null;
    while (this.#actions.length && this.#tick - this.#actions[0]!.tick > 39) this.#actions.shift();
    for (const r of this.#runners) {
      if (r.respawn) {
        if (--r.respawn === 0) {
          r.hp = HEROES[r.hero].hp;
          r.x = spawnX[r.slot]!;
          r.z = -6;
          if (previous) previous[r.slot] = { x: r.x, z: r.z };
          r.target = 'wagon';
          r.shield = 45;
        }
        continue;
      }
      const next = raidRunnerPositionAfter(r, 1);
      r.x = next.x;
      r.z = next.z;
      if (r.leap) r.leap = { ...r.leap, elapsed: r.leap.elapsed + 1 };
      if (r.silenced) r.silenced--;
      if (r.slowed) r.slowed--;
      if (r.marked) r.marked--;
      if (r.jumping) r.jumping--;
      if (r.shield) r.shield--;
      for (const skill of [0, 1, 2, 3]) if (r.cooldowns[skill]!) r.cooldowns[skill]!--;
      if (r.basic) r.basic--;
    }
    // Everyone moves before checking range so runner ordering cannot change who gets a hit.
    for (const r of this.#runners) {
      if (r.leap?.elapsed === RAID_LEAP_TICKS) {
        r.leap = null;
        this.#record(r, 0, r, true);
        for (const target of this.#areaTargets(r, r, raidAreaRadius(r.hero, 0)))
          this.#strike(r, target, HEROES[r.hero].power * 2, 0);
      } else if (!r.respawn && !r.leap && !r.basic) this.#autoAttack(r);
    }
    if (this.#tick % 132 === 60) {
      const alive = this.#runners.filter((r) => !r.respawn);
      const marked = alive[Math.floor(this.#tick / 132) % alive.length];
      if (marked) this.#hazard = { x: marked.x, ticks: 30 };
    } else if (this.#hazard && --this.#hazard.ticks === 0) {
      for (const r of this.#runners) {
        if (!r.respawn && Math.abs(r.x - this.#hazard.x) < 1.25 && raidRunnerHeight(r) < 0.6)
          this.#hits.push({ from: null, target: r.slot, amount: 26 });
      }
      this.#hazard = null;
    }
    if (previous)
      this.#projectiles.step(this.runners, previous, WAGON, (slot, target, skill) => {
        const r = this.#runners[slot]!;
        this.#strike(
          r,
          target,
          HEROES[r.hero].power * (skill === 3 ? 7 : skill === 0 ? 2 : 3),
          skill,
        );
      });
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
