import type {
  AutoShape, Deck, Layout, Master, ParaStyle, Placeholder, RunStyle, Shape, TextBody, Theme,
} from '../model/deck';

/** Everything a shape needs from its slide's layout and master to draw. */
export interface RenderCtx {
  deck: Deck;
  master: Master;
  layout: Layout | null;
  theme: Theme;
  /** 1-based slide number for number fields, 0 on masters. */
  slideNumber: number;
  /** Placeholder prompts ("Click to add title") are shown on empty placeholders. */
  prompts: boolean;
  /** Drawing a layout or master itself (placeholders show their sample text). */
  onMaster: boolean;
}

const masterPhType = (t: Placeholder['type']): Placeholder['type'] => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' ? 'body' : t);

const matchPh = (shapes: Shape[], ph: Placeholder, byIdx: boolean): Shape | undefined => {
  if (byIdx && ph.idx !== undefined) {
    const hit = shapes.find((s) => s.ph && s.ph.idx === ph.idx && (s.ph.type === ph.type || masterPhType(s.ph.type) === masterPhType(ph.type) || ph.type === 'obj' || s.ph.type === 'obj' || s.ph.type === 'body'));
    if (hit) return hit;
  }
  return shapes.find((s) => s.ph && (s.ph.type === ph.type || masterPhType(s.ph.type) === masterPhType(ph.type)) && (ph.idx === undefined || s.ph.idx === undefined || s.ph.type !== 'body' || s.ph.idx === ph.idx))
    ?? shapes.find((s) => s.ph && masterPhType(s.ph.type) === masterPhType(ph.type));
};

/** The layout and master placeholders a slide placeholder inherits from (nearest first). */
export const phChain = (s: Shape, ctx: RenderCtx): AutoShape[] => {
  if (!s.ph) return [];
  const out: AutoShape[] = [];
  if (ctx.layout && !ctx.layout.shapes.includes(s)) {
    const l = matchPh(ctx.layout.shapes, s.ph, true);
    if (l?.kind === 'shape') out.push(l);
  }
  if (!ctx.master.shapes.includes(s)) {
    const m = ctx.master.shapes.find((x) => x.ph && masterPhType(x.ph.type) === masterPhType(s.ph!.type))
      ?? (['body', 'obj', 'subTitle', 'pic', 'chart', 'tbl', 'media', 'dgm', 'clipArt'].includes(s.ph.type) ? ctx.master.shapes.find((x) => x.ph?.type === 'body') : undefined);
    if (m?.kind === 'shape') out.push(m);
  }
  return out;
};

const listFor = (s: Shape, ctx: RenderCtx): ParaStyle[] => {
  const t = s.ph?.type;
  if (t === 'title' || t === 'ctrTitle') return ctx.master.textStyles.title;
  if (t && ['body', 'obj', 'subTitle'].includes(t)) return ctx.master.textStyles.body;
  return ctx.master.textStyles.other;
};

export const mergeRun = (...styles: (RunStyle | undefined)[]): RunStyle => {
  const out: RunStyle = {};
  for (const st of styles) if (st) for (const [k, v] of Object.entries(st)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
};

export const mergePara = (...styles: (ParaStyle | undefined)[]): ParaStyle => {
  const out: ParaStyle = {};
  for (const st of styles) {
    if (!st) continue;
    for (const [k, v] of Object.entries(st)) {
      if (v === undefined) continue;
      if (k === 'defRun') out.defRun = mergeRun(out.defRun, v as RunStyle);
      else (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
};

/**
 * Paragraph style for paragraph `pi` at its level: master text style list, then master and layout
 * placeholder defaults, then the shape's own defaults, then the paragraph itself.
 */
export const effectivePara = (s: AutoShape, para: ParaStyle | undefined, ctx: RenderCtx, phLevelStyles = true): ParaStyle => {
  const level = para?.level ?? 0;
  const chain = phChain(s, ctx).reverse();
  const fromPh = phLevelStyles ? chain.map((p) => p.text?.paras.find((x) => (x.style?.level ?? 0) === level)?.style ?? (level === 0 ? p.text?.paras[0]?.style : undefined)) : [];
  const base = s.ph || s.kind === 'shape' ? listFor(s, ctx)[level] ?? listFor(s, ctx)[0] : undefined;
  const textboxDefaults: ParaStyle | undefined = !s.ph ? { bullet: { type: 'none' }, marginLeft: 0, indent: 0, defRun: { size: 18, font: '+mn-lt', color: { theme: 'tx1' } } } : undefined;
  return mergePara(base, textboxDefaults, ...fromPh.map((p) => p && { ...p, level: undefined }), para);
};

/** Body-level text properties (anchor, insets, autofit) with placeholder inheritance. */
export const effectiveBody = (s: AutoShape, ctx: RenderCtx): Omit<TextBody, 'paras'> => {
  const chain = [...phChain(s, ctx)].reverse();
  const out: Omit<TextBody, 'paras'> = { vAlign: 't', inset: { l: 9.6, t: 4.8, r: 9.6, b: 4.8 }, wrap: true, autofit: 'none' };
  for (const src of [...chain.map((c) => c.text), s.text]) {
    if (!src) continue;
    const { paras: _p, ...rest } = src;
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
};

export const effectiveGeometry = (s: Shape, ctx: RenderCtx): { x: number; y: number; w: number; h: number } => {
  if (s.w > 0 || s.h > 0 || !s.ph) return s;
  const src = phChain(s, ctx)[0];
  return src ? { x: src.x, y: src.y, w: src.w, h: src.h } : s;
};

/** Resolves theme font references (+mj-lt, +mn-lt) to font names. */
export const fontName = (f: string | undefined, theme: Theme): string => {
  if (!f) return theme.fonts.minor;
  if (f.startsWith('+mj')) return theme.fonts.major;
  if (f.startsWith('+mn')) return theme.fonts.minor;
  return f;
};

const FALLBACK: Record<string, string> = {
  calibri: 'Carlito', 'calibri light': 'Carlito', cambria: 'Caladea', arial: 'Arimo', helvetica: 'Arimo', 'times new roman': 'Tinos', 'courier new': 'Cousine',
  aptos: 'Hanken Grotesk', 'aptos display': 'Hanken Grotesk', 'aptos narrow': 'Hanken Grotesk', 'segoe ui': 'Open Sans', verdana: 'Open Sans', tahoma: 'Open Sans', 'century gothic': 'Montserrat', 'gill sans mt': 'Lato', 'franklin gothic': 'Lato',
};
/** CSS font-family list with a metric-compatible bundled fallback. */
export const fontStack = (name: string): string => {
  const fb = FALLBACK[name.toLowerCase()];
  return `"${name.replace(/"/g, '')}"${fb ? `, "${fb}"` : ''}, "Hanken Grotesk", system-ui, sans-serif`;
};

export const promptFor = (s: Shape): string => {
  switch (s.ph?.type) {
    case 'title': case 'ctrTitle': return 'Click to add title';
    case 'subTitle': return 'Click to add subtitle';
    case 'pic': return 'Click icon to add picture';
    case 'chart': return 'Click icon to add chart';
    case 'tbl': return 'Click icon to add table';
    case 'media': return 'Click icon to add media';
    case 'dt': case 'ftr': case 'sldNum': return '';
    default: return 'Click to add text';
  }
};

/** Master-level sample prompts shown when editing layouts and masters. */
export const masterPromptFor = (s: Shape, level = 0): string => {
  switch (s.ph?.type) {
    case 'title': case 'ctrTitle': return 'Click to edit Master title style';
    case 'subTitle': return 'Click to edit Master subtitle style';
    case 'dt': return '';
    case 'ftr': return 'Footer';
    case 'sldNum': return '‹#›';
    default: return ['Click to edit Master text styles', 'Second level', 'Third level', 'Fourth level', 'Fifth level'][level] ?? 'Level';
  }
};
