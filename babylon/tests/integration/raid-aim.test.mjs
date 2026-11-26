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
import { createRaidAimGuide } from '../../src/platform/babylon/raid/raid-aim-guide.ts';
import { RaidMatch, WAGON, RAID_FIELD_BOUNDS } from '../../src/game/raid/raid-match.ts';

test('the ground guide starts at the caster, stops at reach and shows a field at its true radius', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const draw = createRaidAimGuide(scene);
  const match = new RaidMatch();
  const player = match.runners[0];
  const arrow = scene.getTransformNodeByName('skill flight direction');
  const tip = scene.getMeshByName('skill impact direction');
  const footprint = scene.getMeshByName('skill footprint');
  const range = scene.getMeshByName('skill cast range');
  for (const point of [WAGON, { x: -5, z: 24 }]) {
    const aim = match.previewSkill(0, 1, point, point === WAGON ? 'wagon' : undefined);
    draw(aim);
    assert.ok(arrow.isEnabled() && !footprint.isEnabled());
    assert.deepEqual([arrow.position.x, arrow.position.z], [player.x, player.z]);
    assert.equal(arrow.rotation.y, Math.atan2(point.x - player.x, point.z - player.z));
    assert.equal(tip.position.z + tip.scaling.z, Math.min(aim.range, aim.distance));
  }
  const field = match.previewSkill(0, 2, { x: 2, z: 3 });
  draw(field);
  assert.ok(!arrow.isEnabled() && footprint.isEnabled() && range.isEnabled());
  assert.deepEqual(
    [footprint.position.x, footprint.position.z, footprint.scaling.x],
    [2, 3, field.radius],
  );
  const rim = range.getVerticesData('position');
  for (let i = 0; i < rim.length; i += 3) {
    const x = rim[i],
      z = rim[i + 2];
    assert.ok(x >= RAID_FIELD_BOUNDS.left - 0.001 && x <= RAID_FIELD_BOUNDS.right + 0.001);
    assert.ok(z >= RAID_FIELD_BOUNDS.back - 0.001 && z <= RAID_FIELD_BOUNDS.front + 0.001);
    assert.ok(Math.hypot(x - player.x, z - player.z) <= field.range + 0.001);
  }
  draw(null);
  assert.ok(!arrow.isEnabled() && !footprint.isEnabled() && !range.isEnabled());
});

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
