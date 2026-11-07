/** Reading files from the device and turning them into pictures and media shapes. */
import type { FrameStore } from '../../app/store';
import { uid, type Id, type Media, type Picture, type Shape } from '../../model/deck';

export const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml|avif|x-icon)$/;
export const VIDEO_TYPES = /^video\//;
export const AUDIO_TYPES = /^audio\//;
/** Caps a single inserted file so a stray huge file can't exhaust memory. */
export const MAX_FILE = 1024 * 1024 * 1024;

const EXT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac', weba: 'audio/webm',
};
export const typeOf = (f: { name: string; type: string }): string => f.type || EXT_TYPES[f.name.toLowerCase().split('.').pop() ?? ''] || 'application/octet-stream';

/** Opens the system file picker. Resolves to [] when cancelled. */
export const pickFiles = (accept: string, multiple = true): Promise<File[]> => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.style.display = 'none';
  let done = false;
  const finish = (files: File[]) => { if (done) return; done = true; input.remove(); resolve(files); };
  input.addEventListener('change', () => finish([...(input.files ?? [])]));
  input.addEventListener('cancel', () => finish([]));
  document.body.appendChild(input);
  input.click();
});

export const readBytes = async (f: Blob): Promise<Uint8Array> => new Uint8Array(await f.arrayBuffer());

/** Natural size of an image, or null when it can't be decoded. */
export const imageSize = (url: string): Promise<{ w: number; h: number } | null> => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight || img.naturalWidth } : { w: 300, h: 200 });
  img.onerror = () => resolve(null);
  img.src = url;
});

/** Fits w x h inside a box keeping the ratio; never upscales past 1:1 unless asked. */
export const fit = (w: number, h: number, bw: number, bh: number, upscale = false): { w: number; h: number } => {
  const k = Math.min(bw / w, bh / h, upscale ? Infinity : 1);
  return { w: Math.max(1, w * k), h: Math.max(1, h * k) };
};

export interface Loaded { id: Id; w: number; h: number; name: string }

/** Stores an image file's bytes and measures it. */
export const loadImage = async (store: FrameStore, f: File | Blob, name = (f as File).name ?? 'Picture'): Promise<Loaded | null> => {
  if (f.size > MAX_FILE) { store.notify(`${name} is too large to insert.`); return null; }
  const type = typeOf({ name, type: f.type });
  if (!IMAGE_TYPES.test(type)) return null;
  const data = await readBytes(f);
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  try {
    const size = await imageSize(url);
    if (!size) { store.notify(`${name} could not be read as a picture.`); return null; }
    const id = store.addMedia(type, name, data);
    return { id, ...size, name };
  } finally { URL.revokeObjectURL(url); }
};

export const newPicture = (media: Id, x: number, y: number, w: number, h: number, name: string): Picture => ({
  id: uid('s'), kind: 'picture', media, x, y, w, h, name: name.replace(/\.[a-z0-9]+$/i, '') || 'Picture', alt: '',
});

/** Grabs a poster frame (first frame, or 1s in) from a video as PNG bytes. */
export const posterFrame = (data: Uint8Array, type: string): Promise<{ png: Uint8Array; w: number; h: number; duration: number } | null> => new Promise((resolve) => {
  if (typeof document === 'undefined') { resolve(null); return; }
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const v = document.createElement('video');
  let settled = false;
  const done = (r: { png: Uint8Array; w: number; h: number; duration: number } | null) => { if (settled) return; settled = true; URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(r); };
  const timer = setTimeout(() => done(null), 8000);
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 0) / 10); };
  v.onseeked = () => {
    clearTimeout(timer);
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) { done(null); return; }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    try {
      c.getContext('2d')!.drawImage(v, 0, 0, w, h);
      c.toBlob((b) => { if (!b) { done(null); return; } void b.arrayBuffer().then((ab) => done({ png: new Uint8Array(ab), w, h, duration: v.duration })); }, 'image/png');
    } catch { done(null); }
  };
  v.onerror = () => { clearTimeout(timer); done(null); };
  v.src = url;
});

/** Audio icon used as the poster for audio shapes: a speaker drawn as SVG. */
const AUDIO_POSTER = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#5a5f6b" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect width="24" height="24" fill="#ffffff" stroke="none"/><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;

/** Creates a media shape (video or audio) from bytes, with a poster when one can be made. */
export const makeMedia = async (store: FrameStore, data: Uint8Array, type: string, name: string): Promise<Media | null> => {
  if (data.length > MAX_FILE) { store.notify(`${name} is too large to insert.`); return null; }
  const video = VIDEO_TYPES.test(type);
  const media = store.addMedia(type, name, data);
  let w = 96, h = 96, poster: Id | undefined;
  if (video) {
    const p = await posterFrame(data, type);
    if (p) {
      poster = store.addMedia('image/png', `${name} poster.png`, p.png);
      const f = fit(p.w, p.h, store.deck.w * 0.6, store.deck.h * 0.6, true);
      w = f.w; h = f.h;
    } else { w = 480; h = 270; }
  } else {
    poster = store.addMedia('image/svg+xml', 'audio.svg', new TextEncoder().encode(AUDIO_POSTER));
    w = 64; h = 64;
  }
  return {
    id: uid('s'), kind: 'media', mediaType: video ? 'video' : 'audio', media, ...(poster ? { poster } : {}),
    name: name.replace(/\.[a-z0-9]+$/i, '') || (video ? 'Video' : 'Audio'),
    x: (store.deck.w - w) / 2, y: (store.deck.h - h) / 2, w, h,
  };
};

/** Places shapes on the current surface, as one undo step, and selects them. */
export const placeShapes = (store: FrameStore, label: string, shapes: Shape[]): boolean => {
  if (!shapes.length) return false;
  return store.tryChange(label, () => {
    store.shapes().push(...shapes);
    store.sel = shapes.map((s) => s.id);
    store.editing = null;
  });
};

/** Records with MediaRecorder; returns stop() which resolves to the recorded blob. */
export const record = (stream: MediaStream, prefer: string[]): { stop: () => Promise<Blob>; type: string } => {
  const type = prefer.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(250);
  return {
    type: type || rec.mimeType,
    stop: () => new Promise<Blob>((resolve) => {
      rec.onstop = () => { for (const t of stream.getTracks()) t.stop(); resolve(new Blob(chunks, { type: (type || rec.mimeType).split(';')[0] })); };
      if (rec.state !== 'inactive') rec.stop(); else rec.onstop(new Event('stop'));
    }),
  };
};
