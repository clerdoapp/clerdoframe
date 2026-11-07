import { findShape, type Crop, type Group, type Id, type Picture, type Shape } from '../../model/deck';
import { geometry } from '../../render/geometry';
import {
  ancestorsOf, apply, angleTo, fitGroup, frameMatrix, inv, isLineShape, lineEnds, mul, normDeg, outlineOf, parentMatrix, resizeFrame,
  rotatePt, routeConnectors, setLineEnds, shapeMatrix, slideBoxOf, unionBox, type Box, type HandleSpec, type Mat, type Pt,
} from './geom';

/**
 * Document mutations behind canvas gestures. Each works on a shape list (the live one inside
 * store.change, or a copy for the live preview while dragging) so both use the same code.
 */

const linear = (m: Mat, v: Pt): Pt => ({ x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y });

const parentOf = (top: Shape[], id: Id): Mat => parentMatrix(ancestorsOf(top, id) ?? []);

/** Refits the groups holding these shapes, innermost first. */
export const refit = (top: Shape[], ids: Id[]): void => {
  const chains = ids.map((id) => ancestorsOf(top, id) ?? []);
  const depth = Math.max(0, ...chains.map((c) => c.length));
  const done = new Set<Id>();
  for (let d = depth - 1; d >= 0; d--) for (const c of chains) { const g = c[d]; if (g && !done.has(g.id)) { done.add(g.id); fitGroup(g); } }
};

const idsWithin = (top: Shape[], ids: Id[]): Set<Id> => {
  const out = new Set<Id>();
  const add = (s: Shape) => { out.add(s.id); if (s.kind === 'group') s.children.forEach(add); };
  for (const id of ids) { const s = findShape(top, id); if (s) add(s); }
  return out;
};

/** After shapes moved: connectors moved on their own come unglued; glued ones follow. */
export const afterMove = (top: Shape[], ids: Id[]): void => {
  const moved = idsWithin(top, ids);
  for (const id of ids) {
    const s = findShape(top, id);
    if (s?.kind !== 'shape' || !s.conn) continue;
    if (s.conn.start && !moved.has(s.conn.start.shape)) delete s.conn.start;
    if (s.conn.end && !moved.has(s.conn.end.shape)) delete s.conn.end;
    if (!s.conn.start && !s.conn.end) delete s.conn;
  }
  routeConnectors(top, moved);
};

export const moveShapes = (top: Shape[], ids: Id[], dx: number, dy: number): void => {
  for (const id of ids) {
    const s = findShape(top, id);
    if (!s) continue;
    const d = linear(inv(parentOf(top, id)), { x: dx, y: dy });
    s.x += d.x; s.y += d.y;
  }
  refit(top, ids);
  afterMove(top, ids);
};

/** Scales a table's columns and rows to a new size. */
export const sizeShape = (s: Shape, w: number, h: number): void => {
  w = Math.max(1, w); h = Math.max(1, h);
  if (s.kind === 'table') {
    const W = s.cols.reduce((a, b) => a + b, 0) || s.w || 1;
    const H = s.rows.reduce((a, r) => a + r.h, 0) || s.h || 1;
    s.cols = s.cols.map((c) => (c * w) / W);
    for (const r of s.rows) r.h = (r.h * h) / H;
  }
  s.w = w; s.h = h;
};

/** Resizes one shape with a handle; p is the pointer in slide space. Returns the new box in parent space. */
export const resizeOne = (top: Shape[], id: Id, base: Box & { rot?: number }, h: HandleSpec, p: Pt, o: { ratio?: boolean; center?: boolean }): Box | null => {
  const s = findShape(top, id);
  if (!s) return null;
  const pp = apply(inv(parentOf(top, id)), p);
  const b = resizeFrame(base, h, pp, o);
  s.x = b.x; s.y = b.y;
  sizeShape(s, b.w, b.h);
  refit(top, [id]);
  routeConnectors(top, idsWithin(top, [id]));
  return b;
};

export interface Orig { id: Id; x: number; y: number; w: number; h: number; rot?: number; slideCenter: Pt }

export const origins = (top: Shape[], ids: Id[]): Orig[] => ids.map((id) => {
  const s = findShape(top, id)!;
  const o = outlineOf(top, s);
  return { id, x: s.x, y: s.y, w: s.w, h: s.h, ...(s.rot ? { rot: s.rot } : {}), slideCenter: { x: (o[0]!.x + o[2]!.x) / 2, y: (o[0]!.y + o[2]!.y) / 2 } };
});

/** Resizes several shapes together by scaling their shared bounding box. */
export const resizeMany = (top: Shape[], orig: Orig[], U: Box, nb: Box): void => {
  const sx = U.w ? nb.w / U.w : 1, sy = U.h ? nb.h / U.h : 1;
  for (const o of orig) {
    const s = findShape(top, o.id);
    if (!s) continue;
    const r = (((o.rot ?? 0) % 180) + 180) % 180;
    const swap = r > 45 && r < 135;
    const kw = swap ? sy : sx, kh = swap ? sx : sy;
    const P = parentOf(top, o.id);
    const nc = { x: nb.x + (o.slideCenter.x - U.x) * sx, y: nb.y + (o.slideCenter.y - U.y) * sy };
    const lc = apply(inv(P), nc);
    // Parent scaling stretches child sizes; sizes here are the shape's own units.
    sizeShape(s, o.w * kw, o.h * kh);
    s.x = lc.x - s.w / 2; s.y = lc.y - s.h / 2;
  }
  refit(top, orig.map((o) => o.id));
  routeConnectors(top, idsWithin(top, orig.map((o) => o.id)));
};

/** Rotates shapes about a centre (slide space) by delta degrees, or a single shape to an absolute angle. */
export const rotateShapes = (top: Shape[], orig: Orig[], center: Pt, delta: number): void => {
  for (const o of orig) {
    const s = findShape(top, o.id);
    if (!s) continue;
    const P = parentOf(top, o.id);
    const nc = orig.length > 1 ? rotatePt(o.slideCenter, center, delta) : o.slideCenter;
    const lc = apply(inv(P), nc);
    s.x = lc.x - o.w / 2; s.y = lc.y - o.h / 2;
    const r = normDeg((o.rot ?? 0) + delta);
    if (r) s.rot = r; else delete s.rot;
  }
  refit(top, orig.map((o) => o.id));
  routeConnectors(top, idsWithin(top, orig.map((o) => o.id)));
};

export const rotationDelta = (center: Pt, p0: Pt, p: Pt, base: number, snap: boolean): number => {
  const a0 = angleTo(center, p0), a = angleTo(center, p);
  let next = base + (a - a0);
  if (snap) next = Math.round(next / 15) * 15;
  return next - base;
};

/** Moves one end of a line (0 = start, 1 = end) to p (slide space). */
export const moveLineEnd = (top: Shape[], id: Id, end: 0 | 1, p: Pt, glue?: { shape: Id; site: number } | null): void => {
  const s = findShape(top, id);
  if (!s || s.kind !== 'shape') return;
  const P = parentOf(top, id);
  const [a, b] = lineEnds(s);
  const pp = apply(inv(P), p);
  if (end === 0) setLineEnds(s, pp, b); else setLineEnds(s, a, pp);
  const key = end === 0 ? 'start' : 'end';
  if (glue) { s.conn = { ...(s.conn ?? {}), [key]: glue }; }
  else if (s.conn) { delete s.conn[key]; if (!s.conn.start && !s.conn.end) delete s.conn; }
  refit(top, [id]);
};

/** A shape's adjust handles in slide space. */
export const adjHandles = (top: Shape[], s: Shape): { pt: Pt; i: number }[] => {
  if (s.kind !== 'shape' || s.geom === 'custom') return [];
  const g = geometry(s.geom || 'rect', s.w, s.h, s.adj, s.path);
  if (!g.handles?.length) return [];
  const m = mul(parentOf(top, s.id), shapeMatrix(s));
  return g.handles.map((h, i) => ({ pt: apply(m, { x: h.x, y: h.y }), i }));
};

type Solver = (name: string, w: number, h: number, adj: Record<string, number>, i: number, px: number, py: number) => Record<string, number>;
let solver: Solver | null = null;
export const setHandleSolver = (f: Solver | null): void => { solver = f; };

/** Sets adjust values so handle i follows p (slide space). */
export const dragAdj = (top: Shape[], id: Id, i: number, p: Pt, base: Record<string, number>): void => {
  const s = findShape(top, id);
  if (!s || s.kind !== 'shape') return;
  const m = mul(parentOf(top, id), shapeMatrix(s));
  const l = apply(inv(m), p);
  const geom = s.geom || 'rect';
  let next: Record<string, number> | null = null;
  if (solver) { try { next = solver(geom, s.w, s.h, { ...base }, i, l.x, l.y); } catch { next = null; } }
  if (!next || !Object.keys(next).length) {
    // Linear fallback: scale the value with the handle position along its axis.
    const g = geometry(geom, s.w, s.h, base, s.path);
    const h = g.handles?.[i];
    if (!h) return;
    const cur = base[h.adj] ?? 0;
    const along = h.axis === 'y' ? [l.y, h.y] : [l.x, h.x];
    let v = along[1] ? (cur * along[0]!) / along[1] : cur;
    if (h.min !== undefined) v = Math.max(h.min, v);
    if (h.max !== undefined) v = Math.min(h.max, v);
    next = { [h.adj]: Math.round(v) };
  }
  s.adj = { ...(s.adj ?? {}), ...next };
};

// ---------- Crop ----------

/** The full picture box in the picture's own frame for a crop. */
export const imageBox = (w: number, h: number, c: Crop): Box => {
  const fw = Math.max(0.01, 1 - c.l - c.r), fh = Math.max(0.01, 1 - c.t - c.b);
  const iw = w / fw, ih = h / fh;
  return { x: -c.l * iw, y: -c.t * ih, w: iw, h: ih };
};

/** A rectangle in a frame's local coordinates turned into the new frame box (parent space, same rotation). */
export const localRectToFrame = (f: Box & { rot?: number }, x0: number, y0: number, x1: number, y1: number): Box => {
  const nw = x1 - x0, nh = y1 - y0;
  const cl = { x: (x0 + x1) / 2 - f.w / 2, y: (y0 + y1) / 2 - f.h / 2 };
  const C = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
  const r = ((f.rot ?? 0) * Math.PI) / 180;
  const nc = { x: C.x + cl.x * Math.cos(r) - cl.y * Math.sin(r), y: C.y + cl.x * Math.sin(r) + cl.y * Math.cos(r) };
  return { x: nc.x - nw / 2, y: nc.y - nh / 2, w: nw, h: nh };
};

export interface CropStart { x: number; y: number; w: number; h: number; rot?: number; crop: Crop; flipH?: boolean; flipV?: boolean }

/** Drags a crop handle: the frame edge moves over the still picture. p is in slide space. */
export const cropHandle = (top: Shape[], id: Id, st: CropStart, h: HandleSpec, p: Pt): void => {
  const s = findShape(top, id) as Picture | null;
  if (!s || s.kind !== 'picture') return;
  const P = parentOf(top, id);
  const l = apply(inv(mul(P, frameMatrix(st))), p);
  const img = imageBox(st.w, st.h, st.crop);
  const MIN = 4;
  let x0 = 0, y0 = 0, x1 = st.w, y1 = st.h;
  // Allow cropping out past the picture (adds empty space), up to its own size again.
  if (h.fx === 0) x0 = Math.min(x1 - MIN, Math.max(img.x - img.w, l.x));
  if (h.fx === 1) x1 = Math.max(x0 + MIN, Math.min(img.x + img.w * 2, l.x));
  if (h.fy === 0) y0 = Math.min(y1 - MIN, Math.max(img.y - img.h, l.y));
  if (h.fy === 1) y1 = Math.max(y0 + MIN, Math.min(img.y + img.h * 2, l.y));
  const nb = localRectToFrame(st, x0, y0, x1, y1);
  // Flipped pictures draw mirrored, so the crop side that matches a frame edge swaps.
  const cl = (x0 - img.x) / img.w, cr = (img.x + img.w - x1) / img.w, ct = (y0 - img.y) / img.h, cb = (img.y + img.h - y1) / img.h;
  s.crop = { l: st.flipH ? cr : cl, r: st.flipH ? cl : cr, t: st.flipV ? cb : ct, b: st.flipV ? ct : cb };
  cleanCrop(s);
  s.x = nb.x; s.y = nb.y; s.w = nb.w; s.h = nb.h;
  refit(top, [id]);
};

/** Drags the picture inside its fixed frame. d is the pointer offset in slide space. */
export const cropPan = (top: Shape[], id: Id, st: CropStart, d: Pt): void => {
  const s = findShape(top, id) as Picture | null;
  if (!s || s.kind !== 'picture') return;
  const P = parentOf(top, id);
  const ld = linear(inv(mul(P, frameMatrix(st))), d);
  const img = imageBox(st.w, st.h, st.crop);
  const fx = st.flipH ? -1 : 1, fy = st.flipV ? -1 : 1;
  let nx = img.x + ld.x * fx, ny = img.y + ld.y * fy;
  // Keep the frame covered when the picture is larger than it.
  if (img.w >= st.w) nx = Math.min(0, Math.max(st.w - img.w, nx));
  if (img.h >= st.h) ny = Math.min(0, Math.max(st.h - img.h, ny));
  s.crop = { l: -nx / img.w, t: -ny / img.h, r: (nx + img.w - st.w) / img.w, b: (ny + img.h - st.h) / img.h };
  cleanCrop(s);
};

const cleanCrop = (s: Picture): void => {
  const c = s.crop;
  if (!c) return;
  for (const k of ['l', 't', 'r', 'b'] as const) c[k] = Math.round(c[k] * 1e5) / 1e5;
  if (!c.l && !c.t && !c.r && !c.b) delete s.crop;
};

// ---------- Duplicate drag ----------

/** Inserts copies (already given fresh ids) after their originals and moves them. */
export const placeCopies = (top: Shape[], pairs: { from: Id; copy: Shape }[], dx: number, dy: number): void => {
  for (const { from, copy } of pairs) {
    const chain = ancestorsOf(top, from);
    const list = chain && chain.length ? (chain[chain.length - 1] as Group).children : top;
    const i = list.findIndex((x) => x.id === from);
    const c = structuredClone(copy);
    const d = linear(inv(parentMatrix(chain ?? [])), { x: dx, y: dy });
    c.x += d.x; c.y += d.y;
    list.splice(i < 0 ? list.length : i + 1, 0, c);
  }
  refit(top, pairs.map((p) => p.copy.id));
};

// ---------- Table cells ----------

/** The table cell (anchor of merges) under a slide point. */
export const cellAt = (top: Shape[], id: Id, p: Pt): { r: number; c: number } | null => {
  const t = findShape(top, id);
  if (!t || t.kind !== 'table') return null;
  const l = apply(inv(mul(parentOf(top, id), frameMatrix(t))), p);
  let x = 0, c = -1;
  for (let i = 0; i < t.cols.length; i++) { if (l.x >= x && l.x < x + t.cols[i]!) { c = i; break; } x += t.cols[i]!; }
  let y = 0, r = -1;
  for (let i = 0; i < t.rows.length; i++) { if (l.y >= y && l.y < y + t.rows[i]!.h) { r = i; break; } y += t.rows[i]!.h; }
  if (c < 0) c = l.x < 0 ? 0 : t.cols.length - 1;
  if (r < 0) r = l.y < 0 ? 0 : t.rows.length - 1;
  if (r < 0 || c < 0) return null;
  // Walk back to the cell that starts a merge.
  while (c > 0 && t.rows[r]?.cells[c]?.hMerge) c--;
  while (r > 0 && t.rows[r]?.cells[c]?.vMerge) r--;
  return { r, c };
};

export const cellRect = (t: Shape, r: number, c: number): Box => {
  if (t.kind !== 'table') return { x: 0, y: 0, w: t.w, h: t.h };
  const cell = t.rows[r]?.cells[c];
  const x = t.cols.slice(0, c).reduce((a, b) => a + b, 0), y = t.rows.slice(0, r).reduce((a, b) => a + b.h, 0);
  const w = t.cols.slice(c, c + (cell?.gridSpan ?? 1)).reduce((a, b) => a + b, 0), h = t.rows.slice(r, r + (cell?.rowSpan ?? 1)).reduce((a, b) => a + b.h, 0);
  return { x, y, w, h };
};

export const selectionBox = (top: Shape[], ids: Id[]): Box => unionBox(ids.map((id) => findShape(top, id)).filter((s): s is Shape => !!s).map((s) => slideBoxOf(top, s)));

export { isLineShape };
