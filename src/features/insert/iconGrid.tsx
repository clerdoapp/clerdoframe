import { useMemo, useState } from 'react';
import { icons, Search } from 'lucide-react';

/** Splits "ArrowBigDown" into searchable words. */
const words = (name: string) => name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([0-9])([A-Z])/g, '$1 $2').toLowerCase();
const ALL = Object.keys(icons).sort().map((name) => ({ name, words: words(name) }));
const PAGE = 240;

/** Searchable grid of every built-in icon. Loaded only when the Icons dialog opens. */
const IconGrid = ({ picked, onToggle, onInsert }: { picked: Map<string, string>; onToggle: (name: string, svg: SVGSVGElement) => void; onInsert: (name: string, svg: SVGSVGElement) => void }) => {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const list = useMemo(() => {
    const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
    return ws.length ? ALL.filter((x) => ws.every((w) => x.words.includes(w))) : ALL;
  }, [q]);
  const svgOf = (el: HTMLElement) => el.querySelector('svg');
  return (
    <>
      <label className="shapesearch"><Search size={14} strokeWidth={1.9} /><input autoFocus placeholder={`Search ${ALL.length} icons`} value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} aria-label="Search icons" /></label>
      <div className="icongrid" role="listbox" aria-multiselectable onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && limit < list.length) setLimit((n) => n + PAGE);
      }}>
        {list.slice(0, limit).map(({ name, words: w }) => {
          const I = icons[name as keyof typeof icons];
          return (
            <button key={name} role="option" aria-selected={picked.has(name)} aria-label={w} title={w} className={picked.has(name) ? 'on' : ''}
              onClick={(e) => { const s = svgOf(e.currentTarget); if (s) onToggle(name, s); }}
              onDoubleClick={(e) => { const s = svgOf(e.currentTarget); if (s) onInsert(name, s); }}>
              <I size={26} strokeWidth={1.9} />
            </button>
          );
        })}
        {!list.length && <div className="muted small pad">No icons match.</div>}
      </div>
      <div className="muted small">{picked.size ? `${picked.size} selected. ` : ''}Tap to select, double-tap to insert one.</div>
    </>
  );
};

export default IconGrid;
