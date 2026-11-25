import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Texture,
  Vector4,
  type Scene,
  type PBRMaterial,
} from '@babylonjs/core';

export type Point3 = readonly [x: number, y: number, z: number];
export type MaterialFactory = (name: string, color: string) => PBRMaterial;

export function createPlaqueFactory(scene: Scene, material: MaterialFactory) {
  return function sign(
    name: string,
    text: string,
    p: Point3,
    width = 1.8,
    height = 0.48,
    rotation = 0,
    zone?: string,
  ) {
    const texture = new DynamicTexture(
      name,
      { width: 1024, height: 256 },
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = false;
    const mat = material(name + ' painted wood', '#ffffff');
    mat.albedoTexture = texture;
    mat.emissiveTexture = texture;
    mat.emissiveColor = new Color3(0.03, 0.025, 0.019);
    // Each side reads left to right. Both use the same canvas when a rune changes.
    const mesh = MeshBuilder.CreatePlane(
      name,
      { width, height, sideOrientation: Mesh.DOUBLESIDE, backUVs: new Vector4(1, 0, 0, 1) },
      scene,
    );
    mesh.position.set(...p);
    mesh.rotation.y = rotation;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.metadata = { lightingZone: zone, castShadow: false };
    const update = (value: string) => {
      const context = texture.getContext() as CanvasRenderingContext2D;
      const size = texture.getSize();
      // Paint in the proportions of the plaque so long Korean clues keep square glyphs.
      const labelHeight = (size.width * height) / width;
      context.save();
      context.scale(1, size.height / labelHeight);
      const wood = context.createLinearGradient(0, 0, size.width, labelHeight);
      wood.addColorStop(0, '#37291e');
      wood.addColorStop(0.55, '#513a27');
      wood.addColorStop(1, '#30251e');
      context.fillStyle = wood;
      context.fillRect(0, 0, size.width, labelHeight);
      const inset = labelHeight * 0.075;
      context.strokeStyle = '#94724d';
      context.lineWidth = labelHeight * 0.014;
      context.strokeRect(inset, inset, size.width - 2 * inset, labelHeight - 2 * inset);
      context.fillStyle = '#c6a175';
      for (const x of [inset * 1.8, size.width - inset * 1.8]) {
        context.beginPath();
        context.arc(x, labelHeight / 2, labelHeight * 0.022, 0, Math.PI * 2);
        context.fill();
      }
      const fontFamily = 'Pretendard, "Malgun Gothic", sans-serif';
      context.font = `600 120px ${fontFamily}`;
      const fontSize = Math.min(
        labelHeight * 0.58,
        (120 * (size.width - 5 * inset)) / context.measureText(value).width,
      );
      context.font = `600 ${Math.floor(fontSize)}px ${fontFamily}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#f1e8d3';
      context.fillText(value, size.width / 2, labelHeight / 2);
      context.restore();
      texture.update(true);
    };
    update(text);
    return { mesh, update };
  };
}
