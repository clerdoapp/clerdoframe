import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChartColumn, Film, ImagePlus, Network, Shapes, Table2 } from 'lucide-react';
import { run } from '../../app/commands';
import { canvasLayers, toolFor, type ToolPoint } from '../../app/registry';
import type { FrameStore, Surface } from '../../app/store';
import type { Id, Picture, Shape } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { geometry, preset } from '../../render/geometry';
import { effectivePara } from '../../render/inherit';
import { isMac } from '../../ui/keys';
import { S } from '../../ui/kit';
import { canHoldText, renderCtx } from './body';
import { freshIds, pasteFromSystem, pasteShapes, pasteText, shapeClip } from './clipboard';
import { applyPainter, selectText, startEditing, stopEditing } from './commands';
import {
  HANDLES, ancestorsOf, apply, cornersOf, frameMatrix, inMarquee, inv, isCorner, lineEnds, mul, nearestSite, outlineOf, parentMatrixOf,
  pickTarget, shapeMatrix, sitesOf, slideBoxOf, snap45, unionBox, type Box, type HandleSpec, type Mat, type Pt,
} from './geom';
import {
  adjHandles, cellAt, cropHandle, cropPan, dragAdj, imageBox, isLineShape, moveLineEnd, moveShapes, origins, placeCopies, resizeMany, resizeOne,
  rotateShapes, rotationDelta, type CropStart, type Orig,
} from './interact';
import { session } from './session';
import { inches, snapBox, snapPoint, type SnapLine, type SnapOpts, type SpaceHint } from './snap';
import { TextEditor } from './TextEditor';

/**
 * The editing canvas: draws the slide (or layout / master) and handles selection, moving,
 * resizing, rotating, adjust handles, line ends, connectors, cropping, guides, rulers, zoom and
 * text editing. Drags keep their state locally with a live preview and commit once on release.
 */

const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const RULER = 20;
const PAD = 24;

type Gesture =
  | { kind: 'move'; ids: Id[]; p0: Pt; dup: boolean; started: boolean; box0: Box; others: Box[] }
  | { kind: 'resize'; ids: Id[]; h: HandleSpec; orig: Orig[]; box0: Box; others: Box[] }
  | { kind: 'rotate'; ids: Id[]; orig: Orig[]; center: Pt; p0: Pt; base: number }
  | { kind: 'adj'; id: Id; i: number; base: Record<string, number> }
  | { kind: 'lineEnd'; id: Id; end: 0 | 1; others: Box[] }
  | { kind: 'marquee'; p0: Pt; add: boolean; base: Id[] }
  | { kind: 'crop'; id: Id; h: HandleSpec | null; st: CropStart; p0: Pt }
  | { kind: 'guide'; axis: 'x' | 'y'; index: number; fromRuler: boolean }
  | { kind: 'tool' }
  | { kind: 'pan'; c0: Pt; s0: Pt };

interface Drag {
  g: Gesture;
  pointer: number;
  p: Pt;
  /** Shapes as they would be after the gesture (preview only). */
  preview?: Shape[];
  lines: SnapLine[];
  spacing: SpaceHint[];
  tip?: { text: string; at: Pt };
  marquee?: Box;
  sites?: { pt: Pt; on: boolean }[];
  guideAt?: number;
}

interface Mods { shift: boolean; alt: boolean; mod: boolean }

const findIn = (top: Shape[], id: Id): Shape | null => {
  let hit: Shape | null = null;
  const walk = (l: Shape[]) => { for (const s of l) { if (s.id === id) hit = s; if (s.kind === 'group') walk(s.children); } };
  walk(top);
  return hit;
};
const pointNear = (b: Box, p: Pt, m: number) => p.x >= b.x - m && p.y >= b.y - m && p.x <= b.x + b.w + m && p.y <= b.y + b.h + m;

const snapOpts = (store: FrameStore, others: Box[], scale: number): SnapOpts => ({
  grid: store.view.gridSize,
  toGrid: store.view.snapToGrid,
  guides: store.view.guides ? store.view.guideLines : { x: [], y: [] },
  targets: others,
  slide: { w: store.deck.w, h: store.deck.h },
  toShapes: store.view.snapToShapes && store.ext.smartGuides !== false,
  tol: (coarse ? 10 : 6) / scale,
});

const othersBoxes = (store: FrameStore, ids: Id[]): Box[] => {
  const top = store.shapes();
  const skip = new Set(ids);
  for (const id of ids) for (const g of ancestorsOf(top, id) ?? []) skip.add(g.id);
  return top.filter((s) => !skip.has(s.id) && !s.hidden).map((s) => slideBoxOf(top, s));
};

const topSelIds = (sel: Id[], shapes: Shape[]): Id[] => {
  const ids = new Set(sel);
  return sel.filter((id) => findIn(shapes, id) && !(ancestorsOf(shapes, id) ?? []).some((g) => ids.has(g.id)));
};

/** Unrotated frame of a shape in slide space (for edge snapping during resize). */
const frameBox = (top: Shape[], s: Shape): Box => {
  const P = parentMatrixOf(top, s.id);
  const a = apply(P, { x: s.x, y: s.y }), b = apply(P, { x: s.x + s.w, y: s.y + s.h });
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
};

/** Applies a gesture to a shape list: a copy for the preview (d set), or the live list inside store.change. */
const applyGesture = (store: FrameStore, top: Shape[], g: Gesture, p: Pt, m: Mods, scale: number, d: Drag | null): void => {
  switch (g.kind) {
    case 'move': {
      let dx = p.x - g.p0.x, dy = p.y - g.p0.y;
      if (m.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const sr = snapBox({ ...g.box0, x: g.box0.x + dx, y: g.box0.y + dy }, snapOpts(store, g.others, scale));
      if (!m.shift || dx) dx += sr.dx;
      if (!m.shift || dy) dy += sr.dy;
      if (d) { d.lines = sr.lines; d.spacing = sr.spacing; d.tip = { text: `${inches(g.box0.x + dx)}, ${inches(g.box0.y + dy)}`, at: p }; }
      if (g.dup) {
        const pairs = g.ids.map((id) => findIn(top, id)).filter((s): s is Shape => !!s).map((s) => {
          const copy = freshIds([structuredClone(s)])[0]!;
          delete copy.ph;
          return { from: s.id, copy };
        });
        placeCopies(top, pairs, dx, dy);
        if (!d) store.sel = pairs.map((x) => x.copy.id);
      } else moveShapes(top, g.ids, dx, dy);
      return;
    }
    case 'resize': {
      const one = g.orig.length === 1 ? g.orig[0]! : null;
      const sh = one ? findIn(top, one.id) : null;
      const ratio = m.shift || (isCorner(g.h) && !!sh && (sh.kind === 'picture' || !!sh.lockAspect));
      let pp = p;
      if (!one || !one.rot) {
        const tb = { ...g.box0 };
        if (g.h.fx === 0) { tb.w += tb.x - p.x; tb.x = p.x; } else if (g.h.fx === 1) tb.w = p.x - tb.x;
        if (g.h.fy === 0) { tb.h += tb.y - p.y; tb.y = p.y; } else if (g.h.fy === 1) tb.h = p.y - tb.y;
        const use = { x: g.h.fx === 0 ? [0] : g.h.fx === 1 ? [2] : [], y: g.h.fy === 0 ? [0] : g.h.fy === 1 ? [2] : [] };
        const sr = ratio ? { dx: 0, dy: 0, lines: [] } : snapBox(tb, snapOpts(store, g.others, scale), use);
        pp = { x: p.x + sr.dx, y: p.y + sr.dy };
        if (d) { d.lines = sr.lines; d.spacing = []; }
      }
      if (one && sh) {
        const b = resizeOne(top, one.id, one, g.h, pp, { ratio, center: m.alt });
        if (d && b) d.tip = { text: `${inches(b.w)} × ${inches(b.h)}`, at: pp };
        return;
      }
      const U = g.box0;
      let x0 = U.x, y0 = U.y, x1 = U.x + U.w, y1 = U.y + U.h;
      if (g.h.fx === 0) x0 = Math.min(pp.x, x1 - 2);
      if (g.h.fx === 1) x1 = Math.max(pp.x, x0 + 2);
      if (g.h.fy === 0) y0 = Math.min(pp.y, y1 - 2);
      if (g.h.fy === 1) y1 = Math.max(pp.y, y0 + 2);
      if (m.alt) {
        const cx = U.x + U.w / 2, cy = U.y + U.h / 2;
        if (g.h.fx !== 0.5) { const hw = Math.max(1, g.h.fx === 0 ? cx - x0 : x1 - cx); x0 = cx - hw; x1 = cx + hw; }
        if (g.h.fy !== 0.5) { const hh = Math.max(1, g.h.fy === 0 ? cy - y0 : y1 - cy); y0 = cy - hh; y1 = cy + hh; }
      }
      if (ratio && U.w && U.h) {
        const k = isCorner(g.h) ? Math.max((x1 - x0) / U.w, (y1 - y0) / U.h) : g.h.fx === 0.5 ? (y1 - y0) / U.h : (x1 - x0) / U.w;
        const nw = U.w * k, nh = U.h * k;
        if (g.h.fx === 0) x0 = x1 - nw; else if (g.h.fx === 1) x1 = x0 + nw; else { const c = (x0 + x1) / 2; x0 = c - nw / 2; x1 = c + nw / 2; }
        if (g.h.fy === 0) y0 = y1 - nh; else if (g.h.fy === 1) y1 = y0 + nh; else { const c = (y0 + y1) / 2; y0 = c - nh / 2; y1 = c + nh / 2; }
      }
      const nb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      resizeMany(top, g.orig, U, nb);
      if (d) d.tip = { text: `${inches(nb.w)} × ${inches(nb.h)}`, at: pp };
      return;
    }
    case 'rotate': {
      const delta = rotationDelta(g.center, g.p0, p, g.base, m.shift);
      rotateShapes(top, g.orig, g.center, delta);
      if (d) d.tip = { text: `${Math.round((((g.base + delta) % 360) + 360) % 360)}°`, at: p };
      return;
    }
    case 'adj': dragAdj(top, g.id, g.i, p, g.base); return;
    case 'lineEnd': {
      const s = findIn(top, g.id);
      if (!s) return;
      let q = p;
      const [a, b] = lineEnds(s);
      const other = apply(parentMatrixOf(top, g.id), g.end === 0 ? b : a);
      if (m.shift) q = snap45(other, p);
      const isConn = s.kind === 'shape' && /Connector/.test(s.geom);
      const glue = isConn && !ancestorsOf(top, g.id)?.length ? nearestSite(store.shapes(), q, (coarse ? 20 : 12) / scale, g.id) : null;
      if (glue) q = glue.pt;
      else if (!m.shift) { const sp = snapPoint(q, snapOpts(store, g.others, scale)); q = { x: sp.x, y: sp.y }; if (d) d.lines = sp.lines; }
      moveLineEnd(top, g.id, g.end, q, glue ? { shape: glue.shape, site: glue.site } : null);
      if (d && isConn) {
        const near = store.shapes().filter((x) => x.id !== g.id && !x.hidden && !isLineShape(x) && pointNear(slideBoxOf(store.shapes(), x), q, 40 / scale));
        d.sites = near.flatMap((x) => sitesOf(x).map((pt, i) => ({ pt, on: !!glue && glue.shape === x.id && glue.site === i })));
      }
      return;
    }
    case 'crop':
      if (g.h) cropHandle(top, g.id, g.st, g.h, p);
      else cropPan(top, g.id, g.st, { x: p.x - g.p0.x, y: p.y - g.p0.y });
      return;
    default:
  }
};

const PH_ICONS: Record<string, { icon: typeof Table2; cmd: string; label: string }[]> = {
  obj: [
    { icon: Table2, cmd: 'insert.table', label: 'Insert table' }, { icon: ChartColumn, cmd: 'insert.chart', label: 'Insert chart' },
    { icon: Network, cmd: 'insert.diagram', label: 'Insert diagram' }, { icon: ImagePlus, cmd: 'insert.picture', label: 'Insert picture' },
    { icon: Film, cmd: 'insert.video', label: 'Insert video' }, { icon: Shapes, cmd: 'insert.icons', label: 'Insert icons' },
  ],
  pic: [{ icon: ImagePlus, cmd: 'insert.picture', label: 'Insert picture' }],
  clipArt: [{ icon: ImagePlus, cmd: 'insert.picture', label: 'Insert picture' }],
  chart: [{ icon: ChartColumn, cmd: 'insert.chart', label: 'Insert chart' }],
  tbl: [{ icon: Table2, cmd: 'insert.table', label: 'Insert table' }],
  media: [{ icon: Film, cmd: 'insert.video', label: 'Insert video' }],
  dgm: [{ icon: Network, cmd: 'insert.diagram', label: 'Insert diagram' }],
};

const isEmptyPh = (s: Shape): boolean => s.kind === 'shape' && !!s.ph && !(s.text?.paras.some((p) => p.runs.some((r) => r.text || r.br)));

const withShapes = (surf: Surface, shapes: Shape[]): Surface => {
  if (surf.kind === 'slide') return { kind: 'slide', slide: { ...surf.slide, shapes } };
  if (surf.kind === 'layout') {
    const layout = { ...surf.layout, shapes };
    return { kind: 'layout', master: { ...surf.master, layouts: surf.master.layouts.map((l) => (l === surf.layout ? layout : l)) }, layout };
  }
  return { kind: 'master', master: { ...surf.master, shapes } };
};

const toolPoint = (p: Pt, e: { pressure: number; shiftKey: boolean; pointerType: string; timeStamp: number }): ToolPoint =>
  ({ x: p.x, y: p.y, pressure: e.pressure || 0.5, shift: e.shiftKey, pointerType: e.pointerType, time: e.timeStamp });

export const EditCanvas = ({ store }: { store: FrameStore }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 450 });
  const [, setTick] = useState(0);
  const dragRef = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ d0: number; z0: number; mid: Pt } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ t: number; id: Id | null; x: number; y: number }>({ t: 0, id: null, x: 0, y: 0 });
  const [hoverCursor, setHoverCursor] = useState<string | undefined>();
  const raf = useRef(0);

  /** Drag state changes redraw this component only, at most once per frame. */
  const setDrag = (d: Drag | null, now = false) => {
    dragRef.current = d;
    if (now) { cancelAnimationFrame(raf.current); raf.current = 0; setTick((t) => t + 1); return; }
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; setTick((t) => t + 1); });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // Find next selects found text through this hook.
  if (store.ext.selectText !== selectText) store.ext.selectText = selectText;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = store.deck;
  const ruler = store.view.ruler;
  const rw = ruler ? RULER : 0;
  const fit = Math.max(0.05, Math.min((box.w - PAD * 2) / d.w, (box.h - PAD * 2) / d.h));
  const scale = store.view.zoom === 'fit' ? fit : store.view.zoom;
  store.ext.fitScale = fit;
  const surf = store.surface();
  const W = d.w * scale, H = d.h * scale;
  const outerW = Math.max(box.w, W + PAD * 2), outerH = Math.max(box.h, H + PAD * 2);
  const offX = (outerW - W) / 2, offY = (outerH - H) / 2;
  const drag = dragRef.current;

  // Zoom keeps the point under the pointer (or the view centre) still.
  const zoomAnchor = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const zoomTo = (z: number, client?: Pt) => {
    const el = wrap.current, cv = canvasRef.current;
    if (!el || !cv) return;
    const nz = Math.max(0.1, Math.min(4, z));
    const r = cv.getBoundingClientRect();
    const wr = el.getBoundingClientRect();
    const c = client ?? { x: wr.left + el.clientWidth / 2, y: wr.top + el.clientHeight / 2 };
    const cur = typeof store.view.zoom === 'number' ? store.view.zoom : fit;
    zoomAnchor.current = { sx: (c.x - r.left) / cur, sy: (c.y - r.top) / cur, cx: c.x, cy: c.y };
    store.view.zoom = Math.abs(nz - fit) < 0.004 ? 'fit' : Math.round(nz * 1000) / 1000;
    store.emit();
  };
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const el = wrap.current, cv = canvasRef.current;
    if (!a || !el || !cv) return;
    zoomAnchor.current = null;
    const r = cv.getBoundingClientRect();
    el.scrollLeft += r.left + a.sx * scale - a.cx;
    el.scrollTop += r.top + a.sy * scale - a.cy;
  }, [scale]);

  // Mod+wheel and trackpad pinch (ctrlKey wheel) zoom; needs a non-passive listener.
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const cur = typeof store.view.zoom === 'number' ? store.view.zoom : (store.ext.fitScale as number) ?? 1;
      zoomRef.current(cur * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [store]);

  // Leave crop mode when the surface changes.
  const surfKey = surf ? (surf.kind === 'slide' ? surf.slide.id : surf.kind === 'layout' ? surf.layout.id : surf.master.id) : '';
  const prevSurf = useRef(surfKey);
  useEffect(() => {
    if (prevSurf.current === surfKey) return;
    prevSurf.current = surfKey;
    if (store.ext.cropping) { delete store.ext.cropping; store.emit(); }
  }, [surfKey, store]);
  // Crop mode ends when the picture is no longer the selection.
  useEffect(() => {
    const c = store.ext.cropping as Id | undefined;
    if (c && (store.sel.length !== 1 || store.sel[0] !== c || store.shape(c)?.kind !== 'picture')) { delete store.ext.cropping; store.emit(); }
  });

  const toSlide = (cx: number, cy: number): Pt => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (cx - r.left) / scale, y: (cy - r.top) / scale };
  };
  const tol = (coarse ? 10 : 4) / scale;
  const handleR = (coarse ? 11 : 5) / scale;

  // ---------- Keys on the canvas (Tab, Escape, Enter, typing to start editing) ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || store.dialog || store.show || store.menu) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (t?.closest?.('.slidelist, .fpane, .toolpanel, .menu, .dialog, .notes, .rail, .topbar')) return;
      if (store.view.mode !== 'normal' && store.view.mode !== 'master') return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === 'Escape') {
        if (dragRef.current) { setDrag(null, true); e.preventDefault(); return; }
        if (store.tool) { store.tool = null; store.emit(); e.preventDefault(); return; }
        if (store.painter) { store.painter = null; store.emit(); e.preventDefault(); return; }
        if (store.ext.cropping) { delete store.ext.cropping; store.emit(); e.preventDefault(); return; }
        if (store.sel.length) {
          const chain = ancestorsOf(store.shapes(), store.sel[0]!) ?? [];
          store.select(chain.length && store.sel.length === 1 ? [chain[chain.length - 1]!.id] : []);
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Enter' && store.ext.cropping) { delete store.ext.cropping; store.emit(); e.preventDefault(); return; }
      if (e.key === 'Tab' && !mod && !e.altKey) {
        const id = store.sel[0];
        const list = ((id ? store.parentList(id)?.list : null) ?? store.shapes()).filter((s) => !s.hidden);
        if (!list.length) return;
        e.preventDefault();
        const i = store.sel.length ? list.findIndex((s) => s.id === store.sel[store.sel.length - 1]) : -1;
        const n = list.length;
        const next = i < 0 ? list[e.shiftKey ? n - 1 : 0]! : list[(i + (e.shiftKey ? -1 : 1) + n) % n]!;
        store.select([next.id]);
        return;
      }
      if (e.key === 'Enter' && !mod && !e.shiftKey && store.sel.length === 1) {
        const s = store.one();
        if (s && canHoldText(s) && !s.locked) { e.preventDefault(); startEditing(store, s.kind === 'table' ? { shape: s.id, cell: { r: 0, c: 0 } } : { shape: s.id }, { at: 'all' }); }
        else if (s?.kind === 'group') { e.preventDefault(); const c = s.children.find((x) => !x.hidden); if (c) store.select([c.id]); }
        else if (s?.kind === 'picture' && store.ext.cropping !== s.id) { /* nothing */ }
        return;
      }
      // Typing with one text-capable shape selected starts editing and adds the character at the end.
      if (!mod && !e.altKey && e.key.length === 1 && store.sel.length === 1 && !store.editing && !e.isComposing) {
        const s = store.one();
        if (s && s.kind === 'shape' && canHoldText(s) && !s.locked) {
          e.preventDefault();
          startEditing(store, { shape: s.id }, { at: 'end', insert: e.key });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  // Paste, copy and cut outside text editing: shapes, pictures and text from other apps.
  useEffect(() => {
    const active = () => (store.view.mode === 'normal' || store.view.mode === 'master') && !store.dialog && !store.show;
    const free = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el || el === document.body) return true;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return false;
      return !el.closest?.('.slidelist, .dialog, .notes, .fpane, .toolpanel');
    };
    let waiting: ReturnType<typeof setTimeout> | null = null;
    // Some browsers raise no paste event outside editable fields; read the clipboard instead.
    const onKey = (e: KeyboardEvent) => {
      if (!active() || !free(e.target) || store.editing || e.defaultPrevented) return;
      if (!((isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v')) return;
      if (waiting) clearTimeout(waiting);
      waiting = setTimeout(() => { waiting = null; void pasteFromSystem(store); }, 80);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (waiting) { clearTimeout(waiting); waiting = null; }
      if (!active() || !free(e.target) || store.editing) return;
      const dt = e.clipboardData;
      if (!dt) return;
      e.preventDefault();
      const files = [...dt.files].filter((f) => /^(image|video|audio)\//.test(f.type));
      const text = dt.getData('text/plain');
      const c = shapeClip();
      if (c && (!files.length || text === c.text || text === ' ') && (!text || text === c.text || text === ' ' || text.trim() === c.text.trim())) { pasteShapes(store); return; }
      if (files.length) { run(store, 'insert.files', files); return; }
      if (text) pasteText(store, text);
    };
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (!active() || !free(e.target) || store.editing || !store.sel.length) return;
      e.preventDefault();
      run(store, cut ? 'edit.cut' : 'edit.copy');
    };
    const c1 = (e: ClipboardEvent) => onCopy(e, false), c2 = (e: ClipboardEvent) => onCopy(e, true);
    document.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', c1);
    document.addEventListener('cut', c2);
    return () => { if (waiting) clearTimeout(waiting); document.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKey); document.removeEventListener('copy', c1); document.removeEventListener('cut', c2); };
  }, [store]);

  // ---------- Pointer handling ----------

  const mods = (e: { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): Mods => ({ shift: e.shiftKey, alt: e.altKey, mod: isMac ? e.metaKey : e.ctrlKey });

  const outerRef = useRef<HTMLDivElement>(null);
  const beginGesture = (g: Gesture, e: { pointerId: number }, p: Pt) => {
    try { outerRef.current?.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    setDrag({ g, pointer: e.pointerId, p, lines: [], spacing: [] }, true);
  };

  const shapeHit = (p: Pt): Shape | null => pickTarget(store.shapes(), store.sel, p, tol);

  const openMenu = (cx: number, cy: number, p: Pt) => {
    const hit = shapeHit(p);
    if (store.editing && hit?.id !== store.editing.shape) stopEditing(store, false);
    if (hit && !store.sel.includes(hit.id)) store.sel = [hit.id];
    if (!hit) store.sel = [];
    store.menu = hit ? { x: cx, y: cy, kind: 'shape', data: hit.id } : { x: cx, y: cy, kind: 'canvas' };
    store.emit();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!surf) return;
    const el = e.target as Element;
    if (el.closest('.ed-text, .ed-phbtns, .ed-ruler')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Two fingers: pinch zoom and pan, cancelling what the first finger started.
    if (pointers.current.size === 2 && e.pointerType === 'touch') {
      if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; }
      const dr = dragRef.current;
      if (dr?.g.kind === 'tool') toolFor(store.tool)?.up(store, toolPoint(dr.p, e));
      setDrag(null, true);
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d0: Math.hypot(a!.x - b!.x, a!.y - b!.y), z0: typeof store.view.zoom === 'number' ? store.view.zoom : fit, mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 } };
      return;
    }
    if (pointers.current.size > 1 || e.button === 2) return;
    if (e.button === 1) {
      e.preventDefault();
      const w = wrap.current!;
      beginGesture({ kind: 'pan', c0: { x: e.clientX, y: e.clientY }, s0: { x: w.scrollLeft, y: w.scrollTop } }, e, toSlide(e.clientX, e.clientY));
      return;
    }
    const p = toSlide(e.clientX, e.clientY);
    const m = mods(e);
    if (!store.editing) wrap.current?.focus({ preventScroll: true });

    if (e.pointerType === 'touch') {
      const cx = e.clientX, cy = e.clientY;
      longPress.current = setTimeout(() => {
        longPress.current = null;
        const dr = dragRef.current;
        if (dr && dr.g.kind === 'move' && dr.g.started) return;
        if (dr?.g.kind === 'tool') return;
        setDrag(null, true);
        openMenu(cx, cy, p);
        // Lifting the finger would otherwise tap the menu item under it.
        const swallow = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 800);
      }, 550);
    }

    // Drawing tools.
    const tool = toolFor(store.tool);
    if (tool && (!tool.accepts || tool.accepts(store, e.pointerType))) {
      e.preventDefault();
      if (store.editing) stopEditing(store, false);
      tool.down(store, toolPoint(p, e));
      beginGesture({ kind: 'tool' }, e, p);
      return;
    }

    // Selection chrome handles carry data attributes.
    const hEl = el.closest('[data-h]');
    if (hEl && !store.deck.final) {
      e.preventDefault();
      const kind = hEl.getAttribute('data-h')!;
      const top = store.shapes();
      const ids = topSelIds(store.sel, top).filter((id) => !store.shape(id)?.locked);
      if (kind === 'rot') {
        const orig = origins(top, ids);
        const U = unionBox(ids.map((id) => slideBoxOf(top, store.shape(id)!)));
        const center = orig.length === 1 ? orig[0]!.slideCenter : { x: U.x + U.w / 2, y: U.y + U.h / 2 };
        beginGesture({ kind: 'rotate', ids, orig, center, p0: p, base: orig.length === 1 ? orig[0]!.rot ?? 0 : 0 }, e, p);
        return;
      }
      if (kind.startsWith('adj')) {
        const id = hEl.getAttribute('data-id')!;
        const s = store.shape(id);
        if (s?.kind !== 'shape') return;
        beginGesture({ kind: 'adj', id, i: Number(kind.slice(3)), base: { ...(preset(s.geom)?.defaults ?? {}), ...(s.adj ?? {}) } }, e, p);
        return;
      }
      if (kind === 'end0' || kind === 'end1') {
        const id = hEl.getAttribute('data-id')!;
        beginGesture({ kind: 'lineEnd', id, end: kind === 'end0' ? 0 : 1, others: othersBoxes(store, [id]) }, e, p);
        return;
      }
      if (kind.startsWith('crop:')) {
        const id = store.ext.cropping as Id;
        const pic = store.shape(id);
        if (pic?.kind !== 'picture') return;
        const hk = kind.slice(5);
        beginGesture({ kind: 'crop', id, h: hk === 'pan' ? null : HANDLES[hk]!, st: cropStart(pic), p0: p }, e, p);
        return;
      }
      if (kind === 'guide') {
        beginGesture({ kind: 'guide', axis: hEl.getAttribute('data-axis') as 'x' | 'y', index: Number(hEl.getAttribute('data-i')), fromRuler: false }, e, p);
        return;
      }
      const hs = HANDLES[kind];
      if (hs && ids.length) {
        const box0 = ids.length === 1 ? frameBox(top, store.shape(ids[0]!)!) : unionBox(ids.map((id) => slideBoxOf(top, store.shape(id)!)));
        beginGesture({ kind: 'resize', ids, h: hs, orig: origins(top, ids), box0, others: othersBoxes(store, ids) }, e, p);
      }
      return;
    }

    // Crop mode: dragging the picture pans it; a click elsewhere ends cropping.
    if (store.ext.cropping) {
      const id = store.ext.cropping as Id;
      const pic = store.shape(id);
      if (pic?.kind === 'picture') {
        const ib = imageBox(pic.w, pic.h, pic.crop ?? { l: 0, t: 0, r: 0, b: 0 });
        const l = apply(inv(mul(parentMatrixOf(store.shapes(), id), frameMatrix(pic))), p);
        if (l.x >= Math.min(0, ib.x) && l.y >= Math.min(0, ib.y) && l.x <= Math.max(pic.w, ib.x + ib.w) && l.y <= Math.max(pic.h, ib.y + ib.h)) {
          e.preventDefault();
          beginGesture({ kind: 'crop', id, h: null, st: cropStart(pic), p0: p }, e, p);
          return;
        }
      }
      delete store.ext.cropping;
      store.emit();
    }

    const hit = shapeHit(p);

    if (store.painter && hit && !store.editing) {
      e.preventDefault();
      applyPainter(store, [hit]);
      store.select([hit.id]);
      return;
    }

    if (store.editing) {
      const ed = store.editing;
      if (hit && hit.id === ed.shape && hit.kind === 'table') {
        const cell = cellAt(store.shapes(), hit.id, p);
        if (cell && (cell.r !== ed.cell?.r || cell.c !== ed.cell?.c)) {
          e.preventDefault();
          stopEditing(store, true);
          startEditing(store, { shape: hit.id, cell }, { point: { x: e.clientX, y: e.clientY } });
          return;
        }
      }
      stopEditing(store, !!hit && hit.id === ed.shape);
    }

    if (!hit) {
      e.preventDefault();
      const add = m.shift || m.mod;
      if (!add && store.sel.length) store.select([]);
      beginGesture({ kind: 'marquee', p0: p, add, base: add ? [...store.sel] : [] }, e, p);
      return;
    }

    e.preventDefault();
    const dupDrag = (m.mod || m.alt) && store.sel.includes(hit.id);
    if ((m.shift || m.mod) && !dupDrag) {
      const top = store.shapes();
      const inSel = store.sel.includes(hit.id);
      const chain = ancestorsOf(top, hit.id) ?? [];
      // One level at a time: a child replaces its group and the other way round.
      let next = store.sel.filter((id) => id !== hit.id && !chain.some((g) => g.id === id) && !(ancestorsOf(top, id) ?? []).some((g) => g.id === hit.id));
      if (!inSel) next = [...next, hit.id];
      store.select(next);
      if (inSel) return;
    } else if (!store.sel.includes(hit.id)) store.select([hit.id]);

    // Double click / double tap (tracked here because pointer capture swallows dblclick on some browsers).
    const now = e.timeStamp;
    const lt = lastTap.current;
    const dbl = now - lt.t < 450 && lt.id === hit.id && Math.hypot(lt.x - e.clientX, lt.y - e.clientY) < (e.pointerType === 'mouse' ? 6 : 24);
    lastTap.current = { t: dbl || m.shift || m.mod ? 0 : now, id: hit.id, x: e.clientX, y: e.clientY };
    if (dbl && !m.shift && !m.mod) { onDouble(hit, p, e.clientX, e.clientY); return; }

    if (store.painter || store.deck.final) return;
    const top = store.shapes();
    const ids = topSelIds(store.sel, top).filter((id) => !store.shape(id)?.locked);
    if (!ids.length) return;
    beginGesture({
      kind: 'move', ids, p0: p, dup: m.mod || m.alt, started: false,
      box0: unionBox(ids.map((id) => slideBoxOf(top, store.shape(id)!))), others: othersBoxes(store, ids),
    }, e, p);
  };

  const onDouble = (hit: Shape, p: Pt, cx: number, cy: number) => {
    if (hit.locked) return;
    if (hit.kind === 'picture') { store.ext.cropping = hit.id; store.emit(); return; }
    if (hit.kind === 'shape' && hit.ph && isEmptyPh(hit) && ['pic', 'clipArt'].includes(hit.ph.type)) { run(store, 'insert.picture'); return; }
    if (hit.kind === 'table') {
      const cell = cellAt(store.shapes(), hit.id, p);
      if (cell) startEditing(store, { shape: hit.id, cell }, { point: { x: cx, y: cy } });
      return;
    }
    if (hit.kind === 'group') {
      const inner = pickTarget(store.shapes(), [hit.id], p, tol);
      if (inner && inner.id !== hit.id) { store.select([inner.id]); if (canHoldText(inner)) onDouble(inner, p, cx, cy); }
      return;
    }
    if (hit.kind === 'shape' && canHoldText(hit)) { startEditing(store, { shape: hit.id }, { point: { x: cx, y: cy, word: true } }); return; }
    if (hit.kind === 'chart') run(store, 'chart.editData');
    else if (hit.kind === 'diagram') run(store, 'diagram.textPane');
    else if (hit.kind === 'equation') run(store, 'equation.edit');
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pt = pointers.current.get(e.pointerId);
    if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const pc = pinch.current;
      const w = wrap.current;
      if (w) { w.scrollLeft -= mid.x - pc.mid.x; w.scrollTop -= mid.y - pc.mid.y; }
      pc.mid = mid;
      zoomTo(pc.z0 * (dist / (pc.d0 || 1)), mid);
      return;
    }
    const dr = dragRef.current;
    if (!dr) {
      const tool = toolFor(store.tool);
      const c = tool ? tool.cursor ?? 'crosshair' : store.painter ? 'copy' : undefined;
      if (c !== hoverCursor) setHoverCursor(c);
      return;
    }
    if (dr.pointer !== e.pointerId) return;
    const p = toSlide(e.clientX, e.clientY);
    dr.p = p;
    const g = dr.g;
    if (longPress.current && (g.kind === 'move' || g.kind === 'marquee') && Math.hypot(p.x - ('p0' in g ? g.p0.x : p.x), p.y - ('p0' in g ? g.p0.y : p.y)) * scale > 8) {
      clearTimeout(longPress.current); longPress.current = null;
    }
    if (g.kind === 'tool') {
      // Coalesced samples give pens their full resolution.
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
      const tool = toolFor(store.tool);
      if (evs.length > 1) for (const ce of evs) tool?.move(store, toolPoint(toSlide(ce.clientX, ce.clientY), ce));
      else tool?.move(store, toolPoint(p, e));
      setDrag(dr);
      return;
    }
    if (g.kind === 'pan') {
      const w = wrap.current!;
      w.scrollLeft = g.s0.x - (e.clientX - g.c0.x);
      w.scrollTop = g.s0.y - (e.clientY - g.c0.y);
      return;
    }
    if (g.kind === 'marquee') {
      if (e.pointerType === 'touch' && typeof store.view.zoom === 'number' && store.view.zoom > fit + 0.01) {
        // One finger on empty space pans when zoomed in.
        const w = wrap.current!;
        dr.g = { kind: 'pan', c0: { x: e.clientX, y: e.clientY }, s0: { x: w.scrollLeft, y: w.scrollTop } };
        return;
      }
      dr.marquee = { x: Math.min(g.p0.x, p.x), y: Math.min(g.p0.y, p.y), w: Math.abs(p.x - g.p0.x), h: Math.abs(p.y - g.p0.y) };
      setDrag(dr);
      return;
    }
    if (g.kind === 'guide') {
      const v = Math.round(g.axis === 'x' ? p.x : p.y);
      dr.guideAt = v;
      dr.tip = { text: inches(Math.abs(v - (g.axis === 'x' ? d.w : d.h) / 2)), at: p };
      setDrag(dr);
      return;
    }
    if (g.kind === 'move' && !g.started) {
      if (Math.hypot(p.x - g.p0.x, p.y - g.p0.y) * scale < (e.pointerType === 'mouse' ? 3 : 8)) return;
      g.started = true;
    }
    const preview = structuredClone(store.shapes());
    applyGesture(store, preview, g, p, mods(e), scale, dr);
    dr.preview = preview;
    setDrag(dr);
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>, cancel = false) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) { if (pointers.current.size < 2) pinch.current = null; return; }
    if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; }
    const dr = dragRef.current;
    if (!dr || dr.pointer !== e.pointerId) return;
    setDrag(null, true);
    const p = toSlide(e.clientX, e.clientY);
    const g = dr.g;
    if (g.kind === 'tool') { toolFor(store.tool)?.up(store, toolPoint(cancel ? dr.p : p, e)); return; }
    if (cancel || g.kind === 'pan') return;
    if (g.kind === 'marquee') {
      const mq = dr.marquee;
      if (!mq || (mq.w * scale < 3 && mq.h * scale < 3)) return;
      const inside = inMarquee(store.shapes(), mq).map((s) => s.id);
      store.select(g.add ? [...new Set([...g.base, ...inside])] : inside);
      return;
    }
    if (g.kind === 'guide') {
      const v = dr.guideAt;
      if (v === undefined) return;
      const gl = store.view.guideLines;
      const list = [...gl[g.axis]];
      const max = g.axis === 'x' ? d.w : d.h;
      const out = v < -4 || v > max + 4;
      if (g.fromRuler) { if (!out) list.push(v); } else if (out) list.splice(g.index, 1); else list[g.index] = v;
      store.view.guideLines = { ...gl, [g.axis]: list };
      if (g.fromRuler && !out) store.view.guides = true;
      store.emit();
      return;
    }
    if (g.kind === 'move' && !g.started) return;
    const label = g.kind === 'move' ? (g.dup ? 'Duplicate' : 'Move') : g.kind === 'resize' ? 'Resize' : g.kind === 'rotate' ? 'Rotate'
      : g.kind === 'adj' ? 'Adjust shape' : g.kind === 'crop' ? 'Crop' : 'Move line end';
    store.tryChange(label, () => applyGesture(store, store.shapes(), g, p, mods(e), scale, null));
  };

  const onRulerDown = (axis: 'x' | 'y') => (e: React.PointerEvent) => {
    if (store.deck.final || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    beginGesture({ kind: 'guide', axis, index: -1, fromRuler: true }, e, toSlide(e.clientX, e.clientY));
  };

  // ---------- Drawing ----------

  const shapesNow = drag?.preview ?? store.shapes();
  const drawSurf = surf && drag?.preview ? withShapes(surf, drag.preview) : surf;
  const editingId = store.editing ? (store.editing.cell ? `${store.editing.shape}:${store.editing.cell.r}:${store.editing.cell.c}` : store.editing.shape) : undefined;
  const tool = toolFor(store.tool);
  const cursor = drag?.g.kind === 'pan' ? 'grabbing' : hoverCursor;
  const cv: CSSProperties = { width: W, height: H, left: offX, top: offY, margin: 0, position: 'absolute', ...(cursor ? { cursor } : {}) };

  return (
    <div className={`ed-host${ruler ? ' ed-hasruler' : ''}`} style={{ ['--ed-rw' as string]: `${rw}px` }}>
      {ruler && surf && <Rulers store={store} scale={scale} offX={offX} offY={offY} wrap={wrap} onDown={onRulerDown} />}
      <div className="canvaswrap ed-wrap" ref={wrap} tabIndex={-1} aria-label="Slide canvas"
        onDragOver={(e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={(e) => {
          const files = [...(e.dataTransfer?.files ?? [])];
          if (!files.length) return;
          e.preventDefault();
          e.stopPropagation();
          run(store, 'insert.files', files);
        }}
        onContextMenu={(e) => {
          if ((e.target as Element).closest('.ed-text')) return;
          e.preventDefault();
          if (!surf) return;
          openMenu(e.clientX, e.clientY, toSlide(e.clientX, e.clientY));
        }}>
        <div className="ed-outer" ref={outerRef} style={{ width: outerW, height: outerH }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e)} onPointerCancel={(e) => finish(e, true)}>
          <div className="canvas ed-canvas" ref={canvasRef} style={cv}>
            {drawSurf && (
              <SlideView className="slidesvg" deck={d} slide={drawSurf.kind === 'slide' ? drawSurf.slide : null}
                {...(drawSurf.kind === 'layout' ? { layout: drawSurf.layout, master: drawSurf.master } : drawSurf.kind === 'master' ? { master: drawSurf.master } : {})}
                mode="edit" prompts editing={editingId} {...(store.view.grayscale !== 'color' ? { grayscale: store.view.grayscale } : {})} />
            )}
            {surf && (
              <svg className="ed-overlay" viewBox={`0 0 ${d.w} ${d.h}`} width={W} height={H}>
                {store.view.grid && <Grid w={d.w} h={d.h} step={store.view.gridSize} scale={scale} />}
                {store.view.guides && <Guides store={store} scale={scale} drag={drag} />}
                {canvasLayers().map((l) => <g key={l.id} data-layer={l.id}>{l.render(store, scale)}</g>)}
                {drag?.g.kind !== 'tool' && <Chrome store={store} shapes={shapesNow} scale={scale} handleR={handleR} dragging={!!drag && drag.g.kind !== 'marquee' && drag.g.kind !== 'guide'} />}
                {drag && <DragHints drag={drag} scale={scale} />}
                {tool?.preview?.(store)}
              </svg>
            )}
            {surf && !drag && <PlaceholderButtons store={store} scale={scale} />}
            {surf && <TextEditor store={store} scale={scale} />}
            {drag?.tip && <div className="ed-tip" style={{ left: Math.min(W - 90, drag.tip.at.x * scale + 16), top: Math.min(H - 24, drag.tip.at.y * scale + 18) }}>{drag.tip.text}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

const cropStart = (pic: Picture): CropStart => ({
  x: pic.x, y: pic.y, w: pic.w, h: pic.h, ...(pic.rot ? { rot: pic.rot } : {}), crop: pic.crop ?? { l: 0, t: 0, r: 0, b: 0 },
  ...(pic.flipH ? { flipH: true } : {}), ...(pic.flipV ? { flipV: true } : {}),
});

// ---------- Selection chrome ----------

const poly = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

const Chrome = ({ store, shapes, scale, handleR, dragging }: { store: FrameStore; shapes: Shape[]; scale: number; handleR: number; dragging: boolean }) => {
  const sw = 1 / scale;
  const sel = store.sel.map((id) => findIn(shapes, id)).filter((s): s is Shape => !!s);
  const nodes: ReactNode[] = [];
  const cropping = store.ext.cropping as Id | undefined;
  const editing = store.editing;
  const parents = new Set<Id>();
  for (const s of sel) for (const g of ancestorsOf(shapes, s.id) ?? []) parents.add(g.id);
  for (const id of parents) {
    const g = findIn(shapes, id);
    if (g) nodes.push(<polygon key={`gp${id}`} points={poly(outlineOf(shapes, g))} fill="none" stroke="var(--ed-sel)" strokeWidth={sw} strokeDasharray={`${4 * sw} ${3 * sw}`} pointerEvents="none" />);
  }
  const top = topSelIds(store.sel, shapes);
  const multi = top.length > 1;
  for (const s of sel) {
    if (isLineShape(s)) {
      const [a, b] = lineEnds(s);
      const P = parentMatrixOf(shapes, s.id);
      const A = apply(P, a), B = apply(P, b);
      nodes.push(<line key={`l${s.id}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--ed-sel)" strokeWidth={sw} strokeDasharray={`${3 * sw} ${3 * sw}`} pointerEvents="none" />);
      if (!multi && !s.locked && !dragging) {
        const conn = s.kind === 'shape' ? s.conn : undefined;
        nodes.push(<circle key={`e0${s.id}`} data-h="end0" data-id={s.id} cx={A.x} cy={A.y} r={handleR} className={`ed-h${conn?.start ? ' glued' : ''}`} strokeWidth={sw} />);
        nodes.push(<circle key={`e1${s.id}`} data-h="end1" data-id={s.id} cx={B.x} cy={B.y} r={handleR} className={`ed-h${conn?.end ? ' glued' : ''}`} strokeWidth={sw} />);
      }
    } else {
      const ed = editing?.shape === s.id;
      nodes.push(<polygon key={`o${s.id}`} points={poly(outlineOf(shapes, s))} fill="none" stroke="var(--ed-sel)" strokeWidth={(ed ? 1 : 1.25) * sw}
        strokeDasharray={ed ? `${5 * sw} ${3 * sw}` : undefined} pointerEvents="none" />);
    }
    if (s.locked && !dragging) {
      const c = outlineOf(shapes, s)[1]!;
      nodes.push(
        <g key={`lk${s.id}`} transform={`translate(${c.x + 4 * sw} ${c.y - 14 * sw}) scale(${sw})`} pointerEvents="none">
          <rect x={0} y={4} width={10} height={8} rx={1.5} fill="var(--ed-sel)" /><path d="M2.5 4V3a2.5 2.5 0 0 1 5 0v1" stroke="var(--ed-sel)" fill="none" strokeWidth={1.4} />
        </g>,
      );
    }
  }
  if (editing?.cell) {
    const t = findIn(shapes, editing.shape);
    if (t?.kind === 'table') {
      const { r, c } = editing.cell;
      const cell = t.rows[r]?.cells[c];
      const x = t.cols.slice(0, c).reduce((a, b) => a + b, 0), y = t.rows.slice(0, r).reduce((a, b) => a + b.h, 0);
      const w = t.cols.slice(c, c + (cell?.gridSpan ?? 1)).reduce((a, b) => a + b, 0), h = t.rows.slice(r, r + (cell?.rowSpan ?? 1)).reduce((a, b) => a + b.h, 0);
      const m = mul(mul(parentMatrixOf(shapes, t.id), frameMatrix(t)), [1, 0, 0, 1, x, y]);
      nodes.push(<polygon key="cell" points={poly(cornersOf(m, w, h))} fill="none" stroke="var(--ed-sel)" strokeWidth={2 * sw} pointerEvents="none" />);
    }
  }
  const handlesFor = top.map((id) => findIn(shapes, id)).filter((s): s is Shape => !!s && !s.locked);
  if (cropping) {
    const pic = findIn(shapes, cropping);
    if (pic?.kind === 'picture') nodes.push(<CropChrome key="crop" shapes={shapes} pic={pic} scale={scale} />);
  } else if (!dragging && handlesFor.length && !editing?.cell && !store.deck.final) {
    const one = handlesFor.length === 1 ? handlesFor[0]! : null;
    if (one && !isLineShape(one)) {
      const m = mul(parentMatrixOf(shapes, one.id), frameMatrix(one));
      nodes.push(<BoxHandles key="bh" m={m} w={one.w} h={one.h} scale={scale} handleR={handleR} small={one.w * scale < 26 || one.h * scale < 26} />);
      for (const ah of adjHandles(shapes, one)) {
        const r = handleR * 1.15;
        nodes.push(<path key={`a${ah.i}`} data-h={`adj${ah.i}`} data-id={one.id} className="ed-adj" strokeWidth={sw}
          d={`M${ah.pt.x} ${ah.pt.y - r}L${ah.pt.x + r} ${ah.pt.y}L${ah.pt.x} ${ah.pt.y + r}L${ah.pt.x - r} ${ah.pt.y}Z`} />);
      }
    } else if (!one) {
      const U = unionBox(handlesFor.map((s) => slideBoxOf(shapes, s)));
      nodes.push(<rect key="ub" x={U.x} y={U.y} width={U.w} height={U.h} fill="none" stroke="var(--ed-sel)" strokeWidth={sw} strokeDasharray={`${2 * sw} ${2 * sw}`} pointerEvents="none" />);
      nodes.push(<BoxHandles key="bh" m={[1, 0, 0, 1, U.x, U.y]} w={U.w} h={U.h} scale={scale} handleR={handleR} small={false} />);
    }
  }
  return <g className="ed-chrome">{nodes}</g>;
};

const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];
const BASE_ANGLE: Record<string, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
const cursorFor = (k: string, angle: number): string => CURSORS[Math.round(((((BASE_ANGLE[k] ?? 0) + angle) % 180) + 180) % 180 / 45) % 4]!;

const BoxHandles = ({ m, w, h, scale, handleR, small }: { m: Mat; w: number; h: number; scale: number; handleR: number; small: boolean }) => {
  const sw = 1 / scale;
  const top = apply(m, { x: w / 2, y: 0 });
  const len = Math.hypot(m[2], m[3]) || 1;
  const up = { x: -m[2] / len, y: -m[3] / len };
  const rotAt = { x: top.x + (up.x * 22) / scale, y: top.y + (up.y * 22) / scale };
  const angle = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  return (
    <g>
      <line x1={top.x} y1={top.y} x2={rotAt.x} y2={rotAt.y} stroke="var(--ed-sel)" strokeWidth={sw} pointerEvents="none" />
      <circle data-h="rot" cx={rotAt.x} cy={rotAt.y} r={handleR * 1.05} className="ed-h ed-rot" strokeWidth={sw} />
      {Object.entries(HANDLES).filter(([k]) => !small || k.length === 2).map(([k, hs]) => {
        const p = apply(m, { x: hs.fx * w, y: hs.fy * h });
        const r = isCorner(hs) ? handleR : handleR * 0.85;
        return isCorner(hs)
          ? <circle key={k} data-h={k} cx={p.x} cy={p.y} r={r} className="ed-h" strokeWidth={sw} style={{ cursor: cursorFor(k, angle) }} />
          : <rect key={k} data-h={k} x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} rx={r * 0.3} className="ed-h" strokeWidth={sw}
            style={{ cursor: cursorFor(k, angle) }} transform={`rotate(${angle} ${p.x} ${p.y})`} />;
      })}
    </g>
  );
};

const CropChrome = ({ shapes, pic, scale }: { shapes: Shape[]; pic: Picture; scale: number }) => {
  const sw = 1 / scale;
  const m = mul(parentMatrixOf(shapes, pic.id), frameMatrix(pic));
  const ib = imageBox(pic.w, pic.h, pic.crop ?? { l: 0, t: 0, r: 0, b: 0 });
  const ibx = pic.flipH ? pic.w - ib.x - ib.w : ib.x, iby = pic.flipV ? pic.h - ib.y - ib.h : ib.y;
  const imgPts = cornersOf(mul(m, [1, 0, 0, 1, ibx, iby]), ib.w, ib.h);
  const L = (coarse ? 16 : 11) / scale;
  const corner = (k: string, fx: number, fy: number) => {
    const p = apply(m, { x: fx * pic.w, y: fy * pic.h });
    const a = apply(m, { x: fx * pic.w + (fx === 0 ? L : -L), y: fy * pic.h }), b = apply(m, { x: fx * pic.w, y: fy * pic.h + (fy === 0 ? L : -L) });
    return <path key={k} data-h={`crop:${k}`} d={`M${a.x} ${a.y}L${p.x} ${p.y}L${b.x} ${b.y}`} className="ed-croph" strokeWidth={4 * sw} />;
  };
  const edge = (k: string, fx: number, fy: number) => {
    const horiz = fy !== 0.5;
    const a = apply(m, { x: fx * pic.w - (horiz ? L / 2 : 0), y: fy * pic.h - (horiz ? 0 : L / 2) });
    const b = apply(m, { x: fx * pic.w + (horiz ? L / 2 : 0), y: fy * pic.h + (horiz ? 0 : L / 2) });
    return <path key={k} data-h={`crop:${k}`} d={`M${a.x} ${a.y}L${b.x} ${b.y}`} className="ed-croph" strokeWidth={4 * sw} />;
  };
  return (
    <g>
      <polygon data-h="crop:pan" points={poly(imgPts)} fill="rgba(0,0,0,.3)" stroke="var(--ed-sel)" strokeWidth={sw} strokeDasharray={`${3 * sw} ${3 * sw}`} style={{ cursor: 'move' }} />
      <polygon points={poly(cornersOf(m, pic.w, pic.h))} fill="none" stroke="#fff" strokeWidth={1.5 * sw} pointerEvents="none" />
      {corner('nw', 0, 0)}{corner('ne', 1, 0)}{corner('se', 1, 1)}{corner('sw', 0, 1)}
      {edge('n', 0.5, 0)}{edge('s', 0.5, 1)}{edge('w', 0, 0.5)}{edge('e', 1, 0.5)}
    </g>
  );
};

// ---------- Hints while dragging ----------

const DragHints = ({ drag, scale }: { drag: Drag; scale: number }) => {
  const sw = 1 / scale;
  const tick = (axis: 'x' | 'y', v: number, at: number, k: string) => axis === 'x'
    ? <line key={k} x1={v} x2={v} y1={at - 4 * sw} y2={at + 4 * sw} strokeWidth={sw} />
    : <line key={k} y1={v} y2={v} x1={at - 4 * sw} x2={at + 4 * sw} strokeWidth={sw} />;
  return (
    <g pointerEvents="none">
      {drag.marquee && <rect x={drag.marquee.x} y={drag.marquee.y} width={drag.marquee.w} height={drag.marquee.h} className="ed-marquee" strokeWidth={sw} />}
      {drag.lines.map((l, i) => (l.axis === 'x'
        ? <line key={i} x1={l.at} x2={l.at} y1={l.from} y2={l.to} className={`ed-snap ${l.kind}`} strokeWidth={sw} />
        : <line key={i} y1={l.at} y2={l.at} x1={l.from} x2={l.to} className={`ed-snap ${l.kind}`} strokeWidth={sw} />))}
      {drag.spacing.map((h, i) => (
        <g key={`s${i}`} className="ed-space">
          {[h.a, h.b].map(([u, v], j) => (h.axis === 'x'
            ? <g key={j}><line x1={u} x2={v} y1={h.at} y2={h.at} strokeWidth={sw} />{tick('x', u, h.at, 'a')}{tick('x', v, h.at, 'b')}</g>
            : <g key={j}><line y1={u} y2={v} x1={h.at} x2={h.at} strokeWidth={sw} />{tick('y', u, h.at, 'a')}{tick('y', v, h.at, 'b')}</g>))}
        </g>
      ))}
      {drag.sites?.map((s, i) => <circle key={`c${i}`} cx={s.pt.x} cy={s.pt.y} r={(s.on ? 5 : 3.5) * sw} className={`ed-site${s.on ? ' on' : ''}`} strokeWidth={sw} />)}
    </g>
  );
};

const Grid = ({ w, h, step, scale }: { w: number; h: number; step: number; scale: number }) => {
  const st = Math.max(2, step);
  const k = Math.max(1, Math.ceil(6 / (st * scale)));
  const s2 = st * k;
  const id = `edgrid${Math.round(s2 * 100)}`;
  const r = 1.1 / scale;
  return (
    <g pointerEvents="none" className="ed-grid">
      <defs>
        <pattern id={id} width={s2} height={s2} patternUnits="userSpaceOnUse">
          <rect className="dot" x={s2 - r / 2} y={s2 - r / 2} width={r} height={r} />
        </pattern>
      </defs>
      <rect width={w} height={h} fill={`url(#${id})`} stroke="none" />
    </g>
  );
};

const Guides = ({ store, scale, drag }: { store: FrameStore; scale: number; drag: Drag | null }) => {
  const sw = 1 / scale;
  const gl = store.view.guideLines;
  const d = store.deck;
  const g = drag?.g.kind === 'guide' ? drag.g : null;
  const grab = (coarse ? 12 : 4) / scale;
  const line = (axis: 'x' | 'y', v: number, i: number, ghost = false) => (
    <g key={`${axis}${i}${ghost ? 'g' : ''}`}>
      {axis === 'x'
        ? <line x1={v} x2={v} y1={0} y2={d.h} className="ed-guide" strokeWidth={sw} strokeDasharray={`${4 * sw} ${3 * sw}`} pointerEvents="none" />
        : <line y1={v} y2={v} x1={0} x2={d.w} className="ed-guide" strokeWidth={sw} strokeDasharray={`${4 * sw} ${3 * sw}`} pointerEvents="none" />}
      {!ghost && (axis === 'x'
        ? <rect data-h="guide" data-axis="x" data-i={i} x={v - grab} y={0} width={grab * 2} height={d.h} fill="transparent" style={{ cursor: 'ew-resize' }} />
        : <rect data-h="guide" data-axis="y" data-i={i} y={v - grab} x={0} height={grab * 2} width={d.w} fill="transparent" style={{ cursor: 'ns-resize' }} />)}
    </g>
  );
  const at = drag?.guideAt;
  return (
    <g className="ed-guides">
      {gl.x.map((v, i) => (g && !g.fromRuler && g.axis === 'x' && g.index === i && at !== undefined ? line('x', at, i, true) : line('x', v, i)))}
      {gl.y.map((v, i) => (g && !g.fromRuler && g.axis === 'y' && g.index === i && at !== undefined ? line('y', at, i, true) : line('y', v, i)))}
      {g?.fromRuler && at !== undefined && line(g.axis, at, -1, true)}
    </g>
  );
};

// ---------- Rulers ----------

const Rulers = ({ store, scale, offX, offY, wrap, onDown }: {
  store: FrameStore; scale: number; offX: number; offY: number; wrap: React.RefObject<HTMLDivElement | null>; onDown: (a: 'x' | 'y') => (e: React.PointerEvent) => void;
}) => {
  const [sc, setSc] = useState({ x: 0, y: 0, w: 1000, h: 800 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const f = () => setSc({ x: el.scrollLeft, y: el.scrollTop, w: el.clientWidth, h: el.clientHeight });
    f();
    el.addEventListener('scroll', f, { passive: true });
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', f); ro.disconnect(); };
  }, [wrap]);
  const d = store.deck;
  const inch = 96 * scale;
  // Zero is the slide centre; labels count inches out from it.
  const ticks = (len: number, slideLen: number, off: number, scroll: number) => {
    const out: { pos: number; label?: string; major: boolean; half: boolean }[] = [];
    const zero = off + (slideLen * scale) / 2 - scroll;
    const sub = inch >= 60 ? 8 : inch >= 30 ? 4 : 2;
    const step = inch / sub;
    const from = Math.floor(-zero / step) - 1, to = Math.ceil((len - zero) / step) + 1;
    const every = inch < 24 ? 2 : 1;
    for (let i = from; i <= to; i++) {
      const major = i % sub === 0;
      const v = i / sub;
      out.push({ pos: zero + i * step, major, half: !major && i % (sub / 2) === 0, ...(major && v % every === 0 ? { label: String(Math.abs(v)) } : {}) });
    }
    return out;
  };
  const slideX = offX + RULER - sc.x, slideY = offY + RULER - sc.y;
  // Rulers sit outside the scroller, at the host's top and left edges.
  const ind = indentMarkers(store);
  return (
    <>
      <div className="ed-ruler h" style={{ top: 0, left: 0, width: sc.w + RULER }} onPointerDown={onDown('y')} title="Drag down to add a guide">
        <div className="ed-rspan" style={{ left: slideX, width: d.w * scale }} />
        {ticks(sc.w + RULER, d.w, offX + RULER, sc.x).map((t, i) => <span key={i} className={`t${t.major ? ' M' : t.half ? ' H' : ''}`} style={{ left: t.pos }}>{t.label !== undefined && <b>{t.label}</b>}</span>)}
        {ind && <>
          <i className="ed-ind first" title="First line indent" style={{ left: slideX + ind.first * scale }} />
          <i className="ed-ind hang" title="Left indent" style={{ left: slideX + ind.left * scale }} />
          <i className="ed-ind right" title="Right indent" style={{ left: slideX + ind.right * scale }} />
        </>}
      </div>
      <div className="ed-ruler v" style={{ top: 0, left: 0, height: sc.h + RULER }} onPointerDown={onDown('x')} title="Drag right to add a guide">
        <div className="ed-rspan" style={{ top: slideY, height: d.h * scale }} />
        {ticks(sc.h + RULER, d.h, offY + RULER, sc.y).map((t, i) => <span key={i} className={`t${t.major ? ' M' : t.half ? ' H' : ''}`} style={{ top: t.pos }}>{t.label !== undefined && <b>{t.label}</b>}</span>)}
      </div>
      <div className="ed-rcorner" />
    </>
  );
};

/** Indent markers for the paragraph being edited, in slide px from the slide's left edge (unrotated shapes). */
const indentMarkers = (store: FrameStore): { first: number; left: number; right: number } | null => {
  const e = store.editing;
  const ses = session();
  if (!e || !ses || e.cell) return null;
  const s = store.shape(e.shape);
  if (!s || s.kind !== 'shape' || s.rot) return null;
  const g = geometry(s.geom || 'rect', s.w, s.h, s.adj, s.path);
  const tr = g.text ?? { x: 0, y: 0, w: s.w, h: s.h };
  const ins = s.text?.inset ?? { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };
  const P = parentMatrixOf(store.shapes(), s.id);
  const origin = apply(P, { x: s.x + tr.x, y: s.y }).x;
  const k = Math.hypot(P[0], P[1]) || 1;
  const ps = effectivePara(s, ses.paras[ses.sel.start.p]?.style, renderCtx(store));
  const ml = ps.marginLeft ?? 0, ind = ps.indent ?? 0;
  return { first: origin + (ins.l + ml + ind) * k, left: origin + (ins.l + ml) * k, right: origin + (tr.w - ins.r) * k };
};

// ---------- Placeholder insert buttons ----------

const PlaceholderButtons = ({ store, scale }: { store: FrameStore; scale: number }) => {
  if (store.view.mode !== 'normal' || store.deck.final) return null;
  const list = store.shapes().filter((s) => s.kind === 'shape' && s.ph && PH_ICONS[s.ph.type] && isEmptyPh(s) && !s.hidden && store.editing?.shape !== s.id);
  if (!list.length) return null;
  const sz = coarse ? 40 : 30;
  return (
    <>
      {list.map((s) => {
        const icons = PH_ICONS[s.ph!.type]!;
        const cols = Math.min(3, icons.length);
        const rows = Math.ceil(icons.length / cols);
        const c = apply(shapeMatrix(s), { x: s.w / 2, y: s.h / 2 });
        const w = cols * (sz + 6), h = rows * (sz + 6);
        if (s.w * scale < w + 8 || s.h * scale < h + 36) return null;
        return (
          <div key={s.id} className="ed-phbtns" style={{ left: c.x * scale - w / 2, top: c.y * scale - h / 2 + (s.ph!.type === 'obj' ? 20 : 0), gridTemplateColumns: `repeat(${cols}, ${sz}px)` }}>
            {icons.map((ic) => (
              <button key={ic.cmd} type="button" title={ic.label} aria-label={ic.label} style={{ width: sz, height: sz }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); store.sel = [s.id]; store.editing = null; store.emit(); run(store, ic.cmd); }}>
                <ic.icon size={coarse ? 20 : 16} strokeWidth={S} />
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
};
