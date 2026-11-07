import type { Deck } from '../model/deck';

/** Lossless internal snapshot (JSON + base64 media). Used for drafts and the clipboard, never as a file format. */
const b64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const deckToJson = (d: Deck): string => {
  const media = Object.fromEntries(Object.entries(d.media).map(([k, m]) => [k, { ...m, data: b64(m.data) }]));
  const extra = d.extraParts ? Object.fromEntries(Object.entries(d.extraParts).map(([k, v]) => [k, b64(v)])) : undefined;
  return JSON.stringify({ format: 'clerdoframe-draft', version: 1, deck: { ...d, media, extraParts: extra } });
};

export const deckFromJson = (text: string): Deck => {
  const o = JSON.parse(text) as { format?: string; deck?: Deck & { media: Record<string, { data: string }>; extraParts?: Record<string, string> } };
  if (o.format !== 'clerdoframe-draft' || !o.deck) throw new Error('Not a ClerdoFrame draft.');
  const d = o.deck;
  const media = Object.fromEntries(Object.entries(d.media).map(([k, m]) => [k, { ...(m as object), data: unb64(m.data) }])) as Deck['media'];
  const extraParts = d.extraParts ? Object.fromEntries(Object.entries(d.extraParts).map(([k, v]) => [k, unb64(v)])) : undefined;
  return { ...(d as unknown as Deck), media, ...(extraParts ? { extraParts } : {}) };
};
