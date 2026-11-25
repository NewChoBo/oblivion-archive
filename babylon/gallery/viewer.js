import legacyNames from '../../docs/provenance/chapter-1-legacy-names.json';

// The published map predates glTF cutaway metadata. Match only its original overhead pieces.
const legacyCutaways = new Set(legacyNames.galleryCutaways);
const canvas = document.querySelector('#model-view'),
  select = document.querySelector('#model');
const status = document.querySelector('#viewer-status');
const motionSelect = document.querySelector('#model-motion');
const motionLabel = document.querySelector('label[for="model-motion"]');
const motionNames = {
  Hover: '부유',
  Glide: '추격',
  Windup: '공격 준비와 타격',
  Recover: '공격 회수',
  Stagger: '경직',
  VoidSwim: '허공 유영',
};
function previewMotion() {
  for (const clip of active?.animationGroups ?? []) {
    if (clip.name === motionSelect.value) clip.start(true);
    else clip.stop();
  }
}
motionSelect.addEventListener('change', previewMotion);
let start,
  serial = 0,
  active;
if (new URLSearchParams(location.search).get('model') === 'citadel') select.value = 'citadel';

async function init() {
  const B = await import('@babylonjs/core');
  await import('@babylonjs/loaders/glTF/2.0/glTFLoader.js');
  await import('@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata.js');
  await import('@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_unlit.js');
  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(0.135, 0.169, 0.176, 1);
  scene.ambientColor = new B.Color3(0.2, 0.19, 0.18);
  const camera = new B.ArcRotateCamera(
    'Gallery orbit camera',
    1.1,
    1.33,
    3,
    B.Vector3.Zero(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.minZ = 0.025;
  camera.wheelDeltaPercentage = 0.011;
  camera.panningSensibility = 0;
  const sky = new B.HemisphericLight('Gallery fill light', new B.Vector3(0.2, 1, 0.3), scene);
  sky.intensity = 1.6;
  sky.groundColor = new B.Color3(0.45, 0.41, 0.37);
  const key = new B.DirectionalLight(
    'Gallery side light',
    new B.Vector3(-0.53, -0.74, -0.7),
    scene,
  );
  key.intensity = 2.2;
  let lastFit = 0;
  const frameCitadel = () => Math.max(87, (119 * canvas.clientHeight) / canvas.clientWidth);
  new ResizeObserver(() => {
    engine.resize();
    const fit = frameCitadel();
    if (lastFit && select.value === 'citadel') camera.radius *= fit / lastFit;
    lastFit = fit;
  }).observe(canvas);
  engine.runRenderLoop(() => scene.render());
  return { B, scene, camera, sky, key, frameCitadel };
}

async function show() {
  const token = ++serial,
    file = select.value;
  status.textContent = '모델 불러오는 중…';
  motionSelect.hidden = motionLabel.hidden = true;
  try {
    const { B, scene, camera, sky, key, frameCitadel } = await (start ??= init());
    const citadel = file === 'citadel',
      map = citadel || file === 'chapter-map';
    const character = file === 'archive-scribe',
      leviathan = file === 'outer-leviathan';
    const url = map ? './chapter-map.glb' : '../../../assets/chapter-art/' + file + '.glb';
    const asset = await B.LoadAssetContainerAsync(url, scene, {
      pluginOptions: { gltf: { animationStartMode: 0 } },
    });
    if (token !== serial) {
      asset.dispose();
      return;
    }
    active?.dispose();
    active = asset;
    asset.addAllToScene();
    if (leviathan || file === 'ink-apparition') {
      motionSelect.replaceChildren(
        ...asset.animationGroups.map(({ name }) => new Option(motionNames[name] ?? name, name)),
      );
      motionSelect.hidden = motionLabel.hidden = false;
      previewMotion();
    }
    sky.intensity = citadel ? 0.82 : 1.6;
    key.intensity = citadel ? 1.0 : 2.2;
    const meshes = asset.meshes.filter((m) => m.getTotalVertices() > 0);
    if (map) {
      for (const mesh of meshes) {
        if (mesh.metadata?.gltf?.extras?.galleryCutaway || legacyCutaways.has(mesh.name))
          mesh.setEnabled(false);
      }
    }
    if (character) {
      const idle = asset.animationGroups.find((g) => g.name === 'Idle');
      if (idle) {
        idle.start(false);
        idle.goToFrame(idle.from);
        idle.pause();
      }
      // Hold the game's standing pose so the silhouette can be examined from any angle.
      const joints = new Map(asset.transformNodes.map((node) => [node.name, node]));
      joints.get('head').scaling.scaleInPlace(0.8);
      const hips = joints.get('hips');
      hips.position.y += 0.52 * (hips.position.y + joints.get('upperleg.l').position.y - 0.145);
      for (const side of ['l', 'r']) {
        joints.get('upperleg.' + side).scaling.scaleInPlace(1.14);
        joints.get('lowerleg.' + side).position.scaleInPlace(1.52 / 1.14);
        const boot = joints.get('foot.' + side);
        boot.position.scaleInPlace(1.52 / 1.14);
        boot.scaling.scaleInPlace(1 / 1.14);
      }
    }
    for (const mesh of meshes) mesh.computeWorldMatrix(true);
    const bounds = B.Mesh.MinMax(meshes);
    const center = bounds.min.add(bounds.max).scale(0.5);
    const span = bounds.max.subtract(bounds.min);
    camera.lowerRadiusLimit = null;
    camera.upperRadiusLimit = null;
    camera.setTarget(center);
    camera.alpha = map ? -0.1 : character ? 1.16 : file === 'folio-bookcase' ? 1.34 : -1.19;
    camera.beta = map ? 0.47 : leviathan ? 1.7 : 1.39;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const width = leviathan ? span.x / Math.min(aspect, 2.1) : span.x;
    camera.radius = map
      ? Math.max(span.z / aspect, span.x) * 1.49
      : Math.max(span.y, width, span.z) * 1.69;
    if (citadel) {
      camera.setTarget(new B.Vector3(-7, 0, -40));
      camera.alpha = -0.93;
      camera.beta = 1.05;
      camera.radius = frameCitadel();
    }
    camera.lowerRadiusLimit = camera.radius * 0.3;
    camera.upperRadiusLimit = camera.radius * 2.2;
    await scene.whenReadyAsync();
    if (token === serial) {
      scene.render();
      status.textContent = '드래그로 회전 · 휠로 확대';
    }
  } catch (error) {
    if (token === serial) status.textContent = '모델을 불러오지 못했습니다. ' + error.message;
  }
}
const observer = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    observer.disconnect();
    show();
  }
});
observer.observe(canvas);
select.addEventListener('change', show);
