import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { run } from '../../app/commands';
import type { DialogProps } from '../../app/registry';
import { uid, type Animation, type CustomShow, type Media, type ShowSettings } from '../../model/deck';
import { mediaUrl } from '../../render/paint';
import { Check, Dialog, Field, NumberField, S, Select } from '../../ui/kit';
import { DURATIONS } from './commands';
import { effectDef } from './effects';
import { SOUNDS, playSound } from './sound';
import { recordingSupported } from './recorder';
import { captionsSupported } from './captions';

// ---------- Set up show ----------

export const SetupDialog = ({ store, close }: DialogProps) => {
  const d = store.deck;
  const [st, setSt] = useState<ShowSettings>(() => structuredClone(d.show));
  const [range, setRange] = useState<'all' | 'range' | 'custom'>(st.customShow ? 'custom' : st.range ? 'range' : 'all');
  const [presenterView, setPresenterView] = useState(store.ext.presenterDefault === true);
  const n = d.slides.length;
  const set = (p: Partial<ShowSettings>) => setSt({ ...st, ...p });
  return (
    <Dialog title="Set up slide show" close={close} width={520} okLabel="Save" onOk={() => {
      store.tryChange('Set up show', () => {
        const out: ShowSettings = { ...st };
        if (range !== 'range') delete out.range;
        if (range !== 'custom') delete out.customShow;
        if (range === 'custom' && !out.customShow) out.customShow = d.customShows[0]?.id;
        if (out.type === 'kiosk') out.loop = true;
        d.show = out;
      });
      store.ext.presenterDefault = presenterView;
    }}>
      <div className="grid2">
        <fieldset className="fs">
          <legend>Show type</legend>
          <label className="check"><input type="radio" checked={st.type === 'presenter'} onChange={() => set({ type: 'presenter' })} /> Presented by a speaker (full screen)</label>
          <label className="check"><input type="radio" checked={st.type === 'browsed'} onChange={() => set({ type: 'browsed' })} /> Browsed by one person (in a window)</label>
          <label className="check"><input type="radio" checked={st.type === 'kiosk'} onChange={() => set({ type: 'kiosk', loop: true })} /> Browsed at a kiosk (full screen, runs by itself)</label>
        </fieldset>
        <fieldset className="fs">
          <legend>Slides</legend>
          <label className="check"><input type="radio" checked={range === 'all'} onChange={() => setRange('all')} /> All</label>
          <div className="rowx">
            <label className="check"><input type="radio" checked={range === 'range'} onChange={() => { setRange('range'); if (!st.range) set({ range: { from: 1, to: n } }); }} /> From</label>
            <NumberField label="" value={st.range?.from ?? 1} min={1} max={n} width={70} onChange={(v) => { setRange('range'); set({ range: { from: v, to: Math.max(v, st.range?.to ?? n) } }); }} />
            <span>to</span>
            <NumberField label="" value={st.range?.to ?? n} min={1} max={n} width={70} onChange={(v) => { setRange('range'); set({ range: { from: Math.min(v, st.range?.from ?? 1), to: v } }); }} />
          </div>
          <label className="check"><input type="radio" disabled={!d.customShows.length} checked={range === 'custom'} onChange={() => setRange('custom')} /> Custom show</label>
          {range === 'custom' && <Select value={st.customShow ?? d.customShows[0]?.id ?? ''} options={d.customShows.map((c): [string, string] => [c.id, c.name])} onChange={(v) => set({ customShow: v })} />}
        </fieldset>
        <fieldset className="fs">
          <legend>Show options</legend>
          <Check label="Loop until Esc is pressed" checked={!!st.loop || st.type === 'kiosk'} onChange={(v) => set({ loop: v || undefined })} />
          <Check label="Show without narration" checked={!!st.noNarration} onChange={(v) => set({ noNarration: v || undefined })} />
          <Check label="Show without animation" checked={!!st.noAnimation} onChange={(v) => set({ noAnimation: v || undefined })} />
          <div className="rowx">
            <label className="lbl"><span>Pen color</span><input type="color" value={typeof st.penColor === 'string' ? st.penColor : '#E8401C'} onChange={(e) => set({ penColor: e.target.value.toUpperCase() })} /></label>
            <label className="lbl"><span>Laser color</span><input type="color" value={typeof st.laserColor === 'string' ? st.laserColor : '#FF2A2A'} onChange={(e) => set({ laserColor: e.target.value.toUpperCase() })} /></label>
          </div>
        </fieldset>
        <fieldset className="fs">
          <legend>Advance slides</legend>
          <label className="check"><input type="radio" checked={!st.useTimings} onChange={() => set({ useTimings: false })} /> Manually</label>
          <label className="check"><input type="radio" checked={!!st.useTimings} onChange={() => set({ useTimings: true })} /> Using timings, if there are any</label>
          <legend className="mt">Presenter view</legend>
          <Check label="Use presenter view when presenting" checked={presenterView} onChange={setPresenterView} />
          <p className="muted small">The slides open in a second window you can move to the projector.</p>
        </fieldset>
      </div>
    </Dialog>
  );
};

// ---------- Custom shows ----------

export const CustomShowsDialog = ({ store, close }: DialogProps) => {
  const d = store.deck;
  const [shows, setShows] = useState<CustomShow[]>(() => structuredClone(d.customShows));
  const [cur, setCur] = useState<string | null>(shows[0]?.id ?? null);
  const [pick, setPick] = useState<number[]>([]);
  const [selIn, setSelIn] = useState<number | null>(null);
  const show = shows.find((s) => s.id === cur);
  const update = (fn: (s: CustomShow) => void) => setShows(shows.map((s) => (s.id === cur ? (() => { const c = structuredClone(s); fn(c); return c; })() : s)));
  const save = () => store.tryChange('Custom shows', () => { d.customShows = shows.filter((s) => s.name.trim()); if (d.show.customShow && !d.customShows.some((c) => c.id === d.show.customShow)) delete d.show.customShow; });
  const label = (id: string) => { const i = d.slides.findIndex((s) => s.id === id); return i < 0 ? 'Missing slide' : `${i + 1}. ${slideTitle(store, i)}`; };
  return (
    <Dialog title="Custom shows" close={close} wide okLabel="Save" onOk={save}
      footer={show ? <button className="primary" onClick={() => { save(); close(); run(store, 'show.runCustom', show.id); }}>Save and play</button> : undefined}>
      <div className="cs-wrap">
        <div className="cs-list">
          {shows.map((s) => <button key={s.id} className={`tool${s.id === cur ? ' on' : ''}`} onClick={() => setCur(s.id)}>{s.name || 'Untitled'}</button>)}
          <button className="tool" onClick={() => { const n: CustomShow = { id: uid('cs'), name: `Custom show ${shows.length + 1}`, slides: [] }; setShows([...shows, n]); setCur(n.id); }}><Plus size={15} strokeWidth={S} /> New</button>
          {show && <button className="tool" onClick={() => { setShows(shows.filter((s) => s.id !== cur)); setCur(shows.find((s) => s.id !== cur)?.id ?? null); }}><Trash2 size={15} strokeWidth={S} /> Remove</button>}
          {show && <button className="tool" onClick={() => { const c = { ...structuredClone(show), id: uid('cs'), name: `${show.name} copy` }; setShows([...shows, c]); setCur(c.id); }}><Plus size={15} strokeWidth={S} /> Copy</button>}
        </div>
        {show ? (
          <div className="cs-edit">
            <Field label="Name"><input value={show.name} onChange={(e) => update((s) => { s.name = e.target.value; })} /></Field>
            <div className="cs-cols">
              <div>
                <div className="sub-h">Slides in the presentation</div>
                <div className="checklist">
                  {d.slides.map((sl, i) => (
                    <label key={sl.id}><input type="checkbox" checked={pick.includes(i)} onChange={(e) => setPick(e.target.checked ? [...pick, i] : pick.filter((x) => x !== i))} /> {i + 1}. {slideTitle(store, i)}</label>
                  ))}
                </div>
                <button className="tool" disabled={!pick.length} onClick={() => { update((s) => { s.slides.push(...[...pick].sort((a, b) => a - b).map((i) => d.slides[i]!.id)); }); setPick([]); }}><Plus size={15} strokeWidth={S} /> Add</button>
              </div>
              <div>
                <div className="sub-h">Slides in the custom show</div>
                <div className="checklist">
                  {show.slides.map((id, k) => (
                    <button key={`${id}${k}`} className={`tool${selIn === k ? ' on' : ''}`} onClick={() => setSelIn(k)}>{k + 1}. {label(id)}</button>
                  ))}
                  {!show.slides.length && <span className="muted small">Add slides from the left.</span>}
                </div>
                <div className="iconrow">
                  <button className="tool" disabled={selIn === null || selIn === 0} onClick={() => { update((s) => { const k = selIn!; [s.slides[k - 1], s.slides[k]] = [s.slides[k]!, s.slides[k - 1]!]; }); setSelIn(selIn! - 1); }}><ChevronUp size={15} strokeWidth={S} /> Up</button>
                  <button className="tool" disabled={selIn === null || selIn >= show.slides.length - 1} onClick={() => { update((s) => { const k = selIn!; [s.slides[k + 1], s.slides[k]] = [s.slides[k]!, s.slides[k + 1]!]; }); setSelIn(selIn! + 1); }}><ChevronDown size={15} strokeWidth={S} /> Down</button>
                  <button className="tool" disabled={selIn === null} onClick={() => { update((s) => { s.slides.splice(selIn!, 1); }); setSelIn(null); }}><X size={15} strokeWidth={S} /> Remove</button>
                </div>
              </div>
            </div>
          </div>
        ) : <p className="muted">Make a custom show to present a chosen set of slides in your own order.</p>}
      </div>
    </Dialog>
  );
};

const slideTitle = (store: DialogProps['store'], i: number): string => {
  const sl = store.deck.slides[i];
  if (!sl) return '';
  for (const s of sl.shapes) {
    if (s.kind === 'shape' && s.ph && (s.ph.type === 'title' || s.ph.type === 'ctrTitle')) {
      const t = s.text?.paras.map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim();
      if (t) return t.slice(0, 60);
    }
  }
  return sl.name ?? 'Slide';
};

// ---------- Record ----------

export const RecordDialog = ({ store, close }: DialogProps) => {
  const [camera, setCamera] = useState(false);
  const ok = recordingSupported();
  return (
    <Dialog title="Record slide show" close={close} width={420} okLabel="Start recording" onOk={ok ? () => { run(store, 'show.recordStart', { camera }); } : undefined}>
      {ok ? (
        <div className="col">
          <p>Your voice is recorded for each slide, with the time you spend on it. Each slide gets its narration as an audio clip that plays by itself.</p>
          <Check label="Record the camera too (shown as a small video on each slide)" checked={camera} onChange={setCamera} />
          <p className="muted small">The recording starts from the current slide. Press Esc or Stop to finish.</p>
          <div className="iconrow">
            <button className="tool" onClick={() => { close(); run(store, 'show.clearTimings'); }}>Clear timings</button>
            <button className="tool" onClick={() => { close(); run(store, 'show.clearNarration'); }}>Clear narration</button>
          </div>
        </div>
      ) : <p>Recording needs a browser that can use the microphone and record audio.</p>}
    </Dialog>
  );
};

// ---------- Effect options ----------

export const EffectOptionsDialog = ({ store, data, close }: DialogProps<string>) => {
  const sl = store.slide;
  const orig = sl?.animations.find((a) => a.id === data);
  const [a, setA] = useState<Animation | null>(() => (orig ? structuredClone(orig) : null));
  const [tab, setTab] = useState<'effect' | 'timing' | 'text'>('effect');
  if (!sl || !orig || !a) return null;
  const d = effectDef(a.cls, a.effect);
  const set = (p: Partial<Animation>) => setA({ ...a, ...p });
  const sh = sl.shapes.find((x) => x.id === a.shape);
  const textual = sh?.kind === 'shape' && !!sh.text?.paras.some((p) => p.runs.some((r) => r.text.trim()));
  const repeatV = a.repeat === undefined ? 'none' : String(a.repeat);
  const after = a.afterAnim ?? 'none';
  return (
    <Dialog title={`${d?.label ?? a.effect} options`} close={close} width={460} okLabel="Apply"
      onOk={() => { store.tryChange('Effect options', () => { const live = sl.animations.find((x) => x.id === a.id); if (live) { for (const k of Object.keys(live)) delete (live as unknown as Record<string, unknown>)[k]; Object.assign(live, a); } }); }}>
      <div className="seg" role="tablist">
        {(['effect', 'timing', ...(textual ? ['text'] : [])] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t as typeof tab)}>{t === 'effect' ? 'Effect' : t === 'timing' ? 'Timing' : 'Text animation'}</button>)}
      </div>
      {tab === 'effect' && (
        <div className="col">
          {d?.options && <Select label="Direction or style" value={a.option ?? d.options[0]![0]} options={d.options} onChange={(v) => set({ option: v })} />}
          {d?.valueKind === 'color' && <label className="lbl"><span>Color</span><input type="color" value={typeof a.value === 'string' ? a.value : '#2C7BE5'} onChange={(e) => set({ value: e.target.value.toUpperCase() })} /></label>}
          {d?.valueKind === 'percent' && <NumberField label="Amount" suffix="%" value={Number(a.value ?? 150)} onChange={(v) => set({ value: v })} />}
          {d?.valueKind === 'angle' && <NumberField label="Amount" suffix="deg" value={Number(a.value ?? 360)} step={15} onChange={(v) => set({ value: v })} />}
          <div className="rowx">
            <NumberField label="Smooth start" suffix="s" value={(a.smoothStart ?? d?.smooth?.[0] ?? 0) * a.duration} step={0.1} min={0} max={a.duration} width={120} onChange={(v) => set({ smoothStart: a.duration ? Math.min(1, v / a.duration) : 0 })} />
            <NumberField label="Smooth end" suffix="s" value={(a.smoothEnd ?? d?.smooth?.[1] ?? 0) * a.duration} step={0.1} min={0} max={a.duration} width={120} onChange={(v) => set({ smoothEnd: a.duration ? Math.min(1, v / a.duration) : 0 })} />
            <NumberField label="Bounce end" suffix="s" value={(a.bounceEnd ?? 0) * a.duration} step={0.1} min={0} max={a.duration} width={120} onChange={(v) => set({ bounceEnd: a.duration ? Math.min(1, v / a.duration) : 0 })} />
          </div>
          <Select label="Sound" value={a.sound && SOUNDS.some(([v]) => v === a.sound) ? a.sound : ''} options={SOUNDS} onChange={(v) => { set({ sound: v || undefined }); playSound(v); }} />
          {a.cls !== 'exit' && (
            <div className="rowx">
              <Select label="After animation" value={after} options={[['none', "Don't dim"], ['dim', 'Dim to a color'], ['hide', 'Hide after animation'], ['hideOnClick', 'Hide on next click']]} onChange={(v) => set({ afterAnim: v === 'none' ? undefined : v })} />
              {after === 'dim' && <label className="lbl"><span>Dim color</span><input type="color" value={typeof a.dimColor === 'string' ? a.dimColor : '#9AA0AB'} onChange={(e) => set({ dimColor: e.target.value.toUpperCase() })} /></label>}
            </div>
          )}
          {textual && (a.cls === 'entr' || a.cls === 'exit') && <Select label="Animate text" value={a.textBy === 'word' || a.textBy === 'letter' ? a.textBy : 'all'} options={[['all', 'All at once'], ['word', 'By word'], ['letter', 'By letter']]} onChange={(v) => set({ textBy: v === 'all' ? (a.textBy === 'para' ? 'para' : undefined) : v })} />}
        </div>
      )}
      {tab === 'timing' && (
        <div className="col">
          <Select label="Start" value={a.trigger} options={[['click', 'On click'], ['with', 'With previous'], ['after', 'After previous']]} onChange={(v) => set({ trigger: v })} />
          <NumberField label="Delay" suffix="s" value={a.delay} step={0.25} min={0} onChange={(v) => set({ delay: v })} />
          <div className="rowx">
            <Select label="Duration" value={DURATIONS.some(([v]) => v === a.duration) ? String(a.duration) : 'custom'} options={[...DURATIONS.map(([v, l]): [string, string] => [String(v), `${v} s (${l.toLowerCase()})`]), ['custom', 'Other']]} onChange={(v) => { if (v !== 'custom') set({ duration: Number(v) }); }} />
            <NumberField label="Seconds" value={a.duration} step={0.25} min={0} max={60} width={90} onChange={(v) => set({ duration: v })} />
          </div>
          <Select label="Repeat" value={repeatV} options={[['none', 'None'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['10', '10'], ['untilNextClick', 'Until next click'], ['untilEnd', 'Until end of slide']]}
            onChange={(v) => set({ repeat: v === 'none' ? undefined : v === 'untilNextClick' || v === 'untilEnd' ? v : Number(v) })} />
          <Check label="Rewind when done playing" checked={!!a.rewind} onChange={(v) => set({ rewind: v || undefined })} />
          <Select label="Triggers" value={a.triggerShape ?? ''} options={[['', 'Animate as part of the click sequence'], ...sl.shapes.filter((x) => x.id !== a.shape).map((x): [string, string] => [x.id, `Start on click of ${x.name || x.kind}`])]} onChange={(v) => set({ triggerShape: v || undefined })} />
        </div>
      )}
      {tab === 'text' && (
        <div className="col">
          <Select label="Group text" value={a.textBy === 'para' ? 'para' : 'all'} options={[['all', 'As one object'], ['para', 'By paragraph']]} onChange={(v) => set({ textBy: v === 'para' ? 'para' : undefined })} />
          <p className="muted small">By paragraph plays each paragraph in turn. With "On click" each paragraph needs its own click.</p>
        </div>
      )}
    </Dialog>
  );
};

// ---------- Trim ----------

export const TrimDialog = ({ store, data, close }: DialogProps<string>) => {
  const m = store.slide?.shapes.find((x): x is Media => x.id === data && x.kind === 'media');
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [dur, setDur] = useState(0);
  const [range, setRange] = useState<{ start: number; end: number }>(() => ({ start: m?.trim?.start ?? 0, end: m?.trim?.end ?? 0 }));
  const [t, setT] = useState(0);
  const url = m ? mediaUrl(store.deck, m.media) : undefined;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const meta = () => { const d0 = Number.isFinite(el.duration) ? el.duration : 0; setDur(d0); setRange((r) => ({ start: r.start, end: r.end || d0 })); el.currentTime = range.start; };
    const tu = () => { setT(el.currentTime); if (range.end && el.currentTime >= range.end) el.pause(); };
    el.addEventListener('loadedmetadata', meta);
    el.addEventListener('timeupdate', tu);
    return () => { el.removeEventListener('loadedmetadata', meta); el.removeEventListener('timeupdate', tu); };
  }, [range.end, range.start]);
  if (!m || !url) return null;
  const seek = (v: number) => { const el = ref.current; if (el) el.currentTime = v; setT(v); };
  const fmt = (v: number) => `${Math.floor(v / 60)}:${(v % 60).toFixed(2).padStart(5, '0')}`;
  return (
    <Dialog title={m.mediaType === 'video' ? 'Trim video' : 'Trim audio'} close={close} width={560} okLabel="Trim"
      onOk={() => { store.tryChange('Trim media', () => { const live = store.slide?.shapes.find((x): x is Media => x.id === m.id && x.kind === 'media'); if (!live) return; if (range.start <= 0.01 && (!dur || range.end >= dur - 0.01)) delete live.trim; else live.trim = { start: Math.round(range.start * 100) / 100, end: Math.round(range.end * 100) / 100 }; }); }}>
      <div className="col">
        {m.mediaType === 'video' ? <video ref={ref} src={url} playsInline preload="auto" style={{ width: '100%', maxHeight: 300, background: '#000', borderRadius: 6 }} /> : <audio ref={ref} src={url} preload="auto" />}
        <div className="trim-track">
          <input type="range" min={0} max={dur || 1} step={0.01} value={t} aria-label="Position" onChange={(e) => seek(Number(e.target.value))} />
        </div>
        <div className="rowx">
          <NumberField label="Start" suffix="s" value={range.start} step={0.1} min={0} max={range.end || dur} width={110} onChange={(v) => { setRange({ ...range, start: v }); seek(v); }} />
          <button className="tool" onClick={() => setRange({ ...range, start: Math.min(t, range.end || t) })}>Set start here</button>
          <NumberField label="End" suffix="s" value={range.end} step={0.1} min={range.start} max={dur || undefined} width={110} onChange={(v) => { setRange({ ...range, end: v }); seek(v); }} />
          <button className="tool" onClick={() => setRange({ ...range, end: Math.max(t, range.start) })}>Set end here</button>
        </div>
        <div className="rowx">
          <button className="tool" onClick={() => { const el = ref.current; if (!el) return; if (el.paused) { if (el.currentTime < range.start || el.currentTime >= range.end) el.currentTime = range.start; void el.play().catch(() => undefined); } else el.pause(); }}>Play / pause</button>
          <span className="muted small">{fmt(t)} · length {fmt(Math.max(0, (range.end || dur) - range.start))} of {fmt(dur)}</span>
        </div>
      </div>
    </Dialog>
  );
};

export { captionsSupported };
