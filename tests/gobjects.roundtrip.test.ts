import { describe, expect, it } from 'vitest';
import { newDeck, newSlide } from '../src/model/defaults';
import { uid, type AutoShape, type Chart, type Deck, type Picture, type Shape } from '../src/model/deck';
import { writePptx } from '../src/formats/pptx';
import { geometry, preset } from '../src/render/geometry';
import { registerOwnPresets, OWN_PRESETS } from '../src/features/gobjects/presets';
import { asShape, byName, checkPackage, parts, roundTrip } from './pptx.helpers';

registerOwnPresets();

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const blank = (): Deck => {
  const d = newDeck();
  const l = d.masters[0]!.layouts.find((x) => x.type === 'blank')!;
  d.slides = [newSlide(l)];
  d.media.m1 = { id: 'm1', type: 'image/png', name: 'a.png', data: PNG };
  return d;
};
const add = (d: Deck, s: Shape): void => { d.slides[0]!.shapes.push(s); };
const box = (name: string, extra: Partial<AutoShape> = {}): AutoShape => ({ id: uid('s'), kind: 'shape', name, geom: 'rect', x: 100, y: 50, w: 200, h: 120, ...extra });
const pic = (name: string, extra: Partial<Picture> = {}): Picture => ({ id: uid('s'), kind: 'picture', name, media: 'm1', x: 10, y: 10, w: 160, h: 90, ...extra });
const slideXml = (d: Deck): string => parts(writePptx(d))['ppt/slides/slide1.xml']!;

describe('own presets', () => {
  it('draw finite paths with text areas at many sizes', () => {
    for (const p of OWN_PRESETS) {
      expect(preset(p.name)?.custom, p.name).toBe(true);
      for (const [w, h] of [[96, 96], [300, 80], [40, 260], [1, 1]] as const) {
        const g = geometry(p.name, w, h, {});
        expect(g.paths.length, p.name).toBeGreaterThan(0);
        for (const x of g.paths) expect(/NaN|Infinity/.test(x.d), `${p.name} ${x.d}`).toBe(false);
        expect(g.text, p.name).toBeTruthy();
      }
    }
  });

  it('are written as custom geometry and open as the same editable preset', () => {
    const d = blank();
    add(d, box('Speech', { geom: 'speech', adj: { adj1: 30000, adj2: 90000, adj3: 20000 }, fill: { type: 'solid', color: { theme: 'accent2' } }, text: { paras: [{ runs: [{ text: 'Hi' }] }] } }));
    add(d, box('Burst', { geom: 'starburst' }));
    add(d, box('Arrow', { geom: 'arrowNorthEast', adj: { adj1: 40000, adj2: 60000 } }));
    add(d, box('Thought', { geom: 'thoughtBubble' }));
    add(d, pic('Masked', { geom: 'roundedSpeech' }));
    const xml = slideXml(d);
    expect(xml).not.toMatch(/prst="(speech|starburst|arrowNorthEast|thoughtBubble|roundedSpeech)"/);
    expect((xml.match(/<a:custGeom>/g) ?? []).length).toBe(5);
    expect(xml).toContain('name="clerdoPreset_speech"');
    expect(checkPackage(writePptx(d))).toEqual([]);
    const r = roundTrip(d).slides[0]!.shapes;
    const s = asShape(byName(r, 'Speech'));
    expect(s.geom).toBe('speech');
    expect(s.adj).toEqual({ adj1: 30000, adj2: 90000, adj3: 20000 });
    expect(s.path).toBeUndefined();
    expect(asShape(byName(r, 'Burst')).geom).toBe('starburst');
    expect(asShape(byName(r, 'Arrow')).adj).toEqual({ adj1: 40000, adj2: 60000 });
    expect(asShape(byName(r, 'Thought')).geom).toBe('thoughtBubble');
    const m = byName(r, 'Masked') as Picture;
    expect(m.kind).toBe('picture');
    expect(m.geom).toBe('roundedSpeech');
  });
});

describe('effects and pictures', () => {
  it('keeps reflections on shapes and pictures', () => {
    const d = blank();
    const refl = { alpha: 0.5, size: 0.55, dist: 4, blur: 2 };
    add(d, box('Shape', { effects: { reflection: refl } }));
    add(d, pic('Pic', { effects: { reflection: refl } }));
    expect(slideXml(d)).toContain('<a:reflection');
    const r = roundTrip(d).slides[0]!.shapes;
    for (const n of ['Shape', 'Pic']) {
      const x = byName(r, n)!.effects!.reflection!;
      expect(x.alpha).toBeCloseTo(0.5, 3);
      expect(x.size).toBeCloseTo(0.55, 3);
      expect(x.dist).toBeCloseTo(4, 1);
      expect(x.blur).toBeCloseTo(2, 1);
    }
  });

  it('keeps theme recolors as duotone, light and dark', () => {
    const d = blank();
    add(d, pic('Light', { adjust: { recolor: { theme: 'accent2' }, recolorMode: 'light' } }));
    add(d, pic('Dark', { adjust: { recolor: { theme: 'accent4' }, recolorMode: 'dark' } }));
    expect(slideXml(d)).toContain('<a:duotone>');
    const r = roundTrip(d).slides[0]!.shapes;
    const l = byName(r, 'Light') as Picture, k = byName(r, 'Dark') as Picture;
    expect(l.adjust?.recolor).toEqual({ theme: 'accent2' });
    expect(l.adjust?.recolorMode).toBe('light');
    expect(k.adjust?.recolor).toEqual({ theme: 'accent4' });
    expect(k.adjust?.recolorMode).toBeUndefined();
  });
});

describe('linked charts', () => {
  it('keeps the data link in the chart part', () => {
    const d = blank();
    const c: Chart = { id: uid('s'), kind: 'chart', name: 'Linked', x: 0, y: 0, w: 500, h: 300, chartType: 'col', categories: ['A', 'B'], series: [{ name: 'S1', values: [1, 2] }], dataLink: { file: 'Sales & costs.xlsx', sheet: 'Q1', range: 'A1:B3' } };
    add(d, c);
    add(d, { ...c, id: uid('s'), name: 'Plain', dataLink: undefined });
    const bytes = writePptx(d);
    expect(checkPackage(bytes)).toEqual([]);
    const r = roundTrip(d).slides[0]!.shapes;
    expect((byName(r, 'Linked') as Chart).dataLink).toEqual({ file: 'Sales & costs.xlsx', sheet: 'Q1', range: 'A1:B3' });
    expect((byName(r, 'Plain') as Chart).dataLink).toBeUndefined();
    expect((byName(r, 'Linked') as Chart).series[0]!.values).toEqual([1, 2]);
  });
});
