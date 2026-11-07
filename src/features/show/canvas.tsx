/** Things drawn over the editing canvas: animation numbers, motion paths, path drawing, and previews. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import { findShape, type Animation, type Slide } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { buildTimeline } from './timeline';
import { motionPathOf } from './timeline';
import { ends, withEnd } from './pathgeom';
import { ShowController } from './controller';
import { Stage } from './Stage';
import { countUnits } from './render';
import { resolveTransition, play } from './transitions';
import { hash } from './effects';

const animOpen = (s: FrameStore): boolean => s.view.mode === 'normal' && (s.view.panel === 'animations' || s.view.pane === 'animations');

/** Click-group number of every animation on a slide (0 = plays with the slide). */
export const groupNumbers = (slide: Slide): Map<string, number> => {
  const out = new Map<string, number>();
  const tl = buildTimeline(slide.animations.filter((a) => !a.triggerShape), (id, by) => countUnits(findShape(slide.shapes, id) ?? undefined, by));
  let n = 0;
  tl.main.forEach((st) => {
    if (!st.auto) n++;
    for (const it of st.items) if (!out.has(it.anim.id)) out.set(it.anim.id, st.auto ? 0 : n);
  });
  for (const a of slide.animations) if (a.triggerShape) out.set(a.id, -1);
  return out;
};

const Markers = ({ store, scale }: { store: FrameStore; scale: number }) => {
  const slide = store.slide;
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  if (!slide || !animOpen(store) || !slide.animations.length) return null;
  const k = 1 / Math.max(scale, 0.05);
  const nums = groupNumbers(slide);
  const byShape = new Map<string, Animation[]>();
  for (const a of slide.animations) { const l = byShape.get(a.shape) ?? []; l.push(a); byShape.set(a.shape, l); }
  const selAnim = store.ext.animSel as string | undefined;
  const toSlide = (e: React.PointerEvent) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * store.deck.w, y: ((e.clientY - r.top) / r.height) * store.deck.h };
  };
  return (
    <g className="anim-markers">
      {[...byShape.entries()].map(([sid, list]) => {
        const sh = findShape(slide.shapes, sid);
        if (!sh) return null;
        const size = 18 * k;
        return list.map((a, i) => {
          const n = nums.get(a.id) ?? 0;
          const on = a.id === selAnim;
          return (
            <g key={a.id} transform={`translate(${sh.x - size - 3 * k} ${sh.y + i * (size + 2 * k)})`} role="button" aria-label={`Animation ${n}`} style={{ cursor: 'pointer' }}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); run(store, 'anim.select', a.id); }}>
              <rect width={size} height={size} rx={3 * k} fill={on ? '#d93a17' : '#fffcfb'} stroke="#d93a17" strokeWidth={1.2 * k} />
              <text x={size / 2} y={size * 0.7} fontSize={11 * k} fontWeight={700} fill={on ? '#fff' : '#d93a17'} textAnchor="middle" fontFamily="Hanken Grotesk, sans-serif">{n < 0 ? 'T' : n}</text>
            </g>
          );
        });
      })}
      {slide.animations.filter((a) => a.cls === 'path').map((a) => {
        const sh = findShape(slide.shapes, a.shape);
        if (!sh) return null;
        const d = motionPathOf(a, store.deck.w, store.deck.h);
        const [s0, e0] = ends(d);
        const cx = sh.x + sh.w / 2 - s0[0], cy = sh.y + sh.h / 2 - s0[1];
        const end = drag?.id === a.id ? { x: drag.x - cx, y: drag.y - cy } : { x: e0[0], y: e0[1] };
        const shownD = drag?.id === a.id ? withEnd(d, [end.x, end.y]) : d;
        const on = a.id === selAnim || store.sel.includes(a.shape);
        return (
          <g key={`p${a.id}`} transform={`translate(${cx} ${cy})`} opacity={on ? 1 : 0.55}>
            <path d={shownD} fill="none" stroke="#7a7f88" strokeWidth={1.5 * k} strokeDasharray={`${5 * k} ${3 * k}`} pointerEvents="none" />
            <circle cx={s0[0]} cy={s0[1]} r={5 * k} fill="#1FA971" stroke="#fff" strokeWidth={1.2 * k} pointerEvents="none" />
            <circle cx={end.x} cy={end.y} r={(on ? 7 : 5) * k} fill="#d93a17" stroke="#fff" strokeWidth={1.2 * k} style={{ cursor: on ? 'move' : 'default', touchAction: 'none' }}
              onPointerDown={(e) => { if (!on) return; e.stopPropagation(); e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId); const p = toSlide(e); setDrag({ id: a.id, x: p.x, y: p.y }); }}
              onPointerMove={(e) => { if (drag?.id !== a.id) return; const p = toSlide(e); setDrag({ id: a.id, x: p.x, y: p.y }); }}
              onPointerUp={() => { if (drag?.id !== a.id) return; const nd = withEnd(d, [Math.round(drag.x - cx), Math.round(drag.y - cy)]); setDrag(null); run(store, 'anim.update', { id: a.id, set: { path: nd }, label: 'Move path end' }); }} />
          </g>
        );
      })}
    </g>
  );
};

/** Drawing a custom motion path: press and drag over the slide. */
const PathDraw = ({ store }: { store: FrameStore }) => {
  const [pts, setPts] = useState<[number, number][]>([]);
  if (!store.ext.drawPath) return null;
  const sh = store.one();
  const toSlide = (e: React.PointerEvent): [number, number] => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const r = svg.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * store.deck.w, ((e.clientY - r.top) / r.height) * store.deck.h];
  };
  const finish = () => {
    store.ext.drawPath = false;
    if (sh && pts.length > 1) {
      const [x0, y0] = pts[0]!;
      const d = `M0 0 ${pts.slice(1).map(([x, y]) => `L${Math.round(x - x0)} ${Math.round(y - y0)}`).join(' ')}`;
      run(store, 'anim.apply', { cls: 'path', effect: 'custom', add: true });
      const a = store.slide?.animations.at(-1);
      if (a) run(store, 'anim.update', { id: a.id, set: { path: d }, label: 'Custom path' });
    }
    setPts([]);
    store.emit();
  };
  return (
    <g>
      <rect width={store.deck.w} height={store.deck.h} fill="rgba(0,0,0,0.02)" style={{ cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId); const p = toSlide(e); setPts(sh ? [[sh.x + sh.w / 2, sh.y + sh.h / 2], p] : [p]); }}
        onPointerMove={(e) => { if (!pts.length) return; const p = toSlide(e); const l = pts[pts.length - 1]!; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 6) setPts([...pts, p]); }}
        onPointerUp={(e) => { e.stopPropagation(); finish(); }} />
      {pts.length > 1 && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#d93a17" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />}
    </g>
  );
};

/** Paints copied animations on the next selected shapes. */
const painterWatch = (store: FrameStore): void => {
  const p = store.ext.animPainter as { from: string; anims: Animation[] } | undefined;
  if (!p) return;
  const targets = store.sel.filter((id) => id !== p.from && store.slide?.shapes.some((x) => x.id === id));
  if (!targets.length) return;
  const sl = store.slide!;
  store.ext.animPainter = undefined;
  queueMicrotask(() => store.tryChange('Animation painter', () => {
    for (const id of targets) {
      sl.animations = sl.animations.filter((a) => a.shape !== id);
      for (const a of p.anims) sl.animations.push({ ...structuredClone(a), id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, shape: id });
    }
  }));
};

// ---------- Preview over the canvas ----------

const canvasEl = (): HTMLElement | null => document.querySelector<HTMLElement>('.canvas');

/** Plays the slide's animations, or its transition, over the editing canvas. */
const PreviewHost = ({ store }: { store: FrameStore }) => {
  const pv = store.ext.preview as { kind: 'anims' | 'transition'; at: number; only?: string; from?: string } | undefined;
  const [ctl, setCtl] = useState<ShowController | null>(null);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const tRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pv) return;
    const host = canvasEl();
    const slide = store.slide;
    if (!host || !slide || store.view.mode !== 'normal') { store.ext.preview = undefined; return; }
    setEl(host);
    const stop = () => { store.ext.preview = undefined; setCtl(null); store.emit(); };
    if (pv.kind === 'anims') {
      let anims = slide.animations;
      if (pv.only) anims = anims.filter((a) => a.id === pv.only).map((a) => ({ ...a, trigger: 'after' as const, delay: 0, triggerShape: undefined }) as Animation);
      else if (pv.from) { const i = anims.findIndex((a) => a.id === pv.from); anims = anims.slice(Math.max(0, i)); }
      // Triggers play too, in order.
      anims = anims.map((a, i) => ({ ...a, triggerShape: undefined, trigger: i === 0 ? 'after' : a.trigger }) as Animation);
      const tmp: Slide = { ...slide, animations: anims };
      const sDeck = { ...store.deck, slides: store.deck.slides.map((x) => (x === slide ? tmp : x)) };
      const fake = { deck: sDeck, cur: store.cur, show: null, ext: {}, emit: () => undefined, notify: () => undefined, tryChange: () => false } as unknown as FrameStore;
      const c = new ShowController(fake, { mode: 'reading', order: [store.cur], autoplay: true });
      c.hooks.finish = () => setTimeout(stop, 250);
      setCtl(c);
      const cancel = (e: PointerEvent) => { if (!(e.target as Element).closest?.('.anim-preview')) return; c.finish(); stop(); };
      window.addEventListener('pointerdown', cancel, true);
      const safety = setTimeout(() => { c.finish(); stop(); }, 60_000);
      return () => { window.removeEventListener('pointerdown', cancel, true); clearTimeout(safety); c.finish(); };
    }
    // Transition: animate from the previous slide (or black) to this one.
    let cancel = () => undefined as void;
    const raf = requestAnimationFrame(() => {
      const root = tRoot.current;
      const t = slide.transition;
      if (!root || !t || t.name === 'none') { stop(); return; }
      const [from, to] = [root.children[0] as HTMLElement, root.children[1] as HTMLElement];
      const w = root.clientWidth, h = root.clientHeight;
      if (t.name === 'morph') {
        void import('./render').then(({ morphRun }) => {
          const prev = store.deck.slides[store.cur - 1];
          const fs = from.querySelector('svg'), ts = to.querySelector('svg');
          if (!prev || !fs || !ts) { stop(); return; }
          const r = morphRun(fs, ts, prev, slide);
          const t0 = performance.now();
          const tick = (n: number) => { const k = Math.min(1, (n - t0) / Math.max(1, t.duration * 1000)); r.frame(k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2); if (k < 1) requestAnimationFrame(tick); else { r.end(); stop(); } };
          requestAnimationFrame(tick);
        });
        return;
      }
      const seed = hash(`${slide.id}${pv.at}`);
      const { def, option } = resolveTransition(t.name, t.option, seed);
      const p = play(def, { from, to, root, w, h, option, seed }, t.duration);
      cancel = p.cancel;
      void p.done.then(() => setTimeout(stop, 200));
    });
    return () => { cancelAnimationFrame(raf); cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pv?.at]);
  if (!pv || !el) return null;
  const slide = store.slide;
  if (!slide) return null;
  if (pv.kind === 'anims') return ctl ? createPortal(<div className="anim-preview" title="Click to stop"><Stage c={ctl} interactive={false} transitions={false} /></div>, el) : null;
  const prev = store.deck.slides[store.cur - 1];
  return createPortal(
    <div className="anim-preview tr" ref={tRoot}>
      <div className="show-layer">{prev ? <SlideView deck={store.deck} slide={prev} mode="thumb" style={{ width: '100%', height: '100%' }} /> : <div style={{ width: '100%', height: '100%', background: '#000' }} />}</div>
      <div className="show-layer"><SlideView deck={store.deck} slide={slide} mode="thumb" style={{ width: '100%', height: '100%' }}
        decorate={(s, n) => <g data-anim={s.id}>{n}</g>} /></div>
    </div>, el);
};

export const canvasLayer = (store: FrameStore, scale: number) => {
  painterWatch(store);
  return (
    <>
      <Markers store={store} scale={scale} />
      <PathDraw store={store} />
    </>
  );
};

export { PreviewHost };
