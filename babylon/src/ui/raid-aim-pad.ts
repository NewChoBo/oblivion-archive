import { raidText as t } from '../content/locales/run-and-raid.ts';
import type { Skill } from '../game/raid/raid-match.ts';

export type AimPoint = Pick<PointerEvent, 'clientX' | 'clientY'>;
export interface RaidAimActions {
  preview(skill: Skill, point: AimPoint): boolean;
  clearPreview(): void;
  drop(skill: Skill, point: AimPoint): void;
}

/** Selecting a skill arms the pad. Only a new contact on the pad can aim and cast. */
export class RaidAimPad {
  readonly #layer = document.createElement('div');
  readonly #surface = document.createElement('button');
  readonly #cursor = document.createElement('i');
  readonly #cancel = document.createElement('button');
  readonly #actions: RaidAimActions;
  #slot: Skill | null = null;
  #point = { clientX: 0, clientY: 0 };
  #contact: { id: number; x: number; y: number; gain: number } | null = null;

  constructor(root: HTMLElement, actions: RaidAimActions) {
    this.#actions = actions;
    this.#layer.className = 'raid-aim';
    this.#layer.hidden = true;
    const cancel = this.#cancel;
    cancel.className = 'raid-aim-cancel';
    cancel.textContent = t('cancelAim');
    cancel.onclick = () => this.close();
    // A second thumb does not produce a compatibility click while steering is held.
    cancel.onpointerup = (e) => {
      if (e.button === 0 && document.elementFromPoint(e.clientX, e.clientY) === cancel)
        this.close();
    };
    this.#surface.className = 'raid-aim-pad';
    this.#surface.type = cancel.type = 'button';
    this.#cursor.className = 'raid-aim-cursor';
    this.#cursor.setAttribute('aria-hidden', 'true');
    this.#layer.append(this.#surface, this.#cursor, cancel);
    root.append(this.#layer);
    this.#surface.onpointerdown = (e) => this.#start(e);
    this.#surface.onpointermove = (e) => this.#move(e);
    this.#surface.onpointerup = (e) => {
      const contact = this.#contact;
      if (contact?.id !== e.pointerId) return;
      this.#move(e);
      if (this.#slot !== null && !this.#overCancel(e)) this.#actions.drop(this.#slot, this.#point);
      this.close();
    };
    this.#surface.onpointercancel = this.#surface.onlostpointercapture = (e) => {
      if (this.#contact?.id === e.pointerId) this.close();
    };
  }

  get skill() {
    return this.#slot;
  }

  open(slot: Skill, name: string) {
    if (this.#slot !== null) return;
    this.#slot = slot;
    this.#layer.hidden = false;
    const bounds = this.#layer.getBoundingClientRect();
    this.#point = {
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    };
    this.#surface.textContent = t('touchAim', { skill: name });
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
  }

  #overCancel(e: PointerEvent) {
    return document.elementFromPoint(e.clientX, e.clientY) === this.#cancel;
  }

  #move(e: PointerEvent) {
    const c = this.#contact;
    if (!c || c.id !== e.pointerId) return;
    const dx = e.clientX - c.x,
      dy = e.clientY - c.y;
    if (!dx && !dy) return;
    c.x = e.clientX;
    c.y = e.clientY;
    this.#cancel.classList.toggle('armed', this.#overCancel(e));
    const bounds = this.#layer.getBoundingClientRect();
    this.#point.clientX = Math.max(
      bounds.left,
      Math.min(bounds.right - 1, this.#point.clientX + dx * c.gain),
    );
    this.#point.clientY = Math.max(
      bounds.top,
      Math.min(bounds.bottom - 1, this.#point.clientY + dy * c.gain),
    );
    this.refresh();
  }

  refresh() {
    if (this.#slot === null) return;
    const valid = this.#actions.preview(this.#slot, this.#point);
    this.#cursor.classList.toggle('valid', valid);
    this.#cursor.style.left = this.#point.clientX + 'px';
    this.#cursor.style.top = this.#point.clientY + 'px';
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
