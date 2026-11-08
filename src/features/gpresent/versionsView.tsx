import { useEffect, useState, useSyncExternalStore } from 'react';
import { Copy, FilePlus2, History as HistoryIcon, Pencil, RotateCcw, Tag, X } from 'lucide-react';
import { openDialog } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import type { Deck } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { S } from '../../ui/kit';
import { historyOf } from './history';
import { byDay, type VersionMeta } from './versions';

const REASON: Record<VersionMeta['reason'], string> = { auto: 'Automatic', save: 'Saved', open: 'Opened', restore: 'Before restoring', named: '' };
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const versionsOpen = (s: FrameStore): boolean => !!s.ext.gpVersions;
export const openVersions = (s: FrameStore, on = true): void => { s.ext.gpVersions = on || undefined; s.menu = null; s.emit(); };

export const VersionsView = ({ store }: { store: FrameStore }) => {
  if (!versionsOpen(store)) return null;
  return <VersionsInner store={store} />;
};

const VersionsInner = ({ store }: { store: FrameStore }) => {
  const h = historyOf(store);
  const hv = useSyncExternalStore(h.subscribe, h.getVersion);
  const [list, setList] = useState<VersionMeta[] | null>(null);
  const [sel, setSel] = useState<VersionMeta | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [slide, setSlide] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => openVersions(store, false);

  useEffect(() => {
    let live = true;
    void h.list().then((l) => { if (!live) return; setList(l); setSel((cur) => (cur && l.find((v) => v.id === cur.id)) || l[0] || null); }).catch(() => setList([]));
    return () => { live = false; };
  }, [h, hv]);
  useEffect(() => {
    if (!sel) { setDeck(null); return; }
    let live = true;
    setDeck(null);
    void h.load(sel).then((d) => { if (live) { setDeck(d); setSlide(0); } }).catch(() => { if (live) store.notify('This version could not be read.'); });
    return () => { live = false; };
  }, [h, sel?.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !store.dialog) { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });

  const restore = async () => {
    if (!sel) return;
    setBusy(true);
    try { if (await h.restore(sel)) { store.notify('Version restored. Undo brings back what you had.'); close(); } } catch { store.notify('This version could not be restored.'); } finally { setBusy(false); }
  };
  const openAsNew = () => {
    if (!deck || !sel) return;
    if (store.file.dirty && !confirm('Open this version as a new presentation? Unsaved changes in the current one will be lost.')) return;
    const d: Deck = { ...structuredClone({ ...deck, media: {} }), media: deck.media, props: { ...deck.props, docId: undefined } };
    store.load(d, `${store.file.name || 'Presentation'} (${sel.name ?? new Date(sel.at).toLocaleString()})`.replace(/[\\/:*?"<>|]/g, '-'));
    store.file.dirty = true;
    close();
  };

  const groups = byDay(list ?? []);
  const cur = deck?.slides[slide];
  return (
    <div className="gp-versions" role="dialog" aria-modal="true" aria-label="Version history">
      <header className="gp-vhead">
        <HistoryIcon size={18} strokeWidth={S} />
        <h2>Version history</h2>
        <span className="muted small gp-vfile">{store.file.name}</span>
        <div className="grow" />
        <button className="tool" onClick={() => openDialog(store, 'gp.nameVersion')}><Tag size={16} strokeWidth={S} /><span>Name current version</span></button>
        <button className="ico" aria-label="Close" title="Close" onClick={close}><X size={18} strokeWidth={S} /></button>
      </header>
      <div className="gp-vbody">
        <nav className="gp-vlist" aria-label="Versions">
          {!h.be && <p className="muted small">Version history needs browser storage, which is not available here.</p>}
          {list && !list.length && h.be && <p className="muted small">No versions yet. ClerdoFrame keeps a version every few minutes while you edit, and each time you save.</p>}
          {groups.map((g) => (
            <section key={g.day}>
              <h3 className="gp-vday">{g.day}</h3>
              {g.items.map((v) => (
                <div key={v.id} className={`gp-vitem${sel?.id === v.id ? ' on' : ''}`}>
                  {renaming === v.id ? (
                    <input autoFocus defaultValue={v.name ?? ''} aria-label="Version name" maxLength={120} placeholder="Version name"
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { void h.rename(v, (e.target as HTMLInputElement).value); setRenaming(null); } if (e.key === 'Escape') setRenaming(null); }}
                      onBlur={(e) => { void h.rename(v, e.target.value); setRenaming(null); }} />
                  ) : (
                    <button className="gp-vpick" aria-current={sel?.id === v.id} onClick={() => setSel(v)}>
                      <b>{time(v.at)}</b>
                      <span className={v.name ? 'gp-vname' : 'muted'}>{v.name ?? REASON[v.reason]}</span>
                      <span className="muted small">{v.slides} slide{v.slides === 1 ? '' : 's'}{v.title ? ` · ${v.title}` : ''}</span>
                    </button>
                  )}
                  {renaming !== v.id && <button className="ico sm" aria-label="Name this version" title="Name this version" onClick={() => setRenaming(v.id)}><Pencil size={14} strokeWidth={S} /></button>}
                </div>
              ))}
            </section>
          ))}
        </nav>
        <section className="gp-vpreview" aria-label="Preview">
          {sel && (
            <div className="gp-vbar">
              <span><b>{sel.name ?? REASON[sel.reason]}</b> <span className="muted">{new Date(sel.at).toLocaleString()}</span></span>
              <div className="grow" />
              <button className="primary" disabled={!deck || busy} onClick={() => void restore()}><RotateCcw size={15} strokeWidth={S} /> Restore this version</button>
              <button className="tool" disabled={!deck} onClick={() => deck && openDialog(store, 'gp.makeCopy', { deck, name: `${store.file.name || 'Presentation'} (${sel.name ?? time(sel.at).replace(':', '.')})` })}><Copy size={16} strokeWidth={S} /><span>Download a copy</span></button>
              <button className="tool" disabled={!deck} onClick={openAsNew}><FilePlus2 size={16} strokeWidth={S} /><span>Open as new</span></button>
            </div>
          )}
          {deck && cur && (
            <>
              <div className="gp-vbig"><SlideView deck={deck} slide={cur} mode="thumb" style={{ width: '100%', height: 'auto' }} /></div>
              <div className="gp-vthumbs" role="listbox" aria-label="Slides in this version">
                {deck.slides.map((s, i) => (
                  <button key={s.id} role="option" aria-selected={i === slide} className={`gp-vthumb${i === slide ? ' on' : ''}`} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`}>
                    <SlideView deck={deck} slide={s} width={150} mode="thumb" />
                    <span>{i + 1}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {sel && !deck && <p className="muted">Loading…</p>}
        </section>
      </div>
    </div>
  );
};
