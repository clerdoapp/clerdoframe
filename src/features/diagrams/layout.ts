import type { AutoShape, Color, Diagram, DiagramLayout, DiagramNode, Effects, Fill, Line, Paragraph, Theme, ThemeColorName } from '../../model/deck';

/**
 * Pure diagram layout: turns a node outline into positioned auto shapes inside the diagram's
 * box (local coordinates 0,0 - w,h). Used by the renderer and by file writers.
 * Keep the signature stable: layoutDiagram(d, theme) => AutoShape[].
 */

type Box = { x: number; y: number; w: number; h: number };
interface Item { node: DiagramNode; children: Item[]; index: number }

const ACC: ThemeColorName[] = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];

// ---------- Colour schemes and styles ----------

export interface SchemeInfo { id: string; label: string }
export const COLOR_SCHEMES: SchemeInfo[] = [
  { id: 'primary', label: 'Primary' },
  { id: 'dark', label: 'Dark' },
  { id: 'colorful', label: 'Colorful' },
  { id: 'colorful2', label: 'Colorful, accents 2 to 6' },
  ...ACC.map((_, i) => ({ id: `accent${i + 1}`, label: `Accent ${i + 1} shades` })),
  ...ACC.map((_, i) => ({ id: `accent${i + 1}Outline`, label: `Accent ${i + 1} outline` })),
];
export interface StyleInfo { id: string; label: string }
export const DIAGRAM_STYLES: StyleInfo[] = [
  { id: 'flat', label: 'Flat' },
  { id: 'outline', label: 'Outline' },
  { id: 'gradient', label: 'Subtle gradient' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'soft', label: 'Soft edges' },
];

/** Fill colour of shape `i` of `n` at outline `level`. */
export const schemeColor = (scheme: string | undefined, i: number, n: number, level = 0): Color => {
  const id = scheme ?? 'primary';
  if (id === 'dark') return level ? { theme: 'dk2', lum: 0.35 } : { theme: 'dk2' };
  if (id === 'colorful') return { theme: ACC[i % 6]! };
  if (id === 'colorful2') return { theme: ACC[1 + (i % 5)]! };
  const m = /^accent([1-6])/.exec(id);
  const name = m ? ACC[+m[1]! - 1]! : 'accent1';
  if (id === 'primary') return level ? { theme: name, lum: 0.45 } : { theme: name };
  // Shades: from dark to light across the shapes.
  const t = n > 1 ? i / (n - 1) : 0;
  const lum = -0.25 + t * 0.65;
  return Math.abs(lum) < 0.02 ? { theme: name } : { theme: name, lum: +lum.toFixed(2) };
};

const isOutlineScheme = (s: string | undefined) => !!s && s.endsWith('Outline');

interface Look { fill: Fill; line?: Line; text: Color; effects?: Effects }

/** Fill, line and text colour of a shape for the diagram's scheme and style. */
const look = (d: Diagram, i: number, n: number, level = 0, opts: { light?: boolean } = {}): Look => {
  const base = schemeColor(d.colorScheme, i, n, level);
  const style = d.styleName ?? 'flat';
  const theme = typeof base === 'object' && 'theme' in base ? base.theme : 'accent1';
  const lum = typeof base === 'object' && 'theme' in base ? base.lum ?? 0 : 0;
  if (isOutlineScheme(d.colorScheme) || style === 'outline' || opts.light) {
    return {
      fill: { type: 'solid', color: opts.light ? { theme, lum: 0.8 } : { theme: 'lt1' } },
      line: { fill: { type: 'solid', color: base }, width: 1.5 },
      text: opts.light ? { theme: 'tx1' } : lum > 0.3 ? { theme: theme, lum: -0.25 } : base,
    };
  }
  const text: Color = lum > 0.35 ? { theme: 'tx1' } : { theme: 'lt1' };
  const line: Line = { fill: { type: 'solid', color: { theme: 'lt1' } }, width: 1.5 };
  if (style === 'gradient') {
    return { fill: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: { theme, lum: Math.min(0.9, lum + 0.25) } }, { pos: 1, color: { theme, lum: Math.max(-0.5, lum - 0.12) } }] }, line, text };
  }
  if (style === 'shadow') return { fill: { type: 'solid', color: base }, text, effects: { shadow: { kind: 'outer', color: '#000000', blur: 8, dist: 4, angle: 45, alpha: 0.32 } } };
  if (style === 'soft') return { fill: { type: 'solid', color: base }, text, effects: { softEdge: 3 } };
  return { fill: { type: 'solid', color: base }, line, text };
};

// ---------- Outline helpers ----------

/** Builds the node tree from the level outline (a deeper level nests under the nearest shallower one). */
export const buildTree = (nodes: DiagramNode[]): Item[] => {
  const roots: Item[] = [];
  const stack: Item[] = [];
  nodes.forEach((node, index) => {
    const it: Item = { node, children: [], index };
    while (stack.length && stack.at(-1)!.node.level >= node.level) stack.pop();
    if (stack.length) stack.at(-1)!.children.push(it); else roots.push(it);
    stack.push(it);
  });
  return roots;
};

const lines = (it: Item): string[] => it.children.map((c) => c.node.text);

let seq = 0;
const sid = (d: Diagram, tag: string) => `${d.id}-${tag}-${seq++}`;

const para = (text: string, size: number, color: Color, opts: { bold?: boolean; align?: 'l' | 'ctr' | 'r'; bullet?: boolean } = {}): Paragraph => ({
  runs: text ? [{ text, style: { size, color, bold: opts.bold, font: '+mn-lt' } }] : [],
  style: { align: opts.align ?? 'ctr', ...(opts.bullet ? { bullet: { type: 'char', char: '•' }, marginLeft: size * 1.1, indent: -size * 0.9 } : { bullet: { type: 'none' } }), lineSpacing: 90, spaceBefore: 0 },
});

interface ShapeOpts { geom?: string; text?: string; sub?: string[]; size?: number; align?: 'l' | 'ctr' | 'r'; vAlign?: 't' | 'ctr' | 'b'; lk?: Look; rot?: number; adj?: Record<string, number>; flipH?: boolean; name?: string; node?: string; noText?: boolean; inset?: number }

const PX = 96 / 72;
const CH = 0.56;

/** Lines that `text` wraps to at `size` pt in `w` px, or Infinity if a word doesn't fit. */
const wrapLines = (text: string, size: number, w: number): number => {
  const cw = size * PX * CH;
  let lines = 1, used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const ww = word.length * cw;
    if (ww > w) return Infinity;
    if (used && used + cw + ww > w) { lines++; used = ww; } else used += (used ? cw : 0) + ww;
  }
  return lines;
};

/** Largest size (pt) at which the head text and bullet lines fit in w x h px. */
export const fitSize = (head: string, subs: string[], w: number, h: number, max = 32, min = 6): number => {
  for (let size = max; size > min; size -= size > 14 ? 1 : 0.5) {
    const lh = size * PX * 1.2;
    const headLines = head ? wrapLines(head, size, w) : 0;
    const subLines = subs.reduce((a, t) => a + wrapLines(t, size * 0.8, w - size * PX), 0);
    if (headLines * lh + subLines * lh * 0.8 <= h) return size;
  }
  return min;
};

/** Share of a shape's box that holds text, by geometry. */
const TEXT_AREA: Record<string, [number, number]> = {
  ellipse: [0.7, 0.7], triangle: [0.5, 0.5], chevron: [0.66, 0.9], homePlate: [0.82, 0.9], rightArrow: [0.72, 0.6],
  gear6: [0.56, 0.56], gear9: [0.6, 0.6], trapezoid: [0.7, 0.9], snip1Rect: [0.9, 0.9], roundRect: [0.92, 0.9], round2SameRect: [0.86, 0.86],
};

const mk = (d: Diagram, b: Box, o: ShapeOpts): AutoShape => {
  const lk = o.lk ?? look(d, 0, 1);
  const paras: Paragraph[] = [];
  const ins = o.inset ?? Math.min(8, b.w * 0.06, b.h * 0.08);
  const [fw, fh] = TEXT_AREA[o.geom ?? 'rect'] ?? [1, 1];
  const rotated = o.rot && Math.abs(o.rot % 180) === 90;
  const tw = (rotated ? b.h : b.w) * fw - ins * 2, th = (rotated ? b.w : b.h) * fh - ins * 1.2;
  const size = o.size ?? fitSize(o.text ?? '', o.sub ?? [], Math.max(8, tw), Math.max(8, th));
  if (!o.noText) {
    if (o.text !== undefined) paras.push(para(o.text, size, lk.text, { bold: !!o.sub?.length, align: o.align }));
    for (const t of o.sub ?? []) paras.push(para(t, Math.max(6, size * 0.8), lk.text, { align: o.align === 'ctr' && o.sub!.length > 1 ? 'l' : o.align, bullet: true }));
  }
  return {
    id: sid(d, o.node ?? 'x'), kind: 'shape', name: o.name ?? (o.node ? 'Node' : 'Connector'),
    geom: o.geom ?? 'rect', x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h),
    ...(o.rot ? { rot: o.rot } : {}), ...(o.flipH ? { flipH: true } : {}), ...(o.adj ? { adj: o.adj } : {}),
    fill: lk.fill, ...(lk.line ? { line: lk.line } : {}), ...(lk.effects ? { effects: lk.effects } : {}),
    ...(paras.length ? { text: { paras, vAlign: o.vAlign ?? 'ctr', wrap: true, inset: { l: ins, t: ins * 0.6, r: ins, b: ins * 0.6 } } } : {}),
  };
};

/** Light connector/arrow look. */
const accentLook = (d: Diagram, lum = 0.55): Look => {
  const c = schemeColor(d.colorScheme, 0, 1);
  const theme = typeof c === 'object' && 'theme' in c ? c.theme : 'accent1';
  return { fill: { type: 'solid', color: { theme, lum } }, text: { theme: 'tx1' } };
};

const lineShape = (d: Diagram, x1: number, y1: number, x2: number, y2: number, arrow = false): AutoShape => {
  const c = schemeColor(d.colorScheme, 0, 1);
  const theme = typeof c === 'object' && 'theme' in c ? c.theme : 'accent1';
  return {
    id: sid(d, 'ln'), kind: 'shape', name: 'Connector', geom: 'line', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(0.01, Math.abs(x2 - x1)), h: Math.max(0.01, Math.abs(y2 - y1)),
    ...(x2 < x1 ? { flipH: true } : {}), ...(y2 < y1 ? { flipV: true } : {}),
    line: { fill: { type: 'solid', color: { theme, lum: 0.3 } }, width: 1.5, ...(arrow ? { tail: { type: 'triangle' } } : {}) },
  };
};

// ---------- Layouts ----------

type LayoutFn = (d: Diagram, roots: Item[], B: Box, theme: Theme) => AutoShape[];

const gridOf = (n: number, W: number, H: number): { cols: number; rows: number } => {
  let best = { cols: n, rows: 1, score: -Infinity };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = W / cols, ch = H / rows;
    const score = Math.min(cw / ch, ch / cw * 1.6) - (rows * cols - n) * 0.15;
    if (score > best.score) best = { cols, rows, score };
  }
  return best;
};

const basicList: LayoutFn = (d, roots, B) => {
  const n = roots.length;
  const { cols, rows } = gridOf(n, B.w, B.h);
  const gx = B.w * 0.03, gy = B.h * 0.05;
  const cw = (B.w - gx * (cols - 1)) / cols;
  const ch = Math.min((B.h - gy * (rows - 1)) / rows, cw * 0.75);
  const top = B.y + (B.h - (ch * rows + gy * (rows - 1))) / 2;
  return roots.map((r, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols);
    const left = B.x + (B.w - (inRow * cw + (inRow - 1) * gx)) / 2;
    return mk(d, { x: left + (i % cols) * (cw + gx), y: top + row * (ch + gy), w: cw, h: ch }, { geom: d.styleName === 'soft' ? 'roundRect' : 'rect', text: r.node.text, sub: lines(r), lk: look(d, i, n), node: r.node.id });
  });
};

const verticalList: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const gap = B.h * 0.03;
  const rh = (B.h - gap * (n - 1)) / n;
  const out: AutoShape[] = [];
  roots.forEach((r, i) => {
    const y = B.y + i * (rh + gap);
    const sub = lines(r);
    const head = sub.length ? Math.min(B.w * 0.32, Math.max(B.w * 0.22, rh * 2.2)) : B.w;
    out.push(mk(d, { x: B.x, y, w: head, h: rh }, { geom: 'roundRect', adj: { adj: 10000 }, text: r.node.text, lk: look(d, i, n), node: r.node.id }));
    if (sub.length) out.push(mk(d, { x: B.x + head - 6, y: y + rh * 0.08, w: B.w - head + 6, h: rh * 0.84 }, { geom: 'rect', sub, align: 'l', lk: look(d, i, n, 1, { light: true }), node: r.children[0]!.node.id }));
  });
  return out;
};

const process: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const arrowW = Math.min(B.w * 0.06, 40);
  const gap = arrowW * 1.6;
  const w = (B.w - gap * (n - 1)) / n;
  const maxSub = Math.max(0, ...roots.map((r) => r.children.length));
  const h = Math.min(B.h * 0.85, Math.max(w * 0.7 + maxSub * w * 0.2, B.h * 0.45));
  const y = B.y + (B.h - h) / 2;
  const out: AutoShape[] = [];
  roots.forEach((r, i) => {
    const x = B.x + i * (w + gap);
    out.push(mk(d, { x, y, w, h }, { geom: 'roundRect', adj: { adj: 10000 }, text: r.node.text, sub: lines(r), lk: look(d, i, n), node: r.node.id }));
    if (i < n - 1) out.push(mk(d, { x: x + w + (gap - arrowW) / 2, y: y + h / 2 - arrowW * 0.6, w: arrowW, h: arrowW * 1.2 }, { geom: 'rightArrow', adj: { adj1: 60000, adj2: 50000 }, lk: accentLook(d), noText: true }));
  });
  return out;
};

const chevronProcess: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const hasSub = roots.some((r) => r.children.length);
  const ch = hasSub ? B.h * 0.32 : Math.min(B.h, B.w / n * 0.5);
  const over = ch * 0.3;
  const w = (B.w + over * (n - 1)) / n;
  const y = hasSub ? B.y : B.y + (B.h - ch) / 2;
  const out: AutoShape[] = [];
  roots.forEach((r, i) => {
    const x = B.x + i * (w - over);
    out.push(mk(d, { x, y, w, h: ch }, { geom: i === 0 ? 'homePlate' : 'chevron', adj: { adj: 30000 * (ch / Math.max(ch, w)) * 2 }, text: r.node.text, lk: look(d, i, n), node: r.node.id, inset: Math.min(6, ch * 0.08) }));
    if (r.children.length) out.push(mk(d, { x: x + over * 0.5, y: y + ch + B.h * 0.04, w: w - over * 1.5, h: B.h - ch - B.h * 0.04 }, { sub: lines(r), align: 'l', vAlign: 't', lk: look(d, i, n, 1, { light: true }), node: r.children[0]!.node.id }));
  });
  return out;
};

const ringPos = (n: number, cx: number, cy: number, R: number) => Array.from({ length: n }, (_, i) => {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  return { a, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
});

const cycle: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const S = Math.min(B.w, B.h);
  const r = Math.min(S * 0.17, (Math.PI * S * 0.36) / n * 0.6);
  const R = S / 2 - r;
  const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  const pos = ringPos(n, cx, cy, R);
  const out: AutoShape[] = [];
  if (n > 1) pos.forEach((p, i) => {
    const q = pos[(i + 1) % n]!;
    const mid = (p.a + (i + 1 === n ? q.a + Math.PI * 2 : q.a)) / 2;
    const mx = cx + Math.cos(mid) * R, my = cy + Math.sin(mid) * R;
    const s = r * 0.6;
    out.push(mk(d, { x: mx - s / 2, y: my - s * 0.35, w: s, h: s * 0.7 }, { geom: 'rightArrow', rot: (mid * 180) / Math.PI + 90, lk: accentLook(d), noText: true, adj: { adj1: 60000, adj2: 50000 } }));
  });
  roots.forEach((it, i) => {
    const p = pos[i]!;
    out.push(mk(d, { x: p.x - r * 1.15, y: p.y - r * 0.8, w: r * 2.3, h: r * 1.6 }, { geom: 'roundRect', adj: { adj: 20000 }, text: it.node.text, sub: lines(it), lk: look(d, i, n), node: it.node.id }));
  });
  return out;
};

const radial: LayoutFn = (d, roots, B) => {
  const center = roots[0];
  if (!center) return [];
  const kids = center.children.length ? center.children : roots.slice(1);
  const n = Math.max(1, kids.length);
  const S = Math.min(B.w, B.h);
  const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  const rc = S * 0.19;
  const rk = Math.min(S * 0.14, (Math.PI * S * 0.35) / n * 0.48);
  const R = S / 2 - rk;
  const out: AutoShape[] = [];
  const pos = ringPos(n, cx, cy, R);
  pos.forEach((p) => out.push(lineShape(d, cx + Math.cos(p.a) * rc, cy + Math.sin(p.a) * rc, p.x - Math.cos(p.a) * rk, p.y - Math.sin(p.a) * rk)));
  out.push(mk(d, { x: cx - rc, y: cy - rc, w: rc * 2, h: rc * 2 }, { geom: 'ellipse', text: center.node.text, lk: look(d, 0, n + 1), node: center.node.id }));
  kids.forEach((k, i) => { const p = pos[i]!; out.push(mk(d, { x: p.x - rk, y: p.y - rk, w: rk * 2, h: rk * 2 }, { geom: 'ellipse', text: k.node.text, lk: look(d, i + 1, n + 1, 1), node: k.node.id })); });
  return out;
};

/** Tidy tree: leaves get equal slots, parents centre over their children. */
const tree = (d: Diagram, roots: Item[], B: Box, org: boolean): AutoShape[] => {
  const depthOf = (it: Item): number => 1 + Math.max(0, ...it.children.map(depthOf));
  const leaves = (it: Item): number => (it.children.length ? it.children.reduce((a, c) => a + leaves(c), 0) : 1);
  const D = Math.max(1, ...roots.map(depthOf));
  const L = roots.reduce((a, r) => a + leaves(r), 0);
  const slot = B.w / Math.max(1, L);
  const vgap = B.h / D * 0.38;
  const bh = Math.min((B.h - vgap * (D - 1)) / D, slot * 0.7);
  const bw = Math.min(slot * 0.88, bh * 2.2);
  const rowY = (lv: number) => B.y + (B.h - (D * bh + (D - 1) * vgap)) / 2 + lv * (bh + vgap);
  const boxes: AutoShape[] = [];
  const links: AutoShape[] = [];
  let leaf = 0;
  const place = (it: Item, lv: number, idx: number): number => {
    let cx: number;
    if (!it.children.length) { cx = B.x + slot * (leaf + 0.5); leaf++; }
    else {
      const xs = it.children.map((c, i) => place(c, lv + 1, i));
      cx = (xs[0]! + xs.at(-1)!) / 2;
      const y1 = rowY(lv) + bh, y2 = rowY(lv + 1), ym = (y1 + y2) / 2;
      if (org) {
        links.push(lineShape(d, cx, y1, cx, ym));
        if (xs.length > 1) links.push(lineShape(d, xs[0]!, ym, xs.at(-1)!, ym));
        xs.forEach((x) => links.push(lineShape(d, x, ym, x, y2)));
      } else xs.forEach((x) => links.push(lineShape(d, cx, y1, x, y2)));
    }
    boxes.push(mk(d, { x: cx - bw / 2, y: rowY(lv), w: bw, h: bh }, { geom: org ? 'rect' : 'roundRect', adj: { adj: 12000 }, text: it.node.text, lk: look(d, org ? idx : lv, org ? 6 : D, lv), node: it.node.id }));
    return cx;
  };
  roots.forEach((r, i) => place(r, 0, i));
  return [...links, ...boxes];
};

const pyramid = (inverted: boolean): LayoutFn => (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const hasSub = roots.some((r) => r.children.length);
  const pw = hasSub ? B.w * 0.55 : Math.min(B.w, B.h * 1.25);
  const px = B.x + (hasSub ? 0 : (B.w - pw) / 2);
  const gap = B.h * 0.012;
  const lh = (B.h - gap * (n - 1)) / n;
  const out: AutoShape[] = [];
  roots.forEach((r, i) => {
    const y = B.y + i * (lh + gap);
    // Width at the top and bottom of this band.
    const t0 = inverted ? 1 - (y - B.y) / B.h : (y - B.y) / B.h;
    const t1 = inverted ? 1 - (y + lh - B.y) / B.h : (y + lh - B.y) / B.h;
    const wTop = pw * t0, wBot = pw * t1;
    const wide = Math.max(wTop, wBot), narrow = Math.min(wTop, wBot);
    const geom = i === (inverted ? n - 1 : 0) && narrow < 1 ? 'triangle' : 'trapezoid';
    const inset = (wide - narrow) / 2;
    out.push(mk(d, { x: px + (pw - wide) / 2, y, w: wide, h: lh }, {
      geom, ...(geom === 'trapezoid' ? { adj: { adj: (inset / Math.max(1, Math.min(wide, lh))) * 100000 } } : {}), ...(inverted ? { rot: 180 } : {}),
      text: inverted ? undefined : r.node.text, noText: inverted, lk: look(d, i, n), node: r.node.id,
    }));
    if (inverted) out.push(mk(d, { x: px + (pw - narrow) / 2, y, w: Math.max(narrow, wide * 0.6), h: lh }, { text: r.node.text, lk: { ...look(d, i, n), fill: { type: 'none' }, line: undefined, effects: undefined }, node: r.node.id }));
    if (r.children.length) out.push(mk(d, { x: B.x + pw + B.w * 0.03, y, w: B.w - pw - B.w * 0.03, h: lh }, { sub: lines(r), align: 'l', lk: look(d, i, n, 1, { light: true }), node: r.children[0]!.node.id }));
  });
  return out;
};

const venn: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const S = Math.min(B.w, B.h);
  const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  const r = n === 1 ? S / 2 : n === 2 ? Math.min(B.w / 3.3, B.h / 2) : S * 0.31;
  const R = n === 1 ? 0 : n === 2 ? r * 0.65 : S / 2 - r;
  const pos = n === 2 ? [{ x: cx - R, y: cy, a: Math.PI }, { x: cx + R, y: cy, a: 0 }] : ringPos(n, cx, cy, R);
  return roots.map((it, i) => {
    const p = pos[i]!;
    const lk = look(d, i, n);
    const tx = (p.x - cx) * 0.45, ty = (p.y - cy) * 0.45;
    const size = fitSize(it.node.text, lines(it), r * 0.95, r * 0.8);
    const shape = mk(d, { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 }, { geom: 'ellipse', size, text: it.node.text, sub: lines(it), lk: { ...lk, fill: lk.fill.type === 'solid' ? { type: 'solid', color: { ...(lk.fill.color as object), alpha: 0.62 } as Color } : lk.fill }, node: it.node.id });
    if (shape.text) shape.text.inset = { l: Math.max(4, r * 0.25 + tx), r: Math.max(4, r * 0.25 - tx), t: Math.max(4, r * 0.25 + ty), b: Math.max(4, r * 0.25 - ty) };
    return shape;
  });
};

const matrix: LayoutFn = (d, roots, B) => {
  const center = roots.length > 4 || (roots[0]?.children.length ?? 0) >= 2 ? roots[0] : undefined;
  const cells = center && center.children.length >= 2 ? center.children.slice(0, 4) : roots.slice(0, 4);
  const S = Math.min(B.w, B.h);
  const x0 = B.x + (B.w - S) / 2, y0 = B.y + (B.h - S) / 2;
  const g = S * 0.02, c = (S - g) / 2;
  const out = cells.map((it, i) => mk(d, { x: x0 + (i % 2) * (c + g), y: y0 + Math.floor(i / 2) * (c + g), w: c, h: c }, {
    geom: 'round2SameRect', adj: { adj1: 16000, adj2: 0 }, rot: [0, 90, 270, 180][i]!, text: it.node.text, sub: lines(it), lk: look(d, i, 4), node: it.node.id,
  }));
  // Each quadrant's rounded corner points outward; the text is turned back upright.
  out.forEach((s) => { if (s.rot && s.text) { s.text.rot = -s.rot; } });
  if (center) out.push(mk(d, { x: x0 + S / 2 - S * 0.17, y: y0 + S / 2 - S * 0.12, w: S * 0.34, h: S * 0.24 }, { geom: 'roundRect', text: center.node.text, lk: look(d, 0, 1, 1, { light: true }), node: center.node.id }));
  return out;
};

const funnel: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const W = Math.min(B.w, B.h * 1.1);
  const x0 = B.x + (B.w - W) / 2;
  const gap = B.h * 0.02;
  const lh = (B.h - gap * (n - 1)) / n;
  return roots.map((r, i) => {
    const top = W * (1 - (i / n) * 0.7), bot = W * (1 - ((i + 1) / n) * 0.7);
    const inset = (top - bot) / 2;
    return mk(d, { x: x0 + (W - top) / 2, y: B.y + i * (lh + gap), w: top, h: lh }, {
      geom: 'trapezoid', rot: 180, adj: { adj: (inset / Math.max(1, Math.min(top, lh))) * 100000 }, text: r.node.text, lk: look(d, i, n), node: r.node.id,
    });
  }).map((s) => { if (s.text) s.text.rot = 180; return s; });
};

const timeline: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const cy = B.y + B.h / 2;
  const out: AutoShape[] = [mk(d, { x: B.x, y: cy - B.h * 0.035, w: B.w, h: B.h * 0.07 }, { geom: 'rightArrow', adj: { adj1: 100000, adj2: 40000 }, lk: accentLook(d, 0.4), noText: true })];
  const slot = (B.w * 0.94) / n;
  const dot = Math.min(slot * 0.25, B.h * 0.08);
  roots.forEach((r, i) => {
    const x = B.x + slot * (i + 0.5);
    const up = i % 2 === 0;
    out.push(mk(d, { x: x - dot / 2, y: cy - dot / 2, w: dot, h: dot }, { geom: 'ellipse', lk: look(d, i, n), noText: true }));
    const bh = B.h * 0.36;
    out.push(lineShape(d, x, up ? cy - dot / 2 : cy + dot / 2, x, up ? cy - B.h * 0.12 : cy + B.h * 0.12));
    out.push(mk(d, { x: x - slot * 0.48, y: up ? cy - B.h * 0.12 - bh : cy + B.h * 0.12, w: slot * 0.96, h: bh }, { text: r.node.text, sub: lines(r), vAlign: up ? 'b' : 't', lk: look(d, i, n, 1, { light: true }), node: r.node.id }));
  });
  return out;
};

const gear: LayoutFn = (d, roots, B) => {
  const list = roots.slice(0, 3);
  const S = Math.min(B.w / 1.35, B.h);
  const specs = [{ cx: 0.36, cy: 0.62, r: 0.34, g: 'gear9' }, { cx: 0.82, cy: 0.3, r: 0.25, g: 'gear6' }, { cx: 0.98, cy: 0.78, r: 0.2, g: 'gear6' }];
  const x0 = B.x + (B.w - S * 1.2) / 2, y0 = B.y + (B.h - S) / 2;
  return list.map((it, i) => {
    const s = specs[i]!;
    const r = s.r * S;
    return mk(d, { x: x0 + s.cx * S - r, y: y0 + s.cy * S - r, w: r * 2, h: r * 2 }, { geom: s.g, text: it.node.text, lk: look(d, i, 3), node: it.node.id, inset: 2 });
  });
};

const target: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const S = Math.min(B.h, B.w * 0.55);
  const cx = B.x + S / 2, cy = B.y + B.h / 2;
  const out: AutoShape[] = [];
  roots.forEach((r, i) => {
    const rad = (S / 2) * (1 - i / n);
    out.push(mk(d, { x: cx - rad, y: cy - rad, w: rad * 2, h: rad * 2 }, { geom: 'ellipse', lk: look(d, i, n), noText: true }));
  });
  const lh = B.h / n;
  roots.forEach((r, i) => {
    const ly = B.y + i * lh + lh / 2;
    const rad = (S / 2) * (1 - (i + 0.5) / n);
    out.push(lineShape(d, cx + rad * 0.2, cy - rad, B.x + S + B.w * 0.03, ly));
    out.push(mk(d, { x: B.x + S + B.w * 0.03, y: ly - lh * 0.42, w: B.w - S - B.w * 0.03, h: lh * 0.84 }, { text: r.node.text, sub: lines(r), align: 'l', lk: look(d, i, n, 1, { light: true }), node: r.node.id }));
  });
  return out;
};

const stepUp: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const w = B.w / n;
  const step = (B.h * 0.75) / n;
  const out: AutoShape[] = [];
  roots.forEach((r, i) => {
    const h = B.h * 0.25 + step * (i + 1) * 0.9;
    const x = B.x + i * w;
    out.push(mk(d, { x: x + w * 0.04, y: B.y + B.h - h, w: w * 0.92, h }, { geom: 'snip1Rect', adj: { adj: 22000 }, text: r.node.text, sub: lines(r), vAlign: 't', lk: look(d, i, n), node: r.node.id }));
  });
  return out;
};

const bendingProcess: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const cols = Math.min(n, Math.max(2, Math.round(Math.sqrt(n * (B.w / B.h) * 0.8))));
  const rows = Math.ceil(n / cols);
  const ax = Math.min(B.w * 0.05, 34);
  const w = (B.w - ax * 1.6 * (cols - 1)) / cols;
  const gy = B.h * 0.08;
  const h = Math.min((B.h - gy * (rows - 1)) / rows, w * 0.7);
  const y0 = B.y + (B.h - (rows * h + (rows - 1) * gy)) / 2;
  const out: AutoShape[] = [];
  roots.forEach((r, i) => {
    const row = Math.floor(i / cols), c = i % cols;
    const x = B.x + c * (w + ax * 1.6), y = y0 + row * (h + gy);
    out.push(mk(d, { x, y, w, h }, { geom: 'roundRect', adj: { adj: 10000 }, text: r.node.text, sub: lines(r), lk: look(d, i, n), node: r.node.id }));
    if (i < n - 1) {
      if (c < cols - 1) out.push(mk(d, { x: x + w + ax * 0.3, y: y + h / 2 - ax * 0.5, w: ax, h: ax }, { geom: 'rightArrow', lk: accentLook(d), noText: true }));
      else out.push(mk(d, { x: x + w / 2 - ax * 0.5, y: y + h + (gy - ax) / 2, w: ax, h: ax }, { geom: 'downArrow', lk: accentLook(d), noText: true }));
    }
  });
  return out;
};

const pictureList: LayoutFn = (d, roots, B) => {
  const n = Math.max(1, roots.length);
  const cols = n <= 4 ? n : Math.ceil(Math.sqrt(n * (B.w / B.h) * 0.8)), rows = Math.ceil(n / cols);
  const gx = B.w * 0.03, gy = B.h * 0.05;
  const cw = (B.w - gx * (cols - 1)) / cols, ch = (B.h - gy * (rows - 1)) / rows;
  const out: AutoShape[] = [];
  roots.forEach((r, i) => {
    const x = B.x + (i % cols) * (cw + gx), y = B.y + Math.floor(i / cols) * (ch + gy);
    const ph = ch * 0.68;
    const pic = mk(d, { x, y, w: cw, h: ph }, { geom: 'rect', lk: look(d, i, n, 1, { light: true }), noText: true, name: 'Picture' });
    if (r.node.media) pic.fill = { type: 'picture', media: r.node.media, mode: 'stretch' };
    out.push(pic);
    out.push(mk(d, { x, y: y + ph, w: cw, h: ch - ph }, { text: r.node.text, sub: lines(r), lk: look(d, i, n), node: r.node.id }));
  });
  return out;
};

const arrowRibbon: LayoutFn = (d, roots, B) => {
  const list = roots.slice(0, 2);
  const h = B.h * 0.42;
  const out: AutoShape[] = [];
  list.forEach((r, i) => {
    const y = i === 0 ? B.y + B.h * 0.06 : B.y + B.h - h - B.h * 0.06;
    out.push(mk(d, { x: B.x + (i === 0 ? B.w * 0.08 : 0), y, w: B.w * 0.92, h }, {
      geom: 'rightArrow', adj: { adj1: 70000, adj2: 45000 }, flipH: i === 1, text: r.node.text, sub: lines(r), lk: look(d, i, 2), node: r.node.id, inset: h * 0.25,
    }));
  });
  return out;
};

const LAYOUTS: Record<DiagramLayout, LayoutFn> = {
  basicList, verticalList, process, chevronProcess, cycle, radial,
  hierarchy: (d, r, B) => tree(d, r, B, false), orgChart: (d, r, B) => tree(d, r, B, true),
  pyramid: pyramid(false), invertedPyramid: pyramid(true), venn, matrix, funnel, timeline, gear, target, stepUp, bendingProcess, pictureList, arrowRibbon,
};

/** Lays out a diagram into auto shapes in its own box (0,0)-(w,h). */
export const layoutDiagram = (d: Diagram, theme: Theme): AutoShape[] => {
  seq = 0;
  const nodes = d.nodes.length ? d.nodes : [{ id: 'empty', text: '', level: 0 }];
  const roots = buildTree(nodes);
  const pad = Math.min(d.w, d.h) * 0.02;
  const B: Box = { x: pad, y: pad, w: Math.max(10, d.w - 2 * pad), h: Math.max(10, d.h - 2 * pad) };
  const fn = LAYOUTS[d.layout] ?? basicList;
  let out: AutoShape[];
  try { out = fn(d, roots, B, theme); } catch { out = basicList(d, roots, B, theme); }
  return evenSizes(out);
};

/** Gives every shape of the same role (head boxes, bullet boxes) the smallest fitted size, so text matches. */
const evenSizes = (shapes: AutoShape[]): AutoShape[] => {
  const head = (s: AutoShape) => s.text?.paras[0]?.style?.bullet?.type === 'none' ? s.text.paras[0]!.runs[0]?.style?.size : undefined;
  const sub = (s: AutoShape) => s.text?.paras.find((p) => p.style?.bullet?.type === 'char')?.runs[0]?.style?.size;
  // Smallest size, ignoring outliers (a tiny apex) that would shrink everything else.
  const minOf = (f: (s: AutoShape) => number | undefined) => {
    const xs = shapes.map(f).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    if (!xs.length) return Infinity;
    const med = xs[Math.floor(xs.length / 2)]!;
    return xs.find((x) => x >= med * 0.6) ?? med;
  };
  const h = minOf(head), b = Math.min(minOf(sub), h === Infinity ? Infinity : h * 0.8);
  for (const s of shapes) for (const p of s.text?.paras ?? []) for (const r of p.runs) {
    if (!r.style) continue;
    const want = p.style?.bullet?.type === 'char' ? b : h;
    if (want !== Infinity && (r.style.size ?? 0) > want) r.style.size = want;
  }
  return shapes;
};
