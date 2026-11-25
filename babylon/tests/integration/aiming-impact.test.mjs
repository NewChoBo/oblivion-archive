import assert from 'node:assert/strict';
import test from 'node:test';
import { FreeCamera, MeshBuilder, NullEngine, PBRMaterial, Scene, Vector3 } from '@babylonjs/core';
import { createEnvironmentMaterials } from '../../src/platform/babylon/chapter/chapter-scenery.ts';
import { createSpellEffects } from '../../src/platform/babylon/effects/spell-effects.ts';

function setup(t, shoulder = 0) {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine),
    eye = new Vector3(23, 5, -41);
  const camera = new FreeCamera(
    'eye',
    eye.add(new Vector3(shoulder, 0, shoulder === 0 ? 0 : -2.85)),
    scene,
  );
  return { scene, eye, camera, spells: createSpellEffects(scene, camera, () => eye) };
}
const close = (a, b) =>
  assert.ok(Vector3.Distance(Vector3.FromArray(a), b) < 0.0001, `${a} != ${b}`);

test('first person and both shoulder cameras converge on a world-space target beyond the old camera range', (t) => {
  for (const shoulder of [0, -0.76, 0.76]) {
    const { scene, eye, camera, spells } = setup(t, shoulder);
    const target = MeshBuilder.CreateBox(
      'narrow target',
      { width: 0.06, height: 0.06, depth: 0.06 },
      scene,
    );
    target.position.copyFrom(eye.add(new Vector3(0, 0, 9)));
    target.computeWorldMatrix(true);
    camera.setTarget(target.position);
    const aim = spells.reticlePoint().clone();
    spells.fire({ id: 'blaster-a', origin: eye.add(new Vector3(0.25, 0, 0.5)) });
    spells.update(1);
    const shot = spells.snapshot().events[0];
    assert.equal(shot.mesh, 'narrow target', `shoulder ${shoulder}`);
    close(shot.end, aim);
  }
});

test('spell impacts keep the prefab surface type after a mesh or material rename', (t) => {
  const { scene, eye, camera, spells } = setup(t);
  const materials = createEnvironmentMaterials(scene, (name) => new PBRMaterial(name, scene), [
    'darkWood',
    'chestHardware',
    'rampartStone',
  ]);
  const target = MeshBuilder.CreateBox('bookcase', {}, scene);
  target.position.copyFrom(eye.add(new Vector3(0, 0, 3)));
  target.computeWorldMatrix(true);
  camera.setTarget(target.position);
  for (const [id, expected] of [
    ['darkWood', 'wood'],
    ['chestHardware', 'metal'],
    ['rampartStone', 'stone'],
  ]) {
    target.material = materials[id];
    target.material.name = 'decoration';
    spells.fire({ id: 'blaster-a', origin: eye.clone() });
    spells.update(1);
    assert.equal(spells.snapshot().events.at(-1).surface, expected);
  }
});

test('aim updates after a same-frame camera turn instead of reusing the previous frame point', (t) => {
  const { scene, eye, camera, spells } = setup(t);
  const target = MeshBuilder.CreateBox('new target', { size: 1 }, scene);
  target.position.copyFrom(eye.add(new Vector3(5, 0, 5)));
  target.computeWorldMatrix(true);
  camera.setTarget(eye.add(new Vector3(0, 0, 10)));
  spells.reticlePoint();
  camera.setTarget(target.position);
  spells.fire({ id: 'blaster-a', origin: eye.clone() });
  spells.update(1);
  assert.equal(spells.snapshot().events[0].mesh, 'new target');
});

test('a low barrier invisible to the camera aim still blocks the muzzle path on both shoulders', (t) => {
  for (const shoulder of [-0.76, 0.76]) {
    const { scene, eye, camera, spells } = setup(t, shoulder);
    const target = MeshBuilder.CreateBox('distant target', { size: 1 }, scene);
    target.position.copyFrom(eye.add(new Vector3(0, 0, 7)));
    target.computeWorldMatrix(true);
    const barrier = MeshBuilder.CreateBox(
      'low barrier',
      { width: 3, height: 1, depth: 0.05 },
      scene,
    );
    barrier.position.copyFrom(eye.add(new Vector3(0, -0.9, 1.2)));
    barrier.computeWorldMatrix(true);
    camera.setTarget(target.position);
    spells.fire({ id: 'blaster-a', origin: eye.add(new Vector3(0.25, -0.8, 0.5)) });
    spells.update(1);
    const shot = spells.snapshot().events[0];
    assert.equal(shot.cameraMesh, 'distant target');
    assert.equal(shot.mesh, 'low barrier');
  }
});

test('an obstructed eye-to-tip segment hits the wall before a weapon poking through it', (t) => {
  const { scene, eye, camera, spells } = setup(t);
  const wall = MeshBuilder.CreateBox('near wall', { width: 4, height: 4, depth: 0.05 }, scene);
  wall.position.copyFrom(eye.add(new Vector3(0, 0, 0.8)));
  wall.computeWorldMatrix(true);
  camera.setTarget(eye.add(new Vector3(0, 0, 4)));
  for (const id of ['blaster-a', 'blaster-j']) {
    spells.fire({ id, origin: eye.add(new Vector3(0.15, 0, 1.2)), bowPower: 1 });
    spells.update(0.1);
    const shot = spells.snapshot().events.at(-1);
    assert.equal(shot.mesh, 'near wall');
    assert.equal(shot.muzzleBlocked, true);
    assert.ok(shot.end[2] < eye.z + 0.8);
  }
});

test('both shoulder views preserve draw-dependent arrow drop from the physical muzzle', (t) => {
  for (const shoulder of [-0.76, 0.76]) {
    const { scene, eye, camera, spells } = setup(t, shoulder);
    const wall = MeshBuilder.CreateBox('range wall', { width: 8, height: 14, depth: 0.1 }, scene);
    wall.position.copyFrom(eye.add(new Vector3(0, 0, 8)));
    wall.computeWorldMatrix(true);
    camera.setTarget(wall.position);
    for (const bowPower of [0.2, 1]) {
      spells.fire({ id: 'blaster-j', origin: eye.add(new Vector3(0.25, -0.2, 0.5)), bowPower });
      spells.update(1);
    }
    const [quick, full] = spells.snapshot().events;
    assert.equal(quick.mesh, 'range wall');
    assert.equal(full.mesh, 'range wall');
    assert.ok(quick.end[1] < full.end[1] - 0.8);
    assert.ok(full.end[1] < full.aim[1] - 0.15);
    assert.ok(Math.abs(quick.end[0] - full.end[0]) < 0.01);
  }
});
