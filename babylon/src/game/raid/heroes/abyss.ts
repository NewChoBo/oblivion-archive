import { stats } from '../../../content/raid/heroes/abyss.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, field, sweep } from '../skills/skill-effects.ts';
import { slow, silence } from '../raid-control.ts';
export const abyss = defineHero(stats, () => ({}), [
  sweep({ powerScale: 2 }),
  bolt({ powerScale: 3, control: [silence(24)] }),
  field(
    { powerScale: 3, control: [slow(60)] },
    { intervalTicks: 15, count: 2, effect: { kind: 'controlEnemies', control: [slow(30)] } },
  ),
  bolt({ powerScale: 7, control: [silence(60)] }),
]);
