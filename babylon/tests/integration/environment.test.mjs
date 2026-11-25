import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { MeshBuilder, Ray, Vector3 } from '@babylonjs/core';
import {
  citadelArrival,
  citadelLookoutBounds,
} from '../../src/platform/babylon/citadel/floating-citadel.ts';
import citadelPlan from '../../../shared/levels/fortress-exterior.json' with { type: 'json' };
import {
  createPlayerViewClearance,
  hasGroundContact,
} from '../../src/platform/babylon/player/collider-contact.ts';
import { wallSections } from '../../src/levels/wall-openings.ts';
import { createOpeningLight } from '../../src/platform/babylon/lighting/opening-lights.ts';
import level from '../../../shared/levels/chapter-1.json' with { type: 'json' };
import catalog from '../../../shared/levels/environment-prefabs.json' with { type: 'json' };

import { buildLayout } from '../fixtures/chapter-layout.mjs';

test('the chapter layout creates the existing architecture and furniture collision bounds', (t) => {
  const { scene, collisionBoxes, environment } = buildLayout(t);
  const rounded = (vector) => vector.asArray().map((value) => Number(value.toFixed(5)) || 0);
  function checkBounds(mesh, min, max) {
    assert.ok(collisionBoxes.includes(mesh));
    assert.equal(mesh.checkCollisions, true);
    mesh.computeWorldMatrix(true);
    assert.deepEqual(rounded(mesh.getBoundingInfo().boundingBox.minimumWorld), min);
    assert.deepEqual(rounded(mesh.getBoundingInfo().boundingBox.maximumWorld), max);
  }

  const eastWall = scene.meshes.filter(
    (mesh) => mesh.checkCollisions && mesh.name.startsWith('east wall '),
  );
  assert.equal(eastWall.length, 3);
  checkBounds(eastWall[0], [8.25, 0, -5.875], [8.5, 4, 4.55]);
  checkBounds(eastWall[1], [8.25, 0, 6.25], [8.5, 4, 6.8]);
  checkBounds(eastWall[2], [8.25, 3, 4.55], [8.5, 4, 6.25]);
  checkBounds(environment.get('reading-column-west-1'), [-8.235, 0, -4.575], [-7.955, 3.7, -4.225]);
  assert.equal(
    scene.meshes.filter((mesh) => mesh.name === 'column capital' && mesh.checkCollisions).length,
    8,
  );
  checkBounds(environment.get('reading-counter'), [-0.8, 0, 1.25], [1.6, 1.18, 2.35]);
  checkBounds(environment.get('vault-gate'), [11.79, 0, 8.975], [12.01, 3, 11.625]);
  assert.ok(collisionBoxes.includes(environment.get('reading-floor')));
  const windowPane = scene.getMeshByName('library window glass');
  checkBounds(windowPane, [-8.4375, 1.02, 4.94], [-8.4125, 3.24, 6.02]);
  const windowRay = new Ray(new Vector3(-6.825, 2, 5.73), new Vector3(-1, 0, 0), 3);
  for (const mesh of scene.meshes.filter((mesh) => mesh.name.startsWith('west wall ')))
    mesh.computeWorldMatrix(true);
  assert.equal(
    scene.pickWithRay(windowRay, (mesh) => mesh.name.startsWith('west wall ')).hit,
    false,
  );
  assert.equal(scene.pickWithRay(windowRay, (mesh) => mesh === windowPane).hit, true);

  const archWall = environment.parts('reading-arch-wall');
  assert.equal(archWall.length, 1);
  checkBounds(archWall[0], [-8.5, 0, 6.8], [8.5, 4, 7.2]);
  const vaultWall = scene.meshes.filter((mesh) => mesh.name.startsWith('corridor to vault wall '));
  assert.equal(vaultWall.length, 3);
  checkBounds(vaultWall[0], [11.75, 0, 7.1], [12.05, 4, 8.9]);
  checkBounds(vaultWall[1], [11.75, 0, 11.7], [12.05, 4, 13.5]);
  checkBounds(vaultWall[2], [11.75, 2.8, 8.9], [12.05, 4, 11.7]);
  const vaultEast = scene.meshes.filter((mesh) => mesh.name.startsWith('east vault wall '));
  assert.equal(vaultEast.length, 3);
  checkBounds(vaultEast[0], [12.05, 0, 7.1], [14.1, 4, 7.3]);
  checkBounds(vaultEast[1], [16.7, 0, 7.1], [18.2, 4, 7.3]);
  checkBounds(vaultEast[2], [14.1, 3, 7.1], [16.7, 4, 7.3]);

  const hitsArch = (x, y, z, direction) =>
    scene.pickWithRay(new Ray(new Vector3(x, y, z), new Vector3(0, 0, direction), 2), (mesh) =>
      archWall.includes(mesh),
    ).hit;
  assert.equal(hitsArch(0, 1.4, 6, 1), false);
  assert.equal(hitsArch(0, 1.4, 8, -1), false);
  assert.equal(hitsArch(0, 3.6, 6, 1), true);
  assert.equal(hitsArch(1.8, 1.4, 6, 1), true);

  const shoulders = archWall[0];
  const clearance = createPlayerViewClearance(archWall);
  clearance.prepare([]);
  const cameraArm = new Vector3(0, 0, -2);
  assert.equal(clearance.sweep(new Vector3(0, 1.57, 7.6), cameraArm), 1);
  assert.ok(clearance.sweep(new Vector3(1.45, 2.9, 7.6), cameraArm) < 1);
  for (const [from, direction] of [
    [6, 1],
    [8, -1],
  ]) {
    const hitsShoulders = (x, y) =>
      scene.pickWithRay(
        new Ray(new Vector3(x, y, from), new Vector3(0, 0, direction), 2),
        (mesh) => mesh === shoulders,
      ).hit;
    assert.ok(
      hitsShoulders(-1.35, 2.9) && hitsShoulders(1.35, 2.9),
      'both upper corners are backed by stone',
    );
    assert.ok(hitsShoulders(0, 3.23), 'the arch is closed above the crown');
    assert.equal(hitsShoulders(0, 2.8), false);
    assert.equal(hitsShoulders(1, 1.4), false);
  }

  const player = MeshBuilder.CreateBox('test player', { size: 0.5 }, scene);
  player.ellipsoid.set(0.25, 0.84, 0.25);
  player.surroundingMeshes = eastWall;
  player.position.set(7.825, 1, 5.4);
  player.computeWorldMatrix(true);
  player.moveWithCollisions(new Vector3(1, 0, 0));
  assert.ok(player.position.x > 8.5, 'the player passes through the opening');
  player.position.set(7.825, 1, 3.5);
  player.computeWorldMatrix(true);
  player.moveWithCollisions(new Vector3(1, 0, 0));
  assert.ok(player.position.x < 8.25, 'the remaining wall stops the player');
});

test('the pointed entrance cuts through the plaster, exterior stone and camera collision', (t) => {
  const { scene, environment } = buildLayout(t);
  const masonry = environment.parts('reading-wall-entry');
  assert.equal(masonry.length, 2);
  assert.equal(masonry[1].metadata.lightingZone, 'ramparts');
  const clearance = createPlayerViewClearance(masonry);
  clearance.prepare([]);
  for (const [x, y, solid] of [
    [0, 3.45, false],
    [1.26, 1.7, false],
    [1.26, 3, true],
    [0, 3.7, true],
    [1.45, 1.6, true],
  ]) {
    for (const side of [-1, 1]) {
      const ray = new Ray(new Vector3(x, y, -6 + side), new Vector3(0, 0, -side), 2);
      assert.equal(scene.pickWithRay(ray, (m) => masonry.includes(m)).hit, solid);
      assert.equal(clearance.sweep(ray.origin, ray.direction.scale(ray.length), 0.01) < 1, solid);
    }
  }
});

test('the original stacks connect to the nave only through the two designed openings', (t) => {
  const { scene, collisionBoxes, environment } = buildLayout(t, true);
  const player = MeshBuilder.CreateBox('vault walker', { size: 0.5 }, scene);
  player.ellipsoid.set(0.25, 0.84, 0.25);
  player.surroundingMeshes = collisionBoxes;
  function walk(x, z) {
    const dx = x - player.position.x,
      dz = z - player.position.z;
    const steps = Math.ceil(Math.hypot(dx, dz) / 0.07);
    for (let i = 0; i < steps; i++) {
      player.computeWorldMatrix(true);
      player.moveWithCollisions(new Vector3(dx / steps, -0.02, dz / steps));
    }
    return Math.hypot(player.position.x - x, player.position.z - z) < 0.15;
  }
  player.position.set(15.4, 0.86, 8.5);
  assert.equal(walk(15.4, 5.45), false, 'the latch stops a player inside the vault');
  environment.get('vault-shortcut-door').setEnabled(false);
  assert.ok(walk(15.4, 5.45));
  assert.equal(walk(7.3, 5.45), false, 'the nave door is secured until the shortcut opens');
  environment.get('reading-shortcut-door').setEnabled(false);
  assert.ok(walk(7.3, 5.45));
  assert.ok(hasGroundContact(scene, player));
  player.position.set(8, 0.86, 8.84);
  assert.ok(walk(10.1, 8.84));
  assert.ok(walk(11.35, 10.3), 'the crossing into the east wing stays open');
  assert.equal(walk(12.55, 10.3), false, 'the seal closes the east end of the transept');
  environment.get('vault-gate').setEnabled(false);
  assert.ok(walk(12.55, 10.3));
  assert.ok(hasGroundContact(scene, player));
});

test('the curved bridge, west bastion and both grand stair flights can be walked in both directions', (t) => {
  const { scene, collisionBoxes } = buildLayout(t, true);
  const player = MeshBuilder.CreateBox('walker', { size: 0.5 }, scene);
  player.ellipsoid.set(0.25, 0.84, 0.25);
  player.surroundingMeshes = collisionBoxes;
  player.position.copyFrom(citadelArrival);
  const [dx, dy, dz] = citadelPlan.chapterJoin.offset;
  const walk = ([x, y, z]) => {
    const delta = new Vector3(x + dx - player.position.x, 0, z + dz - player.position.z);
    const steps = Math.ceil(delta.length() / 0.05) + 4;
    for (let i = 0; i < steps; i++) {
      player.computeWorldMatrix(true);
      delta.set(x + dx - player.position.x, 0, z + dz - player.position.z);
      if (delta.length() < 0.012) break;
      player.moveWithCollisions(delta.scale(Math.min(1, 0.075 / delta.length())));
      player.moveWithCollisions(new Vector3(0, -0.085, 0));
    }
    assert.ok(
      Math.hypot(player.position.x - x - dx, player.position.z - z - dz) < 0.32,
      `blocked before ${[x, y, z]} at ${player.position}`,
    );
    assert.ok(
      Math.abs(player.position.y - 0.84 - y - dy) < 0.15,
      `unexpected height at ${[x, y, z]}`,
    );
    assert.ok(hasGroundContact(scene, player), `no floor at ${[x, y, z]}`);
  };
  const branch = citadelPlan.westWalk.stations;
  const trades = [
    [-4, 0, 4],
    [-9.5, 0, 3.5],
    [-16, 0, 2.5],
    [-9.5, 0, 3.5],
    [0, 0, 5],
    [9, 0, 8.2],
    [14, 0, 8.4],
    [22, 0, 8.5],
    [14, 0, 8.4],
    [8, 0, 8.2],
    [0, 0, 5],
  ];
  const wings = [
    [0, 4.5, 34],
    [-15.5, 4.5, 34],
    [-15.5, 4.5, 45],
    [-15.5, 4.5, 34],
    [0, 4.5, 34],
    [15.5, 4.5, 34],
    [15.5, 4.5, 45],
    [15.5, 4.5, 34],
    [0, 4.5, 34],
    [0, 4.5, 35.8],
  ];
  const route = [
    ...citadelPlan.bridge.stations,
    ...trades,
    [-4, 0, 8],
    ...branch,
    [-29, 2, 15],
    ...[...branch].reverse(),
    [-5, 0, 13],
    ...citadelPlan.stairs.stations,
    ...wings,
  ];
  for (const mark of [...route, ...route.slice(0, -1).reverse(), citadelPlan.arrival.spawn])
    walk(mark);
  assert.ok(citadelLookoutBounds[0][0] < -29 && citadelLookoutBounds[0][1] > -29);
});

test('each recovered memory changes its district and checkpoint restoration can rewind the castle', (t) => {
  const { scene, citadel } = buildLayout(t, true);
  const visible = (id) =>
    scene.meshes.filter((m) => m.name.endsWith(' · ' + id)).every((m) => m.isEnabled());
  for (const stage of [0, 1, 2, 3, 4, 5, 2, 0]) {
    citadel.restore(stage, true);
    assert.equal(citadel.snapshot().litWindows.length, stage);
    assert.equal(citadel.snapshot().hoist, stage >= 4 ? 1 : 0);
    for (const [id, minimum] of [
      ['sheets', 2],
      ['volumes', 3],
      ['crest', 5],
    ]) {
      assert.ok(scene.meshes.some((m) => m.name.endsWith(' · ' + id)));
      assert.equal(visible(id), stage >= minimum);
    }
  }
  citadel.restore(4);
  citadel.update(0.5);
  assert.ok(citadel.snapshot().hoist > 0 && citadel.snapshot().hoist < 1);
});

test('the terrace cliff presents front faces across both sides of the stair inlet', (t) => {
  const { scene } = buildLayout(t, true);
  const cliffs = scene.meshes.filter((m) => m.name === 'grand stair and upper terrace · basalt');
  // A culled (back-facing) triangle must not satisfy the ray check.
  for (const x of [-9, -6, 0, 6, 9]) {
    for (const y of [-1, -3, -5]) {
      const ray = new Ray(new Vector3(x, y, -21), new Vector3(0, 0, 1), 20);
      const hit = scene.pickWithRay(
        ray,
        (m) => cliffs.includes(m),
        false,
        (a, b, c, r) => Vector3.Dot(Vector3.Cross(b.subtract(a), c.subtract(a)), r.direction) > 0,
      );
      assert.ok(hit.hit, `missing outward cliff at ${x}, ${y}`);
    }
  }
  assert.ok(cliffs.every((m) => m.getVerticesData('position').length && m.getIndices().length));
});

test('the western facade blocks incoming light without receiving the interior window beam', (t) => {
  const { scene, environment } = buildLayout(t);
  const wall = level.zones.readingRoom.find(({ id }) => id === 'reading-wall-west');
  const pieces = environment.parts(wall.id);
  const facade = pieces.filter((mesh) => mesh.metadata.lightingZone === 'ramparts');
  assert.ok(facade.length > 0);
  for (const face of facade) {
    assert.equal(face.checkCollisions, false);
    face.computeWorldMatrix(true);
    const { minimumWorld, maximumWorld } = face.getBoundingInfo().boundingBox;
    assert.ok(Math.abs(minimumWorld.x - wall.bounds[0][0]) < 1e-6);
    assert.ok(Math.abs(minimumWorld.x - maximumWorld.x) < 1e-6);
  }
  const { light, assignSurfaces } = createOpeningLight(scene, wall);
  const architecture = new Set([...pieces, ...environment.parts('reading-window')]);
  assignSurfaces(scene.meshes, architecture, new Set(), environment.get('reading-floor'));
  const map = light.getShadowGenerator().getShadowMap();
  assert.ok(facade.some((face) => map.renderList.includes(face)));
  assert.ok(facade.every((face) => !light.includedOnlyMeshes.includes(face)));
  assert.ok(
    light.includedOnlyMeshes.some((mesh) =>
      mesh.name.startsWith('reading room floor · light tile'),
    ),
  );
});

test('lighting tiles keep the original floor collision and continuous texture coordinates', (t) => {
  const { scene, environment, collisionBoxes } = buildLayout(t);
  const floor = environment.get('reading-floor');
  const tiles = scene.meshes.filter((mesh) =>
    mesh.name.startsWith('reading room floor · light tile'),
  );
  assert.equal(floor.isVisible, false);
  assert.ok(collisionBoxes.includes(floor));
  assert.equal(tiles.length, 24);
  for (const tile of tiles) {
    assert.equal(tile.checkCollisions, false);
    assert.equal(tile.material, floor.material);
    const positions = tile.getVerticesData('position');
    const uv = tile.getVerticesData('uv');
    for (let vertex = 0; vertex < uv.length / 2; vertex++) {
      const x = tile.position.x + positions[3 * vertex];
      const z = tile.position.z + positions[3 * vertex + 2];
      assert.ok(Math.abs(uv[2 * vertex] - (x + 8.25) / 16.5) < 1e-6);
      assert.ok(Math.abs(uv[2 * vertex + 1] - (z + 6.125) / 13.05) < 1e-6);
    }
  }
});

test('the great library pitched roof covers the ceiling of the nave', (t) => {
  const { environment, scene } = buildLayout(t, true);
  const ray = new Ray(new Vector3(3.2, 1.57, -3.1), Vector3.Up());
  const ceiling = ray.intersectsMesh(environment.get('reading-ceiling'));
  const roof = scene.pickWithRay(ray, (mesh) => mesh.name === 'great library · roof');
  assert.ok(ceiling.hit && roof.hit);
  assert.ok(roof.distance > ceiling.distance);
});

test('portable environment data resolves the same bookcase asset across both rooms', () => {
  const bookcases = Object.values(level.zones)
    .flat()
    .filter((placement) => placement.prefab === 'folio-bookcase');
  assert.equal(bookcases.length, 10);
  assert.equal(
    catalog.prefabs['folio-bookcase'].model.path,
    'assets/chapter-art/folio-bookcase.glb',
  );
  for (const { model } of Object.values(catalog.prefabs)) {
    if (model)
      assert.ok(existsSync(new URL('../../../public/' + model.path, import.meta.url)), model.path);
  }
});

test('a wall can have a window and an overlapping floor-level opening', () => {
  const sections = wallSections({
    id: 'test-wall',
    openingAxis: 'x',
    bounds: [
      [0, 8],
      [0, 4],
      [10, 10.25],
    ],
    openings: [
      { span: [1, 4], height: [1, 3] },
      { span: [3, 5], height: [0, 2] },
    ],
  });
  const solid = (x, y) =>
    sections.some(
      ([[left, right], [bottom, top]]) => x > left && x < right && y > bottom && y < top,
    );
  assert.ok(sections.every(([, , thickness]) => thickness[0] === 10 && thickness[1] === 10.25));
  assert.equal(solid(2, 0.5), true, 'the window keeps its sill');
  assert.equal(solid(2, 2), false, 'the window is open');
  assert.equal(solid(3.5, 1.5), false, 'the overlapping area stays open');
  assert.equal(solid(4.5, 0.5), false, 'the doorway starts at the floor');
  assert.equal(solid(4.5, 3.5), true, 'the wall above the doorway remains');
  const area = sections.reduce(
    (total, [[left, right], [bottom, top]]) => total + (right - left) * (top - bottom),
    0,
  );
  assert.equal(area, 23, 'each part of the combined opening is subtracted only once');
});

test('wall authoring rejects invalid rectangles before generating geometry', () => {
  const wall = {
    id: 'test-wall',
    openingAxis: 'z',
    bounds: [
      [0, 0.25],
      [0, 4],
      [-3, 3],
    ],
  };
  assert.throws(
    () => wallSections({ ...wall, openingAxis: 'y', openings: [] }),
    /x\/z openingAxis/,
  );
  assert.throws(
    () => wallSections({ ...wall, openings: [{ span: [-4, 1], height: [0, 2] }] }),
    /opening 1 must fit/,
  );
  assert.throws(
    () => wallSections({ ...wall, openings: [{ span: [-1, 1], height: [2, 2] }] }),
    /opening 1 must fit/,
  );
  assert.throws(
    () => wallSections({ ...wall, openings: [{ span: [-3, 3], height: [0, 4] }] }),
    /entire wall/,
  );
});
