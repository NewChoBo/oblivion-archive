import {
  Color3,
  HemisphericLight,
  ImportMeshAsync,
  ShaderMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { ModelMotion } from '../actors/model-motion.ts';
import { bindInkApparitionSurfaces } from './ink-apparition-surfaces.ts';
import { sampleSky } from '../citadel/castle-exterior.ts';

import type { BotAttackPose } from '../../../game/ai/bot-attack.ts';
import type { Scene } from '@babylonjs/core';
import type { Bounds } from '../../../content/level-geometry.ts';
import type { createCastleExterior } from '../citadel/castle-exterior.ts';

const path = './assets/chapter-art/';

export async function loadInkApparition(scene: Scene, parent: TransformNode) {
  const model = await ImportMeshAsync(path + 'ink-apparition.glb', scene, {
    pluginOptions: { gltf: { animationStartMode: 0 } },
  });
  model.meshes[0]!.parent = parent;
  const { head, surfaces } = bindInkApparitionSurfaces(model);

  const lanternFill = new HemisphericLight(
    'ink shadow cool fill',
    new Vector3(-0.42, 0.83, -0.36),
    scene,
  );
  lanternFill.diffuse = new Color3(0.7, 0.73, 0.82);
  lanternFill.groundColor = new Color3(0.28, 0.23, 0.17);
  lanternFill.intensity = 0.42;
  lanternFill.renderPriority = 17;
  lanternFill.includedOnlyMeshes = surfaces;

  const motion = new ModelMotion(model.animationGroups, [
    'Hover',
    'Glide',
    'Windup',
    'Recover',
    'Stagger',
  ]);
  let clock = 0;
  function pose(dt: number, stunned: boolean, speed: number, attack: BotAttackPose) {
    clock += dt;
    if (stunned) motion.loop('Stagger', clock, dt);
    else if (attack.phase === 'windup') motion.seek('Windup', attack.progress, dt);
    else if (attack.phase === 'recovery') motion.seek('Recover', attack.progress, dt, false);
    else motion.loop(speed > 0.035 ? 'Glide' : 'Hover', clock, dt);
  }
  motion.loop('Hover', 0, 0);
  return { head, pose };
}

const leviathanShader = {
  vertexSource: `
    precision highp float;
    attribute vec3 position;
    attribute vec3 normal;
    uniform mat4 world;
    uniform mat4 worldViewProjection;
    varying vec3 vWorld;
    varying vec3 vNormal;
    void main() {
      vWorld = (world * vec4(position, 1.0)).xyz;
      vNormal = mat3(world) * normal;
      gl_Position = worldViewProjection * vec4(position, 1.0);
    }
  `,
  fragmentSource: `
    precision highp float;
    uniform vec3 cameraPosition;
    uniform float presence;
    varying vec3 vWorld;
    varying vec3 vNormal;
    ${sampleSky}
    void main() {
      vec3 ray = normalize(vWorld - cameraPosition);
      vec3 normal = normalize(vNormal);
      vec3 background = skyAt(ray);
      float edge = 1.0 - abs(dot(normal, ray));
      float ridge = max(0.0, dot(normal, normalize(vec3(0.3, 0.7, 0.52))));
      vec3 carapace = vec3(0.008, 0.012, 0.019);
      carapace += vec3(0.063, 0.084, 0.122) * (0.64 * pow(edge, 3.0) + 0.34 * ridge * ridge);
      // Sample the same direction as the skybox to fade the volume through starlight.
      gl_FragColor = vec4(mix(background, carapace, presence), 1.0);
    }
  `,
};

export function createOuterLeviathan(
  scene: Scene,
  sky: Pick<ReturnType<typeof createCastleExterior>, 'bind'>,
  lookoutBounds: Bounds,
) {
  const [[west, east], [floor], [south, north]] = lookoutBounds;
  const origin = new Vector3((west + east) / 2, floor + 1.6, (south + north) / 2);
  const root = new TransformNode('outer leviathan', scene);
  root.setEnabled(false);
  const material = new ShaderMaterial('leviathan shadowed carapace', scene, leviathanShader, {
    attributes: ['position', 'normal'],
    uniforms: ['world', 'worldViewProjection', 'cameraPosition', 'presence', 'skyTime'],
    samplers: ['skyMap'],
  });
  sky.bind(material);
  material.setFloat('presence', 0);
  let motion: ModelMotion | undefined;

  return {
    async load() {
      const model = await ImportMeshAsync(path + 'outer-leviathan.glb', scene, {
        pluginOptions: { gltf: { animationStartMode: 0 } },
      });
      model.meshes[0]!.parent = root;
      for (const mesh of model.meshes) {
        mesh.isPickable = false;
        mesh.metadata = { exteriorView: true, castShadow: false };
        if (mesh.getTotalVertices() > 0) mesh.material = material;
      }
      motion = new ModelMotion(model.animationGroups, ['VoidSwim']);
    },
    show(yaw: number, elevation: number, presence: number, time: number) {
      if (!presence) {
        root.setEnabled(false);
        return;
      }
      const distance = 32;
      const horizontal = distance * Math.cos(elevation);
      root.position.set(
        origin.x + Math.sin(yaw) * horizontal,
        origin.y + distance * Math.sin(elevation),
        origin.z + Math.cos(yaw) * horizontal,
      );
      root.rotation.set(-elevation * 0.56, yaw + 0.21, 0);
      motion?.loop('VoidSwim', time, 0);
      material.setFloat('presence', presence);
      root.setEnabled(true);
    },
  };
}
