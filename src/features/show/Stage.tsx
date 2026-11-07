import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { InkStroke, Media, Shape, Slide } from '../../model/deck';
import { ShowController } from './controller';
import { applyLooks, morphRun, ShowSlide } from './render';
import { evaluate, settled } from './timeline';
import { play, resolveTransition } from './transitions';
import { hash } from './effects';
import { AcrossPlayer, mediaOf, playMedia, toggleMedia, wireMedia } from './media';

export const useShow = (c: ShowController): void => { useSyncExternalStore(c.subscribe, c.getVersion); };

/** Fits a w x h box inside an element. */
export const useFit = (ref: React.RefObject<HTMLElement | null>, W: number, H: number): { w: number; h: number } => {
  const [box, setBox] = useState({ w: W, h: H });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const win = el.ownerDocument.defaultView ?? window;
    const fit = () => {
      const k = Math.min(el.clientWidth / W, el.clientHeight / H) || 1;
      setBox({ w: Math.floor(W * k), h: Math.floor(H * k) });
    };
    fit();
    const RO = (win as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver ?? ResizeObserver;
    const ro = new RO(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, W, H]);
  return box;
};

interface Layer { key: number; slide: Slide; index: number }

const shapesMap = (s: Slide): Map<string, Shape> => new Map(s.shapes.map((x) => [x.id, x]));

/**
 * The animated slide area: draws the current slide (and the previous one while a transition runs),
 * plays transitions, applies animation looks every frame, runs media and draws ink.
 */
export const Stage = ({ c, interactive = true, transitions = true, primary = true, style }: {
  c: ShowController; interactive?: boolean; transitions?: boolean;
  /** The stage that plays sound and media audio (the audience view in presenter mode). */
  primary?: boolean; style?: CSSProperties;
}) => {
  useShow(c);
  const wrap = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const deck = c.deck;
  const box = useFit(wrap, deck.w, deck.h);
  const nav = c.nav;
  const slide = c.slide;
  const [layers, setLayers] = useState<Layer[]>(() => (slide ? [{ key: nav.id, slide, index: c.slideIndex }] : []));
  const layerEls = useRef(new Map<number, HTMLDivElement>());
  const across = useRef<AcrossPlayer | null>(null);
  across.current ??= new AcrossPlayer(() => root.current);

  // New slide: add its layer above the old one.
  useLayoutEffect(() => {
    if (!slide) return;
    setLayers((ls) => {
      if (ls.some((l) => l.key === nav.id)) return ls;
      const keep = nav.transition && transitions ? ls.slice(-1) : [];
      return [...keep, { key: nav.id, slide, index: c.slideIndex }];
    });
  }, [nav.id, slide, transitions, nav.transition, c]);

  // Run the transition once both layers are in the DOM.
  useEffect(() => {
    const cur = layers[layers.length - 1];
    if (!cur || cur.key !== nav.id) return;
    const prev = layers.length > 1 ? layers[0] : undefined;
    const toEl = layerEls.current.get(cur.key);
    const fromEl = prev ? layerEls.current.get(prev.key) : undefined;
    const t = cur.slide.transition;
    const finish = () => { setLayers((ls) => ls.filter((l) => l.key === cur.key)); if (primary) c.transitionDone(cur.key); };
    if (!prev || !toEl || !fromEl || !root.current || !t || t.name === 'none' || !nav.transition) { finish(); return; }
    const seed = hash(cur.slide.id + nav.id);
    let cancel: () => void;
    if (t.name === 'morph') {
      const fs = fromEl.querySelector('svg'), ts = toEl.querySelector('svg');
      if (!fs || !ts) { finish(); return; }
      const run = morphRun(fs, ts, prev.slide, cur.slide);
      const ms = Math.max(0, t.duration * 1000);
      const t0 = performance.now();
      let raf = 0;
      let stopped = false;
      const stop = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); run.end(); finish(); };
      const tick = (n: number) => { const k = Math.min(1, (n - t0) / (ms || 1)); run.frame(k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2); if (k >= 1) stop(); else raf = requestAnimationFrame(tick); };
      run.frame(0);
      raf = requestAnimationFrame(tick);
      cancel = stop;
    } else {
      const { def, option } = resolveTransition(t.name, t.option, seed);
      const r = play(def, { from: fromEl, to: toEl, root: root.current, w: box.w, h: box.h, option, seed }, t.duration);
      void r.done.then(finish);
      cancel = r.cancel;
    }
    return () => cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.length, nav.id]);

  // Animation loop: evaluate the timeline and write styles straight into the SVG.
  useEffect(() => {
    let raf = 0;
    let lastV = -1;
    const win = root.current?.ownerDocument.defaultView ?? window;
    const loop = () => {
      raf = win.requestAnimationFrame(loop);
      const cur = layers[layers.length - 1];
      if (!cur) return;
      const el = layerEls.current.get(cur.key);
      const svg = el?.querySelector('svg');
      if (!svg) return;
      const tl = c.timeline(cur.slide);
      if (!tl.items.length) return;
      const now = performance.now() / 1000;
      const ps = cur.key === c.nav.id ? { ...c.ps, now } : { now, main: tl.main.map(() => -Infinity), trig: {} };
      const live = !settled(tl, ps) || tl.items.some((x) => !Number.isFinite(x.total));
      if (!live && lastV === c.psv + cur.key * 1e6) return;
      lastV = c.psv + cur.key * 1e6;
      const map = shapesMap(cur.slide);
      const looks = evaluate(tl, ps, { W: deck.w, H: deck.h, box: (id) => { const s = map.get(id); return s ? { x: s.x, y: s.y, w: s.w, h: s.h } : { x: 0, y: 0, w: 1, h: 1 }; } });
      applyLooks(svg, looks, { shapes: map, split: tl.split });
    };
    raf = win.requestAnimationFrame(loop);
    return () => win.cancelAnimationFrame(raf);
  }, [layers, c, deck]);

  // Media: wire elements of the current slide; autoplay after the transition.
  useEffect(() => {
    const cur = layers[layers.length - 1];
    if (!cur || cur.key !== nav.id || layers.length > 1) return;
    const el = layerEls.current.get(cur.key);
    if (!el) return;
    const shapes = mediaOf(cur.slide);
    const narrationOff = !!deck.show.noNarration;
    const sync = () => {
      for (const m of shapes) {
        const box_ = el.querySelector<HTMLElement>(`[data-media="${CSS.escape(m.id)}"]`);
        const me = el.querySelector<HTMLMediaElement>(`[data-media-el="${CSS.escape(m.id)}"]`);
        if (!box_ || !me) continue;
        const hide = m.mediaType === 'audio' ? (m.hideWhenStopped || m.acrossSlides) : m.hideWhenStopped;
        box_.style.visibility = hide && (me.paused || m.acrossSlides) ? 'hidden' : '';
        box_.dataset.playing = me.paused ? '' : '1';
      }
    };
    for (const m of shapes) {
      const me = el.querySelector<HTMLMediaElement>(`[data-media-el="${CSS.escape(m.id)}"]`);
      if (!me) continue;
      const isNarration = m.name.startsWith('Narration');
      wireMedia(me, m, { onState: sync, muted: !primary || (narrationOff && isNarration) });
      if (m.acrossSlides && m.mediaType === 'audio') {
        if (primary && m.autoplay) across.current!.start(deck, m, narrationOff && isNarration);
        continue;
      }
      if (m.autoplay) playMedia(me, m, true);
    }
    sync();
    // Stop across-slide audio that this slide doesn't carry once it ends naturally: keep playing (that's the point).
    return () => {
      for (const me of el.querySelectorAll<HTMLMediaElement>('[data-media-el]')) me.pause();
    };
  }, [layers, nav.id, c, deck, primary]);

  useEffect(() => () => across.current?.stopAll(), []);

  // Full screen video: media with "play full screen" gets the layer's full size while playing.
  const onLayerClick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const t = e.target as Element;
    if (t.closest?.('[data-media-bar]')) return;
    const mediaBox = t.closest?.('[data-media]') as HTMLElement | null;
    if (mediaBox) {
      const id = mediaBox.dataset.media!;
      const m = c.slide?.shapes.find((s): s is Media => s.id === id && s.kind === 'media');
      const me = mediaBox.querySelector<HTMLMediaElement>('[data-media-el]');
      if (m && me) {
        const tl = c.timeline(c.slide);
        if (tl.triggers[id]) c.trigger(id);
        toggleMedia(me, m);
        if (m.mediaType === 'video' && m.fullScreen && !me.paused) void (me as HTMLVideoElement).requestFullscreen?.().catch(() => undefined);
        e.stopPropagation();
        (e.nativeEvent as Event & { __handled?: boolean }).__handled = true;
      }
    }
  };

  return (
    <div className="show-stage" ref={wrap} style={style}>
      <div className="show-root" ref={root} style={{ width: box.w, height: box.h, transform: c.zoom.k !== 1 ? `scale(${c.zoom.k}) translate(${c.zoom.x}px, ${c.zoom.y}px)` : undefined }} onPointerUp={onLayerClick}>
        {layers.map((l) => (
          <div key={l.key} className="show-layer" ref={(el) => { if (el) layerEls.current.set(l.key, el); else layerEls.current.delete(l.key); }}>
            <ShowSlide deck={deck} slide={l.slide} slideNumber={l.index + 1} />
          </div>
        ))}
        <InkLayer c={c} w={box.w} h={box.h} interactive={interactive} />
      </div>
    </div>
  );
};

// ---------- Ink ----------

const strokePath = (s: InkStroke): string => {
  const p = s.points;
  if (!p.length) return '';
  if (p.length === 1) return `M${p[0]![0]} ${p[0]![1]}l0.1 0`;
  let d = `M${p[0]![0].toFixed(1)} ${p[0]![1].toFixed(1)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i]![0] + p[i + 1]![0]) / 2, my = (p[i]![1] + p[i + 1]![1]) / 2;
    d += `Q${p[i]![0].toFixed(1)} ${p[i]![1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const l = p[p.length - 1]!;
  return `${d}L${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
};

const InkLayer = ({ c, w, h, interactive }: { c: ShowController; w: number; h: number; interactive: boolean }) => {
  const deck = c.deck;
  const drawing = useRef<InkStroke | null>(null);
  const [laser, setLaser] = useState<{ x: number; y: number } | null>(null);
  const strokes = c.inkFor(c.slide);
  const tool = c.tool;
  const toSlide = (e: React.PointerEvent): [number, number] => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * deck.w, ((e.clientY - r.top) / r.height) * deck.h];
  };
  const erase = (x: number, y: number) => {
    const list = c.inkFor(c.slide);
    const r = 14;
    const keep = list.filter((s) => !s.points.some(([px, py]) => Math.hypot(px - x, py - y) < r + s.width));
    if (keep.length !== list.length) { c.ink[c.slide!.id] = keep; c.emit(); }
  };
  const active = interactive && !!tool;
  return (
    <svg className={`show-ink${active ? ' on' : ''}${tool === 'laser' ? ' laser' : ''}`} viewBox={`0 0 ${deck.w} ${deck.h}`} width={w} height={h}
      onPointerDown={(e) => {
        if (!active) return;
        e.stopPropagation();
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        const [x, y] = toSlide(e);
        if (tool === 'laser') { setLaser({ x, y }); return; }
        if (tool === 'eraser') { erase(x, y); return; }
        const hl = tool === 'highlighter';
        drawing.current = { tool: hl ? 'highlighter' : 'pen', color: hl ? c.highlightColor : c.penColor, width: hl ? 18 : 3.5, points: [[x, y, e.pressure || 0.5]] };
        c.inkFor(c.slide).push(drawing.current);
        c.emit();
      }}
      onPointerMove={(e) => {
        if (!active) return;
        const [x, y] = toSlide(e);
        if (tool === 'laser') { setLaser({ x, y }); return; }
        if (e.buttons === 0 && e.pointerType === 'mouse') return;
        if (tool === 'eraser') { erase(x, y); return; }
        const d = drawing.current;
        if (!d) return;
        const last = d.points[d.points.length - 1]!;
        if (Math.hypot(last[0] - x, last[1] - y) < 1.5) return;
        d.points.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, e.pressure || 0.5]);
        c.emit();
      }}
      onPointerUp={(e) => { if (active) e.stopPropagation(); drawing.current = null; if (tool === 'laser' && e.pointerType !== 'mouse') setLaser(null); }}
      onPointerLeave={() => setLaser(null)}>
      {strokes.map((s, i) => <path key={i} d={strokePath(s)} fill="none" stroke={typeof s.color === 'string' ? s.color : '#E8401C'} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" opacity={s.tool === 'highlighter' ? 0.45 : 1} style={s.tool === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined} />)}
      {tool === 'laser' && laser && (
        <g pointerEvents="none">
          <circle cx={laser.x} cy={laser.y} r={16} fill={c.laserColor} opacity={0.25} />
          <circle cx={laser.x} cy={laser.y} r={7} fill={c.laserColor} />
        </g>
      )}
    </svg>
  );
};
