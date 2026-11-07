/** Pure checks used by Review: text walking for spelling, statistics and the accessibility checker. */
import { masterOf, textOf, walkShapes, type AutoShape, type Color, type Deck, type Fill, type Id, type Paragraph, type Shape, type TextBody, type Theme } from '../../model/deck';
import { hexToRgb, resolve } from '../../render/color';

// ---------- Text spots ----------

/** One editable piece of text: a slide shape's body, a table cell, or the slide's notes. */
export interface Spot { slide: number; shape?: Id; cell?: { r: number; c: number }; notes?: boolean; label: string }

export const bodyAt = (deck: Deck, sp: Spot): TextBody | undefined => {
  const s = deck.slides[sp.slide];
  if (!s) return undefined;
  if (sp.notes) return s.notes;
  let hit: Shape | null = null;
  walkShapes(s.shapes, (x) => { if (x.id === sp.shape) hit = x; });
  const sh = hit as Shape | null;
  if (!sh) return undefined;
  if (sh.kind === 'shape') return sh.text;
  if (sh.kind === 'table' && sp.cell) return sh.rows[sp.cell.r]?.cells[sp.cell.c]?.text;
  return undefined;
};

export const spots = (deck: Deck): Spot[] => {
  const out: Spot[] = [];
  deck.slides.forEach((s, i) => {
    walkShapes(s.shapes, (x) => {
      if (x.kind === 'shape' && x.text) out.push({ slide: i, shape: x.id, label: `Slide ${i + 1}` });
      if (x.kind === 'table') x.rows.forEach((r, ri) => r.cells.forEach((c, ci) => { if (!c.hMerge && !c.vMerge) out.push({ slide: i, shape: x.id, cell: { r: ri, c: ci }, label: `Slide ${i + 1}, table` }); }));
    });
    out.push({ slide: i, notes: true, label: `Slide ${i + 1} notes` });
  });
  return out;
};

export interface Word { word: string; para: number; start: number }

/** Words in a text body, positions are offsets inside each paragraph's joined run text. */
export const wordsOf = (t: TextBody | undefined): Word[] => {
  const out: Word[] = [];
  (t?.paras ?? []).forEach((p, pi) => {
    const text = paraText(p);
    for (const m of text.matchAll(/[\p{L}][\p{L}\p{M}'’]*[\p{L}]|[\p{L}]/gu)) {
      const w = m[0].replace(/[’']+$/, '');
      if (/\d/.test(w) || w.length < 2) continue;
      if (/^[A-Z0-9]{2,}$/.test(w)) continue; // all-caps abbreviations
      out.push({ word: w, para: pi, start: m.index! });
    }
  });
  return out;
};

export const paraText = (p: Paragraph): string => p.runs.map((r) => (r.br ? '\n' : r.field ? '' : r.text)).join('');

/** Replaces text in one paragraph by offset, keeping the run styles around it. */
export const replaceIn = (p: Paragraph, start: number, len: number, to: string): void => {
  let pos = 0;
  let done = false;
  for (const r of p.runs) {
    const t = r.br ? '\n' : r.field ? '' : r.text;
    const a = pos, b = pos + t.length;
    pos = b;
    if (r.br || r.field || b <= start || a >= start + len) continue;
    const from = Math.max(0, start - a), to2 = Math.min(t.length, start + len - a);
    r.text = t.slice(0, from) + (done ? '' : to) + t.slice(to2);
    done = true;
  }
};

// ---------- Statistics ----------

export interface Stats { slides: number; hidden: number; words: number; paragraphs: number; notesWords: number; media: number; pictures: number; characters: number; sections: number }

const countWords = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

export const stats = (deck: Deck): Stats => {
  const st: Stats = { slides: deck.slides.length, hidden: deck.slides.filter((s) => s.hidden).length, words: 0, paragraphs: 0, notesWords: 0, media: 0, pictures: 0, characters: 0, sections: deck.sections.length };
  const body = (t: TextBody | undefined) => { for (const p of t?.paras ?? []) { const x = paraText(p); if (x.trim()) { st.paragraphs++; st.words += countWords(x); st.characters += x.replace(/\s/g, '').length; } } };
  for (const s of deck.slides) {
    walkShapes(s.shapes, (x) => {
      if (x.kind === 'shape') body(x.text);
      else if (x.kind === 'table') for (const r of x.rows) for (const c of r.cells) body(c.text);
      else if (x.kind === 'picture') st.pictures++;
      else if (x.kind === 'media') st.media++;
      else if (x.kind === 'diagram') for (const n of x.nodes) { st.words += countWords(n.text); if (n.text.trim()) st.paragraphs++; }
    });
    st.notesWords += countWords(textOf(s.notes));
  }
  return st;
};

// ---------- Contrast ----------

const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex: string): number => { const [r, g, b] = hexToRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a: string, b: string): number => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const mix = (a: string, b: string, k: number): string => {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r1 + (r2 - r1) * k)}${h(g1 + (g2 - g1) * k)}${h(b1 + (b2 - b1) * k)}`;
};

/** A representative colour for a fill: solid as-is, gradient as the average of its stops. Null for pictures. */
export const fillColor = (f: Fill | undefined, theme: Theme, under = '#FFFFFF'): string | null => {
  if (!f || f.type === 'none') return null;
  if (f.type === 'solid') { const c = resolve(f.color, { theme }); return c.alpha < 1 ? mix(under, c.hex, c.alpha) : c.hex; }
  if (f.type === 'gradient') {
    const cs = f.stops.map((s) => resolve(s.color, { theme }));
    if (!cs.length) return null;
    const avg = cs.reduce((acc, c) => { const [r, g, b] = hexToRgb(c.alpha < 1 ? mix(under, c.hex, c.alpha) : c.hex); return [acc[0]! + r, acc[1]! + g, acc[2]! + b]; }, [0, 0, 0]);
    const h = (n: number) => Math.round(n / cs.length).toString(16).padStart(2, '0');
    return `#${h(avg[0]!)}${h(avg[1]!)}${h(avg[2]!)}`;
  }
  if (f.type === 'pattern') return resolve(f.bg, { theme }).hex;
  return null;
};

// ---------- Accessibility ----------

export type IssueKind = 'alt' | 'title' | 'dupTitle' | 'contrast' | 'order' | 'tableHeader' | 'emptyPh' | 'link';
export interface Issue { kind: IssueKind; slide: number; shape?: Id; text: string; severity: 'error' | 'warning' | 'tip'; ratio?: number }

export const ISSUE_INFO: Record<IssueKind, { title: string; why: string; fix: string }> = {
  alt: { title: 'Missing alt text', why: 'People using screen readers hear a description instead of seeing the picture.', fix: 'Describe what it shows, or mark it as decorative.' },
  title: { title: 'Missing slide title', why: 'Titles let people move between slides and understand them out of context.', fix: 'Add a title. You can hide it off the slide if needed.' },
  dupTitle: { title: 'Duplicate slide title', why: 'Identical titles make it hard to tell slides apart.', fix: 'Give each slide its own title, for example "(2 of 3)".' },
  contrast: { title: 'Hard-to-read text', why: 'Low contrast between text and background is hard to read for many people.', fix: 'Aim for a contrast of at least 4.5:1 (3:1 for large text).' },
  order: { title: 'Check reading order', why: 'Screen readers read shapes in selection pane order, which may differ from what you see.', fix: 'Open the selection pane and arrange shapes from top to bottom.' },
  tableHeader: { title: 'Table without header row', why: 'A header row tells screen readers what each column holds.', fix: 'Turn on Header row for the table.' },
  emptyPh: { title: 'Empty placeholder', why: 'Empty placeholders are read out as blank items.', fix: 'Type in it or delete it.' },
  link: { title: 'Unclear link text', why: 'Link text such as "click here" or a raw address does not say where it goes.', fix: 'Use words that describe the destination.' },
};

const UNCLEAR = /^(click here|here|link|this|more|read more|this link|click|go)$/i;

const effectiveTextColor = (deck: Deck, slideIdx: number, s: AutoShape): string | null => {
  const slide = deck.slides[slideIdx]!;
  const { master } = masterOf(deck, slide.layout);
  const p0 = s.text?.paras.find((p) => paraText(p).trim());
  const r0 = p0?.runs.find((r) => r.text.trim());
  let c: Color | undefined = r0?.style?.color ?? p0?.style?.defRun?.color;
  if (!c) {
    const ts = master.textStyles;
    const list = s.ph && (s.ph.type === 'title' || s.ph.type === 'ctrTitle') ? ts.title : s.ph ? ts.body : null;
    c = list?.[p0?.style?.level ?? 0]?.defRun?.color ?? { theme: 'tx1' };
  }
  return resolve(c, { theme: master.theme }).hex;
};

/** The colour behind a shape: its own fill if it has one, else the slide's background. */
const backdrop = (deck: Deck, slideIdx: number, s: AutoShape): string | null => {
  const slide = deck.slides[slideIdx]!;
  const { master, layout } = masterOf(deck, slide.layout);
  const bg = (slide.background ?? layout.background ?? master.background).fill;
  const bgc = fillColor(bg, master.theme);
  if (s.fill && s.fill.type !== 'none' && s.fill.type !== 'background') return fillColor(s.fill, master.theme, bgc ?? '#FFFFFF');
  return bgc;
};

const sizeOf = (deck: Deck, slideIdx: number, s: AutoShape): { size: number; bold: boolean } => {
  const slide = deck.slides[slideIdx]!;
  const { master } = masterOf(deck, slide.layout);
  const p0 = s.text?.paras[0];
  const r0 = p0?.runs[0];
  const isT = s.ph && (s.ph.type === 'title' || s.ph.type === 'ctrTitle');
  const base = isT ? master.textStyles.title[0]?.defRun : s.ph ? master.textStyles.body[0]?.defRun : { size: 18 };
  return { size: r0?.style?.size ?? p0?.style?.defRun?.size ?? base?.size ?? 18, bold: !!(r0?.style?.bold ?? p0?.style?.defRun?.bold ?? base?.bold) };
};

export const accessibility = (deck: Deck): Issue[] => {
  const out: Issue[] = [];
  const titles = new Map<string, number[]>();
  deck.slides.forEach((slide, i) => {
    const title = slide.shapes.find((x): x is AutoShape => x.kind === 'shape' && !!x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle'));
    const tt = textOf(title?.text).trim();
    if (!tt) out.push({ kind: 'title', slide: i, ...(title ? { shape: title.id } : {}), text: `Slide ${i + 1}`, severity: 'error' });
    else { const k = tt.toLowerCase(); titles.set(k, [...(titles.get(k) ?? []), i]); }
    walkShapes(slide.shapes, (s) => {
      const name = s.name || s.kind;
      if (['picture', 'chart', 'diagram', 'media', 'ole', 'equation', 'group'].includes(s.kind) && s.kind !== 'group' && !s.alt?.trim() && !s.decorative)
        out.push({ kind: 'alt', slide: i, shape: s.id, text: name, severity: 'error' });
      if (s.kind === 'table' && !s.opts?.firstRow) out.push({ kind: 'tableHeader', slide: i, shape: s.id, text: name, severity: 'error' });
      if (s.kind === 'shape') {
        const txt = textOf(s.text);
        if (s.ph && !txt.trim() && !['dt', 'ftr', 'sldNum', 'title', 'ctrTitle'].includes(s.ph.type)) out.push({ kind: 'emptyPh', slide: i, shape: s.id, text: name, severity: 'tip' });
        for (const p of s.text?.paras ?? []) for (const r of p.runs) {
          const url = r.style?.link?.url;
          if (!url) continue;
          const t = r.text.trim();
          if (UNCLEAR.test(t) || /^(https?:|www\.)/i.test(t)) { out.push({ kind: 'link', slide: i, shape: s.id, text: `"${t.slice(0, 40)}"`, severity: 'warning' }); break; }
        }
        if (txt.trim() && !s.hidden) {
          const fg = effectiveTextColor(deck, i, s), bg = backdrop(deck, i, s);
          if (fg && bg) {
            const ratio = contrast(fg, bg);
            const { size, bold } = sizeOf(deck, i, s);
            const large = size >= 18 || (bold && size >= 14);
            if (ratio < (large ? 3 : 4.5)) out.push({ kind: 'contrast', slide: i, shape: s.id, text: `${name} (${ratio.toFixed(1)}:1)`, severity: 'warning', ratio });
          }
        }
      }
    });
    // Reading order: content listed in an order very different from top-to-bottom, left-to-right.
    const content = slide.shapes.filter((s) => !s.hidden && !s.decorative && !(s.ph && ['dt', 'ftr', 'sldNum'].includes(s.ph.type)) && (s.kind !== 'shape' || textOf(s.text).trim()));
    if (content.length >= 3) {
      const visual = [...content].sort((a, b) => (Math.abs(a.y - b.y) > 24 ? a.y - b.y : a.x - b.x));
      let swaps = 0;
      content.forEach((s, k) => { if (visual.indexOf(s) !== k) swaps++; });
      if (swaps > content.length / 2) out.push({ kind: 'order', slide: i, text: `Slide ${i + 1}`, severity: 'tip' });
    }
  });
  for (const [, idx] of titles) if (idx.length > 1) for (const i of idx) {
    const t = deck.slides[i]!.shapes.find((x) => x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle'));
    out.push({ kind: 'dupTitle', slide: i, ...(t ? { shape: t.id } : {}), text: `Slide ${i + 1}: ${textOf((t as AutoShape | undefined)?.text).slice(0, 40)}`, severity: 'warning' });
  }
  const rank = { error: 0, warning: 1, tip: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.slide - b.slide);
};
