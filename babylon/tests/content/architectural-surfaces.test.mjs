import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBuilder, Ray, Vector3 } from '@babylonjs/core';
import { buildLayout } from '../fixtures/chapter-layout.mjs';
import { findSurfaceOverlaps } from '../../src/levels/surface-overlaps.ts';
import { plan, construction as spec, workLayout } from '../../src/content/citadel-layout.ts';
import { citadelSurvey } from '../../src/platform/babylon/citadel/floating-citadel.ts';
import materials from '../../../shared/levels/citadel-materials.json' with { type: 'json' };
import { existsSync } from 'node:fs';

test('the authored chapter and generated solid architecture share boundaries without overlapping faces', (t) => {
  const { scene } = buildLayout(t, true);
  const conflicts = findSurfaceOverlaps(scene.meshes);
  assert.deepEqual(
    conflicts.map((hit) => ({ objects: hit.objects.map((o) => o.name), point: hit.point })),
    [],
  );
  for (const slot of Object.values(materials)) {
    for (const path of [slot.albedo, slot.normal, slot.emissive].filter(Boolean)) {
      assert.ok(existsSync(new URL('../../../public/assets/' + path, import.meta.url)), path);
    }
  }
});

test('the entrance trim and upper hall wall join the chapter without covering the same surface', (t) => {
  const { scene, environment } = buildLayout(t, true);
  const decorations = scene.meshes.filter((mesh) =>
    ['great library · trim', 'great library · wall'].includes(mesh.name),
  );
  for (const [index, mesh] of decorations.entries()) {
    mesh.metadata.levelPlacement = { zone: 'citadel', id: mesh.name, part: index + 1 };
  }
  for (const [placement, model] of [
    ['reading-wall-entry', 'great library · trim'],
    ['corridor-ceiling', 'great library · wall'],
  ]) {
    const chapter = environment.get(placement);
    const parts = decorations.filter((mesh) => mesh.name === model);
    assert.ok(parts.length > 0, model);
    const overlaps = findSurfaceOverlaps([chapter, ...parts]);
    assert.deepEqual(
      overlaps.filter((hit) => hit.objects.some((object) => object.id === placement)),
      [],
    );
  }
});

test('the stair slab, retaining wall and integral parapet meet on every surveyed vertex', (t) => {
  const { scene } = buildLayout(t, true);
  const { survey, stairs } = citadelSurvey();
  const stamp = (p) => p.map((n) => Math.round(n * 10000)).join('/');
  function vertices(name) {
    const keys = new Set();
    for (const mesh of scene.meshes.filter((m) => m.name === name)) {
      const data = mesh.getVerticesData('position');
      for (let i = 0; i < data.length; i += 3) keys.add(stamp(Array.from(data.slice(i, i + 3))));
    }
    return keys;
  }
  assert.equal(
    scene.meshes.some((m) => /continuous plinth|parapet coping/.test(m.name)),
    false,
  );
  const parapet = vertices('rampart parapet wall'),
    masonry = vertices('grand stair and upper terrace · wall');
  for (const side of [0, 1])
    for (let i = 1; i < stairs.length; i++) {
      const run = survey.boundary(stairs[i - 1][side], stairs[i][side]);
      for (const p of run) {
        assert.ok(parapet.has(stamp(p.asArray())), 'outer wall foot ' + p);
        assert.ok(masonry.has(stamp(p.asArray())), 'upper retaining wall ' + p);
        assert.ok(
          masonry.has(stamp([p.x, p.y - spec.stairs.deckThickness, p.z])),
          'slab foot ' + p,
        );
      }
    }
  const [dx, dy, dz] = plan.chapterJoin.offset;
  for (const side of [-1, 1])
    for (const z of [32.34, 32.49, 32.64])
      for (const x of [3.35, 3.5, 3.65]) {
        const ray = new Ray(new Vector3(dx + side * x, dy + 6, dz + z), Vector3.Down(), 2.5);
        assert.ok(
          scene.pickWithRay(
            ray,
            (m) =>
              m.name === 'rampart parapet wall' ||
              m.name === 'library forecourt terrace' ||
              m.name === 'walkable stair ramp',
          ).hit,
          'open seam at ' + [side * x, z],
        );
      }
});

test('each visible stair tread meets its walking ramp within half a riser', (t) => {
  const { scene } = buildLayout(t, true);
  const [dx, dy, dz] = plan.chapterJoin.offset;
  const solid = (m) => m.name === 'walkable stair ramp' && !m.isVisible;
  const paving = (m) => m.name === 'grand stair and upper terrace · paving';
  for (const [i, steps] of spec.stairs.treadCounts.entries()) {
    if (!steps) continue;
    const [, bottom, from] = plan.stairs.stations[i];
    const [, top, to] = plan.stairs.stations[i + 1];
    const halfRise = (top - bottom) / steps / 2;
    const levels = new Set();
    for (const x of [-2.8, 0, 2.8]) {
      for (let z = from; z <= to; z += 0.08) {
        const ray = new Ray(
          new Vector3(dx + x, dy + top + 1, dz + z),
          Vector3.DownReadOnly,
          top - bottom + 2,
        );
        const floor = scene.pickWithRay(ray, solid)?.pickedPoint;
        if (!floor) continue;
        const tread = scene.pickWithRay(ray, paving)?.pickedPoint;
        assert.ok(
          tread && Math.abs(tread.y - floor.y) <= halfRise + 0.001,
          `unsupported tread at ${x}, ${z}`,
        );
        levels.add(Math.round((tread.y - dy - bottom) / (2 * halfRise)));
      }
    }
    assert.equal(levels.size, steps + 1, 'both landing heights and every rise are present');
  }
});

test('exterior assemblies contain their specified parts and counted placements', (t) => {
  const inventory = new Map();
  buildLayout(t, true, (group, part) => {
    if (!inventory.has(group)) inventory.set(group, new Map());
    const counts = inventory.get(group);
    counts.set(part, (counts.get(part) ?? 0) + 1);
  });
  assert.deepEqual(new Set(inventory.keys()), new Set(spec.assemblies.map((a) => a.name)));
  for (const { name, parts, sets, counts } of spec.assemblies) {
    const actual = inventory.get(name);
    assert.deepEqual(
      new Set(actual.keys()),
      new Set([...parts, ...sets.flatMap((s) => spec.partSets[s])]),
      name,
    );
    for (const [part, count] of Object.entries(counts))
      assert.equal(actual.get(part), count, name + ' / ' + part);
  }
});

test('every scheduled piece of furniture has a physical part at its drawn origin', (t) => {
  const { collisionBoxes } = buildLayout(t, true),
    [dx, dy, dz] = plan.chapterJoin.offset;
  const names = {
    table: 'worktable',
    readingDesk: 'reading desk',
    readingBench: 'reading bench backrest',
    case: 'bookcase back panel',
    press: 'book press frame',
    sewing: 'sewing frame crossbar',
    stool: 'bindery stool seat',
    shelf: 'gathering shelf upright',
    crate: 'archive transport crate',
  };
  for (const row of Object.values(spec.placements).flat()) {
    const [kind, x, y, z] = row,
      [w, h, d] = spec.furniture[kind][1];
    const seats = kind === 'shelf' ? [x - (w - 0.11) / 2, x + (w - 0.11) / 2] : [x];
    for (const seat of seats)
      assert.ok(
        collisionBoxes.some((m) => {
          if (m.name !== names[kind]) return false;
          const box = m.getBoundingInfo().boundingBox,
            center = box.centerWorld;
          return (
            Math.abs(center.x - (dx + seat)) < 0.001 &&
            Math.abs(center.z - (dz + z + (kind === 'readingBench' ? (d - 0.07) / 2 : 0))) <
              0.001 &&
            Math.abs(box.maximumWorld.y - (dy + y + h)) < 0.001
          );
        }),
        row.join('/'),
      );
  }
});

test('the orrery blocks a walking capsule and moving cargo carries its collision surface', (t) => {
  const { scene, collisionBoxes, citadel } = buildLayout(t, true);
  for (const name of [
    'round gate tower',
    'stone gate jamb',
    'orrery pedestal',
    'orrery ecliptic ring',
    'beacon stone base',
    'worktable leg',
    'bookcase side panel',
    'gathering shelf upright',
    'glue pot chimney',
    'book press frame',
    'suspended book crate',
  ]) {
    assert.ok(
      collisionBoxes.some((m) => m.name === name && m.checkCollisions),
      name,
    );
  }
  const [dx, dy, dz] = plan.chapterJoin.offset,
    [x, z] = plan.court.orrery;
  const player = MeshBuilder.CreateBox('walker', { size: 0.5 }, scene);
  player.ellipsoid.set(0.25, 0.84, 0.25);
  player.surroundingMeshes = collisionBoxes;
  player.position.set(dx + x, dy + 0.85, dz + z - 2.8);
  for (let i = 0; i < 65; i++) {
    player.computeWorldMatrix(true);
    player.moveWithCollisions(new Vector3(0, -0.015, 0.08));
  }
  assert.ok(player.position.z < dz + z - 0.85, player.position.toString());
  const cargo = scene.getMeshByName('suspended book crate');
  const altitude = () => cargo.getBoundingInfo().boundingBox.minimumWorld.y;
  const before = altitude();
  citadel.restore(4, true);
  assert.ok(Math.abs(altitude() - dy - workLayout.freight.landingBottom) < 0.001);
  assert.ok(altitude() > before + 3);
});
