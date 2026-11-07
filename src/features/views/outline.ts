/**
 * The outline: every slide's title (level 0) followed by the paragraphs of its main text
 * placeholder (level 1 + paragraph level). Editing works on this flat list of lines, then the
 * list is written back to the deck, creating, merging and removing slides as titles appear or go.
 */
import { textOf, uid, type AutoShape, type Deck, type Id, type Paragraph, type Slide } from '../../model/deck';
import { newSlide } from '../../model/defaults';

export interface OLine { slide: Id; level: number; text: string; /** The source paragraph, kept when the text is unchanged. */ para?: Paragraph }

const isTitle = (s: { ph?: { type: string } }) => !!s.ph && (s.ph.type === 'title' || s.ph.type === 'ctrTitle');
const isBody = (s: { ph?: { type: string } }) => !!s.ph && (s.ph.type === 'body' || s.ph.type === 'obj' || s.ph.type === 'subTitle');

export const titleShape = (s: Slide): AutoShape | undefined => s.shapes.find((x): x is AutoShape => x.kind === 'shape' && isTitle(x));
export const bodyShape = (s: Slide): AutoShape | undefined => s.shapes.find((x): x is AutoShape => x.kind === 'shape' && isBody(x));

const paraText = (p: Paragraph) => p.runs.map((r) => (r.br ? ' ' : r.text)).join('');

export const outlineOf = (deck: Deck): OLine[] => {
  const out: OLine[] = [];
  for (const s of deck.slides) {
    const t = titleShape(s);
    out.push({ slide: s.id, level: 0, text: textOf(t?.text).replace(/\n/g, ' ') });
    const b = bodyShape(s);
    if (b?.text) for (const p of b.text.paras) {
      const text = paraText(p);
      if (!text && b.text.paras.length === 1) continue;
      out.push({ slide: s.id, level: 1 + (p.style?.level ?? 0), text, para: p });
    }
  }
  return out;
};

/** Slide each line belongs to: the nearest title line above it. */
const owner = (lines: OLine[], i: number): Id => { for (let k = i; k >= 0; k--) if (lines[k]!.level === 0) return lines[k]!.slide; return lines[0]?.slide ?? ''; };

export const NEW = 'new:';

/** Splits a line at the caret (Enter). A split title starts a new slide after the current one. */
export const splitLine = (lines: OLine[], i: number, at: number): { lines: OLine[]; focus: number } => {
  const l = lines[i]!;
  const a: OLine = { ...l, text: l.text.slice(0, at), para: undefined };
  const rest = l.text.slice(at);
  if (l.level === 0) {
    // Enter in a title: the slide's bullets stay with it, a new slide follows them.
    let end = i + 1; while (end < lines.length && lines[end]!.level > 0) end++;
    if (at === 0 && l.text) {
      // At the start: an empty slide goes in before this one.
      const n: OLine = { slide: NEW + uid('p'), level: 0, text: '' };
      return { lines: [...lines.slice(0, i), n, ...lines.slice(i)], focus: i + 1 };
    }
    const n: OLine = { slide: NEW + uid('p'), level: 0, text: rest };
    return { lines: [...lines.slice(0, i), a, ...lines.slice(i + 1, end), n, ...lines.slice(end)], focus: end };
  }
  const n: OLine = { slide: l.slide, level: l.level, text: rest };
  return { lines: [...lines.slice(0, i), a, n, ...lines.slice(i + 1)], focus: i + 1 };
};

/** Tab: one level down. A title becomes a bullet of the slide above; its own bullets go one level down with it. */
export const demote = (lines: OLine[], i: number): OLine[] => {
  const l = lines[i]!;
  if (l.level >= 9) return lines;
  if (l.level === 0) {
    if (i === 0) return lines;
    const out = [...lines];
    out[i] = { ...l, level: 1, slide: owner(lines, i - 1), para: undefined };
    for (let k = i + 1; k < out.length && out[k]!.level > 0; k++) out[k] = { ...out[k]!, level: Math.min(9, out[k]!.level + 1), slide: out[i]!.slide, para: undefined };
    return out;
  }
  const prev = lines[i - 1];
  if (!prev || prev.level < l.level) return lines; // can't go deeper than one below the line above
  const out = [...lines];
  out[i] = { ...l, level: l.level + 1, para: undefined };
  return out;
};

/** Shift+Tab: one level up. A top-level bullet becomes the title of a new slide that takes the bullets after it. */
export const promote = (lines: OLine[], i: number): OLine[] => {
  const l = lines[i]!;
  if (l.level === 0) return lines;
  const out = [...lines];
  if (l.level === 1) {
    const id = NEW + uid('p');
    out[i] = { slide: id, level: 0, text: l.text };
    for (let k = i + 1; k < out.length && out[k]!.level > 0; k++) out[k] = { ...out[k]!, slide: id };
    return out;
  }
  out[i] = { ...l, level: l.level - 1, para: undefined };
  return out;
};

/** Backspace at the start of a line: joins it to the line above. Returns null when there is nothing above. */
export const joinUp = (lines: OLine[], i: number): { lines: OLine[]; focus: number; caret: number } | null => {
  if (i === 0) return null;
  const l = lines[i]!, p = lines[i - 1]!;
  const out = [...lines];
  out[i - 1] = { ...p, text: p.text + l.text, para: undefined };
  out.splice(i, 1);
  if (l.level === 0) for (let k = i; k < out.length && out[k]!.level > 0; k++) out[k] = { ...out[k]!, slide: owner(out, i - 1) };
  return { lines: out, focus: i - 1, caret: p.text.length };
};

const setText = (shape: AutoShape, paras: Paragraph[]): void => {
  const p0 = shape.text?.paras[0]?.style;
  shape.text = { ...(shape.text ?? { paras: [] }), paras: paras.length ? paras : [{ runs: [], ...(p0 ? { style: p0 } : {}) }] };
};

const plain = (text: string, like?: Paragraph, level?: number): Paragraph => {
  const style = { ...(like?.style ?? {}), ...(level ? { level } : {}) };
  if (!level) delete style.level;
  return { runs: text ? [{ text, ...(like?.runs[0]?.style ? { style: like.runs[0].style } : {}) }] : [], ...(Object.keys(style).length ? { style } : {}) };
};

/** Writes the outline back to the deck. Returns the index of the slide the given line belongs to. */
export const applyOutline = (deck: Deck, lines: OLine[], focusLine = 0): number => {
  const byId = new Map(deck.slides.map((s) => [s.id, s]));
  const slides: Slide[] = [];
  let focusSlide = 0;
  let cur: { slide: Slide; title: string; body: OLine[] } | null = null;
  const groups: { slide: Slide; title: string; body: OLine[] }[] = [];
  lines.forEach((l, i) => {
    if (l.level === 0 || !cur) {
      let s = byId.get(l.slide);
      if (!s || slides.includes(s)) {
        const prev = cur?.slide ?? deck.slides[0];
        const m = prev ? deck.masters.find((x) => x.layouts.some((y) => y.id === prev.layout)) ?? deck.masters[0]! : deck.masters[0]!;
        const lay = m.layouts.find((x) => x.type === 'obj') ?? m.layouts[0]!;
        s = newSlide(lay);
      }
      slides.push(s);
      cur = { slide: s, title: l.level === 0 ? l.text : '', body: [] };
      groups.push(cur);
      if (l.level !== 0) cur.body.push(l);
    } else cur.body.push(l);
    if (i === focusLine) focusSlide = slides.length - 1;
  });
  for (const g of groups) {
    const t = titleShape(g.slide);
    if (t) { if (textOf(t.text).replace(/\n/g, ' ') !== g.title) setText(t, [plain(g.title, t.text?.paras[0])]); }
    const b = bodyShape(g.slide);
    const like = b?.text?.paras[0];
    const paras = g.body.map((l) => (l.para && paraText(l.para) === l.text && 1 + (l.para.style?.level ?? 0) === l.level ? l.para : plain(l.text, like, l.level - 1)));
    if (b) setText(b, paras);
    else if (paras.length) {
      // No text placeholder on this slide: move it to a layout that has one.
      const m = deck.masters.find((x) => x.layouts.some((y) => y.id === g.slide.layout)) ?? deck.masters[0]!;
      const lay = m.layouts.find((x) => x.type === 'obj');
      if (lay) {
        const fresh = newSlide(lay);
        const nb = bodyShape(fresh);
        if (nb) { setText(nb, paras); g.slide.shapes.push(nb); }
        if (!t) { const nt = titleShape(fresh); if (nt) { setText(nt, [plain(g.title)]); g.slide.shapes.unshift(nt); } }
        g.slide.layout = lay.id;
      }
    }
  }
  const keep = new Set(slides.map((s) => s.id));
  for (const sec of deck.sections) if (!keep.has(sec.first)) {
    const from = deck.slides.findIndex((x) => x.id === sec.first);
    const next = deck.slides.slice(from).find((x) => keep.has(x.id));
    if (next) sec.first = next.id;
  }
  deck.sections = deck.sections.filter((sec, i, a) => keep.has(sec.first) && a.findIndex((o) => o.first === sec.first) === i);
  for (const cs of deck.customShows) cs.slides = cs.slides.filter((id) => keep.has(id));
  deck.slides = slides;
  return focusSlide;
};
