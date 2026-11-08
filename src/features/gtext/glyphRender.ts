import { charCategories } from './charsData';
import { normalizeBitmap, type Glyph } from './glyphMatch';

/** Renders the drawable candidates (letters, digits and symbols, not emoji) once, in slices, and caches them. */

const SIZE = 64;
const FONT = `${SIZE * 0.72}px "Hanken Grotesk", "Arimo", "Tinos", system-ui, "Segoe UI Symbol", sans-serif`;
let cache: Promise<{ glyph: Glyph; item: string }[]> | null = null;

const candidates = (): string[] => {
  const out = new Set<string>();
  for (let n = 0x21; n <= 0x7e; n++) out.add(String.fromCharCode(n));
  for (const c of charCategories()) if (c.group !== 'emoji') for (const ch of c.chars) out.add(ch);
  return [...out];
};

const same = (a: Glyph, b: Glyph) => a.bin.length === b.bin.length && a.bin.every((v, i) => v === b.bin[i]);

export const glyphCandidates = (onProgress?: (done: number, total: number) => void): Promise<{ glyph: Glyph; item: string }[]> => {
  cache ??= (async () => {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return [];
    g.font = FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const render = (c: string): Glyph | null => {
      g.clearRect(0, 0, SIZE, SIZE);
      g.fillStyle = '#000';
      g.fillText(c, SIZE / 2, SIZE / 2);
      const d = g.getImageData(0, 0, SIZE, SIZE).data;
      const a = new Uint8Array(SIZE * SIZE);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]!;
      return normalizeBitmap(a, SIZE, SIZE, 96, 1);
    };
    // Characters no font has come out as the same empty box; leave those out.
    const missing = [render('￿'), render('\u{10FFFD}')].filter((x): x is Glyph => !!x);
    const list = candidates();
    const out: { glyph: Glyph; item: string }[] = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      const gl = render(c);
      if (gl && !missing.some((m) => same(m, gl))) out.push({ glyph: gl, item: c });
      if (i % 250 === 249) { onProgress?.(i + 1, list.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    onProgress?.(list.length, list.length);
    return out;
  })();
  return cache;
};
