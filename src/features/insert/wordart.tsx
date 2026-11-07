import { useId } from 'react';
import { run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import { textOf, type AutoShape, type Fill, type RunStyle, type Shape, type Theme } from '../../model/deck';
import { css } from '../../render/color';
import { WARPS, warpPath, WORDART_STYLES } from './data';

/** SVG paint for a run fill (solid or linear gradient), adding the gradient to defs. */
const fillPaint = (f: Fill | undefined, theme: Theme, id: string, defs: React.ReactNode[], fallback: string): string => {
  if (!f) return fallback;
  if (f.type === 'none') return 'none';
  if (f.type === 'solid') return css(f.color, { theme });
  if (f.type === 'gradient') {
    const r = ((f.angle % 360) * Math.PI) / 180;
    const dx = Math.cos(r) / 2, dy = Math.sin(r) / 2;
    defs.push(<linearGradient key={id} id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
      {f.stops.map((st, i) => <stop key={i} offset={st.pos} stopColor={css(st.color, { theme })} />)}
    </linearGradient>);
    return `url(#${id})`;
  }
  return fallback;
};

/** Sample letter "A" in a WordArt style. */
export const WordArtSample = ({ style, theme, text = 'A', size = 44 }: { style: RunStyle; theme: Theme; text?: string; size?: number }) => {
  const uidStr = useId().replace(/[^a-zA-Z0-9]/g, '');
  const defs: React.ReactNode[] = [];
  const fill = fillPaint(style.fill, theme, `wa${uidStr}`, defs, css(style.color, { theme }));
  const stroke = style.outline && style.outline.fill.type === 'solid' ? css(style.outline.fill.color, { theme }) : 'none';
  return (
    <svg viewBox="0 0 60 60" aria-hidden>
      <defs>{defs}<filter id={`sh${uidStr}`}><feDropShadow dx="1.5" dy="1.5" stdDeviation="1" floodOpacity=".45" /></filter></defs>
      <text x="30" y="31" textAnchor="middle" dominantBaseline="middle" fontFamily="Carlito, Arimo, sans-serif" fontWeight="700" fontSize={size}
        fill={fill} stroke={stroke} strokeWidth={style.outline ? Math.max(0.8, style.outline.width) : 0} paintOrder="stroke" filter={style.shadow ? `url(#sh${uidStr})` : undefined}>{text}</text>
    </svg>
  );
};

const textShapes = (s: FrameStore): AutoShape[] => s.selected().filter((x): x is AutoShape => x.kind === 'shape' && !!x.text);

/** WordArt styles; with text selected they restyle it, otherwise they add a new WordArt box. */
export const WordArtGallery = ({ store, onDone }: { store: FrameStore; onDone?: () => void }) => {
  const theme = (store.slide ? store.masterOf(store.slide).master : store.deck.masters[0]!).theme;
  const sel = textShapes(store);
  const warp = sel[0]?.text?.warp ?? 'textNoShape';
  return (
    <div className="wapop">
      <div className="cgtitle">{sel.length ? 'Restyle selected text' : 'Add WordArt'}</div>
      <div className="wagal">
        {WORDART_STYLES.map((w) => (
          <button key={w.id} title={w.name} aria-label={w.name} onClick={() => { run(store, 'insert.wordart', w.id); onDone?.(); }}>
            <WordArtSample style={w.style} theme={theme} />
          </button>
        ))}
      </div>
      {sel.length > 0 && (
        <>
          <div className="cgtitle" style={{ marginTop: 6 }}>Transform</div>
          <WarpGallery value={warp} onPick={(id) => setWarp(store, id)} />
        </>
      )}
    </div>
  );
};

export const setWarp = (store: FrameStore, id: string): void => {
  store.tryChange('Text transform', () => {
    for (const s of textShapes(store)) { if (id === 'textNoShape') delete s.text!.warp; else s.text!.warp = id; }
  });
};

export const WarpGallery = ({ value, onPick }: { value: string; onPick: (id: string) => void }) => (
  <div className="warpgal">
    {WARPS.map((w) => {
      const d = warpPath(w.id, 80, 34);
      const pid = `wp-${w.id}`;
      return (
        <button key={w.id} className={value === w.id ? 'on' : ''} title={w.name} onClick={() => onPick(w.id)}>
          <svg viewBox="0 0 80 34" aria-hidden>
            {d ? <><defs><path id={pid} d={d} /></defs><text fontSize="11" fontWeight="700" fill="currentColor"><textPath href={`#${pid}`} startOffset="50%" textAnchor="middle">abcde</textPath></text></>
              : <text x="40" y="22" fontSize="12" fontWeight="700" textAnchor="middle" fill="currentColor" style={w.id === 'textInflate' ? { transform: 'scaleY(1.4)', transformOrigin: '40px 18px' } : w.id === 'textDeflate' ? { transform: 'scaleY(.7)', transformOrigin: '40px 18px' } : undefined}>abcde</text>}
          </svg>
          <span>{w.name}</span>
        </button>
      );
    })}
  </div>
);

/**
 * Draws warped text along its guide path on the canvas, for shapes whose TextBody has a warp
 * that is a single-line path. Other warps keep their data and draw as plain text.
 */
export const WarpedText = ({ shape, theme }: { shape: Shape; theme: Theme }) => {
  if (shape.kind !== 'shape' || !shape.text?.warp) return null;
  const d = warpPath(shape.text.warp, shape.w, shape.h);
  if (!d) return null;
  const run0 = shape.text.paras[0]?.runs.find((r) => r.text)?.style ?? {};
  const size = (run0.size ?? 36) * (96 / 72);
  const id = `warp-${shape.id}`;
  const defs: React.ReactNode[] = [];
  const fill = fillPaint(run0.fill, theme, `${id}-g`, defs, css(run0.color ?? { theme: 'tx1' }, { theme }));
  return (
    <g>
      <defs><path id={id} d={d} />{defs}</defs>
      <text fontSize={size} fontWeight={run0.bold ? 700 : 400} fontFamily="Carlito, Arimo, sans-serif" fill={fill}
        stroke={run0.outline?.fill.type === 'solid' ? css(run0.outline.fill.color, { theme }) : undefined} strokeWidth={run0.outline?.width} paintOrder="stroke">
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{textOf(shape.text).replace(/\n/g, ' ')}</textPath>
      </text>
    </g>
  );
};
