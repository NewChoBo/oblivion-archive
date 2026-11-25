import { readFileSync } from 'node:fs';
import { NullEngine, Observable, Scene, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';

export function humanoidScene(t) {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  // Keep the production loaders, asset cloning and skinning; only replace the HTTP transport.
  scene._loadFile = (url, done, _progress, _offline, binary) => {
    const request = { onCompleteObservable: new Observable(), abort() {} };
    queueMicrotask(() => {
      const bytes = readFileSync(new URL('../../../public/' + url, import.meta.url));
      done(binary ? Uint8Array.from(bytes).buffer : bytes.toString());
      request.onCompleteObservable.notifyObservers(request);
    });
    return request;
  };
  return scene;
}

export function measureHumanoid(root) {
  const skin = root.getChildMeshes().find((mesh) => mesh.skeleton);
  const world = skin.computeWorldMatrix(true);
  const skeleton = skin.skeleton;
  skeleton.prepare(true);
  skeleton.computeAbsoluteMatrices(true);
  const point = (name) =>
    skeleton.bones.find((bone) => bone.name.endsWith(':' + name)).getAbsolutePosition(skin);
  // Measure the deformed surface. An ankle pivot is above the sole, and HeadTop_End
  // stops below the crown. A raised hand can be the highest vertex in the guard pose.
  const vertices = skin.getPositionData(true);
  const indices = skin.getVerticesData('matricesIndices');
  const v = new Vector3();
  let sole = Infinity,
    crown = -Infinity;
  for (let i = 0; i < vertices.length / 3; i++) {
    const joint = skeleton.bones[indices[4 * i]]?.name ?? '';
    Vector3.FromArrayToRef(vertices, 3 * i, v);
    Vector3.TransformCoordinatesToRef(v, world, v);
    if (/Foot|Toe/.test(joint)) sole = Math.min(sole, v.y);
    if (/Head|Eye/.test(joint)) crown = Math.max(crown, v.y);
  }
  return { sole, crown, eye: Vector3.Center(point('LeftEye'), point('RightEye')) };
}
