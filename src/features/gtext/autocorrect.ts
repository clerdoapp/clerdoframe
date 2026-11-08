/**
 * Automatic substitutions while typing. Pure functions over the paragraph text before the caret,
 * so they can be tested on their own and used by both the slide text editor and the notes.
 */

export interface Substitution { from: string; to: string; on: boolean }

export interface TypingPrefs {
  smartQuotes: boolean;
  lists: boolean;
  links: boolean;
  capitalize: boolean;
  substitutions: boolean;
  /** Checked checklist items are struck through. */
  checkStrike: boolean;
  /** Dictation language ('' = the presentation's language). */
  voiceLang: string;
  subs: Substitution[];
}

export const DEFAULT_SUBS: Substitution[] = [
  ['(c)', '©'], ['(r)', '®'], ['(tm)', '™'], ['-->', '→'], ['<--', '←'], ['<=', '≤'], ['>=', '≥'], ['!=', '≠'],
  ['1/2', '½'], ['1/4', '¼'], ['3/4', '¾'], ['--', '—'], ['...', '…'], ['+-', '±'],
].map(([from, to]) => ({ from: from!, to: to!, on: true }));

export const DEFAULT_PREFS: TypingPrefs = {
  smartQuotes: true, lists: true, links: true, capitalize: false, substitutions: true, checkStrike: true, voiceLang: '', subs: DEFAULT_SUBS,
};

/** One edit of the paragraph: replace [start, end) with text. Offsets are in the paragraph's text. */
export interface Fix { start: number; end: number; text: string; kind: 'quote' | 'substitution' | 'link' | 'capital'; url?: string }

const isSpace = (c: string | undefined) => !!c && /\s/.test(c);
const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
/** Characters that end a word and trigger the boundary rules. */
export const isBoundary = (c: string): boolean => /^[\s.,;:!?)\]}]$/.test(c);

/** Curly quote for a straight one typed after `before`. */
export const smartQuote = (before: string, q: '"' | "'"): string => {
  const prev = before.slice(-1);
  const open = !prev || isSpace(prev) || /[([{<“‘\-–—/]/.test(prev);
  if (q === '"') return open ? '“' : '”';
  return open ? '‘' : '’';
};

/** Substitutions that fire as soon as their last character is typed: they end in punctuation and no longer key starts with them. */
const immediate = (s: Substitution, all: Substitution[]): boolean =>
  !isWord(s.from.slice(-1)) && !all.some((o) => o.on && o !== s && o.from.length > s.from.length && o.from.startsWith(s.from));

const keyStartOk = (text: string, at: number, key: string): boolean => {
  if (!isWord(key[0])) return true;
  const prev = text[at - 1];
  return !prev || !/[\p{L}\p{N}/]/u.test(prev);
};

/**
 * Substitution after typing: `text` is the paragraph text up to and including what was just typed.
 * Returns the fix, or null.
 */
export const substitute = (text: string, subs: Substitution[]): Fix | null => {
  const on = subs.filter((s) => s.on && s.from && s.from !== s.to).sort((a, b) => b.from.length - a.from.length);
  const last = text.slice(-1);
  for (const s of on) {
    if (immediate(s, on) && text.endsWith(s.from)) {
      const at = text.length - s.from.length;
      if (keyStartOk(text, at, s.from)) return { start: at, end: text.length, text: s.to, kind: 'substitution' };
    }
  }
  if (!isBoundary(last)) return null;
  const body = text.slice(0, -1);
  for (const s of on) {
    if (!body.endsWith(s.from)) continue;
    const at = body.length - s.from.length;
    // A key ending in a letter or digit must stand on its own ("1/2" but not "11/2" or "1/25").
    if (!keyStartOk(body, at, s.from)) continue;
    return { start: at, end: body.length, text: s.to, kind: 'substitution' };
  }
  return null;
};

const URL_RE = /^(https:\/\/[^\s/$.?#][^\s]*\.[^\s]+|https:\/\/[^\s/$.?#][^\s]*|www\.[^\s.]+\.[^\s]+)$/i;
const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

/** The link a word typed before a boundary stands for (https:, www. or an email address), or null. */
export const linkFor = (word: string): string | null => {
  if (EMAIL_RE.test(word)) return `mailto:${word}`;
  if (!URL_RE.test(word)) return null;
  if (/^www\./i.test(word)) return `https://${word}`;
  return /^https:\/\/[^/]*\./i.test(word) ? word : null;
};

/** Link detection on a boundary: the last word before it, without trailing punctuation. */
export const detectLink = (text: string): Fix | null => {
  // Only spaces and line ends: a full stop may be part of the address being typed.
  if (!isSpace(text.slice(-1))) return null;
  const body = text.slice(0, -1);
  const m = /(\S+)$/.exec(body);
  if (!m) return null;
  let word = m[1]!;
  const start = body.length - word.length;
  word = word.replace(/[.,;:!?)\]}'"”’]+$/, '');
  const url = linkFor(word);
  return url ? { start, end: start + word.length, text: word, kind: 'link', url } : null;
};

/** Capital at the start of a sentence, applied when the word is finished. */
export const capitalizeSentence = (text: string): Fix | null => {
  if (!isBoundary(text.slice(-1))) return null;
  const body = text.slice(0, -1);
  const m = /(\S+)$/.exec(body);
  if (!m) return null;
  const word = m[1]!;
  const start = body.length - word.length;
  if (/[./@:\d]/.test(word) || !/^\p{Ll}/u.test(word)) return null;
  const before = body.slice(0, start);
  if (before.trim() && !/[.!?]["'”’)]*\s+$/.test(before)) return null;
  return { start, end: start + 1, text: word[0]!.toUpperCase(), kind: 'capital' };
};

/** Every boundary rule in order; the first that applies wins. */
export const boundaryFix = (text: string, p: Pick<TypingPrefs, 'substitutions' | 'links' | 'capitalize' | 'subs'>): Fix | null =>
  (p.substitutions ? substitute(text, p.subs) : null)
  ?? (p.links ? detectLink(text) : null)
  ?? (p.capitalize ? capitalizeSentence(text) : null);

/** All rules after typing `typed` (text includes it at the end). */
export const fixAfterTyping = (text: string, typed: string, p: TypingPrefs): Fix | null => {
  if (typed.length !== 1) return null;
  if (p.smartQuotes && (typed === '"' || typed === "'")) {
    const before = text.slice(0, -1);
    return { start: before.length, end: text.length, text: smartQuote(before, typed), kind: 'quote' };
  }
  if (p.substitutions) { const s = substitute(text, p.subs); if (s) return s; }
  return isBoundary(typed) ? boundaryFix(text, { ...p, substitutions: false }) : null;
};

export type ListKind = { kind: 'bullet'; char: string } | { kind: 'number'; scheme: 'arabicPeriod' | 'arabicParenR' | 'alphaLcPeriod' | 'alphaLcParenR' | 'alphaUcPeriod' | 'alphaUcParenR'; start: number };

/** A list marker typed at the start of a paragraph followed by a space: "1. ", "a) ", "- ", "* ". */
export const detectList = (text: string): (ListKind & { len: number }) | null => {
  let m = /^([-*•]) $/.exec(text);
  if (m) return { kind: 'bullet', char: '•', len: 2 };
  m = /^(\d{1,3})([.)]) $/.exec(text);
  if (m) return { kind: 'number', scheme: m[2] === '.' ? 'arabicPeriod' : 'arabicParenR', start: Math.max(1, Number(m[1])), len: text.length };
  m = /^([a-zA-Z])([.)]) $/.exec(text);
  if (m) {
    const lower = m[1] === m[1]!.toLowerCase();
    const scheme = lower ? (m[2] === '.' ? 'alphaLcPeriod' : 'alphaLcParenR') : (m[2] === '.' ? 'alphaUcPeriod' : 'alphaUcParenR');
    return { kind: 'number', scheme, start: m[1]!.toLowerCase().charCodeAt(0) - 96, len: 3 };
  }
  return null;
};

/** Applies the rules to a plain text field (speaker notes) after an edit; returns the new value and caret, or null. */
export const fixPlainText = (value: string, caret: number, typed: string, p: TypingPrefs): { value: string; caret: number } | null => {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const line = value.slice(lineStart, caret);
  const f = fixAfterTyping(line, typed, p);
  if (!f || f.kind === 'link') return null;
  const tail = line.slice(f.end);
  const next = value.slice(0, lineStart + f.start) + f.text + value.slice(lineStart + f.end);
  return { value: next, caret: lineStart + f.start + f.text.length + tail.length };
};
