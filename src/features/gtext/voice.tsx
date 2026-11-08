import { useSyncExternalStore } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import type { FrameStore } from '../../app/store';
import { S } from '../../ui/kit';
import type { NotesApi } from '../../ui/Notes';
import { session } from '../editor/session';
import { insertTextAtCaret } from '../editor/textOps';
import { rangeText } from '../editor/textModel';
import { prefs, setPrefs } from './prefs';
import { dictationText, VOICE_LANGS } from './voiceLangs';

/** Voice typing with the browser's speech recognition, into the slide text being edited or the speaker notes. */

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  // The desktop shell has the API but no recognition service behind it.
  if (/Electron/i.test(navigator.userAgent)) return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const voiceSupported = (): boolean => !!ctor();

interface VoiceState { on: boolean; listening: boolean; interim: string; lang: string; target: 'notes' | 'text' }
let state: VoiceState = { on: false, listening: false, interim: '', lang: 'en-US', target: 'notes' };
let rec: Recognition | null = null;
let notes: NotesApi | null = null;
const subs = new Set<() => void>();
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; for (const f of subs) f(); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useVoice = (): VoiceState => useSyncExternalStore(subscribe, () => state, () => state);
export const voiceActive = (): boolean => state.on;

const deckLang = (store: FrameStore): string => {
  const l = prefs().voiceLang || store.deck.props.language || navigator.language || 'en-US';
  return VOICE_LANGS.some(([k]) => k === l) ? l : VOICE_LANGS.find(([k]) => k.split('-')[0] === l.split('-')[0])?.[0] ?? l;
};

const textBeforeCaret = (target: 'notes' | 'text'): string => {
  if (target === 'notes') {
    const el = notes?.el();
    if (!el) return '';
    return el.value.slice(0, document.activeElement === el ? el.selectionStart : el.value.length);
  }
  const s = session();
  if (!s) return '';
  return rangeText(s.paras, { start: { p: s.sel.start.p, o: 0 }, end: s.sel.start });
};

const insert = (store: FrameStore, phrase: string): void => {
  const target = state.target;
  const text = dictationText(phrase, textBeforeCaret(target), state.lang, target === 'notes' ? { line: '\n', paragraph: '\n\n' } : { line: '\v', paragraph: '\n' });
  if (!text) return;
  if (target === 'notes') notes?.insert(text);
  else if (store.editing) insertTextAtCaret(store, text);
};

export const stopVoice = (): void => {
  set({ on: false, listening: false, interim: '' });
  const r = rec;
  rec = null;
  try { r?.stop(); } catch { /* already stopped */ }
};

export const startVoice = (store: FrameStore, target?: 'notes' | 'text'): void => {
  const C = ctor();
  if (!C) { store.notify('Voice typing isn’t available in this browser.'); return; }
  if (state.on) stopVoice();
  const t = target ?? (store.editing ? 'text' : 'notes');
  if (t === 'notes' && !store.view.notes) { store.view.notes = true; store.emit(); }
  const lang = state.on ? state.lang : deckLang(store);
  const r = new C();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      const tr = res[0]?.transcript ?? '';
      if (res.isFinal) insert(store, tr); else interim += tr;
    }
    set({ interim, listening: true });
  };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    stopVoice();
    store.notify(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Allow the microphone to use voice typing.' : 'Voice typing stopped. Try again.');
  };
  // Recognition ends by itself after a pause; keep going until the person stops it.
  r.onend = () => { if (rec === r && state.on) { try { r.start(); } catch { stopVoice(); } } };
  rec = r;
  set({ on: true, listening: false, interim: '', lang, target: t });
  try { r.start(); } catch { stopVoice(); store.notify('Voice typing could not start.'); }
};

export const toggleVoice = (store: FrameStore, target?: 'notes' | 'text'): void => { if (state.on) stopVoice(); else startVoice(store, target); };

const setLang = (store: FrameStore, lang: string) => {
  setPrefs({ voiceLang: lang });
  if (state.on) { const t = state.target; stopVoice(); state = { ...state, lang }; startVoice(store, t); }
};

/** Mic button in the notes corner. */
export const NotesMic = ({ api }: { api: NotesApi }) => {
  notes = api;
  const v = useVoice();
  if (!voiceSupported()) return null;
  const on = v.on && v.target === 'notes';
  return (
    <div className="gt-notesbar">
      <button className={`tool icon gt-mic${on ? ' on' : ''}`} aria-pressed={on} aria-label={on ? 'Stop voice typing' : 'Voice typing'} title={on ? 'Stop voice typing' : 'Voice typing'}
        onMouseDown={(e) => e.preventDefault()} onClick={() => toggleVoice(api.store, 'notes')}>
        {on ? <MicOff size={16} strokeWidth={S} /> : <Mic size={16} strokeWidth={S} />}
      </button>
    </div>
  );
};

/** Floating bar while dictating: pulsing dot, words being heard, language and stop. */
export const VoiceBar = ({ store }: { store: FrameStore }) => {
  const v = useVoice();
  if (!v.on) return null;
  return (
    <div className="gt-voice" role="status" aria-live="polite" onMouseDown={(e) => { if (!(e.target instanceof HTMLSelectElement)) e.preventDefault(); }}>
      <span className={`dot${v.listening ? '' : ' idle'}`} aria-hidden />
      <span className="txt">{v.interim ? <span className="interim">{v.interim}</span> : <span className="muted">{v.target === 'notes' ? 'Speak to type in the notes' : 'Speak to type in the text'}</span>}</span>
      <select aria-label="Language" value={v.lang} onChange={(e) => setLang(store, e.target.value)}>
        {!VOICE_LANGS.some(([k]) => k === v.lang) && <option value={v.lang}>{v.lang}</option>}
        {VOICE_LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <button className="tool icon" aria-label="Stop voice typing" title="Stop voice typing" onClick={stopVoice}><X size={16} strokeWidth={S} /></button>
    </div>
  );
};
