import { describe, expect, it } from 'vitest';
import { FrameStore } from '../src/app/store';
import { newDeck } from '../src/model/defaults';
import type { Deck } from '../src/model/deck';
import { History } from '../src/features/gpresent/history';
import { MemoryBackend, byDay, hashBytes, loadVersion, planPrune, prune, saveVersion, type VersionMeta } from '../src/features/gpresent/versions';

const meta = (id: string, doc: string, at: number, name?: string): VersionMeta => ({ id, doc, at, reason: name ? 'named' : 'auto', slides: 1, title: '', media: {}, bytes: 0, ...(name ? { name } : {}) });

const withPicture = (bytes: number[]): Deck => {
  const d = newDeck();
  d.media.m1 = { id: 'm1', type: 'image/png', name: 'a.png', data: new Uint8Array(bytes) };
  d.slides[0]!.shapes.push({ id: 'p1', kind: 'picture', name: 'Picture', x: 0, y: 0, w: 10, h: 10, media: 'm1' });
  return d;
};

describe('version pruning', () => {
  it('keeps the newest automatic versions per document and every named one', () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) => meta(`a${i}`, 'A', 1000 + i)),
      meta('n1', 'A', 500, 'Draft for review'),
      ...Array.from({ length: 3 }, (_, i) => meta(`b${i}`, 'B', 2000 + i)),
    ];
    const drop = planPrune(list, { autoPerDoc: 5, docs: 10 });
    expect(drop.sort()).toEqual(['a0', 'a1', 'a2']);
    expect(drop).not.toContain('n1');
  });

  it('drops documents beyond the document limit, oldest first', () => {
    const list = [meta('a', 'A', 1), meta('b', 'B', 5), meta('c', 'C', 3, 'kept name')];
    expect(planPrune(list, { autoPerDoc: 50, docs: 2 })).toEqual(['a']);
  });

  it('groups by day, newest first', () => {
    const now = Date.now();
    const g = byDay([meta('x', 'A', now - 2 * 86_400_000), meta('y', 'A', now), meta('z', 'A', now - 1000)]);
    expect(g[0]!.day).toBe('Today');
    expect(g[0]!.items.map((v) => v.id)).toEqual(['y', 'z']);
    expect(g).toHaveLength(2);
  });
});

describe('snapshots', () => {
  it('hashes content, not identity', () => {
    expect(hashBytes(new Uint8Array([1, 2, 3]))).toBe(hashBytes(new Uint8Array([1, 2, 3])));
    expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 4])));
  });

  it('stores media once across snapshots and brings it back', async () => {
    const be = new MemoryBackend();
    const d = withPicture([9, 8, 7, 6]);
    await saveVersion(be, { deck: d, doc: 'D', reason: 'auto' });
    d.slides[0]!.name = 'changed';
    const v2 = await saveVersion(be, { deck: d, doc: 'D', reason: 'auto' });
    expect(be.blobs.size).toBe(1);
    // Unused media is not stored.
    d.media.m2 = { id: 'm2', type: 'image/png', name: 'b.png', data: new Uint8Array([1]) };
    await saveVersion(be, { deck: d, doc: 'D', reason: 'auto' });
    expect(be.blobs.size).toBe(1);
    const back = await loadVersion(be, v2);
    expect(back.slides[0]!.name).toBe('changed');
    expect([...back.media.m1!.data]).toEqual([9, 8, 7, 6]);
  });

  it('sweeps media no remaining version uses', async () => {
    const be = new MemoryBackend();
    await saveVersion(be, { deck: withPicture([1, 1]), doc: 'D', reason: 'auto', at: 1 });
    for (let i = 0; i < 4; i++) await saveVersion(be, { deck: newDeck(), doc: 'D', reason: 'auto', at: 10 + i });
    expect(be.blobs.size).toBe(1);
    await prune(be, 'D', { autoPerDoc: 3, docs: 10 });
    expect(be.metas.size).toBe(3);
    expect(be.blobs.size).toBe(0);
  });
});

describe('history session', () => {
  const session = () => {
    const store = new FrameStore(newDeck());
    const h = new History(store, new MemoryBackend());
    h.loaded();
    return { store, h };
  };

  it('gives the document an id and snapshots only after a change, keeping the opened state first', async () => {
    const { store, h } = session();
    expect(store.deck.props.docId).toMatch(/^doc/);
    expect(await h.snapshot('auto')).toBeNull();
    store.change('Rename', () => { store.deck.slides[0]!.name = 'one'; });
    await h.snapshot('auto');
    const list = await h.list();
    expect(list.map((v) => v.reason)).toEqual(['auto', 'open']);
    expect(await h.snapshot('auto')).toBeNull();
  });

  it('names the current version without a duplicate when nothing changed', async () => {
    const { store, h } = session();
    store.change('Rename', () => { store.deck.slides[0]!.name = 'one'; });
    await h.snapshot('save');
    await h.nameCurrent('Final');
    const list = await h.list();
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe('Final');
  });

  it('restores a version as one undo step, keeping the document id', async () => {
    const { store, h } = session();
    const id = store.deck.props.docId;
    store.change('A', () => { store.deck.slides[0]!.name = 'A'; });
    const vA = (await h.snapshot('auto'))!;
    store.change('B', () => { store.deck.slides.push({ ...structuredClone(store.deck.slides[0]!), id: 'second', name: 'B' }); });
    expect(store.deck.slides).toHaveLength(2);
    expect(await h.restore(vA)).toBe(true);
    expect(store.deck.slides).toHaveLength(1);
    expect(store.deck.slides[0]!.name).toBe('A');
    expect(store.deck.props.docId).toBe(id);
    expect(store.undoLabel).toBe('Restore version');
    store.undo();
    expect(store.deck.slides).toHaveLength(2);
    // The state before restoring was kept too.
    expect((await h.list()).some((v) => v.reason === 'restore')).toBe(true);
  });

  it('a newly loaded document gets its own id', () => {
    const store = new FrameStore(newDeck());
    const h = new History(store, new MemoryBackend());
    const stop = h.start(60_000);
    const first = store.deck.props.docId;
    store.load(newDeck(), 'Other');
    expect(store.deck.props.docId).toBeTruthy();
    expect(store.deck.props.docId).not.toBe(first);
    stop();
  });
});
