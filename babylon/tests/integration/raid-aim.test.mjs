import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FreeCamera,
  Matrix,
  MeshBuilder,
  NullEngine,
  Ray,
  Scene,
  Vector3,
  Viewport,
} from '@babylonjs/core';
import {
  hitRaidTarget,
  nearestRaidTarget,
} from '../../src/platform/babylon/raid/raid-target-pick.ts';
import { createRaidAimGuide } from '../../src/platform/babylon/raid/raid-aim-guide.ts';
import { pickRaidGroundAim } from '../../src/platform/babylon/raid/raid-ground-aim.ts';
import { RaidMatch, WAGON } from '../../src/game/raid/raid-match.ts';
import { RAID_CAMERA, raidCameraPose } from '../../src/game/raid/raid-sight.ts';

test('ground aim keeps legal tiles and projects distant or sky input onto a castable rim', (t) => {
  const engine = new NullEngine({ renderWidth: 1600, renderHeight: 800 });
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const camera = new FreeCamera('chase', Vector3.Zero(), scene);
  camera.fov = RAID_CAMERA.fov;
  camera.minZ = RAID_CAMERA.near;
  camera.maxZ = RAID_CAMERA.far;
  const bounds = { left: 20, top: 30, width: 800, height: 400 };
  const viewport = new Viewport(bounds.left, bounds.top, bounds.width, bounds.height);
  for (const [skill, range] of [
    [0, 10],
    [2, 15],
  ]) {
    for (const offset of [[-7, 2], [20, 24], [-24, -2], null]) {
      const match = new RaidMatch();
      match.move(0, 0.5, 0.4);
      for (let tick = 0; tick < 12; tick++) match.step();
      const caster = match.runners[0];
      const { eye, look } = raidCameraPose(caster);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.setTarget(new Vector3(look.x, look.y, look.z));
      scene.render();
      const project = (point) => {
        const p = Vector3.Project(
          new Vector3(point.x, 0, point.z),
          Matrix.IdentityReadOnly,
          camera.getTransformationMatrix(),
          viewport,
        );
        return { clientX: p.x, clientY: p.y };
      };
      const cursor = offset
        ? project({ x: caster.x + offset[0], z: caster.z + offset[1] })
        : { clientX: 610, clientY: 32 };
      const { point, limitedCursor } = pickRaidGroundAim(camera, bounds, cursor, caster, range);
      if (offset && Math.hypot(...offset) < range) {
        assert.equal(limitedCursor, undefined);
        assert.ok(
          Math.hypot(point.x - caster.x - offset[0], point.z - caster.z - offset[1]) < 0.001,
        );
      } else {
        assert.ok(Math.abs(Math.hypot(point.x - caster.x, point.z - caster.z) - range) < 0.001);
        if (offset) {
          const scale = range / Math.hypot(...offset);
          assert.ok(
            Math.hypot(
              point.x - caster.x - offset[0] * scale,
              point.z - caster.z - offset[1] * scale,
            ) < 0.001,
          );
        } else assert.ok(point.x > caster.x && point.z > caster.z);
        const release = pickRaidGroundAim(camera, bounds, limitedCursor, caster, range);
        assert.ok(Math.hypot(release.point.x - point.x, release.point.z - point.z) < 0.001);
      }
      assert.equal(match.previewSkill(0, skill, point).status, 'ready');
      assert.ok(match.cast(0, skill, point));
    }
  }
});

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
  const targeted = match.previewSkill(0, 1, WAGON, 'wagon');
  draw(targeted);
  assert.ok(!arrow.isEnabled() && footprint.isEnabled());
  assert.deepEqual([footprint.position.x, footprint.position.z], [WAGON.x, WAGON.z]);
  const archer = new RaidMatch('longshot');
  for (const point of [WAGON, { x: 40, z: 2 }]) {
    const shot = archer.previewSkill(0, 0, point);
    draw(shot);
    assert.ok(arrow.isEnabled() && !footprint.isEnabled());
    assert.deepEqual([arrow.position.x, arrow.position.z], [player.x, player.z]);
    assert.equal(arrow.rotation.y, Math.atan2(point.x - player.x, point.z - player.z));
    assert.equal(tip.position.z + tip.scaling.z, shot.range);
    assert.deepEqual(
      [shot.kind, shot.status, shot.count, shot.target],
      ['direction', 'ready', undefined, undefined],
    );
    assert.deepEqual(tip.material.emissiveColor.asArray(), [207 / 255, 222 / 255, 250 / 255]);
    assert.ok(scene.getMeshByName('scatter flight edge').isEnabled());
  }
  const leap = match.previewSkill(0, 0, { x: 3, z: 2 });
  const arc = scene.getMeshByName('leap trajectory');
  draw(leap);
  assert.ok(arc.isEnabled() && footprint.isEnabled() && !arrow.isEnabled());
  assert.equal(arc.scaling.z, leap.distance);
  assert.deepEqual([footprint.position.x, footprint.position.z, footprint.scaling.x], [3, 2, 3.5]);
  const field = match.previewSkill(0, 2, { x: 2, z: 3 });
  draw(field);
  assert.ok(!arrow.isEnabled() && footprint.isEnabled() && range.isEnabled());
  assert.deepEqual(
    [footprint.position.x, footprint.position.z, footprint.scaling.x],
    [2, 3, field.radius],
  );
  assert.ok(!arc.isEnabled());
  const rim = range.getVerticesData('position');
  for (let i = 0; i < rim.length; i += 3) {
    const x = rim[i],
      z = rim[i + 2];
    assert.ok(Math.abs(Math.hypot(x * range.scaling.x, z * range.scaling.z) - field.range) < 0.001);
    assert.deepEqual([range.position.x, range.position.z], [player.x, player.z]);
  }
  draw(null);
  assert.ok(!arrow.isEnabled() && !footprint.isEnabled() && !range.isEnabled());
});

test('exact picking hits the nearest active runner or the road through decorative geometry', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const ground = MeshBuilder.CreateGround('road', { width: 10, height: 10 }, scene);
  const runner = MeshBuilder.CreateBox('runner', {}, scene);
  runner.position.y = 1;
  const decoration = MeshBuilder.CreateBox('bridge railing', {}, scene);
  decoration.position.y = 3;
  for (const mesh of [ground, runner, decoration]) mesh.computeWorldMatrix(true);
  const ray = new Ray(new Vector3(0, 4, 0), Vector3.Down());
  const bodies = [{ target: 2, meshes: [runner] }];
  assert.equal(hitRaidTarget(ray, ground, bodies).target, 2);
  runner.setEnabled(false);
  assert.deepEqual(hitRaidTarget(ray, ground, bodies), {
    target: undefined,
    point: { x: 0, z: 0 },
  });
});

test('a reticle grazing a target selects the closest eligible body in display pixels', (t) => {
  const engine = new NullEngine({ renderWidth: 1600, renderHeight: 800 });
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const camera = new FreeCamera('eye', new Vector3(0, 0, -10), scene);
  camera.setTarget(Vector3.Zero());
  const model = MeshBuilder.CreateBox('rival', {}, scene);
  const ally = model.clone('ally');
  const bodies = [
    { target: 2, meshes: [model] },
    { target: 1, meshes: [ally] },
  ];
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
  const pick = (gap, eligible, candidates = bodies, direct) =>
    nearestRaidTarget(
      scene,
      candidates,
      bounds,
      { clientX: right + gap, clientY: 220 },
      22,
      eligible,
      direct,
    );
  assert.equal(
    pick(16, () => true),
    1,
  );
  assert.equal(
    pick(16, (id) => id === 2),
    2,
  );
  assert.equal(
    pick(23, (id) => id === 2, [bodies[0]]),
    undefined,
  );
  assert.equal(
    pick(16, () => false),
    1,
  );
  assert.equal(
    pick(16, () => false, bodies, 2),
    2,
  );
  assert.equal(
    pick(16, (id) => id === 2, bodies, 1),
    2,
  );
  model.setEnabled(false);
  assert.equal(
    pick(1, (id) => id === 2, [bodies[0]]),
    undefined,
  );
});
