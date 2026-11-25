// Evaluate in the Orca QA tab on Vite. Compare each rendered face to the
// lettering on its own dynamic canvas, including the current puzzle state.
(async () => {
  const moduleURL = performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .find((url) => url.includes('/@babylonjs_core.js?'));
  const B = await import(moduleURL);
  const scene = B.EngineStore.LastCreatedScene;
  const signs = scene.meshes.filter((mesh) => {
    const texture = mesh.material?.albedoTexture;
    return (
      texture instanceof B.DynamicTexture &&
      texture.name === mesh.name &&
      texture === mesh.material.emissiveTexture &&
      !mesh.isPickable
    );
  });
  if (!signs.length) throw Error('No painted plaques in the loaded scene');
  const width = 384,
    height = 96;
  const camera = new B.FreeCamera('Plaque review camera', B.Vector3.Zero(), scene);
  camera.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.05;
  const target = new B.RenderTargetTexture('Plaque review target', { width, height }, scene, false);
  target.activeCamera = camera;
  target.clearColor = new B.Color4(0, 0, 0, 1);
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  function mask(data) {
    let low = 255,
      high = 0;
    for (let i = 0; i < data.length; i += 4) {
      low = Math.min(low, data[i]);
      high = Math.max(high, data[i]);
    }
    if (high - low < 32) throw Error('No visible lettering in frame');
    return Uint8Array.from({ length: width * height }, (_, i) =>
      Number(data[i * 4] > (low + high) / 2),
    );
  }
  const results = [];
  try {
    for (const mesh of signs) {
      const texture = mesh.material.albedoTexture;
      ctx.drawImage(texture.getContext().canvas, 0, 0, width, height);
      const expected = mask(ctx.getImageData(0, 0, width, height).data);
      const world = mesh.computeWorldMatrix(true);
      const normal = B.Vector3.TransformNormal(new B.Vector3(0, 0, -1), world).normalize();
      const box = mesh.getBoundingInfo().boundingBox;
      camera.orthoRight = box.extendSize.x;
      camera.orthoLeft = -camera.orthoRight;
      camera.orthoTop = box.extendSize.y;
      camera.orthoBottom = -camera.orthoTop;
      target.renderList = [mesh];
      for (const side of [1, -1]) {
        camera.position.copyFrom(box.centerWorld.add(normal.scale(side * 2)));
        camera.setTarget(box.centerWorld);
        for (let attempt = 0; !target.isReadyForRendering(); attempt++) {
          if (attempt > 120) throw Error('Sign materials did not become ready');
          await new Promise(requestAnimationFrame);
        }
        target.render();
        const drawn = mask(await target.readPixels());
        const errors = {};
        for (const orientation of ['upright', 'mirror', 'upsideDown', 'rotated']) {
          const flipX = orientation === 'mirror' || orientation === 'rotated';
          const flipY = orientation === 'upsideDown' || orientation === 'rotated';
          let missed = 0,
            ink = 0;
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              const bit =
                expected[(flipY ? height - 1 - y : y) * width + (flipX ? width - 1 - x : x)];
              // WebGL reads the bottom scanline first.
              const pixel = drawn[(height - 1 - y) * width + x];
              missed += bit ^ pixel;
              ink += bit | pixel;
            }
          errors[orientation] = missed / ink;
        }
        const [orientation, error] = Object.entries(errors).sort((a, b) => a[1] - b[1])[0];
        results.push({
          sign: mesh.name,
          side: side === 1 ? 'front' : 'back',
          orientation,
          glyphOverlap: +(1 - error).toFixed(3),
        });
      }
    }
    return results;
  } finally {
    target.dispose();
    camera.dispose();
  }
})();
