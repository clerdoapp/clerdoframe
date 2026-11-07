import { useState } from 'react';
import { ChevronDown, ChevronUp, MousePointerClick, Play, PlayCircle } from 'lucide-react';
import { run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import { findShape, type Animation } from '../../model/deck';
import { S } from '../../ui/kit';
import { effectDef } from './effects';
import { buildTimeline } from './timeline';
import { countUnits } from './render';
import { groupNumbers } from './canvas';
import { CLASS_ICON } from './icons';

/** Absolute start / end of each animation for the timeline bars, from the start of its click group. */
const bars = (store: FrameStore): Map<string, { start: number; end: number; inf: boolean }> => {
  const sl = store.slide!;
  const tl = buildTimeline(sl.animations, (id, by) => countUnits(findShape(sl.shapes, id) ?? undefined, by));
  const out = new Map<string, { start: number; end: number; inf: boolean }>();
  for (const steps of [tl.main, ...Object.values(tl.triggers)]) {
    for (const st of steps) {
      for (const it of st.items) {
        const prev = out.get(it.anim.id);
        const end = it.start + (Number.isFinite(it.total) ? it.total : it.dur);
        out.set(it.anim.id, { start: Math.min(prev?.start ?? Infinity, it.start), end: Math.max(prev?.end ?? 0, end), inf: !Number.isFinite(it.total) });
      }
    }
  }
  return out;
};

export const AnimationPane = ({ store }: { store: FrameStore }) => {
  const sl = store.slide;
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const [scaleK, setScaleK] = useState(1);
  if (!sl) return null;
  const list = sl.animations;
  const nums = groupNumbers(sl);
  const b = bars(store);
  const maxT = Math.max(2, ...[...b.values()].map((x) => x.end));
  const px = 60 * scaleK;
  const sel = store.ext.animSel as string | undefined;
  const menu = (e: React.MouseEvent | React.PointerEvent, a: Animation) => {
    e.preventDefault();
    run(store, 'anim.select', a.id);
    store.menu = { x: e.clientX, y: e.clientY, kind: 'animation', data: a.id };
    store.emit();
  };
  return (
    <div className="anim-pane">
      <div className="rowx">
        <button className="tool" onClick={() => run(store, sel ? 'anim.playFrom' : 'anim.preview')} disabled={!list.length}><Play size={15} strokeWidth={S} /> <span>{sel ? 'Play from' : 'Play all'}</span></button>
        {sel && <button className="tool" onClick={() => run(store, 'anim.preview')}><PlayCircle size={15} strokeWidth={S} /> <span>Play all</span></button>}
        <div className="grow" />
        <button className="ico sm" aria-label="Move earlier" title="Move earlier" disabled={!sel} onClick={() => run(store, 'anim.earlier')}><ChevronUp size={15} strokeWidth={S} /></button>
        <button className="ico sm" aria-label="Move later" title="Move later" disabled={!sel} onClick={() => run(store, 'anim.later')}><ChevronDown size={15} strokeWidth={S} /></button>
      </div>
      {!list.length && <p className="muted small pad">No animations on this slide. Select a shape and pick an effect in Animate.</p>}
      <ol className="anim-list" onPointerLeave={() => setDrag(drag ? { ...drag, over: -1 } : null)}>
        {list.map((a, i) => {
          const sh = findShape(sl.shapes, a.shape);
          const d = effectDef(a.cls, a.effect);
          const Icon = CLASS_ICON[a.cls];
          const n = nums.get(a.id) ?? 0;
          const bar = b.get(a.id);
          const showNum = n > 0 && (i === 0 || nums.get(list[i - 1]!.id) !== n);
          const trig = a.triggerShape ? findShape(sl.shapes, a.triggerShape) : null;
          const firstOfTrig = trig && (i === 0 || list[i - 1]!.triggerShape !== a.triggerShape);
          return (
            <li key={a.id}>
              {firstOfTrig && <div className="anim-trig"><MousePointerClick size={13} strokeWidth={S} /> Trigger: {trig.name || trig.kind}</div>}
              <div className={`anim-row ${a.cls}${sel === a.id ? ' on' : ''}${drag?.over === i ? ' drop' : ''}`} role="button" tabIndex={0}
                onClick={() => run(store, 'anim.select', a.id)} onDoubleClick={() => run(store, 'anim.options')} onContextMenu={(e) => menu(e, a)}
                onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { run(store, 'anim.select', a.id); run(store, 'anim.remove'); } if (e.key === 'Enter') run(store, 'anim.options'); }}
                draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ id: a.id, over: i }); }}
                onDragOver={(e) => { e.preventDefault(); if (drag) setDrag({ ...drag, over: i }); }}
                onDrop={(e) => { e.preventDefault(); if (drag) run(store, 'anim.move', { id: drag.id, to: i }); setDrag(null); }}
                onDragEnd={() => setDrag(null)}>
                <span className="anim-num">{showNum ? n : ''}</span>
                <span className={`anim-ico ${a.cls}`}><Icon size={14} strokeWidth={S} /></span>
                <span className="anim-label">
                  <b>{sh?.name || 'Missing shape'}</b>
                  <span className="muted small">{d?.label ?? a.effect}{a.trigger === 'with' ? ' · with previous' : a.trigger === 'after' ? ' · after previous' : ''}</span>
                </span>
                <span className="anim-bar" style={{ width: Math.min(140, maxT * px) }} aria-hidden>
                  {bar && <span className={`fill${bar.inf ? ' inf' : ''}`} style={{ left: bar.start * px * (140 / Math.max(140, maxT * px)), width: Math.max(3, (bar.end - bar.start) * px * (140 / Math.max(140, maxT * px))) }} />}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {list.length > 0 && (
        <div className="rowx small muted">
          <span>Seconds: 0 to {maxT.toFixed(1)}</span>
          <div className="grow" />
          <button className="tool" onClick={() => setScaleK(Math.max(0.25, scaleK / 1.5))}>Zoom out</button>
          <button className="tool" onClick={() => setScaleK(Math.min(4, scaleK * 1.5))}>Zoom in</button>
        </div>
      )}
      <p className="muted small">Drag rows to reorder. Double-click a row for effect options. Right-click or long-press for start options.</p>
    </div>
  );
};

export const animMenu = (store: FrameStore, data: unknown) => {
  if (typeof data !== 'string') return [];
  const a = store.slide?.animations.find((x) => x.id === data);
  if (!a) return [];
  return [
    { label: `${a.trigger === 'click' ? 'Selected: ' : ''}Start on click`, command: 'anim.trigger', arg: 'click' },
    { label: `${a.trigger === 'with' ? 'Selected: ' : ''}Start with previous`, command: 'anim.trigger', arg: 'with' },
    { label: `${a.trigger === 'after' ? 'Selected: ' : ''}Start after previous`, command: 'anim.trigger', arg: 'after' },
    { label: '', sep: true },
    { label: 'Effect options…', command: 'anim.options' },
    { label: 'Play from here', command: 'anim.playFrom' },
    { label: 'Move earlier', command: 'anim.earlier' },
    { label: 'Move later', command: 'anim.later' },
    { label: 'Remove', command: 'anim.remove' },
  ];
};
