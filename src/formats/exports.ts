// Browser exports that need slide pictures (PDF, PNG/JPEG, SVG, GIF, video). Loaded lazily.
import { zipSync, type Zippable } from 'fflate';
import type { Deck } from '../model/deck';
import { encodeGif } from './gif';
import { layoutPages, pickSlides, type PageOptions } from './pages';
import { pdfPages, writePdf, type PdfImage } from './pdf';
import { canvasBytes, renderSlideToCanvas, slideSvg } from './raster';

export type Progress = (done: number, total: number) => void;

/** JPEG size: width from DPI, image width = page width in inches * dpi. */
export const exportPdf = async (deck: Deck, o: PageOptions & { dpi?: number; quality?: number; grayscale?: boolean }, progress?: Progress): Promise<Uint8Array> => {
  const pages = layoutPages(deck, o);
  const need = [...new Set(pages.flatMap((p) => p.items.filter((i) => i.type === 'slide').map((i) => (i as { index: number }).index)))];
  const images: PdfImage[] = [];
  const at = new Map<number, number>();
  const dpi = o.dpi ?? 150;
  const px = Math.min(3840, Math.round((deck.w / 96) * dpi));
  let k = 0;
  for (const i of need) {
    const c = await renderSlideToCanvas(deck, i, px, o.grayscale ? { grayscale: 'gray' } : {});
    images.push({ jpeg: await canvasBytes(c, 'image/jpeg', o.quality ?? 0.9), width: c.width, height: c.height });
    at.set(i, images.length - 1);
    progress?.(++k, need.length);
  }
  const p = deck.props;
  return writePdf({ pages: pdfPages(pages, (i) => at.get(i)), images, ...(p.title ? { title: p.title } : {}), ...(p.author ? { author: p.author } : {}), ...(p.subject ? { subject: p.subject } : {}), ...(p.keywords ? { keywords: p.keywords } : {}) });
};

export interface ImageExportOptions { type: 'png' | 'jpeg'; width: number; slides: 'current' | 'all'; current: number; hidden?: boolean }

/** One image, or a zip of every slide's image. */
export const exportImages = async (deck: Deck, o: ImageExportOptions, progress?: Progress): Promise<{ data: Uint8Array; ext: string; mime: string }> => {
  const mime = o.type === 'png' ? 'image/png' : 'image/jpeg';
  if (o.slides === 'current') {
    const c = await renderSlideToCanvas(deck, o.current, o.width);
    return { data: await canvasBytes(c, mime), ext: o.type === 'png' ? 'png' : 'jpg', mime };
  }
  const idx = pickSlides(deck, { hidden: o.hidden ?? false });
  const files: Zippable = {};
  let k = 0;
  for (const i of idx) {
    const c = await renderSlideToCanvas(deck, i, o.width);
    files[`Slide${i + 1}.${o.type === 'png' ? 'png' : 'jpg'}`] = [await canvasBytes(c, mime), { level: 0 }];
    progress?.(++k, idx.length);
  }
  return { data: zipSync(files), ext: 'zip', mime: 'application/zip' };
};

export const exportSvg = async (deck: Deck, index: number): Promise<Uint8Array> => {
  const s = deck.slides[index];
  if (!s) throw new Error('No such slide.');
  return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n${await slideSvg(deck, s, deck.w)}`);
};

export interface MotionOptions { width: number; seconds: number; useTimings: boolean; hidden?: boolean; fps?: number; fade?: number }

const slideTime = (deck: Deck, i: number, o: MotionOptions): number => {
  const s = deck.slides[i]!;
  if (o.useTimings) return s.transition?.advanceAfter ?? s.timing ?? o.seconds;
  return o.seconds;
};

/** An animated GIF with a cross-fade between slides. Keep sizes small. */
export const exportGif = async (deck: Deck, o: MotionOptions, progress?: Progress): Promise<Uint8Array> => {
  const idx = pickSlides(deck, { hidden: o.hidden ?? false });
  const frames: { rgba: Uint8ClampedArray; delayMs: number }[] = [];
  const canvases: HTMLCanvasElement[] = [];
  let k = 0;
  for (const i of idx) { canvases.push(await renderSlideToCanvas(deck, i, o.width)); progress?.(++k, idx.length); }
  const w = canvases[0]?.width ?? 16, h = canvases[0]?.height ?? 16;
  const mix = document.createElement('canvas');
  mix.width = w; mix.height = h;
  const g = mix.getContext('2d', { willReadFrequently: true })!;
  const steps = o.fade === 0 ? 0 : 4;
  canvases.forEach((c, n) => {
    g.globalAlpha = 1;
    g.drawImage(c, 0, 0);
    frames.push({ rgba: g.getImageData(0, 0, w, h).data, delayMs: slideTime(deck, idx[n]!, o) * 1000 });
    const next = canvases[n + 1];
    if (next) for (let t = 1; t <= steps; t++) {
      g.globalAlpha = 1; g.drawImage(c, 0, 0);
      g.globalAlpha = t / (steps + 1); g.drawImage(next, 0, 0);
      frames.push({ rgba: g.getImageData(0, 0, w, h).data, delayMs: 60 });
    }
  });
  return encodeGif(w, h, frames, true);
};

/** A .webm video: each slide shown for its time, with cross-fades. Uses the browser's encoder. */
export const exportVideo = async (deck: Deck, o: MotionOptions, progress?: Progress): Promise<Uint8Array> => {
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record video.');
  const idx = pickSlides(deck, { hidden: o.hidden ?? false });
  const canvases: HTMLCanvasElement[] = [];
  for (const i of idx) canvases.push(await renderSlideToCanvas(deck, i, o.width));
  const w = canvases[0]?.width ?? 16, h = canvases[0]?.height ?? 16;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d')!;
  const fps = o.fps ?? 30;
  const stream = out.captureStream(fps);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('This browser cannot record video.');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(16_000_000, w * h * 6) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>((res) => { rec.onstop = () => res(); });
  const fade = o.fade ?? 0.6;
  const times = idx.map((i) => Math.max(0.5, slideTime(deck, i, o)));
  const total = times.reduce((a, b) => a + b, 0);
  rec.start(250);
  const start = performance.now();
  await new Promise<void>((res) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= total) { res(); return; }
      let acc = 0, n = 0;
      while (n < times.length - 1 && acc + times[n]! <= t) acc += times[n++]!;
      const local = t - acc, len = times[n]!;
      g.globalAlpha = 1;
      g.drawImage(canvases[n]!, 0, 0);
      const next = canvases[n + 1];
      if (next && local > len - fade) { g.globalAlpha = Math.min(1, (local - (len - fade)) / fade); g.drawImage(next, 0, 0); }
      progress?.(Math.round(t * 10), Math.round(total * 10));
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await done;
  return new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
};
