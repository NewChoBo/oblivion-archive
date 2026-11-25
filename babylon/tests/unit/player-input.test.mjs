import assert from 'node:assert/strict';
import test from 'node:test';
import { lookPitch } from '../../src/platform/browser/player-input.ts';

test('look reaches both vertical limits and reverses on the first inward delta', () => {
  const down = lookPitch(0, 4);
  assert.equal(down, Math.PI / 2);
  assert.equal(lookPitch(down, 0.1), down);
  assert.equal(lookPitch(down, -0.04), down - 0.04);
  const up = lookPitch(down, -4);
  assert.equal(up, -Math.PI / 2);
  assert.equal(lookPitch(up, -0.1), up);
  assert.equal(lookPitch(up, 0.04), up + 0.04);
});
