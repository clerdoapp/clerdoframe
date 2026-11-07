/**
 * Slide transitions. Each runs on two stacked layer elements (from below, to above unless the
 * effect says otherwise) by mutating styles once per frame, so nothing re-renders while it plays.
 * Effects that break a slide into pieces clone the layer into a grid of tiles.
 */
import type { TransitionName } from '../../model/deck';
import { rng } from './effects';

export interface TCtx {
  from: HTMLElement;
  to: HTMLElement;
  /** Holds both layers; tiles and helpers are added here. */
  root: HTMLElement;
  w: number;
  h: number;
  option: string;
  seed: number;
}
export interface TRun { frame: (p: number) => void; end: () => void }
export type TGroup = 'subtle' | 'exciting' | 'dynamic';
export interface TDef { id: TransitionName; label: string; group: TGroup; options?: [string, string][]; dur: number; run: (c: TCtx) => TRun; linear?: boolean }

const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v));
const easeIO = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number): number => t * t * t;
/** Local progress of a sub-interval [a, b] of the whole. */
const seg = (p: number, a: number, b: number): number => clamp((p - a) / (b - a));

const set = (el: HTMLElement, st: Partial<Record<string, string>>): void => { for (const [k, v] of Object.entries(st)) el.style.setProperty(k, v ?? ''); };
const PROPS = ['transform', 'opacity', 'clip-path', '-webkit-clip-path', 'mask-image', '-webkit-mask-image', 'z-index', 'visibility', 'transform-origin', 'filter', 'backface-visibility', 'box-shadow'];
const reset = (...els: HTMLElement[]): void => { for (const el of els) for (const k of PROPS) el.style.removeProperty(k); };
const clip = (el: HTMLElement, v: string): void => { el.style.setProperty('clip-path', v); el.style.setProperty('-webkit-clip-path', v); };
const mask = (el: HTMLElement, v: string): void => { el.style.setProperty('mask-image', v); el.style.setProperty('-webkit-mask-image', v); };

const dirVec = (o: string): [number, number] => (o === 'l' ? [-1, 0] : o === 'r' ? [1, 0] : o === 't' ? [0, -1] : o === 'b' ? [0, 1] : o === 'tl' ? [-1, -1] : o === 'tr' ? [1, -1] : o === 'bl' ? [-1, 1] : o === 'br' ? [1, 1] : [0, 1]);

const rectPath = (x0: number, y0: number, x1: number, y1: number): string => `M${x0.toFixed(1)} ${y0.toFixed(1)}H${x1.toFixed(1)}V${y1.toFixed(1)}H${x0.toFixed(1)}Z`;
const pathClip = (el: HTMLElement, d: string): void => clip(el, d ? `path('${d}')` : 'inset(50% 50% 50% 50%)');

const order = (n: number, seed: number): number[] => {
  const r = rng(seed);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
  const out = new Array<number>(n);
  idx.forEach((v, k) => { out[v] = k / n; });
  return out;
};

// ---------- Tiles ----------

interface Tile { el: HTMLElement; x: number; y: number; w: number; h: number; i: number; j: number; k: number }

/** Clones a layer into a cols x rows grid of tiles and hides the original. */
const tiles = (c: TCtx, layer: HTMLElement, cols: number, rows: number, z: number, shape?: (t: Tile) => string): { list: Tile[]; remove: () => void } => {
  const box = document.createElement('div');
  box.className = 'show-tiles';
  set(box, { 'z-index': String(z) });
  const tw = c.w / cols, th = c.h / rows;
  const list: Tile[] = [];
  const pad = shape ? 0.5 : 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const el = document.createElement('div');
      el.className = 'show-tile';
      const x = i * tw - (shape ? tw * pad : 0), y = j * th - (shape ? th * pad : 0);
      const w = tw * (1 + 2 * pad) + 0.6, h = th * (1 + 2 * pad) + 0.6;
      set(el, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      const inner = layer.cloneNode(true) as HTMLElement;
      inner.removeAttribute('id');
      reset(inner);
      set(inner, { left: `${-x}px`, top: `${-y}px`, width: `${c.w}px`, height: `${c.h}px`, position: 'absolute' });
      el.appendChild(inner);
      const t: Tile = { el, x, y, w, h, i, j, k: list.length };
      if (shape) clip(el, shape(t));
      box.appendChild(el);
      list.push(t);
    }
  }
  c.root.appendChild(box);
  layer.style.visibility = 'hidden';
  return { list, remove: () => { box.remove(); layer.style.removeProperty('visibility'); } };
};

// ---------- Helpers for common shapes of effect ----------

const toOnTop = (c: TCtx): void => { set(c.from, { 'z-index': '1' }); set(c.to, { 'z-index': '2' }); };
const fromOnTop = (c: TCtx): void => { set(c.from, { 'z-index': '2' }); set(c.to, { 'z-index': '1' }); };
const simple = (c: TCtx, frame: (p: number) => void, top: 'to' | 'from' = 'to', extra?: () => void): TRun => {
  if (top === 'to') toOnTop(c); else fromOnTop(c);
  return { frame, end: () => { extra?.(); reset(c.from, c.to); } };
};
const perspective = (c: TCtx, d = 1600): (() => void) => { c.root.style.perspective = `${d}px`; return () => c.root.style.removeProperty('perspective'); };

const overlayDiv = (c: TCtx, bg: string): HTMLElement => {
  const d = document.createElement('div');
  d.className = 'show-flash';
  d.style.background = bg;
  d.style.opacity = '0';
  c.root.appendChild(d);
  return d;
};

// ---------- The effects ----------

const fade = (c: TCtx): TRun => {
  if (c.option === 'black') {
    const d = overlayDiv(c, '#000');
    return simple(c, (p) => { d.style.opacity = String(p < 0.5 ? p * 2 : 2 - p * 2); c.to.style.opacity = p < 0.5 ? '0' : '1'; }, 'to', () => d.remove());
  }
  return simple(c, (p) => { c.to.style.opacity = String(p); });
};

const push = (c: TCtx): TRun => {
  const [dx, dy] = dirVec(c.option || 'b');
  return simple(c, (p) => {
    c.from.style.transform = `translate(${-dx * p * c.w}px, ${-dy * p * c.h}px)`;
    c.to.style.transform = `translate(${dx * (1 - p) * c.w}px, ${dy * (1 - p) * c.h}px)`;
  });
};

const wipe = (c: TCtx): TRun => {
  const o = c.option || 'r';
  const dir = o === 'l' ? 'to left' : o === 'r' ? 'to right' : o === 't' ? 'to top' : o === 'b' ? 'to bottom' : o === 'tl' ? 'to top left' : o === 'tr' ? 'to top right' : o === 'bl' ? 'to bottom left' : 'to bottom right';
  // o names where the wipe comes from; the gradient runs away from there.
  const from: Record<string, string> = { l: 'to right', r: 'to left', t: 'to bottom', b: 'to top', tl: 'to bottom right', tr: 'to bottom left', bl: 'to top right', br: 'to top left' };
  const g = from[o] ?? dir;
  return simple(c, (p) => {
    const a = p * 120 - 10;
    mask(c.to, `linear-gradient(${g}, #000 ${a}%, transparent ${a + 10}%)`);
  });
};

const split = (c: TCtx): TRun => {
  const o = c.option || 'vout';
  return simple(c, (p) => {
    const q = ((1 - p) * 50).toFixed(2), r = (p * 50).toFixed(2);
    if (o === 'vout') clip(c.to, `inset(0 ${q}% 0 ${q}%)`);
    else if (o === 'hout') clip(c.to, `inset(${q}% 0 ${q}% 0)`);
    else if (o === 'vin') clip(c.from, `inset(0 ${r}% 0 ${r}%)`);
    else clip(c.from, `inset(${r}% 0 ${r}% 0)`);
  }, o.endsWith('in') ? 'from' : 'to');
};

const reveal = (c: TCtx): TRun => {
  const [dx] = dirVec(c.option === 'r' ? 'r' : 'l');
  const black = overlayDiv(c, '#000');
  black.style.zIndex = '1';
  set(c.to, { 'z-index': '0' });
  set(c.from, { 'z-index': '2' });
  return {
    frame: (p) => {
      const a = seg(p, 0, 0.55), b = seg(p, 0.45, 1);
      c.from.style.transform = `translateX(${dx * a * c.w * 0.3}px)`;
      c.from.style.opacity = String(1 - a);
      black.style.opacity = String(1 - b);
      c.to.style.transform = `scale(${1.04 - 0.04 * b})`;
    },
    end: () => { black.remove(); reset(c.from, c.to); },
  };
};

const randomBars = (c: TCtx): TRun => {
  const n = 64;
  const ord = order(n, c.seed);
  const v = c.option === 'v';
  return simple(c, (p) => {
    let d = '';
    for (let i = 0; i < n; i++) if (ord[i]! < p) d += v ? rectPath((i / n) * c.w, 0, ((i + 1) / n) * c.w + 0.5, c.h) : rectPath(0, (i / n) * c.h, c.w, ((i + 1) / n) * c.h + 0.5);
    pathClip(c.to, d);
  });
};

const shapeT = (c: TCtx): TRun => {
  const [kind = 'circle', dir = 'out'] = (c.option || 'circle-out').split('-');
  const inn = dir === 'in';
  const target = inn ? c.from : c.to;
  return simple(c, (q) => {
    const p = inn ? 1 - q : q;
    const r = p * 75;
    if (kind === 'circle') clip(target, `circle(${r.toFixed(2)}% at 50% 50%)`);
    else if (kind === 'diamond') { const s = p * 100; clip(target, `polygon(50% ${50 - s}%, ${50 + s}% 50%, 50% ${50 + s}%, ${50 - s}% 50%)`); }
    else if (kind === 'plus') {
      const s = p * 75, t = p * 32;
      const A = 50 - s, B = 50 + s, C = 50 - t, D = 50 + t;
      clip(target, `polygon(${C}% ${A}%, ${D}% ${A}%, ${D}% ${C}%, ${B}% ${C}%, ${B}% ${D}%, ${D}% ${D}%, ${D}% ${B}%, ${C}% ${B}%, ${C}% ${D}%, ${A}% ${D}%, ${A}% ${C}%, ${C}% ${C}%)`);
    } else { const s = (1 - p) * 50; clip(target, `inset(${s}% ${s}% ${s}% ${s}%)`); }
  }, inn ? 'from' : 'to');
};

const uncover = (c: TCtx): TRun => {
  const [dx, dy] = dirVec(c.option || 'l');
  return simple(c, (p) => { c.from.style.transform = `translate(${dx * p * c.w}px, ${dy * p * c.h}px)`; c.from.style.boxShadow = '0 0 40px rgba(0,0,0,.4)'; }, 'from');
};

const cover = (c: TCtx): TRun => {
  const [dx, dy] = dirVec(c.option || 'r');
  return simple(c, (p) => { c.to.style.transform = `translate(${dx * (1 - p) * c.w}px, ${dy * (1 - p) * c.h}px)`; c.to.style.boxShadow = '0 0 40px rgba(0,0,0,.4)'; });
};

const flash = (c: TCtx): TRun => {
  const d = overlayDiv(c, '#fff');
  return simple(c, (p) => { d.style.opacity = String(Math.sin(Math.PI * p)); c.to.style.opacity = p < 0.5 ? '0' : '1'; }, 'to', () => d.remove());
};

const fallOver = (c: TCtx): TRun => {
  const undo = perspective(c, 1400);
  const s = c.option === 'r' ? 1 : -1;
  set(c.from, { 'transform-origin': `${s > 0 ? 100 : 0}% 100%` });
  return simple(c, (p) => {
    const e = easeIn(p);
    c.from.style.transform = `rotateX(${(-80 * e).toFixed(2)}deg) rotateZ(${(s * 12 * e).toFixed(2)}deg)`;
    c.from.style.opacity = String(1 - seg(p, 0.6, 1));
    c.to.style.filter = `brightness(${(0.5 + 0.5 * p).toFixed(3)})`;
  }, 'from', undo);
};

const drape = (c: TCtx): TRun => {
  const undo = perspective(c, 1200);
  const cols = 10;
  const t = tiles(c, c.from, cols, 1, 3);
  const left = c.option !== 'r';
  return simple(c, (p) => {
    for (const x of t.list) {
      const k = left ? x.i / cols : 1 - x.i / cols;
      const q = easeIn(seg(p, k * 0.4, 0.6 + k * 0.4));
      x.el.style.transformOrigin = '50% 0';
      x.el.style.transform = `translateY(${(q * c.h * 1.1).toFixed(1)}px) rotateX(${(-q * 70).toFixed(1)}deg) rotateZ(${((x.i % 2 ? 1 : -1) * q * 4).toFixed(2)}deg)`;
    }
  }, 'from', () => { t.remove(); undo(); });
};

const curtains = (c: TCtx): TRun => {
  const undo = perspective(c, 1400);
  const t = tiles(c, c.from, 2, 1, 3);
  return simple(c, (p) => {
    const e = easeIO(p);
    for (const x of t.list) {
      const s = x.i ? 1 : -1;
      x.el.style.transformOrigin = x.i ? '100% 50%' : '0% 50%';
      x.el.style.transform = `translateX(${(s * e * c.w * 0.5).toFixed(1)}px) rotateY(${(-s * e * 50).toFixed(1)}deg) scaleX(${(1 - 0.4 * e).toFixed(3)})`;
      x.el.style.opacity = String(1 - seg(p, 0.7, 1));
    }
    c.to.style.transform = `scale(${(0.92 + 0.08 * e).toFixed(4)})`;
  }, 'from', () => { t.remove(); undo(); });
};

const wind = (c: TCtx): TRun => {
  const cols = 12, rows = 8;
  const t = tiles(c, c.from, cols, rows, 3);
  const r = rng(c.seed);
  const jit = t.list.map(() => r());
  const right = c.option !== 'l';
  return simple(c, (p) => {
    for (const x of t.list) {
      const k = (right ? 1 - x.i / cols : x.i / cols) * 0.5 + jit[x.k]! * 0.2;
      const q = easeIn(seg(p, k * 0.8, k * 0.8 + 0.45));
      x.el.style.transform = `translate(${((right ? 1 : -1) * q * c.w * 1.3).toFixed(1)}px, ${(-q * c.h * 0.25 * jit[x.k]!).toFixed(1)}px) rotate(${((right ? 1 : -1) * q * 120 * jit[x.k]!).toFixed(1)}deg) scale(${(1 - q * 0.5).toFixed(3)})`;
      x.el.style.opacity = String(1 - q);
    }
  }, 'from', t.remove);
};

const prestige = (c: TCtx): TRun => {
  const undo = perspective(c, 1600);
  set(c.from, { 'transform-origin': '50% 100%' });
  set(c.to, { 'transform-origin': '50% 0%' });
  return simple(c, (p) => {
    const a = easeIn(seg(p, 0, 0.6)), b = easeOut(seg(p, 0.4, 1));
    c.from.style.transform = `translateZ(${-a * 400}px) rotateX(${a * 60}deg)`;
    c.from.style.opacity = String(1 - a);
    c.to.style.transform = `translateZ(${(1 - b) * -300}px) rotateX(${(1 - b) * -40}deg)`;
    c.to.style.opacity = String(b);
  }, 'to', undo);
};

const fracture = (c: TCtx): TRun => {
  const undo = perspective(c, 1400);
  const t = tiles(c, c.from, 10, 6, 3);
  const r = rng(c.seed);
  const v = t.list.map(() => [r() - 0.5, r(), r() - 0.5, r()] as const);
  return simple(c, (p) => {
    for (const x of t.list) {
      const [a, b, d, k] = v[x.k]!;
      const q = seg(p, k * 0.35, 0.65 + k * 0.35);
      const g = q * q;
      x.el.style.transform = `translate3d(${(a * q * c.w * 0.4).toFixed(1)}px, ${(g * c.h * (1 + b)).toFixed(1)}px, ${(q * 300 * b).toFixed(1)}px) rotate3d(${a.toFixed(2)}, ${d.toFixed(2)}, 1, ${(q * 220 * (b + 0.3)).toFixed(1)}deg)`;
      x.el.style.opacity = String(1 - seg(q, 0.6, 1));
    }
  }, 'from', () => { t.remove(); undo(); });
};

const crush = (c: TCtx): TRun => {
  const t = tiles(c, c.from, 8, 6, 3);
  const r = rng(c.seed);
  const v = t.list.map(() => [r() - 0.5, r() - 0.5, r()] as const);
  set(c.to, { opacity: '0' });
  return simple(c, (p) => {
    const a = easeIn(seg(p, 0, 0.6));
    for (const x of t.list) {
      const [jx, jy, jr] = v[x.k]!;
      const cx = c.w / 2 - (x.x + x.w / 2), cy = c.h / 2 - (x.y + x.h / 2);
      x.el.style.transform = `translate(${(cx * a + jx * 30 * a).toFixed(1)}px, ${(cy * a + jy * 30 * a).toFixed(1)}px) rotate(${(jr * 300 * a).toFixed(1)}deg) scale(${(1 - a * 0.85).toFixed(3)})`;
      x.el.style.opacity = String(1 - seg(p, 0.45, 0.65));
    }
    const b = easeOut(seg(p, 0.5, 1));
    c.to.style.opacity = String(b);
    c.to.style.transform = `scale(${(0.3 + 0.7 * b).toFixed(4)})`;
  }, 'from', t.remove);
};

const peel = (curl: boolean) => (c: TCtx): TRun => {
  const undo = perspective(c, 2200);
  const right = c.option !== 'l';
  set(c.from, { 'transform-origin': right ? '0% 0%' : '100% 0%' });
  return simple(c, (p) => {
    const e = easeIO(p);
    const s = right ? -1 : 1;
    c.from.style.transform = curl
      ? `rotateY(${(s * -e * 120).toFixed(1)}deg) skewY(${(s * e * 6).toFixed(2)}deg)`
      : `rotate3d(1, ${s}, 0, ${(-e * 130).toFixed(1)}deg)`;
    c.from.style.boxShadow = `0 0 ${Math.round(60 * e)}px rgba(0,0,0,${(0.5 * e).toFixed(2)})`;
    c.from.style.filter = `brightness(${(1 - 0.35 * e).toFixed(3)})`;
    c.from.style.opacity = String(1 - seg(p, 0.75, 1));
  }, 'from', undo);
};

const airplane = (c: TCtx): TRun => {
  const undo = perspective(c, 1600);
  const left = c.option === 'l';
  return simple(c, (p) => {
    const a = easeIO(seg(p, 0, 0.45)), b = easeIn(seg(p, 0.4, 1));
    c.from.style.transform = `translate(${((left ? -1 : 1) * b * c.w * 1.2).toFixed(1)}px, ${(-b * c.h * 0.8).toFixed(1)}px) rotate(${((left ? 1 : -1) * b * 25).toFixed(1)}deg) scale(${(1 - a * 0.55).toFixed(3)}, ${(1 - a * 0.8).toFixed(3)}) rotateX(${a * 50}deg)`;
    c.to.style.opacity = String(seg(p, 0.2, 0.7));
  }, 'from', undo);
};

const origami = (c: TCtx): TRun => {
  const undo = perspective(c, 1600);
  const t = tiles(c, c.from, 2, 2, 3);
  return simple(c, (p) => {
    const a = easeIO(seg(p, 0, 0.5)), b = easeIn(seg(p, 0.45, 1));
    for (const x of t.list) {
      x.el.style.transformOrigin = `${x.i ? 0 : 100}% ${x.j ? 0 : 100}%`;
      const fold = x.j ? `rotateX(${(a * 170).toFixed(1)}deg)` : '';
      const fold2 = x.i ? `rotateY(${(-b * 170).toFixed(1)}deg)` : '';
      x.el.style.transform = `translateY(${(-b * c.h * 0.6).toFixed(1)}px) ${fold} ${fold2} scale(${(1 - b * 0.6).toFixed(3)})`;
      x.el.style.opacity = String(1 - seg(p, 0.75, 1));
    }
    c.to.style.opacity = String(seg(p, 0.3, 0.8));
  }, 'from', () => { t.remove(); undo(); });
};

const dissolve = (c: TCtx): TRun => {
  const cols = 32, rows = 18;
  const ord = order(cols * rows, c.seed);
  const tw = c.w / cols, th = c.h / rows;
  return simple(c, (p) => {
    let d = '';
    for (let j = 0; j < rows; j++) {
      let run = -1;
      for (let i = 0; i <= cols; i++) {
        const on = i < cols && ord[j * cols + i]! < p;
        if (on && run < 0) run = i;
        if (!on && run >= 0) { d += rectPath(run * tw, j * th, i * tw + 0.5, (j + 1) * th + 0.5); run = -1; }
      }
    }
    pathClip(c.to, d);
  }, 'to');
};

const checkerboard = (c: TCtx): TRun => {
  const n = 10;
  const down = c.option === 't' || c.option === 'b' || c.option === 'v';
  const rev = c.option === 'l' || c.option === 't';
  return simple(c, (p) => {
    let d = '';
    const cw = c.w / n, ch = c.h / n;
    for (let row = 0; row < n; row++) {
      for (let k = 0; k < n; k++) {
        const off = (row % 2) * 0.5;
        const f = clamp(p * (n + 0.5) - k - off);
        if (f <= 0) continue;
        const kk = rev ? n - 1 - k : k;
        if (down) {
          const y0 = rev ? (kk + 1 - f) * ch : kk * ch;
          d += rectPath(row * cw, y0, (row + 1) * cw + 0.5, y0 + f * ch + 0.5);
        } else {
          const x0 = rev ? (kk + 1 - f) * cw : kk * cw;
          d += rectPath(x0, row * ch, x0 + f * cw + 0.5, (row + 1) * ch + 0.5);
        }
      }
    }
    pathClip(c.to, d);
  });
};

const blinds = (c: TCtx): TRun => {
  const n = 8;
  const v = c.option === 'v';
  return simple(c, (p) => {
    let d = '';
    for (let i = 0; i < n; i++) {
      if (v) { const x = (i / n) * c.w; d += rectPath(x, 0, x + (p * c.w) / n + 0.5, c.h); }
      else { const y = (i / n) * c.h; d += rectPath(0, y, c.w, y + (p * c.h) / n + 0.5); }
    }
    pathClip(c.to, d);
  });
};

const clock = (c: TCtx): TRun => {
  const o = c.option || 'cw';
  const R = Math.hypot(c.w, c.h);
  const cx = c.w / 2, cy = c.h / 2;
  const wedge = (a0: number, a1: number): string => {
    if (a1 - a0 <= 0) return '';
    const pts: string[] = [`M${cx} ${cy}`];
    const n = Math.max(2, Math.ceil((a1 - a0) / 5));
    for (let i = 0; i <= n; i++) { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; pts.push(`L${(cx + Math.sin(a) * R).toFixed(1)} ${(cy - Math.cos(a) * R).toFixed(1)}`); }
    return `${pts.join(' ')}Z`;
  };
  return simple(c, (p) => {
    const a = p * 360;
    pathClip(c.to, o === 'ccw' ? wedge(-a, 0) : o === 'wedge' ? wedge(-a / 2, a / 2) : wedge(0, a));
  }, 'to');
};

const ripple = (c: TCtx): TRun => {
  const at = c.option === 'tl' ? '0% 0%' : c.option === 'tr' ? '100% 0%' : c.option === 'bl' ? '0% 100%' : c.option === 'br' ? '100% 100%' : '50% 50%';
  return simple(c, (p) => {
    const r = p * 120;
    mask(c.to, `radial-gradient(circle at ${at}, #000 ${Math.max(0, r - 12)}%, rgba(0,0,0,.6) ${Math.max(0, r - 6)}%, #000 ${Math.max(0, r - 3)}%, transparent ${r}%)`);
    c.to.style.transform = `scale(${(1 + 0.05 * Math.sin(p * Math.PI)).toFixed(4)})`;
    c.from.style.transform = `scale(${(1 - 0.03 * p).toFixed(4)})`;
  });
};

const hexClip = (): string => 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)';
const honeycomb = (c: TCtx): TRun => {
  const cols = 10, rows = 6;
  const t = tiles(c, c.to, cols, rows, 3, hexClip);
  const ord = order(cols * rows, c.seed);
  set(c.from, { 'z-index': '1' });
  return {
    frame: (p) => {
      for (const x of t.list) {
        const q = easeOut(seg(p, ord[x.k]! * 0.6, ord[x.k]! * 0.6 + 0.4));
        x.el.style.transform = `translateY(${x.i % 2 ? '0' : '0'}) scale(${(q * 1.02).toFixed(3)}) rotate(${((1 - q) * 60).toFixed(1)}deg)`;
        x.el.style.opacity = String(q);
      }
      c.from.style.filter = `brightness(${(1 - 0.3 * p).toFixed(3)})`;
      if (p >= 1) { t.remove(); }
    },
    end: () => { t.remove(); reset(c.from, c.to); },
  };
};

const glitter = (c: TCtx): TRun => {
  const undo = perspective(c, 1200);
  const cols = 16, rows = 9;
  const t = tiles(c, c.to, cols, rows, 3);
  const r = rng(c.seed);
  const k = t.list.map(() => r());
  const right = c.option !== 'l';
  return {
    frame: (p) => {
      for (const x of t.list) {
        const pos = (right ? x.i / cols : 1 - x.i / cols) * 0.55 + k[x.k]! * 0.25;
        const q = easeOut(seg(p, pos * 0.8, pos * 0.8 + 0.3));
        x.el.style.transform = `rotateY(${((1 - q) * 180).toFixed(1)}deg) scale(${(0.6 + 0.4 * q).toFixed(3)})`;
        x.el.style.opacity = String(q);
        x.el.style.filter = `brightness(${(1 + (1 - q) * 1.5).toFixed(2)})`;
      }
      c.from.style.opacity = String(1 - seg(p, 0.4, 1));
    },
    end: () => { t.remove(); undo(); reset(c.from, c.to); },
  };
};

const vortex = (c: TCtx): TRun => {
  const t = tiles(c, c.from, 12, 8, 3);
  const r = rng(c.seed);
  const k = t.list.map(() => r());
  const s = c.option === 'r' || c.option === 'b' ? 1 : -1;
  return simple(c, (p) => {
    for (const x of t.list) {
      const dx = x.x + x.w / 2 - c.w / 2, dy = x.y + x.h / 2 - c.h / 2;
      const dist = Math.hypot(dx, dy) / Math.hypot(c.w / 2, c.h / 2);
      const q = easeIn(seg(p, (1 - dist) * 0.3 + k[x.k]! * 0.25, (1 - dist) * 0.3 + k[x.k]! * 0.25 + 0.5));
      const a = q * Math.PI * 1.5 * s;
      const rr = 1 + q * 1.5;
      const nx = dx * Math.cos(a) * rr - dy * Math.sin(a) * rr - dx, ny = dx * Math.sin(a) * rr + dy * Math.cos(a) * rr - dy;
      x.el.style.transform = `translate(${nx.toFixed(1)}px, ${ny.toFixed(1)}px) rotate(${(a * 120).toFixed(1)}deg) scale(${(1 - q * 0.7).toFixed(3)})`;
      x.el.style.opacity = String(1 - q);
    }
    c.to.style.opacity = String(seg(p, 0.3, 1));
  }, 'from', t.remove);
};

const shred = (c: TCtx): TRun => {
  const cols = c.option === 'particles' ? 24 : 18;
  const rows = c.option === 'particles' ? 12 : 1;
  const t = tiles(c, c.from, cols, rows, 3);
  const r = rng(c.seed);
  const k = t.list.map(() => r());
  return simple(c, (p) => {
    for (const x of t.list) {
      const q = easeIn(seg(p, k[x.k]! * 0.35, k[x.k]! * 0.35 + 0.65));
      const dir = x.i % 2 ? 1 : -1;
      x.el.style.transform = `translateY(${(dir * q * c.h * 1.1).toFixed(1)}px) rotate(${(dir * q * 8).toFixed(2)}deg)`;
      x.el.style.opacity = String(1 - seg(q, 0.7, 1));
    }
    c.to.style.filter = `brightness(${(0.6 + 0.4 * p).toFixed(3)})`;
  }, 'from', t.remove);
};

/** Two slides swapping places in depth (switch, gallery, conveyor, rotate, orbit). */
const swap3d = (kind: 'switch' | 'gallery' | 'conveyor' | 'rotate' | 'orbit') => (c: TCtx): TRun => {
  const undo = perspective(c, 1800);
  const s = c.option === 'l' ? -1 : 1;
  return {
    frame: (p) => {
      const e = easeIO(p);
      const W = c.w;
      let f = '', t = '';
      if (kind === 'switch') {
        const k = Math.sin(e * Math.PI);
        f = `translateX(${(-s * k * W * 0.55).toFixed(1)}px) translateZ(${(-e * 500).toFixed(1)}px) rotateY(${(s * k * 35).toFixed(1)}deg)`;
        t = `translateX(${(s * k * W * 0.55).toFixed(1)}px) translateZ(${(-(1 - e) * 500).toFixed(1)}px) rotateY(${(-s * k * 35).toFixed(1)}deg)`;
        c.from.style.zIndex = e < 0.5 ? '2' : '1';
        c.to.style.zIndex = e < 0.5 ? '1' : '2';
      } else if (kind === 'gallery') {
        f = `translateX(${(-s * e * W * 1.1).toFixed(1)}px) translateZ(${(-Math.sin(e * Math.PI) * 300).toFixed(1)}px) rotateY(${(s * e * 40).toFixed(1)}deg)`;
        t = `translateX(${(s * (1 - e) * W * 1.1).toFixed(1)}px) translateZ(${(-Math.sin(e * Math.PI) * 300).toFixed(1)}px) rotateY(${(-s * (1 - e) * 40).toFixed(1)}deg)`;
      } else if (kind === 'conveyor') {
        f = `translateX(${(-s * e * W * 1.05).toFixed(1)}px) translateZ(${(-150 * Math.sin(e * Math.PI)).toFixed(1)}px) rotateY(${(s * 25 * e).toFixed(1)}deg)`;
        t = `translateX(${(s * (1 - e) * W * 1.05).toFixed(1)}px) translateZ(${(-150 * Math.sin(e * Math.PI)).toFixed(1)}px) rotateY(${(-s * 25 * (1 - e)).toFixed(1)}deg)`;
      } else if (kind === 'rotate') {
        f = `translateZ(${-W / 2}px) rotateY(${(-s * e * 90).toFixed(1)}deg) translateZ(${W / 2}px)`;
        t = `translateZ(${-W / 2}px) rotateY(${(s * (1 - e) * 90).toFixed(1)}deg) translateZ(${W / 2}px)`;
      } else {
        f = `translateZ(${(-e * 900).toFixed(1)}px) translateX(${(-s * e * W * 0.9).toFixed(1)}px) rotateY(${(s * e * 70).toFixed(1)}deg)`;
        t = `translateZ(${(-(1 - e) * 900).toFixed(1)}px) translateX(${(s * (1 - e) * W * 0.9).toFixed(1)}px) rotateY(${(-s * (1 - e) * 70).toFixed(1)}deg)`;
      }
      c.from.style.transform = f;
      c.to.style.transform = t;
      c.from.style.backfaceVisibility = c.to.style.backfaceVisibility = 'hidden';
      if (kind === 'orbit' || kind === 'switch') { c.from.style.filter = `brightness(${(1 - 0.4 * e).toFixed(3)})`; c.to.style.filter = `brightness(${(0.6 + 0.4 * e).toFixed(3)})`; }
    },
    end: () => { undo(); reset(c.from, c.to); },
  };
};

const flip = (c: TCtx): TRun => {
  const undo = perspective(c, 1800);
  const s = c.option === 'l' ? -1 : 1;
  toOnTop(c);
  return {
    frame: (p) => {
      const e = easeIO(p);
      const z = -Math.sin(e * Math.PI) * 400;
      c.from.style.transform = `translateZ(${z.toFixed(1)}px) rotateY(${(s * e * 180).toFixed(1)}deg)`;
      c.to.style.transform = `translateZ(${z.toFixed(1)}px) rotateY(${(s * (e * 180 - 180)).toFixed(1)}deg)`;
      c.from.style.backfaceVisibility = c.to.style.backfaceVisibility = 'hidden';
    },
    end: () => { undo(); reset(c.from, c.to); },
  };
};

const cube = (inward: boolean) => (c: TCtx): TRun => {
  const undo = perspective(c, 2000);
  const o = c.option || 'r';
  const vertical = o === 't' || o === 'b';
  const s = o === 'l' || o === 't' ? -1 : 1;
  const half = (vertical ? c.h : c.w) / 2;
  const axis = vertical ? 'rotateX' : 'rotateY';
  const sign = vertical ? -1 : 1;
  const zf = inward ? half : -half;
  return {
    frame: (p) => {
      const e = easeIO(p);
      c.from.style.transform = `translateZ(${zf}px) ${axis}(${(sign * -s * e * 90 * (inward ? -1 : 1)).toFixed(2)}deg) translateZ(${-zf}px)`;
      c.to.style.transform = `translateZ(${zf}px) ${axis}(${(sign * s * (1 - e) * 90 * (inward ? -1 : 1)).toFixed(2)}deg) translateZ(${-zf}px)`;
      c.from.style.filter = `brightness(${(1 - 0.5 * e).toFixed(3)})`;
      c.to.style.filter = `brightness(${(0.5 + 0.5 * e).toFixed(3)})`;
      c.from.style.backfaceVisibility = c.to.style.backfaceVisibility = 'hidden';
    },
    end: () => { undo(); reset(c.from, c.to); },
  };
};

const doors = (windowStyle: boolean) => (c: TCtx): TRun => {
  const undo = perspective(c, 1400);
  const vertical = c.option === 'h';
  const t = tiles(c, c.from, vertical ? 1 : 2, vertical ? 2 : 1, 3);
  return simple(c, (p) => {
    const e = easeIO(p);
    for (const x of t.list) {
      const first = vertical ? x.j === 0 : x.i === 0;
      if (vertical) { x.el.style.transformOrigin = first ? '50% 0%' : '50% 100%'; x.el.style.transform = `rotateX(${((first ? 1 : -1) * e * 100).toFixed(1)}deg)${windowStyle ? ` translateZ(${(e * 200).toFixed(1)}px)` : ''}`; }
      else { x.el.style.transformOrigin = first ? '0% 50%' : '100% 50%'; x.el.style.transform = `rotateY(${((first ? -1 : 1) * e * 100).toFixed(1)}deg)${windowStyle ? ` translateZ(${(e * 200).toFixed(1)}px)` : ''}`; }
      x.el.style.opacity = String(1 - seg(p, 0.7, 1));
    }
    const k = windowStyle ? 0.5 : 0.85;
    c.to.style.transform = `scale(${(k + (1 - k) * e).toFixed(4)})`;
    c.to.style.filter = `brightness(${(0.5 + 0.5 * e).toFixed(3)})`;
  }, 'from', () => { t.remove(); undo(); });
};

const comb = (c: TCtx): TRun => {
  const v = c.option === 'v';
  const n = 10;
  const t = tiles(c, c.to, v ? n : 1, v ? 1 : n, 3);
  return {
    frame: (p) => {
      const e = easeIO(p);
      for (const x of t.list) {
        const s = (v ? x.i : x.j) % 2 ? 1 : -1;
        x.el.style.transform = v ? `translateY(${(s * (1 - e) * c.h).toFixed(1)}px)` : `translateX(${(s * (1 - e) * c.w).toFixed(1)}px)`;
      }
    },
    end: () => { t.remove(); reset(c.from, c.to); },
  };
};

const zoomT = (c: TCtx): TRun => {
  const o = c.option || 'in';
  if (o === 'out') return simple(c, (p) => { const e = easeIO(p); c.from.style.transform = `scale(${(1 + e * 1.5).toFixed(4)})`; c.from.style.opacity = String(1 - e); }, 'from');
  const rot = o === 'rotate';
  return simple(c, (p) => {
    const e = easeOut(p);
    c.to.style.transform = `scale(${(0.2 + 0.8 * e).toFixed(4)})${rot ? ` rotate(${((1 - e) * -360).toFixed(1)}deg)` : ''}`;
    c.to.style.opacity = String(seg(p, 0, 0.6));
  });
};

const pan = (c: TCtx): TRun => {
  const [dx, dy] = dirVec(c.option || 'b');
  return simple(c, (p) => {
    const e = easeIO(p);
    const z = 1 - 0.12 * Math.sin(e * Math.PI);
    c.from.style.transform = `scale(${z.toFixed(4)}) translate(${(-dx * e * c.w * 1.05).toFixed(1)}px, ${(-dy * e * c.h * 1.05).toFixed(1)}px)`;
    c.to.style.transform = `scale(${z.toFixed(4)}) translate(${(dx * (1 - e) * c.w * 1.05).toFixed(1)}px, ${(dy * (1 - e) * c.h * 1.05).toFixed(1)}px)`;
  });
};

const ferris = (c: TCtx): TRun => {
  const s = c.option === 'r' ? -1 : 1;
  const R = c.h * 2.2;
  const origin = `50% ${(50 + (R / c.h) * 100).toFixed(1)}%`;
  set(c.from, { 'transform-origin': origin });
  set(c.to, { 'transform-origin': origin });
  const deg = (Math.asin(Math.min(1, c.w / R)) * 180) / Math.PI * 1.15;
  return simple(c, (p) => {
    const e = easeIO(p);
    c.from.style.transform = `rotate(${(-s * e * deg).toFixed(2)}deg)`;
    c.to.style.transform = `rotate(${(s * (1 - e) * deg).toFixed(2)}deg)`;
  });
};

const flythrough = (c: TCtx): TRun => {
  const o = c.option || 'in';
  const out = o === 'out';
  const bounce = o === 'bounce';
  return simple(c, (p) => {
    const e = easeIO(p);
    c.from.style.transform = `scale(${(out ? 1 - 0.6 * e : 1 + 1.2 * e).toFixed(4)})`;
    c.from.style.opacity = String(1 - seg(p, 0, 0.6));
    let s = out ? 2.2 - 1.2 * e : 0.4 + 0.6 * e;
    if (bounce && p > 0.6) s = 1 + 0.06 * Math.sin(seg(p, 0.6, 1) * Math.PI * 2) * (1 - p);
    c.to.style.transform = `scale(${s.toFixed(4)})`;
    c.to.style.opacity = String(seg(p, 0.3, 0.9));
  }, out ? 'to' : 'to');
};

const none = (c: TCtx): TRun => ({ frame: () => undefined, end: () => reset(c.from, c.to) });

// ---------- Catalogue ----------

const D4: [string, string][] = [['b', 'From bottom'], ['l', 'From left'], ['r', 'From right'], ['t', 'From top']];
const D8: [string, string][] = [...D4, ['br', 'From bottom right'], ['tr', 'From top right'], ['bl', 'From bottom left'], ['tl', 'From top left']];
const LR: [string, string][] = [['r', 'From right'], ['l', 'From left']];
const HV: [string, string][] = [['h', 'Horizontal'], ['v', 'Vertical']];

export const TRANSITIONS: TDef[] = [
  { id: 'none', label: 'None', group: 'subtle', dur: 0, run: none },
  { id: 'morph', label: 'Morph', group: 'subtle', dur: 2, options: [['objects', 'Objects'], ['words', 'Words'], ['letters', 'Characters']], run: fade },
  { id: 'fade', label: 'Fade', group: 'subtle', dur: 0.7, options: [['smooth', 'Smoothly'], ['black', 'Through black']], run: fade },
  { id: 'push', label: 'Push', group: 'subtle', dur: 1, options: D4, run: push },
  { id: 'wipe', label: 'Wipe', group: 'subtle', dur: 1, options: D8, run: wipe },
  { id: 'split', label: 'Split', group: 'subtle', dur: 1.5, options: [['vout', 'Vertical out'], ['vin', 'Vertical in'], ['hout', 'Horizontal out'], ['hin', 'Horizontal in']], run: split },
  { id: 'reveal', label: 'Reveal', group: 'subtle', dur: 1.6, options: [['l', 'Smoothly from left'], ['r', 'Smoothly from right']], run: reveal },
  { id: 'randomBars', label: 'Random bars', group: 'subtle', dur: 1, options: HV, run: randomBars },
  { id: 'shape', label: 'Shape', group: 'subtle', dur: 1.5, options: [['circle-out', 'Circle'], ['diamond-out', 'Diamond'], ['plus-out', 'Plus'], ['box-out', 'Out'], ['box-in', 'In']], run: shapeT },
  { id: 'uncover', label: 'Uncover', group: 'subtle', dur: 1, options: D8, run: uncover },
  { id: 'cover', label: 'Cover', group: 'subtle', dur: 1, options: D8, run: cover },
  { id: 'flash', label: 'Flash', group: 'subtle', dur: 0.8, run: flash },
  { id: 'fallOver', label: 'Fall over', group: 'exciting', dur: 2, options: [['l', 'Left'], ['r', 'Right']], run: fallOver },
  { id: 'drape', label: 'Drape', group: 'exciting', dur: 2, options: [['l', 'Left'], ['r', 'Right']], run: drape },
  { id: 'curtains', label: 'Curtains', group: 'exciting', dur: 2.5, run: curtains },
  { id: 'wind', label: 'Wind', group: 'exciting', dur: 2, options: [['r', 'Right'], ['l', 'Left']], run: wind },
  { id: 'prestige', label: 'Prestige', group: 'exciting', dur: 2, run: prestige },
  { id: 'fracture', label: 'Fracture', group: 'exciting', dur: 2, run: fracture },
  { id: 'crush', label: 'Crush', group: 'exciting', dur: 2, run: crush },
  { id: 'peelOff', label: 'Peel off', group: 'exciting', dur: 1.5, options: [['r', 'Right'], ['l', 'Left']], run: peel(false) },
  { id: 'pageCurl', label: 'Page curl', group: 'exciting', dur: 1.5, options: [['r', 'Single right'], ['l', 'Single left']], run: peel(true) },
  { id: 'airplane', label: 'Airplane', group: 'exciting', dur: 2, options: [['r', 'Right'], ['l', 'Left']], run: airplane },
  { id: 'origami', label: 'Origami', group: 'exciting', dur: 2, run: origami },
  { id: 'dissolve', label: 'Dissolve', group: 'exciting', dur: 1.2, run: dissolve, linear: true },
  { id: 'checkerboard', label: 'Checkerboard', group: 'exciting', dur: 1.5, options: [['l', 'From left'], ['t', 'From top']], run: checkerboard, linear: true },
  { id: 'blinds', label: 'Blinds', group: 'exciting', dur: 1.5, options: HV, run: blinds },
  { id: 'clock', label: 'Clock', group: 'exciting', dur: 2, options: [['cw', 'Clockwise'], ['ccw', 'Counterclockwise'], ['wedge', 'Wedge']], run: clock },
  { id: 'ripple', label: 'Ripple', group: 'exciting', dur: 1.4, options: [['c', 'Center'], ['tl', 'From top left'], ['tr', 'From top right'], ['bl', 'From bottom left'], ['br', 'From bottom right']], run: ripple },
  { id: 'honeycomb', label: 'Honeycomb', group: 'exciting', dur: 2.5, run: honeycomb, linear: true },
  { id: 'glitter', label: 'Glitter', group: 'exciting', dur: 2.5, options: [['r', 'From right'], ['l', 'From left']], run: glitter, linear: true },
  { id: 'vortex', label: 'Vortex', group: 'exciting', dur: 3, options: D4, run: vortex, linear: true },
  { id: 'shred', label: 'Shred', group: 'exciting', dur: 2.5, options: [['strips', 'Strips'], ['particles', 'Particles']], run: shred, linear: true },
  { id: 'switch', label: 'Switch', group: 'exciting', dur: 1.5, options: LR, run: swap3d('switch') },
  { id: 'flip', label: 'Flip', group: 'exciting', dur: 1.2, options: LR, run: flip },
  { id: 'gallery', label: 'Gallery', group: 'exciting', dur: 1.6, options: LR, run: swap3d('gallery') },
  { id: 'cube', label: 'Cube', group: 'exciting', dur: 1.4, options: D4, run: cube(false) },
  { id: 'doors', label: 'Doors', group: 'exciting', dur: 1.4, options: [['v', 'Vertical'], ['h', 'Horizontal']], run: doors(false) },
  { id: 'box', label: 'Box', group: 'exciting', dur: 1.6, options: D4, run: cube(true) },
  { id: 'comb', label: 'Comb', group: 'exciting', dur: 1, options: HV, run: comb },
  { id: 'zoom', label: 'Zoom', group: 'exciting', dur: 1, options: [['in', 'In'], ['out', 'Out'], ['rotate', 'Zoom and rotate']], run: zoomT },
  { id: 'random', label: 'Random', group: 'exciting', dur: 1.5, run: none },
  { id: 'pan', label: 'Pan', group: 'dynamic', dur: 1, options: D4, run: pan },
  { id: 'ferris', label: 'Ferris wheel', group: 'dynamic', dur: 2, options: [['l', 'From left'], ['r', 'From right']], run: ferris },
  { id: 'conveyor', label: 'Conveyor', group: 'dynamic', dur: 1.4, options: LR, run: swap3d('conveyor') },
  { id: 'rotate', label: 'Rotate', group: 'dynamic', dur: 1.4, options: LR, run: swap3d('rotate') },
  { id: 'window', label: 'Window', group: 'dynamic', dur: 1.4, options: [['v', 'Vertical'], ['h', 'Horizontal']], run: doors(true) },
  { id: 'orbit', label: 'Orbit', group: 'dynamic', dur: 1.6, options: LR, run: swap3d('orbit') },
  { id: 'flythrough', label: 'Fly through', group: 'dynamic', dur: 1, options: [['in', 'In'], ['out', 'Out'], ['bounce', 'In with bounce']], run: flythrough },
];

export const transitionDef = (id: string | undefined): TDef | undefined => TRANSITIONS.find((t) => t.id === id);
export const GROUP_LABEL: Record<TGroup, string> = { subtle: 'Subtle', exciting: 'Exciting', dynamic: 'Dynamic content' };

const RANDOM_POOL = TRANSITIONS.filter((t) => t.id !== 'none' && t.id !== 'random' && t.id !== 'morph');

/** The effect actually played (random picks one, seeded). */
export const resolveTransition = (id: string | undefined, option: string | undefined, seed: number): { def: TDef; option: string } => {
  const d = transitionDef(id) ?? TRANSITIONS[0]!;
  if (d.id === 'random') {
    const r = rng(seed);
    const pick = RANDOM_POOL[Math.floor(r() * RANDOM_POOL.length)]!;
    const opt = pick.options ? pick.options[Math.floor(r() * pick.options.length)]![0] : '';
    return { def: pick, option: opt };
  }
  return { def: d, option: option ?? d.options?.[0]?.[0] ?? '' };
};

/** Plays a transition with requestAnimationFrame. Resolves when done or cancelled. */
export const play = (def: TDef, c: TCtx, seconds: number, onFrame?: (p: number) => void): { cancel: () => void; done: Promise<void> } => {
  const r = def.run(c);
  let raf = 0;
  let stopped = false;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((res) => { resolveDone = res; });
  const finish = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); r.end(); resolveDone(); };
  const ms = Math.max(0, seconds * 1000);
  if (ms === 0) { r.frame(1); finish(); return { cancel: finish, done }; }
  const t0 = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    const t = clamp((now - t0) / ms);
    const p = def.linear ? t : easeIO(t);
    r.frame(p);
    onFrame?.(p);
    if (t >= 1) finish(); else raf = requestAnimationFrame(tick);
  };
  r.frame(0);
  raf = requestAnimationFrame(tick);
  return { cancel: finish, done };
};
