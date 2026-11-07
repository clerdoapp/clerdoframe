import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { download } from '../../app/files';
import type { FrameStore } from '../../app/store';
import type { Shape, Slide } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { mediaUrl } from '../../render/paint';
import { slideBounds, topSelected, unionBox, type Box } from './ops';

const toDataUrl = (type: string, data: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
};

/**
 * Replaces HTML text in foreignObjects with SVG <text>, measured from the laid-out DOM.
 * Browsers refuse to draw foreignObject content into a canvas we can read back.
 */
const flattenText = (svg: SVGSVGElement): void => {
  const NS = 'http://www.w3.org/2000/svg';
  for (const fo of [...svg.querySelectorAll('foreignObject')]) {
    const ctm = fo.getScreenCTM();
    const parent = fo.parentNode;
    if (!ctm || !parent) { fo.remove(); continue; }
    const inv = ctm.inverse();
    const local = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(inv);
    const group = document.createElementNS(NS, 'g');
    // Cell backgrounds and borders of tables are drawn as rects first.
    for (const el of fo.querySelectorAll<HTMLElement>('td')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const a = local(r.left, r.top), b = local(r.right, r.bottom);
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(a.x)); rect.setAttribute('y', String(a.y));
        rect.setAttribute('width', String(b.x - a.x)); rect.setAttribute('height', String(b.y - a.y));
        rect.setAttribute('fill', cs.backgroundColor);
        group.appendChild(rect);
      }
    }
    const walker = document.createTreeWalker(fo, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? '';
      const host = n.parentElement;
      if (!text.trim() || !host) continue;
      const cs = getComputedStyle(host);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // Group characters into line pieces by their line box.
      let piece = '', top = NaN, left = 0, bottom = 0;
      const flush = () => {
        if (!piece.trim()) { piece = ''; return; }
        const p0 = local(left, bottom);
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', String(p0.x));
        t.setAttribute('y', String(p0.y - (bottom - top) * 0.22));
        t.setAttribute('font-family', cs.fontFamily);
        t.setAttribute('font-size', cs.fontSize);
        t.setAttribute('font-weight', cs.fontWeight);
        t.setAttribute('font-style', cs.fontStyle);
        t.setAttribute('fill', cs.color === 'rgba(0, 0, 0, 0)' ? 'none' : cs.color);
        if (cs.letterSpacing && cs.letterSpacing !== 'normal') t.setAttribute('letter-spacing', cs.letterSpacing);
        if (cs.textDecorationLine && cs.textDecorationLine !== 'none') t.setAttribute('text-decoration', cs.textDecorationLine);
        t.setAttribute('xml:space', 'preserve');
        t.textContent = piece;
        group.appendChild(t);
        piece = '';
      };
      for (let i = 0; i < text.length; i++) {
        range.setStart(n, i); range.setEnd(n, i + 1);
        const r = range.getClientRects()[0];
        if (!r) { piece += text[i]; continue; }
        if (Number.isNaN(top) || Math.abs(r.top - top) > r.height / 2) { flush(); top = r.top; left = r.left; bottom = r.bottom; }
        piece += text[i];
      }
      flush();
    }
    parent.insertBefore(group, fo);
    fo.remove();
  }
};

/** SVG markup of the given shapes on a transparent background, cropped to their bounds. */
export const selectionSvg = (store: FrameStore, shapes: Shape[], box: Box): string => {
  const cur = store.slide;
  const slide: Slide = { id: 'export', layout: cur?.layout ?? store.deck.masters[0]!.layouts[0]!.id, shapes: structuredClone(shapes), notes: { paras: [] }, animations: [], background: { fill: { type: 'none' }, hideMasterGraphics: true } };
  // Shapes inside groups are exported at their slide position.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(SlideView, { deck: store.deck, slide, mode: 'print', width: store.deck.w })));
    const svg = host.querySelector('svg');
    if (!svg) throw new Error('Nothing to save.');
    const pad = 4;
    svg.setAttribute('viewBox', `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`);
    svg.setAttribute('width', String(Math.ceil(box.w + pad * 2)));
    svg.setAttribute('height', String(Math.ceil(box.h + pad * 2)));
    svg.style.background = 'transparent';
    svg.style.filter = '';
    // Layout graphics are hidden, so the first rect is the (empty) background.
    svg.querySelector(':scope > rect')?.remove();
    flattenText(svg);
    const urls = new Map<string, string>();
    for (const m of Object.values(store.deck.media)) urls.set(m.id, toDataUrl(m.type, m.data));
    for (const img of svg.querySelectorAll('image')) {
      const href = img.getAttribute('href') ?? '';
      if (href.startsWith('blob:')) {
        const id = [...urls.keys()].find((k) => href === mediaUrl(store.deck, k));
        if (id) img.setAttribute('href', urls.get(id)!);
      }
    }
    return new XMLSerializer().serializeToString(svg);
  } finally {
    root.unmount();
    host.remove();
  }
};


/** Exports the selection as a PNG (SVG when the browser won't draw it to a canvas). */
export const savePicture = async (store: FrameStore): Promise<void> => {
  const shapes = topSelected(store);
  if (!shapes.length) return;
  const placed = shapes.map((s) => {
    const b = slideBounds(store, { ...s, rot: 0 });
    return { ...structuredClone(s), x: b.x, y: b.y, w: b.w, h: b.h } as Shape;
  });
  const box = unionBox(shapes.map((s) => slideBounds(store, s)));
  const name = `${(shapes.length === 1 ? shapes[0]!.name : 'Picture') || 'Picture'}`.replace(/[\\/:*?"<>|]/g, '');
  let svg: string;
  try { svg = selectionSvg(store, placed, box); } catch (e) { store.notify(e instanceof Error ? e.message : 'That could not be saved.'); return; }
  const scale = 2;
  try {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('draw')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((res) => { try { c.toBlob(res, 'image/png'); } catch { res(null); } });
    if (!blob) throw new Error('tainted');
    download(`${name}.png`, blob);
  } catch {
    download(`${name}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
    store.notify('Saved as SVG because this browser could not draw the text into a PNG.');
  }
};
