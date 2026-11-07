import { useMemo, useRef, useState } from 'react';
import { openDialog, registerCommands } from '../../../app/commands';
import { registerDialog, registerMenu, type DialogProps } from '../../../app/registry';
import type { FrameStore } from '../../../app/store';
import { uid, type Equation, type Id } from '../../../model/deck';
import { css } from '../../../render/color';
import { registerKind } from '../../../render/SlideView';
import { Dialog } from '../../../ui/kit';
import { insertShape, placement } from '../place';
import { COMMON_EQUATIONS, linearToMathML, STRUCTURES, SYMBOL_SET } from './math';
import './equation.css';

const PX_PER_PT = 96 / 72;
/** System math fonts first; the bundled Tinos covers the rest offline. */
export const MATH_FONT = '"Cambria Math", "STIX Two Math", "Latin Modern Math", "Tinos", "Times New Roman", serif';

/** The math element, sized by the equation's point size. */
const MathView = ({ linear, size, color, font }: { linear: string; size: number; color: string; font?: string }) => {
  const html = useMemo(() => linearToMathML(linear || '▫'), [linear]);
  return <div className="eqmath" style={{ fontSize: size * PX_PER_PT, color, ...(font ? { fontFamily: font } : {}) }} dangerouslySetInnerHTML={{ __html: html }} />;
};

const insertEquation = (s: FrameStore, linear: string, size: number): void => {
  const lines = Math.max(1, (linear.match(/\//g)?.length ?? 0) > 0 ? 2 : 1);
  const w = Math.min(s.deck.w * 0.8, Math.max(160, linear.length * size * 0.75));
  const h = size * PX_PER_PT * (lines + 1.2);
  const p = placement(s, w, h, []);
  const e: Equation = { id: uid('s'), kind: 'equation', name: 'Equation', x: p.x, y: p.y, w: p.w, h: p.h, linear, size };
  insertShape(s, 'Insert equation', e);
};

const EquationDialog = ({ store, data, close }: DialogProps<{ id?: Id }>) => {
  const sh = data?.id ? store.shape(data.id) : null;
  const eq = sh?.kind === 'equation' ? sh : null;
  const [text, setText] = useState(eq?.linear ?? '');
  const [group, setGroup] = useState(STRUCTURES[0]!.group);
  const ref = useRef<HTMLTextAreaElement>(null);
  const theme = (store.slide ? store.masterOf(store.slide).master : store.deck.masters[0]!).theme;

  /** Inserts text at the cursor; selects the first ▫ placeholder so typing replaces it. */
  const put = (t: string) => {
    const el = ref.current;
    const a = el?.selectionStart ?? text.length, b = el?.selectionEnd ?? text.length;
    // Typing into a selected placeholder replaces it.
    const next = text.slice(0, a) + t + text.slice(b);
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const ph = next.indexOf('▫', a);
      if (ph >= 0 && ph < a + t.length) el.setSelectionRange(ph, ph + 1);
      else el.setSelectionRange(a + t.length, a + t.length);
    });
  };
  const ok = () => {
    const v = text.replace(/▫/g, '').trim();
    if (!v) { store.notify('Type an equation first.'); return false; }
    if (eq) store.tryChange('Edit equation', () => { const x = store.shape(eq.id); if (x?.kind === 'equation') { x.linear = v; delete x.omml; } });
    else insertEquation(store, v, 28);
    return true;
  };
  const items = STRUCTURES.find((g) => g.group === group)?.items ?? [];
  return (
    <Dialog title={eq ? 'Edit equation' : 'Insert equation'} close={close} wide okLabel={eq ? 'Save' : 'Insert'} onOk={ok}>
      <div className="eqgroups chartgroups" role="tablist" aria-label="Structures">
        {STRUCTURES.map((g) => <button key={g.group} role="tab" aria-selected={g.group === group} className={g.group === group ? 'on' : ''} onClick={() => setGroup(g.group)}>{g.group}</button>)}
      </div>
      <div className="eqitems">
        {items.map((it) => (
          <button key={it.label} className="eqbtn" title={it.label} aria-label={it.label} onMouseDown={(e) => e.preventDefault()} onClick={() => put(it.text)}>
            <MathView linear={it.text} size={11} color="currentColor" />
          </button>
        ))}
      </div>
      <div className="eqsyms" aria-label="Symbols">
        {SYMBOL_SET.map((c) => <button key={c} className="eqsym" aria-label={`Insert ${c}`} onMouseDown={(e) => e.preventDefault()} onClick={() => put(c)}>{c}</button>)}
      </div>
      <label className="field">
        <span>Equation (linear format)</span>
        <textarea ref={ref} autoFocus value={text} rows={2} spellCheck={false} placeholder="x=(-b±√(b^2-4ac))/2a"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ok() !== false) close(); } }} />
      </label>
      <p className="muted small">Use / for fractions, ^ and _ for scripts, ( ) to group, and \alpha, \sum, \int, \sqrt for symbols.</p>
      <div className="eqpreview" aria-live="polite">
        {text.trim() ? <MathView linear={text} size={24} color={css(eq?.color ?? { theme: 'tx1' }, { theme })} font={MATH_FONT} /> : <span className="muted">Preview</span>}
      </div>
      <div className="seclabel">Common equations</div>
      <div className="eqcommon">
        {COMMON_EQUATIONS.map((c) => (
          <button key={c.label} className="eqcard" onClick={() => setText(c.linear)} title={c.label}>
            <MathView linear={c.linear} size={10} color="currentColor" />
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
};

export const registerEquations = (): void => {
  registerKind('equation', (shape, ctx) => {
    if (shape.kind !== 'equation') return null;
    const color = css(shape.color ?? { theme: 'tx1' }, { theme: ctx.theme });
    return (
      <foreignObject width={Math.max(1, shape.w)} height={Math.max(1, shape.h)} style={{ overflow: 'visible' }}>
        <div className="eqbox" style={{ width: shape.w, height: shape.h }}>
          <MathView linear={shape.linear} size={shape.size || 28} color={color} font={MATH_FONT} />
        </div>
      </foreignObject>
    );
  });
  registerDialog('equation', EquationDialog);
  registerCommands([
    {
      id: 'insert.equation', label: 'Equation…', group: 'Insert',
      // arg: { linear } inserts straight away
      run: (s, a) => {
        const o = (typeof a === 'object' && a ? a : {}) as { linear?: string; size?: number };
        if (o.linear) insertEquation(s, o.linear, o.size ?? 28); else openDialog(s, 'equation', {});
      },
      enabled: (s) => !!s.surface(),
    },
    {
      id: 'equation.edit', label: 'Edit equation…', group: 'Equation',
      run: (s) => { const x = s.one(); if (x?.kind === 'equation') openDialog(s, 'equation', { id: x.id }); },
      enabled: (s) => s.one()?.kind === 'equation',
    },
  ]);
  registerMenu({ kind: 'shape', order: -5, items: (s) => (s.one()?.kind === 'equation' ? [{ label: 'Edit equation', command: 'equation.edit' }] : []) });
};
