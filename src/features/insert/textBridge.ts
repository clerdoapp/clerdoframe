/**
 * Optional access to the editor team's text operations (src/features/editor/textOps). The module
 * is looked up at runtime so this feature builds and works whether or not it exists yet; without
 * it, changes apply to whole selected shapes.
 */
import type { FrameStore } from '../../app/store';
import type { AutoShape, RunStyle } from '../../model/deck';

interface TextOps {
  applyRunStyle?: (store: FrameStore, patch: RunStyle) => void;
  insertTextAtCaret?: (store: FrameStore, text: string) => void;
}

let ops: TextOps = {};
const mods = import.meta.glob('../editor/textOps.ts');
const loader = Object.values(mods)[0];
if (loader) void loader().then((m) => { ops = m as TextOps; }).catch(() => undefined);

const selectedTextShapes = (store: FrameStore): AutoShape[] => {
  if (store.editing) { const s = store.shape(store.editing.shape); return s?.kind === 'shape' ? [s] : []; }
  return store.selected().filter((s): s is AutoShape => s.kind === 'shape' && !!s.text);
};

export const applyRunStyle = (store: FrameStore, patch: RunStyle): void => {
  if (ops.applyRunStyle) { ops.applyRunStyle(store, patch); return; }
  store.tryChange('Text', () => {
    for (const s of selectedTextShapes(store)) for (const p of s.text?.paras ?? []) for (const r of p.runs) {
      r.style = { ...(r.style ?? {}), ...patch };
      for (const k of Object.keys(patch) as (keyof RunStyle)[]) if (patch[k] === undefined) delete r.style[k];
    }
  });
};

/** Inserts text at the caret, or at the end of the selected shape's text when no caret is known. */
export const insertText = (store: FrameStore, text: string): boolean => {
  if (ops.insertTextAtCaret && store.editing) { ops.insertTextAtCaret(store, text); return true; }
  const s = selectedTextShapes(store)[0];
  if (!s) return false;
  return store.tryChange('Insert text', () => {
    s.text ??= { paras: [{ runs: [] }] };
    if (store.editing?.cell) return;
    const last = s.text.paras[s.text.paras.length - 1] ?? (s.text.paras[0] = { runs: [] });
    const run = last.runs[last.runs.length - 1];
    if (run && !run.br && !run.field) run.text += text; else last.runs.push({ text });
  });
};

export const hasCaret = (store: FrameStore): boolean => !!store.editing || selectedTextShapes(store).length > 0;
