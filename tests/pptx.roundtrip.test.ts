import { describe, expect, it } from 'vitest';
import { newDeck, newSlide } from '../src/model/defaults';
import {
  uid,
  type Animation, type AutoShape, type Chart, type Deck, type Diagram, type Equation, type Group, type Ink, type Media, type Picture, type Shape, type Table,
} from '../src/model/deck';
import { writePptx } from '../src/formats/pptx';
import { asShape, byName, checkPackage, parts, roundTrip, textOfShape } from './pptx.helpers';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const blank = (): Deck => {
  const d = newDeck();
  const l = d.masters[0]!.layouts.find((x) => x.type === 'blank')!;
  d.slides = [newSlide(l)];
  return d;
};
const add = (d: Deck, s: Shape, slide = 0): void => { d.slides[slide]!.shapes.push(s); };
const box = (name: string, extra: Partial<AutoShape> = {}): AutoShape => ({ id: uid('s'), kind: 'shape', name, geom: 'rect', x: 100, y: 50, w: 200, h: 100, ...extra });

const save = (d: Deck): Deck => {
  const bytes = writePptx(d);
  expect(checkPackage(bytes)).toEqual([]);
  return roundTrip(d);
};

describe('shapes', () => {
  it('keeps geometry, fills, lines and effects', () => {
    const d = blank();
    add(d, box('Rounded', { geom: 'roundRect', adj: { adj: 25000 }, rot: 30, flipH: true, fill: { type: 'solid', color: { theme: 'accent2', lum: 0.4 } }, line: { fill: { type: 'solid', color: '#112233' }, width: 2.5, dash: 'dash', head: { type: 'triangle' }, tail: { type: 'oval', w: 'lg', len: 'sm' } } }));
    add(d, box('Gradient', { fill: { type: 'gradient', kind: 'linear', angle: 45, stops: [{ pos: 0, color: '#FF0000' }, { pos: 1, color: { theme: 'accent1', alpha: 0.5 } }] }, effects: { shadow: { kind: 'outer', color: '#000000', blur: 8, dist: 4, angle: 45, alpha: 0.4 }, glow: { color: { theme: 'accent3' }, radius: 6 }, softEdge: 3 } }));
    add(d, box('Pattern', { fill: { type: 'pattern', pattern: 'dnDiag', fg: '#000000', bg: '#FFFFFF' } }));
    add(d, box('Radial', { fill: { type: 'gradient', kind: 'radial', angle: 0, stops: [{ pos: 0, color: '#FFFFFF' }, { pos: 1, color: '#000000' }] } }));
    add(d, box('Custom', { geom: 'custom', path: [{ d: 'M0 0L100 0L50 80Z', w: 100, h: 80 }, { d: 'M10 10C20 20 30 20 40 10', w: 100, h: 80 }] }));
    add(d, box('Hidden', { hidden: true, alt: 'Alt text', decorative: true }));
    const r = save(d).slides[0]!.shapes;
    const a = asShape(byName(r, 'Rounded'));
    expect(a.geom).toBe('roundRect');
    expect(a.adj).toEqual({ adj: 25000 });
    expect(a.rot).toBe(30);
    expect(a.flipH).toBe(true);
    expect([a.x, a.y, a.w, a.h]).toEqual([100, 50, 200, 100]);
    expect(a.fill).toEqual({ type: 'solid', color: { theme: 'accent2', lum: 0.4 } });
    expect(a.line?.width).toBe(2.5);
    expect(a.line?.dash).toBe('dash');
    expect(a.line?.fill).toEqual({ type: 'solid', color: '#112233' });
    expect(a.line?.head).toEqual({ type: 'triangle' });
    expect(a.line?.tail).toEqual({ type: 'oval', w: 'lg', len: 'sm' });
    const g = asShape(byName(r, 'Gradient'));
    expect(g.fill?.type).toBe('gradient');
    if (g.fill?.type === 'gradient') {
      expect(g.fill.angle).toBe(45);
      expect(g.fill.stops[1]!.color).toEqual({ theme: 'accent1', alpha: 0.5 });
    }
    expect(g.effects?.shadow?.blur).toBe(8);
    expect(g.effects?.shadow?.alpha).toBe(0.4);
    expect(g.effects?.glow?.radius).toBe(6);
    expect(g.effects?.softEdge).toBe(3);
    expect(asShape(byName(r, 'Pattern')).fill).toEqual({ type: 'pattern', pattern: 'dnDiag', fg: '#000000', bg: '#FFFFFF' });
    const rad = asShape(byName(r, 'Radial')).fill;
    expect(rad?.type === 'gradient' && rad.kind).toBe('radial');
    const c = asShape(byName(r, 'Custom'));
    expect(c.geom).toBe('custom');
    expect(c.path).toHaveLength(2);
    expect(c.path![0]).toEqual({ d: 'M0 0L200 0L100 100Z', w: 200, h: 100 });
    expect(c.path![1]!.d).toContain('C');
    const h = asShape(byName(r, 'Hidden'));
    expect(h.hidden).toBe(true);
    expect(h.alt).toBe('Alt text');
    expect(h.decorative).toBe(true);
  });

  it('keeps connectors glued to shapes', () => {
    const d = blank();
    const a = box('A'), b = box('B', { x: 600 });
    const line: AutoShape = { id: uid('s'), kind: 'shape', name: 'Link', geom: 'straightConnector1', x: 300, y: 100, w: 300, h: 0, line: { fill: { type: 'solid', color: '#000000' }, width: 1, tail: { type: 'triangle' } }, conn: { start: { shape: a.id, site: 3 }, end: { shape: b.id, site: 1 } } };
    add(d, line); add(d, a); add(d, b);
    const r = save(d).slides[0]!.shapes;
    const l = asShape(byName(r, 'Link'));
    expect(l.conn?.start?.shape).toBe(byName(r, 'A')!.id);
    expect(l.conn?.start?.site).toBe(3);
    expect(l.conn?.end?.shape).toBe(byName(r, 'B')!.id);
  });

  it('keeps groups with child space', () => {
    const d = blank();
    const g: Group = { id: uid('s'), kind: 'group', name: 'G', x: 10, y: 20, w: 400, h: 200, childBox: { x: 0, y: 0, w: 200, h: 100 }, children: [box('C1', { x: 0, y: 0, w: 100, h: 50 }), { id: uid('s'), kind: 'group', name: 'Inner', x: 100, y: 50, w: 100, h: 50, children: [box('C2', { x: 100, y: 50, w: 100, h: 50 })] }] };
    add(d, g);
    const r = save(d).slides[0]!.shapes;
    const rg = byName(r, 'G') as Group;
    expect(rg.kind).toBe('group');
    expect(rg.childBox).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(rg.children).toHaveLength(2);
    expect((rg.children[1] as Group).children[0]!.name).toBe('C2');
  });

  it('keeps hyperlinks safe and in-deck', () => {
    const d = blank();
    d.slides.push(newSlide(d.masters[0]!.layouts[1]!));
    const target = d.slides[1]!.id;
    add(d, box('Web', { link: { url: 'https://clerdo.app', tooltip: 'Site' }, text: { paras: [{ runs: [{ text: 'mail', style: { link: { url: 'mailto:a@b.c' } } }, { text: ' next', style: { link: { action: 'next' } } }] }] } }));
    add(d, box('Jump', { link: { action: 'slide', slide: target } }));
    const r = save(d);
    const w = asShape(byName(r.slides[0]!.shapes, 'Web'));
    expect(w.link).toEqual({ url: 'https://clerdo.app', tooltip: 'Site' });
    expect(w.text!.paras[0]!.runs[0]!.style?.link).toEqual({ url: 'mailto:a@b.c' });
    expect(w.text!.paras[0]!.runs[1]!.style?.link).toEqual({ action: 'next' });
    expect(asShape(byName(r.slides[0]!.shapes, 'Jump')).link).toEqual({ action: 'slide', slide: r.slides[1]!.id });
  });
});

describe('text', () => {
  it('keeps body, paragraph and run formatting', () => {
    const d = blank();
    add(d, box('T', {
      textbox: true,
      text: {
        vAlign: 'ctr', inset: { l: 5, t: 6, r: 7, b: 8 }, wrap: false, autofit: 'shrink', fontScale: 0.9, columns: 2, columnGap: 12, vert: 'vert270', warp: 'textArchUp',
        paras: [
          { style: { align: 'ctr', level: 1, marginLeft: 40, indent: -20, lineSpacing: 120, spaceBefore: 6, spaceAfter: 3, bullet: { type: 'char', char: '–', font: 'Arial', color: '#FF0000', size: 80 }, rtl: true },
            runs: [{ text: 'Bold', style: { bold: true, italic: true, underline: 'dbl', strike: 'sng', size: 24, font: 'Georgia', fontEa: 'MS Mincho', color: { theme: 'accent1', lum: -0.25 }, spacing: 2, baseline: 30, caps: 'small', highlight: '#FFFF00' } }, { text: '', br: true }, { text: 'line2' }] },
          { style: { bullet: { type: 'auto', scheme: 'romanUcPeriod', start: 3 }, lineSpacing: 20, lineSpacingPts: true }, runs: [{ text: '7', field: 'slidenum' }] },
          { runs: [{ text: 'grad', style: { fill: { type: 'gradient', kind: 'linear', angle: 0, stops: [{ pos: 0, color: '#000000' }, { pos: 1, color: '#FFFFFF' }] }, outline: { fill: { type: 'solid', color: '#00FF00' }, width: 1 } } }] },
          { style: { bullet: { type: 'none' } }, runs: [] },
        ],
      },
    }));
    const t = asShape(byName(save(d).slides[0]!.shapes, 'T'));
    expect(t.textbox).toBe(true);
    const b = t.text!;
    expect([b.vAlign, b.wrap, b.autofit, b.fontScale, b.columns, b.columnGap, b.vert, b.warp]).toEqual(['ctr', false, 'shrink', 0.9, 2, 12, 'vert270', 'textArchUp']);
    expect(b.inset).toEqual({ l: 5, t: 6, r: 7, b: 8 });
    const p0 = b.paras[0]!;
    expect(p0.style).toMatchObject({ align: 'ctr', level: 1, marginLeft: 40, indent: -20, lineSpacing: 120, spaceBefore: 6, spaceAfter: 3, rtl: true, bullet: { type: 'char', char: '–', font: 'Arial', color: '#FF0000', size: 80 } });
    expect(p0.runs[0]!.style).toMatchObject({ bold: true, italic: true, underline: 'dbl', strike: 'sng', size: 24, font: 'Georgia', fontEa: 'MS Mincho', color: { theme: 'accent1', lum: -0.25 }, spacing: 2, baseline: 30, caps: 'small', highlight: '#FFFF00' });
    expect(p0.runs[1]!.br).toBe(true);
    expect(textOfShape(t).split('\n')[0]).toBe('Bold');
    const p1 = b.paras[1]!;
    expect(p1.style?.bullet).toEqual({ type: 'auto', scheme: 'romanUcPeriod', start: 3 });
    expect(p1.style?.lineSpacingPts).toBe(true);
    expect(p1.runs[0]!.field).toBe('slidenum');
    expect(b.paras[2]!.runs[0]!.style?.fill?.type).toBe('gradient');
    expect(b.paras[2]!.runs[0]!.style?.outline?.width).toBe(1);
    expect(b.paras[3]!.style?.bullet).toEqual({ type: 'none' });
  });

  it('keeps master text styles and placeholder levels', () => {
    const d = newDeck();
    d.masters[0]!.textStyles.title[0]!.defRun = { size: 50, font: '+mj-lt', color: { theme: 'accent1' } };
    d.masters[0]!.textStyles.body[2]!.defRun = { size: 17 };
    const r = save(d);
    const m = r.masters[0]!;
    expect(m.textStyles.title[0]!.defRun).toMatchObject({ size: 50, font: '+mj-lt', color: { theme: 'accent1' } });
    expect(m.textStyles.body[2]!.defRun?.size).toBe(17);
    expect(m.textStyles.body[0]!.bullet).toEqual({ type: 'char', char: '•', font: 'Arial' });
    const dt = m.shapes.find((s) => s.ph?.type === 'sldNum') as AutoShape;
    expect(dt.text!.paras[0]!.runs[0]!.field).toBe('slidenum');
  });
});

describe('tables', () => {
  it('keeps grid, merges, fills, borders and margins', () => {
    const d = blank();
    const cell = (t: string) => ({ text: { paras: [{ runs: [{ text: t }] }] } });
    const t: Table = {
      id: uid('s'), kind: 'table', name: 'Tbl', x: 50, y: 60, w: 600, h: 120, cols: [200, 200, 200], style: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}', opts: { firstRow: true, bandRow: true },
      rows: [
        { h: 40, cells: [{ ...cell('A'), gridSpan: 2, fill: { type: 'solid', color: { theme: 'accent1' } } }, { ...cell(''), hMerge: true }, { ...cell('C'), rowSpan: 2, vAlign: 'ctr', margin: { l: 1, t: 2, r: 3, b: 4 } }] },
        { h: 40, cells: [{ ...cell('D'), borders: { b: { fill: { type: 'solid', color: '#FF0000' }, width: 3 }, tl2br: { fill: { type: 'solid', color: '#000000' }, width: 1 } } }, cell('E'), { ...cell(''), vMerge: true }] },
        { h: 40, cells: [cell('F'), cell('G'), cell('H')] },
      ],
    };
    add(d, t);
    const r = byName(save(d).slides[0]!.shapes, 'Tbl') as Table;
    expect(r.kind).toBe('table');
    expect(r.cols).toEqual([200, 200, 200]);
    expect(r.rows.map((x) => x.h)).toEqual([40, 40, 40]);
    expect(r.style).toBe('{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}');
    expect(r.opts).toEqual({ firstRow: true, bandRow: true });
    expect(r.rows[0]!.cells[0]!.gridSpan).toBe(2);
    expect(r.rows[0]!.cells[1]!.hMerge).toBe(true);
    expect(r.rows[0]!.cells[2]!.rowSpan).toBe(2);
    expect(r.rows[0]!.cells[2]!.vAlign).toBe('ctr');
    expect(r.rows[0]!.cells[2]!.margin).toEqual({ l: 1, t: 2, r: 3, b: 4 });
    expect(r.rows[1]!.cells[2]!.vMerge).toBe(true);
    expect(r.rows[0]!.cells[0]!.fill).toEqual({ type: 'solid', color: { theme: 'accent1' } });
    expect(r.rows[1]!.cells[0]!.borders?.b?.width).toBe(3);
    expect(r.rows[1]!.cells[0]!.borders?.tl2br?.width).toBe(1);
    expect(r.rows[2]!.cells[1]!.text.paras[0]!.runs[0]!.text).toBe('G');
  });
});

describe('charts', () => {
  const chart = (type: Chart['chartType'], extra: Partial<Chart> = {}): Chart => ({
    id: uid('s'), kind: 'chart', name: `Chart ${type}`, x: 0, y: 0, w: 500, h: 300, chartType: type, categories: ['Q1', 'Q2', 'Q3'],
    series: [{ name: 'North', values: [1, 2.5, 3], color: { theme: 'accent1' } }, { name: 'South', values: [4, 5, 6] }], title: 'Sales', legend: 'b', dataLabels: true, ...extra,
  });
  it('keeps type, data, title, legend and colors', () => {
    const d = blank();
    for (const t of ['col', 'bar', 'line', 'area', 'pie', 'doughnut', 'radar'] as const) add(d, chart(t));
    add(d, chart('col', { grouping: 'stacked', axes: { xTitle: 'Quarter', yTitle: 'Units', min: 0, max: 10, gridlines: true } }));
    add(d, chart('scatter', { name: 'Scatter', series: [{ name: 'Pts', values: [3, 1, 2], x: [1, 2, 3] }] }));
    add(d, chart('combo', { name: 'Combo', series: [{ name: 'Bars', values: [1, 2, 3], type: 'col' }, { name: 'Line', values: [3, 2, 1], type: 'line', secondary: true }] }));
    const bytes = writePptx(d);
    const p = parts(bytes);
    expect(Object.keys(p).filter((k) => /^ppt\/charts\/chart\d+\.xml$/.test(k))).toHaveLength(10);
    expect(Object.keys(p).filter((k) => /^ppt\/embeddings\/.*\.xlsx$/.test(k))).toHaveLength(10);
    const r = save(d).slides[0]!.shapes as Chart[];
    for (const t of ['col', 'bar', 'line', 'area', 'pie', 'doughnut', 'radar']) {
      const c = byName(r, `Chart ${t}`) as Chart;
      expect(c.chartType).toBe(t);
      expect(c.categories).toEqual(['Q1', 'Q2', 'Q3']);
      expect(c.title).toBe('Sales');
      expect(c.legend).toBe('b');
      expect(c.dataLabels).toBe(true);
      expect(c.series[0]!.values).toEqual([1, 2.5, 3]);
      expect(c.series[0]!.name).toBe('North');
      if (t !== 'pie' && t !== 'doughnut') expect(c.series[0]!.color).toEqual({ theme: 'accent1' });
      expect(c.rawXml).toContain('chartSpace');
    }
    const st = r.filter((c) => c.grouping === 'stacked')[0]!;
    expect(st.axes).toMatchObject({ xTitle: 'Quarter', yTitle: 'Units', min: 0, max: 10, gridlines: true });
    const sc = byName(r, 'Scatter') as Chart;
    expect(sc.chartType).toBe('scatter');
    expect(sc.series[0]!.x).toEqual([1, 2, 3]);
    const cb = byName(r, 'Combo') as Chart;
    expect(cb.chartType).toBe('combo');
    expect(cb.series.map((s) => s.type)).toEqual(['col', 'line']);
    expect(cb.series[1]!.secondary).toBe(true);
  });
});

describe('pictures and media', () => {
  it('keeps pictures with crop, mask and adjustments', () => {
    const d = blank();
    d.media.img = { id: 'img', type: 'image/png', name: 'dot.png', data: PNG };
    const p: Picture = { id: uid('s'), kind: 'picture', name: 'Pic', x: 1, y: 2, w: 300, h: 200, media: 'img', crop: { l: 0.1, t: 0, r: 0.2, b: 0.05 }, geom: 'ellipse', adjust: { transparency: 30, grayscale: true, brightness: 20, contrast: -10 }, line: { fill: { type: 'solid', color: '#000000' }, width: 2 } };
    add(d, p);
    add(d, box('PicFill', { fill: { type: 'picture', media: 'img', mode: 'tile', transparency: 0.5 } }));
    d.slides[0]!.background = { fill: { type: 'picture', media: 'img', mode: 'stretch' } };
    const r = save(d);
    const rp = byName(r.slides[0]!.shapes, 'Pic') as Picture;
    expect(rp.kind).toBe('picture');
    expect(r.media[rp.media]!.data).toEqual(PNG);
    expect(r.media[rp.media]!.type).toBe('image/png');
    expect(rp.crop).toEqual({ l: 0.1, t: 0, r: 0.2, b: 0.05 });
    expect(rp.geom).toBe('ellipse');
    expect(rp.adjust).toMatchObject({ transparency: 30, grayscale: true, brightness: 20, contrast: -10 });
    expect(rp.line?.width).toBe(2);
    const pf = asShape(byName(r.slides[0]!.shapes, 'PicFill')).fill;
    expect(pf?.type === 'picture' && pf.mode).toBe('tile');
    expect(pf?.type === 'picture' && pf.transparency).toBe(0.5);
    expect(r.slides[0]!.background?.fill.type).toBe('picture');
    // Same bytes are stored once.
    expect(Object.keys(parts(writePptx(d))).filter((k) => k.startsWith('ppt/media/'))).toHaveLength(1);
  });

  it('keeps video and audio with poster and trim', () => {
    const d = blank();
    d.media.vid = { id: 'vid', type: 'video/mp4', name: 'clip.mp4', data: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]) };
    d.media.aud = { id: 'aud', type: 'audio/mpeg', name: 'a.mp3', data: new Uint8Array([73, 68, 51, 3]) };
    d.media.img = { id: 'img', type: 'image/png', name: 'p.png', data: PNG };
    const v: Media = { id: uid('s'), kind: 'media', name: 'Video', mediaType: 'video', media: 'vid', poster: 'img', x: 0, y: 0, w: 640, h: 360, trim: { start: 1.5, end: 2 }, fadeIn: 0.5 };
    const a: Media = { id: uid('s'), kind: 'media', name: 'Audio', mediaType: 'audio', media: 'aud', x: 10, y: 10, w: 40, h: 40 };
    add(d, v); add(d, a);
    const bytes = writePptx(d);
    const p = parts(bytes);
    expect(Object.keys(p).some((k) => k.endsWith('.mp4'))).toBe(true);
    expect(p['[Content_Types].xml']).toContain('video/mp4');
    const r = save(d).slides[0]!.shapes;
    const rv = byName(r, 'Video') as Media;
    expect(rv.kind).toBe('media');
    expect(rv.mediaType).toBe('video');
    expect(rv.trim).toEqual({ start: 1.5, end: 2 });
    expect(rv.fadeIn).toBe(0.5);
    expect(rv.poster).toBeTruthy();
    const ra = byName(r, 'Audio') as Media;
    expect(ra.mediaType).toBe('audio');
  });
});

describe('other kinds', () => {
  it('writes diagrams, ink and equations as shapes other apps can show', () => {
    const d = blank();
    const dg: Diagram = { id: uid('s'), kind: 'diagram', name: 'Dg', x: 0, y: 0, w: 400, h: 200, layout: 'process', nodes: [{ id: 'n1', text: 'One', level: 0 }], cached: [box('Step', { x: 0, y: 0, w: 100, h: 50, text: { paras: [{ runs: [{ text: 'One' }] }] } })] };
    const ink: Ink = { id: uid('s'), kind: 'ink', name: 'Ink', x: 10, y: 10, w: 100, h: 100, strokes: [{ points: [[10, 10], [50, 60], [100, 100]], color: '#FF0000', width: 3, tool: 'pen' }] };
    const eq: Equation = { id: uid('s'), kind: 'equation', name: 'Eq', x: 0, y: 300, w: 300, h: 60, linear: 'a^2+b^2=c^2', size: 28 };
    add(d, dg); add(d, ink); add(d, eq);
    const r = save(d).slides[0]!.shapes;
    const g = byName(r, 'Dg') as Group;
    expect(g.kind).toBe('group');
    expect(textOfShape(g.children[0])).toBe('One');
    const ig = byName(r, 'Ink') as Group;
    expect(ig.kind).toBe('group');
    expect(asShape(ig.children[0]).geom).toBe('custom');
    expect(textOfShape(byName(r, 'Eq'))).toBe('a^2+b^2=c^2');
  });
});

describe('slides', () => {
  it('keeps transitions', () => {
    const d = blank();
    const cases: [string, string | undefined][] = [['fade', undefined], ['push', 'u'], ['wipe', 'r'], ['split', 'hin'], ['morph', 'object'], ['cube', 'l'], ['vortex', 'r'], ['curtains', undefined], ['randomBars', 'h'], ['zoom', 'out'], ['shape', 'diamond'], ['uncover', 'l'], ['ripple', 'center']];
    d.slides = cases.map(([name, option]) => ({ ...newSlide(d.masters[0]!.layouts[6]!), transition: { name: name as never, duration: 1.25, ...(option ? { option } : {}), advanceOnClick: false, advanceAfter: 3 } }));
    const r = save(d);
    r.slides.forEach((s, i) => {
      expect(s.transition?.name).toBe(cases[i]![0]);
      if (cases[i]![1]) expect(s.transition?.option).toBe(cases[i]![1]);
      expect(s.transition?.duration).toBe(1.25);
      expect(s.transition?.advanceOnClick).toBe(false);
      expect(s.transition?.advanceAfter).toBe(3);
    });
  });

  it('keeps animations with presets, triggers and timing', () => {
    const d = blank();
    const a = box('A'), b = box('B'), c = box('C'), btn = box('Btn');
    add(d, a); add(d, b); add(d, c); add(d, btn);
    const A = (shape: string, cls: Animation['cls'], effect: string, trigger: Animation['trigger'], extra: Partial<Animation> = {}): Animation => ({ id: uid('a'), shape, cls, effect, trigger, duration: 0.5, delay: 0, ...extra });
    d.slides[0]!.animations = [
      A(a.id, 'entr', 'flyIn', 'click', { option: 'l', duration: 1 }),
      A(b.id, 'entr', 'fade', 'with', { delay: 0.25 }),
      A(c.id, 'entr', 'wipe', 'after', { option: 't', textBy: 'para' }),
      A(a.id, 'emph', 'spin', 'click', { value: 180, duration: 2, repeat: 2 }),
      A(b.id, 'emph', 'pulse', 'click'),
      A(c.id, 'exit', 'flyOut', 'click', { option: 'r' }),
      A(a.id, 'path', 'line', 'click', { option: 'r', path: 'M0 0 L128 0', duration: 2 }),
      A(b.id, 'entr', 'zoom', 'click', { triggerShape: btn.id }),
      A(c.id, 'entr', 'shape', 'click', { option: 'diamond-in' }),
      A(a.id, 'entr', 'split', 'click', { option: 'hin' }),
      A(b.id, 'entr', 'floatIn', 'click', { option: 'd' }),
      A(c.id, 'exit', 'disappear', 'click'),
    ];
    const r = save(d).slides[0]!;
    const ids = Object.fromEntries(['A', 'B', 'C', 'Btn'].map((n) => [n, byName(r.shapes, n)!.id]));
    const got = r.animations.map((x) => ({ shape: Object.keys(ids).find((k) => ids[k] === x.shape), cls: x.cls, effect: x.effect, option: x.option, trigger: x.trigger }));
    expect(got).toEqual([
      { shape: 'A', cls: 'entr', effect: 'flyIn', option: 'l', trigger: 'click' },
      { shape: 'B', cls: 'entr', effect: 'fade', option: undefined, trigger: 'with' },
      { shape: 'C', cls: 'entr', effect: 'wipe', option: 't', trigger: 'after' },
      { shape: 'A', cls: 'emph', effect: 'spin', option: undefined, trigger: 'click' },
      { shape: 'B', cls: 'emph', effect: 'pulse', option: undefined, trigger: 'click' },
      { shape: 'C', cls: 'exit', effect: 'flyOut', option: 'r', trigger: 'click' },
      { shape: 'A', cls: 'path', effect: 'line', option: 'r', trigger: 'click' },
      { shape: 'C', cls: 'entr', effect: 'shape', option: 'diamond-in', trigger: 'click' },
      { shape: 'A', cls: 'entr', effect: 'split', option: 'hin', trigger: 'click' },
      { shape: 'B', cls: 'entr', effect: 'floatIn', option: 'd', trigger: 'click' },
      { shape: 'C', cls: 'exit', effect: 'disappear', option: undefined, trigger: 'click' },
      { shape: 'B', cls: 'entr', effect: 'zoom', option: 'obj', trigger: 'click' },
    ]);
    expect(r.animations[0]!.duration).toBe(1);
    expect(r.animations[1]!.delay).toBe(0.25);
    expect(r.animations[2]!.textBy).toBe('para');
    expect(r.animations[3]!.value).toBe(180);
    expect(r.animations[3]!.repeat).toBe(2);
    expect(r.animations[6]!.path).toBe('M 0 0 L 128 0');
    expect(r.animations.at(-1)!.triggerShape).toBe(ids.Btn);
  });

  it('keeps notes, hidden slides, names, backgrounds, sections, custom shows and comments', () => {
    const d = blank();
    d.slides.push(newSlide(d.masters[0]!.layouts[1]!), newSlide(d.masters[0]!.layouts[1]!));
    const [s1, s2, s3] = d.slides as [typeof d.slides[0], typeof d.slides[0], typeof d.slides[0]];
    s1.notes = { paras: [{ runs: [{ text: 'Say hello' }] }, { runs: [{ text: 'Then this', style: { bold: true } }] }] };
    s2.hidden = true;
    s2.name = 'Second';
    s3.background = { fill: { type: 'solid', color: { theme: 'accent4' } }, hideMasterGraphics: true };
    d.sections = [{ id: 'x1', name: 'Intro', first: s1.id }, { id: 'x2', name: 'Body & more', first: s2.id }];
    d.customShows = [{ id: 'cs1', name: 'Short', slides: [s1.id, s3.id] }];
    s1.comments = [{ id: 'c1', author: 'Rana Saleh', at: '2026-05-01T10:00:00Z', text: 'Check this', x: 96, y: 48, replies: [{ id: 'c2', author: 'Sam', at: '2026-05-02T10:00:00Z', text: 'Done' }] }];
    const r = save(d);
    expect(r.slides[0]!.notes.paras.map((p) => p.runs.map((x) => x.text).join(''))).toEqual(['Say hello', 'Then this']);
    expect(r.slides[0]!.notes.paras[1]!.runs[0]!.style?.bold).toBe(true);
    expect(r.slides[1]!.hidden).toBe(true);
    expect(r.slides[1]!.name).toBe('Second');
    expect(r.slides[2]!.background).toEqual({ fill: { type: 'solid', color: { theme: 'accent4' } }, hideMasterGraphics: true });
    expect(r.sections.map((s) => [s.name, r.slides.findIndex((x) => x.id === s.first)])).toEqual([['Intro', 0], ['Body & more', 1]]);
    expect(r.customShows[0]!.name).toBe('Short');
    expect(r.customShows[0]!.slides).toEqual([r.slides[0]!.id, r.slides[2]!.id]);
    const cm = r.slides[0]!.comments!;
    expect(cm.map((c) => [c.author, c.text])).toEqual([['Rana Saleh', 'Check this'], ['Sam', 'Done']]);
    expect(cm[0]!.x).toBe(96);
    expect(cm[0]!.initials).toBe('RS');
  });

  it('keeps theme, master background, layouts and document properties', () => {
    const d = newDeck(960, 720);
    const m = d.masters[0]!;
    m.theme.colors.accent1 = '#123456';
    m.theme.fonts = { major: 'Georgia', minor: 'Verdana', name: 'Mine' };
    m.theme.name = 'My theme';
    m.background = { fill: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: { theme: 'bg1' } }, { pos: 1, color: { theme: 'bg2' } }] } };
    m.shapes.push(box('Deco', { fill: { type: 'solid', color: { theme: 'accent1' } } }));
    m.layouts[2]!.hideMasterGraphics = true;
    m.layouts[2]!.background = { fill: { type: 'solid', color: '#EEEEEE' } };
    d.props = { title: 'Deck & co', author: 'Lina', subject: 'S', keywords: 'k1, k2', description: 'D', category: 'Cat', company: 'Clerdo', created: '2026-01-02T03:04:05Z' };
    d.final = true;
    d.show = { type: 'kiosk', loop: true, useTimings: true };
    d.headerFooter = { slideNumber: true };
    const r = save(d);
    expect([r.w, r.h]).toEqual([960, 720]);
    const rm = r.masters[0]!;
    expect(rm.theme.colors.accent1).toBe('#123456');
    expect(rm.theme.fonts.major).toBe('Georgia');
    expect(rm.theme.fonts.minor).toBe('Verdana');
    expect(rm.theme.name).toBe('My theme');
    expect(rm.background.fill.type).toBe('gradient');
    expect(byName(rm.shapes, 'Deco')).toBeTruthy();
    expect(rm.layouts[2]!.hideMasterGraphics).toBe(true);
    expect(rm.layouts[2]!.background).toEqual({ fill: { type: 'solid', color: '#EEEEEE' } });
    expect(r.props).toMatchObject({ title: 'Deck & co', author: 'Lina', subject: 'S', keywords: 'k1, k2', description: 'D', category: 'Cat', company: 'Clerdo', created: '2026-01-02T03:04:05Z' });
    expect(r.final).toBe(true);
    expect(r.show.type).toBe('kiosk');
    expect(r.show.loop).toBe(true);
  });

  it('keeps two masters', () => {
    const d = newDeck();
    const m2 = structuredClone(d.masters[0]!);
    m2.id = 'm2'; m2.name = 'Second'; m2.theme.colors.accent1 = '#00AA00';
    m2.layouts = m2.layouts.map((l) => ({ ...l, id: `${l.id}x` }));
    d.masters.push(m2);
    d.slides.push(newSlide(m2.layouts[1]!));
    const r = save(d);
    expect(r.masters).toHaveLength(2);
    expect(r.masters[1]!.theme.colors.accent1).toBe('#00AA00');
    expect(r.masters[1]!.layouts.some((l) => l.id === r.slides[1]!.layout)).toBe(true);
  });
});
