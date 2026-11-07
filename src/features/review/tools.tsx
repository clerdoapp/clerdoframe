/** Tools tab: picture compression, clean-up, statistics, shortcuts reference and About. */
import { useMemo, useState } from 'react';
import { allCommands } from '../../app/commands';
import type { DialogProps } from '../../app/registry';
import { walkShapes, type Deck, type Id, type Picture } from '../../model/deck';
import { prettyKeys } from '../../ui/keys';
import { Check, Dialog, Select } from '../../ui/kit';
import { stats } from './check';

const fmtBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// ---------- Compress pictures ----------

const IMAGE = /^image\/(png|jpeg|jpg|webp|gif|bmp)$/i;

const decode = (data: Uint8Array, type: string): Promise<ImageBitmap | HTMLImageElement> => {
  const blob = new Blob([data as BlobPart], { type });
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(blob); });
};

const hasAlpha = (ctx: CanvasRenderingContext2D, w: number, h: number): boolean => {
  const step = Math.max(1, Math.floor((w * h) / 40000));
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4 * step) if (d[i]! < 250) return true;
  return false;
};

/** Re-encodes one picture: scaled so its longer side is at most `maxPx`, optionally cropped. */
export const reencode = async (data: Uint8Array, type: string, maxPx: number, quality: number, crop?: { l: number; t: number; r: number; b: number }): Promise<{ data: Uint8Array; type: string } | null> => {
  const img = await decode(data, type);
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width, ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const c = crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const sx = Math.max(0, c.l) * iw, sy = Math.max(0, c.t) * ih;
  const sw = Math.max(1, iw * (1 - Math.max(0, c.l) - Math.max(0, c.r))), sh = Math.max(1, ih * (1 - Math.max(0, c.t) - Math.max(0, c.b)));
  const k = Math.min(1, maxPx / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, 0, 0, w, h);
  const alpha = /png|gif|webp/i.test(type) && hasAlpha(ctx, w, h);
  const outType = alpha ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, outType, quality));
  if (!blob) return null;
  return { data: new Uint8Array(await blob.arrayBuffer()), type: outType };
};

const pictures = (deck: Deck, slides: number[] | null): Picture[] => {
  const out: Picture[] = [];
  deck.slides.forEach((s, i) => { if (!slides || slides.includes(i)) walkShapes(s.shapes, (x) => { if (x.kind === 'picture') out.push(x); }); });
  if (!slides) for (const m of deck.masters) for (const list of [m.shapes, ...m.layouts.map((l) => l.shapes)]) walkShapes(list, (x) => { if (x.kind === 'picture') out.push(x); });
  return out;
};

const RES: [string, string][] = [['2400', 'High quality (up to 2400 px)'], ['1600', 'Print (up to 1600 px)'], ['1280', 'Screen (up to 1280 px)'], ['800', 'Email (up to 800 px)']];

export const CompressDialog = ({ store, close, data }: DialogProps<{ crop?: boolean }>) => {
  const [res, setRes] = useState('1600');
  const [onlySel, setOnlySel] = useState(false);
  const [crop, setCrop] = useState(!!data?.crop);
  const [busy, setBusy] = useState(false);
  const selPics = store.selected().filter((x): x is Picture => x.kind === 'picture');
  const go = async () => {
    setBusy(true);
    const deck = store.deck;
    const list = onlySel && selPics.length ? selPics : pictures(deck, null);
    const jobs = new Map<string, { pics: Picture[]; crop?: Picture['crop'] }>();
    for (const p of list) {
      const m = deck.media[p.media];
      if (!m || !IMAGE.test(m.type)) continue;
      const hasCrop = crop && p.crop && (p.crop.l > 0 || p.crop.t > 0 || p.crop.r > 0 || p.crop.b > 0);
      const key = hasCrop ? `${p.id}` : p.media;
      const j = jobs.get(key) ?? { pics: [], ...(hasCrop ? { crop: p.crop } : {}) };
      j.pics.push(p); jobs.set(key, j);
    }
    let before = 0, after = 0;
    const results: { pics: Id[]; media: Id; crop: boolean }[] = [];
    const seen = new Set<string>();
    for (const [, j] of jobs) {
      const src = deck.media[j.pics[0]!.media]!;
      try {
        const out = await reencode(src.data, src.type, Number(res), 0.82, j.crop);
        if (!out) continue;
        if (!j.crop && out.data.length >= src.data.length * 0.97) continue;
        if (!seen.has(src.id)) { before += src.data.length; seen.add(src.id); }
        after += out.data.length;
        const id = store.addMedia(out.type, src.name.replace(/\.\w+$/, '') + (out.type === 'image/png' ? '.png' : '.jpg'), out.data);
        results.push({ pics: j.pics.map((p) => p.id), media: id, crop: !!j.crop });
      } catch { /* skip pictures the browser can't decode */ }
    }
    setBusy(false);
    if (!results.length) { store.notify('The pictures are already as small as these settings allow.'); close(); return; }
    store.tryChange(crop ? 'Delete cropped areas' : 'Compress pictures', () => {
      const ids = new Map(results.flatMap((r) => r.pics.map((p) => [p, r] as const)));
      const fix = (list: Parameters<typeof walkShapes>[0]) => walkShapes(list, (x) => { if (x.kind === 'picture') { const r = ids.get(x.id); if (r) { x.media = r.media; if (r.crop) x.crop = undefined; x.cutout = undefined; } } });
      for (const s of store.deck.slides) fix(s.shapes);
      for (const m of store.deck.masters) { fix(m.shapes); for (const l of m.layouts) fix(l.shapes); }
    });
    store.notify(`Saved ${fmtBytes(Math.max(0, before - after))} (${fmtBytes(before)} to ${fmtBytes(after)}). Unused originals go when you run Remove unused items or save.`);
    close();
  };
  return (
    <Dialog title={data?.crop ? 'Delete cropped areas' : 'Compress pictures'} close={close} okLabel={busy ? 'Working…' : 'Compress'} onOk={() => { if (!busy) void go(); return false; }}>
      <Check label="Apply only to the selected pictures" checked={onlySel && selPics.length > 0} onChange={setOnlySel} />
      <Check label="Delete cropped areas of pictures" checked={crop} onChange={setCrop} />
      <Select label="Resolution" value={res} options={RES} onChange={setRes} />
      <p className="muted small">Pictures are scaled down to the size you pick and saved as JPEG (PNG where they have see-through areas). Undo puts the originals back.</p>
    </Dialog>
  );
};

// ---------- Remove unused items ----------

export const unused = (deck: Deck): { media: Id[]; layouts: number; masters: number } => {
  const used = new Set<Id>();
  const add = (id?: Id) => { if (id) used.add(id); };
  const walk = (list: Parameters<typeof walkShapes>[0]) => walkShapes(list, (s) => {
    if (s.kind === 'picture') { add(s.media); add(s.cutout); }
    if (s.kind === 'media') { add(s.media); add(s.poster); }
    if (s.kind === 'ole' || s.kind === 'zoom') add(s.preview);
    if (s.kind === 'diagram') for (const n of s.nodes) add(n.media);
    if (s.kind === 'shape') { if (s.fill?.type === 'picture') add(s.fill.media); for (const p of s.text?.paras ?? []) if (p.style?.bullet?.type === 'picture') add(p.style.bullet.media); }
  });
  const bg = (b?: { fill: { type: string; media?: Id } }) => { if (b?.fill.type === 'picture') add(b.fill.media); };
  for (const s of deck.slides) { walk(s.shapes); bg(s.background); add(s.transition?.sound); for (const a of s.animations) add(a.sound); }
  for (const m of deck.masters) { walk(m.shapes); bg(m.background); for (const l of m.layouts) { walk(l.shapes); bg(l.background); } }
  const usedLayouts = new Set(deck.slides.map((s) => s.layout));
  const layouts = deck.masters.reduce((n, m) => n + (m.keep?.preserve === '1' ? 0 : m.layouts.filter((l) => !usedLayouts.has(l.id)).length), 0);
  const masters = deck.masters.filter((m, i) => i > 0 && m.keep?.preserve !== '1' && !m.layouts.some((l) => usedLayouts.has(l.id))).length;
  return { media: Object.keys(deck.media).filter((id) => !used.has(id)), layouts, masters };
};

export const CleanupDialog = ({ store, close }: DialogProps) => {
  const u = useMemo(() => unused(store.deck), [store]);
  const [media, setMedia] = useState(true);
  const [layouts, setLayouts] = useState(false);
  const size = u.media.reduce((n, id) => n + (store.deck.media[id]?.data.length ?? 0), 0);
  return (
    <Dialog title="Remove unused items" close={close} okLabel="Remove"
      onOk={() => {
        const usedLayouts = new Set(store.deck.slides.map((s) => s.layout));
        if (layouts && (u.layouts || u.masters)) store.tryChange('Remove unused layouts', () => {
          store.deck.masters = store.deck.masters.filter((m, i) => i === 0 || m.keep?.preserve === '1' || m.layouts.some((l) => usedLayouts.has(l.id)));
          for (const m of store.deck.masters) if (m.keep?.preserve !== '1') { const keep = m.layouts.filter((l) => usedLayouts.has(l.id)); m.layouts = keep.length ? keep : m.layouts.slice(0, 1); }
          store.masterSel = { master: 0, layout: -1 };
        });
        // Media is outside undo, so only items nothing points at are removed, after any layout change.
        if (media) { const now = unused(store.deck).media; for (const id of now) delete store.deck.media[id]; store.file.dirty = true; }
        store.notify('Unused items removed.');
      }}>
      <Check label={`Unused pictures and media (${u.media.length}, ${fmtBytes(size)})`} checked={media} onChange={setMedia} />
      <Check label={`Unused layouts (${u.layouts}) and masters (${u.masters})`} checked={layouts} onChange={setLayouts} />
      <p className="muted small">Preserved masters are kept. Removing media can't be undone, but nothing on any slide, layout or undo step that still exists uses it.</p>
    </Dialog>
  );
};

// ---------- Statistics ----------

export const StatsDialog = ({ store, close }: DialogProps) => {
  const st = stats(store.deck);
  const rows: [string, number | string][] = [
    ['Slides', st.slides], ['Hidden slides', st.hidden], ['Sections', st.sections], ['Words', st.words], ['Paragraphs', st.paragraphs],
    ['Characters (no spaces)', st.characters], ['Words in notes', st.notesWords], ['Pictures', st.pictures], ['Video and audio clips', st.media],
    ['Media size', fmtBytes(Object.values(store.deck.media).reduce((n, m) => n + m.data.length, 0))],
  ];
  return (
    <Dialog title="Presentation statistics" close={close} width={360}>
      <table className="rv-stats"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{typeof v === 'number' ? v.toLocaleString() : v}</td></tr>)}</tbody></table>
    </Dialog>
  );
};

// ---------- Shortcuts reference ----------

export const ShortcutsDialog = ({ close }: DialogProps) => {
  const [q, setQ] = useState('');
  const list = allCommands().filter((c) => c.keys || c.altKeys?.length).filter((c) => `${c.label} ${c.group ?? ''} ${c.keys ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(list.map((c) => c.group ?? 'Other'))].sort();
  return (
    <Dialog title="Keyboard shortcuts" close={close} wide>
      <input autoFocus placeholder="Search shortcuts" value={q} aria-label="Search shortcuts" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="rv-keys">
        {groups.map((g) => (
          <section key={g}>
            <h3>{g}</h3>
            {list.filter((c) => (c.group ?? 'Other') === g).sort((a, b) => a.label.localeCompare(b.label)).map((c) => (
              <div key={c.id} className="rv-key"><span>{c.label.replace(/…$/, '')}</span><span>{[c.keys!, ...(c.altKeys ?? [])].filter(Boolean).map((k) => <kbd key={k}>{prettyKeys(k)}</kbd>)}</span></div>
            ))}
          </section>
        ))}
        {!list.length && <p className="muted">No shortcuts match.</p>}
      </div>
      <p className="muted small">In a slide show: Right or Space next, Left previous, B black screen, W white screen, Esc end.</p>
    </Dialog>
  );
};

export const AboutDialog = ({ close }: DialogProps) => (
  <Dialog title="About ClerdoFrame" close={close} width={380}>
    <p><b>ClerdoFrame</b> {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''}</p>
    <p>A free, open-source presentation app by Clerdo. It works offline, opens and saves .pptx, and keeps your files on your device.</p>
    <p className="muted small">Licensed MIT or Apache-2.0. Bundled fonts are under the SIL Open Font License. Press Ctrl+K (Cmd+K on Mac) to search every command.</p>
    <p className="muted small">Help and source: https://clerdo.app</p>
  </Dialog>
);
