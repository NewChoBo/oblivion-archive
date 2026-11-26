import { GameSession } from '../session/game-session.ts';
import { driveRaidBots } from './raid-bots.ts';
import { createRaidFeature, type RaidCommandName, type RaidPlayer } from './raid-feature.ts';
import type { RaidMatch } from './raid-match.ts';

/** One rules session per match. Its caller supplies human orders and decides when a tick is due. */
export class RaidSimulation {
  readonly #session: GameSession<RaidPlayer>;
  readonly #humans: ReadonlySet<number>;
  readonly match: RaidMatch;

  constructor(match: RaidMatch, humans: ReadonlySet<number>) {
    this.match = match;
    this.#humans = humans;
    this.#session = new GameSession([createRaidFeature(match)]);
    for (const { slot } of match.runners) this.#session.addPlayer(String(slot), { slot });
  }

  dispatch = (slot: number, action: RaidCommandName, payload?: unknown) =>
    this.#session.dispatch(String(slot), { kind: 'raid.' + action, payload }).ok;

  step() {
    driveRaidBots(this.match, this.dispatch, this.#humans);
    this.match.step();
  }
}
