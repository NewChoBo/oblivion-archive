import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBuilder, Ray, Vector3 } from '@babylonjs/core';
import { buildLayout } from '../fixtures/chapter-layout.mjs';
import { chapterLevel, construction, plan, workLayout } from '../../src/content/citadel-layout.ts';
import { createChapterState } from '../../src/app/chapter.ts';

const [dx, dy, dz] = plan.chapterJoin.offset;
test('the facade cut, arch ring and spandrels close the whole opening envelope on both faces', (t) => {
  const { scene } = buildLayout(t, true);
  for (const cx of plan.libraryWings.centers)
    for (const side of [-1, 1]) {
      for (let u = -1.85; u <= 1.85; u += 0.055)
        for (let y = 2.12; y <= 4.6; y += 0.065) {
          // Above the inner pointed curve this must be stone, never the sky or
          // a far wall seen through a missing strip beside the ring.
          const inner =
            2.1 +
            (1.8 * Math.sqrt(Math.max(0, 4 - (1 + Math.min(1, Math.abs(u) / 1.4)) ** 2))) /
              Math.sqrt(3);
          if (Math.abs(u) < 1.4 && y < inner + 0.025) continue;
          const ray = new Ray(
            new Vector3(cx + u, dy + 4.5 + y, dz + 36.2 + side * 0.7),
            new Vector3(0, 0, -side),
            1.3,
          );
          const hit = scene.pickWithRay(
            ray,
            (m) =>
              m.name === 'library wing entrance wall' ||
              ['pointed arch', 'arch spandrel'].includes(m.name),
          );
          assert.ok(hit.hit, 'open facade ' + [cx, u, y, side]);
        }
    }
});

test('beacon feet meet paving and have clear space inside the parapet', (t) => {
  const { scene } = buildLayout(t, true);
  const feet = scene.meshes.filter((m) => m.name === 'beacon stone base');
  assert.equal(feet.length, 8);
  for (const foot of feet) {
    const c = foot.getBoundingInfo().boundingBox.centerWorld;
    for (const x of [-0.17, 0, 0.17])
      for (const z of [-0.17, 0, 0.17]) {
        const hit = scene.pickWithRay(
          new Ray(new Vector3(c.x + x, c.y + 0.3, c.z + z), Vector3.Down(), 1.5),
          (m) =>
            ['curved stone bridge', 'walkable stair ramp', 'stair tread', 'orrery court'].includes(
              m.name,
            ),
        );
        assert.ok(hit.hit, 'unsupported beacon ' + c);
        assert.ok(
          hit.pickedPoint.y > foot.getBoundingInfo().boundingBox.minimumWorld.y - 0.01,
          'floating foot ' + c,
        );
      }
  }
});

test('the hoist turns only after clearing masonry and lands with rope and collider attached', (t) => {
  const { scene, citadel } = buildLayout(t, true),
    spec = workLayout.freight;
  const cargo = scene.getMeshByName('suspended book crate'),
    rope = scene.getMeshByName('hoist rope'),
    pulley = scene.getMeshByName('hoist pulley');
  assert.deepEqual(citadel.movingShadowCasters.map((mesh) => mesh.name).sort(), [
    'freight receiving sliding door',
    'hoist jib',
    'hoist jib brace',
    'hoist pulley',
    'hoist rope',
    'suspended book crate',
  ]);
  citadel.restore(4);
  let turned = false;
  for (let elapsed = 0; elapsed < 30; elapsed += 0.05) {
    citadel.update(0.05);
    const s = citadel.snapshot().cargo;
    for (const mesh of [cargo, rope, pulley]) mesh.computeWorldMatrix(true);
    const box = cargo.getBoundingInfo().boundingBox,
      r = rope.getBoundingInfo().boundingBox,
      p = pulley.getBoundingInfo().boundingBox.centerWorld;
    assert.ok(Math.abs(box.maximumWorld.y - r.minimumWorld.y) < 0.001, 'rope missed load');
    assert.ok(
      Math.hypot(p.x - cargo.position.x, p.z - cargo.position.z) < 0.001,
      'pulley missed load',
    );
    if (s.stage === 'turning') {
      turned = true;
      assert.ok(box.minimumWorld.y >= dy + spec.carryBottom - 0.001);
      const diagonal = Math.hypot(spec.load[0], spec.load[2]) / 2;
      assert.ok(s.x - diagonal > plan.freight.building[1] + 0.28, 'load struck roof');
    }
    if (s.stage === 'landed') break;
  }
  assert.ok(turned, 'the cargo turned in the air before landing');
  assert.equal(citadel.snapshot().cargo.stage, 'landed');
  const final = cargo.getBoundingInfo().boundingBox;
  assert.ok(Math.abs(final.minimumWorld.y - dy) < 0.001, 'load did not touch quay');
  assert.ok(
    Math.abs(cargo.position.x - dx - spec.loadPath[0][0]) < 0.001 &&
      Math.abs(cargo.position.z - dz - spec.loadPath[0][1]) < 0.001,
  );
  citadel.restore(0, true);
  assert.equal(citadel.snapshot().cargo.stage, 'waiting');
  assert.ok(
    Math.abs(cargo.getBoundingInfo().boundingBox.minimumWorld.y - dy - spec.pickupBottom) < 0.001,
  );
  citadel.restore(4, true);
  assert.equal(
    citadel.snapshot().cargo.stage,
    'landed',
    'checkpoint must settle the complete pose',
  );
});

test('the new work routes and the south plinth passage admit a standing capsule', (t) => {
  const { scene, collisionBoxes, citadel, environment } = buildLayout(t, true);
  citadel.restore(4, true);
  const walker = MeshBuilder.CreateBox('route capsule', { size: 0.5 }, scene);
  walker.ellipsoid.set(0.25, 0.84, 0.25);
  walker.surroundingMeshes = collisionBoxes;
  const follow = (path, origin) => {
    walker.position.set(origin[0] + path[0][0], origin[1] + 0.86, origin[2] + path[0][1]);
    for (const p of path.slice(1)) {
      const goal = new Vector3(origin[0] + p[0], walker.position.y, origin[2] + p[1]);
      for (let i = 0; i < 260; i++) {
        const delta = goal.subtract(walker.position);
        delta.y = 0;
        if (delta.length() < 0.08) break;
        delta.normalize().scaleInPlace(0.06);
        delta.y = -0.015;
        walker.computeWorldMatrix(true);
        walker.moveWithCollisions(delta);
      }
      assert.ok(
        Math.hypot(walker.position.x - goal.x, walker.position.z - goal.z) < 0.12,
        'blocked route ' + p + ' at ' + walker.position,
      );
    }
  };
  follow(workLayout.freight.visitorPath, [dx, dy, dz]);
  follow(workLayout.freight.loadPath.slice(1), [dx, dy, dz]);
  follow(workLayout.bindery.visitorPath, [dx, dy, dz]);
  environment.get('vault-gate').checkCollisions = false;
  follow(workLayout.corridor.walkPastPlinths, [0, 0, 0]);
  const plinths = chapterLevel.zones.corridor.filter((p) => p.prefab === 'rune-plinth');
  const session = createChapterState();
  session.use('photo', { x: 0.4, y: 0.86, z: 0.85 });
  for (const [
    i,
    {
      position: [x, , z],
    },
  ] of plinths.entries())
    assert.ok(
      session
        .targets()
        .some((a) => a.id === 'rune' + i && a.position[0] === x && a.position[2] === z),
    );
  assert.equal(construction.furniture.readingDesk[1][1], 0.76);
});
