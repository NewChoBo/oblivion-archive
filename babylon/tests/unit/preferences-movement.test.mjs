import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  rebind,
  sanitizePreferences,
  createPreferences,
  STORAGE_KEY,
} from '../../src/platform/browser/preferences.ts';
import {
  createPlanarMotor,
  movementIntent,
  movementSteps,
  WALK_SPEED,
  SPRINT_SPEED,
} from '../../src/platform/babylon/player/movement.ts';
import { POSTURES } from '../../src/platform/babylon/player/player-posture.ts';
test('new bags default to Tab while saved I bindings survive and Tab stays reserved for inventory', () => {
  assert.equal(sanitizePreferences(null).bindings.inventory, 'Tab');
  const old = sanitizePreferences({
    version: 8,
    bindings: { ...DEFAULTS.bindings, inventory: 'KeyI' },
  });
  assert.equal(old.bindings.inventory, 'KeyI');
  assert.equal(rebind(old, 'jump', 'Tab').error, 'reserved');
  assert.equal(rebind(old, 'inventory', 'Tab').value.bindings.inventory, 'Tab');
});
test('adding the journal preserves an older I binding and assigns an unused journal key', () => {
  const bindings = { ...DEFAULTS.bindings, interact: 'KeyI', view: 'KeyB' };
  delete bindings.inventory;
  const settings = sanitizePreferences({ version: 3, bindings });
  assert.equal(settings.bindings.interact, 'KeyI');
  assert.equal(settings.bindings.view, 'KeyB');
  assert.equal(
    new Set(Object.values(settings.bindings)).size,
    Object.keys(DEFAULTS.bindings).length,
  );
  assert.equal(rebind(settings, 'inventory', 'KeyI').error, 'conflict');
  const partial = sanitizePreferences({ bindings: { interact: 'KeyI', view: 'KeyB' } });
  assert.equal(partial.bindings.interact, 'KeyI');
  assert.equal(partial.bindings.left, 'KeyA');
  assert.notEqual(partial.bindings.inventory, 'KeyA');
});
test('older settings default to right-handed and the chosen hand persists until reset', () => {
  const values = new Map([[STORAGE_KEY, JSON.stringify({ version: 2, sensitivity: 1.7 })]]);
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const prefs = createPreferences(storage);
  assert.equal(prefs.get().dominantHand, 'right');
  prefs.set({ ...prefs.get(), dominantHand: 'left' });
  const loaded = createPreferences(storage);
  assert.equal(loaded.get().dominantHand, 'left');
  assert.equal(loaded.get().sensitivity, 1.7);
  assert.equal(sanitizePreferences({ dominantHand: 'unknown' }).dominantHand, 'right');
  loaded.reset();
  assert.equal(loaded.get().dominantHand, 'right');
});
test('camera shoulder persists independently of handedness in old and new saves', () => {
  const values = new Map([[STORAGE_KEY, JSON.stringify({ version: 7, dominantHand: 'left' })]]);
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const prefs = createPreferences(storage);
  assert.equal(prefs.get().cameraShoulder, DEFAULTS.cameraShoulder);
  for (const side of ['right', 'center', 'left']) {
    prefs.set({ ...prefs.get(), cameraShoulder: side });
    assert.equal(prefs.get().dominantHand, 'left');
    prefs.set({ ...prefs.get(), dominantHand: 'right' });
    assert.equal(createPreferences(storage).get().cameraShoulder, side);
    prefs.set({ ...prefs.get(), dominantHand: 'left' });
  }
  assert.equal(
    sanitizePreferences({ cameraShoulder: 'unknown' }).cameraShoulder,
    DEFAULTS.cameraShoulder,
  );
});
test('the new torch key does not replace an older custom Digit3 binding', () => {
  const bindings = { ...DEFAULTS.bindings, interact: 'Digit3', view: 'KeyM' };
  delete bindings.tool3;
  const migrated = sanitizePreferences({ version: 4, bindings });
  assert.equal(migrated.bindings.interact, 'Digit3');
  assert.equal(migrated.bindings.view, 'KeyM');
  assert.equal(migrated.bindings.tool3, 'KeyT');
});
test('performance information is opt-in and the saved choice survives reload', () => {
  const values = new Map([[STORAGE_KEY, JSON.stringify({ version: 5, pointerLock: false })]]);
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const preferences = createPreferences(storage);
  assert.equal(preferences.get().showPerformance, false);
  preferences.set({ ...preferences.get(), showPerformance: true });
  const reopened = createPreferences(storage);
  assert.equal(reopened.get().showPerformance, true);
  assert.equal(reopened.get().pointerLock, false);
  reopened.reset();
  assert.equal(reopened.get().showPerformance, false);
});

test('frame limit defaults to unlimited and saves a whole number from 30 to 300', () => {
  const values = new Map([[STORAGE_KEY, JSON.stringify({ version: 6, sensitivity: 1.7 })]]);
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const preferences = createPreferences(storage);
  assert.equal(preferences.get().fpsLimit, null);
  preferences.set({ ...preferences.get(), fpsLimit: 137.4 });
  const reloaded = createPreferences(storage);
  assert.equal(reloaded.get().fpsLimit, 137);
  assert.equal(reloaded.get().sensitivity, 1.7);
  assert.equal(sanitizePreferences({ fpsLimit: 1 }).fpsLimit, 30);
  assert.equal(sanitizePreferences({ fpsLimit: 600 }).fpsLimit, 300);
  assert.equal(sanitizePreferences({ fpsLimit: '60' }).fpsLimit, null);
  reloaded.set({ ...reloaded.get(), fpsLimit: null });
  assert.equal(createPreferences(storage).get().fpsLimit, null);
});

test('shadow quality persists and older or invalid preferences fall back to balanced', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const settings = createPreferences(storage);
  assert.equal(settings.get().shadowQuality, 'balanced');
  settings.set({ ...settings.get(), shadowQuality: 'sharp' });
  assert.equal(createPreferences(storage).get().shadowQuality, 'sharp');
  assert.equal(sanitizePreferences({ shadowQuality: 'invalid' }).shadowQuality, 'balanced');
});
test('the first step builds speed and braking distance is independent of collision substeps', () => {
  const sprint = { x: 0, z: 5, speed: 5 },
    stop = { x: 0, z: 0, speed: 0 };
  for (const steps of [1, 8, 32]) {
    const motor = createPlanarMotor();
    assert.ok(motor.displace(sprint, 0.025).z < 5 * 0.025);
    motor.displace(sprint, 0.5);
    assert.equal(motor.displace(sprint, 0.1).z, 0.5);
    let distance = 0;
    for (let i = 0; i < steps; i++) distance += motor.displace(stop, 0.25 / steps).z;
    assert.ok(Math.abs(distance - 25 / (2 * 44)) < 1e-8);
    motor.displace(sprint, 0.3);
    motor.reset();
    assert.equal(motor.displace(stop, 0.1).z, 0);
  }
});
test('key conflicts preserve both existing bindings; a valid rebind and sensitivity survive reload', () => {
  const values = new Map(),
    storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) },
    p = createPreferences(storage);
  assert.equal(rebind(p.get(), 'view', 'KeyE').error, 'conflict');
  assert.equal(p.get().bindings.interact, 'KeyE');
  p.set({ ...rebind(p.get(), 'view', 'KeyB').value, sensitivity: 1.7 });
  const loaded = createPreferences(storage);
  assert.equal(loaded.get().bindings.view, 'KeyB');
  assert.equal(loaded.get().sensitivity, 1.7);
  loaded.reset();
  assert.deepEqual(JSON.parse(values.get(STORAGE_KEY)), DEFAULTS);
  assert.deepEqual(
    sanitizePreferences({ bindings: { forward: 'Escape' } }).bindings,
    DEFAULTS.bindings,
  );
});
test('run is held, diagonal speed is normalized and camera-relative motion is shared', () => {
  const held = new Set(['forward']),
    input = { down: (key) => held.has(key) };
  assert.equal(movementIntent(input, 0).speed, WALK_SPEED);
  held.add('sprint');
  assert.equal(movementIntent(input, 0).speed, SPRINT_SPEED);
  held.add('right');
  const diagonal = movementIntent(input, 0);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - SPRINT_SPEED) < 1e-8);
  held.delete('sprint');
  assert.equal(movementIntent(input, 0).speed, WALK_SPEED);
  held.delete('right');
  assert.ok(Math.abs(movementIntent(input, Math.PI / 2).x - WALK_SPEED) < 1e-8);
});
test('a slow visible frame keeps elapsed travel while collision steps remain small', () => {
  const slow = movementSteps(0.4);
  assert.equal(slow.elapsed, 0.4);
  assert.ok(slow.step <= 0.025);
  assert.equal(slow.step * slow.count, 0.4);
  assert.equal(movementSteps(9).elapsed, 1);
});
test('new posture shortcuts preserve occupied keys and lower stances do not sprint', () => {
  const migrated = sanitizePreferences({
    version: 5,
    bindings: { view: 'KeyC', interact: 'KeyZ' },
  });
  assert.equal(migrated.bindings.view, 'KeyC');
  assert.equal(migrated.bindings.interact, 'KeyZ');
  assert.equal(migrated.bindings.crouch, 'KeyX');
  assert.equal(migrated.bindings.prone, 'KeyG');
  const input = { down: (id) => ['forward', 'right', 'sprint'].includes(id) };
  for (const posture of ['crouch', 'prone']) {
    const intent = movementIntent(input, Math.PI / 3, posture);
    assert.equal(intent.running, false);
    assert.ok(Math.abs(Math.hypot(intent.x, intent.z) - POSTURES[posture].speed) < 1e-8);
  }
});
