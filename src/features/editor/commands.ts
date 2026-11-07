import { openDialog, registerCommands, run, type Command } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import {
  uid, walkShapes,
  type AutoNumber, type AutoShape, type BulletSpec, type Color, type Group, type Id, type ParaStyle, type RunStyle, type Shape, type TextBody,
} from '../../model/deck';
import { canHoldText } from './body';
import { copyShapes, handlePastedText, pasteFromSystem, pasteShapes, shapeClip, writeSystemText, type PasteMode } from './clipboard';
import { ancestorsOf, fitGroup, groupFrame, routeConnectors, ungroupChildren } from './geom';
import { begin, commit, session, wantOnStart } from './session';
import {
  applyBodyProps, applyParaStyle, applyRunStyle, changeCase, currentParaStyle, currentRunStyle, selectedText, shiftLevel, textSelection,
} from './textOps';
import { collapsed, rangeText, type CaseMode } from './textModel';

/** Text formatting, shape editing, clipboard, grouping, nudging and the format painter. */

// ---------- Selection helpers ----------

export const topSelected = (s: FrameStore): Shape[] => {
  const ids = new Set(s.sel);
  const top = s.shapes();
  return s.selected().filter((x) => !(ancestorsOf(top, x.id) ?? []).some((g) => ids.has(g.id)));
};
const editable = (s: FrameStore): boolean => !s.deck.final && !!s.surface();
const hasSel = (s: FrameStore): boolean => editable(s) && s.sel.length > 0;
const hasText = (s: FrameStore): boolean => !!s.editing || s.selected().some((x) => x.kind === 'shape' || x.kind === 'table' || x.kind === 'group');
const unlockedSel = (s: FrameStore): Shape[] => topSelected(s).filter((x) => !x.locked);

/** The list that holds a shape and its parent group. */
const holder = (s: FrameStore, id: Id): { list: Shape[]; group: Group | null } | null => s.parentList(id);

// ---------- Text commands ----------

const toggle = (key: 'bold' | 'italic', label: string): ((s: FrameStore) => void) => (s) => {
  const on = !!currentRunStyle(s)[key];
  applyRunStyle(s, { [key]: !on } as Partial<RunStyle>);
  void label;
};

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
export const growSize = (n: number, dir: 1 | -1): number => {
  if (dir > 0) return SIZES.find((x) => x > n + 0.01) ?? Math.min(4000, Math.round(n * 1.1));
  return [...SIZES].reverse().find((x) => x < n - 0.01) ?? Math.max(1, Math.round(n * 0.9 * 2) / 2);
};

const align = (a: ParaStyle['align']) => (s: FrameStore) => applyParaStyle(s, { align: a });
const alignActive = (a: ParaStyle['align']) => (s: FrameStore) => (currentParaStyle(s).align ?? 'l') === a;

const BULLET: BulletSpec = { type: 'char', char: '•', font: 'Arial' };

const bulletsOn = (s: FrameStore) => { const b = currentParaStyle(s).bullet; return !!b && b.type === 'char'; };
const numberingOn = (s: FrameStore) => currentParaStyle(s).bullet?.type === 'auto';

/** Turns bullets on with hanging indent defaults when the paragraph has none. */
const listPatch = (b: BulletSpec) => (cur: ParaStyle): Partial<ParaStyle> => {
  if (b.type === 'none') return { bullet: b };
  const hang = (cur.indent ?? 0) < 0;
  return hang ? { bullet: b } : { bullet: b, marginLeft: (cur.marginLeft ?? 0) + 28, indent: -28 };
};
const offPatch = (cur: ParaStyle): Partial<ParaStyle> => ({ bullet: { type: 'none' }, ...((cur.indent ?? 0) < 0 && !cur.level ? { marginLeft: Math.max(0, (cur.marginLeft ?? 0) + (cur.indent ?? 0)), indent: 0 } : {}) });

const runCmd = (id: string, label: string, fn: (s: FrameStore, arg?: unknown) => void, extra: Partial<Command> = {}): Command => ({
  id, label, group: 'Text', inText: true, enabled: hasText, run: fn, ...extra,
});

export const textCommands = (): Command[] => [
  runCmd('text.bold', 'Bold', toggle('bold', 'Bold'), { keys: 'Mod+B', active: (s) => !!currentRunStyle(s).bold }),
  runCmd('text.italic', 'Italic', toggle('italic', 'Italic'), { keys: 'Mod+I', active: (s) => !!currentRunStyle(s).italic }),
  runCmd('text.underline', 'Underline', (s, arg) => {
    const u = typeof arg === 'string' ? (arg as RunStyle['underline']) : undefined;
    const cur = currentRunStyle(s).underline;
    applyRunStyle(s, { underline: u ?? (cur && cur !== 'none' ? 'none' : 'sng') });
  }, { keys: 'Mod+U', active: (s) => { const u = currentRunStyle(s).underline; return !!u && u !== 'none'; } }),
  runCmd('text.strike', 'Strikethrough', (s, arg) => {
    const cur = currentRunStyle(s).strike;
    applyRunStyle(s, { strike: typeof arg === 'string' ? (arg as RunStyle['strike']) : cur && cur !== 'none' ? 'none' : 'sng' });
  }, { active: (s) => { const u = currentRunStyle(s).strike; return !!u && u !== 'none'; } }),
  runCmd('text.superscript', 'Superscript', (s) => applyRunStyle(s, { baseline: (currentRunStyle(s).baseline ?? 0) > 0 ? undefined : 30 }), { keys: 'Mod+Shift+=', active: (s) => (currentRunStyle(s).baseline ?? 0) > 0 }),
  runCmd('text.subscript', 'Subscript', (s) => applyRunStyle(s, { baseline: (currentRunStyle(s).baseline ?? 0) < 0 ? undefined : -25 }), { keys: 'Mod+=', active: (s) => (currentRunStyle(s).baseline ?? 0) < 0 }),
  runCmd('text.grow', 'Increase font size', (s) => applyRunStyle(s, (c) => ({ size: growSize(c.size ?? 18, 1) })), { keys: 'Mod+Shift+.' }),
  runCmd('text.shrink', 'Decrease font size', (s) => applyRunStyle(s, (c) => ({ size: growSize(c.size ?? 18, -1) })), { keys: 'Mod+Shift+,' }),
  runCmd('text.clear', 'Clear formatting', (s) => applyRunStyle(s, () => ({
    bold: undefined, italic: undefined, underline: undefined, strike: undefined, color: undefined, highlight: undefined, baseline: undefined, caps: undefined,
    spacing: undefined, font: undefined, size: undefined, fill: undefined, outline: undefined, shadow: undefined,
  })), { keys: 'Mod+Space' }),
  runCmd('text.alignLeft', 'Align left', align('l'), { keys: 'Mod+L', active: alignActive('l') }),
  runCmd('text.alignCenter', 'Center', align('ctr'), { keys: 'Mod+E', active: alignActive('ctr') }),
  runCmd('text.alignRight', 'Align right', align('r'), { keys: 'Mod+R', active: alignActive('r') }),
  runCmd('text.justify', 'Justify', align('just'), { keys: 'Mod+J', active: alignActive('just') }),
  runCmd('text.align', 'Align text', (s, a) => applyParaStyle(s, { align: a as ParaStyle['align'] }), { hidden: true }),
  runCmd('text.bullets', 'Bullets', (s, arg) => {
    if (arg && typeof arg === 'object') { applyParaStyle(s, listPatch(arg as BulletSpec)); return; }
    applyParaStyle(s, bulletsOn(s) ? offPatch : listPatch(BULLET));
  }, { active: bulletsOn }),
  runCmd('text.numbering', 'Numbering', (s, arg) => {
    if (typeof arg === 'string') { applyParaStyle(s, listPatch({ type: 'auto', scheme: arg as AutoNumber })); return; }
    applyParaStyle(s, numberingOn(s) ? offPatch : listPatch({ type: 'auto', scheme: 'arabicPeriod' }));
  }, { active: numberingOn }),
  runCmd('text.bulletStyle', 'Bullet style', (s, b) => applyParaStyle(s, b && (b as BulletSpec).type === 'none' ? offPatch : listPatch((b ?? BULLET) as BulletSpec)), { hidden: true }),
  runCmd('text.numberStyle', 'Numbering style', (s, n) => applyParaStyle(s, listPatch({ type: 'auto', scheme: (typeof n === 'string' ? n : 'arabicPeriod') as AutoNumber })), { hidden: true }),
  runCmd('text.indent', 'Increase list level', (s) => shiftLevel(s, 1)),
  runCmd('text.outdent', 'Decrease list level', (s) => shiftLevel(s, -1)),
  runCmd('text.font', 'Font', (s, f) => { if (typeof f === 'string' && f) applyRunStyle(s, { font: f }); }, { hidden: true }),
  runCmd('text.size', 'Font size', (s, n) => { const v = Number(n); if (Number.isFinite(v) && v > 0) applyRunStyle(s, { size: Math.min(4000, Math.max(1, v)) }); }, { hidden: true }),
  runCmd('text.color', 'Font color', (s, c) => applyRunStyle(s, { color: (c ?? undefined) as Color | undefined, fill: undefined }), { hidden: true }),
  runCmd('text.highlight', 'Highlight', (s, c) => applyRunStyle(s, { highlight: (c ?? undefined) as Color | undefined }), { hidden: true }),
  runCmd('text.case', 'Change case', (s, m) => changeCase(s, (typeof m === 'string' ? m : 'toggle') as CaseMode), { hidden: true, keys: 'Shift+F3' }),
  runCmd('text.spacing', 'Character spacing', (s, n) => applyRunStyle(s, { spacing: Number(n) || undefined }), { hidden: true }),
  runCmd('text.lineSpacing', 'Line spacing', (s, n) => { const v = Number(n); if (v > 0) applyParaStyle(s, { lineSpacing: v, lineSpacingPts: undefined }); }, { hidden: true }),
  runCmd('text.vAlign', 'Align text vertically', (s, v) => applyBodyProps(s, { vAlign: (v as TextBody['vAlign']) ?? 't' }, 'Text alignment'), { hidden: true }),
  runCmd('text.direction', 'Text direction', (s, v) => applyBodyProps(s, { vert: (v as TextBody['vert']) ?? 'horz' }, 'Text direction'), { hidden: true }),
  runCmd('text.columns', 'Columns', (s, n) => { const v = Math.max(1, Math.min(16, Math.round(Number(n) || 1))); applyBodyProps(s, { columns: v > 1 ? v : undefined }, 'Columns'); }, { hidden: true }),
  runCmd('text.autofit', 'Autofit', (s, v) => applyBodyProps(s, { autofit: (v as TextBody['autofit']) ?? 'none', ...(v !== 'shrink' ? { fontScale: undefined } : {}) }, 'Autofit'), { hidden: true }),
  runCmd('text.shadow', 'Text shadow', (s) => applyRunStyle(s, (c) => ({ shadow: c.shadow ? undefined : true })), { active: (s) => !!currentRunStyle(s).shadow }),
  runCmd('text.style', 'Text fill and outline', (s, arg) => {
    const a = (arg ?? {}) as Pick<RunStyle, 'fill' | 'outline' | 'color'>;
    applyRunStyle(s, a);
  }, { hidden: true }),
  runCmd('text.selectAll', 'Select all text', (s) => {
    const ses = session();
    if (!ses || !s.editing) { run(s, 'edit.selectAll'); return; }
    ses.want = { at: 'all' };
    s.emit();
  }, { keys: 'Mod+A', hidden: true, enabled: (s) => !!s.editing }),
  {
    id: 'edit.editText', label: 'Edit text', group: 'Edit', keys: 'F2',
    enabled: (s) => editable(s) && (!!s.editing || canHoldText(s.one())),
    run: (s) => {
      if (s.editing) { stopEditing(s, true); return; }
      const sh = s.one();
      if (!sh || !canHoldText(sh) || sh.locked) return;
      startEditing(s, sh.kind === 'table' ? { shape: sh.id, cell: { r: 0, c: 0 } } : { shape: sh.id }, { at: 'all' });
    },
  },
];

// ---------- Editing on / off ----------

export const startEditing = (store: FrameStore, edit: { shape: Id; cell?: { r: number; c: number } }, want?: NonNullable<ReturnType<typeof session>>['want']): void => {
  if (want) wantOnStart(edit, want);
  if (!store.sel.includes(edit.shape)) store.sel = [edit.shape];
  store.editing = edit;
  if (edit.cell) delete store.ext.tableSel;
  begin(store, edit);
  store.emit();
};

/** Leaves text editing. keepShape selects the shape that was being edited. */
export const stopEditing = (store: FrameStore, keepShape = true): void => {
  const e = store.editing;
  commit();
  if (!e) return;
  store.editing = null;
  store.sel = keepShape ? [e.shape] : [];
  store.emit();
};

/** Selects a text range (Find next). */
export const selectText = (store: FrameStore, a: { shape: Id; cell?: { r: number; c: number }; para: number; start: number; end: number }): void => {
  const want = { range: { start: { p: a.para, o: a.start }, end: { p: a.para, o: a.end } } };
  const ses = session();
  const same = ses && store.editing?.shape === a.shape && store.editing.cell?.r === a.cell?.r && store.editing.cell?.c === a.cell?.c;
  if (same) { ses.want = want; store.emit(); return; }
  if (store.editing) commit();
  startEditing(store, { shape: a.shape, ...(a.cell ? { cell: a.cell } : {}) }, want);
};

// ---------- Shape commands ----------

const deleteShapes = (s: FrameStore): void => {
  const ids = new Set(unlockedSel(s).map((x) => x.id));
  if (!ids.size) return;
  s.tryChange('Delete', () => {
    const prune = (list: Shape[]): Shape[] => list.filter((x) => !ids.has(x.id)).map((x) => (x.kind === 'group' ? { ...x, children: prune(x.children) } : x));
    const top = s.shapes();
    const next = prune(top);
    top.splice(0, top.length, ...next);
    // Groups that lost all but one child dissolve; groups that lost children refit.
    const fix = (list: Shape[]) => {
      for (let i = 0; i < list.length; i++) {
        const x = list[i]!;
        if (x.kind !== 'group') continue;
        fix(x.children);
        if (!x.children.length) { list.splice(i--, 1); continue; }
        if (x.children.length === 1) { list.splice(i, 1, ...ungroupChildren(x)); continue; }
        fitGroup(x);
      }
    };
    fix(top);
    if (s.slide) s.slide.animations = s.slide.animations.filter((a) => !ids.has(a.shape));
    routeConnectors(top);
    s.sel = [];
    s.editing = null;
  });
};

const duplicate = (s: FrameStore): void => {
  const shapes = unlockedSel(s);
  if (!shapes.length) return;
  s.tryChange('Duplicate', () => {
    const ids: Id[] = [];
    for (const x of shapes) {
      const h = holder(s, x.id);
      if (!h) continue;
      const copy = freshCopy(x);
      copy.x += 16 / scaleIn(s, x); copy.y += 16 / scaleIn(s, x);
      h.list.splice(h.list.indexOf(x) + 1 + ids.filter((i) => h.list.some((y) => y.id === i)).length, 0, copy);
      ids.push(copy.id);
      if (h.group) fitGroup(h.group);
    }
    s.sel = ids;
  });
};

const scaleIn = (s: FrameStore, x: Shape): number => {
  const gs = ancestorsOf(s.shapes(), x.id) ?? [];
  let k = 1;
  for (const g of gs) { const cb = g.childBox ?? { w: g.w }; k *= cb.w ? g.w / cb.w : 1; }
  return k || 1;
};

export const freshCopy = (x: Shape): Shape => {
  const c = structuredClone(x);
  walkShapes([c], (y) => { y.id = uid('s'); });
  if (c.ph) delete c.ph;
  return c;
};

/** Groups the selected shapes (they must share a parent list). */
export const groupSelection = (s: FrameStore, label = 'Group'): void => {
  const shapes = unlockedSel(s);
  if (shapes.length < 2) return;
  const h = holder(s, shapes[0]!.id);
  if (!h || !shapes.every((x) => h.list.includes(x))) { s.notify('Shapes in different groups cannot be grouped together.'); return; }
  s.tryChange(label, () => {
    const order = shapes.map((x) => h.list.indexOf(x)).sort((a, b) => a - b);
    const members = order.map((i) => h.list[i]!);
    const b = groupFrame(members);
    const g: Group = {
      id: uid('s'), kind: 'group', name: nextGroupName(s), x: b.x, y: b.y, w: b.w, h: b.h,
      childBox: { x: b.x, y: b.y, w: b.w, h: b.h }, children: members.map((m) => { const c = structuredClone(m); delete c.ph; return c; }),
    };
    const at = order[order.length - 1]! - (order.length - 1);
    for (const i of [...order].reverse()) h.list.splice(i, 1);
    h.list.splice(at, 0, g);
    if (h.group) fitGroup(h.group);
    s.ext.lastGroup = { id: g.id, members: members.map((m) => m.id) };
    s.sel = [g.id];
  });
};

const nextGroupName = (s: FrameStore): string => {
  const names = new Set<string>();
  walkShapes(s.shapes(), (x) => { names.add(x.name); });
  let n = 1;
  while (names.has(`Group ${n}`)) n++;
  return `Group ${n}`;
};

export const ungroupSelection = (s: FrameStore): void => {
  const groups = unlockedSel(s).filter((x): x is Group => x.kind === 'group');
  if (!groups.length) return;
  s.tryChange('Ungroup', () => {
    const ids: Id[] = [];
    for (const g of groups) {
      const h = holder(s, g.id);
      if (!h) continue;
      const kids = ungroupChildren(g);
      h.list.splice(h.list.indexOf(g), 1, ...kids);
      ids.push(...kids.map((k) => k.id));
      if (h.group) fitGroup(h.group);
      s.ext.lastGroup = { id: g.id, members: kids.map((k) => k.id) };
    }
    s.sel = ids;
  });
};

const regroup = (s: FrameStore): void => {
  const lg = s.ext.lastGroup as { id: Id; members: Id[] } | undefined;
  if (!lg) return;
  const live = lg.members.filter((id) => s.shape(id));
  if (live.length < 2) return;
  s.sel = live;
  groupSelection(s, 'Regroup');
};

export const nudge = (s: FrameStore, dx: number, dy: number): void => {
  const shapes = unlockedSel(s);
  if (!shapes.length) return;
  s.tryChange('Nudge', () => {
    const moved = new Set<Id>();
    for (const x of shapes) {
      const k = scaleIn(s, x);
      x.x += dx / k; x.y += dy / k;
      walkShapes([x], (y) => { moved.add(y.id); });
    }
    refitAncestors(s, shapes);
    // Moving a connector by hand unglues it.
    for (const x of shapes) if (x.kind === 'shape' && x.conn && !(x.conn.start && moved.has(x.conn.start.shape)) && !(x.conn.end && moved.has(x.conn.end.shape))) delete x.conn;
    routeConnectors(s.shapes(), moved);
  });
};

/** Refits every group that holds one of the shapes, innermost first. */
export const refitAncestors = (s: FrameStore, shapes: Shape[]): void => {
  const done = new Set<Id>();
  const chains = shapes.map((x) => ancestorsOf(s.shapes(), x.id) ?? []);
  const maxDepth = Math.max(0, ...chains.map((c) => c.length));
  for (let d = maxDepth - 1; d >= 0; d--) for (const c of chains) { const g = c[d]; if (g && !done.has(g.id)) { done.add(g.id); fitGroup(g); } }
};

const gridStep = (s: FrameStore, fine: boolean): number => (fine ? 1 : s.view.snapToGrid ? Math.max(1, s.view.gridSize / 2) : 8);

// ---------- Clipboard commands ----------

const copy = (s: FrameStore): void => {
  const ses = session();
  if (s.editing && ses) {
    if (collapsed(ses.sel)) return;
    writeSystemText(rangeText(ses.paras, ses.sel).replace(/\v/g, '\n'));
    return;
  }
  copyShapes(s, topSelected(s));
};

// ---------- Format painter ----------

let painterAt = 0;

interface ShapeLook { fill?: unknown; line?: unknown; effects?: unknown; geomStyle?: unknown; run?: RunStyle; para?: ParaStyle; body?: Partial<TextBody> }

const lookOf = (s: FrameStore): { kind: 'shape' | 'text'; data: ShapeLook } | null => {
  const run = currentRunStyle(s);
  const para = currentParaStyle(s);
  const runOnly: RunStyle = { ...run }; delete runOnly.link;
  if (s.editing) return { kind: 'text', data: { run: runOnly, para: { align: para.align, lineSpacing: para.lineSpacing, spaceBefore: para.spaceBefore, spaceAfter: para.spaceAfter } } };
  const x = s.one();
  if (!x) return null;
  const d: ShapeLook = { run: runOnly };
  if (x.kind === 'shape') { d.fill = x.fill; d.line = x.line; d.effects = x.effects; if (x.text) d.body = { vAlign: x.text.vAlign, inset: x.text.inset }; }
  else if (x.kind === 'picture') { d.line = x.line; d.effects = x.effects; d.geomStyle = { adjust: x.adjust }; }
  else d.effects = x.effects;
  return { kind: 'shape', data: d };
};

/** Applies the painter's copied look to shapes (or the selected text while editing). */
export const applyPainter = (s: FrameStore, targets: Shape[]): void => {
  const p = s.painter;
  if (!p) return;
  const d = p.data as ShapeLook;
  if (s.editing) {
    if (d.run) applyRunStyle(s, () => ({ ...d.run }));
  } else if (targets.length) {
    s.tryChange('Paste formatting', () => {
      for (const t of targets) {
        if (t.locked) continue;
        if (p.kind === 'shape') {
          if (t.kind === 'shape') {
            if ('fill' in d) { if (d.fill) t.fill = structuredClone(d.fill) as AutoShape['fill']; else delete t.fill; }
            if ('line' in d) { if (d.line) t.line = structuredClone(d.line) as AutoShape['line']; else delete t.line; }
            if (d.body && t.text) Object.assign(t.text, structuredClone(d.body));
          }
          if (t.kind === 'picture' && d.line) t.line = structuredClone(d.line) as AutoShape['line'];
          if ('effects' in d) { if (d.effects) t.effects = structuredClone(d.effects) as Shape['effects']; else delete t.effects; }
        }
      }
    });
    if (d.run) {
      const keep = s.sel;
      s.sel = targets.map((t) => t.id);
      applyRunStyle(s, () => ({ ...d.run }));
      s.sel = keep;
    }
  }
  if (!p.sticky) s.painter = null;
  s.emit();
};

// ---------- Registration ----------

export const registerEditorCommands = (): void => {
  registerCommands([
    ...textCommands(),
    {
      id: 'edit.delete', label: 'Delete', group: 'Edit', keys: 'Delete', altKeys: ['Backspace'],
      enabled: (s) => hasSel(s) && !s.editing, run: deleteShapes,
    },
    {
      id: 'edit.cut', label: 'Cut', group: 'Edit', keys: 'Mod+X', enabled: (s) => !!s.editing || hasSel(s),
      run: (s) => {
        if (s.editing) { document.execCommand('cut'); return; }
        copy(s); deleteShapes(s);
      },
    },
    {
      id: 'edit.copy', label: 'Copy', group: 'Edit', keys: 'Mod+C', enabled: (s) => !!s.editing || s.sel.length > 0,
      run: (s) => { if (s.editing) { document.execCommand('copy'); return; } copy(s); },
    },
    {
      // No shortcut here: Mod+V raises the paste event, which can read pictures from other apps (the canvas and editor handle it).
      id: 'edit.paste', label: 'Paste', group: 'Edit', enabled: editable,
      run: (s, arg) => {
        if (typeof arg === 'string') { handlePastedText(s, arg); return; }
        if (s.editing) { void navigator.clipboard?.readText?.().then((t) => { if (t) import('./textOps').then((m) => m.insertTextAtCaret(s, t)); }).catch(() => s.notify('Use the keyboard shortcut to paste here.')); return; }
        void pasteFromSystem(s);
      },
    },
    {
      id: 'edit.pasteSpecial', label: 'Paste special…', group: 'Edit', keys: 'Mod+Alt+V', enabled: (s) => editable(s) && !!shapeClip(),
      run: (s, mode) => { if (typeof mode === 'string') pasteShapes(s, mode as PasteMode); else openDialog(s, 'edit.pasteSpecial'); },
    },
    {
      // Mod+D reaches this through slide.duplicate, which hands over when shapes are selected.
      id: 'edit.duplicate', label: 'Duplicate', group: 'Edit',
      enabled: (s) => hasSel(s) && !s.editing, run: duplicate,
    },
    { id: 'shape.group', label: 'Group', group: 'Arrange', keys: 'Mod+G', enabled: (s) => unlockedSel(s).length > 1 && !s.editing, run: (s) => groupSelection(s) },
    { id: 'shape.ungroup', label: 'Ungroup', group: 'Arrange', keys: 'Mod+Shift+G', enabled: (s) => unlockedSel(s).some((x) => x.kind === 'group') && !s.editing, run: ungroupSelection },
    { id: 'shape.regroup', label: 'Regroup', group: 'Arrange', enabled: (s) => !!s.ext.lastGroup && !s.editing, run: regroup },
    { id: 'shape.nudgeLeft', label: 'Nudge left', group: 'Arrange', hidden: true, keys: 'ArrowLeft', altKeys: ['Shift+ArrowLeft'], enabled: (s) => hasSel(s) && !s.editing, run: (s) => nudge(s, -gridStep(s, false), 0) },
    { id: 'shape.nudgeRight', label: 'Nudge right', group: 'Arrange', hidden: true, keys: 'ArrowRight', altKeys: ['Shift+ArrowRight'], enabled: (s) => hasSel(s) && !s.editing, run: (s) => nudge(s, gridStep(s, false), 0) },
    { id: 'shape.nudgeUp', label: 'Nudge up', group: 'Arrange', hidden: true, keys: 'ArrowUp', altKeys: ['Shift+ArrowUp'], enabled: (s) => hasSel(s) && !s.editing, run: (s) => nudge(s, 0, -gridStep(s, false)) },
    { id: 'shape.nudgeDown', label: 'Nudge down', group: 'Arrange', hidden: true, keys: 'ArrowDown', altKeys: ['Shift+ArrowDown'], enabled: (s) => hasSel(s) && !s.editing, run: (s) => nudge(s, 0, gridStep(s, false)) },
    { id: 'shape.nudgeLeftFine', label: 'Nudge left 1 px', group: 'Arrange', hidden: true, keys: 'Mod+ArrowLeft', enabled: (s) => hasSel(s) && !s.editing, run: (s) => nudge(s, -1, 0) },
    { id: 'shape.nudgeRightFine', label: 'Nudge right 1 px', group: 'Arrange', hidden: true, keys: 'Mod+ArrowRight', enabled: (s) => hasSel(s) && !s.editing, run: (s) => nudge(s, 1, 0) },
    { id: 'shape.nudgeUpFine', label: 'Nudge up 1 px', group: 'Arrange', hidden: true, keys: 'Mod+ArrowUp', enabled: (s) => hasSel(s) && !s.editing, run: (s) => nudge(s, 0, -1) },
    { id: 'shape.nudgeDownFine', label: 'Nudge down 1 px', group: 'Arrange', hidden: true, keys: 'Mod+ArrowDown', enabled: (s) => hasSel(s) && !s.editing, run: (s) => nudge(s, 0, 1) },
    { id: 'shape.nudge', label: 'Nudge', group: 'Arrange', hidden: true, enabled: hasSel, run: (s, a) => { const d = (a ?? {}) as { dx?: number; dy?: number }; nudge(s, d.dx ?? 0, d.dy ?? 0); } },
    {
      id: 'edit.formatPainter', label: 'Format painter', group: 'Edit', active: (s) => !!s.painter,
      enabled: (s) => !!s.painter || s.sel.length > 0 || !!s.editing,
      run: (s, arg) => {
        // A second press soon after the first (a double click) keeps the painter on.
        if (s.painter && arg !== 'sticky' && arg !== true) {
          if (!s.painter.sticky && Date.now() - painterAt < 450) { s.painter.sticky = true; s.emit(); return; }
          s.painter = null; s.emit(); return;
        }
        const look = lookOf(s);
        if (!look) return;
        painterAt = Date.now();
        s.painter = { ...look, sticky: arg === 'sticky' || arg === true };
        s.emit();
      },
    },
    {
      id: 'edit.copyFormat', label: 'Copy formatting', group: 'Edit', keys: 'Mod+Shift+C', inText: true, enabled: (s) => s.sel.length > 0 || !!s.editing,
      run: (s) => { const look = lookOf(s); if (look) { s.ext.copiedFormat = look; s.notify('Formatting copied', 1200); } },
    },
    {
      id: 'edit.pasteFormat', label: 'Paste formatting', group: 'Edit', keys: 'Mod+Shift+V', inText: true, enabled: (s) => !!s.ext.copiedFormat && (s.sel.length > 0 || !!s.editing),
      run: (s) => {
        const look = s.ext.copiedFormat as { kind: 'shape' | 'text'; data: unknown } | undefined;
        if (!look) return;
        const prev = s.painter;
        s.painter = { ...look, sticky: false };
        applyPainter(s, topSelected(s));
        s.painter = prev;
        s.emit();
      },
    },
    {
      id: 'picture.crop', label: 'Crop', group: 'Picture', active: (s) => !!s.ext.cropping,
      enabled: (s) => !!s.ext.cropping || (s.one()?.kind === 'picture' && !s.one()!.locked),
      run: (s) => {
        if (s.ext.cropping) delete s.ext.cropping; else if (s.one()?.kind === 'picture') s.ext.cropping = s.one()!.id;
        s.emit();
      },
    },
  ]);
  void selectedText;
  void textSelection;
};

