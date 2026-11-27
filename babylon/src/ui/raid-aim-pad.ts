import { raidText as t } from '../content/locales/run-and-raid.ts';
import type { RaidAim, RaidHero, Skill } from '../game/raid/raid-match.ts';
import type { RaidDirection } from '../game/raid/raid-projectiles.ts';

export type AimPoint = Pick<PointerEvent, 'clientX' | 'clientY'>;
export type RaidAimInput = AimPoint | RaidDirection;
export const RAID_AIM_RADIUS = 22;
export type RaidAimFeedback = RaidAim & {
  targetName?: RaidHero | 'wagon';
  limitedCursor?: AimPoint;
};
export function aimFeedback(aim: RaidAimFeedback) {
  const { status, distance, range, radius, kind } = aim;
  const state =
    kind === 'leap' && status === 'ready'
      ? t('aimLeap')
      : kind === 'direction' && status === 'ready'
        ? t(aim.dash ? 'aimDash' : 'aimDirection')
        : aim.allies !== undefined
          ? t('aimGrove', { count: aim.count ?? 0, allies: aim.allies })
          : status === 'ready' && aim.count !== undefined
            ? t(aim.count ? 'aimHits' : 'aimEmpty', { count: aim.count })
            : status === 'ready' && aim.targetName
              ? t('aimTarget', { target: t(aim.targetName) })
              : t(status);
  const reach =
    distance === null || kind === 'pulse' || kind === 'direction'
      ? t('aimRange', { range })
      : t('aimDistance', {
          distance: (status === 'outOfRange' ? Math.ceil(distance * 10) / 10 : distance).toFixed(1),
          range,
        });
  const metrics =
    radius && kind !== 'pulse'
      ? reach + ' · ' + t('aimRadius', { radius: radius.toFixed(1) })
      : reach;
  return { state, metrics };
}
export interface RaidAimActions {
  preview(skill: Skill, input: RaidAimInput): RaidAimFeedback;
  clearPreview(): void;
  drop(skill: Skill, input: RaidAimInput): void;
}

/** Selecting a skill arms the pad. Only a new contact on the pad can aim and cast. */
export class RaidAimPad {
  readonly #layer = document.createElement('div');
  readonly #surface = document.createElement('button');
  readonly #instruction = document.createElement('span');
  readonly #feedback = document.createElement('strong');
  readonly #metrics = document.createElement('span');
  readonly #cursor = document.createElement('i');
  readonly #cancel = document.createElement('button');
  readonly #actions: RaidAimActions;
  #slot: Skill | null = null;
  #name = '';
  #input: RaidAimInput = { clientX: 0, clientY: 0 };
  #contact: { id: number; x: number; y: number; gain: number } | null = null;

  constructor(root: HTMLElement, actions: RaidAimActions) {
    this.#actions = actions;
    this.#layer.className = 'raid-aim';
    this.#layer.hidden = true;
    const cancel = this.#cancel;
    cancel.className = 'raid-aim-cancel';
    cancel.textContent = t('cancelAim');
    // Touch browsers may retarget the opening tap's click to Cancel underneath it.
    cancel.onclick = (e) => {
      if (e.detail === 0) this.close();
    };
    // A second thumb does not produce a compatibility click while steering is held.
    cancel.onpointerup = (e) => {
      if (e.button === 0 && document.elementFromPoint(e.clientX, e.clientY) === cancel)
        this.close();
    };
    this.#surface.className = 'raid-aim-pad';
    const readout = document.createElement('span');
    readout.className = 'raid-aim-readout';
    readout.append(this.#instruction, this.#feedback, this.#metrics);
    this.#surface.append(readout);
    this.#surface.type = cancel.type = 'button';
    this.#cursor.className = 'raid-aim-cursor';
    this.#cursor.style.setProperty('--aim-diameter', 2 * RAID_AIM_RADIUS + 'px');
    this.#cursor.setAttribute('aria-hidden', 'true');
    this.#layer.append(this.#surface, this.#cursor, cancel);
    root.append(this.#layer);
    this.#surface.onpointerdown = (e) => this.#start(e);
    this.#surface.onpointermove = (e) => this.#move(e);
    this.#surface.onpointerup = (e) => {
      const contact = this.#contact;
      if (contact?.id !== e.pointerId) return;
      this.#move(e);
      if (this.#slot !== null && !this.#overCancel(e)) this.#actions.drop(this.#slot, this.#input);
      this.close();
    };
    this.#surface.onpointercancel = this.#surface.onlostpointercapture = (e) => {
      if (this.#contact?.id === e.pointerId) this.close();
    };
  }

  get skill() {
    return this.#slot;
  }

  open(slot: Skill, name: string, kind: Exclude<RaidAim['kind'], 'pulse'>) {
    if (this.#slot !== null) return;
    this.#slot = slot;
    this.#name = name;
    this.#layer.dataset.kind = kind;
    this.#layer.hidden = false;
    const bounds = this.#layer.getBoundingClientRect();
    this.#input =
      kind === 'direction'
        ? { dx: 0, dz: 0 }
        : {
            clientX: bounds.left + bounds.width / 2,
            clientY: bounds.top + bounds.height / 2,
          };
    this.#surface.style.removeProperty('--thumb-x');
    this.#surface.style.removeProperty('--thumb-y');
    this.refresh();
  }

  #start(event: PointerEvent) {
    if (this.#slot === null || this.#contact || event.button !== 0) return;
    event.preventDefault();
    // Scale short thumb strokes equally on both axes to preserve their direction.
    const bounds = this.#layer.getBoundingClientRect();
    const pad = this.#surface.getBoundingClientRect();
    this.#contact = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      gain: Math.min(bounds.width / pad.width, bounds.height / pad.height),
    };
    this.#surface.setPointerCapture(event.pointerId);
    if ('dx' in this.#input) this.#move(event);
  }

  #overCancel(e: PointerEvent) {
    return document.elementFromPoint(e.clientX, e.clientY) === this.#cancel;
  }

  #move(e: PointerEvent) {
    const c = this.#contact;
    if (!c || c.id !== e.pointerId) return;
    this.#cancel.classList.toggle('armed', this.#overCancel(e));
    if ('dx' in this.#input) {
      // The chase camera faces +Z. Stick travel is relative to its fixed centre in both axes.
      const pad = this.#surface.getBoundingClientRect();
      const x = e.clientX - pad.left - pad.width / 2;
      const y = e.clientY - pad.top - pad.height / 2;
      const distance = Math.hypot(x, y);
      const scale = distance <= pad.width * 0.07 ? 0 : Math.min(1, (pad.width * 0.33) / distance);
      this.#surface.style.setProperty('--thumb-x', x * scale + 'px');
      this.#surface.style.setProperty('--thumb-y', y * scale + 'px');
      this.#input = scale ? { dx: x / distance, dz: -y / distance } : { dx: 0, dz: 0 };
      this.refresh();
      return;
    }
    const dx = e.clientX - c.x,
      dy = e.clientY - c.y;
    if (!dx && !dy) return;
    c.x = e.clientX;
    c.y = e.clientY;
    const bounds = this.#layer.getBoundingClientRect();
    const clientX = Math.max(
      bounds.left,
      Math.min(bounds.right - 1, this.#input.clientX + dx * c.gain),
    );
    const clientY = Math.max(
      bounds.top,
      Math.min(bounds.bottom - 1, this.#input.clientY + dy * c.gain),
    );
    this.#input = { clientX, clientY };
    this.refresh();
  }

  refresh() {
    if (this.#slot === null) return;
    const aim = this.#actions.preview(this.#slot, this.#input);
    // Resume a relative stroke from the visible rim, without accumulating overshoot.
    if (aim.limitedCursor) this.#input = aim.limitedCursor;
    const instruction = t(
      aim.dash ? 'touchDash' : aim.kind === 'direction' ? 'touchStick' : 'touchAim',
      {
        skill: this.#name,
      },
    );
    if (this.#instruction.textContent !== instruction) this.#instruction.textContent = instruction;
    this.#layer.dataset.kind = aim.kind;
    this.#layer.dataset.state = aim.status;
    this.#layer.classList.toggle('empty', aim.count === 0 && !aim.allies);
    const { state, metrics } = aimFeedback(aim);
    if (this.#feedback.textContent !== state) this.#feedback.textContent = state;
    if (this.#metrics.textContent !== metrics) this.#metrics.textContent = metrics;
    this.#cursor.hidden = aim.kind === 'direction';
    this.#cursor.classList.toggle('valid', aim.kind !== 'direction' && aim.status === 'ready');
    if ('clientX' in this.#input) {
      this.#cursor.style.left = this.#input.clientX + 'px';
      this.#cursor.style.top = this.#input.clientY + 'px';
    }
  }

  close() {
    if (this.#slot === null) return;
    this.#slot = null;
    const id = this.#contact?.id;
    this.#contact = null;
    if (id !== undefined && this.#surface.hasPointerCapture(id))
      this.#surface.releasePointerCapture(id);
    this.#cancel.classList.remove('armed');
    this.#layer.hidden = true;
    this.#actions.clearPreview();
  }
}
