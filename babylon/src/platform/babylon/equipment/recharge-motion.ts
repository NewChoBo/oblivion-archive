import { Vector3 } from '@babylonjs/core';

function ease(start: number, end: number, time: number) {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

// The wand's free hand traces the recharge sigils.
export function rechargeMotion(t: number) {
  if (t <= 0 || t >= 1) return null;
  const present = ease(0, 0.22, t) * (1 - ease(0.76, 1, t));
  const touch = ease(0.07, 0.26, t) * (1 - ease(0.8, 0.99, t));
  const sweep = ease(0.22, 0.73, t),
    angle = 2.6 + sweep * 4.85;
  const radius = 0.118 - 0.068 * ease(0.66, 0.8, t);
  const freeHand = new Vector3(
    radius * Math.cos(angle),
    radius * Math.sin(angle),
    0.21 + 0.055 * sweep,
  );
  return {
    present,
    touch,
    freeHand,
    angle,
    light: ease(0.15, 0.32, t) * (1 - ease(0.75, 0.91, t)),
    seat: ease(0.67, 0.82, t),
    phase: t < 0.22 ? 'present' : t < 0.72 ? 'inscribe' : 'seal',
  };
}

export function bowNockMotion(t: number) {
  if (t <= 0 || t >= 1) return null;
  return {
    present: ease(0, 0.2, t) * (1 - ease(0.74, 1, t)),
    touch: ease(0.05, 0.28, t) * (1 - ease(0.87, 1, t)),
    withdraw: ease(0.29, 0.47, t),
    carry: ease(0.43, 0.83, t),
    hasArrow: t >= 0.29,
    seated: t >= 0.88,
    phase: t < 0.29 ? 'reach' : t < 0.47 ? 'withdraw' : t < 0.83 ? 'carry' : 'seat',
  };
}

export const BOW_RELEASE_SECONDS = 0.24;

export function bowReleaseMotion(seconds: number, power: number) {
  if (seconds < 0 || seconds >= BOW_RELEASE_SECONDS) return null;
  const hold = 1 - ease(0.13, BOW_RELEASE_SECONDS, seconds);
  const follow = ease(0, 0.075, seconds) * hold;
  const rebound = ease(0.043, 0.065, seconds) * (1 - ease(0.066, 0.115, seconds));
  return {
    hold,
    tension: 1 - ease(0, 0.052, seconds) - 0.13 * rebound,
    back: (0.055 + 0.075 * power) * follow,
    side: 0.044 * follow,
    open: 1 - ease(0.105, 0.23, seconds),
  };
}
