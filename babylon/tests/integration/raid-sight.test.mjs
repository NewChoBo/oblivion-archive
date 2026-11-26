import assert from 'node:assert/strict';
import test from 'node:test';
import { FreeCamera, Frustum, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { inRaidSight, RAID_CAMERA, raidCameraPose } from '../../src/game/raid/raid-sight.ts';

test('targetable runners are ahead and inside the rendered chase camera at different viewport sizes', (t) => {
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
      const { eye, look } = raidCameraPose(runner);
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
              inRaidSight(runner, point, y, engine.getAspectRatio(camera)),
              z >= runner.z && onScreen,
            );
          }
        }
      }
    }
  }
});
