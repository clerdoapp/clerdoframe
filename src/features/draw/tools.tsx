import type { ToolHandler, ToolPoint } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { uid, type AutoShape, type Ink, type InkStroke, type Shape } from '../../model/deck';
import { hitStroke, inPolygon, recognize, strokeBounds, strokeOutline, type Pt } from './ink';
import { drawWithTouch, inkToShape, isInkTool, RULER_H, rulerOf, settingFor, type InkTool, type Session } from './state';
import { inkPaint } from './render';

/** Live gesture state (not part of the document). */
interface Live { tool: string; pts: Pt[]; lasso?: [number, number][]; erased?: number }
let live: Live | null = null;

const themeOf = (s: FrameStore) => (s.slide ? s.masterOf(s.slide).master : s.deck.masters[0]!).theme;

// ---------- Ruler snapping ----------

/** Projects a point onto the nearer ruler edge when it is close to it. */
const snapToRuler = (s: FrameStore, x: number, y: number): [number, number] | null => {
  const r = rulerOf(s);
  if (!r.on) return null;
  const a = (r.angle * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const dx = x - r.x, dy = y - r.y;
  const along = dx * ux + dy * uy, across = dx * nx + dy * ny;
  if (Math.abs(along) > r.len / 2 + 20) return null;
  const edge = across < 0 ? -RULER_H / 2 : RULER_H / 2;
  if (Math.abs(across - edge) > 22 || Math.abs(across) < RULER_H / 2 - 4) return null;
  return [r.x + ux * along + nx * edge, r.y + uy * along + ny * edge];
};

// ---------- Ink sessions ----------

/** Appends a stroke to this session's ink shape (or a new one) and refits the shape box. */
const addStroke = (s: FrameStore, stroke: InkStroke): void => {
  const session = s.ext.inkSession as Session | null | undefined;
  const shapes = s.shapes();
  const key = s.view.mode === 'master' ? `m${s.masterSel.master}:${s.masterSel.layout}` : 's';
  s.tryChange('Draw', () => {
    let ink = session && session.slide === s.cur && session.mode === key && session.shape ? s.shape(session.shape) : null;
    if (ink?.kind !== 'ink' || ink.rot || ink.flipH || ink.flipV) ink = null;
    const abs = ink ? toSlideStrokes(ink) : [];
    abs.push(stroke);
    const b = strokeBounds(abs)!;
    const local = abs.map((st) => ({ ...st, points: st.points.map(([x, y, p]): [number, number, number?] => [r2(x - b.x), r2(y - b.y), ...(p === undefined ? [] : [r2(p)])] as [number, number, number?]) }));
    if (ink) { Object.assign(ink, { x: b.x, y: b.y, w: b.w, h: b.h, strokes: local }); }
    else {
      const n: Ink = { id: uid('s'), kind: 'ink', name: 'Ink', x: b.x, y: b.y, w: b.w, h: b.h, strokes: local };
      shapes.push(n);
      ink = n;
    }
    s.ext.inkSession = { slide: s.cur, mode: key, shape: ink.id } satisfies Session;
  });
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Strokes of an ink shape in slide coordinates (scaled when the shape was resized). */
export const toSlideStrokes = (ink: Ink): InkStroke[] => {
  const b = strokeBounds(ink.strokes);
  const sx = b && b.w > 1 ? ink.w / b.w : 1, sy = b && b.h > 1 ? ink.h / b.h : 1;
  const ox = b?.x ?? 0, oy = b?.y ?? 0;
  return ink.strokes.map((st) => ({ ...st, points: st.points.map(([x, y, p]): [number, number, number?] => [ink.x + (x - ox) * sx, ink.y + (y - oy) * sy, ...(p === undefined ? [] : [p])] as [number, number, number?]) }));
};

// ---------- Ink to shape ----------

const autoFromRecognized = (stroke: InkStroke, r: NonNullable<ReturnType<typeof recognize>>): AutoShape => {
  const line = { fill: { type: 'solid' as const, color: stroke.color }, width: Math.max(0.75, stroke.width * 0.75) };
  if (r.kind === 'line') {
    return {
      id: uid('s'), kind: 'shape', name: r.arrow ? 'Arrow' : 'Line', geom: 'line', x: Math.min(r.x1, r.x2), y: Math.min(r.y1, r.y2), w: Math.max(0.01, Math.abs(r.x2 - r.x1)), h: Math.max(0.01, Math.abs(r.y2 - r.y1)),
      ...(r.x2 < r.x1 ? { flipH: true } : {}), ...(r.y2 < r.y1 ? { flipV: true } : {}), line: { ...line, cap: 'round', ...(r.arrow ? { tail: { type: 'triangle' } } : {}) },
    };
  }
  const geom = r.kind === 'rect' ? 'rect' : r.kind === 'ellipse' ? 'ellipse' : 'triangle';
  return { id: uid('s'), kind: 'shape', name: geom === 'rect' ? 'Rectangle' : geom === 'ellipse' ? 'Oval' : 'Triangle', geom, x: r.x, y: r.y, w: r.w, h: r.h, fill: { type: 'none' }, line };
};

/** On pen-up with "Ink to shape": swaps the stroke for a shape when it reads as one. Arrow heads drawn as a second stroke join the line before them. */
const tryInkToShape = (s: FrameStore, stroke: InkStroke): boolean => {
  const prev = s.ext.lastShapeFromInk as { id: string; at: number; x2: number; y2: number } | undefined;
  // A short hook near the end of the line drawn just before turns it into an arrow.
  if (prev && Date.now() - prev.at < 2500) {
    const near = stroke.points.some((p) => Math.hypot(p[0] - prev.x2, p[1] - prev.y2) < 24);
    const small = (strokeBounds([stroke])?.w ?? 99) < 70 && (strokeBounds([stroke])?.h ?? 99) < 70;
    const ln = s.shape(prev.id);
    if (near && small && ln?.kind === 'shape' && ln.geom === 'line' && ln.line) {
      s.tryChange('Ink to shape', () => { const x = s.shape(prev.id); if (x?.kind === 'shape' && x.line) x.line = { ...x.line, tail: { type: 'triangle' } }; });
      s.ext.lastShapeFromInk = undefined;
      return true;
    }
  }
  const r = recognize([stroke]);
  if (!r) return false;
  const shape = autoFromRecognized(stroke, r);
  s.tryChange('Ink to shape', () => { s.shapes().push(shape); });
  s.ext.lastShapeFromInk = r.kind === 'line' ? { id: shape.id, at: Date.now(), x2: r.x2, y2: r.y2 } : undefined;
  return true;
};

/** Converts the selected ink shapes' strokes into shapes where they are recognised. */
export const convertInkToShapes = (s: FrameStore): number => {
  let n = 0;
  s.tryChange('Convert ink to shape', () => {
    const sel = s.selected().filter((x): x is Ink => x.kind === 'ink');
    const newSel: string[] = [];
    for (const ink of sel) {
      const strokes = toSlideStrokes(ink);
      const keep: InkStroke[] = [];
      for (const st of strokes) {
        const r = recognize([st]);
        if (r) { const sh = autoFromRecognized(st, r); s.shapes().push(sh); newSel.push(sh.id); n++; } else keep.push(st);
      }
      const pl = s.parentList(ink.id);
      if (!pl) continue;
      if (!keep.length) pl.list.splice(pl.list.indexOf(ink), 1);
      else {
        const b = strokeBounds(keep)!;
        Object.assign(ink, { x: b.x, y: b.y, w: b.w, h: b.h, strokes: keep.map((st) => ({ ...st, points: st.points.map(([x, y, p]): [number, number, number?] => [x - b.x, y - b.y, ...(p === undefined ? [] : [p])] as [number, number, number?]) })) });
        newSel.push(ink.id);
      }
    }
    s.sel = newSel;
  });
  return n;
};

// ---------- Eraser ----------

const eraseAt = (s: FrameStore, x: number, y: number, tol: number): void => {
  const shapes = s.shapes();
  const hits: { ink: Ink; idx: number[] }[] = [];
  for (const sh of shapes) {
    if (sh.kind !== 'ink' || sh.locked || sh.hidden) continue;
    if (x < sh.x - tol - 20 || y < sh.y - tol - 20 || x > sh.x + sh.w + tol + 20 || y > sh.y + sh.h + tol + 20) continue;
    const abs = toSlideStrokes(sh);
    const idx = abs.flatMap((st, i) => (hitStroke(st, x, y, tol) ? [i] : []));
    if (idx.length) hits.push({ ink: sh, idx });
  }
  if (!hits.length) return;
  // The whole drag is one undo step: the first hit opens it, later hits fold in via a nested change.
  s.tryChange('Erase ink', () => {
    for (const h of hits) {
      const ink = s.shape(h.ink.id);
      if (ink?.kind !== 'ink') continue;
      const abs = toSlideStrokes(ink).filter((_, i) => !h.idx.includes(i));
      const pl = s.parentList(ink.id);
      if (!abs.length) { if (pl) pl.list.splice(pl.list.indexOf(ink), 1); continue; }
      const b = strokeBounds(abs)!;
      Object.assign(ink, { x: b.x, y: b.y, w: b.w, h: b.h, strokes: abs.map((st) => ({ ...st, points: st.points.map(([px, py, p]): [number, number, number?] => [px - b.x, py - b.y, ...(p === undefined ? [] : [p])] as [number, number, number?]) })) });
    }
  });
  if (live) live.erased = (live.erased ?? 0) + 1;
};

// ---------- Lasso ----------

const shapeInLasso = (sh: Shape, poly: [number, number][]): boolean => {
  if (sh.kind === 'ink') {
    const pts = toSlideStrokes(sh).flatMap((st) => st.points);
    const inside = pts.filter((p) => inPolygon(p[0], p[1], poly)).length;
    return pts.length > 0 && inside / pts.length > 0.6;
  }
  const corners: [number, number][] = [[sh.x, sh.y], [sh.x + sh.w, sh.y], [sh.x, sh.y + sh.h], [sh.x + sh.w, sh.y + sh.h], [sh.x + sh.w / 2, sh.y + sh.h / 2]];
  return corners.every(([x, y]) => inPolygon(x, y, poly));
};

// ---------- Tools ----------

const accepts = (s: FrameStore, pointerType: string): boolean => pointerType !== 'touch' || drawWithTouch(s);

const inkHandler = (tool: InkTool): ToolHandler => ({
  id: `draw.${tool}`,
  match: (t) => t === tool,
  cursor: 'crosshair',
  accepts,
  down: (s, p) => {
    if (p.pointerType && !accepts(s, p.pointerType)) return;
    const snap = snapToRuler(s, p.x, p.y);
    live = { tool, pts: [[...(snap ?? [p.x, p.y]), pressureOf(p)] as Pt] };
    s.emit();
  },
  move: (s, p) => {
    if (!live || live.tool !== tool) return;
    const snap = snapToRuler(s, p.x, p.y);
    live.pts.push([...(snap ?? [p.x, p.y]), pressureOf(p)] as Pt);
    s.emit();
  },
  up: (s, p) => {
    if (!live || live.tool !== tool) return;
    const g = live;
    live = null;
    if (g.pts.length === 1) g.pts.push([p.x + 0.01, p.y, pressureOf(p)]);
    const st = settingFor(s, tool);
    const stroke: InkStroke = { points: g.pts.map(([x, y, pr]) => [r2(x), r2(y), ...(pr === undefined ? [] : [r2(pr)])] as [number, number, number?]), color: st.color, width: st.width, tool };
    if (tool !== 'highlighter' && inkToShape(s) && tryInkToShape(s, stroke)) { s.emit(); return; }
    addStroke(s, stroke);
  },
  preview: (s) => {
    if (!live || !isInkTool(live.tool)) return null;
    const st = settingFor(s, live.tool);
    const stroke: InkStroke = { points: live.pts as InkStroke['points'], color: st.color, width: st.width, tool: live.tool };
    const pp = inkPaint(stroke, { theme: themeOf(s) });
    return <path d={strokeOutline(stroke)} {...pp} style={{ pointerEvents: 'none' }} />;
  },
});

/** Pressure from the pen, or a steady middle value for mouse and touch (which report 0 or 0.5). */
const pressureOf = (p: ToolPoint): number => (p.pointerType === 'pen' && p.pressure > 0 ? p.pressure : 0.5);

const eraser: ToolHandler = {
  id: 'draw.eraser',
  match: (t) => t === 'eraser',
  cursor: 'cell',
  accepts,
  down: (s, p) => { if (p.pointerType && !accepts(s, p.pointerType)) return; live = { tool: 'eraser', pts: [[p.x, p.y]] }; eraseAt(s, p.x, p.y, 8); s.emit(); },
  move: (s, p) => {
    if (live?.tool !== 'eraser') return;
    const last = live.pts.at(-1)!;
    const d = Math.hypot(p.x - last[0], p.y - last[1]);
    const steps = Math.max(1, Math.ceil(d / 6));
    for (let k = 1; k <= steps; k++) eraseAt(s, last[0] + ((p.x - last[0]) * k) / steps, last[1] + ((p.y - last[1]) * k) / steps, 8);
    live.pts.push([p.x, p.y]);
    s.emit();
  },
  up: (s) => { live = null; s.emit(); },
  preview: () => {
    const p = live?.tool === 'eraser' ? live.pts.at(-1) : undefined;
    return p ? <circle cx={p[0]} cy={p[1]} r={9} fill="rgba(255,255,255,0.6)" stroke="#888" strokeWidth={1} style={{ pointerEvents: 'none' }} /> : null;
  },
};

const lasso: ToolHandler = {
  id: 'draw.lasso',
  match: (t) => t === 'lasso',
  cursor: 'crosshair',
  down: (s, p) => { live = { tool: 'lasso', pts: [], lasso: [[p.x, p.y]] }; s.select([]); },
  move: (s, p) => { if (live?.lasso) { live.lasso.push([p.x, p.y]); s.emit(); } },
  up: (s) => {
    const poly = live?.lasso;
    live = null;
    if (!poly || poly.length < 3) { s.emit(); return; }
    const ids = s.shapes().filter((sh) => !sh.hidden && !sh.locked && shapeInLasso(sh, poly)).map((sh) => sh.id);
    s.select(ids);
  },
  preview: () => {
    const poly = live?.lasso;
    if (!poly || poly.length < 2) return null;
    return <polygon points={poly.map((q) => q.join(',')).join(' ')} fill="rgba(44,123,229,0.08)" stroke="#2C7BE5" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />;
  },
};

export const drawToolHandlers = (): ToolHandler[] => [inkHandler('pen'), inkHandler('pencil'), inkHandler('highlighter'), eraser, lasso];

/** Whether a drawing gesture is in progress (for overlays). */
export const drawing = (): boolean => !!live;

