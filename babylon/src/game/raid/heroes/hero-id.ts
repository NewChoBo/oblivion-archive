export const HERO_IDS = [
  'hammer',
  'abyss',
  'longshot',
  'jade',
  'rend',
  'bastion',
  'rime',
  'rildin',
  'kaiken',
  'swift',
] as const;
export type RaidHero = (typeof HERO_IDS)[number];
