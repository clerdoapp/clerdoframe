import type { ReactNode } from 'react';
import type { Color, Dash, Deck, Effects, Fill, Line } from '../model/deck';
import { css, resolve, type ColorCtx } from './color';

const urls = new Map<string, { url: string; size: number }>();

/** An object URL for a media item, cached per item. */
export const mediaUrl = (deck: Deck, id: string | undefined): string | undefined => {
  if (!id) return undefined;
  const m = deck.media[id];
  if (!m) return undefined;
  const hit = urls.get(id);
  if (hit && hit.size === m.data.length) return hit.url;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return undefined;
  const url = URL.createObjectURL(new Blob([m.data as BlobPart], { type: m.type }));
  urls.set(id, { url, size: m.data.length });
  return url;
};

/** Collects <defs> while a slide is drawn, so gradient ids are unique per SVG. */
export class Defs {
  items: ReactNode[] = [];
  private n = 0;
  constructor(private prefix: string) {}
  id(kind: string): string { return `${this.prefix}-${kind}${this.n++}`; }
  add(node: ReactNode): void { this.items.push(node); }
}

export interface Paint { fill: string; fillOpacity?: number }

const PATTERNS: Record<string, (fg: string, bg: string) => ReactNode> = {
  horz: (fg, bg) => <><rect width="8" height="8" fill={bg} /><rect width="8" height="1" fill={fg} /></>,
  vert: (fg, bg) => <><rect width="8" height="8" fill={bg} /><rect width="1" height="8" fill={fg} /></>,
  cross: (fg, bg) => <><rect width="8" height="8" fill={bg} /><rect width="8" height="1" fill={fg} /><rect width="1" height="8" fill={fg} /></>,
  dnDiag: (fg, bg) => <><rect width="8" height="8" fill={bg} /><path d="M0 0L8 8M-2 6L2 10M6 -2L10 2" stroke={fg} /></>,
  upDiag: (fg, bg) => <><rect width="8" height="8" fill={bg} /><path d="M0 8L8 0M-2 2L2 -2M6 10L10 6" stroke={fg} /></>,
  diagCross: (fg, bg) => <><rect width="8" height="8" fill={bg} /><path d="M0 0L8 8M0 8L8 0" stroke={fg} /></>,
  smCheck: (fg, bg) => <><rect width="8" height="8" fill={bg} /><rect width="4" height="4" fill={fg} /><rect x="4" y="4" width="4" height="4" fill={fg} /></>,
  dotGrid: (fg, bg) => <><rect width="8" height="8" fill={bg} /><circle cx="4" cy="4" r="1" fill={fg} /></>,
};

/** Turns a Fill into an SVG paint value, adding gradient/pattern definitions to defs. */
export const paint = (f: Fill | undefined, ctx: ColorCtx, deck: Deck, defs: Defs, box: { w: number; h: number }, bgPaint?: Paint): Paint => {
  if (!f || f.type === 'none') return { fill: 'none' };
  switch (f.type) {
    case 'solid': {
      const c = resolve(f.color, ctx);
      return { fill: c.hex, ...(c.alpha < 1 ? { fillOpacity: c.alpha } : {}) };
    }
    case 'background':
      return bgPaint ?? { fill: '#fff' };
    case 'gradient': {
      const id = defs.id('g');
      const stops = [...f.stops].sort((a, b) => a.pos - b.pos).map((s, i) => {
        const c = resolve(s.color, ctx);
        return <stop key={i} offset={`${(s.pos * 100).toFixed(2)}%`} stopColor={c.hex} stopOpacity={c.alpha} />;
      });
      if (f.kind === 'linear') {
        const ang = ((f.angle % 360) + 360) % 360;
        const r = (ang * Math.PI) / 180;
        const dx = Math.cos(r) / 2, dy = Math.sin(r) / 2;
        defs.add(<linearGradient key={id} id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>{stops}</linearGradient>);
      } else {
        defs.add(<radialGradient key={id} id={id} cx="0.5" cy="0.5" r={f.kind === 'rect' ? 0.71 : 0.5}>{stops}</radialGradient>);
      }
      return { fill: `url(#${id})` };
    }
    case 'picture': {
      const url = mediaUrl(deck, f.media);
      if (!url) return { fill: '#ccc' };
      const id = defs.id('p');
      if (f.mode === 'tile') {
        defs.add(<pattern key={id} id={id} patternUnits="userSpaceOnUse" width={128} height={128}><image href={url} width={128} height={128} opacity={1 - (f.transparency ?? 0)} /></pattern>);
      } else {
        defs.add(<pattern key={id} id={id} patternUnits="objectBoundingBox" width="1" height="1"><image href={url} width={box.w} height={box.h} preserveAspectRatio="none" opacity={1 - (f.transparency ?? 0)} /></pattern>);
      }
      return { fill: `url(#${id})` };
    }
    case 'pattern': {
      const id = defs.id('t');
      const fg = css(f.fg, ctx), bg = css(f.bg, ctx);
      const draw = PATTERNS[f.pattern] ?? ((a: string, b: string) => <><rect width="8" height="8" fill={b} /><rect width="2" height="2" fill={a} /><rect x="4" y="4" width="2" height="2" fill={a} /></>);
      defs.add(<pattern key={id} id={id} patternUnits="userSpaceOnUse" width="8" height="8">{draw(fg, bg)}</pattern>);
      return { fill: `url(#${id})` };
    }
  }
};

const DASHES: Record<Dash, number[]> = {
  solid: [], dot: [1, 1], dash: [4, 3], lgDash: [8, 3], dashDot: [4, 3, 1, 3], lgDashDot: [8, 3, 1, 3], lgDashDotDot: [8, 3, 1, 3, 1, 3],
  sysDash: [3, 1], sysDot: [1, 1], sysDashDot: [3, 1, 1, 1], sysDashDotDot: [3, 1, 1, 1, 1, 1],
};

export interface Stroke { stroke: string; strokeWidth: number; strokeOpacity?: number; strokeDasharray?: string; strokeLinecap?: 'butt' | 'round' | 'square'; strokeLinejoin?: 'round' | 'bevel' | 'miter' }

/** Line width in slide px (points * 4/3). */
export const strokeOf = (l: Line | undefined, ctx: ColorCtx, deck: Deck, defs: Defs): Stroke | null => {
  if (!l || l.fill.type === 'none' || l.width <= 0) return null;
  const p = paint(l.fill, ctx, deck, defs, { w: 1, h: 1 });
  const w = Math.max(0.5, l.width * (96 / 72));
  const dash = DASHES[l.dash ?? 'solid'];
  return {
    stroke: p.fill,
    strokeWidth: w,
    ...(p.fillOpacity !== undefined ? { strokeOpacity: p.fillOpacity } : {}),
    ...(dash.length ? { strokeDasharray: dash.map((d) => d * w).join(' ') } : {}),
    strokeLinecap: l.cap === 'round' ? 'round' : l.cap === 'square' ? 'square' : 'butt',
    strokeLinejoin: l.join ?? 'round',
  };
};

/** Arrow-head markers for a line. Returns marker-start/end props. */
export const markers = (l: Line | undefined, color: string, defs: Defs): { markerStart?: string; markerEnd?: string } => {
  if (!l) return {};
  const out: { markerStart?: string; markerEnd?: string } = {};
  const mk = (end: 'head' | 'tail') => {
    const spec = l[end];
    if (!spec || spec.type === 'none') return undefined;
    const id = defs.id('a');
    const sz = spec.w === 'sm' ? 2 : spec.w === 'lg' ? 5 : 3;
    const len = spec.len === 'sm' ? 2 : spec.len === 'lg' ? 5 : 3;
    const shape = spec.type === 'oval' ? <ellipse cx={len / 2} cy={sz / 2} rx={len / 2} ry={sz / 2} fill={color} />
      : spec.type === 'diamond' ? <path d={`M0 ${sz / 2}L${len / 2} 0L${len} ${sz / 2}L${len / 2} ${sz}Z`} fill={color} />
        : spec.type === 'arrow' ? <path d={`M0 0L${len} ${sz / 2}L0 ${sz}`} fill="none" stroke={color} strokeWidth={0.6} />
          : spec.type === 'stealth' ? <path d={`M0 0L${len} ${sz / 2}L0 ${sz}L${len * 0.3} ${sz / 2}Z`} fill={color} />
            : <path d={`M0 0L${len} ${sz / 2}L0 ${sz}Z`} fill={color} />;
    defs.add(<marker key={id} id={id} viewBox={`0 0 ${len} ${sz}`} refX={end === 'tail' ? len * 0.9 : len * 0.1} refY={sz / 2} markerWidth={len} markerHeight={sz} orient={end === 'tail' ? 'auto' : 'auto-start-reverse'} markerUnits="strokeWidth">{shape}</marker>);
    return `url(#${id})`;
  };
  const s = mk('head'), e = mk('tail');
  if (s) out.markerStart = s;
  if (e) out.markerEnd = e;
  return out;
};

/** SVG filter for shadow / glow / soft edges. Returns the filter url or undefined. */
export const effectFilter = (fx: Effects | undefined, ctx: ColorCtx, defs: Defs): string | undefined => {
  if (!fx || (!fx.shadow && !fx.glow && !fx.softEdge)) return undefined;
  const id = defs.id('f');
  const parts: ReactNode[] = [];
  const merge: string[] = [];
  if (fx.glow) {
    const c = resolve(fx.glow.color, ctx);
    parts.push(<feMorphology key="gm" in="SourceAlpha" operator="dilate" radius={fx.glow.radius / 3} result="gd" />);
    parts.push(<feGaussianBlur key="gb" in="gd" stdDeviation={fx.glow.radius / 2} result="gbl" />);
    parts.push(<feFlood key="gf" floodColor={c.hex} floodOpacity={fx.glow.alpha ?? c.alpha * 0.6} result="gc" />);
    parts.push(<feComposite key="gc" in="gc" in2="gbl" operator="in" result="glow" />);
    merge.push('glow');
  }
  if (fx.shadow && fx.shadow.kind !== 'inner') {
    const s = fx.shadow;
    const c = resolve(s.color, ctx);
    const r = (s.angle * Math.PI) / 180;
    parts.push(<feGaussianBlur key="sb" in="SourceAlpha" stdDeviation={s.blur / 2} result="sbl" />);
    parts.push(<feOffset key="so" in="sbl" dx={Math.cos(r) * s.dist} dy={Math.sin(r) * s.dist} result="sof" />);
    parts.push(<feFlood key="sf" floodColor={c.hex} floodOpacity={s.alpha ?? c.alpha * 0.4} result="sc" />);
    parts.push(<feComposite key="sc" in="sc" in2="sof" operator="in" result="shadow" />);
    merge.push('shadow');
  }
  let src = 'SourceGraphic';
  if (fx.softEdge) {
    parts.push(<feGaussianBlur key="eb" in="SourceAlpha" stdDeviation={fx.softEdge / 2} result="eb" />);
    parts.push(<feComposite key="ec" in="SourceGraphic" in2="eb" operator="in" result="soft" />);
    src = 'soft';
  }
  if (fx.shadow?.kind === 'inner') {
    const s = fx.shadow;
    const c = resolve(s.color, ctx);
    const r = (s.angle * Math.PI) / 180;
    parts.push(<feComponentTransfer key="ia" in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0" /></feComponentTransfer>);
    parts.push(<feGaussianBlur key="ib" in="inv" stdDeviation={s.blur / 2} result="ibl" />);
    parts.push(<feOffset key="io" in="ibl" dx={Math.cos(r) * s.dist} dy={Math.sin(r) * s.dist} result="iof" />);
    parts.push(<feFlood key="if" floodColor={c.hex} floodOpacity={s.alpha ?? 0.5} result="ic" />);
    parts.push(<feComposite key="ic" in="ic" in2="iof" operator="in" result="ish" />);
    parts.push(<feComposite key="ic2" in="ish" in2="SourceAlpha" operator="in" result="inner" />);
    parts.push(<feMerge key="im" result="withInner"><feMergeNode in={src} /><feMergeNode in="inner" /></feMerge>);
    src = 'withInner';
  }
  defs.add(
    <filter key={id} id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
      {parts}
      <feMerge>{merge.map((m) => <feMergeNode key={m} in={m} />)}<feMergeNode in={src} /></feMerge>
    </filter>,
  );
  return `url(#${id})`;
};

/** Ends of a duotone recolor: luminance 0 maps to `dark`, 1 to `light`. */
export const duotoneEnds = (recolor: Color, mode: 'light' | 'dark' | undefined, ctx: ColorCtx): { dark: string; light: string } => {
  const c = resolve(recolor, ctx).hex;
  return mode === 'light' ? { dark: c, light: '#FFFFFF' } : { dark: '#000000', light: c };
};

/** SVG duotone filter for a picture recolor. Returns the filter url. */
export const duotoneFilter = (recolor: Color, mode: 'light' | 'dark' | undefined, ctx: ColorCtx, defs: Defs): string => {
  const { dark, light } = duotoneEnds(recolor, mode, ctx);
  const a = dark.replace('#', ''), b = light.replace('#', '');
  const ch = (h: string, i: number) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255;
  const id = defs.id('duo');
  const t = (i: number) => `${ch(a, i).toFixed(4)} ${ch(b, i).toFixed(4)}`;
  defs.add(
    <filter key={id} id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={t(0)} />
        <feFuncG type="table" tableValues={t(2)} />
        <feFuncB type="table" tableValues={t(4)} />
      </feComponentTransfer>
    </filter>,
  );
  return `url(#${id})`;
};

/**
 * A mirrored copy of a drawn shape below its box (Effects.reflection): faded from `alpha` at the
 * bottom edge to clear at `size` of the height, `dist` px below, optionally blurred.
 */
export const reflectionOf = (fx: Effects | undefined, w: number, h: number, body: ReactNode, defs: Defs): ReactNode => {
  const r = fx?.reflection;
  if (!r || !(r.size > 0) || !(r.alpha > 0) || h <= 0) return null;
  const size = Math.min(1, r.size);
  const gid = defs.id('rg'), mid = defs.id('rm');
  // The mask lives in the mirrored space: the shape's bottom edge is y = h there.
  defs.add(
    <linearGradient key={gid} id={gid} gradientUnits="userSpaceOnUse" x1="0" y1={h} x2="0" y2={h * (1 - size)}>
      <stop offset="0" stopColor="#fff" stopOpacity={Math.min(1, r.alpha)} />
      <stop offset="1" stopColor="#fff" stopOpacity="0" />
    </linearGradient>,
  );
  const pad = Math.max(w, h);
  defs.add(<mask key={mid} id={mid} maskUnits="userSpaceOnUse" x={-pad} y={-pad} width={w + pad * 2} height={h + pad * 2}><rect x={-pad} y={-pad} width={w + pad * 2} height={h + pad * 2} fill={`url(#${gid})`} /></mask>);
  let blur: string | undefined;
  if (r.blur > 0.05) {
    const fid = defs.id('rb');
    defs.add(<filter key={fid} id={fid} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={r.blur / 2} /></filter>);
    blur = `url(#${fid})`;
  }
  return (
    <g className="reflection" transform={`translate(0 ${2 * h + Math.max(0, r.dist)}) scale(1 -1)`} pointerEvents="none" aria-hidden="true">
      <g mask={`url(#${mid})`}><g filter={blur}>{body}</g></g>
    </g>
  );
};
