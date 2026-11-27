import { RaidProjectiles, type RaidDirection } from './raid-projectiles.ts';
import { RaidFields } from './combat/active-fields.ts';
import { RaidHitResolution, gainRage } from './combat/hit-resolution.ts';
export { raidBossBonusPercent } from './combat/hit-resolution.ts';
import { RaidBoss } from './raid-boss.ts';
import { inBasicAttackArc, inRaidSight } from './raid-sight.ts';
import { raidActiveAction, raidFacing } from './raid-facing.ts';
import {
  HEROES,
  heroCatalog,
  raidBasicReach,
  raidAimKind,
  canUseRaidSkill,
  raidSkill,
} from './heroes/hero-catalog.ts';
import { HERO_IDS, type RaidHero } from './heroes/hero-id.ts';
import type { HeroCombat, HeroView, RaidHeroRuntime } from './heroes/hero-definition.ts';
import { castInput, resolveSkill, type TargetRead } from './skills/skill-targeting.ts';
import {
  RAID_HZ,
  RAID_LEAP_TICKS,
  RAID_SKILL_RANGE,
  RAID_TARGETS,
  ROUND_TICKS,
  SKILL_COOLDOWNS,
  WAGON,
  WAGON_HP,
  distance,
} from './raid-rules.ts';
import { raidRunnerHeight, raidRunnerPositionAfter } from './runner-motion.ts';
import type {
  RaidAction,
  RaidAim,
  RaidPoint,
  RaidRunner,
  RaidTarget,
  RaidView,
  Runner,
  Skill,
  Team,
} from './raid-view.ts';
export type { RaidHero } from './heroes/hero-id.ts';
export { HERO_IDS } from './heroes/hero-id.ts';
export {
  HEROES,
  raidAimKind,
  raidBasicReach,
  raidRunnerAimKind,
  canUseRaidSkill,
  isRaidLeap,
} from './heroes/hero-catalog.ts';
export {
  RAID_HZ,
  RAID_LEAP_TICKS,
  RAID_SKILL_RANGE,
  RESPAWN_TICKS,
  ROUND_TICKS,
  SKILL_COOLDOWNS,
  WAGON,
  WAGON_HP,
} from './raid-rules.ts';
export * from './runner-motion.ts';
export type {
  RaidAction,
  RaidAim,
  RaidPoint,
  RaidRunner,
  RaidTarget,
  RaidView,
  Skill,
} from './raid-view.ts';
const emptyView: HeroView = Object.freeze({});
export const raidAreaRadius = (hero: RaidHero, skill: 0 | 2) =>
  HEROES[hero].radius + (skill === 2 ? 0.6 : 0);
const standardAspect = 16 / 9;
export function inRaidCastRange(caster: RaidPoint, point: RaidPoint, skill: Skill) {
  return distance(caster, point) <= (skill === 2 ? RAID_SKILL_RANGE.field : RAID_SKILL_RANGE.shot);
}
const spawnX = [-1.6, -3.3, 1.6, 3.3];
const makeRunner = (hero: RaidHero, slot: number, view: () => HeroView): Runner => ({
  spinTicks: 0,
  dash: null,
  get heroView() {
    return view();
  },
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

/** The authority advances exactly one tick per step. All damage in a tick resolves together. */
export class RaidMatch implements RaidView {
  readonly #runners: Runner[];
  readonly #heroes: RaidHeroRuntime[];
  readonly #contexts: (HeroCombat & TargetRead)[];

  readonly #playerAspect: () => number;

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
    this.#hits.enqueue({ from: null, target: slot, amount });
  };
  readonly #hits: RaidHitResolution;
  readonly #projectiles = new RaidProjectiles();
  get projectiles() {
    return this.#projectiles.active;
  }
  #sequence = 0;
  #actions: RaidAction[] = [];
  readonly #fields = new RaidFields();
  get actions(): readonly RaidAction[] {
    return this.#actions;
  }
  constructor(
    hero: RaidHero | readonly RaidHero[] = 'hammer',
    playerAspect: () => number = () => standardAspect,
  ) {
    const heroes =
      typeof hero === 'string' ? [hero, ...HERO_IDS.filter((id) => id !== hero).slice(0, 3)] : hero;
    this.#heroes = heroes.map((id) => heroCatalog[id].create());
    this.#runners = heroes.map((id, slot) =>
      makeRunner(id, slot, () => this.#heroes[slot]!.events.view ?? emptyView),
    );
    this.#contexts = this.#runners.map((r) => this.#combat(r));
    this.#hits = new RaidHitResolution(
      this.#contexts,
      (slot) => this.#heroes[slot]!.events,
      (slot) => {
        this.#heroes[slot] = heroCatalog[this.#runners[slot]!.hero].create();
      },
    );
    this.#playerAspect = playerAspect;
  }
  get runners(): readonly RaidRunner[] {
    return this.#runners;
  }
  get damage(): readonly number[] {
    return this.#hits.damage;
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
    if (!r || r.jumping || r.leap || r.dash || r.staggered) return false;
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
    if (!caster || !recipient || recipient.team !== caster.team) return false;
    const ward = heroCatalog[caster.hero].skills.find((rule) => rule.kind === 'ward');
    return (
      !!ward &&
      (slot === ally ||
        (distance(caster, recipient) <= (ward.range ?? 0) &&
          this.#inSight(caster, recipient, 1 + raidRunnerHeight(recipient))))
    );
  }
  canTarget(slot: number, target: RaidTarget) {
    const r = this.#active(slot);
    return !!r && !!this.#visibleTarget(r, target);
  }
  #areaTargets(r: Runner, center: RaidPoint, radius: number) {
    return RAID_TARGETS.filter((id) => {
      const point = this.#position(r, id);
      return point && distance(center, point) <= radius;
    });
  }
  #inHealingArea(caster: Runner, ally: Runner, center: RaidPoint, radius: number) {
    return !ally.respawn && ally.team === caster.team && distance(ally, center) <= radius;
  }
  #combat(r: Runner): HeroCombat & TargetRead {
    return {
      self: r,
      stats: HEROES[r.hero],
      tick: () => this.tick,
      position: (id) => this.#position(r, id),
      enemies: (p, radius) => this.#areaTargets(r, p, radius),
      height: raidRunnerHeight,
      targetPoint: (id) => (id === 'wagon' ? WAGON : (this.#runners[id] ?? null)),
      canTarget: (id) => this.canTarget(r.slot, id),
      canShield: (id) => this.canShield(r.slot, id),
      alliesInArea: (p, radius) =>
        this.#runners.filter((ally) => this.#inHealingArea(r, ally, p, radius)).length,
      facing: () => raidFacing(r, raidActiveAction(this.#actions, r.slot, this.tick)),
      record: (skill, p, phase) => this.#record(r, skill, p, phase),
      strike: (id, amount, skill, designated) => this.#strike(r, id, amount, skill, designated),
      placeField: (skill, point, radius) =>
        this.#fields.place(r.slot, this.tick, point, radius, raidSkill(r.hero, skill)),
      sweep: (radius, amount, skill) => this.#sweep(r, radius, amount, skill),
      dash: (skill, to, ticks, target) => this.#startDash(r, skill, to, ticks, target),
      finishDash: () => this.#finishDash(r),
      fire: (skill, direction, profile) => {
        this.#projectiles.launch(r, skill, direction, profile, RAID_HZ);
        this.#record(r, skill, {
          x: r.x + direction.dx * profile.reach,
          z: r.z + direction.dz * profile.reach,
        });
      },
      gainRage: (amount) => gainRage(r, amount),
      heal: (id, amount) => this.#heal(r, this.#runners[id]!, amount),
      shield: (id, ticks, replace) => {
        const ally = this.#runners[id]!;
        ally.shield = replace ? ticks : Math.max(ticks, ally.shield);
      },
      shieldRecipients: () =>
        this.#runners.filter((ally) => this.canShield(r.slot, ally.slot)).map((ally) => ally.slot),
      visibleEnemies: (p, radius) =>
        RAID_TARGETS.filter((id) => {
          const target = this.#visibleTarget(r, id);
          return target && distance(target, p) <= radius;
        }),
    };
  }
  previewSkill(slot: number, skill: Skill, ground: RaidPoint | null, target?: RaidTarget): RaidAim {
    const c = this.#contexts[slot]!;
    return resolveSkill(
      c,
      raidSkill(c.self.hero, skill),
      skill,
      !!this.#active(slot) && canUseRaidSkill(c.self, skill),
      ground,
      target,
    ).preview;
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
    this.#hits.enqueue({ from: r.slot, target, amount, skill, designated });
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
  }
  #heal(caster: Runner, recipient: Runner, amount: number) {
    const healed = Math.min(amount, HEROES[recipient.hero].hp - recipient.hp);
    recipient.hp += healed;
    gainRage(caster, healed);
  }
  #sweep(r: Runner, radius: number, amount: number, skill: Skill) {
    for (const target of this.#areaTargets(r, r, radius)) this.#strike(r, target, amount, skill);
  }
  #startDash(r: Runner, skill: Skill, to: RaidPoint, ticks: number, target?: RaidTarget) {
    this.#record(r, skill, to, 'dash');
    r.dash = { from: { x: r.x, z: r.z }, to, elapsed: 0, ticks, target };
  }
  cast(slot: number, skill: Skill, aim?: RaidPoint | RaidTarget | RaidDirection) {
    const r = this.#active(slot);
    if (!r || ![0, 1, 2, 3].includes(skill) || !canUseRaidSkill(r, skill)) return false;
    const rule = raidSkill(r.hero, skill);
    const input = castInput(rule, r, aim);
    if (!input) return false;
    const c = this.#contexts[slot]!;
    const { resolved } = resolveSkill(
      c,
      rule,
      skill,
      true,
      input.point,
      input.target,
      input.direction,
    );
    if (!resolved) return false;
    const hero = this.#heroes[slot]!;
    const cooldown = hero.cast(c, resolved) ?? SKILL_COOLDOWNS[skill];
    if (skill === 3) r.rage = 0;
    hero.events.onCast?.(c, skill);
    r.cooldowns[skill] = cooldown;
    return true;
  }
  #finishDash(r: Runner) {
    const dash = r.dash!;
    r.dash = null;
    this.#heroes[r.slot]!.events.onDashEnd?.(this.#contexts[r.slot]!, dash.target);
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
      for (const candidate of RAID_TARGETS) {
        const p = this.#basicTarget(r, candidate);
        if (p && distance(r, p) <= nearest) {
          nearest = distance(r, p);
          found = candidate;
        }
      }
      if (found === undefined) return;
      target = found;
    }
    const attack = this.#heroes[r.slot]!.events.onBasicAttack?.(this.#contexts[r.slot]!);
    this.#strike(r, target, attack?.amount ?? stats.power);
    r.basic = attack?.cooldown ?? stats.cooldown;
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
          this.#heroes[r.slot]!.events.onRespawn?.(this.#contexts[r.slot]!);
          r.target = 'wagon';
          r.shield = 45;
        }
        continue;
      }
      if (r.staggered) r.dash = null;
      if (r.spinTicks) r.slowed = 0;
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
      this.#heroes[r.slot]!.events.onTimersAdvanced?.(this.#contexts[r.slot]!);
      if (r.basic) r.basic--;
    }
    // Everyone moves before checking range so runner ordering cannot change who gets a hit.
    for (const r of this.#runners) {
      if (r.dash) {
        const dash = r.dash;
        if (++dash.elapsed === dash.ticks) this.#finishDash(r);
      } else if (r.leap?.elapsed === RAID_LEAP_TICKS) {
        r.leap = null;
        this.#heroes[r.slot]!.events.onLand?.(this.#contexts[r.slot]!);
      } else if (!r.respawn && !r.leap && !r.basic && !r.staggered && !r.spinTicks)
        this.#autoAttack(r);
      if (r.staggered) r.staggered--;
      if (r.staggerGuard) r.staggerGuard--;
      if (r.spinTicks && --r.spinTicks % 15 === 0)
        this.#heroes[r.slot]!.events.onSpinPulse?.(this.#contexts[r.slot]!);
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
          raidSkill(r.hero, skill).onProjectileHit?.(this.#contexts[slot]!, target, skill);
        },
      );
    this.#fields.step(this.tick, this.#contexts);
    this.#hits.resolve(this.tick);
    for (const r of this.#runners) {
      // A remembered target belongs to this life, even if the same slot later respawns.
      if (r.respawn || (typeof r.lastStrike === 'number' && this.#runners[r.lastStrike]!.respawn))
        r.lastStrike = null;
      if (r.respawn || (r.lastWard !== null && this.#runners[r.lastWard]!.respawn))
        r.lastWard = null;
      if (r.target !== null && (r.respawn || !this.#visibleTarget(r, r.target))) r.target = null;
      this.#heroes[r.slot]!.events.onTickEnd?.(this.#contexts[r.slot]!);
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
    const [blue, red] = this.#hits.damage;
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
