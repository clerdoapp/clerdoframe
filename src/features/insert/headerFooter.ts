/** Header & footer: date, footer text and slide number placeholders on slides. */
import { uid, masterOf, type AutoShape, type Deck, type HeaderFooter, type Placeholder, type Shape, type Slide } from '../../model/deck';

export const DATE_FORMATS: { id: string; label: (d: Date) => string }[] = [
  { id: 'short', label: (d) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }) },
  { id: 'long', label: (d) => d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
  { id: 'medium', label: (d) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) },
  { id: 'dmy', label: (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) },
  { id: 'my', label: (d) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) },
  { id: 'iso', label: (d) => d.toISOString().slice(0, 10) },
  { id: 'datetime', label: (d) => d.toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) },
  { id: 'time', label: (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) },
  { id: 'time24', label: (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) },
];
export const formatDate = (id: string | undefined, d = new Date()): string => (DATE_FORMATS.find((f) => f.id === id) ?? DATE_FORMATS[0]!).label(d);

type FieldType = 'dt' | 'ftr' | 'sldNum';
const NAMES: Record<FieldType, string> = { dt: 'Date Placeholder', ftr: 'Footer Placeholder', sldNum: 'Slide Number Placeholder' };

/** The layout (or master) placeholder a field copies its position from. */
const source = (deck: Deck, slide: Slide, type: FieldType): Shape | undefined => {
  const { master, layout } = masterOf(deck, slide.layout);
  return layout.shapes.find((s) => s.ph?.type === type) ?? master.shapes.find((s) => s.ph?.type === type);
};

const fieldShape = (deck: Deck, slide: Slide, type: FieldType, hf: HeaderFooter): AutoShape | null => {
  const src = source(deck, slide, type);
  if (!src) return null;
  const ph: Placeholder = { type, ...(src.ph?.idx !== undefined ? { idx: src.ph.idx } : {}) };
  const run = type === 'sldNum' ? { text: '‹#›', field: 'slidenum' as const }
    : type === 'dt' ? (hf.dateFixed !== undefined ? { text: hf.dateFixed } : { text: formatDate(hf.dateFormat), field: 'datetime' as const })
      : { text: hf.footerText ?? '' };
  return { id: uid('s'), kind: 'shape', geom: 'rect', name: `${NAMES[type]} ${slide.shapes.length + 1}`, x: src.x, y: src.y, w: src.w, h: src.h, ph, text: { paras: [{ runs: run.text ? [run] : [] }] } };
};

const isTitle = (deck: Deck, slide: Slide) => {
  const { layout } = masterOf(deck, slide.layout);
  return layout.type === 'title';
};

/** Adds, updates or removes the date, footer and number placeholders on one slide. */
export const applyHeaderFooter = (deck: Deck, slide: Slide, hf: HeaderFooter): void => {
  const title = !!hf.hideOnTitle && isTitle(deck, slide);
  const want: Record<FieldType, boolean> = { dt: !!hf.dateTime && !title, ftr: !!hf.footer && !title, sldNum: !!hf.slideNumber && !title };
  for (const type of ['dt', 'ftr', 'sldNum'] as FieldType[]) {
    const i = slide.shapes.findIndex((s) => s.ph?.type === type);
    if (!want[type]) { if (i >= 0) slide.shapes.splice(i, 1); continue; }
    const fresh = fieldShape(deck, slide, type, hf);
    if (!fresh) continue;
    if (i >= 0) {
      const cur = slide.shapes[i]!;
      // Keep the person's position and formatting; refresh the content.
      if (cur.kind === 'shape') {
        const style = cur.text?.paras[0]?.runs[0]?.style;
        const runs = fresh.text!.paras[0]!.runs.map((r) => (style ? { ...r, style } : r));
        cur.text = { ...(cur.text ?? { paras: [] }), paras: [{ ...(cur.text?.paras[0] ?? {}), runs }] };
      }
    } else slide.shapes.push(fresh);
  }
};

/** Current settings read from a slide (for the dialog), falling back to the deck's stored ones. */
export const readHeaderFooter = (deck: Deck, slide: Slide | undefined): HeaderFooter => {
  const hf = { ...deck.headerFooter };
  if (!slide) return hf;
  const get = (t: FieldType) => slide.shapes.find((s) => s.ph?.type === t) as AutoShape | undefined;
  const dt = get('dt'), ftr = get('ftr'), num = get('sldNum');
  if (dt || ftr || num || !deck.headerFooter.dateTime) {
    hf.dateTime = !!dt || (!!hf.dateTime && isTitle(deck, slide) && !!hf.hideOnTitle);
    hf.footer = !!ftr || (!!hf.footer && isTitle(deck, slide) && !!hf.hideOnTitle);
    hf.slideNumber = !!num || (!!hf.slideNumber && isTitle(deck, slide) && !!hf.hideOnTitle);
  }
  const ftrText = ftr?.text?.paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
  if (ftrText) hf.footerText = ftrText;
  const dtRun = dt?.text?.paras[0]?.runs[0];
  if (dtRun && dtRun.field !== 'datetime') hf.dateFixed = dtRun.text;
  return hf;
};
