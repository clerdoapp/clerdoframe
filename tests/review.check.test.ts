import { describe, expect, it } from 'vitest';
import { newDeck, newSlide } from '../src/model/defaults';
import type { AutoShape, Deck } from '../src/model/deck';
import { accessibility, contrast, replaceIn, spots, stats, wordsOf } from '../src/features/review/check';
import { unused } from '../src/features/review/tools';

const deck = (): Deck => {
  const d = newDeck();
  const obj = d.masters[0]!.layouts.find((l) => l.type === 'obj')!;
  d.slides = [newSlide(obj), newSlide(obj)];
  (d.slides[0]!.shapes[0] as AutoShape).text = { paras: [{ runs: [{ text: 'Same' }] }] };
  (d.slides[0]!.shapes[1] as AutoShape).text = { paras: [{ runs: [{ text: 'Hello ' }, { text: 'wrold', style: { bold: true } }] }] };
  (d.slides[1]!.shapes[0] as AutoShape).text = { paras: [{ runs: [{ text: 'Same' }] }] };
  d.slides[1]!.notes = { paras: [{ runs: [{ text: 'four words in notes' }] }] };
  return d;
};

describe('review checks', () => {
  it('counts words, paragraphs and notes', () => {
    const st = stats(deck());
    expect(st.slides).toBe(2);
    expect(st.words).toBe(4);
    expect(st.notesWords).toBe(4);
  });

  it('finds words and replaces across runs keeping styles', () => {
    const d = deck();
    const body = (d.slides[0]!.shapes[1] as AutoShape).text!;
    const w = wordsOf(body).find((x) => x.word === 'wrold')!;
    replaceIn(body.paras[0]!, w.start, w.word.length, 'world');
    expect(body.paras[0]!.runs[1]).toEqual({ text: 'world', style: { bold: true } });
    expect(spots(d).filter((s) => s.notes)).toHaveLength(2);
  });

  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#FFFFFF')).toBeLessThan(4.5);
  });

  it('reports duplicate titles, missing titles, alt text, contrast and tables', () => {
    const d = deck();
    d.slides.push(newSlide(d.masters[0]!.layouts.find((l) => l.type === 'blank')!));
    d.slides[0]!.shapes.push({ id: 'p', kind: 'picture', name: 'Photo', media: 'm', x: 0, y: 0, w: 10, h: 10 });
    d.slides[1]!.shapes.push({ id: 't', kind: 'shape', geom: 'rect', name: 'Pale', x: 0, y: 0, w: 10, h: 10, text: { paras: [{ runs: [{ text: 'faint', style: { color: '#EEEEEE', size: 12 } }] }] } });
    d.slides[1]!.shapes.push({ id: 'tb', kind: 'table', name: 'Table', x: 0, y: 0, w: 10, h: 10, cols: [10], rows: [{ h: 10, cells: [{ text: { paras: [] } }] }] });
    const kinds = new Set(accessibility(d).map((i) => i.kind));
    for (const k of ['dupTitle', 'title', 'alt', 'contrast', 'tableHeader']) expect(kinds).toContain(k);
    d.slides[0]!.shapes.find((x) => x.id === 'p')!.decorative = true;
    expect(accessibility(d).some((i) => i.kind === 'alt')).toBe(false);
  });

  it('finds media nothing uses', () => {
    const d = deck();
    d.media = { a: { id: 'a', type: 'image/png', name: 'a', data: new Uint8Array(3) }, b: { id: 'b', type: 'image/png', name: 'b', data: new Uint8Array(3) } };
    d.slides[0]!.shapes.push({ id: 'p', kind: 'picture', name: 'P', media: 'a', x: 0, y: 0, w: 1, h: 1 });
    expect(unused(d).media).toEqual(['b']);
  });
});
