// OpenDocument presentation export (OASIS ODF 1.2, Part 1 section 9): slides as draw:page with
// text frames, basic shapes, tables as text, and pictures. Formatting is kept simple on purpose.
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { AutoShape, Color, Deck, Fill, Paragraph, Shape, Theme } from '../model/deck';
import { esc } from './xml';
import { layoutDiagram } from '../features/diagrams/layout';
import { colorHex } from './pptx/dml';
import { extFor } from './pptx/opc';

const cm = (px: number): string => `${(Math.round((px / 96) * 2.54 * 1000) / 1000)}cm`;
const hexOf = (c: Color | undefined, t: Theme): string => {
  if (c === undefined) return '#000000';
  const scheme = Object.fromEntries(Object.entries(t.colors).map(([k, v]) => [k, v.replace('#', '')]));
  return colorHex(c, { scheme, clrMap: { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' } });
};

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"';

const GEOM: Record<string, string> = { ellipse: 'ellipse', roundRect: 'round-rectangle', triangle: 'isosceles-triangle', rtTriangle: 'right-triangle', diamond: 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', octagon: 'octagon', star5: 'star5', rightArrow: 'right-arrow', leftArrow: 'left-arrow', upArrow: 'up-arrow', downArrow: 'down-arrow', heart: 'heart', cloud: 'cloud', can: 'can', cube: 'cube' };

export const writeOdp = (deck: Deck): Uint8Array => {
  const files: Zippable = {};
  const styles: string[] = [];
  let sn = 0;
  const media = new Map<string, string>();
  const mediaPath = (id: string): string | undefined => {
    const hit = media.get(id);
    if (hit) return hit;
    const m = deck.media[id];
    if (!m || !/^image\/(png|jpeg|gif|svg\+xml)$/.test(m.type)) return undefined;
    const p = `Pictures/image${media.size + 1}.${extFor(m.type, m.name)}`;
    files[p] = [m.data, { level: 0 }];
    media.set(id, p);
    return p;
  };
  const graphicStyle = (fill: Fill | undefined, s: AutoShape | null, theme: Theme): string => {
    const name = `gr${++sn}`;
    let p = '';
    if (fill?.type === 'solid') p += ` draw:fill="solid" draw:fill-color="${hexOf(fill.color, theme)}"`;
    else if (fill?.type === 'gradient') p += ` draw:fill="solid" draw:fill-color="${hexOf(fill.stops[0]?.color, theme)}"`;
    else p += ' draw:fill="none"';
    const l = s?.line;
    if (l && l.fill.type === 'solid' && l.width > 0) p += ` draw:stroke="solid" svg:stroke-color="${hexOf(l.fill.color, theme)}" svg:stroke-width="${cm((l.width * 96) / 72)}"`;
    else p += ' draw:stroke="none"';
    const va = s?.text?.vAlign === 'ctr' ? 'middle' : s?.text?.vAlign === 'b' ? 'bottom' : 'top';
    styles.push(`<style:style style:name="${name}" style:family="graphic"><style:graphic-properties${p} draw:textarea-vertical-align="${va}" fo:padding="0.1cm"/></style:style>`);
    return name;
  };
  const textStyle = (size: number | undefined, bold: boolean | undefined, italic: boolean | undefined, color: string | undefined, font: string | undefined): string => {
    const name = `T${++sn}`;
    styles.push(`<style:style style:name="${name}" style:family="text"><style:text-properties${size ? ` fo:font-size="${size}pt"` : ''}${bold ? ' fo:font-weight="bold"' : ''}${italic ? ' fo:font-style="italic"' : ''}${color ? ` fo:color="${color}"` : ''}${font ? ` style:font-name="${esc(font)}" fo:font-family="${esc(font)}"` : ''}/></style:style>`);
    return name;
  };
  const paraStyle = (align: string | undefined): string => {
    const name = `P${++sn}`;
    const a = align === 'ctr' ? 'center' : align === 'r' ? 'end' : align === 'just' ? 'justify' : 'start';
    styles.push(`<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties fo:text-align="${a}"/></style:style>`);
    return name;
  };
  const parasXml = (paras: Paragraph[], theme: Theme, isTitle: boolean): string => paras.map((p) => {
    const ps = paraStyle(p.style?.align);
    const runs = p.runs.map((r) => {
      if (r.br) return '<text:line-break/>';
      const st = r.style ?? {};
      const font = st.font?.startsWith('+mj') ? theme.fonts.major : st.font?.startsWith('+mn') ? theme.fonts.minor : st.font;
      const ts = textStyle(st.size ?? (isTitle ? 40 : undefined), st.bold, st.italic, st.color !== undefined ? hexOf(st.color, theme) : undefined, font);
      const t = esc(r.text).replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`).replace(/\t/g, '<text:tab/>');
      const inner = `<text:span text:style-name="${ts}">${t}</text:span>`;
      return st.link?.url && /^(https:|mailto:)/i.test(st.link.url) ? `<text:a xlink:type="simple" xlink:href="${esc(st.link.url)}">${inner}</text:a>` : inner;
    }).join('');
    return `<text:p text:style-name="${ps}">${runs}</text:p>`;
  }).join('');

  const shapeXml = (s: Shape, theme: Theme, ox = 0, oy = 0, sx = 1, sy = 1): string => {
    if (s.hidden) return '';
    const x = ox + s.x * sx, y = oy + s.y * sy, w = s.w * sx, h = s.h * sy;
    // Rotation is left out: this export keeps positions, text and pictures.
    const frame = `svg:x="${cm(x)}" svg:y="${cm(y)}" svg:width="${cm(Math.max(1, w))}" svg:height="${cm(Math.max(1, h))}"`;
    const name = esc(s.name);
    const title = s.alt ? `<svg:title>${esc(s.alt)}</svg:title>` : '';
    switch (s.kind) {
      case 'shape': {
        const isTitle = s.ph?.type === 'title' || s.ph?.type === 'ctrTitle';
        const gs = graphicStyle(s.fill, s, theme);
        const text = s.text ? parasXml(s.text.paras, theme, isTitle) : '';
        const geom = GEOM[s.geom];
        if (!s.text && /line|Connector/.test(s.geom)) {
          return `<draw:line draw:name="${name}" draw:style-name="${gs}" svg:x1="${cm(x)}" svg:y1="${cm(y)}" svg:x2="${cm(x + w)}" svg:y2="${cm(y + h)}"/>`;
        }
        if (s.geom === 'rect' || s.textbox || !geom) {
          if (s.geom === 'custom' && s.path?.length && !s.text) {
            const p = s.path[0]!;
            return `<draw:path draw:name="${name}" draw:style-name="${gs}" ${frame} svg:viewBox="0 0 ${Math.round(p.w)} ${Math.round(p.h)}" svg:d="${esc(p.d)}">${title}</draw:path>`;
          }
          if (s.ph || s.textbox || (s.text && (!s.fill || s.fill.type === 'none'))) {
            const cls = s.ph ? ` presentation:class="${isTitle ? 'title' : s.ph.type === 'subTitle' ? 'subtitle' : 'outline'}"` : '';
            return `<draw:frame draw:name="${name}" draw:style-name="${gs}" ${frame}${cls}><draw:text-box>${text}</draw:text-box>${title}</draw:frame>`;
          }
          return `<draw:rect draw:name="${name}" draw:style-name="${gs}" ${frame}>${title}${text}</draw:rect>`;
        }
        if (geom === 'ellipse') return `<draw:ellipse draw:name="${name}" draw:style-name="${gs}" ${frame}>${title}${text}</draw:ellipse>`;
        return `<draw:custom-shape draw:name="${name}" draw:style-name="${gs}" ${frame}>${title}${text}<draw:enhanced-geometry draw:type="${geom}"/></draw:custom-shape>`;
      }
      case 'picture': {
        const p = mediaPath(s.media);
        return p ? `<draw:frame draw:name="${name}" ${frame}><draw:image xlink:href="${p}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${title}</draw:frame>` : '';
      }
      case 'group': {
        const cb = s.childBox ?? { x: s.x, y: s.y, w: s.w, h: s.h };
        const gx = cb.w ? (w / cb.w) : 1, gy = cb.h ? (h / cb.h) : 1;
        return `<draw:g draw:name="${name}">${s.children.map((c) => shapeXml(c, theme, x - cb.x * gx, y - cb.y * gy, gx, gy)).join('')}</draw:g>`;
      }
      case 'table': {
        const rows = s.rows.map((r) => `<table:table-row>${r.cells.map((c) => (c.hMerge || c.vMerge ? '<table:covered-table-cell/>' : `<table:table-cell${c.gridSpan ? ` table:number-columns-spanned="${c.gridSpan}"` : ''}${c.rowSpan ? ` table:number-rows-spanned="${c.rowSpan}"` : ''}>${parasXml(c.text.paras, theme, false)}</table:table-cell>`)).join('')}</table:table-row>`).join('');
        return `<draw:frame draw:name="${name}" ${frame}><table:table>${s.cols.map(() => '<table:table-column/>').join('')}${rows}</table:table></draw:frame>`;
      }
      case 'ole': case 'zoom': {
        const p = s.preview ? mediaPath(s.preview) : undefined;
        return p ? `<draw:frame draw:name="${name}" ${frame}><draw:image xlink:href="${p}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>` : '';
      }
      case 'equation': {
        const gs = graphicStyle(undefined, null, theme);
        return `<draw:frame draw:name="${name}" draw:style-name="${gs}" ${frame}><draw:text-box><text:p>${esc(s.linear)}</text:p></draw:text-box></draw:frame>`;
      }
      case 'diagram': {
        const shapes = s.cached?.length ? s.cached : layoutDiagram(s, theme);
        return `<draw:g draw:name="${name}">${shapes.map((c) => shapeXml(c, theme, x, y, 1, 1)).join('')}</draw:g>`;
      }
      case 'media': {
        const p = s.poster ? mediaPath(s.poster) : undefined;
        return p ? `<draw:frame draw:name="${name}" ${frame}><draw:image xlink:href="${p}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>` : '';
      }
      default: return '';
    }
  };

  const pageStyles: string[] = [];
  const pages = deck.slides.map((s, i) => {
    let master = deck.masters[0]!;
    for (const m of deck.masters) if (m.layouts.some((l) => l.id === s.layout)) master = m;
    const layout = master.layouts.find((l) => l.id === s.layout);
    const bg = s.background?.fill ?? layout?.background?.fill ?? master.background.fill;
    const ps = `dp${i + 1}`;
    const fill = bg.type === 'solid' ? ` draw:fill="solid" draw:fill-color="${hexOf(bg.color, master.theme)}"` : bg.type === 'gradient' ? ` draw:fill="solid" draw:fill-color="${hexOf(bg.stops[0]?.color, master.theme)}"` : ' draw:fill="none"';
    pageStyles.push(`<style:style style:name="${ps}" style:family="drawing-page"><style:drawing-page-properties${fill} presentation:visibility="${s.hidden ? 'hidden' : 'visible'}" draw:background-size="full"/></style:style>`);
    // Master and layout decoration is drawn on each page, then the slide's own shapes.
    const deco = [...(layout?.hideMasterGraphics || s.background?.hideMasterGraphics ? [] : master.shapes.filter((x) => !x.ph)), ...(layout?.shapes.filter((x) => !x.ph) ?? [])];
    const body = [...deco, ...s.shapes].map((x) => shapeXml(x, master.theme)).join('');
    const notes = s.notes.paras.some((p) => p.runs.some((r) => r.text))
      ? `<presentation:notes><draw:frame presentation:class="notes" svg:x="2cm" svg:y="14cm" svg:width="17cm" svg:height="12cm"><draw:text-box>${parasXml(s.notes.paras, master.theme, false)}</draw:text-box></draw:frame></presentation:notes>`
      : '';
    return `<draw:page draw:name="${esc(s.name ?? `Slide ${i + 1}`)}" draw:style-name="${ps}" draw:master-page-name="Default">${body}${notes}</draw:page>`;
  }).join('');

  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${NS}><office:automatic-styles>${pageStyles.join('')}${styles.join('')}</office:automatic-styles><office:body><office:presentation>${pages}</office:presentation></office:body></office:document-content>`;
  const W = cm(deck.w), H = cm(deck.h);
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${NS}><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${W}" fo:page-height="${H}" style:print-orientation="${deck.w >= deck.h ? 'landscape' : 'portrait'}"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`;
  const p = deck.props;
  const meta = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta ${NS}><office:meta><meta:generator>ClerdoFrame</meta:generator>${p.title ? `<dc:title>${esc(p.title)}</dc:title>` : ''}${p.author ? `<meta:initial-creator>${esc(p.author)}</meta:initial-creator>` : ''}${p.subject ? `<dc:subject>${esc(p.subject)}</dc:subject>` : ''}${p.description ? `<dc:description>${esc(p.description)}</dc:description>` : ''}</office:meta></office:document-meta>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.presentation"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${[...media.values()].map((m) => `<manifest:file-entry manifest:full-path="${m}" manifest:media-type="${deck.media[[...media.entries()].find(([, v]) => v === m)![0]]!.type}"/>`).join('')}</manifest:manifest>`;
  // The mimetype entry comes first and is stored uncompressed (ODF packaging, 3.3).
  const ordered: Zippable = { mimetype: [strToU8('application/vnd.oasis.opendocument.presentation'), { level: 0 }], 'content.xml': strToU8(content), 'styles.xml': strToU8(stylesXml), 'meta.xml': strToU8(meta), 'META-INF/manifest.xml': strToU8(manifest), ...files };
  return zipSync(ordered, { level: 6 });
};
