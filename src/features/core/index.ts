import { Brush, Clapperboard, Eye, File, Home, MessageSquare, Palette, Plus, Presentation, Sparkles, Wand2 } from 'lucide-react';
import { command, openDialog, registerCommands, run } from '../../app/commands';
import { registerMenu, registerRailTab } from '../../app/registry';
import type { FrameStore, ViewMode } from '../../app/store';
import { newPresentation, openFile, saveFile } from '../../app/files';
import { uid, walkShapes, type Id, type Shape, type Slide } from '../../model/deck';
import { newSlide } from '../../model/defaults';
import { registerCoreUi } from './ui';

/** Gives every shape (and group child) a fresh id, so pasted copies don't collide. */
export const reId = (shapes: Shape[]): Shape[] => {
  const map = new Map<Id, Id>();
  const out = structuredClone(shapes);
  walkShapes(out, (s) => { const n = uid('s'); map.set(s.id, n); s.id = n; });
  walkShapes(out, (s) => {
    if (s.kind === 'shape' && s.conn) {
      if (s.conn.start) s.conn.start.shape = map.get(s.conn.start.shape) ?? s.conn.start.shape;
      if (s.conn.end) s.conn.end.shape = map.get(s.conn.end.shape) ?? s.conn.end.shape;
    }
  });
  return out;
};

export const cloneSlide = (s: Slide): Slide => {
  const map = new Map<Id, Id>();
  const c = structuredClone(s);
  c.id = uid('p');
  walkShapes(c.shapes, (x) => { const n = uid('s'); map.set(x.id, n); x.id = n; });
  c.animations = c.animations.map((a) => ({ ...a, id: uid('a'), shape: map.get(a.shape) ?? a.shape, ...(a.triggerShape ? { triggerShape: map.get(a.triggerShape) ?? a.triggerShape } : {}) }));
  c.comments = undefined;
  return c;
};

const selectedSlides = (s: FrameStore): number[] => [...new Set(s.slideSel.length ? s.slideSel : [s.cur])].sort((a, b) => a - b);

/** In-app slide clipboard (also written to the system clipboard as text). */
let slideClip: Slide[] = [];

const layoutFor = (s: FrameStore, layoutId?: Id) => {
  const cur = s.slide;
  const { master } = cur ? s.masterOf(cur) : { master: s.deck.masters[0]! };
  if (layoutId) for (const m of s.deck.masters) { const l = m.layouts.find((x) => x.id === layoutId); if (l) return l; }
  // A new slide after the title slide uses "Title and Content"; otherwise the current slide's layout.
  const curLayout = cur ? master.layouts.find((l) => l.id === cur.layout) : undefined;
  if (!curLayout || curLayout.type === 'title') return master.layouts.find((l) => l.type === 'obj') ?? master.layouts[0]!;
  return curLayout;
};

export const setMode = (s: FrameStore, m: ViewMode): void => {
  s.view.mode = m;
  s.sel = [];
  s.editing = null;
  if (m === 'master') {
    const cur = s.slide;
    if (cur) {
      const mi = s.deck.masters.findIndex((x) => x.layouts.some((l) => l.id === cur.layout));
      const li = mi >= 0 ? s.deck.masters[mi]!.layouts.findIndex((l) => l.id === cur.layout) : 0;
      s.masterSel = { master: Math.max(0, mi), layout: li };
    }
  }
  s.emit();
};

export const registerCore = (): void => {
  registerRailTab({ id: 'home', label: 'Home', icon: Home, order: 10 });
  registerRailTab({ id: 'insert', label: 'Insert', icon: Plus, order: 20 });
  registerRailTab({ id: 'draw', label: 'Draw', icon: Brush, order: 30 });
  registerRailTab({ id: 'design', label: 'Design', icon: Palette, order: 40 });
  registerRailTab({ id: 'transitions', label: 'Transitions', icon: Clapperboard, order: 50 });
  registerRailTab({ id: 'animations', label: 'Animate', icon: Sparkles, order: 60 });
  registerRailTab({ id: 'show', label: 'Present', icon: Presentation, order: 70 });
  registerRailTab({ id: 'review', label: 'Review', icon: MessageSquare, order: 80 });
  registerRailTab({ id: 'view', label: 'View', icon: Eye, order: 90 });
  registerRailTab({ id: 'tools', label: 'Tools', icon: Wand2, order: 95 });
  registerRailTab({ id: 'file', label: 'File', icon: File, order: 100 });

  registerCommands([
    // ----- File -----
    { id: 'file.new', label: 'New presentation', group: 'File', keys: 'Mod+N', run: (s) => newPresentation(s) },
    { id: 'file.open', label: 'Open…', group: 'File', keys: 'Mod+O', run: (s) => void openFile(s) },
    { id: 'file.save', label: 'Save', group: 'File', keys: 'Mod+S', inText: true, run: (s) => void saveFile(s) },
    { id: 'file.saveAs', label: 'Save a copy…', group: 'File', keys: 'Mod+Shift+S', inText: true, run: (s) => void saveFile(s, true) },
    // ----- Edit -----
    { id: 'edit.undo', label: 'Undo', group: 'Edit', keys: 'Mod+Z', run: (s) => s.undo(), enabled: (s) => s.canUndo },
    { id: 'edit.redo', label: 'Redo', group: 'Edit', keys: 'Mod+Y', altKeys: ['Mod+Shift+Z'], run: (s) => s.redo(), enabled: (s) => s.canRedo },
    { id: 'app.palette', label: 'Search commands', keys: 'Mod+K', inText: true, hidden: true, run: (s) => openDialog(s, 'palette') },
    // ----- Slides -----
    {
      id: 'slide.new', label: 'New slide', group: 'Slides', keys: 'Mod+M',
      run: (s, layoutId) => s.tryChange('New slide', () => {
        const at = s.view.mode === 'normal' || s.view.mode === 'sorter' || s.view.mode === 'outline' ? Math.max(...selectedSlides(s), s.cur) + 1 : s.deck.slides.length;
        s.deck.slides.splice(at, 0, newSlide(layoutFor(s, typeof layoutId === 'string' ? layoutId : undefined)));
        s.cur = at; s.slideSel = [at]; s.sel = [];
      }),
    },
    {
      id: 'slide.duplicate', label: 'Duplicate slide', group: 'Slides', keys: 'Mod+D',
      // With shapes selected on the canvas (and focus not in the slide list), Mod+D duplicates the shapes.
      run: (s, arg) => (arg !== 'slides' && s.sel.length && !s.editing && !document.activeElement?.closest?.('.slidelist') && command('edit.duplicate') ? run(s, 'edit.duplicate') : s.tryChange('Duplicate slide', () => {
        const idx = selectedSlides(s);
        const copies = idx.map((i) => cloneSlide(s.deck.slides[i]!));
        const at = idx.at(-1)! + 1;
        s.deck.slides.splice(at, 0, ...copies);
        s.cur = at; s.slideSel = copies.map((_, k) => at + k);
      })),
      enabled: (s) => (s.deck.slides.length > 0 && s.view.mode !== 'master') || s.sel.length > 0,
    },
    {
      id: 'slide.delete', label: 'Delete slide', group: 'Slides',
      run: (s) => s.tryChange('Delete slide', () => {
        const idx = selectedSlides(s);
        const ids = new Set(idx.map((i) => s.deck.slides[i]!.id));
        // Sections that start on a deleted slide move to the next remaining one.
        const remaining = s.deck.slides.filter((x) => !ids.has(x.id));
        for (const sec of s.deck.sections) if (ids.has(sec.first)) {
          const from = s.deck.slides.findIndex((x) => x.id === sec.first);
          const next = s.deck.slides.slice(from).find((x) => !ids.has(x.id));
          if (next) sec.first = next.id;
        }
        s.deck.sections = s.deck.sections.filter((sec) => remaining.some((x) => x.id === sec.first)).filter((sec, i, a) => a.findIndex((o) => o.first === sec.first) === i);
        for (const cs of s.deck.customShows) cs.slides = cs.slides.filter((id) => !ids.has(id));
        s.deck.slides = remaining;
        s.cur = Math.min(idx[0]!, s.deck.slides.length - 1);
        s.slideSel = [Math.max(0, s.cur)];
      }),
      enabled: (s) => s.deck.slides.length > 0 && s.view.mode !== 'master',
    },
    {
      id: 'slide.hide', label: 'Hide slide', group: 'Slides',
      active: (s) => !!s.slide?.hidden,
      run: (s) => s.tryChange('Hide slide', () => { const on = !s.slide?.hidden; for (const i of selectedSlides(s)) s.deck.slides[i]!.hidden = on || undefined; }),
      enabled: (s) => !!s.slide,
    },
    {
      id: 'slide.move', label: 'Move slides', group: 'Slides', hidden: true,
      run: (s, arg) => {
        const { from, to } = arg as { from: number[]; to: number };
        s.tryChange('Move slides', () => {
          const moving = from.map((i) => s.deck.slides[i]!).filter(Boolean);
          const before = from.filter((i) => i < to).length;
          s.deck.slides = s.deck.slides.filter((x) => !moving.includes(x));
          const at = Math.max(0, Math.min(s.deck.slides.length, to - before));
          s.deck.slides.splice(at, 0, ...moving);
          s.cur = at; s.slideSel = moving.map((_, k) => at + k);
        });
      },
    },
    { id: 'slide.moveUp', label: 'Move slide up', group: 'Slides', run: (s) => { const i = Math.min(...selectedSlides(s)); if (i > 0) run(s, 'slide.move', { from: selectedSlides(s), to: i - 1 }); } },
    { id: 'slide.moveDown', label: 'Move slide down', group: 'Slides', run: (s) => { const idx = selectedSlides(s); const i = Math.max(...idx); if (i < s.deck.slides.length - 1) run(s, 'slide.move', { from: idx, to: i + 2 }); } },
    {
      id: 'slide.copy', label: 'Copy slides', group: 'Slides', hidden: true,
      run: (s) => { slideClip = selectedSlides(s).map((i) => structuredClone(s.deck.slides[i]!)); s.notify(`${slideClip.length} slide${slideClip.length === 1 ? '' : 's'} copied`, 1500); },
    },
    { id: 'slide.cut', label: 'Cut slides', group: 'Slides', hidden: true, run: (s) => { run(s, 'slide.copy'); run(s, 'slide.delete'); } },
    {
      id: 'slide.paste', label: 'Paste slides', group: 'Slides', hidden: true, enabled: () => slideClip.length > 0,
      run: (s) => s.tryChange('Paste slides', () => {
        const at = s.cur + 1;
        const copies = slideClip.map((x) => {
          const c = cloneSlide(x);
          if (!s.deck.masters.some((m) => m.layouts.some((l) => l.id === c.layout))) c.layout = layoutFor(s).id;
          return c;
        });
        s.deck.slides.splice(at, 0, ...copies);
        s.cur = at; s.slideSel = copies.map((_, k) => at + k);
      }),
    },
    {
      id: 'slide.layout', label: 'Change layout', group: 'Slides', hidden: true,
      run: (s, layoutId) => s.tryChange('Layout', () => {
        for (const i of selectedSlides(s)) applyLayout(s, s.deck.slides[i]!, String(layoutId));
      }),
    },
    {
      id: 'slide.reset', label: 'Reset slide', group: 'Slides',
      run: (s) => s.tryChange('Reset slide', () => { for (const i of selectedSlides(s)) applyLayout(s, s.deck.slides[i]!, s.deck.slides[i]!.layout, true); }),
      enabled: (s) => !!s.slide,
    },
    // ----- Sections -----
    {
      id: 'section.add', label: 'Add section', group: 'Slides',
      run: (s, name) => s.tryChange('Add section', () => {
        const slide = s.slide;
        if (!slide) return;
        if (!s.deck.sections.length && s.cur > 0) s.deck.sections.push({ id: uid('x'), name: 'Default Section', first: s.deck.slides[0]!.id });
        s.deck.sections = s.deck.sections.filter((x) => x.first !== slide.id);
        s.deck.sections.push({ id: uid('x'), name: typeof name === 'string' && name ? name : 'Untitled Section', first: slide.id });
        const order = new Map(s.deck.slides.map((x, i) => [x.id, i]));
        s.deck.sections.sort((a, b) => (order.get(a.first) ?? 0) - (order.get(b.first) ?? 0));
      }),
      enabled: (s) => !!s.slide,
    },
    { id: 'section.rename', label: 'Rename section', group: 'Slides', hidden: true, run: (s, id) => openDialog(s, 'renameSection', id) },
    {
      id: 'section.remove', label: 'Remove section', group: 'Slides', hidden: true,
      run: (s, id) => s.tryChange('Remove section', () => { s.deck.sections = s.deck.sections.filter((x) => x.id !== id); }),
    },
    {
      id: 'section.removeWithSlides', label: 'Remove section and slides', group: 'Slides', hidden: true,
      run: (s, id) => s.tryChange('Remove section', () => {
        const secs = s.deck.sections;
        const i = secs.findIndex((x) => x.id === id);
        if (i < 0) return;
        const from = s.deck.slides.findIndex((x) => x.id === secs[i]!.first);
        const next = secs[i + 1] ? s.deck.slides.findIndex((x) => x.id === secs[i + 1]!.first) : s.deck.slides.length;
        s.deck.slides.splice(from, next - from);
        secs.splice(i, 1);
      }),
    },
    { id: 'section.collapseAll', label: 'Collapse all sections', group: 'Slides', run: (s) => s.tryChange('!Collapse', () => { for (const x of s.deck.sections) x.collapsed = true; }) },
    { id: 'section.expandAll', label: 'Expand all sections', group: 'Slides', run: (s) => s.tryChange('!Expand', () => { for (const x of s.deck.sections) x.collapsed = false; }) },
    // ----- View -----
    { id: 'view.mode', label: 'View', hidden: true, run: (s, m) => setMode(s, m as ViewMode) },
    { id: 'view.normal', label: 'Normal view', group: 'View', active: (s) => s.view.mode === 'normal', run: (s) => setMode(s, 'normal') },
    { id: 'view.outline', label: 'Outline view', group: 'View', active: (s) => s.view.mode === 'outline', run: (s) => setMode(s, 'outline') },
    { id: 'view.sorter', label: 'Slide sorter', group: 'View', active: (s) => s.view.mode === 'sorter', run: (s) => setMode(s, 'sorter') },
    { id: 'view.notesPage', label: 'Notes page', group: 'View', active: (s) => s.view.mode === 'notesPage', run: (s) => setMode(s, 'notesPage') },
    { id: 'view.reading', label: 'Reading view', group: 'View', active: (s) => s.view.mode === 'reading', run: (s) => setMode(s, 'reading') },
    { id: 'view.master', label: 'Slide master', group: 'View', active: (s) => s.view.mode === 'master', run: (s) => setMode(s, s.view.mode === 'master' ? 'normal' : 'master') },
    { id: 'view.zoomIn', label: 'Zoom in', group: 'View', keys: 'Mod+Alt+=', run: (s) => { const z = typeof s.view.zoom === 'number' ? s.view.zoom : (s.ext.fitScale as number) ?? 1; s.view.zoom = Math.min(4, Math.round((z + 0.1) * 10) / 10); s.emit(); } },
    { id: 'view.zoomOut', label: 'Zoom out', group: 'View', keys: 'Mod+Alt+-', run: (s) => { const z = typeof s.view.zoom === 'number' ? s.view.zoom : (s.ext.fitScale as number) ?? 1; s.view.zoom = Math.max(0.1, Math.round((z - 0.1) * 10) / 10); s.emit(); } },
    { id: 'view.fit', label: 'Fit to window', group: 'View', active: (s) => s.view.zoom === 'fit', run: (s) => { s.view.zoom = 'fit'; s.emit(); } },
    { id: 'view.zoom100', label: 'Zoom to 100%', group: 'View', run: (s) => { s.view.zoom = 1; s.emit(); } },
    { id: 'view.ruler', label: 'Ruler', group: 'View', active: (s) => s.view.ruler, run: (s) => { s.view.ruler = !s.view.ruler; s.emit(); } },
    { id: 'view.gridlines', label: 'Gridlines', group: 'View', keys: 'Shift+F9', active: (s) => s.view.grid, run: (s) => { s.view.grid = !s.view.grid; s.emit(); } },
    { id: 'view.guides', label: 'Guides', group: 'View', keys: 'Alt+F9', active: (s) => s.view.guides, run: (s) => { s.view.guides = !s.view.guides; if (s.view.guides && !s.view.guideLines.x.length && !s.view.guideLines.y.length) s.view.guideLines = { x: [s.deck.w / 2], y: [s.deck.h / 2] }; s.emit(); } },
    { id: 'view.notes', label: 'Notes', group: 'View', active: (s) => s.view.notes, run: (s) => { s.view.notes = !s.view.notes; s.emit(); } },
    { id: 'view.thumbs', label: 'Slide thumbnails', group: 'View', active: (s) => s.view.thumbs, run: (s) => { s.view.thumbs = !s.view.thumbs; s.emit(); } },
    { id: 'view.color', label: 'Color', group: 'View', active: (s) => s.view.grayscale === 'color', run: (s) => { s.view.grayscale = 'color'; s.emit(); } },
    { id: 'view.grayscale', label: 'Grayscale', group: 'View', active: (s) => s.view.grayscale === 'gray', run: (s) => { s.view.grayscale = 'gray'; s.emit(); } },
    { id: 'view.blackWhite', label: 'Black and white', group: 'View', active: (s) => s.view.grayscale === 'bw', run: (s) => { s.view.grayscale = 'bw'; s.emit(); } },
    {
      id: 'view.theme', label: 'Switch light / dark interface', group: 'View',
      run: (s) => {
        const dark = s.view.theme === 'dark' || (s.view.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
        s.view.theme = dark ? 'light' : 'dark';
        try { localStorage.setItem('clerdoframe.theme', s.view.theme); } catch { /* ignore */ }
        s.emit();
      },
    },
    { id: 'view.panel', label: 'Show or hide the tool panel', group: 'View', keys: 'Mod+F1', run: (s) => { s.view.panel = s.view.panel ? null : 'home'; s.emit(); } },
    { id: 'view.nextSlide', label: 'Next slide', group: 'View', keys: 'PageDown', hidden: true, run: (s) => s.goto(s.cur + 1) },
    { id: 'view.prevSlide', label: 'Previous slide', group: 'View', keys: 'PageUp', hidden: true, run: (s) => s.goto(s.cur - 1) },
  ]);

  const slideMenu = (s: FrameStore) => [
    { label: 'Cut', command: 'slide.cut', keys: 'Mod+X' },
    { label: 'Copy', command: 'slide.copy', keys: 'Mod+C' },
    { label: 'Paste', command: 'slide.paste', keys: 'Mod+V', disabled: !slideClip.length },
    { label: '', sep: true },
    { label: 'New slide', command: 'slide.new', keys: 'Mod+M' },
    { label: 'Duplicate slide', command: 'slide.duplicate', arg: 'slides', keys: 'Mod+D' },
    { label: 'Delete slide', command: 'slide.delete' },
    { label: '', sep: true },
    { label: 'Add section', command: 'section.add' },
    { label: 'Layout…', run: (st: FrameStore) => { st.view.panel = 'home'; st.emit(); } },
    { label: 'Reset slide', command: 'slide.reset' },
    { label: 'Format background…', command: 'design.background' },
    { label: s.slide?.hidden ? 'Show slide' : 'Hide slide', command: 'slide.hide' },
  ];
  registerMenu({ kind: 'slide', items: (s) => slideMenu(s) });
  registerMenu({ kind: 'slidelist', items: () => [{ label: 'New slide', command: 'slide.new' }, { label: 'Paste', command: 'slide.paste', disabled: !slideClip.length }, { label: 'Add section', command: 'section.add' }] });
  registerMenu({
    kind: 'section', items: (_s, id) => [
      { label: 'Rename section', command: 'section.rename', arg: id },
      { label: 'Remove section', command: 'section.remove', arg: id },
      { label: 'Remove section and slides', command: 'section.removeWithSlides', arg: id },
      { label: '', sep: true },
      { label: 'Collapse all', command: 'section.collapseAll' },
      { label: 'Expand all', command: 'section.expandAll' },
    ],
  });
  registerCoreUi();
};

/** Moves a slide to another layout, keeping its content in matching placeholders. */
export const applyLayout = (s: FrameStore, slide: Slide, layoutId: Id, reset = false): void => {
  let layout = null;
  for (const m of s.deck.masters) { const l = m.layouts.find((x) => x.id === layoutId); if (l) { layout = l; break; } }
  if (!layout) return;
  const fresh = newSlide(layout);
  const used = new Set<Shape>();
  const kept: Shape[] = [];
  for (const ph of fresh.shapes) {
    const match = slide.shapes.find((x) => !used.has(x) && x.ph && (x.ph.type === ph.ph!.type || (x.ph.idx !== undefined && x.ph.idx === ph.ph!.idx)
      || (['body', 'obj'].includes(x.ph.type) && ['body', 'obj'].includes(ph.ph!.type))));
    if (match) {
      used.add(match);
      if (reset || match.kind !== 'shape') { kept.push(reset && match.kind === 'shape' ? { ...ph, id: match.id, text: match.text } as Shape : { ...match, x: ph.x, y: ph.y, w: ph.w, h: ph.h, ph: ph.ph } as Shape); }
      else kept.push({ ...match, x: ph.x, y: ph.y, w: ph.w, h: ph.h, ph: ph.ph });
    } else kept.push(ph);
  }
  // Content from placeholders the new layout doesn't have stays on the slide as ordinary shapes.
  const others = slide.shapes.filter((x) => !used.has(x) && !(x.ph && x.kind === 'shape' && !(x.text?.paras.some((p) => p.runs.some((r) => r.text)))))
    .map((x) => (x.ph && !['dt', 'ftr', 'sldNum'].includes(x.ph.type) ? { ...x, ph: undefined } : x));
  slide.layout = layout.id;
  slide.shapes = [...kept, ...others];
  if (reset) slide.background = undefined;
};
