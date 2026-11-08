import { DEFAULT_PREFS, type Substitution, type TypingPrefs } from './autocorrect';

const KEY = 'clerdoframe.prefs';
let cache: TypingPrefs | null = null;
const listeners = new Set<() => void>();

const validSubs = (v: unknown): Substitution[] | null => {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is Substitution => !!x && typeof x === 'object' && typeof (x as Substitution).from === 'string' && typeof (x as Substitution).to === 'string')
    .slice(0, 500).map((x) => ({ from: x.from.slice(0, 40), to: x.to.slice(0, 80), on: x.on !== false }));
};

/** Typing preferences (stored on this device). */
export const prefs = (): TypingPrefs => {
  if (cache) return cache;
  let stored: Record<string, unknown> = {};
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown; if (v && typeof v === 'object') stored = v as Record<string, unknown>; } catch { /* storage off or bad JSON */ }
  const out: TypingPrefs = { ...DEFAULT_PREFS, subs: DEFAULT_PREFS.subs.map((s) => ({ ...s })) };
  for (const k of ['smartQuotes', 'lists', 'links', 'capitalize', 'substitutions', 'checkStrike'] as const) if (typeof stored[k] === 'boolean') out[k] = stored[k];
  if (typeof stored.voiceLang === 'string') out.voiceLang = stored.voiceLang.slice(0, 20);
  const subs = validSubs(stored.subs);
  if (subs) out.subs = subs;
  cache = out;
  return out;
};

export const setPrefs = (patch: Partial<TypingPrefs>): void => {
  cache = { ...prefs(), ...patch };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(KEY, JSON.stringify({ ...(stored && typeof stored === 'object' ? stored : {}), ...cache }));
  } catch {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage off */ }
  }
  for (const l of listeners) l();
};

export const onPrefs = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };
