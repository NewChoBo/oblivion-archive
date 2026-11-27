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
  'kali',
] as const;
export type RaidHero = (typeof HERO_IDS)[number];
