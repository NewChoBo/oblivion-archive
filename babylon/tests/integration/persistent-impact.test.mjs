import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FreeCamera,
  Matrix,
  MeshBuilder,
  NullEngine,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { createSpellEffects } from '../../src/platform/babylon/effects/spell-effects.ts';

function setup(t) {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine),
    eye = new Vector3(7, 3, -11),
    camera = new FreeCamera('eye', eye, scene);
  const surface = MeshBuilder.CreateBox('moving stone', { width: 3, height: 3, depth: 0.2 }, scene);
  surface.position.copyFrom(eye.add(new Vector3(0, 0, 3)));
  surface.material = new StandardMaterial('Carved slate', scene);
  surface.computeWorldMatrix(true);
  camera.setTarget(surface.position);
  const arrowModel = new TransformNode('arrow', scene),
    shaft = MeshBuilder.CreateBox('shaft', { width: 0.02, height: 0.02, depth: 0.625 }, scene);
  shaft.parent = arrowModel;
  shaft.isPickable = false;
  arrowModel.setEnabled(false);
  const spells = createSpellEffects(scene, camera, () => eye);
  return { scene, eye, camera, surface, arrowModel, spells };
}

test('impacts remain on the surface after the flash, fade and eventually disappear', (t) => {
  const { eye, arrowModel, spells } = setup(t);
  spells.fire({ id: 'blaster-j', origin: eye, bowPower: 1, arrowModel });
  spells.update(0.15);
  spells.fire({ id: 'blaster-a', origin: eye });
  spells.update(0.3);
  spells.update(1);
  assert.deepEqual(
    spells.snapshot().retained.map((p) => p.kind),
    ['arrow', 'wand'],
  );
  assert.equal(spells.snapshot().active, 0, 'transient flash/dust pool is already free');
  const faded = new Set();
  let retained = spells.snapshot().retained;
  let arrowOutlastedSeal = false;
  for (let elapsed = 0; retained.length && elapsed < 60; elapsed += 0.2) {
    spells.update(0.2);
    retained = spells.snapshot().retained;
    for (const { kind, visibility } of retained) {
      if (visibility > 0 && visibility < 1) faded.add(kind);
    }
    arrowOutlastedSeal ||= retained.length === 1 && retained[0].kind === 'arrow';
  }
  assert.deepEqual(faded, new Set(['arrow', 'wand']));
  assert.ok(arrowOutlastedSeal);
  assert.equal(retained.length, 0);
});

test('a lodged arrow and wand seal follow a translated, rotated and scaled hit surface', (t) => {
  const { scene, eye, surface, arrowModel, spells } = setup(t);
  for (const id of ['blaster-j', 'blaster-a']) {
    spells.fire({ id, origin: eye, bowPower: 1, arrowModel });
    spells.update(0.3);
  }
  const before = spells.snapshot().retained;
  const inverse = Matrix.Invert(surface.computeWorldMatrix(true));
  const local = before.map((p) =>
    Vector3.TransformCoordinates(Vector3.FromArray(p.position), inverse),
  );
  surface.position.addInPlaceFromFloats(2, -0.4, 1);
  surface.rotation.set(0.2, 0.7, -0.1);
  surface.scaling.set(0.8, 1.2, 0.6);
  const matrix = surface.computeWorldMatrix(true);
  spells.update(0.1);
  for (const [i, impact] of spells.snapshot().retained.entries()) {
    const expected = Vector3.TransformCoordinates(local[i], matrix);
    assert.ok(Vector3.Distance(expected, Vector3.FromArray(impact.position)) < 0.00001);
  }
  const retainedRoots = scene.transformNodes.filter(
    (n) => n.name === 'retained seal' || n.name === 'lodged dawn arrow',
  );
  assert.equal(retainedRoots.length, 2);
  assert.ok(
    retainedRoots.every(
      (root) =>
        root.parent === surface &&
        root.getChildMeshes().every((mesh) => !mesh.isPickable && mesh.metadata.spellEffect),
    ),
  );
  surface.setEnabled(false);
  spells.update(0.1);
  assert.equal(spells.snapshot().retained.length, 0);
});

test('disposing a hit surface does not destroy the reusable flight and burst meshes', (t) => {
  const { scene, eye, surface, arrowModel, spells } = setup(t);
  spells.fire({ id: 'blaster-a', origin: eye });
  spells.update(0.3);
  surface.dispose();
  spells.update(0.1);
  spells.reset();
  const next = MeshBuilder.CreateBox('next stone', { size: 2 }, scene);
  next.position.copyFrom(eye.add(new Vector3(0, 0, 3)));
  next.computeWorldMatrix(true);
  for (let i = 0; i < 12; i++) {
    spells.fire({ id: 'blaster-j', origin: eye, bowPower: 1, arrowModel });
    spells.update(0.4);
  }
  spells.fire({ id: 'blaster-a', origin: eye });
  spells.update(0.4);
  const { hits, retained } = spells.snapshot();
  assert.equal(hits, 13);
  assert.ok(retained.some((impact) => impact.kind === 'wand' && impact.mesh === next.name));
});

test('persistent impacts are bounded independently of the flight slots and reset without leaks', (t) => {
  const { scene, eye, arrowModel, spells } = setup(t);
  const shots = 60,
    step = 0.2;
  function fireAndReset() {
    let evicted = false;
    for (let i = 0; i < shots; i++) {
      const oldest = spells.snapshot().retained[0];
      spells.fire({ id: 'blaster-j', origin: eye, bowPower: 1, arrowModel });
      spells.update(step);
      if (
        oldest &&
        oldest.age + step < oldest.life &&
        spells.snapshot().retained[0]?.number > oldest.number
      )
        evicted = true;
    }
    const { hits, retained } = spells.snapshot();
    assert.equal(hits, shots);
    assert.ok(evicted, 'under load the oldest mark can be evicted before it expires');
    assert.equal(retained.at(-1)?.number, shots, 'the latest hit still leaves an impact');
    spells.reset();
    assert.equal(spells.snapshot().retained.length, 0);
    assert.equal(arrowModel.isEnabled(), false);
  }
  fireAndReset();
  const meshes = scene.meshes.length,
    nodes = scene.transformNodes.length;
  fireAndReset();
  assert.ok(scene.meshes.length <= meshes && scene.transformNodes.length <= nodes);
});
