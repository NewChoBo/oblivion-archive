import {
  gearDescription,
  journalError,
  journalRecord,
  journalText,
} from '../content/locales/journal.ts';
import { canonicalKey } from '../platform/browser/preferences.ts';
import { getCodexEntries } from '../content/catalogs/codex.ts';
import './inventory.css';
import { WEAPON_TYPES } from '../app/equipment/weapon-types.ts';

import { requireElement } from './dom.ts';
import type { JournalCommand, JournalSession, JournalView } from '../app/journal-session.ts';
import type { InputSettings } from '../platform/browser/preferences.ts';
import type { SKILLS } from '../expedition/state.ts';

type View = 'items' | 'lore' | 'growth';
interface Gear {
  readonly id: string;
  readonly kind: keyof typeof WEAPON_TYPES;
  readonly title: string;
  readonly slot: number;
  readonly bonus: number;
}
interface InventoryOptions extends JournalSession {
  readChapterJournal(): { lore: readonly string[]; records: readonly string[] };
  bowNocked(): boolean;
  catalog: {
    gear: Readonly<Record<string, Gear>>;
    skills: Readonly<Record<string, (typeof SKILLS)[keyof typeof SKILLS]>>;
    bagLimit: number;
    storageLimit: number;
  };
  preferences: { get(): Pick<InputSettings, 'bindings'> };
  onClose(): void;
}
interface JournalItem {
  id: string;
  title?: string;
  source?: string;
  description?: string;
  inscription?: string;
  art?: string;
  index?: number;
  locked?: boolean;
  equipped?: boolean;
  where?: 'bag' | 'storage' | 'equipped';
  supply?: string;
}
export function createInventory({
  readJournal,
  readChapterJournal,
  bowNocked,
  catalog,
  preferences,
  dispatch,
  onClose,
}: InventoryOptions) {
  const codexEntries = getCodexEntries();
  const dialog = requireElement(document, '#inventory', HTMLDialogElement);
  const find = (id: string) => requireElement(dialog, '#' + id, HTMLElement);
  const equip = requireElement(dialog, '#inventory-equip', HTMLButtonElement);
  const actions = equip.parentElement;
  if (!actions) throw new Error('Missing inventory actions');
  const gearActions = actions;
  const modes = requireElement(dialog, '.journal-modes', HTMLElement);
  const viewButtons = {
    items: find('inventory-items-view'),
    lore: find('inventory-lore-view'),
    growth: find('inventory-growth-view'),
  };
  viewButtons.growth.textContent = journalText('growth.skills');
  find('journal-keys').textContent = journalText('navigation.keys');
  const bagList = find('inventory-pack'),
    storageList = find('inventory-storage'),
    details = find('inventory-detail'),
    stats = find('inventory-growth-index'),
    growth = find('inventory-growth');
  const moveButton = document.createElement('button'),
    storeButton = document.createElement('button'),
    feedback = document.createElement('p');
  for (const button of [moveButton, storeButton]) {
    button.type = 'button';
    gearActions.append(button);
  }
  feedback.className = 'inventory-feedback';
  feedback.setAttribute('role', 'status');
  gearActions.after(feedback);
  const selected: Partial<Record<View, string>> = {};
  let items: JournalItem[] = [],
    view: View = 'items',
    journal: JournalView;

  function readItems(discovered: ReadonlySet<string>, records: readonly string[]): JournalItem[] {
    if (view === 'lore') {
      const codex = codexEntries.map((entry) =>
        discovered.has(entry.id)
          ? entry
          : {
              id: entry.id,
              title: journalText('record.hidden'),
              source: entry.source,
              description: entry.hint,
              locked: true,
            },
      );
      return [...records.map((id) => ({ id, art: id, ...journalRecord(id) })), ...codex];
    }
    const nocked = bowNocked();
    const gear = [
      ...journal.slots.filter((id): id is string => id !== null),
      ...journal.bag,
      ...journal.storage,
    ].map((id): JournalItem => {
      const definition = catalog.gear[id];
      if (!definition) throw new Error(`Unknown inventory gear: ${id}`);
      const ammo = definition.kind === 'torch' ? null : journal.ammo[definition.kind];
      const equipped = journal.slots.includes(id),
        where = equipped ? 'equipped' : journal.bag.includes(id) ? 'bag' : 'storage';
      const supply = ammo
        ? WEAPON_TYPES[definition.kind].inventory?.(
            ammo,
            definition.kind === 'bow' && nocked,
            equipped,
          )
        : undefined;
      return {
        ...definition,
        art: definition.kind,
        index: definition.slot,
        equipped,
        where,
        source: journalText(`location.${where}`),
        description: gearDescription(definition.kind, definition.bonus),
        supply,
      };
    });
    return gear;
  }

  function inspect(id: string) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    selected[view] = id;
    for (const button of dialog.querySelectorAll<HTMLElement>('[data-entry]')) {
      button.setAttribute('aria-pressed', String(button.dataset.entry === id));
    }
    requireElement(dialog, 'figure', HTMLElement).hidden = view === 'lore' && !item.art;
    dialog.dataset.locked = String(Boolean(item.locked));
    find('inventory-art').dataset.art = item.art ?? id;
    find('inventory-source').textContent = item.source ?? '';
    find('inventory-name').textContent = item.title ?? '';
    find('inventory-description').textContent = item.description ?? '';
    const inscription = find('inventory-inscription');
    inscription.hidden = !item.inscription;
    inscription.textContent = item.inscription ? '“' + item.inscription + '”' : '';
    const gear = item.index !== undefined;
    const energy = find('inventory-energy');
    energy.hidden = !item.supply;
    energy.textContent = item.supply ?? '';
    equip.hidden = !gear;
    const active = item.equipped && journal.selected === item.index;
    equip.disabled = Boolean(active) || (item.where === 'storage' && !journal.canAccessStorage);
    equip.textContent = item.equipped
      ? active
        ? journalText('gear.selected')
        : journalText('gear.draw')
      : journalText('gear.equip');
    moveButton.hidden = !gear || item.id === 'torch' || item.where !== 'equipped';
    moveButton.textContent = journalText('gear.unequip');
    storeButton.hidden = !gear || item.id === 'torch';
    storeButton.textContent =
      item.where === 'storage' ? journalText('gear.retrieve') : journalText('gear.store');
    storeButton.disabled = !journal.canAccessStorage;
    feedback.textContent =
      !storeButton.hidden && !journal.canAccessStorage ? journalText('storage.location') : '';
    details.scrollTop = 0;
  }

  function render() {
    const { lore: foundLore, records: foundRecords } = readChapterJournal();
    const discovered = new Set(foundLore);
    const loreOpen = view === 'lore',
      growthOpen = view === 'growth';
    // Read one snapshot so gear, ammunition and progression describe the same render.
    journal = readJournal();
    dialog.dataset.view = view;
    find('inventory-items-index').hidden = view !== 'items';
    find('inventory-lore-index').hidden = !loreOpen;
    find('inventory-lore-count').textContent = `${discovered.size} / ${codexEntries.length}`;
    find('inventory-lore-complete').hidden = discovered.size !== codexEntries.length;
    for (const [id, button] of Object.entries(viewButtons))
      button.setAttribute('aria-pressed', String(view === id));
    growth.hidden = !growthOpen;
    stats.hidden = !growthOpen;
    details.hidden = gearActions.hidden = feedback.hidden = growthOpen;
    find('bag-heading').textContent = journalText('bag.capacity', {
      count: journal.bag.length,
      limit: catalog.bagLimit,
    });
    find('storage-heading').textContent = journalText('storage.capacity', {
      count: journal.storage.length,
      limit: catalog.storageLimit,
    });
    find('tools-heading').textContent = journalText('gear.slots');
    if (growthOpen) {
      stats.replaceChildren();
      for (const [label, value] of [
        [journalText('stats.points'), String(journal.points)],
        [journalText('stats.level'), String(journal.level + 1)],
        [journalText('stats.xp'), `${journal.xp} / ${journal.nextLevel}`],
        [journalText('stats.health'), `${Math.ceil(journal.health)} / ${journal.maxHealth}`],
        [journalText('stats.armor'), `${Math.ceil(journal.armor)} / ${journal.maxArmor}`],
      ] as const) {
        const term = document.createElement('dt'),
          valueElement = document.createElement('dd');
        term.textContent = label;
        valueElement.textContent = value;
        stats.append(term, valueElement);
      }
      growth.replaceChildren();
      for (const [id, skill] of Object.entries(catalog.skills)) {
        const row = document.createElement('section'),
          heading = document.createElement('h4'),
          description = document.createElement('p'),
          button = document.createElement('button');
        row.className = 'skill-entry';
        heading.textContent = `${skill.title} · ${journal.skills[id]} / ${skill.max}`;
        description.textContent = skill.description;
        button.type = 'button';
        button.textContent = journalText('skill.spend');
        button.disabled = journal.points <= 0 || (journal.skills[id] ?? 0) >= skill.max;
        button.dataset.skill = id;
        button.addEventListener('click', () => {
          const result = dispatch({ kind: 'progression.spend-skill', payload: { skillId: id } });
          render();
          if (!result.ok) {
            feedback.hidden = false;
            feedback.textContent = journalError(result.error, 'skill.unavailable');
          } else feedback.textContent = '';
          const next = growth.querySelector<HTMLButtonElement>(`[data-skill="${id}"]:enabled`);
          (next ?? viewButtons.growth).focus();
        });
        row.append(heading, description, button);
        growth.append(row);
      }
      items = [];
      return;
    }
    items = readItems(discovered, foundRecords);
    const gear = find('inventory-tools'),
      records = find('inventory-records'),
      lore = find('inventory-lore');
    gear.replaceChildren();
    bagList.replaceChildren();
    storageList.replaceChildren();
    records.replaceChildren();
    lore.replaceChildren();
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.entry = item.id;
      const title = document.createElement('span');
      title.textContent = item.title ?? '';
      const archiveEntry = loreOpen && !foundRecords.includes(item.id);
      if (archiveEntry) {
        button.className = 'lore-entry';
        button.dataset.locked = String(Boolean(item.locked));
        const location = document.createElement('span');
        location.className = 'lore-source';
        location.textContent = item.source ?? '';
        button.append(title, location);
      } else {
        const icon = document.createElement('span');
        icon.className = 'entry-art';
        icon.dataset.art = item.art ?? item.id;
        button.append(icon, title);
      }
      if (item.equipped && journal.selected === item.index) {
        const marker = document.createElement('small');
        marker.textContent = journalText('gear.selected');
        button.append(marker);
      }
      button.addEventListener('click', () => inspect(item.id));
      (archiveEntry
        ? lore
        : item.index === undefined
          ? records
          : item.where === 'bag'
            ? bagList
            : item.where === 'storage'
              ? storageList
              : gear
      ).append(button);
    }
    find('inventory-empty').hidden = records.childElementCount > 0;
  }

  function showView(next: View, preferred?: string) {
    view = next;
    render();
    const id =
      [preferred, selected[view]].find((id) => items.some((item) => item.id === id)) ??
      (
        items.find((item) => item.equipped && item.index === journal.selected) ??
        items.find((item) => !item.locked) ??
        items[0]
      )?.id;
    if (next !== 'growth' && id) inspect(id);
    return id;
  }

  function close() {
    if (!dialog.open) return;
    dialog.close();
    onClose();
  }
  find('inventory-close').addEventListener('click', close);
  for (const id of ['items', 'lore', 'growth'] as const)
    viewButtons[id].addEventListener('click', () => showView(id));
  // Tab toggles the journal during play. Within it, arrows connect the section bar,
  // index, reading pane and actions without invoking a gear or skill command.
  dialog.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || event.altKey || event.metaKey || event.ctrlKey) return;
    const direction = event.key;
    const tabs = Object.values(viewButtons);
    const entries = [
      ...dialog.querySelectorAll<HTMLButtonElement>('.journal-index > :not([hidden]) [data-entry]'),
    ];
    const page = view === 'growth' ? growth : details;
    let destination: HTMLElement | undefined;
    if (modes.contains(target)) {
      const current = tabs.indexOf(target);
      if (direction === 'ArrowRight' || direction === 'ArrowLeft') {
        const offset = direction === 'ArrowRight' ? 1 : -1;
        destination = tabs[(current + offset + tabs.length) % tabs.length];
        destination?.click();
      } else if (direction === 'ArrowDown') {
        destination =
          entries.find((button) => button.getAttribute('aria-pressed') === 'true') ?? page;
      } else if (direction === 'ArrowUp') destination = find('inventory-close');
    } else if (target === find('inventory-close') && direction === 'ArrowDown') {
      destination = viewButtons[view];
    } else if (target.dataset.entry) {
      const current = entries.findIndex((button) => button === target);
      if (direction === 'ArrowDown' || direction === 'ArrowUp') {
        const next = entries[current + (direction === 'ArrowDown' ? 1 : -1)];
        if (next?.dataset.entry) inspect(next.dataset.entry);
        destination = next ?? (direction === 'ArrowUp' ? viewButtons[view] : target);
      } else if (direction === 'ArrowRight') destination = page;
      else if (direction === 'ArrowLeft') destination = viewButtons[view];
    } else {
      const buttons = [
        ...(view === 'growth' ? growth : gearActions).querySelectorAll<HTMLButtonElement>(
          'button:enabled:not([hidden])',
        ),
      ];
      if (direction === 'ArrowLeft') {
        destination =
          entries.find((button) => button.getAttribute('aria-pressed') === 'true') ??
          viewButtons[view];
      } else if (direction === 'ArrowRight') {
        destination = buttons[buttons.findIndex((button) => button === target) + 1] ?? page;
      }
    }
    if (destination) {
      event.preventDefault();
      destination.focus();
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        !dialog.open ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        document.querySelector('dialog[open]:not(#inventory)')
      )
        return;
      if (
        event.code !== 'Escape' &&
        event.code !== 'Tab' &&
        canonicalKey(event.code) !== preferences.get().bindings.inventory
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) close();
    },
    true,
  );
  function requestGearChange(command: JournalCommand) {
    const result = dispatch(command);
    if (!result.ok) feedback.textContent = journalError(result.error, 'gear.unavailable');
    return result.ok;
  }
  equip.addEventListener('click', () => {
    const itemId = selected[view];
    if (!itemId || !requestGearChange({ kind: 'inventory.equip', payload: { itemId } })) return;
    render();
    inspect(itemId);
    dialog
      .querySelector<HTMLButtonElement>('[data-entry="' + itemId + '"]')
      ?.focus({ preventScroll: true });
  });
  function move(to: 'bag' | 'storage') {
    const itemId = selected[view];
    if (
      !itemId ||
      !requestGearChange({ kind: 'inventory.move', payload: { itemId, destination: to } })
    )
      return;
    render();
    inspect(itemId);
    dialog.querySelector<HTMLButtonElement>('[data-entry="' + itemId + '"]')?.focus();
  }
  moveButton.addEventListener('click', () => move('bag'));
  storeButton.addEventListener('click', () =>
    move(items.find((item) => item.id === selected[view])?.where === 'storage' ? 'bag' : 'storage'),
  );
  function openView(next: View, preferred?: string) {
    if (dialog.open) return;
    const id = showView(next, preferred);
    dialog.showModal();
    (id
      ? dialog.querySelector<HTMLButtonElement>('[data-entry="' + id + '"]')
      : viewButtons[view]
    )?.focus();
  }
  return {
    open(preferred?: string) {
      const next = preferred
        ? codexEntries.some((entry) => entry.id === preferred) ||
          readChapterJournal().records.includes(preferred)
          ? 'lore'
          : 'items'
        : view;
      openView(next, preferred);
    },
    openStorage() {
      const { storage, bag, slots } = readJournal();
      const firstMovable = slots.find((id): id is string => id !== null && id !== 'torch');
      openView('items', storage[0] ?? bag[0] ?? firstMovable);
    },
    close,
  };
}
