import type { RaidHealthChange } from '../game/raid/raid-view.ts';
import { RAID_HZ } from '../game/raid/raid-rules.ts';

/** Each label lives for one simulation second, including when several ticks are replayed per frame. */
export function createRaidCombatNumbers(parent: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'raid-combat-numbers';
  layer.setAttribute('aria-hidden', 'true');
  parent.append(layer);
  const labels = new Map<RaidHealthChange, HTMLSpanElement>();
  return function draw(
    changes: readonly RaidHealthChange[],
    tick: number,
    slot: number,
    project: (change: RaidHealthChange) => { x: number; y: number } | null,
  ) {
    for (const [change, label] of labels) {
      if (changes.includes(change)) continue;
      label.remove();
      labels.delete(change);
    }
    if (!changes.length) return;
    const stacks = new Map<RaidHealthChange['target'], number>();
    for (let i = changes.length - 1; i >= 0; i--) {
      const change = changes[i]!;
      if (change.from !== slot && change.target !== slot) continue;
      const anchor = project(change);
      let label = labels.get(change);
      if (!anchor) {
        if (label) label.hidden = true;
        continue;
      }
      if (!label) {
        label = document.createElement('span');
        const kind = change.amount > 0 ? 'heal' : change.target === slot ? 'taken' : 'dealt';
        label.className = kind;
        const sign = kind === 'heal' ? '+' : kind === 'taken' ? '−' : '';
        label.textContent = sign + Math.abs(change.amount);
        layer.append(label);
        labels.set(change, label);
      }
      label.hidden = false;
      const age = Math.min(1, Math.max(0, (tick - change.tick) / RAID_HZ));
      const row = stacks.get(change.target) ?? 0;
      stacks.set(change.target, row + 1);
      label.style.left = anchor.x * 100 + '%';
      label.style.top = anchor.y * 100 + '%';
      label.style.setProperty('--row', -row * 1.02 + 'em');
      label.style.setProperty('--rise', -age * 1.3 + 'em');
      label.style.opacity = String(Math.min(1, (1 - age) * 4));
    }
  };
}
