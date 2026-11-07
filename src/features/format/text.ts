import type { FrameStore } from '../../app/store';
import type { AutoShape, ParaStyle, RunStyle, Shape, TextBody } from '../../model/deck';
import { contextFor } from '../../render/SlideView';
import { effectivePara, mergeRun, type RenderCtx } from '../../render/inherit';
import { topSelected } from './ops';

/**
 * Reads and writes text style for the Home panel and the format pane. While text is being
 * edited the editor's own commands do the work; these helpers cover whole selected shapes.
 */

export const renderCtx = (store: FrameStore): RenderCtx => {
  const s = store.surface();
  if (s?.kind === 'slide') return contextFor(store.deck, s.slide, { prompts: false });
  if (s?.kind === 'layout') return contextFor(store.deck, null, { layout: s.layout, master: s.master, prompts: false });
  return contextFor(store.deck, null, { master: s?.kind === 'master' ? s.master : store.deck.masters[0]!, prompts: false });
};

/** Shapes with text in the selection (or the one being edited), group children included. */
export const textShapes = (store: FrameStore): AutoShape[] => {
  const out: AutoShape[] = [];
  const add = (list: Shape[]) => { for (const s of list) { if (s.kind === 'group') add(s.children); else if (s.kind === 'shape') out.push(s); } };
  if (store.editing) { const e = store.shape(store.editing.shape); if (e) add([e]); }
  else add(topSelected(store));
  return out;
};

const firstPara = (s: AutoShape, ctx: RenderCtx): { ps: ParaStyle; run: RunStyle } => {
  const p = s.text?.paras[0];
  const ps = effectivePara(s, p?.style, ctx);
  return { ps, run: mergeRun(ps.defRun, p?.runs.find((r) => !r.br)?.style) };
};

export const fallbackRunStyle = (store: FrameStore): RunStyle => {
  const sh = textShapes(store)[0];
  if (!sh) return {};
  return firstPara(sh, renderCtx(store)).run;
};

export const fallbackParaStyle = (store: FrameStore): ParaStyle => {
  const sh = textShapes(store)[0];
  if (!sh) return {};
  return firstPara(sh, renderCtx(store)).ps;
};

const bodies = (store: FrameStore): TextBody[] => {
  const out: TextBody[] = [];
  for (const s of textShapes(store)) { s.text ??= { paras: [{ runs: [] }] }; out.push(s.text); }
  return out;
};

/** Applies a run style to every run of the selected shapes. */
export const runStyleAll = (store: FrameStore, patch: RunStyle): void => {
  store.tryChange('Text format', () => {
    for (const b of bodies(store)) for (const p of b.paras) {
      for (const r of p.runs) if (!r.br) r.style = clean({ ...(r.style ?? {}), ...patch });
      p.style = { ...(p.style ?? {}), defRun: clean({ ...(p.style?.defRun ?? {}), ...patch }) };
    }
  });
};

/** Applies a paragraph style to every paragraph of the selected shapes. */
export const paraStyleAll = (store: FrameStore, patch: ParaStyle): void => {
  store.tryChange('Paragraph', () => {
    for (const b of bodies(store)) for (const p of b.paras) p.style = clean({ ...(p.style ?? {}), ...patch });
  });
};

/** Sets body-level text properties (anchor, insets, autofit, columns, direction). */
export const bodyProps = (store: FrameStore, patch: Partial<Omit<TextBody, 'paras'>>, label = 'Text box'): void => {
  store.tryChange(label, () => {
    for (const b of bodies(store)) {
      Object.assign(b, patch);
      for (const k of Object.keys(patch) as (keyof TextBody)[]) if (b[k] === undefined) delete b[k];
    }
  });
};

const clean = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
};
