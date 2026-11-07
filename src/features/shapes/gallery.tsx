import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { FrameStore } from '../../app/store';
import { S } from '../../ui/kit';
import { ShapeIcon } from './icon';
import { CATEGORIES, labelOf } from './presets';
import { setTool } from './tools';
import './shapes.css';

const RECENT_KEY = 'clerdoframe.recentShapes';
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]; } catch { return []; } };
export const noteRecentShape = (g: string): void => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([g, ...readRecent().filter((x) => x !== g)].slice(0, 12))); } catch { /* storage off */ }
};

/**
 * Every preset by category. Tap picks the drawing tool; double-tap (or double-click) keeps the
 * tool on for several shapes.
 */
export const ShapeGallery = ({ store, onPick, compact }: { store: FrameStore; onPick?: (geom: string) => void; compact?: boolean }) => {
  const [q, setQ] = useState('');
  const recent = readRecent();
  const cats = useMemo(() => {
    const w = q.trim().toLowerCase();
    const list = CATEGORIES.map((c) => ({ name: c.name, shapes: w ? c.shapes.filter((s) => `${labelOf(s)} ${s}`.toLowerCase().includes(w)) : c.shapes })).filter((c) => c.shapes.length);
    return !w && recent.length ? [{ name: 'Recently used', shapes: recent }, ...list] : list;
  }, [q, recent.join()]);
  const pick = (g: string, locked: boolean) => {
    noteRecentShape(g);
    if (onPick) onPick(g);
    else setTool(store, `shape:${g}`, locked);
  };
  return (
    <div className={`shapegallery${compact ? ' compact' : ''}`}>
      <label className="shapesearch"><Search size={14} strokeWidth={S} /><input placeholder="Find a shape" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a shape" /></label>
      {cats.map((c) => (
        <div key={c.name} className="shapecat">
          <div className="shapecathead">{c.name}</div>
          <div className="shapegrid" role="list">
            {c.shapes.map((g) => {
              const on = store.tool === `shape:${g}`;
              return (
                <button key={g} role="listitem" className={`shapecell${on ? ' on' : ''}${on && store.ext.toolLocked ? ' locked' : ''}`} title={labelOf(g)} aria-label={labelOf(g)} data-geom={g}
                  onMouseDown={(e) => e.preventDefault()} onClick={(e) => pick(g, e.detail >= 2)}>
                  <ShapeIcon geom={g} size={26} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!cats.length && <div className="muted small pad">No shapes match.</div>}
      <div className="muted small">Double-tap a shape to draw several.</div>
    </div>
  );
};
