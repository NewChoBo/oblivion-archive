import { stats } from '../../../content/raid/heroes/rime.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, field, sweep } from '../skills/skill-effects.ts';
import { slow } from '../raid-control.ts';
export const rime = defineHero(stats, () => ({}), [
  sweep({ powerScale: 2, control: [slow(45)] }),
  bolt({ powerScale: 3, control: [slow(30)] }),
  field(),
  bolt({ powerScale: 7, control: [slow(90)] }),
]);
