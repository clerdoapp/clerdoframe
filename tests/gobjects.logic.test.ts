import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { AutoShape, Picture } from '../src/model/deck';
import { registerAllPresets } from '../src/features/shapes/presets';
import {
  applyModels, bounds, deletePoint, insertPoint, localToParent, modelsOf, moveHandle, parentToLocal, parsePath, segPoint, serialize, setSmooth, smoothThrough, toCustom,
} from '../src/features/gobjects/pathEdit';
import { applyAspect, applyRecolor, coverCrop, naturalAspect, parseAspect, RECOLOR_PRESETS } from '../src/features/gobjects/picture';
import { cellsOf, chartData, detectTable, parseDelimited, parseRange, rangeRef, readSheets, readXlsxSheets } from '../src/features/gobjects/sheet';
import { chartFromCells, fillChart, tableFromCells } from '../src/features/gobjects/linked';
import { solveOwnHandle, registerOwnPresets } from '../src/features/gobjects/presets';
import { geometry } from '../src/render/geometry';

registerAllPresets();
registerOwnPresets();

const shape = (extra: Partial<AutoShape> = {}): AutoShape => ({ id: 's1', kind: 'shape', name: 'S', geom: 'custom', x: 100, y: 100, w: 100, h: 100, path: [{ d: 'M0 0L100 0L100 100L0 100Z', w: 100, h: 100 }], ...extra });

describe('path model', () => {
  it('parses lines, curves, quadratics and closes without a duplicate end point', () => {
    const m = parsePath('M0 0L10 0C20 0 20 10 10 10Q5 15 0 10Z');
    expect(m).toHaveLength(1);
    expect(m[0]!.closed).toBe(true);
    expect(m[0]!.nodes).toHaveLength(4);
    expect(m[0]!.nodes[1]!.out).toEqual([20, 0]);
    expect(m[0]!.nodes[2]!.in).toEqual([20, 10]);
    const again = parsePath(serialize(m));
    expect(again[0]!.nodes.map((n) => [n.x, n.y])).toEqual(m[0]!.nodes.map((n) => [n.x, n.y]));
  });

  it('keeps several sub-paths and open paths', () => {
    const m = parsePath('M0 0L5 5M10 10L20 20L30 10Z');
    expect(m.map((s) => [s.nodes.length, s.closed])).toEqual([[2, false], [3, true]]);
  });

  it('adds a point on a curve without changing its shape, and deletes points down to the minimum', () => {
    const [sp] = parsePath('M0 0C0 50 100 50 100 0');
    const before = segPoint(sp!, 0, 0.25);
    const i = insertPoint(sp!, 0, 0.5);
    expect(i).toBe(1);
    expect(sp!.nodes).toHaveLength(3);
    const after = segPoint(sp!, 0, 0.5);
    expect(after[0]).toBeCloseTo(before[0], 4);
    expect(after[1]).toBeCloseTo(before[1], 4);
    expect(deletePoint(sp!, 1)).toBe(true);
    expect(deletePoint(sp!, 1)).toBe(false);
  });

  it('switches smooth and corner points and mirrors smooth handles', () => {
    const [sp] = parsePath('M0 0L50 50L100 0');
    setSmooth(sp!, 1, true);
    const n = sp!.nodes[1]!;
    expect(n.smooth).toBe(true);
    expect(n.in![1]).toBeCloseTo(50, 5);
    moveHandle(n, 'out', 80, 70);
    const vin = [n.in![0] - n.x, n.in![1] - n.y], vout = [n.out![0] - n.x, n.out![1] - n.y];
    expect(vin[0]! * vout[1]! - vin[1]! * vout[0]!).toBeCloseTo(0, 5);
    setSmooth(sp!, 1, false);
    expect(n.in).toBeUndefined();
    expect(serialize([sp!])).toBe('M0 0L50 50L100 0');
  });

  it('applies edits so nothing moves on the slide, rotated and flipped too', () => {
    const s = shape({ rot: 30, flipH: true });
    const models = modelsOf(s);
    const keep = localToParent(s, [0, 0]);
    models[0]![0]!.nodes[2]!.x = 160;
    models[0]![0]!.nodes[2]!.y = 140;
    const moved = localToParent(s, [160, 140]);
    applyModels(s, models);
    expect(s.w).toBeCloseTo(160, 1);
    expect(s.h).toBeCloseTo(140, 1);
    const m2 = modelsOf(s)[0]![0]!;
    const a = localToParent(s, [m2.nodes[0]!.x, m2.nodes[0]!.y]), b = localToParent(s, [m2.nodes[2]!.x, m2.nodes[2]!.y]);
    expect(a[0]).toBeCloseTo(keep[0], 1); expect(a[1]).toBeCloseTo(keep[1], 1);
    expect(b[0]).toBeCloseTo(moved[0], 1); expect(b[1]).toBeCloseTo(moved[1], 1);
    const back = parentToLocal(s, a);
    expect(back[0]).toBeCloseTo(m2.nodes[0]!.x, 3);
  });

  it('converts presets to custom geometry with the same outline', () => {
    const s = shape({ geom: 'star5', path: undefined });
    expect(toCustom(s)).toBe(true);
    expect(s.geom).toBe('custom');
    const b = bounds(modelsOf(s));
    expect(b.w).toBeGreaterThan(90);
    expect(b.h).toBeGreaterThan(80);
    expect(modelsOf(s)[0]![0]!.nodes).toHaveLength(10);
  });

  it('draws smooth curves through every point', () => {
    const pts: [number, number][] = [[0, 0], [50, 40], [100, 0], [150, 40]];
    const sp = smoothThrough(pts, false);
    expect(sp.nodes.map((n) => [n.x, n.y])).toEqual(pts);
    expect(sp.nodes[0]!.in).toBeUndefined();
    expect(sp.nodes[3]!.out).toBeUndefined();
    expect(serialize([sp])).toMatch(/^M0 0C/);
    const closed = smoothThrough(pts, true);
    expect(serialize([closed]).endsWith('Z')).toBe(true);
  });
});

describe('own preset handles', () => {
  it('moves the speech bubble tail to the pointer', () => {
    const adj = solveOwnHandle('speech', 200, 100, 0, 20, 160)!;
    const g = geometry('speech', 200, 100, adj);
    expect(g.handles![0]!.x).toBeCloseTo(20, 0);
    expect(g.handles![0]!.y).toBeCloseTo(160, 0);
    expect(solveOwnHandle('rect', 10, 10, 0, 0, 0)).toBeNull();
  });
});

describe('pictures', () => {
  const pic = (extra: Partial<Picture> = {}): Picture => ({ id: 'p', kind: 'picture', name: 'P', media: 'm', x: 0, y: 0, w: 400, h: 300, ...extra });
  it('crops to cover a frame', () => {
    expect(coverCrop(400, 300, 400, 300)).toBeUndefined();
    const c = coverCrop(1600, 900, 300, 300)!;
    expect(c.l).toBeCloseTo((1 - 9 / 16) / 2, 5);
    expect(c.t).toBe(0);
  });
  it('reshapes to an aspect ratio keeping the centre and the image undistorted', () => {
    const p = pic();
    expect(parseAspect('16:9')).toBeCloseTo(16 / 9);
    expect(parseAspect('bad')).toBeNull();
    applyAspect(p, 1);
    expect(p.w).toBe(300); expect(p.h).toBe(300);
    expect(p.x + p.w / 2).toBe(200);
    expect(naturalAspect(p)).toBeCloseTo(4 / 3, 5);
    applyAspect(p, 16 / 9);
    expect(p.w / p.h).toBeCloseTo(16 / 9, 5);
    expect(naturalAspect(p)).toBeCloseTo(4 / 3, 5);
  });
  it('recolors with theme presets and clears', () => {
    const p = pic({ adjust: { grayscale: true, brightness: 10 } });
    applyRecolor(p, RECOLOR_PRESETS.find((r) => r.id === 'light3')!);
    expect(p.adjust).toEqual({ brightness: 10, recolor: { theme: 'accent3' }, recolorMode: 'light' });
    applyRecolor(p, null);
    expect(p.adjust).toEqual({ brightness: 10 });
    expect(RECOLOR_PRESETS).toHaveLength(12);
  });
});

describe('spreadsheet files', () => {
  it('parses CSV with quotes and guesses the delimiter', () => {
    expect(parseDelimited('a,"b, c",d\r\n1,"say ""hi""",3\n')).toEqual([['a', 'b, c', 'd'], ['1', 'say "hi"', '3']]);
    expect(parseDelimited('x\ty\n1\t2')).toEqual([['x', 'y'], ['1', '2']]);
    expect(parseDelimited('x;y\n1;2')).toEqual([['x', 'y'], ['1', '2']]);
  });

  it('finds the first table and turns it into chart data', () => {
    const rows = parseDelimited('Report,,\n,,\n,North,South\nJan,10,20\nFeb,"1,500",5%\n,,\nNotes,,');
    const rg = detectTable(rows)!;
    expect(rangeRef(rg)).toBe('A1:A1');
    const rows2 = rows.slice(2);
    const rg2 = detectTable(rows2)!;
    expect(rangeRef(rg2)).toBe('A1:C3');
    const d = chartData(cellsOf(rows2, rg2));
    expect(d.categories).toEqual(['Jan', 'Feb']);
    expect(d.series).toEqual([{ name: 'North', values: [10, 1500] }, { name: 'South', values: [20, 0.05] }]);
    expect(parseRange('Sheet1!$B$2:D4')).toEqual({ r1: 1, c1: 1, r2: 3, c2: 3 });
  });

  it('reads xlsx sheets with shared and inline strings', () => {
    const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const xlsx = zipSync({
      'xl/workbook.xml': strToU8(`<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Notes" sheetId="1" r:id="rId2"/><sheet name="Data &amp; more" sheetId="2" r:id="rId1"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>`),
      'xl/sharedStrings.xml': strToU8(`<sst xmlns="${S}"><si><t>Region</t></si><si><r><t>Sa</t></r><r><t>les</t></r><rPh><t>x</t></rPh></si></sst>`),
      'xl/worksheets/sheet1.xml': strToU8(`<worksheet xmlns="${S}"><sheetData><row r="2"><c r="B2" t="s"><v>0</v></c><c r="C2" t="s"><v>1</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>East</t></is></c><c r="C3"><v>12.5</v></c></row><row r="4"><c r="B4" t="str"><f>A1</f><v>West</v></c><c r="C4"><f>C3*2</f><v>25</v></c></row></sheetData></worksheet>`),
      'xl/worksheets/sheet2.xml': strToU8(`<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c></row></sheetData></worksheet>`),
    });
    const sheets = readXlsxSheets(xlsx);
    expect(sheets.map((s) => s.name)).toEqual(['Notes', 'Data & more']);
    expect(sheets[0]!.rows[0]).toEqual(['hello']);
    const data = sheets[1]!;
    expect(data.rows[1]).toEqual(['', 'Region', 'Sales']);
    const rg = detectTable(data.rows)!;
    expect(rangeRef(rg)).toBe('B2:C4');
    expect(chartData(cellsOf(data.rows, rg))).toEqual({ categories: ['East', 'West'], series: [{ name: 'Sales', values: [12.5, 25] }] });
    expect(readSheets('book.xlsx', xlsx)).toHaveLength(2);
    expect(() => readXlsxSheets(strToU8('not a zip'))).toThrow();
  });

  it('builds charts and tables from cells', () => {
    const cells = [['', 'A', 'B'], ['x', '1', '2'], ['y', '3', '4']];
    const c = chartFromCells('combo', cells, { x: 0, y: 0, w: 400, h: 300 }, { file: 'f.csv', range: 'A1:C3' });
    expect(c.categories).toEqual(['x', 'y']);
    expect(c.series.map((s) => [s.name, s.values, s.type])).toEqual([['A', [1, 3], 'col'], ['B', [2, 4], 'line']]);
    expect(c.dataLink).toEqual({ file: 'f.csv', range: 'A1:C3' });
    c.series[0]!.color = '#FF0000';
    fillChart(c, [['', 'A'], ['z', '9']]);
    expect(c.series).toEqual([{ name: 'A', values: [9], color: '#FF0000', type: 'col' }]);
    expect(() => fillChart(c, [])).toThrow();
    const t = tableFromCells(cells, 0, 0, 600);
    expect(t.rows).toHaveLength(3);
    expect(t.cols).toHaveLength(3);
    expect(t.rows[1]!.cells[0]!.text.paras[0]!.runs[0]!.text).toBe('x');
  });
});

describe('drawing', () => {
  it('draws reflections and duotone recolors', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { SlideView } = await import('../src/render/SlideView');
    const { newDeck, newSlide } = await import('../src/model/defaults');
    const d = newDeck();
    const sl = newSlide(d.masters[0]!.layouts[0]!);
    sl.shapes = [
      { id: 'a', kind: 'shape', name: 'A', geom: 'speech', x: 10, y: 10, w: 200, h: 100, fill: { type: 'solid', color: '#FF0000' }, effects: { reflection: { alpha: 0.5, size: 0.5, dist: 4, blur: 2 } } },
      { id: 'b', kind: 'picture', name: 'B', media: 'none', x: 300, y: 10, w: 200, h: 100, adjust: { recolor: { theme: 'accent2' }, recolorMode: 'light' } },
    ];
    d.slides = [sl];
    const html = renderToStaticMarkup(createElement(SlideView, { deck: d, slide: sl, width: 640 }));
    expect(html).toContain('class="reflection"');
    expect(html).toMatch(/<mask[^>]*>/);
    expect(html).toContain('scale(1 -1)');
    // No image bytes: the picture draws a placeholder, so the filter is defined but unused.
    expect(html).toContain('feComponentTransfer');
  });
});

describe('sheet choice', () => {
  it('prefers the first sheet with numbers', async () => {
    const { bestSheet } = await import('../src/features/gobjects/sheet');
    expect(bestSheet([{ name: 'Cover', rows: [['Title only']] }, { name: 'Data', rows: [['', 'A'], ['x', '1']] }])).toBe(1);
    expect(bestSheet([{ name: 'Cover', rows: [] }])).toBe(0);
  });
});
