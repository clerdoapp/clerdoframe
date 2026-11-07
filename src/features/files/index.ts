/** File feature: file formats, the File tab, export, print, properties and reuse slides. */
import { createElement, type ReactNode } from 'react';
import { openDialog, registerCommands } from '../../app/commands';
import { download } from '../../app/files';
import { registerDialog, registerPanelSection } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { registerFormats } from '../../formats/register';
import { writePptx } from '../../formats/pptx';
import { asTemplate, rememberFile } from './ops';
import {
  AboutSection, ExportDialog, InfoSection, InspectDialog, NewSection, OpenSection, OptionsSection, PrintDialog, PrintShareSection, PropertiesDialog, ReuseDialog, SaveSection, runExport,
} from './ui';
import './files.css';

const section = (title: string, order: number, render: (s: FrameStore) => ReactNode) => registerPanelSection({ tab: 'file', title, order, render });

/** Remembers opened and saved file names for the Open section. */
const trackRecent = (store: FrameStore): void => {
  if (store.ext.recentTracked) return;
  store.ext.recentTracked = true;
  let last = '';
  store.subscribe(() => {
    const name = store.file.name;
    if ((store.file.path || store.file.lastSaved || store.file.handle) && name && name !== last) { last = name; rememberFile(name); }
  });
};

export const registerFiles = (): void => {
  registerFormats();

  section('New', 10, (s) => { trackRecent(s); return createElement(NewSection, { store: s }); });
  section('Open', 20, (s) => createElement(OpenSection, { store: s }));
  section('Save and export', 30, (s) => createElement(SaveSection, { store: s }));
  section('Print and share', 40, (s) => createElement(PrintShareSection, { store: s }));
  section('Info', 50, (s) => createElement(InfoSection, { store: s }));
  section('Options', 60, (s) => createElement(OptionsSection, { store: s }));
  section('About', 70, () => createElement(AboutSection));

  registerDialog('file.export', ExportDialog);
  registerDialog('file.print', PrintDialog);
  registerDialog('file.properties', PropertiesDialog);
  registerDialog('file.inspect', InspectDialog);
  registerDialog('insert.reuseSlides', ReuseDialog);

  registerCommands([
    { id: 'file.print', label: 'Print…', group: 'File', keys: 'Mod+P', inText: true, run: (s) => { trackRecent(s); openDialog(s, 'file.print'); }, enabled: (s) => s.deck.slides.length > 0 },
    {
      id: 'file.export', label: 'Export…', group: 'File',
      // With a format id, exports straight away; otherwise opens the dialog.
      run: (s, arg) => { if (typeof arg === 'string' && arg) void runExport(s, arg); else openDialog(s, 'file.export'); },
    },
    { id: 'file.exportPdf', label: 'Export as PDF…', group: 'File', run: (s) => openDialog(s, 'file.export', 'pdf') },
    { id: 'file.properties', label: 'Properties…', group: 'File', run: (s) => openDialog(s, 'file.properties') },
    {
      id: 'file.markFinal', label: 'Mark as final', group: 'File', active: (s) => !!s.deck.final,
      run: (s) => {
        s.change('!Mark as final', () => { s.deck.final = !s.deck.final || undefined; });
        s.notify(s.deck.final ? 'Marked as final. Editing is turned off.' : 'Editing is turned on again.');
      },
    },
    { id: 'file.inspect', label: 'Inspect and clean up…', group: 'File', run: (s) => openDialog(s, 'file.inspect') },
    {
      id: 'file.saveAsTemplate', label: 'Save as template…', group: 'File',
      run: (s) => {
        try {
          const data = writePptx(asTemplate(s.deck), { kind: 'template' });
          download(`${s.file.name || 'Template'}.potx`, new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.template' }));
        } catch (e) { s.notify(e instanceof Error ? e.message : 'The template could not be saved.'); }
      },
    },
    { id: 'insert.reuseSlides', label: 'Reuse slides…', group: 'Insert', run: (s) => openDialog(s, 'insert.reuseSlides') },
  ]);
};
