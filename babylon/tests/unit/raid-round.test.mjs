import assert from 'node:assert/strict';
import test from 'node:test';
import { RaidSimulation } from '../../src/game/raid/raid-simulation.ts';
import { RaidMatch } from '../../src/game/raid/raid-match.ts';
import { RaidRound } from '../../src/game/raid/raid-round.ts';
import { isRaidRoster, applyPick, draftMembers } from '../../src/game/raid/raid-draft.ts';

const players = ['jade', 'rend', 'bastion', 'rime'].map((hero, i) => ({
  actor: [8, 12, 20, 25][i],
  hero,
}));
test('two to four players alternate teams and each runner is assigned once', () => {
  for (const count of [2, 3, 4]) {
    const seats = players.slice(0, count);
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
test('the first lock wins, unlocking and leaving free a hero, and a join needs a fresh pick', () => {
  const seats = draftMembers([], [5, 2]);
  assert.equal(isRaidRoster(seats), false);
  assert.ok(applyPick(seats, 5, 'rend'));
  assert.equal(applyPick(seats, 2, 'rend'), false);
  assert.equal(applyPick(seats, 8, 'rime'), false);
  assert.ok(applyPick(seats, 2, 'rime'));
  assert.ok(isRaidRoster(seats));
  assert.ok(applyPick(seats, 5, null));
  assert.equal(isRaidRoster(seats), false);
  const next = draftMembers(seats, [2, 7]);
  assert.deepEqual(next, [
    { actor: 2, hero: 'rime' },
    { actor: 7, hero: null },
  ]);
  assert.ok(applyPick(next, 7, 'rend'));
});
test('each player can fill their own input budget and submit again on the next tick', () => {
  const round = new RaidRound(players);
  const move = (seq) => ({ seq, action: 'move', payload: { side: 0, brake: 0 } });
  for (let seq = 1; seq <= 12; seq++) assert.ok(round.enqueue(8, move(seq)));
  assert.equal(round.enqueue(8, move(13)), false);
  assert.ok(round.enqueue(25, move(1)));
  assert.deepEqual(
    round.advance(2).frames.map((f) => f.length),
    [13, 0],
  );
  assert.ok(round.enqueue(8, move(13)));
});

test('local authority and network replay run the same commands, bots and combat through the result', () => {
  const round = new RaidRound(players.slice(0, 2));
  const local = new RaidSimulation(
    new RaidMatch(round.match.runners.map((r) => r.hero)),
    new Set([0, 2]),
  );
  const guest = new RaidRound(players.slice(0, 2));
  const payload = { side: 0.5, brake: 0 };
  assert.ok(local.dispatch(2, 'move', payload));
  assert.ok(round.enqueue(players[1].actor, { seq: 1, action: 'move', payload }));
  while (!local.match.result) {
    const batch = round.advance(6);
    assert.ok(guest.replay(batch));
    for (const _frame of batch.frames) local.step();
    for (const match of [round.match, guest.match]) {
      assert.equal(match.tick, local.match.tick);
      assert.deepEqual(match.damage, local.match.damage);
      assert.deepEqual(match.runners, local.match.runners);
    }
  }
  assert.deepEqual(guest.match.result, local.match.result);
});

test('the host binds input to the sender and a guest reproduces the same complete match with bots', () => {
  const seats = players.slice(0, 2);
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
