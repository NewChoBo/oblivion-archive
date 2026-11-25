import type { GameFeature } from '../session/game-feature.ts';

export interface ProgressView {
  readonly health: number;
  readonly maxHealth: number;
  readonly armor: number;
  readonly maxArmor: number;
  readonly level: number;
  readonly xp: number;
  readonly nextLevel: number;
  readonly points: number;
  readonly skills: Readonly<Record<string, number>>;
}

export interface ProgressionSpendCommand {
  readonly kind: 'progression.spend-skill';
  readonly payload: { readonly skillId: string };
}

/** The bound player's ledger checks the skill and debits points in the same operation. */
export interface ProgressionPlayer {
  spendSkill(skillId: string): boolean;
}

export const progressionFeature: GameFeature<ProgressionPlayer> = {
  id: 'progression',
  commands: {
    'spend-skill'(player, payload) {
      if (
        payload &&
        typeof payload === 'object' &&
        'skillId' in payload &&
        typeof payload.skillId === 'string' &&
        player.spendSkill(payload.skillId)
      ) {
        return { ok: true };
      }
      return { ok: false, error: 'progression.skill-unavailable' };
    },
  },
};
