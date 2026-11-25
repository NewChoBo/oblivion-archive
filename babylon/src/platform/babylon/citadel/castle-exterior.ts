import type { Scene } from '@babylonjs/core';
import { CubeTexture, Mesh, MeshBuilder, ShaderMaterial } from '@babylonjs/core';
import px from '../../../../../asset-sources/Art/Chapter1/skybox/space_px.png';
import py from '../../../../../asset-sources/Art/Chapter1/skybox/space_py.png';
import pz from '../../../../../asset-sources/Art/Chapter1/skybox/space_pz.png';
import nx from '../../../../../asset-sources/Art/Chapter1/skybox/space_nx.png';
import ny from '../../../../../asset-sources/Art/Chapter1/skybox/space_ny.png';
import nz from '../../../../../asset-sources/Art/Chapter1/skybox/space_nz.png';

// The skybox and the crossing silhouette must resolve the same stars at each ray.
export const sampleSky = `
  uniform samplerCube skyMap;
  uniform float skyTime;
  vec3 skyAt(vec3 ray) {
    vec3 color = textureCube(skyMap, ray).rgb;
    float peak = max(color.r, max(color.g, color.b));
    vec3 neighborhood = textureCube(skyMap, ray, 3.0).rgb;
    if (peak > .055) {
      // A stellar core is much brighter than the surrounding coarse mip.
      // The broad nebula stays still, including where it is as bright as a star.
      vec3 core = max(color - neighborhood, vec3(0.0));
      float mask = smoothstep(.025, .12, max(core.r, max(core.g, core.b)));
      vec3 d = normalize(ray);
      float phase = dot(d, vec3(73.2, 48.7, -85.1));
      float rate = 1.55 + .52 * sin(dot(d, vec3(-19.6, 31.1, 14.8)));
      float wave = .48 * sin(skyTime * rate + phase)
                 + .20 * sin(skyTime * (rate * 1.72) - .71 * phase);
      color += core * mask * (.13 + wave);
    }
    return color;
  }
`;

const skyShader = {
  vertexSource: `
    precision highp float;
    attribute vec3 position;
    uniform mat4 worldViewProjection;
    varying vec3 skyDirection;
    void main() {
      skyDirection = position;
      gl_Position = worldViewProjection * vec4(position, 1.0);
      gl_Position.z = gl_Position.w * 0.999999;
    }
  `,
  fragmentSource: `
    precision highp float;
    varying vec3 skyDirection;
    ${sampleSky}
    void main() {
      gl_FragColor = vec4(skyAt(skyDirection), 1.0);
    }
  `,
};

export function createCastleExterior(scene: Scene) {
  const cube = CubeTexture.CreateFromImages([px, py, pz, nx, ny, nz], scene);
  cube.name = 'deep space cubemap';
  const layers: ShaderMaterial[] = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = 0;
  function bind(layer: ShaderMaterial) {
    layer.setTexture('skyMap', cube);
    layer.setFloat('skyTime', elapsed);
    layers.push(layer);
  }
  const material = new ShaderMaterial('dark blue void outside the citadel', scene, skyShader, {
    attributes: ['position'],
    uniforms: ['worldViewProjection', 'skyTime'],
    samplers: ['skyMap'],
  });
  bind(material);
  material.disableDepthWrite = true;

  const skybox = MeshBuilder.CreateBox(
    'space skybox',
    { size: 100, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  skybox.infiniteDistance = true;
  skybox.alwaysSelectAsActiveMesh = true;
  skybox.isPickable = false;
  skybox.metadata = { exteriorView: true, castShadow: false };
  skybox.material = material;

  return {
    bind,
    update(seconds: number) {
      if (reducedMotion.matches) return;
      elapsed += seconds;
      for (const layer of layers) layer.setFloat('skyTime', elapsed);
    },
  };
}
