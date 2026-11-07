import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check as CheckIcon, ChevronDown, type LucideIcon } from 'lucide-react';
import { command, run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import type { Fill, Line } from '../../model/deck';
import { geometry, isLineGeom } from '../../render/geometry';
import { Defs, paint, strokeOf } from '../../render/paint';
import { S } from '../../ui/kit';
import { prettyKeys } from '../../ui/keys';

/** A button that opens a floating panel. The panel is fixed-positioned so scrolling containers don't clip it. */
export const Pop = ({ label, icon: Icon, children, iconOnly, wide, width = 248, className, title, disabled }: {
  label: string; icon?: LucideIcon; children: (close: () => void) => ReactNode; iconOnly?: boolean; wide?: boolean; width?: number; className?: string; title?: string; disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !btn.current) { setPos(null); return; }
    const r = btn.current.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 300;
    const w = Math.min(width, innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    const below = innerHeight - r.bottom - 8;
    const top = h <= below || below > r.top ? r.bottom + 4 : Math.max(8, r.top - 4 - h);
    setPos({ left, top, maxH: Math.max(160, h <= below || below > r.top ? below - 4 : r.top - 12) });
  }, [open, width]);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    window.addEventListener('pointerdown', off, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', off, true); window.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <>
      <button ref={btn} className={`tool${iconOnly ? ' icon' : ''}${wide ? ' wide' : ''}${open ? ' open' : ''}`} aria-haspopup="true" aria-expanded={open} aria-label={label} title={title ?? label} disabled={disabled}
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        {Icon && <Icon size={16} strokeWidth={S} />}{!iconOnly && <span className="grow">{label}</span>}{!iconOnly && <ChevronDown size={13} strokeWidth={S} className="muted" />}
      </button>
      {open && (
        <div ref={pop} className={`popup fmtpop${className ? ` ${className}` : ''}`} role="dialog" aria-label={label} onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault(); }}
          style={{ position: 'fixed', width: Math.min(width, innerWidth - 16), left: pos?.left ?? -9999, top: pos?.top ?? 0, maxHeight: pos?.maxH, visibility: pos ? 'visible' : 'hidden' }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  );
};

export interface MenuEntry { label: string; icon?: LucideIcon; command?: string; arg?: unknown; run?: () => void; on?: boolean; disabled?: boolean; sep?: boolean; keys?: string }

/** Menu rows for a Pop. Command rows hide when the command isn't registered. */
export const MenuList = ({ store, items, close }: { store: FrameStore; items: MenuEntry[]; close: () => void }) => (
  <div className="fmtmenu" role="menu">
    {items.map((it, i) => {
      if (it.sep) return <div key={i} className="sep" />;
      const c = it.command ? command(it.command) : undefined;
      if (it.command && !c) return null;
      const disabled = it.disabled ?? (c?.enabled ? !c.enabled(store) : false);
      const on = it.on ?? (c?.active ? c.active(store) : false);
      const keys = it.keys ?? c?.keys;
      const Icon = it.icon;
      return (
        <button key={i} role="menuitem" disabled={disabled} className={on ? 'on' : ''} onClick={() => { close(); if (it.run) it.run(); else if (it.command) run(store, it.command, it.arg); }}>
          <span className="mi">{Icon ? <Icon size={15} strokeWidth={S} /> : on ? <CheckIcon size={15} strokeWidth={S} /> : null}</span>
          <span className="grow">{it.label}</span>{keys && <kbd>{prettyKeys(keys)}</kbd>}
        </button>
      );
    })}
  </div>
);

export const MenuButton = ({ store, label, icon, items, iconOnly, wide, width = 240 }: { store: FrameStore; label: string; icon?: LucideIcon; items: MenuEntry[]; iconOnly?: boolean; wide?: boolean; width?: number }) => (
  <Pop label={label} icon={icon} iconOnly={iconOnly} wide={wide} width={width}>{(close) => <MenuList store={store} items={items} close={close} />}</Pop>
);

/** A button that runs a command with an argument but only shows when the command exists. */
export const CmdBtn = ({ store, id, arg, label, icon: Icon, iconOnly, on, children, className, title }: {
  store: FrameStore; id: string; arg?: unknown; label: string; icon?: LucideIcon; iconOnly?: boolean; on?: boolean; children?: ReactNode; className?: string; title?: string;
}) => {
  const c = command(id);
  const enabled = c ? c.enabled?.(store) ?? true : false;
  return (
    <button className={className ?? `tool${iconOnly ? ' icon' : ''}${on ? ' on' : ''}`} disabled={!enabled} aria-label={label} title={title ?? label} aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()} onClick={() => run(store, id, arg)}>
      {children ?? <>{Icon && <Icon size={16} strokeWidth={S} />}{!iconOnly && <span>{label}</span>}</>}
    </button>
  );
};

/** Small preview of a fill and line drawn with the slide renderer's own paint code. */
export const Swatch = ({ store, fill, line, geom = 'rect', w = 40, h = 28, text, textColor }: { store: FrameStore; fill?: Fill; line?: Line | null; geom?: string; w?: number; h?: number; text?: string; textColor?: string }) => {
  const defs = new Defs(`sw${Math.random().toString(36).slice(2, 8)}`);
  const ctx = { theme: store.deck.masters[0]!.theme };
  const pad = 3;
  const g = geometry(geom, w - pad * 2, h - pad * 2);
  const p = isLineGeom(geom) ? { fill: 'none' } : paint(fill, ctx, store.deck, defs, { w, h });
  const st = line ? strokeOf(line, ctx, store.deck, defs) : null;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>{defs.items}</defs>
      <g transform={`translate(${pad} ${pad})`}>
        {g.paths.map((x, i) => <path key={i} d={x.d} fill={x.fill === 'none' ? 'none' : p.fill} fillOpacity={p.fillOpacity}
          {...(st ? { ...st, strokeWidth: Math.min(st.strokeWidth, 2) } : isLineGeom(geom) ? { stroke: 'currentColor', strokeWidth: 1.6 } : { stroke: 'none' })} />)}
      </g>
      {text && <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={textColor ?? '#000'}>{text}</text>}
    </svg>
  );
};

/** Radio rows for a choice, used by the format pane. */
export const Radios = <T extends string>({ name, value, options, onChange }: { name: string; value: T | undefined; options: [T, string][]; onChange: (v: T) => void }) => (
  <div className="fmtradios" role="radiogroup" aria-label={name}>
    {options.map(([v, l]) => (
      <label key={v} className="check"><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} /> {l}</label>
    ))}
  </div>
);

/** Slider plus number for 0..100 percentages. */
export const Percent = ({ label, value, onChange, min = 0, max = 100 }: { label: string; value: number | undefined; onChange: (n: number) => void; min?: number; max?: number }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="fmtslider">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={v ?? 0} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => v !== undefined && onChange(v)} onKeyUp={() => v !== undefined && onChange(v)} aria-label={label} />
      <input type="number" inputMode="numeric" min={min} max={max} value={v === undefined ? '' : Math.round(v)} aria-label={`${label} (%)`}
        onChange={(e) => setV(e.target.value === '' ? undefined : Number(e.target.value))}
        onBlur={() => { if (v !== undefined && Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v))); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && v !== undefined) onChange(Math.max(min, Math.min(max, v))); }} />
      <span className="unit">%</span>
    </label>
  );
};
