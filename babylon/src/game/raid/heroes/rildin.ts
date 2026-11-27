import { stats, chainSlash, advance, unboundSword } from '../../../content/raid/heroes/rildin.ts';
import { defineHero, type HeroCombat, type HeroEvents, type Hit } from './hero-definition.ts';
import type { RaidRunner, Skill } from '../raid-view.ts';
import { RAID_HZ, SKILL_COOLDOWNS } from '../raid-rules.ts';
import { inBasicAttackArc } from '../raid-sight.ts';

function swordReachBonus(runner: RaidRunner, tick: number) {
  return (runner.heroView.empoweredUntil ?? 0) > tick ? unboundSword.reachBonus : 0;
}

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
    combat.sweep(5, stats.power, 1);
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
      radius: (combat) => chainSlash.reach + swordReachBonus(combat.self, combat.tick()),
      targets(combat, center, radius) {
        return combat.enemies(center, radius).filter((id) => {
          const point = combat.position(id)!;
          return (
            inBasicAttackArc(combat.self, point) &&
            (!('jumping' in point) || combat.height(point) < chainSlash.maxHeight)
          );
        });
      },
      apply(combat, cast, state) {
        combat.record(0, combat.self);
        for (const id of cast.enemies) combat.strike(id, stats.power, 0);
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
      control: { staggered: 15 },
      apply(combat, _cast, state) {
        combat.record(1, combat.self);
        state.view.guardUntil = combat.tick() + RAID_HZ;
      },
    },
    {
      kind: 'direction',
      range: advance.reach,
      dash: true,
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
      apply(combat, _cast, state) {
        combat.record(3, combat.self);
        state.view.empoweredUntil = combat.tick() + unboundSword.durationTicks;
        state.view.slashes = combat.self.cooldowns[0] = combat.self.basic = 0;
      },
    },
  ],
  (runner, tick) => stats.reach + swordReachBonus(runner, tick),
);
