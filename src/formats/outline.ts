// Outline exports: plain text and RTF (titles with their body text by level).
import type { Deck } from '../model/deck';
import { pickSlides, slideBody, slideTitle } from './pages';

export const outlineText = (deck: Deck, hidden = true): string =>
  pickSlides(deck, { hidden }).map((i) => {
    const s = deck.slides[i]!;
    const body = slideBody(s).map((b) => `${'\t'.repeat(b.level + 1)}${b.text.replace(/\n/g, ' ')}`);
    return [slideTitle(s) || 'Untitled slide', ...body].join('\n');
  }).join('\n\n') + '\n';

const rtfText = (s: string): string => {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (ch === '\n') out += '\\line ';
    else if (c < 128) out += ch;
    else if (c < 0x10000) out += `\\u${c > 32767 ? c - 65536 : c}?`;
    else { const h = Math.floor((c - 0x10000) / 0x400) + 0xd800, l = ((c - 0x10000) % 0x400) + 0xdc00; out += `\\u${h - 65536}?\\u${l - 65536}?`; }
  }
  return out;
};

export const outlineRtf = (deck: Deck, hidden = true): string => {
  const font = deck.masters[0]?.theme.fonts.minor ?? 'Calibri';
  const parts = pickSlides(deck, { hidden }).map((i) => {
    const s = deck.slides[i]!;
    const head = `{\\pard\\sb240\\sa60\\b\\fs32 ${rtfText(slideTitle(s) || 'Untitled slide')}\\b0\\par}`;
    const body = slideBody(s).map((b) => `{\\pard\\li${360 + b.level * 360}\\fi-240\\sa40\\fs${Math.max(20, 28 - b.level * 2)} \\bullet\\tab ${rtfText(b.text)}\\par}`);
    return head + body.join('');
  });
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss ${rtfText(font)};}}\\f0\\fs24\n${parts.join('\n')}\n}`;
};
