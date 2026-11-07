// Helpers to build decks in code: used by the starter templates and the shipped examples.
import {
  textBody, uid,
  type AutoShape, type Chart, type Color, type Deck, type Fill, type Layout, type Master, type Paragraph, type RunStyle, type Shape, type Slide, type Table, type Theme,
} from '../../model/deck';
import { newDeck, newSlide } from '../../model/defaults';

export const solid = (color: Color): Fill => ({ type: 'solid', color });
export const T = (theme: Parameters<typeof themeColor>[0], lum?: number, alpha?: number): Color => themeColor(theme, lum, alpha);
const themeColor = (theme: 'dk1' | 'lt1' | 'dk2' | 'lt2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'tx1' | 'bg1' | 'tx2' | 'bg2', lum?: number, alpha?: number): Color =>
  ({ theme, ...(lum ? { lum } : {}), ...(alpha !== undefined ? { alpha } : {}) });

export const rect = (name: string, x: number, y: number, w: number, h: number, fill: Fill, extra: Partial<AutoShape> = {}): AutoShape =>
  ({ id: uid('s'), kind: 'shape', name, geom: 'rect', x, y, w, h, fill, ...extra });

export const shape = (geom: string, name: string, x: number, y: number, w: number, h: number, fill: Fill, extra: Partial<AutoShape> = {}): AutoShape =>
  ({ id: uid('s'), kind: 'shape', name, geom, x, y, w, h, fill, ...extra });

export const text = (name: string, x: number, y: number, w: number, h: number, content: string | Paragraph[], style: RunStyle = {}, extra: Partial<AutoShape> = {}): AutoShape => ({
  id: uid('s'), kind: 'shape', name, geom: 'rect', x, y, w, h, textbox: true, fill: { type: 'none' },
  text: typeof content === 'string' ? { ...textBody(content, style), wrap: true } : { paras: content, wrap: true },
  ...extra,
});

export interface Design {
  name: string;
  theme: Theme;
  /** Decoration on the master (drawn behind every slide), in a 1280 x 720 frame. */
  master: (W: number, H: number) => Shape[];
  /** Extra decoration for the title and section layouts. */
  title?: (W: number, H: number) => Shape[];
  background?: Fill;
  titleBackground?: Fill;
  /** Title text colour on the title layout when the background differs. */
  titleInk?: Color;
  titleAlign?: 'l' | 'ctr';
}

const placeholder = (l: Layout, type: string) => l.shapes.find((s) => s.ph?.type === type) as AutoShape | undefined;

/** A deck with the design applied to its master and title layouts. */
export const designDeck = (d: Design, W = 1280, H = 720): Deck => {
  const deck = newDeck(W, H);
  const sy = H / 720;
  const m: Master = deck.masters[0]!;
  m.name = d.name;
  m.theme = structuredClone(d.theme);
  if (d.background) m.background = { fill: d.background };
  m.shapes = [...d.master(W, H), ...m.shapes];
  m.textStyles.title[0]!.defRun = { ...m.textStyles.title[0]!.defRun, color: { theme: 'tx1' } };
  for (const l of m.layouts) {
    if (l.type === 'secHead') {
      // Title above its description: bottom-anchored title box ends where the text box starts.
      const t = placeholder(l, 'title'), b = placeholder(l, 'body');
      if (t && b) {
        t.y = Math.round(180 * sy); t.h = Math.round(260 * sy); b.y = Math.round(452 * sy);
        const p0 = b.text?.paras[0] ?? { runs: [] };
        b.text = { ...(b.text ?? { paras: [] }), paras: [{ ...p0, style: { ...(p0.style ?? {}), bullet: { type: 'none' }, marginLeft: 0, indent: 0, defRun: { size: 20, color: { theme: 'tx1', lum: 0.25 }, ...(p0.style?.defRun ?? {}) } } }] };
      }
    }
    if (l.type === 'title' || l.type === 'secHead') {
      if (d.title) { l.hideMasterGraphics = true; l.shapes = [...d.title(W, H), ...l.shapes]; }
      if (d.titleBackground) l.background = { fill: d.titleBackground };
      for (const t of ['ctrTitle', 'title', 'subTitle', 'body']) {
        const p = placeholder(l, t);
        if (!p) continue;
        p.text = p.text ?? { paras: [{ runs: [] }] };
        const para = p.text.paras[0] ?? { runs: [] };
        para.style = { ...(para.style ?? {}), ...(d.titleAlign ? { align: d.titleAlign } : {}), ...(d.titleInk ? { defRun: { ...(para.style?.defRun ?? {}), color: d.titleInk } } : {}) };
        p.text.paras[0] = para;
      }
    }
  }
  deck.slides = [newSlide(m.layouts[0]!)];
  return deck;
};

export const layoutOf = (deck: Deck, type: string): Layout => deck.masters[0]!.layouts.find((l) => l.type === type) ?? deck.masters[0]!.layouts[0]!;

/** Adds a slide on a layout and fills its placeholders. */
export const addSlide = (deck: Deck, type: string, fill: { title?: string; body?: string | Paragraph[]; body2?: string | Paragraph[]; sub?: string } = {}, extra: Shape[] = [], notes?: string): Slide => {
  const s = newSlide(layoutOf(deck, type));
  for (const sh of s.shapes) {
    if (sh.kind !== 'shape' || !sh.ph) continue;
    const t = sh.ph.type;
    const keep = sh.text?.paras[0]?.style;
    const set = (v: string | Paragraph[] | undefined) => {
      if (v === undefined) return;
      sh.text = { ...(sh.text ?? {}), paras: typeof v === 'string' ? v.split('\n').map((line) => { const lvl = line.match(/^\t*/)![0].length; return { runs: [{ text: line.replace(/^\t+/, '') }], ...(keep || lvl ? { style: { ...(keep ?? {}), ...(lvl ? { level: lvl } : {}) } } : {}) }; }) : v };
    };
    if (t === 'title' || t === 'ctrTitle') set(fill.title);
    else if (t === 'subTitle') set(fill.sub ?? (typeof fill.body === 'string' ? fill.body : undefined));
    else if (t === 'body' || t === 'obj') set(sh.ph.idx === 2 && fill.body2 !== undefined ? fill.body2 : sh.ph.idx === 2 || sh.ph.idx === 4 ? fill.body2 : fill.body);
  }
  // Drop empty content placeholders the example fills with its own shapes.
  if (extra.length) s.shapes = s.shapes.filter((x) => !(x.ph && (x.ph.type === 'body' || x.ph.type === 'obj') && x.kind === 'shape' && !x.text?.paras.some((p) => p.runs.some((r) => r.text))));
  s.shapes.push(...extra);
  if (notes) s.notes = textBody(notes);
  deck.slides.push(s);
  return s;
};

export const chart = (name: string, x: number, y: number, w: number, h: number, chartType: Chart['chartType'], categories: string[], series: Chart['series'], extra: Partial<Chart> = {}): Chart =>
  ({ id: uid('s'), kind: 'chart', name, x, y, w, h, chartType, categories, series, legend: 'b', ...extra });

export const table = (name: string, x: number, y: number, w: number, rows: string[][], head: Color, extra: Partial<Table> = {}): Table => {
  const cols = rows[0]!.length;
  const cw = w / cols;
  return {
    id: uid('s'), kind: 'table', name, x, y, w, h: rows.length * 44, cols: Array.from({ length: cols }, () => cw), opts: { firstRow: true, bandRow: true },
    rows: rows.map((r, ri) => ({
      h: 44,
      cells: r.map((c) => ({
        text: { paras: [{ runs: [{ text: c, style: { size: 16, ...(ri === 0 ? { bold: true, color: { theme: 'bg1' } } : {}) } }] }] },
        fill: ri === 0 ? solid(head) : solid(ri % 2 ? { theme: 'bg2' } : { theme: 'bg1' }),
        vAlign: 'ctr' as const,
        borders: { b: { fill: solid({ theme: 'bg2', lum: -0.1 }), width: 0.75 } },
      })),
    })),
    ...extra,
  };
};

export const bullets = (lines: string[], style: RunStyle = {}): Paragraph[] =>
  lines.map((l) => { const lvl = l.match(/^\t*/)![0].length; return { runs: [{ text: l.replace(/^\t+/, ''), style }], ...(lvl ? { style: { level: lvl } } : {}) }; });
