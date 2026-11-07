/**
 * Evaluates ECMA-376 preset geometry (guides, paths, text rectangle, connection sites and
 * adjustment handles) for any box size. Each preset is compiled once into closures-free
 * op lists so drawing many shapes stays cheap.
 */
import { fmt, type GeomPath, type GeomResult } from '../../render/geometry';
import { PRESET_DEFS, type PresetDef } from './presetDefs';

type Arg = number | string;
interface Guide { name: string; op: string; a: Arg[] }
interface Cmd { c: 'M' | 'L' | 'A' | 'Q' | 'C' | 'Z'; a: Arg[] }
interface CPath { w?: number; h?: number; fill?: GeomPath['fill']; stroke: boolean; cmds: Cmd[] }
interface CHandle { kind: 'xy' | 'p'; refA: string; minA: Arg; maxA: Arg; refB: string; minB: Arg; maxB: Arg; x: Arg; y: Arg }
export interface Compiled { av: Guide[]; gd: Guide[]; paths: CPath[]; rect?: Arg[]; sites: [Arg, Arg][]; handles: CHandle[] }

const ANG = 60000;
const toRad = (a: number) => (a / ANG) * (Math.PI / 180);
const arg = (s: string): Arg => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s);
const guides = (s: string | undefined): Guide[] => (s ? s.split(';').filter(Boolean).map((g) => {
  const i = g.indexOf('=');
  const [op, ...rest] = g.slice(i + 1).trim().split(/\s+/);
  return { name: g.slice(0, i), op: op!, a: rest.map(arg) };
}) : []);
const FILLS = new Set(['none', 'darken', 'darkenLess', 'lighten', 'lightenLess']);

const compile = (def: PresetDef): Compiled => ({
  av: guides(def.av),
  gd: guides(def.gd),
  rect: def.rc?.map(arg),
  sites: (def.cx ?? []).map(([x, y]) => [arg(x!), arg(y!)] as [Arg, Arg]),
  handles: (def.ah ?? []).map((h) => ({ kind: h[0] as 'xy' | 'p', refA: h[1]!, minA: arg(h[2] || '0'), maxA: arg(h[3] || '0'), refB: h[4]!, minB: arg(h[5] || '0'), maxB: arg(h[6] || '0'), x: arg(h[7]!), y: arg(h[8]!) })),
  paths: def.p.map((p) => {
    const t = p.d.split(' ');
    const cmds: Cmd[] = [];
    for (let i = 0; i < t.length;) {
      const c = t[i++] as Cmd['c'];
      const n = c === 'M' || c === 'L' ? 2 : c === 'A' || c === 'Q' ? 4 : c === 'C' ? 6 : 0;
      cmds.push({ c, a: t.slice(i, i + n).map(arg) });
      i += n;
    }
    return { ...(p.w ? { w: p.w } : {}), ...(p.h ? { h: p.h } : {}), ...(p.f && FILLS.has(p.f) ? { fill: p.f as GeomPath['fill'] } : {}), stroke: p.s !== 0, cmds };
  }),
});

const cache = new Map<string, Compiled>();
export const compiled = (name: string): Compiled | undefined => {
  let c = cache.get(name);
  if (!c) {
    const def = PRESET_DEFS[name];
    if (!def) return undefined;
    c = compile(def);
    cache.set(name, c);
  }
  return c;
};

export const presetNames = (): string[] => Object.keys(PRESET_DEFS);

/** Adjust defaults ("adj" -> 16667). */
export const adjustDefaults = (name: string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const g of compiled(name)?.av ?? []) out[g.name] = Number(g.a[0]) || 0;
  return out;
};

type Env = Map<string, number>;

const builtin = (env: Env, n: string): number | undefined => {
  const w = env.get('w')!, h = env.get('h')!;
  switch (n) {
    case 'l': case 't': return 0;
    case 'r': return w;
    case 'b': return h;
    case 'hc': return w / 2;
    case 'vc': return h / 2;
    case 'ss': return Math.min(w, h);
    case 'ls': return Math.max(w, h);
    case 'cd2': return 10800000;
    case 'cd4': return 5400000;
    case 'cd8': return 2700000;
    case '3cd4': return 16200000;
    case '3cd8': return 8100000;
    case '5cd8': return 13500000;
    case '7cd8': return 18900000;
  }
  const m = /^(w|h|ss)d(\d+)$/.exec(n);
  if (m) return (m[1] === 'w' ? w : m[1] === 'h' ? h : Math.min(w, h)) / Number(m[2]);
  return undefined;
};

const val = (env: Env, a: Arg | undefined): number => {
  if (a === undefined) return 0;
  if (typeof a === 'number') return a;
  const v = env.get(a);
  if (v !== undefined) return v;
  const b = builtin(env, a);
  if (b !== undefined) { env.set(a, b); return b; }
  const n = Number(a);
  return Number.isFinite(n) ? n : 0;
};

const evalGuide = (env: Env, g: Guide): number => {
  const [x, y, z] = [val(env, g.a[0]), val(env, g.a[1]), val(env, g.a[2])];
  switch (g.op) {
    case 'val': return x;
    case '*/': return z === 0 ? 0 : (x * y) / z;
    case '+-': return x + y - z;
    case '+/': return z === 0 ? 0 : (x + y) / z;
    case '?:': return x > 0 ? y : z;
    case 'abs': return Math.abs(x);
    case 'at2': return (Math.atan2(y, x) * 180 / Math.PI) * ANG;
    case 'cat2': return x * Math.cos(Math.atan2(z, y));
    case 'sat2': return x * Math.sin(Math.atan2(z, y));
    case 'cos': return x * Math.cos(toRad(y));
    case 'sin': return x * Math.sin(toRad(y));
    case 'tan': return x * Math.tan(toRad(y));
    case 'max': return Math.max(x, y);
    case 'min': return Math.min(x, y);
    case 'mod': return Math.sqrt(x * x + y * y + z * z);
    case 'pin': return y < x ? x : y > z ? z : y;
    case 'sqrt': return Math.sqrt(Math.max(0, x));
    default: return 0;
  }
};

/** Runs the adjust and guide lists. Unknown adjust names in adj are ignored. */
export const evalGuides = (c: Compiled, w: number, h: number, adj: Record<string, number>): Env => {
  const env: Env = new Map([['w', w], ['h', h]]);
  for (const g of c.av) {
    const v = adj[g.name];
    env.set(g.name, typeof v === 'number' && Number.isFinite(v) ? v : evalGuide(env, g));
  }
  for (const g of c.gd) {
    const v = evalGuide(env, g);
    env.set(g.name, Number.isFinite(v) ? v : 0);
  }
  return env;
};

/** Parametric angle of the point where a ray at visual angle a (radians) meets the ellipse. */
const param = (a: number, rx: number, ry: number): number => Math.atan2(rx * Math.sin(a), ry * Math.cos(a));

const pathData = (p: CPath, env: Env, W: number, H: number): string => {
  const sx = p.w ? W / p.w : 1, sy = p.h ? H / p.h : 1;
  const out: string[] = [];
  let cx = 0, cy = 0, sx0 = 0, sy0 = 0;
  const P = (x: number, y: number) => `${fmt(x * sx)} ${fmt(y * sy)}`;
  for (const { c, a } of p.cmds) {
    if (c === 'M' || c === 'L') {
      cx = val(env, a[0]); cy = val(env, a[1]);
      if (c === 'M') { sx0 = cx; sy0 = cy; }
      out.push(`${c}${P(cx, cy)}`);
    } else if (c === 'Q') {
      const v = a.map((x) => val(env, x));
      out.push(`Q${P(v[0]!, v[1]!)} ${P(v[2]!, v[3]!)}`);
      cx = v[2]!; cy = v[3]!;
    } else if (c === 'C') {
      const v = a.map((x) => val(env, x));
      out.push(`C${P(v[0]!, v[1]!)} ${P(v[2]!, v[3]!)} ${P(v[4]!, v[5]!)}`);
      cx = v[4]!; cy = v[5]!;
    } else if (c === 'A') {
      const rx = Math.abs(val(env, a[0])), ry = Math.abs(val(env, a[1]));
      const st = toRad(val(env, a[2])), sw = toRad(val(env, a[3]));
      if (rx < 1e-9 || ry < 1e-9 || sw === 0) continue;
      const t1 = param(st, rx, ry);
      const raw = param(st + sw, rx, ry) - t1;
      // Same direction and number of turns as the visual sweep.
      const d = raw + 2 * Math.PI * Math.round((sw - raw) / (2 * Math.PI));
      const t2 = t1 + d;
      const ox = cx - rx * Math.cos(t1), oy = cy - ry * Math.sin(t1);
      const n = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 2) - 1e-9));
      const rxs = rx * sx, rys = ry * sy;
      for (let k = 1; k <= n; k++) {
        const t = t1 + (d * k) / n;
        out.push(`A${fmt(rxs)} ${fmt(rys)} 0 0 ${d >= 0 ? 1 : 0} ${P(ox + rx * Math.cos(t), oy + ry * Math.sin(t))}`);
      }
      cx = ox + rx * Math.cos(t2); cy = oy + ry * Math.sin(t2);
    } else {
      out.push('Z');
      cx = sx0; cy = sy0;
    }
  }
  return out.join('');
};

export interface HandleInfo { x: number; y: number; adj: string; axis: 'x' | 'y' | 'xy' | 'angle'; min?: number; max?: number; adjY?: string; minY?: number; maxY?: number }

const handleInfo = (h: CHandle, env: Env): HandleInfo | null => {
  const x = val(env, h.x), y = val(env, h.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (h.kind === 'xy') {
    if (h.refA && h.refB) return { x, y, adj: h.refA, axis: 'xy', min: val(env, h.minA), max: val(env, h.maxA), adjY: h.refB, minY: val(env, h.minB), maxY: val(env, h.maxB) };
    if (h.refA) return { x, y, adj: h.refA, axis: 'x', min: val(env, h.minA), max: val(env, h.maxA) };
    if (h.refB) return { x, y, adj: h.refB, axis: 'y', min: val(env, h.minB), max: val(env, h.maxB) };
    return null;
  }
  // Polar: angle handle, optionally with a radius adjust in adjY.
  if (h.refA) return { x, y, adj: h.refA, axis: 'angle', min: val(env, h.minA), max: val(env, h.maxA), ...(h.refB ? { adjY: h.refB, minY: val(env, h.minB), maxY: val(env, h.maxB) } : {}) };
  if (h.refB) return { x, y, adj: h.refB, axis: 'xy', min: val(env, h.minB), max: val(env, h.maxB) };
  return null;
};

const BIG = 2147483647;
const clampRange = (lo: number | undefined, hi: number | undefined, cur: number): [number, number] => {
  let a = lo ?? -BIG, b = hi ?? BIG;
  // Unbounded handles (callout tails): search a generous window around the current value.
  if (a <= -BIG + 1) a = Math.min(cur, 0) - 300000;
  if (b >= BIG - 1) b = Math.max(cur, 100000) + 300000;
  return a <= b ? [a, b] : [b, a];
};

/**
 * Finds adjust values that put handle i as close as possible to (px, py). Handle positions are
 * monotonic or smooth in their adjusts for every preset, so a coarse scan plus refinement is
 * enough and needs no per-shape inverse formulas.
 */
export const solveHandle = (name: string, w: number, h: number, adj: Record<string, number>, i: number, px: number, py: number): Record<string, number> => {
  const c = compiled(name);
  const H = c?.handles[i];
  if (!c || !H) return {};
  const cur = { ...adjustDefaults(name), ...adj };
  const refs = [H.refA, H.refB].filter(Boolean);
  const env0 = evalGuides(c, w, h, cur);
  const ranges = new Map<string, [number, number]>();
  if (H.refA) ranges.set(H.refA, clampRange(val(env0, H.minA), val(env0, H.maxA), cur[H.refA] ?? 0));
  if (H.refB) ranges.set(H.refB, clampRange(val(env0, H.minB), val(env0, H.maxB), cur[H.refB] ?? 0));
  const cost = (v: Record<string, number>) => {
    const env = evalGuides(c, w, h, v);
    const dx = val(env, H.x) - px, dy = val(env, H.y) - py;
    return dx * dx + dy * dy;
  };
  const best = { ...cur };
  for (let round = 0; round < (refs.length > 1 ? 3 : 1); round++) {
    for (const r of refs) {
      const [lo, hi] = ranges.get(r)!;
      let a = lo, b = hi, bv = best[r] ?? 0, bc = cost(best);
      for (let pass = 0; pass < 4; pass++) {
        const N = 40;
        for (let k = 0; k <= N; k++) {
          const v = a + ((b - a) * k) / N;
          const cc = cost({ ...best, [r]: v });
          if (cc < bc - 1e-9) { bc = cc; bv = v; }
        }
        const step = (b - a) / N;
        a = Math.max(lo, bv - step); b = Math.min(hi, bv + step);
      }
      best[r] = Math.round(bv);
    }
  }
  const out: Record<string, number> = {};
  for (const r of refs) out[r] = best[r]!;
  return out;
};

/** Full geometry of a preset at a size. */
export const evalPreset = (name: string, w: number, h: number, adj: Record<string, number>): GeomResult | null => {
  const c = compiled(name);
  if (!c) return null;
  const env = evalGuides(c, w, h, adj);
  // Fill-only paths go first so outline-only detail paths (chartPlus, chartX...) stay visible on top.
  const order = [...c.paths].sort((a, b) => Number(!(a.fill !== 'none' && !a.stroke)) - Number(!(b.fill !== 'none' && !b.stroke)));
  const paths: GeomPath[] = order.map((p) => ({ d: pathData(p, env, w, h), ...(p.fill ? { fill: p.fill } : {}), ...(p.stroke ? {} : { stroke: false }) }));
  const res: GeomResult = { paths };
  if (c.rect) {
    const [l, t, r, b] = c.rect.map((a) => val(env, a)) as [number, number, number, number];
    res.text = { x: Math.min(l, r), y: Math.min(t, b), w: Math.abs(r - l), h: Math.abs(b - t) };
  }
  if (c.sites.length) res.sites = c.sites.map(([x, y]) => [val(env, x), val(env, y)]);
  const hs = c.handles.map((hd) => handleInfo(hd, env)).filter((x): x is HandleInfo => !!x);
  if (hs.length) res.handles = hs;
  return res;
};
