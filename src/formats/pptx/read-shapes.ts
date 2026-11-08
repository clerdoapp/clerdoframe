// Shape trees (p:spTree) of slides, layouts and masters: ECMA-376 Part 1, 19.3 and 20.1.
import {
  uid,
  type AutoShape, type Chart, type Color, type Diagram, type DiagramNode, type Effects, type Fill, type Group, type Hyperlink, type Line,
  type Media, type Ole, type Picture, type Placeholder, type PlaceholderType, type Shape, type Table, type TableCell, type TextBody, type ThemeColorName,
} from '../../model/deck';
import { attr, boolAttr, find, findAll, kid, kids, numAttr, rid, type XNode } from '../xml';
import { readChartPart, readDataLink } from './chart';
import { colorNode, px, readColor, readCrop, readEffects, readFill, readLine, type ColorCtx, type FillCtx } from './dml';
import { readCustGeom, readPresetMark } from './geom';
import { preset } from '../../render/geometry';
import type { Package } from './opc';
import { readTextBody, type TextCtx } from './text';

/** Theme format scheme (fill, line and effect style lists) used by style references. */
export interface FormatScheme { fills: XNode[]; lines: XNode[]; effects: XNode[]; bgFills: XNode[] }

export interface PartCtx {
  pkg: Package;
  part: string;
  color: ColorCtx;
  fmt: FormatScheme;
  /** Media id for a package path (adds to deck.media once). */
  mediaFor: (path: string) => string | undefined;
  /** Slide id for a package path (in-deck links). */
  slideFor: (path: string) => string | undefined;
  /** Original shape id (cNvPr id) -> our id, per part. */
  ids: Map<string, string>;
  /** Raw source of the part, for keeping XML. */
  src: string;
  /** Layout and master placeholders keep list styles as levels. */
  master: boolean;
  warn: (msg: string) => void;
}

const SAFE = /^(https:|mailto:)/i;
const ACTIONS: Record<string, Hyperlink['action']> = {
  nextslide: 'next', previousslide: 'prev', firstslide: 'first', lastslide: 'last', endshow: 'end',
};

export const readLink = (n: XNode | undefined, c: PartCtx): Hyperlink | undefined => {
  if (!n) return undefined;
  const tooltip = attr(n, 'tooltip');
  const action = attr(n, 'action') ?? '';
  const jump = /jump=([a-z]+)/i.exec(action)?.[1]?.toLowerCase();
  const tip = tooltip ? { tooltip } : {};
  if (jump && ACTIONS[jump]) return { action: ACTIONS[jump], ...tip };
  const rel = c.pkg.rel(c.part, rid(n));
  if (!rel) return undefined;
  if (rel.external) return SAFE.test(rel.target) ? { url: rel.target, ...tip } : undefined;
  if (action.includes('hlinksldjump') || /slides\/slide\d+\.xml$/i.test(rel.target)) {
    const slide = c.slideFor(rel.target);
    return slide ? { action: 'slide', slide, ...tip } : undefined;
  }
  return undefined;
};

const fillCtx = (c: PartCtx, groupFill?: Fill, phClr?: Color): FillCtx => ({
  ...c.color,
  ...(phClr !== undefined ? { phClr } : {}),
  media: (rid) => { const r = c.pkg.rel(c.part, rid); return r && !r.external ? c.mediaFor(r.target) : undefined; },
  ...(groupFill ? { groupFill } : {}),
});

const textCtx = (c: PartCtx, phClr?: Color): TextCtx => ({ ...fillCtx(c, undefined, phClr), link: (n) => readLink(n, c) });

interface Xfrm { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean; ch?: { x: number; y: number; w: number; h: number } }

const readXfrm = (x: XNode | undefined): Xfrm | undefined => {
  if (!x) return undefined;
  const off = kid(x, 'off'), ext = kid(x, 'ext');
  const out: Xfrm = { x: px(numAttr(off, 'x')), y: px(numAttr(off, 'y')), w: px(numAttr(ext, 'cx')), h: px(numAttr(ext, 'cy')) };
  const rot = numAttr(x, 'rot');
  if (rot) out.rot = Math.round(((rot / 60000) % 360) * 100) / 100;
  if (boolAttr(x, 'flipH')) out.flipH = true;
  if (boolAttr(x, 'flipV')) out.flipV = true;
  const cho = kid(x, 'chOff'), che = kid(x, 'chExt');
  if (cho || che) out.ch = { x: px(numAttr(cho, 'x')), y: px(numAttr(cho, 'y')), w: px(numAttr(che, 'cx')), h: px(numAttr(che, 'cy')) };
  return out;
};

const base = (nv: XNode | undefined, xf: Xfrm | undefined, c: PartCtx) => {
  const cNvPr = kid(nv, 'cNvPr');
  const id = uid('s');
  const orig = attr(cNvPr, 'id');
  if (orig) c.ids.set(orig, id);
  const out: { id: string; name: string; x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean; hidden?: boolean; alt?: string; decorative?: boolean; ph?: Placeholder; link?: Hyperlink; locked?: boolean } = {
    id, name: attr(cNvPr, 'name') ?? '', x: xf?.x ?? 0, y: xf?.y ?? 0, w: xf?.w ?? 0, h: xf?.h ?? 0,
  };
  if (xf?.rot) out.rot = xf.rot;
  if (xf?.flipH) out.flipH = true;
  if (xf?.flipV) out.flipV = true;
  if (boolAttr(cNvPr, 'hidden')) out.hidden = true;
  const descr = attr(cNvPr, 'descr') ?? attr(cNvPr, 'title');
  if (descr) out.alt = descr;
  if (findAll(cNvPr, 'decorative').some((d) => attr(d, 'val') === '1')) out.decorative = true;
  const link = readLink(kid(cNvPr, 'hlinkClick'), c);
  if (link) out.link = link;
  const nvPr = nv?.children.find((n) => n.name === 'nvPr');
  const ph = kid(nvPr, 'ph');
  if (ph) {
    const type = (attr(ph, 'type') ?? 'obj') as PlaceholderType;
    const idx = numAttr(ph, 'idx');
    out.ph = { type, ...(idx !== undefined ? { idx } : {}) };
  }
  return out;
};

/** Resolves a style matrix reference (fillRef / lnRef / effectRef idx) against the theme's format scheme. */
const styleColor = (ref: XNode | undefined, c: PartCtx): Color | undefined => (ref && colorNode(ref) ? readColor(ref, c.color) : undefined);

const styleFill = (ref: XNode | undefined, c: PartCtx): Fill | undefined => {
  const idx = numAttr(ref, 'idx') ?? 0;
  if (!ref || idx === 0) return undefined;
  const list = idx >= 1001 ? c.fmt.bgFills : c.fmt.fills;
  const node = list[(idx >= 1001 ? idx - 1001 : idx - 1)] ?? list.at(-1);
  if (!node) return undefined;
  const ph = styleColor(ref, c);
  const f = readFill({ name: 'x', attrs: {}, children: [node], text: '', qn: '', s: 0, e: 0 }, fillCtx(c, undefined, ph));
  return f;
};

const styleLine = (ref: XNode | undefined, c: PartCtx): Line | undefined => {
  const idx = numAttr(ref, 'idx') ?? 0;
  if (!ref || idx === 0) return undefined;
  const node = c.fmt.lines[idx - 1] ?? c.fmt.lines.at(-1);
  if (!node) return undefined;
  return readLine(node, fillCtx(c, undefined, styleColor(ref, c)));
};

const styleEffects = (ref: XNode | undefined, c: PartCtx): Effects | undefined => {
  const idx = numAttr(ref, 'idx') ?? 0;
  if (!ref || idx === 0) return undefined;
  const node = c.fmt.effects[idx - 1];
  return node ? readEffects(kid(node, 'effectLst'), { ...c.color, ...(styleColor(ref, c) !== undefined ? { phClr: styleColor(ref, c)! } : {}) }) : undefined;
};

const themeName = (col: Color | undefined): ThemeColorName | undefined => (col && typeof col === 'object' && 'theme' in col ? col.theme : undefined);

const readSp = (n: XNode, c: PartCtx, groupFill?: Fill): AutoShape => {
  const nv = kid(n, 'nvSpPr') ?? kid(n, 'nvCxnSpPr');
  const spPr = kid(n, 'spPr');
  const xf = readXfrm(kid(spPr, 'xfrm'));
  const s: AutoShape = { ...base(nv, xf, c), kind: 'shape', geom: 'rect' };
  if (!xf && !s.ph) { s.w = 0; s.h = 0; }
  const prst = kid(spPr, 'prstGeom'), cust = kid(spPr, 'custGeom');
  if (prst) {
    s.geom = attr(prst, 'prst') ?? 'rect';
    const adj: Record<string, number> = {};
    for (const g of kids(kid(prst, 'avLst'), 'gd')) {
      const m = /^val\s+(-?\d+(?:\.\d+)?)/.exec(attr(g, 'fmla') ?? '');
      const name = attr(g, 'name');
      if (m && name) adj[name] = Number(m[1]);
    }
    if (Object.keys(adj).length) s.adj = adj;
  } else if (cust) {
    const mark = readPresetMark(cust);
    if (mark && preset(mark.name)) { s.geom = mark.name; if (Object.keys(mark.adj).length) s.adj = mark.adj; }
    else {
      const paths = readCustGeom(cust, Math.max(1, s.w * 9525), Math.max(1, s.h * 9525));
      if (paths.length) { s.geom = 'custom'; s.path = paths.map(({ d, w, h }) => ({ d, w, h })); }
    }
  } else if (!s.ph) s.geom = 'rect';
  // Theme style references fill in what spPr leaves out.
  const style = kid(n, 'style');
  const fillRef = kid(style, 'fillRef'), lnRef = kid(style, 'lnRef'), fxRef = kid(style, 'effectRef'), fontRef = kid(style, 'fontRef');
  const fc = fillCtx(c, groupFill);
  const own = readFill(spPr, fc);
  const refFill = own ? undefined : styleFill(fillRef, c);
  const fill = own ?? refFill;
  if (fill) s.fill = fill;
  const lnNode = kid(spPr, 'ln');
  const refLine = styleLine(lnRef, c);
  const line = readLine(lnNode, fc, refLine);
  if (line) s.line = line;
  const fx = readEffects(kid(spPr, 'effectLst'), c.color) ?? (kid(spPr, 'effectLst') ? undefined : styleEffects(fxRef, c));
  if (fx) s.effects = fx;
  if (style) {
    const ref: NonNullable<AutoShape['styleRef']> = {};
    const f = themeName(styleColor(fillRef, c)), l = themeName(styleColor(lnRef, c)), t = themeName(styleColor(fontRef, c));
    if (f) ref.fill = f;
    if (l) ref.line = l;
    if (t) ref.font = t;
    if (Object.keys(ref).length) s.styleRef = ref;
  }
  const fontColor = styleColor(fontRef, c);
  const tb = kid(n, 'txBody');
  if (tb) {
    const body = readTextBody(tb, textCtx(c), c.master && !!s.ph);
    if (body) {
      if (fontColor !== undefined && !s.ph) {
        for (const p of body.paras) p.style = { ...(p.style ?? {}), defRun: { color: fontColor, ...(p.style?.defRun ?? {}) } };
      }
      const fontIdx = attr(fontRef, 'idx');
      if (fontIdx === 'major' && !s.ph) for (const p of body.paras) p.style = { ...(p.style ?? {}), defRun: { font: '+mj-lt', ...(p.style?.defRun ?? {}) } };
      s.text = body;
    }
  }
  if (boolAttr(kid(kid(nv, 'cNvSpPr') ?? undefined, 'spLocks'), 'noGrp') && s.ph) { /* placeholder locks are normal */ }
  const cNvSpPr = kid(nv, 'cNvSpPr');
  if (boolAttr(cNvSpPr, 'txBox')) {
    s.textbox = true;
    if (!s.fill) s.fill = { type: 'none' };
  }
  if (n.name === 'cxnSp') {
    const cx = kid(nv, 'cNvCxnSpPr');
    const st = kid(cx, 'stCxn'), en = kid(cx, 'endCxn');
    const conn: NonNullable<AutoShape['conn']> = {};
    if (st) conn.start = { shape: `@${attr(st, 'id') ?? ''}`, site: numAttr(st, 'idx') ?? 0 };
    if (en) conn.end = { shape: `@${attr(en, 'id') ?? ''}`, site: numAttr(en, 'idx') ?? 0 };
    if (conn.start || conn.end) s.conn = conn;
    if (!s.fill) s.fill = { type: 'none' };
  }
  return s;
};

const readPic = (n: XNode, c: PartCtx, extraMediaRel?: string): Picture | Media | Ole => {
  const nv = kid(n, 'nvPicPr');
  const spPr = kid(n, 'spPr');
  const xf = readXfrm(kid(spPr, 'xfrm'));
  const b = base(nv, xf, c);
  const blipFill = kid(n, 'blipFill');
  const blip = kid(blipFill, 'blip');
  const rel = c.pkg.rel(c.part, attr(blip, 'embed') ?? attr(blip, 'link'));
  const media = rel && !rel.external ? c.mediaFor(rel.target) ?? '' : '';
  // Video / audio
  const nvPr = kid(nv, 'nvPr');
  const vf = kid(nvPr, 'videoFile'), af = kid(nvPr, 'audioFile');
  const p14 = findAll(kid(nvPr, 'extLst'), 'media')[0];
  if (vf || af || p14 || extraMediaRel) {
    const mrel = c.pkg.rel(c.part, attr(p14, 'embed')) ?? c.pkg.rel(c.part, attr(vf ?? af, 'link')) ?? c.pkg.rel(c.part, extraMediaRel);
    const mid = mrel && !mrel.external ? c.mediaFor(mrel.target) : undefined;
    if (mid) {
      const m: Media = { ...b, kind: 'media', mediaType: af || /audio/.test(c.pkg.contentType(mrel!.target) ?? '') ? 'audio' : 'video', media: mid, ...(media ? { poster: media } : {}) };
      const trim = kid(p14, 'trim');
      if (trim) { const st = numAttr(trim, 'st') ?? 0, en = numAttr(trim, 'end') ?? 0; if (st || en) m.trim = { start: st / 1000, end: en / 1000 }; }
      const fade = kid(p14, 'fade');
      if (fade) { const i = numAttr(fade, 'in'), o = numAttr(fade, 'out'); if (i) m.fadeIn = i / 1000; if (o) m.fadeOut = o / 1000; }
      return m;
    }
  }
  const p: Picture = { ...b, kind: 'picture', media };
  const crop = readCrop(kid(blipFill, 'srcRect'));
  if (crop) p.crop = crop;
  const prst = attr(kid(spPr, 'prstGeom'), 'prst');
  if (prst && prst !== 'rect') p.geom = prst;
  const picMark = prst ? null : readPresetMark(kid(spPr, 'custGeom'));
  if (picMark && preset(picMark.name)) p.geom = picMark.name;
  const line = readLine(kid(spPr, 'ln'), fillCtx(c));
  if (line) p.line = line;
  const fx = readEffects(kid(spPr, 'effectLst'), c.color);
  if (fx) p.effects = fx;
  const adjust: NonNullable<Picture['adjust']> = {};
  const amf = numAttr(kid(blip, 'alphaModFix'), 'amt');
  if (amf !== undefined && amf < 100000) adjust.transparency = Math.round((1 - amf / 100000) * 100);
  if (kid(blip, 'grayscl')) adjust.grayscale = true;
  const lum = kid(blip, 'lum');
  if (lum) { const br = numAttr(lum, 'bright'), ct = numAttr(lum, 'contrast'); if (br) adjust.brightness = br / 1000; if (ct) adjust.contrast = ct / 1000; }
  for (const e of findAll(blip, 'imgEffect')) {
    const bc = kid(e, 'brightnessContrast');
    if (bc) { const br = numAttr(bc, 'bright'), ct = numAttr(bc, 'contrast'); if (br) adjust.brightness = br / 1000; if (ct) adjust.contrast = ct / 1000; }
    const sat = numAttr(kid(e, 'saturation'), 'sat');
    if (sat !== undefined) adjust.saturation = sat / 1000;
    const tmp = numAttr(kid(e, 'colorTemperature'), 'colorTemp');
    if (tmp !== undefined) adjust.temperature = Math.round((tmp - 6500) / 10);
    const blur = numAttr(kid(e, 'artisticBlur'), 'radius');
    if (blur !== undefined) adjust.blur = blur;
  }
  const duo = kid(blip, 'duotone');
  if (duo) {
    const cols = duo.children.filter((x) => colorNode({ ...duo, children: [x] }));
    const first = cols[0], last = cols.at(-1);
    // A duotone that ends on white is a light recolor: the colour is its dark end.
    const lastHex = last && last.name === 'srgbClr' && !last.children.length ? (attr(last, 'val') ?? '').toUpperCase() : '';
    const light = cols.length === 2 && (lastHex === 'FFFFFF' || (last?.name === 'prstClr' && attr(last, 'val') === 'white'));
    const pick = light ? first : last;
    if (pick) { const col = readColor({ ...duo, children: [pick] }, c.color); if (col !== undefined) { adjust.recolor = col; if (light) adjust.recolorMode = 'light'; } }
  }
  if (Object.keys(adjust).length) p.adjust = adjust;
  if (!media) {
    // A picture whose image is missing or external: keep the frame so layouts don't shift.
    c.warn('A picture could not be found in the file.');
  }
  return p;
};

const readTable = (tbl: XNode, b: ReturnType<typeof base>, c: PartCtx): Table => {
  const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => px(numAttr(g, 'w') ?? 0));
  const tc = textCtx(c);
  const fc = fillCtx(c);
  const rows = kids(tbl, 'tr').slice(0, 2000).map((tr) => ({
    h: px(numAttr(tr, 'h') ?? 0),
    cells: kids(tr, 'tc').slice(0, 500).map((cell): TableCell => {
      const text = readTextBody(kid(cell, 'txBody'), tc) ?? { paras: [{ runs: [] }] };
      const { vAlign: _v, inset: _i, ...rest } = text;
      const out: TableCell = { text: rest };
      const gs = numAttr(cell, 'gridSpan'), rs = numAttr(cell, 'rowSpan');
      if (gs && gs > 1) out.gridSpan = gs;
      if (rs && rs > 1) out.rowSpan = rs;
      if (boolAttr(cell, 'hMerge')) out.hMerge = true;
      if (boolAttr(cell, 'vMerge')) out.vMerge = true;
      const pr = kid(cell, 'tcPr');
      if (pr) {
        const f = readFill(pr, fc);
        if (f) out.fill = f;
        const borders: NonNullable<TableCell['borders']> = {};
        for (const [tag, key] of [['lnL', 'l'], ['lnR', 'r'], ['lnT', 't'], ['lnB', 'b'], ['lnTlToBr', 'tl2br'], ['lnBlToTr', 'bl2tr']] as const) {
          const l = readLine(kid(pr, tag), fc);
          if (l) borders[key] = l;
        }
        if (Object.keys(borders).length) out.borders = borders;
        const m = ['marL', 'marT', 'marR', 'marB'].map((k) => numAttr(pr, k));
        if (m.some((v) => v !== undefined)) out.margin = { l: px(m[0] ?? 91440), t: px(m[1] ?? 45720), r: px(m[2] ?? 91440), b: px(m[3] ?? 45720) };
        const an = attr(pr, 'anchor');
        if (an === 'ctr' || an === 'b' || an === 't') out.vAlign = an;
      }
      return out;
    }),
  }));
  const pr = kid(tbl, 'tblPr');
  const t: Table = { ...b, kind: 'table', cols, rows };
  const sid = kid(pr, 'tableStyleId')?.text.trim();
  if (sid) t.style = sid;
  const opts: NonNullable<Table['opts']> = {};
  for (const k of ['firstRow', 'lastRow', 'firstCol', 'lastCol', 'bandRow', 'bandCol'] as const) if (boolAttr(pr, k)) opts[k] = true;
  if (Object.keys(opts).length) t.opts = opts;
  // Width / height follow the grid when the frame is missing them.
  if (!t.w) t.w = cols.reduce((a, x) => a + x, 0);
  if (!t.h) t.h = rows.reduce((a, r) => a + r.h, 0);
  return t;
};

const DGM_GUESS: [RegExp, Diagram['layout']][] = [
  [/orgChart|hierarchy/i, 'orgChart'], [/cycle|circle/i, 'cycle'], [/radial/i, 'radial'], [/chevron/i, 'chevronProcess'], [/bProcess|bending/i, 'bendingProcess'],
  [/process|arrow/i, 'process'], [/pyramid/i, 'pyramid'], [/funnel/i, 'funnel'], [/venn/i, 'venn'], [/matrix/i, 'matrix'], [/target/i, 'target'], [/gear/i, 'gear'],
  [/timeline/i, 'timeline'], [/stepUp|ascending/i, 'stepUp'], [/vList|vertical/i, 'verticalList'], [/pict/i, 'pictureList'],
];

const readDiagram = (frame: XNode, b: ReturnType<typeof base>, c: PartCtx): Diagram | Group | null => {
  const relIds = find(frame, 'relIds');
  const dm = c.pkg.rel(c.part, attr(relIds, 'dm'));
  const lo = c.pkg.rel(c.part, attr(relIds, 'lo'));
  const nodes: DiagramNode[] = [];
  if (dm && !dm.external) {
    const data = c.pkg.xml(dm.target)?.root;
    const pts = kids(kid(data, 'ptLst'), 'pt');
    const cxns = kids(kid(data, 'cxnLst'), 'cxn').filter((x) => (attr(x, 'type') ?? 'parOf') === 'parOf');
    const doc = pts.find((p) => attr(p, 'type') === 'doc');
    const content = new Map(pts.filter((p) => !attr(p, 'type') || attr(p, 'type') === 'node').map((p) => [attr(p, 'modelId') ?? '', p]));
    const children = new Map<string, { id: string; ord: number }[]>();
    for (const x of cxns) {
      const src = attr(x, 'srcId') ?? '', dst = attr(x, 'destId') ?? '';
      if (!children.has(src)) children.set(src, []);
      children.get(src)!.push({ id: dst, ord: numAttr(x, 'srcOrd') ?? 0 });
    }
    const seen = new Set<string>();
    const walk = (id: string, level: number) => {
      if (seen.has(id) || nodes.length > 500) return;
      seen.add(id);
      for (const ch of (children.get(id) ?? []).sort((a, z) => a.ord - z.ord)) {
        const p = content.get(ch.id);
        if (!p) continue;
        const text = findAll(kid(p, 't'), 't').map((t) => t.text).join('') || findAll(p, 't').filter((t) => t.children.length === 0).map((t) => t.text).join('');
        nodes.push({ id: uid('n'), text, level: Math.min(8, level) });
        walk(ch.id, level + 1);
      }
    };
    if (doc) walk(attr(doc, 'modelId') ?? '', 0);
  }
  // The drawing part (dsp) holds the shapes as last laid out.
  const drel = c.pkg.rels(c.part).find((r) => /diagramDrawing$/.test(r.type) && dm && c.pkg.rels(dm.target).length >= 0 && r.target.replace(/drawing/, 'data') === dm.target)
    ?? (dm ? c.pkg.rels(dm.target).find((r) => /diagramDrawing$/.test(r.type)) : undefined)
    ?? c.pkg.rels(c.part).find((r) => /diagramDrawing$/.test(r.type));
  let cached: Shape[] | undefined;
  if (drel && !drel.external) {
    const dx = c.pkg.xml(drel.target);
    const tree = dx ? find(dx.root, 'spTree') : undefined;
    if (dx && tree) {
      const sub: PartCtx = { ...c, part: drel.target, src: dx.src, ids: new Map() };
      cached = readTree(tree, sub);
    }
  }
  const loName = lo && !lo.external ? attr(c.pkg.xml(lo.target)?.root, 'uniqueId') ?? '' : '';
  const layout = DGM_GUESS.find(([re]) => re.test(loName))?.[1] ?? 'basicList';
  return { ...b, kind: 'diagram', layout, nodes, ...(cached?.length ? { cached } : {}) };
};

const readGraphicFrame = (n: XNode, c: PartCtx): Shape | null => {
  const nv = kid(n, 'nvGraphicFramePr');
  const xf = readXfrm(kid(n, 'xfrm'));
  const b = base(nv, xf, c);
  const gd = find(n, 'graphicData');
  const uri = attr(gd, 'uri') ?? '';
  if (uri.endsWith('/table')) { const tbl = kid(gd, 'tbl'); return tbl ? readTable(tbl, b, c) : null; }
  if (uri.endsWith('/chart')) {
    const rel = c.pkg.rel(c.part, rid(kid(gd, 'chart')));
    const x = rel && !rel.external ? c.pkg.xml(rel.target) : undefined;
    const data = x ? readChartPart(x.root, c.color) : undefined;
    const ch: Chart = { ...b, kind: 'chart', chartType: data?.chartType ?? 'col', categories: data?.categories ?? [], series: data?.series ?? [], ...(data ?? {}) };
    if (x) ch.rawXml = x.src.length < 4_000_000 ? x.src : undefined;
    const link = x ? readDataLink(x.root) : undefined;
    if (link) ch.dataLink = link;
    return ch;
  }
  if (uri.endsWith('/diagram')) return readDiagram(n, b, c);
  if (uri.endsWith('/ole') || uri.endsWith('/oleObject')) {
    const ole = find(gd, 'oleObj');
    const pic = find(ole, 'pic');
    const blipRel = c.pkg.rel(c.part, attr(find(pic, 'blip'), 'embed'));
    const preview = blipRel && !blipRel.external ? c.mediaFor(blipRel.target) : undefined;
    const o: Ole = { ...b, kind: 'ole', ...(preview ? { preview } : {}), ...(attr(ole, 'progId') ? { progId: attr(ole, 'progId')! } : {}) };
    return o;
  }
  // Charts from the 2014+ chartex part and anything else: keep the frame as an object with a fallback.
  return { ...b, kind: 'ole', progId: uri };
};

/** Picks the branch of mc:AlternateContent we understand. */
const altContent = (n: XNode): XNode[] => {
  const choice = kids(n, 'Choice');
  for (const ch of choice) {
    const req = attr(ch, 'Requires') ?? '';
    // Known: 2010 extensions (p14, a14), 2014 (a16), 2015 equations (a14 math is handled as text below).
    if (/^(p14|a14|v|p15|a16|p159)( |$)/.test(req) && !/cx|aink|am3d|wpc|m\b/.test(req)) return ch.children;
  }
  return kid(n, 'Fallback')?.children ?? [];
};

const fixGroupChildren = (g: Group): void => {
  // Connector glue ids are resolved after the whole tree is read.
  void g;
};

const readGroup = (n: XNode, c: PartCtx, groupFill?: Fill): Group => {
  const nv = kid(n, 'nvGrpSpPr');
  const spPr = kid(n, 'grpSpPr');
  const xf = readXfrm(kid(spPr, 'xfrm'));
  const own = readFill(spPr, fillCtx(c, groupFill));
  const g: Group = { ...base(nv, xf, c), kind: 'group', children: [] };
  g.children = readTree(n, c, own ?? groupFill);
  if (xf?.ch) g.childBox = xf.ch;
  if (!xf) {
    // No frame: fit the children.
    const xs = g.children.map((s) => [s.x, s.y, s.x + s.w, s.y + s.h] as const);
    if (xs.length) {
      const x0 = Math.min(...xs.map((v) => v[0])), y0 = Math.min(...xs.map((v) => v[1]));
      Object.assign(g, { x: x0, y: y0, w: Math.max(...xs.map((v) => v[2])) - x0, h: Math.max(...xs.map((v) => v[3])) - y0 });
      g.childBox = { x: g.x, y: g.y, w: g.w, h: g.h };
    }
  }
  fixGroupChildren(g);
  return g;
};

const readContentPart = (n: XNode, c: PartCtx): Shape | null => {
  // Ink (p14 contentPart / InkML): keep the shape box; strokes come from the fallback picture when there is one.
  void n; void c;
  return null;
};

/** Reads the children of an spTree or grpSp. Unreadable shapes are skipped. */
export const readTree = (tree: XNode, c: PartCtx, groupFill?: Fill): Shape[] => {
  const out: Shape[] = [];
  const visit = (n: XNode) => {
    try {
      switch (n.name) {
        case 'sp': case 'cxnSp': out.push(readSp(n, c, groupFill)); break;
        case 'pic': out.push(readPic(n, c)); break;
        case 'grpSp': out.push(readGroup(n, c, groupFill)); break;
        case 'graphicFrame': { const s = readGraphicFrame(n, c); if (s) out.push(s); break; }
        case 'AlternateContent': for (const ch of altContent(n)) visit(ch); break;
        case 'contentPart': { const s = readContentPart(n, c); if (s) out.push(s); break; }
        default: break;
      }
    } catch (e) {
      c.warn(`A shape could not be read: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };
  for (const ch of tree.children) visit(ch);
  return out;
};

/** Connector ends and animation targets refer to original ids; map them to ours. */
export const resolveConnectors = (shapes: Shape[], ids: Map<string, string>): void => {
  const fix = (list: Shape[]) => {
    for (const s of list) {
      if (s.kind === 'shape' && s.conn) {
        for (const k of ['start', 'end'] as const) {
          const e = s.conn[k];
          if (e && e.shape.startsWith('@')) { const id = ids.get(e.shape.slice(1)); if (id) e.shape = id; else delete s.conn[k]; }
        }
        if (!s.conn.start && !s.conn.end) delete s.conn;
      }
      if (s.kind === 'group') fix(s.children);
    }
  };
  fix(shapes);
};

/** Background of a slide, layout or master (p:bg). */
export const readBackground = (cSld: XNode | undefined, c: PartCtx): Fill | undefined => {
  const bg = kid(cSld, 'bg');
  if (!bg) return undefined;
  const pr = kid(bg, 'bgPr');
  if (pr) return readFill(pr, fillCtx(c));
  const ref = kid(bg, 'bgRef');
  if (ref) return styleFill(ref, c) ?? (colorNode(ref) ? { type: 'solid', color: readColor(ref, c.color)! } : undefined);
  return undefined;
};

export const readTextBodyIn = (tb: XNode | undefined, c: PartCtx): TextBody | undefined => readTextBody(tb, textCtx(c));
export const textCtxFor = textCtx;
export const fillCtxFor = fillCtx;
