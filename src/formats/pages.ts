// Page layout for PDF export and printing: slides, notes pages, handouts and outline.
// Pure: pages are lists of boxes in points; the PDF writer and the print view draw them.
import type { Deck, Slide, TextBody } from '../model/deck';

export type PageKind = 'slides' | 'notes' | 'handouts' | 'outline';

export interface PageOptions {
  kind: PageKind;
  /** 1-based inclusive range; omitted = all. */
  from?: number;
  to?: number;
  hidden?: boolean;
  /** Handout slides per page. */
  perPage?: 1 | 2 | 3 | 4 | 6 | 9;
  frame?: boolean;
  /** Page size in points for notes, handouts and outline (portrait). */
  paper?: { w: number; h: number };
}

export interface SlideBox { type: 'slide'; index: number; x: number; y: number; w: number; h: number; frame: boolean }
export interface TextBox { type: 'text'; x: number; y: number; w: number; size: number; bold?: boolean; lines: string[]; indent?: number }
export interface RuleBox { type: 'rule'; x: number; y: number; w: number }
export type PageItem = SlideBox | TextBox | RuleBox;
export interface Page { w: number; h: number; items: PageItem[] }

export const LETTER = { w: 612, h: 792 };
export const A4 = { w: 595.28, h: 841.89 };

export const bodyLines = (t: TextBody | undefined): { text: string; level: number }[] =>
  (t?.paras ?? []).map((p) => ({ text: p.runs.map((r) => (r.br ? '\n' : r.text)).join(''), level: p.style?.level ?? 0 }));

export const slideTitle = (s: Slide): string => {
  const t = s.shapes.find((x) => x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle'));
  return t?.kind === 'shape' ? bodyLines(t.text).map((l) => l.text).join(' ').trim() : '';
};

/** Body text of a slide (placeholders other than the title, then text boxes), for outlines. */
export const slideBody = (s: Slide): { text: string; level: number }[] => {
  const out: { text: string; level: number }[] = [];
  for (const sh of s.shapes) {
    if (sh.kind !== 'shape' || !sh.text) continue;
    if (sh.ph && (sh.ph.type === 'title' || sh.ph.type === 'ctrTitle' || ['dt', 'ftr', 'sldNum'].includes(sh.ph.type))) continue;
    if (!sh.ph && !sh.textbox) continue;
    for (const l of bodyLines(sh.text)) if (l.text.trim()) out.push(l);
  }
  return out;
};

/** Simple word wrap by an average glyph width (0.5 em), good enough for notes and outlines. */
export const wrap = (text: string, width: number, size: number): string[] => {
  const max = Math.max(4, Math.floor(width / (size * 0.5)));
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if ((line ? line.length + 1 : 0) + word.length > max && line) { out.push(line); line = ''; }
      let w = word;
      while (w.length > max) { out.push(w.slice(0, max)); w = w.slice(max); }
      line = line ? `${line} ${w}` : w;
    }
    out.push(line);
  }
  return out;
};

export const pickSlides = (deck: Deck, o: Pick<PageOptions, 'from' | 'to' | 'hidden'>): number[] => {
  const n = deck.slides.length;
  const from = Math.max(1, Math.min(n, o.from ?? 1)), to = Math.max(from, Math.min(n, o.to ?? n));
  const out: number[] = [];
  for (let i = from - 1; i < to; i++) if (o.hidden || !deck.slides[i]!.hidden) out.push(i);
  return out;
};

const GRID: Record<number, [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 9: [3, 3] };

export const layoutPages = (deck: Deck, o: PageOptions): Page[] => {
  const idx = pickSlides(deck, o);
  const ratio = deck.h / deck.w;
  const frame = !!o.frame;
  const paper = o.paper ?? LETTER;
  const M = 54;
  if (o.kind === 'slides') {
    // One slide per page at the slide's own size (in points).
    const w = (deck.w * 72) / 96, h = (deck.h * 72) / 96;
    return idx.map((i) => ({ w, h, items: [{ type: 'slide', index: i, x: 0, y: 0, w, h, frame }] }));
  }
  if (o.kind === 'notes') {
    return idx.map((i) => {
      const sw = paper.w - 2 * M, sh = sw * ratio;
      const items: PageItem[] = [{ type: 'slide', index: i, x: M, y: M, w: sw, h: sh, frame: true }];
      const lines = bodyLines(deck.slides[i]!.notes).flatMap((l) => wrap(l.text, sw, 12));
      items.push({ type: 'text', x: M, y: M + sh + 30, w: sw, size: 12, lines });
      return { ...paper, items };
    });
  }
  if (o.kind === 'handouts') {
    const per = o.perPage ?? 6;
    const [cols, rows] = GRID[per] ?? [2, 3];
    const pages: Page[] = [];
    const lined = per === 3;
    for (let p = 0; p < idx.length; p += per) {
      const items: PageItem[] = [];
      const areaW = paper.w - 2 * M, areaH = paper.h - 2 * M;
      const cellW = lined ? areaW / 2 : areaW / cols, cellH = areaH / rows;
      const gap = 18;
      idx.slice(p, p + per).forEach((i, k) => {
        const c = lined ? 0 : k % cols, r = lined ? k : Math.floor(k / cols);
        let w = cellW - gap, h = w * ratio;
        if (h > cellH - gap) { h = cellH - gap; w = h / ratio; }
        const x = M + c * cellW + (cellW - w) / 2, y = M + r * cellH + (cellH - h) / 2;
        items.push({ type: 'slide', index: i, x, y, w, h, frame: true });
        if (lined) for (let n = 0; n < 6; n++) items.push({ type: 'rule', x: M + areaW / 2 + 12, y: M + r * cellH + 24 + n * ((cellH - 36) / 6), w: areaW / 2 - 12 });
      });
      pages.push({ ...paper, items });
    }
    return pages;
  }
  // Outline: titles and body text flow over pages.
  const pages: Page[] = [];
  let items: PageItem[] = [];
  let y = M;
  const flush = () => { pages.push({ ...paper, items }); items = []; y = M; };
  const width = paper.w - 2 * M;
  for (const i of idx) {
    const s = deck.slides[i]!;
    const head = wrap(`${i + 1}  ${slideTitle(s) || 'Untitled slide'}`, width, 14);
    if (y + head.length * 18 > paper.h - M) flush();
    items.push({ type: 'text', x: M, y, w: width, size: 14, bold: true, lines: head });
    y += head.length * 18 + 4;
    for (const b of slideBody(s)) {
      const ind = 18 + b.level * 18;
      const lines = wrap(b.text, width - ind, 11);
      if (y + lines.length * 14 > paper.h - M) flush();
      items.push({ type: 'text', x: M + ind, y, w: width - ind, size: 11, lines, indent: ind });
      y += lines.length * 14 + 2;
    }
    y += 10;
  }
  if (items.length || !pages.length) flush();
  return pages;
};
