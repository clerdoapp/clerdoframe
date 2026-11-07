import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { FrameStore } from '../app/store';
import { viewFor } from '../app/registry';
import { registerFeatures } from '../features';
import { bindKeys } from './keys';
import { openLaunchFile, restoreDraft, startAutosave, openBytes, desktop } from '../app/files';
import { TopBar, Rail, ToolPanel, PaneHost, StatusBar, DialogHost, ContextMenu, Overlays } from './Shell';
import { SlideList } from './SlideList';
import { Canvas } from './Canvas';
import { Notes } from './Notes';

const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const App = () => {
  const store = useMemo(() => {
    registerFeatures();
    const s = new FrameStore();
    if (coarse || window.innerWidth < 900) s.view.panel = null;
    try { const t = localStorage.getItem('clerdoframe.theme'); if (t === 'light' || t === 'dark') s.view.theme = t; } catch { /* private mode */ }
    return s;
  }, []);
  useSyncExternalStore(store.subscribe, store.getVersion);

  useEffect(() => {
    (window as unknown as { __store: FrameStore }).__store = store;
    void openLaunchFile(store).then((opened) => { if (!opened) void restoreDraft(store); });
    const stop = startAutosave(store);
    const unbind = bindKeys(store);
    const beforeUnload = (e: BeforeUnloadEvent) => { if (desktop && store.file.dirty) { e.preventDefault(); e.returnValue = ''; } };
    const onDrop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f || (e.target as HTMLElement | null)?.closest?.('.canvaswrap')) return;
      e.preventDefault();
      void f.arrayBuffer().then((b) => openBytes(store, f.name, new Uint8Array(b)));
    };
    const onDragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    return () => { stop(); unbind(); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('drop', onDrop); window.removeEventListener('dragover', onDragOver); };
  }, [store]);

  useEffect(() => {
    const t = store.view.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, [store.view.theme]);

  useEffect(() => { document.title = `${store.file.dirty ? '• ' : ''}${store.file.name} - ClerdoFrame`; }, [store.file.name, store.file.dirty]);

  const mode = store.view.mode;
  const alt = mode !== 'normal' && mode !== 'master' ? viewFor(mode) : undefined;
  return (
    <div className="app">
      <TopBar store={store} />
      <div className="work">
        <Rail store={store} />
        <ToolPanel store={store} />
        <main className="stage">
          {alt ? alt.render(store) : (
            <div className="editor">
              {store.view.thumbs && (mode === 'master' ? viewFor('masterList')?.render(store) : <SlideList store={store} />)}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Canvas store={store} />
                <Notes store={store} />
              </div>
            </div>
          )}
        </main>
        <PaneHost store={store} />
      </div>
      <StatusBar store={store} />
      <ContextMenu store={store} />
      <DialogHost store={store} />
      <Overlays store={store} />
      {store.toast && <div className="toast" role="status">{store.toast}</div>}
    </div>
  );
};
