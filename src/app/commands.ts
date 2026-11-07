import type { FrameStore } from './store';

export interface Command {
  id: string;
  label: string;
  /** Palette and menu grouping. */
  group?: string;
  /** "Mod+Shift+K" style shortcut. */
  keys?: string;
  /** Extra shortcuts for the same command. */
  altKeys?: string[];
  run: (store: FrameStore, arg?: unknown) => void;
  enabled?: (store: FrameStore) => boolean;
  active?: (store: FrameStore) => boolean;
  /** Shortcut still fires while text is being edited (formatting, undo...). */
  inText?: boolean;
  /** Hidden from the command search. */
  hidden?: boolean;
}

const registry = new Map<string, Command>();

export const registerCommand = (c: Command): void => { registry.set(c.id, c); };
export const registerCommands = (cs: Command[]): void => { for (const c of cs) registry.set(c.id, c); };
export const command = (id: string): Command | undefined => registry.get(id);
export const allCommands = (): Command[] => [...registry.values()];

export const run = (store: FrameStore, id: string, arg?: unknown): void => {
  const c = registry.get(id);
  if (!c) { console.warn(`Unknown command ${id}`); return; }
  if (c.enabled && !c.enabled(store)) return;
  try {
    c.run(store, arg);
  } catch (e) {
    if (e instanceof Error && e.message === 'final') return;
    console.error(e);
    store.notify(e instanceof Error ? e.message : 'That could not be done.');
  }
};

export const openDialog = (store: FrameStore, id: string, data?: unknown): void => { store.dialog = { id, data }; store.menu = null; store.emit(); };
export const openPane = (store: FrameStore, pane: string | null): void => { store.view.pane = store.view.pane === pane ? null : pane; store.emit(); };
