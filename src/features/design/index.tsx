import './design.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, EyeOff, Image as ImageIcon, Paintbrush, Palette, Ratio, Type, WandSparkles } from 'lucide-react';
import { openDialog, openPane, registerCommands, run } from '../../app/commands';
import { registerDialog, registerMenu, registerPane, registerPanelSection, type DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { SLIDE_SIZES, type Background, type Color, type Fill, type Master, type PatternName } from '../../model/deck';
import {
  BACKGROUND_STYLES, COLOR_SETS, COLOR_SLOTS, FONT_PAIRS, THEMES, themeById, themeByName, variantColors, type ThemeColors, type ThemeDef,
} from '../../model/themes';
import { css } from '../../render/color';
import { fontStack } from '../../render/inherit';
import { paint, Defs } from '../../render/paint';
import { SlideView } from '../../render/SlideView';
import { FONT_NAMES } from '../../ui/fonts';
import { Btn, Check, ColorButton, Dialog, Field, NumberField, S, Select } from '../../ui/kit';
import { designIdeas, titleIdeas, type Idea } from './designer';
import { applyTheme, mastersFor, PX_PER_IN, resizeDeck, setBackground, setColors, setFonts, type FitMode } from './ops';
import { masterPreview, ThemeThumb } from './preview';

// ---------- Helpers ----------

const selSlides = (s: FrameStore): number[] => [...new Set(s.slideSel.length ? s.slideSel : [s.cur])].sort((a, b) => a - b);
/** Master being designed: in master view the selected one, otherwise the current slide's. */
const curMaster = (s: FrameStore): Master => {
  if (s.view.mode === 'master') return s.deck.masters[s.masterSel.master] ?? s.deck.masters[0]!;
  const sl = s.slide;
  return sl ? s.masterOf(sl).master : s.deck.masters[0]!;
};
/** Masters a design change applies to: the one being edited in master view, else all. */
const targetMasters = (s: FrameStore): Master[] => (s.view.mode === 'master' ? [curMaster(s)] : s.deck.masters.length > 1 ? mastersFor(s.deck, s.deck.slides.map((_, i) => i)) : s.deck.masters);
const curTheme = (s: FrameStore): ThemeDef | undefined => themeByName(curMaster(s).theme.name);
const curVariant = (s: FrameStore, def: ThemeDef | undefined): number => {
  if (!def) return -1;
  const n = curMaster(s).theme.colorsName;
  for (let v = 0; v < 4; v++) if (variantColors(def, v).name === n) return v;
  return -1;
};

interface ThemeArg { id: string; variant?: number; selected?: boolean }
const isThemeArg = (a: unknown): a is ThemeArg => !!a && typeof a === 'object' && typeof (a as ThemeArg).id === 'string';

const fontsOf = (id: string) => { const f = FONT_PAIRS.find((x) => x.id === id); return f ? { major: f.major, minor: f.minor, name: f.name } : null; };

// ---------- Small popout used for galleries in the panel ----------

const Popout = ({ label, icon: Icon, children, wide }: { label: string; icon: typeof Palette; children: (close: () => void) => ReactNode; wide?: boolean }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', off, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', off, true); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="dz-pop" ref={ref}>
      <button className="tool wide" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon size={16} strokeWidth={S} /><span>{label}</span><ChevronDown size={14} strokeWidth={S} className="dz-caret" />
      </button>
      {open && <div className={`popup dz-popup${wide ? ' wide' : ''}`} role="dialog" aria-label={label}>{children(() => setOpen(false))}</div>}
    </div>
  );
};

const Swatches = ({ colors }: { colors: ThemeColors }) => (
  <span className="dz-sw">{(['dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const).map((k) => <i key={k} style={{ background: colors[k] }} />)}</span>
);

// ---------- Panel sections ----------

const ThemesSection = ({ store }: { store: FrameStore }) => {
  const [onlySel, setOnlySel] = useState(false);
  const def = curTheme(store);
  const d = store.deck;
  return (
    <>
      <div className="dz-themes" role="listbox" aria-label="Themes">
        {THEMES.map((t) => (
          <button key={t.id} role="option" aria-selected={def?.id === t.id} className={`dz-theme${def?.id === t.id ? ' on' : ''}`} title={`${t.name}: ${t.note}`}
            onClick={() => run(store, 'design.theme', { id: t.id, selected: onlySel })}
            onContextMenu={(e) => { e.preventDefault(); store.menu = { x: e.clientX, y: e.clientY, kind: 'themeItem', data: t.id }; store.emit(); }}>
            <ThemeThumb def={t} variant={0} width={110} w={d.w} h={d.h} />
            <span>{t.name}</span>
          </button>
        ))}
      </div>
      <Check label="Apply to selected slides only" checked={onlySel} onChange={setOnlySel} />
    </>
  );
};

const VariantsSection = ({ store }: { store: FrameStore }) => {
  const def = curTheme(store);
  const v = curVariant(store, def);
  const m = curMaster(store);
  const d = store.deck;
  return (
    <>
      {def ? (
        <div className="dz-variants">
          {[0, 1, 2, 3].map((i) => (
            <button key={i} className={`dz-theme${v === i ? ' on' : ''}`} aria-label={`Variant ${i + 1}`} title={variantColors(def, i).name} onClick={() => run(store, 'design.variant', i)}>
              <ThemeThumb def={def} variant={i} width={110} content={i % 2 === 1} w={d.w} h={d.h} />
            </button>
          ))}
        </div>
      ) : <p className="muted small">This design came with the file. Pick colors, fonts and backgrounds below, or choose a theme.</p>}
      <Popout label={`Colors: ${m.theme.colorsName ?? 'Custom'}`} icon={Palette}>
        {(close) => (
          <div className="dz-list">
            {COLOR_SETS.map((c) => (
              <button key={c.id} className={m.theme.colorsName === c.name ? 'on' : ''} onClick={() => { run(store, 'design.colors', c.id); close(); }}>
                <Swatches colors={c.colors} /><span>{c.name}</span>
              </button>
            ))}
            <div className="sep" />
            <button onClick={() => { close(); run(store, 'design.colors'); }}><span>Customize colors…</span></button>
          </div>
        )}
      </Popout>
      <Popout label={`Fonts: ${m.theme.fonts.name ?? m.theme.fonts.major}`} icon={Type}>
        {(close) => (
          <div className="dz-list">
            {FONT_PAIRS.map((f) => (
              <button key={f.id} className={`dz-font${m.theme.fonts.major === f.major && m.theme.fonts.minor === f.minor ? ' on' : ''}`} onClick={() => { run(store, 'design.fonts', f.id); close(); }}>
                <span className="dz-aa" style={{ fontFamily: fontStack(f.major) }}>Aa</span>
                <span><b style={{ fontFamily: fontStack(f.major) }}>{f.major}</b><br /><small style={{ fontFamily: fontStack(f.minor) }}>{f.minor}</small></span>
              </button>
            ))}
            <div className="sep" />
            <button onClick={() => { close(); run(store, 'design.fonts'); }}><span>Customize fonts…</span></button>
          </div>
        )}
      </Popout>
      <Popout label="Background styles" icon={Paintbrush} wide>
        {(close) => <BgStyles store={store} m={m} onPick={(id) => { run(store, 'design.backgroundStyle', id); close(); }} />}
      </Popout>
    </>
  );
};

const fillSwatch = (f: Fill, m: Master, deck: FrameStore['deck']) => {
  const defs = new Defs('bgs');
  const p = paint(f, { theme: m.theme }, deck, defs, { w: 80, h: 45 });
  return <svg viewBox="0 0 80 45" aria-hidden><defs>{defs.items}</defs><rect width="80" height="45" fill={p.fill} /><rect x="10" y="12" width="40" height="5" rx="1" fill={css({ theme: 'accent1' }, { theme: m.theme })} /><rect x="10" y="22" width="56" height="3" fill={css({ theme: 'tx1', alpha: 0.35 }, { theme: m.theme })} /></svg>;
};

const BgStyles = ({ store, m, onPick }: { store: FrameStore; m: Master; onPick: (id: string) => void }) => (
  <div className="dz-bgs">
    {BACKGROUND_STYLES.map((b) => <button key={b.id} title={b.name} aria-label={b.name} onClick={() => onPick(b.id)}>{fillSwatch(b.fill, m, store.deck)}</button>)}
  </div>
);

// ---------- Dialogs ----------

const CustomColors = ({ store, close }: DialogProps) => {
  const m = curMaster(store);
  const [colors, setC] = useState<ThemeColors>({ ...m.theme.colors });
  const [name, setName] = useState(m.theme.colorsName && !COLOR_SETS.some((c) => c.name === m.theme.colorsName) ? m.theme.colorsName : 'Custom 1');
  const prev = useMemo(() => masterPreview(store.deck, m, { colors, colorsName: name }), [colors, name, m, store.deck]);
  return (
    <Dialog title="Customize colors" close={close} okLabel="Save" width={560}
      onOk={() => { store.tryChange('Theme colors', () => setColors(targetMasters(store), colors, name.trim() || 'Custom')); }}
      footer={<button onClick={() => setC({ ...m.theme.colors })}>Reset</button>}>
      <div className="dz-cc">
        <div className="dz-ccgrid">
          {COLOR_SLOTS.map(({ key, label }) => (
            <label key={key} className="dz-ccrow">
              <input type="color" value={colors[key].toLowerCase()} aria-label={label} onChange={(e) => setC({ ...colors, [key]: e.target.value.toUpperCase() })} />
              <span>{label}</span><code>{colors[key]}</code>
            </label>
          ))}
        </div>
        <div className="dz-ccprev"><SlideView deck={prev} slide={prev.slides[0]!} width={220} /><Swatches colors={colors} /></div>
      </div>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Dialog>
  );
};

const FONT_CHOICES = [...new Set([...FONT_NAMES, ...FONT_PAIRS.flatMap((f) => [f.major, f.minor])])].sort((a, b) => a.localeCompare(b));

const CustomFonts = ({ store, close }: DialogProps) => {
  const m = curMaster(store);
  const [major, setMajor] = useState(m.theme.fonts.major);
  const [minor, setMinor] = useState(m.theme.fonts.minor);
  const [name, setName] = useState(m.theme.fonts.name && !FONT_PAIRS.some((f) => f.name === m.theme.fonts.name) ? m.theme.fonts.name : 'Custom 1');
  const opts = (cur: string): [string, string][] => [...new Set([cur, ...FONT_CHOICES])].map((f) => [f, f]);
  return (
    <Dialog title="Customize fonts" close={close} okLabel="Save"
      onOk={() => { store.tryChange('Theme fonts', () => setFonts(targetMasters(store), { major, minor, name: name.trim() || 'Custom' })); }}>
      <Select label="Heading font" value={major} options={opts(major)} onChange={setMajor} />
      <Select label="Body font" value={minor} options={opts(minor)} onChange={setMinor} />
      <div className="dz-fontprev"><div style={{ fontFamily: fontStack(major) }}>Heading</div><p style={{ fontFamily: fontStack(minor) }}>Body text looks like this. 0123456789</p></div>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Dialog>
  );
};

const SlideSizeDialog = ({ store, close, data }: DialogProps<string>) => {
  const d = store.deck;
  const initial = Object.entries(SLIDE_SIZES).find(([, v]) => (v.w === d.w && v.h === d.h) || (v.w === d.h && v.h === d.w))?.[0] ?? 'custom';
  const [preset, setPreset] = useState<string>(data && SLIDE_SIZES[data] ? data : initial);
  const pre = data ? SLIDE_SIZES[data] : undefined;
  const [w, setW] = useState((pre?.w ?? d.w) / PX_PER_IN);
  const [h, setH] = useState((pre?.h ?? d.h) / PX_PER_IN);
  const [step, setStep] = useState<'size' | 'fit'>('size');
  const portrait = h > w;
  const pick = (k: string) => { setPreset(k); const p = SLIDE_SIZES[k]; if (p) { const a = Math.max(p.w, p.h), b = Math.min(p.w, p.h); const keepP = portrait && k !== 'portrait' && p.w !== p.h; setW((keepP ? b : p.w) / PX_PER_IN); setH((keepP ? a : p.h) / PX_PER_IN); } };
  const flip = (want: boolean) => { if (want !== portrait) { setW(h); setH(w); } };
  const W = Math.round(w * PX_PER_IN), H = Math.round(h * PX_PER_IN);
  const go = (mode: FitMode) => { store.tryChange('Slide size', () => resizeDeck(store.deck, W, H, mode)); close(); };
  const sameRatio = Math.abs(W / H - d.w / d.h) < 0.005;
  if (step === 'fit') {
    return (
      <Dialog title="Fit content" close={close}>
        <p>The new size has a different shape. How should slide content change?</p>
        <div className="dz-fit">
          <button onClick={() => go('max')}><b>Maximize</b><span className="muted small">Content grows to fill the slide. Some may fall off the edges.</span></button>
          <button onClick={() => go('fit')}><b>Ensure fit</b><span className="muted small">Content shrinks so all of it stays on the slide.</span></button>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title="Slide size" close={close} okLabel="Next"
      onOk={() => {
        if (W < 96 || H < 96 || W > 5400 || H > 5400) { store.notify('Use a size between 1 and 56 inches.'); return false; }
        if (W === d.w && H === d.h) return true;
        if (sameRatio) { go('fit'); return false; }
        setStep('fit');
        return false;
      }}>
      <Select label="Size" value={preset} options={[...Object.entries(SLIDE_SIZES).map(([k, v]): [string, string] => [k, v.label]), ['custom', 'Custom']]} onChange={pick} />
      <div className="num2">
        <NumberField label="Width" suffix="in" step={0.1} min={1} max={56} value={Math.round(w * 100) / 100} onChange={(n) => { setW(n); setPreset('custom'); }} />
        <NumberField label="Height" suffix="in" step={0.1} min={1} max={56} value={Math.round(h * 100) / 100} onChange={(n) => { setH(n); setPreset('custom'); }} />
      </div>
      <div className="rowx" role="radiogroup" aria-label="Orientation">
        <label className="check"><input type="radio" checked={!portrait} onChange={() => flip(false)} /> Landscape</label>
        <label className="check"><input type="radio" checked={portrait} onChange={() => flip(true)} /> Portrait</label>
      </div>
      <div className="dz-sizeprev" aria-hidden><div style={W >= H ? { width: 150, height: Math.round(150 * H / W) } : { height: 90, width: Math.round(90 * W / H) }} /></div>
      <p className="muted small">{W} x {H} px at 96 dpi</p>
    </Dialog>
  );
};

const RenameTheme = ({ store, close }: DialogProps) => {
  const m = curMaster(store);
  const [name, setName] = useState(m.theme.name);
  return (
    <Dialog title="Theme name" close={close} onOk={() => { store.tryChange('Rename theme', () => { m.theme.name = name.trim() || m.theme.name; }); }}>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Dialog>
  );
};

// ---------- Format background pane ----------

type BgTarget = { get: () => Background | undefined; set: (b: Background | undefined) => void; label: string; inherited: Background };

const bgTarget = (s: FrameStore): BgTarget | null => {
  const sf = s.surface();
  if (!sf) return null;
  if (sf.kind === 'slide') {
    const { master, layout } = s.masterOf(sf.slide);
    return { label: 'slide', get: () => sf.slide.background, set: (b) => { for (const i of selSlides(s)) { const x = s.deck.slides[i]; if (x) x.background = b && structuredClone(b); } }, inherited: layout.background ?? master.background };
  }
  if (sf.kind === 'layout') return { label: 'layout', get: () => sf.layout.background && { ...sf.layout.background, hideMasterGraphics: sf.layout.hideMasterGraphics }, set: (b) => { sf.layout.background = b ? { fill: b.fill } : undefined; sf.layout.hideMasterGraphics = b?.hideMasterGraphics || undefined; }, inherited: sf.master.background };
  return { label: 'master', get: () => sf.master.background, set: (b) => { sf.master.background = b ?? { fill: { type: 'solid', color: { theme: 'bg1' } } }; }, inherited: sf.master.background };
};

const PATTERNS: PatternName[] = ['pct5', 'pct10', 'pct20', 'pct25', 'pct50', 'pct75', 'horz', 'vert', 'ltHorz', 'ltVert', 'cross', 'diagCross', 'dnDiag', 'upDiag', 'smGrid', 'lgGrid', 'smCheck', 'lgCheck', 'dotGrid', 'dotDmnd', 'zigZag', 'wave', 'weave', 'plaid'];

const BackgroundPane = ({ store }: { store: FrameStore }) => {
  const t = bgTarget(store);
  if (!t) return <p className="muted">There is no slide.</p>;
  const own = t.get();
  const bg: Background = own ?? t.inherited;
  const f = bg.fill;
  const m = curMaster(store);
  const ctx = { theme: m.theme };
  const set = (fill: Fill, label = 'Background') => store.tryChange(label, () => t.set({ ...(own ?? {}), fill }));
  const kind = f.type === 'background' || f.type === 'none' ? 'solid' : f.type;
  const solidColor: Color = f.type === 'solid' ? f.color : { theme: 'bg1' };
  const grad = f.type === 'gradient' ? f : null;
  const pic = f.type === 'picture' ? f : null;
  const pat = f.type === 'pattern' ? f : null;
  const pickFile = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file) return;
      if (file.size > 40 * 1024 * 1024) { store.notify('That picture is too large.'); return; }
      void file.arrayBuffer().then((buf) => store.tryChange('Picture background', () => {
        const id = store.addMedia(file.type || 'image/png', file.name, new Uint8Array(buf));
        t.set({ ...(own ?? {}), fill: { type: 'picture', media: id, mode: 'stretch' } });
      }));
    };
    inp.click();
  };
  return (
    <div className="dz-bgpane">
      <div className="dz-radio" role="radiogroup" aria-label="Fill">
        {(['solid', 'gradient', 'picture', 'pattern'] as const).map((k) => (
          <label key={k} className="check"><input type="radio" checked={kind === k} onChange={() => {
            if (k === 'solid') set({ type: 'solid', color: solidColor });
            if (k === 'gradient') set({ type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: { theme: 'bg1' } }, { pos: 1, color: { theme: 'bg2' } }] });
            if (k === 'pattern') set({ type: 'pattern', pattern: 'pct10', fg: { theme: 'tx1', lum: 0.75 }, bg: { theme: 'bg1' } });
            if (k === 'picture') pickFile();
          }} /> {k === 'solid' ? 'Solid fill' : k === 'gradient' ? 'Gradient fill' : k === 'picture' ? 'Picture or texture fill' : 'Pattern fill'}</label>
        ))}
      </div>
      {kind === 'solid' && <ColorButton store={store} label="Color" value={solidColor} onPick={(c) => c && set({ type: 'solid', color: c })} />}
      {grad && (
        <>
          <Select label="Type" value={grad.kind} options={[['linear', 'Linear'], ['radial', 'Radial'], ['rect', 'Rectangular']]} onChange={(v) => set({ ...grad, kind: v })} />
          <NumberField label="Angle" suffix="°" value={grad.angle} min={0} max={359} onChange={(n) => set({ ...grad, angle: n })} />
          <div className="dz-stops" style={{ background: `linear-gradient(90deg, ${[...grad.stops].sort((a, b) => a.pos - b.pos).map((s) => `${css(s.color, ctx)} ${s.pos * 100}%`).join(', ')})` }} aria-hidden />
          {grad.stops.map((st, i) => (
            <div key={i} className="dz-stop">
              <ColorButton store={store} label={`Stop ${i + 1}`} value={st.color} onPick={(c) => c && set({ ...grad, stops: grad.stops.map((x, j) => (j === i ? { ...x, color: c } : x)) })} />
              <NumberField label="Position" suffix="%" width={86} value={Math.round(st.pos * 100)} min={0} max={100} onChange={(n) => set({ ...grad, stops: grad.stops.map((x, j) => (j === i ? { ...x, pos: n / 100 } : x)) })} />
            </div>
          ))}
          <div className="rowx">
            <button className="tool" onClick={() => set({ ...grad, stops: [...grad.stops, { pos: 0.5, color: { theme: 'accent1' } }] })}>Add stop</button>
            <button className="tool" disabled={grad.stops.length <= 2} onClick={() => set({ ...grad, stops: grad.stops.slice(0, -1) })}>Remove stop</button>
          </div>
        </>
      )}
      {(kind === 'picture') && (
        <>
          <button className="tool" onClick={pickFile}><ImageIcon size={16} strokeWidth={S} /> {pic ? 'Change picture…' : 'Insert picture…'}</button>
          {pic && (
            <>
              <Check label="Tile picture as texture" checked={pic.mode === 'tile'} onChange={(v) => set({ ...pic, mode: v ? 'tile' : 'stretch' })} />
              <label className="lbl"><span>Transparency {Math.round((pic.transparency ?? 0) * 100)}%</span>
                <input type="range" min={0} max={100} value={Math.round((pic.transparency ?? 0) * 100)} onChange={(e) => set({ ...pic, transparency: Number(e.target.value) / 100 }, '!Transparency')}
                  onPointerUp={(e) => set({ ...pic, transparency: Number((e.target as HTMLInputElement).value) / 100 })} />
              </label>
              {pic.mode !== 'tile' && (
                <div className="num2">
                  {(['l', 't', 'r', 'b'] as const).map((k) => (
                    <NumberField key={k} label={`Offset ${k === 'l' ? 'left' : k === 't' ? 'top' : k === 'r' ? 'right' : 'bottom'}`} suffix="%" value={Math.round(((pic.crop?.[k] ?? 0) * -100))}
                      min={-90} max={90} onChange={(n) => set({ ...pic, crop: { l: 0, t: 0, r: 0, b: 0, ...(pic.crop ?? {}), [k]: -n / 100 } })} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      {pat && (
        <>
          <div className="dz-pats">
            {PATTERNS.map((p) => (
              <button key={p} className={pat.pattern === p ? 'on' : ''} title={p} aria-label={`Pattern ${p}`} onClick={() => set({ ...pat, pattern: p })}>
                {fillSwatch({ type: 'pattern', pattern: p, fg: pat.fg, bg: pat.bg }, m, store.deck)}
              </button>
            ))}
          </div>
          <div className="rowx">
            <ColorButton store={store} label="Foreground" value={pat.fg} onPick={(c) => c && set({ ...pat, fg: c })} />
            <ColorButton store={store} label="Background" value={pat.bg} onPick={(c) => c && set({ ...pat, bg: c })} />
          </div>
        </>
      )}
      <div className="sep" />
      {t.label !== 'master' && <Check label="Hide background graphics" checked={!!bg.hideMasterGraphics} onChange={(v) => store.tryChange('Hide background graphics', () => t.set({ ...(own ?? { fill: t.inherited.fill }), hideMasterGraphics: v || undefined }))} />}
      <div className="rowx">
        {t.label === 'slide' && <button className="tool" onClick={() => store.tryChange('Apply background to all', () => setBackground(store.deck, structuredClone(bg.fill)))}>Apply to all</button>}
        <button className="tool" onClick={() => store.tryChange('Reset background', () => t.set(undefined))}>Reset background</button>
      </div>
    </div>
  );
};

// ---------- Designer pane ----------

const IdeaButton = ({ store, idea, apply }: { store: FrameStore; idea: Idea; apply: (i: Idea) => void }) => (
  <button className="dz-idea" onClick={() => apply(idea)} title={idea.name} aria-label={`Design idea: ${idea.name}`}>
    <SlideView deck={store.deck} slide={idea.slide} width={240} />
    <span>{idea.name}</span>
  </button>
);

const DesignerPane = ({ store }: { store: FrameStore }) => {
  const slide = store.slide;
  const key = slide ? `${slide.id}:${slide.layout}:${store.deck.w}x${store.deck.h}:${JSON.stringify(slide.shapes)}` : '';
  const ideas = useMemo(() => {
    if (!slide) return { main: [] as Idea[], title: [] as Idea[] };
    const lay = store.masterOf(slide).layout;
    return { main: designIdeas(store.deck, slide), title: lay.type === 'title' ? titleIdeas(store.deck, slide) : [] };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (store.view.mode !== 'normal') return <p className="muted">Design ideas work in Normal view.</p>;
  if (!slide) return <p className="muted">Add a slide first.</p>;
  const apply = (i: Idea) => store.tryChange('Design idea', () => {
    slide.shapes = structuredClone(i.slide.shapes);
    slide.background = i.slide.background ? structuredClone(i.slide.background) : slide.background;
  });
  if (!ideas.main.length && !ideas.title.length) return <p className="muted">Add a title, some text or a picture to this slide to see ideas.</p>;
  return (
    <div className="dz-ideas">
      <p className="muted small">Ideas use this slide's own text and pictures. Pick one to apply it; undo puts it back.</p>
      {ideas.title.length > 0 && <><h3 className="dz-h">Title slide</h3>{ideas.title.map((i) => <IdeaButton key={i.id} store={store} idea={i} apply={apply} />)}<h3 className="dz-h">Layouts</h3></>}
      {ideas.main.map((i) => <IdeaButton key={i.id} store={store} idea={i} apply={apply} />)}
    </div>
  );
};

// ---------- Registration ----------

export const registerDesign = (): void => {
  registerCommands([
    {
      id: 'design.theme', label: 'Apply theme', group: 'Design', hidden: true,
      run: (s, arg) => {
        const a: ThemeArg | null = isThemeArg(arg) ? arg : typeof arg === 'string' ? { id: arg } : null;
        const def = a ? themeById(a.id) : undefined;
        if (!a || !def) { s.view.panel = 'design'; s.emit(); return; }
        const sel = a.selected ? selSlides(s) : undefined;
        s.tryChange(`Theme ${def.name}`, () => {
          applyTheme(s.deck, def, a.variant ?? 0, sel && sel.length < s.deck.slides.length ? sel : undefined);
          s.masterSel = { master: 0, layout: -1 };
        });
      },
    },
    {
      id: 'design.variant', label: 'Theme variant', group: 'Design', hidden: true,
      enabled: (s) => !!curTheme(s),
      run: (s, arg) => {
        const def = curTheme(s);
        if (!def) return;
        const v = Math.max(0, Math.min(3, Number(arg) || 0));
        const vc = variantColors(def, v);
        s.tryChange('Variant', () => {
          for (const m of targetMasters(s)) if (m.theme.name === def.name) { m.theme.colors = { ...vc.colors }; m.theme.colorsName = vc.name; }
        });
      },
    },
    {
      id: 'design.colors', label: 'Theme colors…', group: 'Design',
      run: (s, arg) => {
        const set = typeof arg === 'string' ? COLOR_SETS.find((c) => c.id === arg) : undefined;
        if (!set) { openDialog(s, 'design.customColors'); return; }
        s.tryChange('Theme colors', () => setColors(targetMasters(s), set.colors, set.name));
      },
    },
    {
      id: 'design.fonts', label: 'Theme fonts…', group: 'Design',
      run: (s, arg) => {
        const f = typeof arg === 'string' ? fontsOf(arg) : null;
        if (!f) { openDialog(s, 'design.customFonts'); return; }
        s.tryChange('Theme fonts', () => setFonts(targetMasters(s), f));
      },
    },
    {
      id: 'design.backgroundStyle', label: 'Background style', group: 'Design', hidden: true,
      run: (s, arg) => {
        const b = BACKGROUND_STYLES.find((x) => x.id === arg);
        if (!b) return;
        s.tryChange('Background style', () => {
          if (s.view.mode === 'master') { curMaster(s).background = { ...curMaster(s).background, fill: structuredClone(b.fill) }; return; }
          for (const m of targetMasters(s)) {
            m.background = { ...m.background, fill: structuredClone(b.fill) };
            for (const l of m.layouts) if (l.background && l.type !== 'title' && l.type !== 'secHead') l.background = undefined;
          }
        });
      },
    },
    { id: 'design.slideSize', label: 'Slide size…', group: 'Design', run: (s, arg) => openDialog(s, 'design.slideSize', typeof arg === 'string' ? arg : undefined) },
    { id: 'design.background', label: 'Format background…', group: 'Design', active: (s) => s.view.pane === 'background', run: (s) => openPane(s, 'background') },
    { id: 'design.designer', label: 'Design ideas', group: 'Design', active: (s) => s.view.pane === 'designer', run: (s) => openPane(s, 'designer') },
    {
      id: 'design.hideBackgroundGraphics', label: 'Hide background graphics', group: 'Design',
      active: (s) => { const sf = s.surface(); return sf?.kind === 'slide' ? !!(sf.slide.background?.hideMasterGraphics ?? s.masterOf(sf.slide).layout.hideMasterGraphics) : sf?.kind === 'layout' ? !!sf.layout.hideMasterGraphics : false; },
      enabled: (s) => s.surface()?.kind !== 'master',
      run: (s) => s.tryChange('Hide background graphics', () => {
        const sf = s.surface();
        if (!sf) return;
        if (sf.kind === 'layout') { sf.layout.hideMasterGraphics = !sf.layout.hideMasterGraphics || undefined; return; }
        if (sf.kind !== 'slide') return;
        const on = !(sf.slide.background?.hideMasterGraphics ?? s.masterOf(sf.slide).layout.hideMasterGraphics);
        for (const i of selSlides(s)) {
          const x = s.deck.slides[i]!;
          const { master, layout } = s.masterOf(x);
          x.background = { fill: x.background?.fill ?? structuredClone((layout.background ?? master.background).fill), hideMasterGraphics: on };
        }
      }),
    },
    { id: 'design.renameTheme', label: 'Rename theme…', group: 'Design', hidden: true, run: (s) => openDialog(s, 'design.renameTheme') },
  ]);

  registerDialog('design.customColors', CustomColors);
  registerDialog('design.customFonts', CustomFonts);
  registerDialog('design.slideSize', SlideSizeDialog);
  registerDialog('design.renameTheme', RenameTheme);
  registerPane({ id: 'background', title: 'Format background', render: (s) => <BackgroundPane store={s} /> });
  registerPane({ id: 'designer', title: 'Design ideas', width: 290, render: (s) => <DesignerPane store={s} /> });

  registerMenu({
    kind: 'themeItem', items: (_s, id) => [
      { label: 'Apply to all slides', command: 'design.theme', arg: { id } },
      { label: 'Apply to selected slides', command: 'design.theme', arg: { id, selected: true } },
    ],
  });
  // Text menus used by the master view's Edit theme buttons.
  registerMenu({ kind: 'designThemes', items: () => THEMES.map((t) => ({ label: t.name, command: 'design.theme', arg: { id: t.id } })) });
  registerMenu({ kind: 'designColors', items: () => [...COLOR_SETS.map((c) => ({ label: c.name, command: 'design.colors', arg: c.id })), { label: '', sep: true }, { label: 'Customize colors…', command: 'design.colors' }] });
  registerMenu({ kind: 'designFonts', items: () => [...FONT_PAIRS.map((f) => ({ label: `${f.name}: ${f.major} / ${f.minor}`, command: 'design.fonts', arg: f.id })), { label: '', sep: true }, { label: 'Customize fonts…', command: 'design.fonts' }] });
  registerMenu({ kind: 'designBackgrounds', items: () => [...BACKGROUND_STYLES.map((b) => ({ label: b.name, command: 'design.backgroundStyle', arg: b.id })), { label: '', sep: true }, { label: 'Format background…', command: 'design.background' }] });

  registerPanelSection({ tab: 'design', title: 'Themes', order: 10, render: (s) => <ThemesSection store={s} /> });
  registerPanelSection({ tab: 'design', title: 'Variants', order: 20, render: (s) => <VariantsSection store={s} /> });
  registerPanelSection({
    tab: 'design', title: 'Customize', order: 30, render: (s) => (
      <div className="toollist">
        <Btn store={s} id="design.slideSize" icon={Ratio} />
        <Btn store={s} id="design.background" icon={Paintbrush} />
        <Btn store={s} id="design.hideBackgroundGraphics" icon={EyeOff} />
      </div>
    ),
  });
  registerPanelSection({
    tab: 'design', title: 'Designer', order: 40, render: (s) => (
      <div className="toollist">
        <Btn store={s} id="design.designer" icon={WandSparkles} label="Design ideas" />
        <p className="muted small">Alternative arrangements of this slide, made on your device.</p>
      </div>
    ),
  });
};
