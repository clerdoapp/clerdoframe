import {
  walkShapes,
  type Deck, type Fill, type Id, type Layout, type Master, type ParaStyle, type Shape, type Slide, type TextBody, type TextStyles, type Theme,
} from '../../model/deck';
import { buildThemeMaster, type ThemeColors, type ThemeDef } from '../../model/themes';

const FIELD = new Set(['dt', 'ftr', 'sldNum']);
const titleish = (t: string) => t === 'title' || t === 'ctrTitle';
const bodyish = (t: string) => t === 'body' || t === 'obj' || t === 'subTitle';

/** Layout type to fall back to when the new master has no layout of a slide's type. */
const fallbackType = (t: string): string => {
  if (t === 'title' || t === 'secHead' || t === 'blank' || t === 'titleOnly') return t;
  if (t === 'twoObj' || t === 'twoTxTwoObj' || t === 'txAndObj' || t === 'objAndTx') return 'twoObj';
  if (t === 'picTx' || t === 'objTx') return t;
  return 'obj';
};

const findLayout = (deck: Deck, id: Id): { master: Master; layout: Layout } | null => {
  for (const m of deck.masters) { const l = m.layouts.find((x) => x.id === id); if (l) return { master: m, layout: l }; }
  return null;
};

const matchPh = (list: Shape[], s: Shape): Shape | undefined => {
  if (!s.ph) return undefined;
  const t = s.ph.type;
  return list.find((x) => x.ph && x.ph.type === t && (x.ph.idx ?? -1) === (s.ph!.idx ?? -1))
    ?? list.find((x) => x.ph && x.ph.idx !== undefined && x.ph.idx === s.ph!.idx && !FIELD.has(x.ph.type))
    ?? list.find((x) => x.ph && (x.ph.type === t || (titleish(t) && titleish(x.ph.type)) || (bodyish(t) && bodyish(x.ph.type) && x.ph.type !== 'subTitle')));
};

const near = (a: Shape, b: Shape) => Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3 && Math.abs(a.w - b.w) < 3 && Math.abs(a.h - b.h) < 3;

/** Moves a slide onto a new layout, keeping its content. Placeholders the person hadn't moved follow the new layout. */
const moveSlide = (slide: Slide, from: Layout | null, to: Layout): void => {
  for (const s of slide.shapes) {
    if (!s.ph) continue;
    const target = matchPh(to.shapes, s);
    if (!target) continue;
    const old = from ? matchPh(from.shapes, s) : undefined;
    const untouched = !old || near(s, old) || (s.w === 0 && s.h === 0);
    if (untouched && (s.w || s.h)) { s.x = target.x; s.y = target.y; s.w = target.w; s.h = target.h; }
  }
  slide.layout = to.id;
};

/**
 * Applies a built-in theme. With `slides`, only those slides move to a new, extra master;
 * otherwise every master is replaced by the theme's master and slides map to equivalent layouts.
 */
export const applyTheme = (deck: Deck, def: ThemeDef, variant: number, slides?: number[]): Master => {
  const m = buildThemeMaster(def, variant, deck.w, deck.h);
  const targets = slides ? slides.map((i) => deck.slides[i]).filter((x): x is Slide => !!x) : deck.slides;
  if (!slides) {
    // Keep the first master's layout ids where the type matches, so links to layouts survive.
    const old = deck.masters[0];
    if (old) for (const l of m.layouts) { const o = old.layouts.find((x) => x.type === l.type); if (o && !m.layouts.some((y) => y.id === o.id)) l.id = o.id; }
  }
  const before = new Map(targets.map((s) => [s, findLayout(deck, s.layout)]));
  for (const s of targets) {
    const was = before.get(s);
    const type = was?.layout.type ?? 'obj';
    const to = m.layouts.find((l) => l.type === type) ?? m.layouts.find((l) => l.type === fallbackType(type)) ?? m.layouts.find((l) => l.type === 'obj') ?? m.layouts[0]!;
    moveSlide(s, was?.layout ?? null, to);
  }
  if (slides) {
    deck.masters.push(m);
    // Masters no slide uses any more go, unless preserved.
    pruneMasters(deck);
  } else {
    m.keep = undefined;
    deck.masters = [m];
  }
  return m;
};

/** Removes masters with no slides on them, keeping the first and any marked to keep. */
export const pruneMasters = (deck: Deck): number => {
  const used = new Set(deck.slides.map((s) => s.layout));
  const before = deck.masters.length;
  deck.masters = deck.masters.filter((m, i) => i === 0 || m.keep?.preserve === '1' || m.layouts.some((l) => used.has(l.id)));
  return before - deck.masters.length;
};

/** Masters the current change should touch: the masters of the given slides, or all. */
export const mastersFor = (deck: Deck, slides?: number[]): Master[] => {
  if (!slides) return deck.masters;
  const ids = new Set(slides.map((i) => deck.slides[i]?.layout).filter(Boolean));
  const out = deck.masters.filter((m) => m.layouts.some((l) => ids.has(l.id)));
  return out.length ? out : deck.masters.slice(0, 1);
};

export const setColors = (masters: Master[], colors: ThemeColors, name: string): void => {
  for (const m of masters) { m.theme.colors = { ...colors }; m.theme.colorsName = name; }
};

export const setFonts = (masters: Master[], fonts: Theme['fonts']): void => {
  for (const m of masters) m.theme.fonts = { ...fonts };
};

export const setBackground = (deck: Deck, fill: Fill, slides?: number[]): void => {
  if (slides) { for (const i of slides) { const s = deck.slides[i]; if (s) s.background = { ...(s.background ?? {}), fill: structuredClone(fill) }; } return; }
  for (const m of deck.masters) { m.background = { ...m.background, fill: structuredClone(fill) }; for (const l of m.layouts) if (l.background && l.type !== 'title' && l.type !== 'secHead') l.background = undefined; }
  for (const s of deck.slides) if (s.background) s.background = s.background.hideMasterGraphics ? { fill: structuredClone(fill), hideMasterGraphics: true } : undefined;
};

// ---------- Slide size ----------

const scaleText = (t: TextBody | undefined, k: number): void => {
  if (!t) return;
  const r = (n: number) => Math.max(1, Math.round(n * k * 10) / 10);
  for (const p of t.paras) {
    if (p.style?.defRun?.size) p.style.defRun.size = r(p.style.defRun.size);
    for (const run of p.runs) if (run.style?.size) run.style.size = r(run.style.size);
  }
  if (t.inset) t.inset = { l: t.inset.l * k, t: t.inset.t * k, r: t.inset.r * k, b: t.inset.b * k };
};

const scaleStyles = (ts: TextStyles, k: number): void => {
  const r = (n: number) => Math.max(1, Math.round(n * k * 10) / 10);
  const fix = (list: ParaStyle[]) => list.forEach((p) => {
    if (p.defRun?.size) p.defRun.size = r(p.defRun.size);
    if (p.marginLeft) p.marginLeft *= k;
    if (p.indent) p.indent *= k;
  });
  fix(ts.title); fix(ts.body); fix(ts.other);
};

const scaleShapes = (shapes: Shape[], k: number, dx: number, dy: number, fonts: boolean): void => {
  for (const s of shapes) {
    s.x = Math.round(s.x * k + dx); s.y = Math.round(s.y * k + dy);
    s.w = Math.round(s.w * k); s.h = Math.round(s.h * k);
  }
  if (!fonts) return;
  walkShapes(shapes, (s) => {
    if (s.kind === 'shape') scaleText(s.text, k);
    else if (s.kind === 'table') {
      s.cols = s.cols.map((c) => c * k);
      for (const row of s.rows) { row.h *= k; for (const c of row.cells) scaleText(c.text, k); }
    } else if (s.kind === 'equation') s.size = Math.max(4, Math.round(s.size * k));
  });
};

export type FitMode = 'fit' | 'max' | 'none';

/**
 * Changes the slide size. 'fit' scales content down so all of it fits; 'max' scales it up so
 * it fills the new size (some may fall off the edge). Content stays centred.
 */
export const resizeDeck = (deck: Deck, W: number, H: number, mode: FitMode): void => {
  const sx = W / deck.w, sy = H / deck.h;
  const k = mode === 'none' ? 1 : mode === 'fit' ? Math.min(sx, sy) : Math.max(sx, sy);
  const dx = (W - deck.w * k) / 2, dy = (H - deck.h * k) / 2;
  const fonts = Math.abs(k - 1) > 0.005;
  for (const m of deck.masters) {
    // Masters and layouts stretch to the new shape so backgrounds and bars reach the edges.
    for (const list of [m.shapes, ...m.layouts.map((l) => l.shapes)]) {
      for (const s of list) {
        if (s.ph) { s.x = Math.round(s.x * k + dx); s.y = Math.round(s.y * k + dy); s.w = Math.round(s.w * k); s.h = Math.round(s.h * k); }
        else { s.x = Math.round(s.x * sx); s.y = Math.round(s.y * sy); s.w = Math.round(s.w * sx); s.h = Math.round(s.h * sy); }
      }
      if (fonts) walkShapes(list, (s) => { if (s.kind === 'shape') scaleText(s.text, k); });
    }
    if (fonts) scaleStyles(m.textStyles, k);
  }
  for (const s of deck.slides) scaleShapes(s.shapes, k, dx, dy, fonts);
  deck.w = Math.round(W); deck.h = Math.round(H);
};

export const PX_PER_IN = 96;
