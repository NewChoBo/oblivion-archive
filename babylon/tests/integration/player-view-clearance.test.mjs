import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { createPlayerViewClearance } from '../../src/platform/babylon/player/collider-contact.ts';
import { buildLayout } from '../fixtures/chapter-layout.mjs';

test('an open stair flight retains the full torch and both shoulder camera arms', (t) => {
  const { collisionBoxes } = buildLayout(t, true);
  const clearance = createPlayerViewClearance(collisionBoxes);
  clearance.prepare([]);
  for (const [y, z] of [
    [-4.1, -22.125],
    [-2.2, -14.925],
  ]) {
    const eye = new Vector3(0, y + 1.6, z);
    const flame = new Vector3(0.41, 0.32, 0.85);
    assert.equal(clearance.sweep(eye, flame, 0.04, 0.18), 1);
    for (const side of [-1, 1])
      assert.equal(clearance.sweep(eye, new Vector3(0.76 * side, -0.07, -2.85), 0.2), 1);
  }
});

test('view clearance stops a growing flame at a thin wall and covers triangle edges', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine),
    wall = MeshBuilder.CreateBox('wall', { width: 3, height: 3, depth: 0.02 }, scene);
  wall.checkCollisions = true;
  wall.position.z = 1;
  const clearance = createPlayerViewClearance([wall]);
  clearance.prepare([]);
  for (const x of [0, 1.55]) {
    const offset = new Vector3(0, 0, 2),
      start = new Vector3(x, 0, 0);
    const fraction = clearance.sweep(start, offset, 0.1, 0.12);
    assert.ok(fraction > 0.3 && fraction < 0.5);
    const distance = Math.hypot(Math.max(x - 1.5, 0), Math.max(0.99 - 2 * fraction, 0));
    assert.ok(distance > 0.1 + 0.12 * fraction, 'the flame fits before the wall or its edge');
  }
  wall.setEnabled(false);
  assert.equal(clearance.sweep(Vector3.Zero(), new Vector3(0, 0, 2), 0.1), 1);
  wall.setEnabled(true);
  assert.ok(clearance.sweep(Vector3.Zero(), new Vector3(0, 0, 2), 0.1) < 0.5);
});

test('a shelf retracts the eye-side camera arm and keeps the opposite shoulder clear', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const shelf = MeshBuilder.CreateBox('shelf', { width: 0.6, height: 3, depth: 1.1 }, scene);
  shelf.position.set(0.7, 1.5, -1.05);
  shelf.checkCollisions = true;
  const clearance = createPlayerViewClearance([shelf]);
  clearance.prepare([]);
  const eye = new Vector3(0, 1.6, 0);
  assert.ok(clearance.sweep(eye, new Vector3(0.6, 0, -2), 0.2) < 1);
  assert.equal(clearance.sweep(eye, new Vector3(-0.6, 0, -2), 0.2), 1);
  assert.equal(clearance.sweep(eye, new Vector3(0, 1, 0), 0.2), 1);
  assert.equal(clearance.sweep(new Vector3(0.27, 1.6, -0.8), new Vector3(0, 0, -1), 0.2), 0);
});

test('a shoulder camera leaves enough room for its near plane in front of a wall', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const wall = MeshBuilder.CreateBox('wall', { width: 8, height: 4, depth: 0.2 }, scene);
  wall.position.set(0, 2, -1.9);
  wall.checkCollisions = true;
  const clearance = createPlayerViewClearance([wall]);
  clearance.prepare([]);
  const arm = new Vector3(0.42, 0, -2.2),
    margin = 0.2;
  const fraction = clearance.sweep(new Vector3(0, 1.6, 0), arm, margin);
  assert.ok(fraction > 0 && fraction < 1);
  assert.ok(arm.z * fraction - margin > -1.8, 'the near plane stays in front of the wall');
});

test('a view sweep uses the current world transform of a moving surface', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine),
    wall = MeshBuilder.CreateBox('moving wall', { size: 1 }, scene);
  const mount = new TransformNode('door track', scene);
  wall.parent = mount;
  wall.checkCollisions = true;
  mount.position.set(4, 0, 1.5);
  const clearance = createPlayerViewClearance([wall]);
  clearance.prepare([wall]);
  const delta = new Vector3(0, 0, 2);
  assert.equal(clearance.sweep(Vector3.Zero(), delta, 0.1), 1);
  mount.position.x = 0;
  wall.rotation.y = 0.4;
  assert.ok(clearance.sweep(Vector3.Zero(), delta, 0.1) < 0.5);
  wall.checkCollisions = false;
  assert.equal(clearance.sweep(Vector3.Zero(), delta, 0.1), 1);
});
