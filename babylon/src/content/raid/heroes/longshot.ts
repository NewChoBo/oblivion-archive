import { standardContact } from '../projectile-contact.ts';

export const stats = { hp: 95, power: 8, reach: 12, cooldown: 23, radius: 2.8 } as const;
export const scatter = {
  reach: 8,
  speed: 15,
  angles: [-0.17, 0, 0.17],
  pierces: false,
  contact: standardContact,
} as const;
export const piercing = {
  reach: 16,
  speed: 21,
  angles: [0],
  pierces: true,
  contact: standardContact,
} as const;
