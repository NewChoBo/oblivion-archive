import test from 'node:test';
import assert from 'node:assert/strict';
import { createJumpMotor } from '../../src/game/player/jump-motor.ts';
import { sanitizePreferences, DEFAULTS } from '../../src/platform/browser/preferences.ts';
test('jump uses collision contact, rejects air input and lands once', () => {
  const motor = createJumpMotor();
  let y = 0.8484;
  const step = () =>
    motor.step(
      0.01,
      () => y,
      (dy) => {
        y = Math.max(0.8484, y + dy);
      },
    );
  step();
  assert.ok(motor.snapshot().grounded);
  assert.ok(motor.request());
  for (let i = 0; i < 80; i++) {
    step();
    if (i === 20) assert.equal(motor.request(), false);
  }
  assert.equal(motor.snapshot().jumps, 1);
  assert.equal(motor.snapshot().landings, 1);
  assert.ok(motor.snapshot().peak > 0.7 && motor.snapshot().peak < 1);
  assert.equal(y, 0.8484);
});
test('ceiling contact cancels upward speed and pause discards queued input', () => {
  const motor = createJumpMotor();
  let y = 0;
  const step = () =>
    motor.step(
      0.01,
      () => y,
      (dy) => {
        y = Math.max(0, Math.min(0.2, y + dy));
      },
    );
  step();
  motor.request();
  motor.pause();
  step();
  assert.equal(motor.snapshot().jumps, 0);
  motor.request();
  for (let i = 0; i < 80; i++) step();
  assert.ok(motor.snapshot().peak <= 0.2);
  assert.equal(motor.snapshot().landings, 1);
});
test('adding jump preserves older valid bindings and resolves an existing Space assignment', () => {
  const prior = { ...DEFAULTS.bindings, view: 'Space' };
  delete prior.jump;
  const migrated = sanitizePreferences({ version: 1, bindings: prior, sensitivity: 1.5 });
  assert.equal(migrated.bindings.view, 'Space');
  assert.equal(migrated.bindings.jump, 'KeyJ');
  assert.equal(migrated.sensitivity, 1.5);
});
test('a side collision during descent cannot count as a floor landing or admit another jump', () => {
  const motor = createJumpMotor();
  let y = 0.8484,
    onFloor = true;
  motor.step(
    0.01,
    () => y,
    () => {},
    () => onFloor,
  );
  assert.equal(motor.request(), true);
  onFloor = false;
  for (let i = 0; i < 45; i++)
    motor.step(
      0.01,
      () => y,
      (dy) => {
        if (dy > 0) y += dy;
      },
      () => onFloor,
    );
  assert.equal(motor.snapshot().landings, 0);
  assert.equal(motor.snapshot().grounded, false);
  assert.equal(motor.request(), false);
});
