import { controlText } from '../../content/locales/controls.ts';

const actionIds = [
  'forward',
  'back',
  'left',
  'right',
  'sprint',
  'jump',
  'crouch',
  'prone',
  'interact',
  'view',
  'tool1',
  'tool2',
  'tool3',
  'reload',
  'inventory',
  'shop',
] as const;
export const actionLabel = (id: (typeof actionIds)[number]) => controlText(`action.${id}`);
export const ACTIONS = actionIds.map((id) => [id, actionLabel(id)] as const);
export type InputAction = (typeof ACTIONS)[number][0];
export interface InputSettings {
  version: number;
  sensitivity: number;
  raidSkillSize: number;
  dominantHand: 'left' | 'right';
  cameraShoulder: 'left' | 'center' | 'right';
  pointerLock: boolean;
  showPerformance: boolean;
  shadowQuality: 'performance' | 'balanced' | 'sharp';
  fpsLimit: number | null;
  bindings: Record<InputAction, string>;
}
export const RAID_SKILL_SIZE = { min: 80, max: 140, step: 5 } as const;
export const DEFAULTS: InputSettings = {
  version: 11,
  sensitivity: 1,
  raidSkillSize: 100,
  dominantHand: 'right',
  cameraShoulder: 'left',
  pointerLock: true,
  showPerformance: false,
  shadowQuality: 'balanced',
  fpsLimit: null,
  bindings: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    sprint: 'ShiftLeft',
    jump: 'Space',
    crouch: 'KeyC',
    prone: 'KeyZ',
    interact: 'KeyE',
    view: 'KeyV',
    tool1: 'Digit1',
    tool2: 'Digit2',
    tool3: 'Digit3',
    reload: 'KeyR',
    inventory: 'Tab',
    shop: 'KeyM',
  },
};
export const STORAGE_KEY = 'room-of-dark.controls.v1';
const equivalentKeys: Readonly<Record<string, string>> = {
  ShiftRight: 'ShiftLeft',
  ControlRight: 'ControlLeft',
  AltRight: 'AltLeft',
};
const labels: Readonly<Record<string, string>> = {
  ShiftLeft: 'Shift',
  ControlLeft: 'Ctrl',
  AltLeft: 'Alt',
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
export const canonicalKey = (code: string) => equivalentKeys[code] || code;
export const validKey = (code: unknown): code is string =>
  typeof code === 'string' &&
  /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ControlLeft|AltLeft|Tab)$/.test(
    code,
  );
export function keyLabel(code: string) {
  return labels[code] || code.replace(/^Key|^Digit/, '');
}
export const isAction = (id: unknown): id is InputAction =>
  ACTIONS.some(([action]) => action === id);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';
export function sanitizePreferences(raw: unknown): InputSettings {
  const value = isRecord(raw) ? raw : {};
  const stored = isRecord(value.bindings) ? value.bindings : null;
  const bindings: Record<string, unknown> = { ...DEFAULTS.bindings, ...stored };
  // Old saves can already use the new shortcut, including saves with partial bindings.
  for (const [action, preferred] of [
    ['jump', ['Space', 'KeyJ']],
    ['inventory', ['KeyI', 'KeyB']],
    ['tool3', ['Digit3', 'KeyT']],
    ['crouch', ['KeyC', 'KeyX']],
    ['prone', ['KeyZ', 'KeyX', 'KeyG']],
    ['shop', ['KeyM', 'KeyB']],
  ] as const) {
    if (!stored) continue;
    if (stored[action] && !(action === 'shop' && Number(value.version) < 10)) continue;
    const used = new Set(ACTIONS.filter(([id]) => id !== action).map(([id]) => bindings[id]));
    const candidates = [
      ...preferred,
      ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (letter) => 'Key' + letter),
    ];
    bindings[action] = candidates.find((code) => !used.has(code));
  }
  const keys = ACTIONS.map(([id]) => bindings[id]);
  const good =
    keys.every(validKey) &&
    new Set(keys).size === keys.length &&
    ACTIONS.every(([id]) => id === 'inventory' || bindings[id] !== 'Tab');
  return {
    version: DEFAULTS.version,
    raidSkillSize:
      typeof value.raidSkillSize === 'number' && Number.isFinite(value.raidSkillSize)
        ? Math.min(
            RAID_SKILL_SIZE.max,
            Math.max(
              RAID_SKILL_SIZE.min,
              Math.round(value.raidSkillSize / RAID_SKILL_SIZE.step) * RAID_SKILL_SIZE.step,
            ),
          )
        : DEFAULTS.raidSkillSize,
    dominantHand: value?.dominantHand === 'left' ? 'left' : 'right',
    cameraShoulder:
      value.cameraShoulder === 'left' ||
      value.cameraShoulder === 'center' ||
      value.cameraShoulder === 'right'
        ? value.cameraShoulder
        : DEFAULTS.cameraShoulder,
    sensitivity:
      typeof value.sensitivity === 'number' && Number.isFinite(value.sensitivity)
        ? Math.max(0.25, Math.min(3, value.sensitivity))
        : 1,
    pointerLock: typeof value?.pointerLock === 'boolean' ? value.pointerLock : true,
    showPerformance: value?.showPerformance === true,
    shadowQuality:
      value.shadowQuality === 'performance' ||
      value.shadowQuality === 'balanced' ||
      value.shadowQuality === 'sharp'
        ? value.shadowQuality
        : DEFAULTS.shadowQuality,
    fpsLimit:
      typeof value.fpsLimit === 'number' && Number.isFinite(value.fpsLimit)
        ? Math.max(30, Math.min(300, Math.round(value.fpsLimit)))
        : DEFAULTS.fpsLimit,
    bindings: good ? (bindings as InputSettings['bindings']) : { ...DEFAULTS.bindings },
  };
}
export function rebind(settings: InputSettings, action: string, code: string) {
  code = canonicalKey(code);
  if (!isAction(action) || !validKey(code) || (code === 'Tab' && action !== 'inventory'))
    return { error: 'reserved' } as const;
  const conflict = ACTIONS.find(([id]) => id !== action && settings.bindings[id] === code);
  if (conflict) return { error: 'conflict', conflict: conflict[0] } as const;
  return { value: { ...settings, bindings: { ...settings.bindings, [action]: code } } };
}

export function createPreferences(
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
) {
  let value = sanitizePreferences(null),
    saved = true;
  try {
    value = sanitizePreferences(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {}
  const listeners = new Set<(value: InputSettings) => void>();
  return {
    get: () => value,
    label: (id: InputAction) => keyLabel(value.bindings[id]),
    subscribe: (listener: (value: InputSettings) => void) => listeners.add(listener),
    set(next: unknown) {
      value = sanitizePreferences(next);
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(value));
        saved = true;
      } catch {
        saved = false;
      }
      for (const listener of listeners) listener(value);
    },
    reset() {
      this.set(DEFAULTS);
    },
    get saved() {
      return saved;
    },
  };
}
