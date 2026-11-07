import type { Chart, ChartSeries } from '../../model/deck';

/** Swaps series and categories (rows and columns of the data grid). */
export const switchRowCol = (c: Chart): void => {
  const n = Math.max(c.categories.length, ...c.series.map((s) => s.values.length));
  const cats = c.series.map((s, i) => s.name || `Series ${i + 1}`);
  const series: ChartSeries[] = Array.from({ length: n }, (_, i) => ({ name: c.categories[i] ?? `Category ${i + 1}`, values: c.series.map((s) => s.values[i] ?? NaN) }));
  c.categories = cats;
  c.series = series.map((s) => ({ ...s, values: s.values.map((v) => (Number.isFinite(v) ? v : 0)) }));
};

/** Parses tab- or comma-separated text into a grid of strings. */
export const parseTable = (text: string): string[][] => {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) && !lines.some((l) => l.includes(',')) ? ';' : ',';
  return lines.map((l) => l.split(sep).map((x) => x.trim().replace(/^"(.*)"$/, '$1')));
};

const toNum = (s: string | undefined): number => {
  if (s === undefined) return 0;
  const t = s.replace(/[,\s$€£%]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

/** A data grid: row 0 is [corner, series names…]; each next row is [category, values…]. */
export type Grid = string[][];

export const gridOf = (c: Chart): Grid => {
  const n = Math.max(c.categories.length, ...c.series.map((s) => s.values.length), 1);
  const xy = c.chartType === 'scatter' || c.chartType === 'bubble';
  const head = [xy ? 'X' : '', ...c.series.flatMap((s) => (c.chartType === 'bubble' ? [s.name, `${s.name} size`] : [s.name]))];
  const rows: Grid = [head];
  for (let i = 0; i < n; i++) {
    const first = xy ? String(c.series[0]?.x?.[i] ?? i + 1) : c.categories[i] ?? '';
    rows.push([first, ...c.series.flatMap((s) => {
      const v = s.values[i];
      const cell = v === undefined || !Number.isFinite(v) ? '' : String(v);
      return c.chartType === 'bubble' ? [cell, s.sizes?.[i] === undefined ? '' : String(s.sizes[i])] : [cell];
    })]);
  }
  return rows;
};

/** Writes a grid back into the chart, keeping series colours and settings by position. */
export const applyGrid = (c: Chart, g: Grid): void => {
  const head = g[0] ?? [''];
  const body = g.slice(1).filter((r) => r.some((x) => x.trim() !== ''));
  const xy = c.chartType === 'scatter' || c.chartType === 'bubble';
  const step = c.chartType === 'bubble' ? 2 : 1;
  const series: ChartSeries[] = [];
  for (let col = 1, k = 0; col < head.length; col += step, k++) {
    const old = c.series[k];
    const s: ChartSeries = { ...(old ?? {}), name: (head[col] ?? '').trim() || `Series ${k + 1}`, values: body.map((r) => toNum(r[col])) };
    if (xy) s.x = body.map((r, i) => (r[0]?.trim() ? toNum(r[0]) : i + 1)); else delete s.x;
    if (c.chartType === 'bubble') s.sizes = body.map((r) => toNum(r[col + 1]) || 1); else delete s.sizes;
    series.push(s);
  }
  c.series = series;
  c.categories = xy ? [] : body.map((r) => r[0] ?? '');
};

/** Quick layouts: which chart elements are on. */
export interface Elements { title: boolean; legend: Chart['legend']; labels: boolean; gridlines: boolean; axisTitles: boolean }
export const QUICK_LAYOUTS: { label: string; el: Elements }[] = [
  { label: 'Title and legend', el: { title: true, legend: 'b', labels: false, gridlines: true, axisTitles: false } },
  { label: 'Legend on the right', el: { title: true, legend: 'r', labels: false, gridlines: true, axisTitles: false } },
  { label: 'Values on marks', el: { title: true, legend: 'b', labels: true, gridlines: false, axisTitles: false } },
  { label: 'Axis titles', el: { title: true, legend: 'b', labels: false, gridlines: true, axisTitles: true } },
  { label: 'Legend on top', el: { title: false, legend: 't', labels: false, gridlines: true, axisTitles: false } },
  { label: 'Minimal', el: { title: false, legend: 'none', labels: true, gridlines: false, axisTitles: false } },
];

export const applyLayout = (c: Chart, el: Elements): void => {
  if (el.title) c.title = c.title?.trim() || 'Chart title'; else delete c.title;
  c.legend = el.legend;
  c.dataLabels = el.labels;
  c.axes = { ...(c.axes ?? {}), gridlines: el.gridlines };
  if (el.axisTitles) c.axes = { ...c.axes, xTitle: c.axes.xTitle || 'Axis title', yTitle: c.axes.yTitle || 'Axis title' };
  else if (c.axes) { delete c.axes.xTitle; delete c.axes.yTitle; }
};

export type ElementKey = 'title' | 'legend' | 'labels' | 'gridlines' | 'axisTitles';
export const elementOn = (c: Chart, k: ElementKey): boolean => {
  switch (k) {
    case 'title': return !!c.title?.trim();
    case 'legend': return (c.legend ?? 'b') !== 'none';
    case 'labels': return !!c.dataLabels;
    case 'gridlines': return c.axes?.gridlines !== false;
    case 'axisTitles': return !!(c.axes?.xTitle || c.axes?.yTitle);
  }
};

export const toggleElement = (c: Chart, k: ElementKey, on = !elementOn(c, k)): void => {
  switch (k) {
    case 'title': if (on) c.title = 'Chart title'; else delete c.title; break;
    case 'legend': c.legend = on ? 'b' : 'none'; break;
    case 'labels': c.dataLabels = on; break;
    case 'gridlines': c.axes = { ...(c.axes ?? {}), gridlines: on }; break;
    case 'axisTitles':
      c.axes = { ...(c.axes ?? {}) };
      if (on) { c.axes.xTitle = 'Axis title'; c.axes.yTitle = 'Axis title'; } else { delete c.axes.xTitle; delete c.axes.yTitle; }
      break;
  }
};
