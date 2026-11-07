/**
 * Animation effect library. Pure functions: given progress p (0..1, already eased) and the shape's
 * box, return how the shape looks. Entrance effects end at the identity; exits play an entrance in
 * reverse; emphasis effects evaluated at p = 1 give their lasting result.
 */
import type { AnimClass } from '../../model/deck';

export interface Box { x: number; y: number; w: number; h: number }
/** A polygon in the shape's unit box (0..1 on both axes). */
export type Poly = [number, number][];

export interface Fx {
  opacity?: number;
  tx?: number;
  ty?: number;
  sx?: number;
  sy?: number;
  rot?: number;
  skewX?: number;
  /** Visible region, in the untransformed unit box. Polygons combine even-odd. */
  clip?: Poly[];
  filter?: string;
  /** Colour overrides: target colour and how far to blend toward it. */
  colors?: { fill?: [string, number]; stroke?: [string, number]; font?: [string, number] };
  bold?: boolean;
  underline?: boolean;
}

export interface FxCtx {
  box: Box;
  /** Slide size. */
  W: number;
  H: number;
  option?: string;
  value?: string | number;
  /** Stable per-shape seed for "random" effects. */
  seed: number;
}

export type FxFn = (p: number, c: FxCtx) => Fx;

// ---------- Geometry helpers ----------

const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const FULL: Poly = rect(-0.01, -0.01, 1.01, 1.01);
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 48): Poly =>
  Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number]; });
/** Pie slice from angle a0 to a1 (degrees, 0 = up, clockwise). */
const pie = (cx: number, cy: number, r: number, a0: number, a1: number): Poly => {
  if (a1 - a0 <= 0.01) return [];
  const pts: Poly = [[cx, cy]];
  const n = Math.max(2, Math.ceil((a1 - a0) / 6));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + Math.sin(a) * r, cy - Math.cos(a) * r]);
  }
  return pts;
};
const diamond = (s: number): Poly => [[0.5, 0.5 - s], [0.5 + s, 0.5], [0.5, 0.5 + s], [0.5 - s, 0.5]];
const plusPoly = (s: number): Poly => {
  const a = 0.5 - s, b = 0.5 + s, t = s * 0.42;
  const c = 0.5 - t, d = 0.5 + t;
  return [[c, a], [d, a], [d, c], [b, c], [b, d], [d, d], [d, b], [c, b], [c, d], [a, d], [a, c], [c, c]];
};
const clipOf = (polys: Poly[]): Fx => ({ clip: polys.filter((x) => x.length >= 3) });
/** "In" variants: everything but the shape, shrinking toward the centre. */
const inverse = (poly: Poly): Poly[] => [FULL, poly];

export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
export const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Random ranks 0..n-1 for n items. */
const ranks = (n: number, seed: number): number[] => {
  const r = rng(seed);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
  const out = new Array<number>(n);
  idx.forEach((v, k) => { out[v] = k; });
  return out;
};

/** Merges a row of visible flags into rectangles. */
const runs = (on: boolean[], make: (a: number, b: number) => Poly): Poly[] => {
  const out: Poly[] = [];
  let s = -1;
  for (let i = 0; i <= on.length; i++) {
    if (i < on.length && on[i]) { if (s < 0) s = i; } else if (s >= 0) { out.push(make(s / on.length, i / on.length)); s = -1; }
  }
  return out;
};

export const bounceOut = (t: number): number => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
  if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
  t -= 2.625 / d; return n * t * t + 0.984375;
};

// ---------- Fly directions ----------

/** Offset that puts the box just outside the slide on the given side. */
const offSlide = (dir: string, c: FxCtx): [number, number] => {
  const { box: b, W, H } = c;
  const L = -(b.x + b.w) - 4, R = W - b.x + 4, T = -(b.y + b.h) - 4, B = H - b.y + 4;
  switch (dir) {
    case 't': return [0, T];
    case 'l': return [L, 0];
    case 'r': return [R, 0];
    case 'tl': return [L, T];
    case 'tr': return [R, T];
    case 'bl': return [L, B];
    case 'br': return [R, B];
    default: return [0, B];
  }
};

// ---------- Entrance ----------

const shapeReveal = (p: number, kind: string, out: boolean): Fx => {
  // out: grows from the centre; in: closes in from the edges.
  const s = out ? p : 1 - p;
  let poly: Poly;
  if (kind === 'circle') poly = ellipse(0.5, 0.5, 0.71 * s, 0.71 * s);
  else if (kind === 'diamond') poly = diamond(s);
  else if (kind === 'plus') poly = plusPoly(s * 1.2);
  else poly = rect(0.5 - s / 2, 0.5 - s / 2, 0.5 + s / 2, 0.5 + s / 2);
  return clipOf(out ? [poly] : inverse(poly));
};

const strips = (p: number, dir: string): Fx => {
  // Diagonal wipe from a corner: x + y <= 2p in the rotated frame.
  const k = p * 2;
  const tri = (fx: (x: number, y: number) => [number, number]): Poly => {
    const pts: Poly = k <= 1 ? [[0, 0], [k, 0], [0, k]] : [[0, 0], [1, 0], [1, k - 1], [k - 1, 1], [0, 1]];
    return pts.map(([x, y]) => fx(x, y));
  };
  const map: Record<string, (x: number, y: number) => [number, number]> = {
    rd: (x, y) => [x, y], ld: (x, y) => [1 - x, y], ru: (x, y) => [x, 1 - y], lu: (x, y) => [1 - x, 1 - y],
  };
  return clipOf([tri(map[dir] ?? map.rd!)]);
};

const ENTR: Record<string, FxFn> = {
  appear: (p) => ({ opacity: p > 0 ? 1 : 0 }),
  fade: (p) => ({ opacity: p }),
  flyIn: (p, c) => { const [dx, dy] = offSlide(c.option ?? 'b', c); return { tx: dx * (1 - p), ty: dy * (1 - p) }; },
  floatIn: (p, c) => ({ opacity: p, ty: (c.option === 'd' ? -1 : 1) * c.H * 0.08 * (1 - p) }),
  split: (p, c) => {
    const o = c.option ?? 'vout';
    const h = o.startsWith('h');
    const inn = o.endsWith('in');
    const a = p / 2;
    if (!inn) return clipOf([h ? rect(0, 0.5 - a, 1, 0.5 + a) : rect(0.5 - a, 0, 0.5 + a, 1)]);
    return clipOf(h ? [rect(0, 0, 1, a), rect(0, 1 - a, 1, 1)] : [rect(0, 0, a, 1), rect(1 - a, 0, 1, 1)]);
  },
  wipe: (p, c) => {
    switch (c.option ?? 'b') {
      case 't': return clipOf([rect(0, 0, 1, p)]);
      case 'l': return clipOf([rect(0, 0, p, 1)]);
      case 'r': return clipOf([rect(1 - p, 0, 1, 1)]);
      default: return clipOf([rect(0, 1 - p, 1, 1)]);
    }
  },
  shape: (p, c) => { const [kind = 'circle', dir = 'out'] = (c.option ?? 'circle-out').split('-'); return shapeReveal(p, kind, dir !== 'in'); },
  circle: (p, c) => shapeReveal(p, 'circle', c.option !== 'in'),
  diamond: (p, c) => shapeReveal(p, 'diamond', c.option !== 'in'),
  plus: (p, c) => shapeReveal(p, 'plus', c.option !== 'in'),
  box: (p, c) => shapeReveal(p, 'box', c.option !== 'in'),
  wheel: (p, c) => {
    const n = Math.max(1, Number(c.option) || 1);
    const step = 360 / n;
    return clipOf(Array.from({ length: n }, (_, k) => pie(0.5, 0.5, 0.75, k * step, k * step + p * step)));
  },
  wedge: (p) => clipOf([pie(0.5, 0.5, 0.75, -180 * p, 180 * p)]),
  randomBars: (p, c) => {
    const n = 48;
    const r = ranks(n, c.seed);
    const on = r.map((k) => k < p * n);
    const v = c.option === 'v';
    return clipOf(runs(on, (a, b) => (v ? rect(a, 0, b, 1) : rect(0, a, 1, b))));
  },
  blinds: (p, c) => {
    const n = 6;
    const v = c.option === 'v';
    return clipOf(Array.from({ length: n }, (_, i) => { const a = i / n, b = a + p / n; return v ? rect(a, 0, b, 1) : rect(0, a, 1, b); }));
  },
  checkerboard: (p, c) => {
    const n = 8;
    const polys: Poly[] = [];
    const down = c.option === 'v';
    for (let row = 0; row < n; row++) {
      for (let k = 0; k < n; k++) {
        // Each cell is two half-cells; odd rows start half a cell later.
        const off = (row % 2) * 0.5;
        const local = Math.max(0, Math.min(1, p * (n + 0.5) - k - off + 0.5 * 0)) ;
        const fill = Math.max(0, Math.min(1, local));
        if (fill <= 0) continue;
        const a = k / n, b = (k + fill) / n;
        polys.push(down ? rect(row / n, a, (row + 1) / n, b) : rect(a, row / n, b, (row + 1) / n));
      }
    }
    return clipOf(polys);
  },
  dissolveIn: (p, c) => {
    const cols = 16, rows = 10;
    const r = ranks(cols * rows, c.seed);
    const polys: Poly[] = [];
    for (let y = 0; y < rows; y++) {
      const on = Array.from({ length: cols }, (_, x) => r[y * cols + x]! < p * cols * rows);
      for (const poly of runs(on, (a, b) => rect(a, y / rows, b, (y + 1) / rows))) polys.push(poly);
    }
    return clipOf(polys);
  },
  peek: (p, c) => {
    const b = c.box;
    const o = c.option ?? 'b';
    const f = 1 - p;
    return { clip: [FULL], tx: o === 'l' ? -b.w * f : o === 'r' ? b.w * f : 0, ty: o === 't' ? -b.h * f : o === 'b' ? b.h * f : 0 };
  },
  strips: (p, c) => strips(p, c.option ?? 'rd'),
  growTurn: (p) => ({ sx: p, sy: p, rot: -90 * (1 - p), opacity: Math.min(1, p * 2) }),
  zoom: (p, c) => {
    if (c.option === 'slide') {
      const dx = c.W / 2 - (c.box.x + c.box.w / 2), dy = c.H / 2 - (c.box.y + c.box.h / 2);
      return { sx: p, sy: p, tx: dx * (1 - p), ty: dy * (1 - p), opacity: p };
    }
    return { sx: p, sy: p, opacity: p };
  },
  swivel: (p, c) => { const a = (1 - p) * Math.PI * 3; return c.option === 'v' ? { sy: Math.cos(a) || 0.001, opacity: p } : { sx: Math.cos(a) || 0.001, opacity: p }; },
  bounce: (p, c) => ({ tx: -c.W * 0.12 * (1 - p), ty: -c.H * 0.35 * (1 - bounceOut(p)), opacity: Math.min(1, p * 4) }),
  expand: (p) => ({ sx: 0.4 + 0.6 * p, opacity: p }),
  fadedZoom: (p) => ({ sx: 0.6 + 0.4 * p, sy: 0.6 + 0.4 * p, opacity: p }),
  riseUp: (p, c) => { const k = 1 - p; const over = Math.sin(p * Math.PI) * 0.04; return { ty: c.H * (0.2 * k * k - over * 0.3), opacity: Math.min(1, p * 2) }; },
  compress: (p) => ({ sy: 1 + 1.6 * (1 - p), sx: 1 - 0.3 * (1 - p), opacity: p }),
  centerRevolve: (p, c) => { const a = (1 - p) * Math.PI; const R = c.W * 0.18; return { tx: -R * Math.sin(a), ty: R * (1 - Math.cos(a)) * 0.6, opacity: p }; },
  spinner: (p) => ({ rot: -360 * (1 - p), sx: 0.3 + 0.7 * p, sy: 0.3 + 0.7 * p, opacity: p }),
  stretch: (p, c) => (c.option === 'v' ? { sy: p, opacity: Math.min(1, p * 3) } : c.option === 'h' ? { sx: p, opacity: Math.min(1, p * 3) } : { sx: p, sy: 0.4 + 0.6 * p, opacity: Math.min(1, p * 3) }),
  basicZoom: (p, c) => {
    const o = c.option ?? 'in';
    const s0 = o === 'out' ? 4 : o === 'inSlightly' ? 0.8 : o === 'outSlightly' ? 1.25 : 0;
    const s = s0 + (1 - s0) * p;
    return { sx: s, sy: s, opacity: p };
  },
  credits: (p, c) => ({ ty: (c.H - c.box.y) * (1 - p) }),
  drop: (p, c) => ({ ty: -c.H * 0.25 * (1 - bounceOut(p)), opacity: Math.min(1, p * 3) }),
  pinwheel: (p) => ({ rot: 720 * (1 - p), sx: p, sy: p, opacity: p }),
  boomerang: (p, c) => { const k = 1 - p; return { tx: c.W * 0.3 * k * Math.cos(k * 2.5), rot: 120 * k, sx: 0.4 + 0.6 * p, sy: 0.4 + 0.6 * p, opacity: p }; },
  curveUp: (p, c) => { const k = 1 - p; return { tx: -c.W * 0.25 * k, ty: c.H * 0.3 * k * k, opacity: p }; },
  flip: (p, c) => ({ sy: Math.cos((1 - p) * Math.PI * 0.5), ty: -c.H * 0.08 * (1 - p), opacity: p }),
  spiralIn: (p, c) => { const k = 1 - p; const a = k * Math.PI * 3; const r = k * Math.min(c.W, c.H) * 0.45; return { tx: r * Math.cos(a), ty: r * Math.sin(a), sx: p, sy: p, opacity: Math.min(1, p * 3) }; },
  thread: (p) => ({ sx: 1 + 3 * (1 - p), sy: 0.05 + 0.95 * p, opacity: p }),
  whip: (p, c) => { const k = 1 - p; return { tx: c.W * 0.35 * k * k, skewX: -35 * k, sx: 1 - 0.3 * k, opacity: p }; },
};

/** Exit names that play a differently-named entrance in reverse. */
const EXIT_OF: Record<string, string> = {
  disappear: 'appear', flyOut: 'flyIn', floatOut: 'floatIn', shrinkTurn: 'growTurn', dissolveOut: 'dissolveIn', peekOut: 'peek',
  contract: 'expand', sinkDown: 'riseUp', collapse: 'stretch', curveDown: 'curveUp', spiralOut: 'spiralIn',
};

// ---------- Emphasis ----------

const asNum = (v: string | number | undefined, d: number): number => { const n = typeof v === 'number' ? v : parseFloat(v ?? ''); return Number.isFinite(n) ? n : d; };
const asColor = (v: string | number | undefined, d: string): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

const EMPH: Record<string, FxFn> = {
  pulse: (p) => { const s = 1 + 0.08 * Math.sin(Math.PI * p); return { sx: s, sy: s }; },
  colorPulse: (p, c) => ({ colors: { fill: [asColor(c.value, '#F5A623'), Math.sin(Math.PI * p)], font: [asColor(c.value, '#F5A623'), Math.sin(Math.PI * p)] } }),
  teeter: (p) => ({ rot: 8 * Math.sin(p * Math.PI * 4) * (1 - p * 0.3) * (p < 1 ? 1 : 0) }),
  spin: (p, c) => ({ rot: asNum(c.value, 360) * (c.option === 'ccw' ? -1 : 1) * p }),
  growShrink: (p, c) => {
    const k = asNum(c.value, 150) / 100;
    const o = c.option ?? 'both';
    const s = 1 + (k - 1) * p;
    return { sx: o === 'v' ? 1 : s, sy: o === 'h' ? 1 : s };
  },
  desaturate: (p) => ({ filter: `grayscale(${p.toFixed(3)})` }),
  darken: (p) => ({ filter: `brightness(${(1 - 0.45 * p).toFixed(3)})` }),
  lighten: (p) => ({ filter: `brightness(${(1 + 0.45 * p).toFixed(3)}) saturate(${(1 - 0.4 * p).toFixed(3)})` }),
  transparency: (p, c) => ({ opacity: 1 - (asNum(c.value, 50) / 100) * p }),
  objectColor: (p, c) => ({ colors: { fill: [asColor(c.value, '#2C7BE5'), p] } }),
  fillColor: (p, c) => ({ colors: { fill: [asColor(c.value, '#2C7BE5'), p] } }),
  lineColor: (p, c) => ({ colors: { stroke: [asColor(c.value, '#E8401C'), p] } }),
  fontColor: (p, c) => ({ colors: { font: [asColor(c.value, '#E8401C'), p] } }),
  complementaryColor: (p) => ({ filter: `hue-rotate(${Math.round(180 * p)}deg)` }),
  underline: (p) => ({ underline: p > 0 }),
  boldFlash: (p) => ({ bold: p > 0 && p < 1 }),
  boldReveal: (p) => ({ bold: p > 0 }),
  wave: (p, c) => ({ ty: -Math.max(8, c.box.h * 0.12) * Math.sin(Math.PI * p) }),
};

// ---------- Catalogue (for menus and galleries) ----------

export interface EffectDef {
  id: string;
  cls: AnimClass;
  label: string;
  options?: [string, string][];
  /** Default eased motion: [smoothStart, smoothEnd]. */
  smooth?: [number, number];
  /** Emphasis that takes a colour, a number or an angle. */
  valueKind?: 'color' | 'percent' | 'angle';
  basic?: boolean;
  dur?: number;
}

const DIR4: [string, string][] = [['b', 'From bottom'], ['l', 'From left'], ['r', 'From right'], ['t', 'From top']];
const DIR8: [string, string][] = [...DIR4, ['bl', 'From bottom left'], ['br', 'From bottom right'], ['tl', 'From top left'], ['tr', 'From top right']];
const INOUT: [string, string][] = [['out', 'Out'], ['in', 'In']];
const HV: [string, string][] = [['h', 'Horizontal'], ['v', 'Vertical']];

const entr: EffectDef[] = [
  { id: 'appear', cls: 'entr', label: 'Appear', basic: true, dur: 0 },
  { id: 'fade', cls: 'entr', label: 'Fade', basic: true },
  { id: 'flyIn', cls: 'entr', label: 'Fly in', options: DIR8, smooth: [0, 0.6], basic: true },
  { id: 'floatIn', cls: 'entr', label: 'Float in', options: [['u', 'Float up'], ['d', 'Float down']], smooth: [0, 0.8], basic: true, dur: 1 },
  { id: 'split', cls: 'entr', label: 'Split', options: [['vout', 'Vertical out'], ['vin', 'Vertical in'], ['hout', 'Horizontal out'], ['hin', 'Horizontal in']], basic: true },
  { id: 'wipe', cls: 'entr', label: 'Wipe', options: DIR4, basic: true },
  { id: 'shape', cls: 'entr', label: 'Shape', options: [['circle-out', 'Circle out'], ['circle-in', 'Circle in'], ['box-out', 'Box out'], ['box-in', 'Box in'], ['diamond-out', 'Diamond out'], ['diamond-in', 'Diamond in'], ['plus-out', 'Plus out'], ['plus-in', 'Plus in']], basic: true },
  { id: 'wheel', cls: 'entr', label: 'Wheel', options: [['1', '1 spoke'], ['2', '2 spokes'], ['3', '3 spokes'], ['4', '4 spokes'], ['8', '8 spokes']], basic: true, dur: 2 },
  { id: 'randomBars', cls: 'entr', label: 'Random bars', options: [['h', 'Horizontal'], ['v', 'Vertical']], basic: true },
  { id: 'growTurn', cls: 'entr', label: 'Grow and turn', smooth: [0, 0.5], basic: true },
  { id: 'zoom', cls: 'entr', label: 'Zoom', options: [['obj', 'Object center'], ['slide', 'Slide center']], smooth: [0, 0.5], basic: true },
  { id: 'swivel', cls: 'entr', label: 'Swivel', options: HV, basic: true, dur: 1 },
  { id: 'bounce', cls: 'entr', label: 'Bounce', basic: true, dur: 2 },
  { id: 'blinds', cls: 'entr', label: 'Blinds', options: HV },
  { id: 'box', cls: 'entr', label: 'Box', options: INOUT },
  { id: 'checkerboard', cls: 'entr', label: 'Checkerboard', options: [['h', 'Across'], ['v', 'Down']], dur: 1 },
  { id: 'circle', cls: 'entr', label: 'Circle', options: INOUT },
  { id: 'diamond', cls: 'entr', label: 'Diamond', options: INOUT },
  { id: 'dissolveIn', cls: 'entr', label: 'Dissolve in' },
  { id: 'peek', cls: 'entr', label: 'Peek in', options: DIR4, smooth: [0, 0.5] },
  { id: 'plus', cls: 'entr', label: 'Plus', options: INOUT },
  { id: 'strips', cls: 'entr', label: 'Strips', options: [['rd', 'Right down'], ['ld', 'Left down'], ['ru', 'Right up'], ['lu', 'Left up']] },
  { id: 'wedge', cls: 'entr', label: 'Wedge' },
  { id: 'expand', cls: 'entr', label: 'Expand', smooth: [0, 0.5] },
  { id: 'fadedZoom', cls: 'entr', label: 'Faded zoom', smooth: [0, 0.5] },
  { id: 'riseUp', cls: 'entr', label: 'Rise up', dur: 1 },
  { id: 'compress', cls: 'entr', label: 'Compress', smooth: [0, 0.5] },
  { id: 'centerRevolve', cls: 'entr', label: 'Center revolve', smooth: [0.2, 0.5], dur: 1 },
  { id: 'spinner', cls: 'entr', label: 'Spinner', smooth: [0, 0.5], dur: 1 },
  { id: 'stretch', cls: 'entr', label: 'Stretch', options: [['across', 'Across'], ['h', 'From left and right'], ['v', 'From top and bottom']] },
  { id: 'basicZoom', cls: 'entr', label: 'Basic zoom', options: [['in', 'In'], ['out', 'Out'], ['inSlightly', 'In slightly'], ['outSlightly', 'Out slightly']], smooth: [0, 0.5] },
  { id: 'credits', cls: 'entr', label: 'Credits', dur: 3 },
  { id: 'drop', cls: 'entr', label: 'Drop', dur: 1 },
  { id: 'pinwheel', cls: 'entr', label: 'Pinwheel', dur: 2 },
  { id: 'boomerang', cls: 'entr', label: 'Boomerang', dur: 1 },
  { id: 'curveUp', cls: 'entr', label: 'Curve up', smooth: [0, 0.6], dur: 1 },
  { id: 'flip', cls: 'entr', label: 'Flip', dur: 1 },
  { id: 'spiralIn', cls: 'entr', label: 'Spiral in', smooth: [0, 0.4], dur: 1.5 },
  { id: 'thread', cls: 'entr', label: 'Thread', smooth: [0, 0.6] },
  { id: 'whip', cls: 'entr', label: 'Whip', smooth: [0, 0.6] },
];

const exitName: Record<string, [string, string]> = {
  appear: ['disappear', 'Disappear'], flyIn: ['flyOut', 'Fly out'], floatIn: ['floatOut', 'Float out'], growTurn: ['shrinkTurn', 'Shrink and turn'],
  dissolveIn: ['dissolveOut', 'Dissolve out'], peek: ['peekOut', 'Peek out'], expand: ['contract', 'Contract'], riseUp: ['sinkDown', 'Sink down'],
  stretch: ['collapse', 'Collapse'], curveUp: ['curveDown', 'Curve down'], spiralIn: ['spiralOut', 'Spiral out'],
};
const toDir = (o: [string, string][] | undefined): [string, string][] | undefined => o?.map(([v, l]) => [v, l.replace(/^From /, 'To ')]);
const exit: EffectDef[] = entr.map((e) => {
  const n = exitName[e.id];
  const smooth: [number, number] | undefined = e.smooth ? [e.smooth[1], e.smooth[0]] : undefined;
  return { ...e, cls: 'exit' as const, id: n ? n[0] : e.id, label: n ? n[1] : e.label, ...(e.id === 'flyIn' || e.id === 'peek' || e.id === 'wipe' ? { options: toDir(e.options) } : {}), ...(smooth ? { smooth } : {}) };
});

const emph: EffectDef[] = [
  { id: 'pulse', cls: 'emph', label: 'Pulse', basic: true, dur: 0.5 },
  { id: 'colorPulse', cls: 'emph', label: 'Color pulse', valueKind: 'color', basic: true },
  { id: 'teeter', cls: 'emph', label: 'Teeter', basic: true, dur: 1 },
  { id: 'spin', cls: 'emph', label: 'Spin', options: [['cw', 'Clockwise'], ['ccw', 'Counterclockwise']], valueKind: 'angle', smooth: [0.25, 0.25], basic: true, dur: 2 },
  { id: 'growShrink', cls: 'emph', label: 'Grow / shrink', options: [['both', 'Both'], ['h', 'Horizontal'], ['v', 'Vertical']], valueKind: 'percent', smooth: [0.25, 0.25], basic: true, dur: 2 },
  { id: 'desaturate', cls: 'emph', label: 'Desaturate', basic: true },
  { id: 'darken', cls: 'emph', label: 'Darken', basic: true },
  { id: 'lighten', cls: 'emph', label: 'Lighten', basic: true },
  { id: 'transparency', cls: 'emph', label: 'Transparency', valueKind: 'percent', basic: true, dur: 0.5 },
  { id: 'objectColor', cls: 'emph', label: 'Object color', valueKind: 'color', basic: true, dur: 2 },
  { id: 'complementaryColor', cls: 'emph', label: 'Complementary color', basic: true },
  { id: 'lineColor', cls: 'emph', label: 'Line color', valueKind: 'color', basic: true, dur: 2 },
  { id: 'fillColor', cls: 'emph', label: 'Fill color', valueKind: 'color', basic: true, dur: 2 },
  { id: 'fontColor', cls: 'emph', label: 'Font color', valueKind: 'color' },
  { id: 'underline', cls: 'emph', label: 'Underline' },
  { id: 'boldFlash', cls: 'emph', label: 'Bold flash' },
  { id: 'boldReveal', cls: 'emph', label: 'Bold reveal' },
  { id: 'wave', cls: 'emph', label: 'Wave', dur: 1 },
];

const LINE_DIRS: [string, string][] = [['d', 'Down'], ['l', 'Left'], ['r', 'Right'], ['u', 'Up']];
const path: EffectDef[] = [
  { id: 'line', cls: 'path', label: 'Lines', options: LINE_DIRS, smooth: [0.5, 0.5], basic: true, dur: 2 },
  { id: 'arc', cls: 'path', label: 'Arcs', options: LINE_DIRS, smooth: [0.5, 0.5], basic: true, dur: 2 },
  { id: 'turn', cls: 'path', label: 'Turns', options: [['dr', 'Down right'], ['dl', 'Down left'], ['ur', 'Up right'], ['ul', 'Up left']], smooth: [0.5, 0.5], basic: true, dur: 2 },
  { id: 'shapes', cls: 'path', label: 'Shapes', options: [['circle', 'Circle'], ['diamond', 'Diamond'], ['triangle', 'Triangle'], ['square', 'Square'], ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['octagon', 'Octagon'], ['heart', 'Heart'], ['star', 'Star'], ['teardrop', 'Teardrop']], smooth: [0.5, 0.5], basic: true, dur: 2 },
  { id: 'loops', cls: 'path', label: 'Loops', options: [['figure8', 'Figure eight'], ['loop', 'Loop'], ['spiral', 'Spiral'], ['wave', 'Wave'], ['zigzag', 'Zigzag'], ['bounce', 'Bounce']], smooth: [0.5, 0.5], basic: true, dur: 2 },
  { id: 'custom', cls: 'path', label: 'Custom path', smooth: [0, 0], basic: true, dur: 2 },
];

export const EFFECTS: EffectDef[] = [...entr, ...emph, ...exit, ...path];
export const effectDef = (cls: AnimClass, id: string): EffectDef | undefined => EFFECTS.find((e) => e.cls === cls && e.id === id);

/** How the effect looks at eased progress p. Motion paths are handled by the timeline. */
export const evalEffect = (cls: AnimClass, id: string, p: number, c: FxCtx): Fx => {
  if (cls === 'entr') return (ENTR[id] ?? ENTR.fade!)(p, c);
  if (cls === 'exit') return (ENTR[EXIT_OF[id] ?? id] ?? ENTR.fade!)(1 - p, c);
  if (cls === 'emph') return (EMPH[id] ?? EMPH.pulse!)(p, c);
  return {};
};

// ---------- Motion path presets ----------

const polyPath = (pts: [number, number][]): string => `M0 0 ${pts.map(([x, y]) => `L${r2(x)} ${r2(y)}`).join(' ')} Z`;
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** A preset motion path, relative to the shape centre (starts at 0,0), sized for the slide. */
export const presetPath = (id: string, option: string | undefined, W: number, H: number): string => {
  const L = Math.round(Math.min(W, H) * 0.3);
  const o = option ?? '';
  if (id === 'line') {
    const [dx, dy] = o === 'u' ? [0, -L] : o === 'l' ? [-L, 0] : o === 'r' ? [L, 0] : [0, L];
    return `M0 0 L${dx} ${dy}`;
  }
  if (id === 'arc') {
    switch (o) {
      case 'u': return `M0 0 C${L * 0.1} ${-L * 0.6} ${L * 0.9} ${-L * 0.6} ${L} 0`;
      case 'l': return `M0 0 C${-L * 0.6} ${L * 0.1} ${-L * 0.6} ${L * 0.9} 0 ${L}`;
      case 'r': return `M0 0 C${L * 0.6} ${L * 0.1} ${L * 0.6} ${L * 0.9} 0 ${L}`;
      default: return `M0 0 C${L * 0.1} ${L * 0.6} ${L * 0.9} ${L * 0.6} ${L} 0`;
    }
  }
  if (id === 'turn') {
    const sx = o.includes('l') ? -1 : 1, sy = o.startsWith('u') ? -1 : 1;
    return `M0 0 L0 ${sy * L * 0.6} Q0 ${sy * L} ${sx * L * 0.4} ${sy * L} L${sx * L} ${sy * L}`;
  }
  if (id === 'shapes') {
    const r = L / 2;
    const reg = (n: number, start = -90): [number, number][] => {
      // Regular polygon whose first vertex is the start point (0,0).
      const a0 = (start * Math.PI) / 180;
      const cx = -Math.cos(a0) * r, cy = -Math.sin(a0) * r;
      return Array.from({ length: n - 1 }, (_, i) => { const a = a0 + ((i + 1) / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number]; });
    };
    switch (o) {
      case 'diamond': return polyPath(reg(4));
      case 'triangle': return polyPath(reg(3));
      case 'square': return polyPath([[L, 0], [L, L], [0, L]]);
      case 'pentagon': return polyPath(reg(5));
      case 'hexagon': return polyPath(reg(6));
      case 'octagon': return polyPath(reg(8));
      case 'star': {
        const pts: [number, number][] = [];
        const cx = 0, cy = r;
        for (let i = 1; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.42 : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
        return polyPath(pts);
      }
      case 'heart': return `M0 ${r * 0.3} C${-r * 0.1} ${-r * 0.4} ${-r * 1.2} ${-r * 0.2} ${-r * 0.9} ${r * 0.6} C${-r * 0.7} ${r} ${-r * 0.2} ${r * 1.3} 0 ${r * 1.6} C${r * 0.2} ${r * 1.3} ${r * 0.7} ${r} ${r * 0.9} ${r * 0.6} C${r * 1.2} ${-r * 0.2} ${r * 0.1} ${-r * 0.4} 0 ${r * 0.3} Z`;
      case 'teardrop': return `M0 0 C${r} ${r * 0.8} ${r} ${r * 2} 0 ${r * 2} C${-r} ${r * 2} ${-r} ${r * 0.8} 0 0 Z`;
      default: return `M0 0 A${r} ${r} 0 1 1 0 ${L} A${r} ${r} 0 1 1 0 0 Z`;
    }
  }
  if (id === 'loops') {
    const r = L / 2;
    switch (o) {
      case 'loop': return `M0 0 C${r} 0 ${r * 1.4} ${-r} ${r * 0.7} ${-r} C0 ${-r} ${r * 0.4} 0 ${L * 1.4} 0`;
      case 'spiral': {
        const pts: string[] = ['M0 0'];
        for (let i = 1; i <= 72; i++) { const a = (i / 72) * Math.PI * 6; const rr = (i / 72) * r; pts.push(`L${r2(Math.cos(a) * rr - 0)} ${r2(Math.sin(a) * rr)}`); }
        return pts.join(' ');
      }
      case 'wave': return `M0 0 C${r * 0.5} ${-r} ${r} ${-r} ${r} 0 S${r * 1.5} ${r} ${r * 2} 0 S${r * 2.5} ${-r} ${r * 3} 0`;
      case 'zigzag': return `M0 0 L${r * 0.5} ${-r * 0.5} L${r} 0 L${r * 1.5} ${-r * 0.5} L${r * 2} 0 L${r * 2.5} ${-r * 0.5} L${r * 3} 0`;
      case 'bounce': return `M0 0 Q${r * 0.5} ${-r * 1.4} ${r} 0 Q${r * 1.4} ${-r * 0.8} ${r * 1.8} 0 Q${r * 2.1} ${-r * 0.4} ${r * 2.4} 0`;
      default: return `M0 0 C${r} ${-r} ${r} ${r} 0 0 C${-r} ${-r} ${-r} ${r} 0 0`;
    }
  }
  return `M0 0 L${L} 0`;
};
