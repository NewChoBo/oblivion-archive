import { stats } from '../../../content/raid/heroes/abyss.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, field, sweep } from '../skills/skill-effects.ts';
export const abyss = defineHero(stats, () => ({}), [
  sweep(2),
  { ...bolt(3), control: { silenced: 24 } },
  {
    ...field,
    control: { slowed: 60 },
    onFieldEnemy(_c, _id, victim) {
      if (victim) victim.slowed = Math.max(victim.slowed, 30);
    },
  },
  { ...bolt(7), control: { silenced: 60 } },
]);
