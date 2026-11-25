import assert from 'node:assert/strict';
import test from 'node:test';
import { TransformNode, Vector3 } from '@babylonjs/core';
import { POSTURE_MOTION } from '../../src/content/catalogs/humanoids.ts';
import { loadHumanoidPostures } from '../../src/platform/babylon/actors/humanoid-postures.ts';
import { instantiateHumanoid } from '../../src/platform/babylon/actors/sample-humanoid.ts';
import { humanoidScene } from '../fixtures/humanoid-scene.mjs';

async function playerRig(t) {
  const scene = humanoidScene(t);
  const root = new TransformNode('player', scene);
  const actor = await instantiateHumanoid(scene, root, 'player');
  const motion = await loadHumanoidPostures(scene, actor.joints);
  const skin = actor.meshes.find((mesh) => mesh.skeleton);
  return {
    root,
    motion,
    point(name) {
      skin.computeWorldMatrix(true);
      skin.skeleton.prepare(true);
      skin.skeleton.computeAbsoluteMatrices(true);
      return skin.skeleton.bones.find((b) => b.name.endsWith(':' + name)).getAbsolutePosition(skin);
    },
  };
}

test('the player lowers through a kneel and braces on the ground without stretching or sinking through the floor', async (t) => {
  const { motion, point } = await playerRig(t);
  const thigh = Vector3.Distance(point('LeftUpLeg'), point('LeftLeg'));
  for (let i = 0; i <= 100; i++) {
    const level = i / 50,
      prone = Math.max(0, level - 1),
      crouch = Math.min(1, level) - prone;
    motion.update(1 / 60, { crouch, prone, stride: 0, distance: 0 });
    assert.ok(Math.abs(Vector3.Distance(point('LeftUpLeg'), point('LeftLeg')) - thigh) < 0.001);
    for (const side of ['Left', 'Right']) {
      assert.ok(point(side + 'Toe_End').y > -0.015, 'foot below floor at ' + level);
      assert.ok(point(side + 'Leg').y > 0.035, 'knee below floor at ' + level);
    }
    if (i === 50) assert.ok(point('Hips').y < 0.6 && point('Head').y > 0.95);
  }
  assert.ok(point('Hips').y < 0.22 && point('Head').y < 0.54);
  assert.ok(point('LeftForeArm').y < 0.1 && point('LeftLeg').y < 0.1);
  assert.ok(point('LeftHand').z - point('LeftFoot').z > 1);
});

test('crouch steps and prone crawling plant the supporting foot across forward, backward and sideways movement', async (t) => {
  const { motion, root, point } = await playerRig(t);
  for (const prone of [0, 1]) {
    const stride = prone ? POSTURE_MOTION.crawlStride : POSTURE_MOTION.crouchStride;
    for (const [x, z] of [
      [0, 1],
      [0, -1],
      [-1, 0],
      [1, 0],
    ]) {
      motion.reset();
      root.position.setAll(0);
      const feet = [],
        hands = [];
      for (let i = 0; i < 40; i++) {
        const distance = stride / 40;
        root.position.x += x * distance;
        root.position.z += z * distance;
        motion.update(1 / 60, {
          posture: prone ? 'prone' : 'crouch',
          crouch: 1 - prone,
          prone,
          stride: 1,
          distance,
          localX: x,
          localZ: z,
        });
        feet.push(point('LeftFoot'));
        hands.push(point('RightHand'));
      }
      assert.ok(Vector3.Distance(feet[2], feet[18]) < 0.035, 'planted foot slid more than 3.5 cm');
      assert.ok(Math.max(...feet.map((p) => p.y)) - Math.min(...feet.map((p) => p.y)) > 0.03);
      if (prone)
        assert.ok(Vector3.Distance(hands[4], hands[16]) < 0.04, 'opposite hand lost its hold');
      const phase = motion.phase;
      motion.update(0.5, {
        posture: prone ? 'prone' : 'crouch',
        crouch: 1 - prone,
        prone,
        stride: 0,
        distance: 0,
      });
      assert.equal(motion.phase, phase, 'movement stops when the collider is blocked');
    }
  }
});
