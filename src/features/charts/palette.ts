import type { Chart, Color, Theme, ThemeColorName } from '../../model/deck';
import { adjustLum, resolve } from '../../render/color';

const ACCENTS: ThemeColorName[] = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];

export interface ColorSet { id: string; label: string }
export const COLOR_SETS: ColorSet[] = [
  { id: 'colorful1', label: 'Colorful 1' }, { id: 'colorful2', label: 'Colorful 2' }, { id: 'colorful3', label: 'Colorful 3' }, { id: 'colorful4', label: 'Colorful 4' },
  ...ACCENTS.map((_, i) => ({ id: `mono${i + 1}`, label: `Shades of accent ${i + 1}` })),
];

const ORDERS: Record<string, number[]> = {
  colorful1: [0, 1, 2, 3, 4, 5],
  colorful2: [1, 2, 3, 4, 5, 0],
  colorful3: [2, 3, 4, 5, 0, 1],
  colorful4: [5, 4, 3, 2, 1, 0],
};
const MONO_LUM = [0, -0.25, 0.4, -0.5, 0.6, 0.2, -0.38, 0.75];
/** Extra series past six reuse the accents, darker then lighter. */
const ROUND_LUM = [0, -0.25, 0.4, -0.5, 0.6];

/** Model colour of series / slice `i` for a colour set. */
export const seriesModelColor = (set: string | undefined, i: number): Color => {
  const id = set ?? 'colorful1';
  const mono = /^mono([1-6])$/.exec(id);
  if (mono) {
    const lum = MONO_LUM[i % MONO_LUM.length]!;
    const name = ACCENTS[+mono[1]! - 1]!;
    return lum ? { theme: name, lum } : { theme: name };
  }
  const order = ORDERS[id] ?? ORDERS.colorful1!;
  const name = ACCENTS[order[i % 6]!]!;
  const lum = ROUND_LUM[Math.floor(i / 6) % ROUND_LUM.length]!;
  return lum ? { theme: name, lum } : { theme: name };
};

export const hexOf = (c: Color | undefined, theme: Theme, fallback = '#000000'): string => resolve(c, { theme }, fallback).hex;

export const seriesHex = (chart: Pick<Chart, 'colors'>, theme: Theme, i: number, own?: Color): string =>
  own ? hexOf(own, theme) : hexOf(seriesModelColor(chart.colors, i), theme);

/** A chart style: background, text and mark treatment. */
export interface ChartStyle {
  label: string;
  bg?: 'none' | 'lt1' | 'lt2' | 'dk2' | 'tint' | 'dark';
  border?: boolean;
  dark?: boolean;
  grid: 'light' | 'none' | 'dashed' | 'strong';
  marks: 'flat' | 'outline' | 'gradient' | 'soft' | 'shadow';
  round?: boolean;
  bold?: boolean;
  labels?: boolean;
  gap?: number;
}

export const CHART_STYLES: ChartStyle[] = [
  { label: 'Clean', grid: 'light', marks: 'flat' },
  { label: 'Framed', bg: 'lt1', border: true, grid: 'light', marks: 'flat', round: true },
  { label: 'Soft', bg: 'lt2', grid: 'none', marks: 'soft', round: true, labels: true },
  { label: 'Outline', grid: 'dashed', marks: 'outline' },
  { label: 'Gradient', grid: 'light', marks: 'gradient', bold: true, round: true },
  { label: 'Raised', bg: 'lt1', border: true, grid: 'light', marks: 'shadow', gap: 0.6 },
  { label: 'Tinted', bg: 'tint', grid: 'none', marks: 'flat', bold: true, labels: true, gap: 0.55 },
  { label: 'Night', bg: 'dk2', dark: true, grid: 'strong', marks: 'flat', round: true },
  { label: 'Night glow', bg: 'dark', dark: true, grid: 'none', marks: 'gradient', bold: true, labels: true },
];

export const styleOf = (c: Pick<Chart, 'style'>): ChartStyle => CHART_STYLES[Math.max(0, Math.min(CHART_STYLES.length - 1, (c.style ?? 1) - 1))]!;

export interface Inks { ink: string; muted: string; grid: string; axis: string; bg: string | null; plateBorder: string | null; on: string; up: string; down: string; total: string }

/** Text and line colours for a style against the theme. */
export const inksFor = (st: ChartStyle, theme: Theme): Inks => {
  const dk1 = theme.colors.dk1, lt1 = theme.colors.lt1, dk2 = theme.colors.dk2, lt2 = theme.colors.lt2;
  const a1 = theme.colors.accent1;
  const bg = st.bg === 'lt1' ? lt1 : st.bg === 'lt2' ? lt2 : st.bg === 'dk2' ? dk2 : st.bg === 'tint' ? adjustLum(a1, 0.88) : st.bg === 'dark' ? adjustLum(dk2, -0.45) : null;
  if (st.dark) {
    return {
      ink: adjustLum(lt1, 0), muted: adjustLum(lt2, -0.25), grid: 'rgba(255,255,255,0.16)', axis: 'rgba(255,255,255,0.4)', bg, plateBorder: null,
      on: '#FFFFFF', up: theme.colors.accent4, down: theme.colors.accent1, total: adjustLum(lt2, -0.15),
    };
  }
  return {
    ink: adjustLum(dk1, 0.2), muted: adjustLum(dk1, 0.42), grid: st.grid === 'strong' ? adjustLum(dk1, 0.7) : adjustLum(dk1, 0.86), axis: adjustLum(dk1, 0.62),
    bg, plateBorder: st.border ? adjustLum(dk1, 0.82) : null, on: '#FFFFFF', up: theme.colors.accent4, down: theme.colors.accent1, total: dk2,
  };
};
