// A minimal PDF 1.4 writer (ISO 32000-1 subset): pages with JPEG images (DCTDecode), simple
// Helvetica text and lines. Used for PDF export with slides rasterized as JPEG.
import type { Page } from './pages';

export interface PdfImage { jpeg: Uint8Array; width: number; height: number }
export interface PdfPage {
  w: number;
  h: number;
  /** Drawn in order; coordinates are from the top-left in points. */
  draw: ({ type: 'image'; image: number; x: number; y: number; w: number; h: number } | { type: 'text'; x: number; y: number; size: number; text: string; bold?: boolean } | { type: 'rect'; x: number; y: number; w: number; h: number; stroke?: number } | { type: 'line'; x1: number; y1: number; x2: number; y2: number })[];
}
export interface PdfDoc { pages: PdfPage[]; images: PdfImage[]; title?: string; author?: string; subject?: string; keywords?: string }

const enc = new TextEncoder();

/** WinAnsi-safe text: characters outside Latin-1 become '?'. */
const pdfString = (s: string): string => {
  let out = '(';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const map: Record<number, number> = { 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x20ac: 0x80, 0x2026: 0x85 };
    const b = c < 256 ? c : map[c] ?? 63;
    if (b === 40 || b === 41 || b === 92) out += '\\' + String.fromCharCode(b);
    else if (b < 32 || b > 126) out += '\\' + b.toString(8).padStart(3, '0');
    else out += String.fromCharCode(b);
  }
  return out + ')';
};

/** Info dictionary string: UTF-16BE with BOM so any text survives. */
const infoString = (s: string): string => {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex.toUpperCase()}>`;
};

const n = (v: number): string => (Math.round(v * 100) / 100).toString();

export const writePdf = (doc: PdfDoc): Uint8Array => {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const offsets: number[] = [];
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); size += u.length; };
  const obj = (id: number, body: string | (() => void)) => {
    offsets[id] = size;
    push(`${id} 0 obj\n`);
    if (typeof body === 'string') push(body); else body();
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  // Object ids: 1 catalog, 2 pages, 3 font, 4 bold font, 5 info, then images, then page + content pairs.
  const imgBase = 6;
  const pageBase = imgBase + doc.images.length;
  const kids = doc.pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${doc.pages.length} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const info = [`/Producer ${infoString('ClerdoFrame')}`, doc.title ? `/Title ${infoString(doc.title)}` : '', doc.author ? `/Author ${infoString(doc.author)}` : '', doc.subject ? `/Subject ${infoString(doc.subject)}` : '', doc.keywords ? `/Keywords ${infoString(doc.keywords)}` : ''].filter(Boolean).join(' ');
  obj(5, `<< ${info} >>`);
  doc.images.forEach((im, i) => obj(imgBase + i, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`);
    push(im.jpeg);
    push('\nendstream');
  }));
  doc.pages.forEach((p, i) => {
    const used = new Set<number>();
    let s = '';
    for (const d of p.draw) {
      if (d.type === 'image') { used.add(d.image); s += `q ${n(d.w)} 0 0 ${n(d.h)} ${n(d.x)} ${n(p.h - d.y - d.h)} cm /Im${d.image} Do Q\n`; }
      else if (d.type === 'text') s += `BT /${d.bold ? 'F2' : 'F1'} ${n(d.size)} Tf ${n(d.x)} ${n(p.h - d.y - d.size)} Td ${pdfString(d.text)} Tj ET\n`;
      else if (d.type === 'rect') s += `${n(d.stroke ?? 0.75)} w 0.6 G ${n(d.x)} ${n(p.h - d.y - d.h)} ${n(d.w)} ${n(d.h)} re S\n`;
      else s += `0.5 w 0.7 G ${n(d.x1)} ${n(p.h - d.y1)} m ${n(d.x2)} ${n(p.h - d.y2)} l S\n`;
    }
    const xo = [...used].map((k) => `/Im${k} ${imgBase + k} 0 R`).join(' ');
    obj(pageBase + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.w)} ${n(p.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${pageBase + i * 2 + 1} 0 R >>`);
    const body = enc.encode(s);
    obj(pageBase + i * 2 + 1, () => { push(`<< /Length ${body.length} >>\nstream\n`); push(body); push('\nendstream'); });
  });
  const count = pageBase + doc.pages.length * 2;
  const xref = size;
  let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) x += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  push(x + `trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
};

/** Turns laid-out pages into PDF pages; `imageFor` gives the image index of a slide. */
export const pdfPages = (pages: Page[], imageFor: (slide: number) => number | undefined): PdfPage[] =>
  pages.map((p) => ({
    w: p.w, h: p.h,
    draw: p.items.flatMap((it): PdfPage['draw'] => {
      if (it.type === 'slide') {
        const im = imageFor(it.index);
        const out: PdfPage['draw'] = im === undefined ? [] : [{ type: 'image', image: im, x: it.x, y: it.y, w: it.w, h: it.h }];
        if (it.frame) out.push({ type: 'rect', x: it.x, y: it.y, w: it.w, h: it.h });
        return out;
      }
      if (it.type === 'rule') return [{ type: 'line', x1: it.x, y1: it.y, x2: it.x + it.w, y2: it.y }];
      return it.lines.map((t, k) => ({ type: 'text' as const, x: it.x, y: it.y + k * it.size * 1.25, size: it.size, text: t, ...(it.bold ? { bold: true } : {}) }));
    }),
  }));
