import { describe, expect, it } from 'vitest';
import type { AutoShape, Group, Shape } from '../src/model/deck';
import {
  HANDLES, apply, fitGroup, frameMatrix, hitShape, I, inMarquee, lineEnds, pickTarget, resizeFrame, routeConnectors, setLineEnds, slideBoxOf, ungroupChildren,
} from '../src/features/editor/geom';
import { cellAt, cropHandle, cropPan, moveShapes, resizeMany, origins, rotateShapes } from '../src/features/editor/interact';
import { snapBox, spacingHints, type SnapOpts } from '../src/features/editor/snap';

const rect = (id: string, x: number, y: number, w: number, h: number, extra: Partial<AutoShape> = {}): AutoShape => ({ id, kind: 'shape', name: id, geom: 'rect', x, y, w, h, ...extra });
const close = (a: number, b: number, d = 0.01) => expect(Math.abs(a - b)).toBeLessThan(d);

describe('geometry', () => {
  it('resizes from a corner and keeps the opposite corner still', () => {
    const b = resizeFrame({ x: 100, y: 100, w: 200, h: 100 }, HANDLES.se!, { x: 350, y: 260 });
    expect(b).toEqual({ x: 100, y: 100, w: 250, h: 160 });
    const c = resizeFrame({ x: 100, y: 100, w: 200, h: 100 }, HANDLES.nw!, { x: 50, y: 80 }, { ratio: true });
    close(c.w / c.h, 2); close(c.x + c.w, 300); close(c.y + c.h, 200);
  });

  it('resizes from the centre with alt', () => {
    const b = resizeFrame({ x: 100, y: 100, w: 200, h: 100 }, HANDLES.e!, { x: 320, y: 150 }, { center: true });
    expect(b).toEqual({ x: 80, y: 100, w: 240, h: 100 });
  });

  it('resizes rotated shapes in their own frame', () => {
    // 90° rotation: the shape's east handle points down in slide space.
    const f = { x: 0, y: 0, w: 200, h: 100, rot: 90 };
    const east = apply(frameMatrix(f), { x: 200, y: 50 });
    close(east.x, 100); close(east.y, 150);
    const b = resizeFrame(f, HANDLES.e!, { x: 100, y: 200 });
    close(b.w, 250); close(b.h, 100);
    // The west edge (top in slide space) stays put.
    const west = apply(frameMatrix({ ...b, rot: 90 }), { x: 0, y: 50 });
    close(west.x, 100); close(west.y, -50);
  });

  it('hit tests rotated shapes and lines', () => {
    const s = rect('a', 0, 0, 200, 20, { rot: 90 });
    expect(hitShape(s, I, { x: 100, y: 90 }, 0)).toBe(true);
    expect(hitShape(s, I, { x: 10, y: 10 }, 0)).toBe(false);
    const l = rect('l', 0, 0, 100, 100, { geom: 'line' });
    expect(hitShape(l, I, { x: 52, y: 50 }, 3)).toBe(true);
    expect(hitShape(l, I, { x: 80, y: 20 }, 3)).toBe(false);
  });

  it('picks a group first, then its child', () => {
    const g: Group = { id: 'g', kind: 'group', name: 'g', x: 0, y: 0, w: 200, h: 100, children: [rect('a', 0, 0, 100, 100), rect('b', 100, 0, 100, 100)] };
    expect(pickTarget([g], [], { x: 150, y: 50 }, 0)?.id).toBe('g');
    expect(pickTarget([g], ['g'], { x: 150, y: 50 }, 0)?.id).toBe('b');
    expect(pickTarget([g], ['a'], { x: 150, y: 50 }, 0)?.id).toBe('b');
  });

  it('selects shapes fully inside a marquee', () => {
    const shapes = [rect('a', 10, 10, 50, 50), rect('b', 100, 10, 50, 50), rect('h', 10, 10, 5, 5, { hidden: true })];
    expect(inMarquee(shapes, { x: 0, y: 0, w: 80, h: 80 }).map((s) => s.id)).toEqual(['a']);
  });

  it('sets line ends with flips', () => {
    const l = rect('l', 0, 0, 1, 1, { geom: 'line' });
    setLineEnds(l, { x: 100, y: 50 }, { x: 20, y: 80 });
    expect([l.x, l.y, l.w, l.h, l.flipH, l.flipV]).toEqual([20, 50, 80, 30, true, undefined]);
    const [a, b] = lineEnds(l);
    close(a.x, 100); close(a.y, 50); close(b.x, 20); close(b.y, 80);
  });

  it('re-routes glued connectors when shapes move', () => {
    const shapes: Shape[] = [rect('a', 0, 0, 100, 100), rect('b', 300, 0, 100, 100),
      rect('c', 100, 50, 200, 0, { geom: 'straightConnector1', conn: { start: { shape: 'a', site: 3 }, end: { shape: 'b', site: 1 } } })];
    moveShapes(shapes, ['b'], 0, 100);
    const c = shapes[2]!;
    const [p, q] = lineEnds(c);
    close(p.x, 100); close(p.y, 50); close(q.x, 300); close(q.y, 150);
    // Moving the connector alone unglues it.
    moveShapes(shapes, ['c'], 10, 0);
    expect((c as AutoShape).conn).toBeUndefined();
    // Deleted targets unglue.
    const s2: Shape[] = [rect('x', 0, 0, 10, 10, { geom: 'line', conn: { start: { shape: 'gone', site: 0 } } })];
    routeConnectors(s2);
    expect((s2[0] as AutoShape).conn).toBeUndefined();
  });

  it('refits groups after a child moves and ungroups to the same place', () => {
    const g: Group = { id: 'g', kind: 'group', name: 'g', x: 100, y: 100, w: 400, h: 200, childBox: { x: 0, y: 0, w: 200, h: 100 }, children: [rect('a', 0, 0, 100, 100), rect('b', 100, 0, 100, 100)] };
    const top: Shape[] = [g];
    moveShapes(top, ['b'], 200, 0);
    const bb = slideBoxOf(top, g.children[1]!);
    close(bb.x, 500); close(bb.y, 100); close(bb.w, 200);
    close(g.w, 600);
    fitGroup(g);
    const kids = ungroupChildren(g);
    expect(kids.map((k) => [Math.round(k.x), Math.round(k.y), Math.round(k.w), Math.round(k.h)])).toEqual([[100, 100, 200, 200], [500, 100, 200, 200]]);
  });

  it('resizes and rotates several shapes together', () => {
    const top: Shape[] = [rect('a', 0, 0, 100, 100), rect('b', 200, 0, 100, 100)];
    resizeMany(top, origins(top, ['a', 'b']), { x: 0, y: 0, w: 300, h: 100 }, { x: 0, y: 0, w: 600, h: 200 });
    expect(top.map((s) => [s.x, s.y, s.w, s.h])).toEqual([[0, 0, 200, 200], [400, 0, 200, 200]]);
    rotateShapes(top, origins(top, ['a', 'b']), { x: 300, y: 100 }, 180);
    close(top[0]!.x, 400); close(top[1]!.x, 0); expect(top[0]!.rot).toBe(180);
  });

  it('finds table cells', () => {
    const t: Shape = { id: 't', kind: 'table', name: 't', x: 10, y: 10, w: 200, h: 100, cols: [100, 100], rows: [{ h: 50, cells: [{ text: { paras: [] } }, { text: { paras: [] }, }] }, { h: 50, cells: [{ text: { paras: [] }, gridSpan: 2 }, { text: { paras: [] }, hMerge: true }] }] };
    expect(cellAt([t], 't', { x: 150, y: 20 })).toEqual({ r: 0, c: 1 });
    expect(cellAt([t], 't', { x: 150, y: 90 })).toEqual({ r: 1, c: 0 });
  });

  it('crops a picture from a handle and pans inside the frame', () => {
    const top: Shape[] = [{ id: 'p', kind: 'picture', name: 'p', media: 'm', x: 0, y: 0, w: 200, h: 100 }];
    const st = { x: 0, y: 0, w: 200, h: 100, crop: { l: 0, t: 0, r: 0, b: 0 } };
    cropHandle(top, 'p', st, HANDLES.w!, { x: 50, y: 50 });
    const p = top[0] as Extract<Shape, { kind: 'picture' }>;
    expect([p.x, p.w]).toEqual([50, 150]);
    close(p.crop!.l, 0.25);
    const st2 = { x: p.x, y: p.y, w: p.w, h: p.h, crop: { ...p.crop! } };
    cropPan(top, 'p', st2, { x: 30, y: 0 });
    close(p.crop!.l, 0.1); close(p.crop!.r, 0.15);
    // The picture can't be dragged off the frame.
    cropPan(top, 'p', st2, { x: 300, y: 0 });
    close(p.crop!.l, 0);
  });
});

describe('snapping', () => {
  const base: SnapOpts = { toGrid: false, guides: { x: [], y: [] }, targets: [], slide: { w: 1280, h: 720 }, toShapes: true, tol: 6 };

  it('snaps to other shapes edges and centres', () => {
    const r = snapBox({ x: 203, y: 400, w: 100, h: 50 }, { ...base, targets: [{ x: 0, y: 0, w: 200, h: 100 }] });
    expect(r.dx).toBe(-3);
    expect(r.lines.some((l) => l.axis === 'x' && l.at === 200)).toBe(true);
  });

  it('snaps to the slide centre', () => {
    const r = snapBox({ x: 588, y: 0, w: 100, h: 50 }, base);
    expect(r.dx).toBe(2);
  });

  it('snaps to the grid when nothing else is near', () => {
    const r = snapBox({ x: 93, y: 45, w: 30, h: 30 }, { ...base, toShapes: false, toGrid: true, grid: 16 });
    expect(r.dx).toBe(3);
    expect(r.dy).toBe(3);
  });

  it('snaps to drawing guides first', () => {
    const r = snapBox({ x: 300, y: 104, w: 30, h: 30 }, { ...base, guides: { x: [], y: [100] }, toGrid: true, grid: 16 });
    expect(r.dy).toBe(-4);
    expect(r.lines[0]!.kind).toBe('guide');
  });

  it('reports equal spacing', () => {
    const h = spacingHints({ x: 300, y: 0, w: 100, h: 100 }, [{ x: 0, y: 0, w: 100, h: 100 }, { x: 150, y: 0, w: 100, h: 100 }]);
    expect(h).toHaveLength(1);
    expect(h[0]!.axis).toBe('x');
    const none = spacingHints({ x: 320, y: 0, w: 100, h: 100 }, [{ x: 0, y: 0, w: 100, h: 100 }, { x: 150, y: 0, w: 100, h: 100 }]);
    expect(none).toHaveLength(0);
  });
});
