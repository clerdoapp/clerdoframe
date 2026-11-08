import { describe, expect, it } from 'vitest';
import {
  capitalizeSentence, DEFAULT_PREFS, DEFAULT_SUBS, detectLink, detectList, fixAfterTyping, fixPlainText, linkFor, smartQuote, substitute, type Fix, type TypingPrefs,
} from '../src/features/gtext/autocorrect';
import { dictationText } from '../src/features/gtext/voiceLangs';

/** Types `s` one character at a time through the rules, the way the editor does. */
const type = (s: string, p: TypingPrefs = DEFAULT_PREFS): string => {
  let t = '';
  for (const c of s) {
    t += c;
    const f = fixAfterTyping(t, c, p);
    if (f && f.kind !== 'link') t = t.slice(0, f.start) + f.text + t.slice(f.end);
  }
  return t;
};
const apply = (t: string, f: Fix | null) => (f ? t.slice(0, f.start) + f.text + t.slice(f.end) : t);

describe('smart quotes', () => {
  it('opens and closes by context', () => {
    expect(smartQuote('', '"')).toBe('“');
    expect(smartQuote('He said ', '"')).toBe('“');
    expect(smartQuote('He said “hi', '"')).toBe('”');
    expect(smartQuote('(', "'")).toBe('‘');
    expect(smartQuote('don', "'")).toBe('’');
  });
  it('types curly quotes and apostrophes', () => {
    expect(type('"Hello," she said. "It\'s fine."')).toBe('“Hello,” she said. “It’s fine.”');
    expect(type("'quoted'")).toBe('‘quoted’');
  });
  it('can be turned off', () => {
    expect(type('"x"', { ...DEFAULT_PREFS, smartQuotes: false })).toBe('"x"');
  });
});

describe('substitutions', () => {
  it('replaces symbols that end in punctuation at once', () => {
    expect(type('(c)')).toBe('©');
    expect(type('(r) and (tm)')).toBe('® and ™');
    expect(type('a --> b <-- c')).toBe('a → b ← c');
    expect(type('x <= 1 >= 2 != 3')).toBe('x ≤ 1 ≥ 2 ≠ 3');
    expect(type('wait...')).toBe('wait…');
    expect(type('+-5')).toBe('±5');
  });
  it('waits for a word boundary when a longer key could follow', () => {
    expect(substitute('a--', DEFAULT_SUBS)).toBeNull();
    expect(type('a--b')).toBe('a--b');
    expect(type('yes-- no')).toBe('yes— no');
    expect(type('a --> b')).toBe('a → b');
  });
  it('replaces fractions only when they stand alone', () => {
    expect(type('1/2 cup')).toBe('½ cup');
    expect(type('3/4.')).toBe('¾.');
    expect(type('11/2 ')).toBe('11/2 ');
    expect(type('1/25 ')).toBe('1/25 ');
    expect(type('a1/2 ')).toBe('a1/2 ');
  });
  it('respects the switches and the table', () => {
    expect(type('(c)', { ...DEFAULT_PREFS, substitutions: false })).toBe('(c)');
    const subs = DEFAULT_SUBS.map((s) => (s.from === '(c)' ? { ...s, on: false } : s));
    expect(type('(c)', { ...DEFAULT_PREFS, subs })).toBe('(c)');
    expect(type('omw ', { ...DEFAULT_PREFS, subs: [...DEFAULT_SUBS, { from: 'omw', to: 'on my way', on: true }] })).toBe('on my way ');
  });
  it('gives the range of the replaced text', () => {
    expect(substitute('see (c)', DEFAULT_SUBS)).toEqual({ start: 4, end: 7, text: '©', kind: 'substitution' });
    expect(substitute('a -- ', DEFAULT_SUBS)).toEqual({ start: 2, end: 4, text: '—', kind: 'substitution' });
  });
});

describe('lists', () => {
  it('detects markers at the start of a paragraph', () => {
    expect(detectList('1. ')).toEqual({ kind: 'number', scheme: 'arabicPeriod', start: 1, len: 3 });
    expect(detectList('3) ')).toEqual({ kind: 'number', scheme: 'arabicParenR', start: 3, len: 3 });
    expect(detectList('a) ')).toEqual({ kind: 'number', scheme: 'alphaLcParenR', start: 1, len: 3 });
    expect(detectList('C. ')).toEqual({ kind: 'number', scheme: 'alphaUcPeriod', start: 3, len: 3 });
    expect(detectList('- ')).toEqual({ kind: 'bullet', char: '•', len: 2 });
    expect(detectList('* ')).toEqual({ kind: 'bullet', char: '•', len: 2 });
  });
  it('ignores markers elsewhere', () => {
    expect(detectList('x 1. ')).toBeNull();
    expect(detectList('1.')).toBeNull();
    expect(detectList('ab) ')).toBeNull();
    expect(detectList('-- ')).toBeNull();
  });
});

describe('links', () => {
  it('knows web and email addresses', () => {
    expect(linkFor('https://clerdo.app/x')).toBe('https://clerdo.app/x');
    expect(linkFor('www.example.org')).toBe('https://www.example.org');
    expect(linkFor('me@example.com')).toBe('mailto:me@example.com');
    expect(linkFor('http://example.com')).toBeNull();
    expect(linkFor('example')).toBeNull();
    expect(linkFor('https://localhost')).toBeNull();
  });
  it('links the word before a space, leaving trailing punctuation out', () => {
    expect(detectLink('see www.example.org, ')).toEqual({ start: 4, end: 19, text: 'www.example.org', kind: 'link', url: 'https://www.example.org' });
    expect(detectLink('mail me@example.com\n')?.url).toBe('mailto:me@example.com');
    expect(detectLink('www.example.org.')).toBeNull();
    expect(detectLink('plain words ')).toBeNull();
  });
});

describe('capitals', () => {
  it('capitalises the first word of a sentence when on', () => {
    const p = { ...DEFAULT_PREFS, capitalize: true };
    expect(type('hello world. this is it. ', p)).toBe('Hello world. This is it. ');
    expect(type('one? two! three ', p)).toBe('One? Two! Three ');
  });
  it('leaves addresses and mid-sentence words alone', () => {
    expect(capitalizeSentence('see this ')).toBeNull();
    expect(apply('e.g. ', capitalizeSentence('e.g. '))).toBe('e.g. ');
    expect(capitalizeSentence('www.x.com ')).toBeNull();
  });
  it('is off by default', () => {
    expect(type('hello. world ')).toBe('hello. world ');
  });
});

describe('plain text fields', () => {
  it('fixes the line being typed and keeps the caret after the fix', () => {
    expect(fixPlainText('a\n(c)', 5, ')', DEFAULT_PREFS)).toEqual({ value: 'a\n©', caret: 3 });
    expect(fixPlainText('x"', 2, '"', DEFAULT_PREFS)).toEqual({ value: 'x”', caret: 2 });
    expect(fixPlainText('(c)tail', 3, ')', DEFAULT_PREFS)).toEqual({ value: '©tail', caret: 1 });
    expect(fixPlainText('abc', 3, 'c', DEFAULT_PREFS)).toBeNull();
  });
});

describe('dictation', () => {
  const b = { line: '\v', paragraph: '\n' };
  it('turns spoken punctuation into marks', () => {
    expect(dictationText('hello comma world period', '', 'en-US', b)).toBe('Hello, world.');
    expect(dictationText('is it question mark', 'Done.', 'en-US', b)).toBe(' Is it?');
    expect(dictationText('first new line second new paragraph third', '', 'en-GB', b)).toBe('First\vSecond\nThird');
  });
  it('adds a space after earlier text and keeps other languages as spoken', () => {
    expect(dictationText('more words', 'some', 'en-US', b)).toBe(' more words');
    expect(dictationText('comma', 'x', 'fr-FR', b)).toBe(' comma');
  });
});
