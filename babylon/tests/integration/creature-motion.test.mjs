import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ImportMeshAsync,
  MeshBuilder,
  NullEngine,
  Quaternion,
  Ray,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { ModelMotion } from '../../src/platform/babylon/actors/model-motion.ts';
import { bindInkApparitionSurfaces } from '../../src/platform/babylon/chapter/ink-apparition-surfaces.ts';

async function creature(name, scene) {
  const file = new URL('../../../public/assets/chapter-art/' + name + '.glb', import.meta.url);
  const model = await ImportMeshAsync(readFileSync(file), scene, {
    pluginExtension: '.glb',
    pluginOptions: { gltf: { animationStartMode: 0 } },
  });
  const joints = new Map(
    [...model.transformNodes, ...model.meshes].map((node) => [node.name, node]),
  );
  return { model, joints, groups: model.animationGroups };
}

test('shots hit the animated apparition mask, body or intervening cover on the first visible surface', async (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const { model, joints, groups } = await creature('ink-apparition', scene);
  const { head, surfaces } = bindInkApparitionSurfaces(model);
  assert.deepEqual(
    surfaces
      .filter((m) => m.metadata.hitRegion === 'head')
      .map((m) => m.material.name)
      .sort(),
    ['Fluid ink', 'Luminous ink', 'Split porcelain'],
  );
  for (const name of ['InkBody', 'InkReach', 'InkFold', 'InkFringe']) {
    const node = joints.get(name);
    const ownSurfaces = surfaces.filter((m) => m === node || m.parent === node);
    assert.ok(ownSurfaces.length > 0, name);
    assert.ok(
      ownSurfaces.every((m) => m.metadata.hitRegion === 'body' && m.metadata.inkThreat),
      name,
    );
  }
  // Aim along the mask's local forward axis so sampling is independent of glTF handedness.
  const aimAt = (node, local) => {
    const world = node.computeWorldMatrix(true);
    const target = Vector3.TransformCoordinates(local, world);
    const origin = Vector3.TransformCoordinates(local.add(new Vector3(0, 0, -3)), world);
    return new Ray(origin, target.subtract(origin).normalize(), 4);
  };
  const motion = new ModelMotion(groups, ['Hover', 'Glide', 'Windup', 'Recover', 'Stagger']);
  const maskSample = new Vector3(0.075, -0.1, -0.16);
  motion.loop('Hover', 0, 0);
  const atRest = aimAt(head, maskSample);
  for (const [clip, progress] of [
    ['Hover', 0],
    ['Windup', 1],
    ['Stagger', 0.35],
  ]) {
    motion.seek(clip, progress, 0.1);
    for (const mesh of surfaces) mesh.computeWorldMatrix(true);
    const face = aimAt(head, maskSample);
    assert.equal(scene.pickWithRay(face).pickedMesh?.metadata.hitRegion, 'head', clip);
    const torso = aimAt(joints.get('InkBody'), new Vector3(0, 1.22, -0.18));
    assert.equal(scene.pickWithRay(torso).pickedMesh?.metadata.hitRegion, 'body', clip);
    if (clip === 'Windup') assert.ok(Vector3.Distance(face.origin, atRest.origin) > 0.2);
  }
  const face = aimAt(head, maskSample);
  const cover = MeshBuilder.CreateBox('stone screen', { size: 0.4 }, scene);
  cover.position.copyFrom(face.origin.add(face.direction.scale(1)));
  cover.computeWorldMatrix(true);
  assert.equal(scene.pickWithRay(face).pickedMesh, cover);
  assert.equal(cover.metadata?.hitRegion, undefined);
});

test('the apparition reaches out at contact, recovers from the same pose and can stagger mid-stride', async () => {
  const engine = new NullEngine();
  try {
    const { joints, groups } = await creature('ink-apparition', new Scene(engine));
    const motion = new ModelMotion(groups, ['Hover', 'Glide', 'Windup', 'Recover', 'Stagger']);
    const arm = joints.get('InkReach'),
      body = joints.get('InkBody');
    const tip = new TransformNode('striking hand', body.getScene());
    tip.parent = arm;
    tip.position.set(0.13, -1.47, -0.23);
    const point = () => tip.computeWorldMatrix(true).getTranslation();
    motion.loop('Hover', 0, 0);
    const rest = point();
    motion.loop('Glide', 0.48, 0.1);
    assert.ok(Vector3.Distance(point(), rest) > 0.2);
    motion.seek('Windup', 1, 0.1);
    const contact = point();
    assert.ok(Vector3.Distance(contact, rest) > 0.8);
    motion.seek('Recover', 0, 0, false);
    assert.ok(Vector3.Distance(point(), contact) < 0.001);
    motion.seek('Recover', 1, 0.1);
    assert.ok(Vector3.Distance(point(), rest) < 0.001);
    motion.loop('Stagger', 0.14, 0.1);
    assert.ok(body.position.y < 0.035 && Vector3.Distance(point(), rest) > 0.3);
  } finally {
    engine.dispose();
  }
});

test('the leviathan sweeps opposite fins together while its trailing tendrils lag in phase', async () => {
  const engine = new NullEngine();
  try {
    const { joints, groups } = await creature('outer-leviathan', new Scene(engine));
    const motion = new ModelMotion(groups, ['VoidSwim']);
    const rotation = (name) => joints.get(name).rotationQuaternion;
    motion.loop('VoidSwim', 0, 0);
    const angle = (a, b) =>
      2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a.normalizeToNew(), b.normalizeToNew()))));
    const start = rotation('LeviathanFinL').clone();
    motion.loop('VoidSwim', 1.6, 0.1);
    const left = rotation('LeviathanFinL').toEulerAngles().x;
    const right = rotation('LeviathanFinR').toEulerAngles().x;
    assert.ok(left > 0.15 && Math.abs(left + right) < 0.001);
    assert.ok(angle(rotation('LeviathanTendril0'), rotation('LeviathanTendril7')) > 0.15);
    motion.loop('VoidSwim', 6.4, 0.1);
    assert.ok(angle(start, rotation('LeviathanFinL')) < 0.001);
  } finally {
    engine.dispose();
  }
});
