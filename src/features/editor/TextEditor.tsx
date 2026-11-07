import { useEffect, useLayoutEffect, useRef } from 'react';
import { run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import type { AutoShape, Shape } from '../../model/deck';
import { geometry } from '../../render/geometry';
import { effectiveBody, effectivePara } from '../../render/inherit';
import { cssMatrix, frameMatrix, mul, parentMatrixOf } from './geom';
import { cellRect } from './interact';
import {
  begin, commit, domRange, end, draw, drawTarget, readDom, readSelection, resync, session, touch, writeSelection, type Session,
} from './session';
import { shiftLevel } from './textOps';
import {
  charStep, clampPos, cmp, collapsed, deleteRange, endPos, insertBreak, insertParas, insertText, paraLen, rangeText, sliceParas,
  splitParagraph, styleAt, wordEdge, type Pos, type Range,
} from './textModel';
import { isMac } from '../../ui/keys';

/**
 * The contentEditable text editor placed exactly over the text being edited. The model stays the
 * source of truth: keys and input events edit the session's paragraphs and the element is redrawn
 * from them, so what you type looks exactly like the slide.
 */

/** Where the editor goes, in slide px: transform, box and text rotation. */
const placement = (store: FrameStore, ses: Session): { m: string; w: number; h: number; inner: string | undefined } | null => {
  const owner = store.shape(ses.edit.shape);
  if (!owner) return null;
  const top = store.shapes();
  const P = parentMatrixOf(top, owner.id);
  if (owner.kind === 'table' && ses.edit.cell) {
    const r = cellRect(owner, ses.edit.cell.r, ses.edit.cell.c);
    const m = mul(mul(P, frameMatrix(owner)), [1, 0, 0, 1, r.x, r.y]);
    return { m: cssMatrix(m), w: r.w, h: r.h, inner: undefined };
  }
  if (owner.kind !== 'shape') return null;
  const s = owner as AutoShape;
  const g = geometry(s.geom || 'rect', s.w, s.h, s.adj, s.path);
  const tr = g.text ?? { x: 0, y: 0, w: s.w, h: s.h };
  // Text is never mirrored: the renderer counter-flips it, so the editor uses the unflipped frame.
  const m = mul(mul(P, frameMatrix(s)), [1, 0, 0, 1, tr.x, tr.y]);
  const rot = s.text?.rot;
  return { m: cssMatrix(m), w: Math.max(1, tr.w), h: Math.max(1, tr.h), inner: rot ? `rotate(${rot}deg)` : undefined };
};

const caretVisible = (root: HTMLElement): void => {
  const sel = root.ownerDocument.getSelection();
  if (!sel?.rangeCount) return;
  const wrap = root.closest('.canvaswrap') as HTMLElement | null;
  if (!wrap) return;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  if (!r.height) return;
  const w = wrap.getBoundingClientRect();
  if (r.bottom > w.bottom - 8) wrap.scrollTop += r.bottom - w.bottom + 24;
  else if (r.top < w.top + 8) wrap.scrollTop -= w.top - r.top + 24;
};

/** Position of a client point inside the editor. */
export const posAtPoint = (root: HTMLElement, x: number, y: number): Pos | null => {
  const doc = root.ownerDocument as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => globalThis.Range | null };
  let node: Node | null = null, off = 0;
  const cp = doc.caretPositionFromPoint?.(x, y);
  if (cp) { node = cp.offsetNode; off = cp.offset; }
  else { const r = doc.caretRangeFromPoint?.(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  if (!node || !root.contains(node)) return null;
  const sel = readSelectionAt(root, node, off);
  return sel;
};
const readSelectionAt = (root: HTMLElement, node: Node, off: number): Pos => {
  const dsel = root.ownerDocument.getSelection();
  if (!dsel) return { p: 0, o: 0 };
  // domToPos via a temporary selection keeps one code path for DOM mapping.
  const saved = dsel.rangeCount ? dsel.getRangeAt(0).cloneRange() : null;
  try {
    dsel.setBaseAndExtent(node, off, node, off);
    return readSelection(root)?.range.start ?? { p: 0, o: 0 };
  } finally {
    if (saved) { dsel.removeAllRanges(); dsel.addRange(saved); }
  }
};

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_']/u.test(c);

export const TextEditor = ({ store, scale }: { store: FrameStore; scale: number }) => {
  const root = useRef<HTMLDivElement>(null);
  const edit = store.editing;
  if (!edit && session()) end();
  const ses = edit ? begin(store, edit) : null;
  const place = ses ? placement(store, ses) : null;
  const t = ses ? drawTarget(ses) : null;

  // Bind the element and draw whenever the document or the edit target changes.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!ses || !place) { el.innerHTML = ''; return; }
    ses.root = el;
    el.dataset.w = String(place.w);
    el.dataset.h = String(place.h);
    const changed = resync(ses);
    const fresh = !el.firstChild || changed || el.dataset.for !== key(ses);
    el.dataset.for = key(ses);
    if (fresh || ses.want) draw(ses, place.w, place.h);
    if (document.activeElement !== el && !ses.composing) el.focus({ preventScroll: true });
    if (ses.want) {
      const w = ses.want;
      ses.want = null;
      let r: Range | null = null;
      if (w.range) r = { start: clampPos(ses.paras, w.range.start), end: clampPos(ses.paras, w.range.end) };
      else if (w.at === 'all') r = { start: { p: 0, o: 0 }, end: endPos(ses.paras) };
      else if (w.point) {
        const p = posAtPoint(el, w.point.x, w.point.y);
        if (p) {
          r = { start: p, end: p };
          if (w.point.word) {
            const para = ses.paras[p.p];
            if (para) r = { start: { p: p.p, o: wordEdge(para, Math.min(paraLen(para), p.o + (isWordChar(rangeText(ses.paras, { start: p, end: { p: p.p, o: p.o + 1 } })) ? 1 : 0)), -1) }, end: { p: p.p, o: wordEdge(para, p.o, 1) } };
          }
        } else r = { start: endPos(ses.paras), end: endPos(ses.paras) };
      } else r = { start: endPos(ses.paras), end: endPos(ses.paras) };
      ses.sel = r;
      ses.backward = false;
      writeSelection(el, r);
      if (w.insert) typeText(ses, w.insert);
      store.emit();
    } else if (fresh) writeSelection(el, ses.sel, ses.backward);
  });

  // Track the DOM selection so panel buttons (which keep focus away) still know the range.
  useEffect(() => {
    const onSel = () => {
      const s = session();
      const el = root.current;
      if (!s || !el || s.root !== el || document.activeElement !== el) return;
      const r = readSelection(el);
      if (!r) return;
      if (cmp(r.range.start, s.sel.start) || cmp(r.range.end, s.sel.end)) {
        s.sel = r.range; s.backward = r.backward;
        if (s.pending && !collapsed(r.range)) s.pending = null;
        scheduleEmit(s.store);
      }
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  // Native beforeinput (React's synthetic version has no inputType).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const f = (e: Event) => { const s = session(); if (s && s.root === el) onBeforeInput(s, e as InputEvent); };
    el.addEventListener('beforeinput', f);
    return () => el.removeEventListener('beforeinput', f);
  }, []);

  // Commit before any other change or undo, and when the tab is hidden.
  useEffect(() => {
    const before = () => { if (session()?.dirty) commit(); };
    store.beforeChange.add(before);
    const hide = () => { if (document.visibilityState === 'hidden') commit(); };
    document.addEventListener('visibilitychange', hide);
    return () => { store.beforeChange.delete(before); document.removeEventListener('visibilitychange', hide); };
  }, [store]);

  const style = place ? {
    width: place.w, height: place.h, transform: place.m,
  } : { display: 'none' as const };

  const vert = t ? effectiveBody(t.shape, t.ctx).vert : undefined;
  return (
    <div className="ed-textlayer" style={{ transform: `scale(${scale})` }}>
      <div className="ed-textbox" style={style}>
        <div
          ref={root}
          className="ed-text"
          data-texteditor=""
          contentEditable={!!ses}
          suppressContentEditableWarning
          spellCheck
          role="textbox"
          aria-multiline="true"
          aria-label="Slide text"
          tabIndex={-1}
          style={{ transform: place?.inner, ...(vert && vert !== 'horz' ? { caretColor: 'auto' } : {}) }}
          onKeyDown={(e) => { const s = session(); if (s && s.root === e.currentTarget) onKey(s, e.nativeEvent); }}
          onInput={() => { const s = session(); if (s && s.root) onInput(s); }}
          onCompositionStart={() => { const s = session(); if (s) { s.composing = true; if (!collapsed(s.sel)) { const at = deleteRange(s.paras, s.sel); s.sel = { start: at, end: at }; } } }}
          onCompositionEnd={() => { const s = session(); if (s && s.root) { s.composing = false; onInput(s); } }}
          onPaste={(e) => { const s = session(); if (s) onPaste(s, e.nativeEvent); }}
          onCopy={(e) => { const s = session(); if (s) onCopy(s, e.nativeEvent, false); }}
          onCut={(e) => { const s = session(); if (s) onCopy(s, e.nativeEvent, true); }}
          onDrop={(e) => { const s = session(); if (s) onDrop(s, e.nativeEvent); }}
          onBlur={(e) => {
            const s = session();
            if (!s) return;
            // Leaving for a panel control keeps the edit open; the commit still happens now.
            commit();
            void e;
          }}
          onPointerDown={(e) => { e.stopPropagation(); }}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault(); e.stopPropagation();
            store.menu = { x: e.clientX, y: e.clientY, kind: 'text', data: store.editing?.shape };
            store.emit();
          }}
        />
      </div>
    </div>
  );
};

const key = (s: Session) => `${s.edit.shape}:${s.edit.cell?.r ?? ''}:${s.edit.cell?.c ?? ''}`;

let emitQueued = false;
const scheduleEmit = (store: FrameStore) => {
  if (emitQueued) return;
  emitQueued = true;
  requestAnimationFrame(() => { emitQueued = false; store.emit(); });
};

// ---------- Editing operations ----------

const redraw = (s: Session, scroll = true): void => {
  draw(s);
  if (s.root) {
    writeSelection(s.root, s.sel, s.backward);
    if (scroll) caretVisible(s.root);
  }
  scheduleEmit(s.store);
};

const edited = (s: Session, sel: Range): void => {
  s.sel = sel;
  s.backward = false;
  touch(s);
  redraw(s);
};

export const typeText = (s: Session, text: string): void => {
  const st = s.pending ? { ...(styleAt(s.paras, s.sel.start) ?? {}), ...s.pending } : undefined;
  const at = insertText(s.paras, s.sel, text, st);
  s.pending = null;
  edited(s, { start: at, end: at });
};

const deleteDir = (s: Session, dir: -1 | 1, word: boolean, line = false): void => {
  let r = s.sel;
  if (collapsed(r)) {
    const p = r.start;
    const para = s.paras[p.p]!;
    if (dir < 0) {
      if (p.o === 0) {
        if (p.p === 0) {
          // Backspace at the very start of a bulleted or indented first paragraph removes the bullet first.
          if (removeBulletAtStart(s)) return;
          return;
        }
        if (removeBulletAtStart(s)) return;
        r = { start: { p: p.p - 1, o: paraLen(s.paras[p.p - 1]!) }, end: p };
      } else r = { start: { p: p.p, o: line ? 0 : word ? wordEdge(para, p.o, -1) : charStep(para, p.o, -1) }, end: p };
    } else {
      if (p.o >= paraLen(para)) {
        if (p.p >= s.paras.length - 1) return;
        r = { start: p, end: { p: p.p + 1, o: 0 } };
      } else r = { start: p, end: { p: p.p, o: word ? wordEdge(para, p.o, 1) : charStep(para, p.o, 1) } };
    }
  }
  const at = deleteRange(s.paras, r);
  edited(s, { start: at, end: at });
};

/** At the start of a bulleted paragraph, Backspace turns the bullet off before joining paragraphs. */
const removeBulletAtStart = (s: Session): boolean => {
  const p = s.sel.start;
  if (p.o !== 0) return false;
  const t = drawTarget(s);
  if (!t) return false;
  const para = s.paras[p.p]!;
  const eff = effectivePara(t.shape, para.style, t.ctx);
  if (!eff.bullet || eff.bullet.type === 'none') {
    if ((para.style?.level ?? 0) > 0) { para.style = { ...para.style, level: (para.style!.level ?? 1) - 1 }; if (!para.style.level) delete para.style.level; if (!Object.keys(para.style).length) delete para.style; edited(s, s.sel); return true; }
    return false;
  }
  para.style = { ...(para.style ?? {}), bullet: { type: 'none' } };
  edited(s, s.sel);
  return true;
};

const newParagraph = (s: Session): void => {
  // Enter on an empty bulleted paragraph ends the list (or steps out one level).
  const p = s.sel.start;
  const para = s.paras[p.p];
  const t = drawTarget(s);
  if (collapsed(s.sel) && para && t && !para.runs.some((r) => r.text || r.br || r.field)) {
    const eff = effectivePara(t.shape, para.style, t.ctx);
    if (eff.bullet && eff.bullet.type !== 'none' && s.paras.length > 1) {
      if ((eff.level ?? 0) > 0) { para.style = { ...(para.style ?? {}), level: (eff.level ?? 1) - 1 }; if (!para.style.level) delete para.style.level; }
      else para.style = { ...(para.style ?? {}), bullet: { type: 'none' } };
      edited(s, s.sel);
      return;
    }
  }
  const at0 = deleteRange(s.paras, s.sel);
  const at = splitParagraph(s.paras, at0);
  if (s.pending) {
    const np = s.paras[at.p]!;
    if (!np.runs.length) np.runs.push({ text: '', style: { ...(styleAt(s.paras, at0) ?? {}), ...s.pending } });
  }
  edited(s, { start: at, end: at });
};

const lineBreak = (s: Session): void => {
  const at0 = deleteRange(s.paras, s.sel);
  const at = insertBreak(s.paras, at0);
  edited(s, { start: at, end: at });
};

const tabKey = (s: Session, shift: boolean): boolean => {
  const store = s.store;
  if (s.edit.cell) { commit(); run(store, shift ? 'table.prevCell' : 'table.nextCell'); return true; }
  const t = drawTarget(s);
  const para = s.paras[s.sel.start.p];
  if (!t || !para) return false;
  const eff = effectivePara(t.shape, para.style, t.ctx);
  const bulleted = !!eff.bullet && eff.bullet.type !== 'none';
  const atStart = collapsed(s.sel) ? s.sel.start.o === 0 : s.sel.start.p !== s.sel.end.p || s.sel.start.o === 0;
  if (shift || atStart || bulleted && !collapsed(s.sel) || (bulleted && s.sel.start.o === 0)) {
    if (shift || atStart) {
      commit();
      shiftLevel(store, shift ? -1 : 1);
      return true;
    }
  }
  typeText(s, '\t');
  return true;
};

const moveCaret = (s: Session, e: KeyboardEvent): boolean => {
  // Word and paragraph jumps the browser can't do across our spans reliably; the rest is native.
  const mod = isMac ? e.altKey : e.ctrlKey;
  if (!mod || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return false;
  const dir = e.key === 'ArrowLeft' ? -1 : 1;
  const focus = s.backward ? s.sel.start : s.sel.end;
  const para = s.paras[focus.p]!;
  let next: Pos;
  if (dir < 0) next = focus.o === 0 && focus.p > 0 ? { p: focus.p - 1, o: paraLen(s.paras[focus.p - 1]!) } : { p: focus.p, o: wordEdge(para, focus.o, -1) };
  else next = focus.o >= paraLen(para) && focus.p < s.paras.length - 1 ? { p: focus.p + 1, o: 0 } : { p: focus.p, o: wordEdge(para, focus.o, 1) };
  if (e.shiftKey) {
    const anchor = s.backward ? s.sel.end : s.sel.start;
    s.backward = cmp(next, anchor) < 0;
    s.sel = s.backward ? { start: next, end: anchor } : { start: anchor, end: next };
  } else { s.sel = { start: next, end: next }; s.backward = false; }
  if (s.root) writeSelection(s.root, s.sel, s.backward);
  return true;
};

const onKey = (s: Session, e: KeyboardEvent): void => {
  if (e.isComposing || s.composing || e.keyCode === 229) return;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const store = s.store;
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    commit();
    const id = s.edit.shape;
    store.editing = null;
    store.sel = [id];
    store.emit();
    (document.querySelector('.canvaswrap') as HTMLElement | null)?.focus({ preventScroll: true });
    return;
  }
  if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
    e.preventDefault(); e.stopPropagation();
    const redo = e.key === 'y' || e.key === 'Y' || e.shiftKey;
    const before = s.dirty;
    commit();
    if (redo) store.redo(); else store.undo();
    void before;
    // Undo ends editing in the store; keep editing the same text when it still exists.
    if (store.shape(s.edit.shape)) {
      const sel = s.sel;
      store.editing = { ...s.edit };
      store.sel = [s.edit.shape];
      resync(s);
      s.sel = { start: clampPos(s.paras, sel.start), end: clampPos(s.paras, sel.end) };
      s.want = { range: s.sel };
      store.emit();
    }
    return;
  }
  if (mod && (e.key === 'a' || e.key === 'A') && !e.shiftKey && !e.altKey) {
    e.preventDefault(); e.stopPropagation();
    s.sel = { start: { p: 0, o: 0 }, end: endPos(s.paras) }; s.backward = false;
    if (s.root) writeSelection(s.root, s.sel);
    scheduleEmit(store);
    return;
  }
  if (moveCaret(s, e)) { e.preventDefault(); return; }
  if (e.key === 'Enter' && !mod && !e.altKey) {
    e.preventDefault(); e.stopPropagation();
    if (e.shiftKey) lineBreak(s); else newParagraph(s);
    return;
  }
  if (e.key === 'Tab' && !mod && !e.altKey) {
    if (tabKey(s, e.shiftKey)) { e.preventDefault(); e.stopPropagation(); }
    return;
  }
  if ((e.key === 'Backspace' || e.key === 'Delete') && !e.shiftKey) {
    e.preventDefault(); e.stopPropagation();
    const word = isMac ? e.altKey : e.ctrlKey;
    const line = isMac && e.metaKey && e.key === 'Backspace';
    deleteDir(s, e.key === 'Backspace' ? -1 : 1, word, line);
    return;
  }
  // Everything else either is plain typing (handled in beforeinput) or a shortcut for the global handler.
  if (!mod && !e.altKey && e.key.length === 1) e.stopPropagation();
};

const onBeforeInput = (s: Session, e: InputEvent): void => {
  if (s.composing || e.isComposing) return;
  const type = e.inputType;
  const data = e.data;
  const sync = () => { const r = s.root && readSelection(s.root); if (r) { s.sel = r.range; s.backward = r.backward; } };
  switch (type) {
    case 'insertText':
    case 'insertReplacementText': {
      // Spell-check replacements come with their own target range.
      const tr = e.getTargetRanges?.()[0];
      if (tr && s.root && type === 'insertReplacementText') {
        const st = readRange(s.root, tr);
        if (st) s.sel = st;
      } else sync();
      const text = data ?? e.dataTransfer?.getData('text/plain') ?? '';
      if (!text) return;
      e.preventDefault();
      typeText(s, text);
      return;
    }
    case 'insertParagraph': e.preventDefault(); sync(); newParagraph(s); return;
    case 'insertLineBreak': e.preventDefault(); sync(); lineBreak(s); return;
    case 'deleteContentBackward': case 'deleteContentForward': case 'deleteWordBackward': case 'deleteWordForward':
    case 'deleteSoftLineBackward': case 'deleteHardLineBackward': case 'deleteByCut': case 'deleteContent': {
      e.preventDefault();
      sync();
      const tr = e.getTargetRanges?.()[0];
      if (tr && s.root && collapsed(s.sel)) { const r = readRange(s.root, tr); if (r && !collapsed(r)) { const at = deleteRange(s.paras, r); edited(s, { start: at, end: at }); return; } }
      if (!collapsed(s.sel)) { const at = deleteRange(s.paras, s.sel); edited(s, { start: at, end: at }); return; }
      deleteDir(s, type.endsWith('Forward') ? 1 : -1, type.includes('Word'), type.includes('Line'));
      return;
    }
    case 'formatBold': e.preventDefault(); run(s.store, 'text.bold'); return;
    case 'formatItalic': e.preventDefault(); run(s.store, 'text.italic'); return;
    case 'formatUnderline': e.preventDefault(); run(s.store, 'text.underline'); return;
    case 'historyUndo': e.preventDefault(); commit(); s.store.undo(); return;
    case 'historyRedo': e.preventDefault(); commit(); s.store.redo(); return;
    case 'insertFromPaste': case 'insertFromDrop': case 'insertFromYank':
      // Handled by the paste / drop listeners.
      if (type === 'insertFromYank') { e.preventDefault(); if (data) typeText(s, data); }
      return;
    default:
      if (type?.startsWith('format')) e.preventDefault();
  }
};

const readRange = (root: HTMLElement, sr: StaticRange): Range | null => {
  const sel = root.ownerDocument.getSelection();
  if (!sel) return null;
  const saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  try {
    sel.setBaseAndExtent(sr.startContainer, sr.startOffset, sr.endContainer, sr.endOffset);
    return readSelection(root)?.range ?? null;
  } catch { return null; } finally { if (saved) { sel.removeAllRanges(); sel.addRange(saved); } }
};

/** Input we didn't intercept (IME composition, autocorrect, dictation): read the element back into the model. */
const onInput = (s: Session): void => {
  const root = s.root;
  if (!root || s.composing) return;
  const next = readDom(root, s.paras);
  const sel = readSelection(root);
  if (JSON.stringify(next) === JSON.stringify(s.paras)) return;
  s.paras = next;
  if (sel) { s.sel = sel.range; s.backward = sel.backward; }
  touch(s);
  // Redraw so the markup matches the model again, keeping the caret where the browser put it.
  redraw(s, true);
};

// ---------- Clipboard and drop ----------

let textClip: { text: string; paras: import('../../model/deck').Paragraph[] } | null = null;

const onCopy = (s: Session, e: ClipboardEvent, cut: boolean): void => {
  if (collapsed(s.sel)) { e.preventDefault(); return; }
  const text = rangeText(s.paras, s.sel).replace(/\v/g, '\n');
  textClip = { text, paras: sliceParas(s.paras, s.sel) };
  e.clipboardData?.setData('text/plain', text);
  if (s.root) e.clipboardData?.setData('text/html', domRange(s.root, s.sel).cloneContents().textContent ? htmlOf(s) : '');
  e.preventDefault();
  if (cut) { const at = deleteRange(s.paras, s.sel); edited(s, { start: at, end: at }); commit('Cut'); }
};

const htmlOf = (s: Session): string => {
  if (!s.root) return '';
  const div = document.createElement('div');
  div.appendChild(domRange(s.root, s.sel).cloneContents());
  for (const b of div.querySelectorAll('[data-bullet]')) b.remove();
  return div.innerHTML;
};

/** Plain text from pasted HTML, keeping paragraph and line breaks. */
export const htmlToText = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const x of doc.querySelectorAll('script, style, head, title, meta, [data-bullet]')) x.remove();
  const out: string[] = [];
  let line = '';
  const BLOCK = /^(P|DIV|LI|H[1-6]|TR|BLOCKQUOTE|PRE|SECTION|ARTICLE|UL|OL|TABLE|HEADER|FOOTER)$/;
  const walk = (n: Node, pre: boolean) => {
    if (n.nodeType === 3) { const t = n.textContent ?? ''; line += pre ? t : t.replace(/\s+/g, ' '); return; }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (el.tagName === 'BR') { line += '\v'; return; }
    const block = BLOCK.test(el.tagName);
    if (block && line.trim()) { out.push(line); line = ''; }
    if (el.tagName === 'TD' || el.tagName === 'TH') { if (line && !line.endsWith('\t')) line += '\t'; }
    for (const c of [...el.childNodes]) walk(c, pre || el.tagName === 'PRE');
    if (block && line) { out.push(line); line = ''; }
  };
  walk(doc.body, false);
  if (line) out.push(line);
  return out.map((l) => l.replace(/^ +| +$/g, '').replace(/\v +/g, '\v')).join('\n').replace(/\n{3,}/g, '\n\n');
};

const onPaste = (s: Session, e: ClipboardEvent): void => {
  e.preventDefault();
  e.stopPropagation();
  const dt = e.clipboardData;
  if (!dt) return;
  const files = [...dt.files].filter((f) => /^(image|video|audio)\//.test(f.type));
  const text = dt.getData('text/plain');
  if (files.length && !text) { commit(); run(s.store, 'insert.files', files); return; }
  const r = s.root && readSelection(s.root);
  if (r) { s.sel = r.range; s.backward = r.backward; }
  if (textClip && text.replace(/\r\n?/g, '\n') === textClip.text) {
    const at = insertParas(s.paras, s.sel, textClip.paras);
    edited(s, { start: at, end: at });
  } else {
    let t = text;
    if (!t) { const html = dt.getData('text/html'); if (html) t = htmlToText(html); }
    if (!t) { if (files.length) { commit(); run(s.store, 'insert.files', files); } return; }
    // Plain text takes the style at the caret; tabs and line breaks are kept.
    typeText(s, t.replace(/\r\n?/g, '\n').replace(/\u2028/g, '\v'));
  }
  commit('Paste');
};

const onDrop = (s: Session, e: DragEvent): void => {
  const dt = e.dataTransfer;
  if (!dt) return;
  const files = [...dt.files];
  e.preventDefault();
  e.stopPropagation();
  if (files.length) { commit(); run(s.store, 'insert.files', files); return; }
  const text = dt.getData('text/plain');
  if (!text || !s.root) return;
  const p = posAtPoint(s.root, e.clientX, e.clientY);
  if (p) s.sel = { start: p, end: p };
  typeText(s, text);
  commit('Drop text');
};

export type { Shape };
