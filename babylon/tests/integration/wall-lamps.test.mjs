import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  PointLight,
  RenderTargetTexture,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { createWallLamps } from '../../src/platform/babylon/lighting/wall-lamps.ts';
import { scopeFixedLights } from '../../src/platform/babylon/lighting/light-surfaces.ts';

test('fixed lights leave distant surfaces out of the light budget', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const makeBox = (name, x) => {
    const mesh = MeshBuilder.CreateBox(name, { width: 2 }, scene);
    mesh.position.x = x;
    return mesh;
  };
  const fallback = makeBox('invisible collision', 0);
  fallback.isVisible = false;
  const near = makeBox('partly in range', 3.5);
  const far = makeBox('out of range', 5);
  const player = makeBox('moving player', 10);
  player.metadata = { playerVisual: true };
  const light = new PointLight('local light', Vector3.Zero(), scene);
  light.range = 3;
  const directed = new PointLight('already scoped fixture', Vector3.Zero(), scene);
  directed.includedOnlyMeshes = [far];

  scopeFixedLights([light, directed], scene.meshes, fallback);
  assert.ok(near.lightSources.includes(light));
  assert.ok(player.lightSources.includes(light));
  assert.ok(!far.lightSources.includes(light));
  assert.equal(directed.includedOnlyMeshes.length, 1);
  assert.equal(directed.includedOnlyMeshes[0]?.name, far.name);
});

test('all in-range wall lamps reach the surface within their zone', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const material = (name) => new PBRMaterial(name, scene);
  const stone = material('stone');
  stone.maxSimultaneousLights = 4;
  function box(name, position, [width, height, depth], surface) {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(...position);
    mesh.material = surface;
    return mesh;
  }
  const receivers = [
    [0.12, 'library'],
    [0.12, 'hall'],
    [8, 'library'],
  ].map(([z, zone]) => {
    const mesh = box(zone, [0, 1, z], [0.15, 2, 0.12], stone);
    mesh.metadata = { lightingZone: zone };
    return mesh;
  });
  const movingDoor = box('moving door', [0, 1, 0.4], [0.15, 2, 0.12], stone);
  movingDoor.metadata = { lightingZone: 'library' };
  const floor = box('floor', [0, 0, 0.4], [1, 0.12, 1], stone);
  floor.metadata = { lightingZone: 'library', castShadow: false };
  for (let i = 0; i < 5; i++) {
    const distant = new PointLight(`distant ${i}`, new Vector3(30, 2, i), scene);
    distant.renderPriority = 11;
  }
  const lamps = createWallLamps(scene, { material });
  for (const [name, z] of [
    ['near', 0],
    ['next', 1],
    ['third', 1.6],
    ['far', 8],
  ]) {
    lamps.place({
      name,
      zone: 'library',
      position: [0.3, 1, z],
      inward: 1,
      color: '#f6bb77',
      intensity: 4,
      range: 2.9,
      kind: name === 'near' ? 'torch' : 'lantern',
    });
  }
  lamps.assignSurfaces(new Set([movingDoor]));

  const budget = (mesh) => mesh.lightSources.slice(0, 4).map((light) => light.name);
  assert.deepEqual(
    budget(receivers[0]).filter((name) => name.endsWith('light')),
    ['near light', 'next light', 'third light'],
  );
  assert.equal(
    budget(receivers[1]).some((name) => name.endsWith('light')),
    false,
  );
  assert.deepEqual(
    budget(receivers[2]).filter((name) => name.endsWith('light')),
    ['far light'],
  );
  const body = scene.getMeshByName('near'),
    flame = scene.getMeshByName('near flame');
  const light = scene.getLightByName('near light');
  assert.equal(
    scene.meshes.filter((mesh) => mesh.parent === body.parent && mesh.isEnabled()).length,
    2,
  );
  assert.equal(flame.material.unlit, true);
  assert.equal(flame.isPickable, false);
  assert.ok(light.position.y > flame.getAbsolutePosition().y);
  const map = light.getShadowGenerator().getShadowMap();
  assert.equal(light.needCube(), true);
  assert.equal(map.refreshRate, RenderTargetTexture.REFRESHRATE_RENDER_ONCE);
  assert.ok(light.includedOnlyMeshes.includes(floor));
  assert.ok(light.includedOnlyMeshes.includes(movingDoor));
  assert.ok(map.renderList.includes(receivers[0]));
  for (const nonCaster of [...receivers.slice(1), body, flame, movingDoor, floor]) {
    assert.ok(!map.renderList.includes(nonCaster), nonCaster.name);
  }

  lamps.update(250, new Vector3(1, 1, -2));
  assert.notEqual(flame.scaling.y, flame.scaling.x);
  assert.equal(light.intensity, 4);
  const farFlame = scene.getMeshByName('far flame');
  assert.equal(farFlame.scaling.y, farFlame.scaling.x);
});
