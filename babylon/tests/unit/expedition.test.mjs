import { DEFAULT_LOCALE, getLocale, setLocale } from '../../src/content/locales/locale.ts';
import { gearDescription, journalText } from '../../src/content/locales/journal.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSession } from '../../src/app/local-session.ts';
import {
  BAG_LIMIT,
  createExpeditionState,
  EXPEDITION_KEY,
  GEAR,
  STORAGE_LIMIT,
} from '../../src/expedition/state.ts';
import { createInventoryFeature } from '../../src/game/inventory/inventory-feature.ts';
import { GameSession } from '../../src/game/session/game-session.ts';
import { gearTitle, WEAPON_TYPES } from '../../src/app/equipment/weapon-types.ts';
const memory = () => {
  const map = new Map();
  return { getItem: (key) => map.get(key), setItem: (key, value) => map.set(key, value) };
};

const inventoryRules = {
  gear: GEAR,
  bagLimit: BAG_LIMIT,
  storageLimit: STORAGE_LIMIT,
  storagePosition: [3, 0, -5],
};
const inventoryFeature = createInventoryFeature(inventoryRules);
const inventorySession = () => new GameSession([inventoryFeature]);

function bindInventory(session, playerId, state, position) {
  session.addPlayer(playerId, {
    get area() {
      return state.area;
    },
    readPosition: () => position,
    readGear: state.readGear,
    writeGear: state.writeGear,
  });
  return (itemId, destination) =>
    session.dispatch(playerId, { kind: 'inventory.move', payload: { itemId, destination } });
}

test('chest claims, spent ammunition and moved gear survive retry and reload without duplication', () => {
  const storage = memory(),
    state = createExpeditionState(storage);
  const session = inventorySession(),
    move = bindInventory(session, 'first', state, { x: 3, z: -5 });
  assert.ok(state.claim('reading-supply'));
  assert.equal(state.claim('reading-supply'), false);
  state.consume('wand');
  state.reload('wand');
  state.setTorch(false);
  assert.ok(session.dispatch('first', { kind: 'inventory.select', payload: { slot: 1 } }).ok);
  assert.ok(move('survey-wand', 'equipped').ok);
  assert.ok(move('wand', 'storage').ok);
  const before = state.snapshot();
  state.retry();
  const restored = createExpeditionState(storage).snapshot();
  assert.deepEqual(restored.ammo, before.ammo);
  assert.deepEqual(restored.slots, before.slots);
  assert.deepEqual(restored.storage, ['wand']);
  assert.equal(restored.torchLit, false);
  assert.equal(restored.selected, 1);
  assert.equal(state.claim('reading-supply'), false);
  state.newGame();
  assert.deepEqual(state.snapshot().claimed, []);
  assert.equal(state.ammo('wand').reserve, 18);
});
test('finite wand and bow ammunition cannot be created by empty reloads or retry', () => {
  const state = createExpeditionState(memory());
  const weapons = ['wand', 'bow'];
  const total = (kind) => {
    const { loaded, reserve } = state.ammo(kind);
    return loaded + reserve;
  };
  for (const kind of weapons) {
    for (let remaining = total(kind); remaining > 0; remaining--) {
      if (state.ammo(kind).loaded === 0) {
        assert.ok(state.reload(kind) > 0);
        assert.equal(total(kind), remaining, 'preparing a shot only moves existing stock');
      }
      assert.equal(state.consume(kind), true);
      assert.equal(total(kind), remaining - 1, 'a shot consumes one unit of stock');
    }
    assert.equal(state.consume(kind), false);
    assert.equal(state.reload(kind), 0);
    assert.equal(total(kind), 0);
  }
  state.retry();
  for (const kind of weapons) assert.equal(total(kind), 0);
  state.talk();
  const supplied = weapons.map(total);
  assert.ok(supplied.every((count) => count > 0));
  state.talk();
  assert.deepEqual(weapons.map(total), supplied);
});
test('equipped gear and ammunition labels use the active language with stable item IDs', (t) => {
  const previous = getLocale();
  t.after(() => setLocale(previous));
  const bow = WEAPON_TYPES.bow,
    stock = { loaded: 1, reserve: 1 };
  setLocale('en');
  assert.equal(bow.item, 'bow');
  assert.equal(bow.title, 'Daybreak · Lightbow');
  assert.equal(gearTitle('hunter-bow'), 'Sentinel’s Runebow');
  assert.equal(bow.hud(stock, { nocked: true }).unit, 'arrow');
  assert.equal(bow.hud(stock, { nocked: false }).unit, 'arrows');
  assert.equal(bow.inventory(stock, true), 'Quiver · 1 · 1 arrow nocked');
  assert.equal(gearTitle('custom-item'), undefined);
  setLocale('ko');
  assert.equal(bow.item, 'bow');
  assert.equal(bow.title, '여명 · 빛살 룬 활');
  assert.equal(gearTitle('hunter-bow'), '파수꾼의 룬 활');
  assert.equal(bow.inventory(stock, true), '화살통 1발 · 시위에 1발');
});
test('bow stock represents the quiver until an arrow reaches the string', (t) => {
  setLocale('ko');
  t.after(() => setLocale('en'));
  const storage = memory(),
    type = WEAPON_TYPES.bow;
  storage.setItem(
    EXPEDITION_KEY,
    JSON.stringify({ version: 1, ammo: { bow: { loaded: 1, reserve: 1 } } }),
  );
  const state = createExpeditionState(storage),
    stock = () => state.ammo('bow');
  const preparation = type.createPreparation(type, {
    stock,
    refill: () => state.reload('bow'),
    sound: { nockStart() {}, nockComplete() {} },
  });
  const hud = () => type.hud(stock(), { nocked: preparation.nocked });
  assert.equal(type.inventory(stock(), false), '화살통 2발');
  assert.equal(preparation.request({ automatic: true, settled: false }), false);
  assert.equal(preparation.request({ automatic: true, settled: true }), true);
  preparation.timer.advance(type.nockSeconds);
  assert.equal(hud().count, '1');
  assert.equal(hud().detail, '시위에 1발');
  assert.equal(hud().limit, undefined);
  assert.equal(type.inventory(stock(), true, false), '화살통 1발');
  state.consume('bow');
  preparation.afterShot();
  assert.equal(type.empty(stock()), null);
  assert.equal(preparation.request({ automatic: true, settled: true }), true);
  preparation.reset();
  assert.deepEqual(stock(), { capacity: 1, loaded: 0, reserve: 1 });
  preparation.request({ automatic: true, settled: true });
  preparation.timer.advance(type.nockSeconds);
  assert.equal(hud().count, '0');
  assert.equal(hud().detail, '시위에 1발');
  state.consume('bow');
  preparation.afterShot();
  assert.equal(preparation.request({ automatic: true, settled: true }), false);
  assert.equal(hud().status, '화살 소진');
  assert.match(type.empty(stock()), /화살통이 비었습니다/);
});
test('wand refills only on charge completion and uses its own resource readout', (t) => {
  setLocale('ko');
  t.after(() => setLocale('en'));
  const state = createExpeditionState(memory()),
    type = WEAPON_TYPES.wand,
    stock = () => state.ammo('wand');
  let completions = 0;
  const preparation = type.createPreparation(type, {
    stock,
    refill: () => state.reload('wand'),
    sound: { reloadStart() {}, reloadComplete() {} },
    onChargeComplete: () => completions++,
  });
  state.consume('wand');
  assert.equal(preparation.request({ automatic: true, cooled: true }), false);
  assert.ok(preparation.request());
  preparation.timer.advance(type.chargeSeconds * 0.75);
  assert.deepEqual(stock(), { capacity: 6, loaded: 5, reserve: 18 });
  assert.equal(type.hud(stock(), { preparing: preparation.timer.active }).status, '수정 충전 중');
  preparation.timer.advance(type.chargeSeconds);
  assert.deepEqual(stock(), { capacity: 6, loaded: 6, reserve: 17 });
  assert.equal(completions, 1);
  assert.match(type.inventory(stock()), /충전용 수정 17개/);
});
test('enemy rewards occur once per kill, revisits create distinct waves, and skills change combat', () => {
  const storage = memory(),
    state = createExpeditionState(storage);
  state.talk();
  state.enter();
  for (let i = 0; i < 3; i++) while (state.snapshot().enemies[i].health > 0) state.hit(i, 'bow', 1);
  const killed = state.snapshot();
  assert.equal(killed.kills, 3);
  assert.equal(killed.points, 1);
  assert.equal(state.hit(0, 'wand'), null);
  assert.deepEqual(state.snapshot().ammo, killed.ammo);
  state.talk();
  assert.equal(state.snapshot().points, 2);
  state.talk();
  assert.equal(state.snapshot().points, 2);
  assert.ok(state.spend('power'));
  assert.ok(state.spend('ward'));
  assert.equal(state.spend('vitality'), false);
  const ward = state.damage(20);
  assert.equal(ward.absorbed, 12);
  assert.equal(ward.health, 8);
  state.leave();
  state.enter();
  assert.equal(state.snapshot().visit, 2);
  assert.equal(state.hit(0, 'wand').damage, 33);
  const restored = createExpeditionState(storage);
  assert.equal(restored.snapshot().enemies[0].health, 39);
});
test('quarry headshots double rounded wand and drawn bow damage and award one normal bounty', () => {
  const store = memory();
  const state = createExpeditionState(store);
  state.enter();
  assert.equal(state.hit(0, 'wand', 0, 'head').damage, 52);
  const supplies = state.snapshot();
  assert.deepEqual(state.hit(0, 'bow', 0.2, 'head'), { damage: 60, killed: true, health: 0 });
  const slain = state.snapshot();
  assert.equal(slain.kills, 1);
  assert.equal(slain.xp, supplies.xp + 30);
  assert.equal(slain.ammo.wand.reserve, supplies.ammo.wand.reserve + 5);
  assert.equal(slain.ammo.bow.reserve, supplies.ammo.bow.reserve + 4);
  assert.equal(slain.armor, supplies.armor + 8);
  assert.equal(state.hit(0, 'bow', 1, 'head'), null);
  assert.deepEqual(state.snapshot(), slain);
  assert.deepEqual(createExpeditionState(store).snapshot(), slain);

  state.hit(1, 'bow', 1, 'head');
  assert.ok(state.spend('power'));
  state.leave();
  state.enter();
  const wand = state.hit(0, 'wand').damage;
  assert.equal(wand, 33);
  assert.equal(state.hit(1, 'wand', 0, 'head').damage, wand * 2);
  state.claim('field-cache');
  const move = bindInventory(inventorySession(), 'first', state, { x: 0, z: 0 });
  assert.ok(move('hunter-bow', 'equipped').ok);
  const arrow = state.hit(0, 'bow', 0.65).damage;
  assert.equal(arrow, 66);
  assert.equal(state.hit(2, 'bow', 0.65, 'head').damage, arrow * 2);
});
test('arena firearms award one elimination without quarry loot on a lethal headshot', () => {
  const state = createExpeditionState();
  state.beginPractice();
  const original = state.snapshot();
  assert.deepEqual(state.hitPractice(0, 24), { damage: 24, health: 48, killed: false });
  assert.deepEqual(state.hitPractice(0, 24, 'head'), { damage: 48, health: 0, killed: true });
  assert.equal(state.hitPractice(0, 24, 'head'), null);
  assert.equal(state.hitPractice(1, 0, 'head'), null);
  const ended = state.snapshot();
  assert.equal(ended.kills, 1);
  assert.equal(ended.xp, original.xp);
  assert.equal(ended.armor, original.armor);
  assert.deepEqual(ended.ammo, original.ammo);
});
test('storage requires proximity, torch cannot be removed, and corrupt ledgers cannot duplicate weapons', () => {
  const storage = memory(),
    state = createExpeditionState(storage);
  state.claim('reading-supply');
  const move = bindInventory(inventorySession(), 'first', state, { x: 0, z: 0 });
  assert.equal(move('survey-wand', 'storage').error, 'inventory.storage-out-of-reach');
  assert.equal(move('torch', 'bag').error, 'inventory.fixed-gear');
  const corrupt = {
    ...state.snapshot(),
    bag: ['wand', 'wand', 'hunter-bow', 'constructor'],
    storage: ['hunter-bow', 'torch', '__proto__'],
    selected: 9,
  };
  storage.setItem(EXPEDITION_KEY, JSON.stringify(corrupt));
  const restored = createExpeditionState(storage).snapshot();
  const all = [...restored.bag, ...restored.storage, ...restored.slots].filter(Boolean);
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every((id) => Object.hasOwn(GEAR, id)));
});

test('inventory commands affect only their bound player and save only accepted moves', () => {
  const session = inventorySession(),
    firstSave = memory(),
    secondSave = memory();
  const first = createExpeditionState(firstSave),
    second = createExpeditionState(secondSave);
  const firstPosition = { x: 3, z: -5 },
    secondPosition = { x: 0, z: 0 };
  const moveFirst = bindInventory(session, 'first', first, firstPosition);
  const moveSecond = bindInventory(session, 'second', second, secondPosition);
  first.claim('reading-supply');

  assert.equal(moveSecond('survey-wand', 'equipped').error, 'inventory.unavailable-gear');
  const command = {
    kind: 'inventory.move',
    payload: { itemId: 'wand', destination: 'storage', atStorage: true, playerId: 'first' },
  };
  assert.equal(session.dispatch('second', command).error, 'inventory.storage-out-of-reach');
  assert.equal(secondSave.getItem(EXPEDITION_KEY), undefined);
  assert.deepEqual(second.readGear().slots, ['wand', 'bow', 'torch']);
  assert.equal(
    session.dispatch('first', { kind: 'inventory.move' }).error,
    'inventory.invalid-move',
  );
  assert.equal(
    session.dispatch('first', { kind: 'inventory.read' }).error,
    'session.unknown-command',
  );

  assert.deepEqual(moveFirst('wand', 'storage'), { ok: true });
  const firstView = session.readPlayer('first', inventoryFeature.readView);
  const secondView = session.readPlayer('second', inventoryFeature.readView);
  assert.deepEqual(firstView.storage, ['wand']);
  assert.deepEqual(secondView.storage, []);
  assert.equal(firstView.canAccessStorage, true);
  assert.equal(secondView.canAccessStorage, false);
  firstView.storage.length = 0;
  assert.deepEqual(first.readGear().storage, ['wand']);
  assert.equal(first.selected(), 2);
  const saved = firstSave.getItem(EXPEDITION_KEY),
    revision = first.revision;
  assert.equal(moveFirst('wand', 'storage').error, 'inventory.unavailable-gear');
  firstPosition.x = 0;
  assert.equal(moveFirst('wand', 'bag').error, 'inventory.storage-out-of-reach');
  assert.equal(first.revision, revision);
  assert.equal(firstSave.getItem(EXPEDITION_KEY), saved);

  session.removePlayer('first');
  assert.equal(session.dispatch('first', command).error, 'session.unknown-player');
  assert.equal(session.readPlayer('first', inventoryFeature.readView), undefined);
  assert.deepEqual(createExpeditionState(firstSave).readGear().storage, ['wand']);
  assert.deepEqual(second.readGear().storage, []);
});

test('the journal changes worn gear and active slot with one save and exposes detached player data', () => {
  const storage = memory();
  storage.setItem(
    EXPEDITION_KEY,
    JSON.stringify({
      version: 1,
      slots: ['wand', 'bow', 'torch'],
      selected: 1,
      bag: ['survey-wand'],
      points: 2,
    }),
  );
  const state = createExpeditionState(storage);
  const session = createLocalSession({
    expedition: state,
    inventoryRules,
    readPosition: () => ({ x: 0, z: 0 }),
  });
  const equip = { kind: 'inventory.equip', payload: { itemId: 'survey-wand' } };
  assert.deepEqual(session.dispatch(equip), { ok: true });
  assert.equal(state.revision, 1);
  assert.deepEqual(createExpeditionState(storage).readGear(), {
    bag: ['wand'],
    storage: [],
    slots: ['survey-wand', 'bow', 'torch'],
    selected: 0,
  });
  assert.deepEqual(session.dispatch(equip), { ok: true });
  assert.equal(state.revision, 1, 'equipping the already active gear does not save again');

  const view = session.readJournal();
  assert.equal(view.selected, 0);
  assert.equal(view.points, 2);
  assert.equal(Object.hasOwn(view, 'enemies'), false);
  view.bag.push('hunter-bow');
  view.skills.power = 9;
  view.ammo.bow.loaded = 0;
  assert.deepEqual(session.readJournal().bag, ['wand']);
  assert.equal(session.readJournal().skills.power, 0);
  assert.ok(session.readJournal().ammo.bow.loaded > 0);

  const before = storage.getItem(EXPEDITION_KEY);
  for (const skillId of ['constructor', 'toString', 'missing']) {
    assert.equal(
      session.dispatch({ kind: 'progression.spend-skill', payload: { skillId } }).error,
      'progression.skill-unavailable',
    );
  }
  assert.equal(state.revision, 1);
  assert.equal(storage.getItem(EXPEDITION_KEY), before);
  assert.ok(
    session.dispatch({ kind: 'progression.spend-skill', payload: { skillId: 'vitality' } }).ok,
  );
  const progressed = createExpeditionState(storage).readProgress();
  assert.equal(progressed.points, 1);
  assert.equal(progressed.skills.vitality, 1);
  assert.equal(progressed.health, progressed.maxHealth);
});
test('continuing keeps fractional chapter damage exactly and does not heal or erode armor', () => {
  const storage = memory(),
    state = createExpeditionState(storage);
  state.damage(0.736);
  const before = state.snapshot(),
    after = createExpeditionState(storage).snapshot();
  assert.equal(after.health, before.health);
  assert.equal(after.armor, before.armor);
});

test('combat modes replenish lives and waves without changing the saved expedition', () => {
  const storage = memory(),
    campaign = createExpeditionState(storage);
  campaign.claim('reading-supply');
  campaign.enter();
  campaign.hit(0, 'wand');
  campaign.damage(23);
  const saved = storage.getItem(EXPEDITION_KEY);

  const state = createExpeditionState(storage);
  state.beginPractice();
  assert.deepEqual(state.snapshot().claimed, []);
  for (let i = 0; i < 3; i++) while (state.hit(i, 'bow', 1)?.killed === false) {}
  assert.equal(state.renewPracticeWave(), true);
  assert.equal(state.renewPracticeWave(), false);
  const injuredEnemy = state.hit(1, 'wand').health;
  state.consume('wand');
  state.damage(300);
  assert.equal(state.dead, true);
  state.respawnPractice();
  assert.equal(state.dead, false);
  assert.equal(state.ammo('wand').loaded, state.ammo('wand').capacity);
  assert.equal(state.snapshot().enemies[1].health, injuredEnemy);

  state.beginPractice();
  assert.equal(state.snapshot().kills, 0);
  assert.equal(storage.getItem(EXPEDITION_KEY), saved);
  assert.deepEqual(createExpeditionState(storage).snapshot(), campaign.snapshot());
  campaign.consume('wand');
  assert.notEqual(storage.getItem(EXPEDITION_KEY), saved);
});

test('switching journal and dialogue language preserves ledger IDs, ammo, and contract progress', () => {
  const storage = memory();
  const ledger = createExpeditionState(storage);
  const state = ledger.snapshot();
  assert.equal(GEAR['survey-wand'].title, 'Surveyor’s Crystal Wand');
  assert.equal(journalText('bag.capacity', { count: 0, limit: 6 }), 'Pack 0 / 6');
  assert.match(gearDescription('bow', 8), /Base damage \+8/);
  assert.match(ledger.talk(), /Ink Quarry/);
  const saved = ledger.snapshot();
  try {
    setLocale('ko');
    const restored = createExpeditionState(storage);
    assert.equal(GEAR['survey-wand'].title, '탐사자의 수정 완드');
    assert.equal(journalText('bag.capacity', { count: 0, limit: 6 }), '휴대 가방 0 / 6');
    assert.match(gearDescription('bow', 8), /기본 피해 \+8/);
    assert.equal(
      WEAPON_TYPES.bow.inventory({ loaded: 1, reserve: 3 }, true),
      '화살통 3발 · 시위에 1발',
    );
    assert.match(restored.talk(), /채석장 의뢰 0 \/ 3/);
    assert.deepEqual(restored.snapshot().slots, saved.slots);
    assert.deepEqual(restored.snapshot().ammo, state.ammo);
    assert.equal(restored.snapshot().quest, true);
  } finally {
    setLocale(DEFAULT_LOCALE);
  }
});
