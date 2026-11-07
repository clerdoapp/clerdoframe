import { describe, expect, it } from 'vitest';
import { newDeck, newSlide } from '../src/model/defaults';
import { textOf, type AutoShape, type Deck } from '../src/model/deck';
import { applyOutline, demote, joinUp, outlineOf, promote, splitLine } from '../src/features/views/outline';
import { defaultPages, readPages, writePages } from '../src/features/views/pages';

const deck = (): Deck => {
  const d = newDeck();
  const obj = d.masters[0]!.layouts.find((l) => l.type === 'obj')!;
  d.slides = [newSlide(obj), newSlide(obj)];
  const set = (i: number, title: string, body: string[]) => {
    (d.slides[i]!.shapes[0] as AutoShape).text = { paras: [{ runs: [{ text: title }] }] };
    (d.slides[i]!.shapes[1] as AutoShape).text = { paras: body.map((b) => ({ runs: [{ text: b }] })) };
  };
  set(0, 'One', ['a', 'b']);
  set(1, 'Two', ['c']);
  return d;
};
const titles = (d: Deck) => d.slides.map((s) => textOf((s.shapes[0] as AutoShape).text));
const bodies = (d: Deck) => d.slides.map((s) => textOf((s.shapes.find((x) => x.ph?.type === 'body') as AutoShape | undefined)?.text));

describe('outline', () => {
  it('reads titles and body paragraphs by level', () => {
    const lines = outlineOf(deck());
    expect(lines.map((l) => [l.level, l.text])).toEqual([[0, 'One'], [1, 'a'], [1, 'b'], [0, 'Two'], [1, 'c']]);
  });

  it('Enter in a title creates a new slide after its bullets', () => {
    const d = deck();
    const r = splitLine(outlineOf(d), 0, 3);
    applyOutline(d, r.lines, r.focus);
    expect(titles(d)).toEqual(['One', '', 'Two']);
    expect(bodies(d)[0]).toBe('a\nb');
  });

  it('Tab on a title merges the slide into the previous one', () => {
    const d = deck();
    applyOutline(d, demote(outlineOf(d), 3));
    expect(d.slides).toHaveLength(1);
    expect(bodies(d)[0]).toBe('a\nb\nTwo\nc');
    const body = d.slides[0]!.shapes[1] as AutoShape;
    expect(body.text!.paras[3]!.style?.level).toBe(1);
  });

  it('Shift+Tab on a bullet starts a new slide that takes the bullets after it', () => {
    const d = deck();
    applyOutline(d, promote(outlineOf(d), 1));
    expect(titles(d)).toEqual(['One', 'a', 'Two']);
    expect(bodies(d)).toEqual(['', 'b', 'c']);
  });

  it('Backspace at the start of a title joins it to the line above', () => {
    const d = deck();
    const r = joinUp(outlineOf(d), 3)!;
    applyOutline(d, r.lines, r.focus);
    expect(titles(d)).toEqual(['One']);
    expect(bodies(d)[0]).toBe('a\nbTwo\nc');
  });

  it('keeps styled paragraphs that were not edited', () => {
    const d = deck();
    const body = d.slides[0]!.shapes[1] as AutoShape;
    body.text!.paras[0]!.runs[0]!.style = { bold: true };
    const lines = outlineOf(d);
    lines[4] = { ...lines[4]!, text: 'changed', para: undefined };
    applyOutline(d, lines);
    expect((d.slides[0]!.shapes[1] as AutoShape).text!.paras[0]!.runs[0]!.style?.bold).toBe(true);
    expect(bodies(d)[1]).toBe('changed');
  });
});

describe('page masters', () => {
  it('stores settings as JSON in notesMaster.keep', () => {
    const d = newDeck();
    expect(readPages(d)).toEqual(defaultPages());
    const p = defaultPages(); p.handout.perPage = 3; p.notes.orientation = 'landscape';
    writePages(d, p);
    expect(JSON.parse(d.notesMaster!.keep!['clerdo.pages']!).handout.perPage).toBe(3);
    expect(readPages(d).notes.orientation).toBe('landscape');
  });
});
