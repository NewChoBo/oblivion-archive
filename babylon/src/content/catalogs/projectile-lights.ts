/** Ranges use world metres, durations use game seconds, and intensities scale the pooled light. */
export interface ProjectileLightProfile {
  readonly color: string;
  readonly range: number;
  readonly flight: number;
  readonly impact: number;
  readonly afterglow?: {
    readonly duration: number;
    readonly range: number;
    readonly intensity: number;
  } | null;
}

export const PROJECTILE_LIGHTS = {
  wand: {
    color: '#83e8ff',
    range: 2.4,
    flight: 1.8,
    impact: 4.1,
    afterglow: { duration: 1.5, range: 1.65, intensity: 0.85 },
  },
  runeArrow: {
    color: '#ffad58',
    range: 2.65,
    flight: 2.35,
    impact: 4.6,
    afterglow: { duration: 2.2, range: 1.95, intensity: 1.05 },
  },
} satisfies Record<'wand' | 'runeArrow', ProjectileLightProfile>;
