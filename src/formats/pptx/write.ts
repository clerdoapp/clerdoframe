// .pptx writer: builds a complete PresentationML package from the deck.
import type { Background, Comment, Deck, Hyperlink, Layout, ParaStyle, Slide, TextBody, Theme } from '../../model/deck';
import { esc } from '../xml';
import { emu, fillXml, themeSchemeXml } from './dml';
import { EXTRA_PART, REL_CUSTOM_XML, pptxExtras, readMeta } from './kept';
import { CT, NS, PackageWriter, REL, XML_HEAD, extFor, parseKeptRels, relType, remapRels, type RelSet } from './opc';
import { listStyleXml, textBodyXml, type TextWriteCtx } from './text';
import { timingXml, transitionXmlFor } from './write-timing';
import { treeXml, type ShapeWriteCtx } from './write-shapes';

export type PptxKind = 'presentation' | 'template' | 'show';

export interface WriteOptions {
  kind?: PptxKind;
  /** Lays out a diagram into plain shapes (supplied by the diagrams feature when available). */
  diagramShapes?: ShapeWriteCtx['diagramShapes'];
  appName?: string;
}

const NSDECL = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;

/** A 1x1 grey PNG used as the poster frame for media with none. */
const POSTER = Uint8Array.from(atobSafe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+P//fwAJ+wP9BUNFygAAAABJRU5ErkJggg=='));
function atobSafe(s: string): number[] {
  const t = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  return Array.from(t, (c) => c.charCodeAt(0));
}

const themeXml = (t: Theme): string => {
  const font = (tag: string, face: string) => `<a:${tag}><a:latin typeface="${esc(face)}" panose="020F0302020204030204"/><a:ea typeface=""/><a:cs typeface=""/></a:${tag}>`;
  const fmt = t.formatXml && /^<a:fmtScheme[\s>]/.test(t.formatXml) ? t.formatXml : DEFAULT_FMT;
  return XML_HEAD + `<a:theme xmlns:a="${NS.a}" name="${esc(t.name)}"><a:themeElements>${themeSchemeXml(t)}<a:fontScheme name="${esc(t.fonts.name ?? t.name)}">${font('majorFont', t.fonts.major)}${font('minorFont', t.fonts.minor)}</a:fontScheme>${fmt}</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
};

const DEFAULT_FMT = '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:fillStyleLst>'
  + '<a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst>'
  + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst>'
  + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:bgFillStyleLst></a:fmtScheme>';

const CLRMAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

const isoNow = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const iso = (s: string | undefined) => { const d = s ? new Date(s) : new Date(); return Number.isFinite(d.getTime()) ? d.toISOString().replace(/\.\d+Z$/, 'Z') : isoNow(); };

const bgXml = (bg: Background | undefined, c: ShapeWriteCtx): string => {
  if (!bg || bg.fill.type === 'background') return '';
  const f = bg.fill.type === 'none' ? '<a:noFill/>' : fillXml(bg.fill, c, 'a');
  return `<p:bg><p:bgPr>${f}<a:effectLst/></p:bgPr></p:bg>`;
};

const levelsXml = (levels: ParaStyle[], w: TextWriteCtx): string => listStyleXml(levels.slice(0, 9), w);

export const writePptx = (deck: Deck, opts: WriteOptions = {}): Uint8Array => {
  const pw = new PackageWriter();
  const kind = opts.kind ?? 'presentation';
  const meta = readMeta(deck);
  const kept = deck.extraParts ?? {};
  const keptExists = (p: string) => !!kept[p] && p !== 'clerdoframe/kept.json';

  // Kept parts first, so writers can refer to them; our own parts never use their names.
  const usedKept = new Set<string>();
  const putKept = (p: string) => {
    if (usedKept.has(p) || !keptExists(p)) return;
    usedKept.add(p);
    pw.put(p, kept[p]!, meta.types[p] ?? (p.endsWith('.rels') ? undefined : 'application/octet-stream'));
    if (meta.types[p]) pw.overrides.set(p, meta.types[p]!);
  };
  for (const p of Object.keys(kept)) if (!p.startsWith('clerdoframe/') && !EXTRA_PART.test(p)) putKept(p);
  // Our parts go to fresh names when a kept part already took one.
  const taken = (p: string) => pw.has(p);

  const presPath = 'ppt/presentation.xml';
  const presRels = pw.relsFor(presPath);
  const rootRels = pw.relsFor('');
  rootRels.add(REL.officeDocument, presPath);
  rootRels.add(REL.core, 'docProps/core.xml');
  rootRels.add(REL.app, 'docProps/app.xml');
  for (const r of meta.root ?? []) if (!r.external && keptExists(r.target)) rootRels.add(r.type, r.target);

  // ---------- Media ----------
  const mediaPath = new Map<string, string>();
  const mediaItemPath = (id: string): string | undefined => {
    const hit = mediaPath.get(id);
    if (hit) return hit;
    const m = deck.media[id];
    if (!m) return undefined;
    const ext = extFor(m.type, m.name);
    const stem = /^video|^audio/.test(m.type) ? 'media' : 'image';
    const p = pw.unique('ppt/media/', stem, ext);
    pw.put(p, m.data, m.type);
    mediaPath.set(id, p);
    return p;
  };
  let posterPath: string | undefined;

  // ---------- Slide paths (known before any slide is written, for links) ----------
  const slidePaths = new Map<string, string>();
  deck.slides.forEach((s, i) => {
    let p = `ppt/slides/slide${i + 1}.xml`;
    if (taken(p)) p = pw.unique('ppt/slides/', 'slide', 'xml');
    slidePaths.set(s.id, p);
  });

  const ctxFor = (part: string, rels: RelSet): ShapeWriteCtx => {
    let id = 1;
    const c: ShapeWriteCtx = {
      pw, rels,
      nextId: () => ++id,
      idMap: new Map(),
      slidePath: (sid) => slidePaths.get(sid),
      ...(opts.diagramShapes ? { diagramShapes: opts.diagramShapes } : {}),
      mediaRel: (mid) => { const p = mediaItemPath(mid); return p ? rels.add(REL.image, p) : undefined; },
      mediaItem: (mid) => { const p = mediaItemPath(mid); return p ? { path: p } : undefined; },
      placeholderPoster: () => {
        if (!posterPath) { posterPath = pw.unique('ppt/media/', 'image', 'png'); pw.put(posterPath, POSTER, 'image/png'); }
        return rels.add(REL.image, posterPath);
      },
      keptExists,
      link: (l: Hyperlink) => {
        if (l.url) return /^(https:|http:|mailto:)/i.test(l.url) ? { rid: rels.add(REL.hyperlink, l.url, true) } : undefined;
        const jump: Record<string, string> = { next: 'nextslide', prev: 'previousslide', first: 'firstslide', last: 'lastslide', end: 'endshow' };
        if (l.action && l.action !== 'slide') return { rid: '', action: `ppaction://hlinkshowjump?jump=${jump[l.action]}` };
        if (l.action === 'slide' && l.slide) { const p = slidePaths.get(l.slide); return p ? { rid: rels.add(REL.slide, p), action: 'ppaction://hlinksldjump' } : undefined; }
        return undefined;
      },
    };
    void part;
    return c;
  };

  // ---------- Masters, layouts, themes ----------
  const layoutPath = new Map<string, string>();
  let layoutN = 0, themeN = 0;
  const masterIdList: string[] = [];
  let nextMasterId = 2147483648;
  deck.masters.forEach((m, mi) => {
    const mp = `ppt/slideMasters/slideMaster${mi + 1}.xml`;
    const mrels = pw.relsFor(mp);
    const layoutIds: string[] = [];
    // Layout ids follow the master id in one shared number space.
    const masterNum = nextMasterId;
    nextMasterId += m.layouts.length + 1;
    m.layouts.forEach((l, li) => {
      const lp = `ppt/slideLayouts/slideLayout${++layoutN}.xml`;
      layoutPath.set(l.id, lp);
      const lrels = pw.relsFor(lp);
      lrels.add(REL.slideMaster, mp);
      const rid = mrels.add(REL.slideLayout, lp);
      layoutIds.push(`<p:sldLayoutId id="${masterNum + li + 1}" r:id="${rid}"/>`);
      pw.put(lp, layoutXml(l, { ...ctxFor(lp, lrels), onMaster: true }), CT.layout);
    });
    const tp = `ppt/theme/theme${++themeN}.xml`;
    pw.put(tp, themeXml(m.theme), CT.theme);
    mrels.add(REL.theme, tp);
    const c = { ...ctxFor(mp, mrels), onMaster: true };
    const ts = m.textStyles;
    const hf = m.keep?.hf ?? '';
    const xml = XML_HEAD + `<p:sldMaster ${NSDECL}><p:cSld${m.name ? ` name="${esc(m.name)}"` : ''}>${bgXml(m.background, c)}${treeXml(m.shapes, c)}</p:cSld>${CLRMAP}`
      + `<p:sldLayoutIdLst>${layoutIds.join('')}</p:sldLayoutIdLst>${hf.startsWith('<p:hf') ? hf : ''}<p:txStyles><p:titleStyle>${levelsXml(ts.title, c)}</p:titleStyle><p:bodyStyle>${levelsXml(ts.body, c)}</p:bodyStyle><p:otherStyle>${levelsXml(ts.other, c)}</p:otherStyle></p:txStyles></p:sldMaster>`;
    pw.put(mp, xml, CT.master);
    const rid = presRels.add(REL.slideMaster, mp);
    masterIdList.push(`<p:sldMasterId id="${masterNum}" r:id="${rid}"/>`);
  });

  // ---------- Notes master (needed for notes slides) ----------
  const hasNotes = deck.slides.some((s) => s.notes.paras.some((p) => p.runs.some((r) => r.text)));
  const nmPath = 'ppt/notesMasters/notesMaster1.xml';
  if (hasNotes) {
    const nmRels = pw.relsFor(nmPath);
    const tp = `ppt/theme/theme${++themeN}.xml`;
    pw.put(tp, themeXml(deck.masters[0]!.theme), CT.theme);
    nmRels.add(REL.theme, tp);
    pw.put(nmPath, notesMasterXml(deck), CT.notesMaster);
  }

  // ---------- Comment authors ----------
  const authors: { name: string; initials: string; id: number; last: number }[] = [];
  const authorOf = (c: Comment) => {
    let a = authors.find((x) => x.name === c.author);
    if (!a) { a = { name: c.author, initials: c.initials ?? c.author.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 3).toUpperCase(), id: authors.length, last: 0 }; authors.push(a); }
    return a;
  };

  // ---------- Slides ----------
  const sldIds: string[] = [];
  const sldIdOf = new Map<string, number>();
  deck.slides.forEach((s, i) => {
    const sp = slidePaths.get(s.id)!;
    const srels = pw.relsFor(sp);
    srels.add(REL.slideLayout, layoutPath.get(s.layout) ?? layoutPath.values().next().value!);
    const c = ctxFor(sp, srels);
    const shapes = treeXml(s.shapes, c);
    const trans = transitionFor(s);
    const timing = s.animations.length ? timingXml(s.animations, c.idMap, deck.w, deck.h) : keptTiming(s, srels, keptExists);
    const hideMaster = s.background?.hideMasterGraphics ? ' showMasterSp="0"' : '';
    const xml = XML_HEAD + `<p:sld ${NSDECL}${s.hidden ? ' show="0"' : ''}${hideMaster}><p:cSld${s.name ? ` name="${esc(s.name)}"` : ''}>${bgXml(s.background, c)}${shapes}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${trans}${timing}</p:sld>`;
    pw.put(sp, xml, CT.slide);
    // Kept slide-level relationships (tags...).
    for (const r of parseKeptRels(s.keep?.rels)) if (!r.external && keptExists(r.target)) srels.add(r.type, r.target);
    const rid = presRels.add(REL.slide, sp);
    sldIdOf.set(s.id, 256 + i);
    sldIds.push(`<p:sldId id="${256 + i}" r:id="${rid}"/>`);
    // Notes
    if (s.notes.paras.some((p) => p.runs.some((r) => r.text))) {
      const np = pw.unique('ppt/notesSlides/', 'notesSlide', 'xml');
      const nrels = pw.relsFor(np);
      nrels.add(REL.notesMaster, nmPath);
      nrels.add(REL.slide, sp);
      srels.add(REL.notesSlide, np);
      pw.put(np, notesSlideXml(s.notes, ctxFor(np, nrels)), CT.notesSlide);
    }
    // Legacy comments (widely supported).
    if (s.comments?.length) {
      const cp = pw.unique('ppt/comments/', 'comment', 'xml');
      const flat = s.comments.flatMap((cm) => [cm, ...(cm.replies ?? [])]);
      const items = flat.map((cm) => {
        const a = authorOf(cm);
        a.last++;
        const x = Math.round(((cm.x ?? 10) * 576) / 96), y = Math.round(((cm.y ?? 10) * 576) / 96);
        return `<p:cm authorId="${a.id}" dt="${iso(cm.at).replace('Z', '.000')}" idx="${a.last}"><p:pos x="${x}" y="${y}"/><p:text>${esc(cm.text)}</p:text></p:cm>`;
      }).join('');
      pw.put(cp, XML_HEAD + `<p:cmLst ${NSDECL}>${items}</p:cmLst>`, CT.comments);
      srels.add(REL.comments, cp);
    }
  });

  if (hasNotes) presRels.add(REL.notesMaster, nmPath);
  if (authors.length) {
    const ap = 'ppt/commentAuthors.xml';
    pw.put(ap, XML_HEAD + `<p:cmAuthorLst ${NSDECL}>${authors.map((a) => `<p:cmAuthor id="${a.id}" name="${esc(a.name)}" initials="${esc(a.initials)}" lastIdx="${a.last}" clrIdx="${a.id % 8}"/>`).join('')}</p:cmAuthorLst>`, CT.commentAuthors);
    presRels.add(REL.commentAuthors, ap);
  }

  // ---------- presProps, viewProps, tableStyles ----------
  pw.put('ppt/presProps.xml', presPropsXml(deck), CT.presProps);
  presRels.add(REL.presProps, 'ppt/presProps.xml');
  pw.put('ppt/viewProps.xml', XML_HEAD + `<p:viewPr ${NSDECL}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr snapToGrid="0"><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`, CT.viewProps);
  presRels.add(REL.viewProps, 'ppt/viewProps.xml');
  if (!pw.has('ppt/tableStyles.xml')) pw.put('ppt/tableStyles.xml', XML_HEAD + `<a:tblStyleLst xmlns:a="${NS.a}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`, CT.tableStyles);
  presRels.add(REL.tableStyles, 'ppt/tableStyles.xml');
  for (const r of meta.pres ?? []) if (!r.external && keptExists(r.target) && !['slide', 'slideMaster'].includes(relType(r.type))) presRels.add(r.type, r.target);
  for (const x of pptxExtras()) {
    const xml = x.write(deck);
    const xp = `customXml/clerdoframe-${x.id}.xml`;
    if (xml && EXTRA_PART.test(xp)) { pw.put(xp, XML_HEAD + xml, 'application/xml'); presRels.add(REL_CUSTOM_XML, xp); }
  }
  // Theme relationship of the presentation part (first master's theme).
  presRels.add(REL.theme, 'ppt/theme/theme1.xml');

  // ---------- presentation.xml ----------
  const secs = sectionsXml(deck, sldIdOf);
  const custShows = deck.customShows.length
    ? `<p:custShowLst>${deck.customShows.map((cs, i) => `<p:custShow name="${esc(cs.name)}" id="${i}"><p:sldLst>${cs.slides.filter((id) => slidePaths.has(id)).map((id) => `<p:sld r:id="${presRels.add(REL.slide, slidePaths.get(id)!)}"/>`).join('')}</p:sldLst></p:custShow>`).join('')}</p:custShowLst>`
    : '';
  const W = emu(deck.w), H = emu(deck.h);
  const sizeType = deck.w * 9 === deck.h * 16 ? '' : deck.w * 3 === deck.h * 4 ? ' type="screen4x3"' : ' type="custom"';
  const defStyle = `<p:defaultTextStyle>${levelsXml(deck.masters[0]!.textStyles.other, ctxFor(presPath, presRels))}</p:defaultTextStyle>`;
  const notesId = hasNotes ? `<p:notesMasterIdLst><p:notesMasterId r:id="${presRels.add(REL.notesMaster, nmPath)}"/></p:notesMasterIdLst>` : '';
  const pres = XML_HEAD + `<p:presentation ${NSDECL}${deck.rtl ? ' rtl="1"' : ''} saveSubsetFonts="1"><p:sldMasterIdLst>${masterIdList.join('')}</p:sldMasterIdLst>${notesId}`
    + `<p:sldIdLst>${sldIds.join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"${sizeType}/><p:notesSz cx="${H}" cy="${W}"/>${custShows}${defStyle}${secs}</p:presentation>`;
  const mainType = kind === 'template' ? CT.template : kind === 'show' ? CT.show : CT.presentation;
  pw.put(presPath, pres, mainType);
  pw.overrides.set(presPath, mainType);

  // ---------- docProps ----------
  const p = deck.props;
  pw.put('docProps/core.xml', XML_HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + (p.title ? `<dc:title>${esc(p.title)}</dc:title>` : '') + (p.subject ? `<dc:subject>${esc(p.subject)}</dc:subject>` : '') + (p.author ? `<dc:creator>${esc(p.author)}</dc:creator>` : '')
    + (p.keywords ? `<cp:keywords>${esc(p.keywords)}</cp:keywords>` : '') + (p.description ? `<dc:description>${esc(p.description)}</dc:description>` : '')
    + (p.lastModifiedBy ? `<cp:lastModifiedBy>${esc(p.lastModifiedBy)}</cp:lastModifiedBy>` : '') + (p.category ? `<cp:category>${esc(p.category)}</cp:category>` : '')
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${iso(p.created)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso(p.modified)}</dcterms:modified>`
    + (deck.final ? '<cp:contentStatus>Final</cp:contentStatus>' : '') + '</cp:coreProperties>', CT.core);
  pw.overrides.set('docProps/core.xml', CT.core);
  const titles = deck.slides.map((s, i) => titleOf(s) || `Slide ${i + 1}`);
  pw.put('docProps/app.xml', XML_HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    + `<Application>${esc(opts.appName ?? 'ClerdoFrame')}</Application><PresentationFormat>${deck.w * 9 === deck.h * 16 ? 'Widescreen' : 'Custom'}</PresentationFormat><Slides>${deck.slides.length}</Slides><Notes>${deck.slides.filter((s) => s.notes.paras.some((x) => x.runs.some((r) => r.text))).length}</Notes><HiddenSlides>${deck.slides.filter((s) => s.hidden).length}</HiddenSlides>`
    + `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant><vt:variant><vt:i4>${titles.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>`
    + `<TitlesOfParts><vt:vector size="${titles.length}" baseType="lpstr">${titles.map((t) => `<vt:lpstr>${esc(t.slice(0, 255))}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>`
    + (p.company ? `<Company>${esc(p.company)}</Company>` : '') + '<AppVersion>16.0000</AppVersion></Properties>', CT.app);
  pw.overrides.set('docProps/app.xml', CT.app);
  return pw.zip();
};

const titleOf = (s: Slide): string => {
  const t = s.shapes.find((x) => x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle'));
  return t && t.kind === 'shape' ? (t.text?.paras ?? []).map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim() : '';
};

const transitionFor = (s: Slide): string => transitionXmlFor(s.transition);

const keptTiming = (s: Slide, rels: RelSet, exists: (p: string) => boolean): string => {
  const raw = s.keep?.timing;
  if (!raw) return '';
  return remapRels(raw, parseKeptRels(s.keep?.['timing.rels']), rels, exists);
};

const layoutXml = (l: Layout, c: ShapeWriteCtx): string =>
  XML_HEAD + `<p:sldLayout ${NSDECL} type="${esc(l.type || 'cust')}" preserve="1"${l.hideMasterGraphics ? ' showMasterSp="0"' : ''}><p:cSld name="${esc(l.name || 'Layout')}">${bgXml(l.background, c)}${treeXml(l.shapes, c)}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const notesSlideXml = (notes: TextBody, c: ShapeWriteCtx): string =>
  XML_HEAD + `<p:notes ${NSDECL}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>`
  + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
  + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>${textBodyXml('p:txBody', { paras: notes.paras }, c)}</p:sp>`
  + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>';

const notesMasterXml = (deck: Deck): string => {
  // Portrait page with the slide image above the notes body.
  const PW = 6858000, PH = 9144000;
  const iw = 5486400, ih = Math.round((iw * deck.h) / deck.w);
  const sp = (id: number, name: string, ph: string, x: number, y: number, w: number, h: number, body = false) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${body ? '' : '<a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln>'}</p:spPr>${body ? '<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Notes</a:t></a:r></a:p></p:txBody>' : ''}</p:sp>`;
  const lvl = Array.from({ length: 9 }, (_, i) => `<a:lvl${i + 1}pPr marL="${i * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${i + 1}pPr>`).join('');
  return XML_HEAD + `<p:notesMaster ${NSDECL}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`
    + sp(2, 'Slide Image Placeholder 1', '<p:ph type="sldImg" idx="2"/>', (PW - iw) / 2, 685800, iw, ih)
    + sp(3, 'Notes Placeholder 2', '<p:ph type="body" sz="quarter" idx="3"/>', 685800, 685800 + ih + 228600, PW - 1371600, PH - ih - 2057400, true)
    + `</p:spTree></p:cSld>${CLRMAP}<p:notesStyle>${lvl}</p:notesStyle></p:notesMaster>`;
};

const sectionsXml = (deck: Deck, ids: Map<string, number>): string => {
  if (!deck.sections.length) return '';
  const order = deck.slides.map((s) => s.id);
  const starts = deck.sections.map((s) => ({ s, i: order.indexOf(s.first) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  if (!starts.length) return '';
  const list = starts.map(({ s, i }, k) => {
    const end = starts[k + 1]?.i ?? order.length;
    const sl = order.slice(k === 0 ? 0 : i, end).map((id) => `<p14:sldId id="${ids.get(id)}"/>`).join('');
    return `<p14:section name="${esc(s.name)}" id="{${guidFrom(s.id)}}"><p14:sldIdLst>${sl}</p14:sldIdLst></p14:section>`;
  }).join('');
  return `<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst xmlns:p14="${NS.p14}">${list}</p14:sectionLst></p:ext></p:extLst>`;
};

const guidFrom = (s: string): string => {
  let h = 2166136261;
  const hex: string[] = [];
  for (let k = 0; k < 4; k++) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) + k; h = Math.imul(h, 16777619); } hex.push((h >>> 0).toString(16).padStart(8, '0').toUpperCase()); }
  const x = hex.join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-A${x.slice(17, 20)}-${x.slice(20, 32)}`;
};

const presPropsXml = (deck: Deck): string => {
  const s = deck.show;
  const type = s.type === 'kiosk' ? '<p:kiosk/>' : s.type === 'browsed' ? '<p:browse/>' : '<p:present/>';
  const range = s.customShow ? `<p:custShow id="${Math.max(0, deck.customShows.findIndex((c) => c.id === s.customShow))}"/>` : s.range ? `<p:sldRg st="${s.range.from}" end="${s.range.to}"/>` : '<p:sldAll/>';
  return XML_HEAD + `<p:presentationPr ${NSDECL}><p:showPr${s.loop ? ' loop="1"' : ''}${s.noNarration ? ' showNarration="0"' : ' showNarration="1"'}${s.noAnimation ? ' showAnimation="0"' : ''}${s.useTimings === false ? ' useTimings="0"' : ''}>${type}${range}${s.penColor ? `<p:penClr>${fillXml({ type: 'solid', color: s.penColor }, { mediaRel: () => undefined }).replace(/^<a:solidFill>|<\/a:solidFill>$/g, '')}</p:penClr>` : '<p:penClr><a:prstClr val="red"/></p:penClr>'}</p:showPr></p:presentationPr>`;
};

export type { TextWriteCtx };
