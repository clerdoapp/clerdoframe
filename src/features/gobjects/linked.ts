/** Charts and tables made from spreadsheet files, and reading a linked chart's data again. */
import type { FrameStore } from '../../app/store';
import { textBody, type Chart, type Table } from '../../model/deck';
import { newChart } from '../charts/sample';
import { insertShape, placement } from '../charts/place';
import { newTable } from '../insert/table';
import { cellsOf, chartData, detectTable, parseRange, rangeRef, readSheets, type SheetData } from './sheet';

export interface Picked { name: string; sheets: SheetData[] }

/** Opens a file picker for spreadsheet files and reads the one chosen. */
export const pickSheetFile = (): Promise<Picked | null> => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.tsv,.txt,.xlsx,.xlsm,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  input.style.display = 'none';
  let done = false;
  const end = (v: Picked | null) => { if (done) return; done = true; input.remove(); resolve(v); };
  input.addEventListener('cancel', () => end(null));
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (!f) { end(null); return; }
    if (f.size > 100 * 1024 * 1024) { end(null); return; }
    void f.arrayBuffer().then((b) => {
      try { end({ name: f.name, sheets: readSheets(f.name, new Uint8Array(b)) }); } catch { end({ name: f.name, sheets: [] }); }
    }, () => end(null));
  });
  document.body.appendChild(input);
  input.click();
});

/** The cells of a sheet in a range (A1:D5), or of the first table found on it. */
export const tableCells = (sheet: SheetData, range?: string): { cells: string[][]; range: string } | null => {
  const rg = (range ? parseRange(range) : null) ?? detectTable(sheet.rows);
  if (!rg) return null;
  return { cells: cellsOf(sheet.rows, rg), range: rangeRef(rg) };
};

/** Puts table data into a chart, keeping each series' own colour and type where it still exists. */
export const fillChart = (c: Chart, cells: string[][]): void => {
  const d = chartData(cells);
  if (!d.series.length) throw new Error('No numbers were found in that range.');
  c.categories = d.categories;
  const old = c.series;
  const combo = c.chartType === 'combo';
  c.series = d.series.map((s, i) => {
    const prev = old[i];
    const keep = prev ? { ...(prev.color ? { color: prev.color } : {}), ...(prev.type ? { type: prev.type } : {}), ...(prev.secondary ? { secondary: true } : {}), ...(prev.marker ? { marker: prev.marker } : {}), ...(prev.smooth ? { smooth: true } : {}), ...(prev.labels ? { labels: true } : {}) } : {};
    return { name: s.name, values: s.values, ...keep, ...(combo && !keep.type ? { type: i === 0 ? 'col' as const : 'line' as const } : {}) };
  });
};

export const chartFromCells = (kind: string, cells: string[][], box: { x: number; y: number; w: number; h: number }, link: Chart['dataLink']): Chart => {
  const c = newChart(kind, box);
  c.series = [];
  fillChart(c, cells);
  delete c.title;
  if (link) c.dataLink = link;
  c.name = 'Chart';
  return c;
};

export const tableFromCells = (cells: string[][], x: number, y: number, w: number): Table => {
  const rows = Math.max(1, Math.min(200, cells.length)), cols = Math.max(1, Math.min(60, Math.max(...cells.map((r) => r.length))));
  const t = newTable(rows, cols, x, y, w, 34);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = cells[r]?.[c] ?? '';
    const cell = t.rows[r]!.cells[c]!;
    if (v) cell.text = textBody(v);
  }
  return t;
};

export const insertChartFromCells = (store: FrameStore, kind: string, cells: string[][], link: Chart['dataLink']): boolean => {
  const p = placement(store, 760, 440, ['chart', 'obj', 'body']);
  return insertShape(store, 'Insert chart', chartFromCells(kind, cells, { x: p.x, y: p.y, w: p.w, h: p.h }, link), p);
};

export const insertTableFromCells = (store: FrameStore, cells: string[][]): boolean => {
  const p = placement(store, 860, 300, ['tbl', 'obj', 'body']);
  const t = tableFromCells(cells, p.x, p.y, p.w);
  return insertShape(store, 'Insert table', t, { ...p, h: t.h });
};

/** Picks the linked file again and re-reads the chart's sheet and range. */
export const updateLinkedChart = async (store: FrameStore, id: string): Promise<void> => {
  const ch = store.shape(id);
  if (ch?.kind !== 'chart' || !ch.dataLink) return;
  const link = ch.dataLink;
  store.notify(`Choose ${link.file} to update the chart.`);
  const f = await pickSheetFile();
  if (!f) return;
  if (!f.sheets.length) { store.notify(`${f.name} could not be read.`); return; }
  const sheet = f.sheets.find((s) => s.name === link.sheet) ?? f.sheets[0]!;
  const t = tableCells(sheet, link.range);
  if (!t) { store.notify('That file has no table to read.'); return; }
  store.tryChange('Update chart data', () => {
    const x = store.shape(id);
    if (x?.kind !== 'chart') return;
    fillChart(x, t.cells);
    x.dataLink = { file: f.name, ...(f.sheets.length > 1 || link.sheet ? { sheet: sheet.name } : {}), range: t.range };
    delete x.rawXml;
  });
  store.notify('Chart updated.');
};
