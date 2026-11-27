import { stats } from '../../../content/raid/heroes/hammer.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, selfRadius, spin, sweep } from '../skills/skill-effects.ts';
import type { HeroEvents } from './hero-definition.ts';
import { RAID_SKILL_RANGE } from '../raid-rules.ts';
const hammerEvents: HeroEvents = {
  onLand(combat) {
    combat.record(0, combat.self, 'ground');
    combat.sweep(stats.radius, stats.power * 2, 0);
  },
  onSpinPulse(combat) {
    combat.sweep(stats.radius, stats.power * 1.5, 2);
  },
  resistsControl(runner) {
    return runner.spinTicks > 0;
  },
};
export const hammer = defineHero(stats, () => hammerEvents, [
  {
    kind: 'leap',
    range: RAID_SKILL_RANGE.leap,
    radius: selfRadius,
    control: { slowed: 30 },
    apply(combat, cast) {
      combat.self.leap = {
        from: { x: combat.self.x, z: combat.self.z },
        to: { x: cast.point.x, z: cast.point.z },
        elapsed: 0,
      };
    },
  },
  { ...sweep(3), control: { slowed: 36, staggered: 12 } },
  spin(60),
  {
    ...bolt(7, (combat, cast) => {
      for (const id of combat.visibleEnemies(cast.point, stats.radius))
        if (id !== cast.target) combat.strike(id, stats.power * 2, 3);
    }),
    radius: selfRadius,
    control: { staggered: 15 },
  },
]);
