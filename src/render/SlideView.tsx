import { useId, type CSSProperties, type ReactNode } from 'react';
import type { AutoShape, Background, Deck, Group, Layout, Master, Picture, Shape, Slide, Table } from '../model/deck';
import { css, type ColorCtx } from './color';
import { geometry, isLineGeom } from './geometry';
import { effectiveBody, phChain, type RenderCtx } from './inherit';
import { Defs, effectFilter, markers, mediaUrl, paint, strokeOf, type Paint } from './paint';
import { TextContent } from './text';

/** Renderers for shape kinds that live in feature modules (charts, diagrams, media, ink, equations...). */
export type KindRenderer = (s: Shape, ctx: RenderCtx, defs: Defs, opts: DrawOpts) => ReactNode;
const kinds = new Map<string, KindRenderer>();
export const registerKind = (kind: string, r: KindRenderer): void => { kinds.set(kind, r); };

/** Draws text that has a WordArt warp (TextBody.warp); return null to fall back to normal text. */
export type WarpRenderer = (s: AutoShape, ctx: RenderCtx) => ReactNode | null;
let warpRenderer: WarpRenderer | null = null;
export const registerWarpText = (r: WarpRenderer): void => { warpRenderer = r; };

export interface DrawOpts {
  /** Show prompts in empty placeholders (editing only). */
  prompts: boolean;
  /** Background paint, for shapes with a 'background' fill. */
  bg?: Paint;
  /** Shape being text-edited: its text is left out so the editor can draw it. */
  editing?: string;
  /** Wraps each top-level slide shape (animations in the show). */
  decorate?: (s: Shape, node: ReactNode) => ReactNode;
  /** 'show' plays media; 'edit' shows media posters with a play badge. */
  mode: 'edit' | 'thumb' | 'show' | 'print';
  grayscale?: 'gray' | 'bw';
}

const transform = (s: { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean }): string => {
  const cx = s.w / 2, cy = s.h / 2;
  let t = `translate(${s.x} ${s.y})`;
  if (s.rot) t += ` rotate(${s.rot} ${cx} ${cy})`;
  if (s.flipH || s.flipV) t += ` translate(${s.flipH ? s.w : 0} ${s.flipV ? s.h : 0}) scale(${s.flipH ? -1 : 1} ${s.flipV ? -1 : 1})`;
  return t;
};

const shade = (p: Paint, kind: string | undefined): Paint => {
  if (!kind || kind === 'norm') return p;
  if (kind === 'none') return { fill: 'none' };
  return { fill: kind.startsWith('darken') ? `rgba(0,0,0,${kind === 'darken' ? 0.4 : 0.2})` : `rgba(255,255,255,${kind === 'lighten' ? 0.4 : 0.2})` };
};

const drawAuto = (s: AutoShape, ctx: RenderCtx, defs: Defs, o: DrawOpts): ReactNode => {
  const chain = phChain(s, ctx);
  const fill = s.fill ?? chain.find((c) => c.fill)?.fill;
  const line = s.line ?? chain.find((c) => c.line)?.line;
  const geom = s.geom || 'rect';
  const g = geometry(geom, s.w, s.h, s.adj, s.path);
  const cctx: ColorCtx = { theme: ctx.theme };
  const f = isLineGeom(geom) ? { fill: 'none' } : paint(fill, cctx, ctx.deck, defs, s, o.bg);
  const st = strokeOf(line, cctx, ctx.deck, defs);
  const mk = st && line ? markers(line, st.stroke, defs) : {};
  const tr = g.text ?? { x: 0, y: 0, w: s.w, h: s.h };
  const hasBody = s.text && (s.text.paras.some((p) => p.runs.some((r) => r.text || r.br)) || (o.prompts && s.ph) || ctx.onMaster);
  const counter = s.flipH || s.flipV ? `scale(${s.flipH ? -1 : 1} ${s.flipV ? -1 : 1}) translate(${s.flipH ? -s.w : 0} ${s.flipV ? -s.h : 0})` : undefined;
  const textRot = s.text?.rot;
  const warped = hasBody && s.id !== o.editing && s.text?.warp && warpRenderer ? warpRenderer(s, ctx) : null;
  return (
    <>
      {g.paths.map((p, i) => (
        <g key={i}>
          {/* Darken/lighten paths shade the shape's own fill, so the fill goes underneath. */}
          {p.fill && p.fill !== 'none' && p.fill !== 'norm' && f.fill !== 'none' && <path d={p.d} fill={f.fill} fillOpacity={f.fillOpacity} stroke="none" />}
          <path d={p.d} fill={p.fill === 'none' || f.fill === 'none' ? 'none' : shade(f, p.fill).fill} fillOpacity={p.fill === 'none' ? undefined : f.fillOpacity}
            {...(p.stroke === false || !st ? { stroke: 'none' } : st)} {...(i === g.paths.length - 1 ? mk : {})} />
        </g>
      ))}
      {warped}
      {hasBody && s.id !== o.editing && !warped && (
        <g transform={[counter, textRot ? `rotate(${textRot} ${s.w / 2} ${s.h / 2})` : ''].filter(Boolean).join(' ') || undefined}>
          <foreignObject x={tr.x} y={tr.y} width={Math.max(1, tr.w)} height={Math.max(1, tr.h)} style={{ overflow: 'visible' }}>
            <TextContent shape={s} body={s.text} ctx={ctx} w={tr.w} h={tr.h} prompt={o.prompts} />
          </foreignObject>
        </g>
      )}
      {o.mode === 'edit' && s.ph && !hasBody && ['pic', 'chart', 'tbl', 'media', 'obj', 'clipArt', 'dgm'].includes(s.ph.type) && (
        <rect width={s.w} height={s.h} fill="none" stroke="#9aa0ab" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
    </>
  );
};

const filterFor = (p: Picture): string | undefined => {
  const a = p.adjust;
  if (!a) return undefined;
  const f: string[] = [];
  if (a.brightness) f.push(`brightness(${1 + a.brightness / 100})`);
  if (a.contrast) f.push(`contrast(${1 + a.contrast / 100})`);
  if (a.saturation !== undefined && a.saturation !== 100) f.push(`saturate(${a.saturation / 100})`);
  if (a.grayscale) f.push('grayscale(1)');
  if (a.sepia) f.push('sepia(1)');
  if (a.blur) f.push(`blur(${a.blur}px)`);
  if (a.temperature) f.push(`hue-rotate(${-a.temperature / 10}deg)`);
  return f.length ? f.join(' ') : undefined;
};

const drawPicture = (p: Picture, ctx: RenderCtx, defs: Defs): ReactNode => {
  const url = mediaUrl(ctx.deck, p.cutout ?? p.media);
  const c = p.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const fw = Math.max(0.01, 1 - c.l - c.r), fh = Math.max(0.01, 1 - c.t - c.b);
  const iw = p.w / fw, ih = p.h / fh;
  const clip = defs.id('c');
  const g = geometry(p.geom ?? 'rect', p.w, p.h);
  const st = strokeOf(p.line, { theme: ctx.theme }, ctx.deck, defs);
  defs.add(<clipPath key={clip} id={clip}>{g.paths.map((x, i) => <path key={i} d={x.d} />)}</clipPath>);
  return (
    <>
      <g clipPath={`url(#${clip})`}>
        {url ? <image href={url} x={-c.l * iw} y={-c.t * ih} width={iw} height={ih} preserveAspectRatio="none" opacity={1 - (p.adjust?.transparency ?? 0) / 100} style={{ filter: filterFor(p) }} />
          : <rect width={p.w} height={p.h} fill="#e6e7ea" />}
      </g>
      {st && g.paths.map((x, i) => <path key={`o${i}`} d={x.d} fill="none" {...st} />)}
    </>
  );
};

const drawTable = (t: Table, ctx: RenderCtx, o: DrawOpts): ReactNode => {
  const cctx: ColorCtx = { theme: ctx.theme };
  const border = (l: { width: number; fill: AutoShape['fill'] } | undefined) =>
    l && l.fill && l.fill.type === 'solid' && l.width > 0 ? `${Math.max(1, l.width * (4 / 3))}px solid ${css(l.fill.color, cctx)}` : undefined;
  const W = t.cols.reduce((a, b) => a + b, 0);
  const H = t.rows.reduce((a, r) => a + r.h, 0);
  return (
    <foreignObject width={Math.max(W, t.w)} height={Math.max(H, t.h)} style={{ overflow: 'visible' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: W }}>
        <colgroup>{t.cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <tbody>
          {t.rows.map((r, ri) => (
            <tr key={ri} style={{ height: r.h }}>
              {r.cells.map((c, ci) => {
                if (c.hMerge || c.vMerge) return null;
                const fill = c.fill?.type === 'solid' ? css(c.fill.color, cctx) : undefined;
                const m = c.margin ?? { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };
                const cs: CSSProperties = {
                  padding: 0, background: fill, verticalAlign: c.vAlign === 'ctr' ? 'middle' : c.vAlign === 'b' ? 'bottom' : 'top',
                  borderLeft: border(c.borders?.l), borderRight: border(c.borders?.r), borderTop: border(c.borders?.t), borderBottom: border(c.borders?.b), overflow: 'hidden',
                };
                const cellW = t.cols.slice(ci, ci + (c.gridSpan ?? 1)).reduce((a, b) => a + b, 0);
                const cellH = t.rows.slice(ri, ri + (c.rowSpan ?? 1)).reduce((a, b) => a + b.h, 0);
                const pseudo: AutoShape = { id: `${t.id}:${ri}:${ci}`, kind: 'shape', geom: 'rect', name: '', x: 0, y: 0, w: cellW, h: cellH, text: { ...c.text, inset: m, vAlign: c.vAlign ?? 't' } };
                return (
                  <td key={ci} colSpan={c.gridSpan} rowSpan={c.rowSpan} style={cs}>
                    {o.editing === pseudo.id ? null : <TextContent shape={pseudo} body={pseudo.text} ctx={{ ...ctx, onMaster: false }} w={cellW} h={0} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </foreignObject>
  );
};

const drawGroup = (g: Group, ctx: RenderCtx, defs: Defs, o: DrawOpts): ReactNode => {
  const cb = g.childBox ?? { x: 0, y: 0, w: g.w, h: g.h };
  const sx = cb.w ? g.w / cb.w : 1, sy = cb.h ? g.h / cb.h : 1;
  return <g transform={`scale(${sx} ${sy}) translate(${-cb.x} ${-cb.y})`}>{g.children.map((c) => drawShape(c, ctx, defs, o))}</g>;
};

/** Review > Hide ink: ink is left out while editing (not in the show, print or export). */
let inkHidden = false;
export const setInkHidden = (v: boolean): void => { inkHidden = v; };

/** Draws one shape (positioned) as an SVG group. */
export const drawShape = (s: Shape, ctx: RenderCtx, defs: Defs, o: DrawOpts): ReactNode => {
  if (s.hidden && o.mode !== 'edit') return null;
  if (s.hidden) return null;
  if (s.kind === 'ink' && inkHidden && (o.mode === 'edit' || o.mode === 'thumb')) return null;
  let body: ReactNode;
  if (s.kind === 'shape') body = drawAuto(s, ctx, defs, o);
  else if (s.kind === 'picture') body = drawPicture(s, ctx, defs);
  else if (s.kind === 'table') body = drawTable(s, ctx, o);
  else if (s.kind === 'group') body = drawGroup(s, ctx, defs, o);
  else {
    const r = kinds.get(s.kind);
    body = r ? r(s, ctx, defs, o) : <rect width={s.w} height={s.h} fill="#f1f2f4" stroke="#c4c8cf" />;
  }
  const filter = effectFilter(s.effects, { theme: ctx.theme }, defs);
  const node = <g key={s.id} data-shape={s.id} transform={transform(s)} filter={filter}>{body}</g>;
  return node;
};

export const contextFor = (deck: Deck, slide: Slide | null, opts: { layout?: Layout; master?: Master; prompts: boolean; slideNumber?: number }): RenderCtx => {
  let master = opts.master;
  let layout: Layout | null = opts.layout ?? null;
  if (slide) {
    for (const m of deck.masters) { const l = m.layouts.find((x) => x.id === slide.layout); if (l) { master = m; layout = l; break; } }
    if (!master) { master = deck.masters[0]!; layout = master.layouts[0] ?? null; }
  }
  if (!master) master = deck.masters[0]!;
  return {
    deck, master, layout, theme: master.theme,
    slideNumber: opts.slideNumber ?? (slide ? deck.slides.indexOf(slide) + 1 : 0),
    prompts: opts.prompts, onMaster: !slide,
  };
};

const bgOf = (slide: Slide | null, layout: Layout | null, master: Master): Background =>
  slide?.background ?? layout?.background ?? master.background;

export interface SlideViewProps {
  deck: Deck;
  /** Slide to draw; omit with layout/master to draw those. */
  slide?: Slide | null;
  layout?: Layout;
  master?: Master;
  /** Pixel width the SVG is drawn at; height follows the slide ratio. */
  width?: number;
  mode?: DrawOpts['mode'];
  prompts?: boolean;
  editing?: string;
  decorate?: DrawOpts['decorate'];
  className?: string;
  style?: CSSProperties;
  /** Extra SVG drawn over the slide, in slide px. */
  children?: ReactNode;
  slideNumber?: number;
  grayscale?: 'gray' | 'bw';
}

/** A slide (or layout / master) drawn as SVG at any size. */
export const SlideView = ({ deck, slide = null, layout, master, width, mode = 'thumb', prompts = false, editing, decorate, className, style, children, slideNumber, grayscale }: SlideViewProps) => {
  const uidStr = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ctx = contextFor(deck, slide, { prompts, ...(layout ? { layout } : {}), ...(master ? { master } : {}), ...(slideNumber ? { slideNumber } : {}) });
  const defs = new Defs(`d${uidStr}`);
  const bg = bgOf(slide, slide ? ctx.layout : layout ?? null, ctx.master);
  const bgPaint = paint(bg.fill, { theme: ctx.theme }, deck, defs, { w: deck.w, h: deck.h });
  const opts: DrawOpts = { prompts, bg: bgPaint, mode, ...(editing ? { editing } : {}), ...(decorate ? { decorate } : {}) };
  const hideMaster = slide ? (slide.background?.hideMasterGraphics ?? ctx.layout?.hideMasterGraphics) : layout?.hideMasterGraphics;
  const layers: ReactNode[] = [];
  const isFieldPh = (s: Shape) => !!s.ph && ['dt', 'ftr', 'sldNum'].includes(s.ph.type);
  if (slide) {
    if (!hideMaster) for (const s of ctx.master.shapes) if (!s.ph) layers.push(drawShape(s, ctx, defs, { ...opts, prompts: false }));
    if (ctx.layout) for (const s of ctx.layout.shapes) if (!s.ph) layers.push(drawShape(s, ctx, defs, { ...opts, prompts: false }));
    for (const s of slide.shapes) {
      const n = drawShape(s, ctx, defs, opts);
      layers.push(decorate ? <g key={`w${s.id}`}>{decorate(s, n)}</g> : n);
    }
  } else if (layout) {
    if (!layout.hideMasterGraphics) for (const s of ctx.master.shapes) if (!s.ph) layers.push(drawShape(s, ctx, defs, opts));
    for (const s of layout.shapes) layers.push(drawShape(s, ctx, defs, opts));
  } else {
    for (const s of ctx.master.shapes) layers.push(drawShape(s, ctx, defs, opts));
  }
  void isFieldPh;
  const filter = grayscale === 'gray' ? 'grayscale(1)' : grayscale === 'bw' ? 'grayscale(1) contrast(4)' : undefined;
  return (
    <svg className={className} viewBox={`0 0 ${deck.w} ${deck.h}`} width={width} height={width ? (width * deck.h) / deck.w : undefined}
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', background: '#fff', ...(filter ? { filter } : {}), ...style }} role="img"
      aria-label={slide ? `Slide ${ctx.slideNumber}` : layout ? layout.name : ctx.master.name}>
      <defs>{defs.items}</defs>
      <rect width={deck.w} height={deck.h} fill={bgPaint.fill} fillOpacity={bgPaint.fillOpacity} />
      {layers}
      {children}
    </svg>
  );
};

export { effectiveBody };
