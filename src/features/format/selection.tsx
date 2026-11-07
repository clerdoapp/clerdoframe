import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, EyeOff, Lock, LockOpen } from 'lucide-react';
import { registerPane } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { Id, Shape } from '../../model/deck';
import { S } from '../../ui/kit';
import { moveToIndex } from './ops';

const kindLabel = (s: Shape): string => s.kind === 'shape' ? (s.textbox ? 'Text box' : 'Shape') : s.kind[0]!.toUpperCase() + s.kind.slice(1);

const Row = ({ store, s, depth, open, toggle, drag, setDrag }: {
  store: FrameStore; s: Shape; depth: number; open: Set<Id>; toggle: (id: Id) => void;
  drag: { id: Id; over: Id | null; after: boolean } | null; setDrag: (d: { id: Id; over: Id | null; after: boolean } | null) => void;
}) => {
  const [edit, setEdit] = useState(false);
  const sel = store.sel.includes(s.id);
  const isOpen = open.has(s.id);
  const rename = (name: string) => { const n = name.trim(); setEdit(false); if (n && n !== s.name) store.tryChange('Rename', () => { s.name = n; }); };
  const pick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) store.select(sel ? store.sel.filter((x) => x !== s.id) : [...store.sel, s.id]);
    else store.select([s.id]);
  };
  const over = drag?.over === s.id;
  return (
    <>
      <div className={`selrow${sel ? ' on' : ''}${s.hidden ? ' hid' : ''}${over ? (drag!.after ? ' dropafter' : ' dropbefore') : ''}`} role="treeitem" aria-selected={sel} aria-expanded={s.kind === 'group' ? isOpen : undefined}
        style={{ paddingInlineStart: 4 + depth * 16 }} draggable={!edit}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); setDrag({ id: s.id, over: null, after: false }); }}
        onDragOver={(e) => { if (!drag || drag.id === s.id) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDrag({ ...drag, over: s.id, after: e.clientY > r.top + r.height / 2 }); }}
        onDragEnd={() => setDrag(null)}
        onDrop={(e) => { e.preventDefault(); if (drag && drag.id !== s.id) dropOn(store, drag.id, s.id, drag.after); setDrag(null); }}>
        {s.kind === 'group'
          ? <button className="ico sm" aria-label={isOpen ? 'Collapse group' : 'Expand group'} onClick={() => toggle(s.id)}>{isOpen ? <ChevronDown size={14} strokeWidth={S} /> : <ChevronRight size={14} strokeWidth={S} />}</button>
          : <span className="selspacer" />}
        {edit
          ? <input className="selname" autoFocus defaultValue={s.name} aria-label="Name" onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') rename((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEdit(false); }} />
          : <button className="selname" title={`${s.name || kindLabel(s)} (${kindLabel(s)}). Double-click to rename.`} onClick={pick} onDoubleClick={() => setEdit(true)}>{s.name || kindLabel(s)}</button>}
        <button className="ico sm" aria-label={s.locked ? 'Unlock' : 'Lock'} title={s.locked ? 'Unlock' : 'Lock'} aria-pressed={!!s.locked}
          onClick={() => store.tryChange(s.locked ? 'Unlock' : 'Lock', () => { s.locked = !s.locked || undefined; })}>
          {s.locked ? <Lock size={14} strokeWidth={S} /> : <LockOpen size={14} strokeWidth={S} className="faint" />}
        </button>
        <button className="ico sm" aria-label={s.hidden ? 'Show' : 'Hide'} title={s.hidden ? 'Show' : 'Hide'} aria-pressed={!!s.hidden}
          onClick={() => store.tryChange(s.hidden ? 'Show' : 'Hide', () => { s.hidden = !s.hidden || undefined; if (s.hidden) store.sel = store.sel.filter((x) => x !== s.id); })}>
          {s.hidden ? <EyeOff size={14} strokeWidth={S} /> : <Eye size={14} strokeWidth={S} />}
        </button>
      </div>
      {s.kind === 'group' && isOpen && [...s.children].reverse().map((c) => <Row key={c.id} store={store} s={c} depth={depth + 1} open={open} toggle={toggle} drag={drag} setDrag={setDrag} />)}
    </>
  );
};

/** Drops a shape above/below another in the same list (the pane shows the top of the stack first). */
const dropOn = (store: FrameStore, id: Id, target: Id, below: boolean) => {
  const a = store.parentList(id), b = store.parentList(target);
  if (!a || !b || a.list !== b.list) { store.notify('Shapes can only be reordered within the same group.'); return; }
  store.tryChange('Reorder', () => {
    const list = a.list;
    const moving = list.find((x) => x.id === id)!;
    const without = list.filter((x) => x.id !== id);
    const ti = without.findIndex((x) => x.id === target);
    // Pane order is reversed: "below" in the pane means lower in the stack.
    without.splice(below ? ti : ti + 1, 0, moving);
    list.splice(0, list.length, ...without);
  });
};

const step = (store: FrameStore, up: boolean) => {
  store.tryChange(up ? 'Bring forward' : 'Send backward', () => {
    for (const id of store.sel) {
      const p = store.parentList(id);
      if (!p) continue;
      const i = p.list.findIndex((x) => x.id === id);
      moveToIndex(p.list, id, up ? i + 1 : i - 1);
    }
  });
};

const SelectionPane = ({ store }: { store: FrameStore }) => {
  const [open, setOpen] = useState<Set<Id>>(new Set());
  const [drag, setDrag] = useState<{ id: Id; over: Id | null; after: boolean } | null>(null);
  const shapes = store.shapes();
  const toggle = (id: Id) => { const n = new Set(open); if (n.has(id)) n.delete(id); else n.add(id); setOpen(n); };
  const setAll = (hidden: boolean) => store.tryChange(hidden ? 'Hide all' : 'Show all', () => {
    const walk = (l: Shape[]) => { for (const s of l) { s.hidden = hidden || undefined; if (s.kind === 'group') walk(s.children); } };
    walk(shapes);
    if (hidden) store.sel = [];
  });
  return (
    <div className="selpane">
      <div className="rowx">
        <button className="tool" onClick={() => setAll(false)}>Show all</button>
        <button className="tool" onClick={() => setAll(true)}>Hide all</button>
        <div className="grow" />
        <button className="tool icon" aria-label="Bring forward" title="Bring forward" disabled={!store.sel.length} onClick={() => step(store, true)}><ArrowUp size={16} strokeWidth={S} /></button>
        <button className="tool icon" aria-label="Send backward" title="Send backward" disabled={!store.sel.length} onClick={() => step(store, false)}><ArrowDown size={16} strokeWidth={S} /></button>
      </div>
      <div className="seltree" role="tree" aria-label="Objects on this slide" aria-multiselectable="true">
        {[...shapes].reverse().map((s) => <Row key={s.id} store={store} s={s} depth={0} open={open} toggle={toggle} drag={drag} setDrag={setDrag} />)}
        {!shapes.length && <p className="muted small pad">There are no objects on this slide.</p>}
      </div>
      <p className="muted small">The top of the list is in front. Drag to reorder. Double-click a name to rename it.</p>
    </div>
  );
};

export const registerSelectionPane = (): void => {
  registerPane({ id: 'selection', title: 'Selection', width: 280, render: (s) => <SelectionPane store={s} /> });
};
