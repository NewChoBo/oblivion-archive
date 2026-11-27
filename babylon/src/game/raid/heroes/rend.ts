import { stats } from '../../../content/raid/heroes/rend.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, field, sweep } from '../skills/skill-effects.ts';
import type { HeroEvents } from './hero-definition.ts';
const lifeSteal: HeroEvents = {
  onDamageDealt(combat, hit, _victim, damage) {
    if (!combat.self.respawn && (hit.skill === 0 || hit.skill === 3))
      combat.heal(combat.self.slot, Math.ceil(damage / 3), 'lifesteal');
  },
};
export const rend = defineHero(stats, () => lifeSteal, [
  sweep({ powerScale: 2 }),
  bolt({ powerScale: 3 }),
  field(),
  bolt({ powerScale: 7 }),
]);
