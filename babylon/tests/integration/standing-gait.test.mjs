import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Matrix, TransformNode, Vector3 } from '@babylonjs/core';
import { humanoidScene } from '../fixtures/humanoid-scene.mjs';
import {
  instantiateHumanoid,
  loadSamplePlayer,
} from '../../src/platform/babylon/actors/sample-humanoid.ts';

async function playerRig(t) {
  const scene = humanoidScene(t);
  const root = new TransformNode('player', scene);
  const actor = await loadSamplePlayer(scene, root, (p) => p);
  const tool = { firearm: true, stroke: { alignment: 0 }, ready: 0, castAge: 1 };
  function step(x, z, speed, dt, distance = speed * dt) {
    root.position.x += x * distance;
    root.position.z += z * distance;
    actor.pose(
      dt,
      {
        localX: x,
        localZ: z,
        speed,
        distance,
        running: speed > 3.4,
        pitch: 0,
        crouch: 0,
        prone: 0,
        stride: Number(speed > 0),
        airborne: false,
        verticalSpeed: 0,
      },
      tool,
      null,
    );
    return actor.feet.map((foot) => foot.computeWorldMatrix(true).getTranslation());
  }
  return { root, scene, actor, step };
}

test('standing feet keep their pose at walk, reverse, diagonal, strafe, run and idle changes', async (t) => {
  const { step } = await playerRig(t);
  const d = Math.SQRT1_2;
  let feet = step(0, 1, 0, 0),
    worst = 0,
    peakStep = 0,
    closest = Infinity;
  for (const [x, z, speed] of [
    [0, 1, 3],
    [0, -1, 3],
    [d, -d, 3],
    [1, 0, 3],
    [-1, 0, 3],
    [-d, d, 3],
    [0, 1, 5],
    [0, 0, 0],
  ]) {
    const next = step(x, z, speed, 0);
    worst = Math.max(worst, ...next.map((p, i) => Vector3.Distance(p, feet[i])));
    for (let i = 0; i < 43; i++) {
      const nextFeet = step(x, z, speed, 1 / 120);
      peakStep = Math.max(peakStep, ...nextFeet.map((p, side) => Vector3.Distance(p, feet[side])));
      closest = Math.min(closest, Vector3.Distance(...nextFeet));
      feet = nextFeet;
    }
  }
  t.diagnostic('largest instantaneous ankle jump (m) ' + worst.toFixed(5));
  assert.ok(worst < 0.0001, 'an input change jumped an ankle ' + worst + ' m before time advanced');
  t.diagnostic(
    'peak travel per 120 Hz tick / closest ankles (m) ' +
      [peakStep, closest].map((n) => n.toFixed(4)).join(' / '),
  );
  assert.ok(peakStep < 0.145 && closest > 0.075, 'feet snapped or overlapped during a turn');
});

test('both feet alternate support and track the floor in sustained movement', async (t) => {
  const { step, actor } = await playerRig(t);
  const skin = actor.meshes.find((m) => m.skeleton);
  const heightScale = skin.computeWorldMatrix(true).m[5];
  const d = Math.SQRT1_2,
    dt = 1 / 120;
  const results = [];
  for (const [name, x, z, speed] of [
    ['walk', 0, 1, 3],
    ['reverse', 0, -1, 3],
    ['left', -1, 0, 3],
    ['right', 1, 0, 3],
    ['front-left', -d, d, 3],
    ['front-right', d, d, 3],
    ['back-left', -d, -d, 3],
    ['back-right', d, -d, 3],
    ['run diagonal', d, d, 5],
    ['back run diagonal', d, -d, 5],
    ['back run', 0, -1, 5],
    ['run', 0, 1, 5],
  ]) {
    let previous,
      previousSide,
      drift = 0,
      count = 0,
      gap = Infinity,
      soleHigh = -1,
      soleLow = 1;
    const contacts = new Set();
    for (let i = 0; i < 240; i++) {
      const feet = step(x, z, speed, dt),
        side = actor.state().supportFoot;
      if (i > 45) {
        // Check the displayed boot mesh, including foot roll. Running has a real flight phase.
        if (i % 5 === 0) {
          skin.skeleton.prepare(true);
          const p = skin.getPositionData(true);
          let floor = Infinity;
          for (let v = 1; v < p.length; v += 3) floor = Math.min(floor, p[v]);
          floor *= heightScale;
          soleHigh = Math.max(soleHigh, floor);
          soleLow = Math.min(soleLow, floor);
        }
        gap = Math.min(gap, Vector3.Distance(...feet));
        if (side != null) contacts.add(side);
        if (side != null && side === previousSide) {
          drift += Math.hypot(feet[side].x - previous[side].x, feet[side].z - previous[side].z);
          count++;
        }
      }
      previous = feet;
      previousSide = side;
    }
    results.push({
      name,
      contacts: contacts.size,
      gap: +gap.toFixed(3),
      slip: +(drift / (count * dt)).toFixed(3),
      speed,
      sole: [soleLow, soleHigh].map((v) => +v.toFixed(3)),
    });
  }
  t.diagnostic(JSON.stringify(results));
  for (const r of results) {
    const label = JSON.stringify(r);
    assert.ok(r.contacts === 2 && r.gap > 0.08 && r.slip < 0.65, label);
    assert.ok(r.sole[0] > -0.025 && r.sole[1] < (r.speed === 3 ? 0.025 : 0.11), label);
  }
});

test('ally and enemy skinning follows the shipped walking keys through subframes and the loop seam', async (t) => {
  const { scene } = await playerRig(t);
  const { bones } = JSON.parse(
    readFileSync(new URL('../../../public/assets/characters/dummy3.babylon', import.meta.url)),
  ).skeletons[0];
  const footIndex = bones.findIndex((b) => b.name.endsWith(':LeftFoot'));
  function authored(frame) {
    let matrix = Matrix.Identity();
    for (let i = footIndex; i >= 0; i = bones[i].parentBoneIndex) {
      matrix = matrix.multiply(Matrix.FromArray(bones[i].animation.keys[frame].values));
    }
    return matrix.getTranslation();
  }
  for (const role of ['ally', 'enemy']) {
    const root = new TransformNode(role, scene);
    const actor = await instantiateHumanoid(scene, root, role);
    const skin = actor.meshes.find((m) => m.skeleton);
    const foot = skin.skeleton.bones[footIndex];
    function point() {
      skin.computeWorldMatrix(true);
      skin.skeleton.prepare(true);
      skin.skeleton.computeAbsoluteMatrices(true);
      return foot.getAbsolutePosition(skin).scale(1 / actor.mount.scaling.y);
    }
    const stride = 1.72 * actor.mount.scaling.y;
    actor.update(1, false, 0.2, 0, false, 0);
    let peak = 0;
    // Frame 125 is right midstance, the next key is the beginning of the next
    // cycle (91). Check all 35 source intervals against independent FK.
    for (let i = 0; i < 35; i++) {
      const a = authored(91 + ((34 + i) % 35)),
        b = authored(91 + (i % 35));
      assert.ok(Vector3.Distance(point(), a) < 0.0001, role + ' left ankle on key ' + i);
      actor.update(1, false, 1 / 120, 0, false, stride / 70);
      peak = Math.max(peak, Vector3.Distance(point(), Vector3.Center(a, b)));
      actor.update(1, false, 1 / 120, 0, false, stride / 70);
    }
    assert.ok(peak < 0.004, role + ' between-key FK error ' + peak);
    assert.ok(Vector3.Distance(point(), authored(125)) < 0.0001);
    const held = point();
    actor.update(1, false, 1 / 30, 0, false, 0);
    assert.ok(Vector3.Distance(held, point()) < 0.00001, 'no stride without resolved displacement');
  }
});
