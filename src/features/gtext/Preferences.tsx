import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { DialogProps } from '../../app/registry';
import { Check, Dialog, S, Select } from '../../ui/kit';
import { DEFAULT_SUBS, type Substitution, type TypingPrefs } from './autocorrect';
import { prefs, setPrefs } from './prefs';
import { VOICE_LANGS } from './voiceLangs';

export const PreferencesDialog = ({ close, data }: DialogProps<{ tab?: 'general' | 'subs' }>) => {
  const [tab, setTab] = useState<'general' | 'subs'>(data?.tab ?? 'general');
  const [p, setP] = useState<TypingPrefs>(() => structuredClone(prefs()));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const set = (patch: Partial<TypingPrefs>) => setP((x) => ({ ...x, ...patch }));
  const setSubs = (subs: Substitution[]) => set({ subs });
  const add = () => {
    const f = from.trim(), t = to;
    if (!f || !t || f === t) return;
    setSubs([...p.subs.filter((s) => s.from !== f), { from: f, to: t, on: true }]);
    setFrom(''); setTo('');
  };
  return (
    <Dialog title="Preferences" close={close} width={520} okLabel="Save" onOk={() => { setPrefs(p); }}>
      <div className="tabsrow" role="tablist">
        <button role="tab" aria-selected={tab === 'general'} className={tab === 'general' ? 'on' : ''} onClick={() => setTab('general')}>General</button>
        <button role="tab" aria-selected={tab === 'subs'} className={tab === 'subs' ? 'on' : ''} onClick={() => setTab('subs')}>Substitutions</button>
      </div>
      {tab === 'general' ? (
        <div className="gt-prefs">
          <Check label="Use smart quotes" checked={p.smartQuotes} onChange={(v) => set({ smartQuotes: v })} />
          <Check label="Turn typed list markers into lists" checked={p.lists} onChange={(v) => set({ lists: v })} />
          <Check label="Turn typed web and email addresses into links" checked={p.links} onChange={(v) => set({ links: v })} />
          <Check label="Capitalize the first letter of sentences" checked={p.capitalize} onChange={(v) => set({ capitalize: v })} />
          <Check label="Strike through checked checklist items" checked={p.checkStrike} onChange={(v) => set({ checkStrike: v })} />
          <Select label="Voice typing language" value={p.voiceLang} options={[['', 'Same as the presentation'], ...VOICE_LANGS]} onChange={(v) => set({ voiceLang: v })} />
          <p className="muted small">These settings are kept on this device.</p>
        </div>
      ) : (
        <div className="gt-prefs">
          <Check label="Replace text as you type" checked={p.substitutions} onChange={(v) => set({ substitutions: v })} />
          <div className="gt-subs" role="table" aria-label="Substitutions">
            <div className="r head" role="row"><span>On</span><span>Replace</span><span>With</span><span /></div>
            {p.subs.map((s, i) => (
              <div className="r" role="row" key={`${s.from}-${i}`}>
                <input type="checkbox" aria-label={`Use ${s.from}`} checked={s.on} onChange={(e) => setSubs(p.subs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                <code>{s.from}</code>
                <code>{s.to}</code>
                <button className="tool icon" aria-label={`Remove ${s.from}`} title="Remove" onClick={() => setSubs(p.subs.filter((_, j) => j !== i))}><Trash2 size={15} strokeWidth={S} /></button>
              </div>
            ))}
            {!p.subs.length && <div className="muted small pad">No substitutions.</div>}
          </div>
          <div className="gt-addsub">
            <input aria-label="Replace" placeholder="Replace" maxLength={40} value={from} onChange={(e) => setFrom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(); } }} />
            <input aria-label="With" placeholder="With" maxLength={80} value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(); } }} />
            <button className="tool" onClick={add} disabled={!from.trim() || !to}>Add</button>
          </div>
          <div><button className="tool" onClick={() => setSubs(DEFAULT_SUBS.map((x) => ({ ...x })))}>Restore defaults</button></div>
        </div>
      )}
    </Dialog>
  );
};
