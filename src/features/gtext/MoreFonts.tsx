import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { run } from '../../app/commands';
import type { DialogProps } from '../../app/registry';
import { Dialog, S, Select } from '../../ui/kit';
import { CATEGORY_LABEL, SCRIPT_LABEL, SCRIPT_SAMPLE, type FontCategory, type FontFamily, type FontScript } from './catalog';
import { availableFamilies, ensureFont, myFonts, noteRecentFont, toggleMyFont } from './fontLoader';

type Sort = 'popular' | 'az';

/** Filters and sorts the library; pure, so the dialog and tests share it. */
export const filterFamilies = (all: FontFamily[], q: string, cat: FontCategory | null, script: FontScript | 'any', sort: Sort): FontFamily[] => {
  const t = q.trim().toLowerCase();
  const out = all.filter((f) => (!t || f.name.toLowerCase().includes(t)) && (!cat || f.cat === cat) && (script === 'any' || f.scripts.includes(script)));
  return sort === 'az' ? [...out].sort((a, b) => a.name.localeCompare(b.name)) : out;
};

/** Loads a font only once its row scrolls into view. */
const Preview = ({ fam, children, className }: { fam: FontFamily; children: string; className: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { void ensureFont(fam.name); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { void ensureFont(fam.name); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }, [fam.name]);
  return <div ref={ref} className={className} style={{ fontFamily: `"${fam.name}", "Hanken Grotesk", sans-serif` }}>{children}</div>;
};

export const MoreFontsDialog = ({ store, close }: DialogProps) => {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<FontCategory | null>(null);
  const [script, setScript] = useState<FontScript | 'any'>('any');
  const [sort, setSort] = useState<Sort>('popular');
  const [mine, setMine] = useState(myFonts);
  const list = useMemo(() => filterFamilies(availableFamilies(), q, cat, script, sort), [q, cat, script, sort]);
  const canApply = !!store.editing || store.selected().some((s) => s.kind === 'shape' || s.kind === 'table' || s.kind === 'group');
  const apply = (name: string) => { noteRecentFont(name); run(store, 'text.font', name); close(); };
  return (
    <Dialog title="Fonts" close={close} wide footer={<span className="gt-count">{mine.length ? `${mine.length} in My fonts` : 'Tick fonts to add them to My fonts'}</span>}>
      <div className="gt-row">
        <label className="gt-search"><Search size={16} strokeWidth={S} aria-hidden /><input autoFocus aria-label="Search fonts" placeholder="Search fonts" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <Select label="Script" value={script} options={[['any', 'All scripts'], ...(Object.entries(SCRIPT_LABEL) as [FontScript, string][])]} onChange={setScript} />
        <Select label="Sort" value={sort} options={[['popular', 'Popular'], ['az', 'A to Z']]} onChange={setSort} />
      </div>
      <div className="gt-row gt-chips" role="group" aria-label="Category">
        <button className={!cat ? 'on' : ''} aria-pressed={!cat} onClick={() => setCat(null)}>All</button>
        {(Object.entries(CATEGORY_LABEL) as [FontCategory, string][]).map(([k, l]) => <button key={k} className={cat === k ? 'on' : ''} aria-pressed={cat === k} onClick={() => setCat(cat === k ? null : k)}>{l}</button>)}
      </div>
      <div className="gt-fontlist" role="list" aria-label="Fonts">
        {list.map((f) => {
          const on = mine.includes(f.name);
          const sampleScript = script !== 'any' ? script : f.scripts[0]!;
          return (
            <div className="gt-font" role="listitem" key={f.name}>
              <button className={`chk${on ? ' on' : ''}`} aria-pressed={on} aria-label={on ? `Remove ${f.name} from My fonts` : `Add ${f.name} to My fonts`} title={on ? 'Remove from My fonts' : 'Add to My fonts'}
                onClick={() => { toggleMyFont(f.name); setMine(myFonts()); }}>{on && <Check size={16} strokeWidth={S} />}</button>
              <div className="meta">
                <Preview fam={f} className="nm">{f.name}</Preview>
                <Preview fam={f} className="smp">{SCRIPT_SAMPLE[sampleScript]}</Preview>
                <div className="sub">{CATEGORY_LABEL[f.cat]} · {f.scripts.map((x) => SCRIPT_LABEL[x]).join(', ')}</div>
              </div>
              {canApply && <button className="tool" onClick={() => apply(f.name)}>Use</button>}
            </div>
          );
        })}
        {!list.length && <div className="muted small pad">No fonts match.</div>}
      </div>
    </Dialog>
  );
};
