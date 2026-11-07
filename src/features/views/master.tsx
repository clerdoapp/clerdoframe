import { useState } from 'react';
import {
  Copy, EyeOff, FilePlus2, LayoutTemplate, Lock, Paintbrush, Palette, PanelTop, Pencil, Ratio, SquareDashed, SquarePlus, Trash2, Type, X,
} from 'lucide-react';
import { openDialog, registerCommands, run } from '../../app/commands';
import { registerDialog, registerMenu, registerPanelSection, registerTool, type DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { emptyText, uid, type AutoShape, type Layout, type Master, type PlaceholderType, type Shape } from '../../model/deck';
import { buildLayouts, newMaster } from '../../model/defaults';
import { SlideView } from '../../render/SlideView';
import { Btn, Check, Dialog, Field, S } from '../../ui/kit';

const FIELD: PlaceholderType[] = ['dt', 'ftr', 'sldNum'];

const curMaster = (s: FrameStore): Master | undefined => s.deck.masters[s.masterSel.master];
const curLayout = (s: FrameStore): Layout | undefined => { const m = curMaster(s); return m && s.masterSel.layout >= 0 ? m.layouts[s.masterSel.layout] : undefined; };
const inMaster = (s: FrameStore) => s.view.mode === 'master';
const usedBy = (s: FrameStore, l: Layout) => s.deck.slides.filter((x) => x.layout === l.id).length;

const reIdShapes = (list: Shape[]): Shape[] => list.map((x) => ({ ...structuredClone(x), id: uid('s') }));

/** Rescales a fresh default master to the deck size. */
const freshMaster = (s: FrameStore, name: string): Master => {
  const base = s.deck.masters[0];
  const m = newMaster(s.deck.w, s.deck.h, base ? structuredClone(base.theme) : undefined);
  m.name = name;
  return m;
};

// ---------- Master list (left side in master view) ----------

const MasterList = ({ store }: { store: FrameStore }) => {
  const d = store.deck;
  const sel = store.masterSel;
  const pick = (mi: number, li: number) => { store.masterSel = { master: mi, layout: li }; store.sel = []; store.editing = null; store.emit(); };
  const menu = (e: React.MouseEvent, mi: number, li: number) => { e.preventDefault(); pick(mi, li); store.menu = { x: e.clientX, y: e.clientY, kind: 'masterItem', data: { master: mi, layout: li } }; store.emit(); };
  const flat: [number, number][] = d.masters.flatMap((m, mi) => [[mi, -1] as [number, number], ...m.layouts.map((_, li) => [mi, li] as [number, number])]);
  return (
    <div className="slidelist vw-mlist" tabIndex={0} role="tree" aria-label="Masters and layouts"
      onKeyDown={(e) => {
        const i = flat.findIndex(([a, b]) => a === sel.master && b === sel.layout);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = flat[Math.max(0, Math.min(flat.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) pick(n[0], n[1]); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); run(store, 'master.delete'); }
      }}>
      {d.masters.map((m, mi) => (
        <div key={m.id} role="group">
          <div className="thumbrow" role="treeitem" aria-selected={sel.master === mi && sel.layout < 0}>
            <span className="num">{mi + 1}</span>
            <div className={`thumb vw-mthumb${sel.master === mi && sel.layout < 0 ? ' on' : ''}`} title={`${m.name} slide master`}
              onClick={() => pick(mi, -1)} onContextMenu={(e) => menu(e, mi, -1)}>
              <SlideView deck={d} master={m} width={176} />
              {m.keep?.preserve === '1' && <Lock className="vw-pin" size={12} strokeWidth={S} aria-label="Preserved" />}
            </div>
          </div>
          {m.layouts.map((l, li) => (
            <div key={l.id} className="thumbrow vw-lrow" role="treeitem" aria-selected={sel.master === mi && sel.layout === li}>
              <div className={`thumb${sel.master === mi && sel.layout === li ? ' on' : ''}`} title={`${l.name} layout: used by ${usedBy(store, l) || 'no'} slide${usedBy(store, l) === 1 ? '' : 's'}`}
                onClick={() => pick(mi, li)} onContextMenu={(e) => menu(e, mi, li)}>
                <SlideView deck={d} layout={l} master={m} width={140} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ---------- Dialogs ----------

const RenameDialog = ({ store, close }: DialogProps) => {
  const m = curMaster(store);
  const l = curLayout(store);
  const [name, setName] = useState(l?.name ?? m?.name ?? '');
  if (!m) return null;
  return (
    <Dialog title={l ? 'Rename layout' : 'Rename master'} close={close} okLabel="Rename"
      onOk={() => { store.tryChange('Rename', () => { if (l) l.name = name.trim() || l.name; else m.name = name.trim() || m.name; }); }}>
      <Field label={l ? 'Layout name' : 'Master name'}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Dialog>
  );
};

const MASTER_PH: { type: PlaceholderType; label: string }[] = [
  { type: 'title', label: 'Title' }, { type: 'body', label: 'Text' }, { type: 'dt', label: 'Date' }, { type: 'sldNum', label: 'Slide number' }, { type: 'ftr', label: 'Footer' },
];

/** Default boxes for master placeholders (designed at 1280 x 720). */
const phBox = (s: FrameStore, t: PlaceholderType): AutoShape => {
  const sx = s.deck.w / 1280, sy = s.deck.h / 720;
  const fresh = newMaster(1280, 720).shapes.find((x) => x.ph?.type === t) as AutoShape;
  return { ...fresh, id: uid('s'), x: Math.round(fresh.x * sx), y: Math.round(fresh.y * sy), w: Math.round(fresh.w * sx), h: Math.round(fresh.h * sy) };
};

const MasterLayoutDialog = ({ store, close }: DialogProps) => {
  const m = curMaster(store);
  const [on, setOn] = useState(() => new Set(MASTER_PH.filter((p) => m?.shapes.some((x) => x.ph?.type === p.type)).map((p) => p.type)));
  if (!m) return null;
  return (
    <Dialog title="Master layout" close={close}
      onOk={() => {
        store.tryChange('Master layout', () => {
          m.shapes = m.shapes.filter((x) => !x.ph || on.has(x.ph.type) || !MASTER_PH.some((p) => p.type === x.ph!.type));
          for (const p of MASTER_PH) if (on.has(p.type) && !m.shapes.some((x) => x.ph?.type === p.type)) m.shapes.push(phBox(store, p.type));
        });
      }}>
      <p className="muted small">Placeholders on the slide master</p>
      {MASTER_PH.map((p) => <Check key={p.type} label={p.label} checked={on.has(p.type)} onChange={(v) => { const n = new Set(on); if (v) n.add(p.type); else n.delete(p.type); setOn(n); }} />)}
    </Dialog>
  );
};

// ---------- Placeholder drawing tool ----------

const PH_TYPES: { id: string; label: string; ph: PlaceholderType; name: string }[] = [
  { id: 'content', label: 'Content', ph: 'obj', name: 'Content Placeholder' },
  { id: 'text', label: 'Text', ph: 'body', name: 'Text Placeholder' },
  { id: 'picture', label: 'Picture', ph: 'pic', name: 'Picture Placeholder' },
  { id: 'chart', label: 'Chart', ph: 'chart', name: 'Chart Placeholder' },
  { id: 'table', label: 'Table', ph: 'tbl', name: 'Table Placeholder' },
  { id: 'diagram', label: 'Diagram', ph: 'dgm', name: 'Diagram Placeholder' },
  { id: 'media', label: 'Media', ph: 'media', name: 'Media Placeholder' },
  { id: 'online', label: 'Online picture', ph: 'pic', name: 'Picture Placeholder' },
];

let drag: { x0: number; y0: number; x: number; y: number } | null = null;

const insertPlaceholder = (s: FrameStore, type: string, box: { x: number; y: number; w: number; h: number }): void => {
  const l = curLayout(s);
  const def = PH_TYPES.find((p) => p.id === type) ?? PH_TYPES[0]!;
  if (!l) { s.notify('Pick a layout to add a placeholder to.'); return; }
  s.tryChange('Insert placeholder', () => {
    const used = new Set(l.shapes.map((x) => x.ph?.idx).filter((x): x is number => x !== undefined));
    let idx = 13; while (used.has(idx)) idx++;
    const shape: AutoShape = { id: uid('s'), kind: 'shape', geom: 'rect', name: `${def.name} ${l.shapes.length + 1}`, ...box, ph: { type: def.ph, idx }, text: emptyText() };
    l.shapes.push(shape);
    s.sel = [shape.id];
  });
};

// ---------- Panel ----------

const MasterTools = ({ store }: { store: FrameStore }) => {
  const l = curLayout(store);
  const m = curMaster(store);
  const [ph, setPh] = useState('content');
  const hasTitle = !!l?.shapes.some((x) => x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle'));
  const hasFooters = !!l?.shapes.some((x) => x.ph && FIELD.includes(x.ph.type));
  const pop = (kind: string) => (e: React.MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); store.menu = { x: r.right + 4, y: r.top, kind }; store.emit(); };
  return (
    <>
      <div className="toollist">
        <Btn store={store} id="master.insertMaster" icon={FilePlus2} />
        <Btn store={store} id="master.insertLayout" icon={SquarePlus} />
        <Btn store={store} id="master.delete" icon={Trash2} />
        <Btn store={store} id="master.rename" icon={Pencil} />
        <Btn store={store} id="master.preserve" icon={Lock} />
        <Btn store={store} id="master.duplicate" icon={Copy} />
      </div>
      <h3 className="vw-sub">Master layout</h3>
      <div className="toollist">
        <Btn store={store} id="master.layoutDialog" icon={LayoutTemplate} />
        <div className="vw-phrow">
          <select aria-label="Placeholder type" value={ph} onChange={(e) => setPh(e.target.value)}>{PH_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          <button className={`tool${store.tool?.startsWith('placeholder:') ? ' on' : ''}`} disabled={!l} onClick={() => run(store, 'master.insertPlaceholder', ph)}><SquareDashed size={16} strokeWidth={S} /> Insert</button>
        </div>
        <Check label="Title" checked={hasTitle} onChange={() => run(store, 'master.toggleTitle')} />
        <Check label="Footers" checked={hasFooters} onChange={() => run(store, 'master.toggleFooters')} />
      </div>
      <h3 className="vw-sub">Edit theme</h3>
      <div className="toollist">
        <button className="tool" onClick={pop('designThemes')}><Palette size={16} strokeWidth={S} /> Themes</button>
        <button className="tool" onClick={pop('designColors')}><Paintbrush size={16} strokeWidth={S} /> Colors</button>
        <button className="tool" onClick={pop('designFonts')}><Type size={16} strokeWidth={S} /> Fonts</button>
        <button className="tool" onClick={pop('designBackgrounds')}><PanelTop size={16} strokeWidth={S} /> Background styles</button>
        <Btn store={store} id="design.hideBackgroundGraphics" icon={EyeOff} />
        <Btn store={store} id="design.slideSize" icon={Ratio} />
      </div>
      <div className="toollist">
        <Btn store={store} id="view.master" icon={X} label="Close master view" />
      </div>
      {m && <p className="muted small">{l ? `${l.name}: used by ${usedBy(store, l) || 'no'} slide${usedBy(store, l) === 1 ? '' : 's'}` : `${m.name} master`}</p>}
    </>
  );
};

// ---------- Registration ----------

export const registerMasterView = (registerView: (v: { mode: string; render: (s: FrameStore) => React.ReactNode }) => void): void => {
  registerView({ mode: 'masterList', render: (s) => <MasterList store={s} /> });
  registerDialog('master.rename', RenameDialog);
  registerDialog('master.layout', MasterLayoutDialog);

  registerCommands([
    {
      id: 'master.insertMaster', label: 'Insert slide master', group: 'Master', enabled: inMaster,
      run: (s) => s.tryChange('Insert slide master', () => {
        const m = freshMaster(s, `Master ${s.deck.masters.length + 1}`);
        m.keep = { ...(m.keep ?? {}), preserve: '1' };
        s.deck.masters.push(m);
        s.masterSel = { master: s.deck.masters.length - 1, layout: -1 };
      }),
    },
    {
      id: 'master.insertLayout', label: 'Insert layout', group: 'Master', enabled: inMaster,
      run: (s) => s.tryChange('Insert layout', () => {
        const m = curMaster(s);
        if (!m) return;
        const tmpl = buildLayouts(s.deck.w, s.deck.h).find((l) => l.type === 'titleOnly')!;
        const l: Layout = { ...tmpl, id: uid('l'), name: 'Custom Layout', type: 'cust', shapes: reIdShapes(tmpl.shapes) };
        const at = s.masterSel.layout >= 0 ? s.masterSel.layout + 1 : m.layouts.length;
        m.layouts.splice(at, 0, l);
        s.masterSel = { master: s.masterSel.master, layout: at };
      }),
    },
    {
      id: 'master.duplicate', label: 'Duplicate', group: 'Master', enabled: inMaster,
      run: (s) => s.tryChange('Duplicate', () => {
        const m = curMaster(s); const l = curLayout(s);
        if (!m) return;
        if (l) {
          const c: Layout = { ...structuredClone(l), id: uid('l'), name: `1_${l.name}`, shapes: reIdShapes(l.shapes) };
          m.layouts.splice(s.masterSel.layout + 1, 0, c);
          s.masterSel = { ...s.masterSel, layout: s.masterSel.layout + 1 };
        } else {
          const c: Master = { ...structuredClone(m), id: uid('m'), name: `1_${m.name}`, shapes: reIdShapes(m.shapes), layouts: m.layouts.map((x) => ({ ...structuredClone(x), id: uid('l'), shapes: reIdShapes(x.shapes) })) };
          s.deck.masters.splice(s.masterSel.master + 1, 0, c);
          s.masterSel = { master: s.masterSel.master + 1, layout: -1 };
        }
      }),
    },
    {
      id: 'master.delete', label: 'Delete', group: 'Master',
      enabled: (s) => {
        if (!inMaster(s)) return false;
        const l = curLayout(s);
        if (l) return usedBy(s, l) === 0 && (curMaster(s)?.layouts.length ?? 0) > 1;
        const m = curMaster(s);
        return s.deck.masters.length > 1 && !!m && !m.layouts.some((x) => usedBy(s, x) > 0);
      },
      run: (s) => s.tryChange('Delete', () => {
        const m = curMaster(s); const l = curLayout(s);
        if (!m) return;
        if (l) { m.layouts.splice(s.masterSel.layout, 1); s.masterSel = { ...s.masterSel, layout: Math.min(s.masterSel.layout, m.layouts.length - 1) }; }
        else { s.deck.masters.splice(s.masterSel.master, 1); s.masterSel = { master: Math.max(0, s.masterSel.master - 1), layout: -1 }; }
      }),
    },
    { id: 'master.rename', label: 'Rename…', group: 'Master', enabled: inMaster, run: (s) => openDialog(s, 'master.rename') },
    {
      id: 'master.preserve', label: 'Preserve', group: 'Master', enabled: (s) => inMaster(s) && !!curMaster(s),
      active: (s) => curMaster(s)?.keep?.preserve === '1',
      run: (s) => s.tryChange('Preserve master', () => {
        const m = curMaster(s);
        if (!m) return;
        const keep = { ...(m.keep ?? {}) };
        if (keep.preserve === '1') delete keep.preserve; else keep.preserve = '1';
        m.keep = Object.keys(keep).length ? keep : undefined;
      }),
    },
    { id: 'master.layoutDialog', label: 'Master layout…', group: 'Master', enabled: (s) => inMaster(s) && !curLayout(s), run: (s) => openDialog(s, 'master.layout') },
    {
      id: 'master.insertPlaceholder', label: 'Insert placeholder', group: 'Master', enabled: (s) => inMaster(s) && !!curLayout(s),
      run: (s, arg) => { const t = typeof arg === 'string' ? arg : 'content'; s.tool = s.tool === `placeholder:${t}` ? null : `placeholder:${t}`; s.sel = []; s.emit(); },
    },
    {
      id: 'master.toggleTitle', label: 'Layout title', group: 'Master', enabled: (s) => inMaster(s) && !!curLayout(s),
      active: (s) => !!curLayout(s)?.shapes.some((x) => x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle')),
      run: (s) => s.tryChange('Title placeholder', () => {
        const l = curLayout(s); const m = curMaster(s);
        if (!l || !m) return;
        const has = l.shapes.some((x) => x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle'));
        if (has) l.shapes = l.shapes.filter((x) => !(x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle')));
        else { const src = m.shapes.find((x) => x.ph?.type === 'title') ?? phBox(s, 'title'); l.shapes.unshift({ ...structuredClone(src), id: uid('s'), name: 'Title 1', text: emptyText() } as Shape); }
      }),
    },
    {
      id: 'master.toggleFooters', label: 'Layout footers', group: 'Master', enabled: (s) => inMaster(s) && !!curLayout(s),
      active: (s) => !!curLayout(s)?.shapes.some((x) => x.ph && FIELD.includes(x.ph.type)),
      run: (s) => s.tryChange('Footers', () => {
        const l = curLayout(s); const m = curMaster(s);
        if (!l || !m) return;
        const has = l.shapes.some((x) => x.ph && FIELD.includes(x.ph.type));
        if (has) l.shapes = l.shapes.filter((x) => !(x.ph && FIELD.includes(x.ph.type)));
        else for (const t of FIELD) { const src = m.shapes.find((x) => x.ph?.type === t) ?? phBox(s, t); l.shapes.push({ ...structuredClone(src), id: uid('s') } as Shape); }
      }),
    },
  ]);

  registerTool({
    id: 'placeholder',
    match: (t) => t.startsWith('placeholder:'),
    cursor: 'crosshair',
    down: (_s, p) => { drag = { x0: p.x, y0: p.y, x: p.x, y: p.y }; },
    move: (s, p) => { if (drag) { drag.x = p.x; drag.y = p.y; s.emit(); } },
    up: (s, p) => {
      if (!drag) return;
      const d = drag; drag = null;
      let x = Math.min(d.x0, p.x), y = Math.min(d.y0, p.y), w = Math.abs(p.x - d.x0), h = Math.abs(p.y - d.y0);
      if (w < 8 && h < 8) { w = Math.round(s.deck.w * 0.35); h = Math.round(s.deck.h * 0.3); x = d.x0; y = d.y0; }
      const type = (s.tool ?? '').slice('placeholder:'.length);
      s.tool = null;
      insertPlaceholder(s, type, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    },
    preview: () => drag ? <rect x={Math.min(drag.x0, drag.x)} y={Math.min(drag.y0, drag.y)} width={Math.abs(drag.x - drag.x0)} height={Math.abs(drag.y - drag.y0)} fill="none" stroke="#7a7f8a" strokeDasharray="6 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /> : null,
  });

  registerMenu({
    kind: 'masterItem', items: (s, data) => {
      const d = data as { master: number; layout: number } | undefined;
      const isLayout = (d?.layout ?? -1) >= 0;
      return [
        ...(isLayout ? [{ label: 'Insert layout', command: 'master.insertLayout' }] : [{ label: 'Insert slide master', command: 'master.insertMaster' }, { label: 'Insert layout', command: 'master.insertLayout' }]),
        { label: isLayout ? 'Duplicate layout' : 'Duplicate master', command: 'master.duplicate' },
        { label: isLayout ? 'Delete layout' : 'Delete master', command: 'master.delete', disabled: !(isLayout ? (curLayout(s) ? usedBy(s, curLayout(s)!) === 0 : false) : s.deck.masters.length > 1) },
        { label: isLayout ? 'Rename layout' : 'Rename master', command: 'master.rename' },
        ...(!isLayout ? [{ label: curMaster(s)?.keep?.preserve === '1' ? 'Stop preserving' : 'Preserve master', command: 'master.preserve' }, { label: 'Master layout…', command: 'master.layoutDialog' }] : []),
        { label: '', sep: true },
        { label: 'Format background…', command: 'design.background' },
        { label: 'Close master view', command: 'view.master' },
      ];
    },
  });

  registerPanelSection({ tab: 'home', title: 'Slide master', order: -20, when: inMaster, render: (s) => <MasterTools store={s} /> });
};
