import type { AbstractMesh } from '@babylonjs/core';
import { HUMANOID_METRICS } from '../../../content/catalogs/humanoids.ts';

// Metres from the collider floor. Eyes use the neutral midpoint of the two eye bones.
// rigLift places the deformed sole on the floor as the toes rotate back during a crawl.
export const POSTURES = {
  standing: {
    halfHeight: HUMANOID_METRICS.player.height / 2,
    eyeHeight: HUMANOID_METRICS.player.eyeHeight,
    eyeForward: 0.085,
    rigLift: 0,
    speed: 3,
  },
  crouch: { halfHeight: 0.625, eyeHeight: 1.11, eyeForward: 0.196, rigLift: 0.002, speed: 1.65 },
  prone: { halfHeight: 0.33, eyeHeight: 0.52, eyeForward: 0.415, rigLift: 0.02, speed: 0.8 },
} as const;

export type Posture = keyof typeof POSTURES;

// Stable samples of the eye bones at the standing, half-crouched, kneeling and
// braced clip keys. The camera follows the head's arc without copying idle or gait bob.
const gazeKeys = [
  { level: 0, ...POSTURES.standing },
  { level: 0.5, eyeHeight: 1.345, eyeForward: 0.166 },
  { level: 1, ...POSTURES.crouch },
  { level: 1.32, eyeHeight: 0.901, eyeForward: 0.284 },
  { level: 1.63, eyeHeight: 0.66, eyeForward: 0.392 },
  { level: 2, ...POSTURES.prone },
];

export function postureGaze(level: number) {
  let from = gazeKeys[0]!;
  for (let i = 1; i < gazeKeys.length; i++) {
    const to = gazeKeys[i]!;
    if (level <= to.level) {
      const t = Math.max(0, (level - from.level) / (to.level - from.level));
      return {
        eyeHeight: from.eyeHeight + (to.eyeHeight - from.eyeHeight) * t,
        eyeForward: from.eyeForward + (to.eyeForward - from.eyeForward) * t,
      };
    }
    from = to;
  }
  return POSTURES.prone;
}

export function applyPosture(
  body: Pick<AbstractMesh, 'ellipsoid' | 'ellipsoidOffset'>,
  posture: Posture,
) {
  const halfHeight = POSTURES[posture].halfHeight;
  // Keep the controller's reference point and the bottom of its collider fixed.
  // Grounded movement, checkpoints and the chapter's range checks share that point.
  body.ellipsoid.y = halfHeight;
  body.ellipsoidOffset.y = halfHeight - POSTURES.standing.halfHeight;
}
