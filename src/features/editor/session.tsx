import { renderToStaticMarkup } from 'react-dom/server';
import type { FrameStore, TextEdit } from '../../app/store';
import { walkShapes, type AutoShape, type Deck, type Paragraph, type RunStyle, type Shape, type TextBody } from '../../model/deck';
import { effectiveBody, type RenderCtx } from '../../render/inherit';
import { TextContent } from '../../render/text';
import { cellPseudo, renderCtx, type BodyTarget } from './body';
import { clampPos, collapsed, endPos, type Pos, type Range } from './textModel';

/**
 * The live text-editing session. While someone types, edits go to a working copy of the
 * paragraphs and are drawn straight into the editable element; they are written to the
 * document (one undo step) after a short pause, on blur, and before any other change.
 */

export interface Session {
  store: FrameStore;
  edit: TextEdit;
  paras: Paragraph[];
  /** JSON of the document paragraphs the working copy was last in step with. */
  base: string;
  sel: Range;
  backward: boolean;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Style for the next typed text, set by formatting with a collapsed caret. */
  pending: Partial<RunStyle> | null;
  root: HTMLElement | null;
  composing: boolean;
  /** Applied once the editor has drawn: a client point to put the caret at, or a range. */
  want: { point?: { x: number; y: number; word?: boolean }; range?: Range; at?: 'end' | 'all'; insert?: string } | null;
}

let cur: Session | null = null;
export const session = (): Session | null => cur;
export const sameEdit = (a: TextEdit | null | undefined, b: TextEdit | null | undefined): boolean =>
  !!a && !!b && a.shape === b.shape && a.cell?.r === b.cell?.r && a.cell?.c === b.cell?.c;

export const COMMIT_MS = 650;

// ---------- Locating the body (anywhere in the deck, so a slide change can still commit) ----------

const allLists = (deck: Deck): Shape[][] => [
  ...deck.slides.map((s) => s.shapes),
  ...deck.masters.flatMap((m) => [m.shapes, ...m.layouts.map((l) => l.shapes)]),
];

export const findAnywhere = (deck: Deck, id: string): Shape | null => {
  for (const list of allLists(deck)) {
    let hit: Shape | null = null;
    walkShapes(list, (s) => { if (s.id === id) hit = s; });
    if (hit) return hit;
  }
  return null;
};

/** The body for an edit, looked up across the whole deck. */
export const locate = (store: FrameStore, edit: TextEdit, create = false): BodyTarget | null => {
  const owner = store.shape(edit.shape) ?? findAnywhere(store.deck, edit.shape);
  if (!owner) return null;
  if (owner.kind === 'table' && edit.cell) {
    const cell = owner.rows[edit.cell.r]?.cells[edit.cell.c];
    if (!cell) return null;
    if (!cell.text) { if (!create) return { owner, shape: cellPseudo(owner, edit.cell.r, edit.cell.c, { ...cell, text: { paras: [{ runs: [] }] } }), body: { paras: [{ runs: [] }] }, cell }; cell.text = { paras: [{ runs: [] }] }; }
    return { owner, shape: cellPseudo(owner, edit.cell.r, edit.cell.c, cell), body: cell.text, cell };
  }
  if (owner.kind !== 'shape') return null;
  if (!owner.text) {
    if (!create) return { owner, shape: owner, body: { paras: [{ runs: [] }] } };
    owner.text = { paras: [{ runs: [] }] };
  }
  return { owner, shape: owner, body: owner.text };
};

const modelJson = (store: FrameStore, edit: TextEdit): string => {
  const t = locate(store, edit);
  const paras = t?.body.paras.length ? t.body.paras : [{ runs: [] }];
  return JSON.stringify(paras);
};

// ---------- Lifecycle ----------

export const begin = (store: FrameStore, edit: TextEdit): Session => {
  if (cur && sameEdit(cur.edit, edit) && cur.store === store) {
    const w = pendingWant.get(key(edit));
    if (w) { cur.want = w; pendingWant.delete(key(edit)); }
    return cur;
  }
  end();
  const json = modelJson(store, edit);
  const paras = JSON.parse(json) as Paragraph[];
  cur = {
    store, edit: { ...edit, ...(edit.cell ? { cell: { ...edit.cell } } : {}) }, paras, base: json,
    sel: { start: endPos(paras), end: endPos(paras) }, backward: false, dirty: false, timer: null, pending: null, root: null, composing: false,
    want: pendingWant.get(key(edit)) ?? { at: 'end' },
  };
  pendingWant.delete(key(edit));
  return cur;
};

const key = (e: TextEdit) => `${e.shape}:${e.cell?.r ?? ''}:${e.cell?.c ?? ''}`;
/** What to select when an edit starts (set before store.editing changes). */
const pendingWant = new Map<string, NonNullable<Session['want']>>();
export const wantOnStart = (edit: TextEdit, want: NonNullable<Session['want']>): void => { pendingWant.set(key(edit), want); };

/** Ends the session, writing pending text first. */
export const end = (): void => {
  const s = cur;
  if (!s) return;
  commit();
  if (s.timer) clearTimeout(s.timer);
  cur = null;
};

/** Writes the working copy to the document as one undo step. */
export const commit = (label = 'Typing'): boolean => {
  const s = cur;
  if (!s) return false;
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  if (!s.dirty) return false;
  s.dirty = false;
  const json = JSON.stringify(s.paras);
  if (json === s.base) return false;
  const ok = s.store.tryChange(label, () => {
    const t = locate(s.store, s.edit, true);
    if (!t) return;
    t.body.paras = JSON.parse(json) as Paragraph[];
    if (t.owner.kind === 'shape') autofit(s.store, t.owner);
  });
  if (ok) s.base = modelJson(s.store, s.edit);
  else {
    // Refused (for example a final deck): go back to the document text.
    s.paras = JSON.parse(s.base) as Paragraph[];
    s.sel = { start: clampPos(s.paras, s.sel.start), end: clampPos(s.paras, s.sel.end) };
    draw(s);
  }
  return ok;
};

export const touch = (s: Session): void => {
  s.dirty = true;
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => { s.timer = null; if (cur === s && !s.composing) commit(); }, COMMIT_MS);
};

/** Brings the working copy back in step after the document changed under it (undo, formatting). */
export const resync = (s: Session): boolean => {
  if (s.dirty) return false;
  const json = modelJson(s.store, s.edit);
  if (json === s.base) return false;
  s.base = json;
  s.paras = JSON.parse(json) as Paragraph[];
  s.sel = { start: clampPos(s.paras, s.sel.start), end: clampPos(s.paras, s.sel.end) };
  return true;
};

// ---------- Drawing ----------

/** The shape and body as the editor should draw them (working paragraphs over the current body props). */
export const drawTarget = (s: Session): { shape: AutoShape; body: TextBody; ctx: RenderCtx } | null => {
  const t = locate(s.store, s.edit);
  if (!t) return null;
  const ctx = renderCtx(s.store);
  return { shape: t.shape, body: { ...t.body, paras: s.paras }, ctx: s.edit.cell ? { ...ctx, onMaster: false } : ctx };
};

/** Renders the paragraphs into the editable root. */
export const draw = (s: Session, w?: number, h?: number): void => {
  const root = s.root;
  if (!root) return;
  const t = drawTarget(s);
  if (!t) return;
  const W = w ?? Number(root.dataset.w ?? 100), H = h ?? Number(root.dataset.h ?? 100);
  root.innerHTML = renderToStaticMarkup(<TextContent shape={t.shape} body={t.body} ctx={t.ctx} w={W} h={H} marks />);
  for (const p of root.querySelectorAll<HTMLElement>('p[data-p]')) {
    const last = p.lastElementChild;
    // A trailing line break needs a filler so the empty line shows and can hold the caret.
    if (last && last.tagName === 'BR' && last.hasAttribute('data-br')) p.appendChild(fill());
    // Paragraphs whose runs are all empty still need a line box.
    if (!p.textContent && !p.querySelector('br')) p.appendChild(fill());
  }
  // Redrawing replaces the nodes the selection was in; put the caret back.
  if (root.ownerDocument.activeElement === root) writeSelection(root, s.sel, s.backward);
};
const fill = (): HTMLElement => { const b = document.createElement('br'); b.setAttribute('data-fill', ''); return b; };

// ---------- DOM <-> model positions ----------

const paraEls = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('p')];

const isBullet = (n: Node): boolean => n.nodeType === 1 && (n as Element).hasAttribute('data-bullet');
const isField = (n: Node): boolean => n.nodeType === 1 && (n as Element).hasAttribute('data-field');

/** Character offset of a DOM boundary inside paragraph element p. */
const offsetIn = (p: HTMLElement, node: Node, offset: number): number => {
  let count = 0, done = false;
  const target = node.nodeType === 3 ? null : node.childNodes[offset] ?? null;
  const endOf = node.nodeType !== 3 && !target ? node : null;
  const visit = (n: Node): void => {
    if (done) return;
    if (n === target) { done = true; return; }
    if (n.nodeType === 3) {
      if (n === node) { count += Math.min(offset, n.textContent?.length ?? 0); done = true; return; }
      count += (n.textContent ?? '').replace(/​/g, '').length;
      return;
    }
    if (isBullet(n)) { if (n === node || n.contains(node)) done = true; return; }
    if (isField(n)) {
      if (n === node || n.contains(node)) { count += (node.nodeType === 3 ? offset > 0 : offset > 0) ? 1 : 0; done = true; return; }
      count += 1;
      return;
    }
    const el = n as Element;
    if (el.tagName === 'BR') { if (el.hasAttribute('data-r')) count += 1; if (n === node) done = true; return; }
    for (const c of [...n.childNodes]) { visit(c); if (done) return; }
    if (n === endOf) done = true;
  };
  if (node === p) {
    for (let i = 0; i < Math.min(offset, p.childNodes.length); i++) visit(p.childNodes[i]!);
    return count;
  }
  for (const c of [...p.childNodes]) { visit(c); if (done) break; }
  return count;
};

export const domToPos = (root: HTMLElement, node: Node, offset: number): Pos => {
  const ps = paraEls(root);
  if (!ps.length) return { p: 0, o: 0 };
  let el: Node | null = node;
  while (el && el !== root && !(el.nodeType === 1 && (el as Element).tagName === 'P')) el = el.parentNode;
  if (el && el !== root) {
    const pi = ps.indexOf(el as HTMLElement);
    return { p: Math.max(0, pi), o: offsetIn(el as HTMLElement, node, offset) };
  }
  // Boundary outside any paragraph: before the child at offset.
  const child = node.childNodes[offset];
  if (child) {
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      if (child === p || child.contains(p) || (child.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING)) return { p: i, o: 0 };
    }
  }
  const lp = ps.length - 1;
  return { p: lp, o: offsetIn(ps[lp]!, ps[lp]!, ps[lp]!.childNodes.length) };
};

export const posToDom = (root: HTMLElement, pos: Pos): { node: Node; offset: number } => {
  const ps = paraEls(root);
  const p = ps[Math.max(0, Math.min(ps.length - 1, pos.p))];
  if (!p) return { node: root, offset: 0 };
  let rem = pos.o;
  let lastText: Text | null = null;
  let found: { node: Node; offset: number } | null = null;
  const indexIn = (n: Node) => [...n.parentNode!.childNodes].indexOf(n as ChildNode);
  const visit = (n: Node): void => {
    if (found) return;
    if (n.nodeType === 3) {
      const L = (n.textContent ?? '').length;
      if (rem <= L && !(rem === 0 && lastText === null && false)) { found = { node: n, offset: rem }; return; }
      rem -= L;
      lastText = n as Text;
      return;
    }
    if (isBullet(n)) return;
    if (isField(n)) {
      if (rem === 0) { found = { node: n.parentNode!, offset: indexIn(n) }; return; }
      rem -= 1;
      if (rem === 0) { found = { node: n.parentNode!, offset: indexIn(n) + 1 }; return; }
      return;
    }
    const el = n as Element;
    if (el.tagName === 'BR') {
      if (!el.hasAttribute('data-r')) return;
      if (rem === 0) { found = { node: n.parentNode!, offset: indexIn(n) }; return; }
      rem -= 1;
      if (rem === 0) {
        // After a line break: the start of the next text, or right after the break.
        found = { node: n.parentNode!, offset: indexIn(n) + 1 };
        const next = nextText(n, p);
        if (next) found = { node: next, offset: 0 };
      }
      return;
    }
    for (const c of [...n.childNodes]) { visit(c); if (found) return; }
  };
  for (const c of [...p.childNodes]) { visit(c); if (found) break; }
  if (found) return found;
  if (lastText) return { node: lastText, offset: (lastText as Text).length };
  // Empty paragraph: after the bullet (if any), before the filler.
  const kids = [...p.childNodes];
  const k = kids.findIndex((x) => !isBullet(x));
  const first = kids[k];
  if (first && first.nodeType === 1 && (first as Element).tagName === 'SPAN' && !first.textContent) return { node: first, offset: 0 };
  return { node: p, offset: k < 0 ? kids.length : k };
};

const nextText = (n: Node, within: Node): Text | null => {
  const w = document.createTreeWalker(within, NodeFilter.SHOW_TEXT);
  w.currentNode = n;
  const t = w.nextNode() as Text | null;
  return t && !(t.parentElement?.closest('[data-bullet]')) ? t : null;
};

/** The model range for the current DOM selection inside root, or null when the selection is elsewhere. */
export const readSelection = (root: HTMLElement): { range: Range; backward: boolean } | null => {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount || !sel.anchorNode || !sel.focusNode) return null;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  const a = domToPos(root, sel.anchorNode, sel.anchorOffset);
  const f = domToPos(root, sel.focusNode, sel.focusOffset);
  const backward = a.p > f.p || (a.p === f.p && a.o > f.o);
  return { range: backward ? { start: f, end: a } : { start: a, end: f }, backward };
};

export const writeSelection = (root: HTMLElement, r: Range, backward = false): void => {
  const sel = root.ownerDocument.getSelection();
  if (!sel) return;
  const a = posToDom(root, backward ? r.end : r.start);
  const f = collapsed(r) ? a : posToDom(root, backward ? r.start : r.end);
  try {
    sel.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
  } catch { /* nodes changed under us */ }
};

/** DOM range for a model range (for measuring, caret rectangles). */
export const domRange = (root: HTMLElement, r: Range): globalThis.Range => {
  const range = root.ownerDocument.createRange();
  const a = posToDom(root, r.start), b = posToDom(root, r.end);
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
};

// ---------- Reading the DOM back (composition, spell-check replacements, anything we didn't intercept) ----------

export const readDom = (root: HTMLElement, old: Paragraph[]): Paragraph[] => {
  const out: Paragraph[] = [];
  const ps = paraEls(root);
  for (const p of ps) {
    const pi = Number(p.getAttribute('data-p'));
    const src = Number.isFinite(pi) && old[pi] ? old[pi]! : old[out.length] ?? old[old.length - 1];
    const para: Paragraph = { runs: [], ...(src?.style ? { style: structuredClone(src.style) } : {}) };
    let lastStyle: RunStyle | undefined = src?.runs.find((r) => !r.br)?.style;
    const push = (text: string, style: RunStyle | undefined) => {
      text = text.replace(/​/g, '').replace(/ /g, ' ');
      if (!text) return;
      const L = para.runs[para.runs.length - 1];
      if (L && !L.br && !L.field && JSON.stringify(L.style ?? {}) === JSON.stringify(style ?? {})) L.text += text;
      else para.runs.push(style && Object.keys(style).length ? { text, style: structuredClone(style) } : { text });
    };
    const walk = (n: Node, style: RunStyle | undefined): void => {
      if (n.nodeType === 3) { push(n.textContent ?? '', style); return; }
      if (n.nodeType !== 1) return;
      const el = n as HTMLElement;
      if (isBullet(el)) return;
      const ri = el.getAttribute('data-r');
      const srcRun = ri !== null && src ? src.runs[Number(ri)] : undefined;
      if (el.tagName === 'BR') {
        if (el.hasAttribute('data-fill')) return;
        if (!srcRun && el === p.lastElementChild) return;
        para.runs.push({ text: '', br: true, ...(srcRun?.style ? { style: structuredClone(srcRun.style) } : style ? { style: structuredClone(style) } : {}) });
        return;
      }
      if (isField(el) && srcRun?.field) {
        if (el.textContent) para.runs.push(structuredClone(srcRun));
        return;
      }
      const st = srcRun ? srcRun.style : style;
      if (srcRun) lastStyle = srcRun.style;
      for (const c of [...el.childNodes]) walk(c, st);
    };
    for (const c of [...p.childNodes]) walk(c, lastStyle);
    out.push(para);
  }
  return out.length ? out : [{ runs: [] }];
};

// ---------- Autofit ----------

let host: HTMLDivElement | null = null;
const measureHost = (): HTMLDivElement | null => {
  if (typeof document === 'undefined') return null;
  if (!host || !host.isConnected) {
    host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;contain:layout style';
    document.body.appendChild(host);
  }
  return host;
};

/** Height the text needs at width w (px), including insets. */
export const measureText = (shape: AutoShape, body: TextBody, ctx: RenderCtx, w: number, scale?: number): number | null => {
  const h = measureHost();
  if (!h) return null;
  const b: TextBody = scale === undefined ? body : { ...body, fontScale: scale };
  const s: AutoShape = { ...shape, text: b };
  h.innerHTML = renderToStaticMarkup(<TextContent shape={s} body={b} ctx={ctx} w={w} h={1} />);
  const box = h.firstElementChild as HTMLElement | null;
  const inner = box?.firstElementChild as HTMLElement | null;
  if (!box || !inner) return null;
  const eff = effectiveBody(s, ctx);
  const ins = eff.inset ?? { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };
  return inner.getBoundingClientRect().height + ins.t + ins.b;
};

/** Text rectangle of an auto shape (from its geometry). */
type RectFn = (s: AutoShape) => { x: number; y: number; w: number; h: number };
let textRectFn: RectFn = (s) => ({ x: 0, y: 0, w: s.w, h: s.h });
export const setTextRectFn = (f: RectFn): void => { textRectFn = f; };

/** Applies shrink-on-overflow or resize-shape-to-fit to a shape's text. Call inside a change. */
export const autofit = (store: FrameStore, s: AutoShape): void => {
  if (!s.text || typeof document === 'undefined') return;
  const ctx = renderCtx(store);
  const eff = effectiveBody(s, ctx);
  if (eff.vert && eff.vert !== 'horz') return;
  const tr = textRectFn(s);
  if (eff.autofit === 'resize') {
    const need = measureText(s, s.text, ctx, tr.w, 1);
    if (need === null || !Number.isFinite(need)) return;
    const nh = Math.max(8, Math.round((s.h - tr.h + need) * 100) / 100);
    if (Math.abs(nh - s.h) > 0.5) {
      // Grow downward, or around the centre / upward for middle and bottom anchored text.
      const dy = nh - s.h;
      if (eff.vAlign === 'ctr') s.y -= dy / 2; else if (eff.vAlign === 'b') s.y -= dy;
      s.h = nh;
    }
    if (s.text.fontScale !== undefined) delete s.text.fontScale;
  } else if (eff.autofit === 'shrink') {
    const fits = (k: number) => (measureText(s, s.text!, ctx, tr.w, k) ?? 0) <= tr.h + 0.5;
    let k = 1;
    if (!fits(1)) {
      let lo = 0.1, hi = 1;
      for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      k = Math.floor(lo * 40) / 40;
    }
    if (k >= 1) { if (s.text.fontScale !== undefined) delete s.text.fontScale; } else s.text.fontScale = Math.max(0.1, k);
  } else if (s.text.fontScale !== undefined) delete s.text.fontScale;
};
