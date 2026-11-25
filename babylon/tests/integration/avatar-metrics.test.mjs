import assert from 'node:assert/strict';
import test from 'node:test';
import { FreeCamera, MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core';
import { HUMANOID_METRICS } from '../../src/content/catalogs/humanoids.ts';
import { instantiateHumanoid } from '../../src/platform/babylon/actors/sample-humanoid.ts';
import { HostageMotion, MiraMotion } from '../../src/platform/babylon/actors/ally-motion.ts';
import { applyPosture, POSTURES } from '../../src/platform/babylon/player/player-posture.ts';
import { createPlayerView } from '../../src/platform/babylon/player/player-view.ts';
import { createArcaneTool } from '../../src/platform/babylon/equipment/arcane-tools.ts';
import { createPlayerViewClearance } from '../../src/platform/babylon/player/collider-contact.ts';
import { humanoidScene, measureHumanoid } from '../fixtures/humanoid-scene.mjs';

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
}

test('player, enemy, Mira and guarded hostage stand on their support surface at the rig’s physical scale', async (t) => {
  const scene = humanoidScene(t);
  for (const role of ['player', 'ally', 'enemy']) {
    const root = new TransformNode(role, scene);
    root.position.set(5, role === 'ally' ? 0.05 : 2.3, -4);
    root.rotation.y = -0.4;
    const actor = await instantiateHumanoid(scene, root, role);
    const floor = root.position.y;
    const { height, eyeHeight } = HUMANOID_METRICS[role];
    const check = (label, expectedEye, expectedCrown) => {
      const { sole, eye, crown } = measureHumanoid(root);
      near(sole, floor, 0.003, label + ' feet');
      near(eye.y - floor, expectedEye, 0.012, label + ' eyes');
      near(crown - floor, expectedCrown, 0.012, label + ' crown');
    };
    check(role, eyeHeight, height);
    if (role === 'ally') {
      new MiraMotion(actor, root).update(0.25);
      check('Mira', 1.557, 1.68);
      const hostage = new HostageMotion(actor, root);
      check('guarded hostage', 1.29, 1.47);
      hostage.update(2, true, 0);
      const released = measureHumanoid(root);
      assert.ok(released.eye.y - floor > 1.52 && released.crown - floor > 1.65);
    }
  }
});

async function postureView(t) {
  const scene = humanoidScene(t);
  // The contact shadow is the only canvas texture this headless player view creates.
  scene.getEngine().createCanvas = (width, height) => ({
    width,
    height,
    getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
  });
  const body = MeshBuilder.CreateBox('controller', {}, scene);
  body.ellipsoid.set(0.25, POSTURES.standing.halfHeight, 0.25);
  const floor = 2.3;
  // Saved controller coordinates can include Babylon's collision gap above the floor.
  body.position.set(4, floor + 0.86, -3);
  const checkpoint = body.position.clone();
  const camera = new FreeCamera('eyes', Vector3.Zero(), scene);
  const colliders = [];
  const clearance = createPlayerViewClearance(colliders);
  const view = createPlayerView(scene, camera, body, clearance.sweep, () => new Vector3(8, 4, -3));
  await view.load();
  return { scene, body, floor, camera, colliders, clearance, checkpoint, view };
}

test('a direct drop reaches prone within 350 ms without entering crouched idle or gait', async (t) => {
  const { view, floor } = await postureView(t);
  const tool = { firearm: true, rifle: true, ready: 1, stroke: { alignment: 1 } };
  const movement = {
    yaw: 0,
    pitch: 0,
    moving: true,
    speed: 0.8,
    paused: false,
    airborne: false,
    groundY: floor,
    verticalSpeed: 0,
    localX: 0,
    localZ: 1,
    posture: 'prone',
  };
  view.setMode('third');
  for (const fps of [30, 60, 120]) {
    view.resetPosture();
    let previous = floor + POSTURES.standing.eyeHeight;
    let elapsed = 0;
    do {
      view.update(1 / fps, movement, tool, 'center');
      elapsed += 1 / fps;
      assert.ok(elapsed <= 0.35 + 1 / fps, 'includes at most one frame of sampling delay');
      assert.ok(view.eye.y < previous, 'the camera continues lowering through crouch height');
      assert.doesNotMatch(view.snapshot().locomotion, /^Crouch(Idle|Forward|Back|Left|Right)$/);
      previous = view.eye.y;
    } while (view.eye.y > floor + POSTURES.prone.eyeHeight + 0.001);
  }
  view.resetPosture();
  view.update(0.16, movement, tool, 'center');
  const midDrop = view.eye.y;
  view.update(0.25, { ...movement, paused: true }, tool, 'center');
  assert.equal(view.eye.y, midDrop);
  view.update(1 / 60, { ...movement, posture: 'standing' }, tool, 'center');
  assert.ok(view.eye.y > midDrop && view.eye.y < midDrop + 0.05, 'rises from the interrupted pose');
  view.update(1 / 60, movement, tool, 'center');
  assert.ok(view.eye.y < midDrop, 'a second drop resumes without first finishing the rise');
});

test('both camera modes share the settled rig eye at each posture and keep the crawl gaze behind cover', async (t) => {
  const { scene, body, floor, camera, colliders, clearance, checkpoint, view } =
    await postureView(t);
  const bow = await createArcaneTool(scene, new TransformNode('bow', scene), true);
  const drawn = {
    bow: true,
    bowRest: bow.rest,
    grip: bow.grips().support,
    ready: 1,
    draw: 1,
    scale: 1.36,
    stroke: { alignment: 1 },
  };
  const tool = { firearm: true, rifle: true, ready: 1, stroke: { alignment: 1 } };
  const movement = {
    yaw: Math.PI / 2,
    pitch: 0,
    moving: false,
    speed: 0,
    paused: false,
    airborne: false,
    groundY: floor,
    verticalSpeed: 0,
    localX: 0,
    localZ: 0,
  };
  for (const [posture, reference] of Object.entries(POSTURES)) {
    applyPosture(body, posture);
    assert.ok(body.position.equals(checkpoint));
    near(
      body.position.y + body.ellipsoidOffset.y - body.ellipsoid.y,
      checkpoint.y - 0.84,
      1e-6,
      'checkpoint floor',
    );
    movement.posture = posture;
    view.setMode('third');
    const root = scene.getTransformNodeByName('scribe');
    for (let i = 0; i < 60; i++) {
      view.update(1 / 60, movement, tool, 'center');
      if (i < 36 && i % 4 === 2) {
        const { eye } = measureHumanoid(root);
        near(view.eye.y, eye.y, 0.035, posture + ' transitioning gaze height');
        near(view.eye.x, eye.x, 0.035, posture + ' transitioning forward gaze');
      }
    }
    const { eye, sole, crown } = measureHumanoid(root);
    near(sole, floor, 0.006, posture + ' soles');
    near(crown - floor, 2 * reference.halfHeight, 0.02, posture + ' clearance');
    near(view.eye.y, eye.y, 0.012, posture + ' gaze height');
    near(view.eye.x, eye.x, 0.014, posture + ' forward gaze');
    assert.ok(camera.position.x < view.eye.x - 2 && view.snapshot().cameraDistance > 2.8);
    const held = view.snapshot();
    const triggerHand = Vector3.FromArray(held.hands[1]);
    const triggerWorld = Vector3.TransformCoordinates(triggerHand, root.computeWorldMatrix(true));
    near(
      Vector3.Distance(triggerWorld, view.toolAnchor.getAbsolutePosition()),
      0,
      0.001,
      posture + ' trigger socket',
    );
    const bore = Vector3.TransformNormal(
      Vector3.Forward(),
      view.toolAnchor.computeWorldMatrix(true),
    ).normalize();
    const aim = new Vector3(8, 4, -3).subtract(triggerWorld).normalize();
    assert.ok(Vector3.Dot(bore, aim) > 0.999, posture + ' gun follows the reticle');
    const supportGoal = triggerWorld.add(bore.scale(0.27));
    const [shoulder, elbow, supportHand] = ['LeftArm', 'LeftForeArm', 'LeftHand'].map((name) =>
      scene
        .getTransformNodeByName('mixamorig:' + name)
        .computeWorldMatrix(true)
        .getTranslation(),
    );
    const reach = Vector3.Distance(shoulder, elbow) + Vector3.Distance(elbow, supportHand);
    const expectedGap = Math.max(0, Vector3.Distance(shoulder, supportGoal) - reach);
    near(
      Vector3.Distance(supportHand, supportGoal),
      expectedGap,
      0.003,
      posture + ' offhand reach',
    );
    view.update(0, movement, drawn, 'center');
    near(view.bowSpan, 0.4, 0.018, posture + ' full draw');
    const thirdEye = view.eye.clone();
    view.setMode('first');
    view.update(0, movement, tool, 'center');
    assert.ok(camera.position.equals(thirdEye));
  }
  const wall = MeshBuilder.CreateBox('crawl cover', { width: 0.04, height: 2, depth: 3 }, scene);
  wall.position.set(body.position.x + 0.35, floor + 1, body.position.z);
  wall.checkCollisions = true;
  colliders.push(wall);
  clearance.prepare([]);
  view.update(0, movement, tool, 'center');
  assert.ok(
    camera.position.x > body.position.x && camera.position.x + 0.099 < wall.position.x - 0.02,
  );
  body.position.y += 1;
  movement.airborne = true;
  movement.groundY = undefined;
  view.update(0, movement, tool, 'center');
  near(camera.position.y, body.position.y - 0.84 + POSTURES.prone.eyeHeight, 1e-6, 'airborne eye');
});
