import type { GameFeature, CommandResult } from '../session/game-feature.ts';
import { raidRunnerAimKind, type RaidMatch } from './raid-match.ts';

export type RaidCommandName = 'move' | 'jump' | 'lock' | 'call' | 'cast';
export type RaidOrder = (slot: number, action: RaidCommandName, payload?: unknown) => void;

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
      move: ({ slot }, p) => {
        if (!p || typeof p !== 'object' || !('side' in p) || typeof p.side !== 'number')
          return result(false);
        if ('brake' in p)
          return result(typeof p.brake === 'number' && match.move(slot, p.side, p.brake));
        return result(
          'walk' in p && typeof p.walk === 'boolean' && match.move(slot, p.side, Number(p.walk)),
        );
      },
      jump: ({ slot }) => result(match.jump(slot)),
      call: ({ slot }, p) =>
        result(
          (p === 'wagon' || (typeof p === 'number' && Number.isInteger(p))) &&
            match.callTarget(slot, p),
        ),
      lock: ({ slot }, p) =>
        result(
          (p === 'wagon' || (typeof p === 'number' && Number.isInteger(p))) && match.lock(slot, p),
        ),
      cast: ({ slot }, p) => {
        if (!p || typeof p !== 'object' || !('skill' in p)) return result(false);
        const skill = p.skill;
        if (skill !== 0 && skill !== 1 && skill !== 2 && skill !== 3) return result(false);
        if ('repeat' in p)
          return result(
            p.repeat === true && Object.keys(p).length === 2 && match.repeatCast(slot, skill),
          );
        const caster = match.runners[slot];
        if (!caster) return result(false);
        const kind = raidRunnerAimKind(caster, skill);
        if (kind === 'direction')
          return result(
            !('target' in p) &&
              !('ally' in p) &&
              'dx' in p &&
              'dz' in p &&
              typeof p.dx === 'number' &&
              typeof p.dz === 'number' &&
              match.cast(slot, skill, { dx: p.dx, dz: p.dz }),
          );
        if ('dx' in p || 'dz' in p) return result(false);
        if ('target' in p)
          return result(
            kind === 'target' &&
              (p.target === 'wagon' ||
                (typeof p.target === 'number' && Number.isInteger(p.target))) &&
              match.cast(slot, skill, p.target),
          );
        if ('ally' in p)
          return result(
            kind === 'ward' &&
              typeof p.ally === 'number' &&
              Number.isInteger(p.ally) &&
              match.cast(slot, skill, p.ally),
          );
        if (kind === 'pulse') return result(!('x' in p || 'z' in p) && match.cast(slot, skill));
        if (kind !== 'field' && kind !== 'leap') return result(false);
        if (!('x' in p) || !('z' in p) || typeof p.x !== 'number' || typeof p.z !== 'number')
          return result(false);
        return result(match.cast(slot, skill, { x: p.x, z: p.z }));
      },
    },
  };
}
