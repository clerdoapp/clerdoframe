import type { ComponentType, ReactNode } from 'react';
import type { Deck } from '../model/deck';
import type { FrameStore } from './store';

/**
 * Extension points. Feature modules (src/features/*) register what they add here at start-up,
 * so the shell never imports them directly and features don't edit each other's files.
 */

// ---------- Rail tabs and tool-panel sections ----------

export interface RailTab { id: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; order: number }
export interface PanelSection { tab: string; title: string; order?: number; render: (store: FrameStore) => ReactNode; when?: (store: FrameStore) => boolean }

const tabs: RailTab[] = [];
const sections: PanelSection[] = [];
export const registerRailTab = (t: RailTab): void => { if (!tabs.some((x) => x.id === t.id)) tabs.push(t); };
export const railTabs = (): RailTab[] => [...tabs].sort((a, b) => a.order - b.order);
export const registerPanelSection = (s: PanelSection): void => { sections.push(s); };
export const panelSections = (tab: string, store: FrameStore): PanelSection[] =>
  sections.filter((s) => s.tab === tab && (!s.when || s.when(store))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// ---------- Right-hand panes (Format shape, Animation pane, Selection pane, Comments...) ----------

export interface Pane { id: string; title: string; render: (store: FrameStore) => ReactNode; width?: number }
const panes = new Map<string, Pane>();
export const registerPane = (p: Pane): void => { panes.set(p.id, p); };
export const pane = (id: string): Pane | undefined => panes.get(id);

// ---------- Dialogs ----------

export interface DialogProps<T = unknown> { store: FrameStore; data?: T; close: () => void }
const dialogs = new Map<string, ComponentType<DialogProps<never>>>();
export const registerDialog = <T,>(id: string, c: ComponentType<DialogProps<T>>): void => { dialogs.set(id, c as ComponentType<DialogProps<never>>); };
export const dialog = (id: string): ComponentType<DialogProps<never>> | undefined => dialogs.get(id);

// ---------- Canvas layers and hooks ----------

/** Extra things drawn over the slide on the editing canvas, in slide pixels (comments markers, guides, ink preview). */
export interface CanvasLayer { id: string; order?: number; render: (store: FrameStore, scale: number) => ReactNode }
const layers: CanvasLayer[] = [];
export const registerCanvasLayer = (l: CanvasLayer): void => { if (!layers.some((x) => x.id === l.id)) layers.push(l); };
export const canvasLayers = (): CanvasLayer[] => [...layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** Pointer handling for drawing tools (pen, shapes, tables). Return true to take over the gesture. */
export interface ToolHandler {
  id: string;
  /** Matches store.tool, e.g. 'pen' or a prefix like 'shape:'. */
  match: (tool: string) => boolean;
  down: (store: FrameStore, p: ToolPoint) => void;
  move: (store: FrameStore, p: ToolPoint) => void;
  up: (store: FrameStore, p: ToolPoint) => void;
  /** Live preview while drawing, in slide px. */
  preview?: (store: FrameStore) => ReactNode;
  cursor?: string;
  /** When present and false for a pointer type ('mouse' | 'pen' | 'touch'), the canvas handles that pointer as in select mode (pan, select). */
  accepts?: (store: FrameStore, pointerType: string) => boolean;
}
/** A pointer sample in slide px. pointerType and time are optional so older callers still fit. */
export interface ToolPoint { x: number; y: number; pressure: number; shift: boolean; pointerType?: string; time?: number }
const tools: ToolHandler[] = [];
export const registerTool = (t: ToolHandler): void => { if (!tools.some((x) => x.id === t.id)) tools.push(t); };
export const toolFor = (tool: string | null): ToolHandler | undefined => (tool ? tools.find((t) => t.match(tool)) : undefined);

// ---------- Full-screen overlays (slide show, presenter view, recording) ----------

export interface Overlay { id: string; render: (store: FrameStore) => ReactNode }
const overlays: Overlay[] = [];
export const registerOverlay = (o: Overlay): void => { if (!overlays.some((x) => x.id === o.id)) overlays.push(o); };
export const appOverlays = (): Overlay[] => overlays;

// ---------- Views other than Normal (outline, sorter, notes page, reading) ----------

export interface ViewRenderer { mode: string; render: (store: FrameStore) => ReactNode }
const views = new Map<string, ViewRenderer>();
export const registerView = (v: ViewRenderer): void => { views.set(v.mode, v); };
export const viewFor = (mode: string): ViewRenderer | undefined => views.get(mode);

// ---------- File formats ----------

export interface FileFormat {
  id: string;
  label: string;
  extensions: string[];
  mime: string;
  read?: (data: Uint8Array, name: string) => Deck | Promise<Deck>;
  write?: (deck: Deck, store: FrameStore) => Uint8Array | Promise<Uint8Array>;
  /** Can be the file kept open and saved back to. */
  native?: boolean;
}
const formats: FileFormat[] = [];
export const registerFormat = (f: FileFormat): void => { if (!formats.some((x) => x.id === f.id)) formats.push(f); };
export const fileFormats = (): FileFormat[] => formats;
export const formatFor = (name: string): FileFormat | undefined => {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return formats.find((f) => f.read && f.extensions.includes(ext));
};

// ---------- Context menu items ----------

export interface MenuItem { label: string; command?: string; arg?: unknown; run?: (store: FrameStore) => void; sep?: boolean; keys?: string; disabled?: boolean }
export interface MenuProvider { kind: string; order?: number; items: (store: FrameStore, data: unknown) => MenuItem[] }
const menus: MenuProvider[] = [];
export const registerMenu = (m: MenuProvider): void => { menus.push(m); };
export const menuItems = (kind: string, store: FrameStore, data: unknown): MenuItem[] => {
  const out: MenuItem[] = [];
  for (const m of menus.filter((x) => x.kind === kind).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const items = m.items(store, data);
    if (items.length && out.length) out.push({ label: '', sep: true });
    out.push(...items);
  }
  return out;
};
