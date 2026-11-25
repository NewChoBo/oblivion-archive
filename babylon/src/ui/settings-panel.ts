import { controlText } from '../content/locales/controls.ts';
import { requireElement } from './dom.ts';
import './styles/settings.css';
import {
  ACTIONS,
  actionLabel,
  canonicalKey,
  isAction,
  keyLabel,
  rebind,
  type createPreferences,
  type InputAction,
} from '../platform/browser/preferences.ts';

export function createSettingsPanel(
  preferences: ReturnType<typeof createPreferences>,
  { onOpen, onClose, toggleMute }: { onOpen(): void; onClose(): void; toggleMute?(): boolean },
) {
  const panel = requireElement(document, '#settings-panel', HTMLElement);
  const find = (id: string) => requireElement(panel, '#' + id, HTMLElement);
  const input = (id: string) => requireElement(panel, '#' + id, HTMLInputElement);
  const select = (id: string) => requireElement(panel, '#' + id, HTMLSelectElement);
  const list = find('key-bindings'),
    message = find('settings-message'),
    slider = input('sensitivity');
  const output = find('sensitivity-value'),
    lock = input('pointer-lock'),
    leftHanded = input('left-handed');
  const showPerformance = input('show-performance'),
    cameraShoulder = select('camera-shoulder');
  const shadows = select('shadow-quality'),
    shadowDetail = find('shadow-quality-detail');
  const fpsMode = select('fps-limit-mode'),
    fpsEntry = find('fps-limit-entry'),
    fpsInput = input('fps-limit');
  // Only the selected binding row may consume the next key as its new assignment.
  let listening: InputAction | null = null;
  const tabList = requireElement(panel, '[role=tablist]', HTMLElement);
  const scroller = requireElement(panel, '.settings-layout', HTMLElement);
  if (toggleMute) {
    find('audio-settings').hidden = false;
    const sound = input('settings-sound');
    sound.addEventListener('change', () => (sound.checked = !toggleMute()));
  }
  const tabs = [...tabList.querySelectorAll<HTMLButtonElement>('button:not([hidden])')];
  const pages = tabs.map((tab) => find(tab.getAttribute('aria-controls')!));
  function selectTab(index: number) {
    listening = null;
    for (const [i, tab] of tabs.entries()) {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      pages[i]!.hidden = !selected;
    }
    scroller.scrollTop = 0;
    message.textContent = !preferences.saved
      ? controlText('storage.disabled')
      : tabs[index]?.id === 'keyboard-heading'
        ? controlText('storage.info')
        : '';
    render();
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => selectTab(index));
    tab.addEventListener('keydown', (event) => {
      let next: number;
      switch (event.key) {
        case 'ArrowDown':
          next = (index + 1) % tabs.length;
          break;
        case 'ArrowUp':
          next = (index + tabs.length - 1) % tabs.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      selectTab(next);
      tabs[next]!.focus();
    });
  }
  for (const [id] of ACTIONS) {
    const label = actionLabel(id);
    const row = document.createElement('div'),
      name = document.createElement('span'),
      button = document.createElement('button');
    row.className = 'binding-row';
    name.textContent = label;
    button.type = 'button';
    button.dataset.action = id;
    button.setAttribute('aria-label', controlText('bind.label', { action: label }));
    button.addEventListener('click', () => {
      listening = id;
      message.textContent = controlText('bind.prompt', { action: label });
      render();
    });
    row.append(name, button);
    list.append(row);
  }
  function render() {
    const value = preferences.get();
    slider.value = String(value.sensitivity);
    output.textContent = value.sensitivity.toFixed(2) + '×';
    lock.checked = value.pointerLock;
    leftHanded.checked = value.dominantHand === 'left';
    cameraShoulder.value = value.cameraShoulder;
    showPerformance.checked = value.showPerformance;
    shadows.value = value.shadowQuality;
    shadowDetail.textContent = controlText(`shadow.${value.shadowQuality}`);
    fpsMode.value = value.fpsLimit === null ? 'unlimited' : 'limited';
    fpsEntry.hidden = value.fpsLimit === null;
    if (value.fpsLimit !== null) fpsInput.value = String(value.fpsLimit);
    for (const button of list.querySelectorAll('button')) {
      if (!isAction(button.dataset.action)) continue;
      button.textContent =
        listening === button.dataset.action
          ? controlText('bind.listening')
          : preferences.label(button.dataset.action);
      button.classList.toggle('listening', listening === button.dataset.action);
    }
    find('binding-cancel').hidden = !listening;
    find('settings-reset').hidden = Boolean(listening);
  }
  const cancel = () => {
    const binding = list.querySelector<HTMLButtonElement>(`[data-action="${listening}"]`);
    listening = null;
    message.textContent = controlText('bind.cancelled');
    render();
    binding?.focus();
  };
  const close = () => {
    listening = null;
    panel.hidden = true;
    onClose();
  };
  slider.addEventListener('input', () =>
    preferences.set({ ...preferences.get(), sensitivity: Number(slider.value) }),
  );
  leftHanded.addEventListener('change', () =>
    preferences.set({ ...preferences.get(), dominantHand: leftHanded.checked ? 'left' : 'right' }),
  );
  cameraShoulder.addEventListener('change', () =>
    preferences.set({ ...preferences.get(), cameraShoulder: cameraShoulder.value }),
  );
  lock.addEventListener('change', () =>
    preferences.set({ ...preferences.get(), pointerLock: lock.checked }),
  );
  showPerformance.addEventListener('change', () =>
    preferences.set({ ...preferences.get(), showPerformance: showPerformance.checked }),
  );
  shadows.addEventListener('change', () =>
    preferences.set({ ...preferences.get(), shadowQuality: shadows.value }),
  );
  fpsMode.addEventListener('change', () => {
    const fpsLimit = fpsMode.value === 'limited' ? fpsInput.valueAsNumber : null;
    preferences.set({ ...preferences.get(), fpsLimit });
  });
  fpsInput.addEventListener('change', () => {
    const fpsLimit = fpsInput.valueAsNumber;
    if (Number.isFinite(fpsLimit)) preferences.set({ ...preferences.get(), fpsLimit });
    else render();
  });
  find('binding-cancel').addEventListener('click', cancel);
  find('settings-reset').addEventListener('click', () => {
    listening = null;
    fpsInput.value = fpsInput.defaultValue;
    preferences.reset();
    message.textContent = controlText('reset');
    render();
  });
  find('settings-back').addEventListener('click', close);
  document.addEventListener(
    'keydown',
    (event) => {
      if (panel.hidden || (event.target instanceof Element && event.target.closest('dialog[open]')))
        return;
      if (!listening && event.code !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!listening) {
        close();
        return;
      }
      if (event.code === 'Escape') {
        cancel();
        return;
      }
      const result = rebind(preferences.get(), listening, event.code);
      if (result.error) {
        message.textContent =
          result.error === 'conflict'
            ? controlText('bind.conflict', {
                key: keyLabel(canonicalKey(event.code)),
                action: actionLabel(result.conflict),
              })
            : controlText('bind.reserved');
        return;
      }
      preferences.set(result.value);
      listening = null;
      message.textContent = controlText('bind.done');
      render();
    },
    true,
  );
  preferences.subscribe(() => {
    render();
    if (!preferences.saved) message.textContent = controlText('storage.disabled');
  });
  render();
  return {
    open() {
      onOpen();
      panel.hidden = false;
      selectTab(0);
      message.textContent = controlText(preferences.saved ? 'storage.info' : 'storage.disabled');
      select('game-language').focus();
    },
    get openState() {
      return !panel.hidden;
    },
  };
}
