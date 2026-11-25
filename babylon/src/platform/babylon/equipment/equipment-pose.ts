import type { Matrix, Vector3 } from '@babylonjs/core';
import type { BowMotion, BowRelease, WandMotion } from './arcane-tools.ts';
import type { wandStroke } from '../../../game/combat/wand-stroke.ts';

interface ArcanePose {
  firearm?: false;
  stroke: ReturnType<typeof wandStroke>;
  castAge: number;
  draw: number;
  tip: Vector3;
  grip: Vector3;
  scale: number;
  held: boolean;
  ready: number;
  reload: number;
  nock: number;
}
export interface BowPose extends ArcanePose {
  bow: true;
  torch: false;
  bowRest: Vector3;
  bowRelease: BowRelease;
  motion: BowMotion | null;
}
export interface HandToolPose extends ArcanePose {
  bow: false;
  torch: boolean;
  bowRest?: undefined;
  bowRelease: null;
  motion: WandMotion | null;
}
export interface FirearmPose {
  firearm: true;
  rifle: boolean;
  stroke: { alignment: number };
  castAge: number;
  ready: number;
  bow?: false;
  torch?: false;
  motion?: undefined;
}
export type CharacterPose = BowPose | HandToolPose | FirearmPose;

// Distance and speed use metres and metres per second. localX/Z give the direction of travel
// relative to the player's yaw after collisions have resolved.
export interface PlayerMovement {
  yaw: number;
  pitch: number;
  moving: boolean;
  distance?: number;
  speed: number;
  paused: boolean;
  posture?: 'standing' | 'crouch' | 'prone';
  airborne: boolean;
  /** World Y of the supporting surface under the controller, when grounded. */
  groundY?: number;
  verticalSpeed: number;
  localX: number;
  localZ: number;
}
export interface PoseMovement extends PlayerMovement {
  running: boolean;
  stride: number;
  crouch: number;
  prone: number;
}
export type ConstrainTorchGrip = (
  hand: Vector3,
  matrix: Matrix,
  tool: HandToolPose,
  dt: number,
) => Vector3;
