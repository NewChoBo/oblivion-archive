import assert from 'node:assert/strict';
import test from 'node:test';
import { areaTargets } from '../../src/game/raid/skills/attack-area.ts';
import { RaidFields } from '../../src/game/raid/combat/active-fields.ts';
import { RaidHitResolution } from '../../src/game/raid/combat/hit-resolution.ts';
import { slow, silence, stagger } from '../../src/game/raid/raid-control.ts';
import { RaidMatch } from '../../src/game/raid/raid-match.ts';
import { field } from '../../src/game/raid/skills/skill-effects.ts';
import { resolveSkill } from '../../src/game/raid/skills/skill-targeting.ts';
import { applySkill } from '../../src/game/raid/skills/skill-execution.ts';

test('a customized field previews and delivers the registered area, first hit and follow-up', () => {
  const hit = { powerScale: 4, control: [silence(15)] };
  const pulse = { intervalTicks: 8, count: 3, effect: { kind: 'healAllies', powerScale: 2 } };
  const skill = {
    ...field(),
    range: 9,
    attack: { kind: 'field', area: { kind: 'circle', radius: 2 }, hit, pulse },
  };
  const center = { x: 0, z: 9 };
  const impacts = [],
    fields = [];
  const combat = {
    self: { x: 0, z: 0 },
    enemies: (point, radius) => {
      assert.deepEqual(point, center);
      assert.equal(radius, 2);
      return [2];
    },
    alliesInArea: () => 1,
    placeField: (...args) => fields.push(args),
    strike: (...args) => impacts.push(args),
    record() {},
  };
  const outside = resolveSkill(combat, skill, 2, true, { x: 0, z: 9.001 });
  assert.equal(outside.preview.status, 'outOfRange');
  assert.equal(outside.resolved, null);
  const { preview, resolved } = resolveSkill(combat, skill, 2, true, center);
  assert.deepEqual([preview.range, preview.radius, preview.count, preview.allies], [9, 2, 1, 1]);
  assert.deepEqual([impacts, fields], [[], []]);
  applySkill(skill, combat, resolved, {});
  assert.deepEqual(impacts, [[2, hit, 2]]);
  assert.deepEqual(fields, [[2, center, 2, pulse]]);
});

test('a frontal sector includes its angular edge but excludes a jumper exactly at its height limit', () => {
  const area = { kind: 'sector', halfAngle: Math.PI / 4, belowHeight: 0.7 };
  const points = [
    { x: 2, z: 2, jumping: 0 },
    { x: 2.001, z: 2, jumping: 0 },
    { x: 0, z: 3, jumping: 0.7 },
    { x: 0, z: 3, jumping: 0.699 },
  ];
  const read = {
    enemies: () => [0, 1, 2, 3],
    position: (id) => points[id],
    height: (r) => r.jumping,
  };
  assert.deepEqual(areaTargets(read, area, { x: 0, z: 0 }, 5), [0, 3]);
});

test('two impacts of one skill carry independent shield and crowd control rules', () => {
  const { runners } = new RaidMatch(['rime', 'jade', 'rend', 'hammer']);
  const damage = new RaidHitResolution(
    runners.map((self) => ({ self })),
    () => ({}),
    () => {},
  );
  const victim = runners[2];
  victim.shield = 30;
  const hp = victim.hp;
  damage.enqueue({
    from: 0,
    target: 2,
    skill: 1,
    amount: 9,
    rule: { powerScale: 1, control: [slow(40), stagger(12)] },
  });
  damage.enqueue({
    from: 0,
    target: 2,
    skill: 1,
    amount: 9,
    rule: { powerScale: 1, piercesShield: true, control: [slow(10), silence(18), stagger(60)] },
  });
  damage.resolve(1);
  assert.equal(hp - victim.hp, 5 + 9);
  assert.deepEqual(
    [victim.slowed, victim.silenced, victim.staggered, victim.staggerGuard],
    [40, 18, 12, 36],
  );
});

test('overlapping fields use their own pulse intervals, final ticks and cast order', () => {
  const fields = new RaidFields();
  const contacts = [];
  let tick = 0;
  const caster = {
    self: { respawn: 0 },
    enemies: () => ['wagon'],
    strike: (_id, _hit, slot) => contacts.push([tick, slot]),
  };
  const effect = { kind: 'damageEnemies', hit: { powerScale: 1 } };
  const origin = { x: 0, z: 0 };
  fields.place(0, 1, 0, origin, 3, { intervalTicks: 4, count: 2, effect });
  fields.place(0, 2, 0, origin, 3, { intervalTicks: 2, count: 2, effect });
  for (tick = 1; tick <= 12; tick++) fields.step(tick, [caster]);
  assert.deepEqual(contacts, [
    [2, 2],
    [4, 1],
    [4, 2],
    [8, 1],
  ]);
});
