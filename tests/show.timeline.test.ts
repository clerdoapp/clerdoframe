import { describe, expect, it } from 'vitest';
import type { Animation } from '../src/model/deck';
import { buildTimeline, clickCount, ease, evaluate, finishedState, initialState, settled } from '../src/features/show/timeline';
import { EFFECTS, evalEffect, presetPath } from '../src/features/show/effects';
import { ends, pointAt } from '../src/features/show/pathgeom';

const A = (p: Partial<Animation> & { id: string; shape: string }): Animation => ({ cls: 'entr', effect: 'fade', trigger: 'click', duration: 1, delay: 0, ...p });
const ctx = { W: 1280, H: 720, box: () => ({ x: 100, y: 100, w: 200, h: 100 }) };

describe('timeline', () => {
  it('groups clicks, with and after', () => {
    const tl = buildTimeline([
      A({ id: 'a', shape: 's1' }),
      A({ id: 'b', shape: 's2', trigger: 'with', delay: 0.5 }),
      A({ id: 'c', shape: 's3', trigger: 'after', duration: 2 }),
      A({ id: 'd', shape: 's4' }),
    ]);
    expect(tl.main.length).toBe(2);
    expect(clickCount(tl)).toBe(2);
    const [a, b, c] = tl.main[0]!.items;
    expect(a!.start).toBe(0);
    expect(b!.start).toBe(0.5);
    expect(c!.start).toBe(1.5);
    expect(tl.main[0]!.length).toBe(3.5);
  });

  it('first group auto-plays when it starts with or after', () => {
    const tl = buildTimeline([A({ id: 'a', shape: 's1', trigger: 'after' }), A({ id: 'b', shape: 's2' })]);
    expect(tl.main[0]!.auto).toBe(true);
    expect(clickCount(tl)).toBe(1);
  });

  it('hides entrance targets, shows them while and after playing', () => {
    const tl = buildTimeline([A({ id: 'a', shape: 's1' })]);
    expect(evaluate(tl, initialState(0), ctx).get('s1')!.hidden).toBe(true);
    const mid = evaluate(tl, { now: 10.5, main: [10], trig: {} }, ctx).get('s1')!;
    expect(mid.hidden).toBe(false);
    expect(mid.opacity).toBeCloseTo(0.5, 5);
    const done = evaluate(tl, { now: 20, main: [10], trig: {} }, ctx).get('s1')!;
    expect(done.hidden).toBe(false);
    expect(done.opacity).toBeUndefined();
  });

  it('exit ends hidden, rewind restores', () => {
    const tl = buildTimeline([A({ id: 'a', shape: 's1', cls: 'exit', effect: 'fade' }), A({ id: 'b', shape: 's2', cls: 'exit', rewind: true })]);
    const out = evaluate(tl, finishedState(tl), ctx);
    expect(out.get('s1')!.hidden).toBe(true);
    expect(out.get('s2')!.hidden).toBe(false);
    expect(out.has('s1') && !tl.hidden.has('s1')).toBe(true);
  });

  it('after-animation hide and hide on next click', () => {
    const tl = buildTimeline([A({ id: 'a', shape: 's1', afterAnim: 'hideOnClick' }), A({ id: 'b', shape: 's2', afterAnim: 'hide' })]);
    const one = evaluate(tl, { now: 5, main: [0], trig: {} }, ctx);
    expect(one.get('s1')!.hidden).toBe(false);
    const two = evaluate(tl, { now: 5, main: [0, 4], trig: {} }, ctx);
    expect(two.get('s1')!.hidden).toBe(true);
    expect(two.get('s2')!.hidden).toBe(true);
  });

  it('repeats and until-next-click', () => {
    const tl = buildTimeline([A({ id: 'a', shape: 's1', cls: 'emph', effect: 'spin', repeat: 3, duration: 1, smoothStart: 0, smoothEnd: 0 }), A({ id: 'b', shape: 's2', cls: 'emph', effect: 'pulse', trigger: 'with', repeat: 'untilNextClick' })]);
    expect(tl.main[0]!.length).toBe(3);
    const l = evaluate(tl, { now: 2.25, main: [0], trig: {} }, ctx).get('s1')!;
    expect(l.rot).toBeCloseTo(90, 3);
    expect(settled(tl, { now: 100, main: [0], trig: {} })).toBe(true);
    const p = evaluate(tl, { now: 100.5, main: [0], trig: {} }, ctx).get('s2')!;
    expect(p.sx).toBeGreaterThan(1);
  });

  it('text by paragraph makes one click per paragraph and a shape layer', () => {
    const tl = buildTimeline([A({ id: 'a', shape: 's1', textBy: 'para' })], () => 3);
    expect(tl.main.length).toBe(3);
    expect(tl.split.s1).toBe('para');
    expect(tl.hidden.has('s1#p0') && tl.hidden.has('s1#p2') && tl.hidden.has('s1#shape')).toBe(true);
  });

  it('text by word staggers within one click', () => {
    const tl = buildTimeline([A({ id: 'a', shape: 's1', textBy: 'word', duration: 1 })], () => 4);
    expect(tl.main.length).toBe(1);
    expect(tl.main[0]!.items.filter((x) => x.target.includes('#w')).map((x) => x.start)).toEqual([0, 0.1, 0.2, 0.30000000000000004]);
  });

  it('triggers get their own sequence', () => {
    const tl = buildTimeline([A({ id: 'a', shape: 's1', triggerShape: 'btn' }), A({ id: 'b', shape: 's2' })]);
    expect(tl.main.length).toBe(1);
    expect(tl.triggers.btn!.length).toBe(1);
    const st = { now: 3, main: [], trig: { btn: [2.5] } };
    expect(evaluate(tl, st, ctx).get('s1')!.opacity).toBeCloseTo(0.5);
  });

  it('motion paths move to the end of the path', () => {
    const tl = buildTimeline([A({ id: 'a', shape: 's1', cls: 'path', effect: 'line', option: 'r', smoothStart: 0, smoothEnd: 0 })]);
    const mid = evaluate(tl, { now: 0.5, main: [0], trig: {} }, ctx).get('s1')!;
    const d = presetPath('line', 'r', 1280, 720);
    expect(mid.tx).toBeCloseTo(ends(d)[1][0] / 2, 3);
    const done = evaluate(tl, finishedState(tl), ctx).get('s1')!;
    expect(done.tx).toBeCloseTo(ends(d)[1][0], 3);
  });
});

describe('easing and effects', () => {
  it('ease keeps ends and is monotone', () => {
    for (const [a, b] of [[0, 0], [0.5, 0.5], [0.2, 0.6], [1, 0]]) {
      expect(ease(0, a, b)).toBeCloseTo(0);
      expect(ease(1, a, b)).toBeCloseTo(1);
      let last = -1;
      for (let t = 0; t <= 1.0001; t += 0.05) { const v = ease(t, a, b); expect(v).toBeGreaterThanOrEqual(last - 1e-9); last = v; }
    }
  });

  it('every entrance ends at rest, every exit starts at rest', () => {
    const c = { box: { x: 100, y: 100, w: 200, h: 100 }, W: 1280, H: 720, seed: 7 };
    for (const e of EFFECTS.filter((x) => x.cls === 'entr' || x.cls === 'exit')) {
      const fx = evalEffect(e.cls, e.id, e.cls === 'entr' ? 1 : 0, c);
      expect(Math.abs(fx.tx ?? 0), e.id).toBeLessThan(0.5);
      expect(Math.abs(fx.ty ?? 0), e.id).toBeLessThan(0.5);
      expect(fx.opacity ?? 1, e.id).toBeCloseTo(1, 2);
      expect(Math.abs((fx.sx ?? 1) - 1), e.id).toBeLessThan(0.01);
      expect(Math.abs(fx.rot ?? 0) % 360, e.id).toBeLessThan(0.5);
    }
  });

  it('path sampler handles curves and arcs', () => {
    expect(pointAt('M0 0 L100 0', 0.25)).toEqual([25, 0]);
    const [s, e] = ends('M0 0 A50 50 0 1 1 0 100');
    expect(s).toEqual([0, 0]);
    expect(e[1]).toBeCloseTo(100);
    for (const o of ['circle', 'heart', 'star', 'square']) expect(ends(presetPath('shapes', o, 1280, 720))[1][0]).toBeCloseTo(0, 0);
  });
});
