import './gtext.css';
import { createElement, lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Keyboard, Mic, Omega, Type } from 'lucide-react';
import { allCommands, command, openDialog, registerCommands, run, type Command } from '../../app/commands';
import { registerDialog, registerOverlay, registerPanelSection, type DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { fontHooks } from '../../render/inherit';
import { FONT_NAMES, fontMenu } from '../../ui/fonts';
import { Btn } from '../../ui/kit';
import { notesHooks } from '../../ui/Notes';
import { applyRunStyle, insertTextAtCaret } from '../editor/textOps';
import { fixPlainText } from './autocorrect';
import { LISTED_EXTRA } from './catalog';
import { checklistOn, installCheckClicks, toggleCheck, toggleChecklist } from './checklist';
import { ensureFontsForDeck, myFonts, noteFontUsed, noteRecentFont, recentFonts } from './fontLoader';
import { prefs } from './prefs';
import { installTyping } from './typing';
import { NotesMic, toggleVoice, useVoice, voiceActive, voiceSupported, VoiceBar } from './voice';

export { ensureFont, ensureFontsForDeck } from './fontLoader';

/** Text features: font library, typing aids, voice typing, special characters, checklists and shortcuts. */

const lazyDialog = <T,>(load: () => Promise<ComponentType<DialogProps<T>>>): ComponentType<DialogProps<T>> => {
  const L = lazy(() => load().then((c) => ({ default: c })));
  return (props: DialogProps<T>) => createElement(Suspense, { fallback: null }, createElement(L, props));
};

const hasText = (s: FrameStore): boolean => !!s.editing || s.selected().some((x) => x.kind === 'shape' || x.kind === 'table' || x.kind === 'group');
const editable = (s: FrameStore): boolean => !s.deck.final && !!s.surface();

/** On Mac keyboards Option changes the letter a key reports (Option+S is ß), so those shortcuts get a second spelling. */
const MAC_OPTION: Record<string, string> = { S: 'SS', V: '◊' };
const withMac = (k: string): string[] => {
  const m = /^(Mod\+Alt\+(?:Shift\+)?)([A-Z])$/.exec(k);
  const alt = m ? MAC_OPTION[m[2]!] : undefined;
  return m && alt ? [`${m[1]}${alt}`] : [];
};

const used = (): Set<string> => {
  const out = new Set<string>();
  for (const c of allCommands()) { if (c.keys) out.add(c.keys); for (const a of c.altKeys ?? []) out.add(a); }
  return out;
};

/** Adds a shortcut to an existing command when no other command has it. */
const addKey = (id: string, key: string): void => {
  const c = command(id);
  if (!c || used().has(key)) return;
  c.altKeys = [...(c.altKeys ?? []), key];
};

const pasteText = async (s: FrameStore): Promise<void> => {
  let t = '';
  try { t = await navigator.clipboard.readText(); } catch { s.notify('Allow clipboard access to paste as plain text, or use the normal paste.'); return; }
  if (!t) return;
  t = t.replace(/\r\n?/g, '\n');
  if (s.editing || s.selected().some((x) => x.kind === 'shape')) insertTextAtCaret(s, t);
  else run(s, 'edit.paste');
};

const VoiceBtn = ({ store }: { store: FrameStore }) => { useVoice(); return createElement(Btn, { store, id: 'text.voiceTyping', icon: Mic, label: 'Voice typing' }); };

/** Always-present layer: the dictation bar, and checklist clicks in the editor and the show. */
const Layer = ({ store }: { store: FrameStore }) => {
  useEffect(() => installCheckClicks(store), [store]);
  return createElement(VoiceBar, { store });
};

export const registerGText = (): void => {
  // Fonts: the library joins the font list and is loaded on first use (slides, thumbnails, show and exports).
  for (const f of [...LISTED_EXTRA, 'Comic Sans MS', 'Impact', 'Trebuchet MS']) if (!FONT_NAMES.includes(f)) FONT_NAMES.push(f);
  fontHooks.used = noteFontUsed;
  fontHooks.beforeExport = ensureFontsForDeck;
  fontMenu.more = 'text.moreFonts';
  fontMenu.groups = () => [{ label: 'Recent fonts', fonts: recentFonts() }, { label: 'My fonts', fonts: myFonts() }];
  fontMenu.picked = noteRecentFont;

  registerDialog('text.moreFonts', lazyDialog(() => import('./MoreFonts').then((m) => m.MoreFontsDialog)));
  registerDialog('tools.preferences', lazyDialog(() => import('./Preferences').then((m) => m.PreferencesDialog)));
  registerDialog('insert.specialCharacters', lazyDialog(() => import('./SpecialChars').then((m) => m.SpecialCharsDialog)));

  installTyping();
  notesHooks.tools = (api) => createElement(NotesMic, { api });
  notesHooks.fix = (value, caret, prev) => {
    if (value.length !== prev.length + 1 || caret < 1 || value.slice(0, caret - 1) + value.slice(caret) !== prev) return null;
    return fixPlainText(value, caret, value[caret - 1]!, prefs());
  };
  registerOverlay({ id: 'gtext.layer', render: (s) => createElement(Layer, { store: s }) });

  const cmds: Command[] = [
    { id: 'text.moreFonts', label: 'More fonts…', group: 'Text', run: (s) => openDialog(s, 'text.moreFonts') },
    { id: 'tools.preferences', label: 'Preferences…', group: 'Tools', run: (s, tab) => openDialog(s, 'tools.preferences', typeof tab === 'string' ? { tab } : undefined) },
    {
      id: 'text.voiceTyping', label: 'Voice typing', group: 'Text', keys: 'Mod+Alt+S', altKeys: withMac('Mod+Alt+S'), inText: true,
      enabled: () => voiceSupported(), active: () => voiceActive(), run: (s) => toggleVoice(s),
    },
    { id: 'insert.specialCharacters', label: 'Special characters…', group: 'Insert', enabled: editable, run: (s) => openDialog(s, 'insert.specialCharacters') },
    { id: 'text.checklist', label: 'Checklist', group: 'Text', keys: 'Mod+Shift+9', inText: true, enabled: hasText, active: checklistOn, run: toggleChecklist },
    { id: 'text.toggleCheck', label: 'Check or uncheck item', group: 'Text', inText: true, enabled: hasText, run: (s, arg) => toggleCheck(s, arg && typeof arg === 'object' ? arg as { shape: string; para: number } : undefined) },
    { id: 'text.sizeUp1', label: 'Increase font size by 1 pt', group: 'Text', inText: true, enabled: hasText, run: (s) => applyRunStyle(s, (c) => ({ size: Math.min(4000, Math.round(c.size ?? 18) + 1) })) },
    { id: 'text.sizeDown1', label: 'Decrease font size by 1 pt', group: 'Text', inText: true, enabled: hasText, run: (s) => applyRunStyle(s, (c) => ({ size: Math.max(1, Math.round(c.size ?? 18) - 1) })) },
  ];
  if (!command('edit.pasteText')) {
    const key = 'Mod+Alt+Shift+V';
    cmds.push({ id: 'edit.pasteText', label: 'Paste without formatting', group: 'Edit', inText: true, enabled: editable, keys: key, altKeys: withMac(key), run: (s) => void pasteText(s) });
  }
  // Only take shortcuts nobody else has.
  const taken = used();
  for (const c of cmds) {
    if (c.keys && taken.has(c.keys)) delete c.keys;
    if (c.altKeys) c.altKeys = c.altKeys.filter((k) => !taken.has(k));
  }
  registerCommands(cmds);

  addKey('text.superscript', 'Mod+.');
  addKey('text.subscript', 'Mod+,');
  addKey('text.strike', 'Alt+Shift+5');
  addKey('text.clear', 'Mod+\\');
  addKey('text.numbering', 'Mod+Shift+7');
  addKey('text.bullets', 'Mod+Shift+8');

  registerPanelSection({
    tab: 'tools', title: 'Typing', order: 30,
    render: (s) => createElement('div', { className: 'toollist' },
      createElement(Btn, { store: s, id: 'tools.preferences', icon: Keyboard, label: 'Preferences' }),
      voiceSupported() ? createElement(VoiceBtn, { store: s }) : null,
      createElement(Btn, { store: s, id: 'text.moreFonts', icon: Type, label: 'More fonts' }),
      createElement(Btn, { store: s, id: 'insert.specialCharacters', icon: Omega, label: 'Special characters' })),
  });
};
