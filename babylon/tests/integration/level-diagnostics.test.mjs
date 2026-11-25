import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { findSurfaceOverlaps } from '../../src/levels/surface-overlaps.ts';
import { createWarningHistory } from '../../src/levels/level-diagnostics.ts';

test('coincident ceiling and turret undersides warn; touching between solid pieces does not', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  function box(id, size, center) {
    const [width, height, depth] = size;
    const mesh = MeshBuilder.CreateBox(id, { width, height, depth }, scene);
    mesh.position.set(...center);
    mesh.metadata = { levelPlacement: { id, zone: 'castle', part: 1 } };
    return mesh;
  }
  const ceiling = box('ceiling', [8.85, 0.08, 12.675], [0, 4.02, 0]);
  const tower = box('turret', [2.35, 3.2, 2.76], [3.225, 5.58, -3.1]);
  const [warning] = findSurfaceOverlaps([ceiling, tower]);
  assert.equal(warning.code, 'COPLANAR_SURFACES');
  assert.deepEqual(
    warning.objects.map((object) => object.id),
    ['ceiling', 'turret'],
  );
  assert.ok(Math.abs(warning.point[1] - 3.98) < 0.00001);
  assert.ok(warning.area > 1 && warning.separation < 0.00001);

  tower.setEnabled(false);
  assert.deepEqual(findSurfaceOverlaps([ceiling, tower]), []);
  tower.setEnabled(true);
  tower.position.y += 0.08;
  assert.deepEqual(
    findSurfaceOverlaps([ceiling, tower]),
    [],
    'roof and tower touch with opposite faces',
  );

  const left = box('left', [1, 2, 0.2], [-0.5, 1, 0]);
  const right = box('right', [1, 2, 0.2], [0.5, 1, 0]);
  assert.deepEqual(findSurfaceOverlaps([left, right]), [], 'coplanar edges have zero overlap area');
  right.position.x -= 0.08;
  assert.equal(findSurfaceOverlaps([left, right]).length, 1);
});

test('warning history deduplicates object pairs and survives a new session', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const objects = [
    { id: 'ceiling', zone: 'library', part: 1 },
    { id: 'turret', zone: 'castle', part: 1 },
  ];
  const finding = { code: 'COPLANAR_SURFACES', objects, point: [3, 4, 0], area: 1, separation: 0 };
  createWarningHistory(storage, () => 'first').record('chapter-1', [finding]);
  const reopened = createWarningHistory(storage, () => 'second');
  reopened.record('chapter-1', [{ ...finding, objects: [...objects].reverse() }]);
  const [entry] = reopened.list();
  assert.equal(reopened.list().length, 1);
  assert.equal(entry.occurrences, 2);
  assert.equal(entry.firstSeen, 'first');
  assert.equal(entry.lastSeen, 'second');
  assert.deepEqual(createWarningHistory(storage).list(), [entry]);
});
