import type { GameFeature, CommandResult } from '../session/game-feature.ts';
import type { RaidMatch } from './raid-match.ts';

const result = (ok: boolean): CommandResult =>
  ok ? { ok: true } : { ok: false, error: 'raid.unavailable' };
export interface RaidPlayer {
  readonly slot: number;
}
/** Only the session binding identifies the runner; the payload contains intent. */
export function createRaidFeature(match: RaidMatch): GameFeature<RaidPlayer> {
  return {
    id: 'raid',
    commands: {
      move: ({ slot }, p) =>
        result(
          !!p &&
            typeof p === 'object' &&
            'side' in p &&
            typeof p.side === 'number' &&
            'walk' in p &&
            typeof p.walk === 'boolean' &&
            match.move(slot, p.side, p.walk),
        ),
      jump: ({ slot }) => result(match.jump(slot)),
      lock: ({ slot }, p) =>
        result(
          (p === 'wagon' || (typeof p === 'number' && Number.isInteger(p))) && match.lock(slot, p),
        ),
      cast: ({ slot }, p) => {
        if (!p || typeof p !== 'object' || !('skill' in p)) return result(false);
        const skill = p.skill;
        if (skill !== 0 && skill !== 1 && skill !== 2 && skill !== 3) return result(false);
        if ('ally' in p)
          return result(
            skill === 0 &&
              match.runners[slot]?.hero === 'jade' &&
              typeof p.ally === 'number' &&
              Number.isInteger(p.ally) &&
              match.cast(slot, skill, p.ally),
          );
        if (skill !== 2) return result(match.cast(slot, skill));
        if (!('x' in p) || !('z' in p) || typeof p.x !== 'number' || typeof p.z !== 'number')
          return result(false);
        return result(match.cast(slot, skill, { x: p.x, z: p.z }));
      },
    },
  };
}
