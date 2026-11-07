import './editor.css';
import { command } from '../../app/commands';
import { registerDialog, registerMenu, type MenuItem } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { geometry } from '../../render/geometry';
import { solveHandle } from '../shapes/engine';
import { canHoldText } from './body';
import { shapeClip } from './clipboard';
import { registerEditorCommands, topSelected } from './commands';
import { setHandleSolver } from './interact';
import { PasteSpecialDialog } from './PasteSpecial';
import { session, setTextRectFn } from './session';
import { collapsed } from './textModel';

/** Editor feature: the canvas interaction engine, text editing, shape editing commands and menus. */
export const registerEditor = (): void => {
  setHandleSolver(solveHandle);
  setTextRectFn((s) => geometry(s.geom || 'rect', s.w, s.h, s.adj, s.path).text ?? { x: 0, y: 0, w: s.w, h: s.h });
  registerEditorCommands();
  registerDialog('edit.pasteSpecial', PasteSpecialDialog);

  const item = (label: string, cmd: string, keys?: string): MenuItem[] => (command(cmd) ? [{ label, command: cmd, ...(keys ? { keys } : {}) }] : []);

  registerMenu({
    kind: 'shape', order: 0,
    items: (s) => {
      const sel = topSelected(s);
      const one = s.one();
      const groups = sel.some((x) => x.kind === 'group');
      const out: MenuItem[] = [
        { label: 'Cut', command: 'edit.cut', keys: 'Mod+X' },
        { label: 'Copy', command: 'edit.copy', keys: 'Mod+C' },
        { label: 'Paste', command: 'edit.paste', keys: 'Mod+V' },
        ...(shapeClip() ? [{ label: 'Paste special…', command: 'edit.pasteSpecial', keys: 'Mod+Alt+V' }] : []),
        { label: 'Duplicate', command: 'edit.duplicate', keys: 'Mod+D' },
        { label: 'Delete', command: 'edit.delete', keys: 'Delete' },
        { label: '', sep: true },
      ];
      if (one && canHoldText(one) && !one.locked) out.push({ label: 'Edit text', command: 'edit.editText', keys: 'F2' });
      if (one?.kind === 'picture' && !one.locked) out.push({ label: 'Crop', command: 'picture.crop' });
      if (sel.length > 1) out.push({ label: 'Group', command: 'shape.group', keys: 'Mod+G' });
      if (groups) out.push({ label: 'Ungroup', command: 'shape.ungroup', keys: 'Mod+Shift+G' });
      if (!groups && s.ext.lastGroup) out.push({ label: 'Regroup', command: 'shape.regroup' });
      out.push({ label: 'Copy formatting', command: 'edit.copyFormat', keys: 'Mod+Shift+C' });
      if (s.ext.copiedFormat) out.push({ label: 'Paste formatting', command: 'edit.pasteFormat', keys: 'Mod+Shift+V' });
      // The format team adds arrange and format items; keep the basics when they're missing.
      if (!command('arrange.front')) out.push(...item('Format shape…', 'format.pane', 'Mod+1'));
      return out;
    },
  });

  registerMenu({
    kind: 'canvas', order: 0,
    items: (s) => [
      { label: 'Paste', command: 'edit.paste', keys: 'Mod+V' },
      ...(shapeClip() ? [{ label: 'Paste special…', command: 'edit.pasteSpecial', keys: 'Mod+Alt+V' }] : []),
      { label: '', sep: true },
      ...(s.view.mode === 'normal' ? [
        { label: 'Layout…', run: (st: FrameStore) => { st.view.panel = 'home'; st.emit(); } },
        ...item('Reset slide', 'slide.reset'),
      ] : []),
      ...item('Format background…', 'design.background'),
      { label: '', sep: true },
      { label: s.view.grid ? 'Hide gridlines' : 'Show gridlines', command: 'view.gridlines', keys: 'Shift+F9' },
      { label: s.view.guides ? 'Hide guides' : 'Show guides', command: 'view.guides', keys: 'Alt+F9' },
      { label: s.view.ruler ? 'Hide ruler' : 'Show ruler', command: 'view.ruler' },
      ...item('Grid and guides…', 'view.gridSettings'),
    ],
  });

  registerMenu({
    kind: 'text', order: 0,
    items: () => {
      const ses = session();
      const sel = !!ses && !collapsed(ses.sel);
      return [
        { label: 'Cut', command: 'edit.cut', keys: 'Mod+X', disabled: !sel },
        { label: 'Copy', command: 'edit.copy', keys: 'Mod+C', disabled: !sel },
        { label: 'Paste', command: 'edit.paste', keys: 'Mod+V' },
        { label: '', sep: true },
        { label: 'Bold', command: 'text.bold', keys: 'Mod+B' },
        { label: 'Italic', command: 'text.italic', keys: 'Mod+I' },
        { label: 'Underline', command: 'text.underline', keys: 'Mod+U' },
        { label: '', sep: true },
        { label: 'Bullets', command: 'text.bullets' },
        { label: 'Numbering', command: 'text.numbering' },
        ...item('Link…', 'text.link', 'Mod+Alt+K'),
        ...item('Paragraph…', 'format.paragraph'),
        { label: '', sep: true },
        { label: 'Select all', command: 'text.selectAll', keys: 'Mod+A' },
        { label: 'Done editing', run: (st: FrameStore) => { const id = st.editing?.shape; st.editing = null; if (id) st.sel = [id]; st.emit(); } },
      ];
    },
  });
};
