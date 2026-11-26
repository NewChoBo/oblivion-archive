import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FreeCamera,
  Matrix,
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3,
  Viewport,
} from '@babylonjs/core';
import { nearestRaidTarget } from '../../src/platform/babylon/raid/raid-target-pick.ts';

test('a reticle grazing a target selects the closest eligible body in display pixels', (t) => {
  const engine = new NullEngine({ renderWidth: 1600, renderHeight: 800 });
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const camera = new FreeCamera('eye', new Vector3(0, 0, -10), scene);
  camera.setTarget(Vector3.Zero());
  const model = MeshBuilder.CreateBox('rival', {}, scene);
  model.metadata = { raidTarget: 2 };
  const ally = model.clone('ally');
  ally.metadata = { raidTarget: 1 };
  ally.position.x = 1;
  scene.render();
  const bounds = {
    x: 10,
    y: 20,
    width: 800,
    height: 400,
    left: 10,
    top: 20,
    right: 810,
    bottom: 420,
  };
  const viewport = new Viewport(bounds.x, bounds.y, bounds.width, bounds.height);
  const right = Math.max(
    ...model
      .getBoundingInfo()
      .boundingBox.vectorsWorld.map(
        (v) => Vector3.Project(v, Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport).x,
      ),
  );
  const pick = (gap, eligible) =>
    nearestRaidTarget(scene, bounds, { clientX: right + gap, clientY: 220 }, 22, eligible);
  assert.equal(
    pick(16, () => true),
    1,
  );
  assert.equal(
    pick(16, (id) => id === 2),
    2,
  );
  assert.equal(
    pick(23, (id) => id === 2),
    undefined,
  );
  model.setEnabled(false);
  assert.equal(
    pick(1, (id) => id === 2),
    undefined,
  );
});
