import test from 'node:test';
import assert from 'node:assert/strict';
import { wandStroke, WAND_INTERVAL, WAND_RELEASE } from '../../src/game/combat/wand-stroke.ts';

test('a wand stroke passes through the target at release, then follows through and settles', () => {
  const rest = { sweep: 0, lift: 0, alignment: 0 };
  assert.deepEqual(wandStroke(Infinity, 1), rest);
  const lift = wandStroke(WAND_RELEASE / 2, 1);
  assert.ok(lift.lift > 0 && lift.sweep > 0 && lift.alignment < 1);
  assert.equal(wandStroke(WAND_RELEASE, 1).alignment, 1);
  const finish = wandStroke(0.16, 1);
  assert.ok(finish.sweep < 0 && finish.lift < 0);
  const reverse = wandStroke(0.16, -1);
  assert.equal(reverse.sweep, -finish.sweep);
  assert.equal(reverse.alignment, finish.alignment);
  assert.deepEqual(wandStroke(WAND_INTERVAL, 1), rest);
});
