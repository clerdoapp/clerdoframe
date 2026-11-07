/**
 * Animation timeline engine. Pure: builds click groups from a slide's animations and computes how
 * every animated target (a shape, or a paragraph / word / letter of its text) looks at a moment.
 *
 * Targets: 'shapeId' for the whole shape, 'shapeId#shape' for a shape's own drawing when its text
 * animates separately, and 'shapeId#p3' / '#w3' / '#l3' for text units.
 */
import type { Animation } from '../../model/deck';
import { bounceOut, effectDef, evalEffect, hash, presetPath, type Box, type Fx } from './effects';
import { pointAt } from './pathgeom';

export interface TItem {
  anim: Animation;
  target: string;
  /** Seconds from the start of its step. */
  start: number;
  dur: number;
  /** Time including repeats; Infinity for "until next click" / "until end of slide". */
  total: number;
  /** Order in which items compose (slide order). */
  seq: number;
  /** Start before this item's own delay ("with previous" items share it). */
  base: number;
}

export interface TStep {
  items: TItem[];
  /** Seconds until every finite item is done. */
  length: number;
  /** Plays without a click (first group on a slide that starts with "with" / "after"). */
  auto: boolean;
}

export interface Timeline {
  main: TStep[];
  /** Click sequences started by clicking a shape. */
  triggers: Record<string, TStep[]>;
  /** Every item, in compose order. */
  items: TItem[];
  /** Targets hidden before anything plays. */
  hidden: Set<string>;
  /** Shapes whose text animates by unit, with the unit kind used. */
  split: Record<string, 'para' | 'word' | 'letter'>;
}

/** Number of text units of a shape: paragraphs, words or letters (non-empty only). */
export type UnitCounter = (shape: string, by: 'para' | 'word' | 'letter') => number;

const STAGGER = { word: 0.1, letter: 0.05 } as const;

const totalOf = (a: Animation, dur: number): number => {
  if (a.repeat === 'untilNextClick' || a.repeat === 'untilEnd') return Infinity;
  const n = typeof a.repeat === 'number' && a.repeat > 0 ? a.repeat : 1;
  return dur * n;
};

const finiteEnd = (it: TItem): number => it.start + (Number.isFinite(it.total) ? it.total : it.dur);

/** Builds click groups. Animations with triggerShape go to their own sequences. */
export const buildTimeline = (anims: Animation[], units: UnitCounter = () => 1): Timeline => {
  const tl: Timeline = { main: [], triggers: {}, items: [], hidden: new Set(), split: {} };
  const seen = new Set<string>();
  let seq = 0;

  const addTo = (steps: TStep[], a: Animation) => {
    const dur = Math.max(0, a.duration);
    const by = a.textBy && a.textBy !== 'all' ? a.textBy : null;
    const n = by ? Math.max(1, units(a.shape, by)) : 1;
    if (by) tl.split[a.shape] = by;
    const targets = by ? Array.from({ length: n }, (_, i) => `${a.shape}#${by[0]}${i}`) : [a.shape];
    const total = totalOf(a, dur);
    // By paragraph on click: one click per paragraph.
    const perClick = by === 'para' && a.trigger === 'click';
    targets.forEach((target, i) => {
      const trig = i === 0 ? a.trigger : perClick ? 'click' : by === 'para' ? 'after' : 'with';
      let step = steps[steps.length - 1];
      if (trig === 'click' || !step) {
        step = { items: [], length: 0, auto: trig !== 'click' && steps.length === 0 };
        steps.push(step);
      }
      const prev = [...step.items].reverse().find((x) => !x.target.endsWith('#shape'));
      let base: number;
      if (trig === 'click' || !prev) base = 0;
      else if (trig === 'with') base = prev.base;
      else base = finiteEnd(prev);
      let start = base + (i === 0 ? a.delay : 0);
      if (i > 0 && (by === 'word' || by === 'letter')) {
        const first = step.items.find((x) => x.anim === a);
        base = first?.base ?? base;
        start = (first?.start ?? start) + i * dur * STAGGER[by];
      }
      const it: TItem = { anim: a, target, start, dur, total, seq: seq++, base };
      step.items.push(it);
      step.length = Math.max(step.length, finiteEnd(it));
      tl.items.push(it);
      if (!seen.has(target)) {
        seen.add(target);
        if (a.cls === 'entr') tl.hidden.add(target);
      }
    });
    // The shape's own drawing follows the first (entrance) or last (exit) text unit.
    if (by && (a.cls === 'entr' || a.cls === 'exit')) {
      const units_ = tl.items.filter((x) => x.anim === a);
      const ref = a.cls === 'entr' ? units_[0]! : units_[units_.length - 1]!;
      const bgStep = steps.find((s) => s.items.includes(ref))!;
      const bg: TItem = { ...ref, target: `${a.shape}#shape`, seq: seq++ };
      bgStep.items.push(bg);
      tl.items.push(bg);
      if (!seen.has(bg.target)) { seen.add(bg.target); if (a.cls === 'entr') tl.hidden.add(bg.target); }
    }
  };

  for (const a of anims) {
    if (a.triggerShape) addTo((tl.triggers[a.triggerShape] ??= []), a);
    else addTo(tl.main, a);
  }
  // A trigger sequence's first group always waits for its click.
  for (const steps of Object.values(tl.triggers)) if (steps[0]) steps[0].auto = false;
  return tl;
};

// ---------- Playback state ----------

export interface PlayState {
  /** Seconds, any monotonic clock. */
  now: number;
  /** Start time of each main step that has begun (index = step). -Infinity = long finished. */
  main: number[];
  /** Same per trigger shape. */
  trig: Record<string, number[]>;
}

/** State with every main step finished (shown when going back to a slide). */
export const finishedState = (tl: Timeline, now = 0): PlayState => ({ now, main: tl.main.map(() => -Infinity), trig: {} });
export const initialState = (now = 0): PlayState => ({ now, main: [], trig: {} });

/** Is every started step done playing (finite items only)? */
export const settled = (tl: Timeline, ps: PlayState): boolean => {
  const check = (steps: TStep[], starts: number[]) => starts.every((t0, i) => !steps[i] || ps.now - t0 >= steps[i]!.length);
  return check(tl.main, ps.main) && Object.entries(ps.trig).every(([k, v]) => check(tl.triggers[k] ?? [], v));
};

// ---------- Easing ----------

/** Accelerate over the first a, decelerate over the last b (fractions of the duration). */
export const ease = (t: number, a = 0, b = 0, bounce = 0): number => {
  t = Math.max(0, Math.min(1, t));
  if (bounce > 0) { const k = Math.min(1, bounce); return (1 - k) * ease(t, a, b) + k * bounceOut(t); }
  a = Math.max(0, Math.min(1, a)); b = Math.max(0, Math.min(1 - a, b));
  if (!a && !b) return t;
  const v = 1 / (1 - a / 2 - b / 2);
  if (t < a) return (v * t * t) / (2 * a);
  if (t <= 1 - b) return v * (a / 2 + (t - a));
  return 1 - (v * (1 - t) * (1 - t)) / (2 * b);
};

// ---------- Evaluation ----------

export interface Look extends Fx { hidden?: boolean }

export interface EvalCtx {
  W: number;
  H: number;
  box: (shape: string) => Box;
}

/** Emphasis effects whose end state stays after they finish. */
const LASTING = new Set(['spin', 'growShrink', 'desaturate', 'darken', 'lighten', 'transparency', 'objectColor', 'fillColor', 'lineColor', 'fontColor', 'complementaryColor', 'underline', 'boldReveal']);

const shapeOf = (target: string): string => target.split('#')[0]!;

/** Elapsed seconds of an item, or null when it hasn't started. Infinity = long finished. */
const elapsedOf = (it: TItem, tl: Timeline, ps: PlayState): { e: number; past: boolean } | null => {
  const trig = it.anim.triggerShape;
  const steps = trig ? tl.triggers[trig] ?? [] : tl.main;
  const starts = trig ? ps.trig[trig] ?? [] : ps.main;
  const si = steps.findIndex((s) => s.items.includes(it));
  const t0 = starts[si];
  if (si < 0 || t0 === undefined) return null;
  const e = ps.now - t0 - it.start;
  if (e < 0) return null;
  // A later main step has begun: "until next click" items stop there.
  const past = !trig && ps.main.length - 1 > si;
  return { e, past };
};

/** Progress 0..1 within the current repeat, or 'done'. */
const progressOf = (it: TItem, e: number, past: boolean): number | 'done' => {
  if (!Number.isFinite(e)) return 'done';
  if (it.anim.repeat === 'untilNextClick' && past) return 'done';
  if (Number.isFinite(it.total) && e >= it.total) return 'done';
  if (it.dur <= 0) return 'done';
  const k = e / it.dur;
  return k - Math.floor(k);
};

const compose = (into: Look, fx: Fx): void => {
  if (fx.opacity !== undefined) into.opacity = (into.opacity ?? 1) * fx.opacity;
  if (fx.tx) into.tx = (into.tx ?? 0) + fx.tx;
  if (fx.ty) into.ty = (into.ty ?? 0) + fx.ty;
  if (fx.sx !== undefined) into.sx = (into.sx ?? 1) * fx.sx;
  if (fx.sy !== undefined) into.sy = (into.sy ?? 1) * fx.sy;
  if (fx.rot) into.rot = (into.rot ?? 0) + fx.rot;
  if (fx.skewX) into.skewX = (into.skewX ?? 0) + fx.skewX;
  if (fx.clip) into.clip = fx.clip;
  if (fx.filter) into.filter = into.filter ? `${into.filter} ${fx.filter}` : fx.filter;
  if (fx.colors) into.colors = { ...into.colors, ...fx.colors };
  if (fx.bold !== undefined) into.bold = fx.bold;
  if (fx.underline !== undefined) into.underline = fx.underline;
};

const pathOf = (a: Animation, W: number, H: number): string => a.path || presetPath(a.effect, a.option, W, H);

/** How each target looks now. Targets with no entry are drawn as is. */
export const evaluate = (tl: Timeline, ps: PlayState, ctx: EvalCtx): Map<string, Look> => {
  const out = new Map<string, Look>();
  for (const t of tl.hidden) out.set(t, { hidden: true });
  const order = [...tl.items].sort((x, y) => x.seq - y.seq);
  for (const it of order) {
    const st = elapsedOf(it, tl, ps);
    if (!st) continue;
    const a = it.anim;
    const look = out.get(it.target) ?? {};
    out.set(it.target, look);
    const p = progressOf(it, st.e, st.past);
    const def = effectDef(a.cls, a.effect);
    const sm = a.smoothStart !== undefined || a.smoothEnd !== undefined ? [a.smoothStart ?? 0, a.smoothEnd ?? 0] : def?.smooth ?? [0, 0];
    const box = ctx.box(shapeOf(it.target));
    const fctx = { box, W: ctx.W, H: ctx.H, option: a.option, value: a.value, seed: hash(it.target + a.id) };
    if (p === 'done') {
      if (a.cls === 'entr') look.hidden = !!a.rewind;
      else if (a.cls === 'exit') look.hidden = !a.rewind;
      else if (a.cls === 'emph') { if (!a.rewind && LASTING.has(a.effect)) compose(look, evalEffect('emph', a.effect, 1, fctx)); }
      else if (a.cls === 'path' && !a.rewind) {
        const d = pathOf(a, ctx.W, ctx.H);
        const [x0, y0] = pointAt(d, 0), [x1, y1] = pointAt(d, 1);
        compose(look, { tx: x1 - x0, ty: y1 - y0 });
      }
      if (a.cls !== 'exit') {
        const hideNext = a.afterAnim === 'hideOnClick' && st.past;
        if (a.afterAnim === 'hide' || hideNext) look.hidden = true;
        else if (a.afterAnim === 'dim') compose(look, { colors: { font: [typeof a.dimColor === 'string' ? a.dimColor : '#9AA0AB', 1], fill: [typeof a.dimColor === 'string' ? a.dimColor : '#9AA0AB', 0.5] } });
      }
      continue;
    }
    const e = ease(p, sm[0], sm[1], a.bounceEnd ?? 0);
    if (a.cls === 'entr' || a.cls === 'exit') {
      look.hidden = false;
      compose(look, evalEffect(a.cls, a.effect, e, fctx));
    } else if (a.cls === 'emph') {
      compose(look, evalEffect('emph', a.effect, e, fctx));
    } else {
      const d = pathOf(a, ctx.W, ctx.H);
      const [x0, y0] = pointAt(d, 0), [x, y] = pointAt(d, e);
      compose(look, { tx: x - x0, ty: y - y0 });
    }
  }
  return out;
};

/** Number of main clicks a slide needs before moving on. */
export const clickCount = (tl: Timeline): number => tl.main.filter((s) => !s.auto).length;

/** Motion path in slide coordinates for drawing on the canvas. */
export const motionPathOf = (a: Animation, W: number, H: number): string => pathOf(a, W, H);
