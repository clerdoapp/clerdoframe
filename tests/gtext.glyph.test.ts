import { describe, expect, it } from 'vitest';
import { distanceTransform, glyphDistance, glyphFromStrokes, N, normalizeBitmap, rankGlyphs, type Pt } from '../src/features/gtext/glyphMatch';
import { charCategories, charName, codeOf, flagOf, searchChars } from '../src/features/gtext/charsData';
import { filterFamilies } from '../src/features/gtext/MoreFonts';
import { FAMILIES, familyOf } from '../src/features/gtext/catalog';
import { deckFonts } from '../src/features/gtext/fontLoader';
import { newDeck } from '../src/model/defaults';

/** A 64x64 coverage bitmap painted by a predicate, standing in for a rendered character. */
const bitmap = (f: (x: number, y: number) => boolean, size = 64): Uint8Array => {
  const a = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (f(x, y)) a[y * size + x] = 255;
  return a;
};
const glyph = (f: (x: number, y: number) => boolean) => normalizeBitmap(bitmap(f), 64, 64)!;

const shapes = {
  dash: glyph((x, y) => x >= 10 && x <= 54 && y >= 30 && y <= 34),
  bar: glyph((x, y) => y >= 10 && y <= 54 && x >= 30 && x <= 34),
  ring: glyph((x, y) => { const r = Math.hypot(x - 32, y - 32); return r >= 17 && r <= 21; }),
  cross: glyph((x, y) => x >= 12 && x <= 52 && y >= 12 && y <= 52 && (Math.abs(x - y) <= 2 || Math.abs(x + y - 64) <= 2)),
  plus: glyph((x, y) => (x >= 12 && x <= 52 && Math.abs(y - 32) <= 2) || (y >= 12 && y <= 52 && Math.abs(x - 32) <= 2)),
  square: glyph((x, y) => x >= 14 && x <= 50 && y >= 14 && y <= 50 && (x <= 17 || x >= 47 || y <= 17 || y >= 47)),
};
const cands = Object.entries(shapes).map(([item, g]) => ({ item, glyph: g }));

const line = (a: Pt, b: Pt, n = 12): Pt[] => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
const circle = (cx: number, cy: number, r: number): Pt[] => Array.from({ length: 41 }, (_, i) => ({ x: cx + r * Math.cos((i / 40) * Math.PI * 2), y: cy + r * Math.sin((i / 40) * Math.PI * 2) }));
const best = (strokes: Pt[][]) => rankGlyphs(glyphFromStrokes(strokes)!, cands, 3)[0]!.item;

describe('distance transform', () => {
  it('is zero on ink and grows away from it', () => {
    const bin = new Uint8Array(N * N);
    bin[5 * N + 5] = 1;
    const d = distanceTransform(bin);
    expect(d[5 * N + 5]).toBe(0);
    expect(d[5 * N + 6]).toBe(1);
    expect(d[6 * N + 6]).toBeCloseTo(4 / 3);
    expect(d[5 * N + 10]).toBe(5);
  });
});

describe('normalising', () => {
  it('crops, scales to the grid and keeps proportions', () => {
    const small = normalizeBitmap(bitmap((x, y) => x >= 2 && x <= 5 && y >= 2 && y <= 5), 64, 64)!;
    const big = normalizeBitmap(bitmap((x, y) => x >= 10 && x <= 50 && y >= 10 && y <= 50), 64, 64)!;
    expect(glyphDistance(small, big)).toBeLessThan(0.5);
    expect(shapes.dash.aspect).toBeGreaterThan(5);
    expect(shapes.bar.aspect).toBeLessThan(0.2);
  });
  it('returns null without ink', () => {
    expect(normalizeBitmap(new Uint8Array(64 * 64), 64, 64)).toBeNull();
    expect(glyphFromStrokes([])).toBeNull();
  });
});

describe('draw to search', () => {
  it('finds the closest shape for hand-drawn strokes', () => {
    expect(best([line({ x: 10, y: 100 }, { x: 190, y: 104 })])).toBe('dash');
    expect(best([line({ x: 100, y: 10 }, { x: 97, y: 190 })])).toBe('bar');
    expect(best([circle(100, 100, 80)])).toBe('ring');
    expect(best([line({ x: 20, y: 20 }, { x: 180, y: 180 }), line({ x: 180, y: 20 }, { x: 20, y: 180 })])).toBe('cross');
    expect(best([line({ x: 20, y: 100 }, { x: 180, y: 100 }), line({ x: 100, y: 20 }, { x: 100, y: 180 })])).toBe('plus');
    expect(best([line({ x: 20, y: 20 }, { x: 180, y: 20 }), line({ x: 180, y: 20 }, { x: 180, y: 180 }), line({ x: 180, y: 180 }, { x: 20, y: 180 }), line({ x: 20, y: 180 }, { x: 20, y: 20 })])).toBe('square');
  });
  it('ranks by score and limits the count', () => {
    const r = rankGlyphs(shapes.ring, cands, 4);
    expect(r).toHaveLength(4);
    expect(r[0]!.item).toBe('ring');
    expect(r[0]!.score).toBe(0);
    for (let i = 1; i < r.length; i++) expect(r[i]!.score).toBeGreaterThanOrEqual(r[i - 1]!.score);
  });
  it('is symmetric', () => {
    expect(glyphDistance(shapes.cross, shapes.plus)).toBeCloseTo(glyphDistance(shapes.plus, shapes.cross));
  });
});

describe('character sets', () => {
  const cats = charCategories();
  it('has emoji groups and symbol sets', () => {
    const ids = cats.map((c) => c.id);
    for (const id of ['emoji-smileys', 'emoji-people', 'emoji-nature', 'emoji-food', 'emoji-travel', 'emoji-activities', 'emoji-objects', 'emoji-symbols', 'emoji-flags', 'arrows', 'math', 'latin', 'greek', 'cyrillic', 'punct', 'currency', 'technical', 'cjk', 'geometric']) expect(ids).toContain(id);
    expect(cats.find((c) => c.id === 'emoji-smileys')!.chars).toContain('😀');
    expect(cats.find((c) => c.id === 'emoji-flags')!.chars).toContain(flagOf('JO'));
    expect(cats.filter((c) => c.group === 'emoji').reduce((n, c) => n + c.chars.length, 0)).toBeGreaterThan(900);
    expect(cats.find((c) => c.id === 'greek')!.chars).toContain('λ');
    expect(cats.find((c) => c.id === 'arrows')!.chars).toContain('→');
  });
  it('names and finds characters', () => {
    expect(charName('é')).toContain('acute');
    expect(charName('Ω')).toContain('omega');
    expect(charName(flagOf('SA'))).toBe('flag SA');
    expect(codeOf('→')).toBe('U+2192');
    expect(searchChars('2192')).toContain('→');
    expect(searchChars('U+00E9')).toContain('é');
    expect(searchChars('right arrow')).toContain('→');
    expect(searchChars('pizza')).toContain('🍕');
    expect(searchChars('omega')).toContain('ω');
    expect(searchChars('currency')).toContain('€');
  });
});

describe('font library', () => {
  it('lists every bundled family once with a package name', () => {
    expect(new Set(FAMILIES.map((f) => f.name)).size).toBe(FAMILIES.length);
    expect(familyOf('lora')?.pkg).toBe('lora');
    expect(familyOf('"Source Sans 3"')?.pkg).toBe('source-sans-3');
    expect(familyOf('Noto Sans JP')?.regularOnly).toBe(true);
  });
  it('filters by name, category and script and sorts', () => {
    expect(filterFamilies(FAMILIES, 'garamond', null, 'any', 'az').map((f) => f.name)).toEqual(['Cormorant Garamond', 'EB Garamond']);
    expect(filterFamilies(FAMILIES, '', 'mono', 'any', 'popular').every((f) => f.cat === 'mono')).toBe(true);
    expect(filterFamilies(FAMILIES, '', null, 'arabic', 'popular').map((f) => f.name)).toContain('Cairo');
    expect(filterFamilies(FAMILIES, '', null, 'ko', 'popular').map((f) => f.name)).toEqual(['Noto Sans KR']);
  });
  it('collects the fonts a deck uses', () => {
    const d = newDeck();
    d.slides[0]?.shapes.push({ kind: 'shape', id: 'x', name: 'T', x: 0, y: 0, w: 10, h: 10, geom: 'rect', text: { paras: [{ runs: [{ text: 'a', style: { font: 'Lobster' } }] }] } });
    const f = deckFonts(d);
    expect(f.has('Lobster')).toBe(true);
    expect(f.has(d.masters[0]!.theme.fonts.major)).toBe(true);
  });
});
