import type { Group, Id, Shape } from '../../model/deck';
import { geometry, isLineGeom } from '../../render/geometry';

/** 2D affine maths for the canvas: shape frames, groups, hit testing, resizing, connectors. Units are slide px. */

export type Mat = [number, number, number, number, number, number];
export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }

export const I: Mat = [1, 0, 0, 1, 0, 0];

export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const apply = (m: Mat, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
export const inv = (m: Mat): Mat => {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};
export const T = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const Sc = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];
export const Rot = (deg: number): Mat => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
};
/** Rough uniform scale of a matrix, for converting screen tolerances. */
export const scaleOf = (m: Mat): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
export const cssMatrix = (m: Mat): string => `matrix(${m.map((v) => Math.round(v * 1e5) / 1e5).join(',')})`;

type Frame = { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean };

/** Box frame (position and rotation, no flip) to parent space. */
export const frameMatrix = (s: Frame): Mat => {
  if (!s.rot) return T(s.x, s.y);
  return mul(T(s.x + s.w / 2, s.y + s.h / 2), mul(Rot(s.rot), T(-s.w / 2, -s.h / 2)));
};
/** Full shape transform including flips, the same one the renderer uses. */
export const shapeMatrix = (s: Frame): Mat => {
  const f = frameMatrix(s);
  if (!s.flipH && !s.flipV) return f;
  return mul(f, mul(T(s.flipH ? s.w : 0, s.flipV ? s.h : 0), Sc(s.flipH ? -1 : 1, s.flipV ? -1 : 1)));
};
/** Group child space to group box space. */
export const innerMatrix = (g: Group): Mat => {
  const cb = g.childBox ?? { x: 0, y: 0, w: g.w, h: g.h };
  const sx = cb.w ? g.w / cb.w : 1, sy = cb.h ? g.h / cb.h : 1;
  return mul(Sc(sx, sy), T(-cb.x, -cb.y));
};
export const childMatrix = (g: Group): Mat => mul(shapeMatrix(g), innerMatrix(g));

/** Ancestor groups of a shape, outermost first, or null when not found. */
export const ancestorsOf = (shapes: Shape[], id: Id): Group[] | null => {
  for (const s of shapes) {
    if (s.id === id) return [];
    if (s.kind === 'group') {
      const inner = ancestorsOf(s.children, id);
      if (inner) return [s, ...inner];
    }
  }
  return null;
};
export const parentMatrix = (groups: Group[]): Mat => groups.reduce<Mat>((m, g) => mul(m, childMatrix(g)), I);
export const parentMatrixOf = (shapes: Shape[], id: Id): Mat => parentMatrix(ancestorsOf(shapes, id) ?? []);

export const cornersOf = (m: Mat, w: number, h: number): Pt[] => [apply(m, { x: 0, y: 0 }), apply(m, { x: w, y: 0 }), apply(m, { x: w, y: h }), apply(m, { x: 0, y: h })];
export const boundsOf = (pts: Pt[]): Box => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};
export const unionBox = (bs: Box[]): Box => {
  if (!bs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
};

/** Slide-space outline (4 corners) of a shape's frame. */
export const outlineOf = (shapes: Shape[], s: Shape): Pt[] => cornersOf(mul(parentMatrixOf(shapes, s.id), frameMatrix(s)), s.w, s.h);
export const slideBoxOf = (shapes: Shape[], s: Shape): Box => boundsOf(outlineOf(shapes, s));

export const isLineShape = (s: Shape): boolean => s.kind === 'shape' && isLineGeom(s.geom || 'rect');

// ---------- Hit testing ----------

const distToSeg = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Whether slide point p hits shape s, given the matrix of s's parent space. tol is in slide px. */
export const hitShape = (s: Shape, parent: Mat, p: Pt, tol: number): boolean => {
  if (s.hidden) return false;
  if (s.kind === 'group') {
    const m = mul(parent, childMatrix(s));
    return s.children.some((c) => hitShape(c, m, p, tol));
  }
  const fm = mul(parent, frameMatrix(s));
  const k = scaleOf(fm);
  const l = apply(inv(fm), p);
  const t = tol / k;
  if (isLineShape(s)) {
    const a = { x: s.flipH ? s.w : 0, y: s.flipV ? s.h : 0 }, b = { x: s.flipH ? 0 : s.w, y: s.flipV ? 0 : s.h };
    const geom = (s as { geom: string }).geom;
    // Elbow and curved connectors: test the bounding box edges as well as the diagonal.
    if (/bent|curved/i.test(geom)) return l.x >= -t && l.y >= -t && l.x <= s.w + t && l.y <= s.h + t;
    return distToSeg(l, a, b) <= Math.max(t, 4 / k);
  }
  return l.x >= -t && l.y >= -t && l.x <= s.w + t && l.y <= s.h + t;
};

/** Topmost shape in a list under p (lists draw first-to-last, so the end is on top). */
export const topHit = (shapes: Shape[], parent: Mat, p: Pt, tol: number): Shape | null => {
  for (let i = shapes.length - 1; i >= 0; i--) if (hitShape(shapes[i]!, parent, p, tol)) return shapes[i]!;
  return null;
};

const containsSel = (g: Group, sel: Id[]): boolean => g.children.some((c) => sel.includes(c.id) || (c.kind === 'group' && containsSel(c, sel)));

/**
 * The shape a click selects: the top-level shape first; clicking inside a selected group (or next to a
 * selected child) picks the child under the pointer.
 */
export const pickTarget = (shapes: Shape[], sel: Id[], p: Pt, tol: number): Shape | null => {
  let cur = topHit(shapes, I, p, tol);
  let m = I;
  while (cur && cur.kind === 'group') {
    const selHere = sel.includes(cur.id);
    if (!selHere && !containsSel(cur, sel)) return cur;
    m = mul(m, childMatrix(cur));
    const c = topHit(cur.children, m, p, tol);
    if (!c) return cur;
    if (selHere || sel.includes(c.id)) return c;
    if (c.kind === 'group' && containsSel(c, sel)) { cur = c; continue; }
    return c;
  }
  return cur;
};

/** Shapes fully inside a marquee box (top level only, hidden ones skipped). */
export const inMarquee = (shapes: Shape[], box: Box): Shape[] => shapes.filter((s) => {
  if (s.hidden) return false;
  const b = slideBoxOf(shapes, s);
  return b.x >= box.x - 0.5 && b.y >= box.y - 0.5 && b.x + b.w <= box.x + box.w + 0.5 && b.y + b.h <= box.y + box.h + 0.5;
});

// ---------- Resize and rotate ----------

export interface HandleSpec { fx: 0 | 0.5 | 1; fy: 0 | 0.5 | 1 }
export const HANDLES: Record<string, HandleSpec> = {
  nw: { fx: 0, fy: 0 }, n: { fx: 0.5, fy: 0 }, ne: { fx: 1, fy: 0 }, e: { fx: 1, fy: 0.5 },
  se: { fx: 1, fy: 1 }, s: { fx: 0.5, fy: 1 }, sw: { fx: 0, fy: 1 }, w: { fx: 0, fy: 0.5 },
};
export const isCorner = (h: HandleSpec): boolean => h.fx !== 0.5 && h.fy !== 0.5;

/**
 * New frame when dragging a resize handle to p (parent space). The shape resizes in its own rotated
 * frame; ratio keeps the aspect ratio, center resizes about the centre.
 */
export const resizeFrame = (f: Frame, h: HandleSpec, p: Pt, o: { ratio?: boolean; center?: boolean; min?: number } = {}): Box => {
  const min = o.min ?? 1;
  const C = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
  const r = (-(f.rot ?? 0) * Math.PI) / 180;
  const dx = p.x - C.x, dy = p.y - C.y;
  const l = { x: dx * Math.cos(r) - dy * Math.sin(r) + f.w / 2, y: dx * Math.sin(r) + dy * Math.cos(r) + f.h / 2 };
  let x0 = 0, x1 = f.w, y0 = 0, y1 = f.h;
  if (h.fx === 0) { x0 = Math.min(l.x, f.w - min); if (o.center) x1 = f.w - x0; }
  if (h.fx === 1) { x1 = Math.max(l.x, min); if (o.center) x0 = f.w - x1; }
  if (h.fy === 0) { y0 = Math.min(l.y, f.h - min); if (o.center) y1 = f.h - y0; }
  if (h.fy === 1) { y1 = Math.max(l.y, min); if (o.center) y0 = f.h - y1; }
  if (o.center) {
    if (x1 - x0 < min) { x0 = (f.w - min) / 2; x1 = x0 + min; }
    if (y1 - y0 < min) { y0 = (f.h - min) / 2; y1 = y0 + min; }
  }
  if (o.ratio && f.w > 0 && f.h > 0) {
    const ar = f.w / f.h;
    let nw = x1 - x0, nh = y1 - y0;
    if (isCorner(h)) {
      const k = Math.max(nw / f.w, nh / f.h);
      nw = f.w * k; nh = f.h * k;
    } else if (h.fx === 0.5) nw = nh * ar;
    else nh = nw / ar;
    nw = Math.max(min, nw); nh = Math.max(min, nh);
    const ax = o.center || h.fx === 0.5 ? f.w / 2 : h.fx === 0 ? f.w : 0;
    const ay = o.center || h.fy === 0.5 ? f.h / 2 : h.fy === 0 ? f.h : 0;
    const sx = ax === f.w ? 1 : ax === 0 ? 0 : 0.5, sy = ay === f.h ? 1 : ay === 0 ? 0 : 0.5;
    x0 = ax - nw * sx; x1 = x0 + nw; y0 = ay - nh * sy; y1 = y0 + nh;
  }
  const nw = x1 - x0, nh = y1 - y0;
  const cl = { x: (x0 + x1) / 2 - f.w / 2, y: (y0 + y1) / 2 - f.h / 2 };
  const rr = ((f.rot ?? 0) * Math.PI) / 180;
  const nc = { x: C.x + cl.x * Math.cos(rr) - cl.y * Math.sin(rr), y: C.y + cl.x * Math.sin(rr) + cl.y * Math.cos(rr) };
  return { x: nc.x - nw / 2, y: nc.y - nh / 2, w: nw, h: nh };
};

/** Rotation angle (degrees, 0 = handle straight up) from a centre to a point. */
export const angleTo = (c: Pt, p: Pt, snap = false): number => {
  let a = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
  if (snap) a = Math.round(a / 15) * 15;
  return ((a % 360) + 360) % 360;
};
export const normDeg = (a: number): number => { const r = ((Math.round(a * 100) / 100) % 360 + 360) % 360; return r; };

export const rotatePt = (p: Pt, c: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180, dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(r) - dy * Math.sin(r), y: c.y + dx * Math.sin(r) + dy * Math.cos(r) };
};

// ---------- Lines and connectors ----------

/** A line shape's start and end points in its parent space. */
export const lineEnds = (s: Frame): [Pt, Pt] => {
  const m = shapeMatrix(s);
  return [apply(m, { x: 0, y: 0 }), apply(m, { x: s.w, y: s.h })];
};

/** Sets a line shape's frame so it runs from a to b (parent space). */
export const setLineEnds = (s: Frame, a: Pt, b: Pt): void => {
  s.x = Math.min(a.x, b.x); s.y = Math.min(a.y, b.y);
  s.w = Math.abs(b.x - a.x); s.h = Math.abs(b.y - a.y);
  const fh = b.x < a.x, fv = b.y < a.y;
  if (fh) s.flipH = true; else delete s.flipH;
  if (fv) s.flipV = true; else delete s.flipV;
  delete s.rot;
};

/** Constrains b to 45° steps around a. */
export const snap45 = (a: Pt, b: Pt): Pt => {
  const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d };
};

/** Connection sites of a shape in slide space (top-level shapes). */
export const sitesOf = (s: Shape, parent: Mat = I): Pt[] => {
  let pts: [number, number][];
  if (s.kind === 'shape') pts = geometry(s.geom || 'rect', s.w, s.h, s.adj, s.path).sites ?? [];
  else pts = [[s.w / 2, 0], [0, s.h / 2], [s.w / 2, s.h], [s.w, s.h / 2]];
  if (!pts.length) pts = [[s.w / 2, 0], [0, s.h / 2], [s.w / 2, s.h], [s.w, s.h / 2]];
  const m = mul(parent, shapeMatrix(s));
  return pts.map(([x, y]) => apply(m, { x, y }));
};

/**
 * Re-routes connectors glued to shapes. Only top-level connectors and targets are handled;
 * ends glued to missing shapes are unglued. Returns ids of connectors that changed.
 */
export const routeConnectors = (shapes: Shape[], moved?: Set<Id>): Id[] => {
  const byId = new Map<Id, Shape>();
  for (const s of shapes) byId.set(s.id, s);
  const out: Id[] = [];
  for (const s of shapes) {
    if (s.kind !== 'shape' || !s.conn) continue;
    const { start, end } = s.conn;
    if (moved && !(start && moved.has(start.shape)) && !(end && moved.has(end.shape))) continue;
    let [a, b] = lineEnds(s);
    let changed = false;
    const at = (c: { shape: Id; site: number } | undefined): Pt | null | undefined => {
      if (!c) return undefined;
      const t = byId.get(c.shape);
      if (!t) return null;
      const sites = sitesOf(t);
      return sites[Math.max(0, Math.min(sites.length - 1, c.site))] ?? null;
    };
    const pa = at(start), pb = at(end);
    if (pa === null) { delete s.conn.start; changed = true; }
    if (pb === null) { delete s.conn.end; changed = true; }
    if (pa) { changed = changed || Math.abs(pa.x - a.x) > 0.01 || Math.abs(pa.y - a.y) > 0.01; a = pa; }
    if (pb) { changed = changed || Math.abs(pb.x - b.x) > 0.01 || Math.abs(pb.y - b.y) > 0.01; b = pb; }
    if (!s.conn.start && !s.conn.end) delete s.conn;
    if (changed) { setLineEnds(s, a, b); out.push(s.id); }
  }
  return out;
};

/** Nearest connection site within reach of p, across shapes (skipping one id). */
export const nearestSite = (shapes: Shape[], p: Pt, reach: number, skip?: Id): { shape: Id; site: number; pt: Pt } | null => {
  let best: { shape: Id; site: number; pt: Pt; d: number } | null = null;
  for (const s of shapes) {
    if (s.id === skip || s.hidden || isLineShape(s)) continue;
    sitesOf(s).forEach((pt, i) => {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d <= reach && (!best || d < best.d)) best = { shape: s.id, site: i, pt, d };
    });
  }
  if (!best) return null;
  const b = best as { shape: Id; site: number; pt: Pt };
  return { shape: b.shape, site: b.site, pt: b.pt };
};

// ---------- Groups ----------

/** Recomputes a group's child box to fit its children, keeping their slide positions (unrotated groups). */
export const fitGroup = (g: Group): void => {
  if (!g.children.length) return;
  const cb = g.childBox ?? { x: 0, y: 0, w: g.w, h: g.h };
  const sx = cb.w ? g.w / cb.w : 1, sy = cb.h ? g.h / cb.h : 1;
  const u = unionBox(g.children.map((c) => boundsOf(cornersOf(frameMatrix(c), c.w, c.h))));
  if (Math.abs(u.x - cb.x) < 0.01 && Math.abs(u.y - cb.y) < 0.01 && Math.abs(u.w - cb.w) < 0.01 && Math.abs(u.h - cb.h) < 0.01) return;
  if (g.rot) {
    // Keep the rotated group visually still: its new centre is the old transform of the union centre.
    const m = childMatrix(g);
    const c = apply(m, { x: u.x + u.w / 2, y: u.y + u.h / 2 });
    g.w = u.w * sx; g.h = u.h * sy; g.x = c.x - g.w / 2; g.y = c.y - g.h / 2;
  } else {
    const p = apply(childMatrix(g), { x: u.x, y: u.y });
    if (g.flipH || g.flipV) {
      const q = apply(childMatrix(g), { x: u.x + u.w, y: u.y + u.h });
      g.x = Math.min(p.x, q.x); g.y = Math.min(p.y, q.y);
    } else { g.x = p.x; g.y = p.y; }
    g.w = u.w * sx; g.h = u.h * sy;
  }
  g.childBox = { x: u.x, y: u.y, w: u.w, h: u.h };
};

/** Children of a group mapped into the group's parent space, ready to be put back in the parent list. */
export const ungroupChildren = (g: Group): Shape[] => {
  const m = childMatrix(g);
  const cb = g.childBox ?? { x: 0, y: 0, w: g.w, h: g.h };
  const sx = cb.w ? g.w / cb.w : 1, sy = cb.h ? g.h / cb.h : 1;
  return g.children.map((c) => {
    const out = structuredClone(c);
    const center = apply(m, { x: c.x + c.w / 2, y: c.y + c.h / 2 });
    out.w = c.w * sx; out.h = c.h * sy;
    out.x = center.x - out.w / 2; out.y = center.y - out.h / 2;
    const flipSign = (g.flipH ? -1 : 1) * (g.flipV ? -1 : 1);
    const rot = normDeg((c.rot ?? 0) * flipSign + (g.rot ?? 0));
    if (rot) out.rot = rot; else delete out.rot;
    if (g.flipH) { if (out.flipH) delete out.flipH; else out.flipH = true; }
    if (g.flipV) { if (out.flipV) delete out.flipV; else out.flipV = true; }
    if (out.kind === 'group') {
      // Nested group: scale its child box mapping along with it.
      out.childBox = c.kind === 'group' ? (c.childBox ?? { x: 0, y: 0, w: c.w, h: c.h }) : undefined;
    }
    return out;
  });
};

/** Wraps shapes (all in the same parent list, parent coordinates) into a new group frame. */
export const groupFrame = (shapes: Shape[]): Box => unionBox(shapes.map((s) => boundsOf(cornersOf(frameMatrix(s), s.w, s.h))));
