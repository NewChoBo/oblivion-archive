import type { RaidHero } from '../../../game/raid/heroes/hero-id.ts';
import type { Skill } from '../../../game/raid/raid-view.ts';

/** Scale of runner models and body markings relative to the course. Attack footprints use world metres. */
export const RAID_RUNNER_SCALE = 0.75;

export interface HeroAppearance {
  cape: string;
  sprite: string;
  equipment?: 'warhammer' | 'staff' | 'rapier' | 'saber' | 'quiver' | 'shieldBlade' | 'crystal';
  scale?: number;
  barHeight?: number;
  empoweredMesh?: string;
  spinClip?: 'field' | 'fury';
  dashClip?: 'field' | 'fury';
  dashTrail?: 'shadowBlades';
  landingChop?: boolean;
  particles?: 'spiral' | 'vortex' | 'arrows' | 'heavy';
  projectile?: Partial<Record<Skill, 'horizontal' | 'upright' | 'cross' | 'arrow'>>;
}
// Model attachments and particle styles belong to the renderer. Combat never reads this table.
export const appearance: Record<RaidHero, HeroAppearance> = {
  kali: { cape: '#713594', sprite: 'twirl_01', dashClip: 'fury', dashTrail: 'shadowBlades' },
  rildin: { cape: '#a12f29', sprite: 'spark_05', empoweredMesh: '2H_Sword' },
  kaiken: {
    cape: '#cfcedc',
    sprite: 'twirl_01',
    equipment: 'saber',
    spinClip: 'fury',
    dashClip: 'field',
    projectile: { 0: 'horizontal', 1: 'upright' },
  },
  swift: { cape: '#18525d', sprite: 'spark_05', equipment: 'rapier', projectile: { 0: 'cross' } },
  hammer: {
    cape: '#a64028',
    sprite: 'scorch_01',
    equipment: 'warhammer',
    scale: 0.84,
    spinClip: 'field',
    landingChop: true,
    particles: 'heavy',
  },
  abyss: { cape: '#693bad', sprite: 'twirl_01', scale: 0.73, barHeight: 2.48, particles: 'vortex' },
  longshot: {
    cape: '#a57629',
    sprite: 'spark_05',
    equipment: 'quiver',
    particles: 'arrows',
    projectile: { 0: 'arrow', 3: 'arrow' },
  },
  jade: { cape: '#168768', sprite: 'magic_01', equipment: 'staff', particles: 'spiral' },
  rend: { cape: '#912f29', sprite: 'scorch_01' },
  bastion: { cape: '#395878', sprite: 'spark_05', equipment: 'shieldBlade' },
  rime: { cape: '#43829a', sprite: 'twirl_01', equipment: 'crystal' },
};
