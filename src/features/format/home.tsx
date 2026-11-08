import { useEffect, useState, type ReactNode } from 'react';
import {
  AArrowDown, AArrowUp, ALargeSmall, AlignCenter, AlignJustify, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
  ArrowRightLeft, Baseline, Bold, BringToFront, ClipboardPaste, Columns2, Copy, FolderPlus, Highlighter, IndentDecrease, IndentIncrease, Italic, LayoutTemplate, Layers,
  List, ListOrdered, MousePointer2, MoveVertical, PaintBucket, Paintbrush, PenLine, Plus, Redo2, RemoveFormatting, Replace, RotateCcw, Scissors, Search, Shapes,
  PenTool, Sparkles, Strikethrough, Subscript, Superscript, Type, Underline, Undo2, Waypoints, Workflow, type LucideIcon,
} from 'lucide-react';
import { command, run } from '../../app/commands';
import { registerPanelSection } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { AutoNumber, BulletSpec, Color, Dash, Fill, Line, Shape } from '../../model/deck';
import { allPresets } from '../../render/geometry';
import { css } from '../../render/color';
import { SlideView } from '../../render/SlideView';
import { autoNumberText } from '../../render/text';
import { FONT_NAMES, fontMenu } from '../../ui/fonts';
import { Btn, ColorButton, ColorGrid, Row, S } from '../../ui/kit';
import { FONT_SIZES, hasText, paraStyle, runStyle, textBody, tx, txActive } from './bridge';
import { QUICK_STYLE_COUNT, quickStyle, topSelected } from './ops';
import { CmdBtn, MenuButton, MenuList, Pop, Swatch, type MenuEntry } from './widgets';

const TxBtn = ({ store, id, icon: Icon, label, arg }: { store: FrameStore; id: string; icon: LucideIcon; label: string; arg?: unknown }) => {
  const c = command(id);
  const on = txActive(store, id);
  const enabled = hasText(store) && (c?.enabled?.(store) ?? true);
  const tip = c?.keys ? `${label} (${c.keys.replace('Mod', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')})` : label;
  return (
    <button className={`tool icon${on ? ' on' : ''}`} aria-label={label} title={tip} aria-pressed={on} disabled={!enabled}
      onMouseDown={(e) => e.preventDefault()} onClick={() => tx(store, id, arg)}>
      <Icon size={16} strokeWidth={S} />
    </button>
  );
};

// ---------- Clipboard ----------

const Clipboard = ({ store: s }: { store: FrameStore }) => (
  <>
    <Row>
      <Btn store={s} id="edit.paste" icon={ClipboardPaste} iconOnly />
      <Btn store={s} id="edit.cut" icon={Scissors} iconOnly />
      <Btn store={s} id="edit.copy" icon={Copy} iconOnly />
      <Btn store={s} id="edit.formatPainter" icon={Paintbrush} iconOnly />
      <Btn store={s} id="edit.undo" icon={Undo2} iconOnly />
      <Btn store={s} id="edit.redo" icon={Redo2} iconOnly />
    </Row>
    {(command('edit.pasteSpecial') || command('edit.duplicate')) && (
      <MenuButton store={s} label="Paste options" wide items={[
        { label: 'Paste', command: 'edit.paste' },
        { label: 'Paste special…', command: 'edit.pasteSpecial' },
        { label: 'Duplicate', command: 'edit.duplicate' },
        { sep: true, label: '' },
        { label: 'Paste slides', command: 'slide.paste' },
      ]} />
    )}
  </>
);

// ---------- Slides ----------

const LayoutGallery = ({ store, onPick, current }: { store: FrameStore; onPick: (id: string) => void; current?: string }) => {
  const slide = store.slide;
  const master = slide ? store.masterOf(slide).master : store.deck.masters[0]!;
  return (
    <div className="gallery fmtlayouts">
      {master.layouts.map((l) => (
        <button key={l.id} className={current === l.id ? 'on' : ''} title={l.name} onClick={() => onPick(l.id)}>
          <SlideView deck={store.deck} layout={l} master={master} width={104} prompts />
          <span>{l.name}</span>
        </button>
      ))}
    </div>
  );
};

const Slides = ({ store: s }: { store: FrameStore }) => (
  <>
    <div className="fmtsplit">
      <Btn store={s} id="slide.new" icon={Plus} wide />
      <Pop label="New slide with layout" icon={LayoutTemplate} iconOnly width={260}>
        {(close) => <><div className="cgtitle">New slide</div><LayoutGallery store={s} onPick={(id) => { close(); run(s, 'slide.new', id); }} /></>}
      </Pop>
    </div>
    <Row>
      <Pop label="Layout" icon={LayoutTemplate} width={260} disabled={!s.slide || s.view.mode === 'master'}>
        {(close) => <><div className="cgtitle">Layout</div><LayoutGallery store={s} current={s.slide?.layout} onPick={(id) => { close(); run(s, 'slide.layout', id); }} /></>}
      </Pop>
      <Btn store={s} id="slide.reset" icon={RotateCcw} iconOnly label="Reset slide" />
      <Btn store={s} id="section.add" icon={FolderPlus} iconOnly label="Add section" />
    </Row>
  </>
);

// ---------- Font ----------

const FontPicker = ({ store }: { store: FrameStore }) => {
  const r = runStyle(store);
  const theme = (store.slide ? store.masterOf(store.slide).master : store.deck.masters[0]!).theme;
  const font = r.font ?? '+mn-lt';
  const size = r.size;
  const [sz, setSz] = useState(size === undefined ? '' : String(size));
  useEffect(() => setSz(size === undefined ? '' : String(size)), [size]);
  const enabled = hasText(store);
  const known = font.startsWith('+') || FONT_NAMES.includes(font);
  const commitSize = () => { const n = parseFloat(sz); if (Number.isFinite(n) && n >= 1 && n <= 4000) tx(store, 'text.size', Math.round(n * 2) / 2); else setSz(size === undefined ? '' : String(size)); };
  return (
    <div className="fontctl">
      <select aria-label="Font" value={font.startsWith('+mj') ? '+mj-lt' : font.startsWith('+mn') ? '+mn-lt' : font} disabled={!enabled}
        onChange={(e) => { const v = e.target.value; if (v === '\u0000more') { if (fontMenu.more) run(store, fontMenu.more); return; } fontMenu.picked(v); tx(store, 'text.font', v); }}>
        {fontMenu.more && command(fontMenu.more) && <option value={'\u0000more'}>More fonts…</option>}
        {fontMenu.groups().filter((g) => g.fonts.length).map((g) => <optgroup key={g.label} label={g.label}>{g.fonts.map((f) => <option key={f} value={f}>{f}</option>)}</optgroup>)}
        <optgroup label="Theme fonts">
          <option value="+mj-lt">{theme.fonts.major} (Headings)</option>
          <option value="+mn-lt">{theme.fonts.minor} (Body)</option>
        </optgroup>
        <optgroup label="All fonts">
          {!known && <option value={font}>{font}</option>}
          {FONT_NAMES.map((f) => <option key={f} value={f}>{f}</option>)}
        </optgroup>
      </select>
      <input aria-label="Font size" inputMode="decimal" list="fmt-sizes" value={sz} disabled={!enabled} onChange={(e) => setSz(e.target.value)}
        onBlur={commitSize} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitSize(); } }}
        onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (FONT_SIZES.includes(Number(v)) && Number(v) !== size) tx(store, 'text.size', Number(v)); }} />
      <datalist id="fmt-sizes">{FONT_SIZES.map((n) => <option key={n} value={n} />)}</datalist>
    </div>
  );
};

const SPACING: [string, number][] = [['Very tight', -3], ['Tight', -1.5], ['Normal', 0], ['Loose', 3], ['Very loose', 6]];
const CASES: [string, string][] = [['Sentence case', 'sentence'], ['lowercase', 'lower'], ['UPPERCASE', 'upper'], ['Capitalize Each Word', 'title'], ['tOGGLE cASE', 'toggle']];

const Font = ({ store: s }: { store: FrameStore }) => {
  const r = runStyle(s);
  const on = hasText(s);
  const spacing = r.spacing ?? 0;
  return (
    <>
      <FontPicker store={s} />
      <Row>
        <TxBtn store={s} id="text.bold" icon={Bold} label="Bold" />
        <TxBtn store={s} id="text.italic" icon={Italic} label="Italic" />
        <TxBtn store={s} id="text.underline" icon={Underline} label="Underline" />
        <TxBtn store={s} id="text.strike" icon={Strikethrough} label="Strikethrough" />
        <button className={`tool icon${r.shadow ? ' on' : ''}`} aria-label="Text shadow" title="Text shadow" aria-pressed={!!r.shadow} disabled={!on}
          onMouseDown={(e) => e.preventDefault()} onClick={() => tx(s, 'text.shadow')}>
          <Type size={16} strokeWidth={S} className="fmtshadowicon" />
        </button>
        <TxBtn store={s} id="text.superscript" icon={Superscript} label="Superscript" />
        <TxBtn store={s} id="text.subscript" icon={Subscript} label="Subscript" />
      </Row>
      <Row>
        <TxBtn store={s} id="text.grow" icon={AArrowUp} label="Increase font size" />
        <TxBtn store={s} id="text.shrink" icon={AArrowDown} label="Decrease font size" />
        <Pop label="Character spacing" icon={ArrowRightLeft} iconOnly width={200} disabled={!on}>
          {(close) => <MenuList store={s} close={close} items={[
            ...SPACING.map(([l, v]): MenuEntry => ({ label: l, on: Math.abs(spacing - v) < 0.01, run: () => tx(s, 'text.spacing', v) })),
            { label: '', sep: true },
            { label: 'More spacing…', run: () => run(s, 'format.paragraph', 'font') },
          ]} />}
        </Pop>
        <Pop label="Change case" icon={ALargeSmall} iconOnly width={220} disabled={!on}>
          {(close) => <MenuList store={s} close={close} items={CASES.map(([l, v]) => ({ label: l, run: () => tx(s, 'text.case', v) }))} />}
        </Pop>
        <TxBtn store={s} id="text.clear" icon={RemoveFormatting} label="Clear formatting" />
      </Row>
      <div className="fmtcolors">
        <ColorButton store={s} label="Color" icon={Baseline} value={r.color} auto="Automatic" onPick={(c) => tx(s, 'text.color', c)} />
        <ColorButton store={s} label="Highlight" icon={Highlighter} value={r.highlight} none="No highlight" onPick={(c) => tx(s, 'text.highlight', c)} />
      </div>
    </>
  );
};

// ---------- Paragraph ----------

export const BULLET_CHARS: { char: string; font?: string; label: string }[] = [
  { char: '•', font: 'Arial', label: 'Filled round' },
  { char: '◦', font: 'Arial', label: 'Hollow round' },
  { char: '▪', font: 'Arial', label: 'Filled square' },
  { char: '□', font: 'Arial', label: 'Hollow square' },
  { char: '◆', font: 'Arial', label: 'Diamond' },
  { char: '➢', font: 'Arial', label: 'Arrow' },
  { char: '✓', font: 'Arial', label: 'Check mark' },
  { char: '–', font: 'Arial', label: 'Dash' },
  { char: '★', font: 'Arial', label: 'Star' },
  { char: '→', font: 'Arial', label: 'Right arrow' },
  { char: '○', font: 'Arial', label: 'Circle' },
  { char: '☐', label: 'Checklist' },
];
export const NUMBER_SCHEMES: AutoNumber[] = ['arabicPeriod', 'arabicParenR', 'arabicParenBoth', 'alphaUcPeriod', 'alphaLcParenR', 'alphaLcPeriod', 'romanUcPeriod', 'romanLcPeriod', 'arabicPlain'];

const BulletGallery = ({ store, close }: { store: FrameStore; close: () => void }) => {
  const b = paraStyle(store).bullet;
  return (
    <>
      <div className="gallery fmtbullets">
        <button className={!b || b.type === 'none' ? 'on' : ''} onClick={() => { close(); tx(store, 'text.bulletStyle', { type: 'none' } satisfies BulletSpec); }}><span className="bl none">None</span></button>
        {BULLET_CHARS.map((c) => (
          <button key={c.char} title={c.label} aria-label={c.label} className={b?.type === 'char' && b.char === c.char ? 'on' : ''}
            onClick={() => { close(); tx(store, 'text.bulletStyle', { type: 'char', char: c.char, ...(c.font ? { font: c.font } : {}) } satisfies BulletSpec); }}>
            <span className="bl">{[0, 1, 2].map((i) => <span key={i}><b>{c.char}</b><i /></span>)}</span>
          </button>
        ))}
      </div>
      <button className="tool wide" onClick={() => { close(); run(store, 'format.bullets', 'bullets'); }}>Bullets and numbering…</button>
    </>
  );
};

const NumberGallery = ({ store, close }: { store: FrameStore; close: () => void }) => {
  const b = paraStyle(store).bullet;
  return (
    <>
      <div className="gallery fmtbullets">
        <button className={!b || b.type === 'none' ? 'on' : ''} onClick={() => { close(); tx(store, 'text.bulletStyle', { type: 'none' } satisfies BulletSpec); }}><span className="bl none">None</span></button>
        {NUMBER_SCHEMES.map((n) => (
          <button key={n} title={autoNumberText(n, 1)} aria-label={`Numbering ${autoNumberText(n, 1)}`} className={b?.type === 'auto' && b.scheme === n ? 'on' : ''}
            onClick={() => { close(); tx(store, 'text.numberStyle', n); }}>
            <span className="bl">{[1, 2, 3].map((i) => <span key={i}><b>{autoNumberText(n, i)}</b><i /></span>)}</span>
          </button>
        ))}
      </div>
      <button className="tool wide" onClick={() => { close(); run(store, 'format.bullets', 'numbers'); }}>Bullets and numbering…</button>
    </>
  );
};

const LINE_SPACING = [100, 115, 150, 200, 250, 300];

const Paragraph = ({ store: s }: { store: FrameStore }) => {
  const p = paraStyle(s);
  const body = textBody(s);
  const on = hasText(s);
  const ls = p.lineSpacingPts ? undefined : p.lineSpacing ?? 100;
  return (
    <>
      <Row>
        <TxBtn store={s} id="text.bullets" icon={List} label="Bullets" />
        <Pop label="Bullet styles" iconOnly width={236} disabled={!on}>{(close) => <BulletGallery store={s} close={close} />}</Pop>
        <TxBtn store={s} id="text.numbering" icon={ListOrdered} label="Numbering" />
        <Pop label="Numbering styles" iconOnly width={236} disabled={!on}>{(close) => <NumberGallery store={s} close={close} />}</Pop>
        <TxBtn store={s} id="text.outdent" icon={IndentDecrease} label="Decrease list level" />
        <TxBtn store={s} id="text.indent" icon={IndentIncrease} label="Increase list level" />
      </Row>
      <Row>
        <TxBtn store={s} id="text.alignLeft" icon={AlignLeft} label="Align left" />
        <TxBtn store={s} id="text.alignCenter" icon={AlignCenter} label="Center" />
        <TxBtn store={s} id="text.alignRight" icon={AlignRight} label="Align right" />
        <TxBtn store={s} id="text.justify" icon={AlignJustify} label="Justify" />
        <Pop label="Line spacing" icon={MoveVertical} iconOnly width={220} disabled={!on}>
          {(close) => <MenuList store={s} close={close} items={[
            ...LINE_SPACING.map((v): MenuEntry => ({ label: (v / 100).toFixed(v % 50 ? 2 : 1), on: ls !== undefined && Math.abs(ls - v) < 1, run: () => tx(s, 'text.lineSpacing', v) })),
            { label: '', sep: true },
            { label: 'Line spacing options…', run: () => run(s, 'format.paragraph') },
          ]} />}
        </Pop>
        <Pop label="Columns" icon={Columns2} iconOnly width={200} disabled={!on}>
          {(close) => <MenuList store={s} close={close} items={[
            ...[1, 2, 3].map((n): MenuEntry => ({ label: n === 1 ? 'One column' : n === 2 ? 'Two columns' : 'Three columns', on: (body.columns ?? 1) === n, run: () => tx(s, 'text.columns', n) })),
            { label: '', sep: true },
            { label: 'More columns…', run: () => run(s, 'format.pane', 'text') },
          ]} />}
        </Pop>
      </Row>
      <Row>
        <button className={`tool icon${(body.vAlign ?? 't') === 't' ? ' on' : ''}`} disabled={!on} aria-label="Align text top" title="Align text top" onMouseDown={(e) => e.preventDefault()} onClick={() => tx(s, 'text.vAlign', 't')}><AlignVerticalJustifyStart size={16} strokeWidth={S} /></button>
        <button className={`tool icon${body.vAlign === 'ctr' ? ' on' : ''}`} disabled={!on} aria-label="Align text middle" title="Align text middle" onMouseDown={(e) => e.preventDefault()} onClick={() => tx(s, 'text.vAlign', 'ctr')}><AlignVerticalJustifyCenter size={16} strokeWidth={S} /></button>
        <button className={`tool icon${body.vAlign === 'b' ? ' on' : ''}`} disabled={!on} aria-label="Align text bottom" title="Align text bottom" onMouseDown={(e) => e.preventDefault()} onClick={() => tx(s, 'text.vAlign', 'b')}><AlignVerticalJustifyEnd size={16} strokeWidth={S} /></button>
        <Pop label="Text direction" icon={RotateCcw} iconOnly width={220} disabled={!on}>
          {(close) => <MenuList store={s} close={close} items={[
            { label: 'Horizontal', on: (body.vert ?? 'horz') === 'horz', run: () => tx(s, 'text.direction', 'horz') },
            { label: 'Rotate all text 90°', on: body.vert === 'vert', run: () => tx(s, 'text.direction', 'vert') },
            { label: 'Rotate all text 270°', on: body.vert === 'vert270', run: () => tx(s, 'text.direction', 'vert270') },
            { label: 'Stacked', on: body.vert === 'eaVert', run: () => tx(s, 'text.direction', 'eaVert') },
            { label: '', sep: true },
            { label: 'Right-to-left paragraph', on: !!p.rtl, run: () => s.tryChange('Direction', () => applyRtl(s, !p.rtl)) },
          ]} />}
        </Pop>
        <CmdBtn store={s} id="diagram.fromText" icon={Workflow} iconOnly label="Convert to diagram" />
      </Row>
    </>
  );
};

const applyRtl = (s: FrameStore, rtl: boolean) => {
  for (const sh of topSelected(s)) if (sh.kind === 'shape') for (const p of sh.text?.paras ?? []) p.style = { ...(p.style ?? {}), rtl: rtl || undefined };
};

// ---------- Drawing ----------

const QUICK_SHAPES: [string, string][] = [
  ['textbox', 'Text box'], ['rect', 'Rectangle'], ['roundRect', 'Rounded rectangle'], ['ellipse', 'Oval'], ['triangle', 'Triangle'], ['rtTriangle', 'Right triangle'],
  ['line', 'Line'], ['straightConnector1', 'Arrow'], ['tool:curve', 'Curve'], ['tool:polyline', 'Polyline'], ['rightArrow', 'Right arrow'], ['pentagon', 'Pentagon arrow'], ['star5', 'Star'], ['wedgeRectCallout', 'Callout'],
  ['hexagon', 'Hexagon'], ['diamond', 'Diamond'], ['leftBrace', 'Brace'], ['flowChartProcess', 'Process'],
];

const QuickShapes = ({ store: s }: { store: FrameStore }) => {
  const known = new Set(allPresets().map((p) => p.name));
  const shapes = QUICK_SHAPES.filter(([g]) => g === 'textbox' || known.has(g) || (g.startsWith('tool:') && command(`draw.${g.slice(5)}`))).slice(0, 14);
  return (
    <div className="gallery sm fmtshapes">
      {shapes.map(([g, label]) => g.startsWith('tool:') ? (
        <button key={g} title={label} aria-label={label} className={command(`draw.${g.slice(5)}`)?.active?.(s) ? 'on' : ''} onClick={() => run(s, `draw.${g.slice(5)}`)}>
          {g === 'tool:curve' ? <PenTool size={18} strokeWidth={S} style={{ margin: '3px auto' }} /> : <Waypoints size={18} strokeWidth={S} style={{ margin: '3px auto' }} />}
        </button>
      ) : (
        <button key={g} title={label} aria-label={label} className={s.tool === (g === 'textbox' ? 'text' : `shape:${g}`) ? 'on' : ''}
          onClick={() => (g === 'textbox' ? (command('insert.textbox') ? run(s, 'insert.textbox') : setTool(s, 'text')) : command('insert.shape') ? run(s, 'insert.shape', g) : setTool(s, `shape:${g}`))}>
          {g === 'textbox' ? <Type size={18} strokeWidth={S} style={{ margin: '3px auto' }} /> : <Swatch store={s} geom={g} w={28} h={24} fill={{ type: 'none' }} line={{ fill: { type: 'solid', color: '#6f5d57' }, width: 1 }} />}
        </button>
      ))}
    </div>
  );
};

const setTool = (s: FrameStore, t: string) => { s.tool = s.tool === t ? null : t; s.emit(); };

const ARRANGE: MenuEntry[] = [
  { label: 'Bring to front', command: 'arrange.front' },
  { label: 'Bring forward', command: 'arrange.forward' },
  { label: 'Send backward', command: 'arrange.backward' },
  { label: 'Send to back', command: 'arrange.back' },
  { label: '', sep: true },
  { label: 'Group', command: 'shape.group' },
  { label: 'Ungroup', command: 'shape.ungroup' },
  { label: 'Regroup', command: 'shape.regroup' },
  { label: '', sep: true },
  { label: 'Align left', command: 'align.left' },
  { label: 'Align center', command: 'align.center' },
  { label: 'Align right', command: 'align.right' },
  { label: 'Align top', command: 'align.top' },
  { label: 'Align middle', command: 'align.middle' },
  { label: 'Align bottom', command: 'align.bottom' },
  { label: 'Distribute horizontally', command: 'align.distributeH' },
  { label: 'Distribute vertically', command: 'align.distributeV' },
  { label: 'Align to slide', command: 'align.toSlide' },
  { label: '', sep: true },
  { label: 'Rotate right 90°', command: 'shape.rotate90R' },
  { label: 'Rotate left 90°', command: 'shape.rotate90L' },
  { label: 'Flip vertical', command: 'shape.flipV' },
  { label: 'Flip horizontal', command: 'shape.flipH' },
  { label: '', sep: true },
  { label: 'Selection pane', command: 'arrange.selectionPane' },
];

export const QuickStyles = ({ store, close }: { store: FrameStore; close?: () => void }) => {
  const theme = store.deck.masters[0]!.theme;
  return (
    <div className="fmtquick" role="listbox" aria-label="Shape styles">
      {Array.from({ length: QUICK_STYLE_COUNT }, (_, i) => {
        const q = quickStyle(i);
        return (
          <button key={i} title={q.label} aria-label={q.label} onClick={() => { close?.(); run(store, 'format.quickStyle', i); }}>
            <Swatch store={store} fill={q.fill} line={q.line ?? undefined} w={30} h={22} text="Abc" textColor={css(q.text, { theme })} />
          </button>
        );
      })}
    </div>
  );
};

const solid = (c: Color): Fill => ({ type: 'solid', color: c });
const firstShape = (s: FrameStore): Shape | undefined => {
  const out: Shape[] = [];
  const walk = (l: Shape[]) => { for (const x of l) { if (x.kind === 'group') walk(x.children); else out.push(x); } };
  walk(topSelected(s));
  return out[0];
};
const fillOf = (sh: Shape | undefined): Fill | undefined => (sh?.kind === 'shape' ? sh.fill : undefined);
const lineOf = (sh: Shape | undefined): Line | undefined => (sh?.kind === 'shape' || sh?.kind === 'picture' ? sh.line : undefined);

const WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];
const DASHES: [Dash, string][] = [['solid', 'Solid'], ['sysDot', 'Round dot'], ['sysDash', 'Square dot'], ['dash', 'Dash'], ['dashDot', 'Dash dot'], ['lgDash', 'Long dash'], ['lgDashDot', 'Long dash dot']];

export const OutlineMenu = ({ store: s, close }: { store: FrameStore; close: () => void }) => {
  const l = lineOf(firstShape(s));
  return (
    <div className="fmtoutline">
      <ColorGrid store={s} none="No outline" onPick={(c) => { close(); run(s, 'format.line', c ? { fill: solid(c) } : { fill: { type: 'none' } }); }} />
      <div className="sep" />
      <div className="cgtitle">Weight</div>
      <div className="fmtweights">
        {WEIGHTS.map((w) => (
          <button key={w} className={l?.width === w ? 'on' : ''} onClick={() => { close(); run(s, 'format.line', { width: w }); }}>
            <svg width="44" height="10" aria-hidden="true"><line x1="2" y1="5" x2="42" y2="5" stroke="currentColor" strokeWidth={Math.max(0.5, w * 1.333)} /></svg><span>{w} pt</span>
          </button>
        ))}
      </div>
      <div className="cgtitle">Dashes</div>
      <div className="fmtweights">
        {DASHES.map(([d, label]) => (
          <button key={d} className={(l?.dash ?? 'solid') === d ? 'on' : ''} onClick={() => { close(); run(s, 'format.line', { dash: d }); }}>
            <Swatch store={s} geom="line" w={44} h={10} line={{ fill: solid('#6f5d57'), width: 1.5, dash: d }} /><span>{label}</span>
          </button>
        ))}
      </div>
      <button className="tool wide" onClick={() => { close(); run(s, 'format.pane', 'fill'); }}>More outline options…</button>
    </div>
  );
};

const SHADOWS: [string, { kind: 'outer' | 'inner'; blur: number; dist: number; angle: number; alpha: number }][] = [
  ['Offset bottom right', { kind: 'outer', blur: 5, dist: 4, angle: 45, alpha: 0.4 }],
  ['Offset bottom', { kind: 'outer', blur: 5, dist: 4, angle: 90, alpha: 0.4 }],
  ['Offset center', { kind: 'outer', blur: 6, dist: 0, angle: 0, alpha: 0.4 }],
  ['Soft below', { kind: 'outer', blur: 18, dist: 8, angle: 90, alpha: 0.3 }],
  ['Inside', { kind: 'inner', blur: 8, dist: 3, angle: 45, alpha: 0.5 }],
];

export const EffectsMenu = ({ store: s, close }: { store: FrameStore; close: () => void }) => {
  const fx = firstShape(s)?.effects ?? {};
  return (
    <MenuList store={s} close={close} items={[
      { label: 'No shadow', on: !fx.shadow, run: () => run(s, 'format.effects', { shadow: undefined }) },
      ...SHADOWS.map(([label, v]): MenuEntry => ({ label: `Shadow: ${label.toLowerCase()}`, on: fx.shadow?.kind === v.kind && fx.shadow.angle === v.angle && fx.shadow.dist === v.dist && fx.shadow.blur === v.blur, run: () => run(s, 'format.effects', { shadow: { ...v, color: '#000000' } }) })),
      { label: '', sep: true },
      { label: fx.glow ? 'Remove glow' : 'Glow', on: !!fx.glow, run: () => run(s, 'format.effects', { glow: fx.glow ? undefined : { color: { theme: 'accent1', alpha: 0.6 }, radius: 8 } }) },
      { label: fx.softEdge ? 'Remove soft edges' : 'Soft edges', on: !!fx.softEdge, run: () => run(s, 'format.effects', { softEdge: fx.softEdge ? undefined : 6 }) },
      { label: fx.reflection ? 'Remove reflection' : 'Reflection', on: !!fx.reflection, run: () => run(s, 'format.effects', { reflection: fx.reflection ? undefined : { alpha: 0.5, size: 0.35, dist: 0, blur: 0.5 } }) },
      { label: '', sep: true },
      { label: 'More effect options…', run: () => run(s, 'format.pane', 'effects') },
    ]} />
  );
};

const Drawing = ({ store: s }: { store: FrameStore }) => {
  const sel = s.sel.length > 0;
  const sh = firstShape(s);
  const f = fillOf(sh);
  return (
    <>
      <QuickShapes store={s} />
      <Row>
        <CmdBtn store={s} id="format.moreShapes" icon={Shapes} label="More shapes" />
        <MenuButton store={s} label="Arrange" icon={BringToFront} items={ARRANGE} width={230} />
      </Row>
      <Pop label="Shape styles" icon={Sparkles} wide width={260} disabled={!sel}>{(close) => <QuickStyles store={s} close={close} />}</Pop>
      <div className="fmtcolors">
        <ColorButton store={s} label="Fill" icon={PaintBucket} value={f?.type === 'solid' ? f.color : undefined} none="No fill"
          onPick={(c) => run(s, 'format.fill', c ? solid(c) : { type: 'none' })} />
        <Pop label="Outline" title="Shape outline" icon={PenLine} width={260} disabled={!sel}>{(close) => <OutlineMenu store={s} close={close} />}</Pop>
        <Pop label="Effects" title="Shape effects" icon={Sparkles} width={240} disabled={!sel}>{(close) => <EffectsMenu store={s} close={close} />}</Pop>
      </div>
      <Btn store={s} id="format.pane" icon={Layers} label="Format pane" wide />
    </>
  );
};

// ---------- Editing ----------

const Editing = ({ store: s }: { store: FrameStore }) => (
  <Row>
    <Btn store={s} id="edit.find" icon={Search} label="Find" />
    <Btn store={s} id="edit.replace" icon={Replace} label="Replace" />
    <MenuButton store={s} label="Select" icon={MousePointer2} items={[
      { label: 'Select all', command: 'edit.selectAll' },
      { label: 'Selection pane', command: 'arrange.selectionPane' },
      { label: '', sep: true },
      { label: 'Replace fonts…', command: 'edit.replaceFonts' },
    ]} />
  </Row>
);

const wrap = (C: (p: { store: FrameStore }) => ReactNode) => (store: FrameStore) => <C store={store} />;

export const registerHome = (): void => {
  registerPanelSection({ tab: 'home', title: 'Clipboard', order: 10, render: wrap(Clipboard) });
  registerPanelSection({ tab: 'home', title: 'Slides', order: 20, render: wrap(Slides), when: (s) => s.view.mode !== 'master' });
  registerPanelSection({ tab: 'home', title: 'Font', order: 30, render: wrap(Font) });
  registerPanelSection({ tab: 'home', title: 'Paragraph', order: 40, render: wrap(Paragraph) });
  registerPanelSection({ tab: 'home', title: 'Drawing', order: 50, render: wrap(Drawing) });
  registerPanelSection({ tab: 'home', title: 'Editing', order: 60, render: wrap(Editing) });
};
