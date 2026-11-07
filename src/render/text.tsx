import type { CSSProperties, ReactNode } from 'react';
import type { AutoNumber, AutoShape, BulletSpec, ParaStyle, Run, RunStyle, TextBody } from '../model/deck';
import { css, type ColorCtx } from './color';
import { effectiveBody, effectivePara, fontName, fontStack, masterPromptFor, mergeRun, promptFor, type RenderCtx } from './inherit';

const PT = 96 / 72;

const roman = (n: number): string => {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
};
const alpha = (n: number): string => { let s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };

export const autoNumberText = (scheme: AutoNumber, n: number): string => {
  switch (scheme) {
    case 'arabicParenR': return `${n})`;
    case 'arabicParenBoth': return `(${n})`;
    case 'arabicPlain': return `${n}`;
    case 'alphaLcPeriod': return `${alpha(n)}.`;
    case 'alphaUcPeriod': return `${alpha(n).toUpperCase()}.`;
    case 'alphaLcParenR': return `${alpha(n)})`;
    case 'alphaUcParenR': return `${alpha(n).toUpperCase()})`;
    case 'romanLcPeriod': return `${roman(n)}.`;
    case 'romanUcPeriod': return `${roman(n).toUpperCase()}.`;
    default: return `${n}.`;
  }
};

export const runCss = (st: RunStyle, ctx: RenderCtx, scale = 1): CSSProperties => {
  const cctx: ColorCtx = { theme: ctx.theme };
  const size = (st.size ?? 18) * PT * scale;
  const deco: string[] = [];
  if (st.underline && st.underline !== 'none') deco.push('underline');
  if (st.strike && st.strike !== 'none') deco.push('line-through');
  const out: CSSProperties = {
    fontFamily: fontStack(fontName(st.font, ctx.theme)),
    fontSize: st.baseline ? size * 0.67 : size,
    fontWeight: st.bold ? 700 : 400,
    fontStyle: st.italic ? 'italic' : 'normal',
    color: css(st.color, cctx, '#000000'),
  };
  if (deco.length) {
    out.textDecorationLine = deco.join(' ');
    if (st.underline === 'dbl' || st.strike === 'dbl') out.textDecorationStyle = 'double';
    else if (st.underline === 'wavy') out.textDecorationStyle = 'wavy';
    else if (st.underline === 'dotted') out.textDecorationStyle = 'dotted';
    else if (st.underline === 'dash') out.textDecorationStyle = 'dashed';
    if (st.underline === 'heavy') out.textDecorationThickness = '0.12em';
  }
  if (st.baseline) out.verticalAlign = st.baseline > 0 ? 'super' : 'sub';
  if (st.caps === 'all') out.textTransform = 'uppercase';
  if (st.caps === 'small') out.fontVariant = 'small-caps';
  if (st.spacing) out.letterSpacing = st.spacing * PT * scale;
  if (st.highlight) out.backgroundColor = css(st.highlight, cctx);
  if (st.shadow) out.textShadow = '1px 1px 2px rgba(0,0,0,.45)';
  if (st.outline && st.outline.fill.type === 'solid') {
    (out as Record<string, unknown>).WebkitTextStroke = `${Math.max(0.5, st.outline.width * PT * scale)}px ${css(st.outline.fill.color, cctx)}`;
  }
  if (st.fill?.type === 'gradient') {
    const stops = st.fill.stops.map((s) => `${css(s.color, cctx)} ${(s.pos * 100).toFixed(1)}%`).join(', ');
    out.backgroundImage = `linear-gradient(${(st.fill.angle + 90) % 360}deg, ${stops})`;
    (out as Record<string, unknown>).WebkitBackgroundClip = 'text';
    out.backgroundClip = 'text';
    out.color = 'transparent';
  } else if (st.fill?.type === 'none') {
    out.color = 'transparent';
  }
  return out;
};

const fieldText = (r: Run, ctx: RenderCtx): string => {
  if (r.field === 'slidenum') return ctx.slideNumber ? String(ctx.slideNumber) : '‹#›';
  if (r.field === 'datetime') return r.text && !/^\s*$/.test(r.text) && ctx.slideNumber === 0 ? r.text : new Date().toLocaleDateString();
  return r.text;
};

interface Props {
  shape: AutoShape;
  body: TextBody | undefined;
  ctx: RenderCtx;
  /** Box the text lays out in (shape text rect). */
  w: number;
  h: number;
  /** Show the placeholder prompt when empty. */
  prompt?: boolean;
  /** Attributes for editing: data-p / data-r indexes on paragraphs and runs. */
  marks?: boolean;
}

export interface ParaRender { style: ParaStyle; runs: { run: Run; style: RunStyle }[] }

/** Resolved paragraph and run styles for a body, used by the renderer, the editor and exporters. */
export const resolveText = (shape: AutoShape, body: TextBody, ctx: RenderCtx): ParaRender[] =>
  body.paras.map((p) => {
    const ps = effectivePara(shape, p.style, ctx);
    return { style: ps, runs: p.runs.map((r) => ({ run: r, style: mergeRun(ps.defRun, r.style) })) };
  });

const bulletNode = (b: BulletSpec | undefined, ps: ParaStyle, first: RunStyle, counter: number, ctx: RenderCtx, scale: number): ReactNode => {
  if (!b || b.type === 'none') return null;
  const size = (first.size ?? 18) * scale * ((b.type === 'char' || b.type === 'auto') && b.size ? b.size / 100 : 1);
  const color = (b.type === 'char' || b.type === 'auto') && b.color ? css(b.color, { theme: ctx.theme }) : css(first.color, { theme: ctx.theme });
  const st: CSSProperties = {
    position: 'absolute', left: (ps.marginLeft ?? 0) + (ps.indent ?? 0), width: Math.max(0, -(ps.indent ?? 0)), whiteSpace: 'nowrap',
    fontSize: size * PT, color, fontFamily: b.type === 'char' && b.font ? fontStack(b.font) : fontStack(fontName(first.font, ctx.theme)),
    fontWeight: first.bold ? 700 : 400,
  };
  if (b.type === 'char') return <span style={st} contentEditable={false} data-bullet>{b.char}</span>;
  if (b.type === 'auto') return <span style={st} contentEditable={false} data-bullet>{autoNumberText(b.scheme, counter)}</span>;
  return <span style={{ ...st, display: 'inline-block', height: size * PT, background: 'currentColor', borderRadius: 2 }} contentEditable={false} data-bullet />;
};

/** HTML for a text body. Drawn inside a foreignObject by the slide renderer and as the editing surface. */
export const TextContent = ({ shape, body, ctx, w, h, prompt, marks }: Props) => {
  const eff = effectiveBody(shape, ctx);
  const scale = eff.autofit === 'shrink' ? body?.fontScale ?? 1 : 1;
  const empty = !body || body.paras.every((p) => p.runs.every((r) => !r.text && !r.br));
  let paras = body?.paras ?? [{ runs: [] }];
  let isPrompt = false;
  if (empty && (prompt || ctx.onMaster) && shape.ph) {
    if (ctx.onMaster) {
      const n = shape.ph.type === 'body' || shape.ph.type === 'obj' ? 5 : 1;
      paras = Array.from({ length: n }, (_, i) => ({ runs: [{ text: masterPromptFor(shape, i) }], style: { level: i } }));
    } else {
      const t = promptFor(shape);
      if (t) { paras = [{ runs: [{ text: t }], style: body?.paras[0]?.style }]; isPrompt = !ctx.onMaster; }
    }
  }
  const counters: number[] = [];
  const vert = eff.vert && eff.vert !== 'horz';
  const box: CSSProperties = {
    width: vert ? h : w, height: vert ? w : h, boxSizing: 'border-box',
    padding: `${eff.inset!.t}px ${eff.inset!.r}px ${eff.inset!.b}px ${eff.inset!.l}px`,
    display: 'flex', flexDirection: 'column',
    justifyContent: eff.vAlign === 'ctr' ? 'center' : eff.vAlign === 'b' ? 'flex-end' : 'flex-start',
    overflow: 'visible', wordWrap: 'break-word', overflowWrap: 'break-word',
    whiteSpace: eff.wrap === false ? 'pre' : 'pre-wrap', lineHeight: 1.2,
    ...(eff.columns && eff.columns > 1 ? { display: 'block', columnCount: eff.columns, columnGap: eff.columnGap ?? 20 } : {}),
    ...(vert ? { transformOrigin: '0 0', transform: eff.vert === 'vert270' ? `translate(0px, ${h}px) rotate(-90deg)` : `translate(${w}px, 0px) rotate(90deg)` } : {}),
    ...(eff.vert === 'eaVert' ? { writingMode: 'vertical-rl', transform: 'none', width: w, height: h } : {}),
    opacity: isPrompt ? 0.62 : 1,
  };
  return (
    <div style={box} data-textbox>
      <div style={{ flex: 'none', minHeight: 0 }}>
        {paras.map((p, pi) => {
          const ps = effectivePara(shape, p.style, ctx);
          const level = ps.level ?? 0;
          const b = isPrompt ? { type: 'none' as const } : ps.bullet;
          if (b?.type === 'auto') {
            counters[level] = counters[level] === undefined ? (b.start ?? 1) : counters[level]! + 1;
            counters.length = level + 1;
          } else counters.length = level;
          const first = mergeRun(ps.defRun, p.runs[0]?.style);
          const size = (first.size ?? 18) * PT * scale;
          const lh = ps.lineSpacingPts ? `${(ps.lineSpacing ?? 0) * PT * scale}px` : String(((ps.lineSpacing ?? 100) / 100) * 1.2);
          const pst: CSSProperties = {
            margin: 0, position: 'relative',
            paddingLeft: (ps.marginLeft ?? 0) * (ps.rtl ? 0 : 1), paddingRight: ps.rtl ? ps.marginLeft ?? 0 : 0,
            textIndent: b && b.type !== 'none' ? 0 : ps.indent ?? 0,
            textAlign: ps.align === 'ctr' ? 'center' : ps.align === 'r' ? 'right' : ps.align === 'just' || ps.align === 'dist' ? 'justify' : 'left',
            direction: ps.rtl ? 'rtl' : undefined,
            lineHeight: lh,
            marginTop: pi ? ((ps.spaceBefore ?? 0) * PT * scale) : 0,
            marginBottom: (ps.spaceAfter ?? 0) * PT * scale,
            minHeight: size * ((ps.lineSpacing ?? 100) / 100) * 1.2,
            fontSize: size,
            fontFamily: runCss(first, ctx, scale).fontFamily,
          };
          return (
            <p key={pi} style={pst} {...(marks ? { 'data-p': pi } : {})}>
              {bulletNode(b, ps, first, counters[level] ?? 1, ctx, scale)}
              {p.runs.length === 0 ? <br /> : p.runs.map((r, ri) => {
                if (r.br) return <br key={ri} {...(marks ? { 'data-r': ri, 'data-br': '' } : {})} />;
                const st = mergeRun(ps.defRun, r.style);
                const text = r.field ? fieldText(r, ctx) : r.text;
                const style = runCss(st, ctx, scale);
                const link = st.link?.url && /^(https?:|mailto:)/i.test(st.link.url);
                if (link) { style.textDecorationLine = 'underline'; if (!r.style?.color) style.color = css({ theme: 'hlink' }, { theme: ctx.theme }); }
                return <span key={ri} style={style} {...(marks ? { 'data-r': ri } : {})}{...(r.field ? { 'data-field': r.field } : {})}>{text}</span>;
              })}
            </p>
          );
        })}
      </div>
    </div>
  );
};
