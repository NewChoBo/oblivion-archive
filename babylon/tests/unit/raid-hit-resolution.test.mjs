import assert from 'node:assert/strict';
import test from 'node:test';
import { RaidHitResolution } from '../../src/game/raid/combat/hit-resolution.ts';
import { RaidMatch, RAID_HZ } from '../../src/game/raid/raid-match.ts';

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
