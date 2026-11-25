import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import {
  canRaiseCollider,
  createGroundProbe,
  findGroundContact,
  hasGroundContact,
} from '../../src/platform/babylon/player/collider-contact.ts';
import { movementSteps, moveCollider } from '../../src/platform/babylon/player/movement.ts';
import { createJumpMotor } from '../../src/game/player/jump-motor.ts';
import { applyPosture, POSTURES } from '../../src/platform/babylon/player/player-posture.ts';
import { buildLayout } from '../fixtures/chapter-layout.mjs';
import exterior from '../../../shared/levels/fortress-exterior.json' with { type: 'json' };
test('real Babylon collision substeps keep floor contact on slow frames and stop at a ceiling', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.collisionsEnabled = true;
  const mat = new StandardMaterial('floor', scene),
    floor = MeshBuilder.CreateGround('floor', { width: 9, height: 14 }, scene);
  floor.material = mat;
  floor.checkCollisions = true;
  floor.computeWorldMatrix(true);
  const body = MeshBuilder.CreateBox('body', {}, scene);
  body.position.set(0, 0.86, 0);
  body.ellipsoid = new Vector3(0.25, 0.84, 0.25);
  const motor = createJumpMotor();
  const frame = (dt) => {
    const steps = movementSteps(dt);
    for (let i = 0; i < steps.count; i++)
      motor.step(
        steps.step,
        () => body.position.y,
        (dy) => moveCollider(body, new Vector3(0, dy, 0)),
        () => hasGroundContact(scene, body),
      );
  };
  for (let i = 0; i < 80; i++) frame([0.016, 0.08, 0.5, 1][i % 4]);
  assert.ok(body.position.y >= 0.84 && body.position.y < 0.87);
  assert.ok(motor.snapshot().grounded);
  motor.request();
  for (let i = 0; i < 80; i++) frame(0.016);
  assert.equal(motor.snapshot().landings, 1);
  assert.ok(motor.snapshot().peak > 0.7 && motor.snapshot().peak < 1);
  const ceiling = MeshBuilder.CreateBox('ceiling', { width: 9, height: 0.1, depth: 14 }, scene);
  ceiling.position.y = 2;
  ceiling.material = mat;
  ceiling.checkCollisions = true;
  ceiling.computeWorldMatrix(true);
  motor.request();
  for (let i = 0; i < 80; i++) frame(0.016);
  assert.equal(motor.snapshot().landings, 2);
  assert.ok(motor.snapshot().peak < 0.35);
  engine.dispose();
});

test('resting contact holds exact height across frame times, jumping and removed support', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  scene.collisionsEnabled = true;
  const floor = MeshBuilder.CreateGround('floor', { width: 9, height: 14 }, scene);
  floor.checkCollisions = true;
  const body = MeshBuilder.CreateBox('body', {}, scene);
  body.position.set(0, 0.86, 0);
  body.ellipsoid.set(0.25, 0.84, 0.25);
  const motor = createJumpMotor();
  function frame(seconds) {
    const { count, step } = movementSteps(seconds);
    for (let index = 0; index < count; index++) {
      motor.step(
        step,
        () => body.position.y,
        (dy) => moveCollider(body, new Vector3(0, dy, 0)),
        () => hasGroundContact(scene, body),
        true,
      );
    }
  }

  frame(0.033);
  assert.equal(motor.snapshot().grounded, true);
  const restHeight = body.position.y;
  const irregular = [0.016, 0.033, 0.079, 0.135, 0.5];
  for (let index = 0; index < 40; index++) {
    frame(irregular[index % irregular.length]);
    assert.equal(body.position.y, restHeight);
  }

  assert.equal(motor.request(), true);
  frame(0.033);
  assert.ok(body.position.y > restHeight);
  for (let index = 0; index < 60; index++) frame(0.016);
  assert.equal(motor.snapshot().landings, 1);
  const landed = body.position.y;
  floor.setEnabled(false);
  frame(0.033);
  assert.ok(body.position.y < landed);
  assert.equal(motor.snapshot().grounded, false);
});

test('walking on flat ground separates travel from vertical acceleration until stepping off', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  scene.collisionsEnabled = true;
  const floor = MeshBuilder.CreateGround('walkway', { width: 5, height: 18 }, scene);
  floor.checkCollisions = true;
  const lowerFloor = MeshBuilder.CreateGround('lower floor', { width: 5, height: 30 }, scene);
  lowerFloor.position.y = -0.22;
  lowerFloor.checkCollisions = true;
  lowerFloor.computeWorldMatrix(true);
  const body = MeshBuilder.CreateBox('walker', {}, scene);
  body.position.set(0, 0.85, -6);
  body.ellipsoid.set(0.25, 0.84, 0.25);
  const motor = createJumpMotor();
  const ground = (drop) => findGroundContact(scene, body, drop);
  function step(seconds, distance) {
    motor.step(
      seconds,
      () => body.position.y,
      (dy, verticalOnly) => moveCollider(body, new Vector3(0, dy, verticalOnly ? 0 : distance)),
      ground,
      distance === 0,
    );
  }
  step(0.025, 0);
  const initialHeight = body.position.y;
  let distance = 0;
  while (distance < 12) {
    for (const dt of [0.008, 0.017, 0.023, 0.011]) {
      step(dt, dt * 3);
      distance += dt * 3;
      assert.ok(Math.abs(body.position.y - initialHeight) < 1e-6);
    }
  }
  assert.ok(Math.abs(body.position.z + 6 - distance) < 1e-6);
  for (let count = 0; count < 60 && motor.snapshot().grounded; count++) step(0.025, 0.075);
  assert.equal(motor.snapshot().grounded, false);
  assert.ok(body.position.z > 9 && body.position.y < initialHeight);
  assert.equal(motor.request(), false);
  assert.ok(body.position.y > initialHeight - 0.1, 'the body falls from the ledge under gravity');
});

test('walkers and runners stay grounded and can jump on both descending citadel flights', (t) => {
  const { scene, collisionBoxes } = buildLayout(t, true);
  const body = MeshBuilder.CreateBox('walker', {}, scene);
  body.ellipsoid.set(0.25, 0.84, 0.25);
  body.surroundingMeshes = collisionBoxes;
  const [x, y, z] = exterior.chapterJoin.offset;
  const motor = createJumpMotor();
  const ground = createGroundProbe(scene, body);
  const frame = (hz, speed) => {
    ground.invalidate();
    const { count, step } = movementSteps(1 / hz);
    for (let i = 0; i < count; i++)
      motor.step(
        step,
        () => body.position.y,
        (dy, verticalOnly) =>
          moveCollider(body, new Vector3(0, dy, verticalOnly ? 0 : -speed * step)),
        ground.sample,
        speed === 0,
      );
  };
  for (const [hz, speed] of [
    [30, 5],
    [60, 3],
    [144, 5],
  ]) {
    motor.reset();
    body.position.set(x, y + 4.5 + 0.85, z + 33.1);
    frame(hz, 0);
    for (const station of [29.5, 21.5, 18.95]) {
      for (let i = 0; i < hz * 6 && body.position.z > z + station; i++) {
        frame(hz, speed);
        assert.ok(motor.snapshot().grounded, `lost support at ${body.position.z - z} (${hz} Hz)`);
      }
      assert.ok(body.position.z <= z + station, 'the controller advanced down the flight');
      if (station === 18.95) break;
      assert.equal(motor.request(), true);
      const takeoff = body.position.y;
      frame(hz, speed);
      assert.ok(body.position.y > takeoff && !motor.snapshot().grounded);
      assert.equal(motor.request(), false);
      for (let i = 0; i < hz && !motor.snapshot().grounded; i++) frame(hz, 0);
      assert.ok(motor.snapshot().grounded && motor.snapshot().peak > 0.65);
    }
    assert.equal(motor.snapshot().landings, 2);
  }
});

test('posture keeps floor contact and only expands the collider with headroom', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  scene.collisionsEnabled = true;
  const floor = MeshBuilder.CreateGround('floor', { width: 5, height: 8 }, scene);
  floor.checkCollisions = true;
  const ledge = MeshBuilder.CreateBox('low ledge', { width: 3, height: 0.2, depth: 1.4 }, scene);
  ledge.position.set(0, 0.91, 0);
  ledge.checkCollisions = true;
  ledge.computeWorldMatrix(true);
  const body = MeshBuilder.CreateBox('walker', {}, scene);
  body.ellipsoid.set(0.25, 0.84, 0.25);
  body.surroundingMeshes = [floor, ledge];
  body.position.set(0, 0.86, -1.5);
  const motor = createJumpMotor();

  const walk = (distance) => {
    for (let i = 0; i < 80; i++) {
      motor.step(
        0.015,
        () => body.position.y,
        (dy, verticalOnly) =>
          moveCollider(body, new Vector3(0, dy, verticalOnly ? 0 : distance / 80)),
        () => findGroundContact(scene, body),
      );
    }
  };
  walk(1.5);
  assert.ok(body.position.z < -0.7, 'standing collider stops at the ledge');
  applyPosture(body, 'crouch');
  assert.ok(hasGroundContact(scene, body));
  walk(1.5);
  assert.ok(body.position.z < -0.7, 'crouch is still too tall');
  const baseHeight = body.position.y;
  applyPosture(body, 'prone');
  assert.equal(body.position.y, baseHeight);
  walk(-body.position.z);
  assert.ok(Math.abs(body.position.z) < 0.01 && hasGroundContact(scene, body));
  assert.ok(Math.abs(body.position.y - baseHeight) < 1e-6);
  assert.equal(canRaiseCollider(body, POSTURES.crouch.halfHeight, body.surroundingMeshes), false);
  assert.equal(canRaiseCollider(body, POSTURES.standing.halfHeight, body.surroundingMeshes), false);
  walk(1.2);
  assert.equal(canRaiseCollider(body, POSTURES.standing.halfHeight, body.surroundingMeshes), true);
  applyPosture(body, 'standing');
  assert.ok(hasGroundContact(scene, body));
});

test('both authored stair flights allow standing from crouch and prone with open headroom', (t) => {
  const { scene, collisionBoxes } = buildLayout(t, true);
  const body = MeshBuilder.CreateBox('walker', {}, scene);
  body.ellipsoid.set(0.25, 0.84, 0.25);
  const [x, y, z] = exterior.chapterJoin.offset;
  for (const [height, station] of [
    [1, 21.5],
    [3.25, 29.5],
  ]) {
    body.position.set(x, y + height + 0.87, z + station);
    for (const posture of ['crouch', 'prone']) {
      applyPosture(body, posture);
      assert.equal(
        canRaiseCollider(body, POSTURES.standing.halfHeight, collisionBoxes),
        true,
        `${posture} at stair station ${station}`,
      );
    }
  }
});
