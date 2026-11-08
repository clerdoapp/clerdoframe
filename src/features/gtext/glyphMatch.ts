/**
 * Draw-to-search: compares a drawing with characters rendered as small bitmaps. Both are cropped
 * to their ink, scaled to fit an N x N grid (keeping proportions), thickened, and compared with a
 * symmetric chamfer distance (how far each one's ink is from the other's on average).
 */

export const N = 32;

export interface Glyph {
  /** N*N, 1 where there is ink. */
  bin: Uint8Array;
  /** Distance from each cell to the nearest ink, in cells. */
  dt: Float32Array;
  /** Indexes of the ink cells. */
  ink: Uint16Array;
  /** Width / height of the ink before scaling. */
  aspect: number;
}

export interface Pt { x: number; y: number }

/** Two-pass 3-4 chamfer distance transform (distances in cells). */
export const distanceTransform = (bin: Uint8Array, n = N): Float32Array => {
  const INF = 1e6;
  const d = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) d[i] = bin[i] ? 0 : INF;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    let v = d[i]!;
    if (x > 0) v = Math.min(v, d[i - 1]! + 3);
    if (y > 0) {
      v = Math.min(v, d[i - n]! + 3);
      if (x > 0) v = Math.min(v, d[i - n - 1]! + 4);
      if (x < n - 1) v = Math.min(v, d[i - n + 1]! + 4);
    }
    d[i] = v;
  }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
    const i = y * n + x;
    let v = d[i]!;
    if (x < n - 1) v = Math.min(v, d[i + 1]! + 3);
    if (y < n - 1) {
      v = Math.min(v, d[i + n]! + 3);
      if (x < n - 1) v = Math.min(v, d[i + n + 1]! + 4);
      if (x > 0) v = Math.min(v, d[i + n - 1]! + 4);
    }
    d[i] = v;
  }
  for (let i = 0; i < n * n; i++) d[i] = d[i]! >= INF ? n : d[i]! / 3;
  return d;
};

const dilate = (bin: Uint8Array, n = N): Uint8Array => {
  const out = new Uint8Array(bin);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!bin[y * n + x]) continue;
    if (x > 0) out[y * n + x - 1] = 1;
    if (x < n - 1) out[y * n + x + 1] = 1;
    if (y > 0) out[(y - 1) * n + x] = 1;
    if (y < n - 1) out[(y + 1) * n + x] = 1;
  }
  return out;
};

export const makeGlyph = (bin: Uint8Array, aspect: number): Glyph => {
  const ink: number[] = [];
  for (let i = 0; i < bin.length; i++) if (bin[i]) ink.push(i);
  return { bin, dt: distanceTransform(bin), ink: Uint16Array.from(ink), aspect };
};

/**
 * Normalises a coverage bitmap (values 0..255, w x h): crops to the ink, scales it to fit N x N
 * with a margin keeping its proportions, centres it and thickens it. Null when there is no ink.
 */
export const normalizeBitmap = (alpha: ArrayLike<number>, w: number, h: number, threshold = 96, thicken = 1): Glyph | null => {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[y * w + x]! >= threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const margin = 2;
  const s = (N - margin * 2) / Math.max(bw, bh);
  const ow = Math.max(1, Math.round(bw * s)), oh = Math.max(1, Math.round(bh * s));
  const ox = Math.floor((N - ow) / 2), oy = Math.floor((N - oh) / 2);
  let bin: Uint8Array = new Uint8Array(N * N);
  // Each output cell is ink when any source pixel it covers is ink, so thin strokes survive shrinking.
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const sx0 = x0 + Math.floor(x / s), sx1 = Math.min(x1, x0 + Math.ceil((x + 1) / s) - 1);
    const sy0 = y0 + Math.floor(y / s), sy1 = Math.min(y1, y0 + Math.ceil((y + 1) / s) - 1);
    let hit = 0;
    for (let yy = sy0; yy <= Math.max(sy0, sy1) && !hit; yy++) for (let xx = sx0; xx <= Math.max(sx0, sx1); xx++) if (alpha[yy * w + xx]! >= threshold) { hit = 1; break; }
    if (hit) bin[(oy + y) * N + ox + x] = 1;
  }
  for (let i = 0; i < thicken; i++) bin = dilate(bin);
  return makeGlyph(bin, bw / bh);
};

/** Rasterises pen strokes (any coordinates) to a coverage bitmap of size `size` and normalises it. */
export const glyphFromStrokes = (strokes: Pt[][], size = 128, width = 7): Glyph | null => {
  const pts = strokes.flat();
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const span = Math.max(x1 - x0, y1 - y0, 1e-6);
  const pad = width;
  const s = (size - pad * 2) / span;
  // Dots and short dashes keep their real proportions instead of being blown up to fill the grid.
  const tiny = span < 8;
  const k = tiny ? Math.min(s, (size - pad * 2) / 16) : s;
  const ox = (size - (x1 - x0) * k) / 2, oy = (size - (y1 - y0) * k) / 2;
  const a = new Uint8Array(size * size);
  const r = width / 2;
  const stamp = (cx: number, cy: number) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(size - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size - 1, Math.ceil(cx + r)); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) a[y * size + x] = 255;
  };
  for (const st of strokes) {
    const q = st.map((p) => ({ x: ox + (p.x - x0) * k, y: oy + (p.y - y0) * k }));
    if (q.length === 1) stamp(q[0]!.x, q[0]!.y);
    for (let i = 1; i < q.length; i++) {
      const p0 = q[i - 1]!, p1 = q[i]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y) / 1.5));
      for (let j = 0; j <= steps; j++) stamp(p0.x + ((p1.x - p0.x) * j) / steps, p0.y + ((p1.y - p0.y) * j) / steps);
    }
  }
  return normalizeBitmap(a, size, size, 128, 0);
};

/** Lower is more alike. */
export const glyphDistance = (a: Glyph, b: Glyph): number => {
  if (!a.ink.length || !b.ink.length) return Infinity;
  let ab = 0, ba = 0;
  for (const i of a.ink) ab += b.dt[i]!;
  for (const i of b.ink) ba += a.dt[i]!;
  const chamfer = ab / a.ink.length + ba / b.ink.length;
  const shape = Math.abs(Math.log(Math.max(0.05, a.aspect) / Math.max(0.05, b.aspect)));
  return chamfer + shape * 1.5;
};

/** The k candidates most like the query, best first. */
export const rankGlyphs = <T,>(query: Glyph, candidates: { glyph: Glyph; item: T }[], k = 30): { item: T; score: number }[] =>
  candidates.map((c) => ({ item: c.item, score: glyphDistance(query, c.glyph) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => a.score - b.score)
    .slice(0, k);
