export type BotAttackKind = 'melee' | 'ranged';
export type BotAttackPhase = 'ready' | 'windup' | 'recovery';

export interface BotAttackPose {
  kind: BotAttackKind;
  phase: BotAttackPhase;
  progress: number;
}

const timings = {
  melee: { windup: 0.32, recovery: 0.48 },
  ranged: { windup: 0.42, recovery: 0.38 },
};

/** The simulation owns contact timing. The renderer samples the same clock for the pose. */
export class BotAttack {
  private readonly kind: BotAttackKind;
  private readonly interval: number;
  private cooldown = 0;
  private elapsed = 0;
  private phase: BotAttackPhase = 'ready';

  constructor(kind: BotAttackKind, interval: number) {
    this.kind = kind;
    this.interval = interval;
  }

  reset(delay = 0): void {
    this.phase = 'ready';
    this.elapsed = 0;
    this.cooldown = delay;
  }

  get busy(): boolean {
    return this.phase !== 'ready';
  }

  pose(): BotAttackPose {
    return {
      kind: this.kind,
      phase: this.phase,
      progress: this.phase === 'ready' ? 0 : this.elapsed / timings[this.kind][this.phase],
    };
  }

  /** Return a single impact at the windup boundary if the target is still exposed. */
  advance(dt: number, exposed: boolean, stunned: boolean): boolean {
    if (stunned) {
      this.reset(0.14);
      return false;
    }
    if (dt <= 0) return false;
    if (this.phase === 'ready') {
      const wait = Math.min(this.cooldown, dt);
      this.cooldown -= wait;
      dt -= wait;
      if (!exposed || dt <= 0) return false;
      this.phase = 'windup';
    }
    const timing = timings[this.kind];
    this.elapsed += dt;
    let impact = false;
    if (this.phase === 'windup' && this.elapsed >= timing.windup) {
      this.elapsed -= timing.windup;
      this.phase = 'recovery';
      impact = exposed;
    }
    if (this.phase === 'recovery' && this.elapsed >= timing.recovery) {
      this.reset(Math.max(0, this.interval - timing.windup - this.elapsed));
    }
    return impact;
  }
}
