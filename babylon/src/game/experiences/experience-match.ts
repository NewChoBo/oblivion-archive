export type MatchRules =
  | { readonly kind: 'score'; readonly timeLimit: number; readonly target: number }
  | {
      readonly kind: 'ward';
      readonly timeLimit: number;
      readonly holdSeconds: number;
      readonly roundsToWin: number;
    }
  | {
      readonly kind: 'bomb';
      readonly timeLimit: number;
      readonly fuseSeconds: number;
      readonly defuseSeconds: number;
      readonly roundsToWin: number;
    }
  | { readonly kind: 'rescue'; readonly timeLimit: number; readonly roundsToWin: number }
  | {
      readonly kind: 'elimination';
      readonly timeLimit: number;
      readonly roundsToWin: number;
      readonly enemies: number;
    };

type Phase = 'playing' | 'between-rounds' | 'complete';
type Reason =
  | 'score'
  | 'sealed'
  | 'defeated'
  | 'timeout'
  | 'detonated'
  | 'defused'
  | 'rescued'
  | 'hostage-lost'
  | 'eliminated';

export class ExperienceMatch {
  readonly #rules: MatchRules;
  readonly #wards: ReadonlySet<string>;
  #phase: Phase = 'playing';
  #timeLeft: number;
  #kills = 0;
  #deaths = 0;
  #round = 1;
  #wins = 0;
  #losses = 0;
  #sealedWard: string | null = null;
  #holdLeft = 0;
  #contested = false;
  #bombSite: string | null = null;
  #fuseLeft = 0;
  #defuseProgress = 0;
  #escort = false;
  #roundKills = 0;
  #result: { won: boolean; reason: Reason } | null = null;

  constructor(rules: MatchRules, wards: readonly string[] = []) {
    this.#rules = rules;
    this.#wards = new Set(wards);
    this.#timeLeft = rules.timeLimit;
  }

  get phase() {
    return this.#phase;
  }
  get kind() {
    return this.#rules.kind;
  }
  get ward() {
    return this.#sealedWard;
  }

  activateWard(id: string): boolean {
    if (
      this.#phase !== 'playing' ||
      this.#rules.kind !== 'ward' ||
      this.#sealedWard ||
      !this.#wards.has(id)
    )
      return false;
    this.#sealedWard = id;
    this.#holdLeft = this.#rules.holdSeconds;
    return true;
  }

  get bombSite() {
    return this.#bombSite;
  }
  get escorting() {
    return this.#escort;
  }
  get canBuy() {
    return (
      this.#phase === 'playing' && this.#timeLeft > this.#rules.timeLimit - 25 && !this.#bombSite
    );
  }

  interactObjective(id: string): boolean {
    if (this.#phase !== 'playing') return false;
    if (this.#rules.kind === 'rescue' && id === 'hostage' && !this.#escort) {
      this.#escort = true;
      return true;
    }
    if (this.#rules.kind !== 'bomb' || this.#bombSite || !this.#wards.has(id)) return false;
    this.#bombSite = id;
    this.#fuseLeft = this.#rules.fuseSeconds;
    return true;
  }

  loseHostage(): void {
    if (this.#rules.kind === 'rescue' && this.#phase === 'playing')
      this.#finish(false, 'hostage-lost');
  }

  recordElimination(): void {
    if (this.#phase !== 'playing') return;
    if (this.#rules.kind === 'score' && ++this.#kills >= this.#rules.target)
      this.#finish(true, 'score');
    if (this.#rules.kind === 'elimination' && ++this.#roundKills >= this.#rules.enemies)
      this.#finish(true, 'eliminated');
  }

  advance(
    seconds: number,
    {
      defeated,
      contested,
      defusing = false,
      extracted = false,
    }: { defeated: boolean; contested: boolean; defusing?: boolean; extracted?: boolean },
  ): 'respawn' | undefined {
    if (this.#phase !== 'playing' || !Number.isFinite(seconds) || seconds < 0) return;
    const elapsed = Math.min(seconds, this.#bombSite ? this.#fuseLeft : this.#timeLeft);
    this.#timeLeft = Math.max(0, this.#timeLeft - elapsed);
    if (defeated) {
      this.#deaths++;
      if (this.#rules.kind !== 'score') {
        this.#finish(false, 'defeated');
        return;
      }
    }

    if (this.#sealedWard) {
      this.#contested = contested;
      if (!contested) this.#holdLeft = Math.max(0, this.#holdLeft - elapsed);
      if (!this.#holdLeft) {
        this.#finish(true, 'sealed');
        return;
      }
    }
    if (this.#bombSite && this.#rules.kind === 'bomb') {
      this.#defuseProgress = defusing ? this.#defuseProgress + elapsed : 0;
      this.#fuseLeft = Math.max(0, this.#fuseLeft - elapsed);
      if (this.#defuseProgress >= this.#rules.defuseSeconds) this.#finish(false, 'defused');
      else if (!this.#fuseLeft) this.#finish(true, 'detonated');
      return;
    }
    if (this.#escort && extracted) {
      this.#finish(true, 'rescued');
      return;
    }

    if (!this.#timeLeft) this.#finish(false, 'timeout');
    else if (defeated) return 'respawn';
  }

  nextRound(): boolean {
    if (this.#phase !== 'between-rounds') return false;
    this.#round++;
    this.#startRound();
    return true;
  }

  restart(): boolean {
    if (this.#phase !== 'complete') return false;
    this.#round = 1;
    this.#wins = 0;
    this.#losses = 0;
    this.#kills = 0;
    this.#deaths = 0;
    this.#startRound();
    return true;
  }

  // Objective timers and escorts belong to one round; the match win/loss tally spans rounds.
  #startRound(): void {
    this.#phase = 'playing';
    this.#timeLeft = this.#rules.timeLimit;
    this.#sealedWard = null;
    this.#holdLeft = 0;
    this.#contested = false;
    this.#result = null;
    this.#bombSite = null;
    this.#fuseLeft = 0;
    this.#defuseProgress = 0;
    this.#escort = false;
    this.#roundKills = 0;
  }

  #finish(won: boolean, reason: Reason): void {
    this.#result = { won, reason };
    if (this.#rules.kind === 'score') {
      this.#phase = 'complete';
      return;
    }
    if (won) this.#wins++;
    else this.#losses++;
    this.#phase =
      Math.max(this.#wins, this.#losses) >= this.#rules.roundsToWin ? 'complete' : 'between-rounds';
  }

  snapshot() {
    return {
      kind: this.#rules.kind,
      phase: this.#phase,
      timeLeft: this.#timeLeft,
      kills: this.#kills,
      deaths: this.#deaths,
      target: this.#rules.kind === 'score' ? this.#rules.target : this.#rules.roundsToWin,
      round: this.#round,
      wins: this.#wins,
      losses: this.#losses,
      ward: this.#sealedWard,
      holdLeft: this.#holdLeft,
      holdSeconds: this.#rules.kind === 'ward' ? this.#rules.holdSeconds : 0,
      bombSite: this.#bombSite,
      fuseLeft: this.#fuseLeft,
      defusing: this.#defuseProgress > 0,
      escorting: this.#escort,
      roundKills: this.#roundKills,
      enemyTarget: this.#rules.kind === 'elimination' ? this.#rules.enemies : 0,
      contested: this.#contested,
      result: this.#result ? { ...this.#result } : null,
    };
  }
}
