/**
 * Curve tool: tap to place points and the line runs smoothly through them. Double-tap or Enter
 * finishes an open curve; tapping the first point again closes it into a filled shape.
 */
import { registerTool, type ToolHandler, type ToolPoint } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { uid, walkShapes, type AutoShape } from '../../model/deck';
import { applyModels, serialize, smoothThrough, type XY } from './pathEdit';

export const CURVE_TOOL = 'curve';

interface Curve { pts: XY[]; hover: XY | null; dragging: boolean; lastDown: number }
let cur: Curve | null = null;
let bound: FrameStore | null = null;

const nameFor = (store: FrameStore, base: string): string => {
  const names = new Set<string>();
  walkShapes(store.shapes(), (s) => { names.add(s.name); });
  let n = 1;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
};

/** A custom-geometry shape through the points (slide px); closed curves get the theme fill. */
export const curveShape = (store: FrameStore, pts: XY[], closed: boolean): AutoShape | null => {
  if (pts.length < 2) return null;
  const s: AutoShape = {
    id: uid('s'), kind: 'shape', geom: 'custom', name: nameFor(store, closed ? 'Freeform' : 'Curve'), x: 0, y: 0, w: 1, h: 1,
    ...(closed
      ? { fill: { type: 'solid', color: { theme: 'accent1' } }, line: { fill: { type: 'solid', color: { theme: 'accent1', lum: -0.25 } }, width: 1 }, text: { paras: [{ runs: [], style: { align: 'ctr', defRun: { color: { theme: 'lt1' } } } }], vAlign: 'ctr', wrap: true } }
      : { fill: { type: 'none' }, line: { fill: { type: 'solid', color: { theme: 'accent1' } }, width: 1.5, cap: 'round', join: 'round' } }),
  };
  applyModels(s, [[smoothThrough(pts, closed)]]);
  return s;
};

const finish = (store: FrameStore, closed: boolean): void => {
  const c = cur;
  cur = null;
  if (c) {
    const pts = c.pts.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1]![0], p[1] - a[i - 1]![1]) > 0.5);
    const s = curveShape(store, pts, closed && pts.length > 2);
    if (s) store.tryChange(closed ? 'Insert freeform' : 'Insert curve', () => { store.shapes().push(s); store.sel = [s.id]; store.editing = null; });
  }
  if (!store.ext.toolLocked) store.tool = null;
  store.emit();
};

export const finishCurve = (store: FrameStore, keep: boolean): void => {
  if (!cur) return;
  if (keep) finish(store, false); else { cur = null; store.emit(); }
};

const tol = (p: ToolPoint, scale = 1) => (p.pointerType === 'touch' ? 14 : 8) / scale;

const curveTool: ToolHandler = {
  id: 'gobjects.curve',
  match: (t) => t === CURVE_TOOL,
  cursor: 'crosshair',
  down: (store, p) => {
    bound = store;
    installKeys();
    const now = p.time ?? Date.now();
    if (!cur) { cur = { pts: [[p.x, p.y]], hover: null, dragging: true, lastDown: now }; store.emit(); return; }
    const dbl = now - cur.lastDown < 380;
    cur.lastDown = now;
    const first = cur.pts[0]!, last = cur.pts[cur.pts.length - 1]!;
    if (cur.pts.length > 2 && Math.hypot(p.x - first[0], p.y - first[1]) < tol(p)) { finish(store, true); return; }
    if (dbl && Math.hypot(p.x - last[0], p.y - last[1]) < tol(p) * 2) { finish(store, false); return; }
    cur.pts.push([p.x, p.y]);
    cur.dragging = true;
    store.emit();
  },
  move: (store, p) => {
    if (!cur) return;
    if (cur.dragging) cur.pts[cur.pts.length - 1] = [p.x, p.y];
    else cur.hover = [p.x, p.y];
    store.emit();
  },
  up: (store) => { if (cur) { cur.dragging = false; store.emit(); } },
  preview: (store) => {
    if (!cur || store.tool !== CURVE_TOOL) return null;
    const pts = cur.hover && !cur.dragging ? [...cur.pts, cur.hover] : cur.pts;
    const d = pts.length > 1 ? serialize([smoothThrough(pts, false)]) : '';
    const [sx, sy] = cur.pts[0]!;
    return (
      <g pointerEvents="none">
        {d && <path d={d} fill="none" stroke="#fd4e0d" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
        {cur.pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 0 ? 5 : 3} fill="#fff" stroke="#fd4e0d" vectorEffect="non-scaling-stroke" />)}
        <circle cx={sx} cy={sy} r={5} fill="none" stroke="#fd4e0d" vectorEffect="non-scaling-stroke" />
      </g>
    );
  },
};

let keysOn = false;
const installKeys = (): void => {
  if (keysOn || typeof window === 'undefined') return;
  keysOn = true;
  window.addEventListener('keydown', (e) => {
    const store = bound;
    if (!store || store.tool !== CURVE_TOOL || !cur) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); finish(store, false); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cur = null; store.tool = null; store.emit(); }
  }, true);
};

export const registerCurve = (): void => { registerTool(curveTool); };
