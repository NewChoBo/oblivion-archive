export const stats = { hp: 125, power: 9, reach: 3.4, cooldown: 28, radius: 3.5 } as const;
export const chainSlash = {
  reach: 5,
  maxHeight: 0.7,
  limit: 4,
  windowTicks: 120,
  recastTicks: 8,
} as const;
export const advance = { reach: 3, travelTicks: 6, windowTicks: 60 } as const;
export const unboundSword = { reachBonus: 1.5, durationTicks: 300 } as const;
