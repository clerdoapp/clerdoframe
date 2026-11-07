import {
  walkShapes,
  type Color, type Deck, type Effects, type Fill, type Group, type Id, type Line, type Paragraph, type Run, type RunStyle, type Shape, type TextBody, type ThemeColorName,
} from '../../model/deck';
import type { FrameStore } from '../../app/store';

/** Pure document operations for the format feature: arrange, align, fills, find and replace, fonts. */

export const PX_PER_IN = 96;
export const PT_TO_PX = 96 / 72;

// ---------- Selection helpers ----------

/** Ancestor groups of a shape, outermost first, or null when it isn't in the list. */
export const ancestors = (shapes: Shape[], id: Id): Group[] | null => {
  for (const s of shapes) {
    if (s.id === id) return [];
    if (s.kind === 'group') {
      const inner = ancestors(s.children, id);
      if (inner) return [s, ...inner];
    }
  }
  return null;
};

/** Selected shapes, leaving out any whose ancestor group is also selected. */
export const topSelected = (store: FrameStore): Shape[] => {
  const ids = new Set(store.sel);
  const top = store.shapes();
  return store.selected().filter((s) => !(ancestors(top, s.id) ?? []).some((g) => ids.has(g.id)));
};

export interface Box { x: number; y: number; w: number; h: number }

const scaleOf = (g: Group): { sx: number; sy: number; cb: Box } => {
  const cb = g.childBox ?? { x: 0, y: 0, w: g.w, h: g.h };
  return { sx: cb.w ? g.w / cb.w : 1, sy: cb.h ? g.h / cb.h : 1, cb };
};

/** A box in a group's child space mapped to slide space (group rotation ignored). */
export const toSlideBox = (b: Box, groups: Group[]): Box => {
  let r = { ...b };
  for (let i = groups.length - 1; i >= 0; i--) {
    const { sx, sy, cb } = scaleOf(groups[i]!);
    r = { x: groups[i]!.x + (r.x - cb.x) * sx, y: groups[i]!.y + (r.y - cb.y) * sy, w: r.w * sx, h: r.h * sy };
  }
  return r;
};

/** Total scale from a shape's own space to slide space. */
export const totalScale = (groups: Group[]): { sx: number; sy: number } =>
  groups.reduce((a, g) => { const { sx, sy } = scaleOf(g); return { sx: a.sx * sx, sy: a.sy * sy }; }, { sx: 1, sy: 1 });

/** Axis-aligned bounds of a rotated rectangle. */
export const rotatedBounds = (s: Box & { rot?: number }): Box => {
  const r = (((s.rot ?? 0) % 360) + 360) % 360;
  if (!r) return { x: s.x, y: s.y, w: s.w, h: s.h };
  const a = (r * Math.PI) / 180;
  const c = Math.round(Math.abs(Math.cos(a)) * 1e9) / 1e9, n = Math.round(Math.abs(Math.sin(a)) * 1e9) / 1e9;
  const w = s.w * c + s.h * n, h = s.w * n + s.h * c;
  return { x: s.x + s.w / 2 - w / 2, y: s.y + s.h / 2 - h / 2, w, h };
};

/** Visible bounds of a shape in slide space. */
export const slideBounds = (store: FrameStore, s: Shape): Box => {
  const groups = ancestors(store.shapes(), s.id) ?? [];
  return toSlideBox(rotatedBounds(s), groups);
};

export const unionBox = (bs: Box[]): Box => {
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  const r = Math.max(...bs.map((b) => b.x + b.w)), btm = Math.max(...bs.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y };
};

/** Moves a shape by a slide-space offset, converting into its group's space. */
export const moveBy = (store: FrameStore, s: Shape, dx: number, dy: number): void => {
  const { sx, sy } = totalScale(ancestors(store.shapes(), s.id) ?? []);
  s.x += dx / (sx || 1);
  s.y += dy / (sy || 1);
};

// ---------- Z-order ----------

export type ZMode = 'front' | 'back' | 'forward' | 'backward';

/** Reorders a shape list in place. The end of the list is the top of the stack. */
export const reorder = (list: Shape[], ids: Set<Id>, mode: ZMode): boolean => {
  const before = list.map((s) => s.id).join();
  if (mode === 'front' || mode === 'back') {
    const moving = list.filter((s) => ids.has(s.id));
    const rest = list.filter((s) => !ids.has(s.id));
    list.splice(0, list.length, ...(mode === 'front' ? [...rest, ...moving] : [...moving, ...rest]));
  } else if (mode === 'forward') {
    for (let i = list.length - 2; i >= 0; i--) {
      if (ids.has(list[i]!.id) && !ids.has(list[i + 1]!.id)) [list[i], list[i + 1]] = [list[i + 1]!, list[i]!];
    }
  } else {
    for (let i = 1; i < list.length; i++) {
      if (ids.has(list[i]!.id) && !ids.has(list[i - 1]!.id)) [list[i], list[i - 1]] = [list[i - 1]!, list[i]!];
    }
  }
  return list.map((s) => s.id).join() !== before;
};

/** Applies a z-order change to the selection, inside each shape's own containing list. */
export const arrange = (store: FrameStore, mode: ZMode): void => {
  const byList = new Map<Shape[], Set<Id>>();
  for (const s of topSelected(store)) {
    const p = store.parentList(s.id);
    if (!p) continue;
    if (!byList.has(p.list)) byList.set(p.list, new Set());
    byList.get(p.list)!.add(s.id);
  }
  for (const [list, ids] of byList) reorder(list, ids, mode);
};

/** Moves one shape to a new index in its list (selection pane drag). */
export const moveToIndex = (list: Shape[], id: Id, index: number): void => {
  const from = list.findIndex((s) => s.id === id);
  if (from < 0) return;
  const [s] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, index)), 0, s!);
};

// ---------- Align and distribute ----------

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export const alignToSlide = (store: FrameStore): boolean => {
  const v = store.ext.alignToSlide;
  return typeof v === 'boolean' ? v : store.sel.length < 2;
};

export const alignShapes = (store: FrameStore, mode: AlignMode, toSlide = alignToSlide(store)): void => {
  const shapes = topSelected(store).filter((s) => !s.locked);
  if (!shapes.length) return;
  const boxes = shapes.map((s) => slideBounds(store, s));
  const ref = toSlide || shapes.length === 1 ? { x: 0, y: 0, w: store.deck.w, h: store.deck.h } : unionBox(boxes);
  shapes.forEach((s, i) => {
    const b = boxes[i]!;
    let dx = 0, dy = 0;
    if (mode === 'left') dx = ref.x - b.x;
    else if (mode === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    else if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w);
    else if (mode === 'top') dy = ref.y - b.y;
    else if (mode === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    else dy = ref.y + ref.h - (b.y + b.h);
    moveBy(store, s, dx, dy);
  });
};

/** Spaces shapes evenly between the outer two (or across the slide). */
export const distribute = (store: FrameStore, axis: 'h' | 'v', toSlide = alignToSlide(store)): void => {
  const shapes = topSelected(store).filter((s) => !s.locked);
  if (shapes.length < (toSlide ? 1 : 3)) return;
  const items = shapes.map((s) => ({ s, b: slideBounds(store, s) }));
  const pos = (b: Box) => (axis === 'h' ? b.x : b.y);
  const size = (b: Box) => (axis === 'h' ? b.w : b.h);
  items.sort((a, b) => pos(a.b) + size(a.b) / 2 - (pos(b.b) + size(b.b) / 2));
  const start = toSlide ? 0 : pos(items[0]!.b);
  const end = toSlide ? (axis === 'h' ? store.deck.w : store.deck.h) : Math.max(...items.map((i) => pos(i.b) + size(i.b)));
  const total = items.reduce((a, i) => a + size(i.b), 0);
  if (items.length === 1) {
    const i = items[0]!;
    const d = start + (end - start - size(i.b)) / 2 - pos(i.b);
    moveBy(store, i.s, axis === 'h' ? d : 0, axis === 'v' ? d : 0);
    return;
  }
  const gap = (end - start - total) / (items.length - 1);
  let at = start;
  for (const i of items) {
    const d = at - pos(i.b);
    moveBy(store, i.s, axis === 'h' ? d : 0, axis === 'v' ? d : 0);
    at += size(i.b) + gap;
  }
};

// ---------- Rotate, flip, size ----------

export const rotateBy = (s: Shape, deg: number): void => {
  const r = ((((s.rot ?? 0) + deg) % 360) + 360) % 360;
  s.rot = r || undefined;
};

export const resize = (s: Shape, w: number, h: number): void => {
  w = Math.max(1, w); h = Math.max(1, h);
  if (s.kind === 'table') {
    const W = s.cols.reduce((a, b) => a + b, 0) || s.w || 1;
    const H = s.rows.reduce((a, r) => a + r.h, 0) || s.h || 1;
    s.cols = s.cols.map((c) => (c * w) / W);
    for (const r of s.rows) r.h = (r.h * h) / H;
  }
  s.w = w; s.h = h;
};

// ---------- Colour helpers ----------

export const alphaOf = (c: Color | undefined): number => (c && typeof c === 'object' ? c.alpha ?? 1 : 1);

export const withAlpha = (c: Color, alpha: number): Color => {
  const a = Math.max(0, Math.min(1, alpha));
  if (typeof c === 'string') return a >= 1 ? c : { hex: c, alpha: a };
  const { alpha: _old, ...rest } = c as { alpha?: number } & Record<string, unknown>;
  return (a >= 1 ? rest : { ...rest, alpha: a }) as Color;
};

export const sameColor = (a: Color | undefined, b: Color | undefined): boolean => JSON.stringify(a) === JSON.stringify(b);

// ---------- Fills, lines, effects ----------

const forEachLeaf = (shapes: Shape[], fn: (s: Shape) => void): void => {
  for (const s of shapes) { if (s.kind === 'group') forEachLeaf(s.children, fn); else fn(s); }
};

/** Sets the fill of the selection. Groups pass the fill to their children; tables to the edited cell or all cells. */
export const applyFill = (store: FrameStore, fill: Fill | undefined): void => {
  forEachLeaf(topSelected(store), (s) => {
    if (s.kind === 'shape') { if (fill) s.fill = structuredClone(fill); else delete s.fill; }
    else if (s.kind === 'table') {
      const cell = store.editing?.shape === s.id ? store.editing.cell : undefined;
      s.rows.forEach((r, ri) => r.cells.forEach((c, ci) => {
        if (cell && (cell.r !== ri || cell.c !== ci)) return;
        if (fill) c.fill = structuredClone(fill); else delete c.fill;
      }));
    }
  });
};

export const DEFAULT_LINE: Line = { fill: { type: 'solid', color: { theme: 'accent1', lum: -0.5 } }, width: 1 };

export const applyLine = (store: FrameStore, patch: Partial<Line> | null): void => {
  forEachLeaf(topSelected(store), (s) => {
    if (s.kind !== 'shape' && s.kind !== 'picture') return;
    if (patch === null) { delete s.line; return; }
    const base = s.line ?? (patch.fill && patch.fill.type !== 'none' ? { ...DEFAULT_LINE, fill: patch.fill } : DEFAULT_LINE);
    const next: Line = { ...structuredClone(base), ...structuredClone(patch) };
    for (const k of Object.keys(next) as (keyof Line)[]) if (next[k] === undefined) delete next[k];
    s.line = next;
  });
};

export const applyEffects = (store: FrameStore, patch: Partial<Effects>): void => {
  for (const s of topSelected(store)) {
    const next: Effects = { ...(s.effects ?? {}), ...structuredClone(patch) };
    for (const k of Object.keys(next) as (keyof Effects)[]) if (next[k] === undefined) delete next[k];
    if (Object.keys(next).length) s.effects = next; else delete s.effects;
  }
};

// ---------- Text across whole shapes ----------

/** Every text body in a shape (auto shapes, table cells, group children). */
export const textBodies = (s: Shape): TextBody[] => {
  const out: TextBody[] = [];
  walkShapes([s], (x) => {
    if (x.kind === 'shape' && x.text) out.push(x.text);
    if (x.kind === 'table') for (const r of x.rows) for (const c of r.cells) out.push(c.text);
  });
  return out;
};

/** Merges a run style into every run (and paragraph default) of the given shapes. */
export const styleAllText = (shapes: Shape[], patch: RunStyle): void => {
  for (const s of shapes) for (const b of textBodies(s)) for (const p of b.paras) {
    for (const r of p.runs) if (!r.br) r.style = { ...(r.style ?? {}), ...patch };
    p.style = { ...(p.style ?? {}), defRun: { ...(p.style?.defRun ?? {}), ...patch } };
  }
};

// ---------- Quick styles ----------

export const QUICK_COLORS: ThemeColorName[] = ['tx1', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
export const QUICK_ROWS = ['Outline', 'Filled', 'Filled with light outline', 'Light fill', 'Gradient', 'Strong'] as const;

export interface QuickStyle { label: string; fill: Fill; line: Line | null; text: Color; effects?: Effects }

export const quickStyle = (i: number): QuickStyle => {
  const row = Math.floor(i / QUICK_COLORS.length) % QUICK_ROWS.length;
  const name = QUICK_COLORS[i % QUICK_COLORS.length]!;
  const base: Color = { theme: name };
  const dark: Color = { theme: name, lum: -0.5 };
  const label = `${QUICK_ROWS[row]}, ${name === 'tx1' ? 'dark' : `accent ${name.slice(-1)}`}`;
  const solid = (c: Color): Fill => ({ type: 'solid', color: c });
  switch (row) {
    case 0: return { label, fill: solid({ theme: 'bg1' }), line: { fill: solid(base), width: 1 }, text: name === 'tx1' ? { theme: 'tx1' } : base };
    case 1: return { label, fill: solid(base), line: { fill: solid(dark), width: 1 }, text: { theme: 'bg1' } };
    case 2: return { label, fill: solid(base), line: { fill: solid({ theme: 'bg1' }), width: 1 }, text: { theme: 'bg1' } };
    case 3: return { label, fill: solid({ theme: name, lum: 0.8 }), line: { fill: solid(base), width: 1 }, text: name === 'tx1' ? { theme: 'tx1' } : dark };
    case 4: return {
      label, line: null, text: { theme: 'bg1' },
      fill: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: { theme: name, lum: 0.3 } }, { pos: 1, color: { theme: name, lum: -0.25 } }] },
    };
    default: return {
      label, fill: solid(base), line: null, text: { theme: 'bg1' },
      effects: { shadow: { kind: 'outer', color: '#000000', blur: 8, dist: 4, angle: 90, alpha: 0.4 } },
    };
  }
};

export const QUICK_STYLE_COUNT = QUICK_COLORS.length * QUICK_ROWS.length;

export const applyQuickStyle = (store: FrameStore, i: number): void => {
  const q = quickStyle(i);
  const shapes: Shape[] = [];
  forEachLeaf(topSelected(store), (s) => { if (s.kind === 'shape') shapes.push(s); });
  for (const s of shapes) {
    if (s.kind !== 'shape') continue;
    s.fill = structuredClone(q.fill);
    if (q.line) s.line = structuredClone(q.line); else s.line = { fill: { type: 'none' }, width: 0 };
    if (q.effects) s.effects = { ...(s.effects ?? {}), ...structuredClone(q.effects) };
    else if (s.effects?.shadow) { const { shadow: _s, ...rest } = s.effects; s.effects = Object.keys(rest).length ? rest : undefined; }
  }
  styleAllText(shapes, { color: q.text });
};

// ---------- Find and replace ----------

export interface FindOpts { matchCase?: boolean; wholeWord?: boolean; notes?: boolean }
export interface Hit { slide: number; shape: Id | null; cell?: { r: number; c: number }; para: number; start: number; end: number; text: string }

export const paraText = (p: Paragraph): string => p.runs.map((r) => (r.br ? '\n' : r.text)).join('');

export const findRegex = (query: string, o: FindOpts): RegExp | null => {
  if (!query) return null;
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const src = o.wholeWord ? `(?<![\\p{L}\\p{N}_])${q}(?![\\p{L}\\p{N}_])` : q;
  return new RegExp(src, `gu${o.matchCase ? '' : 'i'}`);
};

interface Body { body: TextBody; shape: Id | null; cell?: { r: number; c: number } }

/** Text bodies on a slide in reading order: shapes (groups and tables included), then notes. */
export const slideBodies = (deck: Deck, si: number, notes: boolean): Body[] => {
  const slide = deck.slides[si];
  if (!slide) return [];
  const out: Body[] = [];
  walkShapes(slide.shapes, (s) => {
    if (s.kind === 'shape' && s.text) out.push({ body: s.text, shape: s.id });
    if (s.kind === 'table') s.rows.forEach((r, ri) => r.cells.forEach((c, ci) => { if (!c.hMerge && !c.vMerge) out.push({ body: c.text, shape: s.id, cell: { r: ri, c: ci } }); }));
  });
  if (notes && slide.notes) out.push({ body: slide.notes, shape: null });
  return out;
};

export const findAll = (deck: Deck, query: string, o: FindOpts): Hit[] => {
  const re = findRegex(query, o);
  if (!re) return [];
  const hits: Hit[] = [];
  deck.slides.forEach((_, si) => {
    for (const b of slideBodies(deck, si, !!o.notes)) {
      b.body.paras.forEach((p, pi) => {
        const t = paraText(p);
        re.lastIndex = 0;
        for (let m = re.exec(t); m; m = re.exec(t)) {
          if (!m[0].length) { re.lastIndex++; continue; }
          hits.push({ slide: si, shape: b.shape, ...(b.cell ? { cell: b.cell } : {}), para: pi, start: m.index, end: m.index + m[0].length, text: m[0] });
        }
      });
    }
  });
  return hits;
};

/** Replaces characters [start, end) of a paragraph, keeping the style of the run where the change starts. */
export const replaceRange = (p: Paragraph, start: number, end: number, text: string): void => {
  const spans: { r: Run; a: number; b: number }[] = [];
  let at = 0;
  for (const r of p.runs) { const len = r.br ? 1 : r.text.length; spans.push({ r, a: at, b: at + len }); at += len; }
  let ins = spans.findIndex((x) => !x.r.br && x.a <= start && start < x.b);
  if (ins < 0) for (let i = spans.length - 1; i >= 0; i--) if (!spans[i]!.r.br && spans[i]!.b <= start) { ins = i; break; }
  const out: Run[] = [];
  spans.forEach(({ r, a, b }, i) => {
    if (r.br) { if (!(a >= start && b <= end && end > start)) out.push(r); return; }
    const touched = i === ins || (a < end && b > start);
    if (!touched) { out.push(r); return; }
    const before = r.text.slice(0, Math.max(0, Math.min(r.text.length, start - a)));
    const after = r.text.slice(Math.max(0, Math.min(r.text.length, end - a)));
    const next: Run = { ...r, text: i === ins ? before + text + after : (a < start ? before : '') + (b > end ? after : '') };
    if (next.field) delete next.field;
    if (next.text || i === ins) out.push(next);
  });
  if (ins < 0 && text) out.unshift({ text });
  p.runs = out.filter((r) => r.br || r.text);
};

/** Replaces every match in the deck. Returns how many were replaced. */
export const replaceAll = (deck: Deck, query: string, repl: string, o: FindOpts): number => {
  const hits = findAll(deck, query, o);
  // Back to front so earlier offsets stay valid.
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]!;
    const p = paraOf(deck, h);
    if (p) replaceRange(p, h.start, h.end, repl);
  }
  return hits.length;
};

export const paraOf = (deck: Deck, h: Hit): Paragraph | null => {
  const slide = deck.slides[h.slide];
  if (!slide) return null;
  if (h.shape === null) return slide.notes.paras[h.para] ?? null;
  let found: Paragraph | null = null;
  walkShapes(slide.shapes, (s) => {
    if (s.id !== h.shape) return;
    if (s.kind === 'shape') found = s.text?.paras[h.para] ?? null;
    else if (s.kind === 'table' && h.cell) found = s.rows[h.cell.r]?.cells[h.cell.c]?.text.paras[h.para] ?? null;
  });
  return found;
};

/** Is the hit still where it was found (text unchanged)? */
export const hitValid = (deck: Deck, h: Hit, o: FindOpts): boolean => {
  const p = paraOf(deck, h);
  if (!p) return false;
  const t = paraText(p).slice(h.start, h.end);
  return o.matchCase ? t === h.text : t.toLowerCase() === h.text.toLowerCase();
};

// ---------- Fonts ----------

const runStyles = (deck: Deck, fn: (st: RunStyle) => void): void => {
  const body = (b: TextBody | undefined) => {
    if (!b) return;
    for (const p of b.paras) {
      if (p.style?.defRun) fn(p.style.defRun);
      for (const r of p.runs) if (r.style) fn(r.style);
    }
  };
  const shapes = (list: Shape[]) => walkShapes(list, (s) => {
    if (s.kind === 'shape') body(s.text);
    if (s.kind === 'table') for (const r of s.rows) for (const c of r.cells) body(c.text);
  });
  for (const m of deck.masters) {
    shapes(m.shapes);
    for (const l of m.layouts) shapes(l.shapes);
    for (const list of [m.textStyles.title, m.textStyles.body, m.textStyles.other]) for (const p of list) if (p.defRun) fn(p.defRun);
  }
  for (const s of deck.slides) { shapes(s.shapes); body(s.notes); }
};

const bulletFonts = (deck: Deck, fn: (b: { font?: string }) => void): void => {
  const each = (p: { bullet?: unknown } | undefined) => { const b = p?.bullet as { type?: string; font?: string } | undefined; if (b?.type === 'char') fn(b); };
  const body = (b: TextBody | undefined) => b?.paras.forEach((p) => each(p.style));
  const shapes = (list: Shape[]) => walkShapes(list, (s) => { if (s.kind === 'shape') body(s.text); });
  for (const m of deck.masters) {
    shapes(m.shapes); for (const l of m.layouts) shapes(l.shapes);
    for (const list of [m.textStyles.title, m.textStyles.body, m.textStyles.other]) list.forEach(each);
  }
  for (const s of deck.slides) shapes(s.shapes);
};

/** Font names used in the deck, theme fonts included, sorted. */
export const fontsInDeck = (deck: Deck): string[] => {
  const set = new Set<string>();
  for (const m of deck.masters) { set.add(m.theme.fonts.major); set.add(m.theme.fonts.minor); }
  runStyles(deck, (st) => { for (const f of [st.font, st.fontEa, st.fontCs]) if (f && !f.startsWith('+')) set.add(f); });
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
};

/** Replaces one font with another everywhere, theme fonts included. Returns the number of places changed. */
export const replaceFont = (deck: Deck, from: string, to: string): number => {
  if (!from || !to || from === to) return 0;
  let n = 0;
  const same = (f: string | undefined) => !!f && f.toLowerCase() === from.toLowerCase();
  for (const m of deck.masters) {
    if (same(m.theme.fonts.major)) { m.theme.fonts.major = to; n++; }
    if (same(m.theme.fonts.minor)) { m.theme.fonts.minor = to; n++; }
  }
  runStyles(deck, (st) => {
    if (same(st.font)) { st.font = to; n++; }
    if (same(st.fontEa)) { st.fontEa = to; n++; }
    if (same(st.fontCs)) { st.fontCs = to; n++; }
  });
  bulletFonts(deck, (b) => { if (same(b.font)) { b.font = to; n++; } });
  return n;
};

// ---------- Mixed values ----------

export const MIXED = Symbol('mixed');
export type Mixed<T> = T | typeof MIXED | undefined;

/** The shared value of a property across items, MIXED when they differ, undefined for none. */
export const common = <S, T>(items: S[], get: (s: S) => T | undefined): Mixed<T> => {
  if (!items.length) return undefined;
  const first = get(items[0]!);
  const key = JSON.stringify(first);
  for (let i = 1; i < items.length; i++) if (JSON.stringify(get(items[i]!)) !== key) return MIXED;
  return first;
};

export const val = <T>(m: Mixed<T>): T | undefined => (m === MIXED ? undefined : m);
