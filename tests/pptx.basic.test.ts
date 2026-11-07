import { describe, expect, it } from 'vitest';
import { newDeck, newSlide } from '../src/model/defaults';
import { textBody, uid, type AutoShape, type Deck } from '../src/model/deck';
import { readPptx, writePptx } from '../src/formats/pptx';
import { asShape, byName, checkPackage, parts, roundTrip, textOfShape } from './pptx.helpers';

const deckWithText = (): Deck => {
  const d = newDeck();
  const s = d.slides[0]!;
  const title = s.shapes.find((x) => x.ph?.type === 'ctrTitle') as AutoShape;
  title.text = textBody('Hello & <welcome>');
  return d;
};

describe('pptx package', () => {
  it('writes a valid package', () => {
    const d = deckWithText();
    const bytes = writePptx(d);
    expect(checkPackage(bytes)).toEqual([]);
    const p = parts(bytes);
    expect(p['ppt/presentation.xml']).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
    expect(p['[Content_Types].xml']).toContain('presentationml.presentation.main+xml');
    expect(Object.keys(p).filter((k) => k.startsWith('ppt/slideLayouts/') && k.endsWith('.xml'))).toHaveLength(d.masters[0]!.layouts.length);
  });

  it('keeps text, size, layouts and the master on save and reopen', () => {
    const d = deckWithText();
    const r = roundTrip(d);
    expect(r.w).toBe(1280);
    expect(r.h).toBe(720);
    expect(r.masters).toHaveLength(1);
    expect(r.masters[0]!.layouts.map((l) => l.type)).toEqual(d.masters[0]!.layouts.map((l) => l.type));
    const t = r.slides[0]!.shapes.find((x) => x.ph?.type === 'ctrTitle');
    expect(textOfShape(t)).toBe('Hello & <welcome>');
    const layout = r.masters[0]!.layouts.find((l) => l.id === r.slides[0]!.layout)!;
    expect(layout.type).toBe('title');
  });

  it('templates and shows use their own main content type', () => {
    const p = parts(writePptx(newDeck(), { kind: 'template' }));
    expect(p['[Content_Types].xml']).toContain('presentationml.template.main+xml');
    const s = parts(writePptx(newDeck(), { kind: 'show' }));
    expect(s['[Content_Types].xml']).toContain('presentationml.slideshow.main+xml');
  });

  it('round-trips many slides with layouts', () => {
    const d = newDeck();
    for (const l of d.masters[0]!.layouts) d.slides.push(newSlide(l));
    const r = roundTrip(d);
    expect(r.slides).toHaveLength(d.slides.length);
    r.slides.forEach((s, i) => {
      const want = d.masters[0]!.layouts.find((l) => l.id === d.slides[i]!.layout)!.name;
      const got = r.masters[0]!.layouts.find((l) => l.id === s.layout)!.name;
      expect(got).toBe(want);
    });
  });

  it('never throws on junk', () => {
    expect(() => readPptx(new Uint8Array([1, 2, 3]))).toThrow();
    const d = deckWithText();
    d.slides[0]!.shapes.push({ id: uid('s'), kind: 'shape', name: 'Box', geom: 'rect', x: 1, y: 2, w: 30, h: 40 });
    const r = roundTrip(d);
    expect(asShape(byName(r.slides[0]!.shapes, 'Box')).w).toBe(30);
  });
});
