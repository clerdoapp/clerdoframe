import { memo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { run } from '../app/commands';
import type { FrameStore } from '../app/store';
import type { Deck, Slide } from '../model/deck';
import { SlideView } from '../render/SlideView';
import { S } from './kit';

const Thumb = memo(({ deck, slide, n, w, version }: { deck: Deck; slide: Slide; n: number; w: number; version: string }) => {
  void version;
  return <SlideView deck={deck} slide={slide} width={w} slideNumber={n} />;
}, (a, b) => a.version === b.version && a.w === b.w && a.n === b.n);

/** Cheap change key for one slide so thumbnails only redraw when their slide changes. */
const keyOf = (deck: Deck, s: Slide): string => {
  const m = deck.masters.find((x) => x.layouts.some((l) => l.id === s.layout));
  return JSON.stringify(s).length + ':' + hash(JSON.stringify(s)) + ':' + (m ? hash(JSON.stringify(m.theme) + JSON.stringify(m.background) + m.shapes.length + JSON.stringify(m.layouts.find((l) => l.id === s.layout)?.shapes.filter((x) => !x.ph) ?? [])) : 0);
};
const hash = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; };

/** The slide thumbnails beside the canvas: select, multi-select, drag to reorder, sections. */
export const SlideList = ({ store }: { store: FrameStore }) => {
  const deck = store.deck;
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number[]; over: number } | null>(null);
  const w = 168;
  const sectionAt = new Map(deck.sections.map((s) => [s.first, s]));
  let collapsed = false;

  const click = (i: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const a = Math.min(store.cur, i), b = Math.max(store.cur, i);
      store.slideSel = Array.from({ length: b - a + 1 }, (_, k) => a + k);
    } else if (e.metaKey || e.ctrlKey) {
      store.slideSel = store.slideSel.includes(i) ? store.slideSel.filter((x) => x !== i) : [...store.slideSel, i];
      if (!store.slideSel.length) store.slideSel = [i];
    } else store.slideSel = [i];
    store.cur = i;
    store.sel = [];
    store.editing = null;
    store.emit();
  };

  return (
    <div className="slidelist" ref={ref} tabIndex={0} aria-label="Slides" role="listbox" aria-multiselectable="true"
      onKeyDown={(e) => {
        const k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); store.goto(store.cur + 1); }
        else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); store.goto(store.cur - 1); }
        else if (k === 'Home') { e.preventDefault(); store.goto(0); }
        else if (k === 'End') { e.preventDefault(); store.goto(deck.slides.length - 1); }
        else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); run(store, 'slide.delete'); }
        else if (k === 'Enter') { e.preventDefault(); run(store, 'slide.new'); }
        else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'd') { e.preventDefault(); run(store, 'slide.duplicate'); }
        else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'a') { e.preventDefault(); store.slideSel = deck.slides.map((_, i) => i); store.emit(); }
        else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'c') { e.preventDefault(); run(store, 'slide.copy'); }
        else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'x') { e.preventDefault(); run(store, 'slide.cut'); }
        else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'v') { e.preventDefault(); run(store, 'slide.paste'); }
      }}
      onContextMenu={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); store.menu = { x: e.clientX, y: e.clientY, kind: 'slidelist' }; store.emit(); } }}>
      {deck.slides.map((s, i) => {
        const sec = sectionAt.get(s.id);
        if (sec) collapsed = !!sec.collapsed;
        const head = sec && (
          <div key={`sec-${sec.id}`} className="sectionhead"
            onClick={() => store.tryChange('!Collapse section', () => { sec.collapsed = !sec.collapsed; })}
            onContextMenu={(e) => { e.preventDefault(); store.menu = { x: e.clientX, y: e.clientY, kind: 'section', data: sec.id }; store.emit(); }}>
            {sec.collapsed ? <ChevronRight size={13} strokeWidth={S} /> : <ChevronDown size={13} strokeWidth={S} />}
            {sec.name}
          </div>
        );
        if (collapsed && !sec) return null;
        if (collapsed) return head;
        const on = store.cur === i;
        const sel = store.slideSel.includes(i);
        return [head,
          <div key={s.id} className="thumbrow" role="option" aria-selected={sel}
            draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-clerdoframe-slides', ''); setDrag({ from: sel ? [...store.slideSel].sort((a, b) => a - b) : [i], over: i }); }}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const over = e.clientY < r.top + r.height / 2 ? i : i + 1;
              if (over !== drag.over) setDrag({ ...drag, over });
            }}
            onDrop={(e) => { e.preventDefault(); if (drag) run(store, 'slide.move', { from: drag.from, to: drag.over }); setDrag(null); }}
            onDragEnd={() => setDrag(null)}>
            {drag && drag.over === i && <div className="dropline" style={{ top: -2 }} />}
            {drag && drag.over === i + 1 && i === deck.slides.length - 1 && <div className="dropline" style={{ bottom: -2 }} />}
            <span className={`num${s.hidden ? ' hid' : ''}`}>{i + 1}</span>
            <div className={`thumb${on ? ' on' : sel ? ' sel' : ''}${s.hidden ? ' hid' : ''}`}
              onClick={(e) => click(i, e)} onDoubleClick={() => { if (store.view.mode !== 'normal') run(store, 'view.mode', 'normal'); }}
              onContextMenu={(e) => { e.preventDefault(); if (!sel) click(i, e); store.menu = { x: e.clientX, y: e.clientY, kind: 'slide', data: i }; store.emit(); }}>
              <Thumb deck={deck} slide={s} n={i + 1} w={w} version={keyOf(deck, s)} />
              {(s.transition && s.transition.name !== 'none') || s.animations.length ? <Star className="star" size={14} strokeWidth={S} aria-label="Has animation or transition" /> : null}
            </div>
          </div>];
      })}
    </div>
  );
};
