// The pinned KayKit GLBs have one buffer, embedded PNGs and one view per accessor.
// Keep the artist's rig and texture, but ship only equipped meshes and gameplay clips.
export const raidModels = {
  hammer: {
    source: 'Knight',
    body: 'Knight_',
    gear: [],
    attacks: [
      '2H_Melee_Attack_Chop',
      '2H_Melee_Attack_Spin',
      '2H_Melee_Attack_Slice',
      '2H_Melee_Attack_Chop',
      '2H_Melee_Attack_Spinning',
    ],
  },
  abyss: {
    source: 'Mage',
    body: 'Mage_',
    gear: ['2H_Staff'],
    attacks: [
      'Spellcast_Shoot',
      'Spellcast_Raise',
      'Spellcast_Shoot',
      'Spellcast_Long',
      'Spellcasting',
    ],
  },
  longshot: {
    source: 'Rogue',
    body: 'Rogue_',
    gear: ['2H_Crossbow'],
    attacks: [
      '2H_Ranged_Shoot',
      '1H_Ranged_Shoot',
      '2H_Ranged_Shooting',
      'Throw',
      '2H_Ranged_Shoot',
    ],
  },
  rend: {
    source: 'Barbarian',
    body: 'Barbarian_',
    exclude: ['Barbarian_Round_Shield'],
    gear: ['1H_Axe', '1H_Axe_Offhand'],
    attacks: [
      'Dualwield_Melee_Attack_Chop',
      'Dualwield_Melee_Attack_Slice',
      'Throw',
      '2H_Melee_Attack_Spin',
      'Dualwield_Melee_Attack_Stab',
    ],
  },
  bastion: {
    source: 'Skeleton_Warrior',
    body: 'Skeleton_Warrior_',
    gear: [],
    attacks: [
      '1H_Melee_Attack_Slice_Horizontal',
      'Unarmed_Melee_Attack_Punch_A',
      '1H_Melee_Attack_Stab',
      '1H_Melee_Attack_Jump_Chop',
      '2H_Melee_Attack_Chop',
    ],
  },
  rime: {
    source: 'Skeleton_Mage',
    body: 'Skeleton_Mage_',
    gear: [],
    attacks: [
      'Spellcast_Shoot',
      'Spellcast_Raise',
      'Spellcast_Shoot',
      'Spellcast_Summon',
      'Spellcast_Long',
    ],
  },
  jade: {
    source: 'Rogue_Hooded',
    body: 'Rogue_',
    gear: [],
    attacks: [
      'Spellcast_Shoot',
      'Spellcast_Raise',
      'Spellcast_Shoot',
      'Spellcasting',
      'Spellcast_Long',
    ],
  },
};

function remap(entries, indices) {
  const selected = [...new Set(indices)];
  const lookup = new Map(selected.map((old, i) => [old, i]));
  return { entries: selected.map((i) => entries[i]), index: (old) => lookup.get(old) };
}

export function equipRaidModel(input, hero) {
  const jsonEnd = 20 + input.readUInt32LE(12);
  const gltf = JSON.parse(input.toString('utf8', 20, jsonEnd));
  const bin = input.subarray(jsonEnd + 8);
  const equipped = gltf.nodes.filter((node) => {
    if (node.mesh === undefined) return false;
    if (
      !hero.exclude?.includes(node.name) &&
      (node.name.startsWith(hero.body) || hero.gear.includes(node.name))
    )
      return true;
    delete node.mesh;
    return false;
  });
  const meshes = remap(
    gltf.meshes,
    equipped.map((n) => n.mesh),
  );
  for (const node of equipped) node.mesh = meshes.index(node.mesh);
  gltf.meshes = meshes.entries;
  const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  const actions = ['run', 'walk', 'jump', 'fall', 'basic', 'pulse', 'bolt', 'field', 'fury'];
  gltf.animations = ['Running_A', 'Walking_A', 'Jump_Idle', 'Death_A', ...hero.attacks].map(
    (name, index) => {
      const clip = structuredClone(clips.get(name));
      if (!clip) throw Error('Missing KayKit motion ' + name);
      clip.name = actions[index];
      return clip;
    },
  );
  // Gather all integer references before rewriting the indices in place.
  const refs = [];
  function reference(object, key) {
    if (!Number.isInteger(object[key])) throw Error('Invalid KayKit accessor ' + key);
    refs.push([object, key]);
  }
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) {
      reference(primitive, 'indices');
      for (const key of Object.keys(primitive.attributes)) reference(primitive.attributes, key);
    }
  for (const skin of gltf.skins) reference(skin, 'inverseBindMatrices');
  for (const clip of gltf.animations)
    for (const sampler of clip.samplers) {
      reference(sampler, 'input');
      reference(sampler, 'output');
    }
  const accessors = remap(
    gltf.accessors,
    refs.map(([obj, key]) => obj[key]),
  );
  for (const [obj, key] of refs) obj[key] = accessors.index(obj[key]);
  gltf.accessors = accessors.entries;
  const users = [...gltf.accessors, ...gltf.images];
  const views = remap(
    gltf.bufferViews,
    users.map((obj) => obj.bufferView),
  );
  for (const user of users) user.bufferView = views.index(user.bufferView);
  gltf.bufferViews = views.entries;
  let offset = 0;
  const chunks = [];
  for (const view of gltf.bufferViews) {
    const bytes = bin.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    const pad = Buffer.alloc((4 - (bytes.length % 4)) % 4);
    chunks.push(bytes, pad);
    view.byteOffset = offset;
    offset += bytes.length + pad.length;
  }
  gltf.buffers = [{ byteLength: offset }];
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const header = Buffer.from(input.subarray(0, 20));
  header.writeUInt32LE(28 + padded.length + offset, 8);
  header.writeUInt32LE(padded.length, 12);
  const binHeader = Buffer.from(input.subarray(jsonEnd, jsonEnd + 8));
  binHeader.writeUInt32LE(offset);
  return Buffer.concat([header, padded, binHeader, ...chunks]);
}
