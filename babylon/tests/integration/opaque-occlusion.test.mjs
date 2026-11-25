import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBuilder, NullEngine, PBRMaterial, Ray, Scene, Vector3 } from '@babylonjs/core';
import {
  createWallLightOcclusion,
  cullBehindOpaqueWalls,
  occludesBounds,
} from '../../src/platform/babylon/rendering/opaque-occlusion.ts';

test('occlusion requires the whole target projection to fit inside the opaque face', () => {
  const wall = { axis: 2, min: [-1, 0, 2], max: [1, 3, 2.25] };
  const hidden = { min: [-1.4, 0.4, 4], max: [1.4, 2.2, 5] };
  const edge = { ...hidden, max: [3, 2.2, 5] };
  assert.equal(occludesBounds([0, 1.5, 0], wall, hidden), true);
  assert.equal(occludesBounds([0, 1.5, 0], wall, edge), false);
  assert.equal(occludesBounds([0, 1.5, 1.96], wall, hidden), false);
  assert.equal(occludesBounds([0, 1.5, 6], wall, hidden), false);
});

test('two lights can independently query the same wall using world-space coordinates', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const wall = MeshBuilder.CreateBox('wall', { width: 3, height: 3, depth: 0.2 }, scene);
  wall.position.set(0, 1.5, 2);
  wall.material = new PBRMaterial('stone', scene);
  const query = createWallLightOcclusion([{ source: wall, surfaces: [wall] }]);
  const position = { x: 0, y: 1.5, z: 0 };
  const minimum = { x: -0.2, y: 1.3, z: 4 };
  const maximum = { x: 0.2, y: 1.7, z: 4.4 };
  const fromFront = query(position, 8);
  position.z = 6;
  const fromBack = query(position, 8);
  assert.equal(fromFront(minimum, maximum), true);
  assert.equal(fromBack(minimum, maximum), false);
  position.z = 0;
  assert.equal(query(position, 1)?.(minimum, maximum) ?? false, false);
});

test('occluded meshes leave render candidates while picking and reopening the wall still work', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const wall = MeshBuilder.CreateBox('wall', { width: 3, height: 3, depth: 0.2 }, scene);
  wall.position.set(0, 1.5, 2);
  wall.material = new PBRMaterial('stone', scene);
  const hidden = MeshBuilder.CreateBox('behind', {}, scene);
  hidden.position.set(0, 1.5, 4);
  const visible = MeshBuilder.CreateBox('outside', {}, scene);
  visible.position.set(4, 1.5, 4);
  const camera = { position: new Vector3(0, 1.5, 0) };
  cullBehindOpaqueWalls(
    scene,
    camera,
    [{ source: wall, surfaces: [wall] }],
    [wall, hidden, visible],
  );
  const names = () => scene.getActiveMeshCandidates().data.map((mesh) => mesh.name);
  assert.deepEqual(names(), ['wall', 'outside']);
  const ray = new Ray(camera.position, Vector3.Forward(), 8);
  assert.equal(scene.pickWithRay(ray, (mesh) => mesh === hidden).hit, true);
  // A survey/export camera must not inherit the player's interior occlusion.
  scene.activeCamera = { position: new Vector3(0, 1.5, 6) };
  assert.deepEqual(names(), ['wall', 'behind', 'outside']);
  scene.activeCamera = null;
  wall.setEnabled(false);
  assert.deepEqual(names(), ['wall', 'behind', 'outside']);
});
