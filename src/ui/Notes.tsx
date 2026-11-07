import { useEffect, useRef, useState } from 'react';
import type { FrameStore } from '../app/store';
import { textBody, textOf } from '../model/deck';

/** Speaker notes for the current slide. Plain text with line breaks; styled notes are kept when unchanged. */
export const Notes = ({ store }: { store: FrameStore }) => {
  const slide = store.slide;
  const [h, setH] = useState(() => { try { return Number(localStorage.getItem('clerdoframe.notesH')) || 96; } catch { return 96; } });
  const [text, setText] = useState(textOf(slide?.notes));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = slide?.id;
  useEffect(() => { setText(textOf(slide?.notes)); }, [id, slide?.notes]);
  if (!slide || !store.view.notes || store.view.mode !== 'normal') return null;
  const commit = (v: string) => {
    if (v === textOf(slide.notes)) return;
    store.tryChange('Edit notes', () => { slide.notes = textBody(v); });
  };
  return (
    <div className="notes" style={{ height: h }}>
      <div className="grip" onPointerDown={(e) => {
        const y0 = e.clientY, h0 = h;
        const move = (ev: PointerEvent) => setH(Math.max(46, Math.min(innerHeight * 0.6, h0 - (ev.clientY - y0))));
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); try { localStorage.setItem('clerdoframe.notesH', String(h)); } catch { /* ignore */ } };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      }} />
      <textarea aria-label="Speaker notes" placeholder="Click to add notes" value={text} spellCheck
        onChange={(e) => { const v = e.target.value; setText(v); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => commit(v), 600); }}
        onBlur={() => { if (timer.current) clearTimeout(timer.current); commit(text); }}
        onKeyDown={(e) => e.stopPropagation()} />
    </div>
  );
};
