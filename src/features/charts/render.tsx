import type { ReactNode } from 'react';
import type { Chart, ChartType, Theme } from '../../model/deck';
import { adjustLum } from '../../render/color';
import { fontStack } from '../../render/inherit';
import type { Defs } from '../../render/paint';
import { inksFor, seriesHex, styleOf, type ChartStyle, type Inks } from './palette';
import { boxStats, buildTree, histogramBins, linePath, squarify, sunburstArcs, treeDepth, waterfallSteps, type TreeNode } from './stats';
import { byCategory, comboSeriesType, familyOf, type Family } from './types';

// ---------- Numbers and scales ----------

const clean = (v: number): number => +v.toPrecision(12);
interface Scale { min: number; max: number; step: number; ticks: number[] }

const niceNum = (x: number): number => {
  if (x <= 0 || !Number.isFinite(x)) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * 10 ** exp;
};

export const niceScale = (lo: number, hi: number, maxTicks = 6): Scale => {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) { if (lo === 0) hi = 1; else { const d = Math.abs(lo) * 0.1; lo -= d; hi += d; } }
  const step = niceNum((hi - lo) / (Math.max(2, maxTicks) - 1));
  const min = clean(Math.floor(lo / step + 1e-9) * step);
  const max = clean(Math.ceil(hi / step - 1e-9) * step);
  const ticks: number[] = [];
  for (let i = 0; min + i * step <= max + step / 2 && i < 100; i++) ticks.push(clean(min + i * step));
  return { min, max: Math.max(max, ticks.at(-1) ?? max), step, ticks };
};

const fixedScale = (lo: number, hi: number, n: number, fmin?: number, fmax?: number): Scale => {
  if (fmin !== undefined && Number.isFinite(fmin)) lo = fmin;
  if (fmax !== undefined && Number.isFinite(fmax)) hi = fmax;
  if (lo >= hi) hi = lo + 1;
  const s = niceScale(lo, hi, n);
  if (fmin === undefined && fmax === undefined) return s;
  const min = fmin ?? s.min, max = fmax ?? s.max;
  const list = s.ticks.filter((t) => t >= min - 1e-9 && t <= max + 1e-9);
  if (!list.length || Math.abs(list[0]! - min) > s.step * 0.25) list.unshift(min);
  if (Math.abs(list.at(-1)! - max) > s.step * 0.25) list.push(max);
  return { min, max, step: s.step, ticks: list };
};

const extent = (vals: number[], zero: boolean): [number, number] => {
  if (!vals.length) return [0, 1];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (zero || (lo > 0 && lo < hi * 0.6) || (hi < 0 && hi > lo * 0.6)) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  return [lo, hi];
};

/** Short number text: 1.2K, 3.4M, or up to two decimals. */
export const fmtNum = (v: number, compact = false, pct = false): string => {
  if (pct) return `${Math.round(v * 100)}%`;
  const a = Math.abs(v);
  if (compact) {
    const u = a >= 1e9 ? ['B', 1e9] as const : a >= 1e6 ? ['M', 1e6] as const : a >= 1e4 ? ['K', 1e3] as const : null;
    if (u) return `${clean(+(v / u[1]).toFixed(1))}${u[0]}`;
  }
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return clean(+v.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d });
};

const num = (v: number | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------- Drawing context ----------

interface Box { x: number; y: number; w: number; h: number }
interface Ctx {
  c: Chart; theme: Theme; st: ChartStyle; ink: Inks; font: string; fs: number; thumb: boolean; plot: Box;
  els: ReactNode[]; defs: Defs; grads: Map<string, string>; shadow: string | null; labels: boolean; grid: boolean; k: number;
}

export interface ChartDrawOpts { thumb?: boolean }

const textW = (s: string, size: number): number => s.length * size * 0.55;
const trunc = (s: string, maxW: number, size: number): string => {
  if (textW(s, size) <= maxW) return s;
  const n = Math.max(0, Math.floor(maxW / (size * 0.55)) - 1);
  return n ? `${s.slice(0, n)}…` : '';
};

const key = (c: Ctx, p: string) => `${p}${c.k++}`;

const txt = (c: Ctx, x: number, y: number, s: string, o: { size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number; fill?: string; rotate?: number; halo?: boolean } = {}): void => {
  const size = o.size ?? c.fs;
  c.els.push(
    <text key={key(c, 't')} x={x} y={y} fontSize={size} fontFamily={c.font} fontWeight={o.weight ?? 400} textAnchor={o.anchor ?? 'start'} fill={o.fill ?? c.ink.muted}
      transform={o.rotate ? `rotate(${o.rotate} ${x} ${y})` : undefined}
      {...(o.halo ? { stroke: 'rgba(0,0,0,0.28)', strokeWidth: size * 0.16, paintOrder: 'stroke', strokeLinejoin: 'round' as const } : {})}>{s}</text>,
  );
};

/** Paint for a filled mark in the chart's style. */
const markPaint = (c: Ctx, hex: string): { fill: string; stroke?: string; strokeWidth?: number; fillOpacity?: number; filter?: string } => {
  switch (c.st.marks) {
    case 'outline': return { fill: adjustLum(hex, 0.72), stroke: hex, strokeWidth: Math.max(1, c.fs * 0.12) };
    case 'soft': return { fill: hex, fillOpacity: 0.82 };
    case 'gradient': {
      let id = c.grads.get(hex);
      if (!id) {
        id = c.defs.id('cg');
        c.grads.set(hex, id);
        c.defs.add(<linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={adjustLum(hex, 0.32)} /><stop offset="1" stopColor={adjustLum(hex, -0.18)} /></linearGradient>);
      }
      return { fill: `url(#${id})` };
    }
    case 'shadow': return { fill: hex, ...(c.shadow ? { filter: `url(#${c.shadow})` } : {}) };
    default: return { fill: hex };
  }
};

const sColor = (c: Ctx, i: number): string => seriesHex(c.c, c.theme, i, c.c.series[i]?.color);
const catColor = (c: Ctx, i: number): string => seriesHex(c.c, c.theme, i);

// ---------- Legend ----------

interface LegendEntry { label: string; color: string; line: boolean }

const legendFor = (c: Chart, theme: Theme, fam: Family, ink: Inks): LegendEntry[] => {
  const col = (i: number) => seriesHex(c, theme, i, c.series[i]?.color);
  switch (fam) {
    case 'pie': case 'funnel': return c.categories.map((l, i) => ({ label: l, color: seriesHex(c, theme, i), line: false }));
    case 'treemap': case 'sunburst': {
      const tree = buildTree(c.categories.map((x) => x.split('/').map((p) => p.trim())), c.series[0]?.values ?? []);
      return tree.children.map((n, i) => ({ label: n.name, color: seriesHex(c, theme, i), line: false }));
    }
    case 'histogram': case 'map': case 'surface': return [];
    case 'waterfall': return [{ label: 'Increase', color: ink.up, line: false }, { label: 'Decrease', color: ink.down, line: false }, { label: 'Total', color: ink.total, line: false }];
    case 'stock': return [];
    default: return c.series.map((s, i) => {
      const t = seriesType(c, i);
      return { label: s.name || `Series ${i + 1}`, color: col(i), line: (t === 'line' || (fam === 'scatter' && !!c.variant)) && fam !== 'radar' };
    });
  }
};

const seriesType = (c: Chart, i: number): ChartType => {
  if (c.chartType === 'combo') return c.series[i]?.type ?? comboSeriesType(c.variant, i, c.series.length);
  return c.chartType;
};

const drawLegend = (c: Ctx, items: LegendEntry[], pos: 'l' | 'r' | 't' | 'b', W: number, area: { top: number; bottom: number; left: number; right: number }): void => {
  const fs = c.fs;
  const sw = fs * 0.85, gap = fs * 0.5, rowH = fs * 1.5;
  const itemW = (l: string) => Math.min(fs * 12, textW(l, fs)) + sw + gap * 2.4;
  const item = (x: number, y: number, it: LegendEntry, max: number) => {
    if (it.line) c.els.push(<line key={key(c, 'lg')} x1={x} x2={x + sw * 1.3} y1={y} y2={y} stroke={it.color} strokeWidth={fs * 0.22} strokeLinecap="round" />);
    else c.els.push(<rect key={key(c, 'lg')} x={x} y={y - sw / 2} width={sw} height={sw} rx={c.st.round ? sw * 0.25 : 0} fill={it.color} />);
    txt(c, x + sw * (it.line ? 1.3 : 1) + gap, y + fs * 0.35, trunc(it.label, max, fs), { fill: c.ink.ink });
  };
  if (pos === 't' || pos === 'b') {
    const rows: LegendEntry[][] = [[]];
    let used = 0;
    for (const it of items) {
      if (used + itemW(it.label) > area.right - area.left && rows.at(-1)!.length) { if (rows.length === 2) break; rows.push([]); used = 0; }
      rows.at(-1)!.push(it); used += itemW(it.label);
    }
    const h = rows.length * rowH;
    const y0 = pos === 't' ? area.top : area.bottom - h;
    rows.forEach((row, ri) => {
      const total = row.reduce((a, it) => a + itemW(it.label), 0);
      let x = Math.max(area.left, (W - total) / 2);
      row.forEach((it) => { item(x, y0 + ri * rowH + rowH / 2, it, fs * 12); x += itemW(it.label); });
    });
    if (pos === 't') area.top += h + fs * 0.4; else area.bottom -= h + fs * 0.4;
  } else {
    const colW = Math.min((area.right - area.left) * 0.32, Math.max(...items.map((it) => itemW(it.label))));
    const shown = items.slice(0, Math.max(1, Math.floor((area.bottom - area.top) / rowH)));
    const y0 = area.top + (area.bottom - area.top - shown.length * rowH) / 2 + rowH / 2;
    const x0 = pos === 'l' ? area.left : area.right - colW;
    shown.forEach((it, i) => item(x0, y0 + i * rowH, it, colW - sw - gap * 2));
    if (pos === 'l') area.left += colW + fs * 0.6; else area.right -= colW + fs * 0.6;
  }
};

// ---------- Entry point ----------

/** Draws a chart in its local box (0,0)-(w,h). */
export const renderChart = (chart: Chart, theme: Theme, defs: Defs, opts: ChartDrawOpts = {}): ReactNode => {
  const W = Math.max(20, chart.w), H = Math.max(16, chart.h);
  const thumb = !!opts.thumb;
  const st = styleOf(chart);
  const ink = inksFor(st, theme);
  const fs = thumb ? Math.max(6, Math.min(W, H) / 14) : Math.max(8, Math.min(20, Math.min(W / 42, H / 24)));
  const fam = familyOf(chart.chartType);
  const els: ReactNode[] = [];
  const c: Ctx = {
    c: chart, theme, st, ink, font: fontStack(theme.fonts.minor), fs, thumb, plot: { x: 0, y: 0, w: W, h: H }, els, defs, grads: new Map(), shadow: null,
    labels: !thumb && (chart.dataLabels ?? (st.labels || ['treemap', 'sunburst', 'funnel', 'waterfall'].includes(chart.chartType))),
    grid: chart.axes?.gridlines ?? st.grid !== 'none', k: 0,
  };
  if (st.marks === 'shadow') {
    const id = defs.id('cs');
    defs.add(<filter key={id} id={id} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx={fs * 0.15} dy={fs * 0.2} stdDeviation={fs * 0.22} floodOpacity={0.28} /></filter>);
    c.shadow = id;
  }
  if (ink.bg || ink.plateBorder) els.push(<rect key="bg" width={W} height={H} rx={st.round ? fs * 0.6 : 0} fill={ink.bg ?? 'none'} stroke={ink.plateBorder ?? 'none'} strokeWidth={1} />);

  const pad = thumb ? 3 : fs * 0.8;
  const area = { top: pad, bottom: H - pad, left: pad, right: W - pad };
  const title = thumb ? '' : chart.title?.trim() ?? '';
  if (title) {
    const ts = fs * 1.55;
    txt(c, W / 2, area.top + ts * 0.9, trunc(title, W - 2 * pad, ts), { size: ts, anchor: 'middle', weight: st.bold ? 700 : 600, fill: c.ink.ink });
    area.top += ts * 1.5;
  }
  const items = legendFor(chart, theme, fam, ink);
  const legend = thumb ? 'none' : chart.legend ?? (items.length > 1 || fam === 'pie' ? 'b' : 'none');
  if (legend !== 'none' && items.length) drawLegend(c, items, legend, W, area);
  c.plot = { x: area.left, y: area.top, w: Math.max(10, area.right - area.left), h: Math.max(10, area.bottom - area.top) };

  const any = chart.series.some((s) => s.values.some((v) => num(v) !== null));
  if (!any) txt(c, W / 2, c.plot.y + c.plot.h / 2, thumb ? '' : 'Add numbers to see the chart', { anchor: 'middle' });
  else switch (fam) {
    case 'pie': drawPie(c); break;
    case 'radar': drawRadar(c); break;
    case 'scatter': case 'bubble': drawScatter(c, fam === 'bubble'); break;
    case 'box': drawBox(c); break;
    case 'treemap': drawTreemap(c); break;
    case 'sunburst': drawSunburst(c); break;
    case 'funnel': drawFunnel(c); break;
    case 'stock': drawStock(c); break;
    case 'surface': drawSurface(c); break;
    case 'map': drawMap(c); break;
    default: drawCartesian(c, cartesianModel(c, fam));
  }
  return <g className="chart">{els}</g>;
};

// ---------- Axis frame ----------

interface Frame { px: number; py: number; pw: number; ph: number; n: number; band: number; valPos: (v: number) => number; valPos2: (v: number) => number; catPos: (i: number) => number; zero: number }

const axisFrame = (c: Ctx, o: { cats: string[]; horizontal: boolean; lo: number; hi: number; pct?: boolean; second?: { lo: number; hi: number; pct?: boolean } | null; free?: boolean }): Frame => {
  const { c: chart, plot, thumb, fs } = c;
  const n = Math.max(1, o.cats.length);
  const yTitle = thumb ? '' : chart.axes?.yTitle ?? '';
  const xTitle = thumb ? '' : chart.axes?.xTitle ?? '';
  const valueLen = o.horizontal ? plot.w : plot.h;
  const nt = thumb ? 3 : Math.max(3, Math.min(8, Math.floor(valueLen / (fs * (o.horizontal ? 6 : 3.4)))));
  const scale = o.free ? niceScale(o.lo, o.hi, nt) : fixedScale(o.lo, o.hi, nt, chart.axes?.min, chart.axes?.max);
  const scale2 = o.second ? niceScale(o.second.lo, o.second.hi, scale.ticks.length) : null;
  const tt = scale.ticks.map((t) => fmtNum(t, true, o.pct));
  const tt2 = scale2 ? scale2.ticks.map((t) => fmtNum(t, true, o.second!.pct)) : [];
  const maxCat = Math.max(0, ...o.cats.map((s) => textW(s, fs)));
  let px = plot.x, pw = plot.w, ph = plot.h;
  const py = plot.y;
  let rotate = false, skip = 1;
  if (!thumb) {
    if (yTitle) { px += fs * 1.6; pw -= fs * 1.6; }
    if (xTitle) ph -= fs * 1.6;
    if (o.horizontal) {
      const g = Math.min(maxCat, plot.w * 0.3) + fs * 0.7;
      px += g; pw -= g; ph -= fs * 1.6;
      skip = Math.max(1, Math.ceil((fs * 1.2) / (ph / n)));
    } else {
      const g = Math.max(...tt.map((t) => textW(t, fs))) + fs * 0.7;
      px += g; pw -= g;
      if (scale2) pw -= Math.max(...tt2.map((t) => textW(t, fs))) + fs * 0.7;
      const band = pw / n;
      if (maxCat + fs * 0.5 > band) { rotate = true; ph -= Math.min(maxCat * 0.72 + fs, plot.h * 0.3); skip = Math.max(1, Math.ceil((fs * 1.3) / band)); }
      else ph -= fs * 1.6;
    }
  }
  pw = Math.max(10, pw); ph = Math.max(10, ph);
  const span = scale.max - scale.min || 1;
  const band = (o.horizontal ? ph : pw) / n;
  const valPos = (v: number) => (o.horizontal ? px + ((v - scale.min) / span) * pw : py + ph - ((v - scale.min) / span) * ph);
  const valPos2 = scale2 ? (v: number) => py + ph - ((v - scale2.min) / (scale2.max - scale2.min || 1)) * ph : valPos;
  const catPos = (i: number) => (o.horizontal ? py + band * (i + 0.5) : px + band * (i + 0.5));
  const zero = valPos(Math.min(Math.max(0, scale.min), scale.max));
  const gs = { stroke: c.ink.grid, strokeWidth: 1, ...(c.st.grid === 'dashed' ? { strokeDasharray: '4 3' } : {}) };
  scale.ticks.forEach((t, k) => {
    const p = valPos(t);
    if (c.grid) c.els.push(o.horizontal ? <line key={key(c, 'g')} x1={p} x2={p} y1={py} y2={py + ph} {...gs} /> : <line key={key(c, 'g')} x1={px} x2={px + pw} y1={p} y2={p} {...gs} />);
    if (!thumb) {
      if (o.horizontal) txt(c, p, py + ph + fs * 1.2, tt[k]!, { anchor: 'middle' });
      else txt(c, px - fs * 0.5, p + fs * 0.35, tt[k]!, { anchor: 'end' });
    }
  });
  if (scale2 && !thumb) scale2.ticks.forEach((t, k) => txt(c, px + pw + fs * 0.5, valPos2(t) + fs * 0.35, tt2[k]!));
  const axis = { stroke: c.ink.axis, strokeWidth: 1 };
  c.els.push(o.horizontal ? <line key={key(c, 'ax')} x1={zero} x2={zero} y1={py} y2={py + ph} {...axis} /> : <line key={key(c, 'ax')} x1={px} x2={px + pw} y1={zero} y2={zero} {...axis} />);
  if (!thumb) o.cats.forEach((label, i) => {
    if (i % skip) return;
    const p = catPos(i);
    if (o.horizontal) txt(c, px - fs * 0.5, p + fs * 0.35, trunc(label, Math.min(maxCat, plot.w * 0.3), fs), { anchor: 'end' });
    else if (rotate) txt(c, p, py + ph + fs * 0.9, trunc(label, (plot.h * 0.3 - fs) / 0.72, fs), { anchor: 'end', rotate: -45 });
    else txt(c, p, py + ph + fs * 1.25, label, { anchor: 'middle' });
  });
  if (yTitle) txt(c, plot.x + fs * 0.8, py + ph / 2, trunc(yTitle, ph, fs), { anchor: 'middle', rotate: -90, weight: 600, fill: c.ink.ink });
  if (xTitle) txt(c, px + pw / 2, plot.y + plot.h - fs * 0.25, trunc(xTitle, pw, fs), { anchor: 'middle', weight: 600, fill: c.ink.ink });
  return { px, py, pw, ph, n, band, valPos, valPos2, catPos, zero };
};

// ---------- Category charts ----------

type Kind = 'col' | 'line' | 'area';
interface Seg { i: number; v0: number; v1: number; raw: number | null }
interface CSeries { name: string; color: string; kind: Kind; secondary: boolean; segs: Seg[]; colors?: string[]; markers: boolean; smooth: boolean; stacked: boolean; label?: (g: Seg) => string }
interface CModel { cats: string[]; series: CSeries[]; horizontal: boolean; pct: boolean; lo: number; hi: number; second: { lo: number; hi: number } | null; gap: number; connectors?: boolean }

const stackSegs = (vals: (number | null)[][], n: number, mode: 'none' | 'stacked' | 'percent'): Seg[][] => {
  const out: Seg[][] = vals.map(() => []);
  for (let i = 0; i < n; i++) {
    let pos = 0, neg = 0;
    const total = mode === 'percent' ? vals.reduce((a, v) => a + Math.abs(v[i] ?? 0), 0) : 1;
    vals.forEach((v, si) => {
      const raw = v[i] ?? null;
      let x = raw ?? 0;
      if (mode === 'percent') x = total ? x / total : 0;
      if (mode === 'none') out[si]!.push({ i, v0: 0, v1: x, raw });
      else if (x >= 0) { out[si]!.push({ i, v0: pos, v1: pos + x, raw }); pos += x; }
      else { out[si]!.push({ i, v0: neg, v1: neg + x, raw }); neg += x; }
    });
  }
  return out;
};

const kindFor = (t: ChartType): Kind => (t === 'line' ? 'line' : t === 'area' ? 'area' : 'col');

const cartesianModel = (c: Ctx, fam: Family): CModel => {
  const ch = c.c;
  const gap = c.st.gap ?? 0.72;
  if (fam === 'histogram') {
    const all = ch.series.flatMap((s) => s.values.filter((v) => num(v) !== null));
    const bins = histogramBins(all, {}, (v) => fmtNum(v, true));
    const color = sColor(c, 0);
    return {
      cats: bins.map((b) => b.label), horizontal: false, pct: false, lo: 0, hi: Math.max(1, ...bins.map((b) => b.count)), second: null, gap: 0.96,
      series: [{ name: ch.series[0]?.name ?? '', color, kind: 'col', secondary: false, segs: bins.map((b, i) => ({ i, v0: 0, v1: b.count, raw: b.count })), markers: false, smooth: false, stacked: false }],
    };
  }
  if (fam === 'waterfall') {
    const s = ch.series[0]!;
    const totals = ch.categories.flatMap((l, i) => (i > 0 && (/^\s*(total|sum|net|end|ending|closing|balance|subtotal)\b/i.test(l) || (i === ch.categories.length - 1 && s.values[i] === 0)) ? [i] : []));
    const steps = waterfallSteps(s.values.map(num), totals);
    const colors = steps.map((t) => (t.kind === 'up' ? c.ink.up : t.kind === 'down' ? c.ink.down : c.ink.total));
    const vals = steps.flatMap((t) => [t.start, t.end]);
    return {
      cats: ch.categories, horizontal: false, pct: false, lo: Math.min(0, ...vals), hi: Math.max(0, ...vals), second: null, gap: 0.66, connectors: true,
      series: [{ name: s.name, color: c.ink.up, kind: 'col', secondary: false, segs: steps.map((t) => ({ i: t.index, v0: t.start, v1: t.end, raw: t.kind === 'total' ? t.end : t.value })), colors, markers: false, smooth: false, stacked: true }],
    };
  }
  const n = Math.max(1, ch.categories.length, ...ch.series.map((s) => s.values.length));
  const mode: 'none' | 'stacked' | 'percent' = ch.chartType === 'combo' ? 'none' : ch.grouping === 'stacked' ? 'stacked' : ch.grouping === 'percentStacked' ? 'percent' : 'none';
  const kinds = ch.series.map((_, i) => kindFor(seriesType(ch, i)));
  const modeFor = (k: Kind): typeof mode => (ch.chartType === 'combo' ? (ch.variant === 'area' && k === 'area' ? 'stacked' : 'none') : mode);
  const segs: Seg[][] = ch.series.map(() => []);
  for (const axis of [false, true]) for (const k of ['col', 'line', 'area'] as Kind[]) {
    const idx = ch.series.flatMap((s, i) => (kinds[i] === k && !!s.secondary === axis ? [i] : []));
    if (!idx.length) continue;
    const st = stackSegs(idx.map((i) => ch.series[i]!.values.map(num)), n, modeFor(k));
    idx.forEach((i, j) => { segs[i] = st[j]!; });
  }
  const pct = mode === 'percent';
  const series: CSeries[] = ch.series.map((s, i) => ({
    name: s.name, color: sColor(c, i), kind: kinds[i]!, secondary: !!s.secondary, segs: segs[i]!, stacked: modeFor(kinds[i]!) !== 'none',
    markers: ch.variant === 'markers' || (!!s.marker && s.marker !== 'none') || (ch.chartType === 'combo' && kinds[i] === 'line'),
    smooth: ch.variant === 'smooth' || !!s.smooth,
    ...(pct ? { label: (g: Seg) => fmtNum(g.v1 - g.v0, false, true) } : {}),
  }));
  const ext = (sec: boolean): [number, number] | null => {
    const list = series.filter((s) => s.secondary === sec);
    if (!list.length) return null;
    const vals = list.flatMap((s) => s.segs.filter((g) => g.raw !== null || s.stacked).flatMap((g) => (s.stacked ? [g.v0, g.v1] : [g.v1])));
    if (pct) return [Math.min(0, ...vals), Math.max(0, ...vals)];
    return extent(vals, list.some((s) => s.kind !== 'line'));
  };
  const p = ext(false) ?? [0, 1], s2 = ext(true);
  const cats = Array.from({ length: n }, (_, i) => ch.categories[i] ?? String(i + 1));
  return { cats, series, horizontal: ch.chartType === 'bar', pct, lo: p[0], hi: p[1], second: s2 ? { lo: s2[0], hi: s2[1] } : null, gap: mode !== 'none' ? Math.min(gap, 0.62) : gap };
};

const drawCartesian = (c: Ctx, m: CModel): void => {
  const { thumb, fs } = c;
  // Room above the tallest mark for its label.
  const room = c.labels && !m.pct && m.series.some((s) => !s.stacked || m.connectors) ? (m.hi - m.lo) * 0.08 : 0;
  const f = axisFrame(c, { cats: m.cats, horizontal: m.horizontal, lo: m.lo, hi: m.hi + room, pct: m.pct, second: m.second });
  const pos = (s: CSeries, v: number) => (s.secondary ? f.valPos2(v) : f.valPos(v));
  const labels = c.labels && f.n * m.series.length <= 160;
  const lfs = fs * 0.9;
  const parts: ReactNode[] = [];
  const top: ReactNode[] = [];
  const label = (x: number, y: number, s: string, anchor: 'start' | 'middle' | 'end' = 'middle', on = false) =>
    top.push(<text key={key(c, 'dl')} x={x} y={y} fontSize={lfs} fontFamily={c.font} textAnchor={anchor} fill={on ? c.ink.on : c.ink.ink} fontWeight={c.st.bold ? 600 : 400}
      {...(on ? { stroke: 'rgba(0,0,0,0.25)', strokeWidth: lfs * 0.15, paintOrder: 'stroke' } : {})}>{s}</text>);

  m.series.forEach((s) => {
    if (s.kind !== 'area') return;
    const usable = s.stacked ? s.segs : s.segs.filter((g) => g.raw !== null);
    if (!usable.length) return;
    const xy = (g: Seg, v: number) => (m.horizontal ? `${pos(s, v)},${f.catPos(g.i)}` : `${f.catPos(g.i)},${pos(s, v)}`);
    const upper = usable.map((g) => xy(g, g.v1));
    const base = s.secondary ? f.valPos2(0) : f.zero;
    const lower = [...usable].reverse().map((g) => (s.stacked ? xy(g, g.v0) : m.horizontal ? `${base},${f.catPos(g.i)}` : `${f.catPos(g.i)},${base}`));
    const mp = markPaint(c, s.color);
    parts.push(<polygon key={key(c, 'a')} points={[...upper, ...lower].join(' ')} {...mp} fillOpacity={s.stacked ? 0.88 : 0.55} />);
    parts.push(<polyline key={key(c, 'al')} points={upper.join(' ')} fill="none" stroke={adjustLum(s.color, -0.15)} strokeWidth={Math.max(1, fs * 0.12)} strokeLinejoin="round" />);
  });

  const bars = m.series.filter((s) => s.kind === 'col');
  const stackedBars = bars.length > 0 && bars.every((b) => b.stacked);
  const group = f.band * m.gap;
  const slots = stackedBars ? 1 : bars.length;
  bars.forEach((s, j) => {
    const w = group / Math.max(1, slots);
    s.segs.forEach((g) => {
      if (g.raw === null && !s.stacked) return;
      const off = -group / 2 + (stackedBars ? 0 : j) * w;
      const a = pos(s, g.v0), b = pos(s, g.v1);
      const cp = f.catPos(g.i) + off;
      const gp = w > 6 ? Math.min(2, w * 0.06) : 0.3;
      const r = m.horizontal ? { x: Math.min(a, b), y: cp, width: Math.abs(b - a), height: Math.max(0.5, w - gp) } : { x: cp, y: Math.min(a, b), width: Math.max(0.5, w - gp), height: Math.abs(b - a) };
      parts.push(<rect key={key(c, 'b')} {...r} rx={c.st.round ? Math.min(w * 0.12, fs * 0.3) : 0} {...markPaint(c, s.colors?.[g.i] ?? s.color)} />);
      if (!labels || g.raw === null) return;
      const t = s.label ? s.label(g) : fmtNum(g.raw, true);
      if (s.stacked && !m.connectors) {
        if ((m.horizontal ? r.width : r.height) > lfs * 1.3 && textW(t, lfs) < (m.horizontal ? r.width : w)) label(r.x + r.width / 2, r.y + r.height / 2 + lfs * 0.35, t, 'middle', true);
      } else if (m.horizontal) label(g.v1 >= g.v0 ? Math.max(a, b) + lfs * 0.4 : Math.min(a, b) - lfs * 0.4, cp + w / 2 + lfs * 0.35, t, g.v1 >= g.v0 ? 'start' : 'end');
      else label(cp + w / 2, g.v1 >= g.v0 ? Math.min(a, b) - lfs * 0.4 : Math.max(a, b) + lfs * 1.1, t);
    });
    if (m.connectors) s.segs.forEach((g, k) => {
      const next = s.segs[k + 1];
      if (!next) return;
      const y = pos(s, g.v1);
      parts.push(<line key={key(c, 'cn')} x1={f.catPos(g.i) + group / 2} x2={f.catPos(next.i) - group / 2} y1={y} y2={y} stroke={c.ink.axis} strokeWidth={1} strokeDasharray="3 2" />);
    });
  });

  m.series.forEach((s) => {
    if (s.kind !== 'line') return;
    const runs: [number, number][][] = [[]];
    s.segs.forEach((g) => {
      if (g.raw === null && !s.stacked) { if (runs.at(-1)!.length) runs.push([]); return; }
      runs.at(-1)!.push(m.horizontal ? [pos(s, g.v1), f.catPos(g.i)] : [f.catPos(g.i), pos(s, g.v1)]);
    });
    const lw = thumb ? Math.max(1, fs * 0.2) : Math.max(1.5, fs * 0.2);
    runs.forEach((r) => r.length > 1 && parts.push(<path key={key(c, 'ln')} d={linePath(r, s.smooth)} fill="none" stroke={s.color} strokeWidth={lw} strokeLinejoin="round" strokeLinecap="round" {...(c.shadow ? { filter: `url(#${c.shadow})` } : {})} />));
    const single = runs.some((r) => r.length === 1);
    s.segs.forEach((g) => {
      if (g.raw === null && !s.stacked) return;
      const [x, y] = m.horizontal ? [pos(s, g.v1), f.catPos(g.i)] : [f.catPos(g.i), pos(s, g.v1)];
      if (s.markers || single) parts.push(<circle key={key(c, 'mk')} cx={x} cy={y} r={lw * 1.6} fill={c.ink.bg ?? '#FFFFFF'} stroke={s.color} strokeWidth={lw * 0.9} />);
      if (labels) label(x, y - lw * 2.4, s.label ? s.label(g) : fmtNum(g.raw ?? 0, true));
    });
  });
  const clip = c.defs.id('cc');
  c.defs.add(<clipPath key={clip} id={clip}><rect x={f.px - fs} y={f.py - fs} width={f.pw + 2 * fs} height={f.ph + 2 * fs} /></clipPath>);
  c.els.push(<g key={key(c, 'marks')} clipPath={`url(#${clip})`}>{parts}</g>, ...top);
};

// ---------- Box and whisker ----------

const drawBox = (c: Ctx): void => {
  const ch = c.c;
  const stats = ch.series.map((s) => boxStats(s.values.filter((v) => num(v) !== null)));
  const all = stats.filter((s): s is NonNullable<typeof s> => !!s);
  if (!all.length) return;
  const lo = Math.min(...all.map((s) => s.min)), hi = Math.max(...all.map((s) => s.max));
  const cats = ch.series.map((s, i) => s.name || `Series ${i + 1}`);
  const f = axisFrame(c, { cats, horizontal: false, lo: lo >= 0 && lo < hi * 0.4 ? 0 : lo, hi });
  const Y = f.valPos;
  const lw = Math.max(1, c.fs * 0.14);
  stats.forEach((st, i) => {
    if (!st) return;
    const color = sColor(c, i);
    const bw = f.band * 0.5, x0 = f.catPos(i) - bw / 2, xm = f.catPos(i);
    const s = { stroke: color, strokeWidth: lw };
    c.els.push(<line key={key(c, 'w')} x1={xm} x2={xm} y1={Y(st.lowWhisker)} y2={Y(st.highWhisker)} {...s} />);
    c.els.push(<line key={key(c, 'w')} x1={xm - bw / 4} x2={xm + bw / 4} y1={Y(st.lowWhisker)} y2={Y(st.lowWhisker)} {...s} />);
    c.els.push(<line key={key(c, 'w')} x1={xm - bw / 4} x2={xm + bw / 4} y1={Y(st.highWhisker)} y2={Y(st.highWhisker)} {...s} />);
    c.els.push(<rect key={key(c, 'bx')} x={x0} y={Y(st.q3)} width={bw} height={Math.max(1, Y(st.q1) - Y(st.q3))} rx={c.st.round ? c.fs * 0.2 : 0} fill={adjustLum(color, 0.55)} {...s} />);
    c.els.push(<line key={key(c, 'md')} x1={x0} x2={x0 + bw} y1={Y(st.median)} y2={Y(st.median)} stroke={adjustLum(color, -0.3)} strokeWidth={lw * 1.6} />);
    const m = c.fs * 0.3, y = Y(st.mean);
    c.els.push(<path key={key(c, 'mn')} d={`M${xm - m},${y - m}L${xm + m},${y + m}M${xm - m},${y + m}L${xm + m},${y - m}`} stroke={c.ink.ink} strokeWidth={lw} />);
    st.outliers.forEach((v) => c.els.push(<circle key={key(c, 'o')} cx={xm} cy={Y(v)} r={c.fs * 0.25} fill="none" stroke={color} strokeWidth={lw} />));
    if (c.labels) txt(c, x0 + bw + c.fs * 0.3, Y(st.median) + c.fs * 0.3, fmtNum(st.median), { size: c.fs * 0.9, fill: c.ink.ink });
  });
};

// ---------- Scatter and bubble ----------

const drawScatter = (c: Ctx, bubble: boolean): void => {
  const { c: ch, plot, thumb, fs } = c;
  type P = { si: number; x: number; y: number; z: number };
  const pts: P[] = ch.series.flatMap((s, si) => s.values.map((y, i) => ({ si, x: num(s.x?.[i]) ?? i + 1, y: num(y), z: bubble ? num(s.sizes?.[i]) ?? 1 : 0 }))
    .filter((p): p is P => p.y !== null && (!bubble || p.z > 0)));
  if (!pts.length) return;
  const [xl, xh] = extent(pts.map((p) => p.x), false);
  const [yl, yh] = extent(pts.map((p) => p.y), false);
  const yTitle = thumb ? '' : ch.axes?.yTitle ?? '', xTitle = thumb ? '' : ch.axes?.xTitle ?? '';
  let px = plot.x, pw = plot.w, ph = plot.h;
  const nY = thumb ? 3 : Math.max(3, Math.min(8, Math.floor(plot.h / (fs * 3.4))));
  let ys = fixedScale(yl, yh, nY, ch.axes?.min, ch.axes?.max);
  if (!thumb) {
    const g = Math.max(...ys.ticks.map((t) => textW(fmtNum(t, true), fs))) + fs * 0.7 + (yTitle ? fs * 1.6 : 0);
    px += g; pw -= g; ph -= fs * 1.6 + (xTitle ? fs * 1.6 : 0);
  }
  const zMax = Math.max(...pts.map((p) => p.z), 1e-9);
  const rMax = bubble ? Math.max(3, Math.min(pw, ph) * 0.09) : 0;
  const rOf = (z: number) => Math.max(thumb ? 1.2 : 2.5, Math.sqrt(z / zMax) * rMax);
  const nX = thumb ? 3 : Math.max(3, Math.floor(pw / (fs * 6)));
  let xs = niceScale(xl, xh, nX);
  if (bubble) {
    const padX = (rMax / Math.max(10, pw - 2 * rMax)) * (xh - xl || 1), padY = (rMax / Math.max(10, ph - 2 * rMax)) * (yh - yl || 1);
    ys = fixedScale(yl - padY, yh + padY, nY, ch.axes?.min, ch.axes?.max);
    xs = niceScale(xl - padX, xh + padX, nX);
  }
  const X = (v: number) => px + ((v - xs.min) / (xs.max - xs.min || 1)) * pw;
  const Y = (v: number) => plot.y + ph - ((v - ys.min) / (ys.max - ys.min || 1)) * ph;
  const gs = { stroke: c.ink.grid, strokeWidth: 1, ...(c.st.grid === 'dashed' ? { strokeDasharray: '4 3' } : {}) };
  ys.ticks.forEach((t) => {
    if (c.grid) c.els.push(<line key={key(c, 'gy')} x1={px} x2={px + pw} y1={Y(t)} y2={Y(t)} {...gs} />);
    if (!thumb) txt(c, px - fs * 0.5, Y(t) + fs * 0.35, fmtNum(t, true), { anchor: 'end' });
  });
  xs.ticks.forEach((t) => {
    if (c.grid) c.els.push(<line key={key(c, 'gx')} x1={X(t)} x2={X(t)} y1={plot.y} y2={plot.y + ph} {...gs} />);
    if (!thumb) txt(c, X(t), plot.y + ph + fs * 1.25, fmtNum(t, true), { anchor: 'middle' });
  });
  c.els.push(<line key={key(c, 'ax')} x1={px} x2={px + pw} y1={plot.y + ph} y2={plot.y + ph} stroke={c.ink.axis} />);
  c.els.push(<line key={key(c, 'ay')} x1={px} x2={px} y1={plot.y} y2={plot.y + ph} stroke={c.ink.axis} />);
  if (yTitle) txt(c, plot.x + fs * 0.8, plot.y + ph / 2, trunc(yTitle, ph, fs), { anchor: 'middle', rotate: -90, weight: 600, fill: c.ink.ink });
  if (xTitle) txt(c, px + pw / 2, plot.y + plot.h - fs * 0.25, trunc(xTitle, pw, fs), { anchor: 'middle', weight: 600, fill: c.ink.ink });
  const v = ch.variant ?? '';
  const lines = /lines|smooth/i.test(v);
  const markers = !lines || /Markers/.test(v);
  const smooth = /smooth/i.test(v);
  if (lines) ch.series.forEach((_s, si) => {
    const line = pts.filter((p) => p.si === si).sort((a, b) => a.x - b.x).map((p): [number, number] => [X(p.x), Y(p.y)]);
    if (line.length > 1) c.els.push(<path key={key(c, 'sl')} d={linePath(line, smooth)} fill="none" stroke={sColor(c, si)} strokeWidth={Math.max(1.2, fs * 0.18)} strokeLinejoin="round" />);
  });
  const order = bubble ? [...pts].sort((a, b) => b.z - a.z) : pts;
  order.forEach((p) => {
    const color = sColor(c, p.si);
    if (bubble) c.els.push(<circle key={key(c, 'p')} cx={X(p.x)} cy={Y(p.y)} r={rOf(p.z)} {...markPaint(c, color)} fillOpacity={0.72} stroke={adjustLum(color, -0.2)} strokeWidth={1} />);
    else if (markers) c.els.push(<circle key={key(c, 'p')} cx={X(p.x)} cy={Y(p.y)} r={thumb ? 1.6 : fs * 0.32} fill={lines ? c.ink.bg ?? '#FFFFFF' : color} stroke={lines ? color : c.ink.bg ?? '#FFFFFF'} strokeWidth={lines ? fs * 0.14 : 1} />);
    if (c.labels && pts.length <= 120) txt(c, X(p.x), Y(p.y) - (bubble ? 0 : fs * 0.55), fmtNum(bubble ? p.z : p.y, true), { anchor: 'middle', size: fs * 0.85, fill: c.ink.ink });
  });
};

// ---------- Pie and doughnut ----------

const arcPath = (cx: number, cy: number, r: number, inner: number, a0: number, a1: number): string => {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (rad: number, a: number) => `${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`;
  if (!inner) return `M${cx},${cy} L${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} Z`;
  return `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(inner, a1)} A${inner},${inner} 0 ${large} 0 ${p(inner, a0)} Z`;
};

const drawPie = (c: Ctx): void => {
  const { c: ch, plot, thumb, fs } = c;
  const doughnut = ch.chartType === 'doughnut';
  const exploded = ch.variant === 'exploded';
  const rings = doughnut ? ch.series : ch.series.slice(0, 1);
  const cx = plot.x + plot.w / 2, cy = plot.y + plot.h / 2;
  const R = Math.max(4, Math.min(plot.w, plot.h) / 2 - (thumb ? 0 : fs * 0.5) - (exploded ? fs * 0.6 : 0));
  const hole = doughnut ? R * Math.max(0.1, Math.min(0.9, (ch.holeSize ?? 50) / 100)) : 0;
  const ringW = (R - hole) / Math.max(1, rings.length);
  const bg = c.ink.bg ?? '#FFFFFF';
  rings.forEach((s, ri) => {
    const vals = s.values.map((v) => Math.max(0, num(v) ?? 0));
    const total = vals.reduce((a, b) => a + b, 0);
    if (!total) return;
    const outer = R - ri * ringW, inner = doughnut ? outer - ringW : 0;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      const start = a0;
      a0 = a1;
      if (!v) return;
      const mid = (start + a1) / 2;
      const off = exploded ? fs * 0.6 : 0;
      const ox = Math.cos(mid) * off, oy = Math.sin(mid) * off;
      c.els.push(<path key={key(c, 's')} d={arcPath(cx + ox, cy + oy, outer, inner, start, a1)} {...markPaint(c, catColor(c, i))} stroke={c.st.marks === 'outline' ? catColor(c, i) : bg} strokeWidth={thumb ? 0.6 : Math.max(1, fs * 0.12)} />);
      if (!c.labels) return;
      const t = `${Math.round((v / total) * 100)}%`;
      const lr = inner ? (outer + inner) / 2 : outer * 0.66;
      if ((a1 - start) * lr > textW(t, fs) * 0.9) txt(c, cx + ox + Math.cos(mid) * lr, cy + oy + Math.sin(mid) * lr + fs * 0.35, t, { anchor: 'middle', fill: c.ink.on, weight: 600, halo: true });
    });
  });
};

// ---------- Radar ----------

const drawRadar = (c: Ctx): void => {
  const { c: ch, plot, thumb, fs } = c;
  const n = Math.max(3, ch.categories.length, ...ch.series.map((s) => s.values.length));
  const vals = ch.series.flatMap((s) => s.values.map(num).filter((v): v is number => v !== null));
  const sc = fixedScale(Math.min(0, ...vals), Math.max(...vals), thumb ? 3 : 5, ch.axes?.min, ch.axes?.max);
  const cx = plot.x + plot.w / 2, cy = plot.y + plot.h / 2;
  const room = thumb ? 2 : Math.min(plot.w * 0.25, Math.max(fs * 2, Math.max(0, ...ch.categories.map((t) => textW(t, fs)))));
  const R = Math.max(6, Math.min(plot.w / 2 - room, plot.h / 2 - (thumb ? 2 : fs * 1.4)));
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const rad = (v: number) => Math.max(0, (v - sc.min) / (sc.max - sc.min || 1)) * R;
  const pt = (i: number, v: number): [number, number] => [cx + Math.cos(ang(i)) * rad(v), cy + Math.sin(ang(i)) * rad(v)];
  sc.ticks.forEach((t) => {
    if (t === sc.min) return;
    if (c.grid) c.els.push(<polygon key={key(c, 'rg')} points={Array.from({ length: n }, (_, i) => pt(i, t).join(',')).join(' ')} fill="none" stroke={c.ink.grid} />);
    if (!thumb) txt(c, cx + fs * 0.25, cy - rad(t) + fs * 0.9, fmtNum(t, true), { size: fs * 0.8 });
  });
  for (let i = 0; i < n; i++) {
    c.els.push(<line key={key(c, 'sp')} x1={cx} y1={cy} x2={cx + Math.cos(ang(i)) * R} y2={cy + Math.sin(ang(i)) * R} stroke={c.ink.grid} />);
    if (!thumb) {
      const a = ang(i), lx = cx + Math.cos(a) * (R + fs * 0.6), ly = cy + Math.sin(a) * (R + fs * 0.6) + fs * 0.35 + (Math.sin(a) > 0.9 ? fs * 0.5 : 0);
      txt(c, lx, ly, trunc(ch.categories[i] ?? '', room, fs), { anchor: Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end' });
    }
  }
  const filled = ch.variant === 'filled', markers = ch.variant === 'markers';
  ch.series.forEach((s, si) => {
    const color = sColor(c, si);
    const pts = Array.from({ length: n }, (_, i) => pt(i, num(s.values[i]) ?? Math.max(0, sc.min)));
    c.els.push(<polygon key={key(c, 'rs')} points={pts.map((p) => p.join(',')).join(' ')} fill={color} fillOpacity={filled ? 0.45 : 0.06} stroke={color} strokeWidth={Math.max(1.2, fs * 0.18)} strokeLinejoin="round" />);
    if (markers) pts.forEach((p) => c.els.push(<circle key={key(c, 'rm')} cx={p[0]} cy={p[1]} r={fs * 0.28} fill={c.ink.bg ?? '#FFFFFF'} stroke={color} strokeWidth={fs * 0.14} />));
    if (c.labels) s.values.forEach((v, i) => num(v) !== null && txt(c, pt(i, v)[0], pt(i, v)[1] - fs * 0.5, fmtNum(v, true), { anchor: 'middle', size: fs * 0.85, fill: c.ink.ink }));
  });
};

// ---------- Funnel, treemap, sunburst ----------

const drawFunnel = (c: Ctx): void => {
  const { c: ch, plot, thumb, fs } = c;
  const s = ch.series[0]!;
  const rows = s.values.map((v, i) => ({ v: Math.max(0, num(v) ?? 0), i, label: ch.categories[i] ?? '' })).filter((r) => r.v > 0);
  if (!rows.length) return;
  const max = Math.max(...rows.map((r) => r.v));
  const labelW = thumb ? 0 : Math.min(plot.w * 0.3, Math.max(...rows.map((r) => textW(r.label, fs))) + fs);
  const x0 = plot.x + labelW, w = plot.w - labelW, h = plot.h / rows.length;
  rows.forEach((r, k) => {
    const bw = Math.max(2, (r.v / max) * w);
    const x = x0 + (w - bw) / 2, y = plot.y + k * h;
    const color = s.color ? sColor(c, 0) : catColor(c, k);
    c.els.push(<rect key={key(c, 'f')} x={x} y={y + h * 0.06} width={bw} height={Math.max(1, h * 0.88)} rx={c.st.round ? fs * 0.25 : 0} {...markPaint(c, color)} />);
    if (labelW) txt(c, x0 - fs * 0.6, y + h / 2 + fs * 0.35, trunc(r.label, labelW - fs, fs), { anchor: 'end' });
    if (c.labels && h >= fs * 1.2) {
      const t = fmtNum(r.v, true);
      const inside = textW(t, fs) + fs * 0.6 < bw;
      txt(c, inside ? x0 + w / 2 : x + bw + fs * 0.3, y + h / 2 + fs * 0.35, t, { anchor: inside ? 'middle' : 'start', fill: inside ? c.ink.on : c.ink.ink, weight: 600, halo: inside });
    }
  });
};

const treeOf = (c: Ctx): TreeNode => buildTree(c.c.categories.map((x) => x.split('/').map((p) => p.trim())), (c.c.series[0]?.values ?? []).map(num));

const drawTreemap = (c: Ctx): void => {
  const { plot, thumb, fs } = c;
  const tree = treeOf(c);
  if (!tree.value) return;
  const deep = treeDepth(tree) > 1;
  const gap = thumb ? 0.6 : Math.max(1, fs * 0.15);
  const head = thumb ? 0 : fs * 1.5;
  const leaf = (n: TreeNode, x: number, y: number, w: number, h: number) => {
    const color = catColor(c, n.color ?? 0);
    const shade = deep ? adjustLum(color, ((n.path.length + (n.path.at(-1)?.length ?? 0)) % 3) * 0.12) : color;
    c.els.push(<rect key={key(c, 'tm')} x={x + gap / 2} y={y + gap / 2} width={Math.max(0.5, w - gap)} height={Math.max(0.5, h - gap)} rx={c.st.round ? fs * 0.2 : 0} {...markPaint(c, shade)} />);
    if (c.labels && w > fs * 3 && h > fs * 1.6) {
      txt(c, x + fs * 0.5, y + fs * 1.3, trunc(n.name, w - fs, fs), { fill: c.ink.on, weight: 600, halo: true });
      if (h > fs * 3) txt(c, x + fs * 0.5, y + fs * 2.6, fmtNum(n.value, true), { fill: c.ink.on, size: fs * 0.9, halo: true });
    }
  };
  squarify(tree.children.map((n) => ({ item: n, weight: n.value })), plot).forEach((t) => {
    const n = t.item;
    if (!deep || !n.children.length) { leaf(n, t.x, t.y, t.w, t.h); return; }
    const hh = head && t.h > head * 2.2 && t.w > fs * 3.5 ? head : 0;
    if (hh) txt(c, t.x + fs * 0.4, t.y + fs * 1.05, trunc(n.name, t.w - fs, fs), { fill: c.ink.ink, weight: 700 });
    const fill = (node: TreeNode, box: Box) => squarify(node.children.map((x) => ({ item: x, weight: x.value })), box).forEach((s) => {
      if (s.item.children.length) fill(s.item, s); else leaf(s.item, s.x, s.y, s.w, s.h);
    });
    fill(n, { x: t.x, y: t.y + hh, w: t.w, h: t.h - hh });
  });
};

const drawSunburst = (c: Ctx): void => {
  const { plot, thumb, fs } = c;
  const tree = treeOf(c);
  if (!tree.value) return;
  const depth = Math.max(1, treeDepth(tree));
  const cx = plot.x + plot.w / 2, cy = plot.y + plot.h / 2;
  const R = Math.max(6, Math.min(plot.w, plot.h) / 2 - (thumb ? 0 : fs * 0.3));
  const r0 = R * 0.2, ring = (R - r0) / depth;
  sunburstArcs(tree).forEach((a) => {
    if (a.a1 - a.a0 < 1e-4) return;
    const inner = r0 + (a.depth - 1) * ring, outer = inner + ring;
    const color = adjustLum(catColor(c, a.node.color ?? 0), (a.depth - 1) * 0.28);
    const mid = (a.a0 + a.a1) / 2, mr = (inner + outer) / 2;
    c.els.push(<path key={key(c, 'sb')} d={arcPath(cx, cy, outer, inner, a.a0, a.a1)} {...markPaint(c, color)} stroke={c.ink.bg ?? '#FFFFFF'} strokeWidth={thumb ? 0.5 : Math.max(1, fs * 0.1)} />);
    if (c.labels && (a.a1 - a.a0) * mr > textW(a.node.name, fs * 0.9) + fs * 0.4 && ring > fs * 1.2) txt(c, cx + Math.cos(mid) * mr, cy + Math.sin(mid) * mr + fs * 0.32, a.node.name, { anchor: 'middle', size: fs * 0.9, weight: 600, fill: a.depth === 1 ? c.ink.on : c.ink.ink, halo: a.depth === 1 });
  });
};

// ---------- Stock ----------

/** Hi-lo-close from 3 series (high, low, close) or open-high-low-close from 4. */
const drawStock = (c: Ctx): void => {
  const ch = c.c;
  const ohlc = ch.series.length >= 4;
  const [o, h, l, cl] = ohlc ? ch.series : [undefined, ch.series[0], ch.series[1], ch.series[2]];
  if (!h || !l) return;
  const n = Math.max(ch.categories.length, h.values.length);
  const vals = [h, l, cl, o].flatMap((s) => (s ? s.values.map(num).filter((v): v is number => v !== null) : []));
  const cats = Array.from({ length: n }, (_, i) => ch.categories[i] ?? String(i + 1));
  const f = axisFrame(c, { cats, horizontal: false, lo: Math.min(...vals), hi: Math.max(...vals) });
  const lw = Math.max(1, c.fs * 0.13);
  for (let i = 0; i < n; i++) {
    const hi = num(h.values[i]), lo = num(l.values[i]);
    const x = f.catPos(i);
    if (hi !== null && lo !== null) c.els.push(<line key={key(c, 'hl')} x1={x} x2={x} y1={f.valPos(hi)} y2={f.valPos(lo)} stroke={c.ink.ink} strokeWidth={lw} />);
    const close = cl ? num(cl.values[i]) : null;
    const open = o ? num(o.values[i]) : null;
    if (ohlc && open !== null && close !== null) {
      const up = close >= open;
      const bw = f.band * 0.42;
      const y1 = f.valPos(Math.max(open, close)), y2 = f.valPos(Math.min(open, close));
      c.els.push(<rect key={key(c, 'cd')} x={x - bw / 2} y={y1} width={bw} height={Math.max(1, y2 - y1)} fill={up ? c.ink.bg ?? '#FFFFFF' : c.ink.ink} stroke={c.ink.ink} strokeWidth={lw} />);
    } else if (close !== null) {
      c.els.push(<line key={key(c, 'cl')} x1={x} x2={x + f.band * 0.22} y1={f.valPos(close)} y2={f.valPos(close)} stroke={c.ink.ink} strokeWidth={lw * 1.4} />);
      c.els.push(<circle key={key(c, 'cm')} cx={x} cy={f.valPos(close)} r={lw * 1.5} fill={sColor(c, 0)} />);
    }
  }
};

// ---------- Surface ----------

/** Approximated as a heat map (or banded contour) of the series-by-category grid. */
const drawSurface = (c: Ctx): void => {
  const { c: ch, plot, thumb, fs } = c;
  const rows = ch.series, cols = Math.max(1, ch.categories.length, ...rows.map((s) => s.values.length));
  const vals = rows.flatMap((s) => s.values.map(num).filter((v): v is number => v !== null));
  if (!vals.length) return;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const contour = ch.variant === 'contour';
  const bands = 5;
  const a = /^mono([1-6])$/.exec(ch.colors ?? '');
  const hot = a ? c.theme.colors[`accent${a[1]}` as 'accent1'] : c.theme.colors.accent1;
  const cool = a ? adjustLum(hot, 0.85) : c.theme.colors.accent3;
  const ramp = a ? [cool, adjustLum(hot, 0.4), hot] : [cool, adjustLum(cool, 0.6), adjustLum(c.theme.colors.accent2, 0.3), c.theme.colors.accent2, hot];
  const colorAt = (v: number) => {
    let t = (v - lo) / (hi - lo || 1);
    if (contour) t = Math.min(bands - 1, Math.floor(t * bands)) / (bands - 1);
    const p = t * (ramp.length - 1);
    const i = Math.min(ramp.length - 2, Math.floor(p));
    return mix(ramp[i]!, ramp[i + 1]!, p - i);
  };
  const lab = thumb ? 0 : Math.min(plot.w * 0.2, Math.max(...rows.map((s) => textW(s.name, fs))) + fs * 0.6);
  const x0 = plot.x + lab, w = plot.w - lab, h = plot.h - (thumb ? 0 : fs * 1.6);
  const cw = w / cols, rh = h / Math.max(1, rows.length);
  rows.forEach((s, r) => {
    for (let i = 0; i < cols; i++) {
      const v = num(s.values[i]);
      c.els.push(<rect key={key(c, 'sf')} x={x0 + i * cw} y={plot.y + r * rh} width={cw + (contour ? 0.5 : -1)} height={rh + (contour ? 0.5 : -1)} fill={v === null ? c.ink.grid : colorAt(v)} />);
      if (c.labels && v !== null && cw > fs * 2.2 && rh > fs * 1.2) txt(c, x0 + i * cw + cw / 2, plot.y + r * rh + rh / 2 + fs * 0.35, fmtNum(v, true), { anchor: 'middle', fill: c.ink.on, size: fs * 0.85, halo: true });
    }
    if (lab) txt(c, x0 - fs * 0.4, plot.y + r * rh + rh / 2 + fs * 0.35, trunc(s.name, lab - fs * 0.5, fs), { anchor: 'end' });
  });
  if (!thumb) for (let i = 0; i < cols; i++) txt(c, x0 + i * cw + cw / 2, plot.y + h + fs * 1.2, trunc(ch.categories[i] ?? String(i + 1), cw, fs), { anchor: 'middle' });
};

const mix = (a: string, b: string, t: number): string => {
  const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16)), pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
  return '#' + pa.map((v, k) => Math.round(v + (pb[k]! - v) * t).toString(16).padStart(2, '0')).join('');
};

// ---------- Map ----------

/** Maps need geographic shapes we don't ship; show a clear placeholder with the data. */
const drawMap = (c: Ctx): void => {
  const { c: ch, plot, thumb, fs } = c;
  const s = ch.series[0];
  const cx = plot.x + plot.w * (thumb ? 0.5 : 0.28), cy = plot.y + plot.h / 2;
  const r = Math.min(plot.w * (thumb ? 0.4 : 0.2), plot.h * 0.38);
  const a = sColor(c, 0);
  c.els.push(
    <g key={key(c, 'globe')} fill="none" stroke={a} strokeWidth={Math.max(1, r * 0.05)}>
      <circle cx={cx} cy={cy} r={r} fill={adjustLum(a, 0.85)} />
      <ellipse cx={cx} cy={cy} rx={r * 0.45} ry={r} />
      <line x1={cx - r} x2={cx + r} y1={cy} y2={cy} />
      <path d={`M${cx - r * 0.87},${cy - r * 0.5}Q${cx},${cy - r * 0.3} ${cx + r * 0.87},${cy - r * 0.5}M${cx - r * 0.87},${cy + r * 0.5}Q${cx},${cy + r * 0.3} ${cx + r * 0.87},${cy + r * 0.5}`} />
    </g>,
  );
  if (thumb || !s) return;
  txt(c, cx, cy + r + fs * 1.4, 'Map chart', { anchor: 'middle', weight: 600, fill: c.ink.ink });
  const tx = plot.x + plot.w * 0.55, tw = plot.w * 0.42;
  const rows = ch.categories.slice(0, Math.max(1, Math.floor(plot.h / (fs * 1.6)) - 1));
  const max = Math.max(1, ...s.values.map((v) => num(v) ?? 0));
  const y0 = plot.y + (plot.h - (rows.length + 1) * fs * 1.6) / 2 + fs * 1.1;
  txt(c, tx, y0, 'Region', { weight: 600, fill: c.ink.ink });
  txt(c, tx + tw, y0, s.name, { anchor: 'end', weight: 600, fill: c.ink.ink });
  rows.forEach((name, i) => {
    const y = y0 + (i + 1) * fs * 1.6;
    const v = num(s.values[i]) ?? 0;
    c.els.push(<rect key={key(c, 'mb')} x={tx} y={y - fs * 1.05} width={(tw * v) / max} height={fs * 1.35} fill={adjustLum(a, 0.72)} rx={fs * 0.2} />);
    txt(c, tx + fs * 0.3, y, trunc(name, tw * 0.6, fs), { fill: c.ink.ink });
    txt(c, tx + tw - fs * 0.3, y, fmtNum(v, true), { anchor: 'end', fill: c.ink.ink });
  });
};

export { byCategory };
