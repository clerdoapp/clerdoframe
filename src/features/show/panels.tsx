import { useEffect, useRef, useState } from 'react';
import {
  Brush, Eye, ListOrdered, MonitorPlay, Pause, Play, Plus, Presentation, Scissors, Timer, Trash2, Mic,
  ChevronUp, ChevronDown, Captions, EyeOff, Settings2, ListVideo, Image, RotateCcw, Volume2, Spline, Rewind, BookOpenText,
} from 'lucide-react';
import { run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import type { AnimClass, Animation, Media } from '../../model/deck';
import { Btn, Check, NumberField, S, Select } from '../../ui/kit';
import { EFFECTS, effectDef, evalEffect, type EffectDef } from './effects';
import { GROUP_LABEL, TRANSITIONS, play, transitionDef, type TDef, type TGroup } from './transitions';
import { editedAnims } from './commands';
import { SOUNDS, playSound } from './sound';
import { captionsSupported } from './captions';
import { recordingSupported } from './recorder';
import { preview as mediaPreview } from './media';
import { CLASS_ICON, CLASS_LABEL } from './icons';

// ---------- Small animated previews ----------

/** A tiny two-slide sample (A then B) that plays a transition on hover or tap. */
const TransitionThumb = ({ def, on, onPick }: { def: TDef; on: boolean; onPick: () => void }) => {
  const root = useRef<HTMLDivElement>(null);
  const cancel = useRef<(() => void) | null>(null);
  const go = () => {
    const r = root.current;
    if (!r || def.id === 'none' || cancel.current) return;
    const [from, to] = [r.children[0] as HTMLElement, r.children[1] as HTMLElement];
    const seed = 7;
    const d = def.id === 'random' ? transitionDef('fade')! : def.id === 'morph' ? transitionDef('fade')! : def;
    const p = play(d, { from, to, root: r, w: r.clientWidth, h: r.clientHeight, option: def.options?.[0]?.[0] ?? '', seed }, Math.min(1.4, Math.max(0.6, def.dur * 0.7)));
    cancel.current = p.cancel;
    void p.done.then(() => { cancel.current = null; });
  };
  useEffect(() => () => cancel.current?.(), []);
  return (
    <button className={`tr-cell${on ? ' on' : ''}`} title={def.label} aria-label={def.label} aria-pressed={on} onPointerEnter={(e) => { if (e.pointerType === 'mouse') go(); }} onClick={() => { onPick(); go(); }}>
      <div className="tr-thumb" ref={root}>
        <div className="show-layer tr-a"><span>A</span></div>
        <div className="show-layer tr-b"><span>B</span></div>
      </div>
      <span className="tr-name">{def.label}</span>
    </button>
  );
};

/** A small glyph that plays an animation effect on hover or tap. */
const EffectCell = ({ def, on, onPick }: { def: EffectDef; on: boolean; onPick: () => void }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const go = () => {
    const el = ref.current;
    if (!el || def.cls === 'path') return;
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const box = { x: 20, y: 12, w: 24, h: 16 };
    const tick = (n: number) => {
      const p = Math.min(1, (n - t0) / 900);
      const fx = evalEffect(def.cls, def.id, p, { box, W: 64, H: 40, option: def.options?.[0]?.[0], seed: 3 });
      const tr: string[] = [];
      if (fx.tx || fx.ty) tr.push(`translate(${(fx.tx ?? 0) * 0.5}px, ${(fx.ty ?? 0) * 0.5}px)`);
      if (fx.rot) tr.push(`rotate(${fx.rot}deg)`);
      if (fx.sx !== undefined || fx.sy !== undefined) tr.push(`scale(${fx.sx ?? 1}, ${fx.sy ?? 1})`);
      el.style.transform = tr.join(' ');
      el.style.opacity = String(fx.opacity ?? 1);
      el.style.filter = fx.filter ?? '';
      el.style.clipPath = fx.clip && fx.clip.length === 1 ? `polygon(${fx.clip[0]!.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(',')})` : '';
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else { el.style.transform = ''; el.style.opacity = ''; el.style.filter = ''; el.style.clipPath = ''; }
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const Icon = CLASS_ICON[def.cls];
  return (
    <button className={`fx-cell ${def.cls}${on ? ' on' : ''}`} title={def.label} aria-label={def.label} aria-pressed={on} onPointerEnter={(e) => { if (e.pointerType === 'mouse') go(); }} onClick={() => { onPick(); go(); }}>
      <span className="fx-glyph" ref={ref}><Icon size={18} strokeWidth={S} /></span>
      <span className="fx-name">{def.label}</span>
    </button>
  );
};

// ---------- Transitions panel ----------

const curTransition = (s: FrameStore) => s.slide?.transition;

const TransitionGallery = ({ store }: { store: FrameStore }) => {
  const cur = curTransition(store)?.name ?? 'none';
  const groups: TGroup[] = ['subtle', 'exciting', 'dynamic'];
  return (
    <div className="tr-gallery">
      {groups.map((g) => (
        <div key={g}>
          <div className="gal-h">{GROUP_LABEL[g]}</div>
          <div className="tr-grid">
            {TRANSITIONS.filter((t) => t.group === g).map((t) => <TransitionThumb key={t.id} def={t} on={cur === t.id} onPick={() => run(store, 'transition.set', { name: t.id })} />)}
          </div>
        </div>
      ))}
    </div>
  );
};

const TransitionOptions = ({ store }: { store: FrameStore }) => {
  const t = curTransition(store);
  const d = transitionDef(t?.name);
  if (!t || !d || d.id === 'none') return <p className="muted small">Pick a transition to see its options.</p>;
  return (
    <div className="col">
      {d.options ? <Select label="Effect option" value={t.option ?? d.options[0]![0]} options={d.options} onChange={(v) => run(store, 'transition.option', v)} /> : <p className="muted small">This transition has no options.</p>}
      <Btn store={store} id="transition.preview" icon={Play} label="Preview" wide />
    </div>
  );
};

const TransitionTiming = ({ store }: { store: FrameStore }) => {
  const t = curTransition(store);
  const after = t?.advanceAfter;
  return (
    <div className="col">
      <Select label="Sound" value={t?.sound && SOUNDS.some(([v]) => v === t.sound) ? t.sound : ''} options={SOUNDS} onChange={(v) => { run(store, 'transition.sound', v); playSound(v); }} />
      <NumberField label="Duration" suffix="s" value={t?.duration ?? 0} step={0.25} min={0} max={60} onChange={(n) => run(store, 'transition.duration', n)} />
      <Btn store={store} id="transition.applyAll" icon={ListOrdered} label="Apply to all slides" wide />
      <div className="sub-h">Advance slide</div>
      <Check label="On mouse click or tap" checked={t?.advanceOnClick !== false} onChange={(v) => run(store, 'transition.advanceOnClick', v)} />
      <div className="rowx">
        <Check label="After" checked={after !== undefined} onChange={(v) => run(store, 'transition.advanceAfter', v ? 5 : null)} />
        <NumberField label="" suffix="s" value={after} step={0.5} min={0} max={3600} width={90} onChange={(n) => run(store, 'transition.advanceAfter', n)} />
      </div>
    </div>
  );
};

// ---------- Animate panel ----------

const START: [Animation['trigger'], string][] = [['click', 'On click'], ['with', 'With previous'], ['after', 'After previous']];

const EffectGallery = ({ store, add }: { store: FrameStore; add: boolean }) => {
  const [cls, setCls] = useState<AnimClass>('entr');
  const [more, setMore] = useState(false);
  const cur = editedAnims(store)[0];
  const list = EFFECTS.filter((e) => e.cls === cls && (more || e.basic));
  const classes: AnimClass[] = ['entr', 'emph', 'exit', 'path'];
  return (
    <div className="col">
      <div className="seg" role="tablist">
        {classes.map((c) => { const I = CLASS_ICON[c]; return <button key={c} role="tab" aria-selected={cls === c} className={cls === c ? 'on' : ''} onClick={() => setCls(c)} title={CLASS_LABEL[c]}><I size={14} strokeWidth={S} /> {CLASS_LABEL[c]}</button>; })}
      </div>
      <div className="fx-grid">
        {!add && <button className={`fx-cell${!cur ? ' on' : ''}`} title="None" onClick={() => run(store, 'anim.remove')} disabled={!cur}><span className="fx-glyph"><EyeOff size={18} strokeWidth={S} /></span><span className="fx-name">None</span></button>}
        {list.map((d) => <EffectCell key={d.id} def={d} on={!add && !!cur && cur.cls === d.cls && cur.effect === d.id} onPick={() => run(store, 'anim.apply', { cls: d.cls, effect: d.id, add })} />)}
      </div>
      {EFFECTS.some((e) => e.cls === cls && !e.basic) && <button className="tool" onClick={() => setMore(!more)}>{more ? 'Fewer effects' : 'More effects'}</button>}
      {cls === 'path' && <Btn store={store} id="anim.customPath" icon={Spline} label="Draw a custom path" wide />}
    </div>
  );
};

const AnimOptions = ({ store }: { store: FrameStore }) => {
  const list = editedAnims(store);
  const a = list[0];
  if (!a) return <p className="muted small">Select an animated shape to change its effect.</p>;
  const d = effectDef(a.cls, a.effect);
  const sh = store.slide?.shapes.find((x) => x.id === a.shape);
  const textual = sh?.kind === 'shape' && !!sh.text?.paras.some((p) => p.runs.some((r) => r.text.trim()));
  return (
    <div className="col">
      {d?.options && <Select label="Direction or style" value={a.option ?? d.options[0]![0]} options={d.options} onChange={(v) => run(store, 'anim.option', v)} />}
      {textual && (a.cls === 'entr' || a.cls === 'exit') && (
        <Select label="Sequence" value={a.textBy ?? 'all'} options={[['all', 'As one object'], ['para', 'By paragraph'], ['word', 'By word'], ['letter', 'By letter']]} onChange={(v) => run(store, 'anim.textBy', v)} />
      )}
      {d?.valueKind === 'color' && <label className="lbl"><span>Color</span><input type="color" value={typeof a.value === 'string' ? a.value : '#2C7BE5'} onChange={(e) => run(store, 'anim.update', { id: a.id, set: { value: e.target.value.toUpperCase() }, label: 'Effect color' })} /></label>}
      {d?.valueKind === 'percent' && <NumberField label={a.effect === 'transparency' ? 'Amount' : 'Size'} suffix="%" value={Number(a.value ?? 150)} min={0} max={1000} onChange={(n) => run(store, 'anim.update', { id: a.id, set: { value: n }, label: 'Effect amount' })} />}
      {d?.valueKind === 'angle' && <NumberField label="Amount" suffix="deg" value={Number(a.value ?? 360)} min={-7200} max={7200} step={15} onChange={(n) => run(store, 'anim.update', { id: a.id, set: { value: n }, label: 'Effect amount' })} />}
      <Btn store={store} id="anim.options" icon={Settings2} label="More effect options…" wide />
    </div>
  );
};

const TriggerMenu = ({ store }: { store: FrameStore }) => {
  const a = editedAnims(store)[0];
  const shapes = (store.slide?.shapes ?? []).filter((x) => x.id !== a?.shape);
  if (!a) return null;
  return (
    <Select label="Trigger" value={a.triggerShape ?? ''} options={[['', 'In the click sequence'], ...shapes.map((x): [string, string] => [x.id, `On click of ${x.name || x.kind}`])]} onChange={(v) => run(store, 'anim.triggerShape', v)} />
  );
};

const AnimTiming = ({ store }: { store: FrameStore }) => {
  const a = editedAnims(store)[0];
  return (
    <div className="col">
      <Select label="Start" value={a?.trigger ?? 'click'} options={START} onChange={(v) => run(store, 'anim.trigger', v)} />
      <NumberField label="Duration" suffix="s" value={a?.duration} step={0.25} min={0} max={60} onChange={(n) => run(store, 'anim.duration', n)} />
      <NumberField label="Delay" suffix="s" value={a?.delay} step={0.25} min={0} max={600} onChange={(n) => run(store, 'anim.delay', n)} />
      <TriggerMenu store={store} />
      <div className="iconrow">
        <Btn store={store} id="anim.earlier" icon={ChevronUp} label="Move earlier" />
        <Btn store={store} id="anim.later" icon={ChevronDown} label="Move later" />
      </div>
    </div>
  );
};

const AnimActions = ({ store }: { store: FrameStore }) => {
  const [adding, setAdding] = useState(false);
  return (
    <div className="col">
      <Btn store={store} id="anim.preview" icon={Play} label="Preview" wide />
      <button className={`tool wide${adding ? ' on' : ''}`} aria-pressed={adding} disabled={!store.sel.length} onClick={() => setAdding(!adding)}><Plus size={16} strokeWidth={S} /> <span>Add animation</span></button>
      {adding && <EffectGallery store={store} add />}
      <Btn store={store} id="anim.pane" icon={ListVideo} label="Animation pane" wide />
      <Btn store={store} id="anim.painter" icon={Brush} wide />
      <Btn store={store} id="anim.remove" icon={Trash2} wide />
      <Check label="Preview when picking an effect" checked={store.ext.autoPreview !== false} onChange={(v) => { store.ext.autoPreview = v; store.emit(); }} />
    </div>
  );
};

// ---------- Present panel ----------

const PresentStart = ({ store }: { store: FrameStore }) => (
  <div className="toollist">
    <Btn store={store} id="show.fromStart" icon={Play} label="From beginning" />
    <Btn store={store} id="show.fromCurrent" icon={MonitorPlay} label="From current slide" />
    <Btn store={store} id="show.presenter" icon={Presentation} />
    <Btn store={store} id="show.reading" icon={BookOpenText} />
    <CustomShowPick store={store} />
  </div>
);

const CustomShowPick = ({ store }: { store: FrameStore }) => {
  const shows = store.deck.customShows;
  return (
    <>
      <Btn store={store} id="show.custom" icon={ListOrdered} label="Custom shows…" />
      {shows.map((c) => <button key={c.id} className="tool" onClick={() => run(store, 'show.runCustom', c.id)}><Play size={14} strokeWidth={S} /><span>Play {c.name}</span></button>)}
    </>
  );
};

const PresentSetup = ({ store }: { store: FrameStore }) => {
  const st = store.deck.show;
  return (
    <div className="toollist">
      <Btn store={store} id="show.setup" icon={Settings2} />
      <Btn store={store} id="show.hideSlide" icon={EyeOff} />
      <Btn store={store} id="show.rehearse" icon={Timer} />
      <Btn store={store} id="show.record" icon={Mic} label={recordingSupported() ? 'Record…' : 'Record (not available here)'} />
      <Check label="Use timings" checked={!!st.useTimings} onChange={() => run(store, 'show.useTimings')} />
      <Check label="Play narrations" checked={!st.noNarration} onChange={() => run(store, 'show.narration')} />
      <Check label="Show media controls" checked={store.ext.showMediaControls !== false} onChange={() => run(store, 'show.mediaControls')} />
    </div>
  );
};

const PresentExtras = ({ store }: { store: FrameStore }) => (
  <div className="toollist">
    {captionsSupported() ? <Check label="Subtitles while presenting" checked={!!store.ext.subtitles} onChange={() => run(store, 'show.subtitles')} /> : <p className="muted small"><Captions size={14} strokeWidth={S} /> Live subtitles need a browser with speech recognition.</p>}
    <Btn store={store} id="show.monitor" icon={Eye} label="Which screen shows the slides" />
    <p className="muted small">Slides stay up to date: edits you make before presenting show up right away.</p>
  </div>
);

// ---------- Media (Home, when a media shape is selected) ----------

const MediaSection = ({ store }: { store: FrameStore }) => {
  const m = store.one() as Media;
  const playing = mediaPreview.id === m.id;
  const start = m.autoplay ? 'auto' : 'click';
  return (
    <div className="col">
      <div className="iconrow">
        <Btn store={store} id="media.play" icon={playing ? Pause : Play} label={playing ? 'Play / pause' : 'Play'} />
        {playing && <Btn store={store} id="media.stop" icon={Rewind} label="Stop preview" />}
        <Btn store={store} id="media.trim" icon={Scissors} label="Trim…" />
      </div>
      <div className="rowx">
        <NumberField label="Fade in" suffix="s" value={m.fadeIn ?? 0} step={0.25} min={0} max={30} width={100} onChange={(n) => run(store, 'media.fadeIn', n)} />
        <NumberField label="Fade out" suffix="s" value={m.fadeOut ?? 0} step={0.25} min={0} max={30} width={100} onChange={(n) => run(store, 'media.fadeOut', n)} />
      </div>
      <label className="lbl"><span><Volume2 size={13} strokeWidth={S} /> Volume</span>
        <input type="range" min={0} max={100} value={Math.round((m.volume ?? 1) * 100)} aria-label="Volume" onChange={(e) => run(store, 'media.volume', Number(e.target.value) / 100)} />
      </label>
      <Select label="Start" value={start} options={[['click', 'When clicked'], ['auto', 'Automatically']]} onChange={(v) => { if ((v === 'auto') !== !!m.autoplay) run(store, 'media.autoplay'); }} />
      {m.mediaType === 'video' && <Check label="Play full screen" checked={!!m.fullScreen} onChange={() => run(store, 'media.fullScreen')} />}
      {m.mediaType === 'audio' && <Check label="Play across slides" checked={!!m.acrossSlides} onChange={() => run(store, 'media.across')} />}
      <Check label="Hide while not playing" checked={!!m.hideWhenStopped} onChange={() => run(store, 'media.hide')} />
      <Check label="Loop until stopped" checked={!!m.loop} onChange={() => run(store, 'media.loop')} />
      <Check label="Rewind after playing" checked={!!m.rewind} onChange={() => run(store, 'media.rewind')} />
      {m.mediaType === 'video' && (
        <div className="iconrow">
          <Btn store={store} id="media.posterFrame" icon={Image} label="Use current frame as poster" />
          <Btn store={store} id="media.posterReset" icon={RotateCcw} label="Reset poster" />
        </div>
      )}
    </div>
  );
};

export const registerPanels = (registerPanelSection: (s: { tab: string; title: string; order?: number; render: (s: FrameStore) => React.ReactNode; when?: (s: FrameStore) => boolean }) => void): void => {
  registerPanelSection({ tab: 'transitions', title: 'Transition', order: 10, render: (s) => <TransitionGallery store={s} /> });
  registerPanelSection({ tab: 'transitions', title: 'Effect options', order: 20, render: (s) => <TransitionOptions store={s} /> });
  registerPanelSection({ tab: 'transitions', title: 'Timing', order: 30, render: (s) => <TransitionTiming store={s} /> });
  registerPanelSection({ tab: 'animations', title: 'Animation', order: 10, render: (s) => <EffectGallery store={s} add={false} /> });
  registerPanelSection({ tab: 'animations', title: 'Effect options', order: 20, render: (s) => <AnimOptions store={s} /> });
  registerPanelSection({ tab: 'animations', title: 'Timing', order: 30, render: (s) => <AnimTiming store={s} />, when: (s) => editedAnims(s).length > 0 });
  registerPanelSection({ tab: 'animations', title: 'Actions', order: 40, render: (s) => <AnimActions store={s} /> });
  registerPanelSection({ tab: 'show', title: 'Start the show', order: 10, render: (s) => <PresentStart store={s} /> });
  registerPanelSection({ tab: 'show', title: 'Set up', order: 20, render: (s) => <PresentSetup store={s} /> });
  registerPanelSection({ tab: 'show', title: 'Captions and screens', order: 30, render: (s) => <PresentExtras store={s} /> });
  registerPanelSection({ tab: 'home', title: 'Media', order: -10, when: (s) => s.one()?.kind === 'media', render: (s) => <MediaSection store={s} /> });
};
