import {
  RaidProjectiles,
  raidProjectileProfile,
  unitDirection,
  type RaidDirection,
  type RaidProjectile,
} from './raid-projectiles.ts';
import { applyRaidHitControl, type RaidControl } from './raid-control.ts';
import { RaidBoss, type RaidCounter } from './raid-boss.ts';
import { inBasicAttackArc, inRaidSight } from './raid-sight.ts';
import { bladeDashRange, bladeState, DASH_TICKS, FULL_MOON_SPIN_TICKS } from './raid-blades.ts';
import { raidActiveAction, raidFacing } from './raid-facing.ts';

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
  rend: { hp: 118, power: 11, reach: 3.6, cooldown: 24, radius: 4.1 },
  bastion: { hp: 150, power: 10, reach: 3.8, cooldown: 29, radius: 3.8 },
  rime: { hp: 98, power: 10, reach: 10.5, cooldown: 28, radius: 3.7 },
  rildin: { hp: 125, power: 9, reach: 3.4, cooldown: 28, radius: 3.5 },
  kaiken: { hp: 108, power: 9, reach: 3.3, cooldown: 28, radius: 3.1 },
  swift: { hp: 95, power: 8, reach: 3.2, cooldown: 23, radius: 2.6 },
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
export const WAGON_HP = 7600;
export const SKILL_COOLDOWNS = [150, 105, 210, 30] as const;
export const RESPAWN_TICKS = 8 * RAID_HZ;
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
  dash?: boolean;
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
  if (hero === 'hammer' && (skill === 1 || skill === 2)) return 'pulse';
  if (hero === 'kaiken' && (skill === 2 || skill === 3)) return 'pulse';
  if (bladeDashRange(hero, skill)) return 'direction';
  if (hero === 'rildin') return 'pulse';
  if (hero === 'swift' && skill === 2) return 'target';
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
  readonly phase?: 'ground' | 'dash' | 'spin';
  readonly from: Readonly<RaidPoint>;
  readonly to: Readonly<RaidPoint>;
  readonly fromY: number;
  readonly toY: number;
}

interface Runner extends RaidPoint, RaidControl {
  spinTicks: number;
  blade: ReturnType<typeof bladeState>;
  slot: number;
  team: Team;
  hero: RaidHero;
  hp: number;
  rage: number;
  target: RaidTarget | null;
  lastStrike: RaidTarget | null;
  lastWard: number | null;
  side: number;
  brake: number;
  jumping: number;
  // Both endpoints describe fixed road positions in the wagon frame at takeoff.
  leap: Readonly<{ from: Readonly<RaidPoint>; to: Readonly<RaidPoint>; elapsed: number }> | null;
  respawn: number;
  basic: number;
  cooldowns: number[];
  shield: number;
  marked: number;
  kills: number;
  wagonDamage: number;
  deaths: number;
  assists: number;
}
export type RaidRunner = Readonly<Omit<Runner, 'cooldowns'>> & {
  readonly cooldowns: readonly number[];
};
export const raidBasicReach = (r: RaidRunner, tick: number) =>
  HEROES[r.hero].reach + (r.blade.swordUntil > tick ? 1.5 : 0);
const targetRange = (hero: RaidHero, skill: Skill) =>
  hero === 'swift' ? (skill === 3 ? 8 : 12) : RAID_SKILL_RANGE.shot;
export function raidRunnerAimKind(r: RaidRunner, skill: Skill) {
  return raidAimKind(r.hero, skill);
}
export function raidBossBonusPercent(runners: readonly RaidRunner[], attackingTeam: number) {
  return (
    15 * runners.filter((runner) => runner.team !== attackingTeam && runner.respawn > 0).length
  );
}
export interface RaidView {
  readonly calls: readonly (Readonly<{ from: number; target: RaidTarget; until: number }> | null)[];
  readonly projectiles: readonly RaidProjectile[];
  readonly actions: readonly RaidAction[];
  readonly runners: readonly RaidRunner[];
  readonly damage: readonly number[];
  readonly leadChanges: number;
  readonly tick: number;
  readonly result: Readonly<{ reason: 'destruction' | 'time'; winner: Team | 'draw' }> | null;
  readonly hazard: RaidCounter | null;
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
  if (r.respawn || r.silenced || r.staggered || r.leap || r.spinTicks) return false;
  if (r.blade.dash) return r.hero === 'kaiken' && skill === 2;
  return (
    !r.cooldowns[skill] &&
    !(isRaidLeap(r.hero, skill) && r.jumping) &&
    (skill !== 3 || r.rage >= 100)
  );
}
/** Predict up to one tick from the current ground position for both the match and the camera. */
export function raidRunnerPositionAfter(r: RaidRunner, ticks: number): RaidPoint {
  if (r.blade.moonSpinTicks) return { x: r.x, z: r.z };
  const dash = r.blade.dash;
  if (dash && !r.staggered) {
    const t = Math.min(1, (dash.elapsed + ticks) / dash.ticks);
    return {
      x: dash.from.x + (dash.to.x - dash.from.x) * t,
      z: dash.from.z + (dash.to.z - dash.from.z) * t,
    };
  }
  if (r.leap) {
    const { from, to, elapsed } = r.leap;
    const age = Math.min(RAID_LEAP_TICKS, elapsed + ticks);
    const t = age / RAID_LEAP_TICKS;
    return raidGroundPointAfter(
      { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t },
      age,
    );
  }
  // Keep steering intent through a stagger so held controls resume on recovery.
  const seconds = r.respawn || r.staggered ? 0 : (ticks / RAID_HZ) * (r.slowed ? 0.55 : 1);
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
  spinTicks: 0,
  blade: bladeState(),
  hero,
  slot,
  team: slot < 2 ? 0 : 1,
  x: spawnX[slot]!,
  z: slot % 2 === 0 ? 0 : -2,
  hp: HEROES[hero].hp,
  rage: 0,
  target: 'wagon',
  lastStrike: null,
  lastWard: null,
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
  staggered: 0,
  staggerGuard: 0,
  marked: 0,
  kills: 0,
  wagonDamage: 0,
  deaths: 0,
  assists: 0,
});

type Hit = {
  from: number | null;
  target: RaidTarget;
  amount: number;
  skill?: Skill;
  designated?: boolean;
};
/** The authority advances exactly one tick per step. All damage in a tick resolves together. */
export class RaidMatch implements RaidView {
  readonly #runners: Runner[];
  readonly #playerAspect: () => number;
  readonly #damage: [number, number] = [0, 0];
  #lastLeader: Team | null = null;
  #leadChanges = 0;
  #tick = 0;
  readonly #calls: Array<RaidView['calls'][number]> = [null, null];
  get calls(): RaidView['calls'] {
    return this.#calls;
  }
  #result: RaidView['result'] = null;
  readonly #boss = new RaidBoss();
  readonly #bossHit = (slot: number, amount: number) => {
    this.#hits.push({ from: null, target: slot, amount });
  };
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
  constructor(
    hero: RaidHero | readonly RaidHero[] = 'hammer',
    playerAspect: () => number = () => standardAspect,
  ) {
    const heroes =
      typeof hero === 'string' ? [hero, ...HERO_IDS.filter((id) => id !== hero).slice(0, 3)] : hero;
    this.#runners = heroes.map(makeRunner);
    this.#playerAspect = playerAspect;
  }
  get runners(): readonly RaidRunner[] {
    return this.#runners;
  }
  get damage(): readonly number[] {
    return this.#damage;
  }
  get leadChanges() {
    return this.#leadChanges;
  }
  get tick() {
    return this.#tick;
  }
  get result() {
    return this.#result;
  }
  get hazard(): RaidView['hazard'] {
    return this.#boss.counter;
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
    if (!r || r.jumping || r.leap || r.blade.dash || r.staggered) return false;
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
    const kind = raidRunnerAimKind(r, skill);
    const projectile = kind === 'direction' ? raidProjectileProfile(r.hero, skill) : null;
    const startingMoon = r.hero === 'kaiken' && skill === 2 && !r.blade.dash;
    const area = kind === 'field' || (kind === 'pulse' && !startingMoon);
    const radius =
      area || kind === 'leap'
        ? raidAreaRadius(r.hero, kind === 'field' ? 2 : 0)
        : skill === 3 && r.hero === 'hammer'
          ? HEROES.hammer.radius
          : 0;
    const range =
      kind === 'pulse'
        ? startingMoon
          ? bladeDashRange(r.hero, skill)
          : radius
        : kind === 'direction'
          ? (projectile?.reach ?? bladeDashRange(r.hero, skill))
          : kind === 'target'
            ? targetRange(r.hero, skill)
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
      dash: kind === 'direction' && !!bladeDashRange(r.hero, skill),
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
  callTarget(slot: number, target: RaidTarget) {
    const r = this.#active(slot);
    if (!r || this.#calls[r.team] || !this.#visibleTarget(r, target)) return false;
    this.#calls[r.team] = { from: slot, target, until: this.tick + 4 * RAID_HZ };
    return true;
  }
  repeatCast(slot: number, skill: Skill) {
    const r = this.#active(slot);
    if (!r) return false;
    const kind = raidAimKind(r.hero, skill);
    const target = kind === 'ward' ? r.lastWard : kind === 'target' ? r.lastStrike : null;
    return target !== null && this.cast(slot, skill, target);
  }
  #strike(r: Runner, target: RaidTarget, amount: number, skill?: Skill, designated = false) {
    const point = this.#position(r, target);
    if (!point) return;
    this.#hits.push({ from: r.slot, target, amount, skill, designated });
    if (skill === undefined) this.#record(r, 'basic', point);
  }
  #record(r: Runner, skill: RaidAction['skill'], point: RaidPoint, phase?: RaidAction['phase']) {
    const target = this.#runners.find((other) => other === point);
    const action = {
      id: ++this.#sequence,
      tick: this.#tick,
      slot: r.slot,
      hero: r.hero,
      skill,
      phase,
      from: { x: r.x, z: r.z },
      fromY: 1 + raidRunnerHeight(r),
      to: { x: point.x, z: point.z },
      toY:
        phase === 'ground' || phase === 'spin' ? 0.08 : target ? 1 + raidRunnerHeight(target) : 1.9,
    };
    this.#actions.push(action);
    if (skill === 2 && r.hero !== 'hammer' && raidAimKind(r.hero, skill) === 'field')
      this.#fields.push(action);
  }
  #heal(caster: Runner, recipient: Runner, amount: number) {
    const healed = Math.min(amount, HEROES[recipient.hero].hp - recipient.hp);
    recipient.hp += healed;
    gainRage(caster, healed);
  }
  #sweep(r: Runner, radius: number, amount: number, skill: Skill) {
    for (const target of this.#areaTargets(r, r, radius)) this.#strike(r, target, amount, skill);
  }
  #startDash(r: Runner, skill: Skill, to: RaidPoint, target?: RaidTarget) {
    this.#record(r, skill, to, 'dash');
    r.blade.dash = {
      from: { x: r.x, z: r.z },
      to,
      elapsed: 0,
      ticks: r.hero === 'kaiken' ? 18 : DASH_TICKS,
      target,
    };
  }
  cast(slot: number, skill: Skill, aim?: RaidPoint | RaidTarget | RaidDirection) {
    const r = this.#active(slot);
    if (!r || ![0, 1, 2, 3].includes(skill) || !canUseRaidSkill(r, skill)) return false;
    const hero = HEROES[r.hero];
    if (r.blade.dash && r.hero === 'kaiken' && skill === 2) {
      if (aim !== undefined) return false;
      this.#finishDash(r);
      return true;
    }
    const projectile = raidProjectileProfile(r.hero, skill);
    const dashRange = bladeDashRange(r.hero, skill);
    let cooldown: number = SKILL_COOLDOWNS[skill];
    if (r.hero === 'kaiken' && skill === 2) {
      if (aim !== undefined) return false;
      const yaw = raidFacing(r, raidActiveAction(this.#actions, slot, this.tick));
      this.#startDash(r, skill, {
        x: r.x + Math.sin(yaw) * dashRange,
        z: r.z + Math.cos(yaw) * dashRange,
      });
    } else if (dashRange) {
      if (!aim || typeof aim !== 'object' || !('dx' in aim)) return false;
      const direction = unitDirection(aim.dx, aim.dz);
      if (!direction) return false;
      this.#startDash(r, skill, {
        x: r.x + direction.dx * dashRange,
        z: r.z + direction.dz * dashRange,
      });
      if (r.hero === 'rildin') {
        r.blade.strides++;
        if (r.blade.strides < 2) {
          r.blade.strideUntil = this.tick + 60;
          cooldown = DASH_TICKS;
        } else r.blade.strides = 0;
      }
    } else if (r.hero === 'rildin') {
      if (aim !== undefined) return false;
      this.#record(r, skill, r);
      if (skill === 0) {
        const reach = 5 + (r.blade.swordUntil > this.tick ? 1.5 : 0);
        for (const id of this.#areaTargets(r, r, reach)) {
          const point = this.#position(r, id)!;
          if (
            inBasicAttackArc(r, point) &&
            (!('jumping' in point) || raidRunnerHeight(point) < 0.7)
          )
            this.#strike(r, id, hero.power, skill);
        }
        r.blade.slashes++;
        if (r.blade.slashes < 4) {
          r.basic = 0;
          if (r.blade.slashes === 1) r.blade.slashUntil = this.tick + 120;
          cooldown = 8;
        } else r.blade.slashes = 0;
      } else if (skill === 1) {
        r.blade.parryUntil = this.tick + RAID_HZ;
      } else {
        r.blade.swordUntil = this.tick + 300;
        r.blade.slashes = r.cooldowns[0] = r.basic = 0;
      }
    } else if (r.hero === 'hammer' && skill === 1) {
      if (aim !== undefined) return false;
      this.#record(r, skill, r, 'ground');
      this.#sweep(r, hero.radius, hero.power * 3, skill);
    } else if ((r.hero === 'kaiken' && skill === 3) || (r.hero === 'hammer' && skill === 2)) {
      if (aim !== undefined) return false;
      r.spinTicks = r.hero === 'hammer' ? 60 : 75;
      r.slowed = 0;
      this.#record(r, skill, r);
    } else if (r.hero === 'swift' && skill !== 0) {
      if (typeof aim !== 'number' && aim !== 'wagon') return false;
      const target = this.#visibleTarget(r, aim);
      if (!target || distance(r, target) > targetRange(r.hero, skill)) return false;
      if (skill === 1) {
        const dir = unitDirection(target.x - r.x, target.z - r.z);
        const gap = Math.min(distance(r, target), 0.85);
        this.#startDash(
          r,
          skill,
          { x: target.x - (dir?.dx ?? 0) * gap, z: target.z - (dir?.dz ?? 1) * gap },
          aim,
        );
      } else {
        this.#record(r, skill, target);
        if (skill === 3) {
          r.x = target.x;
          r.z = target.z - 1.1;
          r.blade.invulnerableUntil = this.tick + 7;
        }
        this.#strike(r, aim, hero.power * (skill === 3 ? 7 : 1), skill, true);
      }
    } else if (isRaidLeap(r.hero, skill)) {
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
    } else if (r.hero === 'jade' && skill === 0) {
      if (typeof aim !== 'number' || !this.canShield(slot, aim)) return false;
      const recipient = this.#runners[aim]!;
      recipient.shield = 75;
      r.lastWard = recipient.slot;
      this.#heal(r, recipient, hero.power * 2);
      this.#record(r, skill, recipient);
    } else if (skill === 0 || skill === 2) {
      const center =
        skill === 0 ? r : aim && typeof aim === 'object' && 'x' in aim ? aim : undefined;
      if (!center || (skill === 2 && !this.canAimGround(slot, center))) return false;
      const radius = raidAreaRadius(r.hero, skill);
      if (r.hero === 'bastion' && skill === 0) r.shield = Math.max(r.shield, RAID_HZ * 2);
      this.#record(r, skill, center, 'ground');
      for (const target of this.#areaTargets(r, center, radius))
        this.#strike(r, target, hero.power * (skill === 0 ? 2 : 3), skill);
    } else {
      if (typeof aim !== 'number' && aim !== 'wagon') return false;
      const targetId = aim;
      const target = this.#visibleTarget(r, targetId);
      if (!target || !inRaidCastRange(r, target, skill)) return false;
      this.#record(r, skill, target);
      this.#strike(r, targetId, hero.power * (skill === 3 ? 7 : 3), skill, true);
      if (skill === 3) {
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
    if (skill === 3) r.rage = 0;
    if (r.hero === 'rildin' && skill !== 0) r.basic = 0;
    r.cooldowns[skill] = cooldown;
    return true;
  }
  #finishDash(r: Runner) {
    const dash = r.blade.dash!;
    r.blade.dash = null;
    if (r.hero === 'kaiken') {
      r.blade.moonSpinTicks = FULL_MOON_SPIN_TICKS;
      this.#record(r, 2, r, 'spin');
      this.#sweep(r, HEROES.kaiken.radius, HEROES.kaiken.power * 2, 2);
    }
    if (dash.target !== undefined) {
      const point = this.#position(r, dash.target);
      if (point && distance(r, point) <= HEROES.swift.reach)
        this.#strike(r, dash.target, HEROES.swift.power * 3, 1, true);
    }
  }
  #basicTarget(r: Runner, target: RaidTarget | null) {
    const point = this.#visibleTarget(r, target);
    return point && inBasicAttackArc(r, point) ? point : undefined;
  }
  #autoAttack(r: Runner) {
    const stats = HEROES[r.hero];
    const reach = raidBasicReach(r, this.tick);
    // Prefer the lock in reach, then the nearest legal target. A distant lock cannot suppress melee.
    let target = r.target;
    const point = this.#basicTarget(r, target);
    if (target === null || !point || distance(r, point) > reach) {
      let nearest: number = reach;
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
    let amount: number = stats.power;
    if (r.hero === 'swift') {
      // Accumulate missing-health crit chance deterministically across authority and replay.
      r.blade.vengeance += 4 * Math.floor((10 * (stats.hp - r.hp)) / stats.hp);
      if (r.blade.vengeance >= 100) {
        amount *= 2;
        r.blade.vengeance -= 100;
      }
    }
    this.#strike(r, target, amount);
    const quarry = r.blade.quarry !== null && this.#position(r, r.blade.quarry);
    const haste =
      quarry && r.blade.quarryUntil > this.tick
        ? Math.max(0, 1.05 - 0.105 * Math.max(0, distance(r, quarry) - 1))
        : 0;
    r.basic = Math.ceil(stats.cooldown / (1 + haste));
  }
  #resolveHits() {
    if (!this.#hits.length) return;
    // Hits land simultaneously. A knockout in this batch affects hits from the next tick.
    const bonuses = [
      raidBossBonusPercent(this.runners, 0),
      raidBossBonusPercent(this.runners, 1),
    ] as const;
    for (const hit of this.#hits) {
      const attacker = hit.from === null ? undefined : this.#runners[hit.from];
      const victim = hit.target === 'wagon' ? undefined : this.#runners[hit.target];
      if (victim?.respawn || (victim && victim.blade.invulnerableUntil >= this.tick)) continue;
      if (victim && victim.blade.parryUntil >= this.tick) {
        victim.blade.parryUntil = 0;
        this.#sweep(victim, 5, HEROES.rildin.power, 1);
        gainRage(victim, hit.amount);
        continue;
      }
      let base = hit.amount;
      if (attacker?.hero === 'kaiken' && !attacker.respawn) {
        base += Math.min(5, Math.floor((this.tick - attacker.blade.lastMoonHit) / 60)) * 2;
        attacker.blade.lastMoonHit = this.tick;
      }
      if (attacker?.hero === 'swift' && hit.skill === 2 && !attacker.respawn) {
        attacker.blade.quarry = hit.target;
        attacker.blade.quarryUntil = this.tick + 150;
      }
      if (hit.target === 'wagon') {
        if (attacker) {
          const boosted = Math.round((base * (100 + bonuses[attacker.team])) / 100);
          const damage = Math.min(boosted, WAGON_HP - this.#damage[attacker.team]);
          this.#damage[attacker.team] += damage;
          attacker.wagonDamage += damage;
          if (hit.designated && damage > 0) attacker.lastStrike = 'wagon';
          if (hit.skill !== 3) gainRage(attacker, damage);
        }
        continue;
      }
      if (!victim) continue;
      const markedShot =
        attacker?.hero === 'longshot' && hit.skill === undefined && victim.marked > 0;
      const amount = base + (markedShot ? HEROES.longshot.power : 0);
      if (markedShot) victim.marked = 0;
      const piercesShield = attacker?.hero === 'longshot' && hit.skill === 3;
      const damage = Math.min(
        victim.hp,
        victim.shield && !piercesShield ? Math.ceil(amount / 2) : amount,
      );
      victim.hp -= damage;
      if (attacker && hit.designated && damage > 0) attacker.lastStrike = victim.slot;
      gainRage(victim, damage);
      const contributors = this.#contributors[victim.slot]!;
      if (attacker) {
        contributors.set(attacker.slot, this.#tick);
        // Fury can charge its victim, but cannot refund its own cost.
        if (hit.skill !== 3) gainRage(attacker, damage);
        if (attacker.hero === 'rend' && !attacker.respawn && (hit.skill === 0 || hit.skill === 3))
          attacker.hp = Math.min(HEROES.rend.hp, attacker.hp + Math.ceil(damage / 3));
        if (hit.skill !== undefined && !(victim.hero === 'hammer' && victim.spinTicks))
          applyRaidHitControl(victim, attacker.hero, hit.skill);
        if (attacker.hero === 'bastion' && hit.skill === 3)
          attacker.shield = Math.max(attacker.shield, RAID_HZ * 3);
        if (attacker.hero === 'longshot' && hit.skill === 1) victim.marked = 3 * RAID_HZ;
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
        victim.staggered = victim.staggerGuard = 0;
        victim.marked = 0;
        victim.respawn = RESPAWN_TICKS;
        victim.jumping = 0;
        victim.leap = null;
        victim.blade = bladeState();
        victim.spinTicks = 0;
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
    const previous = this.projectiles.length
      ? this.runners.map((r) => ({ x: r.x, z: r.z, height: raidRunnerHeight(r) }))
      : null;
    while (this.#actions.length && this.#tick - this.#actions[0]!.tick > 39) this.#actions.shift();
    for (const r of this.#runners) {
      if (r.respawn) {
        if (--r.respawn === 0) {
          r.hp = HEROES[r.hero].hp;
          r.x = spawnX[r.slot]!;
          r.z = -6;
          if (previous) previous[r.slot] = { x: r.x, z: r.z, height: 0 };
          r.blade.lastMoonHit = this.tick;
          r.target = 'wagon';
          r.shield = 45;
        }
        continue;
      }
      if (r.staggered) r.blade.dash = null;
      if (r.spinTicks) r.slowed = 0;
      const next = raidRunnerPositionAfter(r, 1);
      r.x = next.x;
      r.z = next.z;
      if (r.blade.moonSpinTicks) r.blade.moonSpinTicks--;
      if (r.leap) r.leap = { ...r.leap, elapsed: r.leap.elapsed + 1 };
      if (r.silenced) r.silenced--;
      if (r.slowed) r.slowed--;
      if (r.marked) r.marked--;
      if (r.jumping) r.jumping--;
      if (r.shield) r.shield--;
      for (const skill of [0, 1, 2, 3]) if (r.cooldowns[skill]!) r.cooldowns[skill]!--;
      if (r.blade.slashes && r.blade.slashUntil <= this.tick) {
        r.blade.slashes = 0;
        r.cooldowns[0] = SKILL_COOLDOWNS[0];
      }
      if (r.blade.strides && r.blade.strideUntil <= this.tick) {
        r.blade.strides = 0;
        r.cooldowns[2] = SKILL_COOLDOWNS[2];
      }
      if (r.basic) r.basic--;
    }
    // Everyone moves before checking range so runner ordering cannot change who gets a hit.
    for (const r of this.#runners) {
      if (r.blade.dash) {
        const dash = r.blade.dash;
        if (++dash.elapsed === dash.ticks) this.#finishDash(r);
      } else if (r.leap?.elapsed === RAID_LEAP_TICKS) {
        r.leap = null;
        this.#record(r, 0, r, 'ground');
        for (const target of this.#areaTargets(r, r, raidAreaRadius(r.hero, 0)))
          this.#strike(r, target, HEROES[r.hero].power * 2, 0);
      } else if (!r.respawn && !r.leap && !r.basic && !r.staggered && !r.spinTicks)
        this.#autoAttack(r);
      if (r.staggered) r.staggered--;
      if (r.staggerGuard) r.staggerGuard--;
      if (r.spinTicks && --r.spinTicks % 15 === 0) {
        const stats = HEROES[r.hero];
        const hammer = r.hero === 'hammer';
        this.#sweep(r, stats.radius, stats.power * (hammer ? 1.5 : 2), hammer ? 2 : 3);
      }
    }
    this.#boss.step(this.#tick, this.runners, raidRunnerHeight, this.#bossHit);
    if (previous)
      this.#projectiles.step(
        this.runners,
        previous,
        WAGON,
        raidRunnerHeight,
        (slot, target, skill) => {
          const r = this.#runners[slot]!;
          this.#strike(
            r,
            target,
            HEROES[r.hero].power * (skill === 3 ? 7 : skill === 0 ? 2 : 3),
            skill,
          );
        },
      );
    this.#pulseFields();
    this.#resolveHits();
    for (const r of this.#runners) {
      // A remembered target belongs to this life, even if the same slot later respawns.
      if (r.respawn || (typeof r.lastStrike === 'number' && this.#runners[r.lastStrike]!.respawn))
        r.lastStrike = null;
      if (r.respawn || (r.lastWard !== null && this.#runners[r.lastWard]!.respawn))
        r.lastWard = null;
      if (r.target !== null && (r.respawn || !this.#visibleTarget(r, r.target))) r.target = null;
      if (
        r.blade.quarry !== null &&
        (r.blade.quarryUntil <= this.tick || !this.#position(r, r.blade.quarry))
      )
        r.blade.quarry = null;
    }
    for (const team of [0, 1] as const) {
      const call = this.#calls[team];
      if (
        call &&
        (call.until <= this.tick ||
          (call.target !== 'wagon' && this.#runners[call.target]!.respawn))
      )
        this.#calls[team] = null;
    }
    const [blue, red] = this.#damage;
    // Read the settled tick. A tie preserves the last outright lead, including on the final tick.
    if (blue !== red) {
      const leader = blue > red ? 0 : 1;
      if (this.#lastLeader !== null && leader !== this.#lastLeader) this.#leadChanges++;
      this.#lastLeader = leader;
    }
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
