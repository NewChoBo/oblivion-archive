// Run in the Orca QA tab after the Vite development build has loaded. Keep the player, game camera and
// materials intact. A second camera resolves the visible architecture twice.
(async () => {
  const moduleURL = performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .find((url) => url.includes('/@babylonjs_core.js?'));
  const B = await import(moduleURL);
  const scene = B.EngineStore.LastCreatedScene;
  const w = 400,
    h = 225;
  const lens = new B.FreeCamera('Architecture depth review', B.Vector3.Zero(), scene);
  lens.minZ = scene.activeCamera.minZ;
  lens.maxZ = scene.activeCamera.maxZ;
  lens.fov = scene.activeCamera.fov;
  const target = new B.RenderTargetTexture(
    'Architecture face IDs',
    { width: w, height: h },
    scene,
    false,
    false,
  );
  target.activeCamera = lens;
  target.clearColor = new B.Color4(0, 0, 0, 1);
  const architecture = scene.meshes.filter(
    (m) =>
      m.getTotalVertices() &&
      m.isEnabled() &&
      m.isVisible &&
      m.material &&
      m.renderingGroupId === 0 &&
      m.visibility === 1 &&
      !m.material.needAlphaBlendingForMesh(m),
  );
  target.renderList = architecture;
  const materials = architecture.map((mesh, i) => {
    const material = new B.ShaderMaterial(
      'Face ID ' + i,
      scene,
      {
        vertexSource:
          'precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; void main(){gl_Position=worldViewProjection*vec4(position,1.);}',
        fragmentSource:
          'precision highp float; uniform vec3 ink; void main(){gl_FragColor=vec4(ink,1.);}',
      },
      { attributes: ['position'], uniforms: ['worldViewProjection', 'ink'] },
    );
    material.backFaceCulling = mesh.material?.backFaceCulling ?? true;
    material.setColor3('ink', new B.Color3(((i + 1) & 255) / 255, ((i + 1) >> 8) / 255, 0));
    target.setMaterialForRendering(mesh, material);
    return material;
  });
  const assetURL = performance
    .getEntriesByType('resource')
    .find((r) => new URL(r.name).pathname.endsWith('/src/content/citadel-layout.ts')).name;
  const { plan } = await import(assetURL);
  const fromPlan = (v, height) => [
    v[0] + plan.chapterJoin.offset[0],
    v[1] + height + plan.chapterJoin.offset[1],
    v[2] + plan.chapterJoin.offset[2],
  ];
  const routeFromPlan = (label, eye, aim) => [label, fromPlan(eye, 1.6), fromPlan(aim, 0.7)];
  const ahead = [...plan.arrival.spawn];
  ahead[2] += 12;
  const routes = [
    ['entry inside', [0, 1.55, -4.55], [0, 2.5, -6]],
    ['entry outside', [0.4, 1.65, -9.4], [0, 2.1, -5.9]],
    ['library ceiling', [0, 1.55, -2.4], [2.2, 4.05, 3]],
    ['library ceiling west', [-4, 1.55, 4.9], [-8.35, 3.4, 5.4]],
    ['library desk', [-0.4, 1.55, -0.55], [0.45, 1.37, 1.8]],
    ['west shelf', [-5.2, 1.55, -1.6], [-7.7, 1.7, 0]],
    ['east shelf', [5.2, 1.55, 2], [7.7, 1.7, 0]],
    ['arch', [0, 1.55, 5.0], [0, 2.5, 7.45]],
    ['arch reverse', [0.4, 1.55, 9.2], [0, 2.5, 7.0]],
    ['corridor', [1.8, 1.55, 10.3], [11.7, 2.25, 10.3]],
    ['vault', [9.2, 1.55, 10.3], [11.97, 1.3, 10.3]],
    ['vault end', [14.5, 1.55, 10.3], [18.3, 2, 11]],
    ['return', [15.25, 1.55, 10.6], [15.4, 1.3, 7.1]],
    ['shortcut', [7.4, 1.55, 5.4], [8.5, 2.4, 5.4]],
    ['quarry', [64, 1.55, -6], [68.6, 1, 8.8]],
    routeFromPlan('ramparts', plan.arrival.spawn, ahead),
  ];
  const inkId = (pixels, i) => pixels[i] + 256 * pixels[i + 1];
  const name = (id) => architecture[id - 1]?.name || 'Background';
  const rows = [],
    pairs = new Map();
  const order = (a, b) => a.getMesh().uniqueId - b.getMesh().uniqueId;
  try {
    for (const [label, eye, aim] of routes) {
      let changed = 0;
      for (const slide of [-0.18, 0, 0.18]) {
        lens.position.set(eye[0] + slide, eye[1], eye[2]);
        lens.setTarget(B.Vector3.FromArray(aim));
        for (let attempt = 0; !target.isReadyForRendering(); attempt++) {
          if (attempt > 180) throw Error('Depth pass did not become ready');
          await new Promise(requestAnimationFrame);
        }
        target.setRenderingOrder(0, order);
        target.render();
        const forward = await target.readPixels();
        target.setRenderingOrder(0, (a, b) => order(b, a));
        target.render();
        const reverse = await target.readPixels();
        if (!forward.some((v, i) => i % 4 === 0 && v > 0)) throw Error('Empty depth pass');
        for (let i = 0; i < forward.length; i += 4) {
          const a = inkId(forward, i),
            b = inkId(reverse, i);
          if (a === b) continue;
          changed++;
          const key = [name(a), name(b)].sort().join(' / ');
          pairs.set(key, (pairs.get(key) || 0) + 1);
        }
      }
      rows.push({ view: label, changed });
    }
    return {
      width: w,
      height: h,
      positions: routes.length * 3,
      meshes: architecture.length,
      views: rows,
      contestedPixels: rows.reduce((sum, row) => sum + row.changed, 0),
      pairs: Object.fromEntries([...pairs].sort((a, b) => b[1] - a[1])),
    };
  } finally {
    target.dispose();
    lens.dispose();
    for (const material of materials) material.dispose();
  }
})();
