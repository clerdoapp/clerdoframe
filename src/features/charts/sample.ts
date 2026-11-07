import { uid, type Chart, type ChartSeries } from '../../model/deck';
import { applyKind, kindById, type ChartKind } from './types';

const S = (name: string, values: number[], extra: Partial<ChartSeries> = {}): ChartSeries => ({ name, values, ...extra });

/** Sample data that suits a chart kind, so a new chart looks right straight away. */
export const sampleData = (k: ChartKind): Pick<Chart, 'categories' | 'series'> => {
  switch (k.type) {
    case 'pie': case 'doughnut':
      return { categories: ['Direct', 'Partners', 'Online', 'Retail'], series: [S('Sales', [8.2, 3.2, 1.4, 1.2])] };
    case 'scatter':
      return { categories: [], series: [S('Trial A', [2.6, 3.4, 4.1, 5.2, 5.9, 7.1, 7.6], { x: [1, 2, 3, 4, 5, 6, 7] }), S('Trial B', [1.8, 2.2, 3.1, 3.3, 4.4, 4.8, 5.9], { x: [1, 2, 3, 4, 5, 6, 7] })] };
    case 'bubble':
      return { categories: [], series: [S('Products', [12, 30, 22, 40, 18], { x: [1.2, 2.4, 3.1, 4.5, 5.2], sizes: [8, 14, 5, 20, 10] }), S('Services', [26, 14, 35, 28], { x: [1.6, 2.9, 3.8, 4.9], sizes: [6, 11, 16, 9] })] };
    case 'stock':
      return k.variant === 'ohlc'
        ? { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], series: [S('Open', [44, 25, 38, 50, 34]), S('High', [55, 57, 57, 58, 58]), S('Low', [11, 12, 13, 11, 25]), S('Close', [25, 38, 50, 35, 43])] }
        : { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], series: [S('High', [55, 57, 57, 58, 58]), S('Low', [11, 12, 13, 11, 25]), S('Close', [25, 38, 50, 35, 43])] };
    case 'surface':
      return { categories: ['10', '20', '30', '40', '50'], series: [S('Row 1', [10, 30, 45, 30, 12]), S('Row 2', [22, 55, 75, 50, 25]), S('Row 3', [30, 70, 95, 66, 34]), S('Row 4', [20, 52, 70, 48, 22]), S('Row 5', [8, 28, 40, 26, 10])] };
    case 'radar':
      return { categories: ['Speed', 'Quality', 'Cost', 'Support', 'Reach'], series: [S('This year', [32, 28, 12, 30, 22]), S('Last year', [22, 20, 26, 18, 14])] };
    case 'histogram':
      return { categories: [], series: [S('Scores', [52, 58, 61, 63, 64, 66, 67, 68, 69, 70, 71, 72, 72, 73, 74, 75, 76, 77, 78, 79, 81, 83, 85, 88, 92])] };
    case 'boxWhisker':
      return { categories: [], series: [S('Team A', [12, 15, 18, 19, 21, 22, 24, 26, 29, 40]), S('Team B', [8, 11, 14, 16, 17, 18, 20, 22, 23, 25]), S('Team C', [15, 18, 20, 23, 25, 27, 30, 31, 33, 35])] };
    case 'waterfall':
      return { categories: ['Start', 'Sales', 'Services', 'Costs', 'Tax', 'Total'], series: [S('Amount', [120, 80, 35, -60, -25, 0])] };
    case 'funnel':
      return { categories: ['Visits', 'Sign-ups', 'Trials', 'Offers', 'Customers'], series: [S('People', [4200, 2600, 1500, 820, 410])] };
    case 'treemap': case 'sunburst':
      return {
        categories: ['North / Shops', 'North / Online', 'South / Shops', 'South / Online', 'South / Partners', 'West / Shops', 'West / Online', 'East / Online'],
        series: [S('Sales', [32, 18, 22, 15, 8, 14, 11, 9])],
      };
    case 'map':
      return { categories: ['North', 'South', 'East', 'West'], series: [S('Customers', [420, 380, 260, 310])] };
    case 'combo':
      return { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], series: [S('Revenue', [42, 48, 55, 51, 63, 70]), S('Margin %', k.variant === 'secondary' ? [18, 21, 24, 22, 27, 29] : [30, 34, 36, 33, 41, 44]), S('Target', [45, 50, 52, 55, 60, 65])] };
    default:
      return { categories: ['Category 1', 'Category 2', 'Category 3', 'Category 4'], series: [S('Series 1', [4.3, 2.5, 3.5, 4.5]), S('Series 2', [2.4, 4.4, 1.8, 2.8]), S('Series 3', [2, 2, 3, 5])] };
  }
};

/** A new chart shape with sample data. */
export const newChart = (kindId: string, box: { x: number; y: number; w: number; h: number }): Chart => {
  const k = kindById(kindId) ?? kindById('col')!;
  const c: Chart = { id: uid('s'), kind: 'chart', name: 'Chart', ...box, chartType: k.type, ...sampleData(k), title: 'Chart title', style: 1 };
  applyKind(c, k);
  if (k.type === 'combo' && k.variant !== 'area') c.series = c.series.slice(0, 2).map((s, i) => ({ ...s, type: i === 0 ? 'col' : 'line', ...(k.variant === 'secondary' && i === 1 ? { secondary: true } : {}) }));
  return c;
};
