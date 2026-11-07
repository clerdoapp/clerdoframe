import { describe, expect, it } from 'vitest';
import { geometry, preset } from '../src/render/geometry';
import { adjustDefaults, presetNames, solveHandle, evalPreset } from '../src/features/shapes/engine';
import { CATEGORIES, registerAllPresets } from '../src/features/shapes/presets';

registerAllPresets();

const finite = (d: string) => (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?|NaN|Infinity/g) ?? []).every((n) => Number.isFinite(Number(n)));
const SIZES: [number, number][] = [[96, 96], [200, 80], [40, 300], [1, 1], [1280, 720]];

describe('preset geometry', () => {
  it('has the full spec set', () => {
    expect(presetNames().length).toBeGreaterThanOrEqual(185);
    for (const c of CATEGORIES) for (const s of c.shapes) expect(preset(s), s).toBeTruthy();
  });

  for (const name of presetNames()) {
    it(`${name} returns finite paths`, () => {
      const defs = adjustDefaults(name);
      const variants: Record<string, number>[] = [{}, defs];
      for (const f of [0, 0.5, 2, -1]) variants.push(Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, f === -1 ? -v : v * f])));
      variants.push(Object.fromEntries(Object.keys(defs).map((k) => [k, 100000])));
      for (const [w, h] of SIZES) for (const adj of variants) {
        const g = geometry(name, w, h, adj);
        expect(g.paths.length).toBeGreaterThan(0);
        for (const p of g.paths) {
          expect(p.d.length).toBeGreaterThan(1);
          expect(finite(p.d), `${name} ${w}x${h} ${JSON.stringify(adj)}: ${p.d.slice(0, 80)}`).toBe(true);
        }
        if (g.text) for (const v of Object.values(g.text)) expect(Number.isFinite(v)).toBe(true);
        for (const s of g.sites ?? []) expect(s.every(Number.isFinite)).toBe(true);
        for (const hd of g.handles ?? []) expect(Number.isFinite(hd.x) && Number.isFinite(hd.y)).toBe(true);
      }
    });
  }

  it('rect and roundRect match the spec', () => {
    expect(geometry('rect', 100, 50).paths[0]!.d).toBe('M0 0L100 0L100 50L0 50Z');
    const r = geometry('roundRect', 200, 100);
    expect(r.handles?.[0]).toMatchObject({ adj: 'adj', axis: 'x' });
    expect(r.handles![0]!.x).toBeCloseTo(100 * 0.16667, 1);
    expect(r.text!.x).toBeCloseTo(16.667 * 0.29289, 1);
  });

  it('3D shapes carry shaded paths', () => {
    expect(geometry('cube', 100, 100).paths.map((p) => p.fill)).toContain('darkenLess');
    expect(geometry('can', 100, 100).paths.map((p) => p.fill)).toContain('lighten');
    expect(geometry('foldedCorner', 100, 100).paths.map((p) => p.fill)).toContain('darkenLess');
  });

  it('ellipse arcs reach the box edges', () => {
    const d = evalPreset('ellipse', 200, 100, {})!.paths[0]!.d;
    const nums = d.match(/-?\d*\.?\d+/g)!.map(Number);
    expect(Math.max(...nums.filter((_, i) => i % 1 === 0))).toBeLessThanOrEqual(200.01);
    expect(d).toContain('A100 50');
  });

  it('handle solver inverts handles', () => {
    const v = solveHandle('roundRect', 200, 100, {}, 0, 30, 0);
    expect(v.adj).toBeGreaterThan(29000);
    expect(v.adj).toBeLessThan(31000);
    const a = solveHandle('rightArrow', 200, 100, {}, 1, 120, 0);
    const g = geometry('rightArrow', 200, 100, a);
    expect(g.handles![1]!.x).toBeCloseTo(120, 0);
  });
});
