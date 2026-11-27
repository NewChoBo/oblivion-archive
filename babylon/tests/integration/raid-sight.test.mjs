import assert from 'node:assert/strict';
import test from 'node:test';
import { FreeCamera, Frustum, Matrix, NullEngine, Scene, Vector3, Viewport } from '@babylonjs/core';
import {
  inRaidSight,
  RAID_CAMERA,
  raidCameraPose,
  raidAimPullback,
} from '../../src/game/raid/raid-sight.ts';

test('the chase eye and look point keep their offsets when the runner changes lane or pace', () => {
  const origin = raidCameraPose({ x: 0, z: 0 });
  for (const runner of [
    { x: -5, z: -6 },
    { x: 5, z: 8.4 },
    { x: -1.52, z: 0.0375 },
  ]) {
    const camera = raidCameraPose(runner);
    for (const part of ['eye', 'look']) {
      assert.equal(camera[part].x, runner.x + origin[part].x);
      assert.equal(camera[part].y, origin[part].y);
      assert.equal(camera[part].z, runner.z + origin[part].z);
    }
  }
});

test('the runner ground ring projects at about 70% for direction and placement and 50% for selection', (t) => {
  const engine = new NullEngine({ renderWidth: 844, renderHeight: 390 });
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const camera = new FreeCamera('runner view', Vector3.Zero(), scene);
  camera.fov = RAID_CAMERA.fov;
  const viewport = new Viewport(0, 0, 844, 390);
  function ringWidth(kind) {
    const { eye, look } = raidCameraPose({ x: 0, z: 0 }, raidAimPullback(kind));
    camera.position.set(eye.x, eye.y, eye.z);
    camera.setTarget(new Vector3(look.x, look.y, look.z));
    const transform = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
    const edge = (x) =>
      Vector3.Project(new Vector3(x, 0, 0), Matrix.IdentityReadOnly, transform, viewport).x;
    return edge(0.5) - edge(-0.5);
  }
  const running = ringWidth();
  assert.equal(ringWidth('pulse'), running);
  for (const kind of ['direction', 'leap', 'field'])
    assert.ok(Math.abs(ringWidth(kind) / running - 0.7) < 0.04);
  for (const kind of ['target', 'ward'])
    assert.ok(Math.abs(ringWidth(kind) / running - 0.5) < 0.04);
});

test('skill visibility follows the rendered chase camera at different viewport sizes', (t) => {
  for (const width of [568, 844]) {
    const engine = new NullEngine({ renderWidth: width, renderHeight: 390 });
    t.after(() => engine.dispose());
    const scene = new Scene(engine);
    const camera = new FreeCamera('runner view', Vector3.Zero(), scene);
    camera.fov = RAID_CAMERA.fov;
    camera.minZ = RAID_CAMERA.near;
    camera.maxZ = RAID_CAMERA.far;
    for (const runner of [
      { x: -5, z: -6 },
      { x: 4, z: 8 },
    ]) {
      for (const pullback of [0, raidAimPullback('direction'), raidAimPullback('target')]) {
        const { eye, look } = raidCameraPose(runner, pullback);
        camera.position.set(eye.x, eye.y, eye.z);
        camera.setTarget(new Vector3(look.x, look.y, look.z));
        const planes = Frustum.GetPlanes(
          camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)),
        );
        for (const x of [-12, -5, 0, 5, 12]) {
          for (const z of [-6, 0, 8, 10, 150]) {
            for (const y of [1, 2.5]) {
              const point = new Vector3(x, y, z);
              const onScreen = planes.every((plane) => plane.dotCoordinate(point) >= 0);
              assert.equal(
                inRaidSight(runner, point, y, engine.getAspectRatio(camera), pullback),
                onScreen,
              );
            }
          }
        }
      }
    }
  }
});
