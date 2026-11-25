import type { InventoryCommand, InventoryView } from '../game/inventory/inventory-feature.ts';
import type {
  ProgressionSpendCommand,
  ProgressView,
} from '../game/progression/progression-feature.ts';
import type { CommandResult } from '../game/session/game-feature.ts';

export type JournalCommand = InventoryCommand | ProgressionSpendCommand;

export interface AmmoStock {
  readonly loaded: number;
  readonly reserve: number;
  readonly capacity: number;
}

export interface JournalView extends InventoryView, ProgressView {
  readonly ammo: Readonly<Record<'wand' | 'bow', AmmoStock | null>>;
}

/** The journal reads a player snapshot. Edits go through the session's command checks. */
export interface JournalSession {
  readJournal(): JournalView;
  dispatch(command: JournalCommand): CommandResult<unknown>;
}
