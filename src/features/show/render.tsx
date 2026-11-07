import { memo, type ReactNode } from 'react';
import { textOf, type Deck, type Shape, type Slide } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import type { Look } from './timeline';
import type { Poly } from './effects';
import { hexToRgb, rgbToHex } from '../../render/color';

/** A slide drawn once for the show. Each top-level shape sits in a <g data-anim> wrapper the engine animates. */
export const ShowSlide = memo(({ deck, slide, width, mode = 'show', slideNumber }: { deck: Deck; slide: Slide; width?: number; mode?: 'show' | 'thumb'; slideNumber?: number }) => (
  <SlideView deck={deck} slide={slide} mode={mode} width={width} slideNumber={slideNumber} style={{ width: '100%', height: '100%' }}
    decorate={(s: Shape, n: ReactNode) => <g data-anim={s.id} data-kind={s.kind}>{n}</g>} />
));
ShowSlide.displayName = 'ShowSlide';

// ---------- Text units ----------

const SVGNS = 'http://www.w3.org/2000/svg';

const paras = (wrap: Element): HTMLElement[] => [...wrap.querySelectorAll<HTMLElement>('[data-textbox] > div > p')];

/** Non-empty paragraphs, the units "by paragraph" animates. */
const unitParas = (wrap: Element): HTMLElement[] => paras(wrap).filter((p) => (p.textContent ?? '').trim().length > 0);

/** Splits a shape's text into word or letter spans once (the slide is not re-rendered while shown). */
const splitText = (wrap: Element, by: 'word' | 'letter'): HTMLElement[] => {
  const key = `split-${by}`;
  const host = wrap as HTMLElement & { __units?: Record<string, HTMLElement[]> };
  host.__units ??= {};
  if (host.__units[key]) return host.__units[key]!;
  const out: HTMLElement[] = [];
  for (const p of paras(wrap)) {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) { const n = walker.currentNode as Text; if (!(n.parentElement?.hasAttribute('data-bullet'))) nodes.push(n); }
    for (const n of nodes) {
      const parts = by === 'word' ? (n.data.match(/\s+|[^\s]+/g) ?? []) : [...n.data];
      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
        const sp = document.createElement('span');
        sp.style.display = 'inline-block';
        sp.style.whiteSpace = 'pre';
        sp.textContent = part;
        frag.appendChild(sp);
        out.push(sp);
      }
      n.replaceWith(frag);
    }
  }
  host.__units[key] = out;
  return out;
};

/** Counts the text units a shape has, from the model (no DOM). */
export const countUnits = (shape: Shape | undefined, by: 'para' | 'word' | 'letter'): number => {
  if (!shape || shape.kind !== 'shape' || !shape.text) return 1;
  const t = textOf(shape.text);
  if (by === 'para') return Math.max(1, t.split('\n').filter((x) => x.trim()).length);
  if (by === 'word') return Math.max(1, (t.match(/[^\s]+/g) ?? []).length);
  return Math.max(1, t.replace(/\s+/g, '').length);
};

// ---------- Applying looks ----------

interface Orig { fill?: string | null; stroke?: string | null; color?: string; weight?: string; deco?: string }
const origs = new WeakMap<Element, Orig>();

const mix = (a: string, b: string, k: number): string => {
  if (!/^#[0-9a-f]{6}$/i.test(a)) return k >= 0.5 ? b : a;
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k);
};
const cssToHex = (c: string): string => {
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? rgbToHex(+m[1]!, +m[2]!, +m[3]!) : c;
};

const polyToPath = (polys: Poly[], w: number, h: number): string =>
  polys.map((p) => `M${p.map(([x, y]) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`).join('L')}Z`).join('');
const polyToCss = (polys: Poly[]): string => {
  // CSS polygon() can't hold several pieces; use path() in the box's pixel space instead.
  if (polys.length === 1) return `polygon(${polys[0]!.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(',')})`;
  return '';
};

const transformOf = (l: Look): string => {
  const t: string[] = [];
  if (l.tx || l.ty) t.push(`translate(${(l.tx ?? 0).toFixed(2)}px, ${(l.ty ?? 0).toFixed(2)}px)`);
  if (l.rot) t.push(`rotate(${l.rot.toFixed(2)}deg)`);
  if (l.skewX) t.push(`skewX(${l.skewX.toFixed(2)}deg)`);
  const sc = (v: number | undefined): number => { const n = v ?? 1; return (n < 0 ? -1 : 1) * Math.max(0.0001, Math.abs(n)); };
  if ((l.sx ?? 1) !== 1 || (l.sy ?? 1) !== 1) t.push(`scale(${sc(l.sx)}, ${sc(l.sy)})`);
  return t.join(' ');
};

const clipFor = (svg: SVGSVGElement, key: string): SVGPathElement => {
  const id = `ac-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  let cp = svg.querySelector<SVGClipPathElement>(`#${CSS.escape(id)}`);
  if (!cp) {
    let defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS(SVGNS, 'defs'); svg.prepend(defs); }
    cp = document.createElementNS(SVGNS, 'clipPath') as SVGClipPathElement;
    cp.id = id;
    cp.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('clip-rule', 'evenodd');
    cp.appendChild(p);
    defs.appendChild(cp);
  }
  return cp.firstChild as SVGPathElement;
};

const applyColors = (root: Element, l: Look): void => {
  const c = l.colors;
  for (const el of root.querySelectorAll<SVGElement>('path, rect, ellipse')) {
    let o = origs.get(el);
    if (!o) { o = { fill: el.getAttribute('fill'), stroke: el.getAttribute('stroke') }; origs.set(el, o); }
    if (c?.fill && o.fill && o.fill !== 'none') el.style.fill = mix(o.fill, c.fill[0], c.fill[1]); else el.style.removeProperty('fill');
    if (c?.stroke && o.stroke && o.stroke !== 'none') el.style.stroke = mix(o.stroke, c.stroke[0], c.stroke[1]); else el.style.removeProperty('stroke');
  }
  for (const sp of root.querySelectorAll<HTMLElement>('[data-textbox] span')) {
    let o = origs.get(sp);
    if (!o) { o = { color: cssToHex(sp.style.color), weight: sp.style.fontWeight, deco: sp.style.textDecorationLine }; origs.set(sp, o); }
    sp.style.color = c?.font ? mix(o.color ?? '#000000', c.font[0], c.font[1]) : o.color ?? '';
    sp.style.fontWeight = l.bold ? '700' : o.weight ?? '';
    sp.style.textDecorationLine = l.underline ? 'underline' : o.deco ?? '';
  }
};

const hasColorChange = (l: Look | undefined): boolean => !!(l && (l.colors || l.bold !== undefined || l.underline !== undefined));

/** Applies a look to an SVG wrapper group (whole shape or its drawing without text). */
const applySvg = (svg: SVGSVGElement, el: SVGGraphicsElement, inner: SVGGraphicsElement | null, key: string, l: Look | undefined, w: number, h: number, touched: Set<Element>): void => {
  const st = el.style;
  if (!l) {
    if (!touched.has(el)) return;
    st.removeProperty('transform'); st.removeProperty('opacity'); st.removeProperty('visibility'); st.removeProperty('filter');
    inner?.removeAttribute('clip-path');
    if (el.dataset.colored) { applyColors(el, {}); delete el.dataset.colored; }
    touched.delete(el);
    return;
  }
  touched.add(el);
  st.transformBox = 'fill-box';
  st.transformOrigin = 'center';
  st.visibility = l.hidden ? 'hidden' : '';
  st.opacity = l.opacity === undefined ? '' : String(Math.max(0, Math.min(1, l.opacity)));
  st.transform = transformOf(l);
  st.filter = l.filter ?? '';
  if (inner) {
    if (l.clip && !l.hidden) {
      const p = clipFor(svg, key);
      p.setAttribute('d', polyToPath(l.clip, w, h) || 'M0 0Z');
      inner.setAttribute('clip-path', `url(#${p.parentElement!.id})`);
    } else inner.removeAttribute('clip-path');
  }
  if (hasColorChange(l)) { applyColors(el, l); el.dataset.colored = '1'; } else if (el.dataset.colored) { applyColors(el, {}); delete el.dataset.colored; }
};

const applyHtml = (el: HTMLElement, l: Look | undefined, touched: Set<Element>): void => {
  const st = el.style;
  if (!l) {
    if (!touched.has(el)) return;
    for (const k of ['transform', 'opacity', 'visibility', 'clip-path', 'filter']) st.removeProperty(k);
    if (el.dataset.colored) { applyColors(el, {}); delete el.dataset.colored; }
    touched.delete(el);
    return;
  }
  touched.add(el);
  if (el.tagName === 'SPAN') st.display = 'inline-block';
  st.transformOrigin = 'center';
  st.visibility = l.hidden ? 'hidden' : '';
  st.opacity = l.opacity === undefined ? '' : String(Math.max(0, Math.min(1, l.opacity)));
  st.transform = transformOf(l);
  st.filter = l.filter ?? '';
  st.clipPath = l.clip ? polyToCss(l.clip) || 'none' : '';
  if (hasColorChange(l)) { applyColors(el.parentElement ?? el, l); el.dataset.colored = '1'; }
};

export interface ApplyEnv { shapes: Map<string, Shape>; split: Record<string, 'para' | 'word' | 'letter'> }

/** Writes every target's look into the drawn slide. Cheap: only style changes. */
export const applyLooks = (svg: SVGSVGElement, looks: Map<string, Look>, env: ApplyEnv): void => {
  const host = svg as SVGSVGElement & { __touched?: Set<Element> };
  const touched = (host.__touched ??= new Set());
  for (const wrap of svg.querySelectorAll<SVGGElement>(':scope > g > g[data-anim]')) {
    const id = wrap.dataset.anim!;
    const s = env.shapes.get(id);
    if (!s) continue;
    const inner = wrap.firstElementChild as SVGGraphicsElement | null;
    const by = env.split[id];
    applySvg(svg, wrap, inner, id, looks.get(id), s.w, s.h, touched);
    if (!by) continue;
    // The shape's drawing (everything but the text) as its own target.
    if (inner) {
      const shapeLook = looks.get(`${id}#shape`);
      for (const child of [...inner.children] as SVGGraphicsElement[]) {
        if (child.tagName === 'foreignObject' || child.querySelector('foreignObject')) continue;
        if (shapeLook) {
          touched.add(child);
          const st = child.style;
          st.transformBox = 'view-box';
          st.transformOrigin = `${s.w / 2}px ${s.h / 2}px`;
          st.visibility = shapeLook.hidden ? 'hidden' : '';
          st.opacity = shapeLook.opacity === undefined ? '' : String(shapeLook.opacity);
          st.transform = transformOf(shapeLook);
        } else if (touched.has(child)) {
          for (const k of ['visibility', 'opacity', 'transform', 'transform-box', 'transform-origin']) child.style.removeProperty(k);
          touched.delete(child);
        }
      }
    }
    const units = by === 'para' ? unitParas(wrap) : splitText(wrap, by);
    units.forEach((u, i) => applyHtml(u, looks.get(`${id}#${by[0]}${i}`), touched));
  }
};

/** Clears every animation style (used when a slide is reused for a finished state). */
export const clearLooks = (svg: SVGSVGElement, env: ApplyEnv): void => applyLooks(svg, new Map(), env);

// ---------- Morph ----------

interface Pair { from?: Shape; to?: Shape }

const key = (s: Shape): string => s.name.replace(/^!!/, '');

/** Matches shapes across two slides: '!!name', then same name and kind, then same id, then same text. */
export const matchShapes = (a: Shape[], b: Shape[]): Pair[] => {
  const used = new Set<Shape>();
  const pairs: Pair[] = [];
  const take = (pred: (t: Shape) => boolean): Shape | undefined => { const hit = b.find((t) => !used.has(t) && pred(t)); if (hit) used.add(hit); return hit; };
  for (const s of a) {
    const to = (s.name.startsWith('!!') ? take((t) => key(t) === key(s)) : undefined)
      ?? take((t) => t.id === s.id && t.kind === s.kind)
      ?? take((t) => !!s.name && t.name === s.name && t.kind === s.kind && (s.kind !== 'shape' || t.kind !== 'shape' || textOf(s.text) === textOf((t as typeof s).text) || !!s.ph))
      ?? (s.kind === 'shape' && textOf(s.text).trim() ? take((t) => t.kind === 'shape' && textOf(t.text) === textOf(s.text)) : undefined);
    pairs.push(to ? { from: s, to } : { from: s });
  }
  for (const t of b) if (!used.has(t)) pairs.push({ to: t });
  return pairs;
};

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * Morph: matched shapes move and resize from their old box to the new one and cross-fade;
 * the rest fade. Works on two drawn slides (from below, to above).
 */
export const morphRun = (fromSvg: SVGSVGElement, toSvg: SVGSVGElement, fromSlide: Slide, toSlide: Slide): { frame: (p: number) => void; end: () => void } => {
  const pairs = matchShapes(fromSlide.shapes, toSlide.shapes);
  const wrapOf = (svg: SVGSVGElement, id: string) => svg.querySelector<SVGGElement>(`:scope > g > g[data-anim="${CSS.escape(id)}"]`);
  const toRest = [...toSvg.children].filter((c) => c.tagName !== 'defs' && !c.querySelector(':scope > g[data-anim]')) as SVGElement[];
  const bg = toSvg.style.background;
  toSvg.style.background = 'transparent';
  const items = pairs.map((p) => ({ p, fw: p.from ? wrapOf(fromSvg, p.from.id) : null, tw: p.to ? wrapOf(toSvg, p.to.id) : null }));
  const box = (s: Shape) => ({ x: s.x, y: s.y, w: Math.max(1, s.w), h: Math.max(1, s.h), r: s.rot ?? 0 });
  // Maps shape box `own` onto box `cur`: translate + scale (+ rotation delta about the centre).
  const mapTo = (own: ReturnType<typeof box>, cur: ReturnType<typeof box>): string => {
    const sx = cur.w / own.w, sy = cur.h / own.h;
    const dr = cur.r - own.r;
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    return `translate(${cx}px, ${cy}px) rotate(${dr}deg) translate(${-cx}px, ${-cy}px) translate(${cur.x}px, ${cur.y}px) scale(${sx}, ${sy}) translate(${-own.x}px, ${-own.y}px)`;
  };
  return {
    frame: (p) => {
      for (const el of toRest) el.style.opacity = String(p);
      for (const { p: pr, fw, tw } of items) {
        if (pr.from && pr.to && fw && tw) {
          const a = box(pr.from), b = box(pr.to);
          const cur = { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p), r: lerp(a.r, b.r, p) };
          fw.style.transformOrigin = '0 0'; tw.style.transformOrigin = '0 0'; fw.style.transformBox = 'view-box'; tw.style.transformBox = 'view-box';
          fw.style.transform = mapTo(a, cur);
          tw.style.transform = mapTo(b, cur);
          const same = pr.from.kind === 'shape' && pr.to.kind === 'shape' && JSON.stringify(pr.from.fill) === JSON.stringify(pr.to.fill) && textOf(pr.from.text) === textOf(pr.to.text);
          tw.style.opacity = same ? (p > 0 ? '1' : '0') : String(p);
          fw.style.opacity = same ? '1' : String(1 - p);
        } else if (fw) fw.style.opacity = String(Math.max(0, 1 - p * 2));
        else if (tw) tw.style.opacity = String(Math.max(0, p * 2 - 1));
      }
    },
    end: () => {
      for (const el of toRest) el.style.removeProperty('opacity');
      toSvg.style.background = bg;
      for (const { fw, tw } of items) for (const el of [fw, tw]) if (el) { el.style.removeProperty('transform-box'); el.style.removeProperty('transform'); el.style.removeProperty('opacity'); el.style.removeProperty('transform-origin'); }
    },
  };
};
