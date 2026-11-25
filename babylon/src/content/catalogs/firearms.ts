import type { FirearmDefinition } from '../../game/experiences/armory.ts';

// Arena time values are in seconds. Prices and reserve counts feed the authoritative armory.
export const ARENA_PISTOL = {
  id: 'service-pistol',
  price: 0,
  capacity: 8,
  reserve: 32,
  damage: 30,
  interval: 0.24,
  reloadSeconds: 1.2,
  automatic: false,
} as const satisfies FirearmDefinition;

export const ARENA_RIFLE = {
  id: 'guard-rifle',
  price: 650,
  capacity: 20,
  reserve: 60,
  damage: 38,
  interval: 0.13,
  reloadSeconds: 1.65,
  automatic: true,
} as const satisfies FirearmDefinition;
