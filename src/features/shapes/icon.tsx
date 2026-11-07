import { memo } from 'react';
import { geometry, isLineGeom } from '../../render/geometry';

const SHADE: Record<string, string> = { darken: 'rgba(0,0,0,.32)', darkenLess: 'rgba(0,0,0,.16)', lighten: 'rgba(255,255,255,.45)', lightenLess: 'rgba(255,255,255,.25)' };

/** Shapes that read better drawn wider or taller than square in a small preview. */
const ASPECT: Record<string, [number, number]> = {
  leftRightArrow: [1.4, 0.8], upDownArrow: [0.8, 1.4], homePlate: [1.4, 0.8], chevron: [1.2, 0.9], ribbon: [1.5, 0.75], ribbon2: [1.5, 0.75], ellipseRibbon: [1.5, 0.75],
  ellipseRibbon2: [1.5, 0.75], leftRightRibbon: [1.5, 0.75], wave: [1.4, 0.8], doubleWave: [1.4, 0.8], flowChartTerminator: [1.4, 0.7], flowChartProcess: [1.3, 0.85],
  flowChartAlternateProcess: [1.3, 0.85], flowChartInputOutput: [1.3, 0.85], flowChartPredefinedProcess: [1.3, 0.85], flowChartDocument: [1.3, 0.85], flowChartMultidocument: [1.3, 0.85],
  flowChartPreparation: [1.3, 0.85], flowChartManualInput: [1.3, 0.85], flowChartManualOperation: [1.3, 0.85], flowChartPunchedTape: [1.3, 0.85], flowChartMagneticTape: [1, 1],
  rightArrow: [1.3, 0.8], leftArrow: [1.3, 0.8], upArrow: [0.8, 1.3], downArrow: [0.8, 1.3], stripedRightArrow: [1.3, 0.8], notchedRightArrow: [1.3, 0.8], mathMinus: [1.2, 0.9],
  mathEqual: [1.2, 0.9], horizontalScroll: [1.3, 0.85], verticalScroll: [0.85, 1.3], leftBracket: [0.5, 1.3], rightBracket: [0.5, 1.3], leftBrace: [0.5, 1.3], rightBrace: [0.5, 1.3],
  can: [0.9, 1.2], curvedRightArrow: [0.7, 1.3], curvedLeftArrow: [0.7, 1.3], curvedUpArrow: [1.3, 0.7], curvedDownArrow: [1.3, 0.7], parallelogram: [1.3, 0.8], trapezoid: [1.3, 0.85],
};

export interface ShapeIconProps { geom: string; size?: number; adj?: Record<string, number>; stroke?: string; fill?: string; title?: string; strokeWidth?: number }

/** Small SVG preview of a preset, for galleries and menus. Colours follow the surrounding text colour by default. */
export const ShapeIcon = memo(({ geom, size = 28, adj, stroke = 'currentColor', fill = 'color-mix(in srgb, currentColor 14%, transparent)', title, strokeWidth = 1.3 }: ShapeIconProps) => {
  const [ax, ay] = ASPECT[geom] ?? [1, 1];
  const B = 100, pad = 8;
  const k = (B - 2 * pad) / Math.max(ax, ay);
  const w = ax * k, h = ay * k;
  const isLine = isLineGeom(geom);
  const g = geometry(geom, w, h, adj);
  const sw = strokeWidth;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${B} ${B}`} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} style={{ overflow: 'visible' }}>
      {title && <title>{title}</title>}
      <g transform={`translate(${(B - w) / 2} ${(B - h) / 2})`}>
        {g.paths.map((p, i) => {
          const noFill = isLine || p.fill === 'none';
          const over = p.fill ? SHADE[p.fill] : undefined;
          return (
            <g key={i}>
              {!noFill && <path d={p.d} fill={fill} stroke="none" />}
              {!noFill && over && <path d={p.d} fill={over} stroke="none" />}
              {p.stroke !== false && <path d={p.d} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
        {geom === 'straightConnector1' && <path d={`M${w} ${h}l-16 -4l6 -6Z`} fill={stroke} stroke="none" />}
      </g>
    </svg>
  );
});
ShapeIcon.displayName = 'ShapeIcon';
