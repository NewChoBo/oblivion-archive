import { stats } from '../../../content/raid/heroes/rime.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, field, sweep } from '../skills/skill-effects.ts';
export const rime = defineHero(stats, () => ({}), [
  { ...sweep(2), control: { slowed: 45 } },
  { ...bolt(3), control: { slowed: 30 } },
  field,
  { ...bolt(7), control: { slowed: 90 } },
]);
