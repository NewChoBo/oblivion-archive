export interface FirearmDefinition {
  readonly id: string;
  readonly price: number;
  readonly capacity: number;
  readonly reserve: number;
  readonly damage: number;
  readonly interval: number;
  readonly reloadSeconds: number;
  readonly automatic: boolean;
}

interface LoadoutEntry {
  definition: FirearmDefinition;
  loaded: number;
  reserve: number;
  reloadLeft: number;
  cooldown: number;
}

const startingCredits = 800;
const refillPrice = 120;
const killReward = 300;
const maxCredits = 9000;

export class ArenaArmory {
  readonly #catalog: ReadonlyMap<string, FirearmDefinition>;
  readonly #starter: FirearmDefinition;
  #owned = new Map<string, LoadoutEntry>();
  #selected: string;
  #credits = startingCredits;
  #shots = 0;

  constructor(starter: FirearmDefinition, catalog: readonly FirearmDefinition[]) {
    this.#starter = starter;
    this.#catalog = new Map(catalog.map((item) => [item.id, item]));
    this.#selected = starter.id;
    this.startRound(true);
  }

  #stock(definition: FirearmDefinition): LoadoutEntry {
    return {
      definition,
      loaded: definition.capacity,
      reserve: definition.reserve,
      reloadLeft: 0,
      cooldown: 0,
    };
  }

  startRound(newMatch: boolean): void {
    this.#credits = newMatch
      ? startingCredits
      : Math.min(maxCredits, this.#credits + startingCredits);
    this.#owned.clear();
    this.#owned.set(this.#starter.id, this.#stock(this.#starter));
    this.#selected = this.#starter.id;
    this.#shots = 0;
  }

  awardElimination(): void {
    this.#credits = Math.min(maxCredits, this.#credits + killReward);
  }

  select(id: string): boolean {
    if (!this.#owned.has(id)) return false;
    if (this.#selected !== id) this.#current.reloadLeft = 0;
    this.#selected = id;
    return true;
  }

  buy(id: string): boolean {
    if (id === 'ammo') {
      const weapon = this.#current;
      if (this.#credits < refillPrice || weapon.reserve >= weapon.definition.reserve) return false;
      this.#credits -= refillPrice;
      weapon.reserve = weapon.definition.reserve;
      return true;
    }
    const item = this.#catalog.get(id);
    if (!item || this.#owned.has(id) || item.price > this.#credits) return false;
    this.#owned.set(id, this.#stock(item));
    this.#credits -= item.price;
    return this.select(id);
  }

  get automatic() {
    return this.#current.definition.automatic;
  }
  get reloading() {
    return this.#current.reloadLeft > 0;
  }

  get #current(): LoadoutEntry {
    return this.#owned.get(this.#selected)!;
  }

  reload(): boolean {
    const weapon = this.#current;
    if (weapon.reloadLeft > 0 || weapon.loaded === weapon.definition.capacity || !weapon.reserve)
      return false;
    weapon.reloadLeft = weapon.definition.reloadSeconds;
    return true;
  }

  shoot(): FirearmDefinition | undefined {
    const weapon = this.#current;
    if (weapon.reloadLeft || weapon.cooldown || !weapon.loaded) return;
    weapon.loaded--;
    weapon.cooldown = weapon.definition.interval;
    if (!weapon.loaded) this.reload();
    this.#shots++;
    return weapon.definition;
  }

  /** Advance in game seconds. Reserve rounds enter the magazine only when a reload completes. */
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const weapon of this.#owned.values()) {
      weapon.cooldown = Math.max(0, weapon.cooldown - dt);
      if (weapon.reloadLeft === 0) continue;
      weapon.reloadLeft = Math.max(0, weapon.reloadLeft - dt);
      if (weapon.reloadLeft === 0) {
        const count = Math.min(weapon.definition.capacity - weapon.loaded, weapon.reserve);
        weapon.loaded += count;
        weapon.reserve -= count;
      }
    }
    const weapon = this.#current;
    if (!weapon.loaded && weapon.cooldown === 0) this.reload();
  }

  restock(): void {
    for (const [id, weapon] of this.#owned) this.#owned.set(id, this.#stock(weapon.definition));
  }

  snapshot() {
    const { definition, loaded, reserve, reloadLeft } = this.#current;
    return {
      id: definition.id,
      automatic: definition.automatic,
      capacity: definition.capacity,
      loaded,
      reserve,
      reloadLeft,
      shots: this.#shots,
      credits: this.#credits,
      owned: [...this.#owned.keys()],
      canRefill: this.#credits >= refillPrice && reserve < definition.reserve,
      refillPrice,
    };
  }
}
