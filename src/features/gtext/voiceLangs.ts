/** Languages offered for voice typing (BCP 47 tags). */
export const VOICE_LANGS: [string, string][] = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-AU', 'English (Australia)'], ['en-IN', 'English (India)'],
  ['ar-SA', 'Arabic (Saudi Arabia)'], ['ar-EG', 'Arabic (Egypt)'], ['ar-AE', 'Arabic (UAE)'], ['ar-JO', 'Arabic (Jordan)'],
  ['de-DE', 'German'], ['es-ES', 'Spanish (Spain)'], ['es-MX', 'Spanish (Mexico)'], ['fr-FR', 'French'], ['fr-CA', 'French (Canada)'],
  ['it-IT', 'Italian'], ['nl-NL', 'Dutch'], ['pt-BR', 'Portuguese (Brazil)'], ['pt-PT', 'Portuguese (Portugal)'], ['pl-PL', 'Polish'],
  ['sv-SE', 'Swedish'], ['da-DK', 'Danish'], ['nb-NO', 'Norwegian'], ['fi-FI', 'Finnish'], ['tr-TR', 'Turkish'], ['ru-RU', 'Russian'],
  ['uk-UA', 'Ukrainian'], ['el-GR', 'Greek'], ['he-IL', 'Hebrew'], ['hi-IN', 'Hindi'], ['ur-PK', 'Urdu'], ['fa-IR', 'Persian'],
  ['id-ID', 'Indonesian'], ['ms-MY', 'Malay'], ['th-TH', 'Thai'], ['vi-VN', 'Vietnamese'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'],
  ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'],
];

/** Spoken punctuation for English dictation, longest phrases first. */
const SPOKEN: [RegExp, string][] = [
  [/\bnew paragraph\b/gi, '\u0000P'], [/\bnew line\b/gi, '\u0000L'], [/\bnext line\b/gi, '\u0000L'],
  [/\bquestion mark\b/gi, '?'], [/\bexclamation (?:mark|point)\b/gi, '!'], [/\bfull stop\b/gi, '.'], [/\bperiod\b/gi, '.'],
  [/\bcomma\b/gi, ','], [/\bsemicolon\b/gi, ';'], [/\bcolon\b/gi, ':'], [/\bopen (?:paren|parenthesis|bracket)\b/gi, '('], [/\bclose (?:paren|parenthesis|bracket)\b/gi, ')'],
  [/\b(?:hyphen|dash)\b/gi, '-'],
];

/**
 * Turns a dictated phrase into text: spoken punctuation becomes marks, and sentences start with a
 * capital. `afterText` is the text just before the insertion point; `lineBreak` and `paragraph` are
 * what "new line" and "new paragraph" insert.
 */
export const dictationText = (phrase: string, afterText: string, lang: string, breaks: { line: string; paragraph: string }): string => {
  let t = phrase.trim();
  if (!t) return '';
  if (/^en\b/i.test(lang)) for (const [re, rep] of SPOKEN) t = t.replace(re, rep);
  // No space before marks; one after.
  t = t.replace(/\s+([.,;:?!)])/g, '$1').replace(/([(])\s+/g, '$1').replace(/\s*\u0000([PL])\s*/g, '\u0000$1');
  let out = '';
  let prev = afterText;
  const parts = t.split(/(\u0000[PL])/);
  for (const part of parts) {
    if (part === '\u0000P') { out += breaks.paragraph; prev = '\n'; continue; }
    if (part === '\u0000L') { out += breaks.line; prev = '\n'; continue; }
    if (!part) continue;
    let chunk = part;
    const startSentence = !prev.trim() || /[.!?]\s*$/.test(prev) || /\n\s*$/.test(prev);
    if (startSentence) chunk = chunk.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
    chunk = chunk.replace(/([.!?]\s+)(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase());
    const needSpace = prev && !/[\s(\n]$/.test(prev) && !/^[.,;:?!)]/.test(chunk);
    out += (needSpace ? ' ' : '') + chunk;
    prev = prev + (needSpace ? ' ' : '') + chunk;
  }
  return out;
};
