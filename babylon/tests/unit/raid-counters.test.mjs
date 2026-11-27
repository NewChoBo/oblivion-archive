import assert from 'node:assert/strict';
import test from 'node:test';
import { RaidBoss } from '../../src/game/raid/raid-boss.ts';
import {
  RaidMatch,
  canUseRaidSkill,
  raidRunnerPositionAfter,
} from '../../src/game/raid/raid-match.ts';
import { RaidRound } from '../../src/game/raid/raid-round.ts';

test('the mortar locks its circle on warning, hits airborne runners inside, and misses runners who leave', () => {
  const boss = new RaidBoss();
  const runners = [
    { slot: 0, x: 0, z: 1, respawn: 0 },
    { slot: 1, x: 0, z: 1, respawn: 0 },
    { slot: 2, x: 0, z: 1, respawn: 20 },
  ];
  const hits = [];
  const step = (tick) =>
    boss.step(
      tick,
      runners,
      () => 1.3,
      (slot, damage) => hits.push([tick, slot, damage]),
    );
  step(192);
  assert.deepEqual(boss.counter, { kind: 'mortar', phase: 'warning', x: 0, z: 1, ticks: 42 });
  runners[1].x = 3;
  for (let tick = 193; tick < 234; tick++) step(tick);
  assert.deepEqual(hits, []);
  step(234);
  assert.deepEqual(hits, [[234, 0, 32]]);
  runners[1].x = 0;
  for (let tick = 235; tick <= 242; tick++) step(tick);
  assert.deepEqual(hits, [[234, 0, 32]]);
  assert.equal(boss.counter, null);
});

test('the shockwave reaches the front first, hits once per runner and passes beneath a timed jump', () => {
  const boss = new RaidBoss();
  const runners = [8, 0, 0, -5].map((z, slot) => ({ slot, x: 0, z, respawn: 0 }));
  const hits = [];
  for (let tick = 324; tick <= 402; tick++) {
    boss.step(
      tick,
      runners,
      (r) => (r.slot === 2 && tick >= 374 && tick <= 379 ? 1.2 : 0),
      (slot, damage) => hits.push({ slot, damage, tick }),
    );
    if (tick === 324) assert.equal(boss.counter.kind, 'wave');
    if (tick === 349) assert.deepEqual(hits, []);
  }
  assert.deepEqual(
    hits.map((h) => h.slot),
    [0, 1, 3],
  );
  assert.ok(hits.every((h) => h.damage === 22));
  assert.ok(hits[0].tick < hits[1].tick && hits[1].tick < hits[2].tick);
  assert.equal(boss.counter, null);
});

test('stagger holds steering and basic attacks, denies jumps and casts, then restores held movement and resists a second stagger', () => {
  const match = new RaidMatch(['hammer', 'bastion', 'rime', 'jade']);
  const [hammer, bastion, victim] = match.runners;
  Object.assign(bastion, { x: 0, z: 0 });
  for (const runner of match.runners) runner.basic = 100;
  assert.ok(match.cast(hammer.slot, 1));
  match.step();
  const { x, z } = victim;
  assert.equal(victim.staggered, 12);
  assert.equal(bastion.staggered, 0);
  assert.equal(match.jump(victim.slot), false);
  assert.equal(canUseRaidSkill(victim, 0), false);
  assert.equal(match.cast(victim.slot, 0), false);
  assert.equal(victim.cooldowns[0], 0);
  assert.ok(match.move(victim.slot, 1, 0));
  assert.deepEqual(raidRunnerPositionAfter(victim, 0.9), { x, z });
  victim.basic = 0;
  for (let i = 0; i < 12; i++) match.step();
  assert.deepEqual({ x: victim.x, z: victim.z }, { x, z });
  assert.equal(victim.basic, 0);
  assert.equal(victim.staggered, 0);
  assert.ok(match.jump(victim.slot));
  assert.ok(match.cast(bastion.slot, 0));
  match.step();
  assert.equal(victim.staggered, 0);
  assert.ok(victim.hp < 98 && victim.x > x && victim.basic > 0);
  assert.ok(canUseRaidSkill(victim, 0));
});

test('frost slows opponents without blocking casts; a shorter frost hit preserves the longer slow', () => {
  const match = new RaidMatch(['rime', 'hammer', 'bastion', 'jade']);
  const [rime, ally, victim] = match.runners;
  rime.rage = 100;
  assert.ok(match.cast(0, 3, 2));
  match.step();
  assert.equal(victim.slowed, 90);
  assert.ok(match.cast(0, 0));
  assert.ok(match.move(2, 1, 0));
  const x = victim.x;
  match.step();
  assert.equal(victim.slowed, 89);
  assert.ok(Math.abs(victim.x - x - (4.8 / 30) * 0.55) < 1e-8);
  assert.equal(ally.slowed, 0);
  assert.ok(match.cast(2, 0));
  for (let i = 0; i < 89; i++) match.step();
  assert.equal(victim.slowed, 0);
});

test('four-player replay reproduces all three boss strikes and PvP stagger from accepted input', () => {
  const seats = ['hammer', 'rime', 'jade', 'bastion'].map((hero, i) => ({ hero, actor: i + 1 }));
  const host = new RaidRound(seats),
    guest = new RaidRound(seats);
  assert.ok(host.enqueue(1, { seq: 1, action: 'cast', payload: { skill: 1 } }));
  const impacts = new Set();
  for (let i = 0; i < 404; i++) {
    const frames = host.advance(1);
    assert.ok(guest.replay(JSON.parse(JSON.stringify(frames))));
    if (i === 0) assert.equal(guest.match.runners[2].staggered, 12);
    assert.deepEqual(guest.match.hazard, host.match.hazard);
    assert.deepEqual(guest.match.runners, host.match.runners);
    if (guest.match.hazard?.phase === 'impact') impacts.add(guest.match.hazard.kind);
  }
  assert.deepEqual([...impacts], ['lane', 'mortar', 'wave']);
});
