import { openDialog, openPane, registerCommands, run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import type { Effects, Fill, Line } from '../../model/deck';
import {
  alignShapes, alignToSlide, applyEffects, applyFill, applyLine, arrange, distribute, moveBy, resize, rotateBy, slideBounds, topSelected,
  type AlignMode, type ZMode,
} from './ops';
import { savePicture } from './picture';

const hasSel = (s: FrameStore) => s.sel.length > 0;
const unlocked = (s: FrameStore) => topSelected(s).some((x) => !x.locked);

export const registerFormatCommands = (): void => {
  // Shift+] arrives as '}' on most layouts.
  const SHIFTED: Record<string, string> = { 'Mod+Shift+]': 'Mod+Shift+}', 'Mod+Shift+[': 'Mod+Shift+{' };
  const z = (id: string, label: string, mode: ZMode, keys: string) => ({
    id, label, group: 'Arrange', keys, ...(SHIFTED[keys] ? { altKeys: [SHIFTED[keys]!] } : {}), enabled: hasSel,
    run: (s: FrameStore) => s.tryChange(label, () => arrange(s, mode)),
  });
  const al = (id: string, label: string, mode: AlignMode) => ({
    id, label, group: 'Arrange', enabled: hasSel,
    run: (s: FrameStore) => s.tryChange(label, () => alignShapes(s, mode)),
  });
  registerCommands([
    z('arrange.front', 'Bring to front', 'front', 'Mod+Shift+]'),
    z('arrange.back', 'Send to back', 'back', 'Mod+Shift+['),
    z('arrange.forward', 'Bring forward', 'forward', 'Mod+]'),
    z('arrange.backward', 'Send backward', 'backward', 'Mod+['),
    al('align.left', 'Align left', 'left'),
    al('align.center', 'Align center', 'center'),
    al('align.right', 'Align right', 'right'),
    al('align.top', 'Align top', 'top'),
    al('align.middle', 'Align middle', 'middle'),
    al('align.bottom', 'Align bottom', 'bottom'),
    { id: 'align.distributeH', label: 'Distribute horizontally', group: 'Arrange', enabled: (s) => s.sel.length >= (alignToSlide(s) ? 1 : 3), run: (s) => s.tryChange('Distribute', () => distribute(s, 'h')) },
    { id: 'align.distributeV', label: 'Distribute vertically', group: 'Arrange', enabled: (s) => s.sel.length >= (alignToSlide(s) ? 1 : 3), run: (s) => s.tryChange('Distribute', () => distribute(s, 'v')) },
    {
      id: 'align.toSlide', label: 'Align to slide', group: 'Arrange', active: (s) => alignToSlide(s),
      run: (s) => { s.ext.alignToSlide = !alignToSlide(s); s.emit(); },
    },
    { id: 'align.toSelection', label: 'Align selected objects', group: 'Arrange', hidden: true, active: (s) => !alignToSlide(s), run: (s) => { s.ext.alignToSlide = false; s.emit(); } },
    { id: 'shape.rotate90R', label: 'Rotate right 90°', group: 'Arrange', enabled: unlocked, run: (s) => s.tryChange('Rotate', () => { for (const x of topSelected(s)) if (!x.locked) rotateBy(x, 90); }) },
    { id: 'shape.rotate90L', label: 'Rotate left 90°', group: 'Arrange', enabled: unlocked, run: (s) => s.tryChange('Rotate', () => { for (const x of topSelected(s)) if (!x.locked) rotateBy(x, -90); }) },
    { id: 'shape.flipH', label: 'Flip horizontal', group: 'Arrange', enabled: unlocked, run: (s) => s.tryChange('Flip', () => { for (const x of topSelected(s)) if (!x.locked) x.flipH = !x.flipH || undefined; }) },
    { id: 'shape.flipV', label: 'Flip vertical', group: 'Arrange', enabled: unlocked, run: (s) => s.tryChange('Flip', () => { for (const x of topSelected(s)) if (!x.locked) x.flipV = !x.flipV || undefined; }) },
    {
      id: 'shape.rotate', label: 'Rotate', group: 'Arrange', hidden: true, enabled: unlocked,
      run: (s, deg) => s.tryChange('Rotate', () => { for (const x of topSelected(s)) if (!x.locked) x.rot = ((Number(deg) % 360) + 360) % 360 || undefined; }),
    },
    {
      id: 'shape.size', label: 'Size', group: 'Arrange', hidden: true, enabled: unlocked,
      run: (s, arg) => {
        const a = (arg ?? {}) as { w?: number; h?: number };
        s.tryChange('Size', () => { for (const x of topSelected(s)) if (!x.locked) resize(x, a.w ?? x.w, a.h ?? x.h); });
      },
    },
    {
      id: 'shape.position', label: 'Position', group: 'Arrange', hidden: true, enabled: unlocked,
      run: (s, arg) => {
        const a = (arg ?? {}) as { x?: number; y?: number };
        s.tryChange('Position', () => {
          for (const x of topSelected(s)) {
            if (x.locked) continue;
            // Position is the unrotated top-left corner in slide space.
            const tl = topLeft(s, x);
            moveBy(s, x, a.x === undefined ? 0 : a.x - tl.x, a.y === undefined ? 0 : a.y - tl.y);
          }
        });
      },
    },
    { id: 'format.pane', label: 'Format shape', group: 'Format', keys: 'Mod+1', run: (s, tab) => { if (typeof tab === 'string') s.ext.formatTab = tab; s.view.pane = 'format'; s.emit(); } },
    { id: 'format.fill', label: 'Shape fill', group: 'Format', hidden: true, enabled: hasSel, run: (s, f) => s.tryChange('Fill', () => applyFill(s, (f ?? undefined) as Fill | undefined)) },
    { id: 'format.line', label: 'Shape outline', group: 'Format', hidden: true, enabled: hasSel, run: (s, l) => s.tryChange('Outline', () => applyLine(s, (l ?? null) as Partial<Line> | null)) },
    { id: 'format.effects', label: 'Shape effects', group: 'Format', hidden: true, enabled: hasSel, run: (s, e) => s.tryChange('Effects', () => applyEffects(s, (e ?? {}) as Partial<Effects>)) },
    { id: 'format.sizePosition', label: 'Size and position…', group: 'Format', enabled: (s) => s.sel.length > 0, run: (s) => openDialog(s, 'format.sizePosition') },
    { id: 'format.altText', label: 'Alt text…', group: 'Format', enabled: (s) => s.sel.length > 0, run: (s) => openDialog(s, 'format.altText') },
    { id: 'format.savePicture', label: 'Save as picture…', group: 'Format', enabled: hasSel, run: (s) => void savePicture(s) },
    { id: 'arrange.selectionPane', label: 'Selection pane', group: 'Arrange', keys: 'Alt+F10', active: (s) => s.view.pane === 'selection', run: (s) => openPane(s, 'selection') },
    {
      id: 'edit.selectAll', label: 'Select all', group: 'Edit', keys: 'Mod+A',
      run: (s) => { s.select(s.shapes().filter((x) => !x.hidden && !x.locked).map((x) => x.id)); },
    },
    { id: 'edit.find', label: 'Find…', group: 'Edit', keys: 'Mod+F', inText: true, run: (s) => openDialog(s, 'format.find', { replace: false }) },
    { id: 'edit.replace', label: 'Replace…', group: 'Edit', keys: 'Mod+H', inText: true, run: (s) => openDialog(s, 'format.find', { replace: true }) },
    { id: 'edit.replaceFonts', label: 'Replace fonts…', group: 'Edit', run: (s) => openDialog(s, 'format.replaceFonts') },
    { id: 'format.paragraph', label: 'Paragraph…', group: 'Format', run: (s, tab) => openDialog(s, 'format.paragraph', tab) },
    { id: 'format.bullets', label: 'Bullets and numbering…', group: 'Format', run: (s, tab) => openDialog(s, 'format.bullets', tab) },
    { id: 'format.moreShapes', label: 'More shapes', group: 'Insert', hidden: true, run: (s) => { s.view.panel = 'insert'; s.emit(); } },
    { id: 'format.textOptions', label: 'Format text', group: 'Format', hidden: true, run: (s) => run(s, 'format.pane', 'text') },
  ]);
};

/** Unrotated top-left of a shape in slide space. */
export const topLeft = (s: FrameStore, x: Parameters<typeof slideBounds>[1]): { x: number; y: number } => {
  const b = slideBounds(s, { ...x, rot: 0 });
  return { x: b.x, y: b.y };
};
