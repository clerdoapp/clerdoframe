import { describe, expect, it } from 'vitest';
import { FrameStore } from '../src/app/store';
import { newDeck } from '../src/model/defaults';
import type { AutoShape } from '../src/model/deck';
import { tx, txActive } from '../src/features/format/bridge';

const store = () => {
  const s = new FrameStore(newDeck());
  const a: AutoShape = { id: 'a', kind: 'shape', geom: 'rect', name: 'a', x: 0, y: 0, w: 100, h: 50, text: { paras: [{ runs: [{ text: 'hello world' }] }, { runs: [{ text: 'second LINE' }] }] } };
  s.deck.slides[0]!.shapes = [a];
  s.sel = ['a'];
  return { s, a };
};

describe('text fallbacks on whole shapes', () => {
  it('toggles bold in one undo step', () => {
    const { s, a } = store();
    tx(s, 'text.bold');
    expect(a.text!.paras.every((p) => p.runs[0]!.style?.bold)).toBe(true);
    expect(txActive(s, 'text.bold')).toBe(true);
    tx(s, 'text.bold');
    expect(txActive(s, 'text.bold')).toBe(false);
    s.undo(); s.undo();
    expect((s.shape('a') as AutoShape).text!.paras[0]!.runs[0]!.style).toBeUndefined();
  });
  it('grows font size through the size steps', () => {
    const { s, a } = store();
    tx(s, 'text.grow');
    expect(a.text!.paras[0]!.runs[0]!.style?.size).toBe(20);
    tx(s, 'text.size', 11);
    tx(s, 'text.shrink');
    expect(a.text!.paras[0]!.runs[0]!.style?.size).toBe(10.5);
  });
  it('changes case', () => {
    const { s, a } = store();
    tx(s, 'text.case', 'title');
    expect(a.text!.paras.map((p) => p.runs[0]!.text)).toEqual(['Hello World', 'Second Line']);
    tx(s, 'text.case', 'sentence');
    expect(a.text!.paras.map((p) => p.runs[0]!.text)).toEqual(['Hello world', 'Second line']);
  });
  it('sets bullets, alignment, line spacing and body props', () => {
    const { s, a } = store();
    tx(s, 'text.numberStyle', 'romanUcPeriod');
    expect(a.text!.paras[1]!.style?.bullet).toEqual({ type: 'auto', scheme: 'romanUcPeriod' });
    expect(txActive(s, 'text.numbering')).toBe(true);
    tx(s, 'text.alignCenter');
    expect(txActive(s, 'text.alignCenter')).toBe(true);
    tx(s, 'text.lineSpacing', 150);
    expect(a.text!.paras[0]!.style?.lineSpacing).toBe(150);
    tx(s, 'text.vAlign', 'b');
    tx(s, 'text.columns', 2);
    expect(a.text!.vAlign).toBe('b');
    expect(a.text!.columns).toBe(2);
    tx(s, 'text.columns', 1);
    expect(a.text!.columns).toBeUndefined();
    tx(s, 'text.indent');
    expect(a.text!.paras[0]!.style?.level).toBe(1);
  });
  it('clears formatting but keeps links', () => {
    const { s, a } = store();
    a.text!.paras[0]!.runs[0]!.style = { bold: true, link: { url: 'https://example.org' } };
    tx(s, 'text.clear');
    expect(a.text!.paras[0]!.runs[0]!.style).toEqual({ link: { url: 'https://example.org' } });
  });
});
