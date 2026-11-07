// DrawingML colours, fills, lines and effects (ECMA-376 Part 1, 20.1) — reading and writing.
import type { Color, Crop, Dash, Effects, Fill, GradientStop, Line, PatternName, Theme, ThemeColorName } from '../../model/deck';
import { attr, kid, kids, numAttr, type XNode } from '../xml';
import { esc } from '../xml';

export const EMU = 9525;
export const EMU_PT = 12700;
export const px = (emu: number | undefined): number => (emu === undefined ? 0 : Math.round((emu / EMU) * 100) / 100);
export const emu = (pxv: number): number => Math.round(pxv * EMU);
export const ang = (v: number | undefined): number => (v === undefined ? 0 : Math.round((v / 60000) * 100) / 100);
export const toAng = (deg: number): number => Math.round(((deg % 360) + 360) % 360 * 60000);

// ---------- Colour maths ----------

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
};
export const rgbHex = (r: number, g: number, b: number): string => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
};
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
};

interface Xf { name: string; val: number }
/** Applies DrawingML colour transforms to a hex colour. */
export const applyXf = (hex: string, xf: Xf[]): { hex: string; alpha: number } => {
  let [r, g, b] = hexRgb(hex);
  let alpha = 1;
  for (const t of xf) {
    const v = t.val / 100000;
    switch (t.name) {
      case 'lumMod': case 'lumOff': case 'satMod': case 'satOff': case 'hueMod': case 'hueOff': case 'lum': case 'sat': case 'hue': {
        let [h, s, l] = rgbToHsl(r, g, b);
        if (t.name === 'lumMod') l *= v; else if (t.name === 'lumOff') l += v; else if (t.name === 'lum') l = v;
        else if (t.name === 'satMod') s *= v; else if (t.name === 'satOff') s += v; else if (t.name === 'sat') s = v;
        else if (t.name === 'hueMod') h *= v; else if (t.name === 'hueOff') h += t.val / 21600000; else h = t.val / 21600000;
        [r, g, b] = hslToRgb(((h % 1) + 1) % 1, clamp(s), clamp(l));
        break;
      }
      case 'tint': r = 255 - (255 - r) * v; g = 255 - (255 - g) * v; b = 255 - (255 - b) * v; break;
      case 'shade': r *= v; g *= v; b *= v; break;
      case 'alpha': alpha = clamp(v); break;
      case 'alphaMod': alpha = clamp(alpha * v); break;
      case 'alphaOff': alpha = clamp(alpha + v); break;
      case 'inv': r = 255 - r; g = 255 - g; b = 255 - b; break;
      case 'gray': { const y = 0.3 * r + 0.59 * g + 0.11 * b; r = g = b = y; break; }
      case 'comp': { const [h, s, l] = rgbToHsl(r, g, b); [r, g, b] = hslToRgb((h + 0.5) % 1, s, l); break; }
      default: break;
    }
  }
  return { hex: rgbHex(r, g, b), alpha };
};

const PRESET: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF', gray: '808080', grey: '808080',
  silver: 'C0C0C0', maroon: '800000', navy: '000080', olive: '808000', purple: '800080', teal: '008080', lime: '00FF00', orange: 'FFA500', ltGray: 'D3D3D3', dkGray: 'A9A9A9',
  darkBlue: '00008B', darkRed: '8B0000', darkGreen: '006400', gold: 'FFD700', pink: 'FFC0CB', brown: 'A52A2A', lightBlue: 'ADD8E6', ltBlue: 'ADD8E6',
};

// ---------- Reading ----------

export interface ColorCtx {
  /** Raw scheme colours from the theme (dk1, lt1, ... folHlink). */
  scheme: Record<string, string>;
  /** Master colour map: tx1 -> dk1, bg1 -> lt1, ... */
  clrMap: Record<string, string>;
  /** Colour standing in for phClr inside theme style references. */
  phClr?: Color;
}

const SLOTS = ['dk1', 'lt1', 'dk2', 'lt2'] as const;
const ALIAS: Record<string, string> = { dk1: 'tx1', lt1: 'bg1', dk2: 'tx2', lt2: 'bg2' };
const THEME_NAMES = new Set(['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink', 'tx1', 'bg1', 'tx2', 'bg2']);

/** Our theme slot for a scheme colour name as written in the file, honouring the master's colour map. */
const slotOf = (val: string, c: ColorCtx): ThemeColorName | undefined => {
  if (val === 'tx1' || val === 'bg1' || val === 'tx2' || val === 'bg2') return val;
  if ((SLOTS as readonly string[]).includes(val)) {
    // Our dk1 slot holds whatever tx1 maps to, so find the slot that shows this raw colour.
    for (const s of SLOTS) if ((c.clrMap[ALIAS[s]!] ?? s) === val) return s;
    return val as ThemeColorName;
  }
  return THEME_NAMES.has(val) ? (val as ThemeColorName) : undefined;
};

const COLOR_TAGS = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr']);
export const colorNode = (n: XNode | undefined): XNode | undefined => n?.children.find((x) => COLOR_TAGS.has(x.name));

const xfOf = (n: XNode): Xf[] => n.children.map((c) => ({ name: c.name, val: numAttr(c, 'val') ?? 0 })).filter((x) => x.name !== 'extLst');

/** Hex of a scheme slot in this context (through the colour map). */
export const schemeHex = (name: string, c: ColorCtx): string => {
  const raw = ALIAS[name] ? name : name === 'tx1' ? c.clrMap.tx1 ?? 'dk1' : name === 'bg1' ? c.clrMap.bg1 ?? 'lt1' : name === 'tx2' ? c.clrMap.tx2 ?? 'dk2' : name === 'bg2' ? c.clrMap.bg2 ?? 'lt2' : name;
  return '#' + (c.scheme[raw] ?? '000000');
};

/** Reads the colour inside a fill/colour container element. */
export const readColor = (container: XNode | undefined, c: ColorCtx): Color | undefined => {
  const n = colorNode(container);
  if (!n) return undefined;
  const xf = xfOf(n);
  let base: string;
  switch (n.name) {
    case 'srgbClr': base = '#' + (attr(n, 'val') ?? '000000').slice(0, 6).toUpperCase(); break;
    case 'sysClr': base = '#' + (attr(n, 'lastClr') ?? (attr(n, 'val') === 'window' ? 'FFFFFF' : '000000')).toUpperCase(); break;
    case 'prstClr': base = '#' + (PRESET[attr(n, 'val') ?? ''] ?? '000000'); break;
    case 'scrgbClr': {
      const lin = (v: number) => { const x = clamp(v / 100000); return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055); };
      base = rgbHex(lin(numAttr(n, 'r') ?? 0), lin(numAttr(n, 'g') ?? 0), lin(numAttr(n, 'b') ?? 0));
      break;
    }
    case 'hslClr': base = rgbHex(...hslToRgb((numAttr(n, 'hue') ?? 0) / 21600000, (numAttr(n, 'sat') ?? 0) / 100000, (numAttr(n, 'lum') ?? 0) / 100000)); break;
    default: {
      const val = attr(n, 'val') ?? 'tx1';
      if (val === 'phClr') {
        const ph = c.phClr;
        if (ph === undefined) return lumColor({ theme: 'phClr' as ThemeColorName }, xf) ?? { theme: 'phClr' as ThemeColorName };
        if (typeof ph === 'object' && 'theme' in ph && !ph.lum) return lumColor({ theme: ph.theme, ...(ph.alpha !== undefined ? { alpha: ph.alpha } : {}) }, xf) ?? resolveXf(colorHex(ph, c), xf);
        return xf.length ? resolveXf(colorHex(ph, c), xf) : ph;
      }
      const slot = slotOf(val, c);
      if (!slot) return resolveXf(schemeHex(val, c), xf);
      return lumColor({ theme: slot }, xf) ?? resolveXf(schemeHex(slot === 'dk1' || slot === 'lt1' || slot === 'dk2' || slot === 'lt2' ? ALIAS[slot]! : slot, c), xf);
    }
  }
  return xf.length ? resolveXf(base, xf) : base;
};

const resolveXf = (hex: string, xf: Xf[]): Color => {
  const r = applyXf(hex, xf);
  return r.alpha < 1 ? { hex: r.hex, alpha: Math.round(r.alpha * 1000) / 1000 } : r.hex;
};

/** Theme colour with transforms that fit our {lum, alpha} form, or undefined when they don't. */
const lumColor = (base: { theme: ThemeColorName; alpha?: number }, xf: Xf[]): Color | undefined => {
  let lum = 0, alpha = base.alpha;
  const m = xf.find((x) => x.name === 'lumMod')?.val, o = xf.find((x) => x.name === 'lumOff')?.val;
  for (const t of xf) {
    if (t.name === 'alpha') alpha = t.val / 100000;
    else if (t.name === 'tint') lum = 1 - t.val / 100000;
    else if (t.name === 'shade') lum = t.val / 100000 - 1;
    else if (t.name === 'lumMod' || t.name === 'lumOff') { /* below */ }
    else return undefined;
  }
  if (o !== undefined && o > 0) lum = o / 100000;
  else if (m !== undefined) lum = m / 100000 - 1;
  const out: { theme: ThemeColorName; lum?: number; alpha?: number } = { theme: base.theme };
  if (Math.abs(lum) > 0.0005) out.lum = Math.round(lum * 10000) / 10000;
  if (alpha !== undefined && alpha < 1) out.alpha = Math.round(alpha * 1000) / 1000;
  return out;
};

/** Hex of any model colour in a reading context. */
export const colorHex = (col: Color, c: ColorCtx): string => {
  if (typeof col === 'string') return col;
  if ('hex' in col) return col.hex;
  const h = schemeHex(col.theme === 'dk1' || col.theme === 'lt1' || col.theme === 'dk2' || col.theme === 'lt2' ? ALIAS[col.theme]! : col.theme, c);
  if (!col.lum) return h;
  return col.lum > 0 ? applyXf(h, [{ name: 'lumMod', val: (1 - col.lum) * 100000 }, { name: 'lumOff', val: col.lum * 100000 }]).hex : applyXf(h, [{ name: 'lumMod', val: (1 + col.lum) * 100000 }]).hex;
};

export const FILL_TAGS = new Set(['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill']);
export const fillNode = (n: XNode | undefined): XNode | undefined => n?.children.find((x) => FILL_TAGS.has(x.name));

export interface FillCtx extends ColorCtx {
  /** Turns a relationship id into a media id. */
  media: (rid: string | undefined) => string | undefined;
  groupFill?: Fill;
}

export const readCrop = (src: XNode | undefined): Crop | undefined => {
  if (!src) return undefined;
  const v = (k: string) => (numAttr(src, k) ?? 0) / 100000;
  const c = { l: v('l'), t: v('t'), r: v('r'), b: v('b') };
  return c.l || c.t || c.r || c.b ? c : undefined;
};

export const readFillNode = (f: XNode | undefined, c: FillCtx): Fill | undefined => {
  if (!f) return undefined;
  switch (f.name) {
    case 'noFill': return { type: 'none' };
    case 'solidFill': return { type: 'solid', color: readColor(f, c) ?? '#000000' };
    case 'grpFill': return c.groupFill ?? { type: 'none' };
    case 'gradFill': {
      const stops: GradientStop[] = kids(kid(f, 'gsLst'), 'gs').map((g) => ({ pos: (numAttr(g, 'pos') ?? 0) / 100000, color: readColor(g, c) ?? '#000000' }));
      const lin = kid(f, 'lin'), path = kid(f, 'path');
      const p = attr(path, 'path');
      return { type: 'gradient', kind: path ? (p === 'rect' ? 'rect' : p === 'shape' ? 'path' : 'radial') : 'linear', angle: ang(numAttr(lin, 'ang') ?? (path ? 0 : 5400000)), stops: stops.length ? stops : [{ pos: 0, color: '#FFFFFF' }, { pos: 1, color: '#000000' }] };
    }
    case 'blipFill': {
      const blip = kid(f, 'blip');
      const media = c.media(attr(blip, 'embed'));
      if (!media) return { type: 'none' };
      const amt = numAttr(kid(blip, 'alphaModFix'), 'amt');
      const crop = readCrop(kid(f, 'srcRect'));
      return { type: 'picture', media, mode: kid(f, 'tile') ? 'tile' : 'stretch', ...(amt !== undefined && amt < 100000 ? { transparency: 1 - amt / 100000 } : {}), ...(crop ? { crop } : {}) };
    }
    case 'pattFill':
      return { type: 'pattern', pattern: (attr(f, 'prst') ?? 'pct50') as PatternName, fg: readColor(kid(f, 'fgClr'), c) ?? '#000000', bg: readColor(kid(f, 'bgClr'), c) ?? '#FFFFFF' };
    default: return undefined;
  }
};

/** The fill directly inside a properties element (spPr, tcPr, bgPr, rPr). */
export const readFill = (parent: XNode | undefined, c: FillCtx): Fill | undefined => readFillNode(fillNode(parent), c);

const UNDER: Record<string, ArrowKind> = { triangle: 'triangle', stealth: 'stealth', diamond: 'diamond', oval: 'oval', arrow: 'arrow', none: 'none' };
type ArrowKind = NonNullable<Line['head']>['type'];

/** Reads a:ln. Anything it leaves out comes from `base` (a theme line style), when given. */
export const readLine = (ln: XNode | undefined, c: FillCtx, base?: Line): Line | undefined => {
  if (!ln) return base ? structuredClone(base) : undefined;
  const fill = readFill(ln, c);
  const w = numAttr(ln, 'w');
  const specified = !!fill || w !== undefined || ln.children.length > 0;
  if (!specified && !base) return undefined;
  const out: Line = base ? structuredClone(base) : { fill: { type: 'solid', color: { theme: 'tx1' } }, width: 0.75 };
  if (fill) out.fill = fill;
  if (w !== undefined) out.width = Math.round((w / EMU_PT) * 100) / 100;
  const dash = attr(kid(ln, 'prstDash'), 'val');
  if (dash) { if (dash === 'solid') delete out.dash; else out.dash = dash as Dash; }
  const cap = attr(ln, 'cap');
  if (cap) out.cap = cap === 'rnd' ? 'round' : cap === 'sq' ? 'square' : 'flat';
  if (kid(ln, 'round')) out.join = 'round'; else if (kid(ln, 'bevel')) out.join = 'bevel'; else if (kid(ln, 'miter')) out.join = 'miter';
  const cmpd = attr(ln, 'cmpd');
  if (cmpd) { if (cmpd === 'sng') delete out.compound; else out.compound = cmpd as Line['compound']; }
  for (const end of ['headEnd', 'tailEnd'] as const) {
    const e = kid(ln, end);
    if (!e) continue;
    const t = attr(e, 'type');
    const key = end === 'headEnd' ? 'head' : 'tail';
    if (!t || t === 'none') { delete out[key]; continue; }
    const spec: NonNullable<Line['head']> = { type: UNDER[t] ?? 'triangle' };
    const wv = attr(e, 'w'), lv = attr(e, 'len');
    if (wv) spec.w = wv as 'sm';
    if (lv) spec.len = lv as 'sm';
    out[key] = spec;
  }
  return out;
};

export const readEffects = (lst: XNode | undefined, c: ColorCtx): Effects | undefined => {
  if (!lst) return undefined;
  const out: Effects = {};
  const sh = kid(lst, 'outerShdw') ?? kid(lst, 'innerShdw') ?? kid(lst, 'prstShdw');
  if (sh) {
    const col = readColor(sh, c) ?? '#000000';
    const alpha = typeof col === 'object' && col.alpha !== undefined ? col.alpha : undefined;
    out.shadow = {
      kind: sh.name === 'innerShdw' ? 'inner' : sh.name === 'prstShdw' || numAttr(sh, 'sy') !== undefined && numAttr(sh, 'sy') !== 100000 ? 'perspective' : 'outer',
      color: col, blur: px(numAttr(sh, 'blurRad') ?? 0), dist: px(numAttr(sh, 'dist') ?? 0), angle: ang(numAttr(sh, 'dir') ?? 0), ...(alpha !== undefined ? { alpha } : {}),
    };
  }
  const glow = kid(lst, 'glow');
  if (glow) { const col = readColor(glow, c) ?? '#FFC000'; out.glow = { color: col, radius: px(numAttr(glow, 'rad') ?? 0), ...(typeof col === 'object' && col.alpha !== undefined ? { alpha: col.alpha } : {}) }; }
  const se = kid(lst, 'softEdge');
  if (se) out.softEdge = px(numAttr(se, 'rad') ?? 0);
  const rf = kid(lst, 'reflection');
  if (rf) out.reflection = { alpha: (numAttr(rf, 'stA') ?? 50000) / 100000, size: (numAttr(rf, 'endPos') ?? 50000) / 100000, dist: px(numAttr(rf, 'dist') ?? 0), blur: px(numAttr(rf, 'blurRad') ?? 0) };
  return Object.keys(out).length ? out : undefined;
};

// ---------- Writing ----------

const hex6 = (h: string): string => h.replace('#', '').slice(0, 6).toUpperCase().padEnd(6, '0');
const pct = (v: number) => Math.round(v * 100000);

export const colorXml = (col: Color | undefined): string => {
  if (col === undefined) return '<a:schemeClr val="tx1"/>';
  if (typeof col === 'string') return `<a:srgbClr val="${hex6(col)}"/>`;
  if ('hex' in col) return col.alpha !== undefined && col.alpha < 1 ? `<a:srgbClr val="${hex6(col.hex)}"><a:alpha val="${pct(col.alpha)}"/></a:srgbClr>` : `<a:srgbClr val="${hex6(col.hex)}"/>`;
  let inner = '';
  if (col.lum && col.lum > 0) inner += `<a:lumMod val="${pct(1 - col.lum)}"/><a:lumOff val="${pct(col.lum)}"/>`;
  else if (col.lum && col.lum < 0) inner += `<a:lumMod val="${pct(1 + col.lum)}"/>`;
  if (col.alpha !== undefined && col.alpha < 1) inner += `<a:alpha val="${pct(col.alpha)}"/>`;
  const v = col.theme as string;
  return inner ? `<a:schemeClr val="${esc(v)}">${inner}</a:schemeClr>` : `<a:schemeClr val="${esc(v)}"/>`;
};

export interface WriteCtx {
  /** Relationship id for a media item from the part being written (adds the part and rel). */
  mediaRel: (id: string) => string | undefined;
}

export const fillXml = (f: Fill | undefined, w: WriteCtx, tag: 'a' | 'p' = 'a'): string => {
  if (!f) return '';
  switch (f.type) {
    case 'none': return '<a:noFill/>';
    case 'background': return '<a:noFill/>';
    case 'solid': return `<a:solidFill>${colorXml(f.color)}</a:solidFill>`;
    case 'gradient': {
      const stops = [...f.stops].sort((a, b) => a.pos - b.pos).map((s) => `<a:gs pos="${Math.round(clamp(s.pos) * 100000)}">${colorXml(s.color)}</a:gs>`).join('');
      const dir = f.kind === 'linear' ? `<a:lin ang="${toAng(f.angle)}" scaled="0"/>`
        : `<a:path path="${f.kind === 'rect' ? 'rect' : f.kind === 'path' ? 'shape' : 'circle'}"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>`;
      return `<a:gradFill rotWithShape="1"><a:gsLst>${stops || '<a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs><a:gs pos="100000"><a:srgbClr val="000000"/></a:gs>'}</a:gsLst>${dir}</a:gradFill>`;
    }
    case 'pattern': return `<a:pattFill prst="${esc(f.pattern)}"><a:fgClr>${colorXml(f.fg)}</a:fgClr><a:bgClr>${colorXml(f.bg)}</a:bgClr></a:pattFill>`;
    case 'picture': {
      const rid = w.mediaRel(f.media);
      if (!rid) return '<a:noFill/>';
      const a = f.transparency ? `<a:alphaModFix amt="${Math.round((1 - f.transparency) * 100000)}"/>` : '';
      return `<${tag}:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}">${a}</a:blip>${cropXml(f.crop)}${f.mode === 'tile' ? '<a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/>' : '<a:stretch><a:fillRect/></a:stretch>'}</${tag}:blipFill>`;
    }
  }
};

export const cropXml = (c: Crop | undefined): string =>
  c && (c.l || c.t || c.r || c.b) ? `<a:srcRect${['l', 't', 'r', 'b'].map((k) => { const v = Math.round((c as unknown as Record<string, number>)[k]! * 100000); return v ? ` ${k}="${v}"` : ''; }).join('')}/>` : '';

export const lineXml = (l: Line | undefined, w: WriteCtx): string => {
  if (!l) return '';
  const a: string[] = [`w="${Math.max(0, Math.round(l.width * EMU_PT))}"`];
  if (l.cap) a.push(`cap="${l.cap === 'round' ? 'rnd' : l.cap === 'square' ? 'sq' : 'flat'}"`);
  if (l.compound) a.push(`cmpd="${l.compound}"`);
  const fill = l.fill.type === 'picture' || l.fill.type === 'background' ? '<a:noFill/>' : fillXml(l.fill, w);
  const dash = l.dash && l.dash !== 'solid' ? `<a:prstDash val="${l.dash}"/>` : '';
  const join = l.join === 'round' ? '<a:round/>' : l.join === 'bevel' ? '<a:bevel/>' : l.join === 'miter' ? '<a:miter lim="800000"/>' : '';
  const end = (tag: string, e: Line['head']) => (e && e.type !== 'none' ? `<a:${tag} type="${e.type}"${e.w ? ` w="${e.w}"` : ''}${e.len ? ` len="${e.len}"` : ''}/>` : '');
  return `<a:ln ${a.join(' ')}>${fill}${dash}${join}${end('headEnd', l.head)}${end('tailEnd', l.tail)}</a:ln>`;
};

const withAlpha = (col: Color, alpha: number | undefined): Color => {
  if (alpha === undefined) return col;
  if (typeof col === 'string') return { hex: col, alpha };
  return { ...col, alpha };
};

export const effectsXml = (fx: Effects | undefined): string => {
  if (!fx) return '';
  let s = '';
  if (fx.glow) s += `<a:glow rad="${emu(fx.glow.radius)}">${colorXml(withAlpha(fx.glow.color, fx.glow.alpha))}</a:glow>`;
  if (fx.shadow?.kind === 'inner') s += `<a:innerShdw blurRad="${emu(fx.shadow.blur)}" dist="${emu(fx.shadow.dist)}" dir="${toAng(fx.shadow.angle)}">${colorXml(withAlpha(fx.shadow.color, fx.shadow.alpha))}</a:innerShdw>`;
  else if (fx.shadow) s += `<a:outerShdw blurRad="${emu(fx.shadow.blur)}" dist="${emu(fx.shadow.dist)}" dir="${toAng(fx.shadow.angle)}"${fx.shadow.kind === 'perspective' ? ' sx="100000" sy="23000" kx="1200000" algn="br"' : ' algn="tl"'} rotWithShape="0">${colorXml(withAlpha(fx.shadow.color, fx.shadow.alpha))}</a:outerShdw>`;
  if (fx.reflection) s += `<a:reflection blurRad="${emu(fx.reflection.blur)}" stA="${pct(fx.reflection.alpha)}" endPos="${pct(fx.reflection.size)}" dist="${emu(fx.reflection.dist)}" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/>`;
  if (fx.softEdge) s += `<a:softEdge rad="${emu(fx.softEdge)}"/>`;
  return s ? `<a:effectLst>${s}</a:effectLst>` : '';
};

/** Theme colours by our slot name, for writing a theme part. */
export const themeSchemeXml = (t: Theme): string => {
  const order = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'] as const;
  return `<a:clrScheme name="${esc(t.colorsName ?? t.name)}">${order.map((k) => `<a:${k}><a:srgbClr val="${hex6(t.colors[k] ?? '#000000')}"/></a:${k}>`).join('')}</a:clrScheme>`;
};
