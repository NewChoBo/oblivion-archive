import { stats, crescent, risingMoon } from '../../../content/raid/heroes/kaiken.ts';
import { defineHero } from './hero-definition.ts';

import { projectile, spin, nearby } from '../skills/skill-effects.ts';
import type { HeroCombat, HeroEvents, Hit } from './hero-definition.ts';
const dashRange = 5.5;
export const FULL_MOON_SPIN_TICKS = 16;
class Kaiken implements HeroEvents {
  readonly view = { rootedTicks: 0, rootDuration: FULL_MOON_SPIN_TICKS };
  private lastMoonHit = 0;
  onOutgoingHit(combat: HeroCombat, hit: Hit) {
    if (combat.self.respawn) return hit.amount;
    const bonus = Math.min(5, Math.floor((combat.tick() - this.lastMoonHit) / 60)) * 2;
    this.lastMoonHit = combat.tick();
    return hit.amount + bonus;
  }
  onDashEnd(combat: HeroCombat) {
    this.view.rootedTicks = FULL_MOON_SPIN_TICKS;
    combat.record(2, combat.self, 'spin');
    combat.sweep(stats.radius, stats.power * 2, 2);
  }
  onTimersAdvanced() {
    if (this.view.rootedTicks) this.view.rootedTicks--;
  }
  onSpinPulse(combat: HeroCombat) {
    combat.sweep(stats.radius, stats.power * 2, 3);
  }
  onRespawn(combat: HeroCombat) {
    this.lastMoonHit = combat.tick();
  }
}
export const kaiken = defineHero(stats, () => new Kaiken(), [
  projectile(crescent, 2),
  projectile(risingMoon, 3),
  {
    kind: 'pulse',
    range: dashRange,
    recastDuringDash: true,
    radius: (combat) => (combat.self.dash ? stats.radius : 0),
    targets: nearby,
    control: { staggered: 12 },
    apply(combat) {
      if (combat.self.dash) {
        combat.finishDash();
        return combat.self.cooldowns[2];
      }
      const yaw = combat.facing();
      combat.dash(
        2,
        {
          x: combat.self.x + Math.sin(yaw) * dashRange,
          z: combat.self.z + Math.cos(yaw) * dashRange,
        },
        18,
      );
    },
  },
  spin(75),
]);
