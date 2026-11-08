import { useState } from 'react';
import { Check as CheckIcon, Play, Repeat, Timer, TimerOff, Type } from 'lucide-react';
import { run } from '../../app/commands';
import type { DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { Check, Dialog, S } from '../../ui/kit';
import { showOf, type ShowController } from '../show/controller';
import { captionPrefs, setCaptionPrefs, type CaptionPrefs } from '../show/captions';

export const PRESETS = [1, 2, 3, 5, 10, 15, 30, 60];
export interface AutoArg { seconds: number; loop: boolean }

const PREF_KEY = 'clerdoframe.autoplay';
export const autoPrefs = (): AutoArg => {
  try { const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null') as Partial<AutoArg> | null; if (v && typeof v.seconds === 'number') return { seconds: clampSec(v.seconds), loop: !!v.loop }; } catch { /* no storage */ }
  return { seconds: 5, loop: true };
};
const savePrefs = (a: AutoArg): void => { try { localStorage.setItem(PREF_KEY, JSON.stringify(a)); } catch { /* private mode */ } };
export const clampSec = (n: number): number => Math.max(1, Math.min(3600, Math.round(Number.isFinite(n) ? n : 5)));
const label = (n: number) => (n >= 60 && n % 60 === 0 ? `${n / 60} min` : `${n} s`);

/** Starts the show auto-playing, or changes the running show's interval. */
export const startAutoplay = (store: FrameStore, a: AutoArg): void => {
  const arg = { seconds: clampSec(a.seconds), loop: !!a.loop };
  savePrefs(arg);
  let c = showOf(store);
  if (!c || c.mode === 'reading') {
    run(store, 'show.fromStart');
    c = showOf(store);
  }
  if (!c) return;
  c.autoAdvance = arg;
  if (c.paused) c.togglePause();
  c.emit();
};

export const stopAutoplay = (c: ShowController): void => { c.autoAdvance = null; c.emit(); };

const Intervals = ({ value, onPick }: { value: number; onPick: (n: number) => void }) => {
  const [custom, setCustom] = useState(PRESETS.includes(value) ? '' : String(value));
  return (
    <div className="gp-intervals" role="radiogroup" aria-label="Interval">
      {PRESETS.map((n) => <button key={n} role="radio" aria-checked={value === n} className={`gp-chip${value === n ? ' on' : ''}`} onClick={() => { setCustom(''); onPick(n); }}>{label(n)}</button>)}
      <label className="gp-custom">
        <span>Custom</span>
        <input type="number" min={1} max={3600} inputMode="numeric" value={custom} placeholder="s" aria-label="Custom seconds"
          onChange={(e) => { setCustom(e.target.value); const n = Number(e.target.value); if (n >= 1) onPick(clampSec(n)); }} />
      </label>
    </div>
  );
};

export const AutoplayDialog = ({ store, close }: DialogProps) => {
  const [a, setA] = useState(autoPrefs);
  return (
    <Dialog title="Auto-play" close={close} okLabel="Start" onOk={() => { queueMicrotask(() => startAutoplay(store, a)); return true; }}>
      <p className="muted small">The show moves to the next slide on its own. Animations play first.</p>
      <Intervals value={a.seconds} onPick={(n) => setA({ ...a, seconds: n })} />
      <Check label="Loop: start again after the last slide" checked={a.loop} onChange={(v) => setA({ ...a, loop: v })} />
    </Dialog>
  );
};

/** Present tab section. */
export const AutoplaySection = ({ store }: { store: FrameStore }) => {
  const [a, setA] = useState(autoPrefs);
  return (
    <div className="toollist">
      <Intervals value={a.seconds} onPick={(n) => setA({ ...a, seconds: n })} />
      <Check label="Loop" checked={a.loop} onChange={(v) => setA({ ...a, loop: v })} />
      <button className="tool" onClick={() => startAutoplay(store, a)}><Timer size={16} strokeWidth={S} /><span>Start auto-play</span></button>
    </div>
  );
};

/** The show bar's Auto-play menu. */
export const AutoplayMenu = ({ c }: { c: ShowController }) => {
  const [open, setOpen] = useState(false);
  const on = c.autoAdvance;
  const pick = (seconds: number) => { startAutoplay(c.store, { seconds, loop: on?.loop ?? autoPrefs().loop }); };
  return (
    <div className="show-pop">
      <button className={`show-btn${on ? ' on' : ''}`} aria-label="Auto-play" title="Auto-play" aria-expanded={open} onClick={() => setOpen(!open)}><Timer size={18} strokeWidth={S} /></button>
      {open && (
        <div className="show-menu up" role="menu" onPointerUp={(e) => e.stopPropagation()}>
          <div className="show-menu-h">Auto-play every</div>
          <div className="gp-show-grid">
            {PRESETS.map((n) => <button key={n} role="menuitemradio" aria-checked={on?.seconds === n} className={on?.seconds === n ? 'on' : ''} onClick={() => pick(n)}>{label(n)}</button>)}
          </div>
          <label className="gp-show-custom">Custom <input type="number" min={1} max={3600} defaultValue={on && !PRESETS.includes(on.seconds) ? on.seconds : ''} aria-label="Custom seconds"
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { const n = Number((e.target as HTMLInputElement).value); if (n >= 1) pick(n); } }} /> s</label>
          <button role="menuitemcheckbox" aria-checked={!!on?.loop} onClick={() => { const loop = !(on?.loop ?? autoPrefs().loop); if (on) startAutoplay(c.store, { seconds: on.seconds, loop }); else savePrefs({ ...autoPrefs(), loop }); c.emit(); }}>
            <Repeat size={16} strokeWidth={S} /> Loop {(on?.loop ?? autoPrefs().loop) && <CheckIcon size={14} strokeWidth={S} />}
          </button>
          <div className="show-menu-sep" />
          {on
            ? <button onClick={() => { stopAutoplay(c); setOpen(false); }}><TimerOff size={16} strokeWidth={S} /> Stop auto-play</button>
            : <button onClick={() => { pick(autoPrefs().seconds); setOpen(false); }}><Play size={16} strokeWidth={S} /> Start ({label(autoPrefs().seconds)})</button>}
          {on && <button onClick={() => c.togglePause()}>{c.paused ? 'Resume' : 'Pause'}</button>}
        </div>
      )}
    </div>
  );
};

const LANGS: [string, string][] = [
  ['', 'Device language'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['ar-SA', 'Arabic'], ['zh-CN', 'Chinese'], ['nl-NL', 'Dutch'], ['fr-FR', 'French'], ['de-DE', 'German'],
  ['hi-IN', 'Hindi'], ['id-ID', 'Indonesian'], ['it-IT', 'Italian'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['pl-PL', 'Polish'], ['pt-BR', 'Portuguese'], ['ru-RU', 'Russian'],
  ['es-ES', 'Spanish'], ['sv-SE', 'Swedish'], ['tr-TR', 'Turkish'], ['uk-UA', 'Ukrainian'],
];

/** Captions settings popover in the show bar. */
export const CaptionSettings = ({ c }: { c: ShowController }) => {
  const [open, setOpen] = useState(false);
  const set = (p: Partial<CaptionPrefs>) => { setCaptionPrefs(p); c.emit(); };
  const p = captionPrefs;
  return (
    <div className="show-pop">
      <button className="show-btn" aria-label="Caption settings" title="Caption settings" aria-expanded={open} onClick={() => setOpen(!open)}><Type size={18} strokeWidth={S} /></button>
      {open && (
        <div className="show-menu up gp-capset" role="dialog" aria-label="Caption settings" onPointerUp={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <div className="show-menu-h">Text size</div>
          <div className="gp-show-grid four">
            {(['S', 'M', 'L', 'XL'] as const).map((s) => <button key={s} aria-pressed={p.size === s} className={p.size === s ? 'on' : ''} onClick={() => set({ size: s })}>{s}</button>)}
          </div>
          <div className="show-menu-h">Position</div>
          <div className="gp-show-grid two">
            <button aria-pressed={p.pos === 'top'} className={p.pos === 'top' ? 'on' : ''} onClick={() => set({ pos: 'top' })}>Top</button>
            <button aria-pressed={p.pos === 'bottom'} className={p.pos === 'bottom' ? 'on' : ''} onClick={() => set({ pos: 'bottom' })}>Bottom</button>
          </div>
          <div className="show-menu-h">Spoken language</div>
          <select className="gp-show-select" value={p.lang} aria-label="Spoken language" onChange={(e) => set({ lang: e.target.value })}>
            {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {!c.subtitles && <button onClick={() => { c.subtitles = true; c.captions = ''; c.emit(); }}>Turn on subtitles</button>}
        </div>
      )}
    </div>
  );
};
