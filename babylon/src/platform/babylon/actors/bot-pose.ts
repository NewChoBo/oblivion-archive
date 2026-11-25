import { Vector3, type Scene, type TransformNode } from '@babylonjs/core';
import type { BotAttackPose } from '../../../game/ai/bot-attack.ts';
import { createArenaGun } from '../arena/arena-gun.ts';
import { reach } from './joint-reach.ts';

/** Overlay an attack on the authored locomotion after its skeleton has been sampled. */
export function createHumanoidBotPose(
  scene: Scene,
  root: TransformNode,
  joints: ReadonlyMap<string, TransformNode>,
  armed: boolean,
) {
  function arm(side: string): [TransformNode, TransformNode, TransformNode] {
    function joint(part: string) {
      const node = joints.get(side + part);
      if (!node) throw new Error('Missing bot attack joint: ' + side + part);
      return node;
    }
    return [joint('Arm'), joint('ForeArm'), joint('Hand')];
  }
  const right = arm('Right'),
    left = arm('Left');
  const gun = armed ? createArenaGun(scene, 'sentry pistol', false) : null;
  if (gun) gun.root.parent = root;
  const barrel = new Vector3(0, 0.062, gun?.muzzle ?? 0);
  const muzzle = Vector3.Zero();
  return {
    muzzle,
    update(pose: BotAttackPose, target: Vector3) {
      if (!gun && pose.phase === 'ready') return;
      const matrix = root.computeWorldMatrix(true);
      const winding = pose.phase === 'windup',
        recovering = pose.phase === 'recovery';
      const t = pose.progress;
      const extension = winding ? Math.max(0, (t - 0.62) / 0.38) : recovering ? (1 - t) ** 2 : 0;
      const draw = winding ? Math.sin(t * Math.PI) : 0;
      const aim = winding ? t : recovering ? 1 - t : 0;
      const recoil = recovering ? (1 - t) ** 3 : 0;
      const hand = gun
        ? new Vector3(0.19, 1.08 + 0.22 * aim, 0.24 + 0.16 * aim - 0.12 * recoil)
        : new Vector3(0.24 + 0.15 * draw, 1.17 + 0.13 * draw, 0.18 - 0.18 * draw + 0.5 * extension);
      reach(
        right,
        Vector3.TransformCoordinates(hand, matrix),
        Vector3.TransformNormal(new Vector3(0.9, -0.6, -0.1), matrix),
      );
      if (!gun) return;
      const grip = right[2].computeWorldMatrix(true).getTranslation();
      const inverse = matrix.clone().invert();
      Vector3.TransformCoordinatesToRef(grip, inverse, gun.root.position);
      // Absolute sight direction keeps the gun, support hand and visible tracer aligned.
      gun.root.lookAt(Vector3.TransformCoordinates(target, inverse));
      gun.root.rotation.x += 0.36 * (1 - aim) - 0.16 * recoil;
      const gunMatrix = gun.root.computeWorldMatrix(true);
      reach(
        left,
        Vector3.TransformCoordinates(new Vector3(-0.025, -0.008, 0.07), gunMatrix),
        Vector3.TransformNormal(new Vector3(-0.8, -0.7, -0.1), matrix),
      );
      Vector3.TransformCoordinatesToRef(barrel, gunMatrix, muzzle);
    },
  };
}
