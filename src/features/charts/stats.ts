// Pure calculations behind the statistical, hierarchy and waterfall charts.

const clean = (v: number): number => +v.toPrecision(12);

// ---------- Histogram ----------

export interface Bin { lo: number; hi: number; count: number; label: string }

/**
 * Splits values into bins. With no count or width, the number of bins follows the
 * square-root rule (capped), and the width is rounded to a tidy number.
 */
export const histogramBins = (values: number[], opts: { binCount?: number; binWidth?: number } = {}, fmt: (v: number) => string = String): Bin[] => {
  const xs = values.filter((v) => Number.isFinite(v));
  if (!xs.length) return [];
  let lo = Math.min(...xs);
  const hi = Math.max(...xs);
  let width: number;
  let count: number;
  if (opts.binWidth && opts.binWidth > 0) {
    width = opts.binWidth;
    count = Math.max(1, Math.ceil((hi - lo) / width - 1e-9));
  } else if (opts.binCount && opts.binCount > 0) {
    count = Math.min(1000, Math.floor(opts.binCount));
    width = (hi - lo) / count || 1;
  } else {
    const target = Math.min(30, Math.max(1, Math.ceil(Math.sqrt(xs.length))));
    const raw = (hi - lo) / target || 1;
    const exp = Math.floor(Math.log10(raw));
    const f = raw / 10 ** exp;
    width = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * 10 ** exp;
    lo = Math.floor(lo / width) * width;
    count = Math.max(1, Math.ceil((hi - lo) / width + 1e-9));
    if (lo + count * width <= hi && hi > lo) count = Math.max(count, Math.floor((hi - lo) / width) + 1);
  }
  count = Math.min(count, 1000);
  const bins: Bin[] = Array.from({ length: count }, (_, i) => {
    const a = clean(lo + i * width), b = clean(lo + (i + 1) * width);
    return { lo: a, hi: b, count: 0, label: `${i === 0 ? '[' : '('}${fmt(a)}, ${fmt(b)}]` };
  });
  for (const v of xs) {
    // Bins hold (lo, hi]; the first also holds its lower edge.
    let i = Math.ceil((v - lo) / width - 1e-9) - 1;
    if (i < 0) i = 0;
    if (i >= count) i = count - 1;
    bins[i]!.count++;
  }
  return bins;
};

// ---------- Pareto ----------

export interface ParetoRow { label: string; value: number; cumulative: number; index: number }

/** Sorts categories from largest to smallest and adds the running share of the total (0..1). */
export const paretoRows = (labels: string[], values: (number | null)[]): ParetoRow[] => {
  const rows = values.map((v, i) => ({ label: labels[i] ?? String(i + 1), value: v !== null && v > 0 ? v : 0, index: i }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.index - b.index);
  const total = rows.reduce((a, r) => a + r.value, 0);
  let run = 0;
  return rows.map((r) => { run += r.value; return { ...r, cumulative: total ? clean(run / total) : 0 }; });
};

// ---------- Box and whisker ----------

export interface BoxStats { min: number; q1: number; median: number; q3: number; max: number; mean: number; lowWhisker: number; highWhisker: number; outliers: number[]; n: number }

/** Quartile by linear interpolation that leaves out the median for odd counts ("exclusive"). */
const quantileExclusive = (sorted: number[], p: number): number => {
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const h = (n + 1) * p;
  if (h <= 1) return sorted[0]!;
  if (h >= n) return sorted[n - 1]!;
  const lo = Math.floor(h);
  return sorted[lo - 1]! + (h - lo) * (sorted[lo]! - sorted[lo - 1]!);
};

/** Five-number summary, mean, whiskers at 1.5 IQR, and the points beyond them. */
export const boxStats = (values: number[]): BoxStats | null => {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const q1 = clean(quantileExclusive(s, 0.25)), median = clean(quantileExclusive(s, 0.5)), q3 = clean(quantileExclusive(s, 0.75));
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr, hiFence = q3 + 1.5 * iqr;
  const inside = s.filter((v) => v >= loFence && v <= hiFence);
  return {
    min: s[0]!, max: s[s.length - 1]!, q1, median, q3,
    mean: clean(s.reduce((a, b) => a + b, 0) / s.length),
    lowWhisker: inside[0] ?? q1, highWhisker: inside[inside.length - 1] ?? q3,
    outliers: s.filter((v) => v < loFence || v > hiFence), n: s.length,
  };
};

// ---------- Waterfall ----------

export interface WaterfallStep { index: number; value: number; start: number; end: number; kind: 'up' | 'down' | 'total' }

/** Floating bars: each step starts where the last ended; totals start at zero and show the running total. */
export const waterfallSteps = (values: (number | null)[], totals: number[] = []): WaterfallStep[] => {
  const isTotal = new Set(totals);
  let run = 0;
  return values.map((raw, index) => {
    const v = raw ?? 0;
    if (isTotal.has(index)) { const step = { index, value: run, start: 0, end: run, kind: 'total' as const }; return step; }
    const start = run;
    run = clean(run + v);
    return { index, value: v, start, end: run, kind: v < 0 ? 'down' as const : 'up' as const };
  });
};

/** Categories whose label reads like a total (used when no totals are set). */
export const guessTotals = (labels: string[]): number[] =>
  labels.flatMap((l, i) => (i > 0 && /^\s*(total|sum|net|end|ending|closing|balance|subtotal)\b/i.test(l) ? [i] : []));

// ---------- Hierarchy ----------

export interface TreeNode { name: string; value: number; children: TreeNode[]; path: string[]; color?: number }

/** Builds a tree from rows of category paths (blank levels end the path) and positive values. */
export const buildTree = (paths: string[][], values: (number | null)[]): TreeNode => {
  const root: TreeNode = { name: '', value: 0, children: [], path: [] };
  paths.forEach((p, i) => {
    const v = values[i];
    if (v === null || v === undefined || !(v > 0)) return;
    const parts: string[] = [];
    for (const x of p) { if (x === '') break; parts.push(x); }
    if (!parts.length) parts.push(String(i + 1));
    let node = root;
    node.value += v;
    parts.forEach((name, depth) => {
      let next = node.children.find((c) => c.name === name);
      if (!next) { next = { name, value: 0, children: [], path: parts.slice(0, depth + 1) }; node.children.push(next); }
      next.value += v;
      node = next;
    });
  });
  root.children.forEach((c, i) => { const paint = (n: TreeNode) => { n.color = i; n.children.forEach(paint); }; paint(c); });
  return root;
};

export const treeDepth = (n: TreeNode): number => (n.children.length ? 1 + Math.max(...n.children.map(treeDepth)) : 0);

export interface Rect { x: number; y: number; w: number; h: number }
export interface Tile<T> extends Rect { item: T }

const worst = (row: number[], side: number): number => {
  const s = row.reduce((a, b) => a + b, 0);
  if (!s || !side) return Infinity;
  const mx = Math.max(...row), mn = Math.min(...row);
  return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
};

/** Squarified treemap: tiles whose areas are proportional to the weights and fill the box exactly. */
export const squarify = <T>(items: { item: T; weight: number }[], box: Rect): Tile<T>[] => {
  const list = items.filter((x) => x.weight > 0).sort((a, b) => b.weight - a.weight);
  const total = list.reduce((a, x) => a + x.weight, 0);
  const out: Tile<T>[] = [];
  if (!total || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total;
  const areas = list.map((x) => x.weight * scale);
  let r = { ...box };
  let i = 0;
  while (i < list.length) {
    const side = Math.min(r.w, r.h);
    const row: number[] = [areas[i]!];
    let j = i + 1;
    while (j < list.length && worst([...row, areas[j]!], side) <= worst(row, side)) row.push(areas[j++]!);
    const sum = row.reduce((a, b) => a + b, 0);
    const last = j >= list.length;
    if (r.w >= r.h) {
      const w = last ? r.w : sum / r.h;
      let y = r.y;
      row.forEach((a, k) => { const h = (a / sum) * r.h; out.push({ x: r.x, y, w, h, item: list[i + k]!.item }); y += h; });
      r = { x: r.x + w, y: r.y, w: r.w - w, h: r.h };
    } else {
      const h = last ? r.h : sum / r.w;
      let x = r.x;
      row.forEach((a, k) => { const w = (a / sum) * r.w; out.push({ x, y: r.y, w, h, item: list[i + k]!.item }); x += w; });
      r = { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
    }
    i = j;
  }
  return out;
};

export interface Arc { node: TreeNode; depth: number; a0: number; a1: number }

/** Rings for a sunburst: depth 1 is the inner ring, each child spans its share of the parent's angle. */
export const sunburstArcs = (root: TreeNode, start = -Math.PI / 2): Arc[] => {
  const out: Arc[] = [];
  const walk = (n: TreeNode, depth: number, a0: number, a1: number) => {
    let a = a0;
    for (const c of n.children) {
      const span = n.value ? ((a1 - a0) * c.value) / n.value : 0;
      out.push({ node: c, depth, a0: a, a1: a + span });
      walk(c, depth + 1, a, a + span);
      a += span;
    }
  };
  walk(root, 1, start, start + Math.PI * 2);
  return out;
};

// ---------- Smoothing ----------

/** SVG path through the points; with `smooth`, a Catmull-Rom curve drawn as cubic Béziers. */
export const linePath = (pts: [number, number][], smooth: boolean): string => {
  if (!pts.length) return '';
  const f = (n: number) => +n.toFixed(2);
  if (!smooth || pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])},${f(p[1])}`).join(' ');
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0]!)},${f(c1[1]!)} ${f(c2[0]!)},${f(c2[1]!)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
};
