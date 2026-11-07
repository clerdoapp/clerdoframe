/**
 * Preset shape geometry. Each preset turns a box size and adjustment values into SVG paths,
 * a text rectangle and connection sites. More presets are registered from
 * src/features/shapes/presets*.ts.
 */

export interface GeomPath { d: string; fill?: 'norm' | 'none' | 'darken' | 'darkenLess' | 'lighten' | 'lightenLess'; stroke?: boolean }
export interface GeomResult {
  paths: GeomPath[];
  /** Text area inside the shape box. */
  text?: { x: number; y: number; w: number; h: number };
  /** Connection sites for connectors, in box coordinates. */
  sites?: [number, number][];
  /** Adjustment handles: position in box coords and which adj value each one drives. */
  handles?: { x: number; y: number; adj: string; axis: 'x' | 'y' | 'xy' | 'angle'; min?: number; max?: number }[];
}
export type GeomFn = (w: number, h: number, adj: Record<string, number>) => GeomResult;

export interface PresetInfo { name: string; label: string; category: string; defaults?: Record<string, number>; fn: GeomFn; /** Open path (lines, arcs): no fill. */ line?: boolean }

const presets = new Map<string, PresetInfo>();
export const registerPreset = (p: PresetInfo): void => { presets.set(p.name, p); };
export const preset = (name: string): PresetInfo | undefined => presets.get(name);
export const allPresets = (): PresetInfo[] => [...presets.values()];

export const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();
export const M = (x: number, y: number) => `M${fmt(x)} ${fmt(y)}`;
export const L = (x: number, y: number) => `L${fmt(x)} ${fmt(y)}`;
export const poly = (pts: [number, number][], close = true): string => pts.map(([x, y], i) => (i ? L(x, y) : M(x, y))).join('') + (close ? 'Z' : '');
export const ellipseD = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${fmt(cx - rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)}Z`;
/** Arc from angle a1 sweeping by sw (degrees, clockwise) on an ellipse; returns path without move. */
export const arcTo = (cx: number, cy: number, rx: number, ry: number, a1: number, sw: number): { d: string; x0: number; y0: number; x1: number; y1: number } => {
  const r = (a: number) => (a * Math.PI) / 180;
  const x0 = cx + rx * Math.cos(r(a1)), y0 = cy + ry * Math.sin(r(a1));
  const x1 = cx + rx * Math.cos(r(a1 + sw)), y1 = cy + ry * Math.sin(r(a1 + sw));
  const large = Math.abs(sw) > 180 ? 1 : 0;
  const dir = sw >= 0 ? 1 : 0;
  return { d: `A${fmt(rx)} ${fmt(ry)} 0 ${large} ${dir} ${fmt(x1)} ${fmt(y1)}`, x0, y0, x1, y1 };
};

const box4 = (w: number, h: number): [number, number][] => [[w / 2, 0], [0, h / 2], [w / 2, h], [w, h / 2]];
const a = (adj: Record<string, number>, k: string, d: number) => adj[k] ?? d;

registerPreset({ name: 'rect', label: 'Rectangle', category: 'Rectangles', fn: (w, h) => ({ paths: [{ d: poly([[0, 0], [w, 0], [w, h], [0, h]]) }], sites: box4(w, h) }) });

registerPreset({
  name: 'roundRect', label: 'Rounded Rectangle', category: 'Rectangles', defaults: { adj: 16667 },
  fn: (w, h, adj) => {
    const r = (Math.min(w, h) * Math.min(50000, Math.max(0, a(adj, 'adj', 16667)))) / 100000;
    const d = `${M(r, 0)}${L(w - r, 0)}A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w)} ${fmt(r)}${L(w, h - r)}A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w - r)} ${fmt(h)}${L(r, h)}A${fmt(r)} ${fmt(r)} 0 0 1 0 ${fmt(h - r)}${L(0, r)}A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} 0Z`;
    const i = r * 0.29289;
    return { paths: [{ d }], text: { x: i, y: i, w: w - 2 * i, h: h - 2 * i }, sites: box4(w, h), handles: [{ x: r, y: 0, adj: 'adj', axis: 'x', min: 0, max: 50000 }] };
  },
});

registerPreset({
  name: 'ellipse', label: 'Oval', category: 'Basic Shapes',
  fn: (w, h) => {
    const i = 0.14645;
    return { paths: [{ d: ellipseD(w / 2, h / 2, w / 2, h / 2) }], text: { x: w * i, y: h * i, w: w * (1 - 2 * i), h: h * (1 - 2 * i) }, sites: box4(w, h) };
  },
});

registerPreset({
  name: 'triangle', label: 'Isosceles Triangle', category: 'Basic Shapes', defaults: { adj: 50000 },
  fn: (w, h, adj) => {
    const x = (w * a(adj, 'adj', 50000)) / 100000;
    return { paths: [{ d: poly([[x, 0], [w, h], [0, h]]) }], text: { x: x / 2, y: h / 2, w: w / 2, h: h / 2 }, sites: [[x, 0], [x / 2, h / 2], [0, h], [w / 2, h], [w, h], [(x + w) / 2, h / 2]], handles: [{ x, y: 0, adj: 'adj', axis: 'x', min: 0, max: 100000 }] };
  },
});

registerPreset({
  name: 'rightArrow', label: 'Right Arrow', category: 'Block Arrows', defaults: { adj1: 50000, adj2: 50000 },
  fn: (w, h, adj) => {
    const t = (h * a(adj, 'adj1', 50000)) / 100000;
    const head = (Math.min(w, h) * a(adj, 'adj2', 50000)) / 100000;
    const y1 = (h - t) / 2, y2 = y1 + t, x = w - head;
    return { paths: [{ d: poly([[0, y1], [x, y1], [x, 0], [w, h / 2], [x, h], [x, y2], [0, y2]]) }], text: { x: 0, y: y1, w: x + (head * t) / h / 2, h: t }, sites: [[x, 0], [0, h / 2], [x, h], [w, h / 2]] };
  },
});

registerPreset({ name: 'line', label: 'Line', category: 'Lines', line: true, fn: (w, h) => ({ paths: [{ d: `${M(0, 0)}${L(w, h)}`, fill: 'none' }], sites: [[0, 0], [w, h]] }) });
registerPreset({ name: 'straightConnector1', label: 'Straight Connector', category: 'Lines', line: true, fn: (w, h) => ({ paths: [{ d: `${M(0, 0)}${L(w, h)}`, fill: 'none' }], sites: [[0, 0], [w, h]] }) });

/** Geometry for a shape, falling back to a rectangle for unknown presets. */
export const geometry = (geom: string, w: number, h: number, adj: Record<string, number> = {}, custom?: { d: string; w: number; h: number }[]): GeomResult => {
  if (geom === 'custom' && custom?.length) {
    const paths = custom.map((p) => ({ d: scalePath(p.d, p.w ? w / p.w : 1, p.h ? h / p.h : 1) }));
    return { paths, sites: box4(w, h) };
  }
  const p = presets.get(geom) ?? presets.get('rect')!;
  try {
    return p.fn(Math.max(w, 0.01), Math.max(h, 0.01), { ...(p.defaults ?? {}), ...adj });
  } catch {
    return presets.get('rect')!.fn(w, h, {});
  }
};

/** Scales absolute path data (M L C Q A Z H V) by sx, sy. */
export const scalePath = (d: string, sx: number, sy: number): string => {
  if (sx === 1 && sy === 1) return d;
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out: string[] = [];
  let cmd = '';
  let idx = 0;
  for (const t of tokens) {
    if (/[a-zA-Z]/.test(t)) { cmd = t; idx = 0; out.push(t); continue; }
    const n = parseFloat(t);
    const up = cmd.toUpperCase();
    let v = n;
    if (up === 'H') v = n * sx;
    else if (up === 'V') v = n * sy;
    else if (up === 'A') { const k = idx % 7; v = k === 0 || k === 5 ? n * sx : k === 1 || k === 6 ? n * sy : n; }
    else v = idx % 2 === 0 ? n * sx : n * sy;
    out.push(fmt(v));
    idx++;
  }
  return out.join(' ');
};

export const isLineGeom = (geom: string): boolean => !!presets.get(geom)?.line || /Connector|^line$|^arc$/.test(geom);
