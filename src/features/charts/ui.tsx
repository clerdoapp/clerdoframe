import { useId, useMemo, useState, type ClipboardEvent } from 'react';
import { ClipboardPaste, Columns3, Plus, Rows3, Trash2 } from 'lucide-react';
import type { DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { Chart, Id, Theme } from '../../model/deck';
import { Defs } from '../../render/paint';
import { Dialog, S } from '../../ui/kit';
import { applyGrid, gridOf, parseTable, type Grid } from './ops';
import { COLOR_SETS, CHART_STYLES, seriesHex } from './palette';
import { renderChart } from './render';
import { newChart } from './sample';
import { applyKind, CHART_GROUPS, CHART_KINDS, kindOf, type ChartGroup } from './types';

export const themeOf = (store: FrameStore): Theme => {
  const s = store.slide;
  return (s ? store.masterOf(s).master : store.deck.masters[0]!).theme;
};

/** A chart drawn in its own small SVG. */
export const ChartPreview = ({ chart, theme, width, height, thumb }: { chart: Chart; theme: Theme; width: number; height: number; thumb?: boolean }) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const defs = new Defs(`cp${id}`);
  const c: Chart = { ...chart, x: 0, y: 0, w: width, h: height };
  const body = renderChart(c, theme, defs, { thumb: !!thumb });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', background: '#fff', borderRadius: 4 }} aria-hidden="true">
      <defs>{defs.items}</defs>{body}
    </svg>
  );
};

const galleryChart = (kindId: string): Chart => {
  const c = newChart(kindId, { x: 0, y: 0, w: 160, h: 100 });
  delete c.title;
  return c;
};

/** Type gallery with group tabs; `onPick` receives a kind id. */
const TypeGallery = ({ theme, value, onPick, style, colors }: { theme: Theme; value: string; onPick: (id: string) => void; style?: number; colors?: string }) => {
  const [group, setGroup] = useState<ChartGroup>(CHART_KINDS.find((k) => k.id === value)?.group ?? 'Column');
  const kinds = CHART_KINDS.filter((k) => k.group === group);
  return (
    <div className="chartgal">
      <div className="chartgroups" role="tablist" aria-label="Chart groups">
        {CHART_GROUPS.map((g) => <button key={g} role="tab" aria-selected={g === group} className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>{g}</button>)}
      </div>
      <div className="charttypes" role="listbox" aria-label="Chart types">
        {kinds.map((k) => {
          const c = { ...galleryChart(k.id), ...(style ? { style } : {}), ...(colors ? { colors } : {}) };
          return (
            <button key={k.id} role="option" aria-selected={value === k.id} className={`charttype${value === k.id ? ' on' : ''}`} onClick={() => onPick(k.id)} onDoubleClick={() => onPick(k.id)}>
              <ChartPreview chart={c} theme={theme} width={160} height={100} thumb />
              <span>{k.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const InsertChartDialog = ({ store, data, close }: DialogProps<{ target?: Id; insert: (kind: string) => void }>) => {
  const theme = themeOf(store);
  const [kind, setKind] = useState('col');
  const big = useMemo(() => newChart(kind, { x: 0, y: 0, w: 520, h: 300 }), [kind]);
  return (
    <Dialog title="Insert chart" close={close} wide okLabel="Insert" onOk={() => { data?.insert(kind); }}>
      <TypeGallery theme={theme} value={kind} onPick={setKind} />
      <div className="chartbig"><ChartPreview chart={big} theme={theme} width={520} height={300} /></div>
    </Dialog>
  );
};

export const ChangeTypeDialog = ({ store, data, close }: DialogProps<{ id: Id }>) => {
  const theme = themeOf(store);
  const shape = data ? store.shape(data.id) : null;
  const chart = shape?.kind === 'chart' ? shape : null;
  const [kind, setKind] = useState(chart ? kindOf(chart).id : 'col');
  if (!chart) { queueMicrotask(close); return null; }
  const preview = structuredClone(chart);
  const k = CHART_KINDS.find((x) => x.id === kind);
  if (k) applyKind(preview, k);
  return (
    <Dialog title="Change chart type" close={close} wide okLabel="Change" onOk={() => {
      store.tryChange('Change chart type', () => { const s = store.shape(chart.id); if (s?.kind === 'chart' && k) applyKind(s, k); });
    }}>
      <TypeGallery theme={theme} value={kind} onPick={setKind} style={chart.style} colors={chart.colors} />
      <div className="chartbig"><ChartPreview chart={{ ...preview, w: 520, h: 300 }} theme={theme} width={520} height={300} /></div>
    </Dialog>
  );
};

/** Editable grid of categories by series, with paste from other apps. */
export const EditDataDialog = ({ store, data, close }: DialogProps<{ id: Id }>) => {
  const theme = themeOf(store);
  const shape = data ? store.shape(data.id) : null;
  const chart = shape?.kind === 'chart' ? shape : null;
  const [grid, setGrid] = useState<Grid>(() => (chart ? gridOf(chart) : [['']]));
  if (!chart) { queueMicrotask(close); return null; }
  const cols = Math.max(...grid.map((r) => r.length));
  const set = (r: number, c: number, v: string) => setGrid((g) => { const n = g.map((row) => [...row]); while (n.length <= r) n.push([]); n[r]![c] = v; return n; });
  const pasteAt = (r0: number, c0: number, text: string) => {
    const t = parseTable(text);
    setGrid((g) => {
      // A whole table pasted at the corner replaces the data.
      const n = r0 === 0 && c0 === 0 && t.length > 1 ? [] : g.map((row) => [...row]);
      t.forEach((row, i) => row.forEach((v, j) => { while (n.length <= r0 + i) n.push([]); n[r0 + i]![c0 + j] = v; }));
      const w = Math.max(...n.map((row) => row.length));
      return n.map((row) => [...row, ...Array(w - row.length).fill('')]);
    });
  };
  const onPaste = (r: number, c: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    pasteAt(r, c, text);
  };
  const addRow = () => setGrid((g) => [...g, Array(cols).fill('')]);
  const addCol = () => setGrid((g) => g.map((row, i) => [...row, ...Array(cols - row.length).fill(''), i === 0 ? `Series ${cols}` : '']));
  const delRow = (r: number) => setGrid((g) => (g.length > 2 ? g.filter((_, i) => i !== r) : g));
  const delCol = (c: number) => setGrid((g) => (cols > 2 ? g.map((row) => row.filter((_, i) => i !== c)) : g));
  const preview = structuredClone(chart);
  applyGrid(preview, grid);
  const xy = chart.chartType === 'scatter' || chart.chartType === 'bubble';
  return (
    <Dialog title="Edit chart data" close={close} wide okLabel="Save" onOk={() => {
      store.tryChange('Edit chart data', () => { const s = store.shape(chart.id); if (s?.kind === 'chart') applyGrid(s, grid); });
    }} footer={<>
      <button className="tool" onClick={addRow}><Rows3 size={16} strokeWidth={S} /> Add row</button>
      <button className="tool" onClick={addCol}><Columns3 size={16} strokeWidth={S} /> Add series</button>
      <button className="tool" onClick={() => { void navigator.clipboard?.readText?.().then((t) => t && pasteAt(0, 0, t)).catch(() => store.notify('Paste with the keyboard into a cell instead.')); }}><ClipboardPaste size={16} strokeWidth={S} /> Paste table</button>
    </>}>
      <p className="muted small">The first row holds series names and the first column holds {xy ? 'X values' : 'category labels'}. Paste a table copied from a spreadsheet into any cell.</p>
      <div className="datagrid">
        <table>
          <thead>
            <tr><th />{Array.from({ length: cols }, (_, c) => <th key={c}>{c > 0 && <button className="ico sm" aria-label={`Remove column ${c}`} title="Remove column" onClick={() => delCol(c)}><Trash2 size={13} strokeWidth={S} /></button>}</th>)}</tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r} className={r === 0 ? 'hdr' : ''}>
                <th>{r > 0 && <button className="ico sm" aria-label={`Remove row ${r}`} title="Remove row" onClick={() => delRow(r)}><Trash2 size={13} strokeWidth={S} /></button>}</th>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className={c === 0 ? 'cat' : ''}>
                    <input value={row[c] ?? ''} aria-label={`Row ${r + 1} column ${c + 1}`} inputMode={r > 0 && c > 0 ? 'decimal' : 'text'} spellCheck={false}
                      style={r > 0 && c > 0 ? { color: seriesHex(chart, theme, chart.chartType === 'bubble' ? Math.floor((c - 1) / 2) : c - 1) } : undefined}
                      onChange={(e) => set(r, c, e.target.value)} onPaste={onPaste(r, c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                          e.preventDefault();
                          const next = r + (e.key === 'ArrowUp' ? -1 : 1);
                          if (next >= grid.length && e.key !== 'ArrowUp') addRow();
                          requestAnimationFrame(() => (document.querySelector(`[aria-label="Row ${next + 1} column ${c + 1}"]`) as HTMLInputElement | null)?.focus());
                        }
                      }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <button className="tool addrow" onClick={addRow}><Plus size={14} strokeWidth={S} /> Row</button>
      </div>
      <div className="chartbig small"><ChartPreview chart={{ ...preview, w: 480, h: 220 }} theme={theme} width={480} height={220} /></div>
    </Dialog>
  );
};

/** Gallery of chart styles for the panel. */
export const StyleGallery = ({ store, chart }: { store: FrameStore; chart: Chart }) => {
  const theme = themeOf(store);
  return (
    <div className="chartstyles">
      {CHART_STYLES.map((st, i) => (
        <button key={i} className={(chart.style ?? 1) === i + 1 ? 'on' : ''} title={st.label} aria-label={`Style ${st.label}`}
          onClick={() => store.tryChange('Chart style', () => { const s = store.shape(chart.id); if (s?.kind === 'chart') s.style = i + 1; })}>
          <ChartPreview chart={{ ...chart, style: i + 1, title: 'Title', legend: 'none', w: 120, h: 80 }} theme={theme} width={120} height={80} />
        </button>
      ))}
    </div>
  );
};

export const ColorSets = ({ store, chart }: { store: FrameStore; chart: Chart }) => {
  const theme = themeOf(store);
  return (
    <div className="colorsets" role="radiogroup" aria-label="Chart colors">
      {COLOR_SETS.map((cs) => (
        <button key={cs.id} role="radio" aria-checked={(chart.colors ?? 'colorful1') === cs.id} className={(chart.colors ?? 'colorful1') === cs.id ? 'on' : ''} title={cs.label} aria-label={cs.label}
          onClick={() => store.tryChange('Chart colors', () => {
            const s = store.shape(chart.id);
            if (s?.kind !== 'chart') return;
            s.colors = cs.id;
            s.series = s.series.map(({ color: _c, ...rest }) => rest);
          })}>
          {[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ background: seriesHex({ colors: cs.id }, theme, i) }} />)}
        </button>
      ))}
    </div>
  );
};


