import type { Color, Theme, ThemeColorName } from '../model/deck';

export interface ColorCtx { theme: Theme; /** Colour used for 'phClr' style references. */ ph?: string }

const MAP: Record<string, keyof Theme['colors']> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };

export const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
};
export const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** lum > 0 lightens toward white by that fraction; lum < 0 darkens toward black. */
export const adjustLum = (hex: string, lum: number): string => {
  const [r, g, b] = hexToRgb(hex);
  if (lum >= 0) return rgbToHex(r + (255 - r) * lum, g + (255 - g) * lum, b + (255 - b) * lum);
  const k = 1 + lum;
  return rgbToHex(r * k, g * k, b * k);
};

export const themeHex = (theme: Theme, name: ThemeColorName): string => theme.colors[(MAP[name] ?? name) as keyof Theme['colors']] ?? '#000000';

/** Resolves a model colour to '#RRGGBB' plus alpha (0..1). */
export const resolve = (c: Color | undefined, ctx: ColorCtx, fallback = '#000000'): { hex: string; alpha: number } => {
  if (c === undefined) return { hex: fallback, alpha: 1 };
  if (typeof c === 'string') return { hex: c.startsWith('#') ? c : `#${c}`, alpha: 1 };
  if ('hex' in c) return { hex: c.hex, alpha: c.alpha ?? 1 };
  const base = (c.theme as string) === 'phClr' && ctx.ph ? ctx.ph : themeHex(ctx.theme, c.theme);
  return { hex: c.lum ? adjustLum(base, c.lum) : base, alpha: c.alpha ?? 1 };
};

export const css = (c: Color | undefined, ctx: ColorCtx, fallback = '#000000'): string => {
  const { hex, alpha } = resolve(c, ctx, fallback);
  if (alpha >= 1) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
};

/** The ten-swatch-by-six theme palette shown in colour pickers: base colours plus tints and shades. */
export const THEME_GRID: ThemeColorName[] = ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
export const LUM_STEPS = [0, 0.8, 0.6, 0.4, -0.25, -0.5];
export const DARK_LUM_STEPS = [0, -0.05, -0.15, -0.25, -0.35, -0.5];
