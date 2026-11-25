import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePreferences } from '../../src/platform/browser/preferences.ts';
import { createExperience } from '../../src/app/experience.ts';
import { createLocalSession } from '../../src/app/local-session.ts';
import {
  BAG_LIMIT,
  GEAR,
  STORAGE_LIMIT,
  createExpeditionState,
} from '../../src/expedition/state.ts';

const levelId = 'gothic-arena';
const safe = { defeated: false, contested: false };

test('a paid weapon purchase is authorized only for a connected player in the buy zone during the buy window', () => {
  const { match, armory } = createExperience('deathmatch', levelId);
  let near = false;
  const { dispatch } = createLocalSession({
    expedition: createExpeditionState(),
    inventoryRules: {
      bagLimit: BAG_LIMIT,
      storageLimit: STORAGE_LIMIT,
      gear: GEAR,
      storagePosition: [0, 0, 0],
    },
    readPosition: () => ({ x: 0, z: 0 }),
    arena: { match, armory, canReachWard: () => false, inBuyZone: () => near },
  });
  const buy = (id) => dispatch({ kind: 'experience.buy', payload: { id } });
  assert.equal(buy('guard-rifle').error, 'experience.shop-closed');
  near = true;
  assert.equal(buy('magic-bow').ok, false);
  assert.equal(buy('guard-rifle').ok, true);
  const paid = armory.snapshot();
  assert.equal(paid.id, 'guard-rifle');
  assert.equal(paid.credits, 150);
  assert.equal(buy('guard-rifle').ok, false);
  assert.equal(armory.snapshot().credits, paid.credits);
  assert.equal(buy('ammo').ok, false);
  armory.shoot();
  armory.reload();
  armory.update(2);
  assert.equal(buy('ammo').ok, true);
  assert.equal(armory.snapshot().reserve, paid.reserve);
  assert.equal(armory.snapshot().credits, 30);
  armory.awardElimination();
  assert.equal(armory.snapshot().credits, 330);
  match.advance(25, safe);
  assert.equal(buy('ammo').error, 'experience.shop-closed');
  armory.startRound(false);
  assert.deepEqual(armory.snapshot().owned, ['service-pistol']);
  assert.equal(armory.snapshot().credits, 1130);
});

test('firearm cadence, reloading and transient arena stock prevent free shots and preserve campaign supplies', () => {
  const { armory, match } = createExperience('deathmatch', levelId);
  const storage = new Map();
  const ledger = createExpeditionState({
    getItem: (id) => storage.get(id),
    setItem: (id, value) => storage.set(id, value),
  });
  ledger.newGame();
  const saved = [...storage];
  ledger.beginPractice();
  for (let i = 0; i < 8; i++) {
    assert.equal(armory.shoot().id, 'service-pistol');
    assert.equal(armory.shoot(), undefined);
    armory.update(0.25);
  }
  assert.ok(armory.snapshot().reloadLeft > 0);
  assert.equal(armory.snapshot().loaded, 0);
  armory.update(1.25);
  assert.equal(armory.snapshot().loaded, 8);
  assert.equal(armory.snapshot().reserve, 24);
  ledger.hitPractice(0, 300);
  assert.equal(ledger.enemyHealth(0), 0);
  assert.equal(ledger.snapshot().xp, 0);
  assert.deepEqual([...storage], saved);
  assert.equal(match.advance(1, { ...safe, defeated: true }), 'respawn');
  armory.restock();
  assert.equal(armory.snapshot().reserve, 32);
});

test('an armed site extends the round, uninterrupted defusing ends it and a new round clears the site', () => {
  const { match } = createExperience('bomb', levelId);
  match.advance(79, safe);
  assert.equal(match.interactObjective('invented-site'), false);
  assert.equal(match.interactObjective('site-a'), true);
  assert.equal(match.interactObjective('site-b'), false);
  match.advance(3, { ...safe, defusing: true });
  match.advance(1, safe);
  match.advance(3, { ...safe, defusing: true });
  assert.equal(match.phase, 'playing');
  match.advance(1, { ...safe, defusing: true });
  assert.deepEqual(match.snapshot().result, { won: false, reason: 'defused' });
  assert.equal(match.nextRound(), true);
  assert.equal(match.snapshot().bombSite, null);
  assert.equal(match.interactObjective('site-b'), true);
  match.advance(15, safe);
  assert.deepEqual(match.snapshot().result, { won: true, reason: 'detonated' });
});

test('rescue requires escort and extraction while elimination ends after the finite wave', () => {
  const rescue = createExperience('hostage', levelId).match;
  rescue.advance(1, { ...safe, extracted: true });
  assert.equal(rescue.phase, 'playing');
  assert.equal(rescue.interactObjective('hostage'), true);
  rescue.advance(1, { ...safe, extracted: true });
  assert.equal(rescue.snapshot().result.reason, 'rescued');
  assert.equal(rescue.nextRound(), true);
  assert.equal(rescue.escorting, false);
  rescue.loseHostage();
  assert.deepEqual(rescue.snapshot().result, { won: false, reason: 'hostage-lost' });

  const elimination = createExperience('elimination', levelId).match;
  for (let i = 0; i < elimination.snapshot().enemyTarget; i++) elimination.recordElimination();
  assert.deepEqual(elimination.snapshot().result, { won: true, reason: 'eliminated' });
  assert.equal(elimination.nextRound(), true);
  assert.equal(elimination.snapshot().roundKills, 0);
  elimination.advance(1, { ...safe, defeated: true });
  assert.deepEqual(elimination.snapshot().result, { won: false, reason: 'defeated' });
  assert.equal(createExperience('bomb', 'ink-quarry'), undefined);
});

test('the shop shortcut leaves existing custom controls available', () => {
  const { bindings } = sanitizePreferences({
    version: 9,
    bindings: { view: 'KeyM', inventory: 'KeyB' },
  });
  assert.equal(bindings.view, 'KeyM');
  assert.equal(bindings.inventory, 'KeyB');
  assert.ok(!['KeyM', 'KeyB'].includes(bindings.shop));
});
