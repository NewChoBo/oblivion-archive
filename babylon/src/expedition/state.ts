import { equipmentText } from '../content/locales/equipment.ts';
import { expeditionText } from '../content/locales/expedition.ts';
// Chapter-one expedition ledger. Every resource mutation is saved immediately;
// chapter checkpoints deliberately never roll this ledger back.
import type { GearInventory } from '../game/inventory/inventory-feature.ts';
import { damageForRegion, type HitRegion } from '../game/combat/hit-region.ts';
import { WEAPON_TYPES } from '../app/equipment/weapon-types.ts';

export const EXPEDITION_KEY = 'oblivion-archive.expedition.v1';
export const BAG_LIMIT = 6,
  STORAGE_LIMIT = 12;
export const QUARRY_ENEMY_HEALTH = 72;
export const GEAR = {
  wand: {
    id: 'wand',
    kind: 'wand',
    slot: 0,
    get title() {
      return equipmentText('gear.name.wand');
    },
    bonus: 0,
  },
  bow: {
    id: 'bow',
    kind: 'bow',
    slot: 1,
    get title() {
      return equipmentText('gear.name.bow');
    },
    bonus: 0,
  },
  'survey-wand': {
    id: 'survey-wand',
    kind: 'wand',
    slot: 0,
    get title() {
      return equipmentText('gear.name.survey-wand');
    },
    bonus: 6,
  },
  'hunter-bow': {
    id: 'hunter-bow',
    kind: 'bow',
    slot: 1,
    get title() {
      return equipmentText('gear.name.hunter-bow');
    },
    bonus: 8,
  },
  torch: {
    id: 'torch',
    kind: 'torch',
    slot: 2,
    get title() {
      return equipmentText('gear.name.torch');
    },
    bonus: 0,
  },
} as const;
export const SKILLS = {
  power: {
    get title() {
      return expeditionText('skill.power.title');
    },
    get description() {
      return expeditionText('skill.power.description');
    },
    max: 3,
  },
  vitality: {
    get title() {
      return expeditionText('skill.vitality.title');
    },
    get description() {
      return expeditionText('skill.vitality.description');
    },
    max: 3,
  },
  ward: {
    get title() {
      return expeditionText('skill.ward.title');
    },
    get description() {
      return expeditionText('skill.ward.description');
    },
    max: 3,
  },
};
type AmmoKind = 'wand' | 'bow';
type GearId = keyof typeof GEAR;
type SkillId = keyof typeof SKILLS;
type Ammo = { loaded: number; reserve: number };
interface Ledger {
  version: number;
  area: 'chapter' | 'dungeon';
  visit: number;
  kills: number;
  quest: boolean;
  claimed: string[];
  bag: string[];
  storage: string[];
  slots: (string | null)[];
  selected: number;
  torchLit: boolean;
  ammo: Record<AmmoKind, Ammo>;
  health: number;
  armor: number;
  xp: number;
  level: number;
  points: number;
  skills: Record<SkillId, number>;
  enemies: { health: number }[];
  deaths: number;
}

const isAmmo = (id: string): id is AmmoKind => id === 'wand' || id === 'bow';
const isGear = (id: unknown): id is GearId => typeof id === 'string' && Object.hasOwn(GEAR, id);
const isSkill = (id: string): id is SkillId => Object.hasOwn(SKILLS, id);
const isRecord = (data: unknown): data is Record<string, unknown> =>
  data !== null && typeof data === 'object';
const field = (value: unknown, key: string | number) => (isRecord(value) ? value[key] : undefined);
const integer = (n: unknown, lo: number, hi: number, fallback = lo) =>
  typeof n === 'number' && Number.isFinite(n)
    ? Math.max(lo, Math.min(hi, Math.floor(n)))
    : fallback;
const quantity = (n: unknown, maximum: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(maximum, n)) : fallback;
const livingWave = () => Array.from({ length: 3 }, () => ({ health: QUARRY_ENEMY_HEALTH }));

function readAmmo(item: AmmoKind, stock?: unknown): Ammo {
  const { capacity, initialReserve } = WEAPON_TYPES[item];
  if (capacity === undefined || initialReserve === undefined)
    throw new Error(`Missing ammo definition for ${item}`);
  return {
    loaded: integer(field(stock, 'loaded'), 0, capacity, capacity),
    reserve: integer(field(stock, 'reserve'), 0, 999, initialReserve),
  };
}

const fresh = (): Ledger => ({
  version: 1,
  area: 'chapter',
  visit: 0,
  kills: 0,
  quest: false,
  claimed: [],
  bag: [],
  storage: [],
  slots: ['wand', 'bow', 'torch'],
  selected: 0,
  torchLit: true,
  ammo: { wand: readAmmo('wand'), bow: readAmmo('bow') },
  health: 100,
  armor: 40,
  xp: 0,
  level: 0,
  points: 0,
  skills: { power: 0, vitality: 0, ward: 0 },
  enemies: [],
  deaths: 0,
});
function sanitize(value: unknown) {
  const state = fresh();
  if (!isRecord(value) || value.version !== 1) return state;
  for (const id of Object.keys(SKILLS))
    if (isSkill(id)) state.skills[id] = integer(field(value.skills, id), 0, 3);
  state.health = quantity(value.health, 100 + 20 * state.skills.vitality, 100);
  state.armor = quantity(value.armor, 60 + 15 * state.skills.ward, 40);
  state.points = integer(value.points, 0, 999);
  state.level = integer(value.level, 0, 999);
  state.xp = integer(value.xp, 0, 999999);
  state.visit = integer(value.visit, 0, 999999);
  state.kills = integer(value.kills, 0, 999999);
  state.deaths = integer(value.deaths, 0, 999999);
  state.quest = value.quest === true;
  state.area = value.area === 'dungeon' ? 'dungeon' : 'chapter';
  state.torchLit = value.torchLit !== false;
  const claims: unknown[] = Array.isArray(value.claimed) ? value.claimed : [];
  state.claimed = [
    ...new Set(
      claims.filter(
        (id): id is string =>
          typeof id === 'string' && ['reading-supply', 'field-cache', 'hunt-contract'].includes(id),
      ),
    ),
  ];
  const seen = new Set<string>(['torch']);
  state.slots = [null, null, 'torch'];
  for (let i = 0; i < 2; i++) {
    const id = field(value.slots, i);
    if (isGear(id) && GEAR[id].slot === i && !seen.has(id)) {
      state.slots[i] = id;
      seen.add(id);
    }
  }
  for (const [where, limit] of [
    ['bag', BAG_LIMIT],
    ['storage', STORAGE_LIMIT],
  ] as const) {
    const entries = value[where];
    if (!Array.isArray(entries)) continue;
    for (const id of entries)
      if (isGear(id) && !seen.has(id) && state[where].length < limit) {
        state[where].push(id);
        seen.add(id);
      }
  }
  // Preserve starter gear even if an old or interrupted ledger omitted a location.
  for (const id of ['wand', 'bow'] as const)
    if (!seen.has(id)) {
      if (!state.slots[GEAR[id].slot]) state.slots[GEAR[id].slot] = id;
      else state.storage.push(id);
    }
  const selected = integer(value.selected, 0, 2);
  state.selected = state.slots[selected] ? selected : 2;
  for (const item of ['wand', 'bow'] as const)
    state.ammo[item] = readAmmo(item, field(value.ammo, item));
  state.enemies = Array.from({ length: 3 }, (_, i) => ({
    health: integer(
      field(field(value.enemies, i), 'health'),
      0,
      QUARRY_ENEMY_HEALTH,
      QUARRY_ENEMY_HEALTH,
    ),
  }));
  return state;
}
export function createExpeditionState(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  let state = fresh(),
    practice = false,
    revision = 0,
    saved = true,
    hasSave = false;
  try {
    const value: unknown = JSON.parse(storage?.getItem(EXPEDITION_KEY) || 'null');
    hasSave = isRecord(value) && value.version === 1;
    state = sanitize(value);
  } catch {}
  const save = () => {
    revision++;
    if (practice) return;
    hasSave = true;
    try {
      storage?.setItem(EXPEDITION_KEY, JSON.stringify(state));
      saved = true;
    } catch {
      saved = false;
    }
  };
  const maxHealth = () => 100 + 20 * state.skills.vitality,
    maxArmor = () => 60 + 15 * state.skills.ward;
  function addXp(amount: number) {
    state.xp += amount;
    while (state.xp >= (state.level + 1) * 60) {
      state.xp -= (state.level + 1) * 60;
      state.level++;
      state.points++;
    }
  }
  function equippedGear(index: number) {
    const id = state.slots[index];
    return isGear(id) ? GEAR[id] : null;
  }
  function applyEnemyHit(
    index: number,
    bodyDamage: number,
    region: HitRegion,
    grantsLoot: boolean,
  ) {
    const enemy = state.enemies[index];
    const damage = damageForRegion(bodyDamage, region);
    if (!enemy || enemy.health <= 0 || !Number.isFinite(damage) || damage <= 0) return null;
    enemy.health = Math.max(0, enemy.health - damage);
    const killed = enemy.health === 0;
    if (killed) {
      state.kills++;
      if (grantsLoot) {
        addXp(30);
        state.ammo.wand.reserve = Math.min(999, state.ammo.wand.reserve + 5);
        state.ammo.bow.reserve = Math.min(999, state.ammo.bow.reserve + 4);
        state.armor = Math.min(maxArmor(), state.armor + 8);
      }
    }
    save();
    return { damage, killed, health: enemy.health };
  }
  const api = {
    get revision() {
      return revision;
    },
    get saved() {
      return saved;
    },
    get hasSave() {
      return hasSave;
    },
    get area() {
      return state.area;
    },
    get dead() {
      return state.health <= 0;
    },
    get health() {
      return state.health;
    },
    get visit() {
      return state.visit;
    },
    enemyHealth: (index: number) => state.enemies[index]?.health ?? 0,
    hasClaimed: (id: string) => state.claimed.includes(id),
    readHud: () => ({
      health: state.health,
      maxHealth: maxHealth(),
      armor: state.armor,
      maxArmor: maxArmor(),
      points: state.points,
      quest: state.quest,
      kills: state.kills,
      contractComplete: state.claimed.includes('hunt-contract'),
      remainingEnemies: state.enemies.filter((enemy) => enemy.health > 0).length,
    }),
    snapshot: () => ({
      ...structuredClone(state),
      maxHealth: maxHealth(),
      maxArmor: maxArmor(),
      nextLevel: (state.level + 1) * 60,
    }),
    ammo(id: string) {
      if (!isAmmo(id)) return null;
      const capacity = WEAPON_TYPES[id].capacity;
      return capacity ? { ...state.ammo[id], capacity } : null;
    },
    equipped: (index: number) => state.slots[index] ?? null,
    gear: equippedGear,
    selected: () => state.selected,
    torchLit: () => state.torchLit,
    setTorch(value: boolean) {
      state.torchLit = Boolean(value);
      save();
    },
    consume(id: string) {
      const ammo = isAmmo(id) ? state.ammo[id] : undefined;
      if (!ammo || ammo.loaded <= 0) return false;
      ammo.loaded--;
      save();
      return true;
    },
    reload(id: string) {
      if (!isAmmo(id)) return 0;
      const capacity = WEAPON_TYPES[id].capacity;
      if (!capacity) return 0;
      const ammo = state.ammo[id],
        count = Math.min(capacity - ammo.loaded, ammo.reserve);
      if (count) {
        ammo.loaded += count;
        ammo.reserve -= count;
        save();
      }
      return count;
    },
    claim(id: string) {
      if (!['reading-supply', 'field-cache'].includes(id) || state.claimed.includes(id))
        return false;
      const gear = id === 'reading-supply' ? 'survey-wand' : 'hunter-bow';
      // An overflowing cache stays closed; no item or reward silently disappears.
      if (state.bag.length >= BAG_LIMIT && state.storage.length >= STORAGE_LIMIT) return false;
      state.claimed.push(id);
      state[state.bag.length < BAG_LIMIT ? 'bag' : 'storage'].push(gear);
      state.ammo.wand.reserve = Math.min(999, state.ammo.wand.reserve + 12);
      state.ammo.bow.reserve = Math.min(999, state.ammo.bow.reserve + 10);
      state.armor = Math.min(maxArmor(), state.armor + 25);
      save();
      return true;
    },
    readGear: () => ({
      bag: [...state.bag],
      storage: [...state.storage],
      slots: [...state.slots],
      selected: state.selected,
    }),
    readProgress: () => ({
      health: state.health,
      maxHealth: maxHealth(),
      armor: state.armor,
      maxArmor: maxArmor(),
      level: state.level,
      xp: state.xp,
      nextLevel: (state.level + 1) * 60,
      points: state.points,
      skills: { ...state.skills },
    }),
    writeGear({ bag, storage, slots, selected }: GearInventory) {
      Object.assign(state, { bag, storage, slots, selected });
      save();
    },
    spend(id: string) {
      if (
        typeof id !== 'string' ||
        !isSkill(id) ||
        state.points <= 0 ||
        state.skills[id] >= SKILLS[id].max
      )
        return false;
      state.points--;
      state.skills[id]++;
      if (id === 'vitality') state.health = Math.min(maxHealth(), state.health + 20);
      if (id === 'ward') state.armor = Math.min(maxArmor(), state.armor + 15);
      save();
      return true;
    },
    damage(amount: number) {
      if (state.health <= 0 || !Number.isFinite(amount) || amount <= 0)
        return { absorbed: 0, health: 0 };
      const absorbed = Math.min(state.armor, amount * (0.5 + 0.1 * state.skills.ward));
      state.armor = Math.max(0, state.armor - absorbed);
      const loss = amount - absorbed;
      state.health = Math.max(0, state.health - loss);
      save();
      return { absorbed, health: loss };
    },
    hit(index: number, weapon: string, power = 0, region: HitRegion = 'body') {
      if (state.area !== 'dungeon' || !['wand', 'bow'].includes(weapon)) return null;
      const gear = equippedGear(weapon === 'wand' ? 0 : 1),
        base = weapon === 'wand' ? 26 : 24 + 32 * Math.max(0, Math.min(1, power));
      const bodyDamage = Math.round((base + (gear?.bonus ?? 0)) * (1 + state.skills.power * 0.25));
      return applyEnemyHit(index, bodyDamage, region, true);
    },
    hitPractice(index: number, damage: number, region: HitRegion = 'body') {
      return practice ? applyEnemyHit(index, damage, region, false) : null;
    },
    talk() {
      state.health = maxHealth();
      let text: string;
      if (!state.quest) {
        state.quest = true;
        text = expeditionText('mira.contract');
      } else if (state.kills >= 3 && !state.claimed.includes('hunt-contract')) {
        state.claimed.push('hunt-contract');
        state.points++;
        state.armor = maxArmor();
        text = expeditionText('mira.reward');
      } else {
        text = expeditionText('mira.progress', { kills: Math.min(3, state.kills) });
      }
      if (Object.values(state.ammo).every((ammo) => ammo.loaded + ammo.reserve === 0)) {
        state.ammo.wand.reserve = 6;
        state.ammo.bow.reserve = 6;
        text += '\n' + expeditionText('mira.supplies');
      }
      save();
      return text;
    },
    enter() {
      if (state.area === 'dungeon' || state.health <= 0) return false;
      state.area = 'dungeon';
      state.visit++;
      state.enemies = livingWave();
      save();
      return true;
    },
    leave() {
      state.area = 'chapter';
      save();
    },
    retry() {
      state.area = 'chapter';
      state.health = maxHealth();
      state.deaths++;
      save();
    },
    newGame() {
      state = fresh();
      save();
    },
    beginPractice() {
      practice = true;
      state = fresh();
      state.area = 'dungeon';
      state.visit = 1;
      state.enemies = livingWave();
      save();
    },
    respawnPractice() {
      if (!practice) return;
      const supplies = fresh();
      state.health = maxHealth();
      state.armor = supplies.armor;
      state.ammo = supplies.ammo;
      save();
    },
    renewPracticeWave() {
      if (!practice || state.enemies.some((enemy) => enemy.health > 0)) return false;
      state.visit++;
      state.enemies = livingWave();
      save();
      return true;
    },
  };
  return api;
}
