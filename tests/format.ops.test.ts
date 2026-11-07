import { describe, expect, it } from 'vitest';
import { FrameStore } from '../src/app/store';
import { newDeck } from '../src/model/defaults';
import type { AutoShape, Group, Paragraph, Shape, Table } from '../src/model/deck';
import {
  alignShapes, applyFill, applyLine, applyQuickStyle, arrange, common, distribute, findAll, fontsInDeck, MIXED, moveToIndex,
  quickStyle, QUICK_STYLE_COUNT, reorder, replaceAll, replaceFont, replaceRange, resize, rotateBy, slideBounds, withAlpha,
} from '../src/features/format/ops';

const box = (id: string, x: number, y: number, w = 100, h = 50, text?: string): AutoShape => ({
  id, kind: 'shape', geom: 'rect', name: id, x, y, w, h, ...(text ? { text: { paras: [{ runs: [{ text }] }] } } : {}),
});

const storeWith = (shapes: Shape[]): FrameStore => {
  const s = new FrameStore(newDeck());
  s.deck.slides[0]!.shapes = shapes;
  return s;
};

const ids = (list: Shape[]) => list.map((s) => s.id).join('');

describe('z-order', () => {
  it('moves to front, back, forward and backward', () => {
    const list = ['a', 'b', 'c', 'd'].map((i) => box(i, 0, 0));
    reorder(list, new Set(['b']), 'front'); expect(ids(list)).toBe('acdb');
    reorder(list, new Set(['b']), 'back'); expect(ids(list)).toBe('bacd');
    reorder(list, new Set(['b']), 'forward'); expect(ids(list)).toBe('abcd');
    reorder(list, new Set(['c']), 'backward'); expect(ids(list)).toBe('acbd');
    reorder(list, new Set(['a', 'c']), 'forward'); expect(ids(list)).toBe('bacd');
    expect(reorder(list, new Set(['d']), 'front')).toBe(false);
  });

  it('reorders inside a group and is undoable', () => {
    const g: Group = { id: 'g', kind: 'group', name: 'g', x: 0, y: 0, w: 200, h: 100, children: [box('x', 0, 0), box('y', 10, 10)] };
    const s = storeWith([box('a', 0, 0), g]);
    s.sel = ['x'];
    s.change('Front', () => arrange(s, 'front'));
    expect(ids((s.deck.slides[0]!.shapes[1] as Group).children)).toBe('yx');
    s.undo();
    expect(ids((s.deck.slides[0]!.shapes[1] as Group).children)).toBe('xy');
  });

  it('moves to an index', () => {
    const list = ['a', 'b', 'c'].map((i) => box(i, 0, 0));
    moveToIndex(list, 'a', 2); expect(ids(list)).toBe('bca');
  });
});

describe('align and distribute', () => {
  it('aligns to the selection and to the slide', () => {
    const s = storeWith([box('a', 10, 10), box('b', 300, 200, 50, 50)]);
    s.sel = ['a', 'b'];
    alignShapes(s, 'right', false);
    expect(s.deck.slides[0]!.shapes.map((x) => x.x + x.w)).toEqual([350, 350]);
    alignShapes(s, 'top', true);
    expect(s.deck.slides[0]!.shapes.map((x) => x.y)).toEqual([0, 0]);
    alignShapes(s, 'center', true);
    expect(s.deck.slides[0]!.shapes.map((x) => x.x + x.w / 2)).toEqual([640, 640]);
  });

  it('distributes evenly between the outer shapes', () => {
    const s = storeWith([box('a', 0, 0, 100), box('b', 150, 0, 100), box('c', 500, 0, 100)]);
    s.sel = ['a', 'b', 'c'];
    distribute(s, 'h', false);
    expect(s.deck.slides[0]!.shapes.map((x) => x.x)).toEqual([0, 250, 500]);
  });

  it('accounts for rotation and group scale', () => {
    const r = box('r', 100, 100, 200, 100);
    r.rot = 90;
    const s = storeWith([r]);
    expect(slideBounds(s, r)).toEqual({ x: 150, y: 50, w: 100, h: 200 });
    const g: Group = { id: 'g', kind: 'group', name: 'g', x: 100, y: 0, w: 200, h: 100, childBox: { x: 0, y: 0, w: 100, h: 50 }, children: [box('c', 50, 0, 50, 50)] };
    const s2 = storeWith([g]);
    expect(slideBounds(s2, g.children[0]!)).toEqual({ x: 200, y: 0, w: 100, h: 100 });
    s2.sel = ['c'];
    alignShapes(s2, 'left', true);
    expect(g.children[0]!.x).toBe(-50);
  });
});

describe('size and rotation', () => {
  it('rotates and wraps', () => {
    const a = box('a', 0, 0);
    rotateBy(a, -90); expect(a.rot).toBe(270);
    rotateBy(a, 90); expect(a.rot).toBeUndefined();
  });
  it('resizes tables proportionally', () => {
    const t: Table = { id: 't', kind: 'table', name: 't', x: 0, y: 0, w: 200, h: 80, cols: [100, 100], rows: [{ h: 40, cells: [] }, { h: 40, cells: [] }] };
    resize(t, 400, 160);
    expect(t.cols).toEqual([200, 200]);
    expect(t.rows.map((r) => r.h)).toEqual([80, 80]);
  });
});

describe('fill, line and quick styles', () => {
  it('fills shapes inside groups and lines keep defaults', () => {
    const g: Group = { id: 'g', kind: 'group', name: 'g', x: 0, y: 0, w: 200, h: 100, children: [box('x', 0, 0)] };
    const s = storeWith([g]);
    s.sel = ['g'];
    applyFill(s, { type: 'solid', color: '#FF0000' });
    expect((g.children[0] as AutoShape).fill).toEqual({ type: 'solid', color: '#FF0000' });
    applyLine(s, { width: 3 });
    expect((g.children[0] as AutoShape).line?.width).toBe(3);
    expect((g.children[0] as AutoShape).line?.fill.type).toBe('solid');
  });
  it('has 42 quick styles that set fill, line and text', () => {
    expect(QUICK_STYLE_COUNT).toBe(42);
    const a = box('a', 0, 0, 100, 50, 'Hi');
    const s = storeWith([a]);
    s.sel = ['a'];
    applyQuickStyle(s, 8);
    expect(a.fill).toEqual(quickStyle(8).fill);
    expect(a.text!.paras[0]!.runs[0]!.style?.color).toEqual({ theme: 'bg1' });
  });
  it('sets alpha on colours', () => {
    expect(withAlpha('#112233', 0.5)).toEqual({ hex: '#112233', alpha: 0.5 });
    expect(withAlpha({ theme: 'accent1', alpha: 0.5 }, 1)).toEqual({ theme: 'accent1' });
  });
});

describe('find and replace', () => {
  const deck = () => {
    const d = newDeck();
    d.slides[0]!.shapes = [box('a', 0, 0, 100, 50, 'Cat and cat'), box('b', 0, 0, 100, 50, 'concatenate')];
    d.slides[0]!.notes = { paras: [{ runs: [{ text: 'cat note' }] }] };
    return d;
  };
  it('finds with case and whole-word options', () => {
    expect(findAll(deck(), 'cat', {}).length).toBe(3);
    expect(findAll(deck(), 'cat', { matchCase: true }).length).toBe(2);
    expect(findAll(deck(), 'cat', { wholeWord: true }).length).toBe(2);
    expect(findAll(deck(), 'cat', { wholeWord: true, notes: true }).length).toBe(3);
  });
  it('replaces across runs keeping the first run style', () => {
    const p: Paragraph = { runs: [{ text: 'Hel', style: { bold: true } }, { text: 'lo world' }] };
    replaceRange(p, 1, 5, 'EY');
    expect(p.runs).toEqual([{ text: 'HEY', style: { bold: true } }, { text: ' world' }]);
  });
  it('replaces all in one go', () => {
    const d = deck();
    expect(replaceAll(d, 'cat', 'dog', { wholeWord: true })).toBe(2);
    expect((d.slides[0]!.shapes[0] as AutoShape).text!.paras[0]!.runs[0]!.text).toBe('dog and dog');
    expect((d.slides[0]!.shapes[1] as AutoShape).text!.paras[0]!.runs[0]!.text).toBe('concatenate');
  });
  it('searches tables', () => {
    const d = newDeck();
    d.slides[0]!.shapes = [{ id: 't', kind: 'table', name: 't', x: 0, y: 0, w: 100, h: 40, cols: [100], rows: [{ h: 40, cells: [{ text: { paras: [{ runs: [{ text: 'hello' }] }] } }] }] }];
    const h = findAll(d, 'ell', {});
    expect(h[0]).toMatchObject({ shape: 't', cell: { r: 0, c: 0 }, start: 1 });
  });
});

describe('fonts', () => {
  it('lists and replaces fonts including theme fonts', () => {
    const d = newDeck();
    d.slides[0]!.shapes = [box('a', 0, 0, 100, 50, 'x')];
    (d.slides[0]!.shapes[0] as AutoShape).text!.paras[0]!.runs[0]!.style = { font: 'Arial' };
    expect(fontsInDeck(d)).toEqual(['Aptos', 'Aptos Display', 'Arial']);
    expect(replaceFont(d, 'Aptos', 'Inter')).toBeGreaterThan(0);
    expect(d.masters[0]!.theme.fonts.minor).toBe('Inter');
    replaceFont(d, 'arial', 'Lato');
    expect((d.slides[0]!.shapes[0] as AutoShape).text!.paras[0]!.runs[0]!.style?.font).toBe('Lato');
  });
});

describe('mixed values', () => {
  it('reports shared and mixed', () => {
    expect(common([1, 1], (x) => x)).toBe(1);
    expect(common([1, 2], (x) => x)).toBe(MIXED);
    expect(common([], (x) => x)).toBeUndefined();
  });
});
