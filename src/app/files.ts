import { fileFormats, formatFor } from './registry';
import type { FrameStore } from './store';
import type { Deck } from '../model/deck';
import { newDeck } from '../model/defaults';
import { deckFromJson, deckToJson } from '../formats/native';

/** The desktop app's bridge (electron/preload.ts). Absent in the browser. */
interface DesktopBridge {
  open: () => Promise<{ path: string; name: string; data: Uint8Array } | null>;
  save: (path: string | null, name: string, data: Uint8Array, ext: string) => Promise<{ path: string; name: string } | null>;
  saveAs?: (name: string, data: Uint8Array, ext: string) => Promise<{ path: string; name: string } | null>;
  launchFile: () => Promise<{ path: string; name: string; data: Uint8Array } | null>;
  newWindow: () => void;
  print?: () => Promise<void>;
  setPresenting?: (on: boolean) => void;
}
export const desktop = (globalThis as { clerdo?: DesktopBridge }).clerdo;

export const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MAX_BYTES = 1024 * 1024 * 1024;

export const deckFromBytes = async (name: string, data: Uint8Array): Promise<Deck> => {
  if (data.length > MAX_BYTES) throw new Error('This file is too large to open.');
  if (data[0] === 0xd0 && data[1] === 0xcf) throw new Error('This is an older .ppt file or a password-protected presentation. Save it as .pptx in the other app first.');
  const f = formatFor(name) ?? (data[0] === 0x50 && data[1] === 0x4b ? fileFormats().find((x) => x.id === 'pptx') : undefined);
  if (!f?.read) throw new Error("This file isn't a presentation ClerdoFrame can read.");
  return f.read(data, name);
};

export const openBytes = async (store: FrameStore, name: string, data: Uint8Array, path: string | null = null, handle?: unknown): Promise<void> => {
  try {
    const deck = await deckFromBytes(name, data);
    const native = /\.(pptx|pptm|ppsx)$/i.test(name);
    store.load(deck, name, native ? path : null, native ? handle : undefined);
    if (/\.ppsx$/i.test(name) && store.ext.startShow) (store.ext.startShow as (s: FrameStore) => void)(store);
  } catch (e) {
    store.notify(e instanceof Error ? e.message : 'The file could not be opened.');
  }
};

export const newPresentation = (store: FrameStore, deck?: Deck): void => {
  if (desktop && !deck) { desktop.newWindow(); return; }
  if (store.file.dirty && !confirm('Start a new presentation? Unsaved changes in this one will be lost.')) return;
  store.load(deck ?? newDeck(), 'Presentation1');
};

type PickerWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<{ getFile: () => Promise<File> }[]>;
  showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>; name: string }>;
};

const ACCEPT = '.pptx,.pptm,.ppsx,.potx,.odp';

export const openFile = async (store: FrameStore): Promise<void> => {
  if (desktop) {
    try { const f = await desktop.open(); if (f) await openBytes(store, f.name, f.data, f.path); } catch (e) { store.notify(e instanceof Error ? e.message : 'The file could not be opened.'); }
    return;
  }
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: [{ description: 'Presentations', accept: { [PPTX_TYPE]: ACCEPT.split(',') } }] });
      const file = await h!.getFile();
      await openBytes(store, file.name, new Uint8Array(await file.arrayBuffer()), null, h);
    } catch { /* cancelled */ }
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) await openBytes(store, file.name, new Uint8Array(await file.arrayBuffer()));
  };
  input.click();
};

export const download = (name: string, blob: Blob): void => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
};

/** Picks a file to read (images, media, outlines) with the system picker. */
export const pickFile = (accept: string, multiple = false): Promise<File[]> => new Promise((res) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.onchange = () => res([...(input.files ?? [])]);
  input.oncancel = () => res([]);
  input.click();
});

export const encode = async (store: FrameStore, formatId: string): Promise<Uint8Array> => {
  const f = fileFormats().find((x) => x.id === formatId);
  if (!f?.write) throw new Error(`Saving as ${formatId} isn't available.`);
  store.deck.props = { ...store.deck.props, modified: new Date().toISOString(), lastModifiedBy: store.deck.props.lastModifiedBy ?? 'ClerdoFrame' };
  return f.write(store.deck, store);
};

/** Saves in a format. pptx keeps the file open as the document; others are exports. */
export const saveFile = async (store: FrameStore, saveAs = false, formatId = 'pptx'): Promise<void> => {
  const f = fileFormats().find((x) => x.id === formatId);
  if (!f) { store.notify('That format is not available.'); return; }
  let data: Uint8Array;
  try { data = await encode(store, formatId); } catch (e) { store.notify(`The presentation could not be saved: ${e instanceof Error ? e.message : 'unknown error'}`); return; }
  const ext = f.extensions[0]!;
  const name = `${store.file.name || 'Presentation1'}.${ext}`;
  const native = formatId === 'pptx';
  if (desktop) {
    try {
      const r = await desktop.save(saveAs || !native ? null : store.file.path, name, data, ext);
      if (!r) return;
      if (native) store.file = { ...store.file, path: r.path, name: r.name.replace(/\.[^.]+$/, ''), dirty: false, lastSaved: Date.now() };
      else store.notify(`Saved ${r.name}`);
      store.emit();
    } catch (e) { store.notify(e instanceof Error ? e.message : 'The presentation could not be saved.'); }
    return;
  }
  const w = window as PickerWindow;
  const blob = new Blob([data as BlobPart], { type: f.mime });
  if (w.showSaveFilePicker) {
    try {
      let handle = native && !saveAs ? (store.file.handle as Awaited<ReturnType<NonNullable<PickerWindow['showSaveFilePicker']>>> | undefined) : undefined;
      if (handle && !('createWritable' in handle)) handle = undefined;
      handle ??= await w.showSaveFilePicker({ suggestedName: name, types: [{ description: f.label, accept: { [f.mime]: [`.${ext}`] } }] });
      const wr = await handle.createWritable();
      await wr.write(blob);
      await wr.close();
      if (native) store.file = { ...store.file, handle, name: handle.name.replace(/\.[^.]+$/, ''), dirty: false, lastSaved: Date.now() };
      store.emit();
      return;
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
    }
  }
  download(name, blob);
  if (native) store.file = { ...store.file, dirty: false, lastSaved: Date.now() };
  store.emit();
};

// ---------- Autosave (browser and iPad) ----------

const DB = 'clerdoframe';
const idb = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('drafts');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

type Draft = { name: string; json: string; at: number };
const putDraft = async (data: Draft | null): Promise<void> => {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction('drafts', 'readwrite');
    if (data) tx.objectStore('drafts').put(data, 'current'); else tx.objectStore('drafts').delete('current');
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
};
const getDraft = async (): Promise<Draft | undefined> => {
  const db = await idb();
  const out = await new Promise<Draft | undefined>((res) => {
    const r = db.transaction('drafts').objectStore('drafts').get('current');
    r.onsuccess = () => res(r.result as never);
    r.onerror = () => res(undefined);
  });
  db.close();
  return out;
};

/** Keeps a copy of unsaved work in the browser so closing the tab or the iPad app doesn't lose it. */
export const startAutosave = (store: FrameStore): (() => void) => {
  if (desktop || typeof indexedDB === 'undefined') return () => undefined;
  let last = -1;
  const t = setInterval(() => {
    const v = store.getVersion();
    if (v === last || store.editing) return;
    last = v;
    if (!store.file.dirty) return;
    try { void putDraft({ name: store.file.name, json: deckToJson(store.deck), at: Date.now() }).catch(() => undefined); } catch { /* keep going */ }
  }, 4000);
  return () => clearInterval(t);
};

export const restoreDraft = async (store: FrameStore): Promise<boolean> => {
  if (desktop || typeof indexedDB === 'undefined') return false;
  try {
    const d = await getDraft();
    if (!d) return false;
    store.load(deckFromJson(d.json), d.name);
    store.file.dirty = true;
    store.notify('Restored your unsaved presentation.');
    return true;
  } catch { return false; }
};

export const forgetDraft = (): void => { void putDraft(null).catch(() => undefined); };

export const openLaunchFile = async (store: FrameStore): Promise<boolean> => {
  if (!desktop) return false;
  try {
    const f = await desktop.launchFile();
    if (!f) return false;
    await openBytes(store, f.name, f.data, f.path);
    return true;
  } catch (e) { store.notify(e instanceof Error ? e.message : 'The file could not be opened.'); return false; }
};
