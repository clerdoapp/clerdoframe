/**
 * Reads tables from spreadsheet files for linked charts and tables: CSV / TSV text and the first
 * (or any) worksheet of an .xlsx workbook (shared strings, inline strings, numbers, booleans and
 * cached formula results). Files are untrusted: sizes are capped and nothing is evaluated.
 */
import { strFromU8, unzipSync } from 'fflate';
import { attr, kid, kids, parseRoot, type XNode } from '../../formats/xml';

export interface SheetData { name: string; rows: string[][] }
export interface CellRange { r1: number; c1: number; r2: number; c2: number }

const MAX_ROWS = 5000, MAX_COLS = 200;

// ---------- Delimited text ----------

/** Splits CSV / TSV text into rows, honouring quotes. The delimiter is guessed when not given. */
export const parseDelimited = (text: string, delim?: string): string[][] => {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const d = delim ?? ([['\t', 0], [';', 0], [',', 0]] as [string, number][])
    .map(([c]) => [c, firstLine.split(c).length] as [string, number]).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') q = true;
    else if (ch === d) { row.push(cell); cell = ''; if (row.length > MAX_COLS) row.length = MAX_COLS; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
      if (rows.length >= MAX_ROWS) return rows;
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
};

// ---------- Workbooks ----------

const colIndex = (letters: string): number => [...letters.toUpperCase()].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1;
export const colLetter = (c: number): string => { let s = '', n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const parseCell = (ref: string): { r: number; c: number } | null => {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(ref.trim());
  return m ? { c: colIndex(m[1]!), r: Number(m[2]) - 1 } : null;
};

export const parseRange = (s: string): CellRange | null => {
  const [a, b] = s.replace(/^.*!/, '').split(':');
  const p = a ? parseCell(a) : null;
  const q = b ? parseCell(b) : p;
  if (!p || !q) return null;
  return { r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) };
};
export const rangeRef = (r: CellRange): string => `${colLetter(r.c1)}${r.r1 + 1}:${colLetter(r.c2)}${r.r2 + 1}`;

const textOf = (n: XNode | undefined): string => {
  if (!n) return '';
  // Phonetic runs (rPh) are reading aids, not cell text.
  if (n.name === 'rPh' || n.name === 'phoneticPr') return '';
  if (n.name === 't') return n.text;
  return n.children.map(textOf).join('');
};

const resolveTarget = (base: string, target: string): string => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};

/** Every worksheet of an .xlsx file, as text grids. */
export const readXlsxSheets = (data: Uint8Array): SheetData[] => {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => /^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/i.test(f.name) && f.originalSize < 200 * 1024 * 1024 });
  } catch { throw new Error('This file is not a workbook.'); }
  const get = (p: string) => { const k = Object.keys(files).find((x) => x.toLowerCase() === p.toLowerCase()); return k ? strFromU8(files[k]!) : undefined; };
  const wb = get('xl/workbook.xml');
  if (!wb) throw new Error('This file is not a workbook.');
  const rels = new Map<string, string>();
  const relSrc = get('xl/_rels/workbook.xml.rels');
  if (relSrc) for (const r of parseRoot(relSrc).children) { const id = attr(r, 'Id'), t = attr(r, 'Target'); if (id && t) rels.set(id, resolveTarget('xl/workbook.xml', t)); }
  const ssSrc = get('xl/sharedStrings.xml');
  const strings = ssSrc ? kids(parseRoot(ssSrc), 'si').map(textOf) : [];
  const out: SheetData[] = [];
  kids(kid(parseRoot(wb), 'sheets'), 'sheet').forEach((s, i) => {
    const rid = attr(s, 'r:id') ?? Object.entries(s.attrs).find(([k]) => k.endsWith(':id'))?.[1];
    const path = (rid && rels.get(rid)) ?? `xl/worksheets/sheet${i + 1}.xml`;
    const src = get(path);
    if (!src) return;
    out.push({ name: (attr(s, 'name') ?? `Sheet${i + 1}`).slice(0, 100), rows: readSheet(parseRoot(src), strings) });
  });
  if (!out.length) throw new Error('This workbook has no worksheets.');
  return out;
};

const readSheet = (ws: XNode, strings: string[]): string[][] => {
  const rows: string[][] = [];
  let ri = -1;
  for (const row of kids(kid(ws, 'sheetData'), 'row')) {
    const rn = Number(attr(row, 'r'));
    ri = Number.isFinite(rn) && rn > 0 ? rn - 1 : ri + 1;
    if (ri >= MAX_ROWS) break;
    const cells: string[] = [];
    let ci = -1;
    for (const c of kids(row, 'c')) {
      const p = parseCell(attr(c, 'r') ?? '');
      ci = p ? p.c : ci + 1;
      if (ci >= MAX_COLS) break;
      const t = attr(c, 't') ?? 'n';
      const v = kid(c, 'v')?.text;
      let s = '';
      if (t === 'inlineStr') s = textOf(kid(c, 'is'));
      else if (v !== undefined) {
        if (t === 's') s = strings[Number(v)] ?? '';
        else if (t === 'b') s = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'e') s = '';
        else s = v;
      }
      cells[ci] = s;
    }
    rows[ri] = Array.from({ length: cells.length }, (_, k) => cells[k] ?? '');
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
};

/** Reads a picked file: .xlsx as workbook sheets, anything else as delimited text. */
export const readSheets = (name: string, data: Uint8Array): SheetData[] => {
  if (/\.xlsx$|\.xlsm$/i.test(name) || (data[0] === 0x50 && data[1] === 0x4b)) return readXlsxSheets(data);
  const text = new TextDecoder().decode(data.subarray(0, 50 * 1024 * 1024));
  return [{ name: name.replace(/\.[a-z0-9]+$/i, '') || 'Data', rows: parseDelimited(text, /\.tsv$/i.test(name) ? '\t' : undefined) }];
};

// ---------- Finding the table ----------

const filled = (v: string | undefined) => v !== undefined && v.trim() !== '';

/** The first table on a sheet: from the first filled cell, across the header row and down to the first empty row. */
export const detectTable = (rows: string[][]): CellRange | null => {
  let r1 = -1, c1 = -1;
  for (let r = 0; r < rows.length && r1 < 0; r++) {
    const c = (rows[r] ?? []).findIndex(filled);
    if (c >= 0) { r1 = r; c1 = c; }
  }
  if (r1 < 0) return null;
  // A blank top-left corner over a column of labels is common: start one column left of the header then.
  if (c1 > 0 && filled(rows[r1 + 1]?.[c1 - 1]) && !filled(rows[r1]?.[c1 - 1])) c1--;
  let c2 = c1;
  const head = rows[r1] ?? [];
  const second = rows[r1 + 1] ?? [];
  while (c2 + 1 < Math.max(head.length, second.length) && (filled(head[c2 + 1]) || filled(second[c2 + 1]))) c2++;
  let r2 = r1;
  while (r2 + 1 < rows.length && (rows[r2 + 1] ?? []).slice(c1, c2 + 1).some(filled)) r2++;
  return { r1, c1, r2, c2 };
};

export const cellsOf = (rows: string[][], rg: CellRange): string[][] => {
  const out: string[][] = [];
  for (let r = rg.r1; r <= Math.min(rg.r2, rg.r1 + MAX_ROWS - 1); r++) {
    const row = rows[r] ?? [];
    out.push(Array.from({ length: Math.min(MAX_COLS, rg.c2 - rg.c1 + 1) }, (_, k) => row[rg.c1 + k] ?? ''));
  }
  return out;
};

const num = (s: string | undefined): number => {
  if (!s) return 0;
  const n = Number(s.replace(/[\s,]/g, '').replace(/%$/, ''));
  return Number.isFinite(n) ? (s.trim().endsWith('%') ? n / 100 : n) : 0;
};
const isNum = (s: string | undefined) => !!s && s.trim() !== '' && Number.isFinite(Number(s.replace(/[\s,]/g, '').replace(/%$/, '')));

/**
 * Chart data from a table: the header row names the series and the first column holds the
 * categories. A header row of numbers is treated as data (series get default names).
 */
export const chartData = (cells: string[][]): { categories: string[]; series: { name: string; values: number[] }[] } => {
  if (!cells.length || !cells.some((r) => r.some(isNum))) return { categories: [], series: [] };
  const width = Math.max(...cells.map((r) => r.length));
  const headIsData = cells[0]!.slice(1).every((v) => !v.trim() || isNum(v)) && cells[0]!.slice(1).some(isNum);
  const firstColLabels = cells.slice(headIsData ? 0 : 1).some((r) => r[0] && !isNum(r[0])) || width === 1;
  const body = headIsData ? cells : cells.slice(1);
  const c0 = firstColLabels && width > 1 ? 1 : 0;
  const categories = body.map((r, i) => (c0 ? (r[0] ?? '').trim() : '') || `Category ${i + 1}`);
  const series = [] as { name: string; values: number[] }[];
  if (!body.length) return { categories: [], series };
  for (let c = c0; c < width; c++) {
    if (!body.some((r) => isNum(r[c]))) continue;
    const name = headIsData ? `Series ${series.length + 1}` : (cells[0]![c] ?? '').trim() || `Series ${series.length + 1}`;
    series.push({ name, values: body.map((r) => num(r[c])) });
  }
  return { categories, series };
};

/** The first sheet whose first table holds numbers (else the first sheet). */
export const bestSheet = (sheets: SheetData[]): number => {
  const i = sheets.findIndex((s) => { const rg = detectTable(s.rows); return !!rg && chartData(cellsOf(s.rows, rg)).series.length > 0; });
  return Math.max(0, i);
};
