// Version history: snapshots of a document kept on this device (IndexedDB), keyed by the
// document id saved in the file. Media is stored once per content hash and shared by snapshots.
import type { Deck, MediaItem } from '../../model/deck';

export interface VersionMeta {
  id: string;
  doc: string;
  /** ms since epoch */
  at: number;
  /** Set for versions the person named; named versions are never pruned. */
  name?: string;
  /** Why an automatic version was taken: 'auto' | 'save' | 'open' | 'restore'. */
  reason: 'auto' | 'save' | 'open' | 'restore' | 'named';
  slides: number;
  title: string;
  /** Media id -> content hash. */
  media: Record<string, string>;
  bytes: number;
}

export interface StoredMedia { hash: string; type: string; name: string; data: Uint8Array }

/** Where versions live. IndexedDB in the app; an in-memory map in tests. */
export interface VersionBackend {
  list(doc?: string): Promise<VersionMeta[]>;
  put(meta: VersionMeta, json: string, media: StoredMedia[]): Promise<void>;
  update(meta: VersionMeta): Promise<void>;
  json(id: string): Promise<string | undefined>;
  media(hashes: string[]): Promise<Map<string, StoredMedia>>;
  remove(ids: string[]): Promise<void>;
  hasMedia(hash: string): Promise<boolean>;
  /** Removes stored media no version refers to. */
  sweep(keep: Set<string>): Promise<number>;
}

export const LIMITS = { autoPerDoc: 50, docs: 40 };

// ---------- Hashing ----------

const hashCache = new WeakMap<Uint8Array, string>();

/** A fast content hash (two 32-bit FNV-1a lanes + length). Cached per byte array, since media never changes. */
export const hashBytes = (u: Uint8Array): string => {
  const hit = hashCache.get(u);
  if (hit) return hit;
  let a = 0x811c9dc5, b = 0x01000193 ^ u.length;
  for (let i = 0; i < u.length; i++) {
    const x = u[i]!;
    a = Math.imul(a ^ x, 0x01000193);
    b = Math.imul(b ^ x ^ (i & 0xff), 0x5bd1e995);
  }
  const h = `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}${u.length.toString(16)}`;
  hashCache.set(u, h);
  return h;
};

// ---------- Snapshots ----------

/** The deck as JSON without media or kept parts. */
export const deckJson = (d: Deck): string => {
  const { media: _m, extraParts: _x, ...rest } = d;
  return JSON.stringify(rest);
};

const titleOf = (d: Deck): string => {
  for (const s of d.slides) {
    const t = s.shapes.find((x) => x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle'));
    if (t?.kind === 'shape') {
      const txt = (t.text?.paras ?? []).map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim();
      if (txt) return txt.slice(0, 120);
    }
  }
  return d.props.title ?? '';
};

/** Media the deck refers to (ids that appear in its JSON), with their hashes. */
export const usedMedia = (d: Deck, json: string): { map: Record<string, string>; items: StoredMedia[] } => {
  const map: Record<string, string> = {};
  const items: StoredMedia[] = [];
  for (const [id, m] of Object.entries(d.media)) {
    if (!json.includes(`"${id}"`)) continue;
    const hash = hashBytes(m.data);
    map[id] = hash;
    if (!items.some((x) => x.hash === hash)) items.push({ hash, type: m.type, name: m.name, data: m.data });
  }
  return { map, items };
};

let seq = 0;
export const versionId = (at: number): string => `v${at.toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface SnapshotInput { deck: Deck; doc: string; reason: VersionMeta['reason']; name?: string; at?: number; json?: string }

/** Saves a version. Media already stored is not written again. Returns the new version. */
export const saveVersion = async (be: VersionBackend, o: SnapshotInput): Promise<VersionMeta> => {
  const at = o.at ?? Date.now();
  const json = o.json ?? deckJson(o.deck);
  const { map, items } = usedMedia(o.deck, json);
  const fresh: StoredMedia[] = [];
  for (const m of items) if (!(await be.hasMedia(m.hash))) fresh.push(m);
  const meta: VersionMeta = {
    id: versionId(at), doc: o.doc, at, reason: o.name ? 'named' : o.reason, slides: o.deck.slides.length, title: titleOf(o.deck), media: map,
    bytes: json.length + fresh.reduce((n, m) => n + m.data.length, 0), ...(o.name ? { name: o.name } : {}),
  };
  await be.put(meta, json, fresh);
  await prune(be, o.doc);
  return meta;
};

/**
 * Which versions to drop: beyond `autoPerDoc` unnamed versions of a document (oldest first),
 * and every version of documents beyond the `docs` most recently changed. Named versions of kept documents stay.
 */
export const planPrune = (all: VersionMeta[], limits = LIMITS): string[] => {
  const drop = new Set<string>();
  const byDoc = new Map<string, VersionMeta[]>();
  for (const v of all) { const l = byDoc.get(v.doc) ?? []; l.push(v); byDoc.set(v.doc, l); }
  const docs = [...byDoc.entries()].map(([doc, l]) => ({ doc, l, last: Math.max(...l.map((v) => v.at)) })).sort((a, b) => b.last - a.last);
  docs.forEach(({ l }, i) => {
    if (i >= limits.docs) { for (const v of l) drop.add(v.id); return; }
    const autos = l.filter((v) => !v.name).sort((a, b) => b.at - a.at);
    for (const v of autos.slice(limits.autoPerDoc)) drop.add(v.id);
  });
  return [...drop];
};

export const prune = async (be: VersionBackend, _doc?: string, limits = LIMITS): Promise<number> => {
  const all = await be.list();
  const drop = planPrune(all, limits);
  if (!drop.length) return 0;
  await be.remove(drop);
  const gone = new Set(drop);
  const keep = new Set<string>();
  for (const v of all) if (!gone.has(v.id)) for (const h of Object.values(v.media)) keep.add(h);
  await be.sweep(keep);
  return drop.length;
};

/** Rebuilds a version's deck with its media. */
export const loadVersion = async (be: VersionBackend, v: VersionMeta): Promise<Deck> => {
  const json = await be.json(v.id);
  if (!json) throw new Error('This version could not be read.');
  const rest = JSON.parse(json) as Omit<Deck, 'media'>;
  const stored = await be.media([...new Set(Object.values(v.media))]);
  const media: Record<string, MediaItem> = {};
  for (const [id, h] of Object.entries(v.media)) { const m = stored.get(h); if (m) media[id] = { id, type: m.type, name: m.name, data: m.data }; }
  return { ...rest, media } as Deck;
};

/** Groups versions by local day, newest first. */
export const byDay = (list: VersionMeta[]): { day: string; items: VersionMeta[] }[] => {
  const out: { day: string; items: VersionMeta[] }[] = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  for (const v of [...list].sort((a, b) => b.at - a.at)) {
    const d = new Date(v.at);
    const key = d.toDateString();
    const day = key === today ? 'Today' : key === yesterday ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    const g = out.at(-1);
    if (g && g.day === day) g.items.push(v); else out.push({ day, items: [v] });
  }
  return out;
};

// ---------- Backends ----------

export class MemoryBackend implements VersionBackend {
  metas = new Map<string, VersionMeta>();
  jsons = new Map<string, string>();
  blobs = new Map<string, StoredMedia>();
  async list(doc?: string) { return [...this.metas.values()].filter((v) => !doc || v.doc === doc).map((v) => ({ ...v })); }
  async put(meta: VersionMeta, json: string, media: StoredMedia[]) { this.metas.set(meta.id, { ...meta }); this.jsons.set(meta.id, json); for (const m of media) this.blobs.set(m.hash, m); }
  async update(meta: VersionMeta) { if (this.metas.has(meta.id)) this.metas.set(meta.id, { ...meta }); }
  async json(id: string) { return this.jsons.get(id); }
  async media(hashes: string[]) { return new Map(hashes.map((h) => [h, this.blobs.get(h)]).filter((x): x is [string, StoredMedia] => !!x[1])); }
  async remove(ids: string[]) { for (const id of ids) { this.metas.delete(id); this.jsons.delete(id); } }
  async hasMedia(hash: string) { return this.blobs.has(hash); }
  async sweep(keep: Set<string>) { let n = 0; for (const h of [...this.blobs.keys()]) if (!keep.has(h)) { this.blobs.delete(h); n++; } return n; }
}

const DB = 'clerdoframe-versions';
const req = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction): Promise<void> => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error('Storage is full.')); });

export class IdbBackend implements VersionBackend {
  private db: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('meta', { keyPath: 'id' }).createIndex('doc', 'doc');
        d.createObjectStore('json');
        d.createObjectStore('media', { keyPath: 'hash' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { this.db = null; rej(r.error); };
    });
    return this.db;
  }
  async list(doc?: string) {
    const db = await this.open();
    const st = db.transaction('meta').objectStore('meta');
    return (await req(doc ? st.index('doc').getAll(doc) : st.getAll())) as VersionMeta[];
  }
  async put(meta: VersionMeta, json: string, media: StoredMedia[]) {
    const db = await this.open();
    const tx = db.transaction(['meta', 'json', 'media'], 'readwrite');
    for (const m of media) tx.objectStore('media').put(m);
    tx.objectStore('json').put(json, meta.id);
    tx.objectStore('meta').put(meta);
    await done(tx);
  }
  async update(meta: VersionMeta) { const db = await this.open(); const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(meta); await done(tx); }
  async json(id: string) { const db = await this.open(); return (await req(db.transaction('json').objectStore('json').get(id))) as string | undefined; }
  async media(hashes: string[]) {
    const db = await this.open();
    const st = db.transaction('media').objectStore('media');
    const out = new Map<string, StoredMedia>();
    for (const h of hashes) { const m = (await req(st.get(h))) as StoredMedia | undefined; if (m) out.set(h, m); }
    return out;
  }
  async remove(ids: string[]) {
    const db = await this.open();
    const tx = db.transaction(['meta', 'json'], 'readwrite');
    for (const id of ids) { tx.objectStore('meta').delete(id); tx.objectStore('json').delete(id); }
    await done(tx);
  }
  async hasMedia(hash: string) { const db = await this.open(); return (await req(db.transaction('media').objectStore('media').getKey(hash))) !== undefined; }
  async sweep(keep: Set<string>) {
    const db = await this.open();
    const keys = (await req(db.transaction('media').objectStore('media').getAllKeys())) as string[];
    const drop = keys.filter((k) => !keep.has(k));
    if (!drop.length) return 0;
    const tx = db.transaction('media', 'readwrite');
    for (const k of drop) tx.objectStore('media').delete(k);
    await done(tx);
    return drop.length;
  }
}
