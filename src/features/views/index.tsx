import './views.css';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BookOpenText, ChevronDown, ChevronLeft, ChevronRight, Columns2, Contrast, FileText, Grid2x2, Grid3x3, LayoutPanelTop, Maximize, MonitorSmartphone,
  NotebookText, Palette, Presentation, Rows3, Ruler, Search, SquareStack, Star, StickyNote, SunMoon, AppWindow, Magnet,
} from 'lucide-react';
import { command, openDialog, registerCommands, run } from '../../app/commands';
import { desktop } from '../../app/files';
import { registerDialog, registerPanelSection, registerView, type DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { textBody, textOf, type Deck, type Slide } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { Btn, Check, Dialog, NumberField, S, Select } from '../../ui/kit';
import { registerMasterView } from './master';
import { applyOutline, demote, joinUp, outlineOf, promote, splitLine, type OLine } from './outline';
import { registerPageMasters } from './pages';

const hash = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; };
const slideKey = (deck: Deck, s: Slide): string => {
  const m = deck.masters.find((x) => x.layouts.some((l) => l.id === s.layout));
  return `${hash(JSON.stringify(s))}:${m ? hash(JSON.stringify(m.theme) + JSON.stringify(m.background) + JSON.stringify(m.shapes.filter((x) => !x.ph)) + JSON.stringify(m.layouts.find((l) => l.id === s.layout))) : 0}:${deck.w}x${deck.h}`;
};
const Thumb = memo(({ deck, slide, n, w }: { deck: Deck; slide: Slide; n: number; w: number; k: string }) => <SlideView deck={deck} slide={slide} width={w} slideNumber={n} />,
  (a, b) => a.k === b.k && a.w === b.w && a.n === b.n);

// ---------- Outline ----------

const OutlineView = ({ store }: { store: FrameStore }) => {
  const deck = store.deck;
  const [lines, setLines] = useState<OLine[]>(() => outlineOf(deck));
  const [focus, setFocus] = useState<{ i: number; caret: number } | null>(null);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const editing = useRef(false);
  const ver = store.getVersion();
  // Pick up changes made elsewhere (undo, other views) when not mid-edit.
  useEffect(() => { if (!editing.current) setLines(outlineOf(store.deck)); }, [ver, store]);
  useLayoutEffect(() => {
    if (!focus) return;
    const el = refs.current[focus.i];
    if (el) { el.focus(); el.setSelectionRange(focus.caret, focus.caret); }
    setFocus(null);
  }, [focus]);
  useLayoutEffect(() => { for (const el of refs.current) if (el) { el.style.height = '0px'; el.style.height = `${el.scrollHeight}px`; } });

  const commit = (next: OLine[], focusLine: number, label = 'Edit outline') => {
    editing.current = true;
    const ok = store.tryChange(label, () => { const idx = applyOutline(store.deck, next, focusLine); store.cur = idx; store.slideSel = [idx]; });
    editing.current = false;
    setLines(outlineOf(store.deck));
    return ok;
  };
  let num = 0;
  const cur = store.slide;
  return (
    <div className="vw-outline">
      <div className="vw-olist" role="list" aria-label="Outline">
        {lines.map((l, i) => {
          if (l.level === 0) num++;
          const sIdx = num - 1;
          const s = deck.slides[sIdx];
          return (
            <div key={`${l.slide}-${i}`} className={`vw-oline lv${Math.min(l.level, 5)}${l.level === 0 && sIdx === store.cur ? ' on' : ''}`} role="listitem" style={{ paddingInlineStart: l.level ? 44 + (l.level - 1) * 26 : 0 }}>
              {l.level === 0 && (
                <button className="vw-onum" onClick={() => store.goto(sIdx)} onDoubleClick={() => run(store, 'view.mode', 'normal')} title={`Slide ${num}`} aria-label={`Slide ${num}`}>
                  <span>{num}</span><SquareStack size={14} strokeWidth={S} className={s?.hidden ? 'hid' : ''} />
                </button>
              )}
              {l.level > 0 && <span className="vw-obul" aria-hidden>{l.level === 1 ? '•' : '–'}</span>}
              <textarea ref={(el) => { refs.current[i] = el; }} rows={1} value={l.text} spellCheck aria-label={l.level === 0 ? `Slide ${num} title` : `Slide ${num} text`}
                placeholder={l.level === 0 ? 'Title' : ''}
                onFocus={() => { const idx = lines.slice(0, i + 1).filter((x) => x.level === 0).length - 1; if (idx >= 0 && idx !== store.cur) { store.cur = idx; store.slideSel = [idx]; store.emit(); } }}
                onChange={(e) => { const v = e.target.value.replace(/\n/g, ' '); setLines(lines.map((x, k) => (k === i ? { ...x, text: v, para: undefined } : x))); }}
                onBlur={() => { const orig = outlineOf(store.deck); if (JSON.stringify(orig.map((x) => [x.level, x.text])) !== JSON.stringify(lines.map((x) => [x.level, x.text]))) commit(lines, i); }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  const el = e.currentTarget;
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const r = splitLine(lines, i, el.selectionStart);
                    if (commit(r.lines, r.focus)) setFocus({ i: r.focus, caret: 0 });
                  } else if (e.key === 'Tab') {
                    e.preventDefault();
                    const caret = el.selectionStart;
                    const next = e.shiftKey ? promote(lines, i) : demote(lines, i);
                    if (next !== lines && commit(next, i)) setFocus({ i, caret });
                  } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
                    if (l.level > 0 && l.text === '' ) { e.preventDefault(); const r = joinUp(lines, i); if (r && commit(r.lines, r.focus)) setFocus({ i: r.focus, caret: r.caret }); return; }
                    const r = joinUp(lines, i);
                    if (r) { e.preventDefault(); if (commit(r.lines, r.focus)) setFocus({ i: r.focus, caret: r.caret }); }
                  } else if (e.key === 'ArrowUp' && el.selectionStart === 0 && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus(); }
                  else if (e.key === 'ArrowDown' && el.selectionEnd === el.value.length && i < lines.length - 1) { e.preventDefault(); refs.current[i + 1]?.focus(); }
                }} />
            </div>
          );
        })}
        <p className="muted small vw-ohint">Enter adds a line. Tab moves a line in; Shift+Tab moves it out and can start a new slide.</p>
      </div>
      <div className="vw-oside">
        {cur && <div className="vw-oprev"><SlideView deck={deck} slide={cur} slideNumber={store.cur + 1} /></div>}
        {cur && <NotesBox store={store} slide={cur} />}
      </div>
    </div>
  );
};

const NotesBox = ({ store, slide, big }: { store: FrameStore; slide: Slide; big?: boolean }) => {
  const [text, setText] = useState(textOf(slide.notes));
  useEffect(() => { setText(textOf(slide.notes)); }, [slide.id, slide.notes]);
  const commit = () => { if (text !== textOf(slide.notes)) store.tryChange('Edit notes', () => { slide.notes = textBody(text); }); };
  return (
    <textarea className={`vw-notes${big ? ' big' : ''}`} aria-label="Speaker notes" placeholder="Click to add notes" value={text} spellCheck
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.stopPropagation()} />
  );
};

// ---------- Slide sorter ----------

const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.round(s % 60).toString().padStart(2, '0')}`;

const SorterView = ({ store }: { store: FrameStore }) => {
  const deck = store.deck;
  const [zoom, setZoom] = useState(() => { try { return Number(localStorage.getItem('clerdoframe.sorterZoom')) || 220; } catch { return 220; } });
  const [drag, setDrag] = useState<{ from: number[]; over: number } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => { try { localStorage.setItem('clerdoframe.sorterZoom', String(zoom)); } catch { /* ignore */ } }, [zoom]);
  useEffect(() => { grid.current?.focus(); }, []);
  const sel = store.slideSel;
  const click = (i: number, e: React.MouseEvent | React.PointerEvent) => {
    if (e.shiftKey) { const a = Math.min(store.cur, i), b = Math.max(store.cur, i); store.slideSel = Array.from({ length: b - a + 1 }, (_, k) => a + k); }
    else if (e.metaKey || e.ctrlKey) { store.slideSel = sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]; if (!store.slideSel.length) store.slideSel = [i]; }
    else store.slideSel = [i];
    store.cur = i; store.emit();
  };
  const cols = () => { const el = grid.current; if (!el) return 1; return Math.max(1, Math.floor((el.clientWidth - 24) / (zoom + 28))); };
  const sectionAt = new Map(deck.sections.map((s) => [s.first, s]));
  let collapsed = false;
  const blocks: React.ReactNode[] = [];
  let cards: React.ReactNode[] = [];
  const flush = (k: string) => { if (cards.length) { blocks.push(<div key={`g${k}`} className="vw-sgrid">{cards}</div>); cards = []; } };
  deck.slides.forEach((s, i) => {
    const sec = sectionAt.get(s.id);
    if (sec) {
      flush(String(i));
      collapsed = !!sec.collapsed;
      const end = deck.sections.find((x, k) => k > deck.sections.indexOf(sec) && x);
      const count = (end ? deck.slides.findIndex((x) => x.id === end.first) : deck.slides.length) - i;
      blocks.push(
        <button key={`s${sec.id}`} className="vw-shead" aria-expanded={!sec.collapsed} onClick={() => store.tryChange('!Collapse section', () => { sec.collapsed = !sec.collapsed; })}
          onContextMenu={(e) => { e.preventDefault(); store.menu = { x: e.clientX, y: e.clientY, kind: 'section', data: sec.id }; store.emit(); }}>
          {sec.collapsed ? <ChevronRight size={15} strokeWidth={S} /> : <ChevronDown size={15} strokeWidth={S} />}{sec.name}<span className="muted">({count} slide{count === 1 ? '' : 's'})</span>
        </button>,
      );
    }
    if (collapsed) return;
    const on = sel.includes(i);
    const anim = (s.transition && s.transition.name !== 'none') || s.animations.length > 0;
    cards.push(
      <div key={s.id} className="vw-scard" style={{ width: zoom }} role="option" aria-selected={on} draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-clerdoframe-slides', ''); setDrag({ from: on ? [...sel].sort((a, b) => a - b) : [i], over: i }); }}
        onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const over = e.clientX < r.left + r.width / 2 ? i : i + 1; if (over !== drag.over) setDrag({ ...drag, over }); }}
        onDrop={(e) => { e.preventDefault(); if (drag) run(store, 'slide.move', { from: drag.from, to: drag.over }); setDrag(null); }}
        onDragEnd={() => setDrag(null)}>
        {drag && drag.over === i && <div className="vw-sdrop l" />}
        {drag && drag.over === i + 1 && <div className="vw-sdrop r" />}
        <div className={`thumb${store.cur === i ? ' on' : on ? ' sel' : ''}${s.hidden ? ' hid' : ''}`} onClick={(e) => click(i, e)} onDoubleClick={() => { store.goto(i); run(store, 'view.mode', 'normal'); }}
          onContextMenu={(e) => { e.preventDefault(); if (!on) click(i, e); store.menu = { x: e.clientX, y: e.clientY, kind: 'slide', data: i }; store.emit(); }}>
          <Thumb deck={deck} slide={s} n={i + 1} w={zoom} k={slideKey(deck, s)} />
        </div>
        <div className="vw-smeta">
          {anim ? <button className="vw-star" aria-label="Preview transition" title="Preview transition" onClick={() => { store.goto(i); if (command('transition.preview')) run(store, 'transition.preview'); }}><Star size={13} strokeWidth={S} /></button> : <span className="vw-star" />}
          {s.timing || s.transition?.advanceAfter ? <span className="muted">{fmtTime(s.timing ?? s.transition?.advanceAfter ?? 0)}</span> : null}
          <span className={`grow vw-snum${s.hidden ? ' hid' : ''}`}>{i + 1}</span>
        </div>
      </div>,
    );
  });
  flush('end');
  return (
    <div className="vw-sorter">
      <div className="vw-sbar">
        <span className="muted small">{deck.slides.length} slide{deck.slides.length === 1 ? '' : 's'}{sel.length > 1 ? `, ${sel.length} selected` : ''}</span>
        <div className="grow" />
        <Search size={14} strokeWidth={S} aria-hidden />
        <input type="range" min={110} max={480} value={zoom} aria-label="Thumbnail size" onChange={(e) => setZoom(Number(e.target.value))} />
      </div>
      <div className="vw-sbody" ref={grid} tabIndex={0} role="listbox" aria-multiselectable="true" aria-label="Slides"
        onKeyDown={(e) => {
          const n = deck.slides.length, k = e.key;
          const go = (i: number) => { const j = Math.max(0, Math.min(n - 1, i)); if (e.shiftKey) { const a = Math.min(store.cur, j), b = Math.max(store.cur, j); store.slideSel = Array.from({ length: b - a + 1 }, (_, x) => a + x); store.cur = j; store.emit(); } else store.goto(j); };
          if (k === 'ArrowRight') { e.preventDefault(); go(store.cur + 1); }
          else if (k === 'ArrowLeft') { e.preventDefault(); go(store.cur - 1); }
          else if (k === 'ArrowDown') { e.preventDefault(); go(store.cur + cols()); }
          else if (k === 'ArrowUp') { e.preventDefault(); go(store.cur - cols()); }
          else if (k === 'Home') { e.preventDefault(); go(0); }
          else if (k === 'End') { e.preventDefault(); go(n - 1); }
          else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); run(store, 'slide.delete'); }
          else if (k === 'Enter') { e.preventDefault(); run(store, 'view.mode', 'normal'); }
          else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'a') { e.preventDefault(); store.slideSel = deck.slides.map((_, i) => i); store.emit(); }
          else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'd') { e.preventDefault(); run(store, 'slide.duplicate'); }
          else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'c') { e.preventDefault(); run(store, 'slide.copy'); }
          else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'x') { e.preventDefault(); run(store, 'slide.cut'); }
          else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'v') { e.preventDefault(); run(store, 'slide.paste'); }
        }}
        onContextMenu={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); store.menu = { x: e.clientX, y: e.clientY, kind: 'slidelist' }; store.emit(); } }}>
        {blocks}
        {!deck.slides.length && <div className="empty"><button className="primary" onClick={() => run(store, 'slide.new')}>New slide</button></div>}
      </div>
    </div>
  );
};

// ---------- Notes page ----------

const NotesPageView = ({ store }: { store: FrameStore }) => {
  const slide = store.slide;
  const deck = store.deck;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  if (!slide) return <div className="empty">There are no slides.</div>;
  return (
    <div className="vw-npage-wrap" ref={ref} tabIndex={-1}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLTextAreaElement) return;
        if (e.key === 'PageDown' || e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); store.goto(store.cur + 1); }
        if (e.key === 'PageUp' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); store.goto(store.cur - 1); }
      }}>
      <div className="vw-npage" role="document" aria-label={`Notes page ${store.cur + 1}`}>
        <div className="vw-nslide"><SlideView deck={deck} slide={slide} slideNumber={store.cur + 1} /></div>
        <NotesBox store={store} slide={slide} big />
        <div className="vw-nfoot muted small">{store.cur + 1}</div>
      </div>
      <div className="vw-nnav">
        <button className="ico" aria-label="Previous page" title="Previous page (Page Up)" disabled={store.cur === 0} onClick={() => store.goto(store.cur - 1)}><ChevronLeft size={18} strokeWidth={S} /></button>
        <span className="muted small">Page {store.cur + 1} of {deck.slides.length}</span>
        <button className="ico" aria-label="Next page" title="Next page (Page Down)" disabled={store.cur >= deck.slides.length - 1} onClick={() => store.goto(store.cur + 1)}><ChevronRight size={18} strokeWidth={S} /></button>
      </div>
    </div>
  );
};

// ---------- Dialogs ----------

const GridDialog = ({ store, close }: DialogProps) => {
  const v = store.view;
  const [snap, setSnap] = useState(v.snapToGrid);
  const [shapes, setShapes] = useState(v.snapToShapes);
  const [size, setSize] = useState(+(v.gridSize / 96 * 2.54).toFixed(2));
  const [grid, setGrid] = useState(v.grid);
  const [guides, setGuides] = useState(v.guides);
  const [smart, setSmart] = useState(store.ext.smartGuides !== false);
  const [unit, setUnit] = useState<'cm' | 'in'>(() => { try { return localStorage.getItem('clerdoframe.unit') === 'in' ? 'in' : 'cm'; } catch { return 'cm'; } });
  const toPx = (n: number) => Math.max(2, Math.round(unit === 'cm' ? (n / 2.54) * 96 : n * 96));
  const fromPx = (px: number, u: 'cm' | 'in') => +(u === 'cm' ? (px / 96) * 2.54 : px / 96).toFixed(2);
  return (
    <Dialog title="Grid and guides" close={close}
      onOk={() => {
        v.snapToGrid = snap; v.snapToShapes = shapes; v.gridSize = toPx(size); v.grid = grid; store.ext.smartGuides = smart;
        if (guides !== v.guides) run(store, 'view.guides'); else store.emit();
        try { localStorage.setItem('clerdoframe.unit', unit); } catch { /* ignore */ }
      }}
      footer={<button onClick={() => { setSnap(true); setShapes(true); setSize(fromPx(16, unit)); setGrid(false); setGuides(false); setSmart(true); }}>Set as default</button>}>
      <h3 className="vw-sub">Snap to</h3>
      <Check label="Snap objects to grid" checked={snap} onChange={setSnap} />
      <Check label="Snap objects to other objects" checked={shapes} onChange={setShapes} />
      <h3 className="vw-sub">Grid settings</h3>
      <div className="num2">
        <NumberField label="Spacing" value={size} step={unit === 'cm' ? 0.1 : 0.05} min={0.05} max={20} onChange={setSize} />
        <Select label="Unit" value={unit} options={[['cm', 'Centimeters'], ['in', 'Inches']]} onChange={(u) => { setSize(fromPx(toPx(size), u)); setUnit(u); }} />
      </div>
      <Check label="Display grid on screen" checked={grid} onChange={setGrid} />
      <h3 className="vw-sub">Guide settings</h3>
      <Check label="Display drawing guides on screen" checked={guides} onChange={setGuides} />
      <Check label="Display smart guides when shapes are aligned" checked={smart} onChange={setSmart} />
      <div className="rowx">
        <button className="tool" onClick={() => { v.guideLines = { ...v.guideLines, x: [...v.guideLines.x, Math.round(store.deck.w / 2)] }; v.guides = true; setGuides(true); store.emit(); }}>Add vertical guide</button>
        <button className="tool" onClick={() => { v.guideLines = { ...v.guideLines, y: [...v.guideLines.y, Math.round(store.deck.h / 2)] }; v.guides = true; setGuides(true); store.emit(); }}>Add horizontal guide</button>
      </div>
      {(v.guideLines.x.length > 0 || v.guideLines.y.length > 0) && <button className="tool" onClick={() => { v.guideLines = { x: [], y: [] }; store.emit(); }}>Remove all guides</button>}
    </Dialog>
  );
};

const ZoomDialog = ({ store, close }: DialogProps) => {
  const cur = typeof store.view.zoom === 'number' ? Math.round(store.view.zoom * 100) : null;
  const [pick, setPick] = useState<string>(cur === null ? 'fit' : String(cur));
  const [pct, setPct] = useState(cur ?? Math.round(((store.ext.fitScale as number) ?? 1) * 100));
  return (
    <Dialog title="Zoom" close={close} width={300}
      onOk={() => { store.view.zoom = pick === 'fit' ? 'fit' : Math.max(10, Math.min(400, pct)) / 100; store.emit(); }}>
      <div className="listbox" role="radiogroup" aria-label="Zoom">
        <label><input type="radio" checked={pick === 'fit'} onChange={() => setPick('fit')} /> Fit</label>
        {[400, 200, 100, 66, 50, 33].map((z) => <label key={z}><input type="radio" checked={pick === String(z)} onChange={() => { setPick(String(z)); setPct(z); }} /> {z}%</label>)}
      </div>
      <NumberField label="Percent" suffix="%" value={pct} min={10} max={400} onChange={(n) => { setPct(n); setPick(String(n)); }} />
    </Dialog>
  );
};

// ---------- Registration ----------

export const registerViews = (): void => {
  registerView({ mode: 'outline', render: (s) => <OutlineView store={s} /> });
  registerView({ mode: 'sorter', render: (s) => <SorterView store={s} /> });
  registerView({ mode: 'notesPage', render: (s) => <NotesPageView store={s} /> });
  registerMasterView(registerView);
  registerPageMasters();
  registerDialog('view.gridSettings', GridDialog);
  registerDialog('view.zoom', ZoomDialog);

  registerCommands([
    { id: 'view.gridSettings', label: 'Grid and guides…', group: 'View', run: (s) => openDialog(s, 'view.gridSettings') },
    { id: 'view.zoomDialog', label: 'Zoom…', group: 'View', run: (s) => openDialog(s, 'view.zoom') },
    { id: 'view.newWindow', label: 'New window', group: 'View', enabled: () => !!desktop, run: (s) => run(s, 'file.new') },
    { id: 'view.handoutMaster', label: 'Handout master', group: 'View', active: (s) => s.view.mode === 'handoutMaster', run: (s) => run(s, 'view.mode', s.view.mode === 'handoutMaster' ? 'normal' : 'handoutMaster') },
    { id: 'view.notesMaster', label: 'Notes master', group: 'View', active: (s) => s.view.mode === 'notesMaster', run: (s) => run(s, 'view.mode', s.view.mode === 'notesMaster' ? 'normal' : 'notesMaster') },
  ]);

  const B = (s: FrameStore, id: string, icon: typeof Ruler, label?: string) => <Btn store={s} id={id} icon={icon} {...(label ? { label } : {})} />;
  registerPanelSection({
    tab: 'view', title: 'Presentation views', order: 10, render: (s) => (
      <div className="toollist">
        {B(s, 'view.normal', LayoutPanelTop, 'Normal')}{B(s, 'view.outline', Columns2, 'Outline')}{B(s, 'view.sorter', Grid2x2, 'Slide sorter')}
        {B(s, 'view.notesPage', NotebookText, 'Notes page')}{B(s, 'view.reading', BookOpenText, 'Reading view')}
      </div>
    ),
  });
  registerPanelSection({
    tab: 'view', title: 'Master views', order: 20, render: (s) => (
      <div className="toollist">{B(s, 'view.master', Presentation, 'Slide master')}{B(s, 'view.handoutMaster', Rows3, 'Handout master')}{B(s, 'view.notesMaster', FileText, 'Notes master')}</div>
    ),
  });
  registerPanelSection({
    tab: 'view', title: 'Show', order: 30, render: (s) => (
      <div className="toollist">
        <Check label="Ruler" checked={s.view.ruler} onChange={() => run(s, 'view.ruler')} />
        <Check label="Gridlines" checked={s.view.grid} onChange={() => run(s, 'view.gridlines')} />
        <Check label="Guides" checked={s.view.guides} onChange={() => run(s, 'view.guides')} />
        <Check label="Notes" checked={s.view.notes} onChange={() => run(s, 'view.notes')} />
        <Check label="Slide thumbnails" checked={s.view.thumbs} onChange={() => run(s, 'view.thumbs')} />
        {B(s, 'view.gridSettings', Grid3x3)}
        <div className="vw-hint muted small"><Magnet size={12} strokeWidth={S} /> Snap to grid is {s.view.snapToGrid ? 'on' : 'off'}</div>
      </div>
    ),
  });
  registerPanelSection({
    tab: 'view', title: 'Zoom', order: 40, render: (s) => (
      <div className="toollist">{B(s, 'view.zoomDialog', Search, 'Zoom…')}{B(s, 'view.fit', Maximize, 'Fit to window')}</div>
    ),
  });
  registerPanelSection({
    tab: 'view', title: 'Color / Grayscale', order: 50, render: (s) => (
      <div className="toollist">{B(s, 'view.color', Palette)}{B(s, 'view.grayscale', Contrast)}{B(s, 'view.blackWhite', StickyNote)}</div>
    ),
  });
  registerPanelSection({
    tab: 'view', title: 'Window', order: 60, render: (s) => (
      <div className="toollist">
        {desktop && B(s, 'view.newWindow', AppWindow)}
        {B(s, 'view.theme', SunMoon, 'Switch light / dark')}
        <span className="muted small vw-hint"><MonitorSmartphone size={12} strokeWidth={S} /> Interface only; slides keep their colors.</span>
      </div>
    ),
  });
};
