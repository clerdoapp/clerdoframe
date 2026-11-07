/**
 * Notes master and handout master: printed-page designs kept in deck.notesMaster.keep as JSON
 * (key 'clerdo.pages'). Simple by design: which placeholders show, header and footer text,
 * orientation, and slides per handout page.
 */
import { X } from 'lucide-react';
import { registerPanelSection, registerView } from '../../app/registry';
import { run } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import type { Deck } from '../../model/deck';
import { SlideView } from '../../render/SlideView';
import { Check, S, Select } from '../../ui/kit';

export interface PageSettings {
  header: boolean; date: boolean; footer: boolean; number: boolean;
  headerText: string; footerText: string;
  orientation: 'portrait' | 'landscape';
}
export interface NotesSettings extends PageSettings { slideImage: boolean; body: boolean }
export interface HandoutSettings extends PageSettings { perPage: 1 | 2 | 3 | 4 | 6 | 9 }
export interface Pages { notes: NotesSettings; handout: HandoutSettings }

const KEY = 'clerdo.pages';
const base: PageSettings = { header: true, date: true, footer: true, number: true, headerText: '', footerText: '', orientation: 'portrait' };
export const defaultPages = (): Pages => ({ notes: { ...base, slideImage: true, body: true }, handout: { ...base, perPage: 6 } });

export const readPages = (deck: Deck): Pages => {
  const d = defaultPages();
  const raw = deck.notesMaster?.keep?.[KEY];
  if (!raw) return d;
  try {
    const p = JSON.parse(raw) as Partial<Pages>;
    return { notes: { ...d.notes, ...(p.notes ?? {}) }, handout: { ...d.handout, ...(p.handout ?? {}) } };
  } catch { return d; }
};

export const writePages = (deck: Deck, p: Pages): void => {
  deck.notesMaster = { ...(deck.notesMaster ?? {}), keep: { ...(deck.notesMaster?.keep ?? {}), [KEY]: JSON.stringify(p) } };
};

const update = <K extends keyof Pages>(s: FrameStore, which: K, patch: Partial<Pages[K]>) =>
  s.tryChange(which === 'notes' ? 'Notes master' : 'Handout master', () => { const p = readPages(s.deck); p[which] = { ...p[which], ...patch } as Pages[K]; writePages(s.deck, p); });

const Ph = ({ label, style, children }: { label: string; style: React.CSSProperties; children?: React.ReactNode }) => (
  <div className="vw-ph" style={style}>{children ?? <span>{label}</span>}</div>
);

const gridFor = (n: number, portrait: boolean): [number, number] => {
  if (n === 1) return [1, 1];
  if (n === 2) return portrait ? [1, 2] : [2, 1];
  if (n === 3) return portrait ? [1, 3] : [3, 1];
  if (n === 4) return [2, 2];
  if (n === 6) return portrait ? [2, 3] : [3, 2];
  return [3, 3];
};

const Page = ({ store, kind }: { store: FrameStore; kind: 'notes' | 'handout' }) => {
  const p = readPages(store.deck);
  const st = p[kind];
  const portrait = st.orientation === 'portrait';
  const deck = store.deck;
  const slides = deck.slides.length ? deck.slides : [];
  const edges = (
    <>
      {st.header && <Ph label={st.headerText || 'Header'} style={{ left: '6%', top: '3%', width: '42%', height: '5%' }} />}
      {st.date && <Ph label={new Date().toLocaleDateString()} style={{ right: '6%', top: '3%', width: '42%', height: '5%', textAlign: 'right' }} />}
      {st.footer && <Ph label={st.footerText || 'Footer'} style={{ left: '6%', bottom: '3%', width: '42%', height: '5%' }} />}
      {st.number && <Ph label="‹#›" style={{ right: '6%', bottom: '3%', width: '42%', height: '5%', textAlign: 'right' }} />}
    </>
  );
  let body: React.ReactNode;
  if (kind === 'notes') {
    const n = p.notes;
    body = (
      <>
        {n.slideImage && <Ph label="Slide image" style={{ left: '14%', top: '11%', width: '72%', height: portrait ? '36%' : '44%' }}>{slides[0] && <SlideView deck={deck} slide={slides[0]} />}</Ph>}
        {n.body && <Ph label="" style={{ left: '10%', top: portrait ? '51%' : '58%', width: '80%', height: portrait ? '40%' : '32%' }}>
          <ul className="vw-phbody"><li>Click to edit notes text styles</li><li className="l2">Second level</li><li className="l3">Third level</li></ul>
        </Ph>}
      </>
    );
  } else {
    const [c, r] = gridFor(p.handout.perPage, portrait);
    const lines = p.handout.perPage === 3;
    body = (
      <div className="vw-hgrid" style={{ gridTemplateColumns: `repeat(${lines ? 2 : c}, 1fr)`, gridTemplateRows: `repeat(${r}, 1fr)` }}>
        {Array.from({ length: p.handout.perPage }, (_, i) => (
          [<div key={`s${i}`} className="vw-hslot" style={{ aspectRatio: `${deck.w} / ${deck.h}` }}>{slides[i] ? <SlideView deck={deck} slide={slides[i]!} /> : null}</div>,
            lines ? <div key={`l${i}`} className="vw-hlines" aria-hidden>{Array.from({ length: 6 }, (_, k) => <i key={k} />)}</div> : null]
        ))}
      </div>
    );
  }
  return (
    <div className="vw-npage-wrap">
      <div className={`vw-mpage${portrait ? '' : ' land'}`} role="document" aria-label={kind === 'notes' ? 'Notes master' : 'Handout master'}>
        {edges}{body}
      </div>
    </div>
  );
};

const Tools = ({ store, kind }: { store: FrameStore; kind: 'notes' | 'handout' }) => {
  const p = readPages(store.deck);
  const st = p[kind];
  const set = (patch: Partial<NotesSettings & HandoutSettings>) => update(store, kind, patch as never);
  return (
    <div className="toollist">
      <Select label="Orientation" value={st.orientation} options={[['portrait', 'Portrait'], ['landscape', 'Landscape']]} onChange={(v) => set({ orientation: v })} />
      {kind === 'handout' && (
        <Select label="Slides per page" value={String(p.handout.perPage) as '6'} options={[['1', '1 slide'], ['2', '2 slides'], ['3', '3 slides with lines'], ['4', '4 slides'], ['6', '6 slides'], ['9', '9 slides']]}
          onChange={(v) => set({ perPage: Number(v) as HandoutSettings['perPage'] })} />
      )}
      <h3 className="vw-sub">Placeholders</h3>
      <Check label="Header" checked={st.header} onChange={(v) => set({ header: v })} />
      {st.header && <input key={`h${st.headerText}`} aria-label="Header text" placeholder="Header text" defaultValue={st.headerText} onKeyDown={(e) => e.stopPropagation()} onBlur={(e) => { if (e.target.value !== st.headerText) set({ headerText: e.target.value }); }} />}
      {kind === 'notes' && <Check label="Slide image" checked={p.notes.slideImage} onChange={(v) => set({ slideImage: v })} />}
      <Check label="Date" checked={st.date} onChange={(v) => set({ date: v })} />
      {kind === 'notes' && <Check label="Body" checked={p.notes.body} onChange={(v) => set({ body: v })} />}
      <Check label="Footer" checked={st.footer} onChange={(v) => set({ footer: v })} />
      {st.footer && <input key={`f${st.footerText}`} aria-label="Footer text" placeholder="Footer text" defaultValue={st.footerText} onKeyDown={(e) => e.stopPropagation()} onBlur={(e) => { if (e.target.value !== st.footerText) set({ footerText: e.target.value }); }} />}
      <Check label="Page number" checked={st.number} onChange={(v) => set({ number: v })} />
      <button className="tool" onClick={() => run(store, 'view.mode', 'normal')}><X size={16} strokeWidth={S} /> Close master view</button>
    </div>
  );
};

export const registerPageMasters = (): void => {
  registerView({ mode: 'notesMaster', render: (s) => <Page store={s} kind="notes" /> });
  registerView({ mode: 'handoutMaster', render: (s) => <Page store={s} kind="handout" /> });
  registerPanelSection({ tab: 'home', title: 'Notes master', order: -20, when: (s) => s.view.mode === 'notesMaster', render: (s) => <Tools store={s} kind="notes" /> });
  registerPanelSection({ tab: 'home', title: 'Handout master', order: -20, when: (s) => s.view.mode === 'handoutMaster', render: (s) => <Tools store={s} kind="handout" /> });
};
