import { useMemo, useState, type ReactNode } from 'react';
import {
  ClipboardCopy, Copy, FileDown, FilePlus2, FileSearch, FolderOpen, Info, Lock, Printer, Save, Sparkles, Trash2,
} from 'lucide-react';
import { command, openDialog, run } from '../../app/commands';
import { download, newPresentation, openFile, saveFile } from '../../app/files';
import { fileFormats, type DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { SLIDE_SIZES, type Deck } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { Check, Dialog, Field, S, Select } from '../../ui/kit';
import { readPptx } from '../../formats/pptx';
import { exportOptions } from '../../formats/register';
import { EXAMPLES } from './examples';
import { inspect, recentFiles, removeInspected, reuseSlides, type InspectChoice } from './ops';
import { printDeck, type PrintOptions } from './print';
import { DESIGNS, templateDeck } from './templates';

const I = (Icon: typeof Save) => <Icon size={16} strokeWidth={S} />;

const Act = ({ icon, label, onClick, disabled }: { icon: typeof Save; label: string; onClick: () => void; disabled?: boolean }) => (
  <button className="tool" disabled={disabled} onClick={onClick}>{I(icon)}<span>{label}</span></button>
);

// ---------- New ----------

const thumbs = new Map<string, Deck>();
const cached = (key: string, make: () => Deck): Deck => { let d = thumbs.get(key); if (!d) { d = make(); thumbs.set(key, d); } return d; };

const Tile = ({ deck, label, onPick }: { deck: Deck; label: string; onPick: () => void }) => (
  <button className="ftile" onClick={onPick} aria-label={label} title={label}>
    <SlideView deck={deck} slide={deck.slides[0]} width={128} mode="thumb" />
    <span>{label}</span>
  </button>
);

export const NewSection = ({ store }: { store: FrameStore }) => {
  const [all, setAll] = useState(false);
  const designs = all ? DESIGNS : DESIGNS.slice(0, 6);
  const start = (d: Deck) => newPresentation(store, d);
  return (
    <>
      <div className="ftiles">
        <Tile deck={cached('blank', () => templateDeck({ ...DESIGNS[0]!, master: () => [], title: undefined, theme: store.deck.masters[0]!.theme, name: 'Blank' }))} label="Blank" onPick={() => newPresentation(store)} />
        {designs.map((d) => <Tile key={d.name} deck={cached(d.name, () => templateDeck(d))} label={d.name} onPick={() => start(templateDeck(d))} />)}
      </div>
      <button className="tool" onClick={() => setAll(!all)}>{all ? 'Fewer templates' : `All templates (${DESIGNS.length})`}</button>
      <h4 className="fsub">Examples</h4>
      <div className="ftiles">
        {EXAMPLES.map((e) => <Tile key={e.id} deck={cached(`ex-${e.id}`, e.build)} label={e.name} onPick={() => start(e.build())} />)}
      </div>
    </>
  );
};

// ---------- Open ----------

export const OpenSection = ({ store }: { store: FrameStore }) => {
  const recent = recentFiles();
  return (
    <div className="toollist">
      <Act icon={FolderOpen} label="Open a file…" onClick={() => void openFile(store)} />
      {recent.length > 0 && <h4 className="fsub">Recent</h4>}
      {recent.map((r) => <div key={r.name} className="frecent" title={new Date(r.at).toLocaleString()}>{r.name}</div>)}
      {recent.length > 0 && <p className="muted small">Recent files are listed by name. Use Open to pick one again.</p>}
    </div>
  );
};

// ---------- Save and export ----------

export const SaveSection = ({ store }: { store: FrameStore }) => (
  <div className="toollist">
    <Act icon={Save} label="Save" onClick={() => void saveFile(store)} />
    <Act icon={Copy} label="Save a copy…" onClick={() => void saveFile(store, true)} />
    <Act icon={FilePlus2} label="Save as template…" onClick={() => run(store, 'file.saveAsTemplate')} />
    <Act icon={FileDown} label="Export…" onClick={() => openDialog(store, 'file.export')} />
    <Act icon={FileDown} label="Export as PDF…" onClick={() => run(store, 'file.exportPdf')} />
  </div>
);

export const PrintShareSection = ({ store }: { store: FrameStore }) => (
  <div className="toollist">
    <Act icon={Printer} label="Print…" onClick={() => run(store, 'file.print')} />
    <Act icon={ClipboardCopy} label="Copy slide as image" onClick={() => void copySlideImage(store)} />
  </div>
);

export const copySlideImage = async (store: FrameStore): Promise<void> => {
  try {
    const { renderSlideToCanvas, canvasBytes } = await import('../../formats/raster');
    const c = await renderSlideToCanvas(store.deck, store.cur, 1920);
    const png = await canvasBytes(c, 'image/png');
    const blob = new Blob([png as BlobPart], { type: 'image/png' });
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      store.notify('Slide copied as an image.');
    } else {
      download(`Slide ${store.cur + 1}.png`, blob);
    }
  } catch (e) { store.notify(e instanceof Error ? e.message : 'The slide could not be copied.'); }
};

const EXPORTS: { id: string; group: string }[] = [
  { id: 'pptx', group: 'Presentation' }, { id: 'potx', group: 'Presentation' }, { id: 'ppsx', group: 'Presentation' }, { id: 'odp', group: 'Presentation' },
  { id: 'pdf', group: 'Document' }, { id: 'html', group: 'Document' }, { id: 'rtf', group: 'Document' }, { id: 'txt', group: 'Document' },
  { id: 'png', group: 'Picture' }, { id: 'jpeg', group: 'Picture' }, { id: 'pngAll', group: 'Picture' }, { id: 'jpegAll', group: 'Picture' }, { id: 'svg', group: 'Picture' },
  { id: 'gif', group: 'Motion' }, { id: 'webm', group: 'Motion' },
];

/** Runs an export: writes the file and saves it with the browser or desktop save. */
export const runExport = async (store: FrameStore, id: string): Promise<void> => {
  const f = fileFormats().find((x) => x.id === id);
  if (!f?.write) { store.notify('That format is not available.'); return; }
  store.ext.exporting = f.label;
  store.notify(`Making ${f.label}…`, 60_000);
  try { await saveFile(store, true, id); } finally { store.ext.exporting = null; store.toast = null; store.emit(); }
};

export const ExportDialog = ({ store, data, close }: DialogProps<string>) => {
  const [id, setId] = useState(data ?? 'pdf');
  const [pdf, setPdf] = useState({ ...exportOptions.pdf });
  const [img, setImg] = useState({ ...exportOptions.image });
  const [mo, setMo] = useState({ ...exportOptions.motion });
  const fmts = fileFormats().filter((f) => f.write);
  const label = (fid: string) => fmts.find((f) => f.id === fid)?.label ?? fid;
  const ok = () => {
    exportOptions.pdf = pdf; exportOptions.image = img; exportOptions.motion = mo;
    void runExport(store, id);
  };
  const n = store.deck.slides.length;
  return (
    <Dialog title="Export" close={close} onOk={ok} okLabel="Export" wide>
      <div className="fexport">
        <div className="flist" role="listbox" aria-label="Formats">
          {['Presentation', 'Document', 'Picture', 'Motion'].map((g) => (
            <div key={g}>
              <h4 className="fsub">{g}</h4>
              {EXPORTS.filter((e) => e.group === g && fmts.some((f) => f.id === e.id)).map((e) => (
                <button key={e.id} role="option" aria-selected={id === e.id} className={`tool${id === e.id ? ' on' : ''}`} onClick={() => setId(e.id)}>{label(e.id)}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="fopts">
          {id === 'pdf' && <PdfOptions o={pdf} n={n} onChange={setPdf} />}
          {['png', 'jpeg', 'pngAll', 'jpegAll'].includes(id) && (
            <Select label="Width" value={String(img.width) as '1920'} options={[['1280', '1280 px'], ['1920', '1920 px (Full HD)'], ['2560', '2560 px'], ['3840', '3840 px (4K)']]} onChange={(v) => setImg({ ...img, width: +v })} />
          )}
          {['gif', 'webm'].includes(id) && (
            <>
              <Select label="Size" value={String(mo.width) as '1280'} options={id === 'gif' ? [['480', 'Small (480 px)'], ['640', 'Medium (640 px)'], ['800', 'Large (800 px)']] : [['854', '480p'], ['1280', '720p'], ['1920', '1080p'], ['3840', '4K']]} onChange={(v) => setMo({ ...mo, width: +v })} />
              <label className="lbl"><span>Seconds per slide</span><input type="number" min={1} max={60} value={mo.seconds} onChange={(e) => setMo({ ...mo, seconds: Math.max(1, +e.target.value || 5) })} /></label>
              <Check label="Use recorded timings where set" checked={mo.useTimings} onChange={(v) => setMo({ ...mo, useTimings: v })} />
              <p className="muted small">Slides change with a cross-fade. Recording plays in real time, so a video takes as long as the show.</p>
            </>
          )}
          {id === 'potx' && <p className="muted small">Saves the design and slides as a template to start new presentations from.</p>}
          {id === 'ppsx' && <p className="muted small">Opens straight into the slide show.</p>}
          {id === 'odp' && <p className="muted small">Keeps slides, text, shapes, tables and pictures. Animations and charts are left out.</p>}
          {id === 'svg' && <p className="muted small">Saves the current slide as a vector picture.</p>}
          {['rtf', 'txt'].includes(id) && <p className="muted small">Slide titles with their body text, for use in a document.</p>}
        </div>
      </div>
    </Dialog>
  );
};

const PdfOptions = ({ o, n, onChange }: { o: typeof exportOptions.pdf; n: number; onChange: (v: typeof exportOptions.pdf) => void }) => (
  <>
    <Select label="Pages" value={o.kind} options={[['slides', 'Slides'], ['notes', 'Notes pages'], ['handouts', 'Handouts'], ['outline', 'Outline']]} onChange={(v) => onChange({ ...o, kind: v })} />
    {o.kind === 'handouts' && <Select label="Slides per page" value={String(o.perPage ?? 6) as '6'} options={[['1', '1'], ['2', '2'], ['3', '3 with lines'], ['4', '4'], ['6', '6'], ['9', '9']]} onChange={(v) => onChange({ ...o, perPage: +v as 6 })} />}
    <div className="rowx">
      <label className="lbl"><span>From slide</span><input type="number" min={1} max={n} value={o.from ?? 1} onChange={(e) => onChange({ ...o, from: +e.target.value || 1 })} /></label>
      <label className="lbl"><span>To slide</span><input type="number" min={1} max={n} value={o.to ?? n} onChange={(e) => onChange({ ...o, to: +e.target.value || n })} /></label>
    </div>
    <Check label="Include hidden slides" checked={!!o.hidden} onChange={(v) => onChange({ ...o, hidden: v })} />
    <Check label="Frame slides" checked={!!o.frame} onChange={(v) => onChange({ ...o, frame: v })} />
    <Check label="Grayscale" checked={!!o.grayscale} onChange={(v) => onChange({ ...o, grayscale: v })} />
    <Select label="Quality" value={String(o.dpi ?? 150) as '150'} options={[['96', 'Small file'], ['150', 'Standard'], ['220', 'High']]} onChange={(v) => onChange({ ...o, dpi: +v })} />
  </>
);

// ---------- Print ----------

export const PrintDialog = ({ store, close }: DialogProps) => {
  const n = store.deck.slides.length;
  const [o, setO] = useState<PrintOptions>({ kind: 'slides', from: 1, to: n, hidden: false, perPage: 6, frame: false, color: 'color' });
  const [busy, setBusy] = useState(false);
  const go = () => {
    setBusy(true);
    void printDeck(store.deck, o).catch((e: unknown) => store.notify(e instanceof Error ? e.message : 'Printing failed.')).finally(() => { setBusy(false); close(); });
    return false;
  };
  return (
    <Dialog title="Print" close={close} onOk={go} okLabel={busy ? 'Preparing…' : 'Print'}>
      <Select label="Print" value={o.kind} options={[['slides', 'Slides'], ['notes', 'Notes pages'], ['handouts', 'Handouts'], ['outline', 'Outline']]} onChange={(v) => setO({ ...o, kind: v })} />
      {o.kind === 'handouts' && <Select label="Slides per page" value={String(o.perPage) as '6'} options={[['1', '1'], ['2', '2'], ['3', '3 with lines'], ['4', '4'], ['6', '6'], ['9', '9']]} onChange={(v) => setO({ ...o, perPage: +v as 6 })} />}
      <div className="rowx">
        <label className="lbl"><span>From slide</span><input type="number" min={1} max={n} value={o.from} onChange={(e) => setO({ ...o, from: +e.target.value || 1 })} /></label>
        <label className="lbl"><span>To slide</span><input type="number" min={1} max={n} value={o.to} onChange={(e) => setO({ ...o, to: +e.target.value || n })} /></label>
        <button className="tool" onClick={() => setO({ ...o, from: store.cur + 1, to: store.cur + 1 })}>This slide</button>
      </div>
      <Select label="Color" value={o.color} options={[['color', 'Color'], ['gray', 'Grayscale'], ['bw', 'Black and white']]} onChange={(v) => setO({ ...o, color: v })} />
      <Check label="Print hidden slides" checked={!!o.hidden} onChange={(v) => setO({ ...o, hidden: v })} />
      <Check label="Frame slides" checked={!!o.frame} onChange={(v) => setO({ ...o, frame: v })} />
    </Dialog>
  );
};

// ---------- Info ----------

const Prop = ({ label, value, onChange, area }: { label: string; value: string | undefined; onChange: (v: string) => void; area?: boolean }) => {
  const [v, setV] = useState(value ?? '');
  const commit = () => { if (v !== (value ?? '')) onChange(v); };
  return <Field label={label}>{area ? <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} /> : <input value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />}</Field>;
};

export const PropertiesDialog = ({ store, close }: DialogProps) => {
  const p = store.deck.props;
  const set = (k: keyof typeof p) => (v: string) => store.tryChange('Properties', () => { store.deck.props = { ...store.deck.props, [k]: v || undefined }; });
  return (
    <Dialog title="Properties" close={close}>
      <Prop label="Title" value={p.title} onChange={set('title')} />
      <Prop label="Author" value={p.author} onChange={set('author')} />
      <Prop label="Subject" value={p.subject} onChange={set('subject')} />
      <Prop label="Tags" value={p.keywords} onChange={set('keywords')} />
      <Prop label="Category" value={p.category} onChange={set('category')} />
      <Prop label="Company" value={p.company} onChange={set('company')} />
      <Prop label="Comments" value={p.description} onChange={set('description')} area />
    </Dialog>
  );
};

export const InfoSection = ({ store }: { store: FrameStore }) => {
  const d = store.deck;
  const size = Object.values(SLIDE_SIZES).find((s) => s.w === d.w && s.h === d.h)?.label ?? `${Math.round(d.w)} x ${Math.round(d.h)} px`;
  const mediaBytes = Object.values(d.media).reduce((a, m) => a + m.data.length, 0);
  const row = (k: string, v: ReactNode) => <div className="finfo"><span className="muted">{k}</span><span>{v}</span></div>;
  return (
    <>
      {row('Title', d.props.title || 'None')}
      {row('Author', d.props.author || 'None')}
      {row('Slides', `${d.slides.length}${d.slides.some((s) => s.hidden) ? ` (${d.slides.filter((s) => s.hidden).length} hidden)` : ''}`)}
      {row('Slide size', size)}
      {row('Media', mediaBytes ? `${(mediaBytes / 1048576).toFixed(1)} MB` : 'None')}
      {d.props.modified && row('Changed', new Date(d.props.modified).toLocaleString())}
      <div className="toollist">
        <Act icon={Info} label="Properties…" onClick={() => run(store, 'file.properties')} />
        <button className={`tool${d.final ? ' on' : ''}`} aria-pressed={!!d.final} onClick={() => run(store, 'file.markFinal')}>{I(Lock)}<span>{d.final ? 'Marked as final' : 'Mark as final'}</span></button>
        <Act icon={FileSearch} label="Check accessibility" disabled={!command('review.accessibility')} onClick={() => run(store, 'review.accessibility')} />
        <Act icon={Trash2} label="Inspect and clean up…" onClick={() => run(store, 'file.inspect')} />
      </div>
      {mediaBytes > 20 * 1048576 && <p className="muted small">Pictures and media make this file large. Smaller pictures make it quicker to share.</p>}
    </>
  );
};

export const InspectDialog = ({ store, close }: DialogProps) => {
  const r = useMemo(() => inspect(store.deck), [store.deck]);
  const [c, setC] = useState<InspectChoice>({ comments: r.comments > 0, hidden: false, offSlide: r.offSlide > 0, notes: false, personal: r.personal });
  const allHidden = r.hidden > 0 && r.hidden === store.deck.slides.length;
  const ok = () => { store.tryChange('Clean up presentation', () => removeInspected(store.deck, c)); store.notify('Done.'); };
  return (
    <Dialog title="Inspect and clean up" close={close} onOk={ok} okLabel="Remove">
      <p className="muted small">Choose what to remove before sharing. You can undo this.</p>
      <Check label={`Comments (${r.comments})`} checked={!!c.comments} onChange={(v) => setC({ ...c, comments: v })} />
      <Check label={`Hidden slides (${r.hidden})${allHidden ? ' — all slides are hidden' : ''}`} checked={!!c.hidden && !allHidden} onChange={(v) => setC({ ...c, hidden: v })} />
      <Check label={`Content off the slide (${r.offSlide})`} checked={!!c.offSlide} onChange={(v) => setC({ ...c, offSlide: v })} />
      <Check label={`Speaker notes (${r.notes} slides)`} checked={!!c.notes} onChange={(v) => setC({ ...c, notes: v })} />
      <Check label="Author, company and comment names" checked={!!c.personal} onChange={(v) => setC({ ...c, personal: v })} />
    </Dialog>
  );
};

// ---------- Options and About ----------

const pref = (k: string, d: string) => { try { return localStorage.getItem(`clerdoframe.${k}`) ?? d; } catch { return d; } };
const setPref = (k: string, v: string) => { try { localStorage.setItem(`clerdoframe.${k}`, v); } catch { /* storage off */ } };

export const OptionsSection = ({ store }: { store: FrameStore }) => {
  const [size, setSize] = useState(pref('defaultSize', 'wide'));
  const [spell, setSpell] = useState(pref('spellcheck', '1') === '1');
  return (
    <>
      <Select label="Interface" value={store.view.theme} options={[['system', 'Match the system'], ['light', 'Light'], ['dark', 'Dark']]}
        onChange={(v) => {
          // 'view.theme' flips light and dark; set the opposite first so it lands on the choice.
          if (v === 'system') { store.view.theme = 'system'; setPref('theme', 'system'); store.emit(); return; }
          store.view.theme = v === 'dark' ? 'light' : 'dark';
          run(store, 'view.theme');
        }} />
      <Select label="Size of new presentations" value={size as 'wide'} options={Object.entries(SLIDE_SIZES).map(([k, s]) => [k as 'wide', s.label])} onChange={(v) => { setSize(v); setPref('defaultSize', v); }} />
      <Check label="Check spelling as I type" checked={spell} onChange={(v) => { setSpell(v); setPref('spellcheck', v ? '1' : '0'); store.ext.spellcheck = v; store.emit(); }} />
      <p className="muted small">{store.file.path ? 'Saving writes to the file you opened.' : 'Unsaved work is kept in this browser until you save it.'}</p>
    </>
  );
};

export const AboutSection = () => (
  <div className="fabout">
    <p><b>ClerdoFrame</b> {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''}</p>
    <p className="muted small">Free and open source under the MIT or Apache 2.0 license.</p>
    <a className="tool" href="https://github.com/clerdoapp/clerdoframe" target="_blank" rel="noopener noreferrer">{I(Sparkles)}<span>Source code</span></a>
  </div>
);

// ---------- Reuse slides ----------

export const ReuseDialog = ({ store, close }: DialogProps) => {
  const [src, setSrc] = useState<{ name: string; deck: Deck } | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [keep, setKeep] = useState(false);
  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pptx,.pptm,.ppsx,.potx';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try { const deck = readPptx(new Uint8Array(await f.arrayBuffer())).deck; setSrc({ name: f.name, deck }); setSel([]); } catch (e) { store.notify(e instanceof Error ? e.message : 'The file could not be opened.'); }
    };
    input.click();
  };
  const insert = (idx: number[]) => {
    if (!src || !idx.length) return;
    store.tryChange('Reuse slides', () => {
      const slides = reuseSlides(store.deck, src.deck, idx, keep);
      store.deck.slides.splice(store.cur + 1, 0, ...slides);
      store.cur += 1;
      store.slideSel = slides.map((_, k) => store.cur + k);
    });
  };
  const toggle = (i: number) => setSel(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort((a, b) => a - b));
  return (
    <Dialog title="Reuse slides" close={close} wide onOk={() => { insert(sel); }} okLabel={sel.length ? `Insert ${sel.length}` : 'Insert'}
      footer={src ? <button onClick={() => { insert(src.deck.slides.map((_, i) => i)); close(); }}>Insert all</button> : undefined}>
      <div className="rowx">
        <button className="tool" onClick={pick}>{I(FolderOpen)}<span>{src ? src.name : 'Choose a presentation…'}</span></button>
        <Check label="Keep source formatting" checked={keep} onChange={setKeep} />
      </div>
      {src && (
        <div className="ftiles reuse">
          {src.deck.slides.map((s, i) => (
            <button key={s.id} className={`ftile${sel.includes(i) ? ' on' : ''}`} aria-pressed={sel.includes(i)} onClick={() => toggle(i)}>
              <SlideView deck={src.deck} slide={s} width={150} mode="thumb" />
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
};

