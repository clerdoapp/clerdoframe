// Pure document operations behind the File tab: inspect, reuse slides, template, recent files.
import { uid, walkShapes, type Deck, type Id, type Layout, type Master, type Shape, type Slide } from '../../model/deck';

export interface InspectReport { comments: number; hidden: number; offSlide: number; notes: number; personal: boolean }

const offSlide = (s: Shape, deck: Deck) => s.x + s.w <= 0 || s.y + s.h <= 0 || s.x >= deck.w || s.y >= deck.h;

export const inspect = (deck: Deck): InspectReport => ({
  comments: deck.slides.reduce((a, s) => a + (s.comments?.length ?? 0), 0),
  hidden: deck.slides.filter((s) => s.hidden).length,
  offSlide: deck.slides.reduce((a, s) => a + s.shapes.filter((x) => offSlide(x, deck)).length, 0),
  notes: deck.slides.filter((s) => s.notes.paras.some((p) => p.runs.some((r) => r.text.trim()))).length,
  personal: !!(deck.props.author || deck.props.lastModifiedBy || deck.props.company || deck.slides.some((s) => s.comments?.length)),
});

export interface InspectChoice { comments?: boolean; hidden?: boolean; offSlide?: boolean; notes?: boolean; personal?: boolean }

/** Removes what was chosen. Mutates the deck (call inside store.change). */
export const removeInspected = (deck: Deck, c: InspectChoice): void => {
  if (c.comments) for (const s of deck.slides) delete s.comments;
  if (c.hidden && deck.slides.some((s) => !s.hidden)) {
    const gone = new Set(deck.slides.filter((s) => s.hidden).map((s) => s.id));
    const remaining = deck.slides.filter((s) => !gone.has(s.id));
    for (const sec of deck.sections) if (gone.has(sec.first)) {
      const from = deck.slides.findIndex((x) => x.id === sec.first);
      const next = deck.slides.slice(from).find((x) => !gone.has(x.id));
      if (next) sec.first = next.id;
    }
    deck.sections = deck.sections.filter((s) => remaining.some((x) => x.id === s.first)).filter((s, i, a) => a.findIndex((o) => o.first === s.first) === i);
    for (const cs of deck.customShows) cs.slides = cs.slides.filter((id) => !gone.has(id));
    deck.slides = remaining;
  }
  if (c.offSlide) for (const s of deck.slides) {
    const drop = new Set(s.shapes.filter((x) => offSlide(x, deck)).map((x) => x.id));
    s.shapes = s.shapes.filter((x) => !drop.has(x.id));
    s.animations = s.animations.filter((a) => !drop.has(a.shape));
  }
  if (c.notes) for (const s of deck.slides) s.notes = { paras: [{ runs: [] }] };
  if (c.personal) {
    const { author: _a, lastModifiedBy: _l, company: _c, ...rest } = deck.props;
    deck.props = rest;
    for (const s of deck.slides) for (const cm of s.comments ?? []) { cm.author = 'Author'; delete cm.initials; for (const r of cm.replies ?? []) { r.author = 'Author'; delete r.initials; } }
  }
};

/** Slides from another deck, either keeping their own master (source formatting) or moved onto `target` layouts. */
export const reuseSlides = (deck: Deck, source: Deck, indexes: number[], keepSource: boolean): Slide[] => {
  const out: Slide[] = [];
  const masterMap = new Map<Id, { master: Master; layouts: Map<Id, Id> }>();
  for (const [k, m] of Object.entries(source.media)) if (!deck.media[k]) deck.media[k] = m;
  const layoutByType = (type: string): Layout => {
    const m = deck.masters[0]!;
    return m.layouts.find((l) => l.type === type) ?? m.layouts.find((l) => l.type === 'obj') ?? m.layouts[0]!;
  };
  for (const i of indexes) {
    const src = source.slides[i];
    if (!src) continue;
    const s = structuredClone(src);
    const ids = new Map<Id, Id>();
    s.id = uid('p');
    walkShapes(s.shapes, (x) => { const n = uid('s'); ids.set(x.id, n); x.id = n; });
    walkShapes(s.shapes, (x) => {
      if (x.kind === 'shape' && x.conn) for (const k of ['start', 'end'] as const) { const e = x.conn[k]; if (e) e.shape = ids.get(e.shape) ?? e.shape; }
      if (x.link?.slide) delete x.link;
    });
    s.animations = s.animations.map((a) => ({ ...a, id: uid('a'), shape: ids.get(a.shape) ?? a.shape, ...(a.triggerShape ? { triggerShape: ids.get(a.triggerShape) ?? a.triggerShape } : {}) }));
    delete s.comments;
    const srcMaster = source.masters.find((m) => m.layouts.some((l) => l.id === src.layout)) ?? source.masters[0]!;
    const srcLayout = srcMaster.layouts.find((l) => l.id === src.layout) ?? srcMaster.layouts[0]!;
    if (keepSource) {
      let hit = masterMap.get(srcMaster.id);
      if (!hit) {
        const m = structuredClone(srcMaster);
        m.id = uid('m');
        const layouts = new Map<Id, Id>();
        for (const l of m.layouts) { const n = uid('l'); layouts.set(l.id, n); l.id = n; }
        walkShapes(m.shapes, (x) => { x.id = uid('s'); });
        for (const l of m.layouts) walkShapes(l.shapes, (x) => { x.id = uid('s'); });
        deck.masters.push(m);
        hit = { master: m, layouts };
        masterMap.set(srcMaster.id, hit);
      }
      s.layout = hit.layouts.get(srcLayout.id) ?? hit.master.layouts[0]!.id;
    } else {
      s.layout = layoutByType(srcLayout.type).id;
    }
    out.push(s);
  }
  return out;
};

/** A deck saved as a template: slides kept, comments and personal details removed. */
export const asTemplate = (deck: Deck): Deck => {
  const d: Deck = { ...structuredClone({ ...deck, media: {}, extraParts: undefined }), media: deck.media };
  removeInspected(d, { comments: true, personal: true });
  delete d.final;
  return d;
};

// ---------- Recent files (names only, kept in this browser) ----------

const KEY = 'clerdoframe.recent';
export const recentFiles = (): { name: string; at: number }[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is { name: string; at: number } => !!x && typeof x.name === 'string' && typeof x.at === 'number').slice(0, 12) : [];
  } catch { return []; }
};
export const rememberFile = (name: string): void => {
  if (!name) return;
  try { localStorage.setItem(KEY, JSON.stringify([{ name, at: Date.now() }, ...recentFiles().filter((r) => r.name !== name)].slice(0, 12))); } catch { /* storage off */ }
};
export const forgetRecent = (): void => { try { localStorage.removeItem(KEY); } catch { /* storage off */ } };
