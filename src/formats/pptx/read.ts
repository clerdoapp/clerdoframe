// .pptx reader: ECMA-376 Part 1 PresentationML (19) over the package in Part 2.
// Robust by design: every part is read in its own try block, and what fails is skipped.
import {
  uid,
  type Background, type Comment, type CustomShow, type Deck, type DeckProps, type Layout, type Master, type ParaStyle, type Section, type Shape, type Slide,
  type TextBody, type TextStyles, type Theme,
} from '../../model/deck';
import { DEFAULT_THEME, defaultTextStyles, newDeck } from '../../model/defaults';
import { attr, boolAttr, deepText, find, findAll, kid, kids, numAttr, type XNode } from '../xml';
import { px, readColor, type ColorCtx } from './dml';
import { Keeper, type KeptMeta } from './kept';
import { MEDIA_TYPES, Package, relType, type Rel } from './opc';
import { readBackground, readTextBodyIn, readTree, resolveConnectors, textCtxFor, type FormatScheme, type PartCtx } from './read-shapes';
import { readTiming, readTransition } from './read-timing';
import { readListStyle } from './text';

export interface ReadResult { deck: Deck; warnings: string[] }

const SLOT_ORDER = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'] as const;

interface ThemeInfo { theme: Theme; scheme: Record<string, string>; fmt: FormatScheme }

const sysOrHex = (n: XNode | undefined): string | undefined => {
  const c = n?.children[0];
  if (!c) return undefined;
  if (c.name === 'srgbClr') return (attr(c, 'val') ?? '000000').toUpperCase();
  if (c.name === 'sysClr') return (attr(c, 'lastClr') ?? (attr(c, 'val') === 'window' ? 'FFFFFF' : '000000')).toUpperCase();
  return undefined;
};

const readThemePart = (pkg: Package, path: string | undefined): ThemeInfo => {
  const scheme: Record<string, string> = {};
  const fallback = DEFAULT_THEME;
  for (const k of SLOT_ORDER) scheme[k] = fallback.colors[k].replace('#', '');
  const fmt: FormatScheme = { fills: [], lines: [], effects: [], bgFills: [] };
  const x = path ? pkg.xml(path) : undefined;
  if (!x) return { theme: structuredClone(fallback), scheme, fmt };
  const el = kid(x.root, 'themeElements');
  const cs = kid(el, 'clrScheme');
  for (const k of SLOT_ORDER) { const v = sysOrHex(kid(cs, k)); if (v) scheme[k] = v; }
  const fs = kid(el, 'fontScheme');
  const major = attr(kid(kid(fs, 'majorFont'), 'latin'), 'typeface') || 'Calibri Light';
  const minor = attr(kid(kid(fs, 'minorFont'), 'latin'), 'typeface') || 'Calibri';
  const fm = kid(el, 'fmtScheme');
  fmt.fills = kid(fm, 'fillStyleLst')?.children ?? [];
  fmt.lines = kids(kid(fm, 'lnStyleLst'), 'ln');
  fmt.effects = kids(kid(fm, 'effectStyleLst'), 'effectStyle');
  fmt.bgFills = kid(fm, 'bgFillStyleLst')?.children ?? [];
  const theme: Theme = {
    name: attr(x.root, 'name') ?? 'Theme',
    colors: Object.fromEntries(SLOT_ORDER.map((k) => [k, `#${scheme[k]}`])) as Theme['colors'],
    colorsName: attr(cs, 'name') ?? 'Custom',
    fonts: { major, minor, name: attr(fs, 'name') ?? 'Custom' },
    ...(fm && x.src.length < 2_000_000 ? { formatXml: x.src.slice(fm.s, fm.e) } : {}),
  };
  return { theme, scheme, fmt };
};

/** Our theme stores what tx1/bg1/tx2/bg2 show, so the colour map is folded in. */
const applyClrMap = (t: ThemeInfo, clrMap: Record<string, string>): Theme => {
  const theme = structuredClone(t.theme);
  const m = (k: string, d: string) => `#${t.scheme[clrMap[k] ?? d] ?? t.scheme[d]}`;
  theme.colors.dk1 = m('tx1', 'dk1');
  theme.colors.lt1 = m('bg1', 'lt1');
  theme.colors.dk2 = m('tx2', 'dk2');
  theme.colors.lt2 = m('bg2', 'lt2');
  return theme;
};

const clrMapOf = (n: XNode | undefined): Record<string, string> => {
  const out: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
  if (n) for (const k of Object.keys(n.attrs)) out[k] = n.attrs[k]!;
  return out;
};

const PROPS: [string, keyof DeckProps][] = [['title', 'title'], ['subject', 'subject'], ['creator', 'author'], ['keywords', 'keywords'], ['description', 'description'], ['category', 'category'], ['created', 'created'], ['modified', 'modified'], ['lastModifiedBy', 'lastModifiedBy']];

const MIME_SNIFF = (b: Uint8Array): string | undefined => {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  return undefined;
};

export const readPptx = (data: Uint8Array): ReadResult => {
  const warnings: string[] = [];
  const warn = (m: string) => { if (warnings.length < 200 && !warnings.includes(m)) warnings.push(m); };
  const pkg = new Package(data);
  const rootRels = pkg.rels('');
  const mainRel = rootRels.find((r) => relType(r.type) === 'officeDocument');
  const presPath = mainRel?.target ?? 'ppt/presentation.xml';
  const pres = pkg.xml(presPath);
  if (!pres) throw new Error("This file isn't a presentation ClerdoFrame can read.");
  const P = pres.root;
  const keeper = new Keeper(pkg);
  const deck = newDeck();
  deck.masters = [];
  deck.slides = [];
  deck.props = {};

  const sz = kid(P, 'sldSz');
  if (sz) { deck.w = Math.max(10, px(numAttr(sz, 'cx') ?? 12192000)); deck.h = Math.max(10, px(numAttr(sz, 'cy') ?? 6858000)); }
  if (boolAttr(P, 'rtl')) deck.rtl = true;

  // ---------- Media ----------
  const mediaByPath = new Map<string, string>();
  const mediaFor = (path: string): string | undefined => {
    const name = pkg.name(path);
    if (!name) return undefined;
    const hit = mediaByPath.get(name);
    if (hit) return hit;
    const bytes = pkg.bytes(name)!;
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    let type = pkg.contentType(name) ?? MEDIA_TYPES[ext] ?? 'application/octet-stream';
    if (!/^(image|video|audio)\//.test(type)) type = MIME_SNIFF(bytes) ?? MEDIA_TYPES[ext] ?? type;
    const id = `m${mediaByPath.size + 1}_${ext}`;
    deck.media[id] = { id, type, name: name.slice(name.lastIndexOf('/') + 1), data: bytes };
    mediaByPath.set(name, id);
    return id;
  };

  // ---------- Slide list (ids assigned up front so links between slides resolve) ----------
  const presRels = pkg.rels(presPath);
  const slideIds = kids(kid(P, 'sldIdLst'), 'sldId');
  const slidePaths: { path: string; sid: string; id: string }[] = [];
  for (const s of slideIds) {
    const r = pkg.rel(presPath, attr(s, 'id'));
    if (r && !r.external && pkg.has(r.target)) slidePaths.push({ path: pkg.name(r.target)!, sid: attr(s, 'id') ?? '', id: uid('p') });
  }
  const slideIdByNum = new Map(slideIds.map((s) => [attr(s, 'id', ) ?? '', s]));
  void slideIdByNum;
  const slideFor = (path: string) => slidePaths.find((x) => x.path.toLowerCase() === path.toLowerCase())?.id;
  const sldIdToOurs = new Map<string, string>();
  slideIds.forEach((s) => { const r = pkg.rel(presPath, attr(s, 'id')); const id = r ? slideFor(r.target) : undefined; if (id) sldIdToOurs.set(attr(s, 'id', ) === undefined ? '' : (s.attrs.id ?? ''), id); });

  // ---------- Masters and layouts ----------
  const layoutByPath = new Map<string, { layout: Layout; master: Master; ctx: ColorCtx; fmt: FormatScheme; theme: ThemeInfo }>();
  const masterIds = kids(kid(P, 'sldMasterIdLst'), 'sldMasterId');
  const masterPaths = masterIds.map((m) => pkg.rel(presPath, attr(m, 'id'))).filter((r): r is Rel => !!r && !r.external).map((r) => r.target);
  if (!masterPaths.length) for (const r of presRels) if (relType(r.type) === 'slideMaster') masterPaths.push(r.target);

  const partCtx = (part: string, src: string, color: ColorCtx, fmt: FormatScheme, master: boolean): PartCtx => ({
    pkg, part, color, fmt, mediaFor, slideFor, ids: new Map(), src, master, warn,
  });

  const keepXml = (keep: Record<string, string>, key: string, node: XNode | undefined, src: string, part: string) => {
    if (!node || node.e - node.s > 1_000_000) return;
    const raw = src.slice(node.s, node.e);
    keep[key] = raw;
    const rels = new Set<string>();
    for (const m of raw.matchAll(/\br:(?:id|embed|link)="([^"]*)"/g)) rels.add(m[1]!);
    if (rels.size) keep[`${key}.rels`] = JSON.stringify(keeper.keepRels(pkg.rels(part).filter((r) => rels.has(r.id))));
  };

  const readTextStyles = (n: XNode | undefined, ctx: PartCtx): TextStyles => {
    const d = defaultTextStyles();
    if (!n) return d;
    const tc = textCtxFor(ctx);
    const lv = (tag: string, dflt: ParaStyle[]): ParaStyle[] => {
      const list = readListStyle(kid(n, tag), tc);
      return list.length ? Array.from({ length: 9 }, (_, i) => list[i] ?? dflt[i] ?? { level: i }) : dflt;
    };
    return { title: lv('titleStyle', d.title), body: lv('bodyStyle', d.body), other: lv('otherStyle', d.other) };
  };

  for (const mp of masterPaths) {
    try {
      const mx = pkg.xml(mp);
      if (!mx) continue;
      const themeRel = pkg.relsOfType(mp, 'theme')[0];
      const ti = readThemePart(pkg, themeRel?.target);
      const clrMap = clrMapOf(kid(mx.root, 'clrMap'));
      const color: ColorCtx = { scheme: ti.scheme, clrMap };
      const ctx = partCtx(mp, mx.src, color, ti.fmt, true);
      const cSld = kid(mx.root, 'cSld');
      const shapes = readTree(kid(cSld, 'spTree') ?? { name: '', attrs: {}, children: [], text: '', qn: '', s: 0, e: 0 }, ctx);
      resolveConnectors(shapes, ctx.ids);
      const bg = readBackground(cSld, ctx);
      const master: Master = {
        id: uid('m'),
        name: attr(cSld, 'name') || ti.theme.name,
        theme: applyClrMap(ti, clrMap),
        background: { fill: bg ?? { type: 'solid', color: { theme: 'bg1' } } },
        shapes,
        layouts: [],
        textStyles: readTextStyles(kid(mx.root, 'txStyles'), ctx),
      };
      const keep: Record<string, string> = {};
      keepXml(keep, 'hf', kid(mx.root, 'hf'), mx.src, mp);
      if (themeRel && pkg.xml(themeRel.target)) {
        const tx = pkg.xml(themeRel.target)!;
        if (tx.src.length < 2_000_000) keep.themeXml = tx.src;
        const tm = keeper; void tm;
      }
      if (Object.keys(keep).length) master.keep = keep;
      // Layouts in the order the master lists them.
      const lids = kids(kid(mx.root, 'sldLayoutIdLst'), 'sldLayoutId');
      const lpaths = lids.map((l) => pkg.rel(mp, attr(l, 'id'))).filter((r): r is Rel => !!r && !r.external).map((r) => r.target);
      for (const r of pkg.relsOfType(mp, 'slideLayout')) if (!lpaths.includes(r.target)) lpaths.push(r.target);
      for (const lp of lpaths) {
        try {
          const lx = pkg.xml(lp);
          if (!lx) continue;
          const over = kid(kid(lx.root, 'clrMapOvr'), 'overrideClrMapping');
          const lcolor: ColorCtx = over ? { scheme: ti.scheme, clrMap: clrMapOf(over) } : color;
          const lctx = partCtx(lp, lx.src, lcolor, ti.fmt, true);
          const lcs = kid(lx.root, 'cSld');
          const lshapes = readTree(kid(lcs, 'spTree') ?? { name: '', attrs: {}, children: [], text: '', qn: '', s: 0, e: 0 }, lctx);
          resolveConnectors(lshapes, lctx.ids);
          const lbg = readBackground(lcs, lctx);
          const layout: Layout = {
            id: uid('l'), name: attr(lcs, 'name') || 'Layout', type: attr(lx.root, 'type') ?? 'cust', shapes: lshapes,
            ...(lbg ? { background: { fill: lbg } } : {}),
          };
          if (attr(lx.root, 'showMasterSp') === '0') layout.hideMasterGraphics = true;
          master.layouts.push(layout);
          layoutByPath.set(pkg.name(lp)!, { layout, master, ctx: lcolor, fmt: ti.fmt, theme: ti });
        } catch (e) { warn(`A layout could not be read (${lp}).`); void e; }
      }
      if (!master.layouts.length) {
        const fallback: Layout = { id: uid('l'), name: 'Blank', type: 'blank', shapes: [] };
        master.layouts.push(fallback);
      }
      deck.masters.push(master);
    } catch { warn('A slide master could not be read.'); }
  }
  if (!deck.masters.length) deck.masters = newDeck(deck.w, deck.h).masters;

  // ---------- Comment authors ----------
  const authors = new Map<string, { name: string; initials?: string }>();
  for (const r of presRels) {
    const t = relType(r.type);
    if (t === 'commentAuthors') {
      for (const a of kids(pkg.xml(r.target)?.root, 'cmAuthor')) authors.set(attr(a, 'id') ?? '', { name: attr(a, 'name') ?? 'Author', ...(attr(a, 'initials') ? { initials: attr(a, 'initials')! } : {}) });
    } else if (t === 'authors') {
      for (const a of kids(pkg.xml(r.target)?.root, 'author')) authors.set(attr(a, 'id') ?? '', { name: attr(a, 'name') ?? 'Author', ...(attr(a, 'initials') ? { initials: attr(a, 'initials')! } : {}) });
    }
  }

  // ---------- Slides ----------
  for (const sp of slidePaths) {
    try {
      const sx = pkg.xml(sp.path);
      if (!sx) continue;
      const lrel = pkg.relsOfType(sp.path, 'slideLayout')[0];
      const li = lrel ? layoutByPath.get(pkg.name(lrel.target) ?? '') : undefined;
      const master = li?.master ?? deck.masters[0]!;
      const layout = li?.layout ?? master.layouts[0]!;
      const over = kid(kid(sx.root, 'clrMapOvr'), 'overrideClrMapping');
      const color: ColorCtx = over && li ? { scheme: li.theme.scheme, clrMap: clrMapOf(over) } : li?.ctx ?? { scheme: Object.fromEntries(Object.entries(master.theme.colors).map(([k, v]) => [k, v.replace('#', '')])), clrMap: clrMapOf(undefined) };
      const ctx = partCtx(sp.path, sx.src, color, li?.fmt ?? { fills: [], lines: [], effects: [], bgFills: [] }, false);
      const cSld = kid(sx.root, 'cSld');
      const shapes = readTree(kid(cSld, 'spTree') ?? { name: '', attrs: {}, children: [], text: '', qn: '', s: 0, e: 0 }, ctx);
      resolveConnectors(shapes, ctx.ids);
      // Placeholders with no size of their own take the layout's box.
      for (const s of shapes) if (s.ph && !s.w && !s.h) fillPhBox(s, layout, master);
      const slide: Slide = { id: sp.id, layout: layout.id, shapes, notes: { paras: [{ runs: [] }] }, animations: [] };
      const name = attr(cSld, 'name');
      if (name) slide.name = name;
      if (attr(sx.root, 'show') === '0') slide.hidden = true;
      const bg = readBackground(cSld, ctx);
      const hide = attr(sx.root, 'showMasterSp') === '0';
      if (bg || hide) slide.background = { fill: bg ?? layout.background?.fill ?? master.background.fill, ...(hide ? { hideMasterGraphics: true } : {}) } as Background;
      try { const t = readTransition(sx.root); if (t) slide.transition = t; } catch { warn('A slide transition could not be read.'); }
      try {
        slide.animations = readTiming(sx.root, { shapeFor: (spid) => ctx.ids.get(spid), W: deck.w, H: deck.h });
        const tm = kid(sx.root, 'timing');
        if (tm && !slide.animations.length && findAll(tm, 'par').length) {
          slide.keep = { ...(slide.keep ?? {}) };
          keepXml(slide.keep, 'timing', tm, sx.src, sp.path);
        }
      } catch { warn('Animations on a slide could not be read.'); }
      // Notes
      const nrel = pkg.relsOfType(sp.path, 'notesSlide')[0];
      if (nrel) {
        try {
          const nx = pkg.xml(nrel.target);
          const body = nx ? findAll(nx.root, 'sp').find((s) => attr(find(s, 'ph'), 'type') === 'body') : undefined;
          const nctx = partCtx(nrel.target, nx?.src ?? '', color, ctx.fmt, false);
          const tb = readTextBodyIn(kid(body, 'txBody'), nctx);
          if (tb) slide.notes = { paras: tb.paras };
        } catch { warn('Speaker notes could not be read.'); }
      }
      // Comments: legacy part and the modern threaded part.
      const comments: Comment[] = [];
      for (const r of pkg.rels(sp.path)) {
        const t = relType(r.type);
        if (t === 'comments' && !r.external) {
          for (const cm of kids(pkg.xml(r.target)?.root, 'cm')) {
            const a = authors.get(attr(cm, 'authorId') ?? '');
            const pos = kid(cm, 'pos');
            comments.push({
              id: uid('c'), author: a?.name ?? 'Author', ...(a?.initials ? { initials: a.initials } : {}), at: attr(cm, 'dt') ?? new Date(0).toISOString(),
              text: kid(cm, 'text')?.text ?? '', ...(pos ? { x: ((numAttr(pos, 'x') ?? 0) * 96) / 576, y: ((numAttr(pos, 'y') ?? 0) * 96) / 576 } : {}),
            });
          }
        } else if (t === 'comments' || /\/comments$/.test(r.type) || /modernComment/i.test(r.target)) {
          if (r.external) continue;
          const cx = pkg.xml(r.target);
          if (cx?.root.name !== 'cmLst') continue;
          for (const cm of kids(cx.root, 'cm')) {
            if (comments.some((x) => x.text === deepText(kid(cm, 'txBody') ?? cm) && x.at === attr(cm, 'created'))) continue;
            const a = authors.get(attr(cm, 'authorId') ?? '');
            const text = (n: XNode | undefined) => findAll(kid(n, 'txBody'), 'p').map((p) => findAll(p, 't').map((t) => t.text).join('')).join('\n');
            const c: Comment = { id: uid('c'), author: a?.name ?? 'Author', ...(a?.initials ? { initials: a.initials } : {}), at: attr(cm, 'created') ?? new Date(0).toISOString(), text: text(cm) };
            if (attr(cm, 'status') === 'resolved') c.resolved = true;
            const pos = find(cm, 'pos');
            if (pos) { c.x = px(numAttr(pos, 'x')); c.y = px(numAttr(pos, 'y')); }
            const replies = kids(kid(cm, 'replyLst'), 'reply').map((rp) => { const ra = authors.get(attr(rp, 'authorId') ?? ''); return { id: uid('c'), author: ra?.name ?? 'Author', at: attr(rp, 'created') ?? '', text: text(rp) }; });
            if (replies.length) c.replies = replies;
            comments.push(c);
          }
        }
      }
      if (comments.length) slide.comments = comments;
      // Unknown slide-level parts we can carry: tags, custom data.
      const keepRels = pkg.rels(sp.path).filter((r) => ['tags', 'customXml', 'customData'].includes(relType(r.type)));
      if (keepRels.length) { slide.keep = { ...(slide.keep ?? {}), rels: JSON.stringify(keeper.keepRels(keepRels)) }; }
      deck.slides.push(slide);
    } catch (e) {
      warn(`A slide could not be read: ${e instanceof Error ? e.message : ''}`);
    }
  }

  // ---------- Sections (p14:sectionLst in presentation extLst) ----------
  const sec = findAll(kid(P, 'extLst'), 'sectionLst')[0];
  if (sec) {
    const sections: Section[] = [];
    for (const s of kids(sec, 'section')) {
      const ids = kids(kid(s, 'sldIdLst'), 'sldId').map((x) => sldIdToOurs.get(attr(x, 'id') ?? '')).filter((x): x is string => !!x);
      if (ids[0]) sections.push({ id: uid('x'), name: attr(s, 'name') ?? 'Section', first: ids[0] });
    }
    // Sections are stored by first slide; keep them in slide order.
    const order = new Map(deck.slides.map((s, i) => [s.id, i]));
    deck.sections = sections.sort((a, b) => (order.get(a.first) ?? 0) - (order.get(b.first) ?? 0));
  }
  // ---------- Custom shows ----------
  const shows: CustomShow[] = [];
  for (const cs of kids(kid(P, 'custShowLst'), 'custShow')) {
    const ids = kids(kid(cs, 'sldLst'), 'sld').map((s) => { const r = pkg.rel(presPath, attr(s, 'id')); return r ? slideFor(r.target) : undefined; }).filter((x): x is string => !!x);
    shows.push({ id: attr(cs, 'id') ?? uid('cs'), name: attr(cs, 'name') ?? 'Custom show', slides: ids });
  }
  deck.customShows = shows;

  // ---------- Presentation properties (show settings) ----------
  const ppRel = presRels.find((r) => relType(r.type) === 'presProps');
  const pp = ppRel ? pkg.xml(ppRel.target)?.root : undefined;
  const show = kid(pp, 'showPr');
  if (show) {
    deck.show = { type: kid(show, 'kiosk') ? 'kiosk' : kid(show, 'browse') ? 'browsed' : 'presenter' };
    if (boolAttr(show, 'loop')) deck.show.loop = true;
    if (boolAttr(show, 'showNarration') === false && attr(show, 'showNarration') !== undefined) deck.show.noNarration = true;
    if (attr(show, 'showAnimation') === '0') deck.show.noAnimation = true;
    if (attr(show, 'useTimings') === '0') deck.show.useTimings = false; else deck.show.useTimings = true;
    const rng = kid(show, 'sldRg');
    if (rng) deck.show.range = { from: numAttr(rng, 'st') ?? 1, to: numAttr(rng, 'end') ?? deck.slides.length };
    const cs = kid(show, 'custShow');
    if (cs) { const id = attr(cs, 'id'); if (id) deck.show.customShow = id; }
    const pen = kid(show, 'penClr');
    if (pen) { const c = readColor(pen, { scheme: {}, clrMap: {} }); if (c !== undefined) deck.show.penColor = c; }
  }

  // ---------- Document properties ----------
  const coreRel = rootRels.find((r) => relType(r.type) === 'core-properties');
  const core = pkg.xml(coreRel?.target ?? 'docProps/core.xml')?.root;
  for (const [tag, key] of PROPS) { const v = kid(core, tag)?.text.trim(); if (v) deck.props[key] = v.slice(0, 4000); }
  const appRel = rootRels.find((r) => relType(r.type) === 'extended-properties');
  const app = pkg.xml(appRel?.target ?? 'docProps/app.xml')?.root;
  const company = kid(app, 'Company')?.text.trim();
  if (company) deck.props.company = company.slice(0, 4000);
  const status = kid(core, 'contentStatus')?.text.trim();
  if (status === 'Final') deck.final = true;
  // Mark as final also uses a custom property.
  const custRel = rootRels.find((r) => relType(r.type) === 'custom-properties');
  if (custRel) {
    const cust = pkg.xml(custRel.target)?.root;
    if (kids(cust, 'property').some((p) => attr(p, 'name') === '_MarkAsFinal' && /true|1/i.test(deepText(p)))) deck.final = true;
    keeper.keep(custRel.target);
  }

  // ---------- Embedded fonts ----------
  const fonts = kids(kid(P, 'embeddedFontLst'), 'embeddedFont').map((f) => attr(kid(f, 'font'), 'typeface')).filter((x): x is string => !!x);
  if (fonts.length) deck.embeddedFonts = fonts;

  // ---------- Header / footer defaults from the first master ----------
  const firstMaster = masterPaths[0] ? pkg.xml(masterPaths[0]) : undefined;
  const hf = kid(firstMaster?.root, 'hf');
  if (hf) {
    deck.headerFooter = {
      ...(attr(hf, 'sldNum') !== '0' ? { slideNumber: true } : {}),
      ...(attr(hf, 'ftr') !== '0' ? { footer: true } : {}),
      ...(attr(hf, 'dt') !== '0' ? { dateTime: true } : {}),
    };
  }

  // ---------- Parts we keep as they are ----------
  const meta: KeptMeta = keeper.meta;
  const presKeep = presRels.filter((r) => ['tags', 'customXml', 'vbaProject'].includes(relType(r.type)) || /customXml/i.test(r.type));
  meta.pres = keeper.keepRels(presKeep.filter((r) => relType(r.type) !== 'vbaProject'));
  meta.root = keeper.keepRels(rootRels.filter((r) => ['custom-properties', 'thumbnail'].includes(relType(r.type))));
  const nmRel = presRels.find((r) => relType(r.type) === 'notesMaster');
  if (nmRel) { const nm = pkg.xml(nmRel.target); if (nm && nm.src.length < 2_000_000) deck.notesMaster = { keep: { xml: nm.src } }; }
  keeper.into(deck);

  if (!deck.slides.length) {
    // An empty presentation still opens with one slide.
    const m = deck.masters[0]!;
    const l = m.layouts.find((x) => x.type === 'title') ?? m.layouts[0]!;
    deck.slides.push({ id: uid('p'), layout: l.id, shapes: [], notes: { paras: [{ runs: [] }] }, animations: [] });
  }
  return { deck, warnings };
};

const fillPhBox = (s: Shape, layout: Layout, master: Master): void => {
  const t = s.ph!;
  const mp = (x: string) => (x === 'ctrTitle' ? 'title' : x === 'subTitle' || x === 'obj' ? 'body' : x);
  const src = layout.shapes.find((x) => x.ph && t.idx !== undefined && x.ph.idx === t.idx)
    ?? layout.shapes.find((x) => x.ph && mp(x.ph.type) === mp(t.type))
    ?? master.shapes.find((x) => x.ph && mp(x.ph.type) === mp(t.type));
  if (src) { s.x = src.x; s.y = src.y; s.w = src.w; s.h = src.h; }
};

export type { TextBody };
