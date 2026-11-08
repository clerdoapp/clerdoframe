// Takes version snapshots while the person works: every few minutes when something changed,
// on save, and when asked. One session per store.
import type { FrameStore } from '../../app/store';
import type { Deck } from '../../model/deck';
import { newDocId } from './extras';
import { IdbBackend, deckJson, loadVersion, saveVersion, type VersionBackend, type VersionMeta } from './versions';

export const AUTO_MS = 3 * 60_000;

export class History {
  be: VersionBackend | null;
  private lastJson = '';
  private baseline: { json: string; at: number; saved: boolean } | null = null;
  private busy: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSaved: number | null = null;
  private listeners = new Set<() => void>();
  ver = 0;

  constructor(readonly store: FrameStore, be?: VersionBackend | null) {
    this.be = be !== undefined ? be : typeof indexedDB !== 'undefined' ? new IdbBackend() : null;
  }

  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  getVersion = (): number => this.ver;
  private changed(): void { this.ver++; for (const l of this.listeners) l(); }

  /** The document id kept in the deck; made on first use. Not an undoable change. */
  docId(): string {
    const p = this.store.deck.props;
    if (!p.docId) p.docId = newDocId();
    return p.docId;
  }

  /** A document was opened or started: remember how it looked, so the first snapshot can keep it. */
  loaded(): void {
    this.docId();
    const json = deckJson(this.store.deck);
    this.baseline = { json, at: Date.now(), saved: false };
    this.lastJson = json;
    this.lastSaved = this.store.file.lastSaved;
    this.changed();
  }

  start(ms = AUTO_MS): () => void {
    const onLoad = () => this.loaded();
    this.store.afterLoad.add(onLoad);
    this.loaded();
    this.timer = setInterval(() => { void this.snapshot('auto'); }, ms);
    const unsub = this.store.subscribe(() => {
      const ls = this.store.file.lastSaved;
      if (ls && ls !== this.lastSaved) { this.lastSaved = ls; void this.snapshot('save'); }
    });
    return () => { this.store.afterLoad.delete(onLoad); if (this.timer) clearInterval(this.timer); unsub(); };
  }

  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.busy.then(fn, fn);
    this.busy = p.catch(() => undefined);
    return p;
  }

  /** Saves a version when the deck changed since the last one (or always, with a name). */
  snapshot(reason: VersionMeta['reason'], name?: string): Promise<VersionMeta | null> {
    return this.queue(async () => {
      const be = this.be;
      if (!be) return null;
      if (reason === 'auto' && (this.store.show || this.store.editing)) return null;
      const doc = this.docId();
      const deck = this.store.deck;
      const json = deckJson(deck);
      if (json === this.lastJson && !name && reason !== 'restore') return null;
      const b = this.baseline;
      if (b && !b.saved && b.json !== json) {
        b.saved = true;
        const had = (await be.list(doc)).length > 0;
        // The document as it was opened, unless it already has history.
        if (!had) await saveVersion(be, { deck: { ...(JSON.parse(b.json) as Deck), media: deck.media }, doc, reason: 'open', at: Math.min(b.at, Date.now() - 1), json: b.json });
      }
      if (b) b.saved = true;
      const v = await saveVersion(be, { deck, doc, reason, json, ...(name ? { name } : {}) });
      this.lastJson = json;
      this.changed();
      return v;
    });
  }

  /** Names the current version: the latest one if nothing changed since, else a new one. */
  async nameCurrent(name: string): Promise<VersionMeta | null> {
    const be = this.be;
    if (!be) return null;
    const json = deckJson(this.store.deck);
    if (json === this.lastJson) {
      const latest = (await this.list())[0];
      if (latest) {
        const stored = await be.json(latest.id);
        if (stored === json) { const v = { ...latest, name, reason: 'named' as const }; await be.update(v); this.changed(); return v; }
      }
    }
    return this.snapshot('named', name);
  }

  async rename(v: VersionMeta, name: string): Promise<void> {
    if (!this.be) return;
    const n = name.trim();
    const { name: _old, ...rest } = v;
    await this.be.update(n ? { ...rest, name: n, reason: 'named' } : { ...rest, reason: v.reason === 'named' ? 'auto' : v.reason });
    this.changed();
  }

  async list(): Promise<VersionMeta[]> {
    if (!this.be) return [];
    return (await this.be.list(this.docId())).sort((a, b) => b.at - a.at);
  }

  load(v: VersionMeta): Promise<Deck> {
    if (!this.be) return Promise.reject(new Error('Version history is not available here.'));
    return loadVersion(this.be, v);
  }

  /** Restores a version as one undo step, after keeping the current state as a version. */
  async restore(v: VersionMeta): Promise<boolean> {
    const d = await this.load(v);
    await this.snapshot('restore');
    const s = this.store;
    const ok = s.tryChange('Restore version', () => {
      const cur = s.deck;
      const media = { ...cur.media };
      for (const [id, m] of Object.entries(d.media)) if (!media[id]) media[id] = m;
      s.deck = { ...d, media, props: { ...d.props, docId: cur.props.docId ?? this.docId() }, ...(cur.extraParts ? { extraParts: cur.extraParts } : {}) };
      s.cur = Math.min(s.cur, Math.max(0, d.slides.length - 1));
      s.slideSel = [s.cur];
      s.sel = [];
    });
    if (ok) { this.lastJson = deckJson(s.deck); this.changed(); }
    return ok;
  }
}

export const historyOf = (store: FrameStore): History => {
  let h = store.ext.gpHistory as History | undefined;
  if (!h) { h = new History(store); store.ext.gpHistory = h; }
  return h;
};
