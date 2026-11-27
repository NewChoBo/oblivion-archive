export interface RaidControl {
  slowed: number;
  silenced: number;
  staggered: number;
  staggerGuard: number;
}

// Durations and stagger recovery use simulation ticks. Different effects on one hit compose in order.
export interface CrowdControlEffect {
  readonly kind: 'slow' | 'silence' | 'stagger';
  readonly ticks: number;
}
export const slow = (ticks: number): CrowdControlEffect => ({ kind: 'slow', ticks });
export const silence = (ticks: number): CrowdControlEffect => ({ kind: 'silence', ticks });
export const stagger = (ticks: number): CrowdControlEffect => ({ kind: 'stagger', ticks });

export function applyCrowdControl(victim: RaidControl, effects: readonly CrowdControlEffect[]) {
  for (const effect of effects) {
    switch (effect.kind) {
      case 'slow':
        victim.slowed = Math.max(victim.slowed, effect.ticks);
        break;
      case 'silence':
        victim.silenced = Math.max(victim.silenced, effect.ticks);
        break;
      case 'stagger':
        if (!victim.staggerGuard) {
          victim.staggered = effect.ticks;
          victim.staggerGuard = effect.ticks + 24;
        }
        break;
    }
  }
}
