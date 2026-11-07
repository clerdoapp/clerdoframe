import type { Chart, ChartSeries, ChartType } from '../../model/deck';

/** One entry in the chart gallery: a chart type plus the grouping and variant that make the subtype. */
export interface ChartKind {
  id: string;
  label: string;
  group: ChartGroup;
  type: ChartType;
  grouping?: Chart['grouping'];
  variant?: string;
}

export type ChartGroup = 'Column' | 'Bar' | 'Line' | 'Pie' | 'Area' | 'X Y' | 'Stock' | 'Surface' | 'Radar' | 'Hierarchy' | 'Statistical' | 'Waterfall' | 'Funnel' | 'Combo' | 'Map';
export const CHART_GROUPS: ChartGroup[] = ['Column', 'Bar', 'Line', 'Pie', 'Area', 'X Y', 'Stock', 'Surface', 'Radar', 'Hierarchy', 'Statistical', 'Waterfall', 'Funnel', 'Combo', 'Map'];

export const CHART_KINDS: ChartKind[] = [
  { id: 'col', label: 'Clustered column', group: 'Column', type: 'col', grouping: 'clustered' },
  { id: 'colStacked', label: 'Stacked column', group: 'Column', type: 'col', grouping: 'stacked' },
  { id: 'colPercent', label: '100% stacked column', group: 'Column', type: 'col', grouping: 'percentStacked' },
  { id: 'bar', label: 'Clustered bar', group: 'Bar', type: 'bar', grouping: 'clustered' },
  { id: 'barStacked', label: 'Stacked bar', group: 'Bar', type: 'bar', grouping: 'stacked' },
  { id: 'barPercent', label: '100% stacked bar', group: 'Bar', type: 'bar', grouping: 'percentStacked' },
  { id: 'line', label: 'Line', group: 'Line', type: 'line', grouping: 'standard' },
  { id: 'lineMarkers', label: 'Line with markers', group: 'Line', type: 'line', grouping: 'standard', variant: 'markers' },
  { id: 'lineSmooth', label: 'Smooth line', group: 'Line', type: 'line', grouping: 'standard', variant: 'smooth' },
  { id: 'lineStacked', label: 'Stacked line', group: 'Line', type: 'line', grouping: 'stacked' },
  { id: 'linePercent', label: '100% stacked line', group: 'Line', type: 'line', grouping: 'percentStacked' },
  { id: 'pie', label: 'Pie', group: 'Pie', type: 'pie' },
  { id: 'pieExploded', label: 'Exploded pie', group: 'Pie', type: 'pie', variant: 'exploded' },
  { id: 'doughnut', label: 'Doughnut', group: 'Pie', type: 'doughnut' },
  { id: 'area', label: 'Area', group: 'Area', type: 'area', grouping: 'standard' },
  { id: 'areaStacked', label: 'Stacked area', group: 'Area', type: 'area', grouping: 'stacked' },
  { id: 'areaPercent', label: '100% stacked area', group: 'Area', type: 'area', grouping: 'percentStacked' },
  { id: 'scatter', label: 'Scatter', group: 'X Y', type: 'scatter' },
  { id: 'scatterSmoothMarkers', label: 'Smooth lines and markers', group: 'X Y', type: 'scatter', variant: 'smoothMarkers' },
  { id: 'scatterSmooth', label: 'Smooth lines', group: 'X Y', type: 'scatter', variant: 'smooth' },
  { id: 'scatterLinesMarkers', label: 'Straight lines and markers', group: 'X Y', type: 'scatter', variant: 'linesMarkers' },
  { id: 'scatterLines', label: 'Straight lines', group: 'X Y', type: 'scatter', variant: 'lines' },
  { id: 'bubble', label: 'Bubble', group: 'X Y', type: 'bubble' },
  { id: 'stockHlc', label: 'High-low-close', group: 'Stock', type: 'stock' },
  { id: 'stockOhlc', label: 'Open-high-low-close', group: 'Stock', type: 'stock', variant: 'ohlc' },
  { id: 'surface', label: 'Heat surface', group: 'Surface', type: 'surface' },
  { id: 'surfaceContour', label: 'Contour', group: 'Surface', type: 'surface', variant: 'contour' },
  { id: 'radar', label: 'Radar', group: 'Radar', type: 'radar' },
  { id: 'radarMarkers', label: 'Radar with markers', group: 'Radar', type: 'radar', variant: 'markers' },
  { id: 'radarFilled', label: 'Filled radar', group: 'Radar', type: 'radar', variant: 'filled' },
  { id: 'treemap', label: 'Treemap', group: 'Hierarchy', type: 'treemap' },
  { id: 'sunburst', label: 'Sunburst', group: 'Hierarchy', type: 'sunburst' },
  { id: 'histogram', label: 'Histogram', group: 'Statistical', type: 'histogram' },
  { id: 'boxWhisker', label: 'Box and whisker', group: 'Statistical', type: 'boxWhisker' },
  { id: 'waterfall', label: 'Waterfall', group: 'Waterfall', type: 'waterfall' },
  { id: 'funnel', label: 'Funnel', group: 'Funnel', type: 'funnel' },
  { id: 'combo', label: 'Column and line', group: 'Combo', type: 'combo' },
  { id: 'comboSecondary', label: 'Column and line, second axis', group: 'Combo', type: 'combo', variant: 'secondary' },
  { id: 'comboArea', label: 'Area and column', group: 'Combo', type: 'combo', variant: 'area' },
  { id: 'map', label: 'Filled map', group: 'Map', type: 'map' },
];

export const kindById = (id: string): ChartKind | undefined => CHART_KINDS.find((k) => k.id === id);

/** The gallery entry that best matches a chart. */
export const kindOf = (c: Chart): ChartKind => {
  const list = CHART_KINDS.filter((k) => k.type === c.chartType);
  const g = c.grouping === 'standard' && (c.chartType === 'col' || c.chartType === 'bar') ? 'clustered' : c.grouping;
  return list.find((k) => (k.grouping ?? g) === g && (k.variant ?? '') === (c.variant ?? ''))
    ?? list.find((k) => (k.variant ?? '') === (c.variant ?? ''))
    ?? list[0] ?? CHART_KINDS[0]!;
};

/** Families that share a drawing routine. */
export type Family = 'cartesian' | 'pie' | 'scatter' | 'bubble' | 'radar' | 'stock' | 'surface' | 'histogram' | 'box' | 'treemap' | 'sunburst' | 'waterfall' | 'funnel' | 'map';

export const familyOf = (t: ChartType): Family => {
  switch (t) {
    case 'col': case 'bar': case 'line': case 'area': case 'combo': return 'cartesian';
    case 'pie': case 'doughnut': return 'pie';
    case 'boxWhisker': return 'box';
    default: return t;
  }
};

/** Types whose categories are coloured individually (legend lists categories). */
export const byCategory = (t: ChartType): boolean => ['pie', 'doughnut', 'treemap', 'sunburst', 'funnel', 'map'].includes(t);
export const hasAxes = (t: ChartType): boolean => !['pie', 'doughnut', 'treemap', 'sunburst', 'funnel', 'radar', 'map'].includes(t);

/** How each series of a combo chart is drawn by default. */
export const comboSeriesType = (variant: string | undefined, i: number, n: number): ChartType => {
  if (variant === 'area') return i < Math.max(1, Math.ceil(n / 2)) && !(n > 1 && i === n - 1) ? 'area' : 'col';
  return i === 0 ? 'col' : 'line';
};

/** Applies a gallery entry to a chart, keeping its data and settings. */
export const applyKind = (c: Chart, k: ChartKind): void => {
  c.chartType = k.type;
  if (k.grouping) c.grouping = k.grouping; else delete c.grouping;
  if (k.variant) c.variant = k.variant; else delete c.variant;
  const n = c.series.length;
  c.series = c.series.map((s, i): ChartSeries => {
    const { type: _t, secondary: _s, ...rest } = s;
    const out: ChartSeries = { ...rest };
    if (k.type === 'combo') {
      out.type = comboSeriesType(k.variant, i, n);
      if (k.variant === 'secondary' && out.type === 'line') out.secondary = true;
    }
    return out;
  });
  if (k.type === 'doughnut' && c.holeSize === undefined) c.holeSize = 50;
};
