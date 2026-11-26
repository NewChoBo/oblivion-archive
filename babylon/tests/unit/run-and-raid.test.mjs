import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RaidMatch,
  HEROES,
  HERO_IDS,
  RESPAWN_TICKS,
  ROUND_TICKS,
  WAGON,
  WAGON_HP,
} from '../../src/game/raid/raid-match.ts';
import { createRaidFeature } from '../../src/game/raid/raid-feature.ts';
import { driveRaidBots } from '../../src/game/raid/raid-bots.ts';
import { GameSession } from '../../src/game/session/game-session.ts';

function advance(match, ticks) {
  for (let i = 0; i < ticks; i++) match.step();
}
function battle(hero) {
  const match = new RaidMatch(hero);
  const session = new GameSession([createRaidFeature(match)]);
  for (const r of match.runners) session.addPlayer(String(r.slot), { slot: r.slot });
  const send = (slot, action, payload) =>
    session.dispatch(String(slot), { kind: 'raid.' + action, payload }).ok;
  return { match, send };
}
test('each team fields two runners and all four heroes are distinct', () => {
  for (const hero of HERO_IDS) {
    const { runners } = new RaidMatch(hero);
    assert.equal(runners[0].hero, hero);
    assert.equal(new Set(runners.map((r) => r.hero)).size, 4);
    assert.deepEqual(
      runners.map((r) => r.team),
      [0, 0, 1, 1],
    );
  }
});
test('only connected runners can lock an opponent and spend a ready, in-range skill', () => {
  const { match, send } = battle();
  assert.equal(send(9, 'jump'), false);
  assert.equal(send(0, 'lock', 1), false);
  assert.equal(send(0, 'cast', { skill: 2, x: Infinity, z: 0 }), false);
  assert.equal(send(0, 'cast', { skill: 2, x: 0, z: -30 }), false);
  assert.equal(send(0, 'cast', { skill: 3 }), false);
  assert.equal(send(0, 'cast', { skill: 2, ...WAGON, slot: 2 }), true);
  assert.equal(send(0, 'cast', { skill: 2, ...WAGON }), false);
  match.step();
  assert.ok(match.damage[0] > 0);
  assert.equal(match.damage[1], 0);
});
test('a rejected aimed Bolt preserves the current lock and spends no additional cooldown', () => {
  const { match, send } = battle();
  const runner = match.runners[0];
  for (const target of [1, 9, 2.5]) {
    assert.equal(send(0, 'cast', { skill: 1, target }), false);
    assert.equal(runner.target, 'wagon');
    assert.equal(runner.cooldowns[1], 0);
  }
  assert.ok(send(0, 'cast', { skill: 1, target: 2 }));
  const cooldown = runner.cooldowns[1];
  assert.ok(cooldown > 0);
  assert.equal(send(0, 'cast', { skill: 1, target: 3 }), false);
  assert.equal(runner.target, 2);
  assert.equal(runner.cooldowns[1], cooldown);
  match.step();
  assert.equal(match.runners[2].hp, HEROES.longshot.hp - 36);
  assert.equal(match.runners[3].hp, HEROES.jade.hp);
  assert.equal(match.damage[0], 0);
});
test('walking drops behind the pack, running closes with the wagon and attacks it automatically', () => {
  const { match, send } = battle();
  send(0, 'move', { side: -1, walk: true });
  advance(match, 100);
  assert.ok(match.runners[0].z < 0);
  assert.ok(match.runners[0].x < -1.6);
  send(0, 'move', { side: 1, walk: false });
  advance(match, 30);
  send(0, 'move', { side: 0, walk: false });
  advance(match, 170);
  assert.ok(match.runners[0].z > 7);
  assert.ok(match.damage[0] > 0);
});
test('the warned wagon lane can be avoided by jumping or sidestepping', () => {
  function hit(mode) {
    const { match, send } = battle();
    advance(match, 60);
    assert.equal(match.hazard.x, match.runners[0].x);
    if (mode === 'side') send(0, 'move', { side: -1, walk: false });
    advance(match, 18);
    if (mode === 'jump') {
      assert.ok(send(0, 'jump'));
      assert.equal(send(0, 'jump'), false);
    }
    const before = match.runners[0].hp;
    advance(match, 12);
    return before - match.runners[0].hp;
  }
  assert.ok(hit('stand') > 0);
  assert.equal(hit('jump'), 0);
  assert.equal(hit('side'), 0);
});
test('PvP earns rage and a knockout, then the defeated runner rejoins behind the wagon', () => {
  const { match, send } = battle();
  const victim = match.runners[2];
  for (const slot of [0, 1]) {
    send(slot, 'lock', 2);
    send(slot, 'cast', { skill: 1 });
    send(slot, 'cast', { skill: 2, x: victim.x, z: victim.z });
  }
  match.step();
  assert.equal(match.result, null);
  assert.equal(victim.hp, 0);
  assert.ok(victim.rage > 0);
  assert.deepEqual(match.damage, [0, 0]);
  assert.equal(match.runners[0].kills + match.runners[1].kills, 1);
  assert.equal(victim.deaths, 1);
  assert.equal(match.runners[0].assists + match.runners[1].assists, 1);
  assert.equal(send(2, 'jump'), false);
  advance(match, RESPAWN_TICKS);
  assert.equal(victim.respawn, 0);
  assert.equal(victim.hp, HEROES[victim.hero].hp);
  assert.ok(victim.z < 0);
});
test('opposing hits unlock one ultimate and attacking the wagon spends the charge', () => {
  const { match, send } = battle();
  const player = match.runners[0];
  assert.equal(player.rage, 0);
  assert.equal(send(0, 'cast', { skill: 3 }), false);
  for (const rival of [2, 3]) {
    send(rival, 'lock', 0);
    send(rival, 'cast', { skill: 1 });
    send(rival, 'cast', { skill: 2, x: player.x, z: player.z });
    match.step();
    if (rival === 2) {
      assert.ok(player.rage > 0 && player.rage < 100);
      assert.equal(send(0, 'cast', { skill: 3 }), false);
    }
  }
  assert.equal(player.rage, 100);
  assert.ok(player.hp > 0);
  assert.equal(send(0, 'cast', { skill: 3 }), true);
  assert.equal(player.rage, 0);
  assert.equal(send(0, 'cast', { skill: 3 }), false);
  match.step();
  assert.ok(match.damage[0] > 0);
});
test('Abyss can silence and slow a runner and Jade can shield a wounded partner', () => {
  const { match, send } = battle('jade');
  assert.equal(send(0, 'cast', { skill: 0, ally: 3 }), false);
  const ally = match.runners[1];
  const abyss = match.runners.find((r) => r.hero === 'abyss');
  send(abyss.slot, 'lock', 1);
  send(abyss.slot, 'cast', { skill: 1 });
  send(abyss.slot, 'cast', { skill: 2, x: ally.x, z: ally.z });
  match.step();
  assert.ok(ally.silenced && ally.slowed);
  assert.equal(send(1, 'cast', { skill: 0 }), false);
  send(0, 'cast', { skill: 0 });
  assert.ok(ally.shield > 0);
  advance(match, 25);
  assert.equal(send(1, 'cast', { skill: 0 }), true);
});
test('holding both teams back ends the full three minutes on wagon damage, including an exact tie', () => {
  for (const scored of [true, false]) {
    const { match, send } = battle();
    if (scored) send(0, 'cast', { skill: 1 });
    for (let i = 0; i < ROUND_TICKS; i++) {
      for (const r of match.runners)
        send(r.slot, 'move', { side: r.team === 0 ? -1 : 1, walk: true });
      match.step();
      if (i < ROUND_TICKS - 1) assert.equal(match.result, null);
    }
    assert.deepEqual(match.result, { reason: 'time', winner: scored ? 0 : 'draw' });
  }
});
test('a bot-assisted round can destroy the wagon early and the result freezes the session', () => {
  const { match, send } = battle();
  for (let i = 0; i < ROUND_TICKS && !match.result; i++) {
    driveRaidBots(match, send);
    send(0, 'cast', { skill: 1 });
    send(0, 'cast', { skill: 2, ...WAGON });
    match.step();
  }
  assert.equal(match.result.reason, 'destruction');
  assert.ok(match.tick < ROUND_TICKS);
  assert.ok(match.damage[match.result.winner] >= WAGON_HP);
  const finished = JSON.stringify([match.tick, match.damage, match.runners]);
  assert.equal(send(0, 'jump'), false);
  advance(match, 90);
  assert.equal(JSON.stringify([match.tick, match.damage, match.runners]), finished);
});
