/** Live captions with the browser's speech recognition, when it has one. Nothing is sent by this app. */

interface Rec {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecCtor = new () => Rec;

const ctor = (): RecCtor | undefined => {
  const g = globalThis as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
};

export const captionsSupported = (): boolean => !!ctor();

/** How captions look in the show. lang '' follows the device language. */
export interface CaptionPrefs { size: 'S' | 'M' | 'L' | 'XL'; pos: 'top' | 'bottom'; lang: string }
const PREFS_KEY = 'clerdoframe.captions';
export const captionPrefs: CaptionPrefs = (() => {
  const d: CaptionPrefs = { size: 'M', pos: 'bottom', lang: '' };
  try { const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<CaptionPrefs> | null; if (v && typeof v === 'object') return { ...d, ...v }; } catch { /* private mode or no storage */ }
  return d;
})();
export const setCaptionPrefs = (p: Partial<CaptionPrefs>): void => {
  Object.assign(captionPrefs, p);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(captionPrefs)); } catch { /* private mode */ }
};
export const CAPTION_FONT: Record<CaptionPrefs['size'], number> = { S: 16, M: 22, L: 30, XL: 40 };

export class Captioner {
  private rec: Rec | null = null;
  private on = false;
  private finalText = '';
  constructor(private onText: (t: string) => void, private onFail: () => void) {}
  start(): void {
    const C = ctor();
    if (!C) { this.onFail(); return; }
    const r = new C();
    r.continuous = true;
    r.interimResults = true;
    r.lang = captionPrefs.lang || navigator.language || 'en-US';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) this.finalText = `${this.finalText} ${res[0]!.transcript}`.trim().slice(-220);
        else interim += res[0]!.transcript;
      }
      this.onText(`${this.finalText} ${interim}`.trim().slice(-200));
    };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.on = false; this.onFail(); } };
    r.onend = () => { if (this.on) { try { r.start(); } catch { /* already started */ } } };
    this.rec = r;
    this.on = true;
    try { r.start(); } catch { this.onFail(); }
  }
  stop(): void { this.on = false; try { this.rec?.stop(); } catch { /* not started */ } this.rec = null; }
}
