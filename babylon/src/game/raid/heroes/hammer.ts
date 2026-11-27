import { stats } from '../../../content/raid/heroes/hammer.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, spin, sweep } from '../skills/skill-effects.ts';
import type { HeroEvents } from './hero-definition.ts';
import { RAID_SKILL_RANGE } from '../raid-rules.ts';
import { casterCircle } from '../skills/attack-area.ts';
import type { AreaAttack } from '../skills/attack-rule.ts';
import { slow, stagger } from '../raid-control.ts';
const landing = {
  kind: 'area',
  on: 'land',
  area: casterCircle,
  hit: { powerScale: 2, control: [slow(30)] },
} as const satisfies AreaAttack;
const whirlwind = {
  kind: 'area',
  on: 'spinPulse',
  area: casterCircle,
  hit: { powerScale: 1.5 },
} as const satisfies AreaAttack;
const hammerEvents: HeroEvents = {
  resistsControl(runner) {
    return runner.spinTicks > 0;
  },
};
export const hammer = defineHero(stats, () => hammerEvents, [
  {
    kind: 'leap',
    range: RAID_SKILL_RANGE.leap,
    attack: landing,
    apply(combat, cast) {
      combat.self.leap = {
        skill: cast.skill,
        from: { x: combat.self.x, z: combat.self.z },
        to: { x: cast.point.x, z: cast.point.z },
        elapsed: 0,
      };
    },
  },
  sweep({ powerScale: 3, control: [slow(36), stagger(12)] }),
  spin(60, whirlwind),
  bolt(
    { powerScale: 7, control: [stagger(15)] },
    { splash: { area: casterCircle, hit: { powerScale: 2, control: [stagger(15)] } } },
  ),
]);
