import { useMemo, useRef, useState } from 'react';
import { registerDialog, type DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { AutoNumber, BulletSpec, Color, ParaStyle } from '../../model/deck';
import { css } from '../../render/color';
import { autoNumberText } from '../../render/text';
import { FONT_NAMES } from '../../ui/fonts';
import { Check, ColorButton, Dialog, Field, NumberField, Select } from '../../ui/kit';
import { paraStyle, runStyle, textApi, tx } from './bridge';
import { BULLET_CHARS, NUMBER_SCHEMES } from './home';
import { findAll, fontsInDeck, hitValid, replaceAll, replaceFont, replaceRange, paraOf, type FindOpts, type Hit } from './ops';
import { AltFields, PositionFields, SizeFields } from './pane';


// ---------- Find and replace ----------

/** Shows a hit: goes to its slide, selects its shape and asks the editor to select the text. */
const reveal = (store: FrameStore, h: Hit) => {
  if (store.cur !== h.slide || store.view.mode !== 'normal') {
    if (store.view.mode !== 'normal') store.view.mode = 'normal';
    store.goto(h.slide);
  }
  if (h.shape) {
    store.sel = [h.shape];
    store.editing = null;
    const sel = { shape: h.shape, ...(h.cell ? { cell: h.cell } : {}), para: h.para, start: h.start, end: h.end };
    store.ext.findHit = sel;
    const select = (store.ext.selectText as ((s: FrameStore, x: typeof sel) => void) | undefined);
    if (typeof select === 'function') { try { select(store, sel); } catch { /* editor may refuse */ } }
  } else {
    store.sel = [];
    store.view.notes = true;
  }
  store.emit();
};

const sameSpot = (a: Hit, b: Hit) => a.slide === b.slide && a.shape === b.shape && a.cell?.r === b.cell?.r && a.cell?.c === b.cell?.c;

const FindDialog = ({ store, data, close }: DialogProps<{ replace?: boolean }>) => {
  const [replace, setReplace] = useState(!!data?.replace);
  const initial = (store.ext.findQuery as string | undefined) ?? '';
  const [q, setQ] = useState(initial);
  const [r, setR] = useState((store.ext.replaceText as string | undefined) ?? '');
  const [opts, setOpts] = useState<FindOpts>((store.ext.findOpts as FindOpts | undefined) ?? { notes: true });
  const [msg, setMsg] = useState('');
  const last = useRef<Hit | null>(null);
  const remember = () => { store.ext.findQuery = q; store.ext.replaceText = r; store.ext.findOpts = opts; };

  /** Next hit after the current one, wrapping around the deck. Hits come back in reading order. */
  const next = (): Hit | null => {
    const hits = findAll(store.deck, q, opts);
    if (!hits.length) return null;
    const p = last.current;
    if (!p) return hits.find((h) => h.slide >= store.cur) ?? hits[0]!;
    const i = hits.findIndex((h) => sameSpot(h, p) && h.start === p.start);
    if (i >= 0) return hits[(i + 1) % hits.length]!;
    // The last hit was replaced: carry on from the first hit at or after where it was.
    const pi = hits.findIndex((h) => h.slide > p.slide || (h.slide === p.slide && sameSpot(h, p) && (h.para > p.para || (h.para === p.para && h.start >= p.end))));
    return hits[pi >= 0 ? pi : 0]!;
  };
  const findNext = () => {
    remember();
    const h = next();
    if (!h) { setMsg(q ? 'No matches found.' : ''); last.current = null; return; }
    const total = findAll(store.deck, q, opts).length;
    last.current = h;
    setMsg(`Slide ${h.slide + 1}${h.shape === null ? ' notes' : ''} · ${total} match${total === 1 ? '' : 'es'} in all`);
    reveal(store, h);
  };
  const replaceOne = () => {
    remember();
    const h = last.current;
    if (h && hitValid(store.deck, h, opts)) {
      const before = findAll(store.deck, q, opts);
      const i = before.findIndex((x) => sameSpot(x, h) && x.para === h.para && x.start === h.start);
      store.tryChange('Replace', () => { const p = paraOf(store.deck, h); if (p) replaceRange(p, h.start, h.end, r); });
      const after = findAll(store.deck, q, opts);
      // If the replacement itself matches, it stays in the list and is skipped.
      const at = after.length === before.length ? i + 1 : i;
      const n = after.length ? after[((at % after.length) + after.length) % after.length] : undefined;
      if (!n) { last.current = null; setMsg('All matches replaced.'); return; }
      last.current = n;
      setMsg(`Slide ${n.slide + 1}${n.shape === null ? ' notes' : ''} · ${after.length} match${after.length === 1 ? '' : 'es'} left`);
      reveal(store, n);
      return;
    }
    findNext();
  };
  const doReplaceAll = () => {
    remember();
    let n = 0;
    store.tryChange('Replace all', () => { n = replaceAll(store.deck, q, r, opts); });
    last.current = null;
    setMsg(n ? `Replaced ${n} match${n === 1 ? '' : 'es'}.` : 'No matches found.');
  };
  return (
    <Dialog title={replace ? 'Replace' : 'Find'} close={() => { remember(); close(); }} width={440}
      footer={<>
        <button onClick={findNext} disabled={!q}>Find next</button>
        {replace && <button onClick={replaceOne} disabled={!q}>Replace</button>}
        {replace && <button onClick={doReplaceAll} disabled={!q}>Replace all</button>}
      </>}>
      <Field label="Find what"><input autoFocus value={q} onChange={(e) => { setQ(e.target.value); last.current = null; setMsg(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); findNext(); } }} /></Field>
      {replace
        ? <Field label="Replace with"><input value={r} onChange={(e) => setR(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); replaceOne(); } }} /></Field>
        : <button className="tool" onClick={() => setReplace(true)}>Replace…</button>}
      <div className="rowx">
        <Check label="Match case" checked={!!opts.matchCase} onChange={(v) => { setOpts({ ...opts, matchCase: v }); last.current = null; }} />
        <Check label="Whole words only" checked={!!opts.wholeWord} onChange={(v) => { setOpts({ ...opts, wholeWord: v }); last.current = null; }} />
        <Check label="Search notes" checked={!!opts.notes} onChange={(v) => { setOpts({ ...opts, notes: v }); last.current = null; }} />
      </div>
      <div className="muted small" role="status" style={{ minHeight: 18 }}>{msg}</div>
    </Dialog>
  );
};

// ---------- Replace fonts ----------

const ReplaceFontsDialog = ({ store, close }: DialogProps) => {
  const used = useMemo(() => fontsInDeck(store.deck), [store.deck]);
  const [from, setFrom] = useState(used[0] ?? '');
  const [to, setTo] = useState(FONT_NAMES.find((f) => f !== used[0]) ?? 'Arial');
  const [msg, setMsg] = useState('');
  const all = [...new Set([...FONT_NAMES, ...used])].sort((a, b) => a.localeCompare(b));
  return (
    <Dialog title="Replace fonts" close={close} width={380}
      footer={<button disabled={!from || from === to} onClick={() => {
        let n = 0;
        store.tryChange('Replace fonts', () => { n = replaceFont(store.deck, from, to); });
        setMsg(n ? `Replaced ${from} with ${to} in ${n} place${n === 1 ? '' : 's'}.` : `${from} isn't used.`);
      }}>Replace</button>}>
      <Field label="Replace"><select value={from} onChange={(e) => setFrom(e.target.value)}>{used.map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
      <Field label="With"><select value={to} onChange={(e) => setTo(e.target.value)}>{all.map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
      <p className="muted small">Changes slides, layouts, masters and the theme fonts.</p>
      <div className="muted small" role="status">{msg}</div>
    </Dialog>
  );
};

// ---------- Size and position, alt text ----------

const SizePositionDialog = ({ store, close }: DialogProps) => (
  <Dialog title="Size and position" close={close} width={380}>
    {store.sel.length ? <><h3 className="fmth">Size</h3><SizeFields store={store} /><h3 className="fmth">Position</h3><PositionFields store={store} /></> : <p className="muted">Select an object first.</p>}
  </Dialog>
);

const AltTextDialog = ({ store, close }: DialogProps) => (
  <Dialog title="Alt text" close={() => { (document.activeElement as HTMLElement | null)?.blur(); close(); }} width={400}>
    <p className="muted small">Describe the object for people who use screen readers. Mark it decorative if it carries no meaning.</p>
    <AltFields store={store} />
  </Dialog>
);

// ---------- Paragraph ----------

const ParagraphDialog = ({ store, data, close }: DialogProps<string>) => {
  const cur = paraStyle(store);
  const [align, setAlign] = useState(cur.align ?? 'l');
  const [before, setBefore] = useState(((cur.marginLeft ?? 0) / 96));
  const ind = cur.indent ?? 0;
  const [special, setSpecial] = useState<'none' | 'first' | 'hanging'>(ind > 0 ? 'first' : ind < 0 ? 'hanging' : 'none');
  const [by, setBy] = useState(Math.abs(ind) / 96);
  const [sb, setSb] = useState(cur.spaceBefore ?? 0);
  const [sa, setSa] = useState(cur.spaceAfter ?? 0);
  const ls0 = cur.lineSpacing ?? 100;
  const [lsMode, setLsMode] = useState<'single' | '1.5' | 'double' | 'exact' | 'multiple'>(cur.lineSpacingPts ? 'exact' : ls0 === 100 ? 'single' : ls0 === 150 ? '1.5' : ls0 === 200 ? 'double' : 'multiple');
  const [lsAt, setLsAt] = useState(cur.lineSpacingPts ? ls0 : ls0 / 100);
  const [tabs, setTabs] = useState(cur.tabs ?? []);
  const [tabPos, setTabPos] = useState(1);
  const [tabAlign, setTabAlign] = useState<'l' | 'ctr' | 'r' | 'dec'>('l');
  const [spacing, setSpacing] = useState(runStyle(store).spacing ?? 0);
  const [tab, setTab] = useState<'para' | 'font'>(data === 'font' ? 'font' : 'para');
  const ok = () => {
    const ls = lsMode === 'single' ? 100 : lsMode === '1.5' ? 150 : lsMode === 'double' ? 200 : lsMode === 'exact' ? lsAt : lsAt * 100;
    const patch: ParaStyle = {
      align, marginLeft: Math.max(0, before * 96), indent: special === 'none' ? 0 : special === 'first' ? by * 96 : -by * 96,
      spaceBefore: Math.max(0, sb), spaceAfter: Math.max(0, sa), lineSpacing: ls, lineSpacingPts: lsMode === 'exact' ? true : undefined,
      tabs: tabs.length ? [...tabs].sort((a, b) => a.pos - b.pos) : undefined,
    };
    store.change('Paragraph', () => {
      textApi().applyParaStyle(store, patch);
      if ((runStyle(store).spacing ?? 0) !== spacing) tx(store, 'text.spacing', spacing);
    });
  };
  return (
    <Dialog title="Paragraph" close={close} onOk={() => { try { ok(); } catch { /* final */ } }} width={460}>
      <div className="tabsrow">
        <button className={tab === 'para' ? 'on' : ''} onClick={() => setTab('para')}>Indents and spacing</button>
        <button className={tab === 'font' ? 'on' : ''} onClick={() => setTab('font')}>Character spacing</button>
      </div>
      {tab === 'para' ? <>
        <h3 className="fmth">General</h3>
        <Select label="Alignment" value={align} options={[['l', 'Left'], ['ctr', 'Centered'], ['r', 'Right'], ['just', 'Justified'], ['dist', 'Distributed']]} onChange={setAlign} />
        <h3 className="fmth">Indentation</h3>
        <div className="grid3">
          <NumberField label="Before text" suffix="in" value={Math.round(before * 100) / 100} step={0.1} min={0} onChange={setBefore} />
          <Select label="Special" value={special} options={[['none', '(none)'], ['first', 'First line'], ['hanging', 'Hanging']]} onChange={setSpecial} />
          <NumberField label="By" suffix="in" value={Math.round(by * 100) / 100} step={0.1} min={0} onChange={setBy} />
        </div>
        <h3 className="fmth">Spacing</h3>
        <div className="grid2">
          <NumberField label="Before" suffix="pt" value={sb} step={6} min={0} onChange={setSb} />
          <NumberField label="After" suffix="pt" value={sa} step={6} min={0} onChange={setSa} />
          <Select label="Line spacing" value={lsMode} options={[['single', 'Single'], ['1.5', '1.5 lines'], ['double', 'Double'], ['exact', 'Exactly'], ['multiple', 'Multiple']]}
            onChange={(v) => { setLsMode(v); if (v === 'exact') setLsAt(Math.round(((runStyle(store).size ?? 18) * 1.2))); if (v === 'multiple') setLsAt(1.2); }} />
          {(lsMode === 'exact' || lsMode === 'multiple') && <NumberField label="At" suffix={lsMode === 'exact' ? 'pt' : undefined} value={lsAt} step={lsMode === 'exact' ? 1 : 0.1} min={lsMode === 'exact' ? 1 : 0.1} onChange={setLsAt} />}
        </div>
        <h3 className="fmth">Tabs</h3>
        <div className="rowx">
          <NumberField label="Tab stop" suffix="in" value={tabPos} step={0.25} min={0} onChange={setTabPos} width={110} />
          <Select label="Alignment" value={tabAlign} options={[['l', 'Left'], ['ctr', 'Center'], ['r', 'Right'], ['dec', 'Decimal']]} onChange={setTabAlign} />
          <button className="tool" style={{ alignSelf: 'flex-end' }} onClick={() => setTabs([...tabs.filter((t) => Math.abs(t.pos - tabPos * 96) > 0.5), { pos: tabPos * 96, align: tabAlign }])}>Set</button>
          <button className="tool" style={{ alignSelf: 'flex-end' }} disabled={!tabs.length} onClick={() => setTabs([])}>Clear all</button>
        </div>
        {tabs.length > 0 && <div className="fmttabs2">{[...tabs].sort((a, b) => a.pos - b.pos).map((t) => (
          <button key={t.pos} className="stylechip" title="Remove tab stop" onClick={() => setTabs(tabs.filter((x) => x !== t))}>{(t.pos / 96).toFixed(2)} in · {({ l: 'left', ctr: 'center', r: 'right', dec: 'decimal' })[t.align]} ×</button>
        ))}</div>}
      </> : <>
        <Select label="Spacing" value={spacing === 0 ? 'normal' : spacing > 0 ? 'expanded' : 'condensed'} options={[['normal', 'Normal'], ['expanded', 'Expanded'], ['condensed', 'Condensed']]}
          onChange={(v) => setSpacing(v === 'normal' ? 0 : v === 'expanded' ? Math.abs(spacing) || 1 : -(Math.abs(spacing) || 1))} />
        <NumberField label="By" suffix="pt" value={Math.abs(spacing)} step={0.1} min={0} max={1584} onChange={(n) => setSpacing(spacing < 0 ? -n : n)} />
      </>}
    </Dialog>
  );
};

// ---------- Bullets and numbering ----------

const BulletsDialog = ({ store, data, close }: DialogProps<string>) => {
  const cur = paraStyle(store).bullet;
  const runSize = runStyle(store).size ?? 18;
  const [tab, setTab] = useState<'bullets' | 'numbers'>(data === 'numbers' || cur?.type === 'auto' ? 'numbers' : 'bullets');
  const [char, setChar] = useState(cur?.type === 'char' ? cur.char : '•');
  const [font, setFont] = useState(cur?.type === 'char' ? cur.font ?? 'Arial' : 'Arial');
  const [scheme, setScheme] = useState<AutoNumber>(cur?.type === 'auto' ? cur.scheme : 'arabicPeriod');
  const [start, setStart] = useState(cur?.type === 'auto' ? cur.start ?? 1 : 1);
  const [size, setSize] = useState((cur?.type === 'char' || cur?.type === 'auto') && cur.size ? cur.size : 100);
  const [color, setColor] = useState<Color | undefined>((cur?.type === 'char' || cur?.type === 'auto') ? cur.color : undefined);
  const [none, setNone] = useState(!cur || cur.type === 'none');
  const theme = store.deck.masters[0]!.theme;
  const extra = { ...(size !== 100 ? { size } : {}), ...(color ? { color } : {}) };
  const spec: BulletSpec = none ? { type: 'none' } : tab === 'bullets' ? { type: 'char', char: char || '•', font, ...extra } : { type: 'auto', scheme, ...(start !== 1 ? { start } : {}), ...extra };
  const col = color ? css(color, { theme }) : undefined;
  return (
    <Dialog title="Bullets and numbering" close={close} width={480} onOk={() => tx(store, 'text.bulletStyle', spec)}>
      <div className="tabsrow">
        <button className={tab === 'bullets' ? 'on' : ''} onClick={() => setTab('bullets')}>Bullets</button>
        <button className={tab === 'numbers' ? 'on' : ''} onClick={() => setTab('numbers')}>Numbering</button>
      </div>
      <div className="gallery fmtbullets big">
        <button className={none ? 'on' : ''} onClick={() => setNone(true)}><span className="bl none">None</span></button>
        {tab === 'bullets' ? BULLET_CHARS.map((c) => (
          <button key={c.char} className={!none && char === c.char ? 'on' : ''} title={c.label} aria-label={c.label} onClick={() => { setNone(false); setChar(c.char); setFont(c.font ?? 'Arial'); }}>
            <span className="bl" style={{ color: col }}>{[0, 1, 2].map((i) => <span key={i}><b>{c.char}</b><i /></span>)}</span>
          </button>
        )) : NUMBER_SCHEMES.map((n) => (
          <button key={n} className={!none && scheme === n ? 'on' : ''} aria-label={autoNumberText(n, 1)} onClick={() => { setNone(false); setScheme(n); }}>
            <span className="bl" style={{ color: col }}>{[0, 1, 2].map((i) => <span key={i}><b>{autoNumberText(n, start + i)}</b><i /></span>)}</span>
          </button>
        ))}
      </div>
      <div className="grid2">
        <NumberField label="Size" suffix="% of text" value={size} min={25} max={400} step={5} onChange={setSize} />
        {tab === 'numbers'
          ? <NumberField label="Start at" value={start} min={1} max={32767} onChange={(n) => setStart(Math.round(n))} />
          : <Field label="Custom character"><input value={char} maxLength={2} onChange={(e) => { setNone(false); setChar([...e.target.value].slice(-1).join('') || '•'); }} /></Field>}
      </div>
      <div className="rowx">
        <ColorButton store={store} label="Color" value={color} auto="Same as text" onPick={(c) => setColor(c && !(typeof c === 'object' && 'theme' in c && c.theme === 'tx1' && !c.lum) ? c : undefined)} />
        {tab === 'bullets' && <Select label="Font" value={font} options={[...new Set(['Arial', ...FONT_NAMES])].map((f) => [f, f] as [string, string])} onChange={setFont} />}
        <span className="muted small">Text is {runSize} pt</span>
      </div>
    </Dialog>
  );
};


export const registerFormatDialogs = (): void => {
  registerDialog('format.find', FindDialog);
  registerDialog('format.replaceFonts', ReplaceFontsDialog);
  registerDialog('format.sizePosition', SizePositionDialog);
  registerDialog('format.altText', AltTextDialog);
  registerDialog('format.paragraph', ParagraphDialog);
  registerDialog('format.bullets', BulletsDialog);
};
