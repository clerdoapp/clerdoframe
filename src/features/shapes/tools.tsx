import type { ReactNode } from 'react';
import { registerTool, type ToolHandler } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { uid, type AutoShape, type Shape } from '../../model/deck';
import { geometry, isLineGeom, preset } from '../../render/geometry';
import { labelOf } from './presets';

/** One inch in slide px: the size of a shape inserted with a single click. */
export const INCH = 96;
const CLICK = 4;


const nextName = (store: FrameStore, base: string): string => {
  let n = 1;
  const names = new Set<string>();
  const walk = (list: Shape[]) => { for (const s of list) { names.add(s.name); if (s.kind === 'group') walk(s.children); } };
  walk(store.shapes());
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
};

/** A new auto shape with theme styling: accent fill, darker accent outline, white centred text. */
export const newAutoShape = (store: FrameStore, geom: string, x: number, y: number, w: number, h: number): AutoShape => {
  const line = isLineGeom(geom);
  const base: AutoShape = {
    id: uid('s'), kind: 'shape', geom, name: nextName(store, line ? (geom.includes('Connector') ? 'Connector' : 'Line') : labelOf(geom)), x, y, w, h,
    line: { fill: { type: 'solid', color: line ? { theme: 'accent1' } : { theme: 'accent1', lum: -0.25 } }, width: line ? 1.5 : 1 },
  };
  if (line) {
    if (geom === 'straightConnector1' || /^(bent|curved)Connector/.test(geom)) base.line!.tail = { type: 'triangle' };
    return base;
  }
  return {
    ...base,
    fill: { type: 'solid', color: { theme: 'accent1' } },
    text: { paras: [{ runs: [], style: { align: 'ctr', defRun: { color: { theme: 'lt1' } } } }], vAlign: 'ctr', wrap: true },
  };
};

/** A text box: no fill, no line, grows with its text. */
export const newTextBox = (store: FrameStore, x: number, y: number, w: number, h: number, text = ''): AutoShape => ({
  id: uid('s'), kind: 'shape', geom: 'rect', name: nextName(store, 'TextBox'), x, y, w, h, textbox: true,
  fill: { type: 'none' }, line: { fill: { type: 'none' }, width: 0 },
  text: { paras: [{ runs: text ? [{ text }] : [] }], wrap: true, autofit: 'resize', vAlign: 't', inset: { l: 9.6, t: 4.8, r: 9.6, b: 4.8 } },
});

/** Adds a shape to the current surface (slide, layout or master) as one undo step and selects it. */
export const addShape = (store: FrameStore, label: string, shape: Shape): boolean =>
  store.tryChange(label, () => { store.shapes().push(shape); store.sel = [shape.id]; store.editing = null; });

const finishTool = (store: FrameStore): void => {
  if (!store.ext.toolLocked) store.tool = null;
  store.emit();
};

// ---------- Shapes and lines ----------

interface Drag { x0: number; y0: number; x1: number; y1: number; shift: boolean }
let drag: Drag | null = null;

const snapLine = (d: Drag): { x: number; y: number } => {
  const dx = d.x1 - d.x0, dy = d.y1 - d.y0;
  if (!d.shift) return { x: d.x1, y: d.y1 };
  const len = Math.hypot(dx, dy);
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
  return { x: d.x0 + len * Math.cos(a), y: d.y0 + len * Math.sin(a) };
};

/** Box (and flips, for lines) from a drag. */
export const dragBox = (geom: string, d: Drag): { x: number; y: number; w: number; h: number; flipH?: boolean; flipV?: boolean } => {
  if (isLineGeom(geom)) {
    const e = snapLine(d);
    return { x: Math.min(d.x0, e.x), y: Math.min(d.y0, e.y), w: Math.abs(e.x - d.x0), h: Math.abs(e.y - d.y0), ...(e.x < d.x0 ? { flipH: true } : {}), ...(e.y < d.y0 ? { flipV: true } : {}) };
  }
  let w = d.x1 - d.x0, h = d.y1 - d.y0;
  if (d.shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
  return { x: Math.min(d.x0, d.x0 + w), y: Math.min(d.y0, d.y0 + h), w: Math.abs(w), h: Math.abs(h) };
};

const geomOf = (store: FrameStore): string => {
  const t = store.tool ?? '';
  if (t === 'line') return 'line';
  if (t === 'arrow') return 'straightConnector1';
  return t.startsWith('shape:') ? t.slice(6) : 'rect';
};

const shapeTool: ToolHandler = {
  id: 'shapes.shape',
  match: (t) => t.startsWith('shape:') || t === 'line' || t === 'arrow',
  cursor: 'crosshair',
  down: (_s, p) => { drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: p.shift }; },
  move: (s, p) => { if (!drag) return; drag.x1 = p.x; drag.y1 = p.y; drag.shift = p.shift; s.emit(); },
  up: (s, p) => {
    if (!drag) return;
    drag.x1 = p.x; drag.y1 = p.y; drag.shift = p.shift;
    const d = drag;
    drag = null;
    const geom = geomOf(s);
    if (!preset(geom)) { finishTool(s); return; }
    const click = Math.abs(d.x1 - d.x0) < CLICK && Math.abs(d.y1 - d.y0) < CLICK;
    const line = isLineGeom(geom);
    const b = click ? { x: d.x0 - (line ? 0 : INCH / 2), y: d.y0 - (line ? 0 : INCH / 2), w: INCH, h: line ? 0 : INCH } : dragBox(geom, d);
    const shape = { ...newAutoShape(s, geom, b.x, b.y, Math.max(line ? 0 : 1, b.w), Math.max(line ? 0 : 1, b.h)), ...('flipH' in b && b.flipH ? { flipH: true } : {}), ...('flipV' in b && b.flipV ? { flipV: true } : {}) };
    addShape(s, `Insert ${labelOf(geom).toLowerCase()}`, shape);
    finishTool(s);
  },
  preview: (s) => {
    if (!drag) return null;
    const geom = geomOf(s);
    const b = dragBox(geom, drag);
    const g = geometry(geom, Math.max(b.w, 0.5), Math.max(b.h, 0.5));
    const t = `translate(${b.x} ${b.y})${b.flipH || b.flipV ? ` translate(${b.flipH ? b.w : 0} ${b.flipV ? b.h : 0}) scale(${b.flipH ? -1 : 1} ${b.flipV ? -1 : 1})` : ''}`;
    return (
      <g transform={t} pointerEvents="none">
        {g.paths.map((p, i) => <path key={i} d={p.d} fill={isLineGeom(geom) || p.fill === 'none' ? 'none' : 'rgba(253,78,13,.12)'} stroke="#fd4e0d" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)}
      </g>
    );
  },
};

// ---------- Text box ----------

const textTool: ToolHandler = {
  id: 'shapes.textbox',
  match: (t) => t === 'text' || t === 'textbox',
  cursor: 'text',
  down: (_s, p) => { drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: false }; },
  move: (s, p) => { if (!drag) return; drag.x1 = p.x; drag.y1 = p.y; s.emit(); },
  up: (s, p) => {
    if (!drag) return;
    drag.x1 = p.x; drag.y1 = p.y;
    const d = drag;
    drag = null;
    const click = Math.abs(d.x1 - d.x0) < CLICK && Math.abs(d.y1 - d.y0) < CLICK;
    const w = click ? 3 * INCH : Math.max(24, Math.abs(d.x1 - d.x0));
    const h = click ? 40 : Math.max(24, Math.abs(d.y1 - d.y0));
    const tb = newTextBox(s, click ? d.x0 : Math.min(d.x0, d.x1), click ? d.y0 - 20 : Math.min(d.y0, d.y1), w, h);
    if (addShape(s, 'Insert text box', tb)) s.editing = { shape: tb.id };
    finishTool(s);
  },
  preview: () => {
    if (!drag) return null;
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    return <rect x={x} y={y} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)} fill="none" stroke="#fd4e0d" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />;
  },
};

// ---------- Freeform and scribble ----------

interface Free { pts: [number, number][]; dragging: boolean; downAt: number; hover?: [number, number] }
let free: Free | null = null;
let lastClick = 0;

/** Simplifies a polyline (Ramer-Douglas-Peucker) so scribbles stay small. */
export const simplify = (pts: [number, number][], tol = 1.2): [number, number][] => {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0]!, pts[pts.length - 1]!];
  let max = 0, idx = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d = Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
};

/** Smooth path through points using Catmull-Rom converted to cubic Béziers. */
export const smoothPath = (pts: [number, number][], closed: boolean): string => {
  const f = (n: number) => Math.round(n * 100) / 100;
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('') + (closed ? 'Z' : '');
  let d = `M${f(pts[0]![0])} ${f(pts[0]![1])}`;
  const n = pts.length;
  const at = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]!;
  const end = closed ? n : n - 1;
  for (let i = 0; i < end; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
};

/** Turns points (slide px) into a custom-geometry shape, normalised to its bounding box. */
export const customShape = (store: FrameStore, pts: [number, number][], opts: { closed: boolean; smooth: boolean; name: string }): AutoShape | null => {
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - x), h = Math.max(1, Math.max(...ys) - y);
  const local = pts.map(([px, py]) => [px - x, py - y] as [number, number]);
  const d = opts.smooth ? smoothPath(local, opts.closed) : local.map(([px, py], i) => `${i ? 'L' : 'M'}${Math.round(px * 100) / 100} ${Math.round(py * 100) / 100}`).join('') + (opts.closed ? 'Z' : '');
  const s = newAutoShape(store, 'rect', x, y, w, h);
  s.geom = 'custom';
  s.path = [{ d, w, h }];
  s.name = nextName(store, opts.name);
  if (!opts.closed) {
    delete s.fill;
    delete s.text;
    s.fill = { type: 'none' };
    s.line = { fill: { type: 'solid', color: { theme: 'accent1' } }, width: 1.5, cap: 'round', join: 'round' };
  }
  return s;
};

const finishFree = (s: FrameStore, closed: boolean): void => {
  const f = free;
  free = null;
  if (f && f.pts.length >= 2) {
    const shape = customShape(s, f.pts, { closed, smooth: false, name: 'Freeform' });
    if (shape) addShape(s, 'Insert freeform', shape);
  }
  finishTool(s);
};

const freeformTool: ToolHandler = {
  id: 'shapes.freeform',
  match: (t) => t === 'freeform',
  cursor: 'crosshair',
  down: (s, p) => {
    const now = Date.now();
    const dbl = now - lastClick < 350;
    lastClick = now;
    if (!free) { free = { pts: [[p.x, p.y]], dragging: true, downAt: now }; s.emit(); return; }
    const [sx, sy] = free.pts[0]!;
    const near = Math.hypot(p.x - sx, p.y - sy) < 8 && free.pts.length > 2;
    if (near) { finishFree(s, true); return; }
    if (dbl) { finishFree(s, false); return; }
    free.pts.push([p.x, p.y]);
    free.dragging = true;
    s.emit();
  },
  move: (s, p) => {
    if (!free) return;
    if (free.dragging) {
      const last = free.pts[free.pts.length - 1]!;
      if (Math.hypot(p.x - last[0], p.y - last[1]) > 2) free.pts.push([p.x, p.y]);
    } else free.hover = [p.x, p.y];
    s.emit();
  },
  up: (s) => { if (free) { free.dragging = false; s.emit(); } },
  preview: () => {
    if (!free) return null;
    const pts = free.hover && !free.dragging ? [...free.pts, free.hover] : free.pts;
    const [sx, sy] = free.pts[0]!;
    return (
      <g pointerEvents="none">
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#fd4e0d" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <circle cx={sx} cy={sy} r={5} fill="#fff" stroke="#fd4e0d" vectorEffect="non-scaling-stroke" />
      </g>
    );
  },
};

let scribble: [number, number][] | null = null;

const scribbleTool: ToolHandler = {
  id: 'shapes.scribble',
  match: (t) => t === 'scribble',
  cursor: 'crosshair',
  down: (_s, p) => { scribble = [[p.x, p.y]]; },
  move: (s, p) => { if (!scribble) return; scribble.push([p.x, p.y]); s.emit(); },
  up: (s) => {
    const pts = scribble;
    scribble = null;
    if (pts && pts.length > 2) {
      const first = pts[0]!, last = pts[pts.length - 1]!;
      const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 10 && pts.length > 10;
      const shape = customShape(s, simplify(pts, 1.5), { closed, smooth: true, name: 'Freeform' });
      if (shape) addShape(s, 'Insert scribble', shape);
    }
    finishTool(s);
  },
  preview: () => scribble && <polyline points={scribble.map((p) => p.join(',')).join(' ')} fill="none" stroke="#fd4e0d" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />,
};

/** Ends an unfinished freeform (Enter / Escape / tool change). */
export const cancelFreeform = (store: FrameStore, keep: boolean): void => { if (free) { if (keep) finishFree(store, false); else { free = null; store.emit(); } } };

export const setTool = (store: FrameStore, tool: string | null, locked = false): void => {
  if (free) cancelFreeform(store, true);
  store.tool = tool;
  store.ext.toolLocked = locked && !!tool;
  store.editing = null;
  store.emit();
};

export const toolPreview = (store: FrameStore): ReactNode => [shapeTool, textTool, freeformTool, scribbleTool].find((t) => store.tool && t.match(store.tool))?.preview?.(store) ?? null;

export const registerShapeTools = (): void => {
  registerTool(shapeTool);
  registerTool(textTool);
  registerTool(freeformTool);
  registerTool(scribbleTool);
};
