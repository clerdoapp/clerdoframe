/**
 * Edit points: shows the anchors and Bézier handles of a custom-geometry shape on the canvas and
 * lets them be dragged (one undo step per drag). Double-tap a segment to add a point, double-tap an
 * anchor (or right-click it) to switch smooth / corner, Delete removes the selected point.
 */
import type { ReactNode } from 'react';
import { registerCanvasLayer, registerTool, type ToolHandler, type ToolPoint } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { AutoShape, Group, Id, Shape } from '../../model/deck';
import {
  applyModels, deletePoint, insertPoint, localToParent, modelsOf, moveAnchor, moveHandle, nearestSegment, parentToLocal, serialize, setSmooth, toCustom,
  type PathModel, type PNode, type XY,
} from './pathEdit';

export const POINTS_TOOL = 'editPoints';
const ACCENT = '#fd4e0d';

interface Sel { path: number; sub: number; node: number }
interface Drag { kind: 'anchor' | 'in' | 'out'; at: Sel; orig: AutoShape; base: PathModel[]; moved: boolean; latest: PathModel[] }
interface State { id: Id; sel: Sel | null; scale: number; drag: Drag | null; lastDown: { t: number; p: XY } | null }

let st: State | null = null;
let boundStore: FrameStore | null = null;

// ---------- Coordinates (groups included) ----------

const chainOf = (list: Shape[], id: Id, acc: Group[] = []): { shape: Shape; groups: Group[] } | null => {
  for (const s of list) {
    if (s.id === id) return { shape: s, groups: acc };
    if (s.kind === 'group') { const r = chainOf(s.children, id, [...acc, s]); if (r) return r; }
  }
  return null;
};

const childToGroup = (g: Group, p: XY): XY => {
  const cb = g.childBox ?? { x: 0, y: 0, w: g.w, h: g.h };
  return [((p[0] - cb.x) * g.w) / (cb.w || 1), ((p[1] - cb.y) * g.h) / (cb.h || 1)];
};
const groupToChild = (g: Group, p: XY): XY => {
  const cb = g.childBox ?? { x: 0, y: 0, w: g.w, h: g.h };
  return [cb.x + (p[0] * (cb.w || 1)) / (g.w || 1), cb.y + (p[1] * (cb.h || 1)) / (g.h || 1)];
};

const toSlide = (s: AutoShape, groups: Group[], p: XY): XY => {
  let q = localToParent(s, p);
  for (let i = groups.length - 1; i >= 0; i--) q = localToParent(groups[i]!, childToGroup(groups[i]!, q));
  return q;
};
const toLocal = (s: AutoShape, groups: Group[], p: XY): XY => {
  let q = p;
  for (const g of groups) q = groupToChild(g, parentToLocal(g, q));
  return parentToLocal(s, q);
};

const target = (store: FrameStore): { shape: AutoShape; groups: Group[] } | null => {
  if (!st) return null;
  const c = chainOf(store.shapes(), st.id);
  return c && c.shape.kind === 'shape' && c.shape.geom === 'custom' && c.shape.path?.length ? { shape: c.shape, groups: c.groups } : null;
};

// ---------- Entering and leaving ----------

export const editPointsTarget = (store: FrameStore): AutoShape | null => {
  const s = store.one();
  return s?.kind === 'shape' && !s.locked && !(s.ph && s.text && !s.path) ? s : null;
};

export const startEditPoints = (store: FrameStore): void => {
  const s = editPointsTarget(store);
  if (!s) return;
  if (s.geom !== 'custom' || !s.path?.length) {
    if (!store.tryChange('Edit points', () => { const x = store.shape(s.id); if (x?.kind === 'shape' && !toCustom(x)) throw new Error('This shape has no points to edit.'); })) return;
  }
  boundStore = store;
  installKeys();
  st = { id: s.id, sel: null, scale: st?.scale ?? 1, drag: null, lastDown: null };
  store.editing = null;
  store.sel = [];
  store.tool = POINTS_TOOL;
  store.ext.toolLocked = true;
  store.emit();
};

export const stopEditPoints = (store: FrameStore): void => {
  const id = st?.id;
  st = null;
  if (store.tool === POINTS_TOOL) store.tool = null;
  store.ext.toolLocked = false;
  if (id && store.shape(id)) store.sel = [id];
  store.emit();
};

export const editingPoints = (store: FrameStore): boolean => store.tool === POINTS_TOOL && !!st;

// ---------- Edits ----------

const nodeAt = (m: PathModel[], s: Sel): PNode | undefined => m[s.path]?.[s.sub]?.nodes[s.node];

const commit = (store: FrameStore, label: string, fn: (m: PathModel[]) => boolean | void): void => {
  const t = target(store);
  if (!t) return;
  const models = modelsOf(t.shape);
  if (fn(models) === false) return;
  store.tryChange(label, () => { const x = store.shape(t.shape.id); if (x?.kind === 'shape') applyModels(x, models); });
};

export const pointAction = (store: FrameStore, what: 'smooth' | 'corner' | 'delete' | 'toggle'): void => {
  const sel = st?.sel;
  if (!sel) { store.notify('Tap a point first.'); return; }
  if (what === 'delete') {
    commit(store, 'Delete point', (m) => {
      const sp = m[sel.path]?.[sel.sub];
      if (!sp || !deletePoint(sp, sel.node)) { store.notify('A path needs at least two points.'); return false; }
      if (st) st.sel = null;
    });
    return;
  }
  commit(store, what === 'corner' ? 'Corner point' : 'Smooth point', (m) => {
    const sp = m[sel.path]?.[sel.sub];
    const n = sp?.nodes[sel.node];
    if (!sp || !n) return false;
    const smooth = what === 'toggle' ? !(n.smooth || n.in || n.out) : what === 'smooth';
    setSmooth(sp, sel.node, smooth);
  });
};

// ---------- Hit testing ----------

type Hit = { kind: 'anchor' | 'in' | 'out'; at: Sel } | { kind: 'segment'; path: number; sub: number; seg: number; t: number } | null;

const hitTest = (models: PathModel[], p: XY, tol: number, sel: Sel | null): Hit => {
  const d = (q: XY) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (sel) {
    const n = nodeAt(models, sel);
    if (n?.out && d(n.out) <= tol) return { kind: 'out', at: sel };
    if (n?.in && d(n.in) <= tol) return { kind: 'in', at: sel };
  }
  let best: { at: Sel; dist: number } | null = null;
  models.forEach((m, pi) => m.forEach((sp, si) => sp.nodes.forEach((n, ni) => {
    const dd = d([n.x, n.y]);
    if (dd <= tol && (!best || dd < best.dist)) best = { at: { path: pi, sub: si, node: ni }, dist: dd };
  })));
  if (best) return { kind: 'anchor', at: (best as { at: Sel }).at };
  let seg: Hit = null, segD = Infinity;
  models.forEach((m, pi) => {
    const h = nearestSegment(m, p);
    if (h && h.dist <= tol && h.dist < segD) { segD = h.dist; seg = { kind: 'segment', path: pi, sub: h.sub, seg: h.seg, t: h.t }; }
  });
  return seg;
};

// ---------- The tool ----------

const restore = (s: AutoShape, o: AutoShape) => {
  s.x = o.x; s.y = o.y; s.w = o.w; s.h = o.h; s.geom = o.geom;
  s.path = o.path ? structuredClone(o.path) : undefined;
  if (o.adj) s.adj = { ...o.adj }; else delete s.adj;
};

const tolFor = (p: ToolPoint) => ((p.pointerType === 'touch' ? 16 : p.pointerType === 'pen' ? 10 : 7) / (st?.scale || 1));

const pointsTool: ToolHandler = {
  id: 'gobjects.points',
  match: (t) => t === POINTS_TOOL,
  cursor: 'default',
  down: (store, p) => {
    boundStore = store;
    const t = target(store);
    if (!st || !t) { stopEditPoints(store); return; }
    const local = toLocal(t.shape, t.groups, [p.x, p.y]);
    const models = modelsOf(t.shape);
    const tol = tolFor(p);
    const now = p.time ?? Date.now();
    const dbl = !!st.lastDown && now - st.lastDown.t < 420 && Math.hypot(st.lastDown.p[0] - p.x, st.lastDown.p[1] - p.y) < tol * 2;
    st.lastDown = { t: now, p: [p.x, p.y] };
    const hit = hitTest(models, local, tol, st.sel);
    if (!hit) {
      const inBox = local[0] >= -tol && local[1] >= -tol && local[0] <= t.shape.w + tol && local[1] <= t.shape.h + tol;
      if (inBox) { st.sel = null; store.emit(); } else stopEditPoints(store);
      return;
    }
    if (hit.kind === 'segment') {
      if (dbl) {
        commit(store, 'Add point', (m) => {
          const sp = m[hit.path]?.[hit.sub];
          if (!sp) return false;
          const at = insertPoint(sp, hit.seg, hit.t);
          if (st) st.sel = { path: hit.path, sub: hit.sub, node: at };
        });
      } else { st.sel = null; store.emit(); }
      return;
    }
    if (hit.kind === 'anchor' && dbl && st.sel && st.sel.node === hit.at.node && st.sel.sub === hit.at.sub && st.sel.path === hit.at.path) {
      pointAction(store, 'toggle');
      return;
    }
    st.sel = hit.at;
    st.drag = { kind: hit.kind, at: hit.at, orig: structuredClone(t.shape), base: models, moved: false, latest: models };
    store.emit();
  },
  move: (store, p) => {
    const dr = st?.drag;
    if (!st || !dr) return;
    const c = chainOf(store.shapes(), st.id);
    if (!c || c.shape.kind !== 'shape') return;
    const local = toLocal(dr.orig, c.groups, [p.x, p.y]);
    const models = structuredClone(dr.base);
    const n = nodeAt(models, dr.at);
    if (!n) return;
    if (dr.kind === 'anchor') moveAnchor(n, local[0], local[1]);
    else moveHandle(n, dr.kind, local[0], local[1], p.shift);
    dr.moved = true;
    dr.latest = models;
    // Live preview straight on the shape; the undo step is made on release.
    restore(c.shape, dr.orig);
    applyModels(c.shape, models);
    store.emit();
  },
  up: (store) => {
    const dr = st?.drag;
    if (!st || !dr) return;
    st.drag = null;
    const c = chainOf(store.shapes(), st.id);
    if (!c || c.shape.kind !== 'shape') return;
    restore(c.shape, dr.orig);
    if (!dr.moved) { store.emit(); return; }
    const final = dr.latest;
    store.tryChange('Edit points', () => { const x = store.shape(c.shape.id); if (x?.kind === 'shape') applyModels(x, final); });
  },
};

// ---------- Drawing ----------

const BTN: [string, 'smooth' | 'corner' | 'delete' | 'done'][] = [['Smooth', 'smooth'], ['Corner', 'corner'], ['Delete point', 'delete'], ['Done', 'done']];

const Toolbar = ({ store, x, y, scale }: { store: FrameStore; x: number; y: number; scale: number }) => {
  const k = 1 / scale;
  const h = 28 * k, fs = 12.5 * k, pad = 10 * k, gap = 4 * k;
  let cx = x;
  return (
    <g>
      {BTN.map(([label, act]) => {
        const w = (label.length * 7 + 20) * k;
        const bx = cx;
        cx += w + gap;
        const disabled = act !== 'done' && !st?.sel;
        return (
          <g key={act} role="button" aria-label={label} style={{ cursor: 'pointer' }} opacity={disabled ? 0.5 : 1}
            onPointerDown={(e) => {
              e.stopPropagation(); e.preventDefault();
              if (act === 'done') stopEditPoints(store); else pointAction(store, act);
            }}>
            <rect x={bx} y={y} width={w} height={h} rx={6 * k} fill={act === 'done' ? ACCENT : '#ffffff'} stroke={ACCENT} strokeWidth={k} />
            <text x={bx + pad} y={y + h * 0.66} fontSize={fs} fontFamily="'Hanken Grotesk', system-ui, sans-serif" fontWeight={600} fill={act === 'done' ? '#ffffff' : '#2b0f08'} pointerEvents="none">{label}</text>
          </g>
        );
      })}
    </g>
  );
};

const renderLayer = (store: FrameStore, scale: number): ReactNode => {
  boundStore = store;
  if (st) st.scale = scale;
  if (store.tool !== POINTS_TOOL || !st) return null;
  const t = target(store);
  if (!t) return null;
  const models = modelsOf(t.shape);
  const S = (p: XY) => toSlide(t.shape, t.groups, p);
  const k = 1 / scale;
  const outline = models.map((m) => serialize(m.map((sp) => ({
    closed: sp.closed,
    nodes: sp.nodes.map((n) => {
      const a = S([n.x, n.y]);
      return { x: a[0], y: a[1], ...(n.in ? { in: S(n.in) } : {}), ...(n.out ? { out: S(n.out) } : {}) };
    }),
  })))).join('');
  const marks: ReactNode[] = [];
  const sel = st.sel;
  const r = 4.5 * k;
  models.forEach((m, pi) => m.forEach((sp, si) => sp.nodes.forEach((n, ni) => {
    const a = S([n.x, n.y]);
    const on = !!sel && sel.path === pi && sel.sub === si && sel.node === ni;
    if (on) {
      for (const hnd of [n.in, n.out]) {
        if (!hnd) continue;
        const b = S(hnd);
        marks.push(<line key={`l${pi}-${si}-${ni}-${hnd === n.in ? 'i' : 'o'}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={ACCENT} strokeWidth={k} />);
        marks.push(<circle key={`h${pi}-${si}-${ni}-${hnd === n.in ? 'i' : 'o'}`} cx={b[0]} cy={b[1]} r={r * 0.85} fill="#ffffff" stroke={ACCENT} strokeWidth={1.4 * k} />);
      }
    }
    marks.push(n.smooth
      ? <circle key={`a${pi}-${si}-${ni}`} cx={a[0]} cy={a[1]} r={r} fill={on ? ACCENT : '#ffffff'} stroke={ACCENT} strokeWidth={1.4 * k} />
      : <rect key={`a${pi}-${si}-${ni}`} x={a[0] - r} y={a[1] - r} width={r * 2} height={r * 2} fill={on ? ACCENT : '#ffffff'} stroke={ACCENT} strokeWidth={1.4 * k} />);
  })));
  const corners = [[0, 0], [t.shape.w, 0], [0, t.shape.h], [t.shape.w, t.shape.h]].map((p) => S(p as XY));
  const top = Math.min(...corners.map((c) => c[1])), left = Math.min(...corners.map((c) => c[0]));
  const barY = top - 40 * k < 0 ? Math.max(...corners.map((c) => c[1])) + 12 * k : top - 40 * k;
  return (
    <g className="gobj-points">
      <path d={outline} fill="none" stroke={ACCENT} strokeWidth={1.2 * k} strokeDasharray={`${4 * k} ${3 * k}`} pointerEvents="none" />
      <g pointerEvents="none">{marks}</g>
      <Toolbar store={store} x={Math.max(4 * k, left)} y={barY} scale={scale} />
    </g>
  );
};

// ---------- Keys and right-click while editing points ----------

let keysOn = false;
const installKeys = (): void => {
  if (keysOn || typeof window === 'undefined') return;
  keysOn = true;
  window.addEventListener('keydown', (e) => {
    const store = boundStore;
    if (!store || store.tool !== POINTS_TOOL || !st || store.dialog) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); if (st.sel) pointAction(store, 'delete'); }
    else if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); stopEditPoints(store); }
  }, true);
  window.addEventListener('contextmenu', (e) => {
    const store = boundStore;
    if (!store || store.tool !== POINTS_TOOL || !st) return;
    const cv = (e.target as Element | null)?.closest?.('.ed-canvas');
    if (!cv) return;
    e.preventDefault(); e.stopPropagation();
    const t = target(store);
    if (!t) return;
    const rc = cv.getBoundingClientRect();
    const sp: XY = [(e.clientX - rc.left) / st.scale, (e.clientY - rc.top) / st.scale];
    const hit = hitTest(modelsOf(t.shape), toLocal(t.shape, t.groups, sp), 8 / st.scale, st.sel);
    if (hit && hit.kind === 'anchor') { st.sel = hit.at; pointAction(store, 'toggle'); }
  }, true);
};

export const registerPoints = (): void => {
  registerTool(pointsTool);
  registerCanvasLayer({ id: 'gobjects.points', order: 50, render: renderLayer });
};
