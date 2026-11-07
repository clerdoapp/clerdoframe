import { run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import { uid, walkShapes, type AutoShape, type Color, type Shape, type Theme } from '../../model/deck';
import { resolve } from '../../render/color';
import { renderCtx } from './body';
import { slideBoxOf } from './geom';

/**
 * In-app shape clipboard. Copies also write the shapes' text to the system clipboard, so a paste
 * can tell whether the system clipboard still holds what we copied or something newer.
 */

export interface ShapeClip { shapes: Shape[]; text: string; theme: Theme; at: number }
let clip: ShapeClip | null = null;
export const shapeClip = (): ShapeClip | null => clip;
let pasteCount = 0;

const shapeText = (shapes: Shape[]): string => {
  const out: string[] = [];
  walkShapes(shapes, (s) => {
    const bodies = s.kind === 'shape' ? [s.text] : s.kind === 'table' ? s.rows.flatMap((r) => r.cells.map((c) => c.text)) : [];
    for (const b of bodies) {
      const t = (b?.paras ?? []).map((p) => p.runs.map((r) => (r.br ? '\n' : r.text)).join('')).join('\n').trim();
      if (t) out.push(t);
    }
  });
  return out.join('\n');
};

/** Fresh ids for a copy, keeping connector glue inside the copy. */
export const freshIds = (shapes: Shape[]): Shape[] => {
  const map = new Map<string, string>();
  const out = structuredClone(shapes);
  walkShapes(out, (s) => { const n = uid('s'); map.set(s.id, n); s.id = n; });
  walkShapes(out, (s) => {
    if (s.kind !== 'shape' || !s.conn) return;
    for (const k of ['start', 'end'] as const) {
      const c = s.conn[k];
      if (!c) continue;
      const m = map.get(c.shape);
      if (m) c.shape = m; else delete s.conn[k];
    }
    if (!s.conn.start && !s.conn.end) delete s.conn;
  });
  return out;
};

export const copyShapes = (store: FrameStore, shapes: Shape[]): void => {
  if (!shapes.length) return;
  const text = shapeText(shapes);
  clip = { shapes: structuredClone(shapes), text, theme: structuredClone(renderCtx(store).theme), at: Date.now() };
  pasteCount = 0;
  writeSystemText(text || ' ');
};

export const writeSystemText = (text: string): void => {
  try { void navigator.clipboard?.writeText(text).catch(() => undefined); } catch { /* not allowed here */ }
};

/** Replaces theme colours with their values in the given theme (paste keeping source formatting). */
export const bakeColors = (v: unknown, theme: Theme): unknown => {
  if (Array.isArray(v)) return v.map((x) => bakeColors(x, theme));
  if (!v || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  if (typeof o.theme === 'string' && Object.keys(o).every((k) => k === 'theme' || k === 'lum' || k === 'alpha')) {
    const c = resolve(o as Color, { theme });
    return c.alpha < 1 ? { hex: c.hex, alpha: c.alpha } : c.hex;
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) out[k] = k === 'styleRef' ? x : bakeColors(x, theme);
  // Theme fonts become their names too.
  for (const k of ['font', 'fontEa', 'fontCs']) if (typeof out[k] === 'string' && (out[k] as string).startsWith('+')) out[k] = (out[k] as string).startsWith('+mj') ? theme.fonts.major : theme.fonts.minor;
  return out;
};

const nextName = (store: FrameStore, base: string): string => {
  const names = new Set<string>();
  walkShapes(store.shapes(), (s) => { names.add(s.name); });
  let n = 1;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
};

export const newTextBox = (store: FrameStore, x: number, y: number, w: number, h: number): AutoShape => ({
  id: uid('s'), kind: 'shape', geom: 'rect', name: nextName(store, 'TextBox'), x, y, w, h, textbox: true,
  fill: { type: 'none' }, line: { fill: { type: 'none' }, width: 0 },
  text: { paras: [{ runs: [] }], wrap: true, autofit: 'resize', vAlign: 't', inset: { l: 9.6, t: 4.8, r: 9.6, b: 4.8 } },
});

export type PasteMode = 'theme' | 'source' | 'picture' | 'text';

/** Pastes the in-app shapes onto the current surface, offset from the originals on repeat pastes. */
export const pasteShapes = (store: FrameStore, mode: PasteMode = 'theme'): boolean => {
  if (!clip) return false;
  const c = clip;
  if (mode === 'text') return pasteText(store, c.text);
  if (mode === 'picture') { void pasteAsPicture(store, c); return true; }
  pasteCount++;
  let shapes = freshIds(c.shapes);
  if (mode === 'source') shapes = bakeColors(shapes, c.theme) as Shape[];
  const top = store.shapes();
  const exists = c.shapes.some((s) => top.some((t) => Math.abs(t.x - s.x) < 0.5 && Math.abs(t.y - s.y) < 0.5));
  const off = exists ? 16 * pasteCount : 0;
  return store.tryChange('Paste', () => {
    for (const s of shapes) {
      s.x += off; s.y += off;
      // Placeholders pasted onto another layout become plain shapes when there's nothing to match.
      if (s.ph && store.surface()?.kind === 'slide' && top.some((t) => t.ph && t.ph.type === s.ph!.type && t.ph.idx === s.ph!.idx)) delete s.ph;
      top.push(s);
    }
    store.sel = shapes.map((s) => s.id);
    store.editing = null;
  });
};

export const pasteText = (store: FrameStore, text: string): boolean => {
  const t = text.replace(/\r\n?/g, '\n').trimEnd();
  if (!t) return false;
  const d = store.deck;
  const lines = t.split('\n');
  const w = Math.min(d.w * 0.6, Math.max(160, Math.max(...lines.map((l) => l.length)) * 10));
  const tb = newTextBox(store, (d.w - w) / 2, d.h / 2 - 20, w, Math.max(40, lines.length * 32));
  tb.text = { ...tb.text!, paras: lines.map((l) => ({ runs: l ? [{ text: l }] : [] })) };
  return store.tryChange('Paste', () => { store.shapes().push(tb); store.sel = [tb.id]; store.editing = null; });
};

export const pasteImage = async (store: FrameStore, blob: Blob, name = 'Pasted image.png'): Promise<void> => {
  const file = blob instanceof File ? blob : new File([blob], name, { type: blob.type || 'image/png' });
  run(store, 'insert.files', [file]);
};

/** Draws the copied shapes to a PNG and pastes it as a picture. */
const pasteAsPicture = async (store: FrameStore, c: ShapeClip): Promise<void> => {
  const svg = document.querySelector<SVGSVGElement>('.canvas svg.slidesvg');
  if (!svg) return;
  const ids = new Set(c.shapes.map((s) => s.id));
  const live = store.shapes().filter((s) => ids.has(s.id));
  if (!live.length) { store.notify('Copy the shapes again to paste them as a picture.'); return; }
  const top = store.shapes();
  const boxes = live.map((s) => slideBoxOf(top, s));
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const w = Math.max(...boxes.map((b) => b.x + b.w)) - x, h = Math.max(...boxes.map((b) => b.y + b.h)) - y;
  if (w < 1 || h < 1) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Keep only the copied shapes (and defs).
  for (const g of [...clone.children]) {
    if (g.tagName.toLowerCase() === 'defs') continue;
    const id = g.getAttribute('data-shape');
    if (!id || !ids.has(id)) g.remove();
  }
  clone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  clone.setAttribute('width', String(w * 2));
  clone.setAttribute('height', String(h * 2));
  clone.removeAttribute('style');
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  const img = new Image();
  await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('draw')); img.src = src; }).catch(() => undefined);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * 2); cv.height = Math.ceil(h * 2);
  try { cv.getContext('2d')?.drawImage(img, 0, 0); } catch { /* tainted */ }
  const blob = await new Promise<Blob | null>((r) => { try { cv.toBlob(r, 'image/png'); } catch { r(null); } });
  if (blob) await pasteImage(store, blob, 'Picture.png');
};

/** Reads the system clipboard (menu Paste, where no paste event exists). Falls back to the in-app clipboard. */
export const pasteFromSystem = async (store: FrameStore): Promise<void> => {
  const nav = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  try {
    if (nav?.read) {
      const items = await nav.read();
      for (const it of items) {
        const img = it.types.find((t) => t.startsWith('image/'));
        if (img && !(clip && it.types.includes('text/plain') && (await (await it.getType('text/plain')).text()) === (clip.text || ' '))) {
          await pasteImage(store, await it.getType(img)); return;
        }
        if (it.types.includes('text/plain')) { handlePastedText(store, await (await it.getType('text/plain')).text()); return; }
      }
    } else if (nav?.readText) { handlePastedText(store, await nav.readText()); return; }
  } catch { /* permission refused: use our own clipboard */ }
  if (!pasteShapes(store)) store.notify('Nothing to paste. Use the keyboard shortcut to paste from other apps.');
};

/** Text from the system clipboard: our own copy pastes the shapes; anything else becomes a text box. */
export const handlePastedText = (store: FrameStore, text: string): void => {
  if (clip && (!text || text === clip.text || text === ' ' || text.trim() === clip.text.trim())) { pasteShapes(store); return; }
  if (text) pasteText(store, text);
};
