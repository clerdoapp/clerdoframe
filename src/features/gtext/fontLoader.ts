import type { Deck } from '../../model/deck';
import { fontStack } from '../../render/inherit';
import { FAMILIES, familyOf, type FontFamily } from './catalog';

/**
 * Loads bundled font families on first use. Core families ship with the app; the others are
 * separate style sheets (and font files) fetched only when a slide or a preview uses them.
 */

const loading = new Map<string, Promise<void>>();
const seen = new Set<string>();
const listeners = new Set<() => void>();
let files: Promise<typeof import('./fontFiles')> | null = null;

/** Called when a font has finished loading (previews re-measure). */
export const onFontLoaded = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export const availableFamilies = (): FontFamily[] => FAMILIES;
export const isBundled = (name: string): boolean => !!familyOf(name);

/** Starts loading a bundled family's style sheets; resolves when they're in the page. Unknown names resolve at once. */
export const ensureFont = (name: string): Promise<void> => {
  const fam = familyOf(name);
  if (!fam || fam.core) return Promise.resolve();
  let p = loading.get(fam.name);
  if (!p) {
    files ??= import('./fontFiles');
    p = files
      .then((m) => Promise.all(m.sheetsFor(fam.pkg).map((load) => load().catch(() => undefined))))
      .then(() => { for (const l of listeners) l(); })
      .catch(() => { loading.delete(fam.name); });
    loading.set(fam.name, p);
  }
  return p;
};

/** Fast path for the renderer: called for every font name it draws with. */
export const noteFontUsed = (name: string): void => {
  if (seen.has(name)) return;
  seen.add(name);
  void ensureFont(name);
};

const familiesOfStack = (stack: string): string[] => stack.split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter((x) => x && !/^(system-ui|sans-serif|serif|monospace)$/.test(x));

/** Every font name a deck refers to (runs, paragraph defaults, bullets, theme fonts). */
export const deckFonts = (deck: Deck): Set<string> => {
  const out = new Set<string>();
  const visit = (v: unknown, key: string, depth: number): void => {
    if (depth > 40 || v === null || v === undefined) return;
    if (typeof v === 'string') {
      if ((key === 'font' || key === 'major' || key === 'minor') && !v.startsWith('+')) out.add(v);
      return;
    }
    if (typeof v !== 'object' || v instanceof Uint8Array) return;
    if (Array.isArray(v)) { for (const x of v) visit(x, key, depth + 1); return; }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k !== 'media' && k !== 'extraParts' && k !== 'keep') visit(x, k, depth + 1);
  };
  visit(deck, '', 0);
  return out;
};

/** Loads the bundled families a deck uses (and their look-alikes) and waits for their font files, so exports can inline them. */
export const ensureFontsForDeck = async (deck: Deck): Promise<void> => {
  const names = new Set<string>();
  for (const n of deckFonts(deck)) for (const f of familiesOfStack(fontStack(n))) if (isBundled(f)) names.add(f);
  await Promise.all([...names].map(ensureFont));
  if (typeof document === 'undefined' || !document.fonts) return;
  const loads: Promise<unknown>[] = [];
  for (const n of names) for (const w of ['400', '700']) for (const st of ['normal', 'italic']) loads.push(document.fonts.load(`${st} ${w} 16px "${n}"`).catch(() => undefined));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 4000))]);
};

// ---------- My fonts and recent fonts ----------

const MINE = 'clerdoframe.myFonts';
const RECENT = 'clerdoframe.recentFonts';
const read = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 200) : []; } catch { return []; } };
const write = (k: string, v: string[]): void => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };

export const myFonts = (): string[] => read(MINE);
export const setMyFonts = (v: string[]): void => write(MINE, [...new Set(v)]);
export const toggleMyFont = (name: string): boolean => {
  const cur = myFonts();
  const on = !cur.includes(name);
  setMyFonts(on ? [...cur, name].sort((a, b) => a.localeCompare(b)) : cur.filter((x) => x !== name));
  return on;
};
export const recentFonts = (): string[] => read(RECENT);
export const noteRecentFont = (name: string): void => {
  if (!name || name.startsWith('+')) return;
  write(RECENT, [name, ...recentFonts().filter((x) => x !== name)].slice(0, 6));
};
