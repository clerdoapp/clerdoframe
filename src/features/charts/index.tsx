import { ArrowLeftRight, ChartColumn, LayoutTemplate, RefreshCw, Table2, Unlink } from 'lucide-react';
import { openDialog, registerCommands, run, type Command } from '../../app/commands';
import { registerDialog, registerMenu, registerPanelSection } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { Chart, Id } from '../../model/deck';
import { registerKind } from '../../render/SlideView';
import { Btn, Check, Group, S } from '../../ui/kit';
import { applyLayout, elementOn, QUICK_LAYOUTS, switchRowCol, toggleElement, type ElementKey } from './ops';
import { COLOR_SETS, CHART_STYLES } from './palette';
import { insertShape, placement } from './place';
import { renderChart } from './render';
import { newChart } from './sample';
import { ChangeTypeDialog, ColorSets, EditDataDialog, InsertChartDialog, StyleGallery } from './ui';
import { registerEquations } from './equation';
import './charts.css';

export { renderChart } from './render';
export { newChart } from './sample';
export { CHART_KINDS } from './types';
export { linearToMathML } from './equation/math';

const oneChart = (s: FrameStore): Chart | null => { const x = s.one(); return x?.kind === 'chart' ? x : null; };

/** The chart a command acts on: { id } in the argument, else the one selected. */
const target = (s: FrameStore, arg: unknown): Chart | null => {
  const id = typeof arg === 'object' && arg && 'id' in arg ? (arg as { id: Id }).id : null;
  const x = id ? s.shape(id) : s.one();
  return x?.kind === 'chart' ? x : null;
};

const editChart = (s: FrameStore, label: string, fn: (c: Chart) => void, arg?: unknown): void => {
  const c = target(s, arg);
  if (!c) return;
  s.tryChange(label, () => { const x = s.shape(c.id); if (x?.kind === 'chart') fn(x); });
};

const ELEMENTS: [ElementKey, string][] = [['title', 'Chart title'], ['legend', 'Legend'], ['labels', 'Data labels'], ['gridlines', 'Gridlines'], ['axisTitles', 'Axis titles']];

export const insertChart = (s: FrameStore, kind: string, targetId?: Id): void => {
  const p = placement(s, 760, 440, ['chart', 'obj', 'body'], targetId);
  insertShape(s, 'Insert chart', newChart(kind, { x: p.x, y: p.y, w: p.w, h: p.h }), p);
};

const ChartSection = ({ store: s }: { store: FrameStore }) => {
  const c = oneChart(s);
  if (!c) return null;
  return (
    <>
      <div className="toollist">
        <Btn store={s} id="chart.editData" icon={Table2} label="Edit data" />
        <Btn store={s} id="chart.type" icon={ChartColumn} label="Change type" />
        <Btn store={s} id="chart.switchRowCol" icon={ArrowLeftRight} />
        {c.dataLink && <Btn store={s} id="chart.update" icon={RefreshCw} label="Update" />}
        {c.dataLink && <Btn store={s} id="chart.unlink" icon={Unlink} label="Unlink" />}
      </div>
      {c.dataLink && <div className="muted small">Linked to {c.dataLink.file}{c.dataLink.sheet ? `, ${c.dataLink.sheet}` : ''}{c.dataLink.range ? ` ${c.dataLink.range}` : ''}</div>}
      <Group title="Quick layout">
        <div className="toollist">
          {QUICK_LAYOUTS.map((l, i) => <button key={i} className="tool" onClick={() => run(s, 'chart.layout', i)}><LayoutTemplate size={16} strokeWidth={S} /><span>{l.label}</span></button>)}
        </div>
      </Group>
      <Group title="Elements">
        <div className="checkcol">{ELEMENTS.map(([k, label]) => <Check key={k} label={label} checked={elementOn(c, k)} onChange={(v) => run(s, 'chart.elements', { el: k, on: v })} />)}</div>
      </Group>
      <Group title="Styles"><StyleGallery store={s} chart={c} /></Group>
      <Group title="Colors"><ColorSets store={s} chart={c} /></Group>
    </>
  );
};

export const registerCharts = (): void => {
  registerEquations();
  registerKind('chart', (shape, ctx, defs) => (shape.kind === 'chart' ? renderChart(shape, ctx.theme, defs) : null));
  registerDialog('chart.insert', InsertChartDialog);
  registerDialog('chart.type', ChangeTypeDialog);
  registerDialog('chart.data', EditDataDialog);

  const toggles: Command[] = ELEMENTS.map(([k, label]) => ({
    id: `chart.toggle.${k}`, label, group: 'Chart',
    run: (s) => editChart(s, label, (c) => toggleElement(c, k)),
    active: (s) => { const c = oneChart(s); return !!c && elementOn(c, k); },
    enabled: (s) => !!oneChart(s),
  }));

  registerCommands([
    {
      id: 'insert.chart', label: 'Chart…', group: 'Insert',
      // arg: { target?: placeholder id, kind?: gallery id to insert without the dialog }
      run: (s, arg) => {
        const o = (typeof arg === 'object' && arg ? arg : {}) as { target?: Id; kind?: string };
        if (o.kind) { insertChart(s, o.kind, o.target); return; }
        openDialog(s, 'chart.insert', { target: o.target, insert: (kind: string) => insertChart(s, kind, o.target) });
      },
      enabled: (s) => !!s.surface(),
    },
    { id: 'chart.editData', label: 'Edit chart data…', group: 'Chart', run: (s, a) => { const c = target(s, a); if (c) openDialog(s, 'chart.data', { id: c.id }); }, enabled: (s) => !!oneChart(s) },
    { id: 'chart.type', label: 'Change chart type…', group: 'Chart', run: (s, a) => { const c = target(s, a); if (c) openDialog(s, 'chart.type', { id: c.id }); }, enabled: (s) => !!oneChart(s) },
    {
      id: 'chart.elements', label: 'Chart elements', group: 'Chart', hidden: true,
      run: (s, a) => { const o = (a ?? {}) as { el?: ElementKey; on?: boolean }; if (o.el) editChart(s, 'Chart elements', (c) => toggleElement(c, o.el!, o.on)); },
      enabled: (s) => !!oneChart(s),
    },
    ...toggles,
    { id: 'chart.layout', label: 'Quick layout', group: 'Chart', hidden: true, run: (s, a) => { const l = QUICK_LAYOUTS[Number(a) || 0]; if (l) editChart(s, 'Chart layout', (c) => applyLayout(c, l.el)); }, enabled: (s) => !!oneChart(s) },
    { id: 'chart.style', label: 'Chart style', group: 'Chart', hidden: true, run: (s, a) => { const n = Math.max(1, Math.min(CHART_STYLES.length, Number(a) || 1)); editChart(s, 'Chart style', (c) => { c.style = n; }); }, enabled: (s) => !!oneChart(s) },
    {
      id: 'chart.colors', label: 'Chart colors', group: 'Chart', hidden: true,
      run: (s, a) => { const id = typeof a === 'string' && COLOR_SETS.some((c) => c.id === a) ? a : 'colorful1'; editChart(s, 'Chart colors', (c) => { c.colors = id; c.series = c.series.map(({ color: _c, ...r }) => r); }); },
      enabled: (s) => !!oneChart(s),
    },
    { id: 'chart.switchRowCol', label: 'Switch rows and columns', group: 'Chart', run: (s) => editChart(s, 'Switch rows and columns', switchRowCol), enabled: (s) => { const c = oneChart(s); return !!c && !['scatter', 'bubble'].includes(c.chartType); } },
  ]);

  registerMenu({
    kind: 'shape', order: -5,
    items: (s) => (oneChart(s) ? [
      { label: 'Edit data…', command: 'chart.editData' },
      { label: 'Change chart type…', command: 'chart.type' },
      { label: 'Switch rows and columns', command: 'chart.switchRowCol' },
    ] : []),
  });

  registerPanelSection({ tab: 'home', title: 'Chart', order: -10, when: (s) => !!oneChart(s), render: (s) => <ChartSection store={s} /> });
};
