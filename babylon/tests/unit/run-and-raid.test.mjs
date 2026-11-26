import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RaidMatch,
  HEROES,
  HERO_IDS,
  RAID_HZ,
  raidRoadTravel,
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
function battle(hero, playerAspect) {
  const match = new RaidMatch(hero, playerAspect);
  const session = new GameSession([createRaidFeature(match)]);
  for (const r of match.runners) session.addPlayer(String(r.slot), { slot: r.slot });
  const send = (slot, action, payload) =>
    session.dispatch(String(slot), { kind: 'raid.' + action, payload }).ok;
  return { match, send };
}
test('aim feedback distinguishes an empty cast, a hit and an unreachable point before spending a skill', () => {
  const { match, send } = battle();
  const runner = match.runners[0];
  const rival = match.runners[2];
  assert.equal(match.previewSkill(0, 1, rival).status, 'needTarget');
  const field = match.previewSkill(0, 2, { x: -5.7, z: 9 });
  assert.equal(field.status, 'ready');
  assert.equal(field.count, 0);
  for (const point of [{ x: 8, z: 8 }, { x: runner.x, z: -15 }, { x: 0, z: WAGON.z + 4 }, WAGON]) {
    const fresh = battle();
    assert.equal(fresh.match.previewSkill(0, 2, point).status, 'ready');
    assert.ok(fresh.send(0, 'cast', { skill: 2, ...point }));
  }
  assert.equal(match.previewSkill(0, 2, { x: runner.x, z: -15.01 }).status, 'outOfRange');
  const area = match.previewSkill(0, 2, rival);
  assert.equal(area.status, 'ready');
  assert.equal(area.count, 2);
  const hp = match.runners.map((r) => r.hp);
  assert.ok(send(0, 'cast', { skill: 2, x: rival.x, z: rival.z }));
  match.step();
  assert.equal(
    match.runners.filter((r, i) => hp[i] - r.hp === 3 * HEROES.hammer.power).length,
    area.count,
  );
  assert.equal(match.previewSkill(0, 2, rival).status, 'unavailable');
  assert.ok(send(0, 'move', { side: 0, brake: 1 }));
  advance(match, 65);
  assert.ok(match.canTarget(0, 'wagon'));
  const shot = match.previewSkill(0, 1, null, 'wagon');
  assert.equal(shot.range, 16);
  assert.equal(shot.status, 'outOfRange');
  assert.equal(send(0, 'cast', { skill: 1, target: 'wagon' }), false);
  assert.equal(runner.cooldowns[1], 0);
  assert.ok(send(0, 'move', { side: 0, brake: 0 }));
  advance(match, 3);
  assert.equal(match.previewSkill(0, 1, null, 'wagon').status, 'ready');
  assert.ok(send(0, 'cast', { skill: 1, target: 'wagon' }));
});

test('self pulses and ally wards preview the recipient and range used by the cast', () => {
  const { match } = battle('jade');
  const grove = match.previewSkill(0, 2, match.runners[0]);
  assert.deepEqual([grove.status, grove.count, grove.allies], ['ready', 1, 2]);
  const ward = match.previewSkill(0, 0, null, 1);
  assert.deepEqual([ward.kind, ward.range, ward.status], ['ward', 8, 'ready']);
  assert.equal(match.previewSkill(0, 0, null, 2).status, 'needTarget');
  assert.ok(match.cast(0, 0, 1));
  assert.ok(match.runners[1].shield);
  const hammer = match.runners[1];
  const pulse = match.previewSkill(hammer.slot, 0, WAGON);
  assert.deepEqual(
    [pulse.kind, pulse.origin, pulse.point, pulse.radius],
    ['pulse', hammer, hammer, HEROES.hammer.radius],
  );
  assert.ok(match.cast(hammer.slot, 0));
  assert.deepEqual(match.actions.at(-1).to, { x: hammer.x, z: hammer.z });
});
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
test('each accepted cast records one cue, including an empty field or a full-health ward', () => {
  const { match, send } = battle('jade');
  assert.ok(send(0, 'cast', { skill: 0, ally: 1 }));
  assert.ok(send(0, 'cast', { skill: 2, x: -5, z: 4 }));
  assert.equal(send(0, 'cast', { skill: 2, x: -5, z: 4 }), false);
  assert.deepEqual(
    match.actions.map(({ id, hero, skill, to }) => [id, hero, skill, to]),
    [
      [1, 'jade', 0, { x: -3.3, z: -2 }],
      [2, 'jade', 2, { x: -5, z: 4 }],
    ],
  );
  advance(match, 40);
  assert.ok(match.actions.every((cue) => cue.id > 2));
});
test('the wagon takes arrow rain on impact and at half a second, then moves beyond the field', () => {
  const { match, send } = battle('longshot');
  assert.ok(send(0, 'cast', { skill: 2, ...WAGON }));
  advance(match, 14);
  assert.equal(match.damage[0], 24);
  match.step();
  assert.equal(match.damage[0], 32);
  advance(match, 15);
  assert.equal(match.damage[0], 32);
  advance(match, 15);
  assert.equal(match.damage[0], 32);
});
test('running into arrow rain or a dark vortex triggers a later pulse at the placed road point', () => {
  for (const hero of ['longshot', 'abyss']) {
    const { match, send } = battle(hero);
    const rival = match.runners[2];
    const hp = rival.hp;
    assert.ok(send(0, 'cast', { skill: 2, x: rival.x, z: 10 }));
    // The caster brakes and changes lanes after release. The rival keeps running straight.
    assert.ok(send(0, 'move', { side: -1, walk: true }));
    advance(match, 29);
    assert.equal(rival.hp, hp);
    assert.equal(rival.slowed, 0);
    match.step();
    if (hero === 'longshot') assert.equal(rival.hp, hp - HEROES.longshot.power);
    else assert.equal(rival.slowed, 30);
  }
});
test('each charged ultimate applies its hero effect to the selected formation', () => {
  for (const hero of HERO_IDS) {
    const { match, send } = battle(hero);
    const [caster, ally, flank, rear] = match.runners;
    for (const r of match.runners) send(r.slot, 'move', { side: 0, brake: 2.25 / 5.35 });
    assert.ok(
      send(
        0,
        'cast',
        hero === 'jade'
          ? { skill: 1, dx: WAGON.x - caster.x, dz: WAGON.z - caster.z }
          : { skill: 1, target: 'wagon' },
      ),
    );
    assert.ok(send(0, 'cast', { skill: 2, ...WAGON }));
    for (const rival of [flank, rear])
      assert.ok(send(rival.slot, 'cast', { skill: 2, x: caster.x, z: caster.z }));
    advance(match, 28);
    assert.equal(caster.rage, 100);
    if (hero === 'longshot') assert.ok(send(3, 'cast', { skill: 0, ally: 3 }));
    const beforeRear = rear.hp,
      beforeFlank = flank.hp;
    assert.ok(
      send(
        0,
        'cast',
        hero === 'longshot'
          ? { skill: 3, dx: rear.x - caster.x, dz: rear.z - caster.z }
          : { skill: 3, target: 3 },
      ),
    );
    advance(match, hero === 'longshot' ? 10 : 1);
    assert.equal(caster.rage, 0);
    assert.equal(rear.hp, beforeRear - 7 * HEROES[hero].power);
    if (hero === 'hammer') assert.equal(flank.hp, beforeFlank - 24);
    if (hero === 'abyss') assert.equal(rear.silenced, 60);
    if (hero === 'longshot') assert.ok(rear.shield);
    if (hero === 'jade') assert.ok(caster.shield && ally.shield);
  }
});
test('marking bolt doubles the next basic shot against its marked runner once', () => {
  const { match, send } = battle('longshot');
  send(0, 'move', { side: 0, walk: true });
  advance(match, 20);
  const rival = match.runners[2];
  assert.ok(send(0, 'cast', { skill: 1, target: rival.slot }));
  match.step();
  assert.ok(rival.marked);
  const before = rival.hp;
  send(0, 'move', { side: 1, walk: false });
  for (let i = 0; i < 30 && rival.marked; i++) match.step();
  assert.equal(rival.marked, 0);
  assert.equal(before - rival.hp, 2 * HEROES.longshot.power);
});
test('a wounded ally heals inside the grove and receives no further healing after running past it', () => {
  const { match, send } = battle('jade');
  const ally = match.runners[1];
  assert.ok(send(2, 'cast', { skill: 1, target: 1 }));
  match.step();
  const before = ally.hp;
  assert.ok(send(0, 'cast', { skill: 2, x: ally.x, z: ally.z + 2.5 }));
  advance(match, 15);
  assert.equal(ally.hp - before, 10);
  assert.equal(match.runners[0].rage, 10);
  advance(match, 15);
  assert.equal(ally.hp - before, 10);
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
test('stick travel scales lateral and forward distance, and release restores full running speed', () => {
  const { match, send } = battle();
  const runner = match.runners[0];
  for (const [side, brake, lateral, forward] of [
    [-0.25, 0.25, -1.2, 6.9125],
    [0.5, 0.5, 2.4, 5.575],
    [0, 1, 0, 2.9],
    [0, 0, 0, 8.25],
  ]) {
    const { x, z } = runner;
    assert.ok(send(0, 'move', { side, brake }));
    advance(match, RAID_HZ);
    assert.ok(Math.abs(runner.x - x - lateral) < 0.001);
    assert.ok(Math.abs(runner.z - z + raidRoadTravel(RAID_HZ) - forward) < 0.001);
  }
});
test('out-of-range or malformed steering preserves both previous axes', () => {
  const { match, send } = battle();
  assert.ok(send(0, 'move', { side: -0.6, brake: 0.4 }));
  for (const payload of [
    { side: 1.01, brake: 0 },
    { side: -1.01, brake: 0 },
    { side: NaN, brake: 0 },
    { side: '0', brake: 0 },
    { side: 0, brake: -0.01 },
    { side: 0, brake: 1.01 },
    { side: 0, brake: Infinity },
    { side: 0, brake: NaN },
    { side: 0, brake: null, walk: true },
  ]) {
    assert.equal(send(0, 'move', payload), false);
    const { side, brake } = match.runners[0];
    assert.deepEqual([side, brake], [-0.6, 0.4]);
  }
});
test('a locked opponent crossing just behind the runner escapes basics but can still be hit by Bolt', () => {
  const { match, send } = battle();
  const [player, , rival] = match.runners;
  send(0, 'move', { side: 1, walk: true });
  advance(match, 20);
  assert.ok(send(0, 'lock', 2));
  send(0, 'move', { side: 0, walk: false });
  send(2, 'move', { side: 0, walk: true });
  advance(match, 21);
  assert.ok(rival.z < player.z && player.z - rival.z < 0.45);
  assert.ok(Math.hypot(player.x - rival.x, player.z - rival.z) < HEROES.hammer.reach);
  assert.equal(player.target, 2);
  const hpBehind = rival.hp;
  send(2, 'move', { side: 0, walk: false });
  advance(match, 30);
  assert.equal(rival.hp, hpBehind);
  assert.equal(player.basic, 0);
  assert.ok(player.hp < HEROES.hammer.hp);
  assert.ok(send(0, 'lock', 2));
  assert.ok(send(0, 'cast', { skill: 1 }));
  assert.ok(player.cooldowns[1] > 0);
  match.step();
  assert.equal(hpBehind - rival.hp, 36);
});
test('an opponent beside the runner enters basic attack range only after moving into the forward cone', () => {
  const { match, send } = battle();
  const [player, , rival] = match.runners;
  send(0, 'move', { side: 1, walk: false });
  match.step();
  send(0, 'move', { side: 0, walk: false });
  assert.ok(send(0, 'lock', 2));
  advance(match, 30);
  assert.ok(Math.hypot(player.x - rival.x, player.z - rival.z) < HEROES.hammer.reach);
  assert.equal(rival.hp, HEROES.longshot.hp);
  assert.equal(player.basic, 0);
  send(0, 'move', { side: 1, walk: true });
  advance(match, 10);
  assert.ok(rival.z - player.z >= Math.abs(rival.x - player.x));
  assert.equal(rival.hp, HEROES.longshot.hp - HEROES.hammer.power);
});
test('a viewport edge limits player locks but leaves in-range fields and bot vision independent', () => {
  let aspect = 16 / 9;
  const { match, send } = battle('hammer', () => aspect);
  send(0, 'move', { side: 0, walk: true });
  send(3, 'move', { side: -1, walk: true });
  advance(match, 20);
  assert.ok(send(0, 'lock', 2));
  aspect = 0.15;
  assert.equal(send(0, 'cast', { skill: 1, target: 2 }), false);
  assert.ok(send(0, 'cast', { skill: 2, x: 5, z: 0 }));
  assert.ok(match.runners[0].cooldowns[2] > 0);
  assert.ok(send(3, 'lock', 1));
  match.step();
  assert.equal(match.runners[0].target, null);
  assert.equal(match.runners[3].target, 1);
  aspect = 16 / 9;
  assert.ok(send(0, 'lock', 2));
});
test('bots can target a closer opponent behind them with skills while that opponent is on camera', () => {
  const { match, send } = battle();
  send(0, 'move', { side: 0, walk: true });
  send(3, 'move', { side: -1, walk: false });
  advance(match, 12);
  send(3, 'move', { side: -1, walk: true });
  advance(match, 14);
  const bot = match.runners[3];
  assert.ok(match.runners[0].z < bot.z);
  assert.ok(match.canTarget(3, 1));
  const orders = [];
  driveRaidBots(match, (slot, action, payload) => {
    if (slot === 3 && action === 'lock') orders.push(payload);
  });
  assert.deepEqual(orders, [0]);
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
  for (const slot of [0, 1]) send(slot, 'move', { side: 0, walk: true });
  advance(match, 20);
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
  for (const rival of [2, 3]) send(rival, 'move', { side: 0, walk: true });
  advance(match, 20);
  for (const rival of [2, 3]) {
    send(rival, 'lock', 0);
    const enemy = match.runners[rival];
    assert.ok(
      send(
        rival,
        'cast',
        enemy.hero === 'jade'
          ? { skill: 1, dx: player.x - enemy.x, dz: player.z - enemy.z + 1.5 }
          : { skill: 1 },
      ),
    );
    send(rival, 'cast', { skill: 2, x: player.x, z: player.z });
    advance(match, rival === 3 ? 21 : 1);
    if (rival === 2) {
      assert.ok(player.rage > 0 && player.rage < 100);
      assert.equal(send(0, 'cast', { skill: 3 }), false);
    }
  }
  assert.equal(player.rage, 100);
  assert.ok(player.hp > 0);
  assert.equal(send(0, 'cast', { skill: 3, target: 1 }), false);
  assert.equal(player.rage, 100);
  assert.equal(player.cooldowns[3], 0);
  assert.equal(send(0, 'cast', { skill: 3 }), true);
  assert.equal(player.rage, 0);
  assert.equal(send(0, 'cast', { skill: 3 }), false);
  match.step();
  assert.ok(match.damage[0] > 0);
  assert.equal(player.rage, 0);
});
test('damage to the wagon and damage from its hazard both charge the runner', () => {
  const { match, send } = battle();
  const player = match.runners[0];
  send(0, 'move', { side: -1, walk: true });
  assert.ok(send(0, 'cast', { skill: 1, target: 'wagon' }));
  match.step();
  assert.equal(match.damage[0], 36);
  assert.equal(player.rage, 36 + HEROES.hammer.hp - player.hp);
  advance(match, 88);
  const { rage, hp } = player;
  match.step();
  assert.equal(hp - player.hp, 26);
  assert.equal(player.rage, Math.min(100, rage + 26));
});
test('a rear ground strike can charge Fury, which can spend that charge on the visible rear rival', () => {
  const { match, send } = battle();
  const [player, , flank, rear] = match.runners;
  assert.ok(send(0, 'cast', { skill: 1, target: flank.slot }));
  assert.ok(send(0, 'cast', { skill: 2, x: (flank.x + rear.x) / 2, z: -1 }));
  match.step();
  assert.equal(player.hp, HEROES.hammer.hp);
  assert.equal(player.rage, 100);
  assert.equal(rear.hp, HEROES.jade.hp - 36);
  assert.equal(rear.rage, 36);
  assert.ok(send(0, 'cast', { skill: 3, target: rear.slot }));
  match.step();
  assert.equal(rear.hp, 0);
  assert.equal(rear.rage, 100);
  assert.equal(player.rage, 0);
});
test('a full-health shield gives no rage and a self-heal counts only the missing health', () => {
  const full = battle('jade');
  assert.ok(full.send(0, 'cast', { skill: 0, ally: 0 }));
  assert.equal(full.match.runners[0].rage, 0);
  assert.ok(full.send(2, 'cast', { skill: 1, target: 0 }));
  full.match.step();
  for (const slot of [0, 2]) assert.equal(full.match.runners[slot].rage, 15);

  const { match, send } = battle('jade');
  const jade = match.runners[0];
  send(3, 'move', { side: -1, walk: false });
  for (let i = 0; i < 30 && jade.hp === HEROES.jade.hp; i++) match.step();
  const missing = HEROES.jade.hp - jade.hp;
  assert.ok(missing > 0 && missing < 20);
  const before = jade.rage;
  assert.ok(send(0, 'cast', { skill: 0, ally: 0 }));
  assert.equal(jade.hp, HEROES.jade.hp);
  assert.equal(jade.rage - before, missing);
});
test('Abyss can silence and slow a runner and Jade can shield a wounded partner', () => {
  const { match, send } = battle('jade');
  assert.equal(send(0, 'cast', { skill: 0, ally: 3 }), false);
  const ally = match.runners[1];
  const abyss = match.runners.find((r) => r.hero === 'abyss');
  send(abyss.slot, 'move', { side: 0, walk: true });
  advance(match, 40);
  assert.ok(send(abyss.slot, 'lock', 1));
  send(abyss.slot, 'cast', { skill: 1 });
  send(abyss.slot, 'cast', { skill: 2, x: ally.x, z: ally.z });
  match.step();
  assert.ok(ally.silenced && ally.slowed);
  assert.equal(send(1, 'cast', { skill: 0 }), false);
  const jade = match.runners[0];
  const before = { hp: ally.hp, allyRage: ally.rage, jadeRage: jade.rage };
  assert.ok(send(0, 'cast', { skill: 0, ally: 1 }));
  assert.ok(ally.shield > 0);
  assert.equal(ally.hp - before.hp, 20);
  assert.equal(jade.rage, Math.min(100, before.jadeRage + 20));
  assert.equal(ally.rage, before.allyRage);
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

test('free-aim shots ignore the lock, accept empty space, and spend cooldown on a miss', () => {
  for (const [hero, skill] of [
    ['jade', 1],
    ['longshot', 0],
  ]) {
    const { match, send } = battle(hero);
    for (const payload of [
      {},
      { target: 'wagon' },
      { dx: 0, dz: 0 },
      { dx: NaN, dz: 1 },
      { dx: Infinity, dz: 0 },
    ])
      assert.equal(send(0, 'cast', { skill, ...payload }), false);
    const aim = match.previewSkill(0, skill, { x: -55, z: 0 }, 'wagon');
    assert.deepEqual(
      [aim.kind, aim.status, aim.target, aim.count],
      ['direction', 'ready', undefined, undefined],
    );
    assert.ok(send(0, 'cast', { skill, dx: -1, dz: 0 }));
    assert.equal(match.runners[0].target, 'wagon');
    assert.ok(match.runners[0].cooldowns[skill] > 0);
    assert.equal(match.projectiles.length, hero === 'jade' ? 1 : 3);
    advance(match, 40);
    assert.equal(match.projectiles.length, 0);
    assert.deepEqual(match.damage, [0, 0]);
  }
});
test('a runner can dodge a thorn in flight or run into a shot aimed ahead', () => {
  for (const lead of [0, 0.8]) {
    const { match, send } = battle('jade');
    const [player, , rival] = match.runners;
    send(2, 'move', { side: 0, brake: 1 });
    const hp = rival.hp;
    assert.ok(send(0, 'cast', { skill: 1, dx: rival.x - player.x, dz: rival.z - player.z - lead }));
    match.step();
    assert.equal(rival.hp, hp);
    advance(match, 7);
    assert.equal(rival.hp, lead ? hp - 30 : hp);
  }
});
