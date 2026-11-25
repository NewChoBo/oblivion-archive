import test from 'node:test';
import assert from 'node:assert/strict';
import { BotNavigation, BotRoute, footprint } from '../../src/game/ai/bot-navigation.ts';
import { BotAttack } from '../../src/game/ai/bot-attack.ts';

test('a bot takes a multi-corner detour through cover without clipping or stalling', () => {
  // A U-shaped dead end requires first moving away from the target.
  const map = new BotNavigation(footprint(0, 0, 14, 14), [
    footprint(0, 1, 4, 0.5),
    footprint(-1.75, -1.25, 0.5, 4.5),
    footprint(1.75, -1.25, 0.5, 4.5),
  ]);
  const position = { x: 0, z: 0 },
    target = { x: 0, z: 3 };
  const route = new BotRoute();
  let lowest = 0;
  for (let i = 0; i < 400; i++) {
    const previous = { ...position };
    route.advance(map, position, target, 0.06);
    // Full segments can turn at a waypoint during one frame.
    assert.ok(map.clear(position, position));
    assert.ok(Math.hypot(position.x - previous.x, position.z - previous.z) <= 0.060001);
    lowest = Math.min(lowest, position.z);
  }
  assert.ok(lowest < -3.5);
  assert.deepEqual(position, target);
});

test('a disconnected destination cannot pull a bot through a wall, even on a slow frame', () => {
  const map = new BotNavigation(footprint(0, 0, 10, 10), [footprint(0, 0, 1, 10)]);
  const route = new BotRoute(),
    position = { x: -2, z: 0 };
  assert.equal(route.advance(map, position, { x: 2, z: 0 }, 15), 0);
  assert.deepEqual(position, { x: -2, z: 0 });
  assert.equal(route.advance(map, position, { x: -2, z: 1 }, 15), 1);
  route.advance(map, position, { x: -0.52, z: 0 }, 15);
  assert.ok(position.x < -0.85 && map.clear(position, position));
});

test('both melee and ranged attacks telegraph, impact once and recover', () => {
  for (const kind of ['melee', 'ranged']) {
    for (const frame of [0.01, 0.065, 0.16]) {
      const attack = new BotAttack(kind, 1.65);
      assert.equal(attack.advance(frame, true, false), false);
      assert.equal(attack.pose().phase, 'windup');
      let hits = 0;
      for (let elapsed = frame; elapsed < 1.55; elapsed += frame) {
        if (attack.advance(frame, true, false)) {
          hits++;
          assert.equal(attack.pose().phase, 'recovery');
        }
      }
      assert.equal(hits, 1);
    }
  }
});

test('taking cover before impact or stunning a winding-up bot prevents damage', () => {
  const attack = new BotAttack('ranged', 1.65);
  attack.advance(0.3, true, false);
  assert.equal(attack.advance(0.16, false, false), false);
  assert.equal(attack.pose().phase, 'recovery');
  assert.equal(attack.advance(0.2, true, false), false);
  attack.reset();
  attack.advance(0.3, true, false);
  assert.equal(attack.advance(0.16, true, true), false);
  assert.equal(attack.pose().phase, 'ready');
  assert.equal(attack.advance(0.2, true, false), false);
  attack.reset(1.2);
  assert.equal(attack.advance(1, true, false), false);
  assert.equal(attack.pose().phase, 'ready');
});
