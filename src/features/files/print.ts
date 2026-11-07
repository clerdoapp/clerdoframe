// Printing: lays out pages, renders slides to images and prints them from a hidden iframe.
import type { Deck } from '../../model/deck';
import { layoutPages, type PageOptions } from '../../formats/pages';

export interface PrintOptions extends PageOptions { color: 'color' | 'gray' | 'bw' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const printDeck = async (deck: Deck, o: PrintOptions, onProgress?: (done: number, total: number) => void): Promise<void> => {
  const { renderSlideToCanvas } = await import('../../formats/raster');
  const pages = layoutPages(deck, o);
  const need = [...new Set(pages.flatMap((p) => p.items.flatMap((i) => (i.type === 'slide' ? [i.index] : []))))];
  const urls = new Map<number, string>();
  let k = 0;
  const gs = o.color === 'gray' ? 'gray' : o.color === 'bw' ? 'bw' : undefined;
  for (const i of need) {
    const c = await renderSlideToCanvas(deck, i, Math.min(2400, deck.w * 1.6), gs ? { grayscale: gs } : {});
    urls.set(i, c.toDataURL('image/png'));
    onProgress?.(++k, need.length);
  }
  const first = pages[0] ?? { w: 612, h: 792 };
  const body = pages.map((p) => `<section class="page" style="width:${p.w}pt;height:${p.h}pt">${p.items.map((it) => {
    if (it.type === 'slide') return `<img src="${urls.get(it.index) ?? ''}" style="left:${it.x}pt;top:${it.y}pt;width:${it.w}pt;height:${it.h}pt${it.frame ? ';outline:0.75pt solid #999' : ''}">`;
    if (it.type === 'rule') return `<i style="left:${it.x}pt;top:${it.y}pt;width:${it.w}pt"></i>`;
    return `<div style="left:${it.x}pt;top:${it.y}pt;width:${it.w}pt;font-size:${it.size}pt;${it.bold ? 'font-weight:700;' : ''}">${it.lines.map(esc).join('<br>')}</div>`;
  }).join('')}</section>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(deck.props.title ?? 'Presentation')}</title><style>
@page { size: ${first.w}pt ${first.h}pt; margin: 0 }
html, body { margin: 0; padding: 0; font-family: 'Hanken Grotesk', Arial, sans-serif; color: #111 }
.page { position: relative; overflow: hidden; page-break-after: always; break-after: page }
.page > * { position: absolute }
.page i { border-top: 0.5pt solid #aaa; height: 0 }
.page div { line-height: 1.25; white-space: pre-wrap }
</style></head><body>${body}</body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  await new Promise<void>((res) => {
    const imgs = Array.from(doc.images);
    let left = imgs.length;
    if (!left) { res(); return; }
    for (const im of imgs) { if (im.complete) { if (--left === 0) res(); } else im.onload = im.onerror = () => { if (--left === 0) res(); }; }
  });
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 60_000);
};
