import type { Box } from './geom';

/** Snapping for moves and resizes: grid, drawing guides and smart guides to other shapes' edges and centres. */

export interface SnapOpts {
  grid?: number;
  /** Snap to the grid. */
  toGrid: boolean;
  /** Drawing guides (slide px). */
  guides: { x: number[]; y: number[] };
  /** Other shapes' boxes and the slide box, for smart guides. */
  targets: Box[];
  slide: { w: number; h: number };
  toShapes: boolean;
  /** Snap distance in slide px. */
  tol: number;
}

/** A guide line to draw: vertical (x set) or horizontal (y set) from a to b along the other axis. */
export interface SnapLine { axis: 'x' | 'y'; at: number; from: number; to: number; kind: 'shape' | 'slide' | 'guide' }
/** An equal-spacing hint between two gaps. */
export interface SpaceHint { axis: 'x' | 'y'; a: [number, number]; b: [number, number]; at: number }

export interface SnapResult { dx: number; dy: number; lines: SnapLine[]; spacing: SpaceHint[] }

interface Cand { v: number; kind: SnapLine['kind']; span: [number, number] }

const edges = (b: Box, axis: 'x' | 'y'): number[] => axis === 'x' ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h];

const best1 = (vals: number[], cands: Cand[], tol: number): { d: number; hits: { v: number; c: Cand }[] } | null => {
  let bestD = Infinity;
  for (const v of vals) for (const c of cands) { const d = c.v - v; if (Math.abs(d) <= tol && Math.abs(d) < Math.abs(bestD)) bestD = d; }
  if (!Number.isFinite(bestD)) return null;
  const hits: { v: number; c: Cand }[] = [];
  for (const v of vals) for (const c of cands) if (Math.abs(c.v - v - bestD) < 0.5) hits.push({ v: v + bestD, c });
  return { d: bestD, hits };
};

const gridSnap = (vals: number[], g: number, tol: number): number | null => {
  let bestD = Infinity;
  for (const v of vals) { const d = Math.round(v / g) * g - v; if (Math.abs(d) <= tol && Math.abs(d) < Math.abs(bestD)) bestD = d; }
  return Number.isFinite(bestD) ? bestD : null;
};

/**
 * Snaps a moving box. `edgesOnly` limits which of the box's lines may snap for each axis
 * (used by resize so only the dragged edge snaps): indexes 0 = start, 1 = centre, 2 = end.
 */
export const snapBox = (box: Box, o: SnapOpts, use: { x: number[]; y: number[] } = { x: [0, 1, 2], y: [0, 1, 2] }): SnapResult => {
  const res: SnapResult = { dx: 0, dy: 0, lines: [], spacing: [] };
  for (const axis of ['x', 'y'] as const) {
    const vals = edges(box, axis).filter((_, i) => use[axis].includes(i));
    if (!vals.length) continue;
    const cands: Cand[] = [];
    const len = axis === 'x' ? o.slide.w : o.slide.h;
    for (const g of o.guides[axis]) cands.push({ v: g, kind: 'guide', span: [0, axis === 'x' ? o.slide.h : o.slide.w] });
    if (o.toShapes) {
      cands.push({ v: len / 2, kind: 'slide', span: [0, axis === 'x' ? o.slide.h : o.slide.w] });
      cands.push({ v: 0, kind: 'slide', span: [0, axis === 'x' ? o.slide.h : o.slide.w] });
      cands.push({ v: len, kind: 'slide', span: [0, axis === 'x' ? o.slide.h : o.slide.w] });
      for (const t of o.targets) {
        const span: [number, number] = axis === 'x' ? [t.y, t.y + t.h] : [t.x, t.x + t.w];
        for (const v of edges(t, axis)) cands.push({ v, kind: 'shape', span });
      }
    }
    const hit = best1(vals, cands, o.tol);
    let d = hit?.d;
    if (d === undefined && o.toGrid && o.grid) d = gridSnap(vals, o.grid, o.tol) ?? undefined;
    if (d === undefined) continue;
    if (axis === 'x') res.dx = d; else res.dy = d;
    if (hit && hit.d === d) {
      const moved = axis === 'x' ? { ...box, x: box.x + d } : { ...box, y: box.y + d };
      const mySpan: [number, number] = axis === 'x' ? [moved.y, moved.y + moved.h] : [moved.x, moved.x + moved.w];
      const seen = new Set<string>();
      for (const h of hit.hits) {
        const key = `${Math.round(h.v * 10)}:${h.c.kind}`;
        if (seen.has(key) && h.c.kind !== 'shape') continue;
        seen.add(key);
        const from = Math.min(mySpan[0], h.c.span[0]), to = Math.max(mySpan[1], h.c.span[1]);
        res.lines.push({ axis, at: h.v, from, to, kind: h.c.kind });
      }
    }
  }
  if (o.toShapes) res.spacing = spacingHints({ ...box, x: box.x + res.dx, y: box.y + res.dy }, o.targets);
  return res;
};

/**
 * Equal-spacing hints: when the gap between the box and its nearest neighbour on one side equals
 * the gap between that neighbour and the next one (or the gap on the other side).
 */
export const spacingHints = (b: Box, targets: Box[], eps = 0.75): SpaceHint[] => {
  const out: SpaceHint[] = [];
  const overlapY = (t: Box) => t.y < b.y + b.h && t.y + t.h > b.y;
  const overlapX = (t: Box) => t.x < b.x + b.w && t.x + t.w > b.x;
  const row = targets.filter(overlapY), col = targets.filter(overlapX);
  const left = row.filter((t) => t.x + t.w <= b.x + 0.01).sort((p, q) => q.x + q.w - (p.x + p.w));
  const right = row.filter((t) => t.x >= b.x + b.w - 0.01).sort((p, q) => p.x - q.x);
  const up = col.filter((t) => t.y + t.h <= b.y + 0.01).sort((p, q) => q.y + q.h - (p.y + p.h));
  const down = col.filter((t) => t.y >= b.y + b.h - 0.01).sort((p, q) => p.y - q.y);
  const midY = b.y + b.h / 2, midX = b.x + b.w / 2;
  const L = left[0], R = right[0], U = up[0], D = down[0];
  if (L && R) {
    const g1 = b.x - (L.x + L.w), g2 = R.x - (b.x + b.w);
    if (Math.abs(g1 - g2) <= eps) out.push({ axis: 'x', a: [L.x + L.w, b.x], b: [b.x + b.w, R.x], at: midY });
  }
  if (L && left[1]) {
    const L2 = left[1], g1 = b.x - (L.x + L.w), g2 = L.x - (L2.x + L2.w);
    if (g2 > 0 && Math.abs(g1 - g2) <= eps) out.push({ axis: 'x', a: [L2.x + L2.w, L.x], b: [L.x + L.w, b.x], at: midY });
  }
  if (R && right[1]) {
    const R2 = right[1], g1 = R.x - (b.x + b.w), g2 = R2.x - (R.x + R.w);
    if (g2 > 0 && Math.abs(g1 - g2) <= eps) out.push({ axis: 'x', a: [b.x + b.w, R.x], b: [R.x + R.w, R2.x], at: midY });
  }
  if (U && D) {
    const g1 = b.y - (U.y + U.h), g2 = D.y - (b.y + b.h);
    if (Math.abs(g1 - g2) <= eps) out.push({ axis: 'y', a: [U.y + U.h, b.y], b: [b.y + b.h, D.y], at: midX });
  }
  if (U && up[1]) {
    const U2 = up[1], g1 = b.y - (U.y + U.h), g2 = U.y - (U2.y + U2.h);
    if (g2 > 0 && Math.abs(g1 - g2) <= eps) out.push({ axis: 'y', a: [U2.y + U2.h, U.y], b: [U.y + U.h, b.y], at: midX });
  }
  if (D && down[1]) {
    const D2 = down[1], g1 = D.y - (b.y + b.h), g2 = D2.y - (D.y + D.h);
    if (g2 > 0 && Math.abs(g1 - g2) <= eps) out.push({ axis: 'y', a: [b.y + b.h, D.y], b: [D.y + D.h, D2.y], at: midX });
  }
  return out;
};

/** Snaps a single point (line ends, tools) to grid, guides and targets' edges/centres. */
export const snapPoint = (p: { x: number; y: number }, o: SnapOpts): { x: number; y: number; lines: SnapLine[] } => {
  const r = snapBox({ x: p.x, y: p.y, w: 0, h: 0 }, o, { x: [0], y: [0] });
  return { x: p.x + r.dx, y: p.y + r.dy, lines: r.lines };
};

/** Pixels to inches with two decimals, for the size tooltip. */
export const inches = (px: number): string => `${(Math.round((px / 96) * 100) / 100).toFixed(2)}"`;
