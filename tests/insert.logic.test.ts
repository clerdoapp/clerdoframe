import { describe, expect, it } from 'vitest';
import { newDeck } from '../src/model/defaults';
import { applyHeaderFooter, readHeaderFooter } from '../src/features/insert/headerFooter';
import { absolutize } from '../src/features/insert/svgPath';
import { gridLayout } from '../src/features/insert/commands';
import { cleanUrl } from '../src/features/insert/dialogs';
import { warpPath, WARPS, WORDART_STYLES, SYMBOL_SETS } from '../src/features/insert/data';
import { fit, typeOf } from '../src/features/insert/media';
import { simplify, smoothPath } from '../src/features/shapes/tools';
import { geometry } from '../src/render/geometry';
import { registerAllPresets } from '../src/features/shapes/presets';

describe('header and footer', () => {
  it('adds, updates and removes field placeholders', () => {
    const deck = newDeck();
    const slide = deck.slides[0]!;
    applyHeaderFooter(deck, slide, { footer: true, footerText: 'Hello', slideNumber: true });
    expect(slide.shapes.filter((s) => s.ph?.type === 'ftr' || s.ph?.type === 'sldNum')).toHaveLength(2);
    expect(readHeaderFooter(deck, slide)).toMatchObject({ footer: true, footerText: 'Hello', slideNumber: true, dateTime: false });
    applyHeaderFooter(deck, slide, { footer: true, footerText: 'Bye' });
    const ftr = slide.shapes.find((s) => s.ph?.type === 'ftr');
    expect(ftr?.kind === 'shape' && ftr.text?.paras[0]!.runs[0]!.text).toBe('Bye');
    expect(slide.shapes.some((s) => s.ph?.type === 'sldNum')).toBe(false);
  });
  it('skips the title slide when asked', () => {
    const deck = newDeck();
    applyHeaderFooter(deck, deck.slides[0]!, { slideNumber: true, hideOnTitle: true });
    expect(deck.slides[0]!.shapes.some((s) => s.ph?.type === 'sldNum')).toBe(false);
  });
});

describe('links', () => {
  it('keeps only https and mailto', () => {
    expect(cleanUrl('example.com', 'web')).toBe('https://example.com');
    expect(cleanUrl('http://a.b', 'web')).toBe('https://a.b');
    expect(cleanUrl('javascript:alert(1)', 'web')).toBeNull();
    expect(cleanUrl('data:text/html,x', 'web')).toBeNull();
    expect(cleanUrl('file:///etc/passwd', 'web')).toBeNull();
    expect(cleanUrl('me@x.org', 'email')).toBe('mailto:me@x.org');
    expect(cleanUrl('not an email', 'email')).toBeNull();
  });
});

describe('icons and paths', () => {
  it('turns relative paths absolute', () => {
    expect(absolutize('M2 2l3 4h1v2z')).toBe('M2 2L5 6L6 6L6 8Z');
    expect(absolutize('M10 10a2 2 0 0 1 4 0')).toBe('M10 10A2 2 0 0 1 14 10');
    expect(absolutize('M1 1a1 1 0 011 1')).toBe('M1 1A1 1 0 0 1 2 2');
    expect(absolutize('M0 0c1 1 2 2 3 3s1 1 2 2')).toBe('M0 0C1 1 2 2 3 3S4 4 5 5');
  });
  it('custom geometry scales absolute icon paths', () => {
    registerAllPresets();
    const g = geometry('custom', 96, 96, {}, [{ d: 'M4 4L20 20', w: 24, h: 24 }]);
    expect(g.paths[0]!.d).toBe('M 16 16 L 80 80');
  });
});

describe('layout helpers', () => {
  it('lays out zoom thumbnails inside the box', () => {
    const box = { x: 100, y: 100, w: 1000, h: 500 };
    const cells = gridLayout(5, box, 9 / 16);
    expect(cells).toHaveLength(5);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(box.x - 0.01);
      expect(c.x + c.w).toBeLessThanOrEqual(box.x + box.w + 0.01);
      expect(c.y + c.w * 9 / 16).toBeLessThanOrEqual(box.y + box.h + 0.01);
    }
  });
  it('fits pictures keeping the ratio', () => {
    expect(fit(2000, 1000, 1000, 1000)).toEqual({ w: 1000, h: 500 });
    expect(fit(100, 50, 1000, 1000)).toEqual({ w: 100, h: 50 });
    expect(fit(100, 50, 1000, 1000, true)).toEqual({ w: 1000, h: 500 });
    expect(typeOf({ name: 'clip.MOV', type: '' })).toBe('video/quicktime');
  });
  it('simplifies and smooths freehand strokes', () => {
    const pts = Array.from({ length: 50 }, (_, i) => [i, 0] as [number, number]);
    expect(simplify(pts)).toHaveLength(2);
    expect(smoothPath([[0, 0], [10, 10], [20, 0], [30, 10]], false)).toMatch(/^M0 0C/);
    expect(smoothPath([[0, 0], [10, 10], [20, 0]], true).endsWith('Z')).toBe(true);
  });
});

describe('data', () => {
  it('has WordArt styles, warps and symbols without emoji', () => {
    expect(WORDART_STYLES.length).toBeGreaterThanOrEqual(15);
    for (const w of WARPS) if (!['textNoShape', 'textInflate', 'textDeflate', 'textFadeRight', 'textFadeLeft'].includes(w.id)) expect(warpPath(w.id, 300, 100)).toBeTruthy();
    const emoji = /\p{Extended_Pictographic}/u;
    for (const set of SYMBOL_SETS) for (const c of set.chars) if (emoji.test(c)) expect(/️/.test(c)).toBe(false);
    expect(SYMBOL_SETS.flatMap((s) => s.chars).every((c) => (c.codePointAt(0) ?? 0) < 0x1f000)).toBe(true);
  });
});
