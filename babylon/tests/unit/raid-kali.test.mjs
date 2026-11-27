import assert from 'node:assert/strict';
import test from 'node:test';
import { HEROES, RaidMatch, WAGON } from '../../src/game/raid/raid-match.ts';
import { RaidRound } from '../../src/game/raid/raid-round.ts';

function arena() {
  const m = new RaidMatch(['kali', 'jade', 'rend', 'hammer']);
  for (const r of m.runners) r.basic = 1000;
  return m;
}
function advance(m, n) {
  for (let i = 0; i < n; i++) m.step();
}
test('Shadow Strike hits inside three metres, halves boss damage and awards one point per cast', () => {
  const m = arena(),
    [r, , enemy, far] = m.runners;
  Object.assign(r, { x: 0, z: 8 });
  Object.assign(enemy, { x: 3, z: 8 });
  Object.assign(far, { x: 3.01, z: 8 });
  assert.equal(m.previewSkill(0, 0, null).count, 2);
  assert.ok(m.cast(0, 0));
  assert.equal(r.cooldowns[0], 120);
  m.step();
  assert.equal(m.damage[0], 18);
  assert.equal(enemy.hp, HEROES.rend.hp - 36);
  assert.equal(far.hp, HEROES.hammer.hp);
  assert.equal(r.heroView.comboPoints, 1);
  advance(m, 150);
  assert.equal(r.heroView.comboPoints, 0);
});
test('Poison arms the next landed basic and ticks three times after contact', () => {
  const m = arena(),
    [r] = m.runners;
  Object.assign(r, { x: 0, z: 8 });
  assert.ok(m.cast(0, 1));
  assert.equal(r.cooldowns[1], 300);
  advance(m, 12);
  assert.equal(r.heroView.poisonArmed, true);
  assert.equal(m.damage[0], 0);
  r.basic = 0;
  m.step();
  r.basic = 1000;
  assert.equal(r.heroView.poisonArmed, false);
  assert.equal(r.heroView.comboPoints, 1);
  for (let i = 1; i <= 3; i++) {
    advance(m, 29);
    assert.equal(m.damage[0], i * 9);
    m.step();
    assert.equal(m.damage[0], (i + 1) * 9);
  }
  advance(m, 30);
  assert.equal(m.damage[0], 36);
  assert.equal(r.heroView.comboPoints, 1);
});
test('Shadow Step uses either team, excludes self and checks sight and thirteen-metre reach', () => {
  for (const target of [1, 2, 'wagon']) {
    const m = arena(),
      [r] = m.runners;
    assert.equal(m.cast(0, 2, 0), false);
    const point = target === 'wagon' ? WAGON : m.runners[target];
    const hp = point.hp;
    assert.equal(m.previewSkill(0, 2, null, target).status, 'ready');
    assert.ok(m.cast(0, 2, target));
    assert.equal(r.cooldowns[2], 390);
    assert.deepEqual([r.x, r.z], [point.x, point.z - 0.85]);
    m.step();
    if (target === 'wagon') assert.equal(m.damage[0], 18);
    else assert.equal(point.hp, hp - (target === 2 ? 18 : 0));
    assert.equal(r.lastStrike, target);
  }
  const m = new RaidMatch(['kali', 'jade', 'rend', 'hammer'], () => 0.8),
    [r, friend, rival] = m.runners;
  for (const target of [friend, rival]) {
    Object.assign(target, { x: r.x, z: r.z + 13.01 });
    assert.equal(m.previewSkill(0, 2, null, target.slot).status, 'outOfRange');
    assert.equal(m.cast(0, 2, target.slot), false);
    Object.assign(target, { x: r.x + 12, z: r.z - 2, respawn: 0 });
    assert.equal(m.previewSkill(0, 2, null, target.slot).status, 'needTarget');
    Object.assign(target, { x: r.x, z: r.z + 4, respawn: 5 });
    assert.equal(m.cast(0, 2, target.slot), false);
  }
});
test('three different skill hits empower one basic, then start a fresh combo', () => {
  const m = arena(),
    [r] = m.runners;
  Object.assign(r, { x: 0, z: 8 });
  assert.ok(m.cast(0, 0));
  assert.ok(m.cast(0, 1));
  assert.ok(m.cast(0, 2, 'wagon'));
  r.basic = 0;
  m.step();
  assert.equal(r.heroView.comboPoints, 3);
  const before = m.damage[0];
  r.basic = 0;
  m.step();
  assert.equal(m.damage[0] - before, 18);
  assert.equal(r.heroView.comboPoints, 0);
  r.basic = 0;
  m.step();
  assert.equal(m.damage[0] - before, 27);
});
test('Dark Blades crosses moving rivals once per dash, preserves saved rage and requires three manual releases', () => {
  const m = arena(),
    [r, , enemy, miss] = m.runners;
  Object.assign(r, { x: -3, z: 0, rage: 100 });
  Object.assign(enemy, { x: 0, z: -1.3 });
  Object.assign(miss, { x: 0, z: 3.5 });
  assert.equal(m.cast(0, 3, 2), false);
  assert.ok(m.cast(0, 3, { dx: 1, dz: 0 }));
  assert.deepEqual([r.rage, r.heroView.ultimateRecasts], [0, 2]);
  assert.equal(enemy.hp, HEROES.rend.hp);
  advance(m, 12);
  assert.equal(enemy.hp, HEROES.rend.hp - 36);
  assert.equal(miss.hp, HEROES.hammer.hp);
  advance(m, 77);
  assert.equal(m.cast(0, 3, { dx: -1, dz: 0 }), false);
  m.step();
  r.rage = 41;
  assert.ok(m.cast(0, 3, { dx: -1, dz: 0 }));
  assert.deepEqual([r.rage, r.heroView.ultimateRecasts], [41, 1]);
  advance(m, 90);
  assert.ok(m.cast(0, 3, { dx: 0, dz: 1 }));
  assert.deepEqual([r.rage, r.heroView.ultimateRecasts], [41, 0]);
  advance(m, 90);
  assert.equal(m.cast(0, 3, { dx: 1, dz: 0 }), false);
});
test('a knockout discards unused Dark Blades and an armed Poison', () => {
  const m = arena(),
    [r, , enemy] = m.runners;
  Object.assign(r, { rage: 100, hp: 1 });
  Object.assign(enemy, { x: r.x, z: r.z - 0.15, basic: 0 });
  assert.ok(m.cast(0, 1));
  assert.ok(m.cast(0, 3, { dx: 0, dz: 1 }));
  m.step();
  assert.ok(r.respawn);
  assert.deepEqual([r.dash, r.heroView.ultimateRecasts, r.heroView.poisonArmed], [null, 0, false]);
});
test('the online draft replays Kali stepping behind an ally, arming Poison and dashing', () => {
  const seats = ['kali', 'rend', 'jade', 'longshot'].map((hero, i) => ({ actor: i + 1, hero }));
  const host = new RaidRound(seats),
    peer = new RaidRound(seats);
  for (const round of [host, peer]) round.match.runners[0].rage = 100;
  let seq = 0;
  for (const [payload, ticks] of [
    [{ skill: 2, target: 1 }, 1],
    [{ skill: 1 }, 1],
    [{ skill: 3, dx: 1, dz: 0 }, 6],
    [null, 6],
  ]) {
    if (payload) assert.ok(host.enqueue(1, { seq: ++seq, action: 'cast', payload }));
    const batch = host.advance(ticks);
    if (payload) assert.equal(batch.frames[0].length, 1);
    assert.ok(peer.replay(JSON.parse(JSON.stringify(batch))));
    assert.deepEqual(peer.match.runners, host.match.runners);
    assert.deepEqual(peer.match.damage, host.match.damage);
  }
});
