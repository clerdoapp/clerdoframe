import { describe, expect, it, vi, afterEach } from 'vitest';
import { newDeck, newSlide } from '../src/model/defaults';
import { textBody, uid, type AutoShape, type Deck } from '../src/model/deck';
import { readPptx, writePptx } from '../src/formats/pptx';
import { registerExtras } from '../src/features/gpresent/extras';
import { accessibleDoc, accessibleHtml, embedCode, entranceSteps, prefixIds, publishHtml, defaultPublish } from '../src/formats/html';
import { applyMaster, importMaster } from '../src/features/gpresent/theme';
import { FrameStore } from '../src/app/store';
import { ShowController } from '../src/features/show/controller';
import { checkPackage, parts } from './pptx.helpers';

registerExtras();

const g = globalThis as Record<string, unknown>;
g.document ??= { fullscreenElement: null, exitFullscreen: () => Promise.resolve() };
g.window ??= { open: vi.fn() };

const box = (name: string, text: string, extra: Partial<AutoShape> = {}): AutoShape => ({ id: uid('s'), kind: 'shape', name, geom: 'rect', x: 100, y: 50, w: 400, h: 100, text: textBody(text), ...extra });

const sample = (): Deck => {
  const d = newDeck();
  const obj = d.masters[0]!.layouts.find((l) => l.type === 'obj')!;
  d.slides.push(newSlide(obj));
  const t = d.slides[1]!.shapes.find((s) => s.ph?.type === 'title') as AutoShape;
  t.text = textBody('Second slide');
  const body = d.slides[1]!.shapes.find((s) => s.ph && s.ph.type !== 'title') as AutoShape;
  body.text = textBody('First point\nSecond point');
  d.slides[1]!.shapes.push({ id: 'pic', kind: 'picture', name: 'Logo', alt: 'Company logo', x: 0, y: 0, w: 50, h: 50, media: 'm1' });
  d.media.m1 = { id: 'm1', type: 'image/png', name: 'a.png', data: new Uint8Array([137, 80, 78, 71]) };
  d.slides[1]!.notes = textBody('Remember the date');
  return d;
};

describe('extras in .pptx', () => {
  it('keep the document id and comment assignees through save and reopen', () => {
    const d = newDeck();
    d.props.docId = 'doc123abc';
    d.slides[0]!.comments = [
      { id: 'c1', author: 'Rana', at: '2026-01-01T00:00:00Z', text: 'Look at this @Sam', assignee: 'Sam', replies: [{ id: 'r1', author: 'Sam', at: '2026-01-02T00:00:00Z', text: 'ok' }] },
      { id: 'c2', author: 'Rana', at: '2026-01-03T00:00:00Z', text: 'Done @Lee', assignee: 'Lee', resolved: true },
    ];
    const bytes = writePptx(d);
    expect(checkPackage(bytes)).toEqual([]);
    const p = parts(bytes);
    expect(p['customXml/clerdoframe-extras.xml']).toContain('doc123abc');
    const back = readPptx(bytes).deck;
    expect(back.props.docId).toBe('doc123abc');
    const cs = back.slides[0]!.comments!;
    expect(cs[0]!.assignee).toBe('Sam');
    // The reply comes back as the second entry of the comment part; the second thread is third.
    expect(cs[2]!.assignee).toBe('Lee');
    expect(cs[2]!.resolved).toBe(true);
    expect(back.extraParts?.['customXml/clerdoframe-extras.xml']).toBeUndefined();
    // Saving again writes the part once.
    const again = parts(writePptx(back));
    expect(Object.keys(again).filter((k) => k.startsWith('customXml/'))).toEqual(['customXml/clerdoframe-extras.xml']);
    expect((again['ppt/_rels/presentation.xml.rels']!.match(/clerdoframe-extras/g) ?? []).length).toBe(1);
  });

  it('writes no part when there is nothing to keep', () => {
    const p = parts(writePptx(newDeck()));
    expect(Object.keys(p).some((k) => k.startsWith('customXml/'))).toBe(false);
  });
});

describe('web page export', () => {
  it('numbers entrance animations by click', () => {
    const d = sample();
    const s = d.slides[1]!;
    const [a, b] = s.shapes;
    s.animations = [
      { id: 'x1', shape: a!.id, cls: 'entr', effect: 'fade', trigger: 'with', duration: 0.5, delay: 0 },
      { id: 'x2', shape: b!.id, cls: 'entr', effect: 'fade', trigger: 'click', duration: 0.5, delay: 0 },
      { id: 'x3', shape: 'pic', cls: 'emph', effect: 'pulse', trigger: 'click', duration: 0.5, delay: 0 },
    ];
    const st = entranceSteps(s);
    expect(st.steps).toBe(2);
    expect(st.at.get(a!.id)).toBe(0);
    expect(st.at.get(b!.id)).toBe(1);
    expect(st.at.has('pic')).toBe(false);
  });

  it('prefixes ids and their references', () => {
    expect(prefixIds('<linearGradient id="g1"/><rect fill="url(#g1)"/><use href="#g1"/>', 's2_')).toBe('<linearGradient id="s2_g1"/><rect fill="url(#s2_g1)"/><use href="#s2_g1"/>');
  });

  it('makes one self-contained page with every slide, the player and no notes', () => {
    const d = sample();
    d.slides[1]!.transition = { name: 'push', duration: 0.8, option: 'u' };
    const html = publishHtml(d, { ...defaultPublish(d), interval: 5, loop: true, autoStart: true }, '@font-face{font-family:Unused;}@font-face{font-family:"Hanken Grotesk";src:url(x)}');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    const data = JSON.parse(/<script type="application\/json" id="cf-data">([\s\S]*?)<\/script>/.exec(html)![1]!);
    expect(data.slides).toHaveLength(2);
    expect(data.opts).toMatchObject({ interval: 5, loop: true, autoStart: true });
    expect(data.slides[1].tr).toMatchObject({ kind: 'push', dir: 'u' });
    expect(html).toContain('Second slide');
    expect(html).not.toContain('Remember the date');
    expect(html).not.toContain('Unused');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(embedCode('Deck.html', { width: 960, height: 540 }, 'My "deck"')).toBe('<iframe src="Deck.html" width="960" height="540" title="My &quot;deck&quot;" style="border:0" allow="fullscreen" allowfullscreen loading="lazy"></iframe>');
  });

  it('leaves hidden slides out unless asked', () => {
    const d = sample();
    d.slides[0]!.hidden = true;
    const one = JSON.parse(/id="cf-data">([\s\S]*?)<\/script>/.exec(publishHtml(d, defaultPublish(d)))![1]!);
    expect(one.slides).toHaveLength(1);
  });
});

describe('accessible view', () => {
  it('has one article per slide with heading, list, alt text and optional notes', () => {
    const d = sample();
    d.slides[1]!.shapes.push({ id: 't1', kind: 'table', name: 'Table', x: 0, y: 0, w: 100, h: 100, cols: [50, 50], rows: [{ h: 20, cells: [{ text: textBody('Year') }, { text: textBody('Sales') }] }, { h: 20, cells: [{ text: textBody('2025') }, { text: textBody('<10>') }] }] });
    d.slides[1]!.shapes.push(box('Deco', 'skip me', { decorative: true }));
    const arts = accessibleDoc(d);
    expect(arts).toHaveLength(2);
    expect(arts[1]!.title).toBe('Second slide');
    expect(arts[1]!.blocks[0]).toEqual({ kind: 'list', ordered: false, items: [{ text: 'First point', level: 0 }, { text: 'Second point', level: 0 }] });
    const html = accessibleHtml(d, { notes: true });
    expect((html.match(/<article/g) ?? []).length).toBe(2);
    expect(html).toContain('<h2 id="s2"><span class="n">Slide 2.</span> Second slide</h2>');
    expect(html).toContain('aria-label="Company logo"');
    expect(html).toContain('<th scope="col">Year</th>');
    expect(html).toContain('&lt;10&gt;');
    expect(html).not.toContain('skip me');
    expect(html).toContain('Remember the date');
    expect(accessibleHtml(d, { notes: false })).not.toContain('Remember the date');
  });
});

describe('import theme', () => {
  it('copies a master with new ids and its media, and moves slides to matching layouts', () => {
    const target = sample();
    const src = newDeck();
    const m = src.masters[0]!;
    m.name = 'Ocean';
    src.media.bg = { id: 'bg', type: 'image/png', name: 'bg.png', data: new Uint8Array([1, 2, 3]) };
    m.background = { fill: { type: 'picture', media: 'bg', mode: 'stretch' } };
    const ids = new Set(target.masters.flatMap((x) => [x.id, ...x.layouts.map((l) => l.id)]));
    const added: string[] = [];
    const nm = importMaster(target, src, m, (type, name, data) => { const id = `n${added.length}`; added.push(id); target.media[id] = { id, type, name, data }; return id; });
    expect(target.masters).toHaveLength(2);
    expect(ids.has(nm.id)).toBe(false);
    expect(nm.layouts.every((l) => !ids.has(l.id))).toBe(true);
    expect(nm.background.fill).toMatchObject({ type: 'picture', media: 'n0' });
    applyMaster(target, nm, target.slides);
    const types = target.slides.map((s) => nm.layouts.find((l) => l.id === s.layout)?.type);
    expect(types).toEqual(['title', 'obj']);
    // Survives save and reopen.
    const back = readPptx(writePptx(target)).deck;
    expect(back.masters.map((x) => x.name)).toContain('Ocean');
  });
});

describe('auto-play', () => {
  const live: ShowController[] = [];
  afterEach(() => { for (const c of live.splice(0)) c.finish(); });
  it('advances on its interval and loops when asked', () => {
    const s = new FrameStore(sample());
    const c = new ShowController(s, {});
    live.push(c);
    s.show = c;
    expect(c.advanceAfter()).toBeNull();
    c.autoAdvance = { seconds: 3, loop: true };
    expect(c.advanceAfter()).toBe(3);
    c.next(); // to slide 2
    expect(c.pos).toBe(1);
    c.next(); // loops
    expect(c.pos).toBe(0);
    expect(c.ended).toBe(false);
    c.autoAdvance = { seconds: 3, loop: false };
    c.next(); c.next();
    expect(c.ended).toBe(true);
  });
});
