export type CommandResult<Event = never> =
  { ok: true; event?: Event } | { ok: false; error: string };

export type CommandHandler<Player, Event> = (
  player: Player,
  payload: unknown,
) => CommandResult<Event>;

/** A handler receives the session-bound player; its command payload still needs validation. */
export interface GameFeature<Player, Event = never> {
  readonly id: string;
  readonly commands: Readonly<Record<string, CommandHandler<Player, Event>>>;
}
