import { allCommands, command, run } from '../app/commands';
import type { FrameStore } from '../app/store';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPad|iPhone/.test(navigator.platform || navigator.userAgent);

/** Normalises an event to the "Mod+Shift+K" form commands use. */
export const keyName = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (isMac && e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let k = e.key;
  // Shifted punctuation: use the physical key so Mod+Shift+; works on any layout.
  if (e.code?.startsWith('Digit') && (e.shiftKey || e.altKey)) k = e.code.slice(5);
  else if (e.code === 'Semicolon') k = ';';
  else if (e.code === 'Equal') k = '=';
  else if (e.code === 'Minus') k = '-';
  else if (e.code === 'Backquote') k = '`';
  else if (e.code === 'Period') k = '.';
  else if (e.code === 'Comma') k = ',';
  else if (e.code === 'Slash') k = '/';
  else if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join('+');
};

export const prettyKeys = (k: string): string => k.replace(/Mod/g, isMac ? '⌘' : 'Ctrl').replace(/Shift/g, isMac ? '⇧' : 'Shift').replace(/Alt/g, isMac ? '⌥' : 'Alt').replace(/\+/g, isMac ? '' : '+');

let table: Map<string, string> | null = null;
export const commandFor = (k: string): string | undefined => {
  if (!table) {
    table = new Map();
    for (const c of allCommands()) {
      if (c.keys) table.set(c.keys, c.id);
      for (const a of c.altKeys ?? []) table.set(a, c.id);
    }
  }
  return table.get(k);
};
export const resetKeyTable = (): void => { table = null; };

const inField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

/** Global shortcuts. Text fields get first say; commands marked inText still fire while editing slide text. */
export const bindKeys = (store: FrameStore): (() => void) => {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || store.dialog) return;
    const k = keyName(e);
    const id = commandFor(k);
    if (!id) return;
    const c = command(id);
    if (!c) return;
    const field = inField(e.target);
    const slideText = field && (e.target as HTMLElement).closest?.('[data-texteditor]');
    if (field && !(slideText && c.inText) && !(c.inText && k.startsWith('Mod+') && !slideText && !['Mod+A', 'Mod+C', 'Mod+X', 'Mod+V', 'Mod+Z', 'Mod+Shift+Z', 'Mod+Y', 'Mod+B', 'Mod+I', 'Mod+U'].includes(k))) {
      if (!(k === 'Mod+S' || k === 'Mod+O' || k === 'Mod+P' || k === 'Mod+K' || k === 'F5' || k === 'Shift+F5')) return;
    }
    if (store.show && !id.startsWith('show.')) return;
    e.preventDefault();
    run(store, id);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
};
