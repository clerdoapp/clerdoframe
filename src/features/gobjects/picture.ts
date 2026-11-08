/** Picture helpers: cover crops, aspect-ratio masks and theme recolor presets. Pure, so they're tested. */
import type { Crop, Picture, ThemeColorName } from '../../model/deck';

/** Crop that makes an image of natW x natH fill a frame of w x h (like CSS cover), centred. */
export const coverCrop = (natW: number, natH: number, w: number, h: number): Crop | undefined => {
  if (!(natW > 0 && natH > 0 && w > 0 && h > 0)) return undefined;
  const img = natW / natH, frame = w / h;
  if (Math.abs(img - frame) < 1e-3) return undefined;
  if (img > frame) { const k = (1 - frame / img) / 2; return { l: k, t: 0, r: k, b: 0 }; }
  const k = (1 - img / frame) / 2;
  return { l: 0, t: k, r: 0, b: k };
};

/** The picture's full image aspect ratio, from its frame and crop. */
export const naturalAspect = (p: Picture): number => {
  const c = p.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const fw = Math.max(0.01, 1 - c.l - c.r), fh = Math.max(0.01, 1 - c.t - c.b);
  return (p.w / fw) / Math.max(0.01, p.h / fh);
};

export const ASPECTS = ['1:1', '4:3', '16:9', '3:2', '2:3', '3:4', '9:16'] as const;
export const parseAspect = (a: string): number | null => {
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(a.trim());
  if (!m) return null;
  const r = Number(m[1]) / Number(m[2]);
  return Number.isFinite(r) && r > 0.01 && r < 100 ? r : null;
};

/** Reshapes the frame to an aspect ratio inside its current box (same centre) and crops the image to fill it. */
export const applyAspect = (p: Picture, ratio: number): void => {
  const nat = naturalAspect(p);
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const w = p.w / p.h > ratio ? p.h * ratio : p.w;
  const h = w / ratio;
  p.w = w; p.h = h;
  p.x = cx - w / 2; p.y = cy - h / 2;
  const c = coverCrop(nat, 1, w, h);
  if (c) p.crop = c; else delete p.crop;
};

export interface RecolorPreset { id: string; label: string; theme: ThemeColorName; mode: 'light' | 'dark' }
export const RECOLOR_PRESETS: RecolorPreset[] = (['dark', 'light'] as const).flatMap((mode) =>
  ([1, 2, 3, 4, 5, 6] as const).map((i) => ({ id: `${mode}${i}`, label: `${mode === 'light' ? 'Light' : 'Dark'} ${i}`, theme: `accent${i}` as ThemeColorName, mode })));

export const applyRecolor = (p: Picture, preset: RecolorPreset | null): void => {
  const a = { ...(p.adjust ?? {}) };
  delete a.recolor; delete a.recolorMode;
  if (preset) {
    a.recolor = { theme: preset.theme };
    a.recolorMode = preset.mode;
    delete a.grayscale; delete a.sepia;
  }
  p.adjust = Object.keys(a).length ? a : undefined;
};
