import assert from 'node:assert/strict';
import test from 'node:test';
import { RaidHitResolution } from '../../src/game/raid/combat/hit-resolution.ts';
import { HEROES, RaidMatch, RAID_HZ, WAGON_HP } from '../../src/game/raid/raid-match.ts';

test('combat numbers report applied health changes, including lethal hits, overheal and the last wagon HP', () => {
  const { runners } = new RaidMatch(['jade', 'rend', 'rime', 'bastion']);
  const resolution = new RaidHitResolution(
    runners.map((self) => ({ self, stats: HEROES[self.hero] })),
    (slot) => (slot === 3 ? { onIncomingHit: () => true } : {}),
    () => {},
  );
  const [caster, ally, rival] = runners;
  ally.hp -= 3;
  rival.hp = 5;
  rival.shield = 10;
  resolution.damage[0] = WAGON_HP - 2;
  resolution.heal(10, caster, ally.slot, 20);
  resolution.heal(10, caster, ally.slot, 20);
  for (const hit of [
    { from: null, target: 2, amount: 5 },
    { from: 0, target: 2, amount: 50 },
    { from: 0, target: 3, amount: 50 },
    { from: 0, target: 'wagon', amount: 50 },
    { from: 0, target: 'wagon', amount: 50 },
  ])
    resolution.enqueue(hit);
  resolution.resolve(10);
  assert.deepEqual(
    resolution.healthChanges.map(({ from, target, amount }) => [from, target, amount]),
    [
      [0, 1, 3],
      [null, 2, -3],
      [0, 2, -2],
      [0, 'wagon', -2],
    ],
  );
  const impact = resolution.healthChanges[1];
  rival.z += 10;
  assert.notEqual(impact.z, rival.z);
  resolution.resolve(10 + RAID_HZ);
  assert.deepEqual(resolution.healthChanges, []);
});

test('life steal shows the actual self-heal alongside the hit without changing its fury cost', () => {
  const match = new RaidMatch(['rend', 'jade', 'rime', 'bastion']);
  const [rend, , victim, other] = match.runners;
  rend.hp -= 2;
  other.x = 5;
  for (const r of match.runners) r.basic = 30;
  assert.ok(match.cast(0, 0));
  match.step();
  assert.deepEqual(
    match.healthChanges.map(({ target, amount }) => [target, amount]),
    [
      [victim.slot, -2 * HEROES.rend.power],
      [rend.slot, 2],
    ],
  );
  assert.equal(rend.rage, 2 * HEROES.rend.power);
});

test('a previous attacker gets an assist only within five seconds of their last hit', () => {
  for (const [age, assists] of [
    [5 * RAID_HZ, 1],
    [5 * RAID_HZ + 1, 0],
  ]) {
    const { runners } = new RaidMatch(['rime', 'rend', 'jade', 'bastion']);
    const damage = new RaidHitResolution(
      runners.map((self) => ({ self })),
      () => ({}),
      () => {},
    );
    damage.enqueue({ from: 0, target: 2, amount: 1 });
    damage.resolve(10);
    damage.enqueue({ from: 1, target: 2, amount: runners[2].hp });
    damage.resolve(10 + age);
    assert.equal(runners[0].assists, assists);
    assert.equal(runners[1].kills, 1);
  }
});
