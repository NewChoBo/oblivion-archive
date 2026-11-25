import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { createHumanoidBotPose } from '../../src/platform/babylon/actors/bot-pose.ts';

test('a rotated guard presents the pistol along its sightline and recoils from its firing pose', () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine),
      root = new TransformNode('guard', scene);
    root.position.set(4, 0, -3);
    root.rotation.y = Math.PI / 2;
    const joints = new Map();
    for (const [side, sign] of [
      ['Left', -1],
      ['Right', 1],
    ]) {
      let parent = root;
      for (const name of ['Arm', 'ForeArm', 'Hand']) {
        const node = new TransformNode(side + name, scene);
        node.rotationQuaternion = Quaternion.Identity();
        node.parent = parent;
        if (name === 'Arm') node.position.set(sign * 0.18, 1.4, 0);
        else node.position.set(sign * 0.32, 0, 0);
        joints.set(side + name, node);
        parent = node;
      }
    }
    const actor = createHumanoidBotPose(scene, root, joints, true);
    const target = new Vector3(10, 1.5, -3);
    actor.update({ kind: 'ranged', phase: 'windup', progress: 1 }, target);
    const muzzle = actor.muzzle.clone();
    const hand = joints.get('RightHand').getAbsolutePosition().clone();
    assert.ok(muzzle.x - hand.x > 0.19, 'the muzzle points forward after world-space rotation');
    const barrel = scene.getMeshByName('barrel');
    const barrelDirection = Vector3.TransformNormal(
      Vector3.Up(),
      barrel.computeWorldMatrix(true),
    ).normalize();
    assert.ok(Vector3.Dot(barrelDirection, target.subtract(muzzle).normalize()) > 0.99);
    actor.update({ kind: 'ranged', phase: 'recovery', progress: 0 }, target);
    assert.ok(muzzle.x - actor.muzzle.x > 0.05, 'recoil visibly moves the muzzle back');
  } finally {
    engine.dispose();
  }
});
