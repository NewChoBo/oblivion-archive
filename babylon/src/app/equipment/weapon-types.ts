import { equipmentText } from '../../content/locales/equipment.ts';
import type { createWeaponAudio } from '../../platform/browser/weapon-audio.ts';

export interface WeaponStock {
  loaded: number;
  reserve: number;
}
export interface WeaponReadout {
  status: string;
  count?: string;
  limit?: number;
  unit?: string;
  label?: string;
  detail?: string;
}
export interface WeaponHudState {
  equipping?: boolean;
  preparing?: boolean;
  nocked?: boolean;
  releasing?: boolean;
  phase?: string;
  drawing?: boolean;
  draw?: number;
  lit?: boolean;
}
interface AmmoHooks {
  stock(): WeaponStock;
  refill(): void;
}

type PreparationAudio = ReturnType<typeof createWeaponAudio>;
interface BowHooks extends AmmoHooks {
  sound: Pick<PreparationAudio, 'nockStart' | 'nockComplete'>;
}
interface WandHooks extends AmmoHooks {
  sound: Pick<PreparationAudio, 'reloadStart' | 'reloadComplete'>;
  onChargeComplete(): void;
}
export interface WeaponPreparation {
  timer: ReturnType<typeof preparationTimer>;
  request(state?: { automatic?: boolean; cooled?: boolean; settled?: boolean }): boolean;
  reset(): void;
  nocked?: boolean;
  afterShot?(): void;
}
interface BowPreparation extends WeaponPreparation {
  readonly nocked: boolean;
  afterShot(): void;
}
interface ToolDefinition {
  title: string;
  recover: number;
  equip: number;
  hud(stock: WeaponStock, state: WeaponHudState): WeaponReadout;
}
interface AmmoDefinition extends ToolDefinition {
  capacity: number;
  initialReserve: number;
  interval: number;
  kick: number;
  inventory(stock: WeaponStock, nocked?: boolean, equipped?: boolean): string;
}
export interface WandDefinition extends AmmoDefinition {
  id: 'blaster-a';
  item: 'wand';
  chargeSeconds: number;
  empty(stock: WeaponStock, key: string): string | null;
  createPreparation: typeof prepareWand;
}
export interface BowDefinition extends AmmoDefinition {
  id: 'blaster-j';
  item: 'bow';
  nockSeconds: number;
  empty(stock: WeaponStock, key?: string): string | null;
  createPreparation: typeof prepareBow;
}
export interface TorchDefinition extends ToolDefinition {
  id: 'torch';
  item: 'torch';
  capacity?: never;
  initialReserve?: never;
  inventory?: never;
}
export type WeaponType = WandDefinition | BowDefinition | TorchDefinition;

import { WAND_INTERVAL } from '../../game/combat/wand-stroke.ts';

function preparationTimer(duration: number, onStart: () => void, onComplete: () => void) {
  let remaining = 0;
  return {
    get active() {
      return remaining > 0;
    },
    get progress() {
      return remaining > 0 ? 1 - remaining / duration : 0;
    },
    start() {
      if (remaining > 0) return false;
      remaining = duration;
      onStart();
      return true;
    },
    advance(dt: number) {
      if (remaining === 0) return;
      remaining = Math.max(0, remaining - dt);
      if (remaining === 0) onComplete();
    },
    reset() {
      remaining = 0;
    },
  };
}

function prepareWand(
  type: Pick<WandDefinition, 'chargeSeconds' | 'id' | 'capacity'>,
  { stock, refill, sound, onChargeComplete }: WandHooks,
): WeaponPreparation {
  const timer = preparationTimer(
    type.chargeSeconds,
    () => sound.reloadStart(type.id, type.chargeSeconds),
    () => {
      refill();
      onChargeComplete();
      sound.reloadComplete(type.id);
    },
  );
  return {
    timer,
    reset: timer.reset,
    request({ automatic = false, cooled = false } = {}) {
      if (timer.active || (automatic && !cooled)) return false;
      const { loaded, reserve } = stock();
      return reserve > 0 && (automatic ? loaded === 0 : loaded < type.capacity) && timer.start();
    },
  };
}

function prepareBow(
  type: Pick<BowDefinition, 'nockSeconds'>,
  { stock, refill, sound }: BowHooks,
): BowPreparation {
  let nocked = false;
  const timer = preparationTimer(
    type.nockSeconds,
    () => sound.nockStart(),
    () => {
      if (stock().loaded === 0) refill();
      nocked = stock().loaded > 0;
      if (nocked) sound.nockComplete();
    },
  );
  return {
    timer,
    get nocked() {
      return nocked;
    },
    request({ automatic = false, settled = false } = {}) {
      if (timer.active || (automatic && (!settled || nocked))) return false;
      const { loaded, reserve } = stock();
      const canNock = automatic ? loaded > 0 || reserve > 0 : loaded === 0 && reserve > 0;
      return canNock && timer.start();
    },
    afterShot() {
      nocked = false;
    },
    reset() {
      timer.reset();
      nocked = false;
    },
  };
}

// A prepared stock slot counts as quiver ammunition until the nocking animation finishes.
function bowSupply({ loaded, reserve }: WeaponStock, nocked?: boolean) {
  const onString = nocked && loaded > 0 ? 1 : 0;
  return { inQuiver: reserve + loaded - onString, onString };
}

export function gearTitle(id: string) {
  switch (id) {
    case 'wand':
    case 'bow':
    case 'torch':
    case 'survey-wand':
    case 'hunter-bow':
      return equipmentText(`gear.name.${id}`);
  }
}

export const WEAPON_TYPES: { wand: WandDefinition; bow: BowDefinition; torch: TorchDefinition } = {
  wand: {
    id: 'blaster-a',
    item: 'wand',
    get title() {
      return equipmentText('gear.name.wand');
    },
    capacity: 6,
    initialReserve: 18,
    interval: WAND_INTERVAL,
    kick: 0.075,
    recover: 19,
    equip: 0.38,
    chargeSeconds: 0.95,
    createPreparation: prepareWand,
    hud(stock, { equipping, preparing }) {
      return {
        count: String(stock.loaded),
        limit: this.capacity,
        detail: equipmentText('gear.wand.reserve', { reserve: stock.reserve }),
        status:
          !stock.loaded && !stock.reserve
            ? equipmentText('gear.wand.depleted')
            : equipping
              ? equipmentText('gear.equipping')
              : preparing
                ? equipmentText('gear.wand.charging')
                : !stock.loaded
                  ? equipmentText('gear.wand.waiting')
                  : equipmentText('gear.ready'),
      };
    },
    inventory(stock) {
      return equipmentText('gear.wand.inventory', {
        loaded: stock.loaded,
        capacity: this.capacity,
        reserve: stock.reserve,
      });
    },
    empty(stock, key) {
      return stock.reserve
        ? equipmentText('gear.wand.prompt', { reserve: stock.reserve, key })
        : equipmentText('gear.wand.empty');
    },
  },
  bow: {
    id: 'blaster-j',
    item: 'bow',
    get title() {
      return equipmentText('gear.name.bow');
    },
    capacity: 1,
    initialReserve: 16,
    interval: 0.22,
    kick: 0.043,
    recover: 24,
    equip: 0.52,
    nockSeconds: 0.88,
    createPreparation: prepareBow,
    hud(stock, { equipping, nocked, releasing, phase, drawing, draw }) {
      const { inQuiver, onString } = bowSupply(stock, nocked);
      let status = equipmentText('gear.bow.hold');
      if (equipping) status = equipmentText('gear.bow.equipping');
      else if (releasing) status = equipmentText('gear.bow.release');
      else if (!inQuiver && !onString) status = equipmentText('gear.bow.depleted');
      else if (!onString)
        status =
          phase === 'seat' ? equipmentText('gear.bow.nock') : equipmentText('gear.bow.withdraw');
      else if (drawing)
        status = (draw ?? 0) >= 1 ? equipmentText('gear.bow.full') : equipmentText('gear.bow.draw');
      return {
        label: equipmentText('gear.bow.quiver'),
        count: String(inQuiver),
        unit: equipmentText(inQuiver === 1 ? 'gear.bow.arrow' : 'gear.bow.arrows'),
        detail: onString ? equipmentText('gear.bow.nocked') : '',
        status,
      };
    },
    inventory(stock, nocked, equipped = true) {
      const { inQuiver, onString } = bowSupply(stock, nocked);
      return equipmentText(
        onString && equipped ? 'gear.bow.inventoryNocked' : 'gear.bow.inventory',
        { count: inQuiver },
      );
    },
    empty(stock) {
      return stock.loaded + stock.reserve > 0 ? null : equipmentText('gear.bow.empty');
    },
  },
  torch: {
    id: 'torch',
    item: 'torch',
    get title() {
      return equipmentText('gear.name.torch');
    },
    recover: 19,
    equip: 0.34,
    hud(stock, { equipping, lit }) {
      return {
        status: equipping
          ? equipmentText('gear.equipping')
          : lit
            ? equipmentText('gear.torch.lit')
            : equipmentText('gear.torch.unlit'),
      };
    },
  },
};
