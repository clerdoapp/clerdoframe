import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { newSlide } from '../src/model/defaults';
import { uid, type Deck } from '../src/model/deck';
import { writePdf, pdfPages } from '../src/formats/pdf';
import { layoutPages, pickSlides } from '../src/formats/pages';
import { outlineRtf, outlineText } from '../src/formats/outline';
import { writeOdp } from '../src/formats/odp';
import { decodeLzw, encodeGif, quantize } from '../src/formats/gif';
import { readPptx, writePptx } from '../src/formats/pptx';
import { EXAMPLES, reportDeck, welcomeDeck } from '../src/features/files/examples';
import { DESIGNS, templateDeck } from '../src/features/files/templates';
import { asTemplate, inspect, removeInspected, reuseSlides } from '../src/features/files/ops';
import { checkPackage } from './pptx.helpers';

const deck = (): Deck => {
  const d = reportDeck();
  d.slides[1]!.hidden = true;
  d.slides[0]!.notes = { paras: [{ runs: [{ text: 'Open with the headline number.' }] }] };
  return d;
};

// A tiny valid baseline JPEG (1x1, grey), so the PDF has a real image stream.
const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='), (c) => c.charCodeAt(0));

describe('page layout', () => {
  it('picks ranges and hidden slides', () => {
    const d = deck();
    expect(pickSlides(d, {})).toEqual([0, 2, 3, 4]);
    expect(pickSlides(d, { hidden: true, from: 2, to: 3 })).toEqual([1, 2]);
  });
  it('lays out handouts, notes and outline pages', () => {
    const d = deck();
    const h = layoutPages(d, { kind: 'handouts', perPage: 3, hidden: true });
    expect(h).toHaveLength(2);
    expect(h[0]!.items.filter((i) => i.type === 'slide')).toHaveLength(3);
    expect(h[0]!.items.some((i) => i.type === 'rule')).toBe(true);
    const six = layoutPages(d, { kind: 'handouts', perPage: 6 });
    expect(six).toHaveLength(1);
    const notes = layoutPages(d, { kind: 'notes' });
    expect(notes).toHaveLength(4);
    expect(notes[0]!.items.some((i) => i.type === 'text' && i.lines.join(' ').includes('headline'))).toBe(true);
    const out = layoutPages(d, { kind: 'outline' });
    expect(out[0]!.items.some((i) => i.type === 'text' && i.lines[0]!.includes('Quarterly report'))).toBe(true);
    const slides = layoutPages(d, { kind: 'slides' });
    expect(slides[0]!.w).toBe(960);
  });
});

describe('pdf', () => {
  it('writes a well-formed PDF with images, text and a valid xref', () => {
    const d = deck();
    const pages = layoutPages(d, { kind: 'notes' });
    const bytes = writePdf({ pages: pdfPages(pages, () => 0), images: [{ jpeg: JPEG, width: 1, height: 1 }], title: 'Report — Q3' });
    const s = new TextDecoder('latin1').decode(bytes);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/DCTDecode');
    expect(s).toContain('(Open with the headline number.) Tj');
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBe(4);
    // Each xref offset points at "N 0 obj".
    const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
    const table = s.slice(xref).split('\n').slice(3).filter((l) => /^\d{10} 00000 n/.test(l));
    table.forEach((l, i) => { const off = Number(l.slice(0, 10)); expect(s.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)); });
  });
});

describe('outline', () => {
  it('writes plain text and RTF', () => {
    const d = deck();
    const t = outlineText(d);
    expect(t.split('\n')[0]).toBe('Quarterly report');
    expect(t).toContain('\tRevenue up 14% on last quarter');
    const r = outlineRtf(d);
    expect(r.startsWith('{\\rtf1')).toBe(true);
    expect(r).toContain('\\b\\fs32 Summary');
    expect(outlineRtf({ ...d, slides: [{ ...d.slides[0]!, shapes: [{ id: 'x', kind: 'shape', name: 't', geom: 'rect', x: 0, y: 0, w: 1, h: 1, ph: { type: 'title' }, text: { paras: [{ runs: [{ text: 'Café {x} €' }] }] } }] }] })).toContain("Caf\\u233? \\{x\\} \\u8364?");
  });
});

describe('odp', () => {
  it('writes a package with mimetype first and readable content', () => {
    const d = welcomeDeck();
    const bytes = writeOdp(d);
    // mimetype is the first local file header, stored.
    expect(new TextDecoder().decode(bytes.subarray(30, 38))).toBe('mimetype');
    const z = unzipSync(bytes);
    expect(strFromU8(z.mimetype!)).toBe('application/vnd.oasis.opendocument.presentation');
    const c = strFromU8(z['content.xml']!);
    expect((c.match(/<draw:page /g) ?? []).length).toBe(d.slides.length);
    expect(c).toContain('Welcome to ClerdoFrame');
    expect(strFromU8(z['META-INF/manifest.xml']!)).toContain('content.xml');
  });
});

describe('gif', () => {
  it('encodes frames that decode back to the same palette indexes', () => {
    const w = 8, h = 4;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { rgba[i * 4] = (i * 37) % 256; rgba[i * 4 + 1] = (i * 11) % 256; rgba[i * 4 + 2] = 128; rgba[i * 4 + 3] = 255; }
    const gif = encodeGif(w, h, [{ rgba, delayMs: 500 }, { rgba, delayMs: 500 }]);
    expect(new TextDecoder().decode(gif.subarray(0, 6))).toBe('GIF89a');
    expect(gif.at(-1)).toBe(0x3b);
    // Find the first image descriptor and decode its data.
    let p = 13 + 768 + 19;
    expect(gif[p]).toBe(0x21); p += 8;
    expect(gif[p]).toBe(0x2c); p += 10;
    const min = gif[p++]!;
    const data: number[] = [];
    while (gif[p]) { const n = gif[p++]!; for (let k = 0; k < n; k++) data.push(gif[p++]!); }
    expect(Array.from(decodeLzw(Uint8Array.from(data), min, w * h))).toEqual(Array.from(quantize(rgba, w, h)));
  });
});

describe('templates and examples', () => {
  it('builds every template and example as a valid package that reopens', () => {
    for (const d of DESIGNS) {
      const bytes = writePptx(templateDeck(d));
      expect(checkPackage(bytes)).toEqual([]);
      expect(readPptx(bytes).deck.masters[0]!.theme.name).toBe(d.name);
    }
    for (const e of EXAMPLES) {
      const deckE = e.build();
      const bytes = writePptx(deckE);
      expect(checkPackage(bytes)).toEqual([]);
      expect(readPptx(bytes).deck.slides).toHaveLength(deckE.slides.length);
    }
  });
});

describe('file operations', () => {
  it('inspects and removes comments, hidden slides, off-slide shapes, notes and personal info', () => {
    const d = deck();
    d.props.author = 'Lina';
    d.slides[0]!.comments = [{ id: 'c', author: 'Lina', at: '', text: 'x' }];
    d.slides[0]!.shapes.push({ id: uid('s'), kind: 'shape', name: 'Off', geom: 'rect', x: -500, y: 0, w: 100, h: 100 });
    const r = inspect(d);
    expect(r).toEqual({ comments: 1, hidden: 1, offSlide: 1, notes: 1, personal: true });
    removeInspected(d, { comments: true, hidden: true, offSlide: true, notes: true, personal: true });
    expect(inspect(d)).toEqual({ comments: 0, hidden: 0, offSlide: 0, notes: 0, personal: false });
    expect(d.slides).toHaveLength(4);
  });

  it('reuses slides with or without source formatting', () => {
    const target = welcomeDeck();
    const source = readPptx(writePptx(reportDeck())).deck;
    const n = target.masters.length;
    const plain = reuseSlides(target, source, [1, 2], false);
    expect(plain).toHaveLength(2);
    expect(target.masters).toHaveLength(n);
    for (const s of plain) expect(target.masters[0]!.layouts.some((l) => l.id === s.layout)).toBe(true);
    const kept = reuseSlides(target, source, [0, 3], true);
    expect(target.masters).toHaveLength(n + 1);
    expect(target.masters[n]!.layouts.some((l) => l.id === kept[0]!.layout)).toBe(true);
    target.slides.push(...plain, ...kept, newSlide(target.masters[0]!.layouts[0]!));
    expect(checkPackage(writePptx(target))).toEqual([]);
  });

  it('saves a template without comments or personal details', () => {
    const d = deck();
    d.props.author = 'Lina';
    d.final = true;
    const t = asTemplate(d);
    expect(t.props.author).toBeUndefined();
    expect(t.final).toBeUndefined();
    expect(d.props.author).toBe('Lina');
  });
});
