import type { AbstractMesh, Vector3 } from '@babylonjs/core';
import { POSTURES, type Posture } from './player-posture.ts';

interface PlanarVelocity {
  x: number;
  z: number;
  speed: number;
}

interface MovementInput {
  down(action: 'forward' | 'back' | 'left' | 'right' | 'sprint'): boolean;
}

export const WALK_SPEED = POSTURES.standing.speed,
  SPRINT_SPEED = 5;
// Integrate the short transfer of weight on the first and last step. Splitting
// a frame for collision checks must not change the stopping distance.
export function createPlanarMotor() {
  let x = 0,
    z = 0;
  return {
    reset() {
      x = 0;
      z = 0;
    },
    displace(target: PlanarVelocity, dt: number) {
      const dx = target.x - x,
        dz = target.z - z;
      const difference = Math.hypot(dx, dz);
      if (!difference) return { x: x * dt, z: z * dt };
      const braking = target.speed < Math.hypot(x, z) || x * target.x + z * target.z < 0;
      const acceleration = braking ? 44 : 30;
      const ramp = Math.min(dt, difference / acceleration);
      const fraction = Math.min(1, (dt * acceleration) / difference);
      const nextX = x + fraction * dx,
        nextZ = z + fraction * dz;
      const step = {
        x: nextX * dt + ((x - nextX) * ramp) / 2,
        z: nextZ * dt + ((z - nextZ) * ramp) / 2,
      };
      x = nextX;
      z = nextZ;
      return step;
    },
  };
}
export function moveCollider(body: AbstractMesh, displacement: Vector3) {
  body.computeWorldMatrix(true);
  body.moveWithCollisions(displacement);
}
export function movementIntent(input: MovementInput, yaw: number, posture: Posture = 'standing') {
  const x = Number(input.down('right')) - Number(input.down('left'));
  const z = Number(input.down('forward')) - Number(input.down('back'));
  const length = Math.hypot(x, z);
  const running = length > 0 && posture === 'standing' && input.down('sprint');
  const speed = length ? (running ? SPRINT_SPEED : POSTURES[posture].speed) : 0;
  const localX = x / (length || 1),
    localZ = z / (length || 1);
  return {
    x: (Math.sin(yaw) * localZ + Math.cos(yaw) * localX) * speed,
    z: (Math.cos(yaw) * localZ - Math.sin(yaw) * localX) * speed,
    localX,
    localZ,
    speed,
    running,
  };
}
export function movementSteps(seconds: number) {
  const elapsed = Math.max(0, Math.min(1, seconds)),
    count = Math.max(1, Math.ceil(elapsed / 0.025));
  return { elapsed, count, step: elapsed / count };
}
