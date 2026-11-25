import { ARENA_RIFLE } from '../content/catalogs/firearms.ts';
import { experienceText } from '../content/locales/experience.ts';

import type { ArenaArmory } from '../game/experiences/armory.ts';
import { requireElement } from './dom.ts';

type ArmoryStock = ReturnType<ArenaArmory['snapshot']>;
interface ArmoryActions {
  buy(id: string): { ok: boolean };
  close(): void;
  read(): ArmoryStock;
  canBuy(): boolean;
}

export function createArenaArmoryUi(
  find: (id: string) => HTMLElement | null,
  { buy, close, read, canBuy }: ArmoryActions,
) {
  function $(id: string) {
    const element = find(id);
    if (!element) throw new Error(`Missing armory element: ${id}`);
    return element;
  }
  const dialog = $('armory-dialog');
  const rifle = $('buy-rifle'),
    ammo = $('buy-ammo');
  if (
    !(dialog instanceof HTMLDialogElement) ||
    !(rifle instanceof HTMLButtonElement) ||
    !(ammo instanceof HTMLButtonElement)
  ) {
    throw new Error('Unexpected armory controls');
  }
  const hud = $('weapon-hud');
  const [pistolSlot, rifleSlot, torchSlot] = hud.querySelectorAll('[data-slot]');
  if (
    !(pistolSlot instanceof HTMLButtonElement) ||
    !(rifleSlot instanceof HTMLButtonElement) ||
    !(torchSlot instanceof HTMLElement)
  ) {
    throw new Error('Missing armory equipment slots');
  }
  let previous: string | undefined;
  dialog.addEventListener('close', close);
  $('close-armory').addEventListener('click', () => dialog.close());
  const renderShop = (stock: ArmoryStock) => {
    $('armory-credit').textContent = experienceText('shop.balance', stock);
    rifle.disabled = stock.owned.includes(ARENA_RIFLE.id) || stock.credits < ARENA_RIFLE.price;
    ammo.disabled = !stock.canRefill;
    rifle.textContent = stock.owned.includes(ARENA_RIFLE.id)
      ? experienceText('shop.owned')
      : experienceText('shop.rifle', { price: ARENA_RIFLE.price });
    ammo.textContent = experienceText('shop.ammo', stock);
  };
  for (const [button, id] of [
    [rifle, ARENA_RIFLE.id],
    [ammo, 'ammo'],
  ] as const) {
    button.addEventListener('click', () => {
      // Credits and ownership come from the session after it has accepted or rejected the buy.
      const result = buy(id);
      $('armory-message').textContent = experienceText(
        result.ok ? 'shop.purchased' : 'shop.unavailable',
      );
      renderShop(read());
    });
  }
  for (const [slot, id] of [
    [pistolSlot, 'service-pistol'],
    [rifleSlot, ARENA_RIFLE.id],
  ] as const) {
    requireElement(slot, '.gear-icon', HTMLElement).hidden = true;
    requireElement(slot, 'span:not(.gear-icon)', HTMLElement).textContent = experienceText(id);
    slot.dataset.firearm = id;
  }
  torchSlot.hidden = true;
  $('weapon-hud').setAttribute('aria-label', experienceText('firearm.hud'));
  $('weapon-hud').hidden = false;
  $('ammo-label').hidden = false;
  $('ammo-label').textContent = experienceText('firearm.magazine');

  return {
    open() {
      $('armory-message').textContent = '';
      renderShop(read());
      dialog.showModal();
    },
    update(stock: ArmoryStock) {
      const available = canBuy();
      $('shop-open').hidden = !available;
      const signature = [
        stock.id,
        stock.loaded,
        stock.reserve,
        stock.reloadLeft > 0,
        stock.credits,
        stock.owned.length,
      ].join('|');
      if (previous === signature) return;
      previous = signature;
      $('weapon-title').textContent =
        `${experienceText(stock.id)} · ${experienceText('shop.balance', stock)}`;
      $('ammo-current').textContent = String(stock.loaded);
      $('ammo-capacity').textContent = String(stock.capacity);
      $('ammo-detail').hidden = false;
      $('ammo-detail').textContent = experienceText('firearm.reserve', stock);
      $('weapon-state').textContent = experienceText(
        stock.reloadLeft > 0
          ? 'firearm.reloading'
          : stock.loaded
            ? 'firearm.ready'
            : 'firearm.empty',
      );
      for (const slot of [pistolSlot, rifleSlot]) {
        const id = slot.dataset.firearm;
        slot.disabled = !id || !stock.owned.includes(id);
        slot.setAttribute('aria-pressed', String(stock.id === id));
      }
    },
  };
}
