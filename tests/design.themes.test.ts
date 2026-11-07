import { describe, expect, it } from 'vitest';
import { FrameStore } from '../src/app/store';
import { newDeck, newSlide } from '../src/model/defaults';
import { textOf, type AutoShape, type Deck } from '../src/model/deck';
import { BACKGROUND_STYLES, buildThemeMaster, COLOR_SETS, FONT_PAIRS, THEMES, variantColors } from '../src/model/themes';
import { applyTheme, resizeDeck, setBackground, setColors } from '../src/features/design/ops';
import { designIdeas, titleIdeas } from '../src/features/design/designer';

const deckWithContent = (): Deck => {
  const d = newDeck();
  const m = d.masters[0]!;
  const t = d.slides[0]!;
  (t.shapes[0] as AutoShape).text = { paras: [{ runs: [{ text: 'Cover' }] }] };
  const obj = newSlide(m.layouts.find((l) => l.type === 'obj')!);
  (obj.shapes[0] as AutoShape).text = { paras: [{ runs: [{ text: 'Agenda' }] }] };
  (obj.shapes[1] as AutoShape).text = { paras: [{ runs: [{ text: 'One' }] }, { runs: [{ text: 'Two' }] }] };
  const sec = newSlide(m.layouts.find((l) => l.type === 'secHead')!);
  (sec.shapes[0] as AutoShape).text = { paras: [{ runs: [{ text: 'Part 2' }] }] };
  d.slides.push(obj, sec);
  return d;
};

const hex = /^#[0-9A-F]{6}$/;

describe('theme catalogue', () => {
  it('has about two dozen themes with valid colors, fonts and four variants', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(24);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length);
    for (const t of THEMES) {
      for (const v of [0, 1, 2, 3]) for (const c of Object.values(variantColors(t, v).colors)) expect(c).toMatch(hex);
      expect(t.fonts.major && t.fonts.minor).toBeTruthy();
      expect(new Set([0, 1, 2, 3].map((v) => variantColors(t, v).name)).size).toBe(4);
    }
    expect(COLOR_SETS.length).toBeGreaterThanOrEqual(20);
    for (const c of COLOR_SETS) for (const v of Object.values(c.colors)) expect(v).toMatch(hex);
    expect(FONT_PAIRS.length).toBeGreaterThanOrEqual(16);
    expect(BACKGROUND_STYLES.length).toBe(12);
  });

  it('builds masters whose decoration uses theme colors and title/section layouts differ', () => {
    for (const t of THEMES) {
      const m = buildThemeMaster(t, 0, 1280, 720);
      const title = m.layouts.find((l) => l.type === 'title')!;
      const sec = m.layouts.find((l) => l.type === 'secHead')!;
      expect(title.shapes.filter((s) => !s.ph).length + (title.background ? 1 : 0)).toBeGreaterThan(0);
      expect(JSON.stringify(sec)).not.toBe(JSON.stringify(m.layouts.find((l) => l.type === 'obj')));
      for (const s of [...m.shapes, ...title.shapes]) if (!s.ph && s.kind === 'shape' && s.fill?.type === 'solid') expect(typeof s.fill.color).toBe('object');
      expect(m.layouts.map((l) => l.type)).toContain('obj');
    }
  });
});

describe('applying a theme', () => {
  it('keeps slide content, maps layouts by type and is one undo step', () => {
    const s = new FrameStore(deckWithContent());
    const before = s.deck.slides.map((x) => x.shapes.map((sh) => textOf((sh as AutoShape).text)).join('|'));
    s.change('Theme', () => applyTheme(s.deck, THEMES[3]!, 1));
    expect(s.deck.masters).toHaveLength(1);
    expect(s.deck.masters[0]!.theme.name).toBe(THEMES[3]!.name);
    const types = s.deck.slides.map((x) => s.masterOf(x).layout.type);
    expect(types).toEqual(['title', 'obj', 'secHead']);
    expect(s.deck.slides.map((x) => x.shapes.map((sh) => textOf((sh as AutoShape).text)).join('|'))).toEqual(before);
    s.undo();
    expect(s.deck.masters[0]!.theme.name).toBe('Clerdo');
    expect(s.canUndo).toBe(false);
  });

  it('can apply to selected slides only, adding a second master', () => {
    const d = deckWithContent();
    applyTheme(d, THEMES[5]!, 0, [1]);
    expect(d.masters).toHaveLength(2);
    expect(d.masters[1]!.layouts.some((l) => l.id === d.slides[1]!.layout)).toBe(true);
    expect(d.masters[0]!.layouts.some((l) => l.id === d.slides[0]!.layout)).toBe(true);
    // Applying another theme to the same slide replaces the now-unused extra master.
    applyTheme(d, THEMES[6]!, 0, [1]);
    expect(d.masters).toHaveLength(2);
  });

  it('recolors through color sets', () => {
    const d = deckWithContent();
    setColors(d.masters, COLOR_SETS[4]!.colors, COLOR_SETS[4]!.name);
    expect(d.masters[0]!.theme.colors.accent1).toBe(COLOR_SETS[4]!.colors.accent1);
    expect(d.masters[0]!.theme.colorsName).toBe(COLOR_SETS[4]!.name);
  });

  it('applies a background to all slides', () => {
    const d = deckWithContent();
    d.slides[1]!.background = { fill: { type: 'solid', color: '#FF0000' } };
    setBackground(d, BACKGROUND_STYLES[4]!.fill);
    expect(d.slides[1]!.background).toBeUndefined();
    expect(d.masters[0]!.background.fill.type).toBe('gradient');
  });
});

describe('slide size', () => {
  it('ensure fit scales content down and keeps it centred', () => {
    const d = deckWithContent();
    const t = d.slides[1]!.shapes[0]!;
    const w0 = t.w;
    resizeDeck(d, 960, 720, 'fit');
    expect(d.w).toBe(960);
    expect(t.w).toBe(Math.round(w0 * 0.75));
    expect(t.x + t.w).toBeLessThanOrEqual(960);
    expect(d.masters[0]!.textStyles.title[0]!.defRun!.size).toBe(33);
  });

  it('maximize scales up to fill', () => {
    const d = deckWithContent();
    resizeDeck(d, 960, 720, 'max');
    expect(d.masters[0]!.textStyles.title[0]!.defRun!.size).toBe(44);
    expect(d.h).toBe(720);
  });
});

describe('designer', () => {
  it('suggests several arrangements that keep the slide text', () => {
    const d = deckWithContent();
    const ideas = designIdeas(d, d.slides[1]!);
    expect(ideas.length).toBeGreaterThanOrEqual(5);
    for (const i of ideas) {
      const all = i.slide.shapes.map((s) => textOf((s as AutoShape).text)).join('|');
      expect(all).toContain('Agenda');
      expect(all).toContain('One');
    }
    expect(titleIdeas(d, d.slides[0]!).length).toBe(4);
  });

  it('adds picture layouts when the slide has a picture', () => {
    const d = deckWithContent();
    d.slides[1]!.shapes.push({ id: 'pic', kind: 'picture', name: 'Picture', media: 'm1', x: 0, y: 0, w: 400, h: 300 });
    const names = designIdeas(d, d.slides[1]!).map((i) => i.id);
    expect(names).toContain('picLeft');
    expect(names).toContain('fullBleed');
  });
});
