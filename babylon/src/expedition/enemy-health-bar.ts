import { MeshBuilder, ShaderMaterial, type Scene, type TransformNode } from '@babylonjs/core';

const shader = {
  vertexSource: `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform mat4 worldView;
    uniform mat4 projection;
    varying vec2 barUV;
    void main() {
      vec4 center = worldView * vec4(0.0, 0.0, 0.0, 1.0);
      // Offset each corner in view space so head rotation cannot tilt the health bar.
      float scale = clamp(center.z / 4.8, 0.12, 1.0);
      gl_Position = projection * (center + vec4(position.xy * scale, 0.0, 0.0));
      barUV = uv;
    }
  `,
  fragmentSource: `
    precision mediump float;
    varying vec2 barUV;
    uniform float health;
    void main() {
      float border = step(0.023, barUV.x) * step(barUV.x, 0.977)
                   * step(0.16, barUV.y) * step(barUV.y, 0.84);
      float filled = 1.0 - step(mix(0.023, 0.977, health), barUV.x);
      vec3 track = vec3(0.08, 0.05, 0.06);
      vec3 fill = vec3(0.84, 0.32, 0.26);
      vec3 rim = vec3(0.43, 0.34, 0.25);
      gl_FragColor = vec4(mix(rim, mix(track, fill, filled), border), 1.0);
    }
  `,
};

export function createEnemyHealthBar(
  scene: Scene,
  anchor: TransformNode,
  index: number,
  maxHealth: number,
  heightAboveAnchor: number,
) {
  const name = `enemy ${index + 1} health bar`;
  const bar = MeshBuilder.CreatePlane(name, { width: 0.74, height: 0.1 }, scene);
  bar.parent = anchor;
  bar.position.y = heightAboveAnchor;
  bar.isPickable = false;
  bar.metadata = { castShadow: false };

  const material = new ShaderMaterial(name, scene, shader, {
    attributes: ['position', 'uv'],
    uniforms: ['worldView', 'projection', 'health'],
  });
  material.backFaceCulling = false;
  Object.assign(material, { disableLighting: true });
  bar.material = material;
  return (health: number) => material.setFloat('health', health / maxHealth);
}
