import { useState, type ReactNode } from 'react';
import { Crop as CropIcon, Image as ImageIcon, LetterText, Move, PaintBucket, Plus, RotateCcw, Sparkles, Trash2, type LucideIcon } from 'lucide-react';
import { command, run } from '../../app/commands';
import { pickFile } from '../../app/files';
import { registerPane } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { ArrowHead, AutoShape, Color, Dash, Effects, Fill, GradientStop, Line, PatternName, Picture, RunStyle, Shape, TextBody } from '../../model/deck';
import { css } from '../../render/color';
import { Check, ColorButton, Fold, NumberField, S, Select } from '../../ui/kit';
import { runStyle, textBody, tx } from './bridge';
import { alphaOf, common, MIXED, moveBy, PX_PER_IN, slideBounds, topSelected, val, withAlpha, type Mixed } from './ops';
import { topLeft } from './commands';
import { bodyProps, textShapes } from './text';
import { Percent, Radios, Swatch } from './widgets';

type Tab = 'fill' | 'effects' | 'size' | 'picture' | 'text';

const leaves = (s: FrameStore): Shape[] => {
  const out: Shape[] = [];
  const walk = (l: Shape[]) => { for (const x of l) { if (x.kind === 'group') walk(x.children); else out.push(x); } };
  walk(topSelected(s));
  return out;
};
const editedCell = (s: FrameStore, sh: Shape) => (sh.kind === 'table' && s.editing?.shape === sh.id ? s.editing.cell : undefined);
const fillOf = (s: FrameStore, sh: Shape): Fill | undefined => {
  if (sh.kind === 'shape') return sh.fill;
  if (sh.kind === 'table') { const c = editedCell(s, sh) ?? { r: 0, c: 0 }; return sh.rows[c.r]?.cells[c.c]?.fill; }
  return undefined;
};
const lineOf = (sh: Shape): Line | undefined => (sh.kind === 'shape' || sh.kind === 'picture' ? sh.line : undefined);

const fmt = (s: FrameStore, id: string, arg: unknown) => run(s, id, arg);

// ---------- Fill ----------

const PRESET_GRADIENTS = (accent: Color): GradientStop[][] => [
  [{ pos: 0, color: withLum(accent, 0.6) }, { pos: 1, color: accent }],
  [{ pos: 0, color: accent }, { pos: 1, color: withLum(accent, -0.5) }],
  [{ pos: 0, color: { theme: 'bg1' } }, { pos: 1, color: accent }],
  [{ pos: 0, color: withLum(accent, 0.8) }, { pos: 0.5, color: withLum(accent, 0.4) }, { pos: 1, color: accent }],
  [{ pos: 0, color: accent }, { pos: 0.5, color: withLum(accent, 0.6) }, { pos: 1, color: accent }],
  [{ pos: 0, color: '#FFFFFF' }, { pos: 1, color: '#7F7F7F' }],
];
const withLum = (c: Color, lum: number): Color => (typeof c === 'object' && 'theme' in c ? { theme: c.theme, lum } : c);

const PATTERNS: PatternName[] = ['pct5', 'pct10', 'pct20', 'pct25', 'pct50', 'pct75', 'horz', 'vert', 'ltHorz', 'ltVert', 'dkHorz', 'dkVert', 'cross', 'diagCross', 'dnDiag', 'upDiag',
  'ltDnDiag', 'ltUpDiag', 'dkDnDiag', 'dkUpDiag', 'smGrid', 'lgGrid', 'smCheck', 'lgCheck', 'dotGrid', 'dotDmnd', 'shingle', 'trellis', 'sphere', 'weave', 'plaid', 'divot', 'zigZag', 'wave'];

const FillKind = ({ store, fill, mixed, onChange, allowBg, label = 'Fill' }: { store: FrameStore; fill: Fill | undefined; mixed: boolean; onChange: (f: Fill | undefined) => void; allowBg?: boolean; label?: string }) => {
  const kind = mixed ? undefined : fill?.type ?? 'auto';
  const accent: Color = { theme: 'accent1' };
  const setKind = (k: string) => {
    if (k === 'auto') onChange(undefined);
    else if (k === 'none') onChange({ type: 'none' });
    else if (k === 'solid') onChange({ type: 'solid', color: fill?.type === 'gradient' ? fill.stops[0]!.color : accent });
    else if (k === 'gradient') onChange({ type: 'gradient', kind: 'linear', angle: 90, stops: PRESET_GRADIENTS(fill?.type === 'solid' ? fill.color : accent)[0]! });
    else if (k === 'pattern') onChange({ type: 'pattern', pattern: 'pct10', fg: fill?.type === 'solid' ? fill.color : accent, bg: { theme: 'bg1' } });
    else if (k === 'picture') void pickPicture(store, (media) => onChange({ type: 'picture', media, mode: 'stretch' }));
    else if (k === 'background') onChange({ type: 'background' });
  };
  const opts: [string, string][] = [['none', `No ${label.toLowerCase()}`], ['solid', `Solid ${label.toLowerCase()}`], ['gradient', `Gradient ${label.toLowerCase()}`], ['picture', 'Picture or texture'], ['pattern', 'Pattern']];
  if (allowBg) opts.push(['background', 'Slide background']);
  opts.push(['auto', 'Automatic']);
  return (
    <>
      <Radios name={`${label}-kind`} value={kind} options={opts} onChange={setKind} />
      {fill?.type === 'solid' && <SolidEditor store={store} color={fill.color} onChange={(c) => onChange({ type: 'solid', color: c })} />}
      {fill?.type === 'gradient' && <GradientEditor store={store} fill={fill} onChange={onChange} />}
      {fill?.type === 'picture' && <PictureFillEditor store={store} fill={fill} onChange={onChange} />}
      {fill?.type === 'pattern' && <PatternEditor store={store} fill={fill} onChange={onChange} />}
    </>
  );
};

const SolidEditor = ({ store, color, onChange }: { store: FrameStore; color: Color; onChange: (c: Color) => void }) => (
  <>
    <div className="fmtrow"><span>Color</span><ColorButton store={store} label="Color" value={color} onPick={(c) => c && onChange(withAlpha(c, alphaOf(color)))} /></div>
    <Percent label="Transparency" value={Math.round((1 - alphaOf(color)) * 100)} onChange={(n) => onChange(withAlpha(color, 1 - n / 100))} />
  </>
);

const GradientEditor = ({ store, fill, onChange }: { store: FrameStore; fill: Extract<Fill, { type: 'gradient' }>; onChange: (f: Fill) => void }) => {
  const [sel, setSel] = useState(0);
  const stops = [...fill.stops].sort((a, b) => a.pos - b.pos);
  const i = Math.min(sel, stops.length - 1);
  const stop = stops[i]!;
  const theme = store.deck.masters[0]!.theme;
  const set = (patch: Partial<typeof fill>) => onChange({ ...fill, ...patch });
  const setStop = (p: Partial<GradientStop>) => set({ stops: stops.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const bar = `linear-gradient(90deg, ${stops.map((x) => `${css(x.color, { theme })} ${x.pos * 100}%`).join(', ')})`;
  const base: Color = stops[stops.length - 1]?.color ?? { theme: 'accent1' };
  return (
    <>
      <div className="cgtitle">Preset gradients</div>
      <div className="fmtpresets">
        {PRESET_GRADIENTS(typeof base === 'object' && 'theme' in base ? { theme: base.theme } : base).map((st, k) => (
          <button key={k} aria-label={`Preset ${k + 1}`} title={`Preset ${k + 1}`} onClick={() => set({ stops: st })}>
            <Swatch store={store} w={30} h={22} fill={{ ...fill, stops: st }} />
          </button>
        ))}
      </div>
      <div className="num2">
        <Select label="Type" value={fill.kind === 'path' ? 'rect' : fill.kind} options={[['linear', 'Linear'], ['radial', 'Radial'], ['rect', 'Rectangular']]} onChange={(k) => set({ kind: k })} />
        <NumberField label="Angle" suffix="°" value={fill.angle} min={0} max={359.9} onChange={(n) => set({ angle: n })} />
      </div>
      <div className="cgtitle">Gradient stops</div>
      <div className="fmtstops" style={{ background: bar }} onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const ns = [...stops, { pos, color: stop.color }].sort((a, b) => a.pos - b.pos);
        set({ stops: ns }); setSel(ns.findIndex((x) => x.pos === pos));
      }}>
        {stops.map((x, k) => (
          <button key={k} className={k === i ? 'on' : ''} style={{ left: `${x.pos * 100}%`, background: css(x.color, { theme }) }} aria-label={`Stop ${k + 1}`} onClick={() => setSel(k)} />
        ))}
      </div>
      <div className="rowx">
        <button className="tool icon" aria-label="Add gradient stop" title="Add gradient stop" onClick={() => {
          const next = stops[i + 1] ?? stops[i - 1];
          const pos = next ? (stop.pos + next.pos) / 2 : 0.5;
          const ns = [...stops, { pos, color: stop.color }].sort((a, b) => a.pos - b.pos);
          set({ stops: ns }); setSel(ns.findIndex((x) => x.pos === pos));
        }}><Plus size={16} strokeWidth={S} /></button>
        <button className="tool icon" aria-label="Remove gradient stop" title="Remove gradient stop" disabled={stops.length <= 2} onClick={() => { set({ stops: stops.filter((_, k) => k !== i) }); setSel(Math.max(0, i - 1)); }}><Trash2 size={16} strokeWidth={S} /></button>
        <ColorButton store={store} label="Color" value={stop.color} onPick={(c) => c && setStop({ color: withAlpha(c, alphaOf(stop.color)) })} />
      </div>
      <NumberField label="Position" suffix="%" value={Math.round(stop.pos * 100)} min={0} max={100} onChange={(n) => setStop({ pos: n / 100 })} />
      <Percent label="Transparency" value={Math.round((1 - alphaOf(stop.color)) * 100)} onChange={(n) => setStop({ color: withAlpha(stop.color, 1 - n / 100) })} />
    </>
  );
};

const pickPicture = async (store: FrameStore, done: (media: string) => void): Promise<void> => {
  const [f] = await pickFile('image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp');
  if (!f) return;
  if (f.size > 60 * 1024 * 1024) { store.notify('That picture is too large.'); return; }
  const data = new Uint8Array(await f.arrayBuffer());
  let id = '';
  store.tryChange('Picture fill', () => { id = store.addMedia(f.type || 'image/png', f.name, data); });
  if (id) done(id);
};

const PictureFillEditor = ({ store, fill, onChange }: { store: FrameStore; fill: Extract<Fill, { type: 'picture' }>; onChange: (f: Fill) => void }) => (
  <>
    <button className="tool wide" onClick={() => void pickPicture(store, (media) => onChange({ ...fill, media }))}><ImageIcon size={16} strokeWidth={S} /> Insert picture…</button>
    <Check label="Tile picture as texture" checked={fill.mode === 'tile'} onChange={(v) => onChange({ ...fill, mode: v ? 'tile' : 'stretch' })} />
    <Percent label="Transparency" value={Math.round((fill.transparency ?? 0) * 100)} onChange={(n) => onChange({ ...fill, transparency: n / 100 || undefined })} />
  </>
);

const PatternEditor = ({ store, fill, onChange }: { store: FrameStore; fill: Extract<Fill, { type: 'pattern' }>; onChange: (f: Fill) => void }) => (
  <>
    <div className="fmtpatterns">
      {PATTERNS.map((p) => (
        <button key={p} className={fill.pattern === p ? 'on' : ''} title={p} aria-label={`Pattern ${p}`} onClick={() => onChange({ ...fill, pattern: p })}>
          <Swatch store={store} w={26} h={20} fill={{ ...fill, pattern: p }} />
        </button>
      ))}
    </div>
    <div className="fmtrow"><span>Foreground</span><ColorButton store={store} label="Foreground" value={fill.fg} onPick={(c) => c && onChange({ ...fill, fg: c })} /></div>
    <div className="fmtrow"><span>Background</span><ColorButton store={store} label="Background" value={fill.bg} onPick={(c) => c && onChange({ ...fill, bg: c })} /></div>
  </>
);

// ---------- Line ----------

const DASHES: [Dash, string][] = [['solid', 'Solid'], ['sysDot', 'Round dot'], ['sysDash', 'Square dot'], ['dash', 'Dash'], ['dashDot', 'Dash dot'], ['lgDash', 'Long dash'], ['lgDashDot', 'Long dash dot'], ['lgDashDotDot', 'Long dash dot dot']];
const ARROWS: [ArrowHead, string][] = [['none', 'None'], ['triangle', 'Arrow'], ['stealth', 'Stealth arrow'], ['arrow', 'Open arrow'], ['diamond', 'Diamond'], ['oval', 'Oval']];
const SIZES: [string, string][] = [['sm', 'Small'], ['med', 'Medium'], ['lg', 'Large']];

const LineEditor = ({ store, line, mixed }: { store: FrameStore; line: Line | undefined; mixed: boolean }) => {
  const set = (p: Partial<Line> | null) => fmt(store, 'format.line', p);
  const has = line && line.fill.type !== 'none';
  const color = line?.fill.type === 'solid' ? line.fill.color : undefined;
  return (
    <>
      <Radios name="line-kind" value={mixed ? undefined : !line ? 'auto' : line.fill.type === 'none' ? 'none' : line.fill.type === 'gradient' ? 'gradient' : 'solid'}
        options={[['none', 'No line'], ['solid', 'Solid line'], ['gradient', 'Gradient line'], ['auto', 'Automatic']]}
        onChange={(k) => {
          if (k === 'auto') set(null);
          else if (k === 'none') set({ fill: { type: 'none' } });
          else if (k === 'solid') set({ fill: { type: 'solid', color: color ?? { theme: 'accent1' } } });
          else set({ fill: { type: 'gradient', kind: 'linear', angle: 0, stops: [{ pos: 0, color: { theme: 'accent1', lum: 0.4 } }, { pos: 1, color: { theme: 'accent1', lum: -0.25 } }] } });
        }} />
      {line?.fill.type === 'solid' && <SolidEditor store={store} color={line.fill.color} onChange={(c) => set({ fill: { type: 'solid', color: c } })} />}
      {line?.fill.type === 'gradient' && <GradientEditor store={store} fill={line.fill} onChange={(f) => set({ fill: f })} />}
      {has && (
        <>
          <div className="num2">
            <NumberField label="Width" suffix="pt" value={line.width} step={0.25} min={0} max={1584} onChange={(n) => set({ width: n })} />
            <Select label="Compound type" value={line.compound ?? 'sng'} options={[['sng', 'Single'], ['dbl', 'Double'], ['thickThin', 'Thick thin'], ['thinThick', 'Thin thick'], ['tri', 'Triple']]} onChange={(v) => set({ compound: v === 'sng' ? undefined : v })} />
            <Select label="Dash type" value={line.dash ?? 'solid'} options={DASHES} onChange={(v) => set({ dash: v === 'solid' ? undefined : v })} />
            <Select label="Cap type" value={line.cap ?? 'flat'} options={[['flat', 'Flat'], ['round', 'Round'], ['square', 'Square']]} onChange={(v) => set({ cap: v === 'flat' ? undefined : v })} />
            <Select label="Join type" value={line.join ?? 'round'} options={[['round', 'Round'], ['bevel', 'Bevel'], ['miter', 'Miter']]} onChange={(v) => set({ join: v === 'round' ? undefined : v })} />
          </div>
          <div className="num2">
            <Select label="Begin arrow type" value={line.head?.type ?? 'none'} options={ARROWS} onChange={(v) => set({ head: v === 'none' ? undefined : { ...(line.head ?? {}), type: v } })} />
            <Select label="Begin arrow size" value={line.head?.w ?? 'med'} options={SIZES} onChange={(v) => line.head && set({ head: { ...line.head, w: v as 'sm', len: v as 'sm' } })} />
            <Select label="End arrow type" value={line.tail?.type ?? 'none'} options={ARROWS} onChange={(v) => set({ tail: v === 'none' ? undefined : { ...(line.tail ?? {}), type: v } })} />
            <Select label="End arrow size" value={line.tail?.w ?? 'med'} options={SIZES} onChange={(v) => line.tail && set({ tail: { ...line.tail, w: v as 'sm', len: v as 'sm' } })} />
          </div>
        </>
      )}
    </>
  );
};

const FillLineTab = ({ store }: { store: FrameStore }) => {
  const items = leaves(store);
  const fillable = items.filter((x) => x.kind === 'shape' || x.kind === 'table');
  const lineable = items.filter((x) => x.kind === 'shape' || x.kind === 'picture');
  const f = common(fillable, (x) => fillOf(store, x));
  const l = common(lineable, lineOf);
  return (
    <>
      {fillable.length > 0 && (
        <Fold title="Fill" open>
          <FillKind store={store} fill={val(f)} mixed={f === MIXED} allowBg onChange={(fill) => fmt(store, 'format.fill', fill)} />
        </Fold>
      )}
      {lineable.length > 0 && <Fold title="Line" open><LineEditor store={store} line={val(l)} mixed={l === MIXED} /></Fold>}
      {!fillable.length && !lineable.length && <p className="muted small">This object has no fill or line.</p>}
    </>
  );
};

// ---------- Effects ----------

const SHADOW_PRESETS: [string, NonNullable<Effects['shadow']>][] = [
  ['Outer bottom right', { kind: 'outer', color: '#000000', blur: 5, dist: 4, angle: 45, alpha: 0.4 }],
  ['Outer bottom', { kind: 'outer', color: '#000000', blur: 5, dist: 4, angle: 90, alpha: 0.4 }],
  ['Outer center', { kind: 'outer', color: '#000000', blur: 6, dist: 0, angle: 0, alpha: 0.4 }],
  ['Outer top left', { kind: 'outer', color: '#000000', blur: 5, dist: 4, angle: 225, alpha: 0.4 }],
  ['Inner', { kind: 'inner', color: '#000000', blur: 8, dist: 3, angle: 45, alpha: 0.5 }],
  ['Inner center', { kind: 'inner', color: '#000000', blur: 10, dist: 0, angle: 0, alpha: 0.5 }],
];

const EffectsTab = ({ store }: { store: FrameStore }) => {
  const shapes = topSelected(store);
  const fx = (val(common(shapes, (x) => x.effects)) ?? {}) as Effects;
  const set = (p: Partial<Effects>) => fmt(store, 'format.effects', p);
  const sh = fx.shadow;
  const gl = fx.glow;
  return (
    <>
      <Fold title="Shadow" open>
        <div className="fmtpresets">
          <button className={!sh ? 'on' : ''} onClick={() => set({ shadow: undefined })}>None</button>
          {SHADOW_PRESETS.map(([label, v]) => (
            <button key={label} title={label} aria-label={label} className={sh && sh.kind === v.kind && sh.angle === v.angle && sh.dist === v.dist ? 'on' : ''} onClick={() => set({ shadow: v })}>
              <span className="fmtshadow" style={{ boxShadow: `${v.kind === 'inner' ? 'inset ' : ''}${Math.cos((v.angle * Math.PI) / 180) * v.dist}px ${Math.sin((v.angle * Math.PI) / 180) * v.dist}px ${v.blur}px rgba(0,0,0,.45)` }} />
            </button>
          ))}
        </div>
        {sh && (
          <>
            <div className="fmtrow"><span>Color</span><ColorButton store={store} label="Shadow color" value={sh.color} onPick={(c) => c && set({ shadow: { ...sh, color: c } })} /></div>
            <Select label="Type" value={sh.kind} options={[['outer', 'Outside'], ['inner', 'Inside'], ['perspective', 'Perspective']]} onChange={(k) => set({ shadow: { ...sh, kind: k } })} />
            <Percent label="Transparency" value={Math.round((1 - (sh.alpha ?? 0.4)) * 100)} onChange={(n) => set({ shadow: { ...sh, alpha: 1 - n / 100 } })} />
            <div className="num2">
              <NumberField label="Blur" suffix="pt" value={sh.blur * 0.75} min={0} max={100} onChange={(n) => set({ shadow: { ...sh, blur: n / 0.75 } })} />
              <NumberField label="Angle" suffix="°" value={sh.angle} min={0} max={359.9} onChange={(n) => set({ shadow: { ...sh, angle: n } })} />
              <NumberField label="Distance" suffix="pt" value={sh.dist * 0.75} min={0} max={200} onChange={(n) => set({ shadow: { ...sh, dist: n / 0.75 } })} />
            </div>
          </>
        )}
      </Fold>
      <Fold title="Reflection">
        <Check label="Reflection" checked={!!fx.reflection} onChange={(v) => set({ reflection: v ? { alpha: 0.5, size: 0.35, dist: 0, blur: 0.5 } : undefined })} />
        {fx.reflection && (
          <>
            <Percent label="Transparency" value={Math.round((1 - fx.reflection.alpha) * 100)} onChange={(n) => set({ reflection: { ...fx.reflection!, alpha: 1 - n / 100 } })} />
            <Percent label="Size" value={Math.round(fx.reflection.size * 100)} onChange={(n) => set({ reflection: { ...fx.reflection!, size: n / 100 } })} />
            <div className="num2">
              <NumberField label="Blur" suffix="pt" value={fx.reflection.blur} min={0} max={100} onChange={(n) => set({ reflection: { ...fx.reflection!, blur: n } })} />
              <NumberField label="Distance" suffix="pt" value={fx.reflection.dist} min={0} max={100} onChange={(n) => set({ reflection: { ...fx.reflection!, dist: n } })} />
            </div>
          </>
        )}
      </Fold>
      <Fold title="Glow">
        <Check label="Glow" checked={!!gl} onChange={(v) => set({ glow: v ? { color: { theme: 'accent1' }, radius: 8, alpha: 0.6 } : undefined })} />
        {gl && (
          <>
            <div className="fmtrow"><span>Color</span><ColorButton store={store} label="Glow color" value={gl.color} onPick={(c) => c && set({ glow: { ...gl, color: c } })} /></div>
            <NumberField label="Size" suffix="pt" value={gl.radius * 0.75} min={0} max={150} onChange={(n) => set({ glow: { ...gl, radius: n / 0.75 } })} />
            <Percent label="Transparency" value={Math.round((1 - (gl.alpha ?? 0.6)) * 100)} onChange={(n) => set({ glow: { ...gl, alpha: 1 - n / 100 } })} />
          </>
        )}
      </Fold>
      <Fold title="Soft edges">
        <NumberField label="Size" suffix="pt" value={(fx.softEdge ?? 0) * 0.75} min={0} max={100} onChange={(n) => set({ softEdge: n > 0 ? n / 0.75 : undefined })} />
      </Fold>
      <Fold title="3-D format">
        <Select label="Bevel" value={fx.bevel?.kind ?? 'none'} options={[['none', 'None'], ['circle', 'Circle'], ['relaxedInset', 'Relaxed inset'], ['cross', 'Cross'], ['coolSlant', 'Cool slant'], ['angle', 'Angle'], ['softRound', 'Soft round'], ['convex', 'Convex'], ['slope', 'Slope'], ['divot', 'Divot'], ['riblet', 'Riblet'], ['hardEdge', 'Hard edge'], ['artDeco', 'Art deco']]}
          onChange={(k) => set({ bevel: k === 'none' ? undefined : { kind: k, w: fx.bevel?.w ?? 6, h: fx.bevel?.h ?? 6 } })} />
        {fx.bevel && (
          <div className="num2">
            <NumberField label="Width" suffix="pt" value={fx.bevel.w} min={0} onChange={(n) => set({ bevel: { ...fx.bevel!, w: n } })} />
            <NumberField label="Height" suffix="pt" value={fx.bevel.h} min={0} onChange={(n) => set({ bevel: { ...fx.bevel!, h: n } })} />
          </div>
        )}
        <p className="muted small">Bevels are kept in the file and shown by apps that draw 3-D.</p>
      </Fold>
      <Fold title="3-D rotation">
        <Select label="Preset" value={fx.rot3d ?? 'none'} options={[['none', 'No rotation'], ['isometricLeftDown', 'Isometric left'], ['isometricRightUp', 'Isometric right'], ['perspectiveFront', 'Perspective front'], ['perspectiveLeft', 'Perspective left'], ['perspectiveRight', 'Perspective right'], ['obliqueTopLeft', 'Oblique top left'], ['obliqueTopRight', 'Oblique top right']]}
          onChange={(k) => set({ rot3d: k === 'none' ? undefined : k })} />
      </Fold>
    </>
  );
};

// ---------- Size and properties ----------

export const SizeFields = ({ store }: { store: FrameStore }) => {
  const shapes = topSelected(store);
  const one = shapes.length === 1 ? shapes[0]! : null;
  const w = common(shapes, (x) => slideBounds(store, { ...x, rot: 0 }).w);
  const h = common(shapes, (x) => slideBounds(store, { ...x, rot: 0 }).h);
  const rot = common(shapes, (x) => x.rot ?? 0);
  const lock = shapes.length > 0 && shapes.every((x) => x.lockAspect || x.kind === 'picture' && x.lockAspect !== false);
  const inch = (m: Mixed<number>) => (m === MIXED || m === undefined ? undefined : Math.round((m / PX_PER_IN) * 100) / 100);
  const setSize = (dim: 'w' | 'h', inches: number) => {
    const px = inches * PX_PER_IN;
    store.tryChange('Size', () => {
      for (const x of shapes) {
        if (x.locked) continue;
        const b = slideBounds(store, { ...x, rot: 0 });
        const k = dim === 'w' ? px / (b.w || 1) : px / (b.h || 1);
        const kx = dim === 'w' || lock ? k : 1, ky = dim === 'h' || lock ? k : 1;
        resizeShape(x, x.w * kx, x.h * ky);
      }
    });
  };
  const scale = (dim: 'w' | 'h', pct: number) => {
    if (!one) return;
    const base = (store.ext.fmtBase as Record<string, { w: number; h: number }> | undefined)?.[one.id] ?? { w: one.w, h: one.h };
    store.ext.fmtBase = { ...(store.ext.fmtBase as object), [one.id]: base };
    const k = pct / 100;
    store.tryChange('Scale', () => resizeShape(one, dim === 'w' || lock ? base.w * k : one.w, dim === 'h' || lock ? base.h * k : one.h));
  };
  const base = one ? (store.ext.fmtBase as Record<string, { w: number; h: number }> | undefined)?.[one.id] : undefined;
  return (
    <>
      <div className="num2">
        <NumberField label="Height" suffix="in" value={inch(h)} step={0.1} min={0.01} max={200} onChange={(n) => setSize('h', n)} />
        <NumberField label="Width" suffix="in" value={inch(w)} step={0.1} min={0.01} max={200} onChange={(n) => setSize('w', n)} />
        <NumberField label="Rotation" suffix="°" value={val(rot)} min={-360} max={360} onChange={(n) => run(store, 'shape.rotate', n)} />
      </div>
      {one && (
        <div className="num2">
          <NumberField label="Scale height" suffix="%" value={Math.round((one.h / (base?.h ?? one.h)) * 100)} min={1} max={10000} onChange={(n) => scale('h', n)} />
          <NumberField label="Scale width" suffix="%" value={Math.round((one.w / (base?.w ?? one.w)) * 100)} min={1} max={10000} onChange={(n) => scale('w', n)} />
        </div>
      )}
      <Check label="Lock aspect ratio" checked={lock} onChange={(v) => store.tryChange('Lock aspect ratio', () => { for (const x of shapes) x.lockAspect = v; })} />
    </>
  );
};

const resizeShape = (x: Shape, w: number, h: number) => {
  w = Math.max(1, w); h = Math.max(1, h);
  if (x.kind === 'table') {
    const W = x.cols.reduce((a, b) => a + b, 0) || 1, H = x.rows.reduce((a, r) => a + r.h, 0) || 1;
    x.cols = x.cols.map((c) => (c * w) / W);
    for (const r of x.rows) r.h = (r.h * h) / H;
  }
  // Keep the centre in place, as other apps do when typing a size.
  x.x += (x.w - w) / 2; x.y += (x.h - h) / 2;
  x.w = w; x.h = h;
};

export const PositionFields = ({ store }: { store: FrameStore }) => {
  const shapes = topSelected(store);
  const [from, setFrom] = useState<'corner' | 'center'>('corner');
  const tl = (x: Shape) => topLeft(store, x);
  const box = (x: Shape) => slideBounds(store, { ...x, rot: 0 });
  const px = common(shapes, (x) => from === 'corner' ? tl(x).x : box(x).x + box(x).w / 2 - store.deck.w / 2);
  const py = common(shapes, (x) => from === 'corner' ? tl(x).y : box(x).y + box(x).h / 2 - store.deck.h / 2);
  const inch = (m: Mixed<number>) => (m === MIXED || m === undefined ? undefined : Math.round((m / PX_PER_IN) * 100) / 100);
  const set = (axis: 'x' | 'y', inches: number) => {
    const v = inches * PX_PER_IN;
    if (from === 'corner') { run(store, 'shape.position', { [axis]: v }); return; }
    store.tryChange('Position', () => {
      for (const x of shapes) {
        if (x.locked) continue;
        const b = box(x);
        const target = axis === 'x' ? v + store.deck.w / 2 - b.w / 2 : v + store.deck.h / 2 - b.h / 2;
        const cur = axis === 'x' ? b.x : b.y;
        moveBy(store, x, axis === 'x' ? target - cur : 0, axis === 'y' ? target - cur : 0);
      }
    });
  };
  return (
    <>
      <div className="num2">
        <NumberField label="Horizontal position" suffix="in" value={inch(px)} step={0.1} onChange={(n) => set('x', n)} />
        <NumberField label="Vertical position" suffix="in" value={inch(py)} step={0.1} onChange={(n) => set('y', n)} />
      </div>
      <Select label="From" value={from} options={[['corner', 'Top left corner'], ['center', 'Center']]} onChange={setFrom} />
    </>
  );
};

export const AltFields = ({ store }: { store: FrameStore }) => {
  const one = topSelected(store).length === 1 ? topSelected(store)[0]! : null;
  if (!one) return <p className="muted small">Select one object to give it alt text.</p>;
  return (
    <>
      <label className="field"><span>Title</span><input defaultValue={one.altTitle ?? ''} key={`t${one.id}`} disabled={!!one.decorative}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (one.altTitle ?? '')) store.tryChange('Alt text', () => { one.altTitle = v || undefined; }); }} /></label>
      <label className="field"><span>Description</span><textarea rows={4} defaultValue={one.alt ?? ''} key={`d${one.id}`} disabled={!!one.decorative} placeholder="Describe this object for people who can't see it"
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (one.alt ?? '')) store.tryChange('Alt text', () => { one.alt = v || undefined; }); }} /></label>
      <Check label="Mark as decorative" checked={!!one.decorative} onChange={(v) => store.tryChange('Decorative', () => { one.decorative = v || undefined; })} />
    </>
  );
};

const SizeTab = ({ store }: { store: FrameStore }) => {
  const tshapes = textShapes(store);
  return (
    <>
      <Fold title="Size" open><SizeFields store={store} /></Fold>
      <Fold title="Position" open><PositionFields store={store} /></Fold>
      {tshapes.length > 0 && <Fold title="Text box"><TextBoxFields store={store} /></Fold>}
      <Fold title="Alt text"><AltFields store={store} /></Fold>
    </>
  );
};

// ---------- Picture ----------

const ADJ_PRESETS = [-40, -20, 0, 20, 40];

const PictureTab = ({ store }: { store: FrameStore }) => {
  const pics = leaves(store).filter((x): x is Picture => x.kind === 'picture');
  const p = pics[0];
  if (!p) return <p className="muted small">Select a picture.</p>;
  const a = p.adjust ?? {};
  const set = (patch: Picture['adjust'], label = 'Picture') => store.tryChange(label, () => {
    for (const x of pics) {
      const next = { ...(x.adjust ?? {}), ...patch } as Record<string, unknown>;
      for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === 0 || next[k] === false) delete next[k];
      x.adjust = Object.keys(next).length ? next as Picture['adjust'] : undefined;
    }
  });
  const crop = p.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const setCrop = (k: keyof typeof crop, pct: number) => store.tryChange('Crop', () => {
    for (const x of pics) {
      const c = { ...(x.crop ?? { l: 0, t: 0, r: 0, b: 0 }), [k]: Math.max(0, Math.min(0.99, pct / 100)) };
      x.crop = c.l || c.t || c.r || c.b ? c : undefined;
    }
  });
  return (
    <>
      <Fold title="Picture corrections" open>
        <Percent label="Sharpness" min={-100} max={100} value={a.sharpness ?? 0} onChange={(n) => set({ sharpness: n })} />
        <div className="cgtitle">Brightness and contrast</div>
        <div className="fmtbc">
          {ADJ_PRESETS.map((c) => ADJ_PRESETS.map((b) => (
            <button key={`${b}${c}`} className={(a.brightness ?? 0) === b && (a.contrast ?? 0) === c ? 'on' : ''} title={`Brightness ${b > 0 ? '+' : ''}${b}%, contrast ${c > 0 ? '+' : ''}${c}%`}
              aria-label={`Brightness ${b}%, contrast ${c}%`} onClick={() => set({ brightness: b, contrast: c })}>
              <span style={{ filter: `brightness(${1 + b / 100}) contrast(${1 + c / 100})` }} />
            </button>
          )))}
        </div>
        <Percent label="Brightness" min={-100} max={100} value={a.brightness ?? 0} onChange={(n) => set({ brightness: n })} />
        <Percent label="Contrast" min={-100} max={100} value={a.contrast ?? 0} onChange={(n) => set({ contrast: n })} />
      </Fold>
      <Fold title="Picture color" open>
        <Percent label="Saturation" min={0} max={400} value={a.saturation ?? 100} onChange={(n) => set({ saturation: n === 100 ? undefined : n })} />
        <Percent label="Temperature" min={-100} max={100} value={a.temperature ?? 0} onChange={(n) => set({ temperature: n })} />
        <div className="cgtitle">Recolor</div>
        <div className="fmtpresets">
          {([['None', {}], ['Grayscale', { grayscale: true }], ['Sepia', { sepia: true }], ['Washout', { brightness: 70, contrast: -70 }], ['Black and white', { grayscale: true, contrast: 100 }]] as [string, Picture['adjust']][]).map(([label, v]) => (
            <button key={label} onClick={() => set({ grayscale: undefined, sepia: undefined, brightness: undefined, contrast: undefined, ...v }, 'Recolor')}
              className={label === 'None' ? (!a.grayscale && !a.sepia ? 'on' : '') : label === 'Grayscale' ? (a.grayscale && !a.contrast ? 'on' : '') : label === 'Sepia' ? (a.sepia ? 'on' : '') : ''}>{label}</button>
          ))}
        </div>
      </Fold>
      <Fold title="Picture transparency">
        <Percent label="Transparency" value={a.transparency ?? 0} onChange={(n) => set({ transparency: n })} />
      </Fold>
      <Fold title="Crop">
        <div className="num2">
          <NumberField label="Left" suffix="%" value={Math.round(crop.l * 1000) / 10} min={0} max={99} onChange={(n) => setCrop('l', n)} />
          <NumberField label="Right" suffix="%" value={Math.round(crop.r * 1000) / 10} min={0} max={99} onChange={(n) => setCrop('r', n)} />
          <NumberField label="Top" suffix="%" value={Math.round(crop.t * 1000) / 10} min={0} max={99} onChange={(n) => setCrop('t', n)} />
          <NumberField label="Bottom" suffix="%" value={Math.round(crop.b * 1000) / 10} min={0} max={99} onChange={(n) => setCrop('b', n)} />
        </div>
        {command('picture.crop') && <button className="tool wide" onClick={() => run(store, 'picture.crop')}><CropIcon size={16} strokeWidth={S} /> Crop on the slide</button>}
      </Fold>
      <button className="tool wide" onClick={() => store.tryChange('Reset picture', () => { for (const x of pics) { x.adjust = undefined; x.crop = undefined; } })}><RotateCcw size={16} strokeWidth={S} /> Reset picture</button>
      <p className="muted small">Pictures are saved at their original quality. Crop them to make the file smaller.</p>
    </>
  );
};

// ---------- Text options ----------

export const TextBoxFields = ({ store }: { store: FrameStore }) => {
  const b = textBody(store) as Partial<TextBody>;
  const inset = b.inset ?? { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };
  const setInset = (k: keyof typeof inset, inches: number) => bodyProps(store, { inset: { ...inset, [k]: Math.max(0, inches * PX_PER_IN) } }, 'Margins');
  const i2 = (px: number) => Math.round((px / PX_PER_IN) * 100) / 100;
  return (
    <>
      <div className="num2">
        <Select label="Vertical alignment" value={b.vAlign ?? 't'} options={[['t', 'Top'], ['ctr', 'Middle'], ['b', 'Bottom']]} onChange={(v) => tx(store, 'text.vAlign', v)} />
        <Select label="Text direction" value={b.vert ?? 'horz'} options={[['horz', 'Horizontal'], ['vert', 'Rotate 90°'], ['vert270', 'Rotate 270°'], ['eaVert', 'Stacked']]} onChange={(v) => tx(store, 'text.direction', v)} />
      </div>
      <Radios name="autofit" value={b.autofit ?? 'none'} options={[['none', 'Do not autofit'], ['shrink', 'Shrink text on overflow'], ['resize', 'Resize shape to fit text']]} onChange={(v) => tx(store, 'text.autofit', v)} />
      <div className="num2">
        <NumberField label="Left margin" suffix="in" value={i2(inset.l)} step={0.05} min={0} onChange={(n) => setInset('l', n)} />
        <NumberField label="Right margin" suffix="in" value={i2(inset.r)} step={0.05} min={0} onChange={(n) => setInset('r', n)} />
        <NumberField label="Top margin" suffix="in" value={i2(inset.t)} step={0.05} min={0} onChange={(n) => setInset('t', n)} />
        <NumberField label="Bottom margin" suffix="in" value={i2(inset.b)} step={0.05} min={0} onChange={(n) => setInset('b', n)} />
      </div>
      <Check label="Wrap text in shape" checked={b.wrap !== false} onChange={(v) => bodyProps(store, { wrap: v ? undefined : false }, 'Wrap text')} />
      <div className="num2">
        <NumberField label="Columns" value={b.columns ?? 1} min={1} max={16} onChange={(n) => tx(store, 'text.columns', Math.round(n))} />
        <NumberField label="Spacing" suffix="in" value={i2(b.columnGap ?? 20)} step={0.05} min={0} onChange={(n) => bodyProps(store, { columnGap: n * PX_PER_IN }, 'Column spacing')} />
      </div>
    </>
  );
};

const TextTab = ({ store }: { store: FrameStore }) => {
  const r = runStyle(store);
  const setRun = (patch: RunStyle) => {
    // Text fill and outline go through the editor when it has them; otherwise whole shapes.
    if (command('text.style')) run(store, 'text.style', patch); else store.tryChange('Text', () => { for (const s of textShapes(store)) applyRunToShape(s, patch); });
  };
  if (!textShapes(store).length) return <p className="muted small">Select a shape with text.</p>;
  const fillKind = r.fill?.type ?? (r.color ? 'solid' : 'auto');
  return (
    <>
      <Fold title="Text fill" open>
        <Radios name="tfill" value={fillKind === 'auto' ? 'solid' : fillKind} options={[['none', 'No fill'], ['solid', 'Solid fill'], ['gradient', 'Gradient fill']]}
          onChange={(k) => setRun(k === 'none' ? { fill: { type: 'none' } } : k === 'solid' ? { fill: undefined } : { fill: { type: 'gradient', kind: 'linear', angle: 0, stops: [{ pos: 0, color: { theme: 'accent1' } }, { pos: 1, color: { theme: 'accent2' } }] } })} />
        {r.fill?.type === 'gradient' ? <GradientEditor store={store} fill={r.fill} onChange={(f) => setRun({ fill: f })} />
          : r.fill?.type !== 'none' && <SolidEditor store={store} color={r.color ?? { theme: 'tx1' }} onChange={(c) => tx(store, 'text.color', c)} />}
      </Fold>
      <Fold title="Text outline">
        <Radios name="tline" value={r.outline && r.outline.fill.type !== 'none' ? 'solid' : 'none'} options={[['none', 'No line'], ['solid', 'Solid line']]}
          onChange={(k) => setRun({ outline: k === 'none' ? undefined : { fill: { type: 'solid', color: { theme: 'accent1' } }, width: 0.75 } })} />
        {r.outline?.fill.type === 'solid' && (
          <>
            <div className="fmtrow"><span>Color</span><ColorButton store={store} label="Outline color" value={r.outline.fill.color} onPick={(c) => c && setRun({ outline: { ...r.outline!, fill: { type: 'solid', color: c } } })} /></div>
            <NumberField label="Width" suffix="pt" value={r.outline.width} step={0.25} min={0} max={20} onChange={(n) => setRun({ outline: { ...r.outline!, width: n } })} />
          </>
        )}
      </Fold>
      <Fold title="Text effects">
        <Check label="Shadow" checked={!!r.shadow} onChange={(v) => setRun({ shadow: v || undefined })} />
      </Fold>
      <Fold title="Text box" open><TextBoxFields store={store} /></Fold>
    </>
  );
};

const applyRunToShape = (s: AutoShape, patch: RunStyle) => {
  for (const p of s.text?.paras ?? []) {
    for (const r of p.runs) if (!r.br) r.style = strip({ ...(r.style ?? {}), ...patch });
    p.style = { ...(p.style ?? {}), defRun: strip({ ...(p.style?.defRun ?? {}), ...patch }) };
  }
};
const strip = <T extends object>(o: T): T => { for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k]; return o; };

// ---------- The pane ----------

const TABS: { id: Tab; label: string; icon: LucideIcon; when?: (s: FrameStore) => boolean }[] = [
  { id: 'fill', label: 'Fill and line', icon: PaintBucket },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'size', label: 'Size and properties', icon: Move },
  { id: 'picture', label: 'Picture', icon: ImageIcon, when: (s) => leaves(s).some((x) => x.kind === 'picture') },
  { id: 'text', label: 'Text options', icon: LetterText, when: (s) => textShapes(s).length > 0 },
];

const FormatPane = ({ store }: { store: FrameStore }) => {
  const tabs = TABS.filter((t) => !t.when || t.when(store));
  const want = (store.ext.formatTab as Tab | undefined) ?? 'fill';
  const tab = tabs.some((t) => t.id === want) ? want : 'fill';
  if (!store.sel.length) {
    return (
      <div className="fmtpane">
        <p className="muted small">Select an object on the slide to format it.</p>
        {command('design.background') && <button className="tool wide" onClick={() => run(store, 'design.background')}>Format background…</button>}
      </div>
    );
  }
  const body: Record<Tab, ReactNode> = {
    fill: <FillLineTab store={store} />, effects: <EffectsTab store={store} />, size: <SizeTab store={store} />, picture: <PictureTab store={store} />, text: <TextTab store={store} />,
  };
  const n = store.sel.length;
  return (
    <div className="fmtpane">
      <div className="fmttabs" role="tablist" aria-label="Format">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} title={t.label} aria-label={t.label}
            onClick={() => { store.ext.formatTab = t.id; store.emit(); }}>
            <t.icon size={18} strokeWidth={S} />
          </button>
        ))}
      </div>
      <div className="fmttabtitle">{tabs.find((t) => t.id === tab)?.label}{n > 1 ? <span className="muted"> · {n} objects</span> : null}</div>
      <div key={`${tab}:${store.sel.join()}`} className="fmttabbody">{body[tab]}</div>
    </div>
  );
};

export const registerFormatPane = (): void => {
  registerPane({ id: 'format', title: 'Format', width: 312, render: (s) => <FormatPane store={s} /> });
};
