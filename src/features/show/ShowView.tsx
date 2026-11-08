import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft, ChevronRight, Captions, Eraser, Grid2x2, Highlighter, MoreHorizontal, Pause, PenLine, Play, Pointer, RotateCcw, Search, Timer, X, Mic, Video,
} from 'lucide-react';
import { findShape, type Shape, type Slide } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { S } from '../../ui/kit';
import { ShowController, showBarExtras, type InkTool } from './controller';
import { Stage, useShow } from './Stage';
import { CAPTION_FONT, Captioner, captionPrefs, captionsSupported } from './captions';

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(r).padStart(2, '0')}`;
};
export { fmt };

export const useClock = (ms = 500): number => {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
  return performance.now() / 1000;
};

const PEN_COLORS = ['#E8401C', '#2C7BE5', '#1FA971', '#F5A623', '#111111', '#FFFFFF'];

/** Hit test: the top-level shape (and link) under a click on the stage. */
const hitShape = (target: Element, slide: Slide | undefined): { shape: Shape | null; link: Shape['link'] } => {
  if (!slide) return { shape: null, link: undefined };
  const wrap = target.closest?.('[data-anim]') as SVGGElement | null;
  const id = wrap?.dataset.anim;
  const shape = id ? findShape(slide.shapes, id) : null;
  // A text run link.
  const span = target.closest?.('span');
  if (shape && shape.kind === 'shape' && span) {
    const p = span.closest('p');
    const ps = p ? [...(p.parentElement?.children ?? [])].indexOf(p) : -1;
    const ri = p ? [...p.querySelectorAll(':scope > span:not([data-bullet])')].indexOf(span) : -1;
    const run = shape.text?.paras[ps]?.runs.filter((r) => !r.br)[ri];
    if (run?.style?.link) return { shape, link: run.style.link };
  }
  return { shape, link: shape?.link };
};

/** Shared input handling for the show surface. Returns handlers for pointer events. */
export const useShowInput = (c: ShowController, onMenu: (x: number, y: number) => void, target: Window = window) => {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (c.prompt) { if (e.key === 'Escape') c.answer(false); return; }
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (/^[0-9]$/.test(k) && !mod) { c.typed += k; stop(); return; }
      if (k === 'Enter' && c.typed) { const n = parseInt(c.typed, 10); c.typed = ''; if (n >= 1) c.goto(n - 1); stop(); return; }
      if (c.typed && k !== 'Shift') c.typed = '';
      if (mod && (k === 'p' || k === 'P')) { stop(); c.setTool('pen'); return; }
      if (mod && (k === 'l' || k === 'L')) { stop(); c.setTool('laser'); return; }
      if (mod && (k === 'e' || k === 'E')) { stop(); c.setTool('eraser'); return; }
      if (mod && (k === 'h' || k === 'H')) { stop(); c.hidePointer = !c.hidePointer; c.emit(); return; }
      if (mod && k === 'a') { stop(); c.tool = null; c.hidePointer = false; c.emit(); return; }
      if (mod) return;
      switch (k) {
        case 'ArrowRight': case 'ArrowDown': case ' ': case 'Enter': case 'n': case 'N': case 'PageDown': stop(); c.next(); return;
        case 'ArrowLeft': case 'ArrowUp': case 'Backspace': case 'p': case 'P': case 'PageUp': stop(); c.prev(); return;
        case 'Home': stop(); c.first(); return;
        case 'End': stop(); c.last(); return;
        case 'b': case 'B': case '.': stop(); c.screen = c.screen === 'black' ? null : 'black'; c.emit(); return;
        case 'w': case 'W': case ',': stop(); c.screen = c.screen === 'white' ? null : 'white'; c.emit(); return;
        case 'Escape':
          stop();
          if (c.overview) { c.overview = false; c.emit(); return; }
          if (c.tool) { c.tool = null; c.emit(); return; }
          if (c.zoom.k !== 1) { c.zoom = { k: 1, x: 0, y: 0 }; c.emit(); return; }
          c.end(); return;
        case 'g': case 'G': case '-':
          stop();
          if (k === '-' && c.zoom.k > 1) { c.zoom = { ...c.zoom, k: Math.max(1, c.zoom.k - 0.5) }; if (c.zoom.k === 1) c.zoom = { k: 1, x: 0, y: 0 }; c.emit(); return; }
          c.overview = !c.overview; c.emit(); return;
        case '+': case '=': stop(); c.zoom = { ...c.zoom, k: Math.min(4, c.zoom.k + 0.5) }; c.emit(); return;
        case 'e': case 'E': stop(); c.clearInk(); return;
        case 'h': case 'H': stop(); c.nextHidden(); return;
        case 's': case 'S': case 'Pause': stop(); c.togglePause(); return;
        case 'F5': stop(); return;
        default:
      }
    };
    target.addEventListener('keydown', key, true);
    return () => target.removeEventListener('keydown', key, true);
  }, [c, target]);

  const start = useRef<{ x: number; y: number; t: number; id: number; moved: boolean; long: ReturnType<typeof setTimeout> | null; pinch?: number; k?: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const onPointerDown = (e: React.PointerEvent) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      if (start.current?.long) clearTimeout(start.current.long);
      start.current = { x: 0, y: 0, t: 0, id: -1, moved: true, long: null, pinch: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: c.zoom.k };
      return;
    }
    const long = e.pointerType !== 'mouse' ? setTimeout(() => { if (start.current && !start.current.moved) { start.current.moved = true; onMenu(e.clientX, e.clientY); } }, 600) : null;
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false, long };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    const prev = pts.current.get(e.pointerId)!;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = start.current;
    if (!st) return;
    if (st.pinch && pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const k = Math.max(1, Math.min(4, (st.k ?? 1) * (d / st.pinch)));
      c.zoom = k === 1 ? { k: 1, x: 0, y: 0 } : { ...c.zoom, k };
      c.emit();
      return;
    }
    if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 12) { st.moved = true; if (st.long) clearTimeout(st.long); }
    if (c.zoom.k > 1 && st.moved && !c.tool) {
      c.zoom = { ...c.zoom, x: c.zoom.x + (e.clientX - prev.x) / c.zoom.k, y: c.zoom.y + (e.clientY - prev.y) / c.zoom.k };
      c.emit();
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    const st = start.current;
    if (!st || st.id !== e.pointerId) { if (!pts.current.size) start.current = null; return; }
    start.current = null;
    if (st.long) clearTimeout(st.long);
    if ((e.nativeEvent as Event & { __handled?: boolean }).__handled || c.tool) return;
    if ((e.target as Element).closest?.('.show-bar, .show-menu, .show-grid, .show-prompt, button, video, audio')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (st.moved) {
      if (c.zoom.k > 1) return;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) c.next(); else c.prev(); }
      return;
    }
    if (c.ended) { c.end(); return; }
    // Triggers, zoom links and hyperlinks take the click.
    const hit = hitShape(e.target as Element, c.slide);
    if (hit.shape && c.trigger(hit.shape.id)) return;
    if (hit.shape?.kind === 'zoom' && c.zoomTo(hit.shape)) return;
    if (hit.link && c.link(hit.link)) return;
    if (c.mode === 'reading' && e.pointerType === 'mouse') { c.next(); return; }
    if (e.pointerType !== 'mouse') {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (e.clientX < r.left + r.width * 0.3) c.prev(); else c.next();
      return;
    }
    c.next();
  };
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: (e: React.PointerEvent) => { pts.current.delete(e.pointerId); start.current = null; } };
};

// ---------- Pieces ----------

export const ToolPicker = ({ c, compact }: { c: ShowController; compact?: boolean }) => {
  const [open, setOpen] = useState(false);
  const pick = (t: InkTool) => { c.setTool(t); if (t !== 'pen' && t !== 'highlighter') setOpen(false); };
  return (
    <div className="show-pop">
      <button className={`show-btn${c.tool ? ' on' : ''}`} aria-label="Pen and laser" title="Pen and laser" onClick={() => setOpen(!open)}>
        {c.tool === 'laser' ? <Pointer size={18} strokeWidth={S} /> : c.tool === 'highlighter' ? <Highlighter size={18} strokeWidth={S} /> : c.tool === 'eraser' ? <Eraser size={18} strokeWidth={S} /> : <PenLine size={18} strokeWidth={S} />}
      </button>
      {open && (
        <div className={`show-menu${compact ? ' up' : ''}`} role="menu" onPointerUp={(e) => e.stopPropagation()}>
          <button className={c.tool === 'laser' ? 'on' : ''} onClick={() => pick('laser')}><Pointer size={16} strokeWidth={S} /> Laser pointer</button>
          <button className={c.tool === 'pen' ? 'on' : ''} onClick={() => pick('pen')}><PenLine size={16} strokeWidth={S} /> Pen</button>
          <button className={c.tool === 'highlighter' ? 'on' : ''} onClick={() => pick('highlighter')}><Highlighter size={16} strokeWidth={S} /> Highlighter</button>
          <button className={c.tool === 'eraser' ? 'on' : ''} onClick={() => pick('eraser')}><Eraser size={16} strokeWidth={S} /> Eraser</button>
          <button onClick={() => { c.clearInk(); setOpen(false); }}><X size={16} strokeWidth={S} /> Erase all ink on slide</button>
          <div className="show-colors">
            {PEN_COLORS.map((col) => (
              <button key={col} className={`sw${(c.tool === 'laser' ? c.laserColor : c.tool === 'highlighter' ? c.highlightColor : c.penColor) === col ? ' on' : ''}`} style={{ background: col }} aria-label={`Color ${col}`}
                onClick={() => { if (c.tool === 'laser') c.laserColor = col; else if (c.tool === 'highlighter') c.highlightColor = col; else c.penColor = col; c.emit(); }} />
            ))}
          </div>
          <button onClick={() => { c.tool = null; setOpen(false); c.emit(); }}>Arrow</button>
        </div>
      )}
    </div>
  );
};

export const MoreMenu = ({ c, extra }: { c: ShowController; extra?: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const hidden = c.deck.slides.map((s, i) => ({ s, i })).filter((x) => x.s.hidden);
  return (
    <div className="show-pop">
      <button className="show-btn" aria-label="More options" title="More options" onClick={() => setOpen(!open)}><MoreHorizontal size={18} strokeWidth={S} /></button>
      {open && (
        <div className="show-menu up right" role="menu" onPointerUp={(e) => e.stopPropagation()} onClick={() => setOpen(false)}>
          {extra}
          <button onClick={() => { c.screen = 'black'; c.emit(); }}>Black screen</button>
          <button onClick={() => { c.screen = 'white'; c.emit(); }}>White screen</button>
          {(c.advanceAfter() !== null || c.kiosk) && <button onClick={() => c.togglePause()}>{c.paused ? 'Resume' : 'Pause'}</button>}
          <button onClick={() => { c.hidePointer = !c.hidePointer; c.emit(); }}>{c.hidePointer ? 'Show pointer' : 'Hide pointer'}</button>
          {hidden.length > 0 && <div className="show-menu-h">Hidden slides</div>}
          {hidden.map(({ s, i }) => <button key={s.id} onClick={() => c.goto(i)}>Slide {i + 1}{s.name ? `: ${s.name}` : ''}</button>)}
          <div className="show-menu-sep" />
          <button onClick={() => c.end()}>End show</button>
        </div>
      )}
    </div>
  );
};

export const Overview = ({ c }: { c: ShowController }) => {
  const deck = c.deck;
  return (
    <div className="show-grid" role="dialog" aria-label="All slides" onPointerUp={(e) => e.stopPropagation()}>
      <div className="show-grid-head"><span>All slides</span><button className="show-btn" aria-label="Close" onClick={() => { c.overview = false; c.emit(); }}><X size={18} strokeWidth={S} /></button></div>
      <div className="show-grid-list">
        {deck.slides.map((s, i) => (
          <button key={s.id} className={`show-grid-item${i === c.slideIndex ? ' on' : ''}${s.hidden ? ' hidden' : ''}`} onClick={() => c.goto(i, false)}>
            <SlideView deck={deck} slide={s} mode="thumb" style={{ width: '100%', height: 'auto' }} />
            <span>{i + 1}{s.hidden ? ' (hidden)' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const Prompt = ({ c }: { c: ShowController }) => {
  if (!c.prompt) return null;
  const total = Object.values(c.timings).reduce((a, b) => a + b, 0);
  return (
    <div className="show-prompt" role="alertdialog" aria-label={c.prompt === 'ink' ? 'Keep ink' : 'Keep timings'} onPointerUp={(e) => e.stopPropagation()}>
      <p>{c.prompt === 'ink' ? 'Keep your ink annotations on the slides?' : `The show took ${fmt(total)}. Keep these slide timings for the next show?`}</p>
      <div className="row">
        <button onClick={() => c.answer(false)}>{c.prompt === 'ink' ? 'Discard' : 'No'}</button>
        <button className="primary" autoFocus onClick={() => c.answer(true)}>{c.prompt === 'ink' ? 'Keep' : 'Yes'}</button>
      </div>
    </div>
  );
};

/** Live captions from the microphone (Web Speech API) when the browser has it. */
export const CaptionBar = ({ c }: { c: ShowController }) => {
  useEffect(() => {
    if (!c.subtitles) return;
    const cap = new Captioner((t) => { c.captions = t; c.emit(); }, () => { c.subtitles = false; c.emit(); });
    cap.start();
    return () => cap.stop();
  }, [c, c.subtitles, captionPrefs.lang]);
  if (!c.subtitles || !c.captions) return null;
  const top = captionPrefs.pos === 'top';
  return <div className="show-captions" aria-live="polite" style={{ fontSize: CAPTION_FONT[captionPrefs.size], ...(top ? { top: 24, bottom: 'auto' } : {}) }}>{c.captions}</div>;
};

export const SubtitleButton = ({ c }: { c: ShowController }) => captionsSupported() ? (
  <button className={`show-btn${c.subtitles ? ' on' : ''}`} aria-pressed={c.subtitles} aria-label="Subtitles" title="Subtitles" onClick={() => { c.subtitles = !c.subtitles; c.captions = ''; c.emit(); }}><Captions size={18} strokeWidth={S} /></button>
) : null;

/** Black or white screen and the end-of-show slide drawn above the stage. */
export const Screens = ({ c }: { c: ShowController }) => (
  <>
    {c.screen && <div className={`show-screen ${c.screen}`} onPointerUp={(e) => { e.stopPropagation(); c.screen = null; c.emit(); }} />}
    {c.ended && <div className="show-end" onPointerUp={(e) => { e.stopPropagation(); c.end(); }}>End of slide show, click to exit.</div>}
    {c.paused && !c.ended && <div className="show-paused">Paused</div>}
  </>
);

// ---------- Rehearse / record bar ----------

export const RehearseBar = ({ c }: { c: ShowController }) => {
  const t = useClock(250);
  const slideT = c.paused ? c.pausedAt - c.slideClock : t - c.slideClock;
  const total = Object.entries(c.timings).filter(([id]) => id !== c.slide?.id).reduce((a, [, v]) => a + v, 0) + slideT;
  const rec = c.mode === 'record';
  return (
    <div className="show-rehearse" onPointerUp={(e) => e.stopPropagation()}>
      {rec ? <Mic size={16} strokeWidth={S} className="recdot" /> : <Timer size={16} strokeWidth={S} />}
      <button className="show-btn" aria-label="Next" title="Next" onClick={() => c.next()}><ChevronRight size={18} strokeWidth={S} /></button>
      <button className="show-btn" aria-label={c.paused ? 'Resume' : 'Pause'} title={c.paused ? 'Resume' : 'Pause'} onClick={() => c.togglePause()}>{c.paused ? <Play size={16} strokeWidth={S} /> : <Pause size={16} strokeWidth={S} />}</button>
      <span className="mono">{fmt(slideT)}</span>
      {!rec && <button className="show-btn" aria-label="Repeat this slide" title="Repeat this slide" onClick={() => { c.slideClock = performance.now() / 1000; if (c.paused) c.pausedAt = c.slideClock; c.emit(); }}><RotateCcw size={16} strokeWidth={S} /></button>}
      <span className="mono muted">{fmt(total)}</span>
      {rec && c.camera && <Video size={16} strokeWidth={S} />}
      <button className="show-btn" aria-label="Stop" title="Stop" onClick={() => c.end()}><X size={16} strokeWidth={S} /></button>
    </div>
  );
};

// ---------- The audience / single-screen show ----------

export const ShowSurface = ({ c, bar = true, primary = true, win = window }: { c: ShowController; bar?: boolean; primary?: boolean; win?: Window }) => {
  useShow(c);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [idle, setIdle] = useState(false);
  const idleT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useShowInput(c, (x, y) => setMenu({ x, y }), win);
  const poke = () => { setIdle(false); if (idleT.current) clearTimeout(idleT.current); idleT.current = setTimeout(() => setIdle(true), 2500); };
  useEffect(() => { poke(); return () => { if (idleT.current) clearTimeout(idleT.current); }; }, []);
  const rehearse = c.mode === 'rehearse' || c.mode === 'record';
  const cursor = c.hidePointer || (idle && !c.tool) ? 'none' : c.tool === 'laser' ? 'none' : c.tool ? 'crosshair' : 'default';
  return (
    <div className="show-surface" style={{ cursor }} onPointerMove={(e) => { poke(); input.onPointerMove(e); }} onPointerDown={input.onPointerDown} onPointerUp={input.onPointerUp} onPointerCancel={input.onPointerCancel}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}>
      <Stage c={c} primary={primary} />
      <Screens c={c} />
      <CaptionBar c={c} />
      {c.typed && <div className="show-typed">Go to slide {c.typed}</div>}
      {rehearse && <RehearseBar c={c} />}
      {bar && !rehearse && !c.kiosk && (
        <div className={`show-bar${idle && !c.tool ? ' idle' : ''}`} onPointerUp={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button className="show-btn" aria-label="Previous" title="Previous" onClick={() => c.prev()}><ChevronLeft size={20} strokeWidth={S} /></button>
          <span className="show-count">{c.slideIndex + 1} / {c.deck.slides.length}</span>
          <button className="show-btn" aria-label="Next" title="Next" onClick={() => c.next()}><ChevronRight size={20} strokeWidth={S} /></button>
          <ToolPicker c={c} compact />
          <button className="show-btn" aria-label="See all slides" title="See all slides" onClick={() => { c.overview = true; c.emit(); }}><Grid2x2 size={18} strokeWidth={S} /></button>
          <button className={`show-btn${c.zoom.k > 1 ? ' on' : ''}`} aria-label="Zoom" title="Zoom in (press again to reset)" onClick={() => { c.zoom = c.zoom.k > 1 ? { k: 1, x: 0, y: 0 } : { k: 2, x: 0, y: 0 }; c.emit(); }}><Search size={18} strokeWidth={S} /></button>
          <SubtitleButton c={c} />
          {[...showBarExtras].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x) => <span key={x.id} style={{ display: 'contents' }}>{x.render(c)}</span>)}
          <MoreMenu c={c} />
        </div>
      )}
      {c.overview && <Overview c={c} />}
      {menu && (
        <div className="show-backdrop" onPointerDown={(e) => { e.stopPropagation(); setMenu(null); }} onPointerUp={(e) => e.stopPropagation()}>
          <div className="show-menu ctx" style={{ left: Math.min(menu.x, win.innerWidth - 220), top: Math.min(menu.y, win.innerHeight - 320) }} onPointerDown={(e) => e.stopPropagation()} onClick={() => setMenu(null)}>
            <button onClick={() => c.next()}>Next</button>
            <button onClick={() => c.prev()}>Previous</button>
            <button onClick={() => { c.overview = true; c.emit(); }}>See all slides</button>
            <button onClick={() => c.setTool('laser')}>Laser pointer</button>
            <button onClick={() => c.setTool('pen')}>Pen</button>
            <button onClick={() => c.clearInk()}>Erase all ink on slide</button>
            <button onClick={() => { c.screen = 'black'; c.emit(); }}>Black screen</button>
            <button onClick={() => { c.screen = 'white'; c.emit(); }}>White screen</button>
            <div className="show-menu-sep" />
            <button onClick={() => c.end()}>End show</button>
          </div>
        </div>
      )}
      <Prompt c={c} />
    </div>
  );
};
