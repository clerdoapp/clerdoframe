import { useEffect, useRef, useState } from 'react';
import type { FrameStore } from '../app/store';
import { SlideView } from '../render/SlideView';

/** Placeholder editing canvas; replaced by the full editor. */
export const Canvas = ({ store }: { store: FrameStore }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 450 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const d = store.deck;
  const fit = Math.max(0.05, Math.min((box.w - 48) / d.w, (box.h - 48) / d.h));
  const scale = store.view.zoom === 'fit' ? fit : store.view.zoom;
  const s = store.surface();
  return (
    <div className="canvaswrap" ref={wrap}>
      <div className="canvas" style={{ width: d.w * scale, height: d.h * scale }}>
        {s && <SlideView deck={d} slide={s.kind === 'slide' ? s.slide : null} {...(s.kind === 'layout' ? { layout: s.layout, master: s.master } : s.kind === 'master' ? { master: s.master } : {})} mode="edit" prompts />}
      </div>
    </div>
  );
};
