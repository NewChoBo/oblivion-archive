import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FreeCamera,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  PointLight,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { createWallLightOcclusion } from '../../src/platform/babylon/rendering/opaque-occlusion.ts';
import { reserveWorldLightSlots } from '../../src/platform/babylon/lighting/light-surfaces.ts';
import { createSpellEffects } from '../../src/platform/babylon/effects/spell-effects.ts';

function sceneWithWall(t) {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const eye = new Vector3(0, 1.4, 0);
  const camera = new FreeCamera('eye', eye, scene);
  camera.setTarget(new Vector3(0, 1.4, 4));
  const stone = new PBRMaterial('stone', scene);
  function surface(name, options, position) {
    const mesh = MeshBuilder.CreateBox(name, options, scene);
    mesh.position.copyFromFloats(...position);
    mesh.material = stone;
    mesh.computeWorldMatrix(true);
    return mesh;
  }
  const wall = surface('solid wall', { width: 5, height: 3, depth: 0.2 }, [0, 1.5, 3]);
  const near = surface('front slab', { size: 0.4 }, [0.8, 1.2, 2]);
  const behind = surface('back slab', { size: 0.4 }, [0, 1.2, 3.7]);
  const spell = createSpellEffects(scene, camera, () => eye);
  spell.assignLightSurfaces(createWallLightOcclusion([{ source: wall, surfaces: [wall] }]));
  return { scene, spell, wall, near, behind, eye, stone };
}

test('a luminous arrow moves its light through flight and leaves a fading, wall-blocked glow on impact', (t) => {
  const { scene, spell, wall, near, behind, eye } = sceneWithWall(t);
  spell.fire({ id: 'blaster-j', origin: eye, bowPower: 1 });
  spell.update(0.04);
  const flight = spell.snapshot().lights[0];
  assert.ok(flight.position[2] > 1);
  assert.ok(flight.color[0] > flight.color[2]);
  const light = scene.lights.find((entry) => entry.metadata?.effectLight && entry.isEnabled());
  assert.ok(near.lightSources.includes(light));
  assert.ok(!behind.lightSources.includes(light));

  spell.update(0.1);
  const impact = spell.snapshot();
  assert.equal(impact.events[0].arrived, true);
  assert.ok(impact.lights[0].position[2] > flight.position[2]);
  assert.ok(impact.lights[0].position[2] < impact.events[0].end[2]);
  assert.ok(!behind.lightSources.includes(light));

  wall.position.x += 0.45;
  spell.update(0.74);
  const residue = spell.snapshot().lights[0];
  assert.ok(Math.abs(residue.position[0] - 0.45) < 0.01);
  assert.ok(residue.intensity > 0 && residue.intensity < impact.lights[0].intensity);
  spell.update(3);
  assert.equal(spell.snapshot().lights.length, 0);
  assert.equal(
    spell.snapshot().retained.length,
    1,
    'the spent arrow remains lodged without casting light',
  );
  assert.ok(!light.isEnabled());
});

test('world lighting is bounded and effect light slots preserve other lights', (t) => {
  const { scene, spell, eye, near, stone } = sceneWithWall(t);
  const fixtures = Array.from({ length: 4 }, (_, index) => {
    const fixture = new PointLight('fixture ' + index, new Vector3(index, 2, 0), scene);
    fixture.includedOnlyMeshes = [near];
    return fixture;
  });
  reserveWorldLightSlots(scene.lights, scene.meshes);
  assert.ok(stone.maxSimultaneousLights >= fixtures.length + 3);
  for (let i = 0; i < 4; i++) spell.fire({ id: 'blaster-a', origin: eye });
  spell.update(0.13);
  const lights = spell.snapshot().lights;
  assert.equal(lights.length, 2);
  assert.ok(lights.every((light) => light.color[2] > light.color[0]));
  assert.ok(fixtures.every((fixture) => near.lightSources.includes(fixture)));
  spell.reset();
  assert.equal(spell.snapshot().lights.length, 0);
  assert.ok(!scene.lights.some((light) => light.metadata?.effectLight && light.isEnabled()));
});

test('a projectile can supply a distinct lighting profile or omit emission', (t) => {
  const { spell, eye } = sceneWithWall(t);
  spell.fire({ id: 'blaster-j', origin: eye, bowPower: 1, light: null });
  spell.update(0.04);
  assert.equal(spell.snapshot().lights.length, 0);
  spell.fire({
    id: 'blaster-j',
    origin: eye,
    bowPower: 1,
    light: {
      color: '#51f2a9',
      range: 4,
      flight: 3,
      impact: 6,
      afterglow: { duration: 5, range: 3, intensity: 2 },
    },
  });
  spell.update(0.04);
  const light = spell.snapshot().lights[0];
  assert.equal(light.range, 4);
  assert.ok(light.color[1] > light.color[0]);
});
