import { command, run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import type { AutoNumber, BulletSpec, Color, ParaStyle, RunStyle, TextBody } from '../../model/deck';
import { bodyProps, fallbackParaStyle, fallbackRunStyle, paraStyleAll, runStyleAll, textShapes } from './text';

/**
 * Text formatting goes to the editor's text.* commands, which handle the caret and partial
 * selections. When a command isn't registered the change is applied to whole selected shapes.
 */

export interface TextApi {
  currentRunStyle: (store: FrameStore) => RunStyle;
  currentParaStyle: (store: FrameStore) => ParaStyle;
  applyRunStyle: (store: FrameStore, patch: RunStyle) => void;
  applyParaStyle: (store: FrameStore, patch: ParaStyle) => void;
}

let api: TextApi = {
  currentRunStyle: fallbackRunStyle,
  currentParaStyle: fallbackParaStyle,
  applyRunStyle: runStyleAll,
  applyParaStyle: paraStyleAll,
};

export const setTextApi = (a: Partial<TextApi>): void => { api = { ...api, ...a }; };

// Picks up the editor's text API when src/features/editor/textOps.ts exists; the glob is empty otherwise.
type EditorOps = {
  currentRunStyle?: (store: FrameStore) => RunStyle;
  currentParaStyle?: (store: FrameStore) => ParaStyle;
  applyRunStyle?: (store: FrameStore, patch: RunStyle | ((s: RunStyle) => RunStyle)) => void;
  applyParaStyle?: (store: FrameStore, patch: ParaStyle) => void;
};
for (const mod of Object.values(import.meta.glob<EditorOps>('../editor/textOps.ts', { eager: true }))) {
  const ed: Partial<TextApi> = {};
  if (typeof mod.currentRunStyle === 'function') ed.currentRunStyle = mod.currentRunStyle;
  if (typeof mod.currentParaStyle === 'function') ed.currentParaStyle = mod.currentParaStyle;
  if (typeof mod.applyRunStyle === 'function') { const f = mod.applyRunStyle; ed.applyRunStyle = (s, p) => f(s, p); }
  if (typeof mod.applyParaStyle === 'function') ed.applyParaStyle = mod.applyParaStyle;
  setTextApi(ed);
}
export const textApi = (): TextApi => api;

export const runStyle = (store: FrameStore): RunStyle => { try { return api.currentRunStyle(store) ?? {}; } catch { return fallbackRunStyle(store); } };
export const paraStyle = (store: FrameStore): ParaStyle => { try { return api.currentParaStyle(store) ?? {}; } catch { return fallbackParaStyle(store); } };

export const hasText = (store: FrameStore): boolean => !!store.editing || textShapes(store).length > 0;

const PT_STEPS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
const grow = (n: number) => PT_STEPS.find((x) => x > n) ?? Math.min(4000, Math.round(n + 10));
const shrink = (n: number) => [...PT_STEPS].reverse().find((x) => x < n) ?? Math.max(1, n - 1);

export type CaseMode = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle';

const caseText = (t: string, mode: CaseMode, start: boolean): string => {
  switch (mode) {
    case 'lower': return t.toLowerCase();
    case 'upper': return t.toUpperCase();
    case 'title': return t.toLowerCase().replace(/(^|[\s\-(["'])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
    case 'toggle': return [...t].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
    default: {
      const low = t.toLowerCase();
      return start ? low.replace(/^(\s*)(\p{L})/u, (_, a: string, b: string) => a + b.toUpperCase()) : low;
    }
  }
};

const fallbackCase = (store: FrameStore, mode: CaseMode): void => {
  store.tryChange('Change case', () => {
    for (const s of textShapes(store)) for (const p of s.text?.paras ?? []) p.runs.forEach((r, i) => { if (!r.br && !r.field) r.text = caseText(r.text, mode, i === 0); });
  });
};

const bodyOf = (store: FrameStore): Partial<TextBody> => textShapes(store)[0]?.text ?? {};

/** Fallbacks for text.* commands, used when the editor hasn't registered them. */
const FALLBACK: Record<string, (store: FrameStore, arg?: unknown) => void> = {
  'text.bold': (s) => api.applyRunStyle(s, { bold: !runStyle(s).bold }),
  'text.italic': (s) => api.applyRunStyle(s, { italic: !runStyle(s).italic }),
  'text.underline': (s) => api.applyRunStyle(s, { underline: runStyle(s).underline && runStyle(s).underline !== 'none' ? 'none' : 'sng' }),
  'text.strike': (s) => api.applyRunStyle(s, { strike: runStyle(s).strike && runStyle(s).strike !== 'none' ? 'none' : 'sng' }),
  'text.shadow': (s) => api.applyRunStyle(s, { shadow: runStyle(s).shadow ? undefined : true }),
  'text.superscript': (s) => api.applyRunStyle(s, { baseline: (runStyle(s).baseline ?? 0) > 0 ? 0 : 30 }),
  'text.subscript': (s) => api.applyRunStyle(s, { baseline: (runStyle(s).baseline ?? 0) < 0 ? 0 : -25 }),
  'text.grow': (s) => api.applyRunStyle(s, { size: grow(runStyle(s).size ?? 18) }),
  'text.shrink': (s) => api.applyRunStyle(s, { size: shrink(runStyle(s).size ?? 18) }),
  'text.clear': (s) => s.tryChange('Clear formatting', () => {
    for (const sh of textShapes(s)) for (const p of sh.text?.paras ?? []) {
      for (const r of p.runs) { const link = r.style?.link; r.style = link ? { link } : undefined; if (!r.style) delete r.style; }
      if (p.style?.defRun) delete p.style.defRun;
    }
  }),
  'text.alignLeft': (s) => api.applyParaStyle(s, { align: 'l' }),
  'text.alignCenter': (s) => api.applyParaStyle(s, { align: 'ctr' }),
  'text.alignRight': (s) => api.applyParaStyle(s, { align: 'r' }),
  'text.justify': (s) => api.applyParaStyle(s, { align: 'just' }),
  'text.bullets': (s) => api.applyParaStyle(s, { bullet: paraStyle(s).bullet?.type === 'char' ? { type: 'none' } : { type: 'char', char: '•', font: 'Arial' } }),
  'text.numbering': (s) => api.applyParaStyle(s, { bullet: paraStyle(s).bullet?.type === 'auto' ? { type: 'none' } : { type: 'auto', scheme: 'arabicPeriod' } }),
  'text.indent': (s) => s.tryChange('Indent', () => { for (const sh of textShapes(s)) for (const p of sh.text?.paras ?? []) p.style = { ...(p.style ?? {}), level: Math.min(8, (p.style?.level ?? 0) + 1) }; }),
  'text.outdent': (s) => s.tryChange('Outdent', () => { for (const sh of textShapes(s)) for (const p of sh.text?.paras ?? []) p.style = { ...(p.style ?? {}), level: Math.max(0, (p.style?.level ?? 0) - 1) }; }),
  'text.font': (s, a) => api.applyRunStyle(s, { font: String(a) }),
  'text.size': (s, a) => api.applyRunStyle(s, { size: Number(a) }),
  'text.color': (s, a) => api.applyRunStyle(s, { color: (a ?? undefined) as Color | undefined }),
  'text.highlight': (s, a) => api.applyRunStyle(s, { highlight: (a ?? undefined) as Color | undefined }),
  'text.case': (s, a) => fallbackCase(s, (a as CaseMode) ?? 'sentence'),
  'text.spacing': (s, a) => api.applyRunStyle(s, { spacing: Number(a) || undefined }),
  'text.lineSpacing': (s, a) => api.applyParaStyle(s, { lineSpacing: Number(a), lineSpacingPts: undefined }),
  'text.vAlign': (s, a) => bodyProps(s, { vAlign: a as TextBody['vAlign'] }, 'Align text'),
  'text.direction': (s, a) => bodyProps(s, { vert: a as TextBody['vert'] }, 'Text direction'),
  'text.columns': (s, a) => bodyProps(s, { columns: Number(a) > 1 ? Number(a) : undefined, ...(bodyOf(s).columnGap === undefined && Number(a) > 1 ? { columnGap: 20 } : {}) }, 'Columns'),
  'text.autofit': (s, a) => bodyProps(s, { autofit: a as TextBody['autofit'] }, 'Autofit'),
  'text.bulletStyle': (s, a) => api.applyParaStyle(s, { bullet: a as BulletSpec }),
  'text.numberStyle': (s, a) => api.applyParaStyle(s, { bullet: { type: 'auto', scheme: a as AutoNumber } }),
};

export const hasTextCommand = (id: string): boolean => !!command(id) || id in FALLBACK;

/** Runs a text command, or its fallback when the editor hasn't registered it. */
export const tx = (store: FrameStore, id: string, arg?: unknown): void => {
  const c = command(id);
  if (c) { run(store, id, arg); return; }
  const f = FALLBACK[id];
  if (f) f(store, arg);
};

/** Whether a text control is on for the current text. */
export const txActive = (store: FrameStore, id: string): boolean => {
  const c = command(id);
  if (c?.active) { try { return c.active(store); } catch { /* fall through */ } }
  const r = runStyle(store), p = paraStyle(store);
  switch (id) {
    case 'text.bold': return !!r.bold;
    case 'text.italic': return !!r.italic;
    case 'text.underline': return !!r.underline && r.underline !== 'none';
    case 'text.strike': return !!r.strike && r.strike !== 'none';
    case 'text.shadow': return !!r.shadow;
    case 'text.superscript': return (r.baseline ?? 0) > 0;
    case 'text.subscript': return (r.baseline ?? 0) < 0;
    case 'text.alignLeft': return (p.align ?? 'l') === 'l';
    case 'text.alignCenter': return p.align === 'ctr';
    case 'text.alignRight': return p.align === 'r';
    case 'text.justify': return p.align === 'just' || p.align === 'dist';
    case 'text.bullets': return p.bullet?.type === 'char' || p.bullet?.type === 'picture';
    case 'text.numbering': return p.bullet?.type === 'auto';
    default: return false;
  }
};

export const textBody = (store: FrameStore): Partial<TextBody> => bodyOf(store);
