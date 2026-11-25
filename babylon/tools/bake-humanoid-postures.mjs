// Bake in-place, metre-scale contact poses onto the shipped Y Bot hierarchy.
// Run with node --experimental-strip-types tools/bake-humanoid-postures.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { Matrix, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { pointJoint, reach } from '../src/platform/babylon/actors/joint-reach.ts';
import { POSTURE_BAKE } from '../src/content/catalogs/humanoids.ts';

const folder = new URL('../../public/assets/characters/', import.meta.url);
const { bones } = JSON.parse(readFileSync(new URL('dummy3.babylon', folder))).skeletons[0];
const engine = new NullEngine();
const scene = new Scene(engine);
const mount = new TransformNode('metres', scene);
mount.scaling.setAll(POSTURE_BAKE.scale);
const rig = [];
const nodes = [];
const joint = {};
for (const b of bones) {
  const node = new TransformNode(b.name, scene);
  node.parent = rig[b.parentBoneIndex]?.node ?? mount;
  node.rotationQuaternion = Quaternion.Identity();
  const rest = Matrix.FromArray(b.animation.keys[0].values);
  rest.decompose(node.scaling, node.rotationQuaternion, node.position);
  rig.push({ node, rest });
  joint[b.name.split(':')[1]] = node;
  const q = node.rotationQuaternion,
    p = node.position;
  nodes.push({
    name: b.name,
    translation: [p.x, p.y, -p.z],
    rotation: [-q.x, -q.y, q.z, q.w],
    scale: node.scaling.asArray(),
  });
  if (b.parentBoneIndex >= 0) (nodes[b.parentBoneIndex].children ??= []).push(b.index);
}
const segments = ['UpLeg', 'Leg', 'Foot', 'Arm', 'ForeArm', 'Hand'];
const animated = [
  joint.Hips,
  joint.Spine,
  joint.Spine1,
  joint.Spine2,
  joint.Neck,
  joint.Head,
  ...['Left', 'Right'].flatMap((side) =>
    ['Shoulder', ...segments, 'ToeBase'].map((part) => joint[side + part]),
  ),
];
const v = (x, y, z) => new Vector3(x, y, z);
const world = (node) => node.computeWorldMatrix(true).getTranslation();
const localTilt = (node, pitch, yaw = 0, roll = 0) => {
  Quaternion.FromEulerAngles(pitch, yaw, roll).multiplyToRef(
    node.rotationQuaternion,
    node.rotationQuaternion,
  );
};
const reset = () => {
  for (const { node, rest } of rig)
    rest.decompose(node.scaling, node.rotationQuaternion, node.position);
};

// A crouch flexes at the hip, knee and ankle. The intermediate poses lower a
// knee and plant the hands before the pelvis rolls forward onto the forearms.
const crouch = {
  hip: [0, 0.48, -0.1],
  lean: [0.23, 0.13, 0.08, -0.11, -0.13],
  feet: [
    [-0.15, 0.089, 0.075],
    [0.14, 0.089, -0.035],
  ],
  hands: [
    [-0.19, 0.67, 0.21],
    [0.21, 0.68, 0.18],
  ],
  kneeOut: 0.21,
  kneeDown: 0,
  toeBack: 0,
  elbowDown: 0.55,
};
const halfCrouch = {
  ...crouch,
  hip: [0, 0.68, -0.06],
  lean: [0.15, 0.09, 0.03, -0.07, -0.08],
  feet: [
    [-0.15, 0.089, 0.074],
    [0.11, 0.091, -0.04],
  ],
  hands: [
    [-0.2, 0.7, 0.13],
    [0.21, 0.72, 0.1],
  ],
};
const standing = {
  ...crouch,
  hip: world(joint.Hips).asArray(),
  lean: [0, 0, 0, 0, 0],
  feet: ['Left', 'Right'].map((side) => world(joint[side + 'Foot']).asArray()),
  hands: ['Left', 'Right'].map((side) => world(joint[side + 'Hand']).asArray()),
};
const kneel = {
  hip: [0.045, 0.345, -0.12],
  lean: [0.44, 0.15, 0.08, -0.22, -0.15],
  feet: [
    [-0.16, 0.095, 0.065],
    [0.15, 0.12, -0.44],
  ],
  hands: [
    [-0.21, 0.43, 0.33],
    [0.21, 0.47, 0.39],
  ],
  kneeOut: 0.28,
  kneeDown: 0.42,
  toeBack: 0.35,
  elbowDown: 0.55,
};
const brace = {
  hip: [-0.018, 0.32, -0.19],
  lean: [0.93, 0.2, 0.04, -0.39, -0.23],
  feet: [
    [-0.18, 0.105, -0.38],
    [0.17, 0.095, -0.63],
  ],
  hands: [
    [-0.19, 0.093, 0.39],
    [0.21, 0.095, 0.44],
  ],
  kneeOut: 0.92,
  kneeDown: 0.34,
  toeBack: 0.78,
  elbowDown: 0.42,
};
const prone = {
  hip: [0, 0.157, -0.16],
  lean: [1.3, 0.07, -0.25, -0.74, -0.26],
  feet: [
    [-0.17, 0.072, -0.76],
    [0.17, 0.072, -0.72],
  ],
  hands: [
    [-0.18, 0.083, 0.42],
    [0.19, 0.105, 0.48],
  ],
  kneeOut: 1.1,
  kneeDown: 0.19,
  toeBack: 1,
  elbowDown: 1.25,
};
const { crouchStride, crawlStride } = POSTURE_BAKE;
function interpolatePose(a, b, t) {
  function mix(x, y) {
    return Array.isArray(x) ? x.map((value, i) => mix(value, y[i])) : x + (y - x) * t;
  }
  return Object.fromEntries(Object.keys(a).map((key) => [key, mix(a[key], b[key])]));
}
// The knee/elbow sphere must remain above the support plane even between keys.
function groundReach(chain, target, pole, minHeight) {
  reach(chain, target, pole);
  if (world(chain[1]).y >= minHeight) return;
  let low = 0,
    high = 1;
  for (let i = 0; i < 10; i++) {
    const t = (low + high) / 2;
    reach(chain, target, Vector3.Lerp(pole, Vector3.Up(), t));
    if (world(chain[1]).y < minHeight) low = t;
    else high = t;
  }
  reach(chain, target, Vector3.Lerp(pole, Vector3.Up(), high));
}
function contact(phase, stride) {
  const stance = 0.6;
  if (phase < stance) return { offset: stride * (stance / 2 - phase), lift: 0 };
  const t = (phase - stance) / (1 - stance);
  return {
    offset: stride * stance * (t * t * (3 - 2 * t) - 0.5),
    lift: Math.sin(Math.PI * t) ** 2,
  };
}
function pose(shape, phase = 0, direction = null, breath = 0) {
  reset();
  const crawling = shape === prone,
    stride = crawling ? crawlStride : crouchStride;
  const twist = direction ? Math.sin(phase * 2 * Math.PI) : 0;
  const [x, y, z] = shape.hip;
  joint.Hips.setAbsolutePosition(v(x + 0.022 * twist, y + 0.008 * breath, z));
  const [hips, waist, chest, neck, head] = shape.lean;
  localTilt(joint.Hips, hips, 0.065 * twist, 0.04 * twist);
  localTilt(joint.Spine, waist, 0.05 * -twist);
  localTilt(joint.Spine1, chest + 0.012 * breath);
  localTilt(joint.Spine2, 0, -0.09 * twist);
  localTilt(joint.Neck, neck);
  localTilt(joint.Head, head - 0.014 * breath, 0.055 * twist);
  for (const [i, side] of ['Left', 'Right'].entries()) {
    const sign = i ? 1 : -1;
    const leg = segments.slice(0, 3).map((name) => joint[side + name]);
    const arm = segments.slice(3).map((name) => joint[side + name]);
    const step = contact((phase + i * 0.5) % 1, stride);
    const hand = contact((phase + (1 - i) * 0.5) % 1, stride);
    const ankle = Vector3.FromArray(shape.feet[i]),
      palm = Vector3.FromArray(shape.hands[i]);
    if (direction) {
      ankle.x += direction[0] * step.offset;
      ankle.z += direction[1] * step.offset;
      ankle.y += (crawling ? 0.043 : 0.095) * step.lift;
      palm.x += direction[0] * hand.offset * (crawling ? 1 : 0.3);
      palm.z += direction[1] * hand.offset * (crawling ? 1 : 0.55);
      palm.y += (crawling ? 0.079 : 0.045) * hand.lift;
    }
    const knee = v(
      sign * (shape.kneeOut + (crawling && direction ? 0.22 * step.lift : 0)),
      -shape.kneeDown,
      1 - shape.toeBack,
    );
    groundReach(leg, ankle, knee, 0.06);
    const toe = joint[side + 'ToeBase'];
    const turn = Math.PI * shape.toeBack;
    const toeDirection = v(
      sign * (0.025 + 0.12 * Math.sin(turn)),
      -0.081 + 0.035 * shape.toeBack,
      0.13 * Math.cos(turn),
    );
    pointJoint(leg[2], world(toe), world(leg[2]).add(toeDirection));
    const toeTip = joint[side + 'Toe_End'];
    const tip = world(toeTip);
    if (tip.y < 0.012) {
      tip.y = 0.015;
      pointJoint(toe, world(toeTip), tip);
    }
    groundReach(arm, palm, v(sign * 0.78, -shape.elbowDown, -0.58), 0.065);
    if (shape.toeBack > 0) {
      const fingertip = joint[side + 'HandMiddle4'];
      const tip = world(fingertip);
      const contactPalm = world(arm[2]).add(v(sign * 0.025, -0.012, 0.135));
      pointJoint(arm[2], tip, Vector3.Lerp(tip, contactPalm, shape.toeBack));
    }
  }
}

const animations = [],
  accessors = [],
  bufferViews = [],
  chunks = [];
let length = 0;
function floats(values, type) {
  const data = Buffer.alloc(values.length * 4);
  values.forEach((n, i) => data.writeFloatLE(n, i * 4));
  const count = values.length / { VEC4: 4, VEC3: 3, SCALAR: 1 }[type];
  const accessor = { bufferView: bufferViews.length, componentType: 5126, count, type };
  if (type === 'SCALAR') {
    accessor.min = [Math.min(...values)];
    accessor.max = [Math.max(...values)];
  }
  bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length });
  chunks.push(data);
  length += data.length;
  return accessors.push(accessor) - 1;
}
function clip(name, times, setPose) {
  const input = floats(times, 'SCALAR'),
    channels = [],
    samplers = [];
  const tracks = animated.map((node) => ({
    node,
    index: nodes.findIndex((n) => n.name === node.name),
    keys: [],
  }));
  const positions = [];
  for (const [i, t] of times.entries()) {
    setPose(t, i);
    const p = joint.Hips.position;
    positions.push(p.x, p.y, -p.z);
    for (const { node, keys } of tracks) {
      const { x, y, z, w } = node.rotationQuaternion;
      const q = [-x, -y, z, w],
        previous = keys.length - 4;
      const sign =
        previous >= 0 && q.reduce((sum, n, j) => sum + n * keys[previous + j], 0) < 0 ? -1 : 1;
      keys.push(...q.map((n) => n * sign));
    }
  }
  function channel(node, path, output) {
    channels.push({ sampler: samplers.length, target: { node, path } });
    samplers.push({ input, output, interpolation: 'LINEAR' });
  }
  channel(tracks[0].index, 'translation', floats(positions, 'VEC3'));
  for (const track of tracks) channel(track.index, 'rotation', floats(track.keys, 'VEC4'));
  animations.push({ name, channels, samplers });
}
function transition(name, poses, times) {
  clip(
    name,
    Array.from({ length: 31 }, (_, i) => i / 30),
    (t) => {
      if (t === 0 && poses[0] === standing) {
        reset();
        return;
      }
      const end = times.findIndex((time, i) => i > 0 && time >= t);
      pose(
        interpolatePose(
          poses[end - 1],
          poses[end],
          (t - times[end - 1]) / (times[end] - times[end - 1]),
        ),
      );
    },
  );
}
transition('CrouchDown', [standing, halfCrouch, crouch], [0, 0.46, 1]);
transition('LowerToProne', [crouch, kneel, brace, prone], [0, 0.32, 0.63, 1]);
for (const [name, shape] of [
  ['Crouch', crouch],
  ['Prone', prone],
]) {
  clip(name + 'Idle', [0, 0.25, 0.5, 0.75, 1], (t) =>
    pose(shape, 0, null, Math.sin(t * 2 * Math.PI)),
  );
  for (const [dir, axis] of Object.entries({
    Forward: [0, 1],
    Back: [0, -1],
    Left: [-1, 0],
    Right: [1, 0],
  })) {
    clip(
      name + dir,
      Array.from({ length: 21 }, (_, i) => i / 20),
      (t) => pose(shape, t % 1, axis),
    );
  }
}
const doc = {
  asset: { version: '2.0', generator: 'Oblivion Archive · Y Bot posture rig' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes,
  animations,
  accessors,
  bufferViews,
  buffers: [{ byteLength: length }],
};
const json = Buffer.from(JSON.stringify(doc)),
  bin = Buffer.concat(chunks),
  meta = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
json.copy(meta);
const glb = Buffer.alloc(28 + meta.length + length);
glb.write('glTF');
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(meta.length, 12);
glb.write('JSON', 16);
meta.copy(glb, 20);
glb.writeUInt32LE(length, 20 + meta.length);
glb.write('BIN\0', 24 + meta.length);
bin.copy(glb, 28 + meta.length);
writeFileSync(new URL('ybot-postures.glb', folder), glb);
engine.dispose();
