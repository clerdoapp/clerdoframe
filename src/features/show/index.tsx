import { useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import './show.css';
import { run } from '../../app/commands';
import { registerCanvasLayer, registerDialog, registerMenu, registerOverlay, registerPane, registerPanelSection, registerView } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { S } from '../../ui/kit';
import { showOf, type ShowController } from './controller';
import { registerShowCommands, startShow } from './commands';
import { ShowSurface, MoreMenu, Prompt, Overview, Screens, useShowInput } from './ShowView';
import { PresenterRoot } from './Presenter';
import { Stage } from './Stage';
import { registerPanels } from './panels';
import { AnimationPane, animMenu } from './pane';
import { canvasLayer, PreviewHost } from './canvas';
import { CustomShowsDialog, EffectOptionsDialog, RecordDialog, SetupDialog, TrimDialog } from './dialogs';
import './media';

/** files.ts calls store.ext.startShow(store) after opening a .ppsx file. */
const startFromFile = (s: FrameStore): void => { startShow(s, { from: 0 }); };

const ShowOverlay = ({ store }: { store: FrameStore }) => {
  // The overlay renders with the app's first frame, before any file is opened.
  if (store.ext.startShow !== startFromFile) store.ext.startShow = startFromFile;
  const c = showOf(store);
  if (!c || c.mode === 'reading') return <PreviewHost store={store} />;
  return <ShowFrame c={c} />;
};

const ShowFrame = ({ c }: { c: ShowController }) => {
  useSyncExternalStore(c.subscribe, c.getVersion);
  useEffect(() => {
    // Leaving full screen with the browser's own controls ends the show.
    const fs = () => { if (!document.fullscreenElement && c.mode !== 'presenter' && (document as Document & { __wasFs?: boolean }).__wasFs) c.end(); (document as Document & { __wasFs?: boolean }).__wasFs = !!document.fullscreenElement; };
    document.addEventListener('fullscreenchange', fs);
    if (c.subtitles !== !!c.store.ext.subtitles) { c.subtitles = !!c.store.ext.subtitles; c.emit(); }
    return () => { document.removeEventListener('fullscreenchange', fs); (document as Document & { __wasFs?: boolean }).__wasFs = false; };
  }, [c]);
  return (
    <div className={`show-overlay${c.store.ext.showMediaControls === false ? ' nomediactl' : ''}`} role="application" aria-label="Slide show">
      {c.mode === 'presenter' ? <PresenterRoot c={c} /> : <ShowSurface c={c} />}
    </div>
  );
};

/** Reading view: the show inside the window with a small footer. */
const ReadingView = ({ store }: { store: FrameStore }) => {
  const [c, setC] = useState<ShowController | null>(() => (showOf(store)?.mode === 'reading' ? showOf(store) : null));
  useEffect(() => {
    let ctl = showOf(store);
    if (!ctl || ctl.mode !== 'reading') ctl = startShow(store, { mode: 'reading', from: store.cur });
    if (ctl) {
      store.view.mode = 'reading';
      const prev = ctl.hooks.finish;
      ctl.hooks.finish = () => { prev?.(); if (store.view.mode === 'reading') { store.view.mode = 'normal'; store.emit(); } };
    }
    setC(ctl);
    return () => { if (ctl && store.show === ctl) ctl.finish(); };
  }, [store]);
  if (!c) return null;
  return <ReadingInner c={c} />;
};

const ReadingInner = ({ c }: { c: ShowController }) => {
  useSyncExternalStore(c.subscribe, c.getVersion);
  const input = useShowInput(c, () => undefined);
  return (
    <div className="reading">
      <div className="reading-stage" onPointerDown={input.onPointerDown} onPointerMove={input.onPointerMove} onPointerUp={input.onPointerUp} onPointerCancel={input.onPointerCancel}>
        <Stage c={c} />
        <Screens c={c} />
      </div>
      <div className="reading-bar">
        <span className="muted small">{c.store.file.name}</span>
        <div className="grow" />
        <button className="ico" aria-label="Previous" title="Previous" onClick={() => c.prev()}><ChevronLeft size={18} strokeWidth={S} /></button>
        <span className="small">Slide {c.slideIndex + 1} of {c.deck.slides.length}</span>
        <button className="ico" aria-label="Next" title="Next" onClick={() => c.next()}><ChevronRight size={18} strokeWidth={S} /></button>
        <button className="tool" title="Present from this slide" onClick={() => { const i = c.slideIndex; c.finish(); c.store.view.mode = 'normal'; c.store.cur = i; run(c.store, 'show.fromCurrent'); }}><Play size={16} strokeWidth={S} /><span>Present</span></button>
        <MoreMenu c={c} />
      </div>
      {c.overview && <Overview c={c} />}
      <Prompt c={c} />
    </div>
  );
};

let done = false;
export const registerShow = (): void => {
  if (done) return;
  done = true;
  registerShowCommands();
  registerOverlay({ id: 'show', render: (s) => <ShowOverlay store={s} /> });
  registerView({ mode: 'reading', render: (s) => <ReadingView store={s} /> });
  registerPane({ id: 'animations', title: 'Animation pane', width: 330, render: (s) => <AnimationPane store={s} /> });
  registerPanels(registerPanelSection);
  registerCanvasLayer({ id: 'show.animations', order: 30, render: canvasLayer });
  registerMenu({ kind: 'animation', items: animMenu });
  registerDialog('show.setup', SetupDialog);
  registerDialog('show.custom', CustomShowsDialog);
  registerDialog('show.record', RecordDialog);
  registerDialog('anim.options', EffectOptionsDialog);
  registerDialog('media.trim', TrimDialog);
  registerMenu({
    kind: 'shape', order: 80,
    items: (s) => (s.one() && s.slide ? [{ label: 'Animate…', run: (st) => { st.view.panel = 'animations'; st.emit(); } }] : []),
  });
};
