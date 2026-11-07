import type { Paragraph, ParaStyle, Run, RunStyle } from '../../model/deck';

/**
 * Pure operations on paragraph lists. A position is a paragraph index and a character offset.
 * Line-break runs and fields count as one character each; fields can't be split.
 */

export interface Pos { p: number; o: number }
export interface Range { start: Pos; end: Pos }

export const runLen = (r: Run): number => (r.br || r.field ? 1 : r.text.length);
export const paraLen = (p: Paragraph): number => p.runs.reduce((a, r) => a + runLen(r), 0);
export const paraText = (p: Paragraph): string => p.runs.map((r) => (r.br ? '\n' : r.field ? r.text || ' ' : r.text)).join('');

export const cmp = (a: Pos, b: Pos): number => (a.p - b.p) || (a.o - b.o);
export const order = (a: Pos, b: Pos): Range => (cmp(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a });
export const collapsed = (r: Range): boolean => cmp(r.start, r.end) === 0;
export const clampPos = (paras: Paragraph[], p: Pos): Pos => {
  if (!paras.length) return { p: 0, o: 0 };
  const pi = Math.max(0, Math.min(paras.length - 1, p.p));
  return { p: pi, o: Math.max(0, Math.min(paraLen(paras[pi]!), p.o)) };
};
export const endPos = (paras: Paragraph[]): Pos => ({ p: Math.max(0, paras.length - 1), o: paras.length ? paraLen(paras[paras.length - 1]!) : 0 });
export const allRange = (paras: Paragraph[]): Range => ({ start: { p: 0, o: 0 }, end: endPos(paras) });

const sameStyle = (a: RunStyle | undefined, b: RunStyle | undefined): boolean => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
const hasKeys = (s: RunStyle | undefined): s is RunStyle => !!s && Object.keys(s).length > 0;

const cleanStyle = (s: RunStyle): RunStyle | undefined => {
  const out: RunStyle = {};
  for (const [k, v] of Object.entries(s)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return Object.keys(out).length ? out : undefined;
};

const mkRun = (text: string, style: RunStyle | undefined): Run => (hasKeys(style) ? { text, style: structuredClone(style) } : { text });

/** Merges neighbouring plain runs with the same style and drops empty ones (an empty paragraph keeps one styled empty run). */
export const normalizePara = (p: Paragraph): void => {
  const out: Run[] = [];
  let keepStyle: RunStyle | undefined;
  for (const r of p.runs) {
    if (!r.br && !r.field && !r.text) { keepStyle ??= r.style; continue; }
    const last = out[out.length - 1];
    if (last && !last.br && !last.field && !r.br && !r.field && sameStyle(last.style, r.style)) last.text += r.text;
    else out.push(r);
  }
  if (!out.length && hasKeys(keepStyle)) out.push({ text: '', style: keepStyle });
  p.runs = out;
};

/** Splits runs so a boundary falls at offset o; returns the index of the first run at or after o. */
export const splitAt = (p: Paragraph, o: number): number => {
  let acc = 0;
  for (let i = 0; i < p.runs.length; i++) {
    const r = p.runs[i]!;
    const n = runLen(r);
    if (o <= acc) return i;
    if (o < acc + n) {
      if (r.br || r.field) return o - acc > 0 ? i + 1 : i;
      const k = o - acc;
      const a: Run = { ...r, text: r.text.slice(0, k) }, b: Run = { ...structuredClone(r), text: r.text.slice(k) };
      p.runs.splice(i, 1, a, b);
      return i + 1;
    }
    acc += n;
  }
  return p.runs.length;
};

/** The run style that typing at pos picks up: the run before the caret, else the first run. */
export const styleAt = (paras: Paragraph[], pos: Pos): RunStyle | undefined => {
  const p = paras[pos.p];
  if (!p || !p.runs.length) return undefined;
  let acc = 0;
  let last: Run | undefined;
  for (const r of p.runs) {
    const n = runLen(r);
    if (!r.br) last = r;
    if (pos.o > acc && pos.o <= acc + n && !r.br) return r.style;
    if (pos.o <= acc) break;
    acc += n;
  }
  if (pos.o === 0) return p.runs.find((r) => !r.br)?.style;
  return last?.style;
};

/** Runs covered by a range in one paragraph [a, b), splitting at the ends. */
const coverRuns = (p: Paragraph, a: number, b: number): Run[] => {
  const i = splitAt(p, a), j = splitAt(p, b);
  return p.runs.slice(i, j);
};

/** Deletes the range; paragraphs it spans are joined. Returns the collapsed position. */
export const deleteRange = (paras: Paragraph[], r: Range): Pos => {
  const { start, end } = r;
  if (collapsed(r)) return start;
  const a = paras[start.p]!, b = paras[end.p]!;
  const keepStyle = styleAt(paras, { p: start.p, o: start.o === 0 ? 0 : start.o }) ?? styleAt(paras, { p: start.p, o: start.o + 1 });
  if (start.p === end.p) {
    const i = splitAt(a, start.o), j = splitAt(a, end.o);
    a.runs.splice(i, j - i);
  } else {
    const i = splitAt(a, start.o);
    a.runs.splice(i);
    const j = splitAt(b, end.o);
    a.runs.push(...b.runs.slice(j));
    paras.splice(start.p + 1, end.p - start.p);
  }
  if (!a.runs.length && hasKeys(keepStyle)) a.runs.push({ text: '', style: structuredClone(keepStyle) });
  normalizePara(a);
  return { ...start };
};

/** Inserts plain text (no newlines) at pos with a style; returns the position after it. */
export const insertPlain = (paras: Paragraph[], pos: Pos, text: string, style?: RunStyle): Pos => {
  if (!text) return pos;
  const p = paras[pos.p]!;
  const st = style ?? styleAt(paras, pos);
  const i = splitAt(p, pos.o);
  const prev = p.runs[i - 1];
  if (prev && !prev.br && !prev.field && sameStyle(prev.style, st)) prev.text += text;
  else p.runs.splice(i, 0, mkRun(text, st));
  normalizePara(p);
  return { p: pos.p, o: pos.o + text.length };
};

/** Line break (soft return) at pos. */
export const insertBreak = (paras: Paragraph[], pos: Pos): Pos => {
  const p = paras[pos.p]!;
  const st = styleAt(paras, pos);
  const i = splitAt(p, pos.o);
  p.runs.splice(i, 0, { text: '', br: true, ...(hasKeys(st) ? { style: structuredClone(st) } : {}) });
  normalizePara(p);
  return { p: pos.p, o: pos.o + 1 };
};

/** Splits a paragraph at pos; the new paragraph copies the paragraph style and the caret's run style. */
export const splitParagraph = (paras: Paragraph[], pos: Pos): Pos => {
  const p = paras[pos.p]!;
  const st = styleAt(paras, pos);
  const i = splitAt(p, pos.o);
  const tail = p.runs.splice(i);
  const np: Paragraph = { runs: tail.length ? tail : hasKeys(st) ? [{ text: '', style: structuredClone(st) }] : [] };
  if (p.style) np.style = structuredClone(p.style);
  if (!p.runs.length && hasKeys(st)) p.runs.push({ text: '', style: structuredClone(st) });
  normalizePara(p);
  normalizePara(np);
  paras.splice(pos.p + 1, 0, np);
  return { p: pos.p + 1, o: 0 };
};

/**
 * Inserts text that may hold newlines ('\n' or '\r\n' = new paragraph, '\v' or U+2028 = line break).
 * Replaces the range first. Returns the caret after the text.
 */
export const insertText = (paras: Paragraph[], r: Range, text: string, style?: RunStyle): Pos => {
  const st = style ?? styleAt(paras, r.start.o === 0 && collapsed(r) ? r.start : r.start.o === 0 ? { p: r.start.p, o: 1 } : r.start);
  let pos = deleteRange(paras, r);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, li) => {
    if (li) pos = splitParagraph(paras, pos);
    const parts = line.split(/[\v ]/);
    parts.forEach((part, pi) => {
      if (pi) pos = insertBreak(paras, pos);
      pos = insertPlain(paras, pos, part, st);
    });
  });
  return pos;
};

/** Text of a range, paragraphs joined with '\n' and line breaks as '\v'. */
export const rangeText = (paras: Paragraph[], r: Range): string => {
  const out: string[] = [];
  for (let pi = r.start.p; pi <= r.end.p; pi++) {
    const p = paras[pi];
    if (!p) break;
    const a = pi === r.start.p ? r.start.o : 0, b = pi === r.end.p ? r.end.o : paraLen(p);
    let acc = 0, s = '';
    for (const run of p.runs) {
      const n = runLen(run);
      const lo = Math.max(a, acc), hi = Math.min(b, acc + n);
      if (hi > lo) s += run.br ? '\v' : run.field ? run.text : run.text.slice(lo - acc, hi - acc);
      acc += n;
    }
    out.push(s);
  }
  return out.join('\n');
};

/** Copy of the paragraphs inside a range (for the in-app clipboard). */
export const sliceParas = (paras: Paragraph[], r: Range): Paragraph[] => {
  const copy = structuredClone(paras.slice(r.start.p, r.end.p + 1));
  const last = copy[copy.length - 1];
  if (last) { const j = splitAt(last, r.end.p === r.start.p ? r.end.o : r.end.o); last.runs.splice(j); }
  const first = copy[0];
  if (first) { const i = splitAt(first, r.start.o); first.runs.splice(0, i); }
  for (const p of copy) normalizePara(p);
  return copy;
};

/** Paragraph indexes a range touches. */
export const parasIn = (r: Range): number[] => Array.from({ length: r.end.p - r.start.p + 1 }, (_, i) => r.start.p + i);

/**
 * Applies a run-style patch over a range. patch may be a function of each run's current style
 * (pass `resolve` to give it the effective, inherited style). undefined values remove keys.
 */
export const styleRange = (
  paras: Paragraph[], r: Range,
  patch: Partial<RunStyle> | ((cur: RunStyle) => Partial<RunStyle>),
  resolve: (pi: number, st: RunStyle | undefined) => RunStyle = (_, st) => st ?? {},
): void => {
  for (const pi of parasIn(r)) {
    const p = paras[pi];
    if (!p) continue;
    const a = pi === r.start.p ? r.start.o : 0, b = pi === r.end.p ? r.end.o : paraLen(p);
    const whole = a === 0 && b === paraLen(p);
    const runs = coverRuns(p, a, b);
    for (const run of runs) {
      const pt = typeof patch === 'function' ? patch(resolve(pi, run.style)) : patch;
      const next = cleanStyle({ ...(run.style ?? {}), ...pt });
      if (next) run.style = next; else delete run.style;
    }
    // Empty paragraphs (and whole paragraphs) carry the style forward for new text.
    if (!p.runs.length && whole) {
      const pt = typeof patch === 'function' ? patch(resolve(pi, undefined)) : patch;
      const st = cleanStyle({ ...pt });
      if (st) p.runs.push({ text: '', style: st });
    }
    normalizePara(p);
  }
};

/** Applies a paragraph-style patch (or function of the current style) to the paragraphs in a range. */
export const styleParas = (paras: Paragraph[], idx: number[], patch: Partial<ParaStyle> | ((cur: ParaStyle | undefined, pi: number) => Partial<ParaStyle>)): void => {
  for (const pi of idx) {
    const p = paras[pi];
    if (!p) continue;
    const pt = typeof patch === 'function' ? patch(p.style, pi) : patch;
    const next: ParaStyle = { ...(p.style ?? {}), ...pt };
    for (const k of Object.keys(next) as (keyof ParaStyle)[]) if (next[k] === undefined) delete next[k];
    if (Object.keys(next).length) p.style = next; else delete p.style;
  }
};

export type CaseMode = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle';

const caseFns: Record<CaseMode, (s: string, atStart: boolean) => string> = {
  lower: (s) => s.toLowerCase(),
  upper: (s) => s.toUpperCase(),
  toggle: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
  title: (s, atStart) => s.toLowerCase().replace(/(^|[\s\-–—(["'])(\p{L})/gu, (m, a: string, b: string, off: number) => (off === 0 && !atStart && !a ? m : a + b.toUpperCase())),
  sentence: (s, atStart) => {
    let cap = atStart;
    let out = '';
    for (const c of s.toLowerCase()) {
      if (cap && /\p{L}/u.test(c)) { out += c.toUpperCase(); cap = false; } else out += c;
      if (/[.!?]/.test(c)) cap = true;
    }
    return out;
  },
};

/** Changes letter case over a range, keeping run styles. */
export const changeCaseRange = (paras: Paragraph[], r: Range, mode: CaseMode): void => {
  for (const pi of parasIn(r)) {
    const p = paras[pi];
    if (!p) continue;
    const a = pi === r.start.p ? r.start.o : 0, b = pi === r.end.p ? r.end.o : paraLen(p);
    const before = paraText(p).slice(0, a);
    const fn = caseFns[mode];
    // Work on the whole covered text so word starts are detected across run boundaries.
    const runs = coverRuns(p, a, b).filter((x) => !x.br && !x.field);
    const joined = runs.map((x) => x.text).join('');
    const atStart = mode === 'sentence' ? /(^|[.!?]\s*)$/.test(before.trimEnd() ? before : '') : /(^|\s)$/.test(before);
    const changed = fn(joined, atStart);
    let k = 0;
    for (const x of runs) { x.text = changed.slice(k, k + x.text.length); k += x.text.length; }
    normalizePara(p);
  }
};

/** Word boundary search for word-wise deletion and double-click selection. */
export const wordEdge = (p: Paragraph, o: number, dir: -1 | 1): number => {
  const t = paraText(p);
  let i = o;
  const isW = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);
  if (dir < 0) {
    while (i > 0 && !isW(t[i - 1])) i--;
    while (i > 0 && isW(t[i - 1])) i--;
  } else {
    while (i < t.length && !isW(t[i])) i++;
    while (i < t.length && isW(t[i])) i++;
  }
  return i;
};

/** Offset of the next or previous character, never splitting a surrogate pair. */
export const charStep = (p: Paragraph, o: number, dir: -1 | 1): number => {
  const t = paraText(p);
  if (dir < 0) {
    if (o <= 0) return 0;
    const c = t.charCodeAt(o - 1);
    return c >= 0xdc00 && c <= 0xdfff && o >= 2 ? o - 2 : o - 1;
  }
  if (o >= t.length) return t.length;
  const c = t.charCodeAt(o);
  return c >= 0xd800 && c <= 0xdbff ? o + 2 : o + 1;
};

/** Whether every paragraph in idx has some text (used to decide bullets on/off etc.). */
export const isEmptyBody = (paras: Paragraph[]): boolean => paras.every((p) => p.runs.every((r) => !r.text && !r.br && !r.field));
