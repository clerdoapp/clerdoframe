/**
 * Table model operations: creation, styles, row/column edits, merge/split, borders. All functions
 * mutate the table passed in and are meant to run inside store.change().
 */
import { uid, type Color, type Fill, type Line, type Table, type TableCell, type ThemeColorName } from '../../model/deck';

export interface CellRange { r1: number; c1: number; r2: number; c2: number }
export type TableOpts = NonNullable<Table['opts']>;

const solid = (color: Color): Fill => ({ type: 'solid', color });
const ln = (color: Color, width = 1): Line => ({ fill: solid(color), width });
const NO_LINE: Line = { fill: { type: 'none' }, width: 0 };

export const emptyCell = (): TableCell => ({ text: { paras: [{ runs: [] }] } });

/** A new table at x,y filling width w, with the default style applied. */
export const newTable = (rows: number, cols: number, x: number, y: number, w: number, rowH = 40): Table => {
  const cw = w / cols;
  const t: Table = {
    id: uid('s'), kind: 'table', name: 'Table', x, y, w, h: rows * rowH,
    cols: Array.from({ length: cols }, () => cw),
    rows: Array.from({ length: rows }, () => ({ h: rowH, cells: Array.from({ length: cols }, emptyCell) })),
    style: 'medium2-accent1', opts: { firstRow: true, bandRow: true },
  };
  applyTableStyle(t);
  return t;
};

// ---------- Styles ----------

export interface TableStyleDef { id: string; name: string; family: 'none' | 'light' | 'medium' | 'dark' | 'grid'; accent: ThemeColorName | 'tx1' }

const ACCENTS: (ThemeColorName | 'tx1')[] = ['tx1', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
const ACC_NAME = (a: string) => (a === 'tx1' ? 'Dark' : `Accent ${a.slice(-1)}`);

export const TABLE_STYLES: TableStyleDef[] = [
  { id: 'none', name: 'No style', family: 'none', accent: 'tx1' },
  ...ACCENTS.map((a) => ({ id: `medium2-${a}`, name: `Medium, ${ACC_NAME(a)}`, family: 'medium' as const, accent: a })),
  ...ACCENTS.map((a) => ({ id: `light1-${a}`, name: `Light, ${ACC_NAME(a)}`, family: 'light' as const, accent: a })),
  ...ACCENTS.map((a) => ({ id: `grid-${a}`, name: `Grid, ${ACC_NAME(a)}`, family: 'grid' as const, accent: a })),
  ...ACCENTS.map((a) => ({ id: `dark1-${a}`, name: `Dark, ${ACC_NAME(a)}`, family: 'dark' as const, accent: a })),
];
export const tableStyle = (id: string | undefined): TableStyleDef => TABLE_STYLES.find((s) => s.id === id) ?? TABLE_STYLES[1]!;

/** Which band of the table a cell falls in, given the options. */
const role = (t: Table, r: number, c: number) => {
  const o = t.opts ?? {};
  const R = t.rows.length, C = t.cols.length;
  const header = !!o.firstRow && r === 0;
  const total = !!o.lastRow && r === R - 1 && R > 1;
  const firstCol = !!o.firstCol && c === 0;
  const lastCol = !!o.lastCol && c === C - 1 && C > 1;
  const br = r - (o.firstRow ? 1 : 0), bc = c - (o.firstCol ? 1 : 0);
  return { header, total, firstCol, lastCol, bandRow: !!o.bandRow && br >= 0 && br % 2 === 0, bandCol: !!o.bandCol && bc >= 0 && bc % 2 === 0 };
};

const col = (a: ThemeColorName | 'tx1', lum?: number): Color => (lum ? { theme: a, lum } : { theme: a });

export interface CellLook { fill?: Fill; borders: NonNullable<TableCell['borders']>; color?: Color; bold?: boolean }

/** Fill, borders and text colour a style gives a cell. */
export const cellLook = (t: Table, r: number, c: number, st = tableStyle(t.style)): CellLook => {
  const k = role(t, r, c);
  const a = st.accent;
  const white: Color = { theme: 'lt1' };
  const band = k.bandRow || k.bandCol;
  switch (st.family) {
    case 'none':
      return { borders: { l: ln({ theme: 'tx1' }), r: ln({ theme: 'tx1' }), t: ln({ theme: 'tx1' }), b: ln({ theme: 'tx1' }) }, color: { theme: 'tx1' }, ...(k.header || k.total ? { bold: true } : {}) };
    case 'medium': {
      const b = ln(white, 1);
      if (k.header) return { fill: solid(col(a)), borders: { l: b, r: b, t: b, b: ln(white, 3) }, color: white, bold: true };
      if (k.total) return { fill: solid(col(a)), borders: { l: b, r: b, t: ln(white, 3), b }, color: white, bold: true };
      if (k.firstCol || k.lastCol) return { fill: solid(col(a)), borders: { l: b, r: b, t: b, b }, color: white, bold: true };
      return { fill: solid(col(a, band ? 0.6 : 0.8)), borders: { l: b, r: b, t: b, b }, color: { theme: 'tx1' } };
    }
    case 'light': {
      const edge = ln(col(a), 1);
      const lines = { t: r === 0 ? edge : NO_LINE, b: r === t.rows.length - 1 || k.header ? edge : NO_LINE, l: NO_LINE, r: NO_LINE };
      if (k.header) return { borders: lines, color: col(a === 'tx1' ? 'tx1' : a, a === 'tx1' ? undefined : -0.25), bold: true };
      if (k.total) return { borders: { ...lines, t: edge }, color: { theme: 'tx1' }, bold: true };
      return { ...(band ? { fill: solid(col(a, 0.8)) } : {}), borders: lines, color: { theme: 'tx1' }, ...(k.firstCol || k.lastCol ? { bold: true } : {}) };
    }
    case 'grid': {
      const g = ln(col(a, a === 'tx1' ? 0.5 : 0.4), 1);
      const bs = { l: g, r: g, t: g, b: g };
      if (k.header) return { fill: solid(col(a)), borders: bs, color: white, bold: true };
      if (k.total) return { borders: { ...bs, t: ln(col(a), 2.25) }, color: { theme: 'tx1' }, bold: true };
      return { ...(band ? { fill: solid(col(a, 0.8)) } : {}), borders: bs, color: { theme: 'tx1' }, ...(k.firstCol || k.lastCol ? { bold: true } : {}) };
    }
    case 'dark': {
      const b = ln({ theme: 'dk1' }, 1);
      if (k.header) return { fill: solid({ theme: 'dk1' }), borders: { l: b, r: b, t: b, b: ln(white, 2.25) }, color: white, bold: true };
      if (k.total) return { fill: solid(col(a, -0.5)), borders: { l: b, r: b, t: ln(white, 2.25), b }, color: white, bold: true };
      if (k.firstCol || k.lastCol) return { fill: solid(col(a, -0.5)), borders: { l: b, r: b, t: b, b }, color: white, bold: true };
      return { fill: solid(col(a, band ? -0.25 : 0)), borders: { l: NO_LINE, r: NO_LINE, t: NO_LINE, b: NO_LINE }, color: white };
    }
  }
};

/** Writes the style's fills, borders and text colour into every cell. */
export const applyTableStyle = (t: Table): void => {
  const st = tableStyle(t.style);
  t.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
    const look = cellLook(t, r, c, st);
    if (look.fill) cell.fill = structuredClone(look.fill); else delete cell.fill;
    cell.borders = structuredClone(look.borders);
    for (const p of cell.text.paras) {
      const def = { ...(p.style?.defRun ?? {}) };
      if (look.color) def.color = look.color; else delete def.color;
      if (look.bold) def.bold = true; else delete def.bold;
      p.style = { ...(p.style ?? {}), defRun: def };
    }
  }));
};

// ---------- Range helpers ----------

export const normRange = (r: CellRange): CellRange => ({ r1: Math.min(r.r1, r.r2), c1: Math.min(r.c1, r.c2), r2: Math.max(r.r1, r.r2), c2: Math.max(r.c1, r.c2) });
export const fullRange = (t: Table): CellRange => ({ r1: 0, c1: 0, r2: t.rows.length - 1, c2: t.cols.length - 1 });
export const eachCell = (t: Table, rg: CellRange, fn: (cell: TableCell, r: number, c: number) => void): void => {
  const n = normRange(rg);
  for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) { const cell = t.rows[r]?.cells[c]; if (cell) fn(cell, r, c); }
};

/** The cell that owns (r, c), following merges back to their anchor. */
export const anchorOf = (t: Table, r: number, c: number): { r: number; c: number } => {
  let rr = r, cc = c;
  while (cc > 0 && t.rows[rr]?.cells[cc]?.hMerge) cc--;
  while (rr > 0 && t.rows[rr]?.cells[cc]?.vMerge) rr--;
  return { r: rr, c: cc };
};

const fixSize = (t: Table): void => {
  t.w = t.cols.reduce((a, b) => a + b, 0);
  t.h = t.rows.reduce((a, b) => a + b.h, 0);
};

/** Removes merges that a structural change left inconsistent. */
const normaliseMerges = (t: Table): void => {
  const R = t.rows.length, C = t.cols.length;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const cell = t.rows[r]!.cells[c]!;
    if (cell.hMerge || cell.vMerge) continue;
    const gs = Math.min(cell.gridSpan ?? 1, C - c), rs = Math.min(cell.rowSpan ?? 1, R - r);
    if (gs > 1) cell.gridSpan = gs; else delete cell.gridSpan;
    if (rs > 1) cell.rowSpan = rs; else delete cell.rowSpan;
  }
  // Covered flags must point back to a live anchor.
  const owner = new Map<string, { r: number; c: number }>();
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const cell = t.rows[r]!.cells[c]!;
    if (cell.hMerge || cell.vMerge || owner.has(`${r},${c}`)) continue;
    for (let i = 0; i < (cell.rowSpan ?? 1); i++) for (let j = 0; j < (cell.gridSpan ?? 1); j++) if (i || j) owner.set(`${r + i},${c + j}`, { r, c });
  }
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const cell = t.rows[r]!.cells[c]!;
    const o = owner.get(`${r},${c}`);
    if (!o) { delete cell.hMerge; delete cell.vMerge; continue; }
    delete cell.gridSpan; delete cell.rowSpan;
    if (o.c !== c) cell.hMerge = true; else delete cell.hMerge;
    if (o.r !== r) cell.vMerge = true; else delete cell.vMerge;
  }
};

// ---------- Rows and columns ----------

export const insertRow = (t: Table, at: number, copyFrom = Math.max(0, Math.min(at, t.rows.length - 1))): void => {
  const src = t.rows[copyFrom];
  const cells = t.cols.map((_, c) => {
    const s = src?.cells[c];
    const cell = emptyCell();
    if (s?.margin) cell.margin = { ...s.margin };
    if (s?.vAlign) cell.vAlign = s.vAlign;
    return cell;
  });
  t.rows.splice(at, 0, { h: src?.h ?? 40, cells });
  // A merge that spans the insertion point grows.
  for (let r = 0; r < at; r++) for (const cell of t.rows[r]!.cells) if (!cell.vMerge && !cell.hMerge && (cell.rowSpan ?? 1) > at - r) cell.rowSpan = (cell.rowSpan ?? 1) + 1;
  normaliseMerges(t);
  applyTableStyle(t);
  fixSize(t);
};

export const insertCol = (t: Table, at: number): void => {
  const ref = Math.max(0, Math.min(at, t.cols.length - 1));
  const w = t.cols[ref] ?? 96;
  t.cols.splice(at, 0, w);
  for (const row of t.rows) {
    for (let c = 0; c < at; c++) { const cell = row.cells[c]!; if (!cell.hMerge && !cell.vMerge && (cell.gridSpan ?? 1) > at - c) cell.gridSpan = (cell.gridSpan ?? 1) + 1; }
    row.cells.splice(at, 0, emptyCell());
  }
  normaliseMerges(t);
  applyTableStyle(t);
  fixSize(t);
};

export const deleteRows = (t: Table, r1: number, r2: number): boolean => {
  const [a, b] = [Math.min(r1, r2), Math.max(r1, r2)];
  if (b - a + 1 >= t.rows.length) return false;
  for (let r = 0; r < a; r++) for (const cell of t.rows[r]!.cells) {
    const span = cell.rowSpan ?? 1;
    if (span > 1 && r + span > a) cell.rowSpan = Math.max(1, span - Math.min(b + 1, r + span) + a);
  }
  // Anchors inside the deleted rows hand their span to the first surviving row below.
  for (let c = 0; c < t.cols.length; c++) for (let r = a; r <= b; r++) {
    const cell = t.rows[r]!.cells[c]!;
    if (!cell.vMerge && !cell.hMerge && (cell.rowSpan ?? 1) > b - r + 1) {
      const below = t.rows[b + 1]!.cells[c]!;
      Object.assign(below, { ...structuredClone(cell), rowSpan: (cell.rowSpan ?? 1) - (b - r + 1) });
      delete below.vMerge;
    }
  }
  t.rows.splice(a, b - a + 1);
  normaliseMerges(t);
  applyTableStyle(t);
  fixSize(t);
  return true;
};

export const deleteCols = (t: Table, c1: number, c2: number): boolean => {
  const [a, b] = [Math.min(c1, c2), Math.max(c1, c2)];
  if (b - a + 1 >= t.cols.length) return false;
  for (const row of t.rows) {
    for (let c = 0; c < a; c++) {
      const cell = row.cells[c]!;
      const span = cell.gridSpan ?? 1;
      if (span > 1 && c + span > a) cell.gridSpan = Math.max(1, span - Math.min(b + 1, c + span) + a);
    }
    for (let c = a; c <= b; c++) {
      const cell = row.cells[c]!;
      if (!cell.hMerge && !cell.vMerge && (cell.gridSpan ?? 1) > b - c + 1) {
        const right = row.cells[b + 1]!;
        Object.assign(right, { ...structuredClone(cell), gridSpan: (cell.gridSpan ?? 1) - (b - c + 1) });
        delete right.hMerge;
      }
    }
    row.cells.splice(a, b - a + 1);
  }
  t.cols.splice(a, b - a + 1);
  normaliseMerges(t);
  applyTableStyle(t);
  fixSize(t);
  return true;
};

// ---------- Merge and split ----------

export const mergeCells = (t: Table, rg: CellRange): void => {
  const n = normRange(rg);
  if (n.r1 === n.r2 && n.c1 === n.c2) return;
  const anchor = t.rows[n.r1]!.cells[n.c1]!;
  const paras = [...anchor.text.paras];
  eachCell(t, n, (cell, r, c) => {
    if (r === n.r1 && c === n.c1) return;
    if (cell.text.paras.some((p) => p.runs.some((x) => x.text))) paras.push(...cell.text.paras);
    cell.text = { paras: [{ runs: [] }] };
    delete cell.gridSpan; delete cell.rowSpan;
    if (c > n.c1) cell.hMerge = true; else delete cell.hMerge;
    if (r > n.r1) cell.vMerge = true; else delete cell.vMerge;
  });
  anchor.text = { ...anchor.text, paras: paras.filter((p, i) => i === 0 || p.runs.some((x) => x.text)) };
  if (n.c2 > n.c1) anchor.gridSpan = n.c2 - n.c1 + 1; else delete anchor.gridSpan;
  if (n.r2 > n.r1) anchor.rowSpan = n.r2 - n.r1 + 1; else delete anchor.rowSpan;
};

/** Undoes merges inside the range. */
export const unmerge = (t: Table, rg: CellRange): void => {
  eachCell(t, rg, (cell) => { delete cell.gridSpan; delete cell.rowSpan; delete cell.hMerge; delete cell.vMerge; });
  normaliseMerges(t);
};

/** Splits one cell into rows x cols cells, adding grid rows/columns where needed. */
export const splitCell = (t: Table, r: number, c: number, rows: number, cols: number): void => {
  const a = anchorOf(t, r, c);
  const cell = t.rows[a.r]!.cells[a.c]!;
  let span = { r: cell.rowSpan ?? 1, c: cell.gridSpan ?? 1 };
  // Make the grid fine enough.
  while (span.c < cols) {
    const at = a.c + span.c - 1;
    const w = t.cols[at]!;
    insertCol(t, at + 1);
    t.cols[at] = w / 2; t.cols[at + 1] = w / 2;
    // Rows outside the split keep their cells whole: the cell ending at `at` widens over the new column.
    t.rows.forEach((_row, ri) => {
      if (ri >= a.r && ri < a.r + span.r) return;
      const anc = anchorOf(t, ri, at);
      if (anc.r !== ri) return;
      const ac = t.rows[anc.r]!.cells[anc.c]!;
      if (anc.c + (ac.gridSpan ?? 1) - 1 === at) ac.gridSpan = (ac.gridSpan ?? 1) + 1;
    });
    normaliseMerges(t);
    span = { ...span, c: span.c + 1 };
  }
  while (span.r < rows) {
    const at = a.r + span.r - 1;
    const h = t.rows[at]!.h;
    insertRow(t, at + 1, at);
    t.rows[at]!.h = h / 2; t.rows[at + 1]!.h = h / 2;
    for (let ci = 0; ci < t.cols.length; ci++) {
      if (ci >= a.c && ci < a.c + span.c) continue;
      const anc = anchorOf(t, at, ci);
      if (anc.c !== ci) continue;
      const ac = t.rows[anc.r]!.cells[anc.c]!;
      if (anc.r + (ac.rowSpan ?? 1) - 1 === at) ac.rowSpan = (ac.rowSpan ?? 1) + 1;
    }
    normaliseMerges(t);
    span = { ...span, r: span.r + 1 };
  }
  // Now regroup the anchor's area into rows x cols blocks.
  const rowsOf = (n: number, k: number) => Array.from({ length: k }, (_, i) => Math.floor((i * n) / k));
  const rStarts = rowsOf(span.r, rows), cStarts = rowsOf(span.c, cols);
  const text = cell.text;
  for (let i = 0; i < span.r; i++) for (let j = 0; j < span.c; j++) {
    const x = t.rows[a.r + i]!.cells[a.c + j]!;
    delete x.gridSpan; delete x.rowSpan; delete x.hMerge; delete x.vMerge;
    if (i || j) x.text = { paras: [{ runs: [] }] };
  }
  t.rows[a.r]!.cells[a.c]!.text = text;
  rStarts.forEach((rs, bi) => cStarts.forEach((cs, bj) => {
    const re = bi + 1 < rStarts.length ? rStarts[bi + 1]! : span.r;
    const ce = bj + 1 < cStarts.length ? cStarts[bj + 1]! : span.c;
    mergeCells(t, { r1: a.r + rs, c1: a.c + cs, r2: a.r + re - 1, c2: a.c + ce - 1 });
  }));
  applyTableStyle(t);
  fixSize(t);
};

// ---------- Sizes ----------

export const distributeRows = (t: Table, r1: number, r2: number): void => {
  const n = normRange({ r1, r2, c1: 0, c2: 0 });
  const total = t.rows.slice(n.r1, n.r2 + 1).reduce((a, r) => a + r.h, 0);
  for (let r = n.r1; r <= n.r2; r++) t.rows[r]!.h = total / (n.r2 - n.r1 + 1);
  fixSize(t);
};

export const distributeCols = (t: Table, c1: number, c2: number): void => {
  const n = normRange({ r1: 0, r2: 0, c1, c2 });
  const total = t.cols.slice(n.c1, n.c2 + 1).reduce((a, b) => a + b, 0);
  for (let c = n.c1; c <= n.c2; c++) t.cols[c] = total / (n.c2 - n.c1 + 1);
  fixSize(t);
};

export const setRowHeight = (t: Table, r1: number, r2: number, h: number): void => { for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) t.rows[r]!.h = Math.max(8, h); fixSize(t); };
export const setColWidth = (t: Table, c1: number, c2: number, w: number): void => { for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) t.cols[c] = Math.max(8, w); fixSize(t); };

/** Scales row heights and column widths so the table fills a new box. */
export const resizeTable = (t: Table, w: number, h: number): void => {
  const W = t.cols.reduce((a, b) => a + b, 0) || 1, H = t.rows.reduce((a, r) => a + r.h, 0) || 1;
  t.cols = t.cols.map((c) => (c * w) / W);
  for (const r of t.rows) r.h = (r.h * h) / H;
  fixSize(t);
};

// ---------- Borders ----------

export type BorderKind = 'all' | 'outside' | 'inside' | 'insideH' | 'insideV' | 'top' | 'bottom' | 'left' | 'right' | 'none' | 'diagDown' | 'diagUp';

/** Sets borders on a range. The neighbouring cell's shared edge is updated too, so the border draws once. */
export const setBorders = (t: Table, rg: CellRange, kind: BorderKind, line: Line | null): void => {
  const n = normRange(rg);
  const L = line ?? NO_LINE;
  const put = (r: number, c: number, side: 'l' | 'r' | 't' | 'b' | 'tl2br' | 'bl2tr') => {
    const cell = t.rows[r]?.cells[c];
    if (!cell) return;
    cell.borders = { ...(cell.borders ?? {}), [side]: structuredClone(L) };
    const nb = side === 'l' ? [r, c - 1, 'r'] : side === 'r' ? [r, c + 1, 'l'] : side === 't' ? [r - 1, c, 'b'] : side === 'b' ? [r + 1, c, 't'] : null;
    if (nb) {
      const other = t.rows[nb[0] as number]?.cells[nb[1] as number];
      if (other) other.borders = { ...(other.borders ?? {}), [nb[2] as string]: structuredClone(L) };
    }
  };
  for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) {
    const top = r === n.r1, bot = r === n.r2, lef = c === n.c1, rig = c === n.c2;
    switch (kind) {
      case 'all': case 'none': put(r, c, 't'); put(r, c, 'b'); put(r, c, 'l'); put(r, c, 'r'); if (kind === 'none') { put(r, c, 'tl2br'); put(r, c, 'bl2tr'); } break;
      case 'outside': if (top) put(r, c, 't'); if (bot) put(r, c, 'b'); if (lef) put(r, c, 'l'); if (rig) put(r, c, 'r'); break;
      case 'inside': if (!top) put(r, c, 't'); if (!lef) put(r, c, 'l'); break;
      case 'insideH': if (!top) put(r, c, 't'); break;
      case 'insideV': if (!lef) put(r, c, 'l'); break;
      case 'top': if (top) put(r, c, 't'); break;
      case 'bottom': if (bot) put(r, c, 'b'); break;
      case 'left': if (lef) put(r, c, 'l'); break;
      case 'right': if (rig) put(r, c, 'r'); break;
      case 'diagDown': put(r, c, 'tl2br'); break;
      case 'diagUp': put(r, c, 'bl2tr'); break;
    }
  }
};

export const setShading = (t: Table, rg: CellRange, fill: Fill | null): void => {
  eachCell(t, rg, (cell) => { if (fill) cell.fill = structuredClone(fill); else cell.fill = { type: 'none' }; });
};

/** Moves to the next/previous cell, skipping merged-over cells. Returns null past the ends. */
export const stepCell = (t: Table, r: number, c: number, dir: 1 | -1): { r: number; c: number } | null => {
  const C = t.cols.length, R = t.rows.length;
  let i = r * C + c;
  for (;;) {
    i += dir;
    if (i < 0 || i >= R * C) return null;
    const rr = Math.floor(i / C), cc = i % C;
    const cell = t.rows[rr]!.cells[cc]!;
    if (!cell.hMerge && !cell.vMerge) return { r: rr, c: cc };
  }
};

/** Cell index under a point in table-local px (including merges, which return their anchor). */
export const cellAt = (t: Table, x: number, y: number): { r: number; c: number } | null => {
  let cx = 0, c = -1, cy = 0, r = -1;
  for (let i = 0; i < t.cols.length; i++) { if (x >= cx && x < cx + t.cols[i]!) { c = i; break; } cx += t.cols[i]!; }
  for (let i = 0; i < t.rows.length; i++) { if (y >= cy && y < cy + t.rows[i]!.h) { r = i; break; } cy += t.rows[i]!.h; }
  if (r < 0 || c < 0) return null;
  return anchorOf(t, r, c);
};

/** Grows a range so it covers every merged cell it touches. */
export const expandRange = (t: Table, rg: CellRange): CellRange => {
  let n = normRange(rg);
  for (let changed = true; changed;) {
    changed = false;
    for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) {
      const a = anchorOf(t, r, c);
      const cell = t.rows[a.r]!.cells[a.c]!;
      const er = a.r + (cell.rowSpan ?? 1) - 1, ec = a.c + (cell.gridSpan ?? 1) - 1;
      if (a.r < n.r1 || a.c < n.c1 || er > n.r2 || ec > n.c2) {
        n = { r1: Math.min(n.r1, a.r), c1: Math.min(n.c1, a.c), r2: Math.max(n.r2, er), c2: Math.max(n.c2, ec) };
        changed = true;
      }
    }
  }
  return n;
};
