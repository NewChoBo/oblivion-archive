import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FreeCamera,
  HemisphericLight,
  Light,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  PointLight,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { ScopedPointLight } from '../../src/platform/babylon/lighting/scoped-point-light.ts';
import { LightingVariants } from '../../src/platform/babylon/rendering/lighting-variants.ts';
import { prepareSceneLighting } from '../../src/platform/babylon/rendering/scene-warmup.ts';

test('crossing a light boundary preserves the fixed lights and priority on shared receivers', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const near = MeshBuilder.CreateBox('near', {}, scene);
  const far = MeshBuilder.CreateBox('far', {}, scene);
  const fixture = new PointLight('fixture', Vector3.Zero(), scene);
  const torch = new ScopedPointLight('torch', Vector3.Zero(), scene);
  const glow = new ScopedPointLight('glow', Vector3.Zero(), scene);
  glow.renderPriority = -1;
  torch.setReceivers([far]);
  glow.setReceivers([near]);
  assert.deepEqual(near.lightSources, [fixture, glow]);

  torch.setReceivers([near]);
  assert.deepEqual(near.lightSources, [fixture, torch, glow]);
  assert.deepEqual(far.lightSources, [fixture]);
  torch.setEnabled(false);
  assert.deepEqual(near.lightSources, [fixture, glow]);
  torch.setEnabled(true);
  assert.deepEqual(near.lightSources, [fixture, torch, glow]);

  torch.setReceivers([]);
  assert.ok(far.lightSources.includes(torch), 'an empty inclusion list lights every receiver');
  torch.excludedMeshes = [near];
  torch.setReceivers([near, far]);
  assert.deepEqual(near.lightSources, [fixture, glow]);
  assert.deepEqual(far.lightSources, [fixture, torch]);
});

test('toggling a scoped light or its parent only revisits current receivers', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const near = MeshBuilder.CreateBox('near', {}, scene);
  const next = MeshBuilder.CreateBox('next', {}, scene);
  const outside = MeshBuilder.CreateBox('outside', {}, scene);
  const hand = new TransformNode('hand', scene);
  const torch = new ScopedPointLight('torch', Vector3.Zero(), scene);
  torch.setReceivers([near]);
  torch.parent = hand;
  const changes = [];
  torch.onEffectiveEnabledStateChangedObservable.add((enabled) => changes.push(enabled));
  const visits = t.mock.method(outside, '_resyncLightSource');
  const nearVisits = t.mock.method(near, '_resyncLightSource');
  const nextVisits = t.mock.method(next, '_resyncLightSource');

  hand.setEnabled(false);
  torch.setEnabled(false);
  torch.setReceivers([next]);
  torch.setEnabled(true);
  assert.deepEqual(near.lightSources, []);
  assert.deepEqual(next.lightSources, []);
  assert.equal(nearVisits.mock.callCount(), 1);
  assert.equal(nextVisits.mock.callCount(), 0);

  hand.setEnabled(true);
  torch.setReceivers([next]);
  torch.intensity = 0.4;
  assert.deepEqual(next.lightSources, [torch]);
  assert.deepEqual(changes, [false, true]);
  assert.equal(nextVisits.mock.callCount(), 1);
  assert.equal(visits.mock.callCount(), 0);
});

test('switching an effect light off returns both surface materials to their prepared shader', async (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const camera = new FreeCamera('eye', Vector3.Zero(), scene);
  new HemisphericLight('ambient', Vector3.Up(), scene);
  const glow = new PointLight('glow', Vector3.Zero(), scene);
  glow.falloffType = Light.FALLOFF_GLTF;
  glow.setEnabled(false);
  const surfaces = [PBRMaterial, StandardMaterial].map((MaterialType) => {
    const mesh = MeshBuilder.CreateBox('receiver', {}, scene);
    mesh.material = new MaterialType('stone', scene);
    new LightingVariants(mesh.material);
    return mesh;
  });
  const shaders = () => surfaces.map((mesh) => mesh.subMeshes[0].effect.defines);
  await prepareSceneLighting(scene, camera, async (draw) => {
    await draw();
    const unlit = shaders();
    glow.setEnabled(true);
    await draw();
    assert.ok(shaders().every((shader, i) => shader !== unlit[i]));
    glow.setEnabled(false);
    await draw();
    assert.deepEqual(shaders(), unlit);
  });
});
