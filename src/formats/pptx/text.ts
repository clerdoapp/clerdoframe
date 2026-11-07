// DrawingML text (ECMA-376 Part 1, 21.1): bodies, list styles, paragraphs and runs.
import type { AutoNumber, BulletSpec, Hyperlink, Paragraph, ParaStyle, Run, RunStyle, TextBody } from '../../model/deck';
import { attr, kid, kids, numAttr, esc, type XNode } from '../xml';
import { colorXml, fillXml, lineXml, px, emu, readColor, readFill, readLine, type FillCtx, type WriteCtx } from './dml';

export interface TextCtx extends FillCtx {
  /** Hyperlink from a hlinkClick element (already filtered for safety). */
  link: (n: XNode | undefined) => Hyperlink | undefined;
}

const UNDER: Record<string, RunStyle['underline']> = {
  none: 'none', sng: 'sng', dbl: 'dbl', heavy: 'heavy', dotted: 'dotted', dottedHeavy: 'dotted', dash: 'dash', dashHeavy: 'dash', dashLong: 'dash', dashLongHeavy: 'dash',
  dotDash: 'dash', dotDashHeavy: 'dash', dotDotDash: 'dash', dotDotDashHeavy: 'dash', wavy: 'wavy', wavyHeavy: 'wavy', wavyDbl: 'wavy', words: 'sng',
};

export const readRunProps = (n: XNode | undefined, c: TextCtx): RunStyle | undefined => {
  if (!n) return undefined;
  const s: RunStyle = {};
  const b = attr(n, 'b'), i = attr(n, 'i');
  if (b !== undefined) s.bold = b === '1' || b === 'true';
  if (i !== undefined) s.italic = i === '1' || i === 'true';
  const u = attr(n, 'u');
  if (u) s.underline = UNDER[u] ?? 'sng';
  const st = attr(n, 'strike');
  if (st) s.strike = st === 'dblStrike' ? 'dbl' : st === 'sngStrike' ? 'sng' : 'none';
  const sz = numAttr(n, 'sz');
  if (sz !== undefined) s.size = sz / 100;
  const bl = numAttr(n, 'baseline');
  if (bl) s.baseline = bl / 1000;
  const cap = attr(n, 'cap');
  if (cap) s.caps = cap === 'all' ? 'all' : cap === 'small' ? 'small' : 'none';
  const spc = numAttr(n, 'spc');
  if (spc) s.spacing = spc / 100;
  const lang = attr(n, 'lang');
  if (lang) s.lang = lang;
  const latin = attr(kid(n, 'latin'), 'typeface'), ea = attr(kid(n, 'ea'), 'typeface'), cs = attr(kid(n, 'cs'), 'typeface');
  if (latin) s.font = latin;
  if (ea) s.fontEa = ea;
  if (cs) s.fontCs = cs;
  const fill = readFill(n, c);
  if (fill?.type === 'solid') s.color = fill.color;
  else if (fill) s.fill = fill;
  const hl = kid(n, 'highlight');
  if (hl) { const h = readColor(hl, c); if (h) s.highlight = h; }
  const ln = kid(n, 'ln');
  if (ln && !kid(ln, 'noFill')) { const l = readLine(ln, c); if (l) s.outline = l; }
  if (kid(kid(n, 'effectLst'), 'outerShdw')) s.shadow = true;
  const link = c.link(kid(n, 'hlinkClick'));
  if (link) s.link = link;
  return Object.keys(s).length ? s : undefined;
};

const AUTO = new Set<string>(['arabicPeriod', 'arabicParenR', 'arabicParenBoth', 'alphaLcPeriod', 'alphaUcPeriod', 'alphaLcParenR', 'alphaUcParenR', 'romanLcPeriod', 'romanUcPeriod', 'arabicPlain']);
const AUTO_MAP: Record<string, AutoNumber> = { alphaLcParenBoth: 'alphaLcParenR', alphaUcParenBoth: 'alphaUcParenR', romanLcParenR: 'romanLcPeriod', romanUcParenR: 'romanUcPeriod', romanLcParenBoth: 'romanLcPeriod', romanUcParenBoth: 'romanUcPeriod', arabicDbPeriod: 'arabicPeriod', arabicDbPlain: 'arabicPlain', circleNumDbPlain: 'arabicPlain' };

export const readParaProps = (n: XNode | undefined, c: TextCtx): ParaStyle | undefined => {
  if (!n) return undefined;
  const p: ParaStyle = {};
  const algn = attr(n, 'algn');
  if (algn) p.align = (['l', 'ctr', 'r', 'just', 'dist'].includes(algn) ? algn : algn === 'justLow' || algn === 'thaiDist' ? 'just' : 'l') as ParaStyle['align'];
  const lvl = numAttr(n, 'lvl');
  if (lvl !== undefined) p.level = Math.max(0, Math.min(8, lvl));
  const marL = numAttr(n, 'marL'), ind = numAttr(n, 'indent');
  if (marL !== undefined) p.marginLeft = px(marL);
  if (ind !== undefined) p.indent = px(ind);
  const rtl = attr(n, 'rtl');
  if (rtl !== undefined) p.rtl = rtl === '1' || rtl === 'true';
  const spacing = (tag: string): { pct?: number; pts?: number } | undefined => {
    const s = kid(n, tag);
    if (!s) return undefined;
    const pc = numAttr(kid(s, 'spcPct'), 'val'), pt = numAttr(kid(s, 'spcPts'), 'val');
    return pc !== undefined ? { pct: pc / 1000 } : pt !== undefined ? { pts: pt / 100 } : undefined;
  };
  const ls = spacing('lnSpc');
  if (ls?.pct !== undefined) p.lineSpacing = ls.pct;
  else if (ls?.pts !== undefined) { p.lineSpacing = ls.pts; p.lineSpacingPts = true; }
  // Space before/after are stored in points; percentages (of the font size) are approximated at 18 pt.
  const sb = spacing('spcBef'), sa = spacing('spcAft');
  if (sb) p.spaceBefore = sb.pts ?? Math.round(((sb.pct ?? 0) / 100) * 18 * 10) / 10;
  if (sa) p.spaceAfter = sa.pts ?? Math.round(((sa.pct ?? 0) / 100) * 18 * 10) / 10;
  const buNone = kid(n, 'buNone'), buChar = kid(n, 'buChar'), buAuto = kid(n, 'buAutoNum'), buBlip = kid(n, 'buBlip');
  const buClr = readColor(kid(n, 'buClr'), c);
  const buSz = numAttr(kid(n, 'buSzPct'), 'val');
  const buFont = attr(kid(n, 'buFont'), 'typeface');
  let bullet: BulletSpec | undefined;
  if (buNone) bullet = { type: 'none' };
  else if (buChar) bullet = { type: 'char', char: attr(buChar, 'char') ?? '•', ...(buFont ? { font: buFont } : {}) };
  else if (buAuto) {
    const t = attr(buAuto, 'type') ?? 'arabicPeriod';
    const start = numAttr(buAuto, 'startAt');
    bullet = { type: 'auto', scheme: (AUTO.has(t) ? t : AUTO_MAP[t] ?? 'arabicPeriod') as AutoNumber, ...(start !== undefined && start !== 1 ? { start } : {}) };
  } else if (buBlip) {
    const media = c.media(attr(kid(buBlip, 'blip'), 'embed'));
    bullet = media ? { type: 'picture', media } : { type: 'char', char: '•' };
  }
  if (bullet && (bullet.type === 'char' || bullet.type === 'auto')) {
    if (buClr) bullet.color = buClr;
    if (buSz !== undefined) bullet.size = buSz / 1000;
  }
  if (bullet) p.bullet = bullet;
  const tabs = kids(kid(n, 'tabLst'), 'tab').map((t) => ({ pos: px(numAttr(t, 'pos') ?? 0), align: (attr(t, 'algn') ?? 'l') as 'l' }));
  if (tabs.length) p.tabs = tabs;
  const d = readRunProps(kid(n, 'defRPr'), c);
  if (d) p.defRun = d;
  return Object.keys(p).length ? p : undefined;
};

/** Level styles lvl1pPr..lvl9pPr (plus defPPr as a base) of a list style. */
export const readListStyle = (n: XNode | undefined, c: TextCtx): ParaStyle[] => {
  if (!n) return [];
  const base = readParaProps(kid(n, 'defPPr'), c);
  const out: ParaStyle[] = [];
  for (let i = 0; i < 9; i++) {
    const p = readParaProps(kid(n, `lvl${i + 1}pPr`), c);
    if (p || base) out[i] = { ...(base ?? {}), ...(p ?? {}), level: i, ...(base?.defRun || p?.defRun ? { defRun: { ...(base?.defRun ?? {}), ...(p?.defRun ?? {}) } } : {}) };
  }
  return out;
};

const ANCHOR: Record<string, TextBody['vAlign']> = { t: 't', ctr: 'ctr', b: 'b', just: 't', dist: 'ctr' };

/** Body properties into a TextBody (paragraphs left empty). */
export const readBodyProps = (bp: XNode | undefined): Omit<TextBody, 'paras'> => {
  const out: Omit<TextBody, 'paras'> = {};
  if (!bp) return out;
  const a = attr(bp, 'anchor');
  if (a) out.vAlign = ANCHOR[a] ?? 't';
  const ins = ['lIns', 'tIns', 'rIns', 'bIns'].map((k) => numAttr(bp, k));
  if (ins.some((v) => v !== undefined)) out.inset = { l: px(ins[0] ?? 91440), t: px(ins[1] ?? 45720), r: px(ins[2] ?? 91440), b: px(ins[3] ?? 45720) };
  const wrap = attr(bp, 'wrap');
  if (wrap) out.wrap = wrap !== 'none';
  if (kid(bp, 'normAutofit')) {
    out.autofit = 'shrink';
    const fs = numAttr(kid(bp, 'normAutofit'), 'fontScale');
    if (fs !== undefined) out.fontScale = fs / 100000;
  } else if (kid(bp, 'spAutoFit')) out.autofit = 'resize';
  else if (kid(bp, 'noAutofit')) out.autofit = 'none';
  const nc = numAttr(bp, 'numCol');
  if (nc && nc > 1) { out.columns = Math.min(16, nc); const sp = numAttr(bp, 'spcCol'); if (sp) out.columnGap = px(sp); }
  const vert = attr(bp, 'vert');
  if (vert && vert !== 'horz') out.vert = (['vert', 'vert270', 'wordArtVert', 'eaVert'].includes(vert) ? vert : vert === 'mongolianVert' || vert === 'wordArtVertRtl' ? 'eaVert' : 'vert') as TextBody['vert'];
  const rot = numAttr(bp, 'rot');
  if (rot) out.rot = rot / 60000;
  const warp = attr(kid(bp, 'prstTxWarp'), 'prst');
  if (warp && warp !== 'textNoShape') out.warp = warp;
  return out;
};

export const readParagraph = (p: XNode, c: TextCtx): Paragraph => {
  const runs: Run[] = [];
  for (const n of p.children) {
    if (n.name === 'r') {
      const t = kid(n, 't')?.text ?? '';
      const st = readRunProps(kid(n, 'rPr'), c);
      runs.push({ text: t, ...(st ? { style: st } : {}) });
    } else if (n.name === 'br') {
      const st = readRunProps(kid(n, 'rPr'), c);
      runs.push({ text: '', br: true, ...(st ? { style: st } : {}) });
    } else if (n.name === 'fld') {
      const type = attr(n, 'type') ?? '';
      const st = readRunProps(kid(n, 'rPr'), c);
      const field: Run['field'] = type === 'slidenum' ? 'slidenum' : type.startsWith('datetime') ? 'datetime' : undefined;
      runs.push({ text: kid(n, 't')?.text ?? '', ...(field ? { field } : {}), ...(st ? { style: st } : {}) });
    } else if (n.name === 'AlternateContent') {
      // Inline equations: keep the fallback text.
      const fb = kid(n, 'Fallback');
      for (const r of kids(fb, 'r')) runs.push({ text: kid(r, 't')?.text ?? '' });
    }
  }
  const style = readParaProps(kid(p, 'pPr'), c);
  const end = readRunProps(kid(p, 'endParaRPr'), c);
  const ps: ParaStyle | undefined = style || (end && !runs.length) ? { ...(style ?? {}) } : undefined;
  if (ps && end && !runs.length) ps.defRun = { ...(ps.defRun ?? {}), ...pickSize(end) };
  return { runs, ...(ps && Object.keys(ps).length ? { style: ps } : {}) };
};

const pickSize = (r: RunStyle): RunStyle => {
  // An empty paragraph keeps its height from the end mark.
  const o: RunStyle = {};
  if (r.size !== undefined) o.size = r.size;
  if (r.font) o.font = r.font;
  return o;
};

/** `asLevels` (layouts, masters) keeps the list style as per-level defaults instead of folding it into the paragraphs. */
export const readTextBody = (tb: XNode | undefined, c: TextCtx, asLevels = false): TextBody | undefined => {
  if (!tb) return undefined;
  const body: TextBody = { ...readBodyProps(kid(tb, 'bodyPr')), paras: kids(tb, 'p').map((p) => readParagraph(p, c)) };
  if (!body.paras.length) body.paras = [{ runs: [] }];
  const lst = readListStyle(kid(tb, 'lstStyle'), c);
  if (lst.length && asLevels) { body.levels = Array.from({ length: 9 }, (_, i) => lst[i] ?? {}); return body; }
  // Shape-level list style becomes per-paragraph defaults where paragraphs don't set their own.
  if (lst.length) {
    for (const p of body.paras) {
      const lv = lst[p.style?.level ?? 0];
      if (lv) {
        const { level: _l, ...rest } = lv;
        p.style = { ...rest, ...(p.style ?? {}), ...(rest.defRun || p.style?.defRun ? { defRun: { ...(rest.defRun ?? {}), ...(p.style?.defRun ?? {}) } } : {}) };
      }
    }
  }
  return body;
};

// ---------- Writing ----------

export interface TextWriteCtx extends WriteCtx {
  /** Relationship id for a hyperlink, or an action string. */
  link: (l: Hyperlink) => { rid: string; action?: string } | undefined;
}

const UNDER_W: Record<string, string> = { sng: 'sng', dbl: 'dbl', heavy: 'heavy', dotted: 'dotted', dash: 'dash', wavy: 'wavy', none: 'none' };

/** a:rPr / a:defRPr / a:endParaRPr. */
export const runPropsXml = (tag: string, s: RunStyle | undefined, w: TextWriteCtx, extra = ''): string => {
  if (!s && !extra) return '';
  const a: string[] = [];
  if (s?.lang) a.push(`lang="${esc(s.lang)}"`);
  if (s?.size !== undefined) a.push(`sz="${Math.round(Math.max(1, Math.min(4000, s.size)) * 100)}"`);
  if (s?.bold !== undefined) a.push(`b="${s.bold ? 1 : 0}"`);
  if (s?.italic !== undefined) a.push(`i="${s.italic ? 1 : 0}"`);
  if (s?.underline) a.push(`u="${UNDER_W[s.underline] ?? 'sng'}"`);
  if (s?.strike) a.push(`strike="${s.strike === 'dbl' ? 'dblStrike' : s.strike === 'sng' ? 'sngStrike' : 'noStrike'}"`);
  if (s?.spacing) a.push(`spc="${Math.round(s.spacing * 100)}"`);
  if (s?.baseline) a.push(`baseline="${Math.round(s.baseline * 1000)}"`);
  if (s?.caps) a.push(`cap="${s.caps}"`);
  let inner = '';
  if (s?.outline) inner += lineXml(s.outline, w);
  if (s?.fill && s.fill.type !== 'picture') inner += fillXml(s.fill, w);
  else if (s?.color !== undefined) inner += `<a:solidFill>${colorXml(s.color)}</a:solidFill>`;
  if (s?.shadow) inner += '<a:effectLst><a:outerShdw blurRad="38100" dist="38100" dir="2700000" algn="tl"><a:srgbClr val="000000"><a:alpha val="43137"/></a:srgbClr></a:outerShdw></a:effectLst>';
  if (s?.highlight !== undefined) inner += `<a:highlight>${colorXml(s.highlight)}</a:highlight>`;
  if (s?.font) inner += `<a:latin typeface="${esc(s.font)}"/>`;
  if (s?.fontEa) inner += `<a:ea typeface="${esc(s.fontEa)}"/>`;
  if (s?.fontCs) inner += `<a:cs typeface="${esc(s.fontCs)}"/>`;
  if (s?.link) {
    const l = w.link(s.link);
    if (l) inner += `<a:hlinkClick r:id="${l.rid}"${l.action ? ` action="${esc(l.action)}"` : ''}${s.link.tooltip ? ` tooltip="${esc(s.link.tooltip)}"` : ''}/>`;
  }
  inner += extra;
  const at = a.length ? ' ' + a.join(' ') : '';
  return inner ? `<a:${tag}${at}>${inner}</a:${tag}>` : `<a:${tag}${at}/>`;
};

const spc = (tag: string, v: number | undefined, pts = true): string =>
  v === undefined ? '' : pts ? `<a:${tag}><a:spcPts val="${Math.round(v * 100)}"/></a:${tag}>` : `<a:${tag}><a:spcPct val="${Math.round(v * 1000)}"/></a:${tag}>`;

/** a:pPr or a:lvlNpPr. */
export const paraPropsXml = (tag: string, p: ParaStyle | undefined, w: TextWriteCtx, withLevel = true): string => {
  if (!p) return '';
  const a: string[] = [];
  if (p.marginLeft !== undefined) a.push(`marL="${emu(p.marginLeft)}"`);
  if (withLevel && p.level) a.push(`lvl="${p.level}"`);
  if (p.indent !== undefined) a.push(`indent="${emu(p.indent)}"`);
  if (p.align) a.push(`algn="${p.align}"`);
  if (p.rtl !== undefined) a.push(`rtl="${p.rtl ? 1 : 0}"`);
  let inner = '';
  if (p.lineSpacing !== undefined) inner += spc('lnSpc', p.lineSpacing, !!p.lineSpacingPts);
  inner += spc('spcBef', p.spaceBefore) + spc('spcAft', p.spaceAfter);
  const b = p.bullet;
  if (b && (b.type === 'char' || b.type === 'auto')) {
    if (b.color !== undefined) inner += `<a:buClr>${colorXml(b.color)}</a:buClr>`;
    if (b.size !== undefined) inner += `<a:buSzPct val="${Math.round(b.size * 1000)}"/>`;
  }
  if (b?.type === 'char' && b.font) inner += `<a:buFont typeface="${esc(b.font)}"/>`;
  if (b?.type === 'none') inner += '<a:buNone/>';
  else if (b?.type === 'char') inner += `<a:buChar char="${esc(b.char || '•')}"/>`;
  else if (b?.type === 'auto') inner += `<a:buAutoNum type="${b.scheme}"${b.start && b.start !== 1 ? ` startAt="${b.start}"` : ''}/>`;
  else if (b?.type === 'picture') { const rid = w.mediaRel(b.media); inner += rid ? `<a:buBlip><a:blip r:embed="${rid}"/></a:buBlip>` : '<a:buChar char="•"/>'; }
  if (p.tabs?.length) inner += `<a:tabLst>${p.tabs.map((t) => `<a:tab pos="${emu(t.pos)}" algn="${t.align}"/>`).join('')}</a:tabLst>`;
  if (p.defRun) inner += runPropsXml('defRPr', p.defRun, w);
  const at = a.length ? ' ' + a.join(' ') : '';
  return inner ? `<a:${tag}${at}>${inner}</a:${tag}>` : at ? `<a:${tag}${at}/>` : '';
};

export const listStyleXml = (levels: (ParaStyle | undefined)[], w: TextWriteCtx): string =>
  levels.map((l, i) => (l ? paraPropsXml(`lvl${i + 1}pPr`, { ...l, level: undefined }, w, false) || `<a:lvl${i + 1}pPr/>` : '')).join('');

export const bodyPrXml = (b: Omit<TextBody, 'paras'> | undefined, extraAttrs: Record<string, string> = {}): string => {
  const a: string[] = Object.entries(extraAttrs).map(([k, v]) => `${k}="${esc(v)}"`);
  if (b?.rot) a.push(`rot="${Math.round(b.rot * 60000)}"`);
  if (b?.vert) a.push(`vert="${b.vert}"`);
  if (b?.wrap !== undefined) a.push(`wrap="${b.wrap ? 'square' : 'none'}"`);
  if (b?.inset) a.push(`lIns="${emu(b.inset.l)}" tIns="${emu(b.inset.t)}" rIns="${emu(b.inset.r)}" bIns="${emu(b.inset.b)}"`);
  if (b?.columns && b.columns > 1) a.push(`numCol="${b.columns}"${b.columnGap ? ` spcCol="${emu(b.columnGap)}"` : ''}`);
  if (b?.vAlign) a.push(`anchor="${b.vAlign}"`);
  let inner = '';
  if (b?.warp) inner += `<a:prstTxWarp prst="${esc(b.warp)}"><a:avLst/></a:prstTxWarp>`;
  if (b?.autofit === 'shrink') inner += `<a:normAutofit${b.fontScale && b.fontScale < 1 ? ` fontScale="${Math.round(b.fontScale * 100000)}"` : ''}/>`;
  else if (b?.autofit === 'resize') inner += '<a:spAutoFit/>';
  else if (b?.autofit === 'none') inner += '<a:noAutofit/>';
  const at = a.length ? ' ' + a.join(' ') : '';
  return inner ? `<a:bodyPr${at}>${inner}</a:bodyPr>` : `<a:bodyPr${at}/>`;
};

let fieldSeq = 0;
const guid = (): string => {
  const h = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
  return `{${h(8)}-${h(4)}-4${h(3)}-A${h(3)}-${h(12)}}`;
};

export const paragraphXml = (p: Paragraph, w: TextWriteCtx): string => {
  let s = '<a:p>' + paraPropsXml('pPr', p.style ? { ...p.style, defRun: undefined } : undefined, w);
  for (const r of p.runs) {
    if (r.br) { s += `<a:br>${runPropsXml('rPr', r.style ?? {}, w) || '<a:rPr/>'}</a:br>`; continue; }
    const rp = runPropsXml('rPr', { lang: 'en-US', ...(r.style ?? {}) }, w);
    if (r.field) {
      const type = r.field === 'slidenum' ? 'slidenum' : r.field === 'datetime' ? 'datetime1' : 'slidenum';
      fieldSeq++;
      s += `<a:fld id="${guid()}" type="${type}">${rp}<a:t>${esc(r.text || (r.field === 'slidenum' ? '‹#›' : ''))}</a:t></a:fld>`;
      continue;
    }
    s += `<a:r>${rp}<a:t>${esc(r.text)}</a:t></a:r>`;
  }
  const end = p.style?.defRun ?? p.runs.at(-1)?.style;
  s += runPropsXml('endParaRPr', { lang: 'en-US', ...(end?.size !== undefined ? { size: end.size } : {}) }, w);
  return s + '</a:p>';
};

/** p:txBody / a:txBody with its paragraphs. */
export const textBodyXml = (tag: string, t: TextBody | undefined, w: TextWriteCtx, lst = ''): string => {
  const body = t ?? { paras: [{ runs: [] }] };
  const { paras, levels, ...props } = body;
  if (!lst && levels?.some((l) => l && Object.keys(l).length)) lst = listStyleXml(levels, w);
  const ps = paras.length ? paras : [{ runs: [] }];
  return `<${tag}>${bodyPrXml(props)}${lst ? `<a:lstStyle>${lst}</a:lstStyle>` : '<a:lstStyle/>'}${ps.map((p) => paragraphXml(p, w)).join('')}</${tag}>`;
};
