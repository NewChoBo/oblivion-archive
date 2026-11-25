import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEFAULT_HUMANOID, POSTURE_MOTION } from '../../src/content/catalogs/humanoids.ts';

const assets = fileURLToPath(new URL('../../../public/assets/', import.meta.url));

// glTF meshes can share positions across material primitives or UV seams.
// Compare the actual ordered vertices so those separate index streams agree.
function checkTriangles(document, binary, mesh, file) {
  const seen = new Set();
  function reader(index, arity) {
    const accessor = document.accessors[index];
    if (accessor.sparse || accessor.bufferView === undefined) return;
    const view = document.bufferViews[accessor.bufferView];
    const formats = {
      5120: [1, 'readInt8'],
      5121: [1, 'readUInt8'],
      5122: [2, 'readInt16LE'],
      5123: [2, 'readUInt16LE'],
      5125: [4, 'readUInt32LE'],
      5126: [4, 'readFloatLE'],
    };
    const [bytes, method] = formats[accessor.componentType];
    const start = (accessor.byteOffset ?? 0) + (view.byteOffset ?? 0);
    const stride = view.byteStride ?? bytes * arity;
    return (vertex, component = 0) => binary[method](start + stride * vertex + bytes * component);
  }
  for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? 4) !== 4 || primitive.extensions?.KHR_draco_mesh_compression) continue;
    const position = reader(primitive.attributes.POSITION, 3);
    const index = primitive.indices === undefined ? (i) => i : reader(primitive.indices, 1);
    if (!position || !index) continue;
    const positionCount = document.accessors[primitive.attributes.POSITION].count;
    const count =
      primitive.indices === undefined ? positionCount : document.accessors[primitive.indices].count;
    const points = Array.from({ length: positionCount }, (_, i) =>
      [position(i), position(i, 1), position(i, 2)].join(','),
    );
    for (let i = 0; i < count; i += 3) {
      const face = [points[index(i)], points[index(i + 1)], points[index(i + 2)]];
      assert.ok(
        face.every((p) => p !== undefined),
        file + ' invalid vertex index',
      );
      if (new Set(face).size < 3) continue;
      const start = face.indexOf([...face].sort()[0]);
      const key = [...face.slice(start), ...face.slice(0, start)].join('/');
      assert.ok(!seen.has(key), file + ' duplicate triangle in ' + mesh.name);
      seen.add(key);
    }
  }
}

test('shipped GLBs have valid texture dependencies and no duplicate same-facing triangles in uncompressed triangle primitives', (t) => {
  const files = readdirSync(assets, { recursive: true }).filter((path) => path.endsWith('.glb'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const path = join(assets, file),
      data = readFileSync(path);
    assert.equal(data.toString('ascii', 0, 4), 'glTF', file);
    assert.equal(data.readUInt32LE(8), data.length, file);
    const length = data.readUInt32LE(12),
      doc = JSON.parse(data.toString('utf8', 20, 20 + length));
    const binary = data.subarray(28 + length);
    for (const image of doc.images ?? []) {
      if (image.uri && !image.uri.startsWith('data:')) {
        assert.ok(
          existsSync(resolve(dirname(path), decodeURIComponent(image.uri))),
          file + ' missing ' + image.uri,
        );
      } else if (image.bufferView !== undefined) {
        const view = doc.bufferViews[image.bufferView];
        assert.ok(
          view.byteLength > 0 && (view.byteOffset ?? 0) + view.byteLength <= binary.length,
          file + ' embedded image',
        );
      }
    }
    if (path === resolve(assets, '..', POSTURE_MOTION.file)) {
      assert.ok(doc.animations?.length, file + ' must carry animation tracks');
      for (const clip of doc.animations) {
        assert.ok(clip.channels.length, clip.name);
        for (const channel of clip.channels) {
          assert.ok(doc.nodes[channel.target.node] && clip.samplers[channel.sampler], clip.name);
        }
      }
    } else assert.ok(doc.meshes?.length, file + ' must carry geometry');
    for (const mesh of doc.meshes ?? []) checkTriangles(doc, binary, mesh, file);
  }
  t.diagnostic(files.length + ' game models inspected');
});

test('the shipped humanoid supplies each locomotion range and equipment socket', () => {
  const file = fileURLToPath(new URL('../../../public/' + DEFAULT_HUMANOID.file, import.meta.url));
  const model = JSON.parse(readFileSync(file, 'utf8'));
  const skin = model.meshes.find((mesh) => mesh.skeletonId >= 0 && mesh.positions?.length);
  const skeleton = model.skeletons.find((rig) => rig.id === skin?.skeletonId);
  assert.ok(skeleton);
  const ranges = new Map(skeleton.ranges.map((range) => [range.name, range]));
  const joints = new Map(skeleton.bones.map((bone) => [bone.name.split(':').at(-1), bone]));
  for (const side of ['Left', 'Right'])
    for (const joint of ['Arm', 'ForeArm', 'Hand', 'Foot']) {
      assert.ok(joints.has(side + joint), side + joint);
    }
  for (const clip of Object.values(DEFAULT_HUMANOID.clips)) {
    const range = ranges.get(clip);
    assert.ok(range?.to > range?.from, clip);
    const keys = joints.get('Hips').animation.keys;
    assert.ok(keys[0].frame <= range.from && keys.at(-1).frame >= range.to, clip);
  }
});
