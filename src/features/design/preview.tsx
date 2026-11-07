import { memo } from 'react';
import { textBody, type Deck, type Layout, type Master, type Shape, type Slide } from '../../model/deck';
import { newDeck } from '../../model/defaults';
import { buildThemeMaster, type ThemeDef } from '../../model/themes';
import { SlideView } from '../../render/SlideView';

const cache = new Map<string, Deck>();

const fill = (layout: Layout, texts: Record<string, string>): Slide => ({
  id: `prev-${layout.id}`, layout: layout.id, notes: { paras: [] }, animations: [],
  shapes: layout.shapes.filter((s) => s.ph && !['dt', 'ftr', 'sldNum'].includes(s.ph.type)).map((s): Shape => {
    const t = texts[s.ph!.type] ?? '';
    if (s.kind !== 'shape') return structuredClone(s);
    const p0 = s.text?.paras[0]?.style;
    return { ...structuredClone(s), text: { paras: textBody(t).paras.map((p) => (p0 ? { ...p, style: p0 } : p)) } };
  }),
});

/** A small deck showing a theme's title slide and a content slide, cached per theme and variant. */
export const previewDeck = (def: ThemeDef, variant: number, w = 1280, h = 720): Deck => {
  const key = `${def.id}:${variant}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const d = newDeck(w, h);
  const m = buildThemeMaster(def, variant, w, h);
  d.masters = [m];
  const t = m.layouts.find((l) => l.type === 'title')!;
  const c = m.layouts.find((l) => l.type === 'obj')!;
  d.slides = [
    fill(t, { ctrTitle: def.name, subTitle: def.note }),
    fill(c, { title: 'Content slide', body: 'First point\nSecond point\nThird point' }),
  ];
  cache.set(key, d);
  return d;
};

/** Preview for a master already in the deck with different colors or fonts. */
export const masterPreview = (deck: Deck, master: Master, over: Partial<Master['theme']>): Deck => {
  const m = { ...master, theme: { ...master.theme, ...over } };
  const t = m.layouts.find((l) => l.type === 'title') ?? m.layouts[0]!;
  return { ...deck, masters: [m], slides: [fill(t, { ctrTitle: 'Aa', subTitle: over.fonts ? `${over.fonts.major} / ${over.fonts.minor}` : m.theme.colorsName ?? '' })] };
};

export const ThemeThumb = memo(({ def, variant, width, content, w, h }: { def: ThemeDef; variant: number; width: number; content?: boolean; w: number; h: number }) => {
  const d = previewDeck(def, variant, w, h);
  return <SlideView deck={d} slide={d.slides[content ? 1 : 0]!} width={width} />;
});
