import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, NullEngine, Ray, Scene, Vector3 } from '@babylonjs/core';
import { focusedInteraction } from '../../src/platform/babylon/player/interaction-focus.ts';

function room(t) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  t.after(() => engine.dispose());
  const eye = new Vector3(0, 1.5, 0),
    meshes = new Map(),
    colliders = [];
  function box(id, x, y, z, size = 0.32) {
    const mesh = MeshBuilder.CreateBox(id, { size }, scene);
    mesh.position.set(x, y, z);
    mesh.computeWorldMatrix(true);
    meshes.set(id, [mesh]);
    return mesh;
  }
  function focus(ids, origin, direction) {
    return focusedInteraction(
      ids.map((id) => ({ id })),
      meshes,
      new Ray(origin, direction.normalize()),
      eye,
      colliders,
    )?.id;
  }
  return { eye, box, colliders, focus };
}

test('a nearer record behind the character cannot take focus from the door in either view', (t) => {
  const { eye, box, focus } = room(t);
  box('door', 0, 1.5, 1);
  box('record', 0, 1.5, -0.3);
  for (const camera of [eye, new Vector3(0, 1.5, -2)]) {
    assert.equal(focus(['record', 'door'], camera, Vector3.Forward()), 'door');
    assert.equal(focus(['record'], camera, Vector3.Forward()), undefined);
    assert.equal(focus(['record', 'door'], camera, Vector3.Up()), undefined);
  }
  assert.equal(focus(['door', 'record'], eye, Vector3.Backward()), 'record');
});

test('the shoulder reticle picks the visible surface, including its edges and depth order', (t) => {
  const { box, focus } = room(t);
  const camera = new Vector3(0.7, 1.4, -2);
  box('left', 0, 1.4, 1);
  box('right', 0.84, 1.4, 1);
  box('far', 0.7, 1.4, 2);
  assert.equal(focus(['left', 'far', 'right'], camera, Vector3.Forward()), 'right');
  assert.equal(focus(['right', 'left', 'far'], camera, Vector3.Forward()), 'right');
  assert.equal(focus(['left', 'right'], camera, new Vector3(-0.7, 0, 3)), 'left');
});

test('solid surfaces block both sight and reach, and opening the door clears the obstruction', (t) => {
  const { eye, box, colliders, focus } = room(t);
  box('page', 0, 1.5, 1);
  const door = box('door', 0, 1.5, 0.45);
  door.checkCollisions = true;
  colliders.push(door);
  const shoulder = new Vector3(1, 1.5, 0.75),
    towardPage = new Vector3(-1, 0, 0.25);
  assert.equal(focus(['page'], eye, Vector3.Forward()), undefined);
  assert.equal(focus(['page'], shoulder, towardPage), undefined);
  assert.equal(focus(['page', 'door'], eye, Vector3.Forward()), 'door');
  door.setEnabled(false);
  assert.equal(focus(['page', 'door'], shoulder, towardPage), 'page');
  assert.equal(focus(['page'], eye, Vector3.Forward()), 'page');
});
