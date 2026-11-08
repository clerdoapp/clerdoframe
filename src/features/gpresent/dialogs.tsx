import { useEffect, useState } from 'react';
import { Copy, ExternalLink, FileDown, FolderOpen } from 'lucide-react';
import { desktop, download, PPTX_TYPE, saveFile } from '../../app/files';
import type { DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { Deck, Master } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { Check, Dialog, Field, S, Select } from '../../ui/kit';
import { accessibleDoc, accessibleHtml, blockHtml, deckTitle, embedCode, type PublishOptions } from '../../formats/html';
import { readPptx, writePptx } from '../../formats/pptx';
import { layoutDiagram } from '../diagrams/layout';
import { applyMaster, importMaster } from './theme';
import { historyOf } from './history';
import { publishOptions } from './publish';

const safeName = (n: string): string => n.replace(/[\\/:*?"<>|]/g, '').trim();

export const pptxBytes = (deck: Deck): Uint8Array => writePptx(deck, { diagramShapes: (d) => (deck.masters[0] ? layoutDiagram(d, deck.masters[0].theme) : []) });

// ---------- Publish to the web ----------

export const PublishDialog = ({ store, close }: DialogProps) => {
  const [o, setO] = useState<PublishOptions>({ ...publishOptions(store.deck) });
  const [copied, setCopied] = useState(false);
  const name = `${safeName(store.file.name) || 'Presentation'}.html`;
  const code = embedCode(name, o, deckTitle(store.deck));
  const ratio = store.deck.h / store.deck.w;
  const sizes: [string, string][] = [['640', 'Small (640 px)'], ['960', 'Medium (960 px)'], ['1280', 'Large (1280 px)'], ['1920', 'Extra large (1920 px)']];
  const set = (p: Partial<PublishOptions>) => setO({ ...o, ...p });
  const go = () => {
    Object.assign(publishOptions(store.deck), o);
    store.notify('Making the web page…', 60_000);
    void saveFile(store, true, 'html').finally(() => { if (store.toast === 'Making the web page…') { store.toast = null; store.emit(); } });
  };
  const copy = () => { void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => undefined); };
  return (
    <Dialog title="Publish to the web" close={close} okLabel="Save web page" onOk={go}>
      <p className="muted small">Saves one HTML file that plays the slides in any browser, also offline. Speaker notes are left out.</p>
      <Select label="Advance slides" value={String(o.interval) as '0'} options={[['0', 'On click only'], ['1', 'Every second'], ['2', 'Every 2 seconds'], ['3', 'Every 3 seconds'], ['5', 'Every 5 seconds'], ['10', 'Every 10 seconds'], ['15', 'Every 15 seconds'], ['30', 'Every 30 seconds'], ['60', 'Every minute']]}
        onChange={(v) => set({ interval: +v, ...(+v === 0 ? { autoStart: false } : {}) })} />
      {o.interval > 0 && <Check label="Start playing when the page opens" checked={o.autoStart} onChange={(v) => set({ autoStart: v })} />}
      <Check label="Loop: start again after the last slide" checked={o.loop} onChange={(v) => set({ loop: v })} />
      <Check label="Show controls" checked={o.controls} onChange={(v) => set({ controls: v })} />
      <div className="rowx">
        <Select label="Size" value={String(o.width) as '960'} options={sizes.some(([v]) => +v === o.width) ? sizes : [[String(o.width) as '960', `${o.width} px`], ...sizes]} onChange={(v) => set({ width: +v, height: Math.round(+v * ratio) })} />
        <label className="lbl"><span>Start on slide</span><input type="number" min={1} max={store.deck.slides.length} value={o.start} onChange={(e) => set({ start: Math.max(1, Math.min(store.deck.slides.length, +e.target.value || 1)) })} /></label>
      </div>
      <Field label="Embed code">
        <textarea className="gp-code" readOnly value={code} rows={3} onFocus={(e) => e.target.select()} />
      </Field>
      <p className="muted small">To embed the slides in a site, upload the saved file there and paste this code into the page, with src set to the file's address.</p>
      <div className="rowx"><button className="tool" onClick={copy}><Copy size={16} strokeWidth={S} /><span>{copied ? 'Copied' : 'Copy embed code'}</span></button></div>
    </Dialog>
  );
};

// ---------- Accessible view ----------

const openHtml = (html: string): void => {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank', 'noopener');
  if (!w) download('Accessible view.html', new Blob([html], { type: 'text/html' }));
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const AccessibleView = ({ store }: { store: FrameStore }) => {
  const [notes, setNotes] = useState(false);
  const arts = accessibleDoc(store.deck);
  const html = () => accessibleHtml(store.deck, { notes });
  return (
    <div className="gp-a11y">
      <div className="rowx">
        <Check label="Speaker notes" checked={notes} onChange={setNotes} />
        <div className="grow" />
        <button className="ico sm" aria-label="Open in a new window" title="Open in a new window" onClick={() => openHtml(html())}><ExternalLink size={16} strokeWidth={S} /></button>
        <button className="ico sm" aria-label="Export as HTML" title="Export as HTML" onClick={() => download(`${safeName(store.file.name) || 'Presentation'} (accessible).html`, new Blob([html()], { type: 'text/html' }))}><FileDown size={16} strokeWidth={S} /></button>
      </div>
      <div className="gp-a11y-doc" lang={store.deck.props.language ?? undefined}>
        {arts.map((a) => (
          <article key={a.n} aria-labelledby={`gpa${a.n}`} className={a.n === store.cur + 1 ? 'on' : ''}>
            <h3 id={`gpa${a.n}`}><button className="rv-link" onClick={() => store.goto(a.n - 1)}><span className="muted">Slide {a.n}{a.hidden ? ' (hidden)' : ''}.</span> {a.title}</button></h3>
            {/* Text is escaped by blockHtml. */}
            <div dangerouslySetInnerHTML={{ __html: a.blocks.map(blockHtml).join('') }} />
            {notes && a.notes && <aside aria-label="Speaker notes"><b>Notes</b>{a.notes.split('\n').filter(Boolean).map((t, i) => <p key={i}>{t}</p>)}</aside>}
          </article>
        ))}
      </div>
    </div>
  );
};

export const openAccessibleWindow = (store: FrameStore): void => openHtml(accessibleHtml(store.deck, { notes: false }));

// ---------- Import theme ----------

export const ImportThemeDialog = ({ store, close }: DialogProps<{ name: string; deck: Deck }>) => {
  const [src, setSrc] = useState<{ name: string; deck: Deck } | null>(null);
  const [pick, setPick] = useState<Set<number>>(new Set([0]));
  const [apply, setApply] = useState<'none' | 'all' | 'selected'>('all');
  const choose = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pptx,.potx,.pptm,.ppsx';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const d = readPptx(new Uint8Array(await f.arrayBuffer())).deck;
        setSrc({ name: f.name, deck: d });
        setPick(new Set([0]));
      } catch { store.notify('That file could not be read.'); }
    };
    input.click();
  };
  useEffect(() => { if (!src) choose(); }, []);
  const sel = store.slideSel.length ? store.slideSel : [store.cur];
  const ok = () => {
    if (!src || !pick.size) return false;
    const masters = [...pick].sort((a, b) => a - b).map((i) => src.deck.masters[i]).filter((m): m is Master => !!m);
    let first: Master | null = null;
    const done = store.tryChange('Import theme', () => {
      for (const m of masters) { const nm = importMaster(store.deck, src.deck, m, (t, n, d) => store.addMedia(t, n, d)); first ??= nm; }
      if (first && apply !== 'none') {
        const slides = apply === 'all' ? store.deck.slides : sel.map((i) => store.deck.slides[i]!).filter(Boolean);
        applyMaster(store.deck, first, slides);
      }
    });
    if (done) store.notify(`${masters.length === 1 ? 'Design' : `${masters.length} designs`} added. Find ${masters.length === 1 ? 'it' : 'them'} in the layout list and the slide master.`);
    return done;
  };
  return (
    <Dialog title="Import theme" close={close} okLabel="Import" onOk={ok} wide>
      <div className="rowx">
        <button className="tool" onClick={choose}><FolderOpen size={16} strokeWidth={S} /><span>{src ? 'Choose another file…' : 'Choose a file…'}</span></button>
        {src && <span className="muted small">{src.name}</span>}
      </div>
      {!src && <p className="muted small">Pick a presentation or template. Its designs are added as new slide masters with their theme, background and layouts.</p>}
      {src && (
        <>
          <div className="gp-masters" role="group" aria-label="Designs in the file">
            {src.deck.masters.map((m, i) => (
              <button key={m.id} className={`gp-master${pick.has(i) ? ' on' : ''}`} aria-pressed={pick.has(i)}
                onClick={() => { const n = new Set(pick); if (n.has(i)) n.delete(i); else n.add(i); setPick(n); }}>
                <SlideView deck={src.deck} master={m} layout={m.layouts.find((l) => l.type === 'title') ?? m.layouts[0]} width={220} mode="thumb" />
                <span className="gp-mname">{m.name || m.theme.name || `Design ${i + 1}`}</span>
                <span className="gp-layouts">
                  {m.layouts.slice(0, 6).map((l) => <SlideView key={l.id} deck={src.deck} master={m} layout={l} width={60} mode="thumb" />)}
                </span>
                <span className="muted small">{m.layouts.length} layout{m.layouts.length === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
          <Select label="Apply the first chosen design to" value={apply} options={[['none', 'No slides (just add it)'], ['all', 'All slides'], ['selected', `Selected slides (${sel.length})`]]} onChange={setApply} />
        </>
      )}
    </Dialog>
  );
};

// ---------- Make a copy ----------

/** Saves a copy under a new name; the current document stays open. */
export const saveCopy = async (store: FrameStore, name: string, deck: Deck = store.deck): Promise<void> => {
  const n = safeName(name) || 'Presentation';
  const data = pptxBytes(deck);
  const file = `${n}.pptx`;
  try {
    if (desktop) {
      const r = desktop.saveAs ? await desktop.saveAs(file, data, 'pptx') : await desktop.save(null, file, data, 'pptx');
      if (r) store.notify(`Saved a copy as ${r.name}`);
      return;
    }
    download(file, new Blob([data as BlobPart], { type: PPTX_TYPE }));
    store.notify(`Saved a copy as ${file}`);
  } catch (e) { store.notify(e instanceof Error ? e.message : 'The copy could not be saved.'); }
};

export const MakeCopyDialog = ({ store, close, data }: DialogProps<{ deck?: Deck; name?: string }>) => {
  const [name, setName] = useState(data?.name ?? `Copy of ${store.file.name || 'Presentation1'}`);
  return (
    <Dialog title="Make a copy" close={close} okLabel="Save copy" onOk={() => { if (!safeName(name)) return false; void saveCopy(store, name, data?.deck); return true; }}>
      <Field label="Name of the copy"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} /></Field>
      <p className="muted small">This presentation stays open.</p>
    </Dialog>
  );
};

// ---------- Name version ----------

export const NameVersionDialog = ({ store, close }: DialogProps) => {
  const [name, setName] = useState('');
  const h = historyOf(store);
  return (
    <Dialog title="Name this version" close={close} okLabel="Save" onOk={() => {
      const n = name.trim().slice(0, 120);
      if (!n) return false;
      if (!h.be) { store.notify('Version history needs browser storage, which is not available here.'); return true; }
      void h.nameCurrent(n).then((v) => { if (v) store.notify(`Saved version "${n}".`); }).catch(() => store.notify('The version could not be saved. Storage may be full.'));
      return true;
    }}>
      <Field label="Name"><input autoFocus value={name} maxLength={120} placeholder="For example: Sent for review" onChange={(e) => setName(e.target.value)} /></Field>
      <p className="muted small">Named versions are kept until you delete them. Find them in Version history.</p>
    </Dialog>
  );
};
