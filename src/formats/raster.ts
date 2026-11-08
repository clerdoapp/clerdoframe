// Browser-only: draws slides to a canvas through a standalone SVG image (media and fonts inlined
// as data URLs, since an SVG used as an image can't load anything else). Loaded lazily.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Deck, Slide } from '../model/deck';
import { fontHooks } from '../render/inherit';
import { mediaUrl } from '../render/paint';
import { SlideView } from '../render/SlideView';

const b64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

let fontCss: Promise<string> | null = null;
let fontRuleCount = -1;
const countFontRules = (): number => {
  let n = 0;
  for (const sheet of Array.from(document.styleSheets)) { try { for (const r of Array.from(sheet.cssRules)) if (r instanceof CSSFontFaceRule) n++; } catch { /* other origin */ } }
  return n;
};
/** Keeps only the @font-face rules for families the markup names. */
const usedFontRules = (css: string, markup: string): string =>
  css.split(/(?=@font-face)/).filter((r) => { const fam = /font-family:\s*["']?([^"';]+?)["']?\s*;/.exec(r)?.[1]; return !fam || markup.includes(fam); }).join('');

/** @font-face rules of the page with their font files inlined (fetched from our own origin only). */
export const inlineFonts = (): Promise<string> => {
  // Fonts loaded since the last pass (the font library loads them on first use) need a new pass.
  const n = countFontRules();
  if (n !== fontRuleCount) { fontRuleCount = n; fontCss = null; }
  fontCss ??= (async () => {
    const rules: [string, string][] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let list: CSSRuleList;
      try { list = sheet.cssRules; } catch { continue; }
      // url()s are relative to the stylesheet, not the page.
      for (const r of Array.from(list)) if (r instanceof CSSFontFaceRule) rules.push([r.cssText, sheet.href ?? location.href]);
    }
    const urlRe = /url\(["']?([^"')]+)["']?\)/g;
    const out: string[] = [];
    for (const [rule, base] of rules) {
      // Only latin subsets: keeps the image small.
      // Browsers may write the range short (U+0-FF).
      if (/unicode-range/.test(rule) && !/U\+0{1,4}-0{0,2}FF\b/i.test(rule)) continue;
      let css = rule;
      for (const m of rule.matchAll(urlRe)) {
        const href = m[1]!;
        if (href.startsWith('data:')) continue;
        let abs: URL;
        try { abs = new URL(href, base); } catch { continue; }
        if (abs.origin !== location.origin) { css = ''; break; }
        try {
          const r = await fetch(abs.href);
          const buf = new Uint8Array(await r.arrayBuffer());
          css = css.replace(href, `data:font/woff2;base64,${b64(buf)}`);
        } catch { css = ''; break; }
      }
      if (css) out.push(css);
    }
    return out.join('\n');
  })();
  return fontCss;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Standalone SVG markup for a slide at width px. */
export const slideSvg = async (deck: Deck, slide: Slide, width: number, opts: { fonts?: boolean; grayscale?: 'gray' | 'bw' } = {}): Promise<string> => {
  let svg = renderToStaticMarkup(createElement(SlideView, { deck, slide, width, mode: 'print', ...(opts.grayscale ? { grayscale: opts.grayscale } : {}) }));
  // Object URLs -> data URLs.
  for (const [id, m] of Object.entries(deck.media)) {
    const url = mediaUrl(deck, id);
    if (url && svg.includes(url)) svg = svg.split(url).join(`data:${m.type};base64,${b64(m.data)}`);
  }
  if (!svg.includes('xmlns:xlink')) svg = svg.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
  if (opts.fonts !== false) {
    if (fontHooks.beforeExport) await fontHooks.beforeExport(deck).catch(() => undefined);
    const css = usedFontRules(await inlineFonts(), svg);
    if (css) svg = svg.replace(/(<svg[^>]*>)/, `$1<style>${esc(css)}</style>`);
  }
  return svg;
};

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error('The slide could not be drawn.'));
  img.src = src;
});

/** Draws slide `index` into a new canvas `width` px wide. */
export const renderSlideToCanvas = async (deck: Deck, slideIndex: number, width: number, opts: { grayscale?: 'gray' | 'bw'; background?: string } = {}): Promise<HTMLCanvasElement> => {
  const slide = deck.slides[slideIndex];
  if (!slide) throw new Error('No such slide.');
  const w = Math.max(16, Math.round(width)), h = Math.max(16, Math.round((width * deck.h) / deck.w));
  const svg = await slideSvg(deck, slide, w, opts);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = opts.background ?? '#ffffff';
    g.fillRect(0, 0, w, h);
    try { g.drawImage(img, 0, 0, w, h); } catch { /* a tainted image leaves the slide blank */ }
    return c;
  } finally { URL.revokeObjectURL(url); }
};

export const canvasBytes = (c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality = 0.92): Promise<Uint8Array> =>
  new Promise((res, rej) => c.toBlob(async (b) => { if (!b) { rej(new Error('The image could not be made.')); return; } res(new Uint8Array(await b.arrayBuffer())); }, type, quality));
