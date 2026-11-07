/**
 * Offline layout suggestions: rearranges a slide's own title, text and pictures into a set of
 * alternative designs. Everything is computed from the slide; nothing leaves the device.
 */
import { textOf, uid, type AutoShape, type Color, type Deck, type Fill, type Picture, type Shape, type Slide } from '../../model/deck';

export interface Idea { id: string; name: string; slide: Slide }

const isTitle = (s: Shape) => !!s.ph && (s.ph.type === 'title' || s.ph.type === 'ctrTitle');
const isBody = (s: Shape): s is AutoShape => s.kind === 'shape' && !isTitle(s) && !(s.ph && ['dt', 'ftr', 'sldNum'].includes(s.ph.type)) && !!textOf(s.text).trim();
const th = (theme: 'accent1' | 'accent2' | 'tx1' | 'tx2' | 'bg1' | 'bg2', lum?: number, alpha?: number): Color => ({ theme, ...(lum ? { lum } : {}), ...(alpha !== undefined ? { alpha } : {}) });

const deco = (name: string, x: number, y: number, w: number, h: number, fill: Fill, geom = 'rect'): AutoShape =>
  ({ id: uid('s'), kind: 'shape', name, geom, x, y, w, h, fill, decorative: true });

/** Paints title or body text a fixed colour and alignment for the idea. */
const restyle = (s: AutoShape, opts: { color?: Color; align?: 'l' | 'ctr' | 'r'; size?: number; vAlign?: 't' | 'ctr' | 'b'; bold?: boolean; noBullet?: boolean }): AutoShape => {
  const text = structuredClone(s.text ?? { paras: [{ runs: [] }] });
  for (const p of text.paras) {
    p.style = { ...(p.style ?? {}), ...(opts.align ? { align: opts.align } : {}), ...(opts.noBullet ? { bullet: { type: 'none' as const }, marginLeft: 0, indent: 0 } : {}), defRun: { ...(p.style?.defRun ?? {}), ...(opts.color ? { color: opts.color } : {}), ...(opts.size ? { size: opts.size } : {}), ...(opts.bold ? { bold: true } : {}) } };
  }
  if (opts.vAlign) text.vAlign = opts.vAlign;
  return { ...s, text };
};

const box = <T extends Shape>(s: T, x: number, y: number, w: number, h: number): T => ({ ...structuredClone(s), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });

/** Fits a picture inside a box by cropping (cover), keeping its aspect ratio. */
const cover = (p: Picture, x: number, y: number, w: number, h: number): Picture => {
  const c = p.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const srcW = p.w / Math.max(0.01, 1 - c.l - c.r), srcH = p.h / Math.max(0.01, 1 - c.t - c.b);
  const ar = srcW / srcH, tr = w / h;
  let crop = { l: 0, t: 0, r: 0, b: 0 };
  if (ar > tr) { const k = (1 - tr / ar) / 2; crop = { l: k, t: 0, r: k, b: 0 }; } else if (ar < tr) { const k = (1 - ar / tr) / 2; crop = { l: 0, t: k, r: 0, b: k }; }
  return { ...structuredClone(p), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), crop };
};

/** Design ideas for a slide. Returns an empty list when there's nothing to arrange. */
export const designIdeas = (deck: Deck, slide: Slide): Idea[] => {
  const W = deck.w, H = deck.h;
  const title = slide.shapes.find((s): s is AutoShape => isTitle(s) && s.kind === 'shape');
  const bodies = slide.shapes.filter(isBody);
  const pics = slide.shapes.filter((s): s is Picture => s.kind === 'picture');
  const rest = slide.shapes.filter((s) => s !== title && !bodies.includes(s as AutoShape) && !pics.includes(s as Picture) && !(s.kind === 'shape' && !textOf(s.text).trim() && s.ph));
  if (!title && !bodies.length && !pics.length) return [];
  const body = bodies[0];
  const extraBodies = bodies.slice(1);
  const m = Math.round(W * 0.06), gap = Math.round(W * 0.03);
  const out: Idea[] = [];
  const make = (id: string, name: string, shapes: Shape[], bg?: Fill) => {
    const s: Slide = { ...structuredClone(slide), shapes: [...shapes, ...extraBodies.map((b, i) => box(b, m + i * 12, H * 0.82, W - 2 * m, H * 0.1)), ...rest.map((x) => structuredClone(x))] };
    if (bg) s.background = { fill: bg };
    out.push({ id, name, slide: s });
  };
  const titleH = H * 0.18;
  const isCover = !body && !pics.length;
  const pic = pics[0];

  if (pic) {
    const half = W * 0.46;
    // Picture on the left, text on the right.
    make('picLeft', 'Picture left', [
      cover(pic, 0, 0, half, H),
      ...(title ? [box(restyle(title, { align: 'l', vAlign: 'b' }), half + gap, m, W - half - gap - m, titleH)] : []),
      ...(body ? [box(body, half + gap, m + titleH + gap / 2, W - half - gap - m, H - titleH - 2 * m - gap / 2)] : []),
    ]);
    make('picRight', 'Picture right', [
      cover(pic, W - half, 0, half, H),
      deco('Accent bar', W - half - 10, 0, 10, H, { type: 'solid', color: th('accent1') }),
      ...(title ? [box(restyle(title, { align: 'l', vAlign: 'b' }), m, m, W - half - gap - m, titleH)] : []),
      ...(body ? [box(body, m, m + titleH + gap / 2, W - half - gap - m - 10, H - titleH - 2 * m - gap / 2)] : []),
    ]);
    // Full-bleed picture with a dark band for the text.
    make('fullBleed', 'Full picture', [
      cover(pic, 0, 0, W, H),
      deco('Overlay', 0, H * 0.55, W, H * 0.45, { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: th('tx1', 0, 0) }, { pos: 0.45, color: th('tx1', 0, 0.6) }, { pos: 1, color: th('tx1', 0, 0.85) }] }),
      ...(title ? [box(restyle(title, { color: '#FFFFFF', align: 'l', vAlign: 'b' }), m, H * 0.6, W - 2 * m, H * 0.2)] : []),
      ...(body ? [box(restyle(body, { color: '#FFFFFF' }), m, H * 0.8, W - 2 * m, H * 0.16)] : []),
    ]);
    // Picture inside a rounded card.
    make('picCard', 'Framed picture', [
      deco('Panel', W * 0.52, 0, W * 0.48, H, { type: 'solid', color: th('accent1', 0.8) }),
      { ...cover(pic, W * 0.58, H * 0.12, W * 0.36, H * 0.76), geom: 'roundRect' },
      ...(title ? [box(restyle(title, { align: 'l', vAlign: 'b' }), m, m, W * 0.42, titleH)] : []),
      ...(body ? [box(body, m, m + titleH + gap / 2, W * 0.42, H - titleH - 2 * m)] : []),
    ]);
    if (pics.length > 1) {
      const n = Math.min(pics.length, 6), cols = n <= 3 ? n : Math.ceil(n / 2), rows = n <= 3 ? 1 : 2;
      const top = title ? m + titleH : m, gh = H - top - m, cw = (W - 2 * m - gap * (cols - 1)) / cols, ch = (gh - gap * (rows - 1)) / rows;
      make('grid', 'Picture grid', [
        ...(title ? [box(restyle(title, { align: 'ctr' }), m, m * 0.6, W - 2 * m, titleH)] : []),
        ...pics.slice(0, n).map((p, i) => cover(p, m + (i % cols) * (cw + gap), top + Math.floor(i / cols) * (ch + gap), cw, ch)),
        ...pics.slice(n).map((p) => structuredClone(p)),
      ]);
      out[out.length - 1]!.slide.shapes = out[out.length - 1]!.slide.shapes.filter((s) => s !== body);
      if (body) out[out.length - 1]!.slide.shapes.push(box(body, m, H - m - H * 0.12, W - 2 * m, H * 0.12));
    }
  }

  // Title band across the top.
  make('band', 'Title band', [
    deco('Band', 0, 0, W, titleH + m, { type: 'solid', color: th('accent1') }),
    ...(title ? [box(restyle(title, { color: th('bg1'), align: 'l', vAlign: 'ctr' }), m, m * 0.4, W - 2 * m, titleH + m * 0.2)] : []),
    ...(body ? [box(body, m, titleH + m + gap, pic ? W * 0.5 - m : W - 2 * m, H - titleH - 2 * m - gap)] : []),
    ...(pic ? [cover(pic, W * 0.54, titleH + m + gap, W * 0.46 - m, H - titleH - 2 * m - gap)] : []),
  ]);
  // Split colour block: title on a coloured left panel.
  make('split', 'Color block', [
    deco('Block', 0, 0, W * 0.36, H, { type: 'solid', color: th('tx2') }),
    deco('Accent', W * 0.36, 0, 8, H, { type: 'solid', color: th('accent1') }),
    ...(title ? [box(restyle(title, { color: th('bg1'), align: 'l', vAlign: 'ctr' }), m * 0.8, m, W * 0.36 - m * 1.6, H - 2 * m)] : []),
    ...(body ? [box(body, W * 0.36 + gap + 8, m, W * 0.64 - gap - m - 8, H - 2 * m)] : []),
    ...(pic && !body ? [cover(pic, W * 0.36 + gap + 8, m, W * 0.64 - gap - m - 8, H - 2 * m)] : []),
  ]);
  // Centred hero.
  make('hero', 'Centered', [
    deco('Glow', W * 0.15, -H * 0.4, W * 0.7, H * 0.9, { type: 'gradient', kind: 'radial', angle: 0, stops: [{ pos: 0, color: th('accent1', 0, 0.22) }, { pos: 1, color: th('accent1', 0, 0) }] }, 'ellipse'),
    ...(title ? [box(restyle(title, { align: 'ctr', vAlign: 'b', size: isCover ? 54 : undefined }), m * 2, H * 0.2, W - 4 * m, H * 0.3)] : []),
    deco('Rule', W / 2 - 40, H * 0.52, 80, 5, { type: 'solid', color: th('accent1') }),
    ...(body ? [box(restyle(body, { align: 'ctr', noBullet: true }), m * 2, H * 0.56, W - 4 * m, H * 0.36)] : []),
    ...(pic ? [cover(pic, W / 2 - H * 0.14, H * 0.03, H * 0.28, H * 0.16)] : []),
  ]);
  // Quote: large quotation mark and the text in italic-like display.
  if (body || isCover) {
    const q = restyle(body ?? title!, { align: 'l', size: 30, noBullet: true });
    make('quote', 'Quote', [
      deco('Quote mark', m, m * 0.6, H * 0.22, H * 0.22, { type: 'solid', color: th('accent1') }, 'ellipse'),
      { ...deco('Quote glyph', m, m * 0.6, H * 0.22, H * 0.22, { type: 'none' }), text: { paras: [{ runs: [{ text: '“' }], style: { align: 'ctr', defRun: { size: Math.round(H * 0.16), color: th('bg1'), bold: true, font: 'Georgia' } } }], vAlign: 'ctr' } } as AutoShape,
      box(q, m + H * 0.26, m, W - 2 * m - H * 0.26, H * 0.62),
      ...(title && body ? [box(restyle(title, { align: 'l', size: 20, color: th('accent1') }), m + H * 0.26, H * 0.7, W - 2 * m - H * 0.26, H * 0.12)] : []),
      ...(pic ? [cover(pic, W - m - H * 0.18, H - m - H * 0.18, H * 0.18, H * 0.18)] : []),
    ]);
  }
  // Side rule with a subtle tinted background.
  make('sidebar', 'Side rule', [
    deco('Rule', m * 0.6, m, 6, H - 2 * m, { type: 'solid', color: th('accent1') }),
    ...(title ? [box(restyle(title, { align: 'l', vAlign: 't' }), m, m, W * 0.34, H - 2 * m)] : []),
    ...(body ? [box(body, m + W * 0.36, m, W - 2 * m - W * 0.36, H - 2 * m)] : []),
    ...(pic && !body ? [cover(pic, m + W * 0.36, m, W - 2 * m - W * 0.36, H - 2 * m)] : []),
  ], { type: 'solid', color: th('bg2') });
  return out.slice(0, 8);
};

/** Title-slide ideas built from the theme accents. */
export const titleIdeas = (deck: Deck, slide: Slide): Idea[] => {
  const W = deck.w, H = deck.h;
  const title = slide.shapes.find((s): s is AutoShape => isTitle(s) && s.kind === 'shape');
  if (!title) return [];
  const sub = slide.shapes.find((s): s is AutoShape => s.kind === 'shape' && s.ph?.type === 'subTitle');
  const others = slide.shapes.filter((s) => s !== title && s !== sub).map((s) => structuredClone(s));
  const m = W * 0.08;
  const mk = (id: string, name: string, shapes: Shape[], bg?: Fill): Idea => ({ id, name, slide: { ...structuredClone(slide), shapes: [...shapes, ...others], ...(bg ? { background: { fill: bg, hideMasterGraphics: true } } : {}) } });
  const t = (o: Parameters<typeof restyle>[1], x: number, y: number, w: number, h: number) => box(restyle(title, o), x, y, w, h);
  const st = (o: Parameters<typeof restyle>[1], x: number, y: number, w: number, h: number) => (sub ? [box(restyle(sub, o), x, y, w, h)] : []);
  return [
    mk('tAccent', 'Accent field', [
      deco('Disc', W * 0.62, H * 0.12, H * 0.9, H * 0.9, { type: 'solid', color: th('accent2', 0, 0.9) }, 'ellipse'),
      ...[t({ color: th('bg1'), align: 'l', vAlign: 'b', size: 54 }, m, H * 0.2, W * 0.6, H * 0.4)], ...st({ color: th('bg1', 0, 0.85), align: 'l' }, m, H * 0.62, W * 0.6, H * 0.2),
    ], { type: 'solid', color: th('accent1') }),
    mk('tDark', 'Dark stage', [
      deco('Rule', m, H * 0.6, 90, 6, { type: 'solid', color: th('accent1') }),
      t({ color: th('bg1'), align: 'l', vAlign: 'b', size: 54 }, m, H * 0.2, W - 2 * m, H * 0.38), ...st({ color: th('accent2', 0.3), align: 'l' }, m, H * 0.64, W - 2 * m, H * 0.2),
    ], { type: 'gradient', kind: 'linear', angle: 135, stops: [{ pos: 0, color: th('tx2') }, { pos: 1, color: th('tx1') }] }),
    mk('tSplit', 'Half and half', [
      deco('Half', 0, 0, W / 2, H, { type: 'solid', color: th('accent1') }),
      deco('Stripe', W / 2, H * 0.7, W / 2, 10, { type: 'solid', color: th('accent2') }),
      t({ color: th('bg1'), align: 'r', vAlign: 'ctr', size: 50 }, m * 0.5, H * 0.15, W / 2 - m, H * 0.7), ...st({ color: th('tx2'), align: 'l' }, W / 2 + m * 0.5, H * 0.3, W / 2 - m, H * 0.36),
    ], { type: 'solid', color: th('bg1') }),
    mk('tFrame', 'Framed', [
      { ...deco('Frame', m * 0.4, m * 0.4, W - m * 0.8, H - m * 0.8, { type: 'none' }), line: { fill: { type: 'solid', color: th('accent1') }, width: 3 } } as AutoShape,
      t({ align: 'ctr', vAlign: 'b', size: 52, color: th('tx2') }, m, H * 0.2, W - 2 * m, H * 0.36), deco('Rule', W / 2 - 50, H * 0.6, 100, 4, { type: 'solid', color: th('accent2') }),
      ...st({ align: 'ctr', color: th('tx1', 0, 0.75) }, m, H * 0.64, W - 2 * m, H * 0.18),
    ], { type: 'solid', color: th('bg1') }),
  ];
};
