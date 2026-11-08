/** gpresent feature module: auto-play, publish to the web, version history, import theme, file and view extras. */
import { createElement } from 'react';
import { BookOpenText, Copy, Globe, History as HistoryIcon, Palette, Timer } from 'lucide-react';
import { openDialog, openPane, registerCommands, run } from '../../app/commands';
import { registerDialog, registerMenu, registerOverlay, registerPane, registerPanelSection } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { captionsSupported } from '../show/captions';
import { showBarExtras, showOf } from '../show/controller';
import { AutoplayDialog, AutoplayMenu, AutoplaySection, CaptionSettings, startAutoplay, stopAutoplay, type AutoArg } from './autoplay';
import { AccessibleView, ImportThemeDialog, MakeCopyDialog, NameVersionDialog, PublishDialog } from './dialogs';
import { registerExtras } from './extras';
import { historyOf } from './history';
import { registerHtmlFormat } from './publish';
import { compactOn, GPresentRoot, setCompact } from './root';
import { openVersions, versionsOpen } from './versionsView';
import './gpresent.css';

const selected = (s: FrameStore): number[] => [...new Set(s.slideSel.length ? s.slideSel : [s.cur])].sort((a, b) => a - b);
const isAutoArg = (a: unknown): a is AutoArg => !!a && typeof a === 'object' && typeof (a as AutoArg).seconds === 'number';
const toolBtn = (s: FrameStore, id: string, I: typeof Timer, label: string) =>
  createElement('button', { className: 'tool', onClick: () => run(s, id) }, createElement(I, { size: 16, strokeWidth: 1.9 }), createElement('span', null, label));

let done = false;
export const registerGPresent = (): void => {
  if (done) return;
  done = true;
  registerExtras();
  registerHtmlFormat();

  registerOverlay({ id: 'gpresent', render: (s) => createElement(GPresentRoot, { store: s }) });
  registerPane({ id: 'gp.html', title: 'Accessible view', width: 380, render: (s) => createElement(AccessibleView, { store: s }) });
  registerDialog('gp.autoplay', AutoplayDialog);
  registerDialog('file.publish', PublishDialog);
  registerDialog('gp.importTheme', ImportThemeDialog);
  registerDialog('gp.makeCopy', MakeCopyDialog);
  registerDialog('gp.nameVersion', NameVersionDialog);

  showBarExtras.push(
    { id: 'gp.autoplay', order: 10, render: (c) => createElement(AutoplayMenu, { c }) },
    { id: 'gp.captions', order: 20, render: (c) => (captionsSupported() ? createElement(CaptionSettings, { c }) : null) },
  );

  registerPanelSection({ tab: 'show', title: 'Auto-play', order: 15, render: (s) => createElement(AutoplaySection, { store: s }) });
  registerPanelSection({
    tab: 'file', title: 'Share and history', order: 35, render: (s) => createElement('div', { className: 'toollist' },
      toolBtn(s, 'file.publish', Globe, 'Publish to the web…'),
      toolBtn(s, 'view.html', BookOpenText, 'Accessible view'),
      toolBtn(s, 'file.versionHistory', HistoryIcon, 'Version history'),
      toolBtn(s, 'file.makeCopy', Copy, 'Make a copy…')),
  });
  registerPanelSection({ tab: 'design', title: 'Import', order: 90, render: (s) => createElement('div', { className: 'toollist' }, toolBtn(s, 'design.importTheme', Palette, 'Import theme…')) });

  registerMenu({
    kind: 'slide', order: 60, items: (s) => {
      const idx = selected(s);
      const n = s.deck.slides.length;
      return [
        { label: 'Move to start', command: 'slide.moveToStart', disabled: idx.every((v, k) => v === k) },
        { label: 'Move to end', command: 'slide.moveToEnd', disabled: idx.every((v, k) => v === n - idx.length + k) },
        { label: 'Apply background to layout', command: 'slide.applyBackgroundToLayout', disabled: !s.slide?.background },
      ];
    },
  });

  registerCommands([
    {
      id: 'show.autoplay', label: 'Auto-play slide show…', group: 'Present', enabled: (s) => s.deck.slides.length > 0,
      active: (s) => !!showOf(s)?.autoAdvance,
      run: (s, arg) => { if (isAutoArg(arg)) startAutoplay(s, arg); else openDialog(s, 'gp.autoplay'); },
    },
    { id: 'show.autoplayStop', label: 'Stop auto-play', group: 'Present', hidden: true, run: (s) => { const c = showOf(s); if (c) stopAutoplay(c); } },
    { id: 'file.publish', label: 'Publish to the web…', group: 'File', enabled: (s) => s.deck.slides.length > 0, run: (s) => openDialog(s, 'file.publish') },
    { id: 'view.html', label: 'Accessible view', group: 'View', active: (s) => s.view.pane === 'gp.html', run: (s) => openPane(s, 'gp.html') },
    { id: 'file.versionHistory', label: 'Version history', group: 'File', keys: 'Mod+Alt+Shift+H', active: (s) => versionsOpen(s), run: (s) => openVersions(s, !versionsOpen(s)) },
    { id: 'file.nameVersion', label: 'Name current version…', group: 'File', run: (s) => openDialog(s, 'gp.nameVersion') },
    {
      id: 'file.saveVersion', label: 'Keep a version now', group: 'File', hidden: true,
      run: (s) => { void historyOf(s).snapshot('auto').catch(() => s.notify('The version could not be saved. Storage may be full.')); },
    },
    { id: 'design.importTheme', label: 'Import theme…', group: 'Design', run: (s) => openDialog(s, 'gp.importTheme') },
    { id: 'file.makeCopy', label: 'Make a copy…', group: 'File', run: (s) => openDialog(s, 'gp.makeCopy') },
    {
      id: 'file.rename', label: 'Rename presentation', group: 'File',
      run: (s) => {
        if (compactOn(s)) setCompact(s, false);
        const el = document.querySelector<HTMLInputElement>('.topbar .docname');
        if (el) { el.focus(); el.select(); } else s.notify('The name field is not shown.');
      },
    },
    {
      id: 'slide.moveToStart', label: 'Move slide to start', group: 'Slides', enabled: (s) => s.deck.slides.length > 1 && s.view.mode !== 'master',
      run: (s) => run(s, 'slide.move', { from: selected(s), to: 0 }),
    },
    {
      id: 'slide.moveToEnd', label: 'Move slide to end', group: 'Slides', enabled: (s) => s.deck.slides.length > 1 && s.view.mode !== 'master',
      run: (s) => run(s, 'slide.move', { from: selected(s), to: s.deck.slides.length }),
    },
    {
      id: 'slide.applyBackgroundToLayout', label: 'Apply background to layout', group: 'Slides', enabled: (s) => !!s.slide && s.view.mode !== 'master',
      run: (s) => {
        const sl = s.slide;
        if (!sl) return;
        if (!sl.background) { s.notify('This slide already uses its layout’s background.'); return; }
        const bg = structuredClone(sl.background);
        const { layout } = s.masterOf(sl);
        if (s.tryChange('Apply background to layout', () => {
          layout.background = { fill: bg.fill };
          if (bg.hideMasterGraphics) layout.hideMasterGraphics = true;
        })) s.notify(`Background applied to the ${layout.name || 'slide'} layout.`);
      },
    },
    {
      id: 'view.fullScreen', label: 'Compact interface', group: 'View', keys: 'Mod+Shift+F', active: (s) => compactOn(s),
      run: (s) => setCompact(s, !compactOn(s)),
    },
    { id: 'view.speakerNotes', label: 'Speaker notes', group: 'View', active: (s) => s.view.notes, run: (s) => run(s, 'view.notes') },
  ]);
};
