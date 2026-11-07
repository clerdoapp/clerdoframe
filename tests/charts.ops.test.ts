import { describe, expect, it } from 'vitest';
import { FrameStore } from '../src/app/store';
import { newDeck } from '../src/model/defaults';
import type { Chart } from '../src/model/deck';
import { applyGrid, applyLayout, elementOn, gridOf, parseTable, QUICK_LAYOUTS, switchRowCol, toggleElement } from '../src/features/charts/ops';
import { newChart, sampleData } from '../src/features/charts/sample';
import { applyKind, CHART_KINDS, kindById, kindOf } from '../src/features/charts/types';
import { COLOR_SETS, seriesHex, seriesModelColor, CHART_STYLES, styleOf } from '../src/features/charts/palette';
import { fmtNum, niceScale, renderChart } from '../src/features/charts/render';
import { insertShape, placement } from '../src/features/charts/place';
import { Defs } from '../src/render/paint';
import { DEFAULT_THEME } from '../src/model/defaults';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const box = { x: 0, y: 0, w: 640, h: 360 };

describe('chart kinds', () => {
  it('covers every chart type in the model', () => {
    const types = new Set(CHART_KINDS.map((k) => k.type));
    for (const t of ['bar', 'col', 'line', 'pie', 'doughnut', 'area', 'scatter', 'bubble', 'radar', 'stock', 'surface', 'combo', 'histogram', 'waterfall', 'funnel', 'treemap', 'sunburst', 'boxWhisker', 'map']) expect(types.has(t as Chart['chartType'])).toBe(true);
  });
  it('round-trips gallery entries through kindOf', () => {
    for (const k of CHART_KINDS) expect(kindOf(newChart(k.id, box)).id).toBe(k.id);
  });
  it('applies combo series types and the second axis', () => {
    const c = newChart('col', box);
    applyKind(c, kindById('comboSecondary')!);
    expect(c.series.map((s) => s.type)).toEqual(['col', 'line', 'line']);
    expect(c.series[1]!.secondary).toBe(true);
    applyKind(c, kindById('pie')!);
    expect(c.series.every((s) => s.type === undefined && !s.secondary)).toBe(true);
  });
});

describe('chart rendering', () => {
  it('draws every kind without throwing and with marks', () => {
    for (const k of CHART_KINDS) for (const style of [1, 4, 8]) {
      const c = { ...newChart(k.id, box), style };
      const html = renderToStaticMarkup(createElement('svg', null, renderChart(c, DEFAULT_THEME, new Defs('t'))));
      expect(html.length, k.id).toBeGreaterThan(300);
      expect(/<(rect|path|circle|polygon|line)/.test(html), k.id).toBe(true);
    }
  });
  it('shows a hint for a chart without numbers', () => {
    const c: Chart = { ...newChart('col', box), series: [{ name: 'A', values: [] }] };
    expect(renderToStaticMarkup(createElement('svg', null, renderChart(c, DEFAULT_THEME, new Defs('t'))))).toContain('Add numbers');
  });
  it('uses the theme minor font', () => {
    const html = renderToStaticMarkup(createElement('svg', null, renderChart(newChart('col', box), { ...DEFAULT_THEME, fonts: { major: 'X', minor: 'Lato' } }, new Defs('t'))));
    expect(html).toContain('Lato');
  });
  it('makes tidy axis scales and numbers', () => {
    expect(niceScale(0, 4.5).ticks).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fmtNum(12345, true)).toBe('12.3K');
    expect(fmtNum(0.25, false, true)).toBe('25%');
  });
});

describe('palettes and styles', () => {
  it('colorful sets cycle accents and mono sets shade one accent', () => {
    expect(seriesModelColor('colorful1', 0)).toEqual({ theme: 'accent1' });
    expect(seriesModelColor('colorful2', 0)).toEqual({ theme: 'accent2' });
    expect(seriesModelColor('colorful1', 6)).toEqual({ theme: 'accent1', lum: -0.25 });
    const mono = [0, 1, 2].map((i) => seriesModelColor('mono3', i));
    expect(mono.every((c) => typeof c === 'object' && 'theme' in c && c.theme === 'accent3')).toBe(true);
    expect(COLOR_SETS.length).toBe(10);
    expect(seriesHex({ colors: 'colorful1' }, DEFAULT_THEME, 0)).toBe(DEFAULT_THEME.colors.accent1);
  });
  it('clamps the style number', () => {
    expect(styleOf({ style: 0 })).toBe(CHART_STYLES[0]);
    expect(styleOf({ style: 99 })).toBe(CHART_STYLES.at(-1));
  });
});

describe('chart data', () => {
  it('parses tab and comma tables', () => {
    expect(parseTable('a\tb\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseTable('a,b\r\n"x",3')).toEqual([['a', 'b'], ['x', '3']]);
  });
  it('round-trips the data grid', () => {
    const c = newChart('col', box);
    const g = gridOf(c);
    expect(g[0]).toEqual(['', 'Series 1', 'Series 2', 'Series 3']);
    applyGrid(c, [['', 'North', 'South'], ['Jan', '1', '2'], ['Feb', '3,000', ''], ['', '', '']]);
    expect(c.categories).toEqual(['Jan', 'Feb']);
    expect(c.series.map((s) => s.values)).toEqual([[1, 3000], [2, 0]]);
  });
  it('keeps x values and sizes for bubble charts', () => {
    const c = newChart('bubble', box);
    const g = gridOf(c);
    expect(g[0]).toEqual(['X', 'Products', 'Products size', 'Services', 'Services size']);
    applyGrid(c, [['X', 'A', 'A size'], ['1', '5', '2'], ['2', '6', '3']]);
    expect(c.series[0]).toMatchObject({ name: 'A', values: [5, 6], x: [1, 2], sizes: [2, 3] });
  });
  it('switches rows and columns', () => {
    const c = newChart('col', box);
    switchRowCol(c);
    expect(c.categories).toEqual(['Series 1', 'Series 2', 'Series 3']);
    expect(c.series.map((s) => s.name)).toEqual(['Category 1', 'Category 2', 'Category 3', 'Category 4']);
    expect(c.series[0]!.values).toEqual([4.3, 2.4, 2]);
  });
  it('gives each kind usable sample data', () => {
    for (const k of CHART_KINDS) expect(sampleData(k).series.some((s) => s.values.length > 0), k.id).toBe(true);
  });
});

describe('chart elements', () => {
  it('toggles elements and applies quick layouts', () => {
    const c = newChart('col', box);
    expect(elementOn(c, 'title')).toBe(true);
    toggleElement(c, 'title');
    expect(c.title).toBeUndefined();
    toggleElement(c, 'axisTitles', true);
    expect(c.axes?.xTitle).toBe('Axis title');
    applyLayout(c, QUICK_LAYOUTS[5]!.el);
    expect([elementOn(c, 'legend'), elementOn(c, 'labels'), elementOn(c, 'gridlines'), elementOn(c, 'axisTitles')]).toEqual([false, true, false, false]);
  });
});

describe('placement', () => {
  it('fills an empty chart or content placeholder, else centres', () => {
    const s = new FrameStore(newDeck());
    const obj = s.deck.masters[0]!.layouts.find((l) => l.type === 'obj')!;
    s.deck.slides[0]!.layout = obj.id;
    s.deck.slides[0]!.shapes = [{ id: 'b', kind: 'shape', geom: 'rect', name: 'B', x: 88, y: 192, w: 1104, h: 457, ph: { type: 'body', idx: 1 }, text: { paras: [{ runs: [] }] } }];
    const p = placement(s, 760, 440, ['chart', 'obj', 'body']);
    expect(p.replace).toBe('b');
    insertShape(s, 'Insert chart', newChart('pie', p), p);
    const shapes = s.deck.slides[0]!.shapes;
    expect(shapes.length).toBe(1);
    expect(shapes[0]).toMatchObject({ kind: 'chart', ph: { type: 'body', idx: 1 }, x: 88 });
    expect(s.sel).toEqual([shapes[0]!.id]);
    const q = placement(s, 760, 440, ['chart']);
    expect(q.replace).toBeUndefined();
    expect(q.x).toBe(Math.round((1280 - 760) / 2));
    s.undo();
    expect(s.deck.slides[0]!.shapes[0]!.kind).toBe('shape');
  });
});
