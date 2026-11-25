export type HitRegion = 'body' | 'head';

/** Apply the region bonus after charge, equipment, skills and body-damage rounding. */
export function damageForRegion(bodyDamage: number, region: HitRegion) {
  return region === 'head' ? bodyDamage * 2 : bodyDamage;
}
