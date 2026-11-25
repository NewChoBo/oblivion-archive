import assert from 'node:assert/strict';
import test from 'node:test';
import { Matrix, MeshBuilder, PBRMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { MiraMotion } from '../../src/platform/babylon/actors/ally-motion.ts';
import { createArenaObjectives } from '../../src/platform/babylon/arena/arena-objectives.ts';
import { instantiateHumanoid } from '../../src/platform/babylon/actors/sample-humanoid.ts';
import { getLocale, setLocale } from '../../src/content/locales/locale.ts';
import { experienceText } from '../../src/content/locales/experience.ts';
import { BotNavigation, BotRoute, footprint } from '../../src/game/ai/bot-navigation.ts';
import { humanoidScene } from '../fixtures/humanoid-scene.mjs';

function setup(t) {
  const scene = humanoidScene(t);
  const material = (name) => new PBRMaterial(name, scene);
  const mesh = (name) => MeshBuilder.CreateBox(name, { size: 0.2 }, scene);
  return { scene, material, sign: (name) => ({ mesh: mesh(name), update() {} }) };
}

test('an arena site keeps its mesh name while its plaque follows the active language', (t) => {
  const previous = getLocale();
  t.after(() => setLocale(previous));
  const captions = [];
  for (const locale of ['en', 'ko']) {
    setLocale(locale);
    const { scene, material, sign } = setup(t);
    createArenaObjectives(scene, {
      level: { objectives: { bombSites: [{ id: 'site-a', position: [0, 0, 0] }] } },
      match: {},
      kind: 'bomb',
      material,
      targets: [],
      sign(name, caption) {
        captions.push(caption);
        return sign(name);
      },
    });
    assert.ok(scene.getMeshByName('site-a ring'));
    assert.ok(scene.getMeshByName('site-a plaque'));
    assert.equal(captions.at(-1), experienceText('site-a'));
  }
  assert.notEqual(captions[0], captions[1]);
});

// Measure the bones used by the skinned mesh, in the actor's own coordinate system.
function bonePoint(root, name) {
  const skin = root.getChildMeshes().find((mesh) => mesh.skeleton);
  skin.computeWorldMatrix(true);
  skin.skeleton.prepare(true);
  skin.skeleton.computeAbsoluteMatrices(true);
  const bone = skin.skeleton.bones.find((b) => b.name.endsWith(':' + name));
  return Vector3.TransformCoordinates(
    bone.getAbsolutePosition(skin),
    Matrix.Invert(root.computeWorldMatrix(true)),
  );
}

test('Mira idly moves her hands and extends her right hand to guide the player during a conversation', async (t) => {
  const { scene } = setup(t);
  const root = new TransformNode('Mira', scene);
  root.position.set(-4.5, 0, -2.5);
  root.rotation.y = -0.4;
  const motion = new MiraMotion(await instantiateHumanoid(scene, root, 'ally'), root);
  const hand = () => bonePoint(root, 'RightHand');
  const initial = hand();
  const ticks = (count) => {
    for (let i = 0; i < count; i++) motion.update(1 / 60);
  };
  ticks(40);
  const idle = hand();
  assert.ok(Vector3.Distance(initial, idle) > 0.015);
  motion.talk();
  ticks(25);
  const offered = hand();
  assert.ok(offered.y > idle.y + 0.16 && offered.z > idle.z + 0.05);
  motion.talk();
  ticks(55);
  assert.ok(hand().x > offered.x + 0.09, 'the gesture continues outward on a repeated interaction');
  ticks(65);
  assert.ok(Vector3.Distance(initial, hand()) < 0.09, 'the arm settles back at the waist');
  const before = hand();
  motion.update(0);
  assert.ok(Vector3.Distance(before, hand()) < 0.00001);
});

test('a captive shields their face, releases the authored walking arms while following, and huddles again at round reset', async (t) => {
  const { scene, material, sign } = setup(t);
  const match = { escorting: false },
    targets = [],
    cell = [2, 0, -3];
  const navigation = new BotNavigation(footprint(4, 0, 20, 20), []),
    route = new BotRoute();
  const objectives = createArenaObjectives(scene, {
    level: { objectives: { bombSites: [], hostage: cell, extraction: [6, 0, -3] } },
    match,
    kind: 'rescue',
    material,
    sign,
    cover: [],
    targets,
    moveEscort: (pos, target, step) => route.advance(navigation, pos, target, step) > 0,
  });
  await objectives.load();
  objectives.reset();
  const captive = scene.getTransformNodeByName('arena hostage');
  const reference = new TransformNode('authored walk reference', scene);
  const plain = await instantiateHumanoid(scene, reference, 'ally');
  const point = (name) => bonePoint(captive, name);
  const initial = point('Head'),
    guard = point('RightHand');
  assert.ok(initial.y < bonePoint(reference, 'Head').y - 0.07);
  assert.ok(Vector3.Distance(guard, initial) < 0.3 && guard.y > 1);
  match.escorting = true;
  const player = new Vector3(12, 0.86, -3),
    dt = 1 / 60;
  const step = () => {
    const x = captive.position.x;
    objectives.tick(dt, player, []);
    plain.update((captive.position.x - x) / dt, false, dt);
  };
  step();
  assert.ok(
    Vector3.Distance(guard, point('RightHand')) < 0.12,
    'the guard does not drop in one frame',
  );
  for (let i = 1; i < 60; i++) step();
  assert.ok(
    captive.position.x > cell[0] + 2 &&
      targets.find((t) => t.id === 'hostage').position[0] === captive.position.x,
  );
  assert.equal(plain.clip, 'YBot_Walk');
  for (const joint of ['LeftHand', 'RightHand', 'Head', 'LeftFoot', 'RightFoot']) {
    assert.ok(
      Vector3.Distance(point(joint), bonePoint(reference, joint)) < 0.0001,
      joint + ' follows the authored walking clip',
    );
  }
  const stride = point('RightFoot');
  const heldHand = point('RightHand');
  objectives.tick(0, player, []);
  assert.ok(
    Vector3.Distance(heldHand, point('RightHand')) < 0.00001 &&
      Vector3.Distance(stride, point('RightFoot')) < 0.00001,
  );
  for (let i = 0; i < 12; i++) step();
  assert.ok(Vector3.Distance(point('RightFoot'), stride) > 0.08);
  const stopped = captive.position.clone();
  for (let i = 0; i < 35; i++) objectives.tick(dt, stopped, []);
  assert.ok(captive.position.equals(stopped));
  assert.ok(point('Head').y > initial.y + 0.04);
  const extraction = new Vector3(6, 0.86, -3);
  let result;
  for (let i = 0; i < 45; i++) result = objectives.tick(dt, extraction, []);
  assert.equal(result.extracted, true);
  match.escorting = false;
  objectives.reset();
  assert.deepEqual(captive.position.asArray(), cell);
  assert.ok(
    Vector3.Distance(guard, point('RightHand')) < 0.04 &&
      Vector3.Distance(initial, point('Head')) < 0.04,
  );
});
