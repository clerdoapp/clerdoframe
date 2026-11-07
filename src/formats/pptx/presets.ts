// Tables shared by the .pptx reader and writer so effects map the same way in both directions.
// Preset ids follow ECMA-376 Part 1, 19.5 (p:cTn presetClass / presetID / presetSubtype).
import type { AnimClass, TransitionName } from '../../model/deck';

/** Direction subtypes used by fly, wipe, peek and similar effects. */
export const DIR_SUB: Record<string, number> = { t: 1, r: 2, tr: 3, b: 4, br: 6, l: 8, tl: 9, bl: 12, u: 1, d: 4 };
const subDir = (n: number): string | undefined => ({ 1: 't', 2: 'r', 3: 'tr', 4: 'b', 6: 'br', 8: 'l', 9: 'tl', 12: 'bl' } as Record<number, string>)[n];

interface Entry {
  id: number;
  /** Our option -> presetSubtype. */
  sub?: (opt: string | undefined) => number;
  /** presetSubtype -> our option. */
  opt?: (sub: number) => string | undefined;
  /** animEffect filter used when writing, by option. */
  filter?: (opt: string | undefined) => string | undefined;
}

const dirs: Pick<Entry, 'sub' | 'opt'> = { sub: (o) => DIR_SUB[o ?? 'b'] ?? 4, opt: (n) => subDir(n) ?? 'b' };
const hv: Pick<Entry, 'sub' | 'opt'> = { sub: (o) => (o === 'v' ? 5 : 10), opt: (n) => (n === 5 ? 'v' : 'h') };
const inout: Pick<Entry, 'sub' | 'opt'> = { sub: (o) => (o === 'in' ? 16 : 32), opt: (n) => (n === 16 ? 'in' : 'out') };

/** Entrance effects (exit effects share the ids under presetClass "exit"). */
export const ENTR: Record<string, Entry> = {
  appear: { id: 1 },
  flyIn: { id: 2, ...dirs },
  blinds: { id: 3, ...hv, filter: (o) => (o === 'v' ? 'blinds(vertical)' : 'blinds(horizontal)') },
  box: { id: 4, ...inout, filter: (o) => (o === 'in' ? 'box(in)' : 'box(out)') },
  checkerboard: { id: 5, sub: (o) => (o === 'v' ? 5 : 10), opt: (n) => (n === 5 ? 'v' : 'h'), filter: (o) => (o === 'v' ? 'checkerboard(down)' : 'checkerboard(across)') },
  circle: { id: 6, ...inout, filter: (o) => (o === 'in' ? 'circle(in)' : 'circle(out)') },
  diamond: { id: 8, ...inout, filter: (o) => (o === 'in' ? 'diamond(in)' : 'diamond(out)') },
  dissolveIn: { id: 9, filter: () => 'dissolve' },
  fade: { id: 10, filter: () => 'fade' },
  peek: { id: 12, ...dirs, filter: (o) => `slide(from${({ t: 'Top', l: 'Left', r: 'Right' } as Record<string, string>)[o ?? ''] ?? 'Bottom'})` },
  plus: { id: 13, ...inout, filter: (o) => (o === 'in' ? 'plus(in)' : 'plus(out)') },
  randomBars: { id: 14, ...hv, filter: (o) => (o === 'v' ? 'randombar(vertical)' : 'randombar(horizontal)') },
  spiralIn: { id: 15 },
  split: {
    id: 16,
    sub: (o) => ({ vin: 21, vout: 37, hin: 26, hout: 42 } as Record<string, number>)[o ?? 'vout'] ?? 37,
    opt: (n) => ({ 21: 'vin', 37: 'vout', 26: 'hin', 42: 'hout' } as Record<number, string>)[n] ?? 'vout',
    filter: (o) => ({ vin: 'barn(inVertical)', vout: 'barn(outVertical)', hin: 'barn(inHorizontal)', hout: 'barn(outHorizontal)' } as Record<string, string>)[o ?? 'vout'] ?? 'barn(outVertical)',
  },
  stretch: { id: 17, sub: (o) => (o === 'v' ? 4 : o === 'h' ? 8 : 10), opt: (n) => (n === 4 ? 'v' : n === 8 ? 'h' : 'across') },
  strips: {
    id: 18, sub: (o) => ({ rd: 6, ld: 12, ru: 3, lu: 9 } as Record<string, number>)[o ?? 'rd'] ?? 6,
    opt: (n) => ({ 6: 'rd', 12: 'ld', 3: 'ru', 9: 'lu' } as Record<number, string>)[n] ?? 'rd',
    filter: (o) => `strips(${({ rd: 'downRight', ld: 'downLeft', ru: 'upRight', lu: 'upLeft' } as Record<string, string>)[o ?? 'rd'] ?? 'downRight'})`,
  },
  swivel: { id: 19, ...hv },
  wedge: { id: 20, filter: () => 'wedge' },
  wheel: { id: 21, sub: (o) => Number(o ?? 1) || 1, opt: (n) => String([1, 2, 3, 4, 8].includes(n) ? n : 1), filter: (o) => `wheel(${Number(o ?? 1) || 1})` },
  wipe: { id: 22, ...dirs, filter: (o) => `wipe(${({ t: 'down', l: 'right', r: 'left', b: 'up' } as Record<string, string>)[o ?? 'b'] ?? 'up'})` },
  basicZoom: { id: 23, sub: (o) => ({ in: 16, out: 32, inSlightly: 272, outSlightly: 288 } as Record<string, number>)[o ?? 'in'] ?? 16, opt: (n) => ({ 16: 'in', 32: 'out', 272: 'inSlightly', 288: 'outSlightly' } as Record<number, string>)[n] ?? 'in' },
  boomerang: { id: 25 },
  bounce: { id: 26 },
  credits: { id: 28 },
  growTurn: { id: 31 },
  pinwheel: { id: 35 },
  riseUp: { id: 37 },
  whip: { id: 41 },
  floatIn: { id: 42 },
  centerRevolve: { id: 43 },
  drop: { id: 48 },
  spinner: { id: 49 },
  compress: { id: 50 },
  fadedZoom: { id: 51 },
  curveUp: { id: 52 },
  zoom: { id: 53, sub: (o) => (o === 'slide' ? 528 : 16), opt: (n) => (n === 528 ? 'slide' : 'obj') },
  expand: { id: 55 },
  flip: { id: 56 },
  thread: { id: 57 },
  /** The 2010+ "Shape" effect with circle / box / diamond / plus options. */
  shape: {
    id: 6,
    sub: (o) => (o?.endsWith('-in') ? 16 : 32),
    filter: (o) => { const [k, d] = (o ?? 'circle-out').split('-'); return `${k ?? 'circle'}(${d === 'in' ? 'in' : 'out'})`; },
  },
};
/** Float in "down" is its own preset. */
export const FLOAT_DOWN_ID = 47;

const ENTR_BY_ID = new Map<number, string>();
for (const [k, v] of Object.entries(ENTR)) if (!ENTR_BY_ID.has(v.id) && k !== 'shape') ENTR_BY_ID.set(v.id, k);

/** Exit names that differ from the entrance they mirror. */
export const EXIT_NAMES: Record<string, string> = {
  appear: 'disappear', flyIn: 'flyOut', floatIn: 'floatOut', growTurn: 'shrinkTurn', dissolveIn: 'dissolveOut', peek: 'peekOut', expand: 'contract',
  riseUp: 'sinkDown', stretch: 'collapse', curveUp: 'curveDown', spiralIn: 'spiralOut',
};
const ENTR_OF_EXIT: Record<string, string> = Object.fromEntries(Object.entries(EXIT_NAMES).map(([a, b]) => [b, a]));

export const EMPH: Record<string, number> = {
  fillColor: 1, fontColor: 3, growShrink: 6, lineColor: 7, spin: 8, transparency: 9, boldFlash: 10, boldReveal: 15, underline: 18, objectColor: 19,
  complementaryColor: 21, darken: 25, pulse: 26, colorPulse: 27, lighten: 30, teeter: 32, wave: 34, desaturate: 35,
};
const EMPH_BY_ID = new Map(Object.entries(EMPH).map(([k, v]) => [v, k]));

const PATH_IDS: Record<string, Record<string, number>> = {
  line: { d: 42, l: 35, r: 63, u: 64 },
  arc: { d: 37, l: 39, r: 38, u: 36 },
  turn: { dr: 28, dl: 29, ur: 30, ul: 31 },
  shapes: { circle: 1, diamond: 2, triangle: 3, square: 4, pentagon: 5, hexagon: 6, octagon: 7, heart: 8, star: 9, teardrop: 10 },
  loops: { figure8: 11, loop: 12, spiral: 13, wave: 14, zigzag: 15, bounce: 16 },
};
const PATH_BY_ID = new Map<number, [string, string]>();
for (const [k, m] of Object.entries(PATH_IDS)) for (const [o, id] of Object.entries(m)) PATH_BY_ID.set(id, [k, o]);

/** Preset attributes for one of our effects. */
export const presetOf = (cls: AnimClass, effect: string, option?: string): { id: number; sub: number; filter?: string } => {
  if (cls === 'emph') return { id: EMPH[effect] ?? 26, sub: 0 };
  if (cls === 'path') {
    const id = PATH_IDS[effect]?.[option ?? ''] ?? (effect === 'custom' ? 0 : Object.values(PATH_IDS[effect] ?? {})[0] ?? 0);
    return { id, sub: 0 };
  }
  const name = cls === 'exit' ? ENTR_OF_EXIT[effect] ?? effect : effect;
  if (name === 'floatIn' && option === 'd') return { id: FLOAT_DOWN_ID, sub: 0, filter: 'fade' };
  const e = ENTR[name] ?? ENTR.fade!;
  return { id: e.id, sub: e.sub?.(option) ?? 0, ...(e.filter ? { filter: e.filter(option) } : {}) };
};

/** Our effect for preset attributes from a file. */
export const effectOf = (cls: AnimClass, id: number, sub: number): { effect: string; option?: string } => {
  if (cls === 'emph') return { effect: EMPH_BY_ID.get(id) ?? 'pulse' };
  if (cls === 'path') { const hit = PATH_BY_ID.get(id); return hit ? { effect: hit[0], option: hit[1] } : { effect: 'custom' }; }
  let name: string, option: string | undefined;
  if (id === FLOAT_DOWN_ID) { name = 'floatIn'; option = 'd'; }
  else if ([4, 6, 8, 13].includes(id) && (sub === 16 || sub === 32) && id !== 4) {
    const k = id === 6 ? 'circle' : id === 8 ? 'diamond' : 'plus';
    name = 'shape'; option = `${k}-${sub === 16 ? 'in' : 'out'}`;
  } else {
    name = ENTR_BY_ID.get(id) ?? 'fade';
    const e = ENTR[name];
    option = e?.opt ? e.opt(sub) : undefined;
  }
  if (name === 'floatIn' && option === undefined) option = 'u';
  return { effect: cls === 'exit' ? EXIT_NAMES[name] ?? name : name, ...(option !== undefined ? { option } : {}) };
};

// ---------- Transitions ----------

export interface TransXml { ns: 'p' | 'p14' | 'p15' | 'p159'; tag: string; attrs: Record<string, string> }

const DIR_LRUD = (o: string | undefined, d = 'l'): string => (['l', 'r', 'u', 'd'].includes(o ?? '') ? o! : d);
const P15 = new Set<TransitionName>(['fallOver', 'drape', 'curtains', 'wind', 'prestige', 'fracture', 'crush', 'peelOff', 'pageCurl', 'airplane', 'origami']);

/** The element a transition is written as. */
export const transitionXml = (name: TransitionName, o: string | undefined): TransXml => {
  if (P15.has(name)) return { ns: 'p15', tag: 'prstTrans', attrs: { prst: name === 'pageCurl' ? (o === 'single' ? 'pageCurlSingle' : 'pageCurlDouble') : name, ...(o === 'r' || o === 'rev' ? { invX: '1' } : {}) } };
  switch (name) {
    case 'morph': return { ns: 'p159', tag: 'morph', attrs: { option: o === 'word' ? 'byWord' : o === 'char' ? 'byChar' : 'byObject' } };
    case 'fade': return { ns: 'p', tag: 'fade', attrs: o === 'black' ? { thruBlk: '1' } : {} };
    case 'push': return { ns: 'p', tag: 'push', attrs: { dir: DIR_LRUD(o, 'u') } };
    case 'wipe': return { ns: 'p', tag: 'wipe', attrs: { dir: DIR_LRUD(o, 'r') } };
    case 'split': return { ns: 'p', tag: 'split', attrs: { orient: o?.startsWith('h') ? 'horz' : 'vert', dir: o?.endsWith('in') ? 'in' : 'out' } };
    case 'reveal': return { ns: 'p14', tag: 'reveal', attrs: { dir: o === 'r' ? 'r' : 'l', ...(o === 'black' ? { thruBlk: '1' } : {}) } };
    case 'randomBars': return { ns: 'p', tag: 'randomBar', attrs: { dir: o === 'h' ? 'horz' : 'vert' } };
    case 'shape': return { ns: 'p', tag: o === 'diamond' ? 'diamond' : o === 'plus' ? 'plus' : 'circle', attrs: {} };
    case 'uncover': return { ns: 'p', tag: 'pull', attrs: { dir: o ?? 'l' } };
    case 'cover': return { ns: 'p', tag: 'cover', attrs: { dir: o ?? 'l' } };
    case 'flash': return { ns: 'p14', tag: 'flash', attrs: {} };
    case 'dissolve': return { ns: 'p', tag: 'dissolve', attrs: {} };
    case 'checkerboard': return { ns: 'p', tag: 'checker', attrs: { dir: o === 'v' ? 'vert' : 'horz' } };
    case 'blinds': return { ns: 'p', tag: 'blinds', attrs: { dir: o === 'v' ? 'vert' : 'horz' } };
    case 'clock': return o === 'reverse' ? { ns: 'p14', tag: 'wheelReverse', attrs: { spokes: '1' } } : o === 'wedge' ? { ns: 'p', tag: 'wedge', attrs: {} } : { ns: 'p', tag: 'wheel', attrs: { spokes: '1' } };
    case 'ripple': return { ns: 'p14', tag: 'ripple', attrs: o && o !== 'center' ? { dir: o } : {} };
    case 'honeycomb': return { ns: 'p14', tag: 'honeycomb', attrs: {} };
    case 'glitter': return { ns: 'p14', tag: 'glitter', attrs: { pattern: o === 'hexagon' ? 'hexagon' : 'diamond', dir: 'l' } };
    case 'vortex': return { ns: 'p14', tag: 'vortex', attrs: { dir: DIR_LRUD(o, 'r') } };
    case 'shred': return { ns: 'p14', tag: 'shred', attrs: {} };
    case 'switch': return { ns: 'p14', tag: 'switch', attrs: { dir: o === 'l' ? 'l' : 'r' } };
    case 'flip': return { ns: 'p14', tag: 'flip', attrs: { dir: o === 'l' ? 'l' : 'r' } };
    case 'gallery': return { ns: 'p14', tag: 'gallery', attrs: { dir: o === 'r' ? 'r' : 'l' } };
    case 'cube': return { ns: 'p14', tag: 'prism', attrs: { dir: DIR_LRUD(o, 'l') } };
    case 'box': return { ns: 'p14', tag: 'prism', attrs: { dir: DIR_LRUD(o, 'l'), isContent: '1' } };
    case 'rotate': return { ns: 'p14', tag: 'prism', attrs: { dir: DIR_LRUD(o, 'l'), isInverted: '1' } };
    case 'orbit': return { ns: 'p14', tag: 'prism', attrs: { dir: DIR_LRUD(o, 'l'), isContent: '1', isInverted: '1' } };
    case 'doors': return { ns: 'p14', tag: 'doors', attrs: { dir: o === 'h' ? 'horz' : 'vert' } };
    case 'window': return { ns: 'p14', tag: 'window', attrs: { dir: o === 'h' ? 'horz' : 'vert' } };
    case 'comb': return { ns: 'p', tag: 'comb', attrs: { dir: o === 'v' ? 'vert' : 'horz' } };
    case 'zoom': return { ns: 'p', tag: 'zoom', attrs: { dir: o === 'out' ? 'out' : 'in' } };
    case 'random': return { ns: 'p', tag: 'random', attrs: {} };
    case 'pan': return { ns: 'p14', tag: 'pan', attrs: { dir: DIR_LRUD(o, 'u') } };
    case 'ferris': return { ns: 'p14', tag: 'ferris', attrs: { dir: o === 'r' ? 'r' : 'l' } };
    case 'conveyor': return { ns: 'p14', tag: 'conveyor', attrs: { dir: o === 'r' ? 'r' : 'l' } };
    case 'flythrough': return { ns: 'p14', tag: 'flythrough', attrs: o === 'out' ? { dir: 'out' } : {} };
    default: return { ns: 'p', tag: 'fade', attrs: {} };
  }
};

/** Our transition for an element read from a file. */
export const transitionOf = (tag: string, a: Record<string, string>): { name: TransitionName; option?: string } | null => {
  const d = a.dir;
  switch (tag) {
    case 'morph': return { name: 'morph', option: a.option === 'byWord' ? 'word' : a.option === 'byChar' ? 'char' : 'object' };
    case 'prstTrans': {
      const p = a.prst ?? 'fallOver';
      if (p.startsWith('pageCurl')) return { name: 'pageCurl', option: p === 'pageCurlSingle' ? 'single' : 'double' };
      return P15.has(p as TransitionName) ? { name: p as TransitionName } : { name: 'fade' };
    }
    case 'fade': return { name: 'fade', ...(a.thruBlk === '1' || a.thruBlk === 'true' ? { option: 'black' } : {}) };
    case 'cut': return a.thruBlk === '1' ? { name: 'fade', option: 'black' } : { name: 'none' };
    case 'push': return { name: 'push', option: d ?? 'l' };
    case 'wipe': return { name: 'wipe', option: d ?? 'l' };
    case 'split': return { name: 'split', option: `${a.orient === 'vert' ? 'v' : 'h'}${a.dir === 'in' ? 'in' : 'out'}` };
    case 'reveal': return { name: 'reveal', option: a.thruBlk === '1' ? 'black' : d ?? 'l' };
    case 'randomBar': return { name: 'randomBars', option: d === 'horz' ? 'h' : 'v' };
    case 'circle': case 'diamond': case 'plus': return { name: 'shape', option: tag };
    case 'pull': return { name: 'uncover', option: d ?? 'l' };
    case 'cover': return { name: 'cover', option: d ?? 'l' };
    case 'flash': return { name: 'flash' };
    case 'dissolve': return { name: 'dissolve' };
    case 'checker': return { name: 'checkerboard', option: d === 'vert' ? 'v' : 'h' };
    case 'blinds': return { name: 'blinds', option: d === 'vert' ? 'v' : 'h' };
    case 'wheel': return { name: 'clock', option: 'wheel' };
    case 'wheelReverse': return { name: 'clock', option: 'reverse' };
    case 'wedge': return { name: 'clock', option: 'wedge' };
    case 'ripple': return { name: 'ripple', option: d ?? 'center' };
    case 'honeycomb': return { name: 'honeycomb' };
    case 'glitter': return { name: 'glitter', option: a.pattern === 'hexagon' ? 'hexagon' : 'diamond' };
    case 'vortex': return { name: 'vortex', option: d ?? 'l' };
    case 'shred': return { name: 'shred' };
    case 'switch': return { name: 'switch', option: d ?? 'r' };
    case 'flip': return { name: 'flip', option: d ?? 'r' };
    case 'gallery': return { name: 'gallery', option: d ?? 'l' };
    case 'prism': {
      const c = a.isContent === '1' || a.isContent === 'true', inv = a.isInverted === '1' || a.isInverted === 'true';
      return { name: c && inv ? 'orbit' : c ? 'box' : inv ? 'rotate' : 'cube', option: d ?? 'l' };
    }
    case 'doors': return { name: 'doors', option: d === 'horz' ? 'h' : 'v' };
    case 'window': return { name: 'window', option: d === 'horz' ? 'h' : 'v' };
    case 'comb': return { name: 'comb', option: d === 'vert' ? 'v' : 'h' };
    case 'zoom': case 'warp': return { name: 'zoom', option: d === 'out' ? 'out' : 'in' };
    case 'newsflash': return { name: 'zoom', option: 'in' };
    case 'random': return { name: 'random' };
    case 'pan': return { name: 'pan', option: d ?? 'u' };
    case 'ferris': return { name: 'ferris', option: d ?? 'l' };
    case 'conveyor': return { name: 'conveyor', option: d ?? 'l' };
    case 'flythrough': return { name: 'flythrough', option: d === 'out' ? 'out' : 'in' };
    case 'strips': return { name: 'wipe', option: 'd' };
    default: return null;
  }
};

/** Base-schema element written as the fallback for newer transitions. */
export const fallbackTransition = (x: TransXml): TransXml => (x.ns === 'p' ? x : { ns: 'p', tag: 'fade', attrs: {} });
