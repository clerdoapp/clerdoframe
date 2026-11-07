import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Grid2x2, Minus, MonitorUp, Pause, Play, Plus, RotateCcw, Search, Square } from 'lucide-react';
import { textOf } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { S } from '../../ui/kit';
import type { ShowController } from './controller';
import { CaptionBar, fmt, MoreMenu, Overview, Prompt, Screens, ShowSurface, SubtitleButton, ToolPicker, useClock, useShowInput } from './ShowView';
import { Stage, useShow } from './Stage';
import { ShowSlide } from './render';

export const AUDIENCE = 'clerdoframe-audience';

/** Copies the page's styles and fonts into a new window so the portal looks the same. */
const copyStyles = (from: Document, to: Document): void => {
  to.title = 'ClerdoFrame slide show';
  for (const n of from.querySelectorAll('style, link[rel="stylesheet"]')) to.head.appendChild(n.cloneNode(true));
  try {
    for (const f of from.fonts) (to.fonts as FontFaceSet & { add: (f: FontFace) => void }).add(f);
  } catch { /* fonts copied through the stylesheets */ }
  to.documentElement.style.background = '#000';
  to.body.style.margin = '0';
  to.body.style.background = '#000';
  to.body.style.overflow = 'hidden';
  const mount = to.createElement('div');
  mount.id = 'audience-root';
  mount.style.cssText = 'position:fixed;inset:0';
  to.body.appendChild(mount);
};

export const openAudience = (): Window | null => {
  let w: Window | null = null;
  try {
    const sx = (window.screen as Screen & { availLeft?: number }).availLeft ?? 0;
    w = window.open('', AUDIENCE, `popup=yes,width=${Math.max(800, screen.availWidth)},height=${Math.max(450, screen.availHeight)},left=${sx + 40},top=40`);
  } catch { w = null; }
  if (!w || w.closed) return null;
  try { if (!w.document.getElementById('audience-root')) { w.document.open(); w.document.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'); w.document.close(); copyStyles(document, w.document); } } catch { w.close(); return null; }
  return w;
};

const AudiencePortal = ({ c, win }: { c: ShowController; win: Window }) => {
  const mount = win.document.getElementById('audience-root');
  useEffect(() => {
    const close = () => { if (!c.ended) c.finish(); };
    win.addEventListener('pagehide', close);
    const fs = () => { void win.document.documentElement.requestFullscreen?.().catch(() => undefined); win.removeEventListener('pointerdown', fs); };
    win.addEventListener('pointerdown', fs);
    return () => { win.removeEventListener('pagehide', close); win.removeEventListener('pointerdown', fs); };
  }, [c, win]);
  if (!mount) return null;
  return createPortal(<div className="show-overlay audience"><ShowSurface c={c} bar={false} primary win={win} /></div>, mount);
};

/** Next slide, or the current one when animations remain. */
const NextPreview = ({ c }: { c: ShowController }) => {
  const remaining = c.remainingClicks();
  const next = c.slideAt(c.pos + 1);
  if (remaining > 0) return <div className="pv-next"><div className="pv-thumb"><ShowSlide deck={c.deck} slide={c.slide!} mode="thumb" /></div><span>{remaining} more {remaining === 1 ? 'animation' : 'animations'} on this slide</span></div>;
  if (!next) return <div className="pv-next"><div className="pv-thumb end">End of slide show</div><span>Last slide</span></div>;
  return <div className="pv-next"><div className="pv-thumb"><SlideView deck={c.deck} slide={next} mode="thumb" style={{ width: '100%', height: '100%' }} /></div><span>Next: slide {c.order[c.pos + 1]! + 1}</span></div>;
};

export const PresenterView = ({ c, audience, onSwap, sameScreen, setSameScreen }: { c: ShowController; audience: Window | null; onSwap: () => void; sameScreen: boolean; setSameScreen: (v: boolean) => void }) => {
  useShow(c);
  const t = useClock(500);
  const [timer, setTimer] = useState({ start: performance.now() / 1000, pausedAt: 0 as number, paused: false });
  const [notesSize, setNotesSize] = useState(18);
  const [split, setSplit] = useState(62);
  const input = useShowInput(c, () => undefined);
  const elapsed = (timer.paused ? timer.pausedAt : t) - timer.start;
  const notes = textOf(c.slide?.notes);
  const drag = useRef<number | null>(null);
  return (
    <div className="presenter" onPointerMove={(e) => { if (drag.current !== null) setSplit(Math.max(30, Math.min(80, (e.clientX / window.innerWidth) * 100))); }} onPointerUp={() => { drag.current = null; }}>
      <div className="pv-top">
        <div className="pv-timer">
          <span className="mono big">{fmt(elapsed)}</span>
          <button className="show-btn" aria-label={timer.paused ? 'Resume timer' : 'Pause timer'} title={timer.paused ? 'Resume timer' : 'Pause timer'} onClick={() => setTimer(timer.paused ? { start: timer.start + (t - timer.pausedAt), pausedAt: 0, paused: false } : { ...timer, pausedAt: t, paused: true })}>{timer.paused ? <Play size={16} strokeWidth={S} /> : <Pause size={16} strokeWidth={S} />}</button>
          <button className="show-btn" aria-label="Restart timer" title="Restart timer" onClick={() => setTimer({ start: performance.now() / 1000, pausedAt: performance.now() / 1000, paused: timer.paused })}><RotateCcw size={16} strokeWidth={S} /></button>
        </div>
        <span className="mono">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <div className="grow" />
        {!audience && <span className="muted small">{sameScreen ? 'Presenter view on this screen' : 'Showing slides only'}</span>}
        {!audience && <button className="show-btn wide" onClick={() => setSameScreen(!sameScreen)}><MonitorUp size={16} strokeWidth={S} /> {sameScreen ? 'Show slides only' : 'Show presenter view'}</button>}
        {audience && <button className="show-btn wide" onClick={onSwap}><ArrowLeftRight size={16} strokeWidth={S} /> Swap displays</button>}
        <button className="show-btn wide danger" onClick={() => c.end()}><Square size={14} strokeWidth={S} /> End show</button>
      </div>
      <div className="pv-main">
        <div className="pv-left" style={{ width: `${split}%` }}>
          <div className="pv-current" onPointerDown={input.onPointerDown} onPointerMove={input.onPointerMove} onPointerUp={input.onPointerUp} onPointerCancel={input.onPointerCancel}>
            <Stage c={c} primary={!audience} transitions={!audience} />
            <Screens c={c} />
            {!audience && <CaptionBar c={c} />}
          </div>
          <div className="pv-tools" onPointerUp={(e) => e.stopPropagation()}>
            <ToolPicker c={c} compact />
            <button className="show-btn" aria-label="See all slides" title="See all slides" onClick={() => { c.overview = true; c.emit(); }}><Grid2x2 size={18} strokeWidth={S} /></button>
            <button className={`show-btn${c.zoom.k > 1 ? ' on' : ''}`} aria-label="Zoom" title="Zoom in" onClick={() => { c.zoom = c.zoom.k > 1 ? { k: 1, x: 0, y: 0 } : { k: 2, x: 0, y: 0 }; c.emit(); }}><Search size={18} strokeWidth={S} /></button>
            <button className={`show-btn${c.screen === 'black' ? ' on' : ''}`} aria-label="Black screen" title="Black screen" onClick={() => { c.screen = c.screen === 'black' ? null : 'black'; c.emit(); }}><Square size={16} strokeWidth={S} fill="currentColor" /></button>
            <SubtitleButton c={c} />
            <MoreMenu c={c} />
            <div className="grow" />
            <button className="show-btn" aria-label="Previous" title="Previous" onClick={() => c.prev()}><ChevronLeft size={20} strokeWidth={S} /></button>
            <span className="show-count">Slide {c.slideIndex + 1} of {c.deck.slides.length}</span>
            <button className="show-btn" aria-label="Next" title="Next" onClick={() => c.next()}><ChevronRight size={20} strokeWidth={S} /></button>
          </div>
        </div>
        <div className="pv-split" role="separator" aria-orientation="vertical" onPointerDown={(e) => { drag.current = e.clientX; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); }} />
        <div className="pv-right">
          <NextPreview c={c} />
          <div className="pv-notes-head">
            <span>Notes</span>
            <div className="grow" />
            <button className="show-btn" aria-label="Smaller notes text" title="Smaller notes text" onClick={() => setNotesSize(Math.max(10, notesSize - 2))}><Minus size={16} strokeWidth={S} /></button>
            <button className="show-btn" aria-label="Larger notes text" title="Larger notes text" onClick={() => setNotesSize(Math.min(64, notesSize + 2))}><Plus size={16} strokeWidth={S} /></button>
          </div>
          <div className="pv-notes" style={{ fontSize: notesSize }}>{notes.trim() ? notes : <span className="muted">No notes on this slide.</span>}</div>
        </div>
      </div>
      {c.overview && <Overview c={c} />}
      <Prompt c={c} />
    </div>
  );
};

/** Presenter mode root: the presenter view here and the audience window (or same-screen fallback). */
export const PresenterRoot = ({ c }: { c: ShowController }) => {
  useShow(c);
  const [audience, setAudience] = useState<Window | null>(() => (c.presenterSameScreen ? null : (c as ShowController & { audienceWin?: Window | null }).audienceWin ?? null));
  const [sameScreen, setSameScreen] = useState(true);
  const [swapped, setSwapped] = useState(false);
  useEffect(() => {
    const prev = c.hooks.finish;
    c.hooks.finish = () => { prev?.(); if (audience && !audience.closed) audience.close(); };
    return () => { c.hooks.finish = prev; };
  }, [c, audience]);
  useEffect(() => {
    if (!audience) return;
    const t = setInterval(() => { if (audience.closed) { setAudience(null); } }, 500);
    return () => clearInterval(t);
  }, [audience]);
  if (audience) {
    // Swapping puts the slides here and the presenter view in the other window.
    return (
      <>
        {swapped ? <ShowSurface c={c} bar={false} primary={false} /> : <PresenterView c={c} audience={audience} onSwap={() => setSwapped(true)} sameScreen={false} setSameScreen={() => undefined} />}
        {swapped ? <SwappedPortal c={c} win={audience} onSwap={() => setSwapped(false)} /> : <AudiencePortal c={c} win={audience} />}
      </>
    );
  }
  if (!sameScreen) return <div className="pv-alone"><ShowSurface c={c} /><button className="show-btn wide pv-back" onClick={() => setSameScreen(true)}><MonitorUp size={16} strokeWidth={S} /> Presenter view</button></div>;
  return <PresenterView c={c} audience={null} onSwap={() => undefined} sameScreen={sameScreen} setSameScreen={setSameScreen} />;
};

const SwappedPortal = ({ c, win, onSwap }: { c: ShowController; win: Window; onSwap: () => void }) => {
  const mount = win.document.getElementById('audience-root');
  if (!mount) return null;
  return createPortal(<div className="show-overlay audience light"><PresenterView c={c} audience={win} onSwap={onSwap} sameScreen={false} setSameScreen={() => undefined} /></div>, mount);
};

