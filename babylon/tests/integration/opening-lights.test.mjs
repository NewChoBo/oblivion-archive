import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  RenderTargetTexture,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { createOpeningLight } from '../../src/platform/babylon/lighting/opening-lights.ts';
import chapter from '../../../shared/levels/chapter-1.json' with { type: 'json' };

test('exterior light reaches the room through its aperture and the frame casts a cached shadow', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const wall = chapter.zones.readingRoom.find(({ id }) => id === 'reading-wall-west');
  const { light, assignSurfaces } = createOpeningLight(scene, wall);
  function surface(name, position, zone = 'readingRoom') {
    const mesh = MeshBuilder.CreateBox(name, { size: 0.25 }, scene);
    mesh.position.set(...position);
    mesh.material = new PBRMaterial(name, scene);
    mesh.metadata = { lightingZone: zone };
    return mesh;
  }
  const sill = surface('sill', [-8.375, 1.13, 5.48]);
  const mullion = surface('mullion', [-8.375, 2.13, 5.48]);
  mullion.metadata.castShadow = false;
  const glass = surface('glass', [-8.425, 2.13, 5.48]);
  glass.material.alpha = 0.07;
  const floor = surface('floor', [-5.825, 0.01, 4.92]);
  const door = surface('moving door', [-5.825, 1, 5.08]);
  const outside = surface('different room', [-5.825, 0.01, 4.92], 'ramparts');
  const away = surface('away from window', [-5.825, 0.01, -4]);
  const behindStone = surface('in cone but behind solid wall', [-5.425, 0.01, 3.0]);
  const fallback = surface('fallback', [0, -3, 0]);
  fallback.isVisible = false;
  assignSurfaces(scene.meshes, new Set([sill, mullion, glass]), new Set([door]), fallback);

  assert.ok(light.position.x < wall.bounds[0][0]);
  const direction = new Vector3(-8.375, 2.13, 5.48).subtract(light.position).normalize();
  assert.ok(Vector3.Dot(light.direction, direction) > 0.9999);
  assert.ok(light.includedOnlyMeshes.includes(floor));
  assert.ok(!light.includedOnlyMeshes.includes(outside));
  assert.ok(!light.includedOnlyMeshes.includes(away));
  assert.ok(!light.includedOnlyMeshes.includes(behindStone));
  const shadows = light.getShadowGenerator().getShadowMap();
  assert.equal(shadows.refreshRate, RenderTargetTexture.REFRESHRATE_RENDER_ONCE);
  assert.ok(shadows.renderList.includes(sill));
  assert.ok(shadows.renderList.includes(mullion));
  assert.ok(!shadows.renderList.includes(glass));
  assert.ok(!shadows.renderList.includes(door));
});
