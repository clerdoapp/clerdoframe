import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../src/model/deck';
import {
  changeCaseRange, deleteRange, insertBreak, insertParas, insertText, normalizePara, paraLen, rangeText, sliceParas, splitAt,
  splitParagraph, styleAt, styleParas, styleRange, wordEdge, charStep,
} from '../src/features/editor/textModel';

const P = (...runs: Paragraph['runs']): Paragraph => ({ runs });
const txt = (ps: Paragraph[]) => ps.map((p) => p.runs.map((r) => (r.br ? '|' : r.text)).join('')).join('/');
const at = (p: number, o: number) => ({ p, o });
const R = (a: [number, number], b: [number, number]) => ({ start: at(...a), end: at(...b) });

describe('text model', () => {
  it('splits runs at offsets and merges equal neighbours', () => {
    const p = P({ text: 'Hello', style: { bold: true } }, { text: ' world' });
    expect(splitAt(p, 2)).toBe(1);
    expect(p.runs.map((r) => r.text)).toEqual(['He', 'llo', ' world']);
    normalizePara(p);
    expect(p.runs.map((r) => r.text)).toEqual(['Hello', ' world']);
  });

  it('types with the style of the run before the caret', () => {
    const ps = [P({ text: 'ab', style: { bold: true } }, { text: 'cd' })];
    const c = insertText(ps, R([0, 2], [0, 2]), 'X');
    expect(c).toEqual(at(0, 3));
    expect(ps[0]!.runs).toEqual([{ text: 'abX', style: { bold: true } }, { text: 'cd' }]);
    insertText(ps, R([0, 0], [0, 0]), 'Z');
    expect(ps[0]!.runs[0]).toEqual({ text: 'ZabX', style: { bold: true } });
  });

  it('replaces a selection across paragraphs', () => {
    const ps = [P({ text: 'first' }), P({ text: 'second' }), P({ text: 'third' })];
    const c = insertText(ps, R([0, 2], [2, 3]), 'XY');
    expect(txt(ps)).toBe('fiXYrd');
    expect(c).toEqual(at(0, 4));
  });

  it('inserts newlines as paragraphs and \\v as line breaks', () => {
    const ps: Paragraph[] = [{ runs: [{ text: 'ab' }], style: { align: 'ctr' } }];
    const c = insertText(ps, R([0, 1], [0, 1]), '1\n2\v3');
    expect(txt(ps)).toBe('a1/2|3b');
    expect(ps[1]!.style).toEqual({ align: 'ctr' });
    expect(c).toEqual(at(1, 3));
  });

  it('splits paragraphs keeping paragraph and run style', () => {
    const ps: Paragraph[] = [{ runs: [{ text: 'abc', style: { italic: true } }], style: { level: 1 } }];
    const c = splitParagraph(ps, at(0, 3));
    expect(c).toEqual(at(1, 0));
    expect(ps[1]).toEqual({ runs: [{ text: '', style: { italic: true } }], style: { level: 1 } });
    insertText(ps, R([1, 0], [1, 0]), 'x');
    expect(ps[1]!.runs).toEqual([{ text: 'x', style: { italic: true } }]);
  });

  it('counts line breaks and fields as one character', () => {
    const ps = [P({ text: 'ab' }, { text: '', br: true }, { text: '7', field: 'slidenum' }, { text: 'c' })];
    expect(paraLen(ps[0]!)).toBe(5);
    deleteRange(ps, R([0, 2], [0, 3]));
    expect(txt(ps)).toBe('ab7c');
    expect(ps[0]!.runs[1]!.field).toBe('slidenum');
    const ps2 = [P({ text: 'ab' })];
    insertBreak(ps2, at(0, 1));
    expect(txt(ps2)).toBe('a|b');
  });

  it('joins paragraphs on delete and keeps a styled empty run', () => {
    const ps = [P({ text: 'abc', style: { size: 40 } }), P({ text: 'def' })];
    deleteRange(ps, R([0, 3], [1, 0]));
    expect(txt(ps)).toBe('abcdef');
    const e = [P({ text: 'abc', style: { size: 40 } })];
    deleteRange(e, R([0, 0], [0, 3]));
    expect(e[0]!.runs).toEqual([{ text: '', style: { size: 40 } }]);
    expect(styleAt(e, at(0, 0))).toEqual({ size: 40 });
  });

  it('styles a range, splitting runs, and toggles with functions', () => {
    const ps = [P({ text: 'Hello world' })];
    styleRange(ps, R([0, 6], [0, 11]), { bold: true });
    expect(ps[0]!.runs).toEqual([{ text: 'Hello ' }, { text: 'world', style: { bold: true } }]);
    styleRange(ps, R([0, 0], [0, 11]), (cur) => ({ size: (cur.size ?? 18) + 2 }));
    expect(ps[0]!.runs).toEqual([{ text: 'Hello ', style: { size: 20 } }, { text: 'world', style: { bold: true, size: 20 } }]);
    styleRange(ps, R([0, 0], [0, 11]), { bold: undefined });
    expect(ps[0]!.runs).toEqual([{ text: 'Hello world', style: { size: 20 } }]);
  });

  it('styles paragraphs', () => {
    const ps = [P({ text: 'a' }), P({ text: 'b' }), P({ text: 'c' })];
    styleParas(ps, [1, 2], { align: 'r' });
    expect(ps.map((p) => p.style?.align)).toEqual([undefined, 'r', 'r']);
    styleParas(ps, [1], { align: undefined });
    expect(ps[1]!.style).toBeUndefined();
  });

  it('reads and copies ranges', () => {
    const ps = [P({ text: 'one', style: { bold: true } }, { text: 'two' }), P({ text: 'three' })];
    expect(rangeText(ps, R([0, 1], [1, 2]))).toBe('netwo\nth');
    const sl = sliceParas(ps, R([0, 1], [1, 2]));
    expect(sl).toEqual([{ runs: [{ text: 'ne', style: { bold: true } }, { text: 'two' }] }, { runs: [{ text: 'th' }] }]);
    const dst = [P({ text: 'XY' })];
    const c = insertParas(dst, R([0, 1], [0, 1]), sl);
    expect(txt(dst)).toBe('Xnetwo/thY');
    expect(dst[0]!.runs[1]).toEqual({ text: 'ne', style: { bold: true } });
    expect(c).toEqual(at(1, 2));
  });

  it('changes case', () => {
    const ps = [P({ text: 'hello ', style: { bold: true } }, { text: 'WORLD. again' })];
    changeCaseRange(ps, R([0, 0], [0, 18]), 'title');
    expect(txt(ps)).toBe('Hello World. Again');
    expect(ps[0]!.runs[0]!.style).toEqual({ bold: true });
    changeCaseRange(ps, R([0, 0], [0, 18]), 'sentence');
    expect(txt(ps)).toBe('Hello world. Again');
    changeCaseRange(ps, R([0, 0], [0, 5]), 'toggle');
    expect(txt(ps)).toBe('hELLO world. Again');
    changeCaseRange(ps, R([0, 0], [0, 18]), 'upper');
    expect(txt(ps)).toBe('HELLO WORLD. AGAIN');
  });

  it('finds word edges and steps over surrogate pairs', () => {
    const p = P({ text: 'one two  three' });
    expect(wordEdge(p, 5, -1)).toBe(4);
    expect(wordEdge(p, 4, 1)).toBe(7);
    expect(wordEdge(p, 7, 1)).toBe(14);
    const e = P({ text: 'a\u{1F600}b' });
    expect(charStep(e, 3, -1)).toBe(1);
    expect(charStep(e, 1, 1)).toBe(3);
  });
});
