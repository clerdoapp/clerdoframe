import { useEffect, useRef, type PointerEvent as RPE } from 'react';
import type { FrameStore } from '../../app/store';
import type { Ink } from '../../model/deck';
import { RULER_H, rulerOf } from './state';

/** Ruler drawn over the slide: drag to move, two fingers or the round handle to turn. */
export const RulerLayer = ({ store, scale }: { store: FrameStore; scale: number }) => {
  const r = rulerOf(store);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; y: number; angle: number; px: number; py: number; a0?: number; mid?: { x: number; y: number } } | null>(null);
  if (!r.on) return null;
  const toSlide = (e: RPE<SVGElement>): { x: number; y: number } => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: e.clientX / scale, y: e.clientY / scale };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const down = (e: RPE<SVGElement>, mode: 'move' | 'rotate') => {
    e.stopPropagation();
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    const p = toSlide(e);
    pointers.current.set(e.pointerId, p);
    start.current = { x: r.x, y: r.y, angle: r.angle, px: p.x, py: p.y };
    if (mode === 'rotate') start.current.a0 = Math.atan2(p.y - r.y, p.x - r.x);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      start.current = { ...start.current, a0: Math.atan2(b.y - a.y, b.x - a.x), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  };
  const move = (e: RPE<SVGElement>) => {
    const st = start.current;
    if (!st || !pointers.current.has(e.pointerId)) return;
    e.stopPropagation();
    const p = toSlide(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2 && st.mid) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      r.angle = snapAngle(st.angle + ((ang - st.a0!) * 180) / Math.PI);
      r.x = st.x + mid.x - st.mid.x; r.y = st.y + mid.y - st.mid.y;
    } else if (st.a0 !== undefined && !st.mid) {
      r.angle = snapAngle(st.angle + ((Math.atan2(p.y - r.y, p.x - r.x) - st.a0) * 180) / Math.PI);
    } else {
      r.x = st.x + p.x - st.px; r.y = st.y + p.y - st.py;
    }
    store.emit();
  };
  const up = (e: RPE<SVGElement>) => { pointers.current.delete(e.pointerId); if (!pointers.current.size) start.current = null; };
  const L = r.len, H = RULER_H;
  const ticks = [];
  for (let k = 0; k <= L; k += 9.6) {
    const big = Math.round(k / 9.6) % 10 === 0, mid = Math.round(k / 9.6) % 5 === 0;
    ticks.push(<line key={k} x1={k - L / 2} x2={k - L / 2} y1={-H / 2} y2={-H / 2 + (big ? 16 : mid ? 11 : 6)} stroke="#3a3a3a" strokeWidth={big ? 1.2 : 0.8} />);
    if (big && k > 0 && k < L) ticks.push(<text key={`t${k}`} x={k - L / 2} y={-H / 2 + 28} fontSize={10} textAnchor="middle" fill="#3a3a3a" fontFamily="system-ui, sans-serif">{Math.round(k / 96)}</text>);
  }
  const rotHandle = { x: L / 2 - 22, y: 8 };
  return (
    <g transform={`translate(${r.x} ${r.y}) rotate(${r.angle})`} style={{ touchAction: 'none' }} aria-label="Ruler">
      <rect x={-L / 2} y={-H / 2} width={L} height={H} rx={6} fill="rgba(250,250,250,0.88)" stroke="#9a9a9a" strokeWidth={1}
        style={{ cursor: 'move', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.25))' }}
        onPointerDown={(e) => down(e, 'move')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <g style={{ pointerEvents: 'none' }}>{ticks}</g>
      <text x={0} y={H / 2 - 9} fontSize={11} textAnchor="middle" fill="#555" fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>{`${Math.round(((-r.angle % 360) + 360) % 360)}°`}</text>
      <circle cx={rotHandle.x} cy={rotHandle.y} r={11} fill="#fff" stroke="#666" strokeWidth={1.2} style={{ cursor: 'grab' }} aria-label="Turn ruler"
        onPointerDown={(e) => down(e, 'rotate')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <path d={`M${rotHandle.x - 5} ${rotHandle.y + 2}a5 5 0 1 1 3 4`} fill="none" stroke="#444" strokeWidth={1.4} style={{ pointerEvents: 'none' }} />
    </g>
  );
};

/** Snaps near multiples of 15 degrees. */
const snapAngle = (a: number): number => {
  const n = Math.round(a / 15) * 15;
  return Math.abs(a - n) < 2 ? n : a;
};

/** Replay clock shared with the ink renderer: while set, ink in edit view draws only the points reached so far. */
export interface Replay { start: number; slide: number; perMs: number; order: string[]; offsets: Record<string, number>; total: number }
let replay: Replay | null = null;
export const replayState = (): Replay | null => replay;

/** Points of `inkId` to draw at time `now`, or undefined when no replay runs. */
export const replayBudget = (inkId: string, now = performance.now()): number | undefined => {
  if (!replay) return undefined;
  const off = replay.offsets[inkId];
  if (off === undefined) return undefined;
  return Math.max(0, (now - replay.start) * replay.perMs - off);
};

export const startReplay = (store: FrameStore): void => {
  const inks = store.shapes().filter((s): s is Ink => s.kind === 'ink' && !s.hidden);
  if (!inks.length) { store.notify('There is no ink on this slide to replay.'); return; }
  const offsets: Record<string, number> = {};
  let total = 0;
  for (const ink of inks) { offsets[ink.id] = total; total += ink.strokes.reduce((a, st) => a + st.points.length, 0); }
  replay = { start: performance.now(), slide: store.cur, perMs: Math.max(0.12, total / 4500), order: inks.map((i) => i.id), offsets, total };
  store.ext.inkReplay = true;
  store.emit();
};

export const stopReplay = (store: FrameStore): void => { replay = null; store.ext.inkReplay = false; store.emit(); };

/** Drives replay frames; renders nothing itself. */
export const ReplayDriver = ({ store }: { store: FrameStore }) => {
  const on = !!store.ext.inkReplay;
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = () => {
      const r = replay;
      if (!r || r.slide !== store.cur || (performance.now() - r.start) * r.perMs > r.total + 40) { stopReplay(store); return; }
      store.emit();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, store]);
  return null;
};
