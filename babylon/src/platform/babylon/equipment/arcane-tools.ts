import type { Scene, Material } from '@babylonjs/core';
import { PBRMaterial } from '@babylonjs/core';
import type { bowNockMotion, bowReleaseMotion, rechargeMotion } from './recharge-motion.ts';
import {
  Color3,
  ImportMeshAsync,
  Matrix,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { glowMaterial, glowPlane } from '../effects/spell-glow.ts';

export type WandMotion = NonNullable<ReturnType<typeof rechargeMotion>>;
export type BowMotion = NonNullable<ReturnType<typeof bowNockMotion>> & {
  grasp?: Vector3;
  looseDirection?: Vector3;
};
export type BowRelease = ReturnType<typeof bowReleaseMotion>;

interface BowAnimation {
  charge: number;
  draw: number;
  nocked?: boolean;
  bowSpan?: number;
  drawing: boolean;
  clock: number;
  release: BowRelease;
}

// A billboard faces the camera and ignores its parent's rotation for its own offset.
// Put the offset on a socket so the light stays on the moving hand or arrow.
function mountedGlow(scene: Scene, rig: TransformNode, name: string, material: Material) {
  const socket = new TransformNode(name + ' socket', scene);
  socket.parent = rig;
  const plane = glowPlane(scene, name, material);
  plane.parent = socket;
  return { plane, socket };
}

function createRechargeMark(scene: Scene, rig: TransformNode) {
  const color = Color3.FromHexString('#8af4f3');
  const ink = new StandardMaterial('vesper seal ink', scene);
  ink.disableLighting = true;
  ink.emissiveColor = color;
  const { plane: bloom, socket: bloomSocket } = mountedGlow(
    scene,
    rig,
    'recharge glow',
    glowMaterial(scene, 'recharge halo', color),
  );
  const lines = [];
  for (let arc = 0; arc < 3; arc++)
    lines.push(
      Array.from({ length: 19 }, (_, i) => {
        const a = (arc * Math.PI * 2) / 3 + (i / 18) * 1.72;
        return new Vector3(0.093 * Math.cos(a), 0.093 * Math.sin(a), 0.006 * Math.sin(2 * a));
      }),
    );
  const strokes = lines.map((path) => {
    const mesh = MeshBuilder.CreateTube(
      'recharge glyph stroke',
      { path, radius: 0.0045, tessellation: 6 },
      scene,
    );
    mesh.material = ink;
    return mesh;
  });
  const meshes = [...strokes, bloom];
  const focus = new Vector3(0, 0, 0.255);
  for (const mesh of strokes) {
    mesh.parent = rig;
    mesh.setEnabled(false);
  }
  return {
    meshes,
    update(motion: WandMotion | null, complete: number) {
      const light = motion?.light ?? 0;
      for (const mesh of strokes) {
        mesh.setEnabled(light > 0.01);
        if (!motion || light <= 0.01) continue;
        mesh.position.copyFrom(focus);
        mesh.rotation.z = motion.angle;
        mesh.scaling.setAll(1.16 - 0.46 * motion.seat);
        mesh.visibility = light;
      }
      bloom.setEnabled(light > 0.01 || complete > 0);
      if (!bloom.isEnabled()) return;
      bloomSocket.position.copyFrom(motion && light > 0.01 ? motion.freeHand : focus);
      bloom.scaling.setAll(complete > 0 ? 0.14 + 0.19 * (1 - complete) : 0.075 + 0.085 * light);
      bloom.visibility = complete > 0 ? complete : 0.5 + 0.3 * light;
    },
  };
}

export async function createArcaneTool(scene: Scene, rig: TransformNode, bow: boolean) {
  const file = bow ? 'dawn-folio.glb' : 'vesper-quill.glb';
  const model = await ImportMeshAsync('./assets/arcane/' + file, scene);
  const root = model.meshes[0];
  if (!root) throw Error('Missing root in ' + file);
  root.parent = rig;
  const nodes = new Map(
    [...model.transformNodes, ...model.meshes].map((node) => [node.name, node]),
  );
  function socket(name: string) {
    const node = nodes.get(name);
    if (!node) throw Error('Missing ' + name + ' in ' + file);
    return node;
  }
  const grip = socket('Grip').position.clone();
  const meshes = model.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  const stone = meshes
    .map((mesh) => mesh.material)
    .find((mat) => mat?.name === (bow ? 'Sunstone' : 'Moonstone'));
  if (!(stone instanceof PBRMaterial || stone instanceof StandardMaterial))
    throw Error('Missing emissive stone in ' + file);
  const emission = stone.emissiveColor.clone();
  const illuminate = (charge: number) =>
    emission.scaleToRef(0.28 + charge * 1.8, stone.emissiveColor);
  if (!bow) {
    const mark = createRechargeMark(scene, rig);
    meshes.push(...mark.meshes);
    return {
      meshes,
      file,
      form: 'crystal-wand' as const,
      tip: socket('Focus').position.clone(),
      grips: () => ({ trigger: grip, support: grip }),
      update: ({
        charge,
        motion,
        complete,
      }: {
        charge: number;
        motion: WandMotion | null;
        complete: number;
      }) => {
        illuminate(charge);
        mark.update(motion, complete);
      },
    };
  }

  const limbs = ['Upper', 'Lower'].map((side) => socket(side + 'Limb'));
  for (const limb of limbs) limb.rotationQuaternion = null;
  const nocks = ['Upper', 'Lower'].map((side) => socket(side + 'Nock'));
  const arrow = socket('LightArrow');
  const shelf = socket('ArrowRest').position.clone();
  // glTF's conversion root mirrors X in this left-handed scene.
  const rest = new Vector3(-shelf.x, shelf.y, shelf.z);
  arrow.position.copyFrom(shelf);
  const arrowLength = socket('ArrowPoint').position.z;
  const loose = new TransformNode('arrow draw hand', scene);
  loose.parent = rig;
  loose.rotationQuaternion = Quaternion.Identity();
  const forward = Vector3.Forward();
  const looseArrow = arrow.clone('handheld arrow', loose);
  if (!looseArrow) throw Error('Cannot clone arrow in ' + file);
  looseArrow.position.setAll(0);
  loose.setEnabled(false);
  meshes.push(...loose.getChildMeshes());
  const cord = new StandardMaterial('waxed gold bowstring', scene);
  cord.diffuseColor = Color3.FromHexString('#c4a677');
  cord.emissiveColor = new Color3(0.16, 0.11, 0.06);
  const strings = nocks.map(() => {
    const mesh = MeshBuilder.CreateCylinder(
      'bowstring',
      { height: 1, diameter: 0.0034, tessellation: 6 },
      scene,
    );
    mesh.parent = rig;
    mesh.rotationQuaternion = Quaternion.Identity();
    mesh.material = cord;
    mesh.metadata = { animatedScale: true };
    return mesh;
  });
  const inverse = Matrix.Identity(),
    end = new Vector3(),
    segment = new Vector3();
  const drawHand = rest.clone(),
    stringCenter = rest.clone(),
    tip = rest.clone();
  const { plane: drawGlow, socket: drawSocket } = mountedGlow(
    scene,
    rig,
    'arrowhead charge glow',
    glowMaterial(scene, 'sun halo', new Color3(1, 0.53, 0.12)),
  );
  const threads = [0, Math.PI].map((phase) => {
    const path = Array.from({ length: 20 }, (_, i) => {
      const t = i / 19,
        angle = phase + t * 5,
        r = 0.037 * (1 - t);
      return new Vector3(r * Math.cos(angle), r * Math.sin(angle), (t - 1) * 0.27);
    });
    const mesh = MeshBuilder.CreateTube(
      'arrow charge thread',
      {
        path,
        tessellation: 4,
        radiusFunction: (i) => 0.0005 + 0.0019 * Math.sin((i * Math.PI) / 19),
      },
      scene,
    );
    mesh.parent = rig;
    mesh.material = cord;
    mesh.setEnabled(false);
    return mesh;
  });
  return {
    meshes: [...meshes, ...strings, ...threads, drawGlow],
    file,
    form: 'rune-bow' as const,
    arrowModel: arrow,
    arrowLength,
    tip,
    rest,
    stringCenter,
    grips: () => ({ trigger: drawHand, support: grip }),
    prepareArrows() {
      const seated = arrow.isEnabled(false);
      const inHand = loose.isEnabled(false);
      arrow.setEnabled(true);
      loose.setEnabled(true);
      return () => {
        arrow.setEnabled(seated);
        loose.setEnabled(inHand);
      };
    },
    placeLooseArrow(motion: BowMotion | null) {
      const visible = Boolean(motion?.hasArrow && !motion.seated && motion.grasp);
      loose.setEnabled(visible);
      if (!visible || !motion?.grasp || !motion.looseDirection) return;
      loose.position.copyFrom(motion.grasp);
      looseArrow.scaling.copyFrom(arrow.scaling);
      const direction = Vector3.Lerp(motion.looseDirection, forward, motion.carry).normalize();
      Quaternion.FromUnitVectorsToRef(forward, direction, loose.rotationQuaternion!);
    },
    update({ charge, draw, nocked, bowSpan, drawing, clock, release }: BowAnimation) {
      illuminate(charge);
      const span = bowSpan ?? 0.13 + 0.26 * draw;
      drawHand.z = -span;
      // Keep the launch anchor at the drawn pose while the released string
      // and the bow's limbs spring back independently of the drawing hand.
      const stringSpan = release ? 0.13 + (span - 0.13) * release.tension : span;
      stringCenter.z = -stringSpan;
      arrow.position.z = -span;
      const arrowScale = bowSpan === undefined ? 1 : 0.495 / arrowLength;
      arrow.scaling.z = arrowScale;
      tip.z = arrowLength * arrow.scaling.z - span;
      arrow.setEnabled(Boolean(nocked));
      cord.emissiveColor.set(0.16 + draw * 0.88, 0.11 + draw * 0.52, 0.06 + draw * 0.15);
      drawGlow.setEnabled(drawing);
      drawSocket.position.copyFrom(tip);
      drawGlow.scaling.setAll(0.045 + 0.12 * draw);
      drawGlow.visibility = 0.42 + 0.46 * draw;
      for (const mesh of threads) {
        mesh.setEnabled(drawing);
        if (!drawing) continue;
        mesh.position.copyFrom(tip);
        mesh.rotation.z = clock * 5;
        mesh.scaling.set(0.75 + 0.38 * draw, 0.75 + 0.38 * draw, 0.4 + draw);
        mesh.visibility = 0.34 + 0.6 * draw;
      }
      const bend = Math.min(0.2, Math.max(0, stringSpan - 0.13) * 0.9);
      rig.computeWorldMatrix(true).invertToRef(inverse);
      for (let i = 0; i < nocks.length; i++) {
        limbs[i]!.rotation.x = i === 0 ? -bend : bend;
        nocks[i]!.computeWorldMatrix(true);
        Vector3.TransformCoordinatesToRef(nocks[i]!.getAbsolutePosition(), inverse, end);
        end.subtractToRef(stringCenter, segment);
        const mesh = strings[i]!;
        mesh.position.copyFrom(end).addInPlace(stringCenter).scaleInPlace(0.5);
        mesh.scaling.y = segment.length();
        Quaternion.FromUnitVectorsToRef(
          Vector3.UpReadOnly,
          segment.normalize(),
          mesh.rotationQuaternion!,
        );
      }
    },
  };
}
