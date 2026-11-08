import { run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import type { BulletSpec, Paragraph, RunStyle, Shape } from '../../model/deck';
import { walkShapes } from '../../model/deck';
import { effectivePara } from '../../render/inherit';
import { commit, draw, drawTarget, findAnywhere, session, touch } from '../editor/session';
import { currentParaStyle, selectedParas } from '../editor/textOps';
import { normalizePara } from '../editor/textModel';
import { prefs } from './prefs';

/** Checklists are ordinary character bullets: an empty box, or a ticked one. */
export const BOX = '☐';
export const TICK = '☑';
export const isCheckBullet = (b: BulletSpec | undefined): boolean => b?.type === 'char' && (b.char === BOX || b.char === TICK);

/** Turns a paragraph's check on or off, striking its text through when that preference is on. */
export const setChecked = (p: Paragraph, base: BulletSpec, checked: boolean, strike: boolean): void => {
  const b = { ...(base as Extract<BulletSpec, { type: 'char' }>), char: checked ? TICK : BOX };
  p.style = { ...(p.style ?? {}), bullet: b };
  if (!strike) return;
  for (const r of p.runs) {
    if (r.br) continue;
    const st: RunStyle = { ...(r.style ?? {}) };
    if (checked) st.strike = 'sng'; else delete st.strike;
    if (Object.keys(st).length) r.style = st; else delete r.style;
  }
  normalizePara(p);
};

export const checklistOn = (store: FrameStore): boolean => isCheckBullet(currentParaStyle(store).bullet);

export const toggleChecklist = (store: FrameStore): void => {
  if (checklistOn(store)) run(store, 'text.bulletStyle', { type: 'none' } satisfies BulletSpec);
  else run(store, 'text.bulletStyle', { type: 'char', char: BOX } satisfies BulletSpec);
};

/** Toggles the check of the paragraphs being edited (or every checklist paragraph of the selected shapes). */
export const toggleCheck = (store: FrameStore, target?: { shape: string; para: number }): void => {
  const strike = prefs().checkStrike;
  const s = session();
  if (s && store.editing && !target) {
    const t = drawTarget(s);
    if (!t) return;
    const idx = selectedParas(store) ?? [s.sel.start.p];
    const effs = idx.map((i) => effectivePara(t.shape, s.paras[i]?.style, t.ctx).bullet);
    const anyBox = effs.some((b) => b?.type === 'char' && b.char === BOX);
    let changed = false;
    idx.forEach((i, k) => { const b = effs[k]; const p = s.paras[i]; if (p && b && isCheckBullet(b)) { setChecked(p, b, anyBox, strike); changed = true; } });
    if (!changed) return;
    touch(s); commit(anyBox ? 'Check item' : 'Uncheck item'); draw(s); store.emit();
    return;
  }
  if (target) { toggleOne(store, target.shape, target.para, strike); return; }
  // Not editing: all checklist items in the selection flip together.
  const shapes = store.selected().filter((x): x is Extract<Shape, { kind: 'shape' }> => x.kind === 'shape' && !!x.text);
  if (!shapes.length) return;
  store.tryChange('Check items', () => {
    for (const sh of shapes) {
      const items = sh.text!.paras.filter((p) => isCheckBullet(p.style?.bullet));
      const anyBox = items.some((p) => p.style?.bullet?.type === 'char' && p.style.bullet.char === BOX);
      for (const p of items) setChecked(p, p.style!.bullet!, anyBox, strike);
    }
  });
};

const toggleOne = (store: FrameStore, shapeId: string, pi: number, strike: boolean): void => {
  const s = session();
  if (s && s.edit.shape === shapeId && !s.edit.cell) {
    const t = drawTarget(s);
    const p = s.paras[pi];
    if (!t || !p) return;
    const b = effectivePara(t.shape, p.style, t.ctx).bullet;
    if (!b || !isCheckBullet(b)) return;
    setChecked(p, b, b.type === 'char' && b.char === BOX, strike);
    touch(s); commit('Check item'); draw(s); store.emit();
    return;
  }
  store.tryChange('Check item', () => {
    const sh = findAnywhere(store.deck, shapeId);
    if (sh?.kind !== 'shape' || !sh.text) return;
    const p = sh.text.paras[pi];
    if (!p) return;
    // Inherited checklist bullets come from the layout; paragraphs with their own are the usual case.
    const b = p.style?.bullet;
    if (!b || !isCheckBullet(b)) return;
    setChecked(p, b, b.type === 'char' && b.char === BOX, strike);
  });
};

/** The show draws each slide once (its animations work on that drawing), so a tick there is also shown in place. */
const patchShown = (bullet: Element, checked: boolean, strike: boolean): void => {
  bullet.textContent = checked ? TICK : BOX;
  if (!strike) return;
  const p = bullet.closest('p');
  for (const span of p ? [...p.children] : []) {
    if (span === bullet || !(span instanceof HTMLElement) || span.tagName === 'BR') continue;
    const lines = new Set((span.style.textDecorationLine || '').split(' ').filter((x) => x && x !== 'none'));
    if (checked) lines.add('line-through'); else lines.delete('line-through');
    span.style.textDecorationLine = [...lines].join(' ') || 'none';
  }
};

/** Clicking a checklist box in the text being edited or during a slide show ticks it. */
export const installCheckClicks = (store: FrameStore): (() => void) => {
  type Hit = { shape: string; para: number; bullet: Element; editing: boolean };
  const hit = (e: PointerEvent): Hit | null => {
    const el = e.target as Element | null;
    let bullet = el?.closest?.('[data-bullet]') ?? null;
    // In the show, layers for ink and clicks sit over the slide.
    if (!bullet && store.show && document.elementsFromPoint) bullet = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest('[data-bullet]')).find((x) => !!x) ?? null;
    if (!bullet || (bullet.textContent !== BOX && bullet.textContent !== TICK)) return null;
    const p = bullet.closest('p');
    if (!p) return null;
    const editor = p.closest('[data-texteditor]');
    if (editor && store.editing && !store.editing.cell) {
      const i = Number((p as HTMLElement).dataset.p);
      return Number.isFinite(i) ? { shape: store.editing.shape, para: i, bullet, editing: true } : null;
    }
    if (!store.show) return null;
    const g = p.closest('[data-shape]');
    const box = p.closest('[data-textbox]');
    const id = g?.getAttribute('data-shape');
    if (!id || !box) return null;
    let isTable = false;
    for (const sl of store.deck.slides) walkShapes(sl.shapes, (x) => { if (x.id === id && x.kind === 'table') isTable = true; });
    if (isTable) return null;
    return { shape: id, para: [...box.querySelectorAll('p')].indexOf(p as HTMLParagraphElement), bullet, editing: false };
  };
  let pending: Hit | null = null;
  const down = (e: PointerEvent) => {
    pending = hit(e);
    if (!pending) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const up = (e: PointerEvent) => {
    if (!pending) return;
    const h = hit(e);
    const p = pending;
    pending = null;
    (e as PointerEvent & { __handled?: boolean }).__handled = true;
    e.stopPropagation();
    if (!h || h.shape !== p.shape || h.para !== p.para || p.para < 0) return;
    const before = h.bullet.textContent;
    toggleCheck(store, { shape: p.shape, para: p.para });
    if (store.show && !h.editing) {
      const sh = findAnywhere(store.deck, p.shape);
      const b = sh?.kind === 'shape' ? sh.text?.paras[p.para]?.style?.bullet : undefined;
      const now = b?.type === 'char' ? b.char : before;
      if (now !== before) patchShown(h.bullet, now === TICK, prefs().checkStrike);
    }
  };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true);
  return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); };
};
