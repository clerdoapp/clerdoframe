import type { BulletSpec, Paragraph, ParaStyle } from '../../model/deck';
import { effectivePara } from '../../render/inherit';
import { commit, draw, drawTarget, touch, typingHooks, type Session } from '../editor/session';
import { cmp, collapsed, deleteRange, insertText, runLen, styleAt, styleRange, type Pos, type Range } from '../editor/textModel';
import { detectList, fixAfterTyping, type Fix } from './autocorrect';
import { prefs } from './prefs';

/**
 * Applies automatic substitutions in the slide text editor. The typed text is written to the
 * document first, then the substitution as its own undo step, so undo right after it brings back
 * exactly what was typed.
 */

/** Paragraph text with one character per model position (line breaks '\n', fields U+FFFC). */
export const flatText = (p: Paragraph): string => p.runs.map((r) => (r.br ? '\n' : r.field ? '￼'.repeat(runLen(r)) : r.text)).join('');

interface LastFix { shape: string; cell: string; after: Pos; raw: Pos }
let last: LastFix | null = null;
const cellKey = (s: Session) => `${s.edit.cell?.r ?? ''}:${s.edit.cell?.c ?? ''}`;

const finish = (s: Session, label: string, caret: Pos, raw: Pos): void => {
  s.sel = { start: caret, end: caret };
  s.backward = false;
  touch(s);
  commit(label);
  draw(s);
  last = { shape: s.edit.shape, cell: cellKey(s), after: caret, raw };
  s.store.emit();
};

const applyFix = (s: Session, pi: number, f: Fix, caret: number, label: string): void => {
  const para = s.paras[pi]!;
  if (f.kind === 'link') {
    styleRange(s.paras, { start: { p: pi, o: f.start }, end: { p: pi, o: f.end } }, { link: { url: f.url! } });
    finish(s, 'Automatic link', { p: pi, o: caret }, { p: pi, o: caret });
    return;
  }
  const st = styleAt(s.paras, { p: pi, o: Math.max(f.start + 1, f.end) });
  insertText(s.paras, { start: { p: pi, o: f.start }, end: { p: pi, o: f.end } }, f.text, st);
  void para;
  finish(s, label, { p: pi, o: caret - (f.end - f.start) + f.text.length }, { p: pi, o: caret });
};

const LABEL: Record<Fix['kind'], string> = { quote: 'Smart quote', substitution: 'AutoCorrect', link: 'Automatic link', capital: 'Capitalize' };

const listPatch = (cur: ParaStyle, b: BulletSpec): Partial<ParaStyle> =>
  (cur.indent ?? 0) < 0 ? { bullet: b } : { bullet: b, marginLeft: (cur.marginLeft ?? 0) + 28, indent: -28 };

export const afterType = (s: Session, typed: string): void => {
  if (typed.length !== 1 || !collapsed(s.sel) || s.composing) return;
  const p = prefs();
  const { p: pi, o } = s.sel.start;
  const para = s.paras[pi];
  if (!para) return;
  const before = flatText(para).slice(0, o);
  if (p.lists && typed === ' ' && !s.edit.cell) {
    const d = detectList(before);
    const t = drawTarget(s);
    const eff = t ? effectivePara(t.shape, para.style, t.ctx) : null;
    // A number typed in a bulleted paragraph switches it to numbering.
    if (d && eff && (!eff.bullet || eff.bullet.type === 'none' || (d.kind === 'number' && eff.bullet.type === 'char'))) {
      commit('Typing');
      deleteRange(s.paras, { start: { p: pi, o: 0 }, end: { p: pi, o: d.len } });
      const b: BulletSpec = d.kind === 'bullet' ? { type: 'char', char: d.char, font: 'Arial' } : { type: 'auto', scheme: d.scheme, ...(d.start > 1 ? { start: d.start } : {}) };
      const np = s.paras[pi]!;
      np.style = { ...(np.style ?? {}), ...listPatch(eff, b) };
      finish(s, d.kind === 'bullet' ? 'Automatic bullets' : 'Automatic numbering', { p: pi, o: o - d.len }, { p: pi, o });
      return;
    }
  }
  const f = fixAfterTyping(before, typed, p);
  if (!f) return;
  commit('Typing');
  applyFix(s, pi, f, o, LABEL[f.kind]);
};

export const beforeParagraph = (s: Session): void => {
  if (!collapsed(s.sel) || s.composing) return;
  const { p: pi, o } = s.sel.start;
  const para = s.paras[pi];
  if (!para) return;
  const before = flatText(para).slice(0, o);
  const f = fixAfterTyping(`${before}\n`, '\n', prefs());
  if (!f || f.end > before.length) return;
  commit('Typing');
  applyFix(s, pi, f, o, LABEL[f.kind]);
};

/** After undoing a substitution, the caret goes back to where it was before it. */
let undone: LastFix | null = null;
export const undoCaret = (s: Session, redo: boolean): Range | null => {
  const l = redo ? undone : last;
  last = null;
  undone = null;
  if (!l || l.shape !== s.edit.shape || l.cell !== cellKey(s) || !collapsed(s.sel)) return null;
  if (cmp(s.sel.start, redo ? l.raw : l.after)) return null;
  if (!redo) undone = l;
  const at = redo ? l.after : l.raw;
  return { start: at, end: at };
};

export const installTyping = (): void => {
  typingHooks.afterType = afterType;
  typingHooks.beforeParagraph = beforeParagraph;
  typingHooks.undoCaret = undoCaret;
};
