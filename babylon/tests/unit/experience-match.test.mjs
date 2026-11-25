import assert from 'node:assert/strict';
import test from 'node:test';
import { createExperience } from '../../src/app/experience.ts';
import { createLocalSession } from '../../src/app/local-session.ts';
import {
  BAG_LIMIT,
  STORAGE_LIMIT,
  GEAR,
  createExpeditionState,
} from '../../src/expedition/state.ts';

const safe = { defeated: false, contested: false };
const inventoryRules = {
  bagLimit: BAG_LIMIT,
  storageLimit: STORAGE_LIMIT,
  gear: GEAR,
  storagePosition: [0, 0, 0],
};

test('the quarry loads with independent rules for score and ward matches', () => {
  const hunt = createExperience('specter-hunt', 'ink-quarry');
  const wards = createExperience('ward-defense', 'ink-quarry');
  assert.equal(hunt.levelId, wards.levelId);
  assert.equal(hunt.match.snapshot().kind, 'score');
  assert.equal(wards.match.snapshot().kind, 'ward');
  assert.equal(createExperience('constructor', 'ink-quarry'), undefined);
  assert.equal(createExperience('ward-defense', 'invented-level'), undefined);
  const gothicHunt = createExperience('specter-hunt', 'gothic-arena');
  const gothicWards = createExperience('ward-defense', 'gothic-arena');
  assert.deepEqual(gothicHunt.match.snapshot(), hunt.match.snapshot());
  assert.notDeepEqual(gothicWards.level.spawn, wards.level.spawn);
  assert.notDeepEqual(gothicWards.level.wards, wards.level.wards);

  assert.equal(hunt.match.activateWard('west-ward'), false);
  assert.equal(hunt.match.advance(3, { ...safe, defeated: true }), 'respawn');
  assert.equal(hunt.match.snapshot().deaths, 1);
  const { target } = hunt.match.snapshot();
  for (let i = 0; i < target; i++) hunt.match.recordElimination();
  assert.deepEqual(hunt.match.snapshot().result, { won: true, reason: 'score' });
  hunt.match.recordElimination();
  assert.equal(hunt.match.snapshot().kills, target);
  assert.equal(hunt.match.nextRound(), false);
  assert.equal(wards.match.snapshot().phase, 'playing');
});

test('ward contest stops sealing while match time continues and rounds preserve only the tally', () => {
  const { match } = createExperience('ward-defense', 'ink-quarry');
  const initial = match.snapshot();
  assert.equal(match.activateWard('invented-ward'), false);
  assert.equal(match.activateWard('west-ward'), true);
  assert.equal(match.activateWard('east-ward'), false);

  match.advance(initial.holdSeconds / 2, safe);
  const holding = match.snapshot();
  match.advance(2, { ...safe, contested: true });
  assert.equal(match.snapshot().holdLeft, holding.holdLeft);
  assert.equal(match.snapshot().timeLeft, holding.timeLeft - 2);
  assert.equal(match.snapshot().contested, true);
  match.advance(holding.holdLeft, safe);
  assert.equal(match.phase, 'between-rounds');
  assert.deepEqual(match.snapshot().result, { won: true, reason: 'sealed' });
  assert.equal(match.snapshot().wins, 1);

  assert.equal(match.nextRound(), true);
  const roundTwo = match.snapshot();
  assert.equal(roundTwo.round, 2);
  assert.equal(roundTwo.wins, 1);
  assert.equal(roundTwo.ward, null);
  assert.equal(roundTwo.timeLeft, initial.timeLeft);
  assert.equal(match.activateWard('east-ward'), true);
  match.advance(roundTwo.holdSeconds, safe);
  assert.equal(match.phase, 'complete');
  assert.equal(match.snapshot().wins, initial.target);
});

test('ward commands require an authored ward in the connected player’s reach', () => {
  let reachable;
  const ward = createExperience('ward-defense', 'gothic-arena');
  const options = {
    expedition: createExpeditionState(),
    inventoryRules,
    readPosition: () => ({ x: 0, z: 0 }),
  };
  const session = createLocalSession({
    ...options,
    arena: { match: ward.match, canReachWard: (id) => id === reachable },
  });
  const command = (wardId) => ({ kind: 'experience.activate-ward', payload: { wardId } });
  const requestWard = (wardId) => session.dispatch(command(wardId));
  assert.equal(
    createLocalSession(options).dispatch(command('east-ward')).error,
    'session.unknown-command',
  );
  assert.ok(session.dispatch({ kind: 'inventory.select', payload: { slot: 1 } }).ok);
  assert.equal(session.readJournal().selected, 1);
  assert.equal(requestWard('west-ward').ok, false);
  reachable = 'invented-ward';
  assert.equal(requestWard(reachable).ok, false);
  assert.equal(ward.match.snapshot().ward, null);
  reachable = 'east-ward';
  assert.equal(requestWard(reachable).ok, true);
  assert.equal(ward.match.snapshot().ward, reachable);
  assert.equal(requestWard(reachable).ok, false);
  const initial = createExperience('ward-defense', 'gothic-arena').match.snapshot();
  ward.match.advance(initial.holdSeconds, safe);
  assert.equal(ward.match.nextRound(), true);
  assert.equal(requestWard(reachable).ok, true);
  ward.match.advance(initial.holdSeconds, safe);
  assert.equal(ward.match.restart(), true);
  assert.deepEqual(ward.match.snapshot(), initial);
  assert.equal(requestWard(reachable).ok, true);
  assert.equal(session.readJournal().selected, 1);
});

test('a lost life ends a ward round and the deadline ends both kinds of match', () => {
  const { match } = createExperience('ward-defense', 'ink-quarry');
  match.activateWard('west-ward');
  assert.equal(match.advance(match.snapshot().holdSeconds, { ...safe, defeated: true }), undefined);
  assert.equal(match.phase, 'between-rounds');
  assert.deepEqual(match.snapshot().result, { won: false, reason: 'defeated' });
  assert.equal(match.nextRound(), true);
  match.advance(match.snapshot().timeLeft, safe);
  assert.equal(match.phase, 'complete');
  assert.deepEqual(match.snapshot().result, { won: false, reason: 'timeout' });

  const { match: hunt } = createExperience('specter-hunt', 'ink-quarry');
  hunt.advance(hunt.snapshot().timeLeft, safe);
  assert.equal(hunt.phase, 'complete');
  assert.deepEqual(hunt.snapshot().result, { won: false, reason: 'timeout' });
});
