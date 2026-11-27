import type { RaidHero, RaidPoint, RaidRunner, RaidTarget, Skill } from './raid-match.ts';

export interface RaidDirection {
  dx: number;
  dz: number;
}
const scatter = { reach: 8, speed: 15, angles: [-0.17, 0, 0.17], pierces: false };
const piercing = { reach: 16, speed: 21, angles: [0], pierces: true };
const thorn = { reach: 16, speed: 14, angles: [0], pierces: false };
const crescent = { reach: 13, speed: 19, angles: [0], pierces: true };
const split = { reach: 12, speed: 16, angles: [-0.34, 0, 0.34], pierces: true };
const cross = { reach: 15, speed: 18, angles: [0], pierces: true };
export function raidProjectileProfile(hero: RaidHero, skill: Skill) {
  if (hero === 'kaiken' && skill === 0) return crescent;
  if (hero === 'kaiken' && skill === 1) return split;
  if (hero === 'swift' && skill === 0) return cross;
  if (hero === 'longshot' && skill === 0) return scatter;
  if (hero === 'longshot' && skill === 3) return piercing;
  if (hero === 'jade' && skill === 1) return thorn;
  return null;
}
export function unitDirection(dx: number, dz: number): RaidDirection | null {
  const length = Math.hypot(dx, dz);
  return Number.isFinite(length) && length > 0.000001 ? { dx: dx / length, dz: dz / length } : null;
}

interface Projectile extends RaidPoint, RaidDirection {
  readonly caster: number;
  readonly hero: RaidHero;
  readonly skill: Skill;
  readonly metersPerTick: number;
  readonly pierces: boolean;
  remaining: number;
  // All pellets from one cast share this set: their damage is per target, not per pellet.
  readonly hit: Set<RaidTarget>;
}
export type RaidProjectile = Readonly<Omit<Projectile, 'hit'>>;

// Entry time in [0, 1] into a moving ellipse, measured along this tick's shot segment.
function contact(x: number, z: number, dx: number, dz: number, rx: number, rz: number) {
  x /= rx;
  z /= rz;
  dx /= rx;
  dz /= rz;
  const c = x * x + z * z - 1;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz,
    b = x * dx + z * dz;
  const discriminant = b * b - a * c;
  if (a === 0 || b >= 0 || discriminant < 0) return Infinity;
  const t = c / (-b + Math.sqrt(discriminant));
  return t <= 1 ? t : Infinity;
}

/** Fixed directions and reach in wagon-relative metres. Only contact during flight deals damage. */
export class RaidProjectiles {
  #active: Projectile[] = [];
  get active(): readonly RaidProjectile[] {
    return this.#active;
  }
  launch(
    r: RaidRunner,
    skill: Skill,
    direction: RaidDirection,
    profile: typeof scatter,
    hz: number,
  ) {
    const heading = Math.atan2(direction.dx, direction.dz);
    const hit = new Set<RaidTarget>();
    for (const angle of profile.angles) {
      this.#active.push({
        x: r.x,
        z: r.z,
        dx: Math.sin(heading + angle),
        dz: Math.cos(heading + angle),
        caster: r.slot,
        hero: r.hero,
        skill,
        remaining: profile.reach,
        metersPerTick: profile.speed / hz,
        pierces: profile.pierces,
        hit,
      });
    }
  }
  step(
    runners: readonly RaidRunner[],
    previous: readonly (RaidPoint & { height: number })[],
    wagon: RaidPoint,
    height: (runner: RaidRunner) => number,
    strike: (caster: number, target: RaidTarget, skill: Skill) => void,
  ) {
    this.#active = this.#active.filter((p) => {
      const step = Math.min(p.remaining, p.metersPerTick);
      const dx = p.dx * step,
        dz = p.dz * step;
      const contacts: { t: number; target: RaidTarget }[] = [];
      // The carriage body extends from the rear standard to the front crown.
      const wagonTime = contact(p.x - wagon.x, p.z - wagon.z - 1, dx, dz, 1.8, 1.9);
      if (Number.isFinite(wagonTime)) contacts.push({ t: wagonTime, target: 'wagon' });
      for (const r of runners) {
        if (r.respawn || r.team === runners[p.caster]!.team) continue;
        const old = previous[r.slot]!;
        const lowWave = p.hero === 'kaiken' && p.skill === 0;
        const wide = lowWave || (p.hero === 'swift' && p.skill === 0);
        // Rotate into shot space so a broad horizontal blade has the same sweep in every direction.
        const x = p.x - old.x,
          z = p.z - old.z;
        const vx = dx - (r.x - old.x),
          vz = dz - (r.z - old.z);
        const t = contact(
          x * p.dz - z * p.dx,
          x * p.dx + z * p.dz,
          vx * p.dz - vz * p.dx,
          vx * p.dx + vz * p.dz,
          wide ? 1.35 : 0.52,
          0.52,
        );
        if (Number.isFinite(t) && (!lowWave || old.height + (height(r) - old.height) * t <= 0.48))
          contacts.push({ t, target: r.slot });
      }
      for (const { target } of contacts.sort((a, b) => a.t - b.t)) {
        if (!p.hit.has(target)) {
          p.hit.add(target);
          strike(p.caster, target, p.skill);
        }
        if (!p.pierces) return false;
      }
      p.x += dx;
      p.z += dz;
      p.remaining -= step;
      return p.remaining > 0;
    });
  }
}
