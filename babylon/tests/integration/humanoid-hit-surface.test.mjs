import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBuilder, Ray, TransformNode, Vector3 } from '@babylonjs/core';
import { instantiateHumanoid } from '../../src/platform/babylon/actors/sample-humanoid.ts';
import { reach } from '../../src/platform/babylon/actors/joint-reach.ts';
import { humanoidScene } from '../fixtures/humanoid-scene.mjs';

const hittable = (mesh) => mesh.isPickable && mesh.isVisible && mesh.isEnabled();
const through = (point, direction = new Vector3(0, 0, -1)) =>
  new Ray(point.subtract(direction.scale(2)), direction, 4);

async function target(scene) {
  const root = new TransformNode('enemy', scene);
  const actor = await instantiateHumanoid(scene, root, 'enemy');
  const skin = actor.meshes.find((mesh) => mesh.skeleton);
  const skeleton = skin.skeleton;
  const prepare = () => {
    for (const mesh of root.getChildMeshes()) mesh.computeWorldMatrix(true);
    skeleton.prepare(true);
    skeleton.computeAbsoluteMatrices(true);
    skin.refreshBoundingInfo({ applySkeleton: true });
  };
  const bone = (name) =>
    skeleton.bones.find((b) => b.name.endsWith(':' + name)).getAbsolutePosition(skin);
  const face = () => Vector3.Center(bone('LeftEye'), bone('RightEye'));
  prepare();
  return { root, actor, skin, prepare, bone, face };
}

test('idle, running and turned bots register the face, shoulders and chest at the drawn skin', async (t) => {
  const scene = humanoidScene(t);
  const { actor, root, skin, prepare, face, bone } = await target(scene);
  assert.equal(skin.isPickable, false);
  for (const moving of [false, true]) {
    if (moving) {
      root.position.set(-1.8, 0.4, 2.1);
      root.rotation.y = 0.8;
      for (let i = 0; i < 19; i++) actor.update(3, false, 1 / 60, 0, true);
    }
    prepare();
    const direction = new Vector3(-Math.sin(root.rotation.y), 0, -Math.cos(root.rotation.y));
    for (const [point, region, tolerance] of [
      [face(), 'head', 0.015],
      [bone('Spine2'), 'body', 0.04],
      [bone('LeftArm'), 'body', 0.04],
      [bone('RightForeArm'), 'body', 0.04],
    ]) {
      const ray = through(point, direction);
      const visual = ray.intersectsMesh(skin, false);
      assert.ok(visual.hit);
      const pick = scene.pickWithRay(ray, hittable);
      assert.equal(pick.pickedMesh?.metadata.hitRegion, region);
      assert.ok(
        Math.abs(pick.distance - visual.distance) < tolerance,
        'contact must follow the skinned surface',
      );
    }
    const outside = face().add(
      new Vector3(Math.cos(root.rotation.y) * 0.16, 0, -Math.sin(root.rotation.y) * 0.16),
    );
    assert.equal(scene.pickWithRay(through(outside, direction), hittable).hit, false);
  }
});

test('a hand raised in front of the face, a wall and a disabled enemy obey nearest-surface picking', async (t) => {
  const scene = humanoidScene(t);
  const { actor, root, skin, prepare, face } = await target(scene);
  const ray = through(face());
  assert.equal(scene.pickWithRay(ray, hittable).pickedMesh.metadata.hitRegion, 'head');
  // Game locomotion is sampled before the attack overlay writes to the same joints.
  actor.update(0, false, 1 / 60);
  reach(
    ['RightArm', 'RightForeArm', 'RightHand'].map((name) => actor.joints.get(name)),
    face().add(new Vector3(0, 0, 0.16)),
    new Vector3(1, 0.2, 0),
  );
  prepare();
  const hand = scene.pickWithRay(ray, hittable);
  const behind = scene.pickWithRay(
    ray,
    (mesh) => hittable(mesh) && mesh.metadata?.hitRegion === 'head',
  );
  assert.equal(hand.pickedMesh?.metadata.hitRegion, 'body');
  assert.ok(behind.hit && behind.distance > hand.distance);
  assert.ok(Math.abs(hand.distance - ray.intersectsMesh(skin, false).distance) < 0.04);
  const wall = MeshBuilder.CreateBox('cover', { size: 0.6 }, scene);
  wall.position.copyFrom(face()).z += 0.8;
  wall.computeWorldMatrix(true);
  assert.equal(scene.pickWithRay(ray, hittable).pickedMesh, wall);
  wall.setEnabled(false);
  root.setEnabled(false);
  assert.equal(scene.pickWithRay(ray, hittable).hit, false);
  root.setEnabled(true);
  assert.equal(scene.pickWithRay(ray, hittable).pickedMesh.metadata.hitRegion, 'body');
});

test('two bots share the reduced topology and keep independent hit triangles throughout the same frame', async (t) => {
  const scene = humanoidScene(t);
  const guard = await target(scene);
  const runner = await target(scene);
  runner.root.position.z = -0.8;
  for (let i = 0; i < 19; i++) runner.actor.update(3, false, 1 / 60, 0, true);
  runner.prepare();
  const regions = (actor) => actor.root.getChildMeshes().filter((mesh) => mesh.metadata?.hitRegion);
  for (const [index, mesh] of regions(guard).entries()) {
    assert.equal(mesh.geometry, regions(runner)[index].geometry);
    assert.equal(mesh.metadata.castShadow, false);
  }
  const nearest = through(guard.face());
  const nearHit = scene.pickWithRay(nearest, hittable);
  assert.ok(guard.root.getChildMeshes().includes(nearHit.pickedMesh));
  guard.root.setEnabled(false);
  const farHit = scene.pickWithRay(through(runner.face()), hittable);
  assert.equal(farHit.pickedMesh.metadata.hitRegion, 'head');
  assert.ok(runner.root.getChildMeshes().includes(farHit.pickedMesh));
  assert.ok(
    Math.abs(farHit.distance - through(runner.face()).intersectsMesh(runner.skin).distance) < 0.015,
  );
  guard.root.setEnabled(true);
  const again = scene.pickWithRay(nearest, hittable);
  assert.equal(again.pickedMesh, nearHit.pickedMesh);
  assert.equal(again.distance, nearHit.distance);
});
