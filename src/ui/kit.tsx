import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, X, type LucideIcon } from 'lucide-react';
import { command, run } from '../app/commands';
import type { FrameStore } from '../app/store';
import type { Color } from '../model/deck';
import { css, DARK_LUM_STEPS, LUM_STEPS, THEME_GRID } from '../render/color';
import { prettyKeys } from './keys';

/** Shared building blocks for tool panels, panes and dialogs. */

export const S = 1.9;

export const Btn = ({ store, id, icon: Icon, label, iconOnly, arg, wide }: { store: FrameStore; id: string; icon?: LucideIcon; label?: string; iconOnly?: boolean; arg?: unknown; wide?: boolean }) => {
  const c = command(id);
  if (!c) return null;
  const on = c.active?.(store) ?? false;
  const enabled = c.enabled?.(store) ?? true;
  const text = label ?? c.label;
  const tip = c.keys ? `${text} (${prettyKeys(c.keys)})` : text;
  return (
    <button className={`tool${on ? ' on' : ''}${iconOnly ? ' icon' : ''}${wide ? ' wide' : ''}`} disabled={!enabled} aria-pressed={c.active ? on : undefined} aria-label={text} title={tip}
      onMouseDown={(e) => e.preventDefault()} onClick={() => run(store, id, arg)}>
      {Icon && <Icon size={16} strokeWidth={S} />}{!iconOnly && <span>{text}</span>}
    </button>
  );
};

export const Group = ({ title, children }: { title: string; children: ReactNode }) => <section className="group"><h3>{title}</h3>{children}</section>;
export const Row = ({ children }: { children: ReactNode }) => <div className="iconrow">{children}</div>;
export const List = ({ children }: { children: ReactNode }) => <div className="toollist">{children}</div>;

const BASIC = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];

/** Theme colour grid + standard colours + custom picker. onPick receives a model Color, or null for "No colour". */
export const ColorGrid = ({ store, onPick, none, auto }: { store: FrameStore; onPick: (c: Color | null) => void; none?: string; auto?: string }) => {
  const theme = store.deck.masters[0]!.theme;
  const ctx = { theme };
  return (
    <div className="colorgrid" onMouseDown={(e) => e.preventDefault()}>
      {(none || auto) && (
        <div className="rowx">
          {auto && <button className="tool" onClick={() => onPick({ theme: 'tx1' })}>{auto}</button>}
          {none && <button className="tool" onClick={() => onPick(null)}><span className="sw none" /> {none}</button>}
        </div>
      )}
      <div className="cgtitle">Theme colors</div>
      <div className="cg">
        {LUM_STEPS.map((_, row) => THEME_GRID.map((name, col) => {
          const lum = (col < 2 || col === 2 ? DARK_LUM_STEPS : LUM_STEPS)[row]!;
          const eff = col === 1 || col === 3 ? (row === 0 ? 0 : [0.5, 0.35, 0.25, 0.15, 0.05][row - 1]!) : lum;
          const c: Color = eff ? { theme: name, lum: eff } : { theme: name };
          return <button key={`${row}-${col}`} className="sw sq" style={{ background: css(c, ctx) }} title={`${name}${eff ? ` ${eff > 0 ? 'lighter' : 'darker'} ${Math.round(Math.abs(eff) * 100)}%` : ''}`} aria-label={name} onClick={() => onPick(c)} />;
        }))}
      </div>
      <div className="cgtitle">Standard colors</div>
      <div className="cg">{BASIC.map((h) => <button key={h} className="sw sq" style={{ background: h }} title={h} aria-label={h} onClick={() => onPick(h)} />)}</div>
      <label className="tool"><input type="color" style={{ width: 22, height: 22, padding: 0, border: 0 }} onChange={(e) => onPick(e.target.value.toUpperCase())} /> More colors…</label>
    </div>
  );
};

/** A button that opens a colour grid in a popup. */
export const ColorButton = ({ store, label, icon: Icon, value, onPick, none, auto }: { store: FrameStore; label: string; icon?: LucideIcon; value?: Color; onPick: (c: Color | null) => void; none?: string; auto?: string }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', off, true);
    return () => window.removeEventListener('pointerdown', off, true);
  }, [open]);
  const theme = store.deck.masters[0]!.theme;
  return (
    <div className="colorbtn" ref={ref}>
      <button className="tool" title={label} aria-label={label} aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        {Icon && <Icon size={16} strokeWidth={S} />}
        <span className="chip" style={{ background: value ? css(value, { theme }) : 'transparent' }} />
        <span>{label}</span>
      </button>
      {open && <div className="popup cpop"><ColorGrid store={store} none={none} auto={auto} onPick={(c) => { onPick(c); setOpen(false); }} /></div>}
    </div>
  );
};

/** Number input that commits on Enter/blur and supports arrows. */
export const NumberField = ({ label, value, onChange, step = 1, min, max, suffix, width }: { label: string; value: number | undefined; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string; width?: number }) => {
  const [text, setText] = useState(value === undefined ? '' : String(Math.round(value * 100) / 100));
  useEffect(() => { setText(value === undefined ? '' : String(Math.round(value * 100) / 100)); }, [value]);
  const commit = () => {
    const n = parseFloat(text);
    if (!Number.isFinite(n)) { setText(value === undefined ? '' : String(value)); return; }
    onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
  };
  return (
    <label className="lbl" style={width ? { width } : undefined}>
      <span>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input type="number" inputMode="decimal" step={step} min={min} max={max} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
    </label>
  );
};

export const Select = <T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: [T, string][]; onChange: (v: T) => void }) => {
  const sel = (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return label ? <label className="lbl"><span>{label}</span>{sel}</label> : sel;
};

export const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
);

/** Shared dialog frame: title bar, scrollable body, action row; Escape closes, Enter submits. */
export const Dialog = ({ title, children, onOk, okLabel = 'OK', close, width = 420, footer, wide }: {
  title: string; children: ReactNode; onOk?: () => void | boolean; okLabel?: string; close: () => void; width?: number; footer?: ReactNode; wide?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button.primary')?.focus(); }, []);
  const ok = () => { if (onOk) { if (onOk() !== false) close(); } else close(); };
  return (
    <div className="backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog" ref={ref} role="dialog" aria-modal="true" aria-label={title} style={{ width: wide ? Math.min(820, window.innerWidth - 24) : Math.min(width, window.innerWidth - 24) }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
          if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement) && onOk) { e.preventDefault(); ok(); }
        }}>
        <div className="dhead"><h2>{title}</h2><button className="ico" aria-label="Close" onClick={close}><X size={16} strokeWidth={S} /></button></div>
        <div className="dbody">{children}</div>
        <div className="dfoot">{footer}<div className="grow" />{onOk && <button onClick={close}>Cancel</button>}<button className="primary" onClick={ok}>{onOk ? okLabel : 'Close'}</button></div>
      </div>
    </div>
  );
};

export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

/** Collapsible section for the format pane. */
export const Fold = ({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) => {
  const [open, setOpen] = useState(initial);
  return (
    <section className="fold">
      <button className="foldhead" aria-expanded={open} onClick={() => setOpen(!open)}><ChevronRight size={14} strokeWidth={S} className={open ? 'tri on' : 'tri'} />{title}</button>
      {open && <div className="foldbody">{children}</div>}
    </section>
  );
};
