import { lazy, Suspense, useState } from 'react';
import type { DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { uid, type AutoShape, type Color } from '../../model/deck';
import { ColorButton, Dialog } from '../../ui/kit';
import { svgToPath } from './svgPath';
import { placeShapes } from './media';

const IconGrid = lazy(() => import('./iconGrid'));

/** Inserts icons as outline shapes, so their colour and line weight can be changed like any shape. */
export const insertIcons = (store: FrameStore, picked: { name: string; d: string }[], color: Color): void => {
  const size = 96, gap = 24;
  const n = picked.length;
  const total = n * size + (n - 1) * gap;
  const x0 = (store.deck.w - Math.min(total, store.deck.w * 0.9)) / 2;
  const perRow = Math.max(1, Math.floor((store.deck.w * 0.9 + gap) / (size + gap)));
  const shapes: AutoShape[] = picked.map((p, i) => ({
    id: uid('s'), kind: 'shape', geom: 'custom', name: `Graphic ${p.name}`,
    x: x0 + (i % perRow) * (size + gap), y: (store.deck.h - size) / 2 + Math.floor(i / perRow) * (size + gap), w: size, h: size,
    path: [{ d: p.d, w: 24, h: 24 }],
    fill: { type: 'none' },
    line: { fill: { type: 'solid', color }, width: 1.9 * (size / 24) * 0.75, cap: 'round', join: 'round' },
    alt: p.name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase(),
  }));
  placeShapes(store, n > 1 ? 'Insert icons' : 'Insert icon', shapes);
};

export const IconsDialog = ({ store, close }: DialogProps) => {
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [color, setColor] = useState<Color>({ theme: 'accent1' });
  return (
    <Dialog title="Icons" close={close} wide okLabel={picked.size > 1 ? `Insert ${picked.size}` : 'Insert'}
      footer={<ColorButton store={store} label="Color" value={color} onPick={(c) => c && setColor(c)} />}
      onOk={() => { if (!picked.size) return false; insertIcons(store, [...picked].map(([name, d]) => ({ name, d })), color); return true; }}>
      <Suspense fallback={<div className="pad muted">Loading icons…</div>}>
        <IconGrid picked={picked} onToggle={(name, svg) => setPicked((m) => {
          const next = new Map(m);
          if (next.has(name)) next.delete(name); else next.set(name, svgToPath(svg));
          return next;
        })} onInsert={(name, svg) => { insertIcons(store, [{ name, d: svgToPath(svg) }], color); close(); }} />
      </Suspense>
    </Dialog>
  );
};
