// Writes shape trees (p:spTree) for slides, layouts and masters.
import type { AutoShape, ParaStyle, Chart, Diagram, Equation, Group, Hyperlink, Ink, Media, Ole, Picture, Shape, Table, Zoom } from '../../model/deck';
import { esc } from '../xml';
import { chartSpaceXml, chartWorkbookFiles } from './chart';
import { colorXml, cropXml, effectsXml, emu, fillXml, lineXml, type WriteCtx } from './dml';
import { custGeomXml } from './geom';
import { CT, REL, parseKeptRels, remapRels, type PackageWriter, type RelSet } from './opc';
import { bodyPrXml, listStyleXml, textBodyXml, type TextWriteCtx } from './text';
import { zipSync, strToU8 } from 'fflate';

export interface ShapeWriteCtx extends TextWriteCtx {
  pw: PackageWriter;
  rels: RelSet;
  /** Next drawing id within the part. */
  nextId: () => number;
  /** Our shape id -> written cNvPr id (for connectors and animations). */
  idMap: Map<string, number>;
  /** Package path of a slide (for in-deck links). */
  slidePath: (id: string) => string | undefined;
  /** Renders diagram shapes when a diagram must be written as a group. */
  diagramShapes?: (d: Diagram) => Shape[];
  mediaItem: (id: string) => { path: string } | undefined;
  placeholderPoster: () => string | undefined;
  keptExists: (path: string) => boolean;
  /** Writing a layout or master: placeholder paragraph defaults become the list style slides inherit. */
  onMaster?: boolean;
}

/** The written id of a shape (pre-assigned for the whole tree so connectors can point forward). */
const idFor = (s: Shape, c: ShapeWriteCtx): number => {
  const hit = c.idMap.get(s.id);
  if (hit !== undefined) return hit;
  const id = c.nextId();
  c.idMap.set(s.id, id);
  return id;
};

const off = (s: { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean }, tag = 'a:xfrm', ch?: { x: number; y: number; w: number; h: number }): string => {
  const a = `${s.rot ? ` rot="${Math.round((((s.rot % 360) + 360) % 360) * 60000)}"` : ''}${s.flipH ? ' flipH="1"' : ''}${s.flipV ? ' flipV="1"' : ''}`;
  return `<${tag}${a}><a:off x="${emu(s.x)}" y="${emu(s.y)}"/><a:ext cx="${Math.max(0, emu(s.w))}" cy="${Math.max(0, emu(s.h))}"/>`
    + (ch ? `<a:chOff x="${emu(ch.x)}" y="${emu(ch.y)}"/><a:chExt cx="${Math.max(0, emu(ch.w))}" cy="${Math.max(0, emu(ch.h))}"/>` : '') + `</${tag}>`;
};

const linkXml = (tag: string, l: Hyperlink | undefined, c: ShapeWriteCtx): string => {
  if (!l) return '';
  const x = c.link(l);
  return x ? `<a:${tag} r:id="${x.rid}"${x.action ? ` action="${esc(x.action)}"` : ''}${l.tooltip ? ` tooltip="${esc(l.tooltip)}"` : ''}/>` : '';
};

const cNvPr = (s: Shape, c: ShapeWriteCtx): string => {
  const id = idFor(s, c);
  const inner = linkXml('hlinkClick', s.link, c) + (s.decorative ? '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>' : '');
  const a = ` id="${id}" name="${esc(s.name || `${s.kind} ${id}`)}"${s.alt ? ` descr="${esc(s.alt)}"` : ''}${s.hidden ? ' hidden="1"' : ''}`;
  return inner ? `<p:cNvPr${a}>${inner}</p:cNvPr>` : `<p:cNvPr${a}/>`;
};

const phXml = (s: Shape): string => {
  if (!s.ph) return '';
  const t = s.ph.type === 'obj' ? '' : ` type="${s.ph.type}"`;
  return `<p:ph${t}${s.ph.idx !== undefined ? ` idx="${s.ph.idx}"` : ''}${s.ph.type === 'obj' && s.ph.idx === undefined ? ' idx="1"' : ''}/>`;
};
const nvPr = (s: Shape, extra = ''): string => {
  const ph = phXml(s);
  return ph || extra ? `<p:nvPr>${ph}${extra}</p:nvPr>` : '<p:nvPr/>';
};

const geomXml = (s: AutoShape): string => {
  if (s.geom === 'custom' && s.path?.length) return custGeomXml(s.path);
  const adj = s.adj && Object.keys(s.adj).length ? Object.entries(s.adj).map(([k, v]) => `<a:gd name="${esc(k)}" fmla="val ${Math.round(v)}"/>`).join('') : '';
  return `<a:prstGeom prst="${esc(s.geom === 'custom' ? 'rect' : s.geom || 'rect')}"><a:avLst>${adj}</a:avLst></a:prstGeom>`;
};

/** List style of a layout or master placeholder from its per-level paragraph styles. */
const phListStyle = (s: AutoShape, c: ShapeWriteCtx): string => {
  if (s.text?.levels?.some((l) => l && Object.keys(l).length)) return '';
  const levels: ParaStyle[] = [];
  for (const p of s.text?.paras ?? []) {
    const lv = p.style?.level ?? 0;
    if (p.style && !levels[lv]) levels[lv] = { ...p.style, level: undefined };
  }
  // Subtitles and section text take no bullets unless they ask for them.
  if (s.ph && (s.ph.type === 'subTitle' || s.ph.type === 'ctrTitle' || s.ph.type === 'title') && !levels[0]?.bullet) levels[0] = { marginLeft: 0, indent: 0, ...(levels[0] ?? {}), bullet: { type: 'none' } };
  return levels.some(Boolean) ? listStyleXml(levels, c) : '';
};

const spXml = (s: AutoShape, c: ShapeWriteCtx): string => {
  const isCxn = !!s.conn || /Connector\d?$/.test(s.geom);
  const nv = cNvPr(s, c);
  let spPr = '';
  // Placeholders without their own box inherit it: leave xfrm out.
  if (!(s.ph && !s.w && !s.h)) spPr += off(s);
  if (!(s.ph && s.geom === 'rect' && !s.path)) spPr += geomXml(s);
  else if (s.ph && s.geom !== 'rect') spPr += geomXml(s);
  spPr += fillXml(s.fill?.type === 'background' ? undefined : s.fill, c);
  if (s.fill?.type === 'background') spPr = spPr.replace(/$/, '');
  spPr += lineXml(s.line, c) + effectsXml(s.effects);
  const spPrXml = `<p:spPr${s.fill?.type === 'background' ? ' bwMode="auto"' : ''}>${spPr}</p:spPr>`;
  const style = s.styleRef && !s.ph
    ? `<p:style><a:lnRef idx="${s.styleRef.line ? 2 : 0}">${colorXml({ theme: s.styleRef.line ?? 'accent1', lum: s.styleRef.line ? -0.5 : undefined })}</a:lnRef><a:fillRef idx="${s.styleRef.fill ? 1 : 0}">${colorXml({ theme: s.styleRef.fill ?? 'accent1' })}</a:fillRef><a:effectRef idx="0">${colorXml({ theme: s.styleRef.fill ?? 'accent1' })}</a:effectRef><a:fontRef idx="minor">${colorXml({ theme: s.styleRef.font ?? 'lt1' })}</a:fontRef></p:style>`
    : '';
  if (isCxn) {
    const cx = (k: 'stCxn' | 'endCxn', e: { shape: string; site: number } | undefined) => {
      const id = e ? c.idMap.get(e.shape) : undefined;
      return id ? `<a:${k} id="${id}" idx="${e!.site}"/>` : '';
    };
    const ends = cx('stCxn', s.conn?.start) + cx('endCxn', s.conn?.end);
    return `<p:cxnSp><p:nvCxnSpPr>${nv}<p:cNvCxnSpPr>${ends}</p:cNvCxnSpPr>${nvPr(s)}</p:nvCxnSpPr>${spPrXml}${style}</p:cxnSp>`;
  }
  const locks = s.ph ? '<a:spLocks noGrp="1"/>' : '';
  const cNvSpPr = s.textbox ? '<p:cNvSpPr txBox="1"/>' : locks ? `<p:cNvSpPr>${locks}</p:cNvSpPr>` : '<p:cNvSpPr/>';
  const tx = s.text || s.ph || s.textbox ? textBodyXml('p:txBody', s.text ?? { paras: [{ runs: [] }] }, c, c.onMaster && s.ph ? phListStyle(s, c) : '') : '';
  return `<p:sp><p:nvSpPr>${nv}${cNvSpPr}${nvPr(s)}</p:nvSpPr>${spPrXml}${style}${tx}</p:sp>`;
};

const blipXml = (rid: string, p?: Picture): string => {
  const a = p?.adjust;
  let inner = '';
  if (a?.transparency) inner += `<a:alphaModFix amt="${Math.round((1 - a.transparency / 100) * 100000)}"/>`;
  if (a?.grayscale) inner += '<a:grayscl/>';
  if (a?.brightness || a?.contrast) inner += `<a:lum${a.brightness ? ` bright="${Math.round(a.brightness * 1000)}"` : ''}${a.contrast ? ` contrast="${Math.round(a.contrast * 1000)}"` : ''}/>`;
  return inner ? `<a:blip r:embed="${rid}">${inner}</a:blip>` : `<a:blip r:embed="${rid}"/>`;
};

const picXml = (p: Picture, c: ShapeWriteCtx): string => {
  const rid = c.mediaRel(p.cutout ?? p.media);
  const nv = `<p:nvPicPr>${cNvPr(p, c)}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>${nvPr(p)}</p:nvPicPr>`;
  const fill = rid ? `<p:blipFill>${blipXml(rid, p)}${cropXml(p.crop)}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` : '<p:blipFill><a:blip/><a:stretch><a:fillRect/></a:stretch></p:blipFill>';
  return `<p:pic>${nv}${fill}<p:spPr>${off(p)}<a:prstGeom prst="${esc(p.geom ?? 'rect')}"><a:avLst/></a:prstGeom>${lineXml(p.line, c)}${effectsXml(p.effects)}</p:spPr></p:pic>`;
};

const mediaXml = (m: Media, c: ShapeWriteCtx): string => {
  const item = c.mediaItem(m.media);
  const poster = m.poster ? c.mediaRel(m.poster) : c.placeholderPoster();
  if (!item) return '';
  const linkRid = c.rels.add(m.mediaType === 'audio' ? REL.audio : REL.video, item.path);
  const embRid = c.rels.add(REL.media, item.path);
  const trim = m.trim ? `<p14:trim${m.trim.start ? ` st="${Math.round(m.trim.start * 1000)}"` : ''}${m.trim.end ? ` end="${Math.round(m.trim.end * 1000)}"` : ''}/>` : '';
  const fade = m.fadeIn || m.fadeOut ? `<p14:fade${m.fadeIn ? ` in="${Math.round(m.fadeIn * 1000)}"` : ''}${m.fadeOut ? ` out="${Math.round(m.fadeOut * 1000)}"` : ''}/>` : '';
  const ext = `<p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="${embRid}">${trim}${fade}</p14:media></p:ext></p:extLst>`;
  const file = m.mediaType === 'audio' ? `<a:audioFile r:link="${linkRid}"/>` : `<a:videoFile r:link="${linkRid}"/>`;
  const id = idFor(m, c);
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(m.name || (m.mediaType === 'audio' ? 'Audio' : 'Video'))}"${m.alt ? ` descr="${esc(m.alt)}"` : ''}${m.hidden ? ' hidden="1"' : ''}><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr>${file}${ext}</p:nvPr></p:nvPicPr>`
    + `<p:blipFill>${poster ? `<a:blip r:embed="${poster}"/>` : '<a:blip/>'}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${off(m)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
};

const cellXml = (cell: Table['rows'][number]['cells'][number], c: ShapeWriteCtx): string => {
  const a = `${cell.gridSpan && cell.gridSpan > 1 ? ` gridSpan="${cell.gridSpan}"` : ''}${cell.rowSpan && cell.rowSpan > 1 ? ` rowSpan="${cell.rowSpan}"` : ''}${cell.hMerge ? ' hMerge="1"' : ''}${cell.vMerge ? ' vMerge="1"' : ''}`;
  const m = cell.margin;
  const pa = `${m ? ` marL="${emu(m.l)}" marR="${emu(m.r)}" marT="${emu(m.t)}" marB="${emu(m.b)}"` : ''}${cell.vAlign ? ` anchor="${cell.vAlign}"` : ''}`;
  let pr = '';
  const b = cell.borders;
  for (const [k, tag] of [['l', 'lnL'], ['r', 'lnR'], ['t', 'lnT'], ['b', 'lnB'], ['tl2br', 'lnTlToBr'], ['bl2tr', 'lnBlToTr']] as const) {
    const l = b?.[k];
    if (l) pr += lineXml(l, c).replace(/^<a:ln /, `<a:${tag} `).replace(/<\/a:ln>$/, `</a:${tag}>`);
  }
  pr += fillXml(cell.fill, c);
  return `<a:tc${a}>${textBodyXml('a:txBody', cell.text, c)}${pr || pa ? `<a:tcPr${pa}>${pr}</a:tcPr>` : '<a:tcPr/>'}</a:tc>`;
};

const tableXml = (t: Table, c: ShapeWriteCtx): string => {
  const id = idFor(t, c);
  const o = t.opts ?? {};
  const pr = `<a:tblPr${o.firstRow ? ' firstRow="1"' : ''}${o.lastRow ? ' lastRow="1"' : ''}${o.firstCol ? ' firstCol="1"' : ''}${o.lastCol ? ' lastCol="1"' : ''}${o.bandRow ? ' bandRow="1"' : ''}${o.bandCol ? ' bandCol="1"' : ''}>${t.style && /^\{[0-9A-F-]+\}$/i.test(t.style) ? `<a:tableStyleId>${t.style}</a:tableStyleId>` : ''}</a:tblPr>`;
  const grid = `<a:tblGrid>${t.cols.map((w) => `<a:gridCol w="${emu(w)}"/>`).join('')}</a:tblGrid>`;
  const rows = t.rows.map((r) => {
    const cells = r.cells.slice(0, t.cols.length);
    while (cells.length < t.cols.length) cells.push({ text: { paras: [{ runs: [] }] } });
    return `<a:tr h="${emu(r.h)}">${cells.map((cell) => cellXml(cell, c)).join('')}</a:tr>`;
  }).join('');
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(t.name || 'Table')}"${t.alt ? ` descr="${esc(t.alt)}"` : ''}/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>${nvPr(t)}</p:nvGraphicFramePr>`
    + `${off(t, 'p:xfrm')}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>${pr}${grid}${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
};

const chartXml = (ch: Chart, c: ShapeWriteCtx): string => {
  const id = idFor(ch, c);
  const path = c.pw.unique('ppt/charts/', 'chart', 'xml');
  const crels = c.pw.relsFor(path);
  const book = c.pw.unique('ppt/embeddings/', 'Microsoft_Excel_Worksheet', 'xlsx');
  const enc = chartWorkbookFiles(ch);
  const z = zipSync(Object.fromEntries(Object.entries(enc).map(([k, v]) => [k, strToU8(v)])));
  c.pw.put(book, z, CT.xlsx);
  const brid = crels.add(REL.package, book);
  c.pw.put(path, chartSpaceXml(ch, { workbookRel: brid }), CT.chart);
  const rid = c.rels.add(REL.chart, path);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(ch.name || 'Chart')}"${ch.alt ? ` descr="${esc(ch.alt)}"` : ''}/><p:cNvGraphicFramePr/>${nvPr(ch)}</p:nvGraphicFramePr>${off(ch, 'p:xfrm')}`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`;
};

const groupXml = (g: Group, c: ShapeWriteCtx, name?: string): string => {
  const id = idFor(g, c);
  const cb = g.childBox ?? { x: g.x, y: g.y, w: g.w, h: g.h };
  const kids = g.children.map((k) => shapeXml(k, c)).join('');
  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${esc(name ?? (g.name || 'Group'))}"${g.alt ? ` descr="${esc(g.alt)}"` : ''}${g.hidden ? ' hidden="1"' : ''}/><p:cNvGrpSpPr/>${nvPr(g)}</p:nvGrpSpPr><p:grpSpPr>${off(g, 'a:xfrm', cb)}${effectsXml(g.effects)}</p:grpSpPr>${kids}</p:grpSp>`;
};

const asGroup = (s: Shape, children: Shape[], childBox?: Group['childBox']): Group => ({
  id: s.id, kind: 'group', name: s.name, x: s.x, y: s.y, w: s.w, h: s.h, ...(s.rot ? { rot: s.rot } : {}), ...(s.alt ? { alt: s.alt } : {}),
  children, childBox: childBox ?? { x: 0, y: 0, w: s.w, h: s.h },
});

const diagramXml = (d: Diagram, c: ShapeWriteCtx): string => {
  const shapes = d.cached?.length ? d.cached : c.diagramShapes?.(d) ?? [];
  if (!shapes.length) return '';
  // Cached drawings from opened files are in the diagram's own space (0..w, 0..h).
  return groupXml(asGroup(d, shapes), c, d.name || 'Diagram');
};

const inkXml = (k: Ink, c: ShapeWriteCtx): string => {
  // Strokes as open custom paths so they keep their look in other apps.
  const children: AutoShape[] = k.strokes.map((s, i) => {
    const pts = s.points;
    const d = pts.map(([x, y], j) => `${j ? 'L' : 'M'}${x - k.x} ${y - k.y}`).join('');
    return {
      id: `${k.id}-${i}`, kind: 'shape', name: `Ink ${i + 1}`, x: 0, y: 0, w: k.w, h: k.h, geom: 'custom', path: [{ d: d || 'M0 0', w: k.w || 1, h: k.h || 1 }],
      fill: { type: 'none' }, line: { fill: { type: 'solid', color: s.color }, width: s.width * 0.75, cap: 'round', join: 'round' },
    };
  });
  void inkPointsAbsolute;
  return groupXml(asGroup(k, children), c, k.name || 'Ink');
};
// Ink stroke points are in slide coordinates when the stroke box sits at the shape origin.
const inkPointsAbsolute = true;

const equationXml = (e: Equation, c: ShapeWriteCtx): string => {
  const s: AutoShape = {
    id: e.id, kind: 'shape', name: e.name || 'Equation', x: e.x, y: e.y, w: e.w, h: e.h, geom: 'rect', textbox: true, fill: { type: 'none' },
    text: { paras: [{ runs: [{ text: e.linear, style: { font: 'Cambria Math', size: e.size || 28, ...(e.color !== undefined ? { color: e.color } : {}) } }], style: { align: 'ctr' } }], vAlign: 'ctr', wrap: false },
  };
  return spXml(s, c);
};

const previewXml = (s: Ole | Zoom, c: ShapeWriteCtx): string => {
  if (!s.preview) return '';
  const p: Picture = { id: s.id, kind: 'picture', name: s.name || 'Object', x: s.x, y: s.y, w: s.w, h: s.h, media: s.preview, ...(s.link ? { link: s.link } : {}) };
  if (s.kind === 'zoom') {
    const path = c.slidePath(s.target);
    if (path && !p.link) p.link = { action: 'slide', slide: s.target };
  }
  return picXml(p, c);
};

/** Shapes kept from an opened file as raw XML (with the relationships they used). */
const keptXml = (s: Shape, c: ShapeWriteCtx): string | null => {
  const raw = s.keep?.xml;
  if (!raw) return null;
  const rels = parseKeptRels(s.keep?.['xml.rels']);
  return remapRels(raw, rels, c.rels, (p) => c.pw.has(p) || c.keptExists(p));
};

export const shapeXml = (s: Shape, c: ShapeWriteCtx): string => {
  const kept = keptXml(s, c);
  if (kept !== null) return kept;
  switch (s.kind) {
    case 'shape': return spXml(s, c);
    case 'picture': return picXml(s, c);
    case 'table': return tableXml(s, c);
    case 'chart': return chartXml(s, c);
    case 'group': return groupXml(s, c);
    case 'media': return mediaXml(s, c);
    case 'diagram': return diagramXml(s, c);
    case 'ink': return inkXml(s, c);
    case 'equation': return equationXml(s, c);
    case 'ole': case 'zoom': return previewXml(s, c);
    default: return '';
  }
};

export const treeXml = (shapes: Shape[], c: ShapeWriteCtx): string =>
  '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
  + preassign(shapes, c).map((s) => shapeXml(s, c)).join('') + '</p:spTree>';

const preassign = (shapes: Shape[], c: ShapeWriteCtx): Shape[] => {
  const walk = (list: Shape[]) => { for (const s of list) { idFor(s, c); if (s.kind === 'group') walk(s.children); } };
  walk(shapes);
  return shapes;
};

export { bodyPrXml };
export type { WriteCtx };
