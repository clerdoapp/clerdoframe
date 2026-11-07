import { openDialog, registerCommands, run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import { desktop } from '../../app/files';
import { findShape, uid, type Animation, type AnimClass, type Media, type Shape, type Slide, type Transition, type TransitionName } from '../../model/deck';
import { ShowController, showOf, type ShowOpts } from './controller';
import { effectDef, presetPath } from './effects';
import { transitionDef } from './transitions';
import { openAudience } from './Presenter';
import { Recorder, recordingSupported, saveRecording } from './recorder';
import { preview as mediaPreview, frameAsPng } from './media';

// ---------- Starting and ending ----------

export const startShow = (store: FrameStore, opts: ShowOpts = {}): ShowController | null => {
  if (!store.deck.slides.length) { store.notify('Add a slide first.'); return null; }
  const old = showOf(store);
  if (old) old.finish();
  let mode = opts.mode ?? 'show';
  const st = store.deck.show;
  if (mode === 'show' && st.type === 'browsed') mode = 'reading';
  let audience: Window | null = null;
  if (mode === 'presenter' && !opts.sameScreen) {
    audience = openAudience();
    if (!audience) store.notify('The slide window was blocked or there is one screen. Showing presenter view here.', 4500);
  }
  const c = new ShowController(store, { ...opts, mode, sameScreen: mode === 'presenter' && !audience });
  (c as ShowController & { audienceWin?: Window | null }).audienceWin = audience;
  store.show = c;
  store.menu = null;
  if (mode !== 'reading') {
    desktop?.setPresenting?.(true);
    if (!desktop && !audience) void document.documentElement.requestFullscreen?.().catch(() => undefined);
  } else store.view.mode = 'reading';
  store.emit();
  return c;
};

const firstIndex = (s: FrameStore): number | undefined => {
  const r = s.deck.show.range;
  return r ? Math.max(0, r.from - 1) : undefined;
};

const startRecording = async (store: FrameStore, camera: boolean): Promise<void> => {
  if (!recordingSupported()) { store.notify('Recording needs a browser with microphone recording.'); return; }
  const r = new Recorder(camera);
  if (!(await r.open())) { store.notify('ClerdoFrame could not use the microphone. Check the permission and try again.', 4500); return; }
  const c = startShow(store, { mode: 'record', from: store.cur, camera });
  if (!c) { await r.close(); return; }
  (c as ShowController & { recorder?: Recorder }).recorder = r;
  const prevEnter = c.hooks.enterSlide;
  c.hooks.enterSlide = (s) => { prevEnter?.(s); r.startSlide(s); };
  const prevFinish = c.hooks.finish;
  c.hooks.finish = () => { prevFinish?.(); void r.close().then(() => saveRecording(store, c, r, camera)); };
  const origPause = c.togglePause.bind(c);
  c.togglePause = () => { origPause(); r.pause(c.paused); };
  if (c.slide) r.startSlide(c.slide);
};

// ---------- Transitions ----------

const targetSlides = (s: FrameStore): Slide[] => {
  const idx = s.slideSel.length ? s.slideSel : [s.cur];
  return idx.map((i) => s.deck.slides[i]).filter((x): x is Slide => !!x);
};

const trOf = (sl: Slide): Transition => sl.transition ?? { name: 'none', duration: 0 };

export const setTransition = (s: FrameStore, label: string, fn: (t: Transition, sl: Slide) => void, all = false): void => {
  s.tryChange(label, () => {
    for (const sl of all ? s.deck.slides : targetSlides(s)) {
      const t = { ...trOf(sl) };
      fn(t, sl);
      sl.transition = t;
    }
  });
};

// ---------- Animations ----------

export const selectedAnim = (s: FrameStore): Animation | null => {
  const id = s.ext.animSel as string | undefined;
  const sl = s.slide;
  if (!sl) return null;
  const hit = id ? sl.animations.find((a) => a.id === id) : undefined;
  if (hit) return hit;
  const one = s.one();
  if (one) return [...sl.animations].reverse().find((a) => a.shape === one.id) ?? null;
  return null;
};

/** Animations the toolbar edits: the chosen one in the pane, else every animation of the selected shapes. */
export const editedAnims = (s: FrameStore): Animation[] => {
  const sl = s.slide;
  if (!sl) return [];
  const id = s.ext.animSel as string | undefined;
  const hit = id ? sl.animations.find((a) => a.id === id) : undefined;
  if (hit && (!s.sel.length || s.sel.includes(hit.shape))) return [hit];
  const ids = new Set(s.sel);
  const list = sl.animations.filter((a) => ids.has(a.shape));
  const last = new Map<string, Animation>();
  for (const a of list) last.set(a.shape, a);
  return [...last.values()];
};

const topShape = (s: FrameStore, id: string): Shape | undefined => s.slide?.shapes.find((x) => x.id === id);

export const makeAnim = (s: FrameStore, shape: Shape, cls: AnimClass, effect: string, option?: string): Animation => {
  const d = effectDef(cls, effect);
  const a: Animation = {
    id: uid('a'), shape: shape.id, cls, effect, trigger: 'click', delay: 0,
    duration: d?.dur ?? (cls === 'path' ? 2 : 0.5),
    ...(option ?? d?.options?.[0]?.[0] ? { option: option ?? d!.options![0]![0] } : {}),
  };
  if (cls === 'path') a.path = effect === 'custom' ? `M0 0 L${Math.round(s.deck.w * 0.2)} ${Math.round(s.deck.h * 0.1)}` : presetPath(effect, a.option, s.deck.w, s.deck.h);
  if (d?.valueKind === 'color') a.value = '#2C7BE5';
  if (d?.valueKind === 'percent') a.value = effect === 'transparency' ? 50 : 150;
  if (d?.valueKind === 'angle') a.value = 360;
  if (shape.kind === 'shape' && shape.text && shape.text.paras.filter((p) => p.runs.some((r) => r.text.trim())).length > 1 && (cls === 'entr' || cls === 'exit') && !shape.ph?.type.toLowerCase().includes('title')) a.textBy = 'para';
  return a;
};

/** Applies an effect to the selected shapes: replaces the edited animation, or adds one when add is set. */
export const applyEffect = (s: FrameStore, cls: AnimClass, effect: string, add: boolean, option?: string): void => {
  const sl = s.slide;
  if (!sl) return;
  const shapes = s.sel.map((id) => topShape(s, id)).filter((x): x is Shape => !!x);
  if (!shapes.length) { s.notify('Select a shape on the slide first.'); return; }
  let last: string | undefined;
  s.tryChange(add ? 'Add animation' : 'Animate', () => {
    for (const sh of shapes) {
      const cur = add ? undefined : editedAnims(s).find((a) => a.shape === sh.id);
      const a = makeAnim(s, sh, cls, effect, option);
      if (cur) {
        Object.assign(cur, { cls, effect, option: a.option, path: a.path, value: cur.cls === cls ? cur.value ?? a.value : a.value });
        if (!a.option) delete cur.option;
        if (cls !== 'path') delete cur.path;
        if (cls === 'path' || cls === 'emph') delete cur.textBy;
        if (a.duration !== undefined && cur.cls !== cls) cur.duration = a.duration;
        last = cur.id;
      } else {
        if (shapes.indexOf(sh) > 0) a.trigger = 'with';
        sl.animations.push(a);
        last = a.id;
      }
    }
  });
  s.ext.animSel = last;
  if (s.ext.autoPreview !== false) run(s, 'anim.preview', { only: last });
};

const editAnims = (s: FrameStore, label: string, fn: (a: Animation) => void): void => {
  const list = editedAnims(s);
  if (!list.length) return;
  s.tryChange(label, () => { for (const a of list) fn(a); });
};

const moveAnim = (s: FrameStore, dir: -1 | 1): void => {
  const sl = s.slide;
  const a = selectedAnim(s);
  if (!sl || !a) return;
  const i = sl.animations.indexOf(a);
  const j = i + dir;
  if (j < 0 || j >= sl.animations.length) return;
  s.tryChange('Reorder animation', () => { sl.animations.splice(i, 1); sl.animations.splice(j, 0, a); });
};

export const DURATIONS: [number, string][] = [[0.5, 'Very fast'], [1, 'Fast'], [2, 'Medium'], [3, 'Slow'], [5, 'Very slow']];

// ---------- Media ----------

const oneMedia = (s: FrameStore): Media | null => { const o = s.one(); return o?.kind === 'media' ? o : null; };
const mediaEl = (id: string): HTMLMediaElement | null => document.querySelector<HTMLMediaElement>(`.canvas [data-media-el="${CSS.escape(id)}"], .show-media-preview [data-media-el="${CSS.escape(id)}"]`);
const editMedia = (s: FrameStore, label: string, fn: (m: Media) => void): void => { const m = oneMedia(s); if (m) s.tryChange(label, () => fn(m)); };

// ---------- Registration ----------

export const registerShowCommands = (): void => {
  const has = (s: FrameStore) => s.deck.slides.length > 0;
  const hasSel = (s: FrameStore) => s.sel.length > 0 && !!s.slide;
  registerCommands([
    // Slide show
    { id: 'show.fromStart', label: 'Present from the beginning', group: 'Present', keys: 'F5', enabled: has, run: (s) => { startShow(s, { from: firstIndex(s) }); } },
    { id: 'show.fromCurrent', label: 'Present from this slide', group: 'Present', keys: 'Shift+F5', enabled: has, run: (s) => { startShow(s, { from: s.cur }); } },
    { id: 'show.presenter', label: 'Presenter view', group: 'Present', keys: 'Alt+F5', enabled: has, run: (s) => { startShow(s, { mode: 'presenter', from: s.cur }); } },
    { id: 'show.presenterHere', label: 'Presenter view on this screen', group: 'Present', enabled: has, run: (s) => { startShow(s, { mode: 'presenter', from: s.cur, sameScreen: true }); } },
    { id: 'show.reading', label: 'Reading view', group: 'Present', enabled: has, run: (s) => { startShow(s, { mode: 'reading', from: s.cur }); } },
    { id: 'show.custom', label: 'Custom shows…', group: 'Present', run: (s) => openDialog(s, 'show.custom') },
    { id: 'show.runCustom', label: 'Play a custom show', group: 'Present', hidden: true, run: (s, id) => { if (typeof id === 'string') startShow(s, { customShow: id }); } },
    { id: 'show.setup', label: 'Set up slide show…', group: 'Present', run: (s) => openDialog(s, 'show.setup') },
    { id: 'show.hideSlide', label: 'Hide slide', group: 'Present', active: (s) => !!s.slide?.hidden, enabled: (s) => !!s.slide, run: (s) => run(s, 'slide.hide') },
    { id: 'show.rehearse', label: 'Rehearse timings', group: 'Present', enabled: has, run: (s) => { startShow(s, { mode: 'rehearse', from: firstIndex(s) ?? 0 }); } },
    { id: 'show.record', label: 'Record slide show…', group: 'Present', enabled: has, run: (s) => openDialog(s, 'show.record') },
    { id: 'show.recordStart', label: 'Start recording', group: 'Present', hidden: true, run: (s, arg) => { void startRecording(s, !!(arg as { camera?: boolean } | undefined)?.camera); } },
    { id: 'show.clearTimings', label: 'Clear timings on all slides', group: 'Present', run: (s) => s.tryChange('Clear timings', () => { for (const sl of s.deck.slides) delete sl.timing; }) },
    { id: 'show.clearNarration', label: 'Clear narration on all slides', group: 'Present', run: (s) => s.tryChange('Clear narration', () => { for (const sl of s.deck.slides) sl.shapes = sl.shapes.filter((x) => !(x.kind === 'media' && x.name.startsWith('Narration'))); }) },
    { id: 'show.useTimings', label: 'Use timings', group: 'Present', active: (s) => !!s.deck.show.useTimings, run: (s) => s.tryChange('Use timings', () => { s.deck.show.useTimings = !s.deck.show.useTimings; }) },
    { id: 'show.narration', label: 'Play narrations', group: 'Present', active: (s) => !s.deck.show.noNarration, run: (s) => s.tryChange('Play narrations', () => { s.deck.show.noNarration = !s.deck.show.noNarration || undefined; }) },
    { id: 'show.mediaControls', label: 'Show media controls', group: 'Present', active: (s) => s.ext.showMediaControls !== false, run: (s) => { s.ext.showMediaControls = s.ext.showMediaControls === false; s.emit(); } },
    { id: 'show.subtitles', label: 'Subtitles in the show', group: 'Present', active: (s) => !!s.ext.subtitles, run: (s) => { s.ext.subtitles = !s.ext.subtitles; const c = showOf(s); if (c) { c.subtitles = !!s.ext.subtitles; c.emit(); } s.emit(); } },
    { id: 'show.monitor', label: 'Choose display', group: 'Present', run: (s) => s.notify('The slides open on the screen where the slide window is. Drag that window to the projector, or use Swap displays in presenter view.', 6000) },
    { id: 'show.end', label: 'End show', hidden: true, run: (s) => showOf(s)?.end() },
    // Transitions
    {
      id: 'transition.set', label: 'Set transition', group: 'Transitions', hidden: true, enabled: has,
      run: (s, arg) => {
        const a = (typeof arg === 'string' ? { name: arg } : arg) as { name: TransitionName; option?: string } | undefined;
        const d = transitionDef(a?.name);
        if (!d) return;
        setTransition(s, 'Transition', (t) => {
          const changed = t.name !== d.id;
          t.name = d.id;
          if (a?.option) t.option = a.option; else if (changed) { if (d.options) t.option = d.options[0]![0]; else delete t.option; }
          if (changed || !t.duration) t.duration = d.dur;
        });
        if (d.id !== 'none' && s.ext.autoPreview !== false) run(s, 'transition.preview');
      },
    },
    { id: 'transition.option', label: 'Transition effect option', hidden: true, run: (s, o) => { if (typeof o === 'string') { setTransition(s, 'Effect option', (t) => { t.option = o; }); run(s, 'transition.preview'); } } },
    { id: 'transition.preview', label: 'Preview transition', group: 'Transitions', enabled: (s) => !!s.slide, run: (s) => { s.ext.preview = { kind: 'transition', at: Date.now() }; s.emit(); } },
    { id: 'transition.applyAll', label: 'Apply transition to all slides', group: 'Transitions', enabled: (s) => !!s.slide, run: (s) => { const t = s.slide?.transition; setTransition(s, 'Apply to all', (x) => { Object.assign(x, structuredClone(t ?? { name: 'none', duration: 0 })); }, true); s.notify('Every slide now uses this transition.'); } },
    { id: 'transition.duration', label: 'Transition duration', hidden: true, run: (s, d) => { const n = Number(d); if (Number.isFinite(n) && n >= 0) setTransition(s, 'Transition duration', (t) => { t.duration = Math.min(60, n); }); } },
    { id: 'transition.advanceAfter', label: 'Advance after', hidden: true, run: (s, d) => setTransition(s, 'Advance after', (t) => { const n = d === null || d === undefined || d === '' ? NaN : Number(d); if (Number.isFinite(n) && n >= 0) t.advanceAfter = n; else delete t.advanceAfter; }) },
    { id: 'transition.advanceOnClick', label: 'Advance on click', hidden: true, run: (s, v) => setTransition(s, 'Advance on click', (t) => { if (v === false) t.advanceOnClick = false; else delete t.advanceOnClick; }) },
    { id: 'transition.sound', label: 'Transition sound', hidden: true, run: (s, v) => setTransition(s, 'Transition sound', (t) => { if (typeof v === 'string' && v) t.sound = v; else delete t.sound; }) },
    { id: 'transition.remove', label: 'Remove transition', group: 'Transitions', enabled: (s) => !!s.slide?.transition, run: (s) => s.tryChange('Remove transition', () => { for (const sl of targetSlides(s)) delete sl.transition; }) },
    // Animations
    { id: 'anim.apply', label: 'Animate', hidden: true, enabled: hasSel, run: (s, a) => { const x = a as { cls: AnimClass; effect: string; option?: string; add?: boolean }; applyEffect(s, x.cls, x.effect, !!x.add, x.option); } },
    { id: 'anim.add', label: 'Add animation', hidden: true, enabled: hasSel, run: (s, a) => { const x = a as { cls: AnimClass; effect: string; option?: string }; applyEffect(s, x.cls, x.effect, true, x.option); } },
    { id: 'anim.option', label: 'Effect option', hidden: true, run: (s, o) => { editAnims(s, 'Effect option', (a) => { if (typeof o === 'string') { a.option = o; if (a.cls === 'path' && a.effect !== 'custom') a.path = presetPath(a.effect, o, s.deck.w, s.deck.h); } }); run(s, 'anim.preview', { only: selectedAnim(s)?.id }); } },
    { id: 'anim.textBy', label: 'Animate text', hidden: true, run: (s, v) => editAnims(s, 'Animate text', (a) => { if (v === 'all' || !v) delete a.textBy; else a.textBy = v as Animation['textBy']; }) },
    { id: 'anim.trigger', label: 'Start', hidden: true, run: (s, v) => editAnims(s, 'Animation start', (a) => { if (v === 'click' || v === 'with' || v === 'after') a.trigger = v; }) },
    { id: 'anim.triggerShape', label: 'Trigger', hidden: true, run: (s, v) => editAnims(s, 'Animation trigger', (a) => { if (typeof v === 'string' && v && v !== a.shape) a.triggerShape = v; else delete a.triggerShape; }) },
    { id: 'anim.duration', label: 'Animation duration', hidden: true, run: (s, v) => { const n = Number(v); if (Number.isFinite(n) && n >= 0) editAnims(s, 'Animation duration', (a) => { a.duration = Math.min(60, n); }); } },
    { id: 'anim.delay', label: 'Animation delay', hidden: true, run: (s, v) => { const n = Number(v); if (Number.isFinite(n) && n >= 0) editAnims(s, 'Animation delay', (a) => { a.delay = Math.min(600, n); }); } },
    { id: 'anim.update', label: 'Change animation', hidden: true, run: (s, v) => { const p = v as { id: string; set: Partial<Animation>; label?: string }; const a = s.slide?.animations.find((x) => x.id === p?.id); if (a) s.tryChange(p.label ?? 'Change animation', () => { for (const [k, val] of Object.entries(p.set)) { if (val === undefined) delete (a as unknown as Record<string, unknown>)[k]; else (a as unknown as Record<string, unknown>)[k] = val; } }); } },
    { id: 'anim.earlier', label: 'Move animation earlier', group: 'Animations', enabled: (s) => { const a = selectedAnim(s); return !!a && s.slide!.animations.indexOf(a) > 0; }, run: (s) => moveAnim(s, -1) },
    { id: 'anim.later', label: 'Move animation later', group: 'Animations', enabled: (s) => { const a = selectedAnim(s); return !!a && s.slide!.animations.indexOf(a) < s.slide!.animations.length - 1; }, run: (s) => moveAnim(s, 1) },
    { id: 'anim.move', label: 'Move animation', hidden: true, run: (s, v) => { const p = v as { id: string; to: number }; const sl = s.slide; const a = sl?.animations.find((x) => x.id === p?.id); if (!sl || !a) return; s.tryChange('Reorder animation', () => { const i = sl.animations.indexOf(a); sl.animations.splice(i, 1); sl.animations.splice(Math.max(0, Math.min(sl.animations.length, p.to > i ? p.to - 1 : p.to)), 0, a); }); } },
    { id: 'anim.remove', label: 'Remove animation', group: 'Animations', enabled: (s) => editedAnims(s).length > 0, run: (s) => { const ids = new Set(editedAnims(s).map((a) => a.id)); s.tryChange('Remove animation', () => { s.slide!.animations = s.slide!.animations.filter((a) => !ids.has(a.id)); }); s.ext.animSel = undefined; } },
    { id: 'anim.removeAll', label: 'Remove all animations on the slide', group: 'Animations', enabled: (s) => !!s.slide?.animations.length, run: (s) => s.tryChange('Remove animations', () => { s.slide!.animations = []; }) },
    { id: 'anim.select', label: 'Select animation', hidden: true, run: (s, id) => { const a = s.slide?.animations.find((x) => x.id === id); s.ext.animSel = a?.id; if (a) { s.sel = [a.shape]; s.editing = null; } s.emit(); } },
    { id: 'anim.preview', label: 'Preview animations', group: 'Animations', enabled: (s) => !!s.slide?.animations.length, run: (s, arg) => { s.ext.preview = { kind: 'anims', at: Date.now(), ...(arg && typeof arg === 'object' ? arg : {}) }; s.emit(); } },
    { id: 'anim.playFrom', label: 'Play from the selected animation', group: 'Animations', enabled: (s) => !!selectedAnim(s), run: (s) => { s.ext.preview = { kind: 'anims', at: Date.now(), from: selectedAnim(s)?.id }; s.emit(); } },
    { id: 'anim.pane', label: 'Animation pane', group: 'Animations', keys: 'Alt+Shift+A', active: (s) => s.view.pane === 'animations', run: (s) => { s.view.pane = s.view.pane === 'animations' ? null : 'animations'; s.emit(); } },
    { id: 'anim.options', label: 'Effect options…', group: 'Animations', enabled: (s) => !!selectedAnim(s), run: (s) => { const a = selectedAnim(s); if (a) openDialog(s, 'anim.options', a.id); } },
    {
      id: 'anim.painter', label: 'Animation painter', group: 'Animations', active: (s) => !!s.ext.animPainter, enabled: (s) => !!s.ext.animPainter || (!!s.one() && !!s.slide?.animations.some((a) => a.shape === s.one()!.id)),
      run: (s) => {
        if (s.ext.animPainter) { s.ext.animPainter = undefined; s.emit(); return; }
        const src = s.one();
        const sl = s.slide;
        if (!src || !sl) return;
        s.ext.animPainter = { from: src.id, anims: sl.animations.filter((a) => a.shape === src.id).map((a) => structuredClone(a)) };
        s.notify('Select the shapes to copy the animation to.');
        s.emit();
      },
    },
    { id: 'anim.customPath', label: 'Draw a custom motion path', group: 'Animations', enabled: hasSel, run: (s) => { s.ext.drawPath = true; s.notify('Draw the path on the slide, starting at the shape.'); s.emit(); } },
    // Media
    { id: 'media.play', label: 'Play or pause', group: 'Media', enabled: (s) => !!oneMedia(s), run: (s) => { const m = oneMedia(s); if (!m) return; if (mediaPreview.id !== m.id) { mediaPreview.id = m.id; s.emit(); requestAnimationFrame(() => { const el = mediaEl(m.id); if (el) void el.play().catch(() => undefined); }); return; } const el = mediaEl(m.id); if (el) { if (el.paused) void el.play().catch(() => undefined); else el.pause(); } } },
    { id: 'media.stop', label: 'Stop preview', group: 'Media', hidden: true, run: (s) => { mediaPreview.id = null; s.emit(); } },
    { id: 'media.trim', label: 'Trim media…', group: 'Media', enabled: (s) => !!oneMedia(s), run: (s) => { const m = oneMedia(s); if (m) openDialog(s, 'media.trim', m.id); } },
    { id: 'media.fadeIn', label: 'Fade in', hidden: true, run: (s, v) => editMedia(s, 'Fade in', (m) => { const n = Number(v); if (n > 0) m.fadeIn = n; else delete m.fadeIn; }) },
    { id: 'media.fadeOut', label: 'Fade out', hidden: true, run: (s, v) => editMedia(s, 'Fade out', (m) => { const n = Number(v); if (n > 0) m.fadeOut = n; else delete m.fadeOut; }) },
    { id: 'media.volume', label: 'Volume', hidden: true, run: (s, v) => editMedia(s, 'Volume', (m) => { const n = Number(v); if (Number.isFinite(n)) m.volume = Math.max(0, Math.min(1, n)); }) },
    { id: 'media.autoplay', label: 'Start automatically', group: 'Media', enabled: (s) => !!oneMedia(s), active: (s) => !!oneMedia(s)?.autoplay, run: (s) => editMedia(s, 'Start', (m) => { m.autoplay = !m.autoplay || undefined; }) },
    { id: 'media.fullScreen', label: 'Play full screen', group: 'Media', enabled: (s) => oneMedia(s)?.mediaType === 'video', active: (s) => !!oneMedia(s)?.fullScreen, run: (s) => editMedia(s, 'Play full screen', (m) => { m.fullScreen = !m.fullScreen || undefined; }) },
    { id: 'media.loop', label: 'Loop until stopped', group: 'Media', enabled: (s) => !!oneMedia(s), active: (s) => !!oneMedia(s)?.loop, run: (s) => editMedia(s, 'Loop', (m) => { m.loop = !m.loop || undefined; }) },
    { id: 'media.rewind', label: 'Rewind after playing', group: 'Media', enabled: (s) => !!oneMedia(s), active: (s) => !!oneMedia(s)?.rewind, run: (s) => editMedia(s, 'Rewind', (m) => { m.rewind = !m.rewind || undefined; }) },
    { id: 'media.hide', label: 'Hide while not playing', group: 'Media', enabled: (s) => !!oneMedia(s), active: (s) => !!oneMedia(s)?.hideWhenStopped, run: (s) => editMedia(s, 'Hide while not playing', (m) => { m.hideWhenStopped = !m.hideWhenStopped || undefined; }) },
    { id: 'media.across', label: 'Play across slides', group: 'Media', enabled: (s) => oneMedia(s)?.mediaType === 'audio', active: (s) => !!oneMedia(s)?.acrossSlides, run: (s) => editMedia(s, 'Play across slides', (m) => { m.acrossSlides = !m.acrossSlides || undefined; }) },
    {
      id: 'media.posterFrame', label: 'Use current frame as poster', group: 'Media', enabled: (s) => oneMedia(s)?.mediaType === 'video',
      run: (s) => {
        const m = oneMedia(s);
        if (!m) return;
        const el = mediaEl(m.id) as HTMLVideoElement | null;
        if (!el || el.tagName !== 'VIDEO' || !el.videoWidth) { s.notify('Play the video and pause on the frame you want first.'); return; }
        void frameAsPng(el).then((png) => {
          if (!png) { s.notify('That frame could not be captured.'); return; }
          s.tryChange('Poster frame', () => { const id = s.addMedia('image/png', `poster-${m.id}.png`, png); const live = s.slide && findShape(s.slide.shapes, m.id); if (live && live.kind === 'media') live.poster = id; });
        });
      },
    },
    { id: 'media.posterReset', label: 'Reset poster', group: 'Media', enabled: (s) => !!oneMedia(s)?.poster, run: (s) => editMedia(s, 'Reset poster', (m) => { delete m.poster; }) },
  ]);
};
