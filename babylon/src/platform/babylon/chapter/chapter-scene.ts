import {
  Color3,
  HemisphericLight,
  MeshBuilder,
  PointLight,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import erasedPhotoUrl from '../../../../../asset-sources/Art/Chapter1/archive-photo-erased.webp';
import restoredPhotoUrl from '../../../../../asset-sources/Art/Chapter1/archive-photo-restored.webp';
import { createLoreProps } from './chapter-lore.ts';
import { createChapterWorld } from './chapter-world.ts';
import { createCastleRelief } from '../citadel/castle-relief.ts';
import { buildCitadel, citadelLookoutBounds } from '../citadel/floating-citadel.ts';
import { createOuterLeviathan } from './chapter-creatures.ts';
import { createVoidEncounter } from '../../../game/chapter/void-encounter.ts';
import { chapterWorldText } from '../../../content/locales/chapter-world.ts';
import { chapterLevel, construction } from '../../../content/citadel-layout.ts';
import { createArchiveMagic } from './arcane-art.ts';
import { createOpeningLight } from '../lighting/opening-lights.ts';

import type { BaseTexture, DirectionalLight, Mesh, PBRMaterial, Scene } from '@babylonjs/core';
import type { ChapterWorldOptions } from './chapter-world.ts';
import type { createCastleExterior } from '../citadel/castle-exterior.ts';

interface ChapterSceneOptions extends Omit<ChapterWorldOptions, 'wood' | 'brass'> {
  collisionBoxes: Mesh[];
  environmentMaterials: Record<string, PBRMaterial>;
  rampartReflections?: BaseTexture | null;
  sun: DirectionalLight;
  ambient: HemisphericLight;
  sky: Pick<ReturnType<typeof createCastleExterior>, 'bind'>;
  onVoidStart(duration: number): void;
}
export function buildChapterScene(
  scene: Scene,
  {
    environment,
    material,
    box,
    collisionBoxes,
    environmentMaterials,
    rampartReflections,
    sun,
    ambient,
    sky,
    wallLamps,
    onVoidStart,
    onDamage,
    readHealth,
  }: ChapterSceneOptions,
) {
  const wood = environmentMaterials.wood!,
    darkWood = environmentMaterials.darkWood!;
  const brass = material('oxidized brass', '#a07d43'),
    paper = material('manuscript paper', '#d3bd91');
  brass.metallic = 0.72;
  brass.roughness = 0.41;
  const readingRoom = environment.placeZone('readingRoom');
  const citadel = buildCitadel(scene, {
    material,
    colliders: collisionBoxes,
    reflection: rampartReflections,
    entranceFrame: chapterLevel.doorFrames['south-entrance'],
    loadTexture: (path) => new Texture('./' + path, scene),
  });
  const loreProps = createLoreProps(scene, { box, material });
  const rampartSurfaces = scene.meshes.filter((mesh) => mesh.metadata?.lightingZone === 'ramparts');
  const rampartLight = new HemisphericLight(
    'rampart cool fill',
    new Vector3(-0.65, 0.75, 0.25),
    scene,
  );
  rampartLight.diffuse = new Color3(0.54, 0.6, 0.69);
  rampartLight.groundColor = new Color3(0.13, 0.14, 0.17);
  rampartLight.intensity = construction.lighting.skyFill;
  rampartLight.renderPriority = 16;
  // The castle walls block the exterior key. Indoors it enters at the window.
  rampartLight.includedOnlyMeshes = rampartSurfaces.slice();
  sun.includedOnlyMeshes = rampartSurfaces.slice();
  const leviathan = createOuterLeviathan(scene, sky, citadelLookoutBounds);
  const voidEncounter = createVoidEncounter(citadelLookoutBounds, {
    show: leviathan.show,
    onStart: onVoidStart,
  });
  const openingLights = readingRoom.flatMap((wall) =>
    wall.exteriorLight
      ? [
          createOpeningLight(scene, {
            ...wall,
            bounds: wall.bounds!,
            openingAxis: wall.openingAxis!,
            openings: [wall.openings![0]!],
            exteriorLight: wall.exteriorLight,
          }),
        ]
      : [],
  );
  for (const fixture of readingRoom.filter(({ wallFixture }) => wallFixture)) {
    const [x, , z] = fixture.position!;
    const side = Math.sign(x);
    wallLamps.place({
      name: `${fixture.id} brass lantern`,
      zone: 'readingRoom',
      position: [x - side * 0.135, 2.35, z],
      inward: -side,
      color: '#ffdbad',
      intensity: 3.25,
      range: 3.75,
    });
  }
  const portal = box(
    'reading room seal gate',
    [0, 1.5, 7.57],
    [2.2, 3, 0.16],
    material('sealed stone slab', '#17232d'),
    true,
  );
  portal.metadata = { lightingZone: 'readingRoom' };
  const portalLight = new PointLight(
    'arch seal reflected light',
    new Vector3(0, 3.14, 6.54),
    scene,
  );
  portalLight.diffuse = Color3.FromHexString('#9cbfca').toLinearSpace();
  portalLight.specular = portalLight.diffuse.scale(0.3);
  portalLight.range = 2.15;
  portalLight.intensity = 0;
  portalLight.setEnabled(false);
  portalLight.metadata = { lightingZone: 'readingRoom' };
  const manuscript = box('manuscript', [0.24, 1.285, 1.58], [0.54, 0.015, 0.34], paper);
  box('story fragment plinth', [1.5, 0.42, -3.5], [0.65, 0.84, 0.6], wood, true);
  box('plinth top', [1.5, 0.87, -3.5], [0.74, 0.08, 0.66], darkWood);
  const photograph = new TransformNode('desk photograph', scene);
  photograph.position.set(0.5, 1.3, 1.8);
  const frame = box('photo frame', [0, 0.29, 0], [0.75, 0.58, 0.06], brass);
  frame.parent = photograph;
  const photoPrint = MeshBuilder.CreatePlane('photo print', { width: 0.66, height: 0.495 }, scene);
  photoPrint.parent = photograph;
  photoPrint.position.set(0, 0.29, -0.031);
  const erasedPhoto = new Texture(erasedPhotoUrl, scene);
  const restoredPhoto = new Texture(restoredPhotoUrl, scene);
  const printMaterial = material('faded silver gelatin print', '#d8d1c1');
  photoPrint.material = printMaterial;
  for (const mesh of [manuscript, frame, photoPrint])
    mesh.metadata = { lightingZone: 'readingRoom', castShadow: mesh !== photoPrint };
  photoPrint.receiveShadows = true;
  const deskLight = wallLamps.place({
    name: 'desk wax candle',
    zone: 'readingRoom',
    kind: 'candle',
    position: [1.15, 1.26, 1.55],
    color: '#ffd3a0',
    intensity: 1.45,
    range: 2.65,
  });
  ambient.renderPriority = 10;
  sun.renderPriority = 8;
  portalLight.renderPriority = 13;
  const [, , [northArchFront]] = readingRoom.find(({ frame }) => frame === 'north-arch')!.bounds!;
  const archiveMagic = createArchiveMagic(
    scene,
    chapterLevel.doorFrames['north-arch'],
    northArchFront,
  );
  const restoreRelief = createCastleRelief(scene, material);
  for (const mesh of archiveMagic.trim) {
    mesh.checkCollisions = true;
    collisionBoxes.push(mesh);
  }
  const chapterWorld = createChapterWorld(scene, {
    box,
    material,
    wood,
    brass,
    environment,
    wallLamps,
    onDamage,
    readHealth,
  });
  const interactionMeshes = chapterWorld.interactionMeshes;
  interactionMeshes.set('photo', [frame]);
  for (const [id, mesh] of loreProps.props) interactionMeshes.set(id, [mesh]);
  chapterWorld.sign(
    'citadel relief plaque',
    chapterWorldText('sign.relief'),
    [3.02, 1.87, 6.62],
    1.86,
    0.23,
    0,
    'readingRoom',
  );
  chapterWorld.sign(
    'rampart exit plaque',
    chapterWorldText('sign.ramparts'),
    [2.46, 2.13, -5.86],
    1.48,
    0.29,
    0,
    'readingRoom',
  );
  chapterWorld.sign(
    'reading room return plaque',
    chapterWorldText('sign.readingRoom'),
    [2.46, 2.13, -6.139],
    1.43,
    0.26,
    Math.PI,
  );
  return {
    readingRoom,
    citadel,
    loreProps,
    rampartSurfaces,
    leviathan,
    voidEncounter,
    openingLights,
    portal,
    portalLight,
    erasedPhoto,
    restoredPhoto,
    printMaterial,
    deskLight,
    archiveMagic,
    restoreRelief,
    chapterWorld,
  };
}
