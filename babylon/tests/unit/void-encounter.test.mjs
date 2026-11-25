import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoidEncounter } from '../../src/game/chapter/void-encounter.ts';

const bounds = [
  [-10.65, -3.8],
  [-0.34, 0],
  [7.4, 12.5],
];
const deck = { x: -7.6, y: 0.86, z: 10 };
const library = { x: 0, y: 0.86, z: 0 };
const west = -Math.PI / 2;

test('the presence starts after a sustained look into space from the lookout', () => {
  const starts = [];
  const encounter = createVoidEncounter(bounds, {
    show() {},
    onStart: (duration) => starts.push(duration),
  });
  encounter.update(2, library, west, 0);
  encounter.update(2, deck, 0, 0);
  encounter.update(0.6, deck, west, 0);
  encounter.update(0.1, deck, west, Math.PI / 2);
  encounter.update(0.6, deck, west, 0);
  assert.equal(encounter.snapshot().state, 'waiting');
  assert.equal(starts.length, 0);
  encounter.update(0.4, deck, west, 0);
  assert.equal(encounter.snapshot().state, 'crossing');
  assert.deepEqual(starts, [10]);
});

test('the crossing moves through the sky, fades, then re-arms on a new visit', () => {
  let silhouette,
    starts = 0;
  const encounter = createVoidEncounter(bounds, {
    show: (yaw, elevation, opacity) => {
      silhouette = { yaw, elevation, opacity };
    },
    onStart: () => starts++,
  });
  encounter.update(0.9, deck, west, 0);
  const first = silhouette;
  assert.ok(first.opacity > 0 && first.opacity < 0.97);
  encounter.update(4, deck, 0, 0);
  assert.ok(silhouette.yaw < first.yaw);
  assert.equal(silhouette.opacity, 0.97);
  encounter.update(6, deck, west, 0);
  assert.equal(silhouette.opacity, 0);
  assert.equal(encounter.snapshot().state, 'seen');
  encounter.update(2, deck, west, 0);
  assert.equal(starts, 1);
  encounter.update(0.1, library, west, 0);
  encounter.update(0.9, deck, west, 0);
  assert.equal(starts, 2);
  encounter.reset();
  assert.equal(silhouette.opacity, 0);
  assert.equal(encounter.snapshot().state, 'waiting');
});
