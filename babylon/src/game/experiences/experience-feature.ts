import type { GameFeature } from '../session/game-feature.ts';
import type { ArenaArmory } from './armory.ts';
import type { ExperienceMatch } from './experience-match.ts';

export type ActivateWardCommand = {
  readonly kind: 'experience.activate-ward';
  readonly payload: { readonly wardId: string };
};

export type ArenaCommand =
  | ActivateWardCommand
  | {
      readonly kind: 'experience.objective' | 'experience.buy';
      readonly payload: { readonly id: string };
    };

export interface ExperiencePlayer {
  canReachWard(wardId: string): boolean;
  canReachObjective(id: string): boolean;
  inBuyZone(): boolean;
}

export function createExperienceFeature(
  match: ExperienceMatch,
  armory?: ArenaArmory,
): GameFeature<ExperiencePlayer> {
  return {
    id: 'experience',
    commands: {
      objective(player, payload) {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('id' in payload) ||
          typeof payload.id !== 'string'
        ) {
          return { ok: false, error: 'experience.invalid-objective' };
        }
        if (!player.canReachObjective(payload.id) || !match.interactObjective(payload.id)) {
          return { ok: false, error: 'experience.objective-unavailable' };
        }
        return { ok: true };
      },
      buy(player, payload) {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('id' in payload) ||
          typeof payload.id !== 'string'
        ) {
          return { ok: false, error: 'experience.invalid-purchase' };
        }
        // Both the match clock and the buyer's current position gate the purchase.
        if (!armory || !match.canBuy || !player.inBuyZone())
          return { ok: false, error: 'experience.shop-closed' };
        return armory.buy(payload.id)
          ? { ok: true }
          : { ok: false, error: 'experience.purchase-unavailable' };
      },
      'activate-ward'(player, payload) {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('wardId' in payload) ||
          typeof payload.wardId !== 'string'
        ) {
          return { ok: false, error: 'experience.invalid-ward' };
        }
        if (!player.canReachWard(payload.wardId) || !match.activateWard(payload.wardId)) {
          return { ok: false, error: 'experience.ward-unavailable' };
        }
        return { ok: true };
      },
    },
  };
}
