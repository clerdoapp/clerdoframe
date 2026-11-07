import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameStore } from '../src/app/store';
import { newDeck } from '../src/model/defaults';
import type { Animation, Slide } from '../src/model/deck';
import { ShowController } from '../src/features/show/controller';
import { matchShapes } from '../src/features/show/render';
import { TRANSITIONS, resolveTransition } from '../src/features/show/transitions';

const g = globalThis as Record<string, unknown>;
g.document ??= { fullscreenElement: null, exitFullscreen: () => Promise.resolve() };
g.window ??= { open: vi.fn() };

const deckWith = (n: number): FrameStore => {
  const s = new FrameStore(newDeck());
  const first = s.deck.slides[0]!;
  for (let i = 1; i < n; i++) s.deck.slides.push({ ...structuredClone(first), id: `s${i}` });
  return s;
};
const anim = (p: Partial<Animation> & { id: string; shape: string }): Animation => ({ cls: 'entr', effect: 'fade', trigger: 'click', duration: 0.5, delay: 0, ...p });
const live: ShowController[] = [];
const show = (s: FrameStore, o: ConstructorParameters<typeof ShowController>[1] = {}) => { const c = new ShowController(s, o); live.push(c); s.show = c; return c; };
afterEach(() => { for (const c of live.splice(0)) c.finish(); });

describe('show controller', () => {
  it('skips hidden slides and honours the range', () => {
    const s = deckWith(5);
    s.deck.slides[2]!.hidden = true;
    expect(show(s).order).toEqual([0, 1, 3, 4]);
    s.deck.show.range = { from: 2, to: 4 };
    expect(show(s).order).toEqual([1, 3]);
  });

  it('plays click groups before moving on, and back undoes them', () => {
    const s = deckWith(2);
    const sl = s.deck.slides[0]!;
    sl.shapes.push({ id: 'x', kind: 'shape', geom: 'rect', name: 'x', x: 0, y: 0, w: 10, h: 10 });
    sl.animations = [anim({ id: 'a', shape: 'x' }), anim({ id: 'b', shape: 'x', cls: 'emph', effect: 'pulse' })];
    const c = show(s);
    expect(c.remainingClicks()).toBe(2);
    c.next(); expect(c.step).toBe(1); expect(c.slideIndex).toBe(0);
    c.next(); expect(c.step).toBe(2);
    c.prev(); expect(c.step).toBe(1);
    c.next(); c.next(); expect(c.slideIndex).toBe(1);
    c.prev(); expect(c.slideIndex).toBe(0); expect(c.step).toBe(2);
  });

  it('ends with the end slide, loops when set', () => {
    const s = deckWith(2);
    const c = show(s);
    c.next(); c.next();
    expect(c.ended).toBe(true);
    s.deck.show.loop = true;
    const d = show(s);
    d.next(); d.next();
    expect(d.ended).toBe(false);
    expect(d.slideIndex).toBe(0);
  });

  it('kiosk ignores manual advance', () => {
    const s = deckWith(3);
    s.deck.show.type = 'kiosk';
    const c = show(s);
    c.next();
    expect(c.slideIndex).toBe(0);
  });

  it('goes to hidden slides on request and follows links', () => {
    const s = deckWith(4);
    s.deck.slides[1]!.hidden = true;
    const c = show(s);
    c.nextHidden();
    expect(c.slideIndex).toBe(1);
    c.link({ action: 'last' });
    expect(c.slideIndex).toBe(3);
    c.link({ action: 'slide', slide: s.deck.slides[0]!.id });
    expect(c.slideIndex).toBe(0);
  });

  it('custom shows use their own order', () => {
    const s = deckWith(4);
    const ids = s.deck.slides.map((x) => x.id);
    s.deck.customShows = [{ id: 'cs', name: 'Short', slides: [ids[3]!, ids[1]!] }];
    expect(show(s, { customShow: 'cs' }).order).toEqual([3, 1]);
  });

  it('keeps ink as undoable ink shapes', () => {
    const s = deckWith(1);
    const c = show(s);
    c.inkFor(c.slide).push({ tool: 'pen', color: '#E8401C', width: 3, points: [[100, 100, 0.5], [200, 150, 0.5]] });
    c.end();
    expect(c.prompt).toBe('ink');
    c.answer(true);
    const ink = s.deck.slides[0]!.shapes.find((x) => x.kind === 'ink');
    expect(ink).toBeTruthy();
    expect(ink!.x).toBeLessThanOrEqual(100);
    s.undo();
    expect(s.deck.slides[0]!.shapes.some((x) => x.kind === 'ink')).toBe(false);
  });

  it('rehearsal records timings when kept', () => {
    const s = deckWith(2);
    const c = show(s, { mode: 'rehearse' });
    c.next();
    c.end();
    expect(c.prompt).toBe('timings');
    c.answer(true);
    expect(s.deck.slides.every((x: Slide) => typeof x.timing === 'number')).toBe(true);
    expect(s.deck.show.useTimings).toBe(true);
  });

  it('zoom shapes jump to the target and come back', () => {
    const s = deckWith(4);
    const target = s.deck.slides[3]!.id;
    const c = show(s);
    c.zoomTo({ id: 'z', kind: 'zoom', name: 'Zoom', x: 0, y: 0, w: 10, h: 10, target, targetKind: 'slide', returnToZoom: true });
    expect(c.slideIndex).toBe(3);
    c.next();
    expect(c.slideIndex).toBe(0);
  });
});

describe('transitions and morph', () => {
  it('every model transition has an effect', () => {
    const names = ['none', 'morph', 'fade', 'push', 'wipe', 'split', 'reveal', 'randomBars', 'shape', 'uncover', 'cover', 'flash', 'fallOver', 'drape', 'curtains', 'wind', 'prestige', 'fracture', 'crush', 'peelOff', 'pageCurl', 'airplane', 'origami', 'dissolve', 'checkerboard', 'blinds', 'clock', 'ripple', 'honeycomb', 'glitter', 'vortex', 'shred', 'switch', 'flip', 'gallery', 'cube', 'doors', 'box', 'comb', 'zoom', 'random', 'pan', 'ferris', 'conveyor', 'rotate', 'window', 'orbit', 'flythrough'];
    for (const n of names) expect(TRANSITIONS.some((t) => t.id === n), n).toBe(true);
    const r = resolveTransition('random', undefined, 42);
    expect(r.def.id).not.toBe('random');
  });

  it('morph matches by !!name, id, name and text', () => {
    const box = (id: string, name: string, text = '') => ({ id, kind: 'shape' as const, geom: 'rect', name, x: 0, y: 0, w: 1, h: 1, ...(text ? { text: { paras: [{ runs: [{ text }] }] } } : {}) });
    const pairs = matchShapes([box('a', '!!hero'), box('b', 'Box'), box('c', 'Other', 'Hello'), box('d', 'Gone')], [box('x', '!!hero'), box('b', 'Box'), box('y', 'Else', 'Hello'), box('z', 'New')]);
    const by = (id: string) => pairs.find((p) => p.from?.id === id)?.to?.id;
    expect(by('a')).toBe('x');
    expect(by('b')).toBe('b');
    expect(by('c')).toBe('y');
    expect(by('d')).toBeUndefined();
    expect(pairs.some((p) => !p.from && p.to?.id === 'z')).toBe(true);
  });
});
