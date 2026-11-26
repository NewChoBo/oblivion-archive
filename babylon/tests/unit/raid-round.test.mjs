import assert from 'node:assert/strict';
import test from 'node:test';
import { RaidRound, raidSeats, isRaidRoster } from '../../src/game/raid/raid-round.ts';

const players = [8, 12, 20, 25].map((actor) => ({ actor, preference: 'jade' }));
test('two to four players alternate teams and each runner is assigned once', () => {
  for (const count of [2, 3, 4]) {
    const seats = raidSeats(players.slice(0, count).reverse());
    const round = new RaidRound(seats);
    assert.deepEqual(
      seats.map((s) => round.slot(s.actor)),
      [0, 2, 1, 3].slice(0, count),
    );
    assert.equal(seats[0].hero, 'jade');
    assert.equal(new Set(round.match.runners.map((r) => r.hero)).size, 4);
  }
  for (const roster of [
    [],
    players.slice(0, 1),
    [...players, players[0]],
    [
      { actor: 3, hero: 'jade' },
      { actor: 3, hero: 'hammer' },
    ],
  ]) {
    assert.equal(isRaidRoster(roster), false);
  }
});
test('the host binds input to the sender and a guest reproduces the same complete match with bots', () => {
  const seats = raidSeats(players.slice(0, 2));
  const host = new RaidRound(seats),
    guest = new RaidRound(seats);
  const move = { seq: 1, action: 'move', payload: { side: -0.75, brake: 0.5 }, slot: 0 };
  assert.equal(host.enqueue(300, move), false);
  assert.equal(host.enqueue(12, move), true);
  assert.equal(host.enqueue(12, move), false);
  assert.equal(host.enqueue(12, { seq: 2, action: 'cast', payload: { skill: 99 } }), true);
  const first = host.advance(1);
  assert.equal(first.frames[0].length, 1);
  assert.equal(first.frames[0][0].slot, 2);
  assert.equal(guest.replay(first), true);
  assert.equal(guest.replay(first), false);
  assert.equal(guest.match.runners[2].side, -0.75);
  assert.equal(guest.match.runners[0].side, 0);
  while (!host.match.result)
    assert.equal(guest.replay(JSON.parse(JSON.stringify(host.advance(6)))), true);
  for (const key of ['runners', 'tick', 'damage', 'actions', 'result', 'projectiles'])
    assert.deepEqual(guest.match[key], host.match[key]);
});
