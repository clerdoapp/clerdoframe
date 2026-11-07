import { registerCommands } from '../../app/commands';
import { registerMenu } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { registerFormatCommands } from './commands';
import { registerFormatDialogs } from './dialogs';
import { registerHome } from './home';
import { applyQuickStyle } from './ops';
import { registerFormatPane } from './pane';
import { registerSelectionPane } from './selection';
import './format.css';

/** Reopens the context menu at the same spot with the align items. */
const alignMenu = (s: FrameStore, x: number, y: number) => { s.menu = { x, y, kind: 'format.align' }; s.emit(); };

/** Home tool panel, the Format and Selection panes, arrange/align, find and replace. */
export const registerFormat = (): void => {
  registerFormatCommands();
  registerCommands([
    { id: 'format.quickStyle', label: 'Shape style', group: 'Format', hidden: true, enabled: (s) => s.sel.length > 0, run: (s, i) => s.tryChange('Shape style', () => applyQuickStyle(s, Number(i) || 0)) },
  ]);
  registerHome();
  registerFormatPane();
  registerSelectionPane();
  registerFormatDialogs();
  registerMenu({
    kind: 'shape', order: 50,
    items: (s) => {
      if (!s.sel.length) return [];
      const at = s.menu ? { x: s.menu.x, y: s.menu.y } : { x: 200, y: 200 };
      return [
        { label: 'Bring to front', command: 'arrange.front', keys: 'Mod+Shift+]' },
        { label: 'Send to back', command: 'arrange.back', keys: 'Mod+Shift+[' },
        { label: 'Bring forward', command: 'arrange.forward', keys: 'Mod+]' },
        { label: 'Send backward', command: 'arrange.backward', keys: 'Mod+[' },
        { label: 'Align…', run: (st) => alignMenu(st, at.x, at.y) },
        { label: '', sep: true },
        { label: 'Format shape…', command: 'format.pane', arg: 'fill', keys: 'Mod+1' },
        { label: 'Size and position…', command: 'format.sizePosition' },
        { label: 'Edit alt text…', command: 'format.altText' },
        { label: 'Save as picture…', command: 'format.savePicture' },
      ];
    },
  });
  registerMenu({
    kind: 'format.align',
    items: (s) => [
      { label: 'Align left', command: 'align.left' },
      { label: 'Align center', command: 'align.center' },
      { label: 'Align right', command: 'align.right' },
      { label: 'Align top', command: 'align.top' },
      { label: 'Align middle', command: 'align.middle' },
      { label: 'Align bottom', command: 'align.bottom' },
      { label: '', sep: true },
      { label: 'Distribute horizontally', command: 'align.distributeH' },
      { label: 'Distribute vertically', command: 'align.distributeV' },
      { label: '', sep: true },
      { label: s.ext.alignToSlide === true || (s.ext.alignToSlide === undefined && s.sel.length < 2) ? 'Aligning to slide (switch)' : 'Aligning to selection (switch)', command: 'align.toSlide' },
    ],
  });
};
