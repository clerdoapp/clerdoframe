import { FileText, LayoutGrid, ListTree, RotateCcw, Ungroup } from 'lucide-react';
import { openDialog, openPane, registerCommands, type Command } from '../../app/commands';
import { registerDialog, registerMenu, registerPane, registerPanelSection } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { uid, type AutoShape, type Diagram, type DiagramLayout, type Id, type Shape } from '../../model/deck';
import { drawShape, registerKind } from '../../render/SlideView';
import { Btn, Group } from '../../ui/kit';
import { insertShape, placement, replaceShape } from '../charts/place';
import '../charts/charts.css';
import './diagrams.css';
import { COLOR_SCHEMES, DIAGRAM_STYLES, layoutDiagram } from './layout';
import { addNode, DIAGRAM_LAYOUTS, moveNode, newDiagram, nodesFromParas, parasFromNodes, removeNode, shiftLevel, toGroup, type AddWhere } from './ops';
import { ChangeLayoutDialog, InsertDiagramDialog, SchemePicker, StylePicker, TextPane, themeOf } from './ui';

export { layoutDiagram } from './layout';

const oneDiagram = (s: FrameStore): Diagram | null => { const x = s.one(); return x?.kind === 'diagram' ? x : null; };

/** Node the outline commands act on: the focused row in the text pane, else the last node. */
const curNode = (s: FrameStore, d: Diagram): number => {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  const m = el instanceof HTMLInputElement ? /^Item (\d+),/.exec(el.getAttribute('aria-label') ?? '') : null;
  const i = m ? +m[1]! - 1 : typeof s.ext.diagramNode === 'number' ? (s.ext.diagramNode as number) : d.nodes.length - 1;
  return Math.max(0, Math.min(d.nodes.length - 1, i));
};

const editDiagram = (s: FrameStore, label: string, fn: (d: Diagram) => void): void => {
  const d = oneDiagram(s);
  if (!d) return;
  s.tryChange(label, () => { const x = s.shape(d.id); if (x?.kind === 'diagram') fn(x); });
};

const insertDiagram = (s: FrameStore, layout: DiagramLayout, target?: Id): void => {
  const p = placement(s, 820, 440, ['dgm', 'obj', 'body'], target);
  insertShape(s, 'Insert diagram', newDiagram(layout, { x: p.x, y: p.y, w: p.w, h: p.h }), p);
};

const textBoxOf = (s: FrameStore): AutoShape | null => {
  const x = s.one();
  return x?.kind === 'shape' && x.text && x.text.paras.some((p) => p.runs.some((r) => r.text.trim())) ? x : null;
};

const Section = ({ store: s }: { store: FrameStore }) => {
  const d = oneDiagram(s);
  if (!d) return null;
  return (
    <>
      <div className="toollist">
        <Btn store={s} id="diagram.textPane" icon={ListTree} label="Text pane" />
        <Btn store={s} id="diagram.changeLayout" icon={LayoutGrid} label="Change layout" />
        <Btn store={s} id="diagram.reset" icon={RotateCcw} />
        <Btn store={s} id="diagram.convertToShapes" icon={Ungroup} />
        <Btn store={s} id="diagram.convertToText" icon={FileText} />
      </div>
      <Group title="Colors"><SchemePicker store={s} d={d} /></Group>
      <Group title="Styles"><StylePicker store={s} d={d} /></Group>
    </>
  );
};

export const registerDiagrams = (): void => {
  registerKind('diagram', (shape, ctx, defs, o) => {
    if (shape.kind !== 'diagram') return null;
    const shapes: Shape[] = shape.cached?.length ? shape.cached : layoutDiagram(shape, ctx.theme);
    return <g className="diagram">{shapes.map((c) => drawShape(c, ctx, defs, { ...o, prompts: false, decorate: undefined }))}</g>;
  });
  registerDialog('diagram.insert', InsertDiagramDialog);
  registerDialog('diagram.layout', ChangeLayoutDialog);
  registerPane({ id: 'diagramText', title: 'Diagram text', render: (s) => <TextPane store={s} />, width: 300 });

  const adds: Command[] = (['after', 'before', 'above', 'below'] as AddWhere[]).map((w) => ({
    id: `diagram.addNode.${w}`, label: `Add shape ${w}`, group: 'Diagram',
    run: (s) => editDiagram(s, 'Add shape', (d) => { s.ext.diagramNode = addNode(d, curNode(s, d), w, ''); }),
    enabled: (s) => !!oneDiagram(s),
  }));

  registerCommands([
    {
      id: 'insert.diagram', label: 'Diagram…', group: 'Insert',
      // arg: { target?: placeholder id, layout?: insert straight away }
      run: (s, arg) => {
        const o = (typeof arg === 'object' && arg ? arg : {}) as { target?: Id; layout?: DiagramLayout };
        if (o.layout) { insertDiagram(s, o.layout, o.target); return; }
        openDialog(s, 'diagram.insert', { insert: (l: DiagramLayout) => insertDiagram(s, l, o.target) });
      },
      enabled: (s) => !!s.surface(),
    },
    { id: 'diagram.textPane', label: 'Diagram text pane', group: 'Diagram', run: (s) => openPane(s, 'diagramText'), active: (s) => s.view.pane === 'diagramText', enabled: (s) => !!oneDiagram(s) },
    {
      id: 'diagram.addNode', label: 'Add shape', group: 'Diagram', hidden: true,
      run: (s, a) => { const w = (['after', 'before', 'above', 'below'] as AddWhere[]).includes(a as AddWhere) ? (a as AddWhere) : 'after'; editDiagram(s, 'Add shape', (d) => { s.ext.diagramNode = addNode(d, curNode(s, d), w, ''); }); },
      enabled: (s) => !!oneDiagram(s),
    },
    ...adds,
    { id: 'diagram.removeNode', label: 'Remove shape', group: 'Diagram', run: (s) => editDiagram(s, 'Remove shape', (d) => { if (d.nodes.length > 1) removeNode(d, curNode(s, d)); }), enabled: (s) => (oneDiagram(s)?.nodes.length ?? 0) > 1 },
    { id: 'diagram.promote', label: 'Promote', group: 'Diagram', run: (s) => editDiagram(s, 'Promote', (d) => { shiftLevel(d, curNode(s, d), -1); }), enabled: (s) => !!oneDiagram(s) },
    { id: 'diagram.demote', label: 'Demote', group: 'Diagram', run: (s) => editDiagram(s, 'Demote', (d) => { shiftLevel(d, curNode(s, d), 1); }), enabled: (s) => !!oneDiagram(s) },
    { id: 'diagram.moveUp', label: 'Move shape up', group: 'Diagram', run: (s) => editDiagram(s, 'Move up', (d) => { s.ext.diagramNode = moveNode(d, curNode(s, d), -1); }), enabled: (s) => !!oneDiagram(s) },
    { id: 'diagram.moveDown', label: 'Move shape down', group: 'Diagram', run: (s) => editDiagram(s, 'Move down', (d) => { s.ext.diagramNode = moveNode(d, curNode(s, d), 1); }), enabled: (s) => !!oneDiagram(s) },
    {
      id: 'diagram.layout', label: 'Diagram layout', group: 'Diagram', hidden: true,
      run: (s, a) => { if (DIAGRAM_LAYOUTS.some((l) => l.id === a)) editDiagram(s, 'Diagram layout', (d) => { d.layout = a as DiagramLayout; delete d.cached; }); },
      enabled: (s) => !!oneDiagram(s),
    },
    { id: 'diagram.changeLayout', label: 'Change diagram layout…', group: 'Diagram', run: (s) => { const d = oneDiagram(s); if (d) openDialog(s, 'diagram.layout', { id: d.id }); }, enabled: (s) => !!oneDiagram(s) },
    {
      id: 'diagram.colors', label: 'Diagram colors', group: 'Diagram', hidden: true,
      run: (s, a) => { if (COLOR_SCHEMES.some((c) => c.id === a)) editDiagram(s, 'Diagram colors', (d) => { d.colorScheme = a as string; delete d.cached; }); },
      enabled: (s) => !!oneDiagram(s),
    },
    {
      id: 'diagram.style', label: 'Diagram style', group: 'Diagram', hidden: true,
      run: (s, a) => { if (DIAGRAM_STYLES.some((c) => c.id === a)) editDiagram(s, 'Diagram style', (d) => { d.styleName = a as string; delete d.cached; }); },
      enabled: (s) => !!oneDiagram(s),
    },
    { id: 'diagram.reset', label: 'Reset diagram', group: 'Diagram', run: (s) => editDiagram(s, 'Reset diagram', (d) => { d.colorScheme = 'primary'; d.styleName = 'flat'; delete d.cached; }), enabled: (s) => !!oneDiagram(s) },
    {
      id: 'diagram.convertToShapes', label: 'Convert to shapes', group: 'Diagram',
      run: (s) => { const d = oneDiagram(s); if (!d) return; s.tryChange('Convert to shapes', () => { const g = toGroup(d, themeOf(s)); replaceShape(s, d.id, g); s.sel = [g.id]; }); },
      enabled: (s) => !!oneDiagram(s),
    },
    {
      id: 'diagram.convertToText', label: 'Convert to text', group: 'Diagram',
      run: (s) => {
        const d = oneDiagram(s);
        if (!d) return;
        s.tryChange('Convert to text', () => {
          const tb: AutoShape = { id: uid('s'), kind: 'shape', name: 'Text', geom: 'rect', textbox: true, x: d.x, y: d.y, w: d.w, h: d.h, ...(d.ph ? { ph: d.ph } : {}), text: { paras: parasFromNodes(d.nodes), wrap: true } };
          if (!d.ph) tb.text!.paras.forEach((p) => { p.style = { ...p.style, bullet: { type: 'char', char: '•' }, marginLeft: 30 + (p.style?.level ?? 0) * 36, indent: -24 }; });
          replaceShape(s, d.id, tb);
          s.sel = [tb.id];
        });
      },
      enabled: (s) => !!oneDiagram(s),
    },
    {
      id: 'diagram.fromText', label: 'Convert to diagram', group: 'Diagram',
      // arg: layout id (default basicList)
      run: (s, a) => {
        const tb = textBoxOf(s);
        if (!tb?.text) { s.notify('Select a text box with some text first.'); return; }
        const layout = DIAGRAM_LAYOUTS.some((l) => l.id === a) ? (a as DiagramLayout) : 'basicList';
        s.tryChange('Convert to diagram', () => {
          const d = newDiagram(layout, { x: tb.x, y: tb.y, w: tb.w, h: tb.h });
          d.nodes = nodesFromParas(tb.text!.paras);
          if (tb.ph) d.ph = tb.ph;
          replaceShape(s, tb.id, d);
          s.sel = [d.id];
        });
      },
      enabled: (s) => !!textBoxOf(s),
    },
  ]);

  registerMenu({
    kind: 'shape', order: -5,
    items: (s) => (oneDiagram(s) ? [
      { label: 'Edit text…', command: 'diagram.textPane' },
      { label: 'Add shape after', command: 'diagram.addNode.after' },
      { label: 'Change layout…', command: 'diagram.changeLayout' },
      { label: 'Convert to shapes', command: 'diagram.convertToShapes' },
    ] : textBoxOf(s) ? [{ label: 'Convert to diagram', command: 'diagram.fromText' }] : []),
  });

  registerPanelSection({ tab: 'home', title: 'Diagram', order: -10, when: (s) => !!oneDiagram(s), render: (s) => <Section store={s} /> });
};
