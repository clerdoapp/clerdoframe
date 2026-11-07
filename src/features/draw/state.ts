import type { FrameStore } from '../../app/store';
import type { Color, Id } from '../../model/deck';

export type InkTool = 'pen' | 'pencil' | 'highlighter';
export const DRAW_TOOLS = ['pen', 'pencil', 'highlighter', 'eraser', 'lasso'] as const;
export type DrawTool = typeof DRAW_TOOLS[number];

export interface PenSetting { color: Color; width: number }
export interface PenState {
  presets: PenSetting[];
  /** Which pen preset 'pen' uses. */
  active: number;
  pencil: PenSetting;
  highlighter: PenSetting;
}

/** Thickness choices in slide px, by tool. */
export const WIDTHS: Record<InkTool, number[]> = {
  pen: [1.5, 3, 4.5, 7, 11],
  pencil: [1.5, 3, 4.5, 7, 11],
  highlighter: [8, 12, 18, 26, 36],
};

export const PALETTE: Color[] = ['#000000', '#FFFFFF', '#7F7F7F', '#E8401C', '#F5A623', '#FFE135', '#1FA971', '#2C7BE5', '#00A3B4', '#8E44AD', '#E91E78', '#7A4A20'];

const defaults = (): PenState => ({
  presets: [{ color: '#000000', width: 3 }, { color: '#E8401C', width: 3 }, { color: '#2C7BE5', width: 4.5 }],
  active: 0,
  pencil: { color: '#5A5A5A', width: 3 },
  highlighter: { color: '#FFE135', width: 18 },
});

export const penState = (s: FrameStore): PenState => {
  let p = s.ext.pen as PenState | undefined;
  if (!p || !Array.isArray(p.presets)) { p = defaults(); s.ext.pen = p; }
  return p;
};

/** The setting the current (or given) ink tool draws with. */
export const settingFor = (s: FrameStore, tool: InkTool): PenSetting => {
  const p = penState(s);
  return tool === 'pen' ? p.presets[p.active] ?? p.presets[0]! : p[tool];
};

export const isDrawTool = (t: string | null): t is DrawTool => !!t && (DRAW_TOOLS as readonly string[]).includes(t);
export const isInkTool = (t: string | null): t is InkTool => t === 'pen' || t === 'pencil' || t === 'highlighter';

/** Last ink tool used, so color and thickness have something to apply to when Select is on. */
export const currentInkTool = (s: FrameStore): InkTool => (isInkTool(s.tool) ? s.tool : (s.ext.lastInkTool as InkTool | undefined) ?? 'pen');

export const drawWithTouch = (s: FrameStore): boolean => s.ext.drawWithTouch !== false;
export const inkToShape = (s: FrameStore): boolean => s.ext.inkToShape === true;

export interface Ruler { on: boolean; x: number; y: number; angle: number; len: number }
export const rulerOf = (s: FrameStore): Ruler => {
  let r = s.ext.ruler as Ruler | undefined;
  if (!r) { r = { on: false, x: s.deck.w / 2, y: s.deck.h * 0.55, angle: -12, len: Math.min(900, s.deck.w * 0.72) }; s.ext.ruler = r; }
  return r;
};
export const RULER_H = 64;

/** The ink shape strokes of this drawing session go into, while the tool stays on the same slide. */
export interface Session { slide: number; mode: string; shape: Id | null }

export const setDrawTool = (s: FrameStore, t: string | null): void => {
  if (isInkTool(t)) s.ext.lastInkTool = t;
  s.tool = t;
  s.ext.inkSession = null;
  if (t) { s.sel = []; s.editing = null; }
  s.emit();
};
