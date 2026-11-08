import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FrameStore } from '../app/store';
import { textBody, textOf } from '../model/deck';

/** What the notes box offers to extras added by feature modules. */
export interface NotesApi { store: FrameStore; el: () => HTMLTextAreaElement | null; insert: (text: string) => void }
/** Extras for the notes box: tools drawn in its corner and a fix-up run after each edit (typing aids). */
export const notesHooks: { tools?: (api: NotesApi) => ReactNode; fix?: (value: string, caret: number, prev: string) => { value: string; caret: number } | null } = {};

/** Speaker notes for the current slide. Plain text with line breaks; styled notes are kept when unchanged. */
export const Notes = ({ store }: { store: FrameStore }) => {
  const slide = store.slide;
  const [h, setH] = useState(() => { try { return Number(localStorage.getItem('clerdoframe.notesH')) || 96; } catch { return 96; } });
  const [text, setText] = useState(textOf(slide?.notes));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const id = slide?.id;
  useEffect(() => { setText(textOf(slide?.notes)); }, [id, slide?.notes]);
  if (!slide || !store.view.notes || store.view.mode !== 'normal') return null;
  const commit = (v: string) => {
    if (v === textOf(slide.notes)) return;
    store.tryChange('Edit notes', () => { slide.notes = textBody(v); });
  };
  const edit = (v: string) => { setText(v); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => commit(v), 600); };
  const insert = (t: string) => {
    const el = area.current;
    if (!el) return;
    const focused = document.activeElement === el;
    el.setRangeText(t, focused ? el.selectionStart : el.value.length, focused ? el.selectionEnd : el.value.length, 'end');
    edit(el.value);
  };
  return (
    <div className="notes" style={{ height: h }}>
      <div className="grip" onPointerDown={(e) => {
        const y0 = e.clientY, h0 = h;
        const move = (ev: PointerEvent) => setH(Math.max(46, Math.min(innerHeight * 0.6, h0 - (ev.clientY - y0))));
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); try { localStorage.setItem('clerdoframe.notesH', String(h)); } catch { /* ignore */ } };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      }} />
      {notesHooks.tools?.({ store, el: () => area.current, insert })}
      <textarea ref={area} aria-label="Speaker notes" placeholder="Click to add notes" value={text} spellCheck
        onChange={(e) => {
          let v = e.target.value;
          const f = notesHooks.fix?.(v, e.target.selectionStart, text);
          if (f) { e.target.value = f.value; e.target.setSelectionRange(f.caret, f.caret); v = f.value; }
          edit(v);
        }}
        onBlur={() => { if (timer.current) clearTimeout(timer.current); commit(text); }}
        onKeyDown={(e) => e.stopPropagation()} />
    </div>
  );
};
