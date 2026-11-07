import {
  findShape, masterOf, walkShapes,
  type Deck, type Group, type Id, type Layout, type Master, type Shape, type Slide,
} from '../model/deck';
import { newDeck } from '../model/defaults';

export type ViewMode = 'normal' | 'outline' | 'sorter' | 'notesPage' | 'reading' | 'master' | 'handoutMaster' | 'notesMaster';

export interface FileState { name: string; path: string | null; dirty: boolean; lastSaved: number | null; handle?: unknown }

export interface ViewState {
  mode: ViewMode;
  theme: 'system' | 'light' | 'dark';
  panel: string | null;
  /** 'fit' fills the stage; otherwise a scale factor. */
  zoom: 'fit' | number;
  ruler: boolean;
  grid: boolean;
  guides: boolean;
  snapToGrid: boolean;
  snapToShapes: boolean;
  gridSize: number;
  /** Drawing guides in slide px: vertical (x) and horizontal (y). */
  guideLines: { x: number[]; y: number[] };
  notes: boolean;
  thumbs: boolean;
  /** Right-hand format pane: 'shape' | 'picture' | 'text' | 'animation' | 'selection' | 'comments' | 'designer' | null */
  pane: string | null;
  grayscale: 'color' | 'gray' | 'bw';
}

/** What the canvas is editing: a slide, a layout or a master. */
export type Surface =
  | { kind: 'slide'; slide: Slide }
  | { kind: 'layout'; master: Master; layout: Layout }
  | { kind: 'master'; master: Master };

/** Where text is being edited. cell is set inside tables. */
export interface TextEdit { shape: Id; cell?: { r: number; c: number } }

interface UndoStep { label: string; before: string; after?: string; selBefore: Id[]; curBefore: number }

export type Listener = () => void;

const snapshot = (d: Deck): string => {
  const { media: _m, extraParts: _x, ...rest } = d;
  return JSON.stringify(rest);
};

export class FrameStore {
  deck: Deck;
  /** Index of the slide shown in Normal view. */
  cur = 0;
  /** In master view: which master and layout (-1 = the master itself). */
  masterSel = { master: 0, layout: 0 };
  sel: Id[] = [];
  /** Slides selected in the thumbnail list or sorter (indexes). */
  slideSel: number[] = [0];
  editing: TextEdit | null = null;
  file: FileState = { name: 'Presentation1', path: null, dirty: false, lastSaved: null };
  view: ViewState = {
    mode: 'normal', theme: 'system', panel: 'home', zoom: 'fit', ruler: false, grid: false, guides: false, snapToGrid: true, snapToShapes: true, gridSize: 16,
    guideLines: { x: [], y: [] }, notes: true, thumbs: true, pane: null, grayscale: 'color',
  };
  toast: string | null = null;
  dialog: { id: string; data?: unknown } | null = null;
  menu: { x: number; y: number; kind: string; data?: unknown } | null = null;
  /** Active tool for drawing on the canvas: null = select; 'shape:<geom>', 'text', 'line', 'pen', 'highlighter', 'eraser', 'table', 'lasso'. */
  tool: string | null = null;
  /** Slide show state; owned by the show feature. */
  show: unknown = null;
  /** Format painter: copied style waiting to be applied. */
  painter: { kind: 'shape' | 'text'; data: unknown; sticky: boolean } | null = null;
  /** Free-form extension state for feature modules. */
  ext: Record<string, unknown> = {};
  private version = 0;
  private listeners = new Set<Listener>();
  private undoStack: UndoStep[] = [];
  private redoStack: UndoStep[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private batch: UndoStep | null = null;
  private batchDepth = 0;

  constructor(deck: Deck = newDeck()) { this.deck = deck; }

  // ---------- Subscription ----------

  subscribe = (l: Listener): (() => void) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  getVersion = (): number => this.version;
  emit(): void { this.version++; for (const l of this.listeners) l(); }

  notify(text: string, ms = 3200): void {
    this.toast = text;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast = null; this.emit(); }, ms);
    this.emit();
  }

  // ---------- Document ----------

  load(deck: Deck, name: string, path: string | null = null, handle?: unknown): void {
    this.deck = deck;
    this.cur = 0;
    this.slideSel = [0];
    this.sel = [];
    this.editing = null;
    this.undoStack = [];
    this.redoStack = [];
    this.masterSel = { master: 0, layout: 0 };
    this.view.mode = 'normal';
    this.file = { name: name.replace(/\.(pptx|ppsx|potx|pptm|odp|cfrm|json)$/i, ''), path, dirty: false, lastSaved: null, handle };
    this.emit();
  }

  get slide(): Slide | undefined { return this.deck.slides[this.cur]; }

  surface(): Surface | null {
    if (this.view.mode === 'master') {
      const m = this.deck.masters[this.masterSel.master];
      if (!m) return null;
      const l = this.masterSel.layout >= 0 ? m.layouts[this.masterSel.layout] : undefined;
      return l ? { kind: 'layout', master: m, layout: l } : { kind: 'master', master: m };
    }
    const s = this.slide;
    return s ? { kind: 'slide', slide: s } : null;
  }

  /** The shape list the canvas edits (slide, layout or master). */
  shapes(): Shape[] {
    const s = this.surface();
    if (!s) return [];
    return s.kind === 'slide' ? s.slide.shapes : s.kind === 'layout' ? s.layout.shapes : s.master.shapes;
  }

  masterOf(slide: Slide): { master: Master; layout: Layout } { return masterOf(this.deck, slide.layout); }

  shape(id: Id): Shape | null { return findShape(this.shapes(), id); }
  selected(): Shape[] { return this.sel.map((id) => this.shape(id)).filter((s): s is Shape => !!s); }
  /** The selected shape when exactly one is selected. */
  one(): Shape | null { return this.sel.length === 1 ? this.shape(this.sel[0]!) : null; }

  /** The list that directly contains the shape and its parent group, if any. */
  parentList(id: Id): { list: Shape[]; group: Group | null } | null {
    const top = this.shapes();
    if (top.some((s) => s.id === id)) return { list: top, group: null };
    let out: { list: Shape[]; group: Group | null } | null = null;
    walkShapes(top, (s) => { if (s.kind === 'group' && s.children.some((c) => c.id === id)) out = { list: s.children, group: s }; });
    return out;
  }

  select(ids: Id[]): void { this.sel = ids; this.editing = null; this.emit(); }

  goto(index: number): void {
    const n = this.deck.slides.length;
    if (!n) return;
    this.cur = Math.max(0, Math.min(n - 1, index));
    this.slideSel = [this.cur];
    this.sel = [];
    this.editing = null;
    this.emit();
  }

  // ---------- Changes and undo ----------

  /**
   * Every document change goes through here. fn mutates this.deck in place.
   * Nested calls fold into one undo step. Returns fn's result.
   */
  change<T>(label: string, fn: () => T): T {
    if (this.deck.final && !label.startsWith('!')) {
      this.notify('This presentation is marked as final. Turn that off in File > Info to edit it.');
      throw new Error('final');
    }
    const outer = this.batchDepth === 0;
    if (outer) this.batch = { label, before: snapshot(this.deck), selBefore: [...this.sel], curBefore: this.cur };
    this.batchDepth++;
    try {
      return fn();
    } catch (e) {
      if (outer && this.batch) this.restore(this.batch.before);
      throw e;
    } finally {
      this.batchDepth--;
      if (outer && this.batch) {
        const step = this.batch;
        this.batch = null;
        const after = snapshot(this.deck);
        if (after !== step.before) {
          step.after = after;
          this.undoStack.push(step);
          if (this.undoStack.length > 300) this.undoStack.shift();
          this.redoStack = [];
          this.file.dirty = true;
        }
        this.clamp();
        this.emit();
      }
    }
  }

  /** Like change(), but swallows the "final" refusal and reports other errors as a toast. */
  tryChange(label: string, fn: () => void): boolean {
    try { this.change(label, fn); return true; } catch (e) {
      if (!(e instanceof Error && e.message === 'final')) this.notify(e instanceof Error ? e.message : 'That could not be done.');
      return false;
    }
  }

  private restore(json: string): void {
    const media = this.deck.media;
    const extra = this.deck.extraParts;
    this.deck = { ...(JSON.parse(json) as Deck), media, ...(extra ? { extraParts: extra } : {}) };
  }

  private clamp(): void {
    const n = this.deck.slides.length;
    if (this.cur >= n) this.cur = Math.max(0, n - 1);
    this.slideSel = this.slideSel.filter((i) => i < n);
    if (!this.slideSel.length && n) this.slideSel = [this.cur];
    this.sel = this.sel.filter((id) => this.shape(id));
    if (this.editing && !this.shape(this.editing.shape)) this.editing = null;
    const m = this.deck.masters[this.masterSel.master];
    if (!m) this.masterSel = { master: 0, layout: -1 };
    else if (this.masterSel.layout >= m.layouts.length) this.masterSel.layout = m.layouts.length - 1;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string | null { return this.undoStack.at(-1)?.label ?? null; }
  get redoLabel(): string | null { return this.redoStack.at(-1)?.label ?? null; }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(s);
    this.restore(s.before);
    this.cur = s.curBefore;
    this.sel = s.selBefore;
    this.editing = null;
    this.file.dirty = true;
    this.clamp();
    this.emit();
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s || !s.after) return;
    this.undoStack.push(s);
    this.restore(s.after);
    this.editing = null;
    this.file.dirty = true;
    this.clamp();
    this.emit();
  }

  addMedia(type: string, name: string, data: Uint8Array): Id {
    // Same bytes reuse the same media item.
    for (const m of Object.values(this.deck.media)) {
      if (m.data.length === data.length && m.type === type && m.data.every((b, i) => b === data[i])) return m.id;
    }
    const id = `m${Object.keys(this.deck.media).length + 1}_${Date.now().toString(36)}`;
    this.deck.media[id] = { id, type, name, data };
    return id;
  }
}
