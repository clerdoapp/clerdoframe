import { useEffect, useRef, useState } from 'react';
import { ChevronsLeft, Columns2, FolderOpen, Grid2x2, LayoutPanelTop, Maximize, MessageSquare, Minus, Play, Plus, Presentation, Redo2, Save, Search, StickyNote, Undo2, X, BookOpenText } from 'lucide-react';
import { allCommands, run } from '../app/commands';
import type { FrameStore } from '../app/store';
import { appOverlays, dialog, menuItems, pane, panelSections, railTabs } from '../app/registry';
import { prettyKeys } from './keys';
import { S } from './kit';

export const TopBar = ({ store }: { store: FrameStore }) => {
  const f = store.file;
  const state = store.deck.final ? 'Marked as final' : f.dirty ? 'Not saved yet' : f.lastSaved ? 'Saved' : '';
  return (
    <header className="topbar">
      <span className="wordmark">Clerdo<b>Frame</b></span>
      <input className="docname" aria-label="Presentation name" value={f.name} spellCheck={false}
        onChange={(e) => { store.file = { ...f, name: e.target.value.replace(/[\\/:*?"<>|]/g, '') }; store.emit(); }} />
      <span className="savestate" role="status">{state}</span>
      <div className="grow" />
      <button className="cmdsearch" onClick={() => run(store, 'app.palette')}>
        <Search size={15} strokeWidth={S} /> <span>Search commands</span> <kbd>{prettyKeys('Mod+K')}</kbd>
      </button>
      <div className="grow" />
      <button className="ico" aria-label="Undo" title={store.undoLabel ? `Undo ${store.undoLabel}` : 'Undo'} disabled={!store.canUndo} onClick={() => store.undo()}><Undo2 size={17} strokeWidth={S} /></button>
      <button className="ico" aria-label="Redo" title={store.redoLabel ? `Redo ${store.redoLabel}` : 'Redo'} disabled={!store.canRedo} onClick={() => store.redo()}><Redo2 size={17} strokeWidth={S} /></button>
      <button className="ico" aria-label="Comments" title="Comments" onClick={() => run(store, 'review.comments')}><MessageSquare size={17} strokeWidth={S} /></button>
      <button className="ico" aria-label="Open" title="Open" onClick={() => run(store, 'file.open')}><FolderOpen size={17} strokeWidth={S} /></button>
      <button className="ico" aria-label="Save" title={`Save (${prettyKeys('Mod+S')})`} onClick={() => run(store, 'file.save')}><Save size={17} strokeWidth={S} /></button>
      <button className="primary" onClick={() => run(store, 'show.fromCurrent')} title={`Present from this slide (${prettyKeys('Shift+F5')})`}><Play size={15} strokeWidth={S} /> Present</button>
    </header>
  );
};

export const Rail = ({ store }: { store: FrameStore }) => (
  <nav className="rail" aria-label="Tools">
    {railTabs().map((t) => (
      <button key={t.id} className={store.view.panel === t.id ? 'on' : ''} aria-pressed={store.view.panel === t.id}
        onClick={() => { store.view.panel = store.view.panel === t.id ? null : t.id; store.emit(); }}>
        <t.icon size={20} strokeWidth={S} /><span>{t.label}</span>
      </button>
    ))}
  </nav>
);

export const ToolPanel = ({ store }: { store: FrameStore }) => {
  const id = store.view.panel;
  if (!id) return null;
  const tab = railTabs().find((t) => t.id === id);
  if (!tab) return null;
  const secs = panelSections(id, store);
  return (
    <aside className="toolpanel" aria-label={tab.label}>
      <div className="phead"><h2>{tab.label}</h2><button className="ico sm" aria-label="Hide panel" title="Hide panel" onClick={() => { store.view.panel = null; store.emit(); }}><ChevronsLeft size={16} strokeWidth={S} /></button></div>
      <div className="pbody">
        {secs.map((s) => <section key={s.title} className="group"><h3>{s.title}</h3>{s.render(store)}</section>)}
      </div>
    </aside>
  );
};

export const PaneHost = ({ store }: { store: FrameStore }) => {
  const id = store.view.pane;
  const p = id ? pane(id) : undefined;
  if (!p) return null;
  return (
    <aside className="fpane" aria-label={p.title} style={p.width ? { width: p.width } : undefined}>
      <div className="phead"><h2>{p.title}</h2><button className="ico sm" aria-label="Close" onClick={() => { store.view.pane = null; store.emit(); }}><X size={16} strokeWidth={S} /></button></div>
      <div className="pbody">{p.render(store)}</div>
    </aside>
  );
};

export const StatusBar = ({ store }: { store: FrameStore }) => {
  const n = store.deck.slides.length;
  const v = store.view;
  const mode = (m: typeof v.mode) => () => { run(store, 'view.mode', m); };
  const zoomPct = typeof v.zoom === 'number' ? Math.round(v.zoom * 100) : null;
  return (
    <footer className="status">
      <span>{v.mode === 'master' ? 'Slide Master' : `Slide ${n ? store.cur + 1 : 0} of ${n}`}</span>
      {store.deck.final && <span className="pill">Read-only</span>}
      <div className="grow" />
      <button onClick={() => { v.notes = !v.notes; store.emit(); }} aria-pressed={v.notes} title="Notes"><StickyNote size={14} strokeWidth={S} />&nbsp;Notes</button>
      <div className="viewbtns">
        <button className={v.mode === 'normal' ? 'on' : ''} title="Normal" aria-label="Normal view" onClick={mode('normal')}><LayoutPanelTop size={15} strokeWidth={S} /></button>
        <button className={v.mode === 'outline' ? 'on' : ''} title="Outline" aria-label="Outline view" onClick={mode('outline')}><Columns2 size={15} strokeWidth={S} /></button>
        <button className={v.mode === 'sorter' ? 'on' : ''} title="Slide sorter" aria-label="Slide sorter" onClick={mode('sorter')}><Grid2x2 size={15} strokeWidth={S} /></button>
        <button className={v.mode === 'reading' ? 'on' : ''} title="Reading view" aria-label="Reading view" onClick={mode('reading')}><BookOpenText size={15} strokeWidth={S} /></button>
        <button title="Slide show" aria-label="Slide show" onClick={() => run(store, 'show.fromCurrent')}><Presentation size={15} strokeWidth={S} /></button>
      </div>
      <button aria-label="Zoom out" onClick={() => run(store, 'view.zoomOut')}><Minus size={14} strokeWidth={S} /></button>
      <input type="range" min={10} max={400} value={zoomPct ?? 100} aria-label="Zoom" onChange={(e) => { v.zoom = Number(e.target.value) / 100; store.emit(); }} />
      <button aria-label="Zoom in" onClick={() => run(store, 'view.zoomIn')}><Plus size={14} strokeWidth={S} /></button>
      <span className="zoomv">{zoomPct === null ? 'Fit' : `${zoomPct}%`}</span>
      <button aria-label="Fit slide to window" title="Fit slide to window" onClick={() => { v.zoom = 'fit'; store.emit(); }}><Maximize size={14} strokeWidth={S} /></button>
    </footer>
  );
};

export const DialogHost = ({ store }: { store: FrameStore }) => {
  const d = store.dialog;
  if (!d) return null;
  const close = () => { store.dialog = null; store.emit(); };
  const C = dialog(d.id);
  if (!C) { queueMicrotask(close); return null; }
  return <C key={d.id} store={store} data={d.data as never} close={close} />;
};

export const ContextMenu = ({ store }: { store: FrameStore }) => {
  const m = store.menu;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!m) return;
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ x: Math.max(4, Math.min(m.x, innerWidth - r.width - 6)), y: Math.max(4, Math.min(m.y, innerHeight - r.height - 6)) });
      el.querySelector<HTMLElement>('button')?.focus();
    }
    const close = (e: Event) => { if (!(e.target instanceof Node && ref.current?.contains(e.target))) { store.menu = null; store.emit(); } };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('blur', close); };
  }, [m, store]);
  if (!m) return null;
  const items = menuItems(m.kind, store, m.data);
  if (!items.length) return null;
  return (
    <div className="menu" ref={ref} role="menu" style={{ left: pos?.x ?? m.x, top: pos?.y ?? m.y, visibility: pos ? 'visible' : 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { store.menu = null; store.emit(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const bs = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
          const i = bs.indexOf(document.activeElement as HTMLButtonElement);
          bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
        }
      }}>
      {items.map((it, i) => it.sep ? <div key={i} className="sep" /> : (
        <button key={i} role="menuitem" disabled={it.disabled} onClick={() => {
          store.menu = null;
          if (it.run) it.run(store); else if (it.command) run(store, it.command, it.arg);
          store.emit();
        }}><span>{it.label}</span>{it.keys && <kbd>{prettyKeys(it.keys)}</kbd>}</button>
      ))}
    </div>
  );
};

export const Overlays = ({ store }: { store: FrameStore }) => <>{appOverlays().map((o) => <div key={o.id} style={{ display: 'contents' }}>{o.render(store)}</div>)}</>;

export const commandList = () => allCommands().filter((c) => !c.hidden);
