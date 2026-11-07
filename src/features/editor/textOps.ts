import type { FrameStore } from '../../app/store';
import type { AutoShape, Paragraph, ParaStyle, RunStyle, Shape, TextBody } from '../../model/deck';
import { effectivePara, mergeRun, type RenderCtx } from '../../render/inherit';
import { bodiesOf, renderCtx } from './body';
import { autofit, commit, draw, locate, resync, session, touch, type Session } from './session';
import {
  allRange, changeCaseRange, collapsed, endPos, insertText, parasIn, rangeText, styleAt, styleParas, styleRange,
  type CaseMode, type Range,
} from './textModel';

/**
 * Text formatting used by panels, panes and commands. While text is edited it works on the
 * selected range (or the caret's pending style); otherwise on all text of the selected shapes
 * (and the selected table cells).
 */

export type RunPatch = Partial<RunStyle> | ((cur: RunStyle) => Partial<RunStyle>);
export type ParaPatch = Partial<ParaStyle> | ((cur: ParaStyle) => Partial<ParaStyle>);

interface TableSel { table: string; r1: number; c1: number; r2: number; c2: number }

/** Selected shapes without children of selected groups. */
const topSel = (store: FrameStore): Shape[] => {
  const ids = new Set(store.sel);
  const sel = store.selected();
  const inside = new Set<string>();
  const mark = (s: Shape) => { if (s.kind === 'group') for (const c of s.children) { inside.add(c.id); mark(c); } };
  for (const s of sel) if (ids.has(s.id)) mark(s);
  return sel.filter((s) => !inside.has(s.id));
};

/** Text bodies that whole-shape formatting applies to. */
const targets = (store: FrameStore): { shape: AutoShape; body: TextBody }[] => {
  const ts = store.ext.tableSel as TableSel | undefined;
  const out: { shape: AutoShape; body: TextBody }[] = [];
  for (const s of topSel(store)) {
    if (s.kind === 'table' && ts && ts.table === s.id) out.push(...bodiesOf(s, ts));
    else out.push(...bodiesOf(s));
  }
  return out;
};

/** The resolved run style for paragraph pi of a shape. */
const resolver = (shape: AutoShape, paras: Paragraph[], ctx: RenderCtx) => (pi: number, st: RunStyle | undefined): RunStyle =>
  mergeRun(effectivePara(shape, paras[pi]?.style, ctx).defRun, st);

const live = (store: FrameStore): Session | null => {
  const s = session();
  return s && store.editing && s.edit.shape === store.editing.shape && s.edit.cell?.r === store.editing.cell?.r && s.edit.cell?.c === store.editing.cell?.c ? s : null;
};

/** The selection inside the edited text (saved, so panel buttons that take focus still apply to it). */
export const textSelection = (store: FrameStore): Range | null => live(store)?.sel ?? null;

const applyToSession = (s: Session, label: string, fn: (paras: Paragraph[], r: Range, shape: AutoShape, ctx: RenderCtx) => void): void => {
  const store = s.store;
  commit();
  const t = locate(store, s.edit, true);
  if (!t) return;
  const ok = store.tryChange(label, () => {
    const t2 = locate(store, s.edit, true)!;
    fn(t2.body.paras, s.sel, t2.shape, renderCtx(store));
    if (t2.owner.kind === 'shape') autofit(store, t2.owner);
  });
  if (ok) { resync(s); draw(s); }
};

export const applyRunStyle = (store: FrameStore, patch: RunPatch): void => {
  const s = live(store);
  if (s) {
    if (collapsed(s.sel)) {
      // Caret only: style the word around it? Simpler and predictable: next typed text, and an empty paragraph.
      const t = locate(store, s.edit);
      const ctx = renderCtx(store);
      const cur = t ? resolver(t.shape, s.paras, ctx)(s.sel.start.p, { ...(styleAt(s.paras, s.sel.start) ?? {}), ...(s.pending ?? {}) }) : {};
      const pt = typeof patch === 'function' ? patch(cur) : patch;
      s.pending = { ...(s.pending ?? {}), ...pt };
      const para = s.paras[s.sel.start.p];
      if (para && para.runs.every((r) => !r.text && !r.br && !r.field)) {
        applyToSession(s, 'Text format', (paras, r) => { styleRange(paras, { start: { p: r.start.p, o: 0 }, end: { p: r.start.p, o: 0 } }, pt); s.pending = null; });
      }
      store.emit();
      return;
    }
    applyToSession(s, 'Text format', (paras, r, shape, ctx) => styleRange(paras, r, patch, resolver(shape, paras, ctx)));
    return;
  }
  const list = targets(store);
  if (!list.length) return;
  store.tryChange('Text format', () => {
    const ctx = renderCtx(store);
    for (const { shape, body } of list) {
      if (!body.paras.length) body.paras.push({ runs: [] });
      styleRange(body.paras, allRange(body.paras), patch, resolver(shape, body.paras, ctx));
      for (const p of body.paras) {
        // Keep new text in this shape consistent with the change.
        const cur = mergeRun(effectivePara(shape, p.style, ctx).defRun);
        const pt = typeof patch === 'function' ? patch(cur) : patch;
        const def: RunStyle = { ...(p.style?.defRun ?? {}), ...pt };
        for (const k of Object.keys(def) as (keyof RunStyle)[]) if (def[k] === undefined) delete def[k];
        p.style = { ...(p.style ?? {}), defRun: def };
        if (!Object.keys(def).length) delete p.style.defRun;
        if (!Object.keys(p.style).length) delete p.style;
      }
    }
    for (const s of topSel(store)) if (s.kind === 'shape') autofit(store, s);
  });
};

export const applyParaStyle = (store: FrameStore, patch: ParaPatch): void => {
  const fn = (shape: AutoShape, ctx: RenderCtx) => (cur: ParaStyle | undefined): Partial<ParaStyle> =>
    typeof patch === 'function' ? patch(effectivePara(shape, cur, ctx)) : patch;
  const s = live(store);
  if (s) {
    applyToSession(s, 'Paragraph', (paras, r, shape, ctx) => styleParas(paras, parasIn(r), fn(shape, ctx)));
    return;
  }
  const list = targets(store);
  if (!list.length) return;
  store.tryChange('Paragraph', () => {
    const ctx = renderCtx(store);
    for (const { shape, body } of list) {
      if (!body.paras.length) body.paras.push({ runs: [] });
      styleParas(body.paras, body.paras.map((_, i) => i), fn(shape, ctx));
    }
    for (const x of topSel(store)) if (x.kind === 'shape') autofit(store, x);
  });
};

/** Body-level text settings (anchor, autofit, columns, direction, insets) for the edited or selected shapes. */
export const applyBodyProps = (store: FrameStore, patch: Partial<Omit<TextBody, 'paras'>>, label = 'Text box'): void => {
  const s = live(store);
  if (s) commit();
  const bodies: { body: TextBody; owner: Shape | null }[] = [];
  store.tryChange(label, () => {
    if (s) { const t = locate(store, s.edit, true); if (t) bodies.push({ body: t.body, owner: t.owner }); }
    else for (const x of targets(store)) bodies.push({ body: x.body, owner: store.shape(x.shape.id) });
    for (const { body, owner } of bodies) {
      Object.assign(body, patch);
      for (const k of Object.keys(patch) as (keyof TextBody)[]) if (body[k] === undefined) delete body[k];
      if (owner?.kind === 'shape') autofit(store, owner);
    }
  });
  if (s) { resync(s); draw(s); }
};

const firstOf = (store: FrameStore): { shape: AutoShape; paras: Paragraph[]; range: Range | null } | null => {
  const s = live(store);
  if (s) {
    const t = locate(store, s.edit);
    return t ? { shape: t.shape, paras: s.paras, range: s.sel } : null;
  }
  const t = targets(store)[0];
  return t ? { shape: t.shape, paras: t.body.paras.length ? t.body.paras : [{ runs: [] }], range: null } : null;
};

/** Effective run style at the caret (or the start of the selection / the first text of the selected shape). */
export const currentRunStyle = (store: FrameStore): RunStyle => {
  const f = firstOf(store);
  if (!f) return {};
  const ctx = renderCtx(store);
  const pos = f.range ? (collapsed(f.range) ? f.range.start : { p: f.range.start.p, o: f.range.start.o + 1 }) : { p: 0, o: 1 };
  const raw = styleAt(f.paras, pos);
  const s = live(store);
  return mergeRun(effectivePara(f.shape, f.paras[pos.p]?.style, ctx).defRun, raw, s && f.range && collapsed(f.range) ? s.pending ?? undefined : undefined);
};

export const currentParaStyle = (store: FrameStore): ParaStyle => {
  const f = firstOf(store);
  if (!f) return {};
  return effectivePara(f.shape, f.paras[f.range?.start.p ?? 0]?.style, renderCtx(store));
};

/** Inserts text at the caret (replacing the selection). When not editing, appends to the one selected shape. */
export const insertTextAtCaret = (store: FrameStore, text: string, style?: RunStyle): void => {
  const s = live(store);
  if (s) {
    const st = style ?? (s.pending ? { ...(styleAt(s.paras, s.sel.start) ?? {}), ...s.pending } : undefined);
    const at = insertText(s.paras, s.sel, text, st);
    s.sel = { start: at, end: at };
    s.pending = null;
    touch(s);
    commit('Insert text');
    draw(s);
    store.emit();
    return;
  }
  const t = targets(store)[0];
  if (!t) return;
  store.tryChange('Insert text', () => {
    const body = locate(store, { shape: t.shape.id.includes(':') ? t.shape.id.split(':')[0]! : t.shape.id }, true)?.body ?? t.body;
    if (!body.paras.length) body.paras.push({ runs: [] });
    const e = endPos(body.paras);
    insertText(body.paras, { start: e, end: e }, text, style);
  });
};

export const selectedText = (store: FrameStore): string => {
  const s = live(store);
  if (s) return rangeText(s.paras, s.sel).replace(/\v/g, '\n');
  return targets(store).map((t) => rangeText(t.body.paras, allRange(t.body.paras)).replace(/\v/g, '\n')).join('\n');
};

export const changeCase = (store: FrameStore, mode: CaseMode): void => {
  const s = live(store);
  if (s) {
    if (collapsed(s.sel)) return;
    applyToSession(s, 'Change case', (paras, r) => changeCaseRange(paras, r, mode));
    return;
  }
  const list = targets(store);
  if (!list.length) return;
  store.tryChange('Change case', () => { for (const { body } of list) changeCaseRange(body.paras, allRange(body.paras), mode); });
};

/** Paragraph indexes that paragraph formatting applies to while editing (or null when not editing). */
export const selectedParas = (store: FrameStore): number[] | null => {
  const s = live(store);
  return s ? parasIn(s.sel) : null;
};

export type { CaseMode };

const LEVEL_STEP = 40;

/** Demotes (+1) or promotes (-1) the selected paragraphs. Text boxes without placeholder levels also shift their margin. */
export const shiftLevel = (store: FrameStore, dir: 1 | -1): void => {
  const shift = (shape: AutoShape, paras: Paragraph[], idx: number[], ctx: RenderCtx) => {
    for (const pi of idx) {
      const p = paras[pi];
      if (!p) continue;
      const eff = effectivePara(shape, p.style, ctx);
      const lvl = Math.max(0, Math.min(8, (eff.level ?? 0) + dir));
      if (lvl === (eff.level ?? 0)) continue;
      const st: ParaStyle = { ...(p.style ?? {}), level: lvl };
      if (!lvl) delete st.level;
      // Without a placeholder's per-level styles the margin is what moves the text.
      if (!shape.ph || p.style?.marginLeft !== undefined) st.marginLeft = Math.max(0, (eff.marginLeft ?? 0) + dir * LEVEL_STEP);
      p.style = st;
    }
  };
  const s = live(store);
  if (s) { applyToSession(s, dir > 0 ? 'Increase indent' : 'Decrease indent', (paras, r, shape, ctx) => shift(shape, paras, parasIn(r), ctx)); return; }
  const list = targets(store);
  if (!list.length) return;
  store.tryChange(dir > 0 ? 'Increase indent' : 'Decrease indent', () => {
    const ctx = renderCtx(store);
    for (const { shape, body } of list) shift(shape, body.paras, body.paras.map((_, i) => i), ctx);
  });
};

/** Selects a range in a shape's text, starting text editing (used by Find). */
export type SelectTextArg = { shape: string; cell?: { r: number; c: number }; para: number; start: number; end: number };
