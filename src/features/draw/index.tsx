import { Eraser, Highlighter, Lasso, MousePointer2, PenLine, Pencil, Play, Shapes, Square } from 'lucide-react';
import { useEffect } from 'react';
import { registerCommands, run } from '../../app/commands';
import { registerCanvasLayer, registerMenu, registerPanelSection, registerTool } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { Color } from '../../model/deck';
import { css } from '../../render/color';
import { registerKind } from '../../render/SlideView';
import { Check, ColorGrid, Group, S } from '../../ui/kit';
import { ReplayDriver, replayBudget, RulerLayer, startReplay, stopReplay } from './overlay';
import { renderInk } from './render';
import { currentInkTool, drawWithTouch, inkToShape, isDrawTool, PALETTE, penState, rulerOf, setDrawTool, settingFor, WIDTHS, type InkTool } from './state';
import { convertInkToShapes, drawToolHandlers } from './tools';
import './draw.css';

export { strokeOutline, recognize } from './ink';
export { renderInk } from './render';

/** Escape returns to Select while a drawing tool or replay is on. */
const DrawKeys = ({ store }: { store: FrameStore }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || store.dialog || !(isDrawTool(store.tool) || store.ext.inkReplay)) return;
      e.preventDefault();
      e.stopPropagation();
      run(store, 'draw.exit');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [store]);
  return null;
};

const themeOf = (s: FrameStore) => (s.slide ? s.masterOf(s.slide).master : s.deck.masters[0]!).theme;

const setPen = (s: FrameStore, patch: { color?: Color; width?: number }): void => {
  const tool = currentInkTool(s);
  const st = settingFor(s, tool);
  Object.assign(st, patch);
  if (!s.tool || !isDrawTool(s.tool) || s.tool === 'eraser' || s.tool === 'lasso') setDrawTool(s, tool); else s.emit();
};

const ToolButton = ({ store: s, tool, label, icon: Icon, color, preset }: { store: FrameStore; tool: string | null; label: string; icon: typeof Pencil; color?: string; preset?: number }) => {
  const on = preset !== undefined ? s.tool === 'pen' && penState(s).active === preset : s.tool === tool;
  return (
    <button className={`drawtool${on ? ' on' : ''}`} aria-pressed={on} aria-label={label} title={label}
      onClick={() => {
        if (preset !== undefined) { penState(s).active = preset; setDrawTool(s, on ? null : 'pen'); return; }
        setDrawTool(s, on ? null : tool);
      }}>
      <Icon size={20} strokeWidth={S} />
      {color && <i style={{ background: color }} />}
    </button>
  );
};

const DrawSection = ({ store: s }: { store: FrameStore }) => {
  const p = penState(s);
  const theme = themeOf(s);
  const tool: InkTool = currentInkTool(s);
  const st = settingFor(s, tool);
  const widths = WIDTHS[tool];
  return (
    <>
      <div className="drawtools" role="toolbar" aria-label="Drawing tools">
        <ToolButton store={s} tool={null} label="Select" icon={MousePointer2} />
        <ToolButton store={s} tool="lasso" label="Lasso select" icon={Lasso} />
        {p.presets.map((pr, i) => <ToolButton key={i} store={s} tool="pen" preset={i} label={`Pen ${i + 1}`} icon={PenLine} color={css(pr.color, { theme })} />)}
        <ToolButton store={s} tool="pencil" label="Pencil" icon={Pencil} color={css(p.pencil.color, { theme })} />
        <ToolButton store={s} tool="highlighter" label="Highlighter" icon={Highlighter} color={css(p.highlighter.color, { theme })} />
        <ToolButton store={s} tool="eraser" label="Eraser" icon={Eraser} />
      </div>
      <Group title={tool === 'pen' ? `Pen ${p.active + 1}` : tool === 'pencil' ? 'Pencil' : 'Highlighter'}>
        <div className="thick" role="radiogroup" aria-label="Thickness">
          {widths.map((w) => (
            <button key={w} role="radio" aria-checked={st.width === w} className={st.width === w ? 'on' : ''} aria-label={`Thickness ${w}`} title={`${w} px`} onClick={() => setPen(s, { width: w })}>
              <span style={{ width: Math.min(26, w + 2), height: Math.min(26, w + 2), background: css(st.color, { theme }), opacity: tool === 'highlighter' ? 0.6 : 1 }} />
            </button>
          ))}
        </div>
        <div className="inkpal" role="radiogroup" aria-label="Ink color">
          {PALETTE.map((c, i) => {
            const on = JSON.stringify(c) === JSON.stringify(st.color);
            return <button key={i} role="radio" aria-checked={on} className={`sw${on ? ' on' : ''}`} style={{ background: css(c, { theme }) }} aria-label={typeof c === 'string' ? c : 'Color'} onClick={() => setPen(s, { color: c })} />;
          })}
        </div>
        <details className="morecolors">
          <summary>More colors</summary>
          <ColorGrid store={s} onPick={(c) => c && setPen(s, { color: c })} />
        </details>
      </Group>
      <Group title="Options">
        <div className="checkcol">
          <Check label="Draw with touch" checked={drawWithTouch(s)} onChange={(v) => { s.ext.drawWithTouch = v; s.emit(); }} />
          <Check label="Ink to shape" checked={inkToShape(s)} onChange={(v) => { s.ext.inkToShape = v; s.emit(); }} />
          <Check label="Ruler" checked={rulerOf(s).on} onChange={() => run(s, 'draw.ruler')} />
        </div>
        <p className="muted small">{drawWithTouch(s) ? 'Fingers and the pencil both draw.' : 'Only the pencil draws. Fingers select and scroll.'}</p>
      </Group>
      <Group title="Ink">
        <div className="toollist">
          <button className="tool" disabled={!s.selected().some((x) => x.kind === 'ink')} onClick={() => run(s, 'draw.inkToShapes')}><Shapes size={16} strokeWidth={S} /><span>Convert ink to shapes</span></button>
          <button className="tool" onClick={() => run(s, 'draw.replay')}>{s.ext.inkReplay ? <Square size={16} strokeWidth={S} /> : <Play size={16} strokeWidth={S} />}<span>{s.ext.inkReplay ? 'Stop replay' : 'Replay ink'}</span></button>
          <button className="tool" onClick={() => run(s, 'draw.eraseAll')}><Eraser size={16} strokeWidth={S} /><span>Erase all ink on slide</span></button>
        </div>
      </Group>
    </>
  );
};

export const registerDraw = (): void => {
  registerKind('ink', (shape, ctx, defs, o) => {
    if (shape.kind !== 'ink') return null;
    const budget = o.mode === 'edit' ? replayBudget(shape.id) : undefined;
    return renderInk(shape, { theme: ctx.theme }, defs, budget);
  });
  for (const t of drawToolHandlers()) registerTool(t);
  registerCanvasLayer({ id: 'draw.ruler', order: 40, render: (s, scale) => <RulerLayer store={s} scale={scale} /> });
  registerCanvasLayer({ id: 'draw.replay', order: 41, render: (s) => <><ReplayDriver store={s} /><DrawKeys store={s} /></> });

  registerCommands([
    { id: 'draw.select', label: 'Select', group: 'Draw', run: (s) => setDrawTool(s, null), active: (s) => !s.tool },
    { id: 'draw.pen', label: 'Pen', group: 'Draw', run: (s, a) => { if (typeof a === 'number') penState(s).active = Math.max(0, Math.min(2, a)); setDrawTool(s, s.tool === 'pen' && typeof a !== 'number' ? null : 'pen'); }, active: (s) => s.tool === 'pen' },
    { id: 'draw.pencil', label: 'Pencil', group: 'Draw', run: (s) => setDrawTool(s, s.tool === 'pencil' ? null : 'pencil'), active: (s) => s.tool === 'pencil' },
    { id: 'draw.highlighter', label: 'Highlighter', group: 'Draw', run: (s) => setDrawTool(s, s.tool === 'highlighter' ? null : 'highlighter'), active: (s) => s.tool === 'highlighter' },
    { id: 'draw.eraser', label: 'Eraser', group: 'Draw', run: (s) => setDrawTool(s, s.tool === 'eraser' ? null : 'eraser'), active: (s) => s.tool === 'eraser' },
    { id: 'draw.lasso', label: 'Lasso select', group: 'Draw', run: (s) => setDrawTool(s, s.tool === 'lasso' ? null : 'lasso'), active: (s) => s.tool === 'lasso' },
    // Escape is handled by DrawKeys (only while a draw tool is on), so the editor keeps its own Escape.
    { id: 'draw.exit', label: 'Stop drawing', group: 'Draw', hidden: true, run: (s) => { if (s.ext.inkReplay) stopReplay(s); setDrawTool(s, null); }, enabled: (s) => isDrawTool(s.tool) || !!s.ext.inkReplay },
    { id: 'draw.color', label: 'Ink color', group: 'Draw', hidden: true, run: (s, a) => { if (a) setPen(s, { color: a as Color }); } },
    { id: 'draw.thickness', label: 'Ink thickness', group: 'Draw', hidden: true, run: (s, a) => { const w = Number(a); if (w > 0) setPen(s, { width: w }); } },
    { id: 'draw.ruler', label: 'Ruler', group: 'Draw', run: (s) => { const r = rulerOf(s); r.on = !r.on; s.emit(); }, active: (s) => rulerOf(s).on },
    { id: 'draw.touch', label: 'Draw with touch', group: 'Draw', run: (s) => { s.ext.drawWithTouch = !drawWithTouch(s); s.emit(); }, active: (s) => drawWithTouch(s) },
    { id: 'draw.inkToShape', label: 'Ink to shape', group: 'Draw', run: (s) => { s.ext.inkToShape = !inkToShape(s); s.emit(); }, active: (s) => inkToShape(s) },
    {
      id: 'draw.inkToShapes', label: 'Convert ink to shapes', group: 'Draw',
      run: (s) => { const n = convertInkToShapes(s); if (!n) s.notify('No shapes were recognised in the selected ink.'); },
      enabled: (s) => s.selected().some((x) => x.kind === 'ink'),
    },
    { id: 'draw.replay', label: 'Replay ink', group: 'Draw', run: (s) => (s.ext.inkReplay ? stopReplay(s) : startReplay(s)), active: (s) => !!s.ext.inkReplay },
    {
      id: 'draw.eraseAll', label: 'Erase all ink on slide', group: 'Draw',
      run: (s) => s.tryChange('Erase all ink', () => { const list = s.shapes(); for (let i = list.length - 1; i >= 0; i--) if (list[i]!.kind === 'ink') list.splice(i, 1); }),
      enabled: (s) => s.shapes().some((x) => x.kind === 'ink'),
    },
  ]);

  registerMenu({ kind: 'shape', order: -4, items: (s) => (s.selected().some((x) => x.kind === 'ink') ? [{ label: 'Convert ink to shapes', command: 'draw.inkToShapes' }, { label: 'Replay ink', command: 'draw.replay' }] : []) });
  registerPanelSection({ tab: 'draw', title: 'Draw', order: 0, render: (s) => <DrawSection store={s} /> });
};
