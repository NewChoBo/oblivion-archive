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
import { RAID_FRONT_Z } from '../../src/game/raid/runner-motion.ts';
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
    for (const offset of [[-3, -2], [-7, 2], [0, 6], [20, 24], [-24, -2], null]) {
      const match = new RaidMatch(skill === 0 ? 'hammer' : 'rend');
      match.move(0, 0.5, 0.4);
      for (let tick = 0; tick < 12; tick++) match.step();
      const caster = match.runners[0];
      caster.z = 7;
      const kind = skill === 0 ? 'leap' : 'field';
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
      const pick = (cursor) => pickRaidGroundAim(camera, bounds, cursor, caster, range, kind);
      const { point, limitedCursor } = pick(cursor);
      if (offset) {
        const scale = Math.min(1, range / Math.hypot(...offset));
        const x = caster.x + offset[0] * scale;
        const z = caster.z + offset[1] * scale;
        const expectedZ = kind === 'leap' ? Math.min(z, RAID_FRONT_Z) : z;
        assert.ok(Math.hypot(point.x - x, point.z - expectedZ) < 0.001);
        assert.equal(!!limitedCursor, scale < 1 || z > expectedZ);
      } else {
        assert.ok(limitedCursor && point.x > caster.x && point.z > caster.z);
        if (kind === 'leap') assert.equal(point.z, RAID_FRONT_Z);
        else
          assert.ok(Math.abs(Math.hypot(point.x - caster.x, point.z - caster.z) - range) < 0.001);
      }
      if (limitedCursor) {
        const release = pick(limitedCursor);
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
  const footprint = scene.getMeshByName('skill footprint');
  const range = scene.getMeshByName('skill cast range');
  const duelist = new RaidMatch('rend');
  const targeted = duelist.previewSkill(0, 1, WAGON, 'wagon');
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
    const sector = scene.getMeshByName('skill volley sector');
    assert.ok(sector.isEnabled() && !range.isEnabled());
    const vertices = sector.getVerticesData('position');
    const edges = [3, vertices.length - 3];
    for (const [i, offset] of edges.entries()) {
      const x = vertices[offset],
        z = vertices[offset + 2];
      assert.ok(Math.abs(Math.hypot(x, z) * sector.scaling.z - shot.range) < 1e-5);
      assert.ok(Math.abs(Math.atan2(x, z) - shot.flight.angles.at(i ? -1 : 0)) < 1e-6);
    }
    assert.deepEqual(
      [shot.kind, shot.status, shot.count, shot.target],
      ['direction', 'ready', undefined, undefined],
    );
    assert.ok(scene.getMeshByName('skill volley rim').isEnabled());
  }
  const swordsman = new RaidMatch('kaiken');
  const blades = swordsman.previewSkill(0, 1, { x: 9, z: 4 });
  draw(blades);
  const lanes = arrow.getChildren().filter((n) => n.name === 'skill flight lane');
  assert.equal(lanes.length, 3);
  assert.ok(!scene.getMeshByName('skill volley sector').isEnabled());
  assert.ok(swordsman.cast(0, 1, { dx: 9 - blades.origin.x, dz: 4 - blades.origin.z }));
  for (const [i, lane] of lanes.entries()) {
    const tip = Vector3.TransformCoordinates(new Vector3(0, 0, 1), lane.computeWorldMatrix(true));
    const p = swordsman.projectiles[i];
    assert.ok(lane.isEnabled());
    assert.ok(
      Math.hypot(tip.x - p.x - p.remaining * p.dx, tip.z - p.z - p.remaining * p.dz) < 1e-5,
    );
  }
  draw(swordsman.previewSkill(0, 0, WAGON));
  assert.deepEqual(
    lanes.map((lane) => lane.isEnabled()),
    [true, false, false],
  );
  const leap = match.previewSkill(0, 0, { x: 3, z: 2 });
  const arc = scene.getMeshByName('leap trajectory');
  draw(leap);
  assert.ok(arc.isEnabled() && footprint.isEnabled() && !arrow.isEnabled());
  assert.equal(arc.scaling.z, leap.distance);
  assert.deepEqual([footprint.position.x, footprint.position.z, footprint.scaling.x], [3, 2, 5]);
  const field = duelist.previewSkill(0, 2, { x: 2, z: 3 });
  draw(field);
  assert.ok(!arrow.isEnabled() && footprint.isEnabled() && range.isEnabled());
  const fill = scene.getMeshByName('skill ground area');
  assert.ok(fill.isEnabled());
  assert.deepEqual([fill.scaling.x, fill.scaling.y], [field.radius, field.radius]);
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

test('movement guides stop at the running limit and a subsequent projectile shows its full reach', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const draw = createRaidAimGuide(scene);
  const boundary = scene.getMeshByName('skill cast range');
  const frontOfGuide = () => {
    const positions = boundary.getVerticesData('position');
    const z = positions.filter((_, index) => index % 3 === 2);
    return boundary.position.z + Math.max(...z) * boundary.scaling.z;
  };
  const match = new RaidMatch('rildin');
  const runner = match.runners[0];
  Object.assign(runner, { x: 0, z: RAID_FRONT_Z - 0.2 });
  draw(match.previewSkill(0, 2, { x: 1, z: WAGON.z }));
  assert.ok(Math.abs(frontOfGuide() - RAID_FRONT_Z) < 1e-6);
  const lane = scene.getTransformNodeByName('skill flight lane');
  const tip = Vector3.TransformCoordinates(new Vector3(0, 0, 1), lane.computeWorldMatrix(true));
  assert.ok(match.cast(0, 2, { dx: 1, dz: WAGON.z - runner.z }));
  while (runner.dash) match.step();
  assert.ok(Math.hypot(tip.x - runner.x, tip.z - runner.z) < 1e-6);
  const hammer = new RaidMatch('hammer');
  hammer.runners[0].z = RAID_FRONT_Z;
  draw(hammer.previewSkill(0, 0, WAGON));
  assert.ok(Math.abs(frontOfGuide() - RAID_FRONT_Z) < 1e-6);
  assert.equal(scene.getMeshByName('skill footprint').position.z, RAID_FRONT_Z);
  const kaiken = new RaidMatch('kaiken');
  kaiken.runners[0].z = RAID_FRONT_Z;
  const shot = kaiken.previewSkill(0, 0, WAGON);
  draw(shot);
  assert.ok(Math.abs(frontOfGuide() - RAID_FRONT_Z - shot.range) < 1e-6);
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
