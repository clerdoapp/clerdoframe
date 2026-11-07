import { useState } from 'react';
import {
  AlignCenterVertical, AlignEndVertical, AlignStartVertical, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, Columns3, Grid2x2, Merge, Paintbrush, Rows3, Split, SquareDashed,
  Table2, Trash2, type LucideIcon,
} from 'lucide-react';
import { registerCanvasLayer, registerPanelSection, registerTool, type ToolHandler } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { Color, Line, Table } from '../../model/deck';
import { css } from '../../render/color';
import { Btn, Check, ColorButton, NumberField, Row, S, Select } from '../../ui/kit';
import { activeTable, insertTable, setTableSel, tableChange, tableRange, type TableSel } from './commands';
import { applyTableStyle, cellAt, cellLook, eachCell, expandRange, newTable, setBorders, setColWidth, setRowHeight, setShading, TABLE_STYLES, type BorderKind, type TableOpts } from './table';
import { Pop } from './ui';

const PT = 96 / 72;

/** Small picture of a table style, drawn from the same rules the style applies. */
const StylePreview = ({ store, id, opts }: { store: FrameStore; id: string; opts: TableOpts }) => {
  const theme = (store.slide ? store.masterOf(store.slide).master : store.deck.masters[0]!).theme;
  const t: Table = { ...newTable(5, 5, 0, 0, 60, 8), style: id, opts };
  const cw = 12, rh = 8;
  const line = (l: Line | undefined) => (l && l.fill.type === 'solid' && l.width > 0 ? css(l.fill.color, { theme }) : null);
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const lk = cellLook(t, r, c);
    const fill = lk.fill?.type === 'solid' ? css(lk.fill.color, { theme }) : '#ffffff';
    const x = 2 + c * cw, y = 2 + r * rh;
    cells.push(<rect key={`f${r}-${c}`} x={x} y={y} width={cw} height={rh} fill={fill} />);
    const b = lk.borders;
    const L = line(b.l), R = line(b.r), T = line(b.t), B = line(b.b);
    if (T) cells.push(<line key={`t${r}-${c}`} x1={x} y1={y} x2={x + cw} y2={y} stroke={T} strokeWidth={0.6} />);
    if (B) cells.push(<line key={`b${r}-${c}`} x1={x} y1={y + rh} x2={x + cw} y2={y + rh} stroke={B} strokeWidth={0.6} />);
    if (L) cells.push(<line key={`l${r}-${c}`} x1={x} y1={y} x2={x} y2={y + rh} stroke={L} strokeWidth={0.6} />);
    if (R) cells.push(<line key={`r${r}-${c}`} x1={x + cw} y1={y} x2={x + cw} y2={y + rh} stroke={R} strokeWidth={0.6} />);
    cells.push(<rect key={`x${r}-${c}`} x={x + 3} y={y + 3.2} width={6} height={1.4} rx={0.7} fill={lk.color ? css(lk.color, { theme }) : '#000'} opacity={0.55} />);
  }
  return <svg viewBox="0 0 64 44" aria-hidden>{cells}</svg>;
};

const BORDERS: [BorderKind, string][] = [
  ['all', 'All borders'], ['outside', 'Outside borders'], ['inside', 'Inside borders'], ['none', 'No border'], ['top', 'Top border'], ['bottom', 'Bottom border'], ['left', 'Left border'], ['right', 'Right border'],
  ['insideH', 'Inside horizontal'], ['insideV', 'Inside vertical'], ['diagDown', 'Diagonal down'], ['diagUp', 'Diagonal up'],
];

/** Icon for a border choice: a 2x2 grid with the affected lines drawn strong. */
const BorderIcon = ({ kind }: { kind: BorderKind }) => {
  const on = (k: string) => ({
    all: true, outside: ['t', 'b', 'l', 'r'].includes(k), inside: ['h', 'v'].includes(k), none: false, top: k === 't', bottom: k === 'b', left: k === 'l', right: k === 'r',
    insideH: k === 'h', insideV: k === 'v', diagDown: k === 'dd', diagUp: k === 'du',
  } as Record<BorderKind, boolean>)[kind];
  const seg = (k: string, d: string) => <path key={k} d={d} strokeWidth={on(k) ? 2 : 1} strokeDasharray={on(k) ? undefined : '1.5 1.5'} opacity={on(k) ? 1 : 0.5} />;
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      {seg('t', 'M2 2H16')}{seg('b', 'M2 16H16')}{seg('l', 'M2 2V16')}{seg('r', 'M16 2V16')}{seg('h', 'M2 9H16')}{seg('v', 'M9 2V16')}
      {kind === 'diagDown' && seg('dd', 'M2 2L16 16')}{kind === 'diagUp' && seg('du', 'M2 16L16 2')}
    </svg>
  );
};

const TableSection = ({ store: s }: { store: FrameStore }) => {
  const t = activeTable(s);
  const [pen, setPen] = useState<{ color: Color; width: number }>({ color: { theme: 'tx1' }, width: 1 });
  if (!t) return null;
  const rg = tableRange(s, t);
  const opts = t.opts ?? {};
  const setOpt = (k: keyof TableOpts, v: boolean) => tableChange(s, 'Table options', (tt) => { tt.opts = { ...(tt.opts ?? {}), [k]: v || undefined }; applyTableStyle(tt); });
  const first = t.rows[rg.r1]?.cells[rg.c1];
  const B = (id: string, icon: LucideIcon, label: string) => <Btn store={s} id={id} icon={icon} label={label} iconOnly />;
  return (
    <>
      <div className="rowx">
        <Pop label="Table style" icon={Table2} width={300}>
          {(close) => (
            <div className="tstylegal" role="listbox" aria-label="Table styles">
              {TABLE_STYLES.map((st) => (
                <button key={st.id} role="option" aria-selected={t.style === st.id} className={t.style === st.id ? 'on' : ''} title={st.name}
                  onClick={() => { tableChange(s, 'Table style', (tt) => { tt.style = st.id; applyTableStyle(tt); }); close(); }}>
                  <StylePreview store={s} id={st.id} opts={opts} />
                </button>
              ))}
            </div>
          )}
        </Pop>
        <ColorButton store={s} label="Shading" icon={Paintbrush} value={first?.fill?.type === 'solid' ? first.fill.color : undefined} none="No fill"
          onPick={(c) => tableChange(s, 'Shading', (tt, r) => { setShading(tt, r, c ? { type: 'solid', color: c } : null); return r; })} />
      </div>
      <div className="tblchecks">
        <Check label="Header row" checked={!!opts.firstRow} onChange={(v) => setOpt('firstRow', v)} />
        <Check label="First column" checked={!!opts.firstCol} onChange={(v) => setOpt('firstCol', v)} />
        <Check label="Total row" checked={!!opts.lastRow} onChange={(v) => setOpt('lastRow', v)} />
        <Check label="Last column" checked={!!opts.lastCol} onChange={(v) => setOpt('lastCol', v)} />
        <Check label="Banded rows" checked={!!opts.bandRow} onChange={(v) => setOpt('bandRow', v)} />
        <Check label="Banded columns" checked={!!opts.bandCol} onChange={(v) => setOpt('bandCol', v)} />
      </div>
      <Pop label="Borders" icon={Grid2x2} wide width={250}>
        {(close) => (
          <>
            <div className="rowx">
              <ColorButton store={s} label="Pen color" value={pen.color} onPick={(c) => c && setPen({ ...pen, color: c })} />
              <Select label="Weight" value={String(pen.width)} options={[['0.5', '½ pt'], ['1', '1 pt'], ['1.5', '1½ pt'], ['2.25', '2¼ pt'], ['3', '3 pt'], ['4.5', '4½ pt'], ['6', '6 pt']]} onChange={(v) => setPen({ ...pen, width: Number(v) })} />
            </div>
            <div className="bordergrid">
              {BORDERS.map(([k, l]) => (
                <button key={k} title={l} aria-label={l} onClick={() => {
                  tableChange(s, 'Borders', (tt, r) => { setBorders(tt, r, k, k === 'none' ? null : { fill: { type: 'solid', color: pen.color }, width: pen.width }); return r; });
                  close();
                }}><BorderIcon kind={k} /></button>
              ))}
            </div>
          </>
        )}
      </Pop>
      <Row>
        {B('table.insertRowAbove', ArrowUpToLine, 'Insert row above')}
        {B('table.insertRowBelow', ArrowDownToLine, 'Insert row below')}
        {B('table.insertColLeft', ArrowLeftToLine, 'Insert column left')}
        {B('table.insertColRight', ArrowRightToLine, 'Insert column right')}
        <Pop label="Delete" icon={Trash2} iconOnly width={190}>
          {(close) => (
            <div className="toollist" onClick={close}>
              <Btn store={s} id="table.deleteRows" label="Delete rows" wide />
              <Btn store={s} id="table.deleteCols" label="Delete columns" wide />
              <Btn store={s} id="table.delete" label="Delete table" wide />
            </div>
          )}
        </Pop>
      </Row>
      <Row>
        {B('table.selectRow', Rows3, 'Select row')}
        {B('table.selectCol', Columns3, 'Select column')}
        {B('table.selectAll', SquareDashed, 'Select table')}
        {B('table.merge', Merge, 'Merge cells')}
        {B('table.split', Split, 'Split cells')}
      </Row>
      <div className="num2 tblnum">
        <NumberField label="Height" suffix="cm" step={0.1} min={0.2} value={round((t.rows[rg.r1]?.h ?? 40) / 37.795)}
          onChange={(v) => tableChange(s, 'Row height', (tt, r) => { setRowHeight(tt, r.r1, r.r2, v * 37.795); return r; })} />
        <NumberField label="Width" suffix="cm" step={0.1} min={0.2} value={round((t.cols[rg.c1] ?? 96) / 37.795)}
          onChange={(v) => tableChange(s, 'Column width', (tt, r) => { setColWidth(tt, r.c1, r.c2, v * 37.795); return r; })} />
      </div>
      <Row>
        <Btn store={s} id="table.distributeRows" icon={Rows3} label="Distribute rows" />
        <Btn store={s} id="table.distributeCols" icon={Columns3} label="Distribute columns" />
      </Row>
      <Row>
        {(['t', 'ctr', 'b'] as const).map((v) => {
          const I = v === 't' ? AlignStartVertical : v === 'ctr' ? AlignCenterVertical : AlignEndVertical;
          const lbl = v === 't' ? 'Align top' : v === 'ctr' ? 'Center vertically' : 'Align bottom';
          return (
            <button key={v} className={`tool icon${(first?.vAlign ?? 't') === v ? ' on' : ''}`} title={lbl} aria-label={lbl}
              onClick={() => tableChange(s, 'Cell alignment', (tt, r) => { eachCell(tt, r, (c) => { c.vAlign = v; }); return r; })}>
              <I size={16} strokeWidth={S} style={{ transform: 'rotate(90deg)' }} />
            </button>
          );
        })}
        <Select label="Text direction" value={first?.text.vert ?? 'horz'} options={[['horz', 'Horizontal'], ['vert', 'Rotate 90°'], ['vert270', 'Rotate 270°'], ['wordArtVert', 'Stacked']]}
          onChange={(v) => tableChange(s, 'Text direction', (tt, r) => { eachCell(tt, r, (c) => { if (v === 'horz') delete c.text.vert; else c.text.vert = v; }); return r; })} />
      </Row>
      <Pop label="Cell margins" icon={SquareDashed} wide width={240}>
        {() => {
          const m = first?.margin ?? { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };
          const set = (k: 'l' | 't' | 'r' | 'b', v: number) => tableChange(s, 'Cell margins', (tt, r) => { eachCell(tt, r, (c) => { c.margin = { ...(c.margin ?? { l: 9.6, t: 4.8, r: 9.6, b: 4.8 }), [k]: v * PT }; }); return r; });
          return (
            <>
              <div className="rowx">
                {[['Normal', 9.6, 4.8], ['None', 0, 0], ['Narrow', 4.8, 4.8], ['Wide', 19.2, 9.6]].map(([n, h, v]) => (
                  <button key={n as string} className="stylechip" onClick={() => tableChange(s, 'Cell margins', (tt, r) => { eachCell(tt, r, (c) => { c.margin = { l: h as number, r: h as number, t: v as number, b: v as number }; }); return r; })}>{n}</button>
                ))}
              </div>
              <div className="num2">
                <NumberField label="Left" suffix="pt" value={round(m.l / PT)} min={0} onChange={(v) => set('l', v)} />
                <NumberField label="Right" suffix="pt" value={round(m.r / PT)} min={0} onChange={(v) => set('r', v)} />
                <NumberField label="Top" suffix="pt" value={round(m.t / PT)} min={0} onChange={(v) => set('t', v)} />
                <NumberField label="Bottom" suffix="pt" value={round(m.b / PT)} min={0} onChange={(v) => set('b', v)} />
              </div>
            </>
          );
        }}
      </Pop>
      <Btn store={s} id="table.unmerge" label="Unmerge cells" wide />
    </>
  );
};

const round = (n: number) => Math.round(n * 100) / 100;

// ---------- Canvas: range highlight and Shift+drag selection ----------

const tableOrigin = (t: Table) => ({ x: t.x, y: t.y });

/** Cells under a slide point, in the table's own (rotation-free) frame. */
const localCell = (t: Table, x: number, y: number) => {
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  const a = (-(t.rot ?? 0) * Math.PI) / 180;
  const dx = x - cx, dy = y - cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a) + t.w / 2, ly = dx * Math.sin(a) + dy * Math.cos(a) + t.h / 2;
  return cellAt(t, lx, ly);
};

const RangeLayer = ({ store, scale }: { store: FrameStore; scale: number }) => {
  const t = activeTable(store);
  const ts = store.ext.tableSel as TableSel | undefined;
  if (!t || !ts || ts.table !== t.id) return null;
  const rg = expandRange(t, ts);
  const x = t.cols.slice(0, rg.c1).reduce((a, b) => a + b, 0), y = t.rows.slice(0, rg.r1).reduce((a, r) => a + r.h, 0);
  const w = t.cols.slice(rg.c1, rg.c2 + 1).reduce((a, b) => a + b, 0), h = t.rows.slice(rg.r1, rg.r2 + 1).reduce((a, r) => a + r.h, 0);
  const o = tableOrigin(t);
  const rot = t.rot ? `rotate(${t.rot} ${t.w / 2} ${t.h / 2})` : '';
  return (
    <g transform={`translate(${o.x} ${o.y}) ${rot}`} pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill="rgba(253,78,13,.16)" stroke="#fd4e0d" strokeWidth={2 / scale} />
    </g>
  );
};

/** Shift+click (or Shift+drag) over a selected table extends the cell range. Installed on the canvas root. */
let dragAnchor: { table: string; r: number; c: number } | null = null;
const svgPoint = (svg: SVGSVGElement, e: PointerEvent) => {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
};
let installed = false;
const installRangeHandlers = (store: FrameStore) => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerdown', (e) => {
    const t = activeTable(store);
    const svg = (e.target as Element | null)?.closest?.('.canvas')?.querySelector('svg');
    if (!t || !svg || !(e.target as Element).closest('.canvas')) { dragAnchor = null; return; }
    const p = svgPoint(svg, e);
    const cell = p && localCell(t, p.x, p.y);
    if (!cell) { dragAnchor = null; return; }
    if (e.shiftKey) {
      const cur = tableRange(store, t);
      const base = (store.ext.tableSel as TableSel | undefined)?.table === t.id ? { r: cur.r1, c: cur.c1 } : store.editing?.cell ?? { r: cell.r, c: cell.c };
      setTableSel(store, t, { r1: base.r, c1: base.c, r2: cell.r, c2: cell.c });
      dragAnchor = { table: t.id, ...base };
      e.preventDefault();
      e.stopPropagation();
    } else dragAnchor = { table: t.id, ...cell };
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!dragAnchor || !(e.buttons & 1)) return;
    const t = activeTable(store);
    if (!t || t.id !== dragAnchor.table) return;
    const svg = document.querySelector('.canvas svg') as SVGSVGElement | null;
    const p = svg && svgPoint(svg, e);
    const cell = p && localCell(t, p.x, p.y);
    if (!cell) return;
    if (cell.r === dragAnchor.r && cell.c === dragAnchor.c && !(store.ext.tableSel as TableSel | undefined)) return;
    // Dragging across cells while editing turns into a range selection.
    if (store.editing?.shape === t.id || (store.ext.tableSel as TableSel | undefined)?.table === t.id) {
      setTableSel(store, t, { r1: dragAnchor.r, c1: dragAnchor.c, r2: cell.r, c2: cell.c });
      window.getSelection?.()?.removeAllRanges();
    }
  }, true);
  window.addEventListener('pointerup', () => { dragAnchor = null; }, true);
};

// ---------- Draw table tool ----------

let draft: { x0: number; y0: number; x1: number; y1: number } | null = null;
const drawTableTool: ToolHandler = {
  id: 'insert.drawTable', match: (t) => t === 'table', cursor: 'crosshair',
  down: (_s, p) => { draft = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; },
  move: (s, p) => { if (draft) { draft.x1 = p.x; draft.y1 = p.y; s.emit(); } },
  up: (s, p) => {
    if (!draft) return;
    draft.x1 = p.x; draft.y1 = p.y;
    const d = draft;
    draft = null;
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    s.tool = null;
    if (w < 16 || h < 16) { s.emit(); return; }
    const cols = Math.max(1, Math.round(w / 120)), rows = Math.max(1, Math.round(h / 40));
    insertTable(s, rows, cols, { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w, h });
  },
  preview: () => {
    if (!draft) return null;
    const x = Math.min(draft.x0, draft.x1), y = Math.min(draft.y0, draft.y1), w = Math.abs(draft.x1 - draft.x0), h = Math.abs(draft.y1 - draft.y0);
    const cols = Math.max(1, Math.round(w / 120)), rows = Math.max(1, Math.round(h / 40));
    return (
      <g pointerEvents="none" stroke="#fd4e0d" fill="none">
        <rect x={x} y={y} width={w} height={h} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {Array.from({ length: cols - 1 }, (_, i) => <line key={`c${i}`} x1={x + ((i + 1) * w) / cols} y1={y} x2={x + ((i + 1) * w) / cols} y2={y + h} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />)}
        {Array.from({ length: rows - 1 }, (_, i) => <line key={`r${i}`} x1={x} y1={y + ((i + 1) * h) / rows} x2={x + w} y2={y + ((i + 1) * h) / rows} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />)}
      </g>
    );
  },
};

export const registerTableUi = (): void => {
  registerPanelSection({ tab: 'home', title: 'Table', order: -10, when: (s) => !!activeTable(s), render: (s) => <TableSection store={s} /> });
  registerPanelSection({ tab: 'insert', title: 'Table', order: 15, when: (s) => !!activeTable(s), render: (s) => <TableSection store={s} /> });
  registerCanvasLayer({
    id: 'insert.tableRange', order: 20,
    render: (s, scale) => { installRangeHandlers(s); return <RangeLayer store={s} scale={scale} />; },
  });
  registerTool(drawTableTool);
};
