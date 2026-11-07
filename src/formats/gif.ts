// A small animated GIF89a encoder: fixed 256-colour palette (6x7x6 colour cube + greys),
// ordered dithering and LZW compression. Small sizes are the target.

const PALETTE: [number, number, number][] = (() => {
  const p: [number, number, number][] = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) p.push([Math.round((r * 255) / 5), Math.round((g * 255) / 6), Math.round((b * 255) / 5)]);
  while (p.length < 256) { const v = Math.round(((p.length - 252) * 255) / 3); p.push([v, v, v]); }
  return p;
})();

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5));

/** Maps RGBA pixels to palette indexes. */
export const quantize = (rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array => {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = BAYER[(y & 3) * 4 + (x & 3)]!;
      const q = (v: number, levels: number) => Math.max(0, Math.min(levels - 1, Math.round((v / 255) * (levels - 1) + d * 0.9)));
      out[y * w + x] = q(rgba[i]!, 6) * 42 + q(rgba[i + 1]!, 7) * 6 + q(rgba[i + 2]!, 6);
    }
  }
  return out;
};

const lzw = (pixels: Uint8Array, minCode = 8): Uint8Array => {
  const clear = 1 << minCode, eoi = clear + 1;
  const out: number[] = [];
  let bits = 0, acc = 0, size = minCode + 1;
  const emit = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) { out.push(acc & 255); acc >>= 8; bits -= 8; }
  };
  let dict = new Map<number, number>();
  let next = eoi + 1;
  emit(clear);
  let prefix = pixels[0] ?? 0;
  for (let i = 1; i < pixels.length; i++) {
    const c = pixels[i]!;
    const key = (prefix << 8) | c;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      next = eoi + 1;
      size = minCode + 1;
    }
    prefix = c;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(acc & 255);
  return Uint8Array.from(out);
};

export interface GifFrame { rgba: Uint8ClampedArray | Uint8Array; delayMs: number }

export const encodeGif = (w: number, h: number, frames: GifFrame[], loop = true): Uint8Array => {
  const b: number[] = [];
  const u16 = (v: number) => { b.push(v & 255, (v >> 8) & 255); };
  const str = (s: string) => { for (const c of s) b.push(c.charCodeAt(0)); };
  str('GIF89a');
  u16(w); u16(h);
  b.push(0xf7, 0, 0);
  for (const [r, g, bl] of PALETTE) b.push(r, g, bl);
  if (loop) { b.push(0x21, 0xff, 11); str('NETSCAPE2.0'); b.push(3, 1); u16(0); b.push(0); }
  for (const f of frames) {
    b.push(0x21, 0xf9, 4, 0x04); u16(Math.max(2, Math.round(f.delayMs / 10))); b.push(0, 0);
    b.push(0x2c); u16(0); u16(0); u16(w); u16(h); b.push(0);
    b.push(8);
    const data = lzw(quantize(f.rgba, w, h));
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); b.push(n); for (let k = 0; k < n; k++) b.push(data[i + k]!); }
    b.push(0);
  }
  b.push(0x3b);
  return Uint8Array.from(b);
};

/** Decodes the first frame's LZW data back to indexes (used by tests to check the encoder). */
export const decodeLzw = (data: Uint8Array, minCode: number, count: number): Uint8Array => {
  const clear = 1 << minCode, eoi = clear + 1;
  const out = new Uint8Array(count);
  let o = 0, size = minCode + 1, pos = 0;
  let dict: number[][] = [];
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = []; size = minCode + 1; };
  reset();
  const read = () => { let v = 0; for (let i = 0; i < size; i++) { const bit = (data[(pos >> 3)]! >> (pos & 7)) & 1; v |= bit << i; pos++; } return v; };
  let prev: number[] | null = null;
  while (pos + size <= data.length * 8 && o < count) {
    const code = read();
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) break;
    let entry: number[];
    if (dict[code]) entry = dict[code]!;
    else if (prev) entry = [...prev, prev[0]!];
    else break;
    for (const v of entry) if (o < count) out[o++] = v;
    if (prev) { dict.push([...prev, entry[0]!]); if (dict.length >= (1 << size) && size < 12) size++; }
    prev = entry;
  }
  return out;
};
