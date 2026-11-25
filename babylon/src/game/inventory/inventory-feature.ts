import type { CommandResult, GameFeature } from '../session/game-feature.ts';

type Destination = 'bag' | 'storage' | 'equipped';

export type InventoryCommand =
  | {
      readonly kind: 'inventory.move';
      readonly payload: { readonly itemId: string; readonly destination: Destination };
    }
  | { readonly kind: 'inventory.equip'; readonly payload: { readonly itemId: string } }
  | { readonly kind: 'inventory.select'; readonly payload: { readonly slot: number } };

export interface GearInventory {
  readonly bag: readonly string[];
  readonly storage: readonly string[];
  readonly slots: readonly (string | null)[];
  readonly selected: number;
}

export interface InventoryPlayer {
  readonly area: 'chapter' | 'dungeon';
  readPosition(): { x: number; z: number };
  readGear(): GearInventory;
  writeGear(gear: GearInventory): void;
}

export interface InventoryRules {
  readonly gear: Readonly<Record<string, { readonly slot: number }>>;
  readonly bagLimit: number;
  readonly storageLimit: number;
  readonly storagePosition: readonly [number, number, number];
}

export interface InventoryView extends GearInventory {
  readonly canAccessStorage: boolean;
}

interface InventoryFeature extends GameFeature<InventoryPlayer> {
  readView(player: InventoryPlayer): InventoryView;
}

export function createInventoryFeature({
  gear,
  bagLimit,
  storageLimit,
  storagePosition,
}: InventoryRules): InventoryFeature {
  const [storageX, , storageZ] = storagePosition;
  function canAccessStorage(player: InventoryPlayer): boolean {
    if (player.area !== 'chapter') return false;
    const { x, z } = player.readPosition();
    return Math.hypot(x - storageX, z - storageZ) <= 2;
  }

  function selectSlot(
    player: InventoryPlayer,
    current: GearInventory,
    slot: number,
  ): CommandResult {
    if (!current.slots[slot]) return { ok: false, error: 'inventory.unavailable-gear' };
    if (current.selected !== slot) player.writeGear({ ...current, selected: slot });
    return { ok: true };
  }

  function transfer(
    player: InventoryPlayer,
    itemId: string,
    destination: Destination,
    activate: boolean,
  ): CommandResult {
    const definition = Object.hasOwn(gear, itemId) ? gear[itemId] : undefined;
    if (!definition) return { ok: false, error: 'inventory.invalid-move' };
    if (itemId === 'torch' && !activate) return { ok: false, error: 'inventory.fixed-gear' };

    const current = player.readGear();
    const { slot } = definition;
    const source =
      current.slots[slot] === itemId
        ? 'equipped'
        : current.bag.includes(itemId)
          ? 'bag'
          : current.storage.includes(itemId)
            ? 'storage'
            : null;
    if (source === 'equipped' && activate) return selectSlot(player, current, slot);
    if (!source || source === destination)
      return { ok: false, error: 'inventory.unavailable-gear' };
    if ((source === 'storage' || destination === 'storage') && !canAccessStorage(player)) {
      return { ok: false, error: 'inventory.storage-out-of-reach' };
    }

    // Count displaced gear before committing the move so a full bag cannot lose an item.
    const replaced = destination === 'equipped' ? current.slots[slot] : null;
    const bagSize =
      current.bag.length -
      Number(source === 'bag') +
      Number(Boolean(replaced)) +
      Number(destination === 'bag');
    if (
      bagSize > bagLimit ||
      (destination === 'storage' && current.storage.length >= storageLimit)
    ) {
      return { ok: false, error: 'inventory.capacity-exceeded' };
    }

    const next = {
      bag: [...current.bag],
      storage: [...current.storage],
      slots: [...current.slots],
    };
    if (source === 'equipped') next.slots[slot] = null;
    else next[source].splice(next[source].indexOf(itemId), 1);
    if (destination === 'equipped') {
      if (replaced) next.bag.push(replaced);
      next.slots[slot] = itemId;
    } else {
      next[destination].push(itemId);
    }

    const selected = activate ? slot : next.slots[current.selected] ? current.selected : 2;
    player.writeGear({ ...next, selected });
    return { ok: true };
  }

  return {
    id: 'inventory',
    readView(player) {
      return { ...player.readGear(), canAccessStorage: canAccessStorage(player) };
    },
    commands: {
      move(player, payload) {
        if (
          payload &&
          typeof payload === 'object' &&
          'itemId' in payload &&
          'destination' in payload
        ) {
          const { itemId, destination } = payload;
          if (
            typeof itemId === 'string' &&
            (destination === 'bag' || destination === 'storage' || destination === 'equipped')
          ) {
            return transfer(player, itemId, destination, false);
          }
        }
        return { ok: false, error: 'inventory.invalid-move' };
      },
      equip(player, payload) {
        if (
          payload &&
          typeof payload === 'object' &&
          'itemId' in payload &&
          typeof payload.itemId === 'string'
        ) {
          return transfer(player, payload.itemId, 'equipped', true);
        }
        return { ok: false, error: 'inventory.invalid-move' };
      },
      select(player, payload) {
        if (
          payload &&
          typeof payload === 'object' &&
          'slot' in payload &&
          typeof payload.slot === 'number' &&
          Number.isInteger(payload.slot) &&
          payload.slot >= 0
        ) {
          return selectSlot(player, player.readGear(), payload.slot);
        }
        return { ok: false, error: 'inventory.invalid-slot' };
      },
    },
  };
}
