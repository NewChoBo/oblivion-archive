import type { CommandHandler, CommandResult, GameFeature } from './game-feature.ts';

export class GameSession<Player extends object, Event = never> {
  readonly #players = new Map<string, Player>();
  readonly #commands = new Map<string, CommandHandler<Player, Event>>();

  constructor(features: readonly GameFeature<Player, Event>[]) {
    const featureIds = new Set<string>();
    for (const feature of features) {
      if (featureIds.has(feature.id)) throw new Error('Duplicate game feature: ' + feature.id);
      featureIds.add(feature.id);
      for (const [action, handle] of Object.entries(feature.commands)) {
        const kind = feature.id + '.' + action;
        if (this.#commands.has(kind)) throw new Error('Duplicate game command: ' + kind);
        this.#commands.set(kind, handle);
      }
    }
  }

  addPlayer(playerId: string, player: Player): void {
    if (this.#players.has(playerId)) throw new Error('Player already in session: ' + playerId);
    this.#players.set(playerId, player);
  }

  removePlayer(playerId: string): void {
    this.#players.delete(playerId);
  }

  // Select the player and projection in the trusted session adapter.
  readPlayer<View>(
    playerId: string,
    project: (player: Readonly<Player>) => View,
  ): View | undefined {
    const player = this.#players.get(playerId);
    return player ? project(player) : undefined;
  }

  // The caller supplies the player from its local binding or authenticated connection.
  dispatch(playerId: string, command: unknown): CommandResult<Event> {
    const player = this.#players.get(playerId);
    if (!player) return { ok: false, error: 'session.unknown-player' };
    if (
      !command ||
      typeof command !== 'object' ||
      !('kind' in command) ||
      typeof command.kind !== 'string'
    ) {
      return { ok: false, error: 'session.invalid-command' };
    }
    const handle = this.#commands.get(command.kind);
    if (!handle) return { ok: false, error: 'session.unknown-command' };
    return handle(player, 'payload' in command ? command.payload : undefined);
  }
}
