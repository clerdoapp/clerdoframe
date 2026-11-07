/** Minimal SVG path sampler (M L H V C S Q T A Z, absolute and relative) with no DOM, for motion paths. */

export type Pt = [number, number];

const tokenize = (d: string): (string | number)[] => {
  const out: (string | number)[] = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push(m[1] ? m[1] : parseFloat(m[2]!));
  return out;
};

const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
};
const quad = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};

const arcPoints = (p0: Pt, rx: number, ry: number, phiDeg: number, large: number, sweep: number, p1: Pt, n: number): Pt[] => {
  if (!rx || !ry) return [p1];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let k = Math.sqrt(Math.max(0, num / (den || 1)));
  if (large === sweep) k = -k;
  const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2, cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= Math.PI * 2;
  else if (sweep && dt < 0) dt += Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    const x = rx * Math.cos(t), y = ry * Math.sin(t);
    pts.push([cos * x - sin * y + cx, sin * x + cos * y + cy]);
  }
  return pts;
};

/** Flattens a path into a polyline. */
export const flatten = (d: string, seg = 16): Pt[] => {
  const t = tokenize(d);
  const pts: Pt[] = [];
  let i = 0;
  let cmd = '';
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastCtrl: Pt | null = null;
  let lastCmd = '';
  const num = (): number => { const v = t[i++]; return typeof v === 'number' ? v : 0; };
  while (i < t.length) {
    if (typeof t[i] === 'string') cmd = t[i++] as string;
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cur[0] : 0, oy = rel ? cur[1] : 0;
    if (C === 'Z') {
      if (cur[0] !== start[0] || cur[1] !== start[1]) pts.push([...start]);
      cur = [...start]; lastCtrl = null; lastCmd = 'Z';
      cmd = '';
      continue;
    }
    if (C === 'M') {
      cur = [ox + num(), oy + num()]; start = [...cur]; pts.push([...cur]);
      cmd = rel ? 'l' : 'L'; lastCtrl = null; lastCmd = 'M';
      continue;
    }
    if (C === 'L') { cur = [ox + num(), oy + num()]; pts.push([...cur]); lastCtrl = null; }
    else if (C === 'H') { cur = [rel ? cur[0] + num() : num(), cur[1]]; pts.push([...cur]); lastCtrl = null; }
    else if (C === 'V') { cur = [cur[0], rel ? cur[1] + num() : num()]; pts.push([...cur]); lastCtrl = null; }
    else if (C === 'C' || C === 'S') {
      let c1: Pt;
      if (C === 'C') c1 = [ox + num(), oy + num()];
      else c1 = lastCtrl && (lastCmd === 'C' || lastCmd === 'S') ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : [...cur];
      const c2: Pt = [ox + num(), oy + num()];
      const e: Pt = [ox + num(), oy + num()];
      for (let k = 1; k <= seg; k++) pts.push(cubic(cur, c1, c2, e, k / seg));
      lastCtrl = c2; cur = e;
    } else if (C === 'Q' || C === 'T') {
      let c1: Pt;
      if (C === 'Q') c1 = [ox + num(), oy + num()];
      else c1 = lastCtrl && (lastCmd === 'Q' || lastCmd === 'T') ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : [...cur];
      const e: Pt = [ox + num(), oy + num()];
      for (let k = 1; k <= seg; k++) pts.push(quad(cur, c1, e, k / seg));
      lastCtrl = c1; cur = e;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), large = num(), sweep = num();
      const e: Pt = [ox + num(), oy + num()];
      pts.push(...arcPoints(cur, rx, ry, rot, large, sweep, e, seg * 2));
      cur = e; lastCtrl = null;
    } else { i++; }
    lastCmd = C;
  }
  if (!pts.length) pts.push([0, 0]);
  return pts;
};

export interface Sampled { pts: Pt[]; cum: number[]; len: number }

const cache = new Map<string, Sampled>();
export const sample = (d: string): Sampled => {
  const hit = cache.get(d);
  if (hit) return hit;
  const pts = flatten(d);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1]! + Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]));
  const s = { pts, cum, len: cum[cum.length - 1]! };
  if (cache.size > 200) cache.clear();
  cache.set(d, s);
  return s;
};

/** Point at fraction f (0..1) of the path's length. */
export const pointAt = (d: string, f: number): Pt => {
  const s = sample(d);
  if (s.pts.length === 1 || s.len === 0) return s.pts[0]!;
  const target = Math.max(0, Math.min(1, f)) * s.len;
  let lo = 0, hi = s.cum.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (s.cum[mid]! < target) lo = mid; else hi = mid; }
  const a = s.pts[lo]!, b = s.pts[hi]!;
  const segLen = s.cum[hi]! - s.cum[lo]!;
  const k = segLen ? (target - s.cum[lo]!) / segLen : 0;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
};

/** Start and end point of a path. */
export const ends = (d: string): [Pt, Pt] => { const s = sample(d); return [s.pts[0]!, s.pts[s.pts.length - 1]!]; };

/** Moves the path's last point (for editable end points). */
export const withEnd = (d: string, end: Pt): string => {
  const s = sample(d);
  const [x0, y0] = s.pts[0]!;
  const [x1, y1] = s.pts[s.pts.length - 1]!;
  const sx = x1 - x0 ? (end[0] - x0) / (x1 - x0) : 1, sy = y1 - y0 ? (end[1] - y0) / (y1 - y0) : 1;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || (x1 === x0 && y1 === y0)) return `${d} L${end[0]} ${end[1]}`;
  // Scale the polyline so its end lands on the new point; keeps the shape of simple paths.
  const fx = x1 - x0 ? sx : 1, fy = y1 - y0 ? sy : 1;
  return `M${s.pts.map(([x, y]) => `${r(x0 + (x - x0) * fx)} ${r(y0 + (y - y0) * fy)}`).join(' L')}`;
};
const r = (n: number): number => Math.round(n * 10) / 10;
