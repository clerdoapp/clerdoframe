/**
 * Editable path model for custom geometry: anchors with optional Bézier handles, grouped in
 * sub-paths. Pure functions, used by Edit points and the curve tool, and covered by tests.
 */
import { parseSvgPath } from '../../formats/pptx/geom';
import { geometry } from '../../render/geometry';
import type { AutoShape } from '../../model/deck';

export type XY = [number, number];
export interface PNode { x: number; y: number; in?: XY; out?: XY; smooth?: boolean }
export interface SubPath { nodes: PNode[]; closed: boolean }
/** One entry of AutoShape.path, in shape pixels. */
export type PathModel = SubPath[];

const r2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: XY, b: XY, e = 0.01) => Math.abs(a[0] - b[0]) < e && Math.abs(a[1] - b[1]) < e;

/** Marks nodes whose handles point in opposite directions as smooth. */
const detectSmooth = (n: PNode): void => {
  if (!n.in || !n.out) return;
  const a = [n.in[0] - n.x, n.in[1] - n.y], b = [n.out[0] - n.x, n.out[1] - n.y];
  const la = Math.hypot(a[0]!, a[1]!), lb = Math.hypot(b[0]!, b[1]!);
  if (la < 1e-6 || lb < 1e-6) return;
  const cos = (a[0]! * b[0]! + a[1]! * b[1]!) / (la * lb);
  if (cos < -0.995) n.smooth = true;
};

/** SVG path data (any commands) to the node model, scaled by sx, sy. */
export const parsePath = (d: string, sx = 1, sy = 1): PathModel => {
  const out: PathModel = [];
  let cur: SubPath | null = null;
  let last: XY = [0, 0];
  for (const s of parseSvgPath(d)) {
    const p = s.p.map((v, i) => v * (i % 2 === 0 ? sx : sy));
    if (s.c === 'M') { cur = { nodes: [{ x: p[0]!, y: p[1]! }], closed: false }; out.push(cur); last = [p[0]!, p[1]!]; continue; }
    if (!cur) { cur = { nodes: [{ x: last[0], y: last[1] }], closed: false }; out.push(cur); }
    const prev = cur.nodes[cur.nodes.length - 1]!;
    if (s.c === 'L') { cur.nodes.push({ x: p[0]!, y: p[1]! }); last = [p[0]!, p[1]!]; }
    else if (s.c === 'C') {
      prev.out = [p[0]!, p[1]!];
      cur.nodes.push({ x: p[4]!, y: p[5]!, in: [p[2]!, p[3]!] });
      last = [p[4]!, p[5]!];
    } else if (s.c === 'Q') {
      const q: XY = [p[0]!, p[1]!], e: XY = [p[2]!, p[3]!];
      prev.out = [prev.x + (2 / 3) * (q[0] - prev.x), prev.y + (2 / 3) * (q[1] - prev.y)];
      cur.nodes.push({ x: e[0], y: e[1], in: [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])] });
      last = e;
    } else if (s.c === 'Z') {
      cur.closed = true;
      const first = cur.nodes[0]!, end = cur.nodes[cur.nodes.length - 1]!;
      if (cur.nodes.length > 1 && near([first.x, first.y], [end.x, end.y])) {
        if (end.in) first.in = end.in;
        cur.nodes.pop();
      }
      last = [first.x, first.y];
      cur = null;
    }
  }
  for (const sp of out) for (const n of sp.nodes) detectSmooth(n);
  return out.filter((sp) => sp.nodes.length > 0);
};

const seg = (a: PNode, b: PNode): string =>
  a.out || b.in
    ? `C${r2((a.out ?? [a.x, a.y])[0])} ${r2((a.out ?? [a.x, a.y])[1])} ${r2((b.in ?? [b.x, b.y])[0])} ${r2((b.in ?? [b.x, b.y])[1])} ${r2(b.x)} ${r2(b.y)}`
    : `L${r2(b.x)} ${r2(b.y)}`;

export const serialize = (m: PathModel): string => m.map((sp) => {
  if (!sp.nodes.length) return '';
  let d = `M${r2(sp.nodes[0]!.x)} ${r2(sp.nodes[0]!.y)}`;
  for (let i = 1; i < sp.nodes.length; i++) d += seg(sp.nodes[i - 1]!, sp.nodes[i]!);
  if (sp.closed && sp.nodes.length > 1) {
    const a = sp.nodes[sp.nodes.length - 1]!, b = sp.nodes[0]!;
    if (a.out || b.in) d += seg(a, b);
    d += 'Z';
  }
  return d;
}).join('');

// ---------- Segments ----------

export const segCount = (sp: SubPath): number => (sp.closed ? sp.nodes.length : sp.nodes.length - 1);
export const segEnds = (sp: SubPath, i: number): [PNode, PNode] => [sp.nodes[i]!, sp.nodes[(i + 1) % sp.nodes.length]!];

/** Point at t on segment i. */
export const segPoint = (sp: SubPath, i: number, t: number): XY => {
  const [a, b] = segEnds(sp, i);
  const p0: XY = [a.x, a.y], p3: XY = [b.x, b.y];
  const p1 = a.out ?? p0, p2 = b.in ?? p3;
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
};

/** Nearest segment to p: sub-path, segment index, t and distance. */
export const nearestSegment = (m: PathModel, p: XY): { sub: number; seg: number; t: number; dist: number } | null => {
  let best: { sub: number; seg: number; t: number; dist: number } | null = null;
  m.forEach((sp, si) => {
    for (let i = 0; i < segCount(sp); i++) {
      for (let k = 0; k <= 32; k++) {
        const t = k / 32;
        const q = segPoint(sp, i, t);
        const dd = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (!best || dd < best.dist) best = { sub: si, seg: i, t, dist: dd };
      }
    }
  });
  return best;
};

/** Splits segment i at t (de Casteljau), inserting a new anchor. Returns the new node's index. */
export const insertPoint = (sp: SubPath, i: number, t: number): number => {
  const [a, b] = segEnds(sp, i);
  const at = i + 1;
  if (!a.out && !b.in) {
    sp.nodes.splice(at, 0, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    return at;
  }
  const p0: XY = [a.x, a.y], p1 = a.out ?? p0, p3: XY = [b.x, b.y], p2 = b.in ?? p3;
  const l = (u: XY, v: XY): XY => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
  const q0 = l(p0, p1), q1 = l(p1, p2), q2 = l(p2, p3);
  const r0 = l(q0, q1), r1 = l(q1, q2);
  const s = l(r0, r1);
  a.out = q0;
  b.in = q2;
  sp.nodes.splice(at, 0, { x: s[0], y: s[1], in: r0, out: r1, smooth: true });
  return at;
};

/** Removes anchor i when enough remain (2 for open, 3 for closed). */
export const deletePoint = (sp: SubPath, i: number): boolean => {
  if (sp.nodes.length <= (sp.closed ? 3 : 2)) return false;
  sp.nodes.splice(i, 1);
  return true;
};

/** Moves an anchor and its handles. */
export const moveAnchor = (n: PNode, x: number, y: number): void => {
  const dx = x - n.x, dy = y - n.y;
  n.x = x; n.y = y;
  if (n.in) n.in = [n.in[0] + dx, n.in[1] + dy];
  if (n.out) n.out = [n.out[0] + dx, n.out[1] + dy];
};

/** Moves one handle; on a smooth anchor the other handle turns to stay opposite, keeping its length. */
export const moveHandle = (n: PNode, which: 'in' | 'out', x: number, y: number, breakSmooth = false): void => {
  n[which] = [x, y];
  if (breakSmooth) { n.smooth = false; return; }
  const other = which === 'in' ? 'out' : 'in';
  const o = n[other];
  if (!n.smooth || !o) return;
  const len = Math.hypot(o[0] - n.x, o[1] - n.y);
  const vx = n.x - x, vy = n.y - y, vl = Math.hypot(vx, vy) || 1;
  n[other] = [n.x + (vx / vl) * len, n.y + (vy / vl) * len];
};

/** Corner: no handles (straight sides). Smooth: handles along the line through the neighbours. */
export const setSmooth = (sp: SubPath, i: number, smooth: boolean): void => {
  const n = sp.nodes[i]!;
  if (!smooth) { delete n.in; delete n.out; n.smooth = false; return; }
  const len = sp.nodes.length;
  const prev = sp.closed || i > 0 ? sp.nodes[(i - 1 + len) % len]! : null;
  const next = sp.closed || i < len - 1 ? sp.nodes[(i + 1) % len]! : null;
  const a: XY = prev ? [prev.x, prev.y] : [n.x, n.y], b: XY = next ? [next.x, next.y] : [n.x, n.y];
  let tx = b[0] - a[0], ty = b[1] - a[1];
  const tl = Math.hypot(tx, ty);
  if (tl < 1e-6) { tx = 1; ty = 0; } else { tx /= tl; ty /= tl; }
  const lin = prev ? Math.hypot(n.x - prev.x, n.y - prev.y) / 3 : 0;
  const lout = next ? Math.hypot(next.x - n.x, next.y - n.y) / 3 : 0;
  if (prev) n.in = [n.x - tx * lin, n.y - ty * lin]; else delete n.in;
  if (next) n.out = [n.x + tx * lout, n.y + ty * lout]; else delete n.out;
  n.smooth = true;
};

/** Smooth path through points (Catmull-Rom as cubic Béziers) as a node model. */
export const smoothThrough = (pts: XY[], closed: boolean): SubPath => {
  const n = pts.length;
  const at = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]!;
  const nodes: PNode[] = pts.map(([x, y]) => ({ x, y, smooth: true }));
  if (n < 3 && !closed) return { nodes: nodes.map(({ x, y }) => ({ x, y })), closed };
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1);
    const tx = (p2[0] - p0[0]) / 6, ty = (p2[1] - p0[1]) / 6;
    if (closed || i > 0) nodes[i]!.in = [p1[0] - tx, p1[1] - ty];
    if (closed || i < n - 1) nodes[i]!.out = [p1[0] + tx, p1[1] + ty];
  }
  return { nodes, closed };
};

// ---------- Bounds and the shape ----------

/** Tight bounds of the drawn curves (sampled), not of the handles. */
export const bounds = (models: PathModel[]): { x: number; y: number; w: number; h: number } => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p: XY) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
  for (const m of models) for (const sp of m) {
    for (const n of sp.nodes) add([n.x, n.y]);
    for (let i = 0; i < segCount(sp); i++) {
      const [a, b] = segEnds(sp, i);
      if (a.out || b.in) for (let k = 1; k < 16; k++) add(segPoint(sp, i, k / 16));
    }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const shiftModel = (m: PathModel, dx: number, dy: number): void => {
  for (const sp of m) for (const n of sp.nodes) {
    n.x += dx; n.y += dy;
    if (n.in) n.in = [n.in[0] + dx, n.in[1] + dy];
    if (n.out) n.out = [n.out[0] + dx, n.out[1] + dy];
  }
};

/** The shape's paths as node models in its own pixel box. */
export const modelsOf = (s: AutoShape): PathModel[] =>
  (s.path ?? []).map((p) => parsePath(p.d, p.w ? s.w / p.w : 1, p.h ? s.h / p.h : 1));

/** Where a local point of the shape lands in its parent's space (rotation and flips about the centre). */
export const localToParent = (s: { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean }, p: XY): XY => {
  const cx = s.w / 2, cy = s.h / 2;
  let vx = (p[0] - cx) * (s.flipH ? -1 : 1), vy = (p[1] - cy) * (s.flipV ? -1 : 1);
  const a = ((s.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a);
  [vx, vy] = [vx * c - vy * si, vx * si + vy * c];
  return [s.x + cx + vx, s.y + cy + vy];
};
export const parentToLocal = (s: { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean }, p: XY): XY => {
  const cx = s.w / 2, cy = s.h / 2;
  let vx = p[0] - s.x - cx, vy = p[1] - s.y - cy;
  const a = (-(s.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a);
  [vx, vy] = [vx * c - vy * si, vx * si + vy * c];
  return [cx + vx * (s.flipH ? -1 : 1), cy + vy * (s.flipV ? -1 : 1)];
};

/**
 * Writes edited models (in the shape's current local pixels) back: the box shrinks or grows to the
 * new bounds and moves so nothing on the slide shifts, rotation and flips included.
 */
export const applyModels = (s: AutoShape, models: PathModel[]): void => {
  const b = bounds(models);
  const w = Math.max(1, b.w), h = Math.max(1, b.h);
  const c = localToParent(s, [b.x + w / 2, b.y + h / 2]);
  const copy = models.map((m) => structuredClone(m));
  for (const m of copy) shiftModel(m, -b.x, -b.y);
  s.x = r2(c[0] - w / 2); s.y = r2(c[1] - h / 2);
  s.w = r2(w); s.h = r2(h);
  s.geom = 'custom';
  delete s.adj;
  s.path = copy.map((m) => ({ d: serialize(m) || 'M0 0', w: s.w, h: s.h }));
};

/** Turns a preset shape into custom geometry with the same outline. */
export const toCustom = (s: AutoShape): boolean => {
  if (s.geom === 'custom') return !!s.path?.length;
  const g = geometry(s.geom || 'rect', s.w, s.h, s.adj);
  const filled = g.paths.filter((p) => p.fill !== 'none');
  const use = filled.length ? filled.filter((p, i, a) => a.findIndex((q) => q.d === p.d) === i) : g.paths;
  if (!use.length) return false;
  s.path = use.map((p) => ({ d: serialize(parsePath(p.d)), w: Math.max(1, s.w), h: Math.max(1, s.h) }));
  s.geom = 'custom';
  delete s.adj;
  return true;
};
