import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  PointLight,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { createTorch } from '../../src/platform/babylon/equipment/torch.ts';
import { createWallLightOcclusion } from '../../src/platform/babylon/rendering/opaque-occlusion.ts';
import { reserveWorldLightSlots } from '../../src/platform/babylon/lighting/light-surfaces.ts';

test('the torch turns its flame and local light on and off together', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const hand = new TransformNode('hand', scene);
  const wall = MeshBuilder.CreateBox('near wall', {}, scene);
  wall.material = new PBRMaterial('stone', scene);
  const torch = createTorch(scene, hand);
  const light = scene.getLightByName('handheld torch light');
  const flame = scene.getTransformNodeByName('torch flame');
  assert.equal(light.isEnabled(), false);
  assert.equal(flame.isEnabled(), false);

  torch.update({ lit: true, clock: 0.5 });
  assert.equal(flame.isEnabled(), true);
  assert.equal(light.isEnabled(), true);
  assert.ok(light.intensity > 0 && light.range > 0);
  const before = torch.lightState();
  hand.position.set(2, 1, -3);
  torch.update({ lit: true, clock: 0.51 });
  const after = torch.lightState();
  const [x, y, z] = after.position.map((value, index) => value - before.position[index]);
  assert.ok(Math.abs(x - 2) < 1e-5 && Math.abs(y - 1) < 1e-5 && Math.abs(z + 3) < 1e-5);

  const receiverIds = () => light.includedOnlyMeshes.map((mesh) => mesh.uniqueId);
  const receivers = receiverIds();
  assert.ok(receivers.includes(wall.uniqueId));
  const meshSync = t.mock.method(wall, '_resyncLightSource');
  torch.update({ lit: false, equipped: true, clock: 0.52 });
  assert.equal(torch.lightState().lit, false);
  assert.equal(flame.isEnabled(), false);
  assert.equal(light.intensity, 0);
  assert.deepEqual(receiverIds(), receivers);

  torch.update({ lit: true, equipped: true, clock: 0.53 });
  assert.equal(flame.isEnabled(), true);
  assert.deepEqual(receiverIds(), receivers);
  assert.equal(meshSync.mock.callCount(), 0, 're-equipping in place keeps material light bindings');

  torch.update({ lit: false, clock: 1 });
  assert.equal(flame.isEnabled(), false);
  assert.equal(torch.lightState().lit, false);
  assert.equal(light.intensity, 0);
});

test('moving the flame commits its shadow map on the same frame', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const hand = new TransformNode('hand', scene);
  const torch = createTorch(scene, hand);
  const light = scene.getLightByName('handheld torch light');
  const map = light.getShadowGenerator().getShadowMap();
  const refresh = t.mock.method(map, 'resetRefreshCounter');

  torch.update({ lit: true, clock: 0 });
  assert.equal(refresh.mock.callCount(), 1);
  const start = light.position.clone();
  hand.position.x = 0.0005;
  torch.update({ lit: true, clock: 0.005 });
  assert.equal(refresh.mock.callCount(), 1);
  assert.ok(light.position.equals(start));

  for (let frame = 1; frame <= 3; frame++) {
    hand.position.x = 0.04 * frame;
    torch.update({ lit: true, clock: frame / 60 });
    assert.equal(refresh.mock.callCount(), frame + 1);
    assert.ok(Math.abs(light.position.x - hand.position.x) < 1e-5);
  }
  torch.update({ lit: true, clock: 0.08 });
  assert.equal(refresh.mock.callCount(), 4);
  torch.update({ lit: false, clock: 0.09 });
  hand.position.x = 1;
  torch.update({ lit: false, clock: 0.1 });
  assert.equal(refresh.mock.callCount(), 4);
});

test('torch cube faces keep bordering casters and skip geometry in other directions', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const hand = new TransformNode('hand', scene);
  const material = new PBRMaterial('stone', scene);
  const east = MeshBuilder.CreateBox('east pillar', { size: 0.4 }, scene);
  east.position.set(2, 0, 0.48);
  east.material = material;
  const seam = MeshBuilder.CreateBox('pillar at the face edge', { size: 0.4 }, scene);
  seam.position.set(2, 0, 2.48);
  seam.material = material;
  const torch = createTorch(scene, hand);
  const light = scene.getLightByName('handheld torch light');
  torch.update({ lit: true, clock: 0 });
  const face = (index) => light.getShadowGenerator().getShadowMap().getCustomRenderList(index);

  assert.ok(face(0).includes(east) && face(0).includes(seam));
  assert.ok(!face(4).includes(east) && face(4).includes(seam));
  assert.ok(!face(1).includes(east) && !face(1).includes(seam));
  torch.setShadowQuality('sharp');
  torch.update({ lit: true, clock: 0.01 });
  assert.ok(face(4).includes(seam) && !face(4).includes(east));
});

test('the carried flame adds light nearby while leaving every fixed source in the budget', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const hand = new TransformNode('hand', scene);
  const floorMaterial = new PBRMaterial('stone', scene);
  floorMaterial.maxSimultaneousLights = 4;
  const near = MeshBuilder.CreateBox('nearby wall', { width: 16 }, scene);
  near.position.x = -8;
  near.material = floorMaterial;
  near.metadata = { lightingZone: 'room' };
  const far = MeshBuilder.CreateBox('distant wall', {}, scene);
  far.position.x = 12;
  far.material = floorMaterial;
  far.metadata = { lightingZone: 'room' };
  scene.incrementRenderId();
  const existing = Array.from(
    { length: 5 },
    (_, index) => new PointLight(`room light ${index}`, Vector3.Zero(), scene),
  );
  const last = existing.at(-1);
  last.setEnabled(false);
  const original = existing.map((light) => light.name);
  const torch = createTorch(scene, hand);
  const light = scene.getLightByName('handheld torch light');
  const budget = (mesh) =>
    mesh.lightSources.slice(0, mesh.material.maxSimultaneousLights).map((source) => source.name);
  reserveWorldLightSlots(scene.lights, [near, far]);
  assert.equal(floorMaterial.maxSimultaneousLights, 6);

  torch.update({ lit: true, clock: 0 });
  assert.ok(budget(near).includes(light.name));
  assert.deepEqual(
    budget(near).filter((name) => name !== light.name),
    original.slice(0, -1),
  );
  last.setEnabled(true);
  assert.deepEqual(
    budget(near).filter((name) => name !== light.name),
    original,
  );
  assert.deepEqual(budget(far), original);

  hand.position.x = 12;
  torch.update({ lit: true, clock: 0.2 });
  assert.deepEqual(budget(near), original);
  assert.ok(budget(far).includes(light.name));
  assert.deepEqual(
    budget(far).filter((name) => name !== light.name),
    original,
  );

  torch.update({ lit: false, clock: 0.3 });
  assert.equal(light.intensity, 0);
  assert.deepEqual(
    budget(far).filter((name) => name !== light.name),
    original,
  );
});

test('the carried flame cannot light surfaces that a closed wall fully hides', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const material = new PBRMaterial('stone', scene);
  const divider = MeshBuilder.CreateBox('divider', { width: 0.24, height: 4, depth: 5 }, scene);
  divider.position.set(2, 1, 0);
  divider.material = material;
  const behind = MeshBuilder.CreateBox('behind divider', { size: 0.43 }, scene);
  behind.position.set(3, 1, 0.48);
  behind.material = material;
  behind.computeWorldMatrix(true);
  const hand = new TransformNode('hand', scene);
  hand.position.y = 1;
  const occlusion = createWallLightOcclusion([{ source: divider, surfaces: [divider] }]);
  const torch = createTorch(scene, hand, occlusion);
  const light = scene.getLightByName('handheld torch light');

  torch.update({ lit: true, clock: 0 });
  assert.ok(!light.includedOnlyMeshes.includes(behind));

  divider.setEnabled(false);
  torch.update({ lit: true, clock: 0.6 });
  assert.ok(light.includedOnlyMeshes.includes(behind));
});
