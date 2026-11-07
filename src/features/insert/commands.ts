import { command, openDialog, registerCommands, run, type Command } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import { uid, walkShapes, type Id, type Picture, type Shape, type Table, type Zoom } from '../../model/deck';
import { addShape, newTextBox } from '../shapes/tools';
import { WORDART_STYLES } from './data';
import { formatDate } from './headerFooter';
import {
  AUDIO_TYPES, fit, IMAGE_TYPES, loadImage, makeMedia, newPicture, pickFiles, placeShapes, readBytes, record, typeOf, VIDEO_TYPES,
} from './media';
import {
  anchorOf, applyTableStyle, deleteCols, deleteRows, distributeCols, distributeRows, expandRange, fullRange, insertCol, insertRow, mergeCells,
  newTable, normRange, stepCell, unmerge, type CellRange,
} from './table';
import { insertText } from './textBridge';

export const editable = (s: FrameStore): boolean => s.view.mode === 'normal' || s.view.mode === 'master';
const onSlide = (s: FrameStore): boolean => s.view.mode === 'normal' && !!s.slide;

// ---------- Pictures ----------

/** An empty picture (or content) placeholder on the slide that a picture can go into. */
const emptyPicturePlaceholder = (s: FrameStore): Shape | undefined => {
  const sel = s.one();
  const ok = (x: Shape | null | undefined) => !!x && x.kind === 'shape' && !!x.ph && ['pic', 'obj', 'body'].includes(x.ph.type) && (x.ph.type === 'pic' || !x.text?.paras.some((p) => p.runs.some((r) => r.text)));
  if (ok(sel)) return sel!;
  return s.shapes().find((x) => x.kind === 'shape' && x.ph?.type === 'pic' && ok(x));
};

/** Puts pictures on the slide: into an empty picture placeholder when there is one, else centred and fitted. */
export const insertPictures = async (s: FrameStore, files: (File | Blob)[], names?: string[]): Promise<Id[]> => {
  const loaded = [];
  for (const [i, f] of files.entries()) {
    const l = await loadImage(s, f, names?.[i] ?? (f as File).name ?? 'Picture');
    if (l) loaded.push(l);
  }
  if (!loaded.length) return [];
  const out: Shape[] = [];
  const ph = loaded.length === 1 ? emptyPicturePlaceholder(s) : undefined;
  let replaced: Shape | undefined;
  loaded.forEach((l, i) => {
    if (ph && i === 0) {
      // Cover the placeholder (crop to fill), keeping its position and the placeholder link.
      const k = Math.max(ph.w / l.w, ph.h / l.h);
      const cw = (l.w * k - ph.w) / (l.w * k) / 2, ch = (l.h * k - ph.h) / (l.h * k) / 2;
      const p: Picture = { ...newPicture(l.id, ph.x, ph.y, ph.w, ph.h, l.name), ph: ph.ph, crop: { l: cw, r: cw, t: ch, b: ch } };
      replaced = ph;
      out.push(p);
      return;
    }
    const f = fit(l.w, l.h, s.deck.w * 0.8, s.deck.h * 0.8);
    const off = i * 24;
    out.push(newPicture(l.id, (s.deck.w - f.w) / 2 + off, (s.deck.h - f.h) / 2 + off, f.w, f.h, l.name));
  });
  s.tryChange(out.length > 1 ? 'Insert pictures' : 'Insert picture', () => {
    const list = s.shapes();
    if (replaced) {
      const i = list.findIndex((x) => x.id === replaced!.id);
      if (i >= 0) list.splice(i, 1, out[0]!); else list.push(out[0]!);
      list.push(...out.slice(1));
    } else list.push(...out);
    s.sel = out.map((x) => x.id);
    s.editing = null;
  });
  return out.map((x) => x.id);
};

const insertMediaFiles = async (s: FrameStore, files: File[]): Promise<void> => {
  const shapes: Shape[] = [];
  for (const f of files) {
    const m = await makeMedia(s, await readBytes(f), typeOf(f), f.name);
    if (m) shapes.push(m);
  }
  placeShapes(s, shapes.length > 1 ? 'Insert media' : shapes[0]?.kind === 'media' && shapes[0].mediaType === 'audio' ? 'Insert audio' : 'Insert video', shapes);
};

/** Drops and pasted files: pictures, video, audio, and presentations to reuse slides from. */
export const insertFiles = async (s: FrameStore, files: File[]): Promise<void> => {
  const imgs = files.filter((f) => IMAGE_TYPES.test(typeOf(f)));
  const media = files.filter((f) => VIDEO_TYPES.test(typeOf(f)) || AUDIO_TYPES.test(typeOf(f)));
  const decks = files.filter((f) => /\.(pptx|potx|ppsx|odp|pptm)$/i.test(f.name));
  const other = files.length - imgs.length - media.length - decks.length;
  if (imgs.length) await insertPictures(s, imgs);
  if (media.length) await insertMediaFiles(s, media);
  if (decks.length) run(s, 'insert.reuseSlides', decks);
  if (other) s.notify(other === 1 ? 'That kind of file cannot be inserted.' : `${other} files could not be inserted.`);
};

// ---------- Screenshots and recordings ----------

const canCapture = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
const canRecordAudio = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

const screenshot = async (s: FrameStore): Promise<void> => {
  if (!canCapture()) { s.notify('Screen capture is not available here.'); return; }
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); } catch { return; }
  try {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.srcObject = stream;
    await v.play();
    await new Promise((r) => setTimeout(r, 250));
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (blob) await insertPictures(s, [blob], ['Screenshot.png']);
  } finally { for (const t of stream.getTracks()) t.stop(); }
};

interface Recording { kind: 'audio' | 'screen'; started: number; stop: () => Promise<Blob>; type: string }
export const recording = (s: FrameStore): Recording | null => (s.ext.insertRecording as Recording | undefined) ?? null;

const startRecording = async (s: FrameStore, kind: 'audio' | 'screen'): Promise<void> => {
  if (recording(s)) return;
  try {
    let stream: MediaStream;
    if (kind === 'audio') {
      if (!canRecordAudio()) { s.notify('Recording is not available here.'); return; }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } else {
      if (!canCapture() || typeof MediaRecorder === 'undefined') { s.notify('Screen recording is not available here.'); return; }
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    }
    const r = record(stream, kind === 'audio' ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'] : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']);
    // Ending the share from the browser's own control also ends the recording.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (recording(s)) void stopRecording(s); });
    s.ext.insertRecording = { kind, started: Date.now(), ...r } satisfies Recording;
    s.emit();
  } catch {
    s.notify(kind === 'audio' ? 'The microphone could not be used.' : 'Screen recording was cancelled.');
  }
};

const stopRecording = async (s: FrameStore, keep = true): Promise<void> => {
  const r = recording(s);
  if (!r) return;
  delete s.ext.insertRecording;
  s.emit();
  const blob = await r.stop();
  if (!keep || !blob.size) return;
  const type = blob.type || r.type.split(';')[0]!;
  const ext = type.includes('mp4') ? (r.kind === 'audio' ? 'm4a' : 'mp4') : 'webm';
  const m = await makeMedia(s, await readBytes(blob), type, `${r.kind === 'audio' ? 'Recorded audio' : 'Screen recording'}.${ext}`);
  if (m) placeShapes(s, r.kind === 'audio' ? 'Record audio' : 'Screen recording', [m]);
};

// ---------- Tables ----------

export interface TableSel { table: Id; r1: number; c1: number; r2: number; c2: number }

/** The selected table, if one is selected or being edited. */
export const activeTable = (s: FrameStore): Table | null => {
  const id = s.editing?.shape ?? (s.sel.length === 1 ? s.sel[0] : undefined);
  const t = id ? s.shape(id) : null;
  return t?.kind === 'table' ? t : null;
};

/** The selected cell range (whole table when none). */
export const tableRange = (s: FrameStore, t: Table): CellRange => {
  const ts = s.ext.tableSel as TableSel | undefined;
  if (ts && ts.table === t.id) return expandRange(t, ts);
  const c = s.editing?.shape === t.id ? s.editing.cell : undefined;
  if (c) {
    const a = anchorOf(t, c.r, c.c);
    const cell = t.rows[a.r]?.cells[a.c];
    return { r1: a.r, c1: a.c, r2: a.r + (cell?.rowSpan ?? 1) - 1, c2: a.c + (cell?.gridSpan ?? 1) - 1 };
  }
  return fullRange(t);
};

export const setTableSel = (s: FrameStore, t: Table, rg: CellRange | null): void => {
  if (rg) s.ext.tableSel = { table: t.id, ...normRange(rg) } satisfies TableSel; else delete s.ext.tableSel;
  s.emit();
};

const hasRange = (s: FrameStore): boolean => {
  const t = activeTable(s);
  return !!t && (!!(s.ext.tableSel as TableSel | undefined) || !!s.editing?.cell);
};

/** Runs a change on the active table and keeps the selection valid afterwards. */
export const tableChange = (s: FrameStore, label: string, fn: (t: Table, rg: CellRange) => void | CellRange | null): void => {
  const t = activeTable(s);
  if (!t) return;
  const rg = tableRange(s, t);
  let next: void | CellRange | null;
  s.tryChange(label, () => {
    const live = s.shape(t.id);
    if (live?.kind === 'table') next = fn(live, rg);
  });
  const live = s.shape(t.id);
  if (live?.kind !== 'table') { delete s.ext.tableSel; s.emit(); return; }
  if (next !== undefined) {
    if (next === null) delete s.ext.tableSel;
    else s.ext.tableSel = { table: live.id, ...normRange({ r1: Math.min(next.r1, live.rows.length - 1), c1: Math.min(next.c1, live.cols.length - 1), r2: Math.min(next.r2, live.rows.length - 1), c2: Math.min(next.c2, live.cols.length - 1) }) };
    if (s.editing?.shape === live.id && s.editing.cell) {
      const n = normRange(next ?? { r1: 0, c1: 0, r2: 0, c2: 0 });
      s.editing = { shape: live.id, cell: anchorOf(live, Math.min(n.r1, live.rows.length - 1), Math.min(n.c1, live.cols.length - 1)) };
    }
  }
  s.emit();
};

/** Places a new table centred on the slide, sized from the slide width. */
export const insertTable = (s: FrameStore, rows: number, cols: number, box?: { x: number; y: number; w: number; h: number }): void => {
  rows = Math.max(1, Math.min(75, Math.round(rows)));
  cols = Math.max(1, Math.min(75, Math.round(cols)));
  const w = box?.w ?? Math.min(s.deck.w * 0.8, cols * 160);
  const rowH = box ? Math.max(16, box.h / rows) : 40;
  // A table goes into an empty table/content placeholder when one is selected.
  const sel = s.one();
  const ph = sel?.kind === 'shape' && sel.ph && ['tbl', 'obj', 'body'].includes(sel.ph.type) && !sel.text?.paras.some((p) => p.runs.some((r) => r.text)) ? sel : null;
  const x = box?.x ?? ph?.x ?? (s.deck.w - w) / 2;
  const y = box?.y ?? ph?.y ?? Math.max(20, (s.deck.h - rows * rowH) / 2);
  const t = newTable(rows, cols, x, y, ph && !box ? ph.w : w, rowH);
  if (ph) t.ph = ph.ph;
  s.tryChange('Insert table', () => {
    const list = s.shapes();
    const i = ph ? list.findIndex((z) => z.id === ph.id) : -1;
    if (i >= 0) list.splice(i, 1, t); else list.push(t);
    s.sel = [t.id];
    s.editing = { shape: t.id, cell: { r: 0, c: 0 } };
  });
  delete s.ext.tableSel;
  s.emit();
};

// ---------- Zoom ----------

export const newZoom = (s: FrameStore, target: Id, targetKind: 'slide' | 'section', x: number, y: number, w: number): Zoom => ({
  id: uid('s'), kind: 'zoom', target, targetKind, returnToZoom: targetKind === 'section', name: targetKind === 'slide' ? 'Slide Zoom' : 'Section Zoom',
  x, y, w, h: (w * s.deck.h) / s.deck.w,
});

/** Lays out n thumbnails in a grid inside a box. */
export const gridLayout = (n: number, box: { x: number; y: number; w: number; h: number }, ratio: number, gap = 24): { x: number; y: number; w: number }[] => {
  let best = { cols: 1, w: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min((box.w - gap * (cols - 1)) / cols, ((box.h - gap * (rows - 1)) / rows) / ratio);
    if (w > best.w) best = { cols, w };
  }
  const rows = Math.ceil(n / best.cols);
  const h = best.w * ratio;
  const totalH = rows * h + (rows - 1) * gap;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / best.cols), c = i % best.cols;
    const inRow = Math.min(best.cols, n - r * best.cols);
    const rowW = inRow * best.w + (inRow - 1) * gap;
    return { x: box.x + (box.w - rowW) / 2 + c * (best.w + gap), y: box.y + (box.h - totalH) / 2 + r * (h + gap), w: best.w };
  });
};

export const insertZooms = (s: FrameStore, targets: Id[], kind: 'slide' | 'section'): void => {
  if (!targets.length || !s.slide) return;
  const cells = gridLayout(targets.length, { x: s.deck.w * 0.1, y: s.deck.h * 0.2, w: s.deck.w * 0.8, h: s.deck.h * 0.7 }, s.deck.h / s.deck.w);
  const shapes = targets.map((t, i) => newZoom(s, t, kind, cells[i]!.x, cells[i]!.y, Math.min(cells[i]!.w, s.deck.w * 0.35)));
  placeShapes(s, kind === 'slide' ? 'Insert slide zoom' : 'Insert section zoom', shapes);
};

/** A new slide before the first chosen one, with a section zoom for each chosen section. */
export const insertSummaryZoom = (s: FrameStore, slideIds: Id[]): void => {
  const deck = s.deck;
  const order = new Map(deck.slides.map((x, i) => [x.id, i]));
  const chosen = slideIds.filter((id) => order.has(id)).sort((a, b) => order.get(a)! - order.get(b)!);
  if (!chosen.length) return;
  const cur = s.slide;
  const { master } = cur ? s.masterOf(cur) : { master: deck.masters[0]! };
  const layout = master.layouts.find((l) => l.type === 'titleOnly') ?? master.layouts[0]!;
  s.tryChange('Insert summary zoom', () => {
    // Every chosen slide starts a section; make sections where missing.
    for (const id of chosen) if (!deck.sections.some((x) => x.first === id)) {
      const idx = order.get(id)!;
      deck.sections.push({ id: uid('x'), name: `Section ${idx + 1}`, first: id });
    }
    if (!deck.sections.some((x) => x.first === deck.slides[0]!.id)) deck.sections.push({ id: uid('x'), name: 'Default Section', first: deck.slides[0]!.id });
    deck.sections.sort((a, b) => (order.get(a.first) ?? 0) - (order.get(b.first) ?? 0));
    const at = order.get(chosen[0]!)!;
    const slide = { id: uid('p'), layout: layout.id, name: 'Summary', shapes: [] as Shape[], notes: { paras: [{ runs: [] }] }, animations: [] };
    for (const ph of layout.shapes.filter((x) => x.ph?.type === 'title')) {
      slide.shapes.push({ ...structuredClone(ph), id: uid('s'), ...(ph.kind === 'shape' ? { text: { ...(ph.text ?? { paras: [] }), paras: [{ runs: [{ text: 'Summary' }] }] } } : {}) } as Shape);
    }
    const secs = chosen.map((id) => deck.sections.find((x) => x.first === id)!);
    const cells = gridLayout(secs.length, { x: deck.w * 0.08, y: deck.h * 0.28, w: deck.w * 0.84, h: deck.h * 0.62 }, deck.h / deck.w);
    secs.forEach((sec, i) => slide.shapes.push({ ...newZoom(s, sec.id, 'section', cells[i]!.x, cells[i]!.y, cells[i]!.w), name: sec.name }));
    deck.slides.splice(at, 0, slide);
    // The summary slide opens its own section.
    deck.sections.push({ id: uid('x'), name: 'Summary Section', first: slide.id });
    const ord2 = new Map(deck.slides.map((x, i) => [x.id, i]));
    deck.sections.sort((a, b) => (ord2.get(a.first) ?? 0) - (ord2.get(b.first) ?? 0));
    s.cur = at; s.slideSel = [at]; s.sel = [];
  });
};

// ---------- Commands ----------

const T = (id: string, label: string, fn: (t: Table, rg: CellRange, s: FrameStore, arg?: unknown) => void | CellRange | null, extra: Partial<Command> = {}): Command => ({
  id, label, group: 'Table', enabled: (s) => !!activeTable(s), run: (s, arg) => tableChange(s, label, (t, rg) => fn(t, rg, s, arg)), ...extra,
});

export const registerInsertCommands = (): void => {
  registerCommands([
    { id: 'insert.picture', label: 'Pictures from this device…', group: 'Insert', enabled: editable, run: (s) => void pickFiles('image/*', true).then((f) => f.length && insertPictures(s, f)) },
    { id: 'insert.files', label: 'Insert files', group: 'Insert', hidden: true, enabled: editable, run: (s, arg) => { const f = Array.isArray(arg) ? (arg as File[]) : []; if (f.length) void insertFiles(s, f); } },
    { id: 'insert.screenshot', label: 'Screenshot', group: 'Insert', enabled: (s) => editable(s) && canCapture(), run: (s) => void screenshot(s) },
    { id: 'insert.photoAlbum', label: 'Photo album…', group: 'Insert', enabled: onSlide, run: (s) => openDialog(s, 'insert.photoAlbum') },
    { id: 'insert.video', label: 'Video from this device…', group: 'Insert', enabled: editable, run: (s) => void pickFiles('video/*', false).then((f) => f.length && insertMediaFiles(s, f)) },
    { id: 'insert.audio', label: 'Audio from this device…', group: 'Insert', enabled: editable, run: (s) => void pickFiles('audio/*', false).then((f) => f.length && insertMediaFiles(s, f)) },
    {
      id: 'insert.recordAudio', label: 'Record audio', group: 'Insert', enabled: (s) => editable(s) && canRecordAudio() && recording(s)?.kind !== 'screen', active: (s) => recording(s)?.kind === 'audio',
      run: (s) => void (recording(s) ? stopRecording(s) : startRecording(s, 'audio')),
    },
    {
      id: 'insert.screenRecording', label: 'Screen recording', group: 'Insert', enabled: (s) => editable(s) && canCapture() && recording(s)?.kind !== 'audio', active: (s) => recording(s)?.kind === 'screen',
      run: (s) => void (recording(s) ? stopRecording(s) : startRecording(s, 'screen')),
    },
    { id: 'insert.stopRecording', label: 'Stop recording', group: 'Insert', hidden: true, enabled: (s) => !!recording(s), run: (s, keep) => void stopRecording(s, keep !== false) },
    { id: 'insert.icons', label: 'Icons…', group: 'Insert', enabled: editable, run: (s) => openDialog(s, 'insert.icons') },
    { id: 'insert.symbol', label: 'Symbol…', group: 'Insert', enabled: editable, run: (s) => openDialog(s, 'insert.symbol') },
    { id: 'insert.tableDialog', label: 'Insert table…', group: 'Insert', enabled: editable, run: (s) => openDialog(s, 'insert.table') },
    {
      id: 'insert.table', label: 'Table', group: 'Insert', enabled: editable,
      run: (s, arg) => {
        const a = arg as { rows?: number; cols?: number } | undefined;
        if (a && a.rows && a.cols) insertTable(s, a.rows, a.cols); else openDialog(s, 'insert.table');
      },
    },
    { id: 'insert.drawTable', label: 'Draw table', group: 'Insert', enabled: editable, active: (s) => s.tool === 'table', run: (s) => { s.tool = s.tool === 'table' ? null : 'table'; s.editing = null; s.emit(); } },
    { id: 'insert.link', label: 'Link…', group: 'Insert', keys: 'Mod+Alt+K', inText: true, enabled: (s) => editable(s) && (s.sel.length > 0 || !!s.editing), run: (s) => openDialog(s, 'link') },
    { id: 'text.link', label: 'Link…', group: 'Text', hidden: true, inText: true, enabled: (s) => editable(s) && (s.sel.length > 0 || !!s.editing), run: (s) => openDialog(s, 'link') },
    { id: 'insert.action', label: 'Action…', group: 'Insert', enabled: (s) => editable(s) && s.sel.length > 0, run: (s) => openDialog(s, 'insert.action') },
    { id: 'insert.comment', label: 'Comment', group: 'Insert', enabled: () => !!command('review.newComment'), run: (s) => run(s, 'review.newComment') },
    { id: 'insert.headerFooter', label: 'Header & footer…', group: 'Insert', run: (s) => openDialog(s, 'insert.headerFooter') },
    { id: 'insert.wordart', label: 'WordArt', group: 'Insert', enabled: editable, run: (s, arg) => (typeof arg === 'string' ? insertWordArt(s, arg) : openDialog(s, 'insert.wordart')) },
    { id: 'insert.textEffects', label: 'Text effects…', group: 'Insert', enabled: (s) => s.selected().some((x) => x.kind === 'shape' && !!x.text), run: (s) => openDialog(s, 'insert.wordart', { transform: true }) },
    { id: 'insert.dateTime', label: 'Date & time…', group: 'Insert', enabled: editable, run: (s) => openDialog(s, 'insert.dateTime') },
    {
      id: 'insert.slideNumber', label: 'Slide number', group: 'Insert', enabled: editable,
      run: (s) => {
        // Inside text: insert a number field. Otherwise: turn on numbers via Header & footer.
        if (s.editing && !s.editing.cell) {
          const sh = s.shape(s.editing.shape);
          if (sh?.kind === 'shape') { s.tryChange('Insert slide number', () => { const p = sh.text!.paras.at(-1) ?? (sh.text!.paras[0] = { runs: [] }); p.runs.push({ text: '‹#›', field: 'slidenum' }); }); return; }
        }
        openDialog(s, 'insert.headerFooter', { focus: 'slideNumber' });
      },
    },
    { id: 'insert.slideZoom', label: 'Slide zoom…', group: 'Insert', enabled: onSlide, run: (s) => openDialog(s, 'insert.zoom', { kind: 'slide' }) },
    { id: 'insert.sectionZoom', label: 'Section zoom…', group: 'Insert', enabled: onSlide, run: (s) => openDialog(s, 'insert.zoom', { kind: 'section' }) },
    { id: 'insert.summaryZoom', label: 'Summary zoom…', group: 'Insert', enabled: onSlide, run: (s) => openDialog(s, 'insert.zoom', { kind: 'summary' }) },
    // Tables
    T('table.insertRowAbove', 'Insert row above', (t, rg) => { insertRow(t, rg.r1, rg.r1); return { ...rg, r1: rg.r1, r2: rg.r1 }; }),
    T('table.insertRowBelow', 'Insert row below', (t, rg) => { insertRow(t, rg.r2 + 1, rg.r2); return { ...rg, r1: rg.r2 + 1, r2: rg.r2 + 1 }; }),
    T('table.insertColLeft', 'Insert column left', (t, rg) => { insertCol(t, rg.c1); return { ...rg, c1: rg.c1, c2: rg.c1 }; }),
    T('table.insertColRight', 'Insert column right', (t, rg) => { insertCol(t, rg.c2 + 1); return { ...rg, c1: rg.c2 + 1, c2: rg.c2 + 1 }; }),
    T('table.deleteRows', 'Delete rows', (t, rg, s) => {
      if (!deleteRows(t, rg.r1, rg.r2)) { removeShape(s, t.id); return null; }
      return { r1: Math.min(rg.r1, t.rows.length - 1), r2: Math.min(rg.r1, t.rows.length - 1), c1: rg.c1, c2: rg.c1 };
    }),
    T('table.deleteCols', 'Delete columns', (t, rg, s) => {
      if (!deleteCols(t, rg.c1, rg.c2)) { removeShape(s, t.id); return null; }
      return { r1: rg.r1, r2: rg.r1, c1: Math.min(rg.c1, t.cols.length - 1), c2: Math.min(rg.c1, t.cols.length - 1) };
    }),
    T('table.delete', 'Delete table', (t, _rg, s) => { removeShape(s, t.id); return null; }),
    T('table.selectRow', 'Select row', (t, rg) => ({ r1: rg.r1, r2: rg.r2, c1: 0, c2: t.cols.length - 1 })),
    T('table.selectCol', 'Select column', (t, rg) => ({ r1: 0, r2: t.rows.length - 1, c1: rg.c1, c2: rg.c2 })),
    T('table.selectAll', 'Select table', (t) => fullRange(t)),
    T('table.merge', 'Merge cells', (t, rg) => { mergeCells(t, rg); applyTableStyle(t); return { ...rg, r2: rg.r1, c2: rg.c1 }; }, { enabled: (s) => { const t = activeTable(s); if (!t || !hasRange(s)) return false; const r = tableRange(s, t); return r.r1 !== r.r2 || r.c1 !== r.c2; } }),
    T('table.unmerge', 'Unmerge cells', (t, rg) => { unmerge(t, rg); applyTableStyle(t); return rg; }),
    { id: 'table.split', label: 'Split cells…', group: 'Table', enabled: (s) => !!activeTable(s), run: (s) => openDialog(s, 'table.split') },
    T('table.distributeRows', 'Distribute rows', (t, rg) => { distributeRows(t, rg.r1, rg.r2 === rg.r1 ? t.rows.length - 1 : rg.r2); return rg; }),
    T('table.distributeCols', 'Distribute columns', (t, rg) => { distributeCols(t, rg.c1, rg.c2 === rg.c1 ? t.cols.length - 1 : rg.c2); return rg; }),
    {
      id: 'table.nextCell', label: 'Next cell', group: 'Table', hidden: true, inText: true, enabled: (s) => !!activeTable(s),
      run: (s) => moveCell(s, 1),
    },
    { id: 'table.prevCell', label: 'Previous cell', group: 'Table', hidden: true, inText: true, enabled: (s) => !!activeTable(s), run: (s) => moveCell(s, -1) },
    { id: 'table.clearSelection', label: 'Clear cell selection', group: 'Table', hidden: true, run: (s) => { delete s.ext.tableSel; s.emit(); } },
  ]);
};

const removeShape = (s: FrameStore, id: Id): void => {
  const p = s.parentList(id);
  if (!p) return;
  const i = p.list.findIndex((x) => x.id === id);
  if (i >= 0) p.list.splice(i, 1);
  s.sel = s.sel.filter((x) => x !== id);
  s.editing = null;
};

/** Tab / Shift+Tab inside a table. Tab in the last cell adds a row. */
const moveCell = (s: FrameStore, dir: 1 | -1): void => {
  const t = activeTable(s);
  if (!t) return;
  const cur = s.editing?.shape === t.id && s.editing.cell ? s.editing.cell : { r: 0, c: dir === 1 ? -1 : t.cols.length };
  const next = stepCell(t, cur.r, Math.max(-1, cur.c), dir);
  delete s.ext.tableSel;
  if (next) { s.editing = { shape: t.id, cell: next }; s.sel = [t.id]; s.emit(); return; }
  if (dir === 1) {
    s.tryChange('Insert row', () => { const live = s.shape(t.id); if (live?.kind === 'table') insertRow(live, live.rows.length, live.rows.length - 1); });
    const live = s.shape(t.id);
    if (live?.kind === 'table') s.editing = { shape: t.id, cell: { r: live.rows.length - 1, c: 0 } };
    s.emit();
  }
};

// ---------- WordArt ----------

export const insertWordArt = (s: FrameStore, styleId: string): void => {
  const st = WORDART_STYLES.find((w) => w.id === styleId) ?? WORDART_STYLES[0]!;
  const sel = s.selected().filter((x) => x.kind === 'shape' && x.text?.paras.some((p) => p.runs.some((r) => r.text)));
  if (sel.length) {
    // Restyle the selected text.
    s.tryChange('WordArt style', () => {
      for (const sh of sel) if (sh.kind === 'shape') for (const p of sh.text!.paras) for (const r of p.runs) {
        const base = { ...(r.style ?? {}) };
        delete base.fill; delete base.outline; delete base.shadow;
        r.style = { ...base, ...structuredClone(st.style) };
      }
    });
    return;
  }
  const w = Math.min(s.deck.w * 0.7, 820), h = 110;
  const tb = newTextBox(s, (s.deck.w - w) / 2, (s.deck.h - h) / 2, w, h);
  tb.name = tb.name.replace('TextBox', 'WordArt');
  tb.text = { ...tb.text!, paras: [{ runs: [{ text: 'Your text here', style: { size: 54, ...structuredClone(st.style) } }], style: { align: 'ctr' } }], autofit: 'resize', wrap: false };
  if (addShape(s, 'Insert WordArt', tb)) { s.editing = null; s.emit(); }
};

// ---------- Date & time and symbols ----------

export const insertDateTime = (s: FrameStore, format: string, auto: boolean): void => {
  const text = formatDate(format);
  if (s.editing || s.selected().some((x) => x.kind === 'shape' && x.text)) {
    if (auto && s.editing && !s.editing.cell) {
      const sh = s.shape(s.editing.shape);
      if (sh?.kind === 'shape') { s.tryChange('Insert date', () => { const p = sh.text!.paras.at(-1) ?? (sh.text!.paras[0] = { runs: [] }); p.runs.push({ text, field: 'datetime' }); }); return; }
    }
    insertText(s, text);
    return;
  }
  const tb = newTextBox(s, s.deck.w / 2 - 150, s.deck.h / 2 - 20, 300, 40, text);
  if (auto) tb.text!.paras[0]!.runs[0]!.field = 'datetime';
  addShape(s, 'Insert date', tb);
};

/** Ids of every slide referred to by a deck-internal link or zoom, for checks after slides are deleted. */
export const linkedSlides = (s: FrameStore): Set<Id> => {
  const out = new Set<Id>();
  for (const sl of s.deck.slides) walkShapes(sl.shapes, (x) => { if (x.link?.slide) out.add(x.link.slide); if (x.kind === 'zoom') out.add(x.target); });
  return out;
};

