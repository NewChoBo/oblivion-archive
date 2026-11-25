import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FreeCamera,
  MeshBuilder,
  NullEngine,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { createSpellEffects } from '../../src/platform/babylon/effects/spell-effects.ts';
import {
  BOW_RELEASE_SECONDS,
  bowReleaseMotion,
} from '../../src/platform/babylon/equipment/recharge-motion.ts';

test('the bowstring springs forward before the drawing hand recovers', () => {
  for (const power of [0, 0.5, 1]) {
    const launch = bowReleaseMotion(0, power);
    const firstFrame = bowReleaseMotion(1 / 60, power);
    const followThrough = bowReleaseMotion(0.075, power);
    assert.equal(launch.tension, 1);
    assert.equal(launch.open, 1);
    assert.ok(firstFrame.tension < launch.tension && firstFrame.back > 0);
    assert.ok(followThrough.tension < 0 && followThrough.back > firstFrame.back);
    assert.equal(followThrough.hold, 1);
    assert.ok(bowReleaseMotion(0.2, power).back < followThrough.back);
    assert.equal(bowReleaseMotion(BOW_RELEASE_SECONDS, power), null);
  }
});

test('arrows in flight keep their own draw strength up to the first surface', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const eye = new Vector3(0, 3, 0);
  const camera = new FreeCamera('eye', eye, scene);
  const target = MeshBuilder.CreateBox('shadow', { width: 1, height: 5, depth: 0.5 }, scene);
  target.position.set(0, 2, 6);
  target.computeWorldMatrix(true);
  camera.setTarget(new Vector3(0, 3, 6));
  const impacts = [];
  const spells = createSpellEffects(
    scene,
    camera,
    () => eye,
    (mesh, seconds) => {
      assert.equal(mesh, target);
      impacts.push(seconds);
    },
  );

  for (const bowPower of [0, 0.5, 1]) {
    spells.fire({ id: 'blaster-j', origin: eye.clone(), bowPower });
  }
  spells.update(0.2);
  assert.deepEqual(impacts, [4.5]);
  spells.update(0.1);
  assert.deepEqual(impacts, [4.5, 2.875]);
  spells.update(0.47);
  assert.deepEqual(impacts, [4.5, 2.875, 1.25]);
  assert.equal(spells.snapshot().hits, 3);
  const [quick, half, full] = spells.snapshot().events;
  assert.deepEqual([quick.speed, half.speed, full.speed], [8, 20, 32]);
  assert.ok(quick.end[1] < half.end[1] && half.end[1] < full.end[1]);
  assert.ok(quick.end[1] < 1 && full.end[1] > 2.8);
});

test('a falling arrow sweeps against geometry that moves into its path after launch', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine),
    eye = new Vector3(0, 2, 0),
    camera = new FreeCamera('eye', eye, scene);
  camera.setTarget(new Vector3(0, 2, 10));
  const surface = MeshBuilder.CreateBox('thin ledge', { width: 3, height: 0.02, depth: 50 }, scene);
  surface.position.set(4, -0.01, 17);
  surface.computeWorldMatrix(true);
  const spells = createSpellEffects(scene, camera, () => eye);
  spells.fire({ id: 'blaster-j', origin: eye, bowPower: 1 });
  spells.update(0.25);
  const inFlight = spells.snapshot().events[0];
  assert.equal(inFlight.arrived, false);
  assert.ok(inFlight.end[1] < 2);
  surface.position.x = 0;
  surface.computeWorldMatrix(true);
  spells.update(0.5);
  const impact = spells.snapshot().events[0];
  assert.equal(impact.arrived, true);
  assert.equal(impact.mesh, 'thin ledge');
  assert.ok(Math.abs(impact.end[1]) < 0.001 && impact.end[2] > 19);
});

test('a lodged arrow, a surface seal and a shadow hit reuse the slot without leaking effects', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine),
    eye = new Vector3(0, 1, 0),
    camera = new FreeCamera('eye', eye, scene);
  const target = MeshBuilder.CreateBox('pillar', {}, scene);
  target.material = new StandardMaterial('Walnut', scene);
  target.position.set(0, 1, 3);
  target.computeWorldMatrix(true);
  camera.setTarget(target.position);
  const nocked = new TransformNode('LightArrow', scene);
  const shaft = MeshBuilder.CreateBox('shaft', { size: 0.03 }, scene);
  shaft.parent = nocked;
  shaft.isPickable = false;
  nocked.setEnabled(false);
  const contacts = [];
  const spells = createSpellEffects(
    scene,
    camera,
    () => eye,
    (_mesh, _duration, event) => contacts.push(event),
  );
  const lodged = () =>
    scene.transformNodes.find((n) => n.name === 'lodged dawn arrow' && n.isEnabled());
  const seal = () => scene.meshes.find((m) => m.name === 'impact seal' && m.isEnabled());
  spells.fire({ id: 'blaster-j', origin: eye, bowPower: 1, arrowModel: nocked });
  spells.update(0.3);
  assert.equal(contacts[0].surface, 'wood');
  assert.ok(
    lodged()
      ?.getChildMeshes()
      .every((m) => !m.isPickable && m.metadata.spellEffect),
  );
  assert.equal(nocked.isEnabled(), false);
  spells.update(1);
  assert.ok(lodged());
  target.material.name = 'Carved slate';
  spells.fire({ id: 'blaster-a', origin: eye });
  spells.update(0.3);
  assert.equal(contacts[1].surface, 'stone');
  assert.ok(seal());
  target.metadata = { inkThreat: true };
  spells.reset();
  assert.equal(seal(), undefined);
  spells.fire({ id: 'blaster-j', origin: eye, bowPower: 0.3, arrowModel: nocked });
  spells.update(0.3);
  assert.equal(contacts[2].surface, 'ink');
  assert.equal(lodged(), undefined);
  spells.update(1);
  assert.equal(spells.snapshot().active, 0);
});
