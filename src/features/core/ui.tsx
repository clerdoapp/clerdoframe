import { useMemo, useState } from 'react';
import { allCommands, run } from '../../app/commands';
import { registerDialog, type DialogProps } from '../../app/registry';
import { Dialog, Field } from '../../ui/kit';
import { prettyKeys } from '../../ui/keys';

const PaletteDialog = ({ store, close }: DialogProps) => {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return allCommands().filter((c) => !c.hidden && (c.enabled?.(store) ?? true))
      .filter((c) => words.every((w) => `${c.label} ${c.group ?? ''}`.toLowerCase().includes(w)))
      .slice(0, 60);
  }, [q, store]);
  const go = (id: string) => { close(); run(store, id); };
  return (
    <div className="backdrop top" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog palette" role="dialog" aria-label="Search commands">
        <input className="palinput" autoFocus placeholder="Search commands" value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(list.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); }
            else if (e.key === 'Enter' && list[i]) go(list[i]!.id);
          }} />
        <div className="pallist" role="listbox">
          {list.map((c, k) => (
            <button key={c.id} role="option" aria-selected={k === i} className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onClick={() => go(c.id)}>
              <span>{c.label}{c.group && <span className="muted small"> · {c.group}</span>}</span>
              {c.keys && <kbd>{prettyKeys(c.keys)}</kbd>}
            </button>
          ))}
          {!list.length && <div className="muted pad">No matching commands</div>}
        </div>
      </div>
    </div>
  );
};

const RenameSectionDialog = ({ store, data, close }: DialogProps<string>) => {
  const sec = store.deck.sections.find((x) => x.id === data);
  const [name, setName] = useState(sec?.name ?? '');
  if (!sec) return null;
  return (
    <Dialog title="Rename section" close={close} okLabel="Rename" onOk={() => { store.tryChange('Rename section', () => { sec.name = name.trim() || sec.name; }); }}>
      <Field label="Section name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Dialog>
  );
};

export const registerCoreUi = (): void => {
  registerDialog('palette', PaletteDialog);
  registerDialog('renameSection', RenameSectionDialog);
};
