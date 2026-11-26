import { raidProjectileProfile } from './raid-projectiles.ts';
import type { GameFeature, CommandResult } from '../session/game-feature.ts';
import { isRaidLeap, type RaidMatch } from './raid-match.ts';

export type RaidCommandName = 'move' | 'jump' | 'lock' | 'cast';
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
      lock: ({ slot }, p) =>
        result(
          (p === 'wagon' || (typeof p === 'number' && Number.isInteger(p))) && match.lock(slot, p),
        ),
      cast: ({ slot }, p) => {
        if (!p || typeof p !== 'object' || !('skill' in p)) return result(false);
        const skill = p.skill;
        if (skill !== 0 && skill !== 1 && skill !== 2 && skill !== 3) return result(false);
        const caster = match.runners[slot];
        if (!caster) return result(false);
        if (raidProjectileProfile(caster.hero, skill))
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
            (skill === 1 || skill === 3) &&
              (p.target === 'wagon' ||
                (typeof p.target === 'number' && Number.isInteger(p.target))) &&
              match.cast(slot, skill, p.target),
          );
        if ('ally' in p)
          return result(
            skill === 0 &&
              match.runners[slot]?.hero === 'jade' &&
              typeof p.ally === 'number' &&
              Number.isInteger(p.ally) &&
              match.cast(slot, skill, p.ally),
          );
        if (skill !== 2 && !isRaidLeap(caster.hero, skill)) return result(match.cast(slot, skill));
        if (!('x' in p) || !('z' in p) || typeof p.x !== 'number' || typeof p.z !== 'number')
          return result(false);
        return result(match.cast(slot, skill, { x: p.x, z: p.z }));
      },
    },
  };
}
