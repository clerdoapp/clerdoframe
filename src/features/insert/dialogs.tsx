import { useEffect, useMemo, useRef, useState } from 'react';
import { Check as CheckIcon, Globe, Mail, Presentation, Trash2, ArrowUp, ArrowDown, ImagePlus } from 'lucide-react';
import { registerDialog, type DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { uid, type AutoShape, type Hyperlink, type HeaderFooter, type Id, type Shape, type Slide } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { Check, Dialog, Field, NumberField, S, Select } from '../../ui/kit';
import { insertDateTime, insertSummaryZoom, insertTable, insertZooms, tableChange } from './commands';
import { SYMBOL_FONTS, SYMBOL_NAMES, SYMBOL_SETS } from './data';
import { applyHeaderFooter, DATE_FORMATS, formatDate, readHeaderFooter } from './headerFooter';
import { fit, loadImage, newPicture, pickFiles, readBytes } from './media';
import { splitCell } from './table';
import { applyRunStyle, insertText } from './textBridge';
import { WordArtGallery } from './wordart';
import { IconsDialog } from './icons';

// ---------- Insert table ----------

const TableDialog = ({ store, close }: DialogProps) => {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(4);
  return (
    <Dialog title="Insert table" close={close} okLabel="Insert" width={320} onOk={() => insertTable(store, rows, cols)}>
      <div className="grid2">
        <NumberField label="Columns" value={cols} min={1} max={75} onChange={setCols} />
        <NumberField label="Rows" value={rows} min={1} max={75} onChange={setRows} />
      </div>
    </Dialog>
  );
};

const SplitDialog = ({ store, close }: DialogProps) => {
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(2);
  return (
    <Dialog title="Split cells" close={close} okLabel="Split" width={320} onOk={() => {
      tableChange(store, 'Split cells', (t, rg) => { splitCell(t, rg.r1, rg.c1, Math.max(1, rows), Math.max(1, cols)); return { r1: rg.r1, c1: rg.c1, r2: rg.r1, c2: rg.c1 }; });
    }}>
      <div className="grid2">
        <NumberField label="Columns" value={cols} min={1} max={20} onChange={setCols} />
        <NumberField label="Rows" value={rows} min={1} max={20} onChange={setRows} />
      </div>
    </Dialog>
  );
};

// ---------- Links ----------

type LinkKind = 'web' | 'place' | 'email';
const SAFE_URL = /^(https:\/\/|mailto:)/i;

/** Normalises what the person typed into a safe link, or null. Only https: and mailto: are kept. */
export const cleanUrl = (raw: string, kind: 'web' | 'email'): string | null => {
  const t = raw.trim();
  if (!t) return null;
  if (kind === 'email') {
    const addr = t.replace(/^mailto:/i, '').split('?')[0]!;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? `mailto:${t.replace(/^mailto:/i, '')}` : null;
  }
  if (/^http:\/\//i.test(t)) return `https://${t.slice(7)}`;
  if (SAFE_URL.test(t)) return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  return `https://${t.replace(/^\/+/, '')}`;
};

const selectedText = (s: FrameStore): string => {
  const sel = window.getSelection?.()?.toString();
  if (sel && s.editing) return sel;
  return '';
};

/** Where the link goes: one entry per deck-internal destination. */
const PLACES: { id: NonNullable<Hyperlink['action']>; label: string }[] = [
  { id: 'first', label: 'First slide' }, { id: 'last', label: 'Last slide' }, { id: 'next', label: 'Next slide' }, { id: 'prev', label: 'Previous slide' },
];

const titleOf = (sl: Slide, i: number): string => {
  const t = sl.shapes.find((x) => x.kind === 'shape' && (x.ph?.type === 'title' || x.ph?.type === 'ctrTitle')) as AutoShape | undefined;
  const text = t?.text?.paras.map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim();
  return `${i + 1}. ${text || sl.name || 'Slide'}`;
};

/** The link currently on the selection, if any. */
const currentLink = (s: FrameStore): Hyperlink | undefined => {
  if (s.editing) {
    const sh = s.shape(s.editing.shape);
    if (sh?.kind === 'shape') for (const p of sh.text?.paras ?? []) for (const r of p.runs) if (r.style?.link) return r.style.link;
  }
  return s.selected()[0]?.link;
};

export const LinkDialog = ({ store, close }: DialogProps) => {
  const cur = currentLink(store);
  const inText = !!store.editing;
  const [kind, setKind] = useState<LinkKind>(cur?.url?.startsWith('mailto:') ? 'email' : cur?.action ? 'place' : 'web');
  const [url, setUrl] = useState(cur?.url && !cur.url.startsWith('mailto:') ? cur.url : '');
  const [email, setEmail] = useState(cur?.url?.startsWith('mailto:') ? cur.url.slice(7).split('?')[0]! : '');
  const [subject, setSubject] = useState(cur?.url?.startsWith('mailto:') ? decodeURIComponent(cur.url.split('?subject=')[1] ?? '') : '');
  const [place, setPlace] = useState<{ action: NonNullable<Hyperlink['action']>; slide?: Id } | null>(cur?.action ? { action: cur.action, ...(cur.slide ? { slide: cur.slide } : {}) } : null);
  const [tip, setTip] = useState(cur?.tooltip ?? '');
  const [display, setDisplay] = useState(selectedText(store));
  const [err, setErr] = useState('');

  const build = (): Hyperlink | null | false => {
    let link: Hyperlink;
    if (kind === 'web') { const u = cleanUrl(url, 'web'); if (!u) { setErr(url.trim() ? 'Use a web address that starts with https://' : 'Type a web address.'); return false; } link = { url: u }; }
    else if (kind === 'email') {
      const u = cleanUrl(email + (subject ? `?subject=${encodeURIComponent(subject)}` : ''), 'email');
      if (!u) { setErr('Type a valid email address.'); return false; }
      link = { url: u };
    } else { if (!place) { setErr('Pick a place in this presentation.'); return false; } link = { action: place.action, ...(place.slide ? { slide: place.slide } : {}) }; }
    if (tip.trim()) link.tooltip = tip.trim();
    return link;
  };

  const apply = (link: Hyperlink | null) => {
    if (inText) {
      if (link && display && display !== selectedText(store)) insertText(store, display);
      applyRunStyle(store, { link: link ?? undefined });
      if (!link) {
        // Removing: also clear explicit link styling left on the runs.
        const sh = store.shape(store.editing!.shape);
        if (sh?.kind === 'shape' && !selectedText(store)) store.tryChange('Remove link', () => { for (const p of sh.text?.paras ?? []) for (const r of p.runs) if (r.style?.link) delete r.style.link; });
      }
      return;
    }
    const shapes = store.selected();
    if (!shapes.length) return;
    store.tryChange(link ? 'Link' : 'Remove link', () => { for (const s of shapes) { if (link) s.link = link; else delete s.link; } });
  };

  return (
    <Dialog title={cur ? 'Edit link' : 'Insert link'} close={close} okLabel={cur ? 'Update' : 'Insert'} wide
      footer={cur ? <button onClick={() => { apply(null); close(); }}><Trash2 size={14} strokeWidth={S} /> Remove link</button> : undefined}
      onOk={() => { const l = build(); if (l === false) return false; apply(l); return true; }}>
      <div className="linkgrid">
        <div className="linkkinds" role="tablist" aria-label="Link to">
          {([['web', 'Web address', Globe], ['place', 'Place in this deck', Presentation], ['email', 'Email address', Mail]] as const).map(([k, l, I]) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setErr(''); }}><I size={16} strokeWidth={S} />{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {inText && <Field label="Text to show"><input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="Selected text" /></Field>}
          {kind === 'web' && <Field label="Address"><input autoFocus value={url} inputMode="url" placeholder="https://example.com" onChange={(e) => { setUrl(e.target.value); setErr(''); }} /></Field>}
          {kind === 'email' && (
            <>
              <Field label="Email address"><input autoFocus type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} /></Field>
              <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
            </>
          )}
          {kind === 'place' && (
            <div className="placelist" role="listbox" aria-label="Place in this presentation">
              {PLACES.map((p) => <button key={p.id} role="option" aria-selected={place?.action === p.id} className={place?.action === p.id ? 'on' : ''} onClick={() => setPlace({ action: p.id })}>{p.label}</button>)}
              <div className="grp">Slides</div>
              {store.deck.slides.map((sl, i) => (
                <button key={sl.id} role="option" aria-selected={place?.slide === sl.id} className={place?.slide === sl.id ? 'on' : ''} onClick={() => setPlace({ action: 'slide', slide: sl.id })}>{titleOf(sl, i)}</button>
              ))}
            </div>
          )}
          <Field label="Tooltip"><input value={tip} onChange={(e) => setTip(e.target.value)} placeholder="Shown when the pointer rests on the link" /></Field>
          {err && <div className="small" style={{ color: 'var(--accent)' }} role="alert">{err}</div>}
        </div>
      </div>
    </Dialog>
  );
};

// ---------- Action settings ----------

type ActKind = 'none' | 'link' | 'sound';
const ActionPanel = ({ store, link, onChange }: { store: FrameStore; link: Hyperlink | undefined; onChange: (l: Hyperlink | undefined) => void }) => {
  const kind: ActKind = !link ? 'none' : link.action || link.url ? 'link' : link.sound ? 'sound' : 'none';
  const target = link?.action === 'slide' ? `slide:${link.slide}` : link?.action ?? (link?.url ? 'url' : 'next');
  const pickSound = async () => {
    const [f] = await pickFiles('audio/*', false);
    if (!f) return;
    const id = store.addMedia(f.type || 'audio/wav', f.name, await readBytes(f));
    onChange({ ...(link ?? {}), sound: id });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="listbox" role="radiogroup">
        <label><input type="radio" checked={kind === 'none'} onChange={() => onChange(link?.sound ? { sound: link.sound } : undefined)} /> No action</label>
        <label><input type="radio" checked={kind === 'link'} onChange={() => onChange({ ...(link?.sound ? { sound: link.sound } : {}), action: 'next' })} /> Go to</label>
      </div>
      {kind === 'link' && (
        <Select label="Destination" value={target} onChange={(v) => {
          if (v === 'url') onChange({ ...link, action: undefined, slide: undefined, url: link?.url ?? 'https://' });
          else if (v.startsWith('slide:')) onChange({ ...link, url: undefined, action: 'slide', slide: v.slice(6) });
          else onChange({ ...link, url: undefined, slide: undefined, action: v as Hyperlink['action'] });
        }} options={[
          ['next', 'Next slide'], ['prev', 'Previous slide'], ['first', 'First slide'], ['last', 'Last slide'], ['end', 'End show'], ['url', 'Web address…'],
          ...store.deck.slides.map((sl, i) => [`slide:${sl.id}`, titleOf(sl, i)] as [string, string]),
        ]} />
      )}
      {kind === 'link' && link?.url !== undefined && !link.action && (
        <Field label="Web address"><input value={link.url} onChange={(e) => onChange({ ...link, url: e.target.value })} onBlur={(e) => onChange({ ...link, url: cleanUrl(e.target.value, 'web') ?? '' })} /></Field>
      )}
      <Check label="Play sound" checked={!!link?.sound} onChange={(v) => { if (v) void pickSound(); else { const n = { ...(link ?? {}) }; delete n.sound; onChange(Object.keys(n).length ? n : undefined); } }} />
      {link?.sound && <div className="muted small">{store.deck.media[link.sound]?.name ?? 'Sound'} <button className="tool" style={{ display: 'inline-flex' }} onClick={() => void pickSound()}>Change…</button></div>}
    </div>
  );
};

const ActionDialog = ({ store, close }: DialogProps) => {
  const first = store.selected()[0];
  const [tab, setTab] = useState<'click' | 'hover'>('click');
  const [click, setClick] = useState<Hyperlink | undefined>(first?.link);
  const [hover, setHover] = useState<Hyperlink | undefined>(first?.hoverLink);
  const valid = (l: Hyperlink | undefined) => (l?.url !== undefined && !l.action ? (cleanUrl(l.url, 'web') ? l : l.sound ? { sound: l.sound } : undefined) : l);
  return (
    <Dialog title="Action settings" close={close} width={420} onOk={() => {
      store.tryChange('Action settings', () => {
        for (const s of store.selected()) {
          const c = valid(click), h = valid(hover);
          if (c) s.link = c; else delete s.link;
          if (h) s.hoverLink = h; else delete s.hoverLink;
        }
      });
    }}>
      <div className="tabsrow" role="tablist">
        <button role="tab" aria-selected={tab === 'click'} className={tab === 'click' ? 'on' : ''} onClick={() => setTab('click')}>On click</button>
        <button role="tab" aria-selected={tab === 'hover'} className={tab === 'hover' ? 'on' : ''} onClick={() => setTab('hover')}>On hover</button>
      </div>
      {tab === 'click' ? <ActionPanel store={store} link={click} onChange={setClick} /> : <ActionPanel store={store} link={hover} onChange={setHover} />}
    </Dialog>
  );
};

// ---------- Header & footer ----------

const HeaderFooterDialog = ({ store, close, data }: DialogProps<{ focus?: string }>) => {
  const [tab, setTab] = useState<'slide' | 'notes'>('slide');
  const [hf, setHf] = useState<HeaderFooter>(() => ({ dateFormat: 'short', ...readHeaderFooter(store.deck, store.slide), ...(data?.focus === 'slideNumber' ? { slideNumber: true } : {}) }));
  const [nh, setNh] = useState(store.deck.headerFooter.notes ?? {});
  const fixed = hf.dateFixed !== undefined;
  const set = (p: Partial<HeaderFooter>) => setHf((h) => ({ ...h, ...p }));
  const apply = (all: boolean) => {
    store.tryChange(all ? 'Header & footer' : 'Header & footer (this slide)', () => {
      const stored: HeaderFooter = { ...hf, notes: nh };
      if (!fixed) delete stored.dateFixed;
      if (all) store.deck.headerFooter = stored; else store.deck.headerFooter.notes = nh;
      const slides = tab === 'notes' ? [] : all ? store.deck.slides : store.slideSel.map((i) => store.deck.slides[i]!).filter(Boolean);
      for (const sl of slides) applyHeaderFooter(store.deck, sl, stored);
    });
    close();
  };
  const preview = store.slide;
  const dateOpts: [string, string][] = DATE_FORMATS.map((f) => [f.id, f.label(new Date())]);
  return (
    <Dialog title="Header & footer" close={close} wide footer={tab === 'slide' ? <button onClick={() => apply(false)}>Apply</button> : undefined} okLabel="Apply to all" onOk={() => { apply(true); return false; }}>
      <div className="tabsrow" role="tablist">
        <button role="tab" aria-selected={tab === 'slide'} className={tab === 'slide' ? 'on' : ''} onClick={() => setTab('slide')}>Slide</button>
        <button role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>Notes and handouts</button>
      </div>
      {tab === 'slide' ? (
        <div className="dlgsplit">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Check label="Date and time" checked={!!hf.dateTime} onChange={(v) => set({ dateTime: v })} />
            {hf.dateTime && (
              <div style={{ paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="check"><input type="radio" checked={!fixed} onChange={() => set({ dateFixed: undefined })} /> Update automatically</label>
                {!fixed && <Select value={hf.dateFormat ?? 'short'} options={dateOpts} onChange={(v) => set({ dateFormat: v })} />}
                <label className="check"><input type="radio" checked={fixed} onChange={() => set({ dateFixed: formatDate(hf.dateFormat) })} /> Fixed</label>
                {fixed && <input value={hf.dateFixed} onChange={(e) => set({ dateFixed: e.target.value })} aria-label="Fixed date" />}
              </div>
            )}
            <Check label="Slide number" checked={!!hf.slideNumber} onChange={(v) => set({ slideNumber: v })} />
            <Check label="Footer" checked={!!hf.footer} onChange={(v) => set({ footer: v })} />
            {hf.footer && <input style={{ marginInlineStart: 22 }} value={hf.footerText ?? ''} onChange={(e) => set({ footerText: e.target.value })} aria-label="Footer text" placeholder="Footer text" />}
            <Check label="Don't show on title slide" checked={!!hf.hideOnTitle} onChange={(v) => set({ hideOnTitle: v })} />
          </div>
          <div>
            <div className="muted small" style={{ marginBottom: 4 }}>Preview</div>
            {preview && <HfPreview store={store} slide={preview} hf={hf} />}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Check label="Date and time" checked={!!nh.dateTime} onChange={(v) => setNh({ ...nh, dateTime: v })} />
          {nh.dateTime && <div style={{ paddingInlineStart: 22 }}><Select value={nh.dateFormat ?? 'short'} options={dateOpts} onChange={(v) => setNh({ ...nh, dateFormat: v })} /></div>}
          <Check label="Header" checked={!!nh.header} onChange={(v) => setNh({ ...nh, header: v })} />
          {nh.header && <input style={{ marginInlineStart: 22 }} value={nh.headerText ?? ''} onChange={(e) => setNh({ ...nh, headerText: e.target.value })} aria-label="Header text" />}
          <Check label="Page number" checked={!!nh.pageNumber} onChange={(v) => setNh({ ...nh, pageNumber: v })} />
          <Check label="Footer" checked={!!nh.footer} onChange={(v) => setNh({ ...nh, footer: v })} />
          {nh.footer && <input style={{ marginInlineStart: 22 }} value={nh.footerText ?? ''} onChange={(e) => setNh({ ...nh, footerText: e.target.value })} aria-label="Notes footer text" />}
        </div>
      )}
    </Dialog>
  );
};

const HfPreview = ({ store, slide, hf }: { store: FrameStore; slide: Slide; hf: HeaderFooter }) => {
  const copy = useMemo(() => {
    const c: Slide = structuredClone({ ...slide, shapes: slide.shapes });
    applyHeaderFooter(store.deck, c, hf);
    return c;
  }, [store.deck, slide, hf]);
  return <div className="hfprev"><SlideView deck={store.deck} slide={copy} width={300} slideNumber={store.cur + 1} /></div>;
};

// ---------- Date & time ----------

const DateTimeDialog = ({ store, close }: DialogProps) => {
  const [fmt, setFmt] = useState('short');
  const [auto, setAuto] = useState(true);
  return (
    <Dialog title="Date and time" close={close} okLabel="Insert" width={360} onOk={() => insertDateTime(store, fmt, auto)}>
      <div className="placelist" role="listbox" aria-label="Formats">
        {DATE_FORMATS.map((f) => <button key={f.id} role="option" aria-selected={fmt === f.id} className={fmt === f.id ? 'on' : ''} onClick={() => setFmt(f.id)} onDoubleClick={() => { insertDateTime(store, f.id, auto); close(); }}>{f.label(new Date())}</button>)}
      </div>
      <Check label="Update automatically" checked={auto} onChange={setAuto} />
    </Dialog>
  );
};

// ---------- Symbol ----------

const RECENT = 'clerdoframe.recentSymbols';
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT) ?? '[]') as string[]; } catch { return []; } };

const SymbolDialog = ({ store, close }: DialogProps) => {
  const [set, setSet] = useState(SYMBOL_SETS[0]!.id);
  const [font, setFont] = useState(SYMBOL_FONTS[0]!);
  const [pick, setPick] = useState<string>('©');
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const chars = useMemo(() => {
    const t = q.trim();
    if (!t) return SYMBOL_SETS.find((x) => x.id === set)!.chars;
    if (/^(u\+|0x)?[0-9a-f]{2,6}$/i.test(t)) { const n = parseInt(t.replace(/^(u\+|0x)/i, ''), 16); if (n > 31 && n < 0x110000) return [String.fromCodePoint(n)]; }
    const low = t.toLowerCase();
    return Object.entries(SYMBOL_NAMES).filter(([, n]) => n.toLowerCase().includes(low)).map(([c]) => c);
  }, [set, q]);
  const fontFamily = font === SYMBOL_FONTS[0] ? undefined : font;
  const insert = (c: string) => {
    const ok = store.editing || store.selected().some((x) => x.kind === 'shape' && x.text);
    if (ok) {
      insertText(store, c);
      if (fontFamily && !store.editing) applyRunStyle(store, { font: fontFamily });
    } else {
      store.notify('Click in text first, then insert the symbol.');
      return;
    }
    const next = [c, ...recent.filter((x) => x !== c)].slice(0, 20);
    setRecent(next);
    try { localStorage.setItem(RECENT, JSON.stringify(next)); } catch { /* storage off */ }
  };
  const code = pick.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
  return (
    <Dialog title="Symbol" close={close} wide okLabel="Insert" onOk={() => { insert(pick); return false; }}>
      <div className="rowx">
        <Select label="Font" value={font} options={SYMBOL_FONTS.map((f) => [f, f] as [string, string])} onChange={setFont} />
        <Select label="Subset" value={set} options={SYMBOL_SETS.map((x) => [x.id, x.name] as [string, string])} onChange={(v) => { setSet(v); setQ(''); }} />
        <Field label="Search or code"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. arrow or 2192" /></Field>
      </div>
      <div className="symgrid" role="grid" aria-label="Symbols" style={fontFamily ? { fontFamily } : undefined}>
        {chars.map((c) => <button key={c} className={pick === c ? 'on' : ''} title={`U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}${SYMBOL_NAMES[c] ? ` ${SYMBOL_NAMES[c]}` : ''}`} onClick={() => setPick(c)} onDoubleClick={() => insert(c)}>{c}</button>)}
        {!chars.length && <div className="muted small pad">No symbols match.</div>}
      </div>
      <div className="rowx">
        <div className="symbig" style={fontFamily ? { fontFamily } : undefined}>{pick}</div>
        <div className="small"><div><b>{SYMBOL_NAMES[pick] ?? 'Symbol'}</b></div><div className="muted">U+{code}</div></div>
      </div>
      <div className="cgtitle">Recently used</div>
      <div className="symrecent">{recent.length ? recent.map((c) => <button key={c} title={`U+${c.codePointAt(0)!.toString(16).toUpperCase()}`} onClick={() => setPick(c)} onDoubleClick={() => insert(c)}>{c}</button>) : <span className="muted small">None yet</span>}</div>
    </Dialog>
  );
};

// ---------- WordArt ----------

const WordArtDialog = ({ store, close }: DialogProps<{ transform?: boolean }>) => (
  <Dialog title="WordArt" close={close} width={340}><WordArtGallery store={store} onDone={() => { if (!store.selected().length) close(); }} /></Dialog>
);

// ---------- Photo album ----------

interface AlbumItem { id: string; file: File; url: string; caption: string }
const ALBUM_LAYOUTS: [string, string][] = [['fit', 'Fit to slide'], ['1', '1 picture'], ['2', '2 pictures'], ['4', '4 pictures'], ['1t', '1 picture with title'], ['2t', '2 pictures with title'], ['4t', '4 pictures with title']];
const FRAMES: [string, string][] = [['rect', 'Rectangle'], ['roundRect', 'Rounded rectangle'], ['ellipse', 'Oval'], ['snip2DiagRect', 'Snipped corners'], ['plaque', 'Plaque'], ['frame', 'Simple frame']];

const PhotoAlbumDialog = ({ store, close }: DialogProps) => {
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [layout, setLayout] = useState('fit');
  const [frame, setFrame] = useState('rect');
  const [captions, setCaptions] = useState(false);
  const [title, setTitle] = useState('Photo Album');
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { for (const u of urls.current) URL.revokeObjectURL(u); }, []);
  const add = async () => {
    const fs = await pickFiles('image/*', true);
    const next = fs.map((f) => { const url = URL.createObjectURL(f); urls.current.push(url); return { id: uid('a'), file: f, url, caption: f.name.replace(/\.[^.]+$/, '') }; });
    setItems((x) => [...x, ...next]);
  };
  const move = (i: number, d: number) => setItems((x) => { const n = [...x]; const [it] = n.splice(i, 1); n.splice(Math.max(0, Math.min(n.length, i + d)), 0, it!); return n; });
  const create = async () => {
    if (!items.length) return;
    setBusy(true);
    const loaded = [];
    for (const it of items) { const l = await loadImage(store, it.file); if (l) loaded.push({ ...l, caption: it.caption }); }
    const per = layout === 'fit' || layout.startsWith('1') ? 1 : layout.startsWith('2') ? 2 : 4;
    const withTitle = layout.endsWith('t');
    const W = store.deck.w, H = store.deck.h;
    const master = store.slide ? store.masterOf(store.slide).master : store.deck.masters[0]!;
    const blank = master.layouts.find((l) => l.type === 'blank') ?? master.layouts[0]!;
    const titleOnly = master.layouts.find((l) => l.type === 'titleOnly') ?? blank;
    const titleSlide = master.layouts.find((l) => l.type === 'title') ?? blank;
    const slides: Slide[] = [];
    const mkTitle = (lay: typeof blank, text: string, sub?: string): Shape[] => lay.shapes.filter((p) => p.ph && ['title', 'ctrTitle', 'subTitle'].includes(p.ph.type)).map((p) => ({
      ...structuredClone(p), id: uid('s'),
      ...(p.kind === 'shape' ? { text: { ...(p.text ?? { paras: [] }), paras: [{ ...(p.text?.paras[0] ?? {}), runs: [{ text: p.ph!.type === 'subTitle' ? sub ?? '' : text }] }] } } : {}),
    } as Shape));
    slides.push({ id: uid('p'), layout: titleSlide.id, shapes: mkTitle(titleSlide, title, `${loaded.length} pictures`), notes: { paras: [{ runs: [] }] }, animations: [] });
    for (let i = 0; i < loaded.length; i += per) {
      const group = loaded.slice(i, i + per);
      const lay = withTitle ? titleOnly : blank;
      const top = withTitle ? H * 0.24 : layout === 'fit' ? 0 : H * 0.06;
      const area = { x: layout === 'fit' ? 0 : W * 0.06, y: top, w: layout === 'fit' ? W : W * 0.88, h: (layout === 'fit' ? H : H * 0.94) - top - (captions ? 30 : 0) };
      const cols = per === 1 ? 1 : 2, rows = per === 4 ? 2 : 1, gap = 20;
      const cw = (area.w - gap * (cols - 1)) / cols, ch = (area.h - gap * (rows - 1) - (captions && per > 1 ? 30 * (rows - 1) : 0)) / rows;
      const shapes: Shape[] = withTitle ? mkTitle(lay, `Pictures ${i + 1}-${i + group.length}`) : [];
      group.forEach((l, k) => {
        const c = k % cols, r = Math.floor(k / cols);
        const f = fit(l.w, l.h, cw, ch, true);
        const cx = area.x + c * (cw + gap) + (cw - f.w) / 2, cy = area.y + r * (ch + gap + (captions ? 30 : 0)) + (ch - f.h) / 2;
        const pic = newPicture(l.id, cx, cy, f.w, f.h, l.name);
        if (frame !== 'rect' && frame !== 'frame') pic.geom = frame;
        if (frame === 'frame') pic.line = { fill: { type: 'solid', color: '#FFFFFF' }, width: 6 };
        if (layout !== 'fit') pic.effects = { shadow: { kind: 'outer', color: '#000000', blur: 8, dist: 3, angle: 45, alpha: 0.35 } };
        shapes.push(pic);
        if (captions && l.caption) {
          shapes.push({ id: uid('s'), kind: 'shape', geom: 'rect', name: `Caption ${k + 1}`, x: cx, y: cy + f.h + 4, w: f.w, h: 26, textbox: true, fill: { type: 'none' },
            text: { paras: [{ runs: [{ text: l.caption, style: { size: 14 } }], style: { align: 'ctr' } }], wrap: true, autofit: 'resize' } });
        }
      });
      slides.push({ id: uid('p'), layout: lay.id, shapes, notes: { paras: [{ runs: [] }] }, animations: [], ...(layout === 'fit' ? { background: { fill: { type: 'solid', color: '#000000' } } } : {}) });
    }
    store.tryChange('Photo album', () => {
      const at = store.cur + 1;
      store.deck.slides.splice(at, 0, ...slides);
      store.cur = at; store.slideSel = [at]; store.sel = [];
    });
    setBusy(false);
    close();
  };
  return (
    <Dialog title="Photo album" close={close} wide okLabel={busy ? 'Creating…' : 'Create'} onOk={() => { if (!busy && items.length) void create(); return false; }}>
      <div className="dlgsplit">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="tool" onClick={() => void add()}><ImagePlus size={16} strokeWidth={S} /> Add pictures…</button>
          <div className="albumlist" aria-label="Pictures in album">
            {items.map((it, i) => (
              <div key={it.id} className="albumrow">
                <img src={it.url} alt="" />
                {captions ? <input className="grow" value={it.caption} aria-label="Caption" onChange={(e) => setItems((x) => x.map((y) => (y.id === it.id ? { ...y, caption: e.target.value } : y)))} /> : <span className="grow">{it.file.name}</span>}
                <button className="ico sm" aria-label="Move up" disabled={!i} onClick={() => move(i, -1)}><ArrowUp size={14} strokeWidth={S} /></button>
                <button className="ico sm" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} strokeWidth={S} /></button>
                <button className="ico sm" aria-label="Remove" onClick={() => setItems((x) => x.filter((y) => y.id !== it.id))}><Trash2 size={14} strokeWidth={S} /></button>
              </div>
            ))}
            {!items.length && <div className="muted small pad">No pictures yet.</div>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Field label="Album title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Select label="Picture layout" value={layout} options={ALBUM_LAYOUTS} onChange={setLayout} />
          <Select label="Frame shape" value={frame} options={FRAMES} onChange={setFrame} />
          <Check label="Captions below pictures" checked={captions} onChange={setCaptions} />
          <div className="muted small">{items.length ? `${items.length} picture${items.length === 1 ? '' : 's'} on ${Math.ceil(items.length / (layout === 'fit' || layout.startsWith('1') ? 1 : layout.startsWith('2') ? 2 : 4))} slides, plus a title slide.` : 'Pick pictures to make one slide per group.'}</div>
        </div>
      </div>
    </Dialog>
  );
};

// ---------- Zoom ----------

const ZoomDialog = ({ store, close, data }: DialogProps<{ kind: 'slide' | 'section' | 'summary' }>) => {
  const kind = data?.kind ?? 'slide';
  const deck = store.deck;
  const sections = deck.sections;
  const [picked, setPicked] = useState<Id[]>(() => (kind === 'summary' ? sections.map((x) => x.first) : []));
  const toggle = (id: Id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const items: { id: Id; slide: Slide; label: string }[] = kind === 'section'
    ? sections.map((sec) => ({ id: sec.id, slide: deck.slides.find((x) => x.id === sec.first)!, label: sec.name })).filter((x) => x.slide)
    : deck.slides.map((sl, i) => ({ id: sl.id, slide: sl, label: titleOf(sl, i) }));
  const titles = { slide: 'Insert slide zoom', section: 'Insert section zoom', summary: 'Insert summary zoom' };
  const hint = { slide: 'Pick the slides to link to.', section: 'Pick the sections to link to.', summary: 'Pick the first slide of each part. Each becomes a section on the summary slide.' };
  return (
    <Dialog title={titles[kind]} close={close} wide okLabel="Insert" onOk={() => {
      if (!picked.length) return false;
      if (kind === 'summary') insertSummaryZoom(store, picked); else insertZooms(store, picked, kind);
      return true;
    }}>
      <div className="muted small">{hint[kind]}</div>
      {kind === 'section' && !sections.length ? <div className="pad muted">This presentation has no sections yet. Add sections from the slide list first.</div> : (
        <div className="thumbpick" role="listbox" aria-multiselectable>
          {items.map((it) => (
            <button key={it.id} role="option" aria-selected={picked.includes(it.id)} className={picked.includes(it.id) ? 'on' : ''} onClick={() => toggle(it.id)}>
              <SlideView deck={deck} slide={it.slide} width={150} />
              <span>{it.label}</span>
              {picked.includes(it.id) && <span className="chk"><CheckIcon size={13} strokeWidth={2.4} /></span>}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
};


export const registerInsertDialogs = (): void => {
  registerDialog('insert.table', TableDialog);
  registerDialog('table.split', SplitDialog);
  registerDialog('link', LinkDialog);
  registerDialog('insert.link', LinkDialog);
  registerDialog('insert.action', ActionDialog);
  registerDialog('insert.headerFooter', HeaderFooterDialog);
  registerDialog('insert.dateTime', DateTimeDialog);
  registerDialog('insert.symbol', SymbolDialog);
  registerDialog('insert.wordart', WordArtDialog);
  registerDialog('insert.photoAlbum', PhotoAlbumDialog);
  registerDialog('insert.zoom', ZoomDialog);
  registerDialog('insert.icons', IconsDialog);
};
