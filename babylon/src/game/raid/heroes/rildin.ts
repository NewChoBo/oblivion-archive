import { stats, chainSlash, advance, unboundSword } from '../../../content/raid/heroes/rildin.ts';
import { defineHero, type HeroCombat, type HeroEvents, type Hit } from './hero-definition.ts';
import type { RaidRunner, Skill } from '../raid-view.ts';
import { RAID_HZ, SKILL_COOLDOWNS } from '../raid-rules.ts';
import { RAID_BASIC_HALF_ANGLE } from '../raid-sight.ts';

import { noAttack, type AreaAttack } from '../skills/attack-rule.ts';
import { stagger } from '../raid-control.ts';

function swordReachBonus(runner: RaidRunner, tick: number) {
  return (runner.heroView.empoweredUntil ?? 0) > tick ? unboundSword.reachBonus : 0;
}

const chainAttack: AreaAttack<'cast'> = {
  kind: 'area',
  on: 'cast',
  area: {
    kind: 'sector',
    halfAngle: RAID_BASIC_HALF_ANGLE,
    belowHeight: chainSlash.maxHeight,
    radius: (combat) => chainSlash.reach + swordReachBonus(combat.self, combat.tick()),
  },
  hit: { powerScale: 1 },
};
const counter: AreaAttack<'counter'> = {
  kind: 'area',
  on: 'counter',
  area: { kind: 'circle', radius: 5 },
  hit: { powerScale: 1, control: [stagger(15)] },
};
class Rildin implements HeroEvents {
  readonly view = {
    slashes: 0,
    empoweredUntil: 0,
    guardUntil: 0,
  };
  slashUntil = 0;
  strides = 0;
  strideUntil = 0;
  onCast(combat: HeroCombat, skill: Skill) {
    if (skill !== 0) combat.self.basic = 0;
  }
  onTimersAdvanced(combat: HeroCombat) {
    if (this.view.slashes && this.slashUntil <= combat.tick()) {
      this.view.slashes = 0;
      combat.self.cooldowns[0] = SKILL_COOLDOWNS[0];
    }
    if (this.strides && this.strideUntil <= combat.tick()) {
      this.strides = 0;
      combat.self.cooldowns[2] = SKILL_COOLDOWNS[2];
    }
  }
  onIncomingHit(combat: HeroCombat, hit: Hit) {
    if (this.view.guardUntil < combat.tick()) return false;
    this.view.guardUntil = 0;
    combat.counter(1);
    combat.gainRage(hit.amount);
    return true;
  }
}
export const rildin = defineHero(
  stats,
  () => new Rildin(),
  [
    {
      kind: 'pulse',
      attack: chainAttack,
      apply(combat, _cast, state) {
        combat.record(0, combat.self);
        if (++state.view.slashes < chainSlash.limit) {
          combat.self.basic = 0;
          if (state.view.slashes === 1) state.slashUntil = combat.tick() + chainSlash.windowTicks;
          return chainSlash.recastTicks;
        }
        state.view.slashes = 0;
      },
    },
    {
      kind: 'pulse',
      attack: counter,
      apply(combat, _cast, state) {
        combat.record(1, combat.self);
        state.view.guardUntil = combat.tick() + RAID_HZ;
      },
    },
    {
      kind: 'direction',
      range: advance.reach,
      attack: noAttack,
      apply(combat, cast, state) {
        combat.dash(2, cast.point, advance.travelTicks);
        if (++state.strides < 2) {
          state.strideUntil = combat.tick() + advance.windowTicks;
          return advance.travelTicks;
        }
        state.strides = 0;
      },
    },
    {
      kind: 'pulse',
      attack: noAttack,
      apply(combat, _cast, state) {
        combat.record(3, combat.self);
        state.view.empoweredUntil = combat.tick() + unboundSword.durationTicks;
        state.view.slashes = combat.self.cooldowns[0] = combat.self.basic = 0;
      },
    },
  ],
  (runner, tick) => stats.reach + swordReachBonus(runner, tick),
);
