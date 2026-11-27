import { stats, crescent, risingMoon } from '../../../content/raid/heroes/kaiken.ts';
import { defineHero } from './hero-definition.ts';

import { projectile, spin } from '../skills/skill-effects.ts';
import type { HeroCombat, HeroEvents, Hit } from './hero-definition.ts';
import type { AreaAttack } from '../skills/attack-rule.ts';
import { casterCircle } from '../skills/attack-area.ts';
import { stagger } from '../raid-control.ts';
const fullMoon = {
  kind: 'area',
  on: 'dashEnd',
  area: casterCircle,
  hit: { powerScale: 2, control: [stagger(12)] },
} as const satisfies AreaAttack;
const moonDance = {
  kind: 'area',
  on: 'spinPulse',
  area: casterCircle,
  hit: { powerScale: 2 },
} as const satisfies AreaAttack;
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
  }
  onTimersAdvanced() {
    if (this.view.rootedTicks) this.view.rootedTicks--;
  }
  onRespawn(combat: HeroCombat) {
    this.lastMoonHit = combat.tick();
  }
}
export const kaiken = defineHero(stats, () => new Kaiken(), [
  projectile(crescent, { powerScale: 2 }),
  projectile(risingMoon, { powerScale: 3 }),
  {
    kind: 'pulse',
    range: dashRange,
    recastDuringDash: true,
    attack: fullMoon,
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
  spin(75, moonDance),
]);
