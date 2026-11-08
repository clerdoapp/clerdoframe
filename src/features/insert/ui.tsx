import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AppWindow, AudioLines, Calendar, ChartColumn, ChevronDown, Copy, Grid3x3, Hash, Image, Images, Layers, Link2, MessageSquarePlus, Mic, MonitorUp, MousePointerClick,
  Network, PanelBottom, PenLine, Plus, Rows3, ScanLine, Shapes, Sigma, Smile, Square, Table2, Type, Video, WandSparkles, PenTool, Waypoints, ZoomIn, Spline, Omega, type LucideIcon,
} from 'lucide-react';
import { command, run } from '../../app/commands';
import { registerPanelSection } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { SlideView } from '../../render/SlideView';
import { Btn, Row, S } from '../../ui/kit';
import { ShapeGallery } from '../shapes/gallery';
import { recording } from './commands';
import { WordArtGallery } from './wordart';
import './insert.css';

/** A button that opens a popup below it; closes on outside tap or Escape. */
export const Pop = ({ label, icon: Icon, children, width = 280, iconOnly, disabled, wide, title }: {
  label: string; icon?: LucideIcon; children: (close: () => void) => ReactNode; width?: number; iconOnly?: boolean; disabled?: boolean; wide?: boolean; title?: string;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    // Fixed position, so the popup isn't clipped by the scrolling tool panel.
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(width, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      const below = window.innerHeight - r.bottom - 12;
      const top = below >= 260 || below >= r.top ? r.bottom + 4 : Math.max(8, r.top - Math.min(560, r.top - 12) - 4);
      setPos({ left, top, maxH: below >= 260 || below >= r.top ? below : Math.min(560, r.top - 12) });
    };
    place();
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', off, true);
    window.addEventListener('keydown', esc);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('pointerdown', off, true); window.removeEventListener('keydown', esc); window.removeEventListener('resize', place); };
  }, [open, width]);
  return (
    <div className={`inspop${wide ? ' wide' : ''}`} ref={ref}>
      <button className={`tool${iconOnly ? ' icon' : ''}${wide ? ' wide' : ''}${open ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open} title={title ?? label} aria-label={label} disabled={disabled}
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        {Icon && <Icon size={16} strokeWidth={S} />}{!iconOnly && <span className="grow">{label}</span>}{!iconOnly && <ChevronDown size={14} strokeWidth={S} className="muted" />}
      </button>
      {open && pos && <div className="popup inspanel" style={{ width: Math.min(width, window.innerWidth - 16), left: pos.left, top: pos.top, maxHeight: pos.maxH }} role="dialog" aria-label={label}>{children(() => setOpen(false))}</div>}
    </div>
  );
};

/** Runs a command another feature owns, or hides the button when it isn't there. */
const Ext = ({ store, id, icon, label }: { store: FrameStore; id: string; icon: LucideIcon; label: string }) => (command(id) ? <Btn store={store} id={id} icon={icon} label={label} /> : null);

// ---------- Slides ----------

const LayoutPicker = ({ store, onPick }: { store: FrameStore; onPick: (id: string) => void }) => {
  const cur = store.slide;
  const master = cur ? store.masterOf(cur).master : store.deck.masters[0]!;
  return (
    <div className="laygal">
      {master.layouts.map((l) => (
        <button key={l.id} title={l.name} onClick={() => onPick(l.id)}>
          <SlideView deck={store.deck} layout={l} master={master} width={112} prompts />
          <span>{l.name}</span>
        </button>
      ))}
    </div>
  );
};

const SlidesSection = ({ store: s }: { store: FrameStore }) => (
  <>
    <div className="splitbtn">
      <Btn store={s} id="slide.new" icon={Plus} wide />
      <Pop label="New slide with layout" icon={ChevronDown} iconOnly width={268}>
        {(close) => <LayoutPicker store={s} onPick={(id) => { close(); run(s, 'slide.new', id); }} />}
      </Pop>
    </div>
    <Row>
      <Btn store={s} id="slide.duplicate" icon={Copy} label="Duplicate" />
      <Ext store={s} id="insert.reuseSlides" icon={Layers} label="Reuse slides" />
    </Row>
  </>
);

// ---------- Tables ----------

/** Hover or drag over the grid to choose a size; tap to insert. */
export const TableGridPicker = ({ onPick, rows = 8, cols = 10 }: { onPick: (r: number, c: number) => void; rows?: number; cols?: number }) => {
  const [hv, setHv] = useState({ r: 0, c: 0 });
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const c = Math.max(1, Math.min(cols, Math.ceil(((e.clientX - b.left) / b.width) * cols)));
    const r = Math.max(1, Math.min(rows, Math.ceil(((e.clientY - b.top) / b.height) * rows)));
    return { r, c };
  };
  return (
    <div className="tgridwrap">
      <div className="tgridlabel">{hv.r ? `${hv.c} x ${hv.r} table` : 'Choose a size'}</div>
      <div className="tgrid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} role="grid" aria-label="Table size"
        onPointerMove={(e) => setHv(at(e))} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setHv(at(e)); }}
        onPointerUp={(e) => { const p = at(e); onPick(p.r, p.c); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHv({ r: 0, c: 0 }); }}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols) + 1, c = (i % cols) + 1;
          return <span key={i} className={r <= hv.r && c <= hv.c ? 'on' : ''} />;
        })}
      </div>
    </div>
  );
};

const TablesSection = ({ store: s }: { store: FrameStore }) => (
  <>
    <Pop label="Table" icon={Table2} wide width={250}>
      {(close) => (
        <>
          <TableGridPicker onPick={(r, c) => { close(); run(s, 'insert.table', { rows: r, cols: c }); }} />
          <div className="sep" />
          <button className="tool wide" onClick={() => { close(); run(s, 'insert.tableDialog'); }}><Grid3x3 size={16} strokeWidth={S} /> Insert table…</button>
          <button className="tool wide" onClick={() => { close(); run(s, 'insert.drawTable'); }}><PenLine size={16} strokeWidth={S} /> Draw table</button>
        </>
      )}
    </Pop>
  </>
);

// ---------- Images and illustrations ----------

const ImagesSection = ({ store: s }: { store: FrameStore }) => (
  <div className="toollist">
    <Btn store={s} id="insert.picture" icon={Image} label="Pictures" wide />
    {command('insert.screenshot')?.enabled?.(s) !== false && <Btn store={s} id="insert.screenshot" icon={ScanLine} wide />}
    <Btn store={s} id="insert.photoAlbum" icon={Images} label="Photo album" wide />
  </div>
);

const IllustrationsSection = ({ store: s }: { store: FrameStore }) => (
  <>
    <Pop label="Shapes" icon={Shapes} wide width={318}>
      {(close) => (
        <div className="shapespop">
          <ShapeGallery store={s} onPick={(g) => { close(); run(s, 'insert.shape', g); }} />
          <div className="sep" />
          <Row>
            <button className="tool" onClick={() => { close(); run(s, 'draw.freeform'); }}><Spline size={16} strokeWidth={S} /> Freeform</button>
            <button className="tool" onClick={() => { close(); run(s, 'draw.scribble'); }}><PenLine size={16} strokeWidth={S} /> Scribble</button>
          </Row>
          {command('draw.curve') && (
            <Row>
              <button className="tool" onClick={() => { close(); run(s, 'draw.curve'); }}><PenTool size={16} strokeWidth={S} /> Curve</button>
              <button className="tool" onClick={() => { close(); run(s, 'draw.polyline'); }}><Waypoints size={16} strokeWidth={S} /> Polyline</button>
            </Row>
          )}
        </div>
      )}
    </Pop>
    <div className="toollist">
      <Btn store={s} id="insert.icons" icon={Smile} label="Icons" wide />
      <Ext store={s} id="insert.diagram" icon={Network} label="Diagram" />
      <Ext store={s} id="insert.chart" icon={ChartColumn} label="Chart" />
    </div>
  </>
);

// ---------- Links, comments, text, symbols, media, zoom ----------

const LinksSection = ({ store: s }: { store: FrameStore }) => (
  <Row>
    <Btn store={s} id="insert.link" icon={Link2} label="Link" />
    <Btn store={s} id="insert.action" icon={MousePointerClick} label="Action" />
  </Row>
);

const CommentsSection = ({ store: s }: { store: FrameStore }) => (command('review.newComment') ? <Btn store={s} id="review.newComment" icon={MessageSquarePlus} label="Comment" wide /> : <div className="muted small">Comments are not available.</div>);

const TextSection = ({ store: s }: { store: FrameStore }) => (
  <>
    <div className="toollist">
      <Btn store={s} id="insert.textbox" icon={Type} label="Text box" wide />
      <Btn store={s} id="insert.headerFooter" icon={PanelBottom} label="Header & footer" wide />
    </div>
    <Pop label="WordArt" icon={WandSparkles} wide width={300}>
      {(close) => <WordArtGallery store={s} onDone={close} />}
    </Pop>
    <Row>
      <Btn store={s} id="insert.dateTime" icon={Calendar} label="Date & time" />
      <Btn store={s} id="insert.slideNumber" icon={Hash} label="Slide number" />
    </Row>
  </>
);

const SymbolsSection = ({ store: s }: { store: FrameStore }) => (
  <Row>
    <Ext store={s} id="insert.equation" icon={Sigma} label="Equation" />
    <Btn store={s} id={command('insert.specialCharacters') ? 'insert.specialCharacters' : 'insert.symbol'} icon={Omega} label="Symbol" />
  </Row>
);

const Elapsed = ({ since }: { since: number }) => {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, []);
  const sec = Math.floor((Date.now() - since) / 1000);
  return <span className="rectime">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}</span>;
};

const MediaSection = ({ store: s }: { store: FrameStore }) => {
  const rec = recording(s);
  return (
    <>
      {rec && (
        <div className="recbar" role="status">
          <span className="recdot" /> {rec.kind === 'audio' ? 'Recording audio' : 'Recording screen'} <Elapsed since={rec.started} />
          <div className="grow" />
          <button className="tool" onClick={() => run(s, 'insert.stopRecording', false)}>Discard</button>
          <button className="primary" onClick={() => run(s, 'insert.stopRecording')}><Square size={12} strokeWidth={S} /> Stop</button>
        </div>
      )}
      <div className="toollist">
        <Btn store={s} id="insert.video" icon={Video} label="Video" wide />
        <Btn store={s} id="insert.audio" icon={AudioLines} label="Audio" wide />
        {!rec && <Btn store={s} id="insert.recordAudio" icon={Mic} wide />}
        {!rec && <Btn store={s} id="insert.screenRecording" icon={MonitorUp} wide />}
      </div>
    </>
  );
};

const ZoomSection = ({ store: s }: { store: FrameStore }) => (
  <div className="toollist">
    <Btn store={s} id="insert.summaryZoom" icon={AppWindow} label="Summary zoom" wide />
    <Btn store={s} id="insert.sectionZoom" icon={Rows3} label="Section zoom" wide />
    <Btn store={s} id="insert.slideZoom" icon={ZoomIn} label="Slide zoom" wide />
  </div>
);

const wrap = (C: (p: { store: FrameStore }) => ReactNode) => (store: FrameStore) => <C store={store} />;

export const registerInsertPanel = (): void => {
  const notMaster = (s: FrameStore) => s.view.mode !== 'master';
  registerPanelSection({ tab: 'insert', title: 'Slides', order: 10, render: wrap(SlidesSection), when: notMaster });
  registerPanelSection({ tab: 'insert', title: 'Tables', order: 20, render: wrap(TablesSection) });
  registerPanelSection({ tab: 'insert', title: 'Images', order: 30, render: wrap(ImagesSection) });
  registerPanelSection({ tab: 'insert', title: 'Illustrations', order: 40, render: wrap(IllustrationsSection) });
  registerPanelSection({ tab: 'insert', title: 'Links', order: 50, render: wrap(LinksSection) });
  registerPanelSection({ tab: 'insert', title: 'Comments', order: 60, render: wrap(CommentsSection), when: notMaster });
  registerPanelSection({ tab: 'insert', title: 'Text', order: 70, render: wrap(TextSection) });
  registerPanelSection({ tab: 'insert', title: 'Symbols', order: 80, render: wrap(SymbolsSection) });
  registerPanelSection({ tab: 'insert', title: 'Media', order: 90, render: wrap(MediaSection) });
  registerPanelSection({ tab: 'insert', title: 'Zoom', order: 100, render: wrap(ZoomSection), when: notMaster });
};
