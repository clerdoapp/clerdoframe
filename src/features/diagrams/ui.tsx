import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, IndentDecrease, IndentIncrease, Plus, Trash2 } from 'lucide-react';
import type { DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { Diagram, DiagramLayout, Id, Theme } from '../../model/deck';
import { contextFor, drawShape } from '../../render/SlideView';
import { Defs } from '../../render/paint';
import { Dialog, S } from '../../ui/kit';
import { COLOR_SCHEMES, DIAGRAM_STYLES, layoutDiagram, schemeColor } from './layout';
import { addNode, DIAGRAM_GROUPS, DIAGRAM_LAYOUTS, moveNode, newDiagram, removeNode, shiftLevel, type DiagramGroup } from './ops';
import { css } from '../../render/color';

export const themeOf = (store: FrameStore): Theme => {
  const s = store.slide;
  return (s ? store.masterOf(s).master : store.deck.masters[0]!).theme;
};

/** A diagram drawn into its own small SVG. */
export const DiagramPreview = ({ store, d, width, height }: { store: FrameStore; d: Diagram; width: number; height: number }) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const defs = new Defs(`dp${id}`);
  const ctx = contextFor(store.deck, store.slide ?? null, { prompts: false });
  const shapes = layoutDiagram({ ...d, x: 0, y: 0, w: width, h: height }, ctx.theme);
  const body = shapes.map((s) => drawShape(s, ctx, defs, { prompts: false, mode: 'thumb' }));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', background: '#fff', borderRadius: 4 }} aria-hidden="true">
      <defs>{defs.items}</defs>{body}
    </svg>
  );
};

/** Gallery of layouts, grouped, with live previews of the given nodes. */
export const LayoutGallery = ({ store, value, onPick, base }: { store: FrameStore; value: DiagramLayout; onPick: (l: DiagramLayout) => void; base?: Diagram }) => {
  const [group, setGroup] = useState<DiagramGroup | 'All'>(base ? 'All' : DIAGRAM_LAYOUTS.find((l) => l.id === value)?.group ?? 'List');
  const list = DIAGRAM_LAYOUTS.filter((l) => group === 'All' || l.group === group);
  return (
    <div className="chartgal">
      <div className="chartgroups" role="tablist" aria-label="Diagram groups">
        {(['All', ...DIAGRAM_GROUPS] as const).map((g) => <button key={g} role="tab" aria-selected={g === group} className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>{g}</button>)}
      </div>
      <div className="charttypes" role="listbox" aria-label="Diagram layouts">
        {list.map((l) => {
          const d = base ? { ...base, layout: l.id, cached: undefined } : newDiagram(l.id, { x: 0, y: 0, w: 200, h: 120 });
          return (
            <button key={l.id} role="option" aria-selected={value === l.id} className={`charttype${value === l.id ? ' on' : ''}`} onClick={() => onPick(l.id)}>
              <DiagramPreview store={store} d={d} width={200} height={120} />
              <span>{l.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const InsertDiagramDialog = ({ store, data, close }: DialogProps<{ insert: (l: DiagramLayout) => void }>) => {
  const [layout, setLayout] = useState<DiagramLayout>('basicList');
  return (
    <Dialog title="Insert diagram" close={close} wide okLabel="Insert" onOk={() => { data?.insert(layout); }}>
      <LayoutGallery store={store} value={layout} onPick={setLayout} />
      <div className="chartbig"><DiagramPreview store={store} d={newDiagram(layout, { x: 0, y: 0, w: 560, h: 300 })} width={560} height={300} /></div>
    </Dialog>
  );
};

export const ChangeLayoutDialog = ({ store, data, close }: DialogProps<{ id: Id }>) => {
  const sh = data ? store.shape(data.id) : null;
  const d = sh?.kind === 'diagram' ? sh : null;
  const [layout, setLayout] = useState<DiagramLayout>(d?.layout ?? 'basicList');
  if (!d) { queueMicrotask(close); return null; }
  return (
    <Dialog title="Change diagram layout" close={close} wide okLabel="Change" onOk={() => {
      store.tryChange('Diagram layout', () => { const x = store.shape(d.id); if (x?.kind === 'diagram') { x.layout = layout; delete x.cached; } });
    }}>
      <LayoutGallery store={store} value={layout} onPick={setLayout} base={d} />
    </Dialog>
  );
};

const selectedDiagram = (store: FrameStore): Diagram | null => {
  const x = store.one();
  if (x?.kind === 'diagram') return x;
  const id = store.ext.diagramPaneId as Id | undefined;
  const y = id ? store.shape(id) : null;
  return y?.kind === 'diagram' ? y : null;
};

/** Outline editor: one row per node. Tab / Shift+Tab change level, Enter adds, Backspace on an empty row removes. */
export const TextPane = ({ store }: { store: FrameStore }) => {
  const d = selectedDiagram(store);
  const [focus, setFocus] = useState<number | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (focus !== null) { refs.current[focus]?.focus(); setFocus(null); } }, [focus, d?.nodes.length]);
  if (!d) return <p className="muted pad">Select a diagram to edit its text.</p>;
  store.ext.diagramPaneId = d.id;
  const edit = (label: string, fn: (x: Diagram) => number | void): void => {
    store.tryChange(label, () => {
      const x = store.shape(d.id);
      if (x?.kind !== 'diagram') return;
      const r = fn(x);
      if (typeof r === 'number') setFocus(r);
    });
  };
  const active = () => Math.max(0, refs.current.findIndex((r) => r === document.activeElement));
  return (
    <div className="dgmpane">
      <div className="iconrow">
        <button className="tool icon" title="Add item" aria-label="Add item" onClick={() => edit('Add item', (x) => addNode(x, active(), 'after'))}><Plus size={16} strokeWidth={S} /></button>
        <button className="tool icon" title="Move right (Tab)" aria-label="Demote" onClick={() => { const i = active(); edit('Demote', (x) => { shiftLevel(x, i, 1); return i; }); }}><IndentIncrease size={16} strokeWidth={S} /></button>
        <button className="tool icon" title="Move left (Shift+Tab)" aria-label="Promote" onClick={() => { const i = active(); edit('Promote', (x) => { shiftLevel(x, i, -1); return i; }); }}><IndentDecrease size={16} strokeWidth={S} /></button>
        <button className="tool icon" title="Move up" aria-label="Move up" onClick={() => { const i = active(); edit('Move up', (x) => moveNode(x, i, -1)); }}><ArrowUp size={16} strokeWidth={S} /></button>
        <button className="tool icon" title="Move down" aria-label="Move down" onClick={() => { const i = active(); edit('Move down', (x) => moveNode(x, i, 1)); }}><ArrowDown size={16} strokeWidth={S} /></button>
        <button className="tool icon" title="Remove item" aria-label="Remove item" onClick={() => { const i = active(); edit('Remove item', (x) => { removeNode(x, i); return Math.max(0, i - 1); }); }}><Trash2 size={16} strokeWidth={S} /></button>
      </div>
      <ul className="dgmoutline">
        {d.nodes.map((n, i) => (
          <li key={n.id} style={{ paddingInlineStart: 6 + n.level * 18 }}>
            <i style={{ background: css(schemeColor(d.colorScheme, i, d.nodes.length, n.level), { theme: themeOf(store) }) }} />
            <input ref={(el) => { refs.current[i] = el; }} value={n.text} placeholder="Text" aria-label={`Item ${i + 1}, level ${n.level + 1}`}
              onChange={(e) => { const v = e.target.value; edit('Diagram text', (x) => { const m = x.nodes[i]; if (m) { m.text = v; delete x.cached; } }); }}
              onKeyDown={(e) => {
                if (e.key === 'Tab') { e.preventDefault(); edit(e.shiftKey ? 'Promote' : 'Demote', (x) => { shiftLevel(x, i, e.shiftKey ? -1 : 1); return i; }); }
                else if (e.key === 'Enter') { e.preventDefault(); edit('Add item', (x) => addNode(x, i, e.shiftKey ? 'before' : 'after')); }
                else if (e.key === 'Backspace' && !n.text && d.nodes.length > 1) { e.preventDefault(); edit('Remove item', (x) => { removeNode(x, i); return Math.max(0, i - 1); }); }
                else if (e.key === 'ArrowUp' && e.altKey) { e.preventDefault(); edit('Move up', (x) => moveNode(x, i, -1)); }
                else if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); edit('Move down', (x) => moveNode(x, i, 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); refs.current[i - 1]?.focus(); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); refs.current[i + 1]?.focus(); }
              }} />
          </li>
        ))}
      </ul>
      <p className="muted small">Tab moves an item right, Shift+Tab moves it left, Enter adds an item.</p>
    </div>
  );
};

/** Colour scheme and style pickers for the panel. */
export const SchemePicker = ({ store, d }: { store: FrameStore; d: Diagram }) => {
  const theme = themeOf(store);
  return (
    <div className="colorsets" role="radiogroup" aria-label="Diagram colors">
      {COLOR_SCHEMES.map((cs) => {
        const on = (d.colorScheme ?? 'primary') === cs.id;
        return (
          <button key={cs.id} role="radio" aria-checked={on} className={on ? 'on' : ''} title={cs.label} aria-label={cs.label}
            onClick={() => store.tryChange('Diagram colors', () => { const x = store.shape(d.id); if (x?.kind === 'diagram') { x.colorScheme = cs.id; delete x.cached; } })}>
            {[0, 1, 2, 3].map((i) => <i key={i} style={cs.id.endsWith('Outline') ? { background: '#fff', border: `2px solid ${css(schemeColor(cs.id, i, 4), { theme })}` } : { background: css(schemeColor(cs.id, i, 4), { theme }) }} />)}
          </button>
        );
      })}
    </div>
  );
};

export const StylePicker = ({ store, d }: { store: FrameStore; d: Diagram }) => (
  <div className="chartstyles">
    {DIAGRAM_STYLES.map((st) => (
      <button key={st.id} className={(d.styleName ?? 'flat') === st.id ? 'on' : ''} title={st.label} aria-label={`Style ${st.label}`}
        onClick={() => store.tryChange('Diagram style', () => { const x = store.shape(d.id); if (x?.kind === 'diagram') { x.styleName = st.id; delete x.cached; } })}>
        <DiagramPreview store={store} d={{ ...d, styleName: st.id, cached: undefined, layout: 'basicList', nodes: d.nodes.filter((n) => n.level === 0).slice(0, 3) }} width={120} height={70} />
      </button>
    ))}
  </div>
);
