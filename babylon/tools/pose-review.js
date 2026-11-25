// Run in the Orca QA tab against the Vite development server. Draw the live
// skinned meshes to a separate texture without moving the gameplay camera.
(async () => {
  const moduleURL = performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .find((url) => url.includes('/@babylonjs_core.js?'));
  const B = await import(moduleURL);
  const scene = B.EngineStore.LastCreatedScene;
  const size = 320;
  const lens = new B.FreeCamera('pose review', B.Vector3.Zero(), scene);
  lens.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
  lens.orthoLeft = lens.orthoBottom = -1.07;
  lens.orthoRight = lens.orthoTop = 1.07;
  const target = new B.RenderTargetTexture('pose review', size, scene, false);
  lens.minZ = 0.05;
  target.activeCamera = lens;
  target.clearColor = new B.Color4(0.19, 0.23, 0.25, 1);
  target.renderList = scene.meshes.filter(
    (m) => m.metadata?.playerVisual || m.metadata?.toolVisual,
  );
  const strip = document.createElement('canvas');
  strip.width = size * 2;
  strip.height = size;
  const context = strip.getContext('2d');
  const captured = new Map();
  const skin = scene.meshes.find(
    (mesh) => mesh.metadata?.humanoidRole === 'player' && mesh.skeleton,
  );
  const root = skin?.getAncestors().find((node) => !node.parent);
  if (!root) throw Error('Player rig is missing');
  const wandAngles = [],
    bootGaps = {},
    bowGloves = {};
  let lastGloveCheck = -Infinity;
  function skinTriangles(mesh, bonePattern) {
    const positions = mesh.getPositionData(true),
      indices = mesh.getIndices(),
      world = mesh.computeWorldMatrix(true);
    const points = [],
      hand = [];
    const joints = mesh.getVerticesData('matricesIndices'),
      weights = mesh.getVerticesData('matricesWeights');
    const gloveBones = new Set(
      mesh.skeleton.bones.filter((b) => bonePattern.test(b.name)).map((b) => b.getIndex()),
    );
    for (let i = 0; i < positions.length / 3; i++) {
      points.push(B.Vector3.TransformCoordinates(B.Vector3.FromArray(positions, 3 * i), world));
      let w = 0;
      for (let j = 4 * i; j < 4 * i + 4; j++) if (gloveBones.has(joints[j])) w += weights[j];
      hand.push(w > 0.5);
    }
    const triangles = [];
    for (let i = 0; i < indices.length; i += 3) {
      const ids = indices.slice(i, i + 3);
      if (!ids.every((id) => hand[id])) continue;
      const v = Array.from(ids, (id) => points[id]);
      triangles.push({
        v,
        min: B.Vector3.Minimize(B.Vector3.Minimize(v[0], v[1]), v[2]),
        max: B.Vector3.Maximize(B.Vector3.Maximize(v[0], v[1]), v[2]),
      });
    }
    return triangles;
  }
  function edgesCross(a, b) {
    return a.some((p, i) => {
      const edge = a[(i + 1) % 3].subtract(p),
        length = edge.length();
      if (length < 1e-6) return false;
      const hit = new B.Ray(p, edge.scale(1 / length), length).intersectsTriangle(...b);
      return hit && hit.distance > 1e-6 && hit.distance < length - 1e-6;
    });
  }
  function gloveCheck() {
    const skin = scene.meshes.find(
      (mesh) => mesh.metadata?.humanoidRole === 'player' && mesh.skeleton,
    );
    const head = skinTriangles(skin, /:Head/);
    return ['Left', 'Right'].map((side) => {
      const glove = skinTriangles(skin, new RegExp(':' + side + 'Hand'));
      const intersecting = glove.filter((a) =>
        head.some(
          (b) =>
            a.min.x <= b.max.x &&
            a.max.x >= b.min.x &&
            a.min.y <= b.max.y &&
            a.max.y >= b.min.y &&
            a.min.z <= b.max.z &&
            a.max.z >= b.min.z &&
            (edgesCross(a.v, b.v) || edgesCross(b.v, a.v)),
        ),
      ).length;
      return { triangles: glove.length, intersecting };
    });
  }
  let busy = false;
  function capture(name, s) {
    if (busy || captured.has(name)) return;
    if (!target.isReadyForRendering()) return;
    busy = true;
    captured.set(name, null);
    const gloves = gloveCheck();
    const buffers = [];
    for (const offset of [new B.Vector3(0.95, 0.96, 2.3), new B.Vector3(2.4, 0.96, 0.12)]) {
      const matrix = root.computeWorldMatrix(true);
      lens.position.copyFrom(B.Vector3.TransformCoordinates(offset, matrix));
      lens.setTarget(B.Vector3.TransformCoordinates(new B.Vector3(0, 0.9, 0), matrix));
      target.render();
      buffers.push(target.readPixels());
    }
    Promise.all(buffers)
      .then((images) => {
        images.forEach((pixels, index) => {
          const image = context.createImageData(size, size);
          for (let y = 0; y < size; y++) {
            const row = (size - 1 - y) * size * 4;
            image.data.set(pixels.subarray(row, row + size * 4), y * size * 4);
          }
          context.putImageData(image, index * size, 0);
        });
        captured.set(name, {
          image: strip.toDataURL('image/png').split(',')[1],
          phase: s.player.gaitPhase,
          pitch: s.pitch,
          clip: s.player.locomotion,
          action: s.player.action,
          gloves,
        });
      })
      .finally(() => {
        busy = false;
      });
  }
  let lastShot = window.__ROOM_DEMO__.snapshot().spells.fired;
  const observer = scene.onAfterRenderObservable.add(() => {
    const s = window.__ROOM_DEMO__.snapshot(),
      p = s.player;
    if (s.paused || s.viewMode !== 'third') return;
    if (
      s.weapon.id === 'blaster-j' &&
      (s.weapon.nock?.progress > 0 || performance.now() - lastGloveCheck >= 80)
    ) {
      lastGloveCheck = performance.now();
      const group = (bowGloves[p.action || 'carry'] ??= { samples: 0, crossings: 0, contacts: [] });
      group.samples++;
      const hands = gloveCheck().map((g) => g.intersecting);
      if (hands.some(Boolean)) {
        group.crossings++;
        group.contacts.push({ hands, pitch: s.pitch, nock: s.weapon.nock?.progress ?? 0 });
      }
    }
    const [l, r] = p.feet;
    const strafe = p.locomotion.includes('Strafe');
    if (strafe && s.movement.speed > 2.8) {
      const gap = (bootGaps[p.locomotion] ??= { samples: 0, closestAnkles: Infinity });
      gap.samples++;
      gap.closestAnkles = Math.min(
        gap.closestAnkles,
        Math.hypot(r[0] - l[0], r[1] - l[1], r[2] - l[2]),
      );
    }
    if (s.spells.fired !== lastShot) {
      lastShot = s.spells.fired;
      if (s.weapon.id === 'blaster-a') {
        const event = s.spells.events.at(-1);
        const tip = B.Vector3.FromArray(event.muzzle);
        const shaft = tip.subtract(B.Vector3.FromArray(s.weapon.handContacts.right)).normalize();
        const path = B.Vector3.FromArray(event.end).subtract(tip).normalize();
        const gaze = new B.Vector3(
          Math.sin(s.yaw) * Math.cos(s.pitch),
          -Math.sin(s.pitch),
          Math.cos(s.yaw) * Math.cos(s.pitch),
        );
        const degreesTo = (axis) =>
          (Math.acos(Math.max(-1, Math.min(1, B.Vector3.Dot(shaft, axis)))) * 180) / Math.PI;
        wandAngles.push({
          pitch: s.pitch,
          toGaze: degreesTo(gaze),
          toImpact: degreesTo(path),
          blocked: event.muzzleBlocked,
        });
        capture(s.pitch > 1.4 ? 'wand-cast-down' : 'wand-cast', s);
      } else capture('bow-release', s);
    }
    if (p.action === 'bow-nock' && s.weapon.nock?.progress > 0.35) capture('bow-nock', s);
    if (p.action === 'wand-reload' && s.weapon.reloadProgress > 0.35) capture('wand-reload', s);
    if (strafe && p.gaitPhase % 1 > 0.2 && p.gaitPhase % 1 < 0.3) capture(p.locomotion, s);
    if (p.airborne) capture('jump', s);
    if (p.landing && s.jump.grounded) capture('landing', s);
    if (p.locomotion === 'YBot_Idle' && p.action === 'bow-aim' && s.weapon.state === 'ready') {
      if (s.pitch > 1.483) capture('bow-down', s);
      else if (s.pitch < -1.049) capture('bow-up', s);
      else if (Math.abs(s.pitch) < 0.2) capture('bow-level', s);
    }
    if (
      p.locomotion === 'YBot_Idle' &&
      !p.action &&
      s.weapon.id === 'blaster-a' &&
      !s.player.walking
    )
      capture('wand-idle', s);
  });
  window.__poseReview = {
    names: () => [...captured].filter(([, v]) => v).map(([name]) => name),
    frame: (name) => captured.get(name),
    finish() {
      scene.onAfterRenderObservable.remove(observer);
      target.dispose();
      lens.dispose();
      const poses = Object.fromEntries(
        [...captured]
          .filter(([, v]) => v)
          .map(([name, { image: _image, ...data }]) => [name, data]),
      );
      return { wandAngles, bootGaps, bowGloves, poses };
    },
  };
  return true;
})();
