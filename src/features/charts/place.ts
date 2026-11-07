import type { FrameStore } from '../../app/store';
import type { Id, PlaceholderType, Shape } from '../../model/deck';
import { textOf } from '../../model/deck';

/** Shared by the chart, diagram, equation and ink modules: where a new object goes. */
export interface Placement { x: number; y: number; w: number; h: number; ph?: Shape['ph']; replace?: Id }

const isEmptyPh = (s: Shape, types: PlaceholderType[]): boolean =>
  !!s.ph && types.includes(s.ph.type) && s.kind === 'shape' && !textOf(s.text).trim();

/**
 * The selected (or given) empty placeholder of a suitable type, else the first empty one on the slide,
 * else a box of the given size centred on the slide.
 */
export const placement = (store: FrameStore, w: number, h: number, types: PlaceholderType[], target?: Id): Placement => {
  const shapes = store.shapes();
  const cands = [target ? store.shape(target) : null, store.one(), ...shapes].filter((s): s is Shape => !!s);
  const hit = store.view.mode !== 'master' ? cands.find((s) => shapes.includes(s) && isEmptyPh(s, types)) : undefined;
  if (hit && (target === hit.id || store.sel.includes(hit.id) || !store.sel.length)) {
    return { x: hit.x, y: hit.y, w: hit.w, h: hit.h, ph: hit.ph, replace: hit.id };
  }
  const W = store.deck.w, H = store.deck.h;
  const k = Math.min(1, (W * 0.8) / w, (H * 0.8) / h);
  return { x: Math.round((W - w * k) / 2), y: Math.round((H - h * k) / 2), w: Math.round(w * k), h: Math.round(h * k) };
};

/** Adds (or swaps in for a placeholder) a shape as one undo step and selects it. */
export const insertShape = (store: FrameStore, label: string, shape: Shape, p?: Placement): boolean =>
  store.tryChange(label, () => {
    const list = store.shapes();
    if (p?.ph) shape.ph = p.ph;
    const i = p?.replace ? list.findIndex((s) => s.id === p.replace) : -1;
    if (i >= 0) list.splice(i, 1, shape); else list.push(shape);
    store.sel = [shape.id];
    store.editing = null;
  });

/** Replaces a shape in its list (or group) by id. */
export const replaceShape = (store: FrameStore, id: Id, next: Shape): void => {
  const pl = store.parentList(id);
  if (!pl) return;
  const i = pl.list.findIndex((s) => s.id === id);
  if (i >= 0) pl.list.splice(i, 1, next);
};
