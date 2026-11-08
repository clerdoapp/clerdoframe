import { useEffect } from 'react';
import { Minimize2 } from 'lucide-react';
import type { FrameStore } from '../../app/store';
import { S } from '../../ui/kit';
import { AUTO_MS, historyOf } from './history';
import { VersionsView } from './versionsView';

/** Compact interface: rail, tool panel, slide list and notes hidden. */
export const compactOn = (s: FrameStore): boolean => !!s.ext.gpCompact;
export const setCompact = (s: FrameStore, on: boolean): void => {
  s.ext.gpCompact = on || undefined;
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('gp-compact', on);
  s.emit();
};

/** Always mounted: runs version history and draws the compact-mode restore button and the versions view. */
export const GPresentRoot = ({ store }: { store: FrameStore }) => {
  useEffect(() => {
    const ms = typeof store.ext.gpVersionMs === 'number' ? store.ext.gpVersionMs : AUTO_MS;
    return historyOf(store).start(ms);
  }, [store]);
  const compact = compactOn(store);
  useEffect(() => {
    if (!compact) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || store.dialog || store.menu || store.show || store.editing || store.sel.length || store.ext.gpVersions) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      setCompact(store, false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [store, compact]);
  return (
    <>
      {compact && !store.show && (
        <button className="gp-uncompact" aria-label="Show the full interface" title="Show the full interface (Esc)" onClick={() => setCompact(store, false)}>
          <Minimize2 size={18} strokeWidth={S} />
        </button>
      )}
      <VersionsView store={store} />
    </>
  );
};
