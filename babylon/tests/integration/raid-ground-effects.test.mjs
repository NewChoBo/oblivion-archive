import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine, Scene } from '@babylonjs/core';
import { RaidMatch, raidRoadTravel } from '../../src/game/raid/raid-match.ts';
import { createRaidCounterVisual } from '../../src/platform/babylon/raid/raid-counter-visual.ts';
import { RAID_COUNTERS } from '../../src/game/raid/raid-boss.ts';
import { createRaidEffects } from '../../src/platform/babylon/raid/raid-effects.ts';

test('Chain Slash draws the frontal sector at its cast-time reach even after a later empowerment', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const draw = createRaidEffects(scene);
  const match = new RaidMatch('rildin');
  assert.ok(match.cast(0, 0));
  const slash = match.actions[0];
  match.runners[0].rage = 100;
  assert.ok(match.cast(0, 3));
  assert.equal(match.previewSkill(0, 0, null).radius, 6.5);
  assert.deepEqual(slash.footprint, { radius: 5, halfAngle: Math.PI / 4 });
  for (let tick = 0; tick < 6; tick++) match.step();
  draw(match, 0);
  const rim = scene.getMeshByName('skill sector rim');
  assert.ok(rim.isEnabled());
  assert.equal(rim.scaling.x, 5);
  assert.ok(Math.abs(rim.getBoundingInfo().boundingBox.maximum.x - Math.sin(Math.PI / 4)) < 1e-6);
  assert.equal(rim.getBoundingInfo().boundingBox.minimum.z, 0);
});

test('boss tells retain the hit width and the shockwave crest follows its damaging front', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const draw = createRaidCounterVisual(scene);
  const strip = scene.getMeshByName('wagon strike strip'),
    disc = scene.getMeshByName('wagon mortar zone');
  const shell = scene.getMeshByName('descending mortar shell'),
    crest = scene.getMeshByName('wagon shockwave crest');
  const counter = { kind: 'lane', phase: 'warning', x: -2, z: 0, ticks: 15 };
  draw(counter, 0.5);
  assert.equal(strip.position.x, -2);
  assert.equal(strip.scaling.x, 2 * RAID_COUNTERS.lane.halfWidth);
  assert.ok(strip.isEnabled() && !disc.isEnabled());
  draw({ ...counter, kind: 'mortar', z: -1 }, 0.5);
  assert.ok(disc.isEnabled() && shell.isEnabled() && !strip.isEnabled());
  assert.deepEqual([disc.position.x, disc.position.z], [-2, -1]);
  assert.equal(disc.getBoundingInfo().boundingBox.maximum.x, RAID_COUNTERS.mortar.radius);
  draw({ ...counter, kind: 'wave', phase: 'impact', x: 0, z: 3 }, 0.5);
  assert.ok(crest.isEnabled() && !shell.isEnabled());
  assert.equal(strip.position.z, 3 - 0.5 * RAID_COUNTERS.wave.metresPerTick);
  assert.equal(crest.position.z, strip.position.z);
  draw(null, 0);
  assert.ok([strip, disc, shell, crest].every((mesh) => !mesh.isEnabled()));
});

test('persistent ground rings and sigils stay on the same road tile between ticks and across bridge spans', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const renderEffects = createRaidEffects(scene);
  const match = new RaidMatch();
  while (match.tick < 38) match.step();
  const aim = { x: 0.8, z: 7 };
  const roadZ = aim.z + raidRoadTravel(match.tick);
  const casters = match.runners.filter((runner) => runner.hero !== 'hammer');
  for (const caster of casters) assert.ok(match.cast(caster.slot, 2, aim));
  for (const now of [38, 38.5, 38.5, 40, 53, 68]) {
    while (match.tick < Math.floor(now)) match.step();
    renderEffects(match, now - match.tick);
    for (const caster of casters) {
      for (const [name, surface] of [
        ['raid ground sigil', 'particle ink'],
        ['raid impact rim', 'impact light'],
      ]) {
        const part = scene.meshes.find(
          (mesh) =>
            mesh.name === name &&
            mesh.isEnabled() &&
            mesh.material?.name === caster.hero + ' ' + surface,
        );
        assert.ok(part, caster.hero + ' ' + name);
        assert.equal(part.position.x, aim.x);
        assert.ok(Math.abs(part.position.z + raidRoadTravel(now) - roadZ) < 1e-6);
      }
    }
  }
});
