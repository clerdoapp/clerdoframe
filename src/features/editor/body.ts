import type { FrameStore, TextEdit } from '../../app/store';
import type { AutoShape, Paragraph, Shape, Table, TableCell, TextBody } from '../../model/deck';
import { contextFor } from '../../render/SlideView';
import type { RenderCtx } from '../../render/inherit';

/** Finding and writing the text body being edited (a shape's text or a table cell's). */

export const renderCtx = (store: FrameStore): RenderCtx => {
  const s = store.surface();
  if (s?.kind === 'slide') return contextFor(store.deck, s.slide, { prompts: false });
  if (s?.kind === 'layout') return contextFor(store.deck, null, { layout: s.layout, master: s.master, prompts: false });
  return contextFor(store.deck, null, { master: s?.kind === 'master' ? s.master : store.deck.masters[0]!, prompts: false });
};

/** A render context in which `copy` stands in for the original shape on a layout or master, so inheritance still resolves. */
export const ctxWith = (ctx: RenderCtx, original: Shape, copy: Shape): RenderCtx => {
  const swap = (list: Shape[]) => (list.includes(original) ? list.map((x) => (x === original ? copy : x)) : list);
  return {
    ...ctx,
    layout: ctx.layout ? { ...ctx.layout, shapes: swap(ctx.layout.shapes) } : null,
    master: { ...ctx.master, shapes: swap(ctx.master.shapes) },
  };
};

export const cellPseudoId = (table: string, r: number, c: number): string => `${table}:${r}:${c}`;

export interface BodyTarget {
  /** The shape that owns the text (the table for cells). */
  owner: Shape;
  /** The shape the text renders as (a pseudo shape for cells). */
  shape: AutoShape;
  body: TextBody;
  cell?: TableCell;
}

const DEFAULT_MARGIN = { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };

export const cellPseudo = (t: Table, r: number, c: number, cell: TableCell): AutoShape => {
  const cellW = t.cols.slice(c, c + (cell.gridSpan ?? 1)).reduce((a, b) => a + b, 0);
  const cellH = t.rows.slice(r, r + (cell.rowSpan ?? 1)).reduce((a, b) => a + b.h, 0);
  return {
    id: cellPseudoId(t.id, r, c), kind: 'shape', geom: 'rect', name: '', x: 0, y: 0, w: cellW, h: cellH,
    text: { ...cell.text, inset: cell.margin ?? DEFAULT_MARGIN, vAlign: cell.vAlign ?? 't' },
  };
};

/** The text body for an edit target, creating an empty one on shapes that have none. */
export const targetOf = (store: FrameStore, edit: TextEdit, create = false): BodyTarget | null => {
  const owner = store.shape(edit.shape);
  if (!owner) return null;
  if (owner.kind === 'table' && edit.cell) {
    const cell = owner.rows[edit.cell.r]?.cells[edit.cell.c];
    if (!cell) return null;
    if (!cell.text) { if (!create) return null; cell.text = { paras: [{ runs: [] }] }; }
    if (!cell.text.paras.length) cell.text.paras.push({ runs: [] });
    return { owner, shape: cellPseudo(owner, edit.cell.r, edit.cell.c, cell), body: cell.text, cell };
  }
  if (owner.kind !== 'shape') return null;
  if (!owner.text) {
    if (!create) return { owner, shape: owner, body: { paras: [{ runs: [] }] } };
    owner.text = { paras: [{ runs: [] }] };
  }
  if (!owner.text.paras.length) owner.text.paras.push({ runs: [] });
  return { owner, shape: owner, body: owner.text };
};

export const parasOf = (store: FrameStore, edit: TextEdit): Paragraph[] => targetOf(store, edit)?.body.paras ?? [{ runs: [] }];

/** Every text body of a shape (all table cells, group children). */
export const bodiesOf = (s: Shape, cells?: { r1: number; c1: number; r2: number; c2: number } | null, create = false): { shape: AutoShape; body: TextBody; owner: Shape }[] => {
  if (s.kind === 'shape') {
    if (!canHoldText(s)) return [];
    if (create) s.text ??= { paras: [{ runs: [] }] };
    return [{ shape: s, body: s.text ?? { paras: [{ runs: [] }] }, owner: s }];
  }
  if (s.kind === 'group') return s.children.flatMap((c) => bodiesOf(c, null, create));
  if (s.kind === 'table') {
    const out: { shape: AutoShape; body: TextBody; owner: Shape }[] = [];
    s.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
      if (cell.hMerge || cell.vMerge) return;
      if (cells && (r < cells.r1 || r > cells.r2 || c < cells.c1 || c > cells.c2)) return;
      if (create) cell.text ??= { paras: [{ runs: [] }] };
      out.push({ shape: cellPseudo(s, r, c, cell), body: cell.text ?? { paras: [{ runs: [] }] }, owner: s });
    }));
    return out;
  }
  return [];
};

export const canHoldText = (s: Shape | null | undefined): boolean =>
  !!s && ((s.kind === 'shape' && !/Connector|^line$|^lineInv$|^arc$/.test(s.geom || 'rect')) || s.kind === 'table');
