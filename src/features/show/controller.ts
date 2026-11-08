import type { ReactNode } from 'react';
import type { FrameStore } from '../../app/store';
import { desktop } from '../../app/files';
import { findShape, type Hyperlink, type InkStroke, type Shape, type Slide } from '../../model/deck';
import { buildTimeline, clickCount, initialState, settled, type PlayState, type Timeline } from './timeline';
import { countUnits } from './render';
import { playSound } from './sound';

export type ShowMode = 'show' | 'presenter' | 'reading' | 'rehearse' | 'record';
export type InkTool = 'pen' | 'highlighter' | 'laser' | 'eraser' | null;

export interface Nav { id: number; slide: number; transition: boolean; dir: 1 | -1 }

export interface ShowOpts {
  mode?: ShowMode;
  /** Deck index to start at; defaults to the first slide of the show. */
  from?: number;
  customShow?: string;
  /** Presenter view on the same screen. */
  sameScreen?: boolean;
  camera?: boolean;
  /** Explicit slide order (previews). */
  order?: number[];
  /** Plays every click group by itself (animation preview). */
  autoplay?: boolean;
}

const now = (): number => performance.now() / 1000;

/** Live slide show state, kept in store.show. UI subscribes to it directly, not through the store. */
export class ShowController {
  readonly store: FrameStore;
  mode: ShowMode;
  order: number[] = [];
  pos = 0;
  step = 0;
  ps: PlayState = initialState();
  /** Bumped whenever ps changes, so the renderer re-applies looks. */
  psv = 0;
  nav: Nav;
  enteredAt = now();
  transitionDoneFor = -1;
  screen: 'black' | 'white' | null = null;
  ended = false;
  tool: InkTool = null;
  penColor = '#E8401C';
  highlightColor = '#FFE14D';
  laserColor = '#FF2A2A';
  ink: Record<string, InkStroke[]> = {};
  overview = false;
  zoom = { k: 1, x: 0, y: 0 };
  paused = false;
  pausedAt = 0;
  subtitles = false;
  captions = '';
  hidePointer = false;
  typed = '';
  prompt: 'ink' | 'timings' | null = null;
  presenterSameScreen = false;
  swapped = false;
  /** Seconds per slide id while rehearsing or recording. */
  timings: Record<string, number> = {};
  slideClock = now();
  showClock = now();
  /** Return points for zoom links: after `until` (an order position), go back to `back`. */
  zoomStack: { back: number; until: number }[] = [];
  camera = false;
  autoplay = false;
  /** Auto-play: advance every `seconds` after the slide's animations finish. */
  autoAdvance: { seconds: number; loop: boolean } | null = null;
  private listeners = new Set<() => void>();
  private ver = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tlCache = new WeakMap<Slide, Timeline>();
  /** Hooks set by the UI layer (media, recorder, audience window). */
  hooks: { leaveSlide?: (slide: Slide) => void; enterSlide?: (slide: Slide) => void; finish?: () => void } = {};

  constructor(store: FrameStore, opts: ShowOpts) {
    this.store = store;
    this.mode = opts.mode ?? 'show';
    this.presenterSameScreen = !!opts.sameScreen;
    this.camera = !!opts.camera;
    const st = store.deck.show;
    if (st.penColor && typeof st.penColor === 'string') this.penColor = st.penColor;
    if (st.laserColor && typeof st.laserColor === 'string') this.laserColor = st.laserColor;
    this.autoplay = !!opts.autoplay;
    this.order = opts.order ?? this.buildOrder(opts.customShow ?? (opts.from === undefined ? st.customShow : undefined), opts.from);
    const startAt = opts.from !== undefined ? Math.max(0, this.order.indexOf(opts.from)) : 0;
    this.pos = startAt;
    this.nav = { id: 1, slide: this.order[this.pos] ?? 0, transition: false, dir: 1 };
    this.enter(false);
    this.timer = setInterval(() => this.tick(), 100);
  }

  // ---------- Subscription ----------

  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  getVersion = (): number => this.ver;
  emit(): void { this.ver++; for (const l of [...this.listeners]) l(); }

  // ---------- Order ----------

  get deck() { return this.store.deck; }
  get kiosk(): boolean { return this.deck.show.type === 'kiosk' && this.mode === 'show'; }
  get noAnimation(): boolean { return !!this.deck.show.noAnimation; }

  buildOrder(custom?: string, include?: number): number[] {
    const slides = this.deck.slides;
    if (custom) {
      const cs = this.deck.customShows.find((c) => c.id === custom);
      if (cs) {
        const ids = cs.slides.map((id) => slides.findIndex((s) => s.id === id)).filter((i) => i >= 0);
        if (ids.length) return ids;
      }
    }
    let from = 0, to = slides.length - 1;
    const r = this.deck.show.range;
    if (r && include === undefined) { from = Math.max(0, r.from - 1); to = Math.min(slides.length - 1, r.to - 1); }
    const out: number[] = [];
    for (let i = from; i <= to; i++) if (!slides[i]!.hidden || i === include) out.push(i);
    if (!out.length && slides.length) out.push(include ?? 0);
    return out;
  }

  get slideIndex(): number { return this.order[this.pos] ?? 0; }
  get slide(): Slide | undefined { return this.deck.slides[this.slideIndex]; }
  slideAt(pos: number): Slide | undefined { return this.deck.slides[this.order[pos] ?? -1]; }

  timeline(slide: Slide | undefined): Timeline {
    if (!slide) return buildTimeline([]);
    const hit = this.tlCache.get(slide);
    if (hit) return hit;
    const anims = this.noAnimation ? [] : slide.animations.filter((a) => findShape(slide.shapes, a.shape));
    const tl = buildTimeline(anims, (id, by) => countUnits(findShape(slide.shapes, id) ?? undefined, by));
    this.tlCache.set(slide, tl);
    return tl;
  }

  // ---------- Navigation ----------

  private touchPs(): void { this.psv++; }

  private enter(transition: boolean, dir: 1 | -1 = 1, finished = false): void {
    const prev = this.nav ? this.deck.slides[this.nav.slide] : undefined;
    if (prev && this.nav.id > 1) this.hooks.leaveSlide?.(prev);
    if ((this.mode === 'rehearse' || this.mode === 'record') && prev) {
      this.timings[prev.id] = (this.timings[prev.id] ?? 0) + (now() - this.slideClock);
    }
    this.slideClock = now();
    const tl = this.timeline(this.slide);
    if (finished) {
      this.step = tl.main.length;
      this.ps = { now: now(), main: tl.main.map(() => -Infinity), trig: {} };
    } else {
      this.step = 0;
      this.ps = initialState(now());
    }
    this.touchPs();
    this.enteredAt = now();
    this.nav = { id: (this.nav?.id ?? 0) + 1, slide: this.slideIndex, transition, dir };
    this.zoom = { k: 1, x: 0, y: 0 };
    const s = this.slide;
    if (s && transition && s.transition?.sound) playSound(s.transition.sound);
    if (!transition) this.transitionDone(this.nav.id);
    if (s) this.hooks.enterSlide?.(s);
    this.emit();
  }

  /** The renderer reports the slide's transition finished; starts the auto-playing first group. */
  transitionDone(navId: number): void {
    if (navId !== this.nav.id || this.transitionDoneFor === navId) return;
    this.transitionDoneFor = navId;
    this.enteredAt = now();
    const tl = this.timeline(this.slide);
    if (this.step === 0 && tl.main[0]?.auto) this.startStep(tl);
  }

  private startStep(tl: Timeline): void {
    const t = now();
    this.ps = { ...this.ps, now: t, main: [...this.ps.main, t] };
    this.step = this.ps.main.length;
    // Sounds of the step's animations.
    const st = tl.main[this.step - 1];
    for (const it of st?.items ?? []) if (it.anim.sound && it.target === it.anim.shape) setTimeout(() => playSound(it.anim.sound), it.start * 1000);
    // A following group that starts on its own (only the first group can), handled in transitionDone.
    this.touchPs();
    this.emit();
  }

  next(manual = true): void {
    if (this.prompt) return;
    if (manual && this.kiosk) return;
    if (this.screen) { this.screen = null; this.emit(); return; }
    if (this.ended) { this.end(); return; }
    const tl = this.timeline(this.slide);
    if (this.step < tl.main.length) {
      // Clicking while a group is still playing finishes it first.
      this.startStep(tl);
      return;
    }
    this.advance();
  }

  private advance(): void {
    const z = this.zoomStack[this.zoomStack.length - 1];
    if (z && this.pos >= z.until) { this.zoomStack.pop(); this.pos = z.back; this.enter(true, 1, true); return; }
    if (this.pos < this.order.length - 1) { this.pos++; this.enter(true, 1); return; }
    if (this.deck.show.loop || this.kiosk || this.autoAdvance?.loop) { this.pos = 0; this.enter(true, 1); return; }
    if (this.mode === 'reading') return;
    this.ended = true;
    this.emit();
  }

  prev(): void {
    if (this.prompt) return;
    if (this.kiosk) return;
    if (this.screen) { this.screen = null; this.emit(); return; }
    if (this.ended) { this.ended = false; this.emit(); return; }
    const tl = this.timeline(this.slide);
    const autoFirst = tl.main[0]?.auto ? 1 : 0;
    if (this.step > autoFirst) {
      const k = this.step - 1;
      this.step = k;
      this.ps = { now: now(), main: Array.from({ length: k }, () => -Infinity), trig: {} };
      this.touchPs();
      this.emit();
      return;
    }
    if (this.pos > 0) { this.pos--; this.enter(false, -1, true); }
  }

  /** Go to a slide by deck index; slides outside the show order are shown too (hidden slides). */
  goto(deckIndex: number, transition = true): void {
    if (this.kiosk || !this.deck.slides[deckIndex]) return;
    let p = this.order.indexOf(deckIndex);
    if (p < 0) {
      // Insert the hidden slide right after the current one.
      this.order.splice(this.pos + 1, 0, deckIndex);
      p = this.pos + 1;
    }
    this.ended = false;
    this.screen = null;
    this.overview = false;
    this.pos = p;
    this.enter(transition, 1);
  }

  /** Moves to a position in the order (previews). */
  jump(pos: number, transition: boolean): void { this.pos = Math.max(0, Math.min(this.order.length - 1, pos)); this.enter(transition); }

  first(): void { if (!this.kiosk) { this.ended = false; this.pos = 0; this.enter(false); } }
  last(): void { if (!this.kiosk) { this.ended = false; this.pos = this.order.length - 1; this.enter(false); } }

  nextHidden(): void {
    const i = this.slideIndex + 1;
    if (this.deck.slides[i]?.hidden) this.goto(i);
    else this.next();
  }

  /** Clicking a trigger shape plays its next sequence. Returns false when the shape has none. */
  trigger(shapeId: string): boolean {
    const tl = this.timeline(this.slide);
    const steps = tl.triggers[shapeId];
    if (!steps?.length) return false;
    const started = this.ps.trig[shapeId] ?? [];
    const t = now();
    // After the last sequence, start again from the first.
    const nextList = started.length >= steps.length ? [t] : [...started, t];
    this.ps = { ...this.ps, now: t, trig: { ...this.ps.trig, [shapeId]: nextList } };
    this.touchPs();
    this.emit();
    return true;
  }

  link(l: Hyperlink | undefined): boolean {
    if (!l) return false;
    if (l.url) {
      if (/^(https?:|mailto:)/i.test(l.url)) window.open(l.url, '_blank', 'noopener,noreferrer');
      return true;
    }
    switch (l.action) {
      case 'next': this.advanceOrEnd(); return true;
      case 'prev': if (this.pos > 0) { this.pos--; this.enter(true, -1, true); } return true;
      case 'first': this.pos = 0; this.enter(true); return true;
      case 'last': this.pos = this.order.length - 1; this.enter(true); return true;
      case 'end': this.end(); return true;
      case 'slide': {
        const i = this.deck.slides.findIndex((s) => s.id === l.slide);
        if (i >= 0) this.goto(i);
        return true;
      }
      default: return false;
    }
  }

  private advanceOrEnd(): void { this.step = Number.MAX_SAFE_INTEGER; this.advance(); }

  /** A zoom shape: jump to its slide or section, optionally coming back afterwards. */
  zoomTo(s: Shape): boolean {
    if (s.kind !== 'zoom') return false;
    const slides = this.deck.slides;
    let first = -1, lastIdx = -1;
    if (s.targetKind === 'section') {
      const secs = this.deck.sections;
      const k = secs.findIndex((x) => x.id === s.target);
      if (k < 0) return true;
      first = slides.findIndex((x) => x.id === secs[k]!.first);
      const nextFirst = secs[k + 1] ? slides.findIndex((x) => x.id === secs[k + 1]!.first) : slides.length;
      lastIdx = nextFirst - 1;
    } else {
      first = lastIdx = slides.findIndex((x) => x.id === s.target);
    }
    if (first < 0) return true;
    const back = this.pos;
    // Play the target range in order, inserting slides the show order doesn't contain.
    const range: number[] = [];
    for (let i = first; i <= lastIdx; i++) if (!slides[i]!.hidden || i === first) range.push(i);
    const startPos = this.pos + 1;
    this.order.splice(startPos, 0, ...range);
    if (s.returnToZoom !== false) this.zoomStack.push({ back, until: startPos + range.length - 1 });
    this.pos = startPos;
    this.enter(true);
    return true;
  }

  // ---------- Timed advance ----------

  /** Seconds after which the current slide moves on by itself, or null. */
  advanceAfter(): number | null {
    const s = this.slide;
    if (this.autoplay) return null;
    if (!s || this.mode === 'rehearse' || this.mode === 'record') return null;
    if (this.autoAdvance) return this.autoAdvance.seconds;
    if (this.deck.show.useTimings !== false && s.transition?.advanceAfter !== undefined) return s.transition.advanceAfter;
    if (this.deck.show.useTimings && s.timing) return s.timing;
    if (this.kiosk) return s.transition?.advanceAfter ?? s.timing ?? 5;
    return null;
  }

  private tick(): void {
    const t = now();
    if (this.paused || this.prompt || this.ended || this.overview) return;
    if (this.autoplay) {
      if (this.transitionDoneFor !== this.nav.id) return;
      const tl = this.timeline(this.slide);
      if (!settled(tl, { ...this.ps, now: t })) return;
      if (this.step < tl.main.length) this.next(false);
      else if (t - this.ps.now > 0.6 && t - this.enteredAt > 0.6) { this.autoplay = false; this.hooks.finish?.(); }
      return;
    }
    const after = this.advanceAfter();
    if (after === null) return;
    if (this.transitionDoneFor !== this.nav.id) return;
    const tl = this.timeline(this.slide);
    const ps = { ...this.ps, now: t };
    if (!settled(tl, ps)) return;
    // Remaining click groups play one after another; the slide then waits its time.
    if (this.step < tl.main.length) { this.next(false); return; }
    if (t - this.enteredAt >= after) this.next(false);
  }

  togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) this.pausedAt = now();
    else { const d = now() - this.pausedAt; this.enteredAt += d; this.slideClock += d; this.showClock += d; }
    this.emit();
  }

  /** Clicks still needed on the current slide. */
  remainingClicks(): number { return Math.max(0, clickCount(this.timeline(this.slide)) - this.step); }

  // ---------- Ink ----------

  inkFor(slide: Slide | undefined): InkStroke[] { return slide ? (this.ink[slide.id] ??= []) : []; }
  hasInk(): boolean { return Object.values(this.ink).some((x) => x.length > 0); }
  clearInk(): void { const s = this.slide; if (s) this.ink[s.id] = []; this.emit(); }
  setTool(t: InkTool): void { this.tool = this.tool === t ? null : t; this.emit(); }

  // ---------- Ending ----------

  end(): void {
    if (this.prompt) return;
    if (this.mode === 'rehearse' || this.mode === 'record') {
      const s = this.slide;
      if (s) this.timings[s.id] = (this.timings[s.id] ?? 0) + (now() - this.slideClock);
      this.slideClock = now();
    }
    if (this.mode === 'rehearse') { this.prompt = 'timings'; this.emit(); return; }
    if (this.hasInk()) { this.prompt = 'ink'; this.emit(); return; }
    this.finish();
  }

  answer(keep: boolean): void {
    const p = this.prompt;
    this.prompt = null;
    if (p === 'timings' && keep) {
      this.store.tryChange('Keep slide timings', () => {
        for (const s of this.deck.slides) {
          const t = this.timings[s.id];
          if (t !== undefined) s.timing = Math.round(t * 10) / 10;
        }
        this.deck.show.useTimings = true;
      });
    }
    if (p === 'ink' && keep) this.keepInk();
    if (p === 'timings' && this.hasInk()) { this.prompt = 'ink'; this.emit(); return; }
    this.finish();
  }

  private keepInk(): void {
    this.store.tryChange('Keep ink', () => {
      for (const s of this.deck.slides) {
        const strokes = this.ink[s.id];
        if (!strokes?.length) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const st of strokes) for (const [x, y] of st.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        const pad = Math.max(...strokes.map((t) => t.width));
        x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
        s.shapes.push({
          id: `ink${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: 'ink', name: `Ink ${s.shapes.length + 1}`,
          x: Math.round(x0), y: Math.round(y0), w: Math.max(1, Math.round(x1 - x0)), h: Math.max(1, Math.round(y1 - y0)),
          strokes: strokes.map((t): InkStroke => ({ ...t, points: t.points.map((pt) => { const q = [...pt] as InkStroke['points'][number]; q[0] = Math.round((pt[0] - Math.round(x0)) * 10) / 10; q[1] = Math.round((pt[1] - Math.round(y0)) * 10) / 10; return q; }) })),
        });
      }
    });
  }

  finish(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const s = this.slide;
    if (s) this.hooks.leaveSlide?.(s);
    this.hooks.finish?.();
    if (this.mode !== 'reading') {
      desktop?.setPresenting?.(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      const i = this.deck.slides.indexOf(this.slide!);
      if (i >= 0 && this.mode !== 'record') this.store.cur = i;
    }
    if (this.store.show === this) this.store.show = null;
    this.listeners.clear();
    this.store.emit();
  }
}

export const showOf = (store: FrameStore): ShowController | null => (store.show instanceof ShowController ? store.show : null);

/** Extra controls other features add to the show's control bar. */
export const showBarExtras: { id: string; order?: number; render: (c: ShowController) => ReactNode }[] = [];
