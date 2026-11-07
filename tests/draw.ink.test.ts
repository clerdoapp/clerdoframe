import { describe, expect, it } from 'vitest';
import { FrameStore } from '../src/app/store';
import { newDeck } from '../src/model/defaults';
import type { Ink, InkStroke } from '../src/model/deck';
import { toolFor } from '../src/app/registry';
import { registerDraw } from '../src/features/draw';
import { hitStroke, inPolygon, recognize, simplify, smooth, strokeBounds, strokeOutline } from '../src/features/draw/ink';
import { settingFor, penState } from '../src/features/draw/state';
import { convertInkToShapes, toSlideStrokes } from '../src/features/draw/tools';

registerDraw();

const S = (pts: [number, number][], tool: InkStroke['tool'] = 'pen', width = 3): InkStroke => ({ points: pts.map(([x, y]) => [x, y, 0.5]), color: '#000000', width, tool });
const circle = (cx: number, cy: number, rx: number, ry: number, n = 48): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);
const poly = (corners: [number, number][], per = 12): [number, number][] => corners.flatMap((a, k) => {
  const b = corners[(k + 1) % corners.length]!;
  return Array.from({ length: per }, (_, i): [number, number] => [a[0] + ((b[0] - a[0]) * i) / per, a[1] + ((b[1] - a[1]) * i) / per]);
}).concat([corners[0]!]);

describe('ink geometry', () => {
  it('outlines strokes, including dots', () => {
    expect(strokeOutline(S([[0, 0], [50, 10], [100, 0]]))).toMatch(/^M.*Z$/);
    expect(strokeOutline(S([[5, 5]]))).toContain('a');
    expect(strokeOutline(S([[0, 0], [100, 0]], 'highlighter', 20))).not.toContain('A');
  });
  it('simplifies and smooths without losing the ends', () => {
    const pts: [number, number, number][] = Array.from({ length: 50 }, (_, i) => [i * 0.2, 0, 0.5]);
    const s = simplify(pts, 1.2);
    expect(s.length).toBeLessThan(15);
    expect(s.at(-1)).toEqual(pts.at(-1));
    const m = smooth([[0, 0], [10, 10], [20, 0]]);
    expect(m[0]).toEqual([0, 0]);
    expect(m.at(-1)).toEqual([20, 0]);
  });
  it('measures bounds and hits', () => {
    const st = S([[10, 10], [110, 60]], 'pen', 4);
    expect(strokeBounds([st])).toEqual({ x: 7, y: 7, w: 106, h: 56 });
    expect(hitStroke(st, 60, 35, 2)).toBe(true);
    expect(hitStroke(st, 60, 80, 2)).toBe(false);
    expect(inPolygon(5, 5, [[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(true);
    expect(inPolygon(15, 5, [[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false);
  });
});

describe('shape recognition', () => {
  it('recognises lines, rectangles, ellipses and triangles', () => {
    expect(recognize([S([[0, 0], [50, 2], [100, 4], [150, 5], [200, 7]])])?.kind).toBe('line');
    expect(recognize([S(poly([[0, 0], [200, 0], [200, 120], [0, 120]]))])?.kind).toBe('rect');
    expect(recognize([S(circle(100, 100, 90, 50))])?.kind).toBe('ellipse');
    expect(recognize([S(poly([[100, 0], [200, 160], [0, 160]]))])?.kind).toBe('triangle');
  });
  it('leaves scribbles alone', () => {
    const zig = Array.from({ length: 30 }, (_, i): [number, number] => [i * 10, i % 2 ? 0 : 40]);
    expect(recognize([S(zig)])).toBeNull();
    expect(recognize([S([[0, 0], [2, 2]])])).toBeNull();
  });
});

describe('draw tools', () => {
  const store = () => { const s = new FrameStore(newDeck()); s.deck.slides[0]!.shapes = []; return s; };
  const draw = (s: FrameStore, tool: string, pts: [number, number][], pointerType = 'pen') => {
    s.tool = tool;
    const h = toolFor(tool)!;
    pts.forEach(([x, y], i) => (i === 0 ? h.down : h.move)(s, { x, y, pressure: 0.6, shift: false, pointerType }));
    const l = pts.at(-1)!;
    h.up(s, { x: l[0], y: l[1], pressure: 0, shift: false, pointerType });
  };
  it('appends strokes of one session to one ink shape and refits its box', () => {
    const s = store();
    draw(s, 'pen', [[100, 100], [200, 150]]);
    draw(s, 'pen', [[300, 300], [320, 400]]);
    const inks = s.deck.slides[0]!.shapes.filter((x): x is Ink => x.kind === 'ink');
    expect(inks.length).toBe(1);
    expect(inks[0]!.strokes.length).toBe(2);
    expect(inks[0]!.x).toBeLessThan(100);
    expect(inks[0]!.y + inks[0]!.h).toBeGreaterThan(400);
    const abs = toSlideStrokes(inks[0]!);
    expect(abs[1]!.points.at(-1)!.slice(0, 2)).toEqual([320, 400]);
    s.undo();
    expect((s.deck.slides[0]!.shapes[0] as Ink).strokes.length).toBe(1);
  });
  it('uses the pen preset colour and width, and ignores touch when drawing with touch is off', () => {
    const s = store();
    penState(s).active = 1;
    draw(s, 'pen', [[10, 10], [60, 60]]);
    const ink = s.deck.slides[0]!.shapes[0] as Ink;
    expect(ink.strokes[0]).toMatchObject({ color: settingFor(s, 'pen').color, width: settingFor(s, 'pen').width, tool: 'pen' });
    s.ext.drawWithTouch = false;
    draw(s, 'pen', [[400, 400], [500, 500]], 'touch');
    expect((s.deck.slides[0]!.shapes[0] as Ink).strokes.length).toBe(1);
  });
  it('erases whole strokes it touches', () => {
    const s = store();
    draw(s, 'pen', [[100, 100], [300, 100]]);
    draw(s, 'pen', [[100, 300], [300, 300]]);
    draw(s, 'eraser', [[200, 80], [200, 120]], 'mouse');
    const ink = s.deck.slides[0]!.shapes[0] as Ink;
    expect(ink.strokes.length).toBe(1);
    draw(s, 'eraser', [[200, 290], [200, 310]], 'mouse');
    expect(s.deck.slides[0]!.shapes.length).toBe(0);
  });
  it('lasso selects shapes and ink inside the loop', () => {
    const s = store();
    draw(s, 'pen', [[100, 100], [150, 120]]);
    s.change('x', () => { s.deck.slides[0]!.shapes.push({ id: 'r', kind: 'shape', geom: 'rect', name: 'R', x: 200, y: 100, w: 50, h: 50 }, { id: 'far', kind: 'shape', geom: 'rect', name: 'F', x: 900, y: 500, w: 50, h: 50 }); });
    draw(s, 'lasso', [[50, 50], [300, 50], [300, 200], [50, 200], [50, 52]], 'mouse');
    expect(s.sel.length).toBe(2);
    expect(s.sel).toContain('r');
  });
  it('turns ink into shapes when asked', () => {
    const s = store();
    s.ext.inkToShape = true;
    draw(s, 'pen', poly([[100, 100], [400, 100], [400, 300], [100, 300]]));
    expect(s.deck.slides[0]!.shapes[0]).toMatchObject({ kind: 'shape', geom: 'rect' });
    s.ext.inkToShape = false;
    draw(s, 'pen', circle(700, 400, 100, 60));
    const ink = s.deck.slides[0]!.shapes.find((x) => x.kind === 'ink')!;
    s.select([ink.id]);
    expect(convertInkToShapes(s)).toBe(1);
    expect(s.deck.slides[0]!.shapes.map((x) => x.kind === 'shape' && x.geom)).toEqual(['rect', 'ellipse']);
  });
  it('the highlighter never becomes a shape', () => {
    const s = store();
    s.ext.inkToShape = true;
    draw(s, 'highlighter', [[0, 100], [400, 102]]);
    expect(s.deck.slides[0]!.shapes[0]!.kind).toBe('ink');
  });
});
