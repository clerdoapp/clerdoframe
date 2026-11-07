import type { InkStroke } from '../../model/deck';

/** Pure ink geometry: smoothing, variable-width outlines, bounds, hit tests and shape recognition. */

export type Pt = [number, number, number?];

/** Drops points closer than `min` px to the previous kept point (keeps the last). */
export const simplify = (pts: Pt[], min = 1.2): Pt[] => {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out.at(-1)!, p = pts[i]!;
    if (Math.hypot(p[0] - a[0], p[1] - a[1]) >= min) out.push(p);
  }
  out.push(pts.at(-1)!);
  return out;
};

/** Chaikin-style smoothing for the centre line (keeps the ends). */
export const smooth = (pts: Pt[], passes = 2): Pt[] => {
  let p = pts;
  for (let k = 0; k < passes && p.length > 2; k++) {
    const out: Pt[] = [p[0]!];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]!, b = p[i + 1]!;
      const pa = a[2] ?? 0.5, pb = b[2] ?? 0.5;
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, pa * 0.75 + pb * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, pa * 0.25 + pb * 0.75]);
    }
    out.push(p.at(-1)!);
    p = out;
  }
  return p;
};

const f = (n: number) => +n.toFixed(2);

/**
 * A filled outline for a variable-width stroke. Width follows pressure (0..1, 0.5 when unknown),
 * tapers slightly at the ends for pens, with round caps.
 */
export const strokeOutline = (s: Pick<InkStroke, 'points' | 'width' | 'tool'>): string => {
  const pts = smooth(simplify(s.points as Pt[]), s.tool === 'highlighter' ? 1 : 2);
  const w = s.width;
  if (!pts.length) return '';
  const radius = (p: Pt, i: number): number => {
    if (s.tool === 'highlighter') return w / 2;
    const pr = p[2] ?? 0.5;
    const base = (w / 2) * (0.45 + pr * 1.1);
    const n = pts.length;
    const taper = s.tool === 'pen' ? Math.min(1, 0.55 + Math.min(i, n - 1 - i) / 6) : 1;
    return Math.max(0.35, base * taper);
  };
  if (pts.length === 1 || (pts.length === 2 && Math.hypot(pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1]) < 0.5)) {
    const p = pts[0]!, r = radius(p, 0);
    return `M${f(p[0] - r)} ${f(p[1])}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
  }
  const left: [number, number][] = [], right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const r = radius(p, i);
    left.push([p[0] - dy * r, p[1] + dx * r]);
    right.push([p[0] + dy * r, p[1] - dx * r]);
  }
  const r0 = radius(pts[0]!, 0), r1 = radius(pts.at(-1)!, pts.length - 1);
  const cap = s.tool === 'highlighter' ? (x: number, y: number) => `L${f(x)} ${f(y)}` : (x: number, y: number, r: number) => `A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y)}`;
  let d = `M${f(left[0]![0])} ${f(left[0]![1])}`;
  for (let i = 1; i < left.length; i++) d += `L${f(left[i]![0])} ${f(left[i]![1])}`;
  d += cap(right.at(-1)![0], right.at(-1)![1], r1);
  for (let i = right.length - 2; i >= 0; i--) d += `L${f(right[i]![0])} ${f(right[i]![1])}`;
  d += cap(left[0]![0], left[0]![1], r0);
  return `${d}Z`;
};

export interface Box { x: number; y: number; w: number; h: number }

export const strokeBounds = (strokes: InkStroke[]): Box | null => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    const r = s.width / 2 + 1;
    for (const p of s.points) { x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r); }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) } : null;
};

const segDist = (px: number, py: number, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
};

/** Whether a point (in the stroke's coordinates) is within `tol` px of the stroke. */
export const hitStroke = (s: InkStroke, x: number, y: number, tol: number): boolean => {
  const pts = s.points as Pt[];
  if (pts.length === 1) return Math.hypot(pts[0]![0] - x, pts[0]![1] - y) <= tol + s.width / 2;
  for (let i = 0; i < pts.length - 1; i++) if (segDist(x, y, pts[i]!, pts[i + 1]!) <= tol + s.width / 2) return true;
  return false;
};

/** Even-odd point-in-polygon. */
export const inPolygon = (x: number, y: number, poly: [number, number][]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
};

// ---------- Shape recognition ----------

export type Recognized =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; arrow: boolean }
  | { kind: 'rect' | 'ellipse' | 'triangle'; x: number; y: number; w: number; h: number; rot?: number }
  | null;

const pathLen = (p: Pt[]): number => p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1]![0], q[1] - p[i - 1]![1]) : 0), 0);

/** Convex hull (monotone chain). */
const hull = (pts: [number, number][]): [number, number][] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2)!, lo.at(-1)!, q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up.at(-2)!, up.at(-1)!, q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
};

const polyArea = (p: [number, number][]): number => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]!; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;

/** Corners of a closed stroke: points where direction turns sharply. */
const corners = (pts: Pt[], size: number): number => {
  const step = Math.max(2, Math.round(pts.length / 40));
  const s = pts.filter((_, i) => i % step === 0);
  let n = 0, cool = 0;
  for (let i = 2; i < s.length - 2; i++) {
    const a = s[i - 2]!, b = s[i]!, c = s[i + 2]!;
    const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(v1[0]!, v1[1]!), l2 = Math.hypot(v2[0]!, v2[1]!);
    if (l1 < size * 0.02 || l2 < size * 0.02) continue;
    const cos = (v1[0]! * v2[0]! + v1[1]! * v2[1]!) / (l1 * l2);
    if (cos < 0.35 && cool <= 0) { n++; cool = 3; } else cool--;
  }
  return n;
};

/** Recognises a single stroke as a line, arrow (with a second stroke for its head), rectangle, ellipse or triangle. */
export const recognize = (strokes: InkStroke[]): Recognized => {
  const s = strokes[0];
  if (!s || s.points.length < 4) return null;
  const pts = s.points as Pt[];
  const a = pts[0]!, b = pts.at(-1)!;
  const len = pathLen(pts);
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 12) return null;
  // Straight: chord nearly equals path length.
  if (chord / len > 0.94) {
    const head = strokes[1];
    return { kind: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], arrow: !!head && head.points.some((p) => Math.hypot(p[0] - b[0], p[1] - b[1]) < Math.max(20, len * 0.2)) };
  }
  // Arrow drawn in one stroke: a straight run then a short hook back near the end.
  const closed = chord < Math.max(18, len * 0.16);
  if (!closed) return null;
  const xy = pts.map((p): [number, number] => [p[0], p[1]]);
  const h = hull(xy);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, hh = Math.max(...ys) - y;
  if (w < 10 || hh < 10) return null;
  const fillRatio = polyArea(h) / (w * hh);
  const nc = corners(pts, Math.max(w, hh));
  if (fillRatio > 0.86 && nc >= 3) return { kind: 'rect', x, y, w, h: hh };
  if (fillRatio < 0.62 && fillRatio > 0.38) return { kind: 'triangle', x, y, w, h: hh };
  if (fillRatio >= 0.68 && fillRatio <= 0.86) return { kind: 'ellipse', x, y, w, h: hh };
  if (fillRatio > 0.86) return { kind: 'rect', x, y, w, h: hh };
  return null;
};
