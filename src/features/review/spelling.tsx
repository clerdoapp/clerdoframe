import { useEffect, useMemo, useState } from 'react';
import type { FrameStore } from '../../app/store';
import { bodyAt, spots, wordsOf, replaceIn, type Spot } from './check';

interface Speller { correct: (w: string) => boolean; suggest: (w: string) => string[]; add: (w: string) => void }
let spellerPromise: Promise<Speller> | null = null;

/** Loads the dictionary only when spelling is first checked, so it stays out of the main bundle. */
export const loadSpeller = (): Promise<Speller> => spellerPromise ??= (async () => {
  const [{ default: nspell }, aff, dic] = await Promise.all([
    import('nspell'),
    import('../../../node_modules/dictionary-en/index.aff?raw'),
    import('../../../node_modules/dictionary-en/index.dic?raw'),
  ]);
  const sp = nspell(aff.default, dic.default);
  for (const w of personalWords()) sp.add(w);
  return sp;
})();

const DICT_KEY = 'clerdoframe.dictionary';
export const personalWords = (): string[] => { try { return JSON.parse(localStorage.getItem(DICT_KEY) ?? '[]') as string[]; } catch { return []; } };
const savePersonal = (w: string) => { try { localStorage.setItem(DICT_KEY, JSON.stringify([...new Set([...personalWords(), w])].slice(-5000))); } catch { /* private mode */ } };

interface Miss { spot: number; para: number; start: number; word: string }
interface Pos { spot: number; para: number; from: number }

const LANGS: [string, string][] = [['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['en-AU', 'English (Australia)'], ['en-CA', 'English (Canada)']];
export const proofingLanguage = (s: FrameStore): string => s.deck.props.language ?? 'en-US';

export const SpellingPane = ({ store }: { store: FrameStore }) => {
  const [sp, setSp] = useState<Speller | null>(null);
  const [err, setErr] = useState('');
  const [list, setList] = useState<Spot[]>(() => spots(store.deck));
  const [pos, setPos] = useState<Pos>(() => ({ spot: Math.max(0, list.findIndex((x) => x.slide >= store.cur)), para: 0, from: 0 }));
  const [ignored] = useState(() => new Set<string>());
  const [changeAll] = useState(() => new Map<string, string>());
  const [repl, setRepl] = useState('');
  const [wrapped, setWrapped] = useState(false);
  const [done, setDone] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { loadSpeller().then(setSp, () => setErr('The dictionary could not be loaded.')); }, []);

  const findFrom = (p: Pos): Miss | null => {
    if (!sp) return null;
    for (let i = p.spot; i < list.length; i++) {
      for (const w of wordsOf(bodyAt(store.deck, list[i]!))) {
        if (i === p.spot && (w.para < p.para || (w.para === p.para && w.start < p.from))) continue;
        if (ignored.has(w.word.toLowerCase()) || sp.correct(w.word) || sp.correct(w.word.toLowerCase())) continue;
        return { spot: i, para: w.para, start: w.start, word: w.word };
      }
    }
    return null;
  };
  const miss = useMemo(() => {
    if (!sp || done) return null;
    const m = findFrom(pos);
    if (m) return m;
    if (!wrapped && pos.spot > 0) { const w = findFrom({ spot: 0, para: 0, from: 0 }); if (w) { setWrapped(true); setPos({ spot: 0, para: 0, from: 0 }); return w; } }
    return null;
  }, [sp, pos, done, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggestions = useMemo(() => (miss && sp ? sp.suggest(miss.word).slice(0, 8) : []), [miss, sp]);
  useEffect(() => {
    if (!miss) { if (sp && !done) setDone(true); return; }
    const spot = list[miss.spot]!;
    if (store.cur !== spot.slide) store.goto(spot.slide);
    if (spot.shape && !spot.notes && store.view.mode === 'normal') { store.sel = [spot.shape]; store.emit(); }
    const auto = changeAll.get(miss.word.toLowerCase());
    if (auto) { replace(auto); return; }
    setRepl(suggestions[0] ?? miss.word);
  }, [miss]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = (m: Miss, len: number) => setPos({ spot: m.spot, para: m.para, from: m.start + len });
  const replace = (to: string) => {
    if (!miss) return;
    const m = miss;
    const ok = store.tryChange('Spelling', () => {
      const b = bodyAt(store.deck, list[m.spot]!);
      const p = b?.paras[m.para];
      if (p) replaceIn(p, m.start, m.word.length, to);
    });
    if (ok) { setList(spots(store.deck)); advance(m, to.length); setTick(tick + 1); }
    else advance(m, m.word.length);
  };
  const restart = () => { setDone(false); setWrapped(false); ignored.clear(); setList(spots(store.deck)); setPos({ spot: 0, para: 0, from: 0 }); setTick(tick + 1); };

  const context = (() => {
    if (!miss) return null;
    const p = bodyAt(store.deck, list[miss.spot]!)?.paras[miss.para];
    const t = p ? p.runs.map((r) => (r.br ? ' ' : r.text)).join('') : '';
    return <>{t.slice(Math.max(0, miss.start - 50), miss.start)}<mark>{t.slice(miss.start, miss.start + miss.word.length)}</mark>{t.slice(miss.start + miss.word.length, miss.start + miss.word.length + 50)}</>;
  })();

  return (
    <div className="rv-spell">
      {err && <p>{err}</p>}
      {!sp && !err && <p className="muted">Loading the dictionary…</p>}
      {sp && done && (
        <div className="rv-empty"><p>Spelling check complete.</p><button className="tool" onClick={restart}>Check again</button></div>
      )}
      {miss && (
        <>
          <div className="muted small">Not in the dictionary · {list[miss.spot]!.label}</div>
          <div className="rv-ctx">{context}</div>
          <label className="lbl"><span>Change to</span><input value={repl} onChange={(e) => setRepl(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && repl.trim()) replace(repl); }} /></label>
          <div className="rv-sugg" role="listbox" aria-label="Suggestions">
            {suggestions.length ? suggestions.map((s) => <button key={s} role="option" aria-selected={s === repl} className={s === repl ? 'on' : ''} onClick={() => setRepl(s)} onDoubleClick={() => replace(s)}>{s}</button>)
              : <div className="muted small pad">No suggestions</div>}
          </div>
          <div className="rv-sbtns">
            <button className="primary" disabled={!repl.trim()} onClick={() => replace(repl)}>Change</button>
            <button disabled={!repl.trim()} onClick={() => { changeAll.set(miss.word.toLowerCase(), repl); replace(repl); }}>Change all</button>
            <button onClick={() => advance(miss, miss.word.length)}>Ignore once</button>
            <button onClick={() => { ignored.add(miss.word.toLowerCase()); advance(miss, miss.word.length); }}>Ignore all</button>
            <button onClick={() => { sp!.add(miss.word); savePersonal(miss.word); advance(miss, miss.word.length); }}>Add to dictionary</button>
          </div>
        </>
      )}
      <div className="sep" />
      <label className="lbl"><span>Proofing language</span>
        <select value={proofingLanguage(store)} onChange={(e) => store.tryChange('Proofing language', () => { store.deck.props.language = e.target.value; })}>
          {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <p className="muted small">Checked with the built-in English dictionary on this device. Words you add are kept in this browser.</p>
    </div>
  );
};
