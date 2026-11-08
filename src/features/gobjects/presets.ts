/**
 * Shapes that aren't in the ECMA-376 preset list: speech bubbles, a burst, a diagonal arrow and a
 * thought bubble. They draw like presets (adjustable, with handles) and are saved to files as
 * custom geometry, so other apps show them too.
 */
import { ellipseD, fmt, L, M, poly, registerPreset, type GeomResult, type PresetInfo } from '../../render/geometry';

type Adj = Record<string, number>;
type Pt = [number, number];
type Handle = NonNullable<GeomResult['handles']>[number] & { adjY?: string };

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const P = (p: Pt) => `${fmt(p[0])} ${fmt(p[1])}`;

/** Callout tip from adj1 / adj2 (offset from the centre in 1/100000 of the width and height). */
const tipOf = (w: number, h: number, adj: Adj): Pt => [w / 2 + (w * (adj.adj1 ?? 0)) / 100000, h / 2 + (h * (adj.adj2 ?? 0)) / 100000];
const tipHandle = (t: Pt): Handle => ({ x: t[0], y: t[1], adj: 'adj1', axis: 'xy', adjY: 'adj2' });

/** A soft tail from b1 out to the tip and back to b2. */
const tail = (b1: Pt, t: Pt, b2: Pt): string => {
  const k1 = lerp(lerp(b1, t, 0.5), b2, 0.18);
  const k2 = lerp(lerp(b2, t, 0.5), b1, 0.04);
  return `${L(b1[0], b1[1])}Q${P(k1)} ${P(t)}Q${P(k2)} ${P(b2)}`;
};

const speech = (w: number, h: number, adj: Adj): GeomResult => {
  const r = (Math.min(w, h) * clamp(adj.adj3 ?? 16667, 0, 50000)) / 100000;
  const t = tipOf(w, h, adj);
  const inside = t[0] >= 0 && t[0] <= w && t[1] >= 0 && t[1] <= h;
  const dx = (t[0] - w / 2) / w, dy = (t[1] - h / 2) / h;
  const edge = inside ? '' : Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'b' : 't') : dx > 0 ? 'r' : 'l';
  const span = (len: number) => Math.min(Math.min(w, h) * 0.24, Math.max(4, len - 2 * r));
  const arc = (x: number, y: number) => (r > 0.4 ? `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x)} ${fmt(y)}` : L(x, y));
  let d = M(r, 0);
  if (edge === 't') { const bw = span(w), c = clamp(t[0], r + bw / 2, w - r - bw / 2); d += tail([c - bw / 2, 0], t, [c + bw / 2, 0]); }
  d += L(w - r, 0) + arc(w, r);
  if (edge === 'r') { const bw = span(h), c = clamp(t[1], r + bw / 2, h - r - bw / 2); d += tail([w, c - bw / 2], t, [w, c + bw / 2]); }
  d += L(w, h - r) + arc(w - r, h);
  if (edge === 'b') { const bw = span(w), c = clamp(t[0], r + bw / 2, w - r - bw / 2); d += tail([c + bw / 2, h], t, [c - bw / 2, h]); }
  d += L(r, h) + arc(0, h - r);
  if (edge === 'l') { const bw = span(h), c = clamp(t[1], r + bw / 2, h - r - bw / 2); d += tail([0, c + bw / 2], t, [0, c - bw / 2]); }
  d += L(0, r) + arc(r, 0) + 'Z';
  const i = r * 0.29289;
  return {
    paths: [{ d }], text: { x: i, y: i, w: w - 2 * i, h: h - 2 * i },
    sites: [[w / 2, 0], [0, h / 2], [w / 2, h], [w, h / 2], t],
    handles: [tipHandle(t), { x: r, y: 0, adj: 'adj3', axis: 'x', min: 0, max: 50000 }],
  };
};

const ovalSpeech = (w: number, h: number, adj: Adj): GeomResult => {
  const rx = w / 2, ry = h / 2, cx = rx, cy = ry;
  const t = tipOf(w, h, adj);
  const ux = (t[0] - cx) / rx, uy = (t[1] - cy) / ry;
  const i = 0.14645;
  const text = { x: w * i, y: h * i, w: w * (1 - 2 * i), h: h * (1 - 2 * i) };
  const handles = [tipHandle(t)];
  if (ux * ux + uy * uy <= 1) return { paths: [{ d: ellipseD(cx, cy, rx, ry) }], text, handles, sites: [[w / 2, 0], [0, h / 2], [w / 2, h], [w, h / 2]] };
  const th = Math.atan2(uy, ux), dl = 0.2;
  const at = (a: number): Pt => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  const p1 = at(th - dl), p2 = at(th + dl);
  const d = `M${P(p2)}A${fmt(rx)} ${fmt(ry)} 0 1 1 ${P(p1)}${tail(p1, t, p2).slice(L(p1[0], p1[1]).length)}Z`;
  return { paths: [{ d }], text, handles, sites: [[w / 2, 0], [0, h / 2], [w / 2, h], [w, h / 2], t] };
};

const thought = (w: number, h: number, adj: Adj): GeomResult => {
  const cx = w / 2, cy = h / 2, rx = w * 0.44, ry = h * 0.42;
  const n = 10;
  const jit = [0, 0.12, -0.08, 0.1, -0.05, 0.08, -0.1, 0.06, -0.04, 0.09];
  const pts: Pt[] = Array.from({ length: n }, (_, k) => {
    const a = ((k + jit[k]!) / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
  let d = `M${P(pts[0]!)}`;
  pts.forEach((p, k) => {
    const q = pts[(k + 1) % n]!;
    const rr = Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.62;
    d += `A${fmt(rr)} ${fmt(rr)} 0 0 1 ${P(q)}`;
  });
  d += 'Z';
  const t = tipOf(w, h, adj);
  const ux = (t[0] - cx) / (w / 2), uy = (t[1] - cy) / (h / 2);
  if (ux * ux + uy * uy > 1) {
    const a = Math.atan2(uy, ux);
    const e: Pt = [cx + (w / 2) * Math.cos(a), cy + (h / 2) * Math.sin(a)];
    const ss = Math.min(w, h);
    ([[0.22, 0.085], [0.6, 0.06], [1, 0.04]] as const).forEach(([k, rad]) => {
      const c = lerp(e, t, k);
      d += ellipseD(c[0], c[1], ss * rad, ss * rad);
    });
  }
  const i = 0.2;
  return { paths: [{ d }], text: { x: w * i, y: h * i, w: w * (1 - 2 * i), h: h * (1 - 2 * i) }, handles: [tipHandle(t)], sites: [[w / 2, 0], [0, h / 2], [w / 2, h], [w, h / 2]] };
};

const OUTER = [1, 0.84, 0.97, 0.78, 1, 0.9, 0.82, 0.98, 0.8, 0.94, 0.86, 0.92];
const INNER = [0.6, 0.66, 0.56, 0.64, 0.58, 0.68, 0.6, 0.55, 0.65, 0.59, 0.63, 0.57];
const SKEW = [0, 4, -3, 5, -2, 3, -5, 2, 4, -4, 1, -3];

const starburst = (w: number, h: number): GeomResult => {
  const pts: Pt[] = [];
  for (let k = 0; k < 12; k++) {
    const a = ((k * 30 + SKEW[k]! - 90) * Math.PI) / 180;
    const b = ((k * 30 + 15 + SKEW[(k + 5) % 12]! * 0.6 - 90) * Math.PI) / 180;
    pts.push([w / 2 + (w / 2) * OUTER[k]! * Math.cos(a), h / 2 + (h / 2) * OUTER[k]! * Math.sin(a)]);
    pts.push([w / 2 + (w / 2) * INNER[k]! * Math.cos(b), h / 2 + (h / 2) * INNER[k]! * Math.sin(b)]);
  }
  const i = 0.27;
  return { paths: [{ d: poly(pts) }], text: { x: w * i, y: h * i, w: w * (1 - 2 * i), h: h * (1 - 2 * i) }, sites: [pts[0]!, pts[6]!, pts[12]!, pts[18]!] };
};

/** Block arrow pointing up and to the right. adj1 = shaft width (% of head), adj2 = head length. */
const arrowNE = (w: number, h: number, adj: Adj): GeomResult => {
  const hw = 0.3, hl = 0.42 * clamp((adj.adj2 ?? 50000) / 50000, 0.2, 1.8), sw = hw * clamp((adj.adj1 ?? 50000) / 100000, 0.05, 0.95);
  const s = Math.SQRT1_2;
  const d: Pt = [s, -s], n: Pt = [s, s];
  const T: Pt = [1, 0], S: Pt = [0, 1];
  const Hc: Pt = [T[0] - d[0] * hl, T[1] - d[1] * hl];
  const off = (p: Pt, k: number): Pt => [p[0] + n[0] * k, p[1] + n[1] * k];
  const unit: Pt[] = [T, off(Hc, hw), off(Hc, sw), off(S, sw), off(S, -sw), off(Hc, -sw), off(Hc, -hw)];
  const xs = unit.map((p) => p[0]), ys = unit.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), sx = w / (Math.max(...xs) - x0), sy = h / (Math.max(...ys) - y0);
  const pts = unit.map(([x, y]): Pt => [(x - x0) * sx, (y - y0) * sy]);
  const mid = lerp(pts[3]!, pts[4]!, 0.5);
  return { paths: [{ d: poly(pts) }], text: { x: w * 0.25, y: h * 0.35, w: w * 0.4, h: h * 0.3 }, sites: [pts[0]!, mid] };
};

/** Our presets, in gallery order, with the category they're listed under. */
export const OWN_PRESETS: (Omit<PresetInfo, 'custom'>)[] = [
  { name: 'speech', label: 'Speech bubble', category: 'Callouts', defaults: { adj1: -20833, adj2: 75000, adj3: 16667 }, fn: speech },
  { name: 'roundedSpeech', label: 'Round speech bubble', category: 'Callouts', defaults: { adj1: -26000, adj2: 78000 }, fn: ovalSpeech },
  { name: 'thoughtBubble', label: 'Thought bubble', category: 'Callouts', defaults: { adj1: -30000, adj2: 95000 }, fn: thought },
  { name: 'starburst', label: 'Burst', category: 'Stars and Banners', fn: (w, h) => starburst(w, h) },
  { name: 'arrowNorthEast', label: 'Diagonal arrow', category: 'Block Arrows', defaults: { adj1: 50000, adj2: 50000 }, fn: arrowNE },
];

export const isOwnPreset = (name: string): boolean => OWN_PRESETS.some((p) => p.name === name);

let registered = false;
export const registerOwnPresets = (): void => {
  if (registered) return;
  registered = true;
  for (const p of OWN_PRESETS) registerPreset({ ...p, custom: true });
};

/** Adjust values that put handle i of one of our presets at (px, py) in the shape's box. */
export const solveOwnHandle = (name: string, w: number, h: number, i: number, px: number, py: number): Adj | null => {
  if (!isOwnPreset(name)) return null;
  if (i === 0 && name !== 'starburst' && name !== 'arrowNorthEast') {
    return { adj1: Math.round(((px - w / 2) / Math.max(1, w)) * 100000), adj2: Math.round(((py - h / 2) / Math.max(1, h)) * 100000) };
  }
  if (name === 'speech' && i === 1) return { adj3: Math.round(clamp((px / Math.max(1, Math.min(w, h))) * 100000, 0, 50000)) };
  return {};
};
