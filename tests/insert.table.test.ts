import { describe, expect, it } from 'vitest';
import { anchorOf, cellAt, deleteCols, deleteRows, distributeCols, expandRange, insertCol, insertRow, mergeCells, newTable, setBorders, splitCell, stepCell, TABLE_STYLES, applyTableStyle, unmerge } from '../src/features/insert/table';
import type { Table } from '../src/model/deck';

const check = (t: Table) => {
  for (const row of t.rows) expect(row.cells.length).toBe(t.cols.length);
  // Every grid slot is covered exactly once.
  const seen = new Set<string>();
  t.rows.forEach((row, r) => row.cells.forEach((c, ci) => {
    if (c.hMerge || c.vMerge) return;
    for (let i = 0; i < (c.rowSpan ?? 1); i++) for (let j = 0; j < (c.gridSpan ?? 1); j++) {
      const k = `${r + i},${ci + j}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
  }));
  expect(seen.size).toBe(t.rows.length * t.cols.length);
  expect(t.w).toBeCloseTo(t.cols.reduce((a, b) => a + b, 0));
};

describe('tables', () => {
  it('creates a styled table', () => {
    const t = newTable(3, 4, 0, 0, 400);
    check(t);
    expect(t.rows[0]!.cells[0]!.fill?.type).toBe('solid');
    expect(t.rows[0]!.cells[0]!.text.paras[0]!.style?.defRun?.bold).toBe(true);
  });
  it('every style produces a look', () => {
    const t = newTable(4, 4, 0, 0, 400);
    t.opts = { firstRow: true, lastRow: true, firstCol: true, lastCol: true, bandRow: true, bandCol: true };
    for (const s of TABLE_STYLES) { t.style = s.id; applyTableStyle(t); check(t); }
    expect(TABLE_STYLES.length).toBeGreaterThanOrEqual(20);
  });
  it('inserts and deletes rows and columns', () => {
    const t = newTable(3, 3, 0, 0, 300);
    insertRow(t, 1); insertCol(t, 3);
    expect(t.rows.length).toBe(4); expect(t.cols.length).toBe(4); check(t);
    expect(deleteRows(t, 0, 1)).toBe(true); expect(deleteCols(t, 1, 1)).toBe(true);
    expect(t.rows.length).toBe(2); expect(t.cols.length).toBe(3); check(t);
    expect(deleteRows(t, 0, 1)).toBe(false);
  });
  it('merges, keeps merges through edits, and splits', () => {
    const t = newTable(4, 4, 0, 0, 400);
    t.rows[1]!.cells[1]!.text = { paras: [{ runs: [{ text: 'A' }] }] };
    t.rows[2]!.cells[2]!.text = { paras: [{ runs: [{ text: 'B' }] }] };
    mergeCells(t, { r1: 1, c1: 1, r2: 2, c2: 2 });
    check(t);
    expect(t.rows[1]!.cells[1]!.text.paras.map((p) => p.runs[0]?.text)).toEqual(['A', 'B']);
    expect(anchorOf(t, 2, 2)).toEqual({ r: 1, c: 1 });
    expect(cellAt(t, 250, 60)).toEqual({ r: 1, c: 1 });
    expect(expandRange(t, { r1: 0, c1: 0, r2: 1, c2: 1 })).toEqual({ r1: 0, c1: 0, r2: 2, c2: 2 });
    insertRow(t, 2); check(t); expect(t.rows[1]!.cells[1]!.rowSpan).toBe(3);
    insertCol(t, 2); check(t); expect(t.rows[1]!.cells[1]!.gridSpan).toBe(3);
    deleteRows(t, 1, 1); check(t);
    deleteCols(t, 0, 0); check(t);
    unmerge(t, { r1: 0, c1: 0, r2: t.rows.length - 1, c2: t.cols.length - 1 }); check(t);
  });
  it('splits a plain cell into a grid', () => {
    const t = newTable(2, 2, 0, 0, 200);
    splitCell(t, 0, 0, 2, 3);
    check(t);
    expect(t.cols.length).toBe(4);
    expect(t.rows.length).toBe(3);
    expect(t.rows[0]!.cells[1]!.gridSpan ?? 1).toBe(1);
    expect(t.rows[2]!.cells[0]!.gridSpan).toBe(3);
  });
  it('steps through cells and sets borders', () => {
    const t = newTable(2, 2, 0, 0, 200);
    mergeCells(t, { r1: 0, c1: 0, r2: 0, c2: 1 });
    expect(stepCell(t, 0, 0, 1)).toEqual({ r: 1, c: 0 });
    expect(stepCell(t, 1, 1, 1)).toBeNull();
    setBorders(t, { r1: 0, c1: 0, r2: 1, c2: 1 }, 'outside', { fill: { type: 'solid', color: '#FF0000' }, width: 3 });
    expect(t.rows[1]!.cells[1]!.borders?.r?.width).toBe(3);
    distributeCols(t, 0, 1); check(t);
  });
});
