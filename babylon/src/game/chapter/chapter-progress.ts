export type Position = { readonly x: number; readonly y: number; readonly z: number };
export type Runes = [number, number, number];
export interface Checkpoint {
  readonly phase: number;
  readonly runes: Runes;
  readonly clue: boolean;
}

/** A new run clears its checkpoint, while discovered codex entries persist across runs. */
export interface ChapterStore {
  readCheckpoint(): Checkpoint | null;
  writeCheckpoint(value: Checkpoint): void;
  clearCheckpoint(): void;
  hasLore(id: string): boolean;
  discoverLore(id: string): void;
}

type Action = 'inspect' | 'mural' | 'seal' | 'ledger' | 'shortcut' | 'restore' | 'lore';
export type ChapterTarget = {
  readonly id: string;
  readonly phase: number;
  readonly position: readonly [number, number, number];
  readonly range: number;
} & ({ readonly action: Action } | { readonly action: 'rune'; readonly index: 0 | 1 | 2 });

export type ChapterEvent =
  | {
      kind:
        | 'photo-found'
        | 'mural-read'
        | 'seal-closed'
        | 'seal-opened'
        | 'ledger-read'
        | 'shortcut-opened'
        | 'name-restored';
    }
  | { kind: 'rune-turned'; index: number; symbol: number }
  | { kind: 'lore-collected'; id: string };

export function validRunes(value: unknown): value is Runes {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    [0, 1, 2].every((i) => Number.isInteger(value[i]) && value[i] >= 0 && value[i] < 3)
  );
}

function inRange(target: ChapterTarget, position: Position): boolean {
  return (
    position.y < 2 &&
    Math.hypot(position.x - target.position[0], position.z - target.position[2]) <= target.range
  );
}

export class ChapterProgress {
  readonly #targets: readonly ChapterTarget[];
  readonly #store: ChapterStore;
  readonly #discovered: Set<string>;
  #checkpoint: Checkpoint | null;
  #phase = 0;
  #runes: Runes = [2, 2, 2];
  #clue = false;
  #deaths = 0;

  constructor(targets: readonly ChapterTarget[], store: ChapterStore) {
    this.#targets = targets;
    this.#store = store;
    this.#checkpoint = store.readCheckpoint();
    this.#discovered = new Set(
      targets.filter((t) => t.action === 'lore' && store.hasLore(t.id)).map((t) => t.id),
    );
  }

  get completed() {
    return this.#phase;
  }
  get done() {
    return this.#phase === 5;
  }
  get hasSave() {
    return this.#checkpoint !== null;
  }
  get lore() {
    return [...this.#discovered];
  }
  get records() {
    const entries: string[] = [];
    if (this.#phase >= 1) entries.push(this.done ? 'restored-photo' : 'photo');
    if (this.#clue) entries.push('mural');
    if (this.#phase >= 3) entries.push('ledger');
    return entries;
  }

  #available(target: ChapterTarget): boolean {
    return target.action === 'lore'
      ? this.#phase >= target.phase && !this.#discovered.has(target.id)
      : this.#phase === target.phase;
  }

  targets() {
    return this.#targets.filter((target) => this.#available(target));
  }
  inReach(position: Position) {
    return this.#targets.filter((target) => this.#available(target) && inRange(target, position));
  }

  use(id: string, position: Position): ChapterEvent | null {
    const target = this.#targets.find(
      (t) => t.id === id && this.#available(t) && inRange(t, position),
    );
    if (!target) return null;
    switch (target.action) {
      case 'lore':
        this.#discovered.add(id);
        this.#store.discoverLore(id);
        return { kind: 'lore-collected', id };
      case 'mural':
        if (!this.#clue && this.#checkpoint) {
          this.#clue = true;
          this.#checkpoint = { ...this.#checkpoint, clue: true };
          this.#store.writeCheckpoint(this.#checkpoint);
        }
        return { kind: 'mural-read' };
      case 'rune': {
        const symbol = (this.#runes[target.index] + 1) % 3;
        this.#runes[target.index] = symbol;
        return { kind: 'rune-turned', index: target.index, symbol };
      }
      case 'seal':
        if (this.#runes[0] !== 0 || this.#runes[1] !== 1 || this.#runes[2] !== 2)
          return { kind: 'seal-closed' };
        return this.#advance('seal-opened');
      case 'inspect':
        return this.#advance('photo-found');
      case 'ledger':
        return this.#advance('ledger-read');
      case 'shortcut':
        return this.#advance('shortcut-opened');
      case 'restore':
        return this.#advance('name-restored');
    }
  }

  #advance(
    kind: 'photo-found' | 'seal-opened' | 'ledger-read' | 'shortcut-opened' | 'name-restored',
  ): ChapterEvent {
    this.#phase++;
    this.#checkpoint = {
      phase: this.#phase,
      runes: [...this.#runes] satisfies Runes,
      clue: this.#clue,
    };
    this.#store.writeCheckpoint(this.#checkpoint);
    return { kind };
  }

  continue() {
    if (!this.#checkpoint) return null;
    this.#phase = this.#checkpoint.phase;
    this.#runes = [...this.#checkpoint.runes];
    this.#clue = this.#checkpoint.clue;
    if (this.done) return [0, 0.86, -4.5];
    if (this.#phase >= 4) return [15.4, 0.86, 5.45];
    if (this.#phase >= 2) return [12.9, 0.86, 10.3];
    return [1.7, 0.86, 10.3];
  }

  retry() {
    const spawn = this.continue();
    if (spawn) this.#deaths++;
    return spawn;
  }

  restoreTraversal(value: unknown): void {
    if (
      value &&
      typeof value === 'object' &&
      'phase' in value &&
      value.phase === this.#phase &&
      'runes' in value &&
      validRunes(value.runes)
    )
      this.#runes = [...value.runes];
  }

  reset(): void {
    this.#phase = 0;
    this.#clue = false;
    this.#runes = [2, 2, 2];
    this.#checkpoint = null;
    this.#deaths = 0;
    this.#store.clearCheckpoint();
  }

  snapshot() {
    const checkpoint = this.#checkpoint
      ? { ...this.#checkpoint, runes: [...this.#checkpoint.runes] }
      : null;
    return {
      phase: this.#phase,
      runes: [...this.#runes] satisfies Runes,
      clue: this.#clue,
      lore: this.lore,
      checkpoint,
      deaths: this.#deaths,
    };
  }
}
