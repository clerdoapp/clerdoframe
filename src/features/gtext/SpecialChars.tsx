import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, PenLine, Search } from 'lucide-react';
import type { DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { Dialog, S } from '../../ui/kit';
import { insertTextAtCaret } from '../editor/textOps';
import { charCategories, charName, codeOf, searchChars } from './charsData';
import { glyphFromStrokes, rankGlyphs, type Pt } from './glyphMatch';
import { glyphCandidates } from './glyphRender';

const RECENT = 'clerdoframe.recentSymbols';
const readRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 30) : []; } catch { return []; } };

/**
 * Emoji newer than the device's emoji font come out as empty boxes. Colour emoji have coloured
 * pixels where boxes don't; when nothing looks coloured (no colour emoji font) everything is kept.
 */
let emojiOk: ((c: string) => boolean) | null = null;
const emojiFilter = (all: string[]): ((c: string) => boolean) => {
  if (emojiOk) return emojiOk;
  const cv = document.createElement('canvas');
  cv.width = 24; cv.height = 24;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return (emojiOk = () => true);
  g.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textBaseline = 'middle';
  const seen = new Map<string, boolean>();
  const test = (c: string): boolean => {
    let v = seen.get(c);
    if (v !== undefined) return v;
    g.clearRect(0, 0, 24, 24);
    g.fillStyle = '#000';
    g.fillText(c, 0, 12);
    const d = g.getImageData(0, 0, 24, 24).data;
    v = false;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 64 && Math.max(d[i]!, d[i + 1]!, d[i + 2]!) - Math.min(d[i]!, d[i + 1]!, d[i + 2]!) > 40) { v = true; break; }
    seen.set(c, v);
    return v;
  };
  const sample = all.filter((_, i) => i % 25 === 0);
  const colourful = sample.filter(test).length;
  emojiOk = colourful < sample.length * 0.1 ? () => true : test;
  return emojiOk;
};

const canInsert = (store: FrameStore) => !!store.editing || store.selected().some((x) => x.kind === 'shape');

/** Drawing pad: strokes in pad pixels; reports matches after each stroke. */
const DrawPad = ({ onMatches }: { onMatches: (chars: string[] | null, status: string) => void }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const drawing = useRef<Pt[] | null>(null);
  const [status, setStatus] = useState('Draw a character in the box.');
  const paint = () => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const k = c.width / c.clientWidth || 1;
    g.clearRect(0, 0, c.width, c.height);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 5 * k;
    g.strokeStyle = getComputedStyle(c).color || '#222';
    for (const st of [...strokes.current, ...(drawing.current ? [drawing.current] : [])]) {
      g.beginPath();
      st.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k)));
      if (st.length === 1) g.lineTo(st[0]!.x * k + 0.1, st[0]!.y * k);
      g.stroke();
    }
  };
  const recognise = async () => {
    const q = glyphFromStrokes(strokes.current);
    if (!q) { onMatches(null, ''); return; }
    setStatus('Looking…');
    const cands = await glyphCandidates((d, t) => setStatus(`Preparing characters… ${Math.round((d / t) * 100)}%`));
    const best = rankGlyphs(q, cands, 30).map((x) => x.item);
    setStatus(best.length ? 'Best matches are shown. Keep drawing to refine.' : 'No match.');
    onMatches(best, '');
  };
  useEffect(() => { const c = ref.current; if (c) { c.width = 400; c.height = 400; } void glyphCandidates(); }, []);
  const at = (e: React.PointerEvent): Pt => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  return (
    <div className="gt-pad">
      <canvas ref={ref} aria-label="Drawing pad" role="img"
        onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ } drawing.current = [at(e)]; paint(); }}
        onPointerMove={(e) => { if (!drawing.current) return; drawing.current.push(at(e)); paint(); }}
        onPointerUp={() => { if (!drawing.current) return; strokes.current.push(drawing.current); drawing.current = null; paint(); void recognise(); }}
        onPointerCancel={() => { drawing.current = null; paint(); }} />
      <div className="side">
        <button className="tool" onClick={() => { strokes.current.pop(); paint(); void recognise(); }}>Undo stroke</button>
        <button className="tool" onClick={() => { strokes.current = []; paint(); onMatches(null, ''); setStatus('Draw a character in the box.'); }}><Eraser size={16} strokeWidth={S} /> Clear</button>
        <span className="muted small" style={{ maxWidth: 200 }}>{status}</span>
      </div>
    </div>
  );
};

export const SpecialCharsDialog = ({ store, close }: DialogProps) => {
  const cats = useMemo(() => {
    const all = charCategories();
    const ok = emojiFilter(all.filter((c) => c.group === 'emoji').flatMap((c) => c.chars));
    return all.map((c) => (c.group === 'emoji' ? { ...c, chars: c.chars.filter(ok) } : c));
  }, []);
  const [cat, setCat] = useState('emoji-smileys');
  const [q, setQ] = useState('');
  const [draw, setDraw] = useState(false);
  const [drawn, setDrawn] = useState<string[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [recent, setRecent] = useState(readRecent);
  const chars = useMemo(() => {
    if (draw) return [...new Set(drawn ?? [])];
    if (q.trim()) return searchChars(q, cats);
    if (cat === 'recent') return recent;
    return cats.find((c) => c.id === cat)?.chars ?? [];
  }, [draw, drawn, q, cat, cats, recent]);
  const insert = (c: string) => {
    if (!canInsert(store)) { store.notify('Click in text first, then insert the character.'); return; }
    insertTextAtCaret(store, c);
    const next = [c, ...recent.filter((x) => x !== c)].slice(0, 30);
    setRecent(next);
    try { localStorage.setItem(RECENT, JSON.stringify(next)); } catch { /* storage off */ }
  };
  const shown = pick ?? chars[0] ?? null;
  return (
    <Dialog title="Special characters" close={close} wide okLabel="Insert" onOk={() => { if (shown) insert(shown); return false; }}>
      <div className="gt-row">
        <label className="gt-search"><Search size={16} strokeWidth={S} aria-hidden />
          <input aria-label="Search characters" placeholder="Search by name or code, e.g. arrow or 2192" value={q} onChange={(e) => { setQ(e.target.value); setDraw(false); }} />
        </label>
        <button className={`tool${draw ? ' on' : ''}`} aria-pressed={draw} onClick={() => { setDraw(!draw); setDrawn(null); setPick(null); }}><PenLine size={16} strokeWidth={S} /> Draw</button>
      </div>
      <div className="gt-chars">
        <div className="gt-cats" role="listbox" aria-label="Categories">
          <button role="option" aria-selected={!draw && !q && cat === 'recent'} className={!draw && !q && cat === 'recent' ? 'on' : ''} onClick={() => { setCat('recent'); setQ(''); setDraw(false); setPick(null); }}>Recently used</button>
          <div className="cgtitle">Emoji</div>
          {cats.filter((c) => c.group === 'emoji').map((c) => (
            <button key={c.id} role="option" aria-selected={!draw && !q && cat === c.id} className={`sub${!draw && !q && cat === c.id ? ' on' : ''}`} onClick={() => { setCat(c.id); setQ(''); setDraw(false); setPick(null); }}>{c.name}</button>
          ))}
          <div className="cgtitle">Symbols</div>
          {cats.filter((c) => !c.group).map((c) => (
            <button key={c.id} role="option" aria-selected={!draw && !q && cat === c.id} className={`sub${!draw && !q && cat === c.id ? ' on' : ''}`} onClick={() => { setCat(c.id); setQ(''); setDraw(false); setPick(null); }}>{c.name}</button>
          ))}
        </div>
        <div>
          {draw && <DrawPad onMatches={(m) => { setDrawn(m); setPick(null); }} />}
          <div className="gt-grid" role="grid" aria-label="Characters" style={draw ? { maxHeight: 130, marginTop: 8 } : undefined}>
            {chars.map((c) => (
              <button key={c} className={shown === c ? 'on' : ''} title={`${charName(c) || 'Character'} (${codeOf(c)})`} aria-label={charName(c) || codeOf(c)}
                onClick={() => setPick(c)} onDoubleClick={() => insert(c)}>{c}</button>
            ))}
            {!chars.length && <div className="muted small pad">{draw ? 'Draw to see matching characters.' : cat === 'recent' && !q ? 'None yet.' : 'No characters match.'}</div>}
          </div>
          {shown && (
            <div className="gt-pick">
              <div className="big">{shown}</div>
              <div className="small"><div><b>{charName(shown) ? charName(shown).split(' ').slice(0, 4).join(' ') : 'Character'}</b></div><div className="muted">{codeOf(shown)}</div></div>
              <div className="grow" />
              <button className="tool" onClick={() => insert(shown)}>Insert</button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
