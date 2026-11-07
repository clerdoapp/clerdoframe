import type { ReactNode } from 'react';
import type { Ink, InkStroke } from '../../model/deck';
import { resolve, type ColorCtx } from '../../render/color';
import type { Defs } from '../../render/paint';
import { strokeBounds, strokeOutline } from './ink';

/** Fill and blend for one stroke by tool: pens solid, pencil slightly see-through, highlighter translucent and multiplied. */
export const inkPaint = (s: InkStroke, ctx: ColorCtx, pencilTex?: string): { fill: string; fillOpacity?: number; style?: { mixBlendMode: 'multiply' }; filter?: string } => {
  const c = resolve(s.color, ctx);
  if (s.tool === 'highlighter') return { fill: c.hex, fillOpacity: 0.42 * c.alpha, style: { mixBlendMode: 'multiply' } };
  if (s.tool === 'pencil') return { fill: c.hex, fillOpacity: 0.82 * c.alpha, ...(pencilTex ? { filter: `url(#${pencilTex})` } : {}) };
  return { fill: c.hex, ...(c.alpha < 1 ? { fillOpacity: c.alpha } : {}) };
};

/** Grainy edge for pencil strokes. */
const pencilFilter = (defs: Defs): string => {
  const id = defs.id('pencil');
  defs.add(
    <filter key={id} id={id} x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={2} seed={3} result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="a" />
      <feComposite in="SourceGraphic" in2="a" operator="in" />
    </filter>,
  );
  return id;
};

/**
 * Draws an ink shape in its local box. Stroke points are stored relative to the shape;
 * a resized shape scales its strokes to fit.
 * `upTo` limits drawing to the first n points across strokes (for replay).
 */
export const renderInk = (ink: Ink, ctx: ColorCtx, defs: Defs, upTo?: number): ReactNode => {
  const b = strokeBounds(ink.strokes);
  const sx = b && b.w > 1 ? ink.w / b.w : 1, sy = b && b.h > 1 ? ink.h / b.h : 1;
  const tr = b && (Math.abs(sx - 1) > 0.002 || Math.abs(sy - 1) > 0.002 || Math.abs(b.x) > 0.5 || Math.abs(b.y) > 0.5) ? `scale(${sx} ${sy}) translate(${-b.x} ${-b.y})` : undefined;
  const tex = ink.strokes.some((s) => s.tool === 'pencil') ? pencilFilter(defs) : undefined;
  let budget = upTo ?? Infinity;
  const paths: ReactNode[] = [];
  ink.strokes.forEach((s, i) => {
    if (budget <= 0) return;
    const pts = budget >= s.points.length ? s.points : s.points.slice(0, Math.max(1, budget));
    budget -= s.points.length;
    paths.push(<path key={i} d={strokeOutline({ ...s, points: pts })} {...inkPaint(s, ctx, tex)} />);
  });
  return <g transform={tr}>{paths}</g>;
};
