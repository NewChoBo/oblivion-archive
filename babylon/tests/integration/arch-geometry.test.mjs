import test from 'node:test';
import assert from 'node:assert/strict';
import level from '../../../shared/levels/chapter-1.json' with { type: 'json' };
import { createArchiveMagic } from '../../src/platform/babylon/chapter/arcane-art.ts';
import { findSurfaceOverlaps } from '../../src/levels/surface-overlaps.ts';
import { buildLayout } from '../fixtures/chapter-layout.mjs';

test('the arch has outward-facing stone visible from both sides of the threshold', (t) => {
  const { scene, environment } = buildLayout(t);
  const [wall] = environment.parts('reading-arch-wall');
  const wallFront = wall.getBoundingInfo().boundingBox.minimumWorld.z;
  const { trim, archStone } = createArchiveMagic(scene, level.doorFrames['north-arch'], wallFront);
  for (const mesh of trim) {
    mesh.computeWorldMatrix(true);
    assert.ok(
      Math.abs(mesh.getBoundingInfo().boundingBox.maximumWorld.z - wallFront) < 1e-6,
      mesh.name,
    );
  }
  assert.deepEqual(findSurfaceOverlaps([wall, ...trim]), []);
  const stones = trim.filter((mesh) => mesh.name.startsWith('blackstone arch wedge'));
  assert.equal(stones.length, 11);
  for (const stone of stones) {
    assert.equal(stone.material, archStone);
    const vertices = stone.getVerticesData('position');
    const normals = stone.getVerticesData('normal');
    const depths = Array.from(vertices).filter((_, i) => i % 3 === 2);
    for (const [depth, outward] of [
      [Math.min(...depths), -1],
      [Math.max(...depths), 1],
    ]) {
      const faceNormals = depths.flatMap((z, i) => {
        const nz = normals[3 * i + 2];
        return z === depth && Math.abs(nz) > 0.99 ? [Math.sign(nz)] : [];
      });
      assert.ok(faceNormals.length >= 3, stone.name);
      assert.ok(
        faceNormals.every((n) => n === outward),
        stone.name,
      );
    }
  }
});
