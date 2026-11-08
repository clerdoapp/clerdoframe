// DrawingML charts (ECMA-376 Part 1, 21.2) for slides. Adapted from the spreadsheet app's chart
// module: here series carry their own cached values instead of cell references.
import type { Chart, ChartSeries, ChartType, Color } from '../../model/deck';
import { attr, esc, find, findAll, kid, kids, numAttr, type XNode } from '../xml';
import { colorXml, readColor, type ColorCtx } from './dml';

const richText = (n: XNode | undefined): string | undefined => {
  if (!n) return undefined;
  const tx = kid(n, 'tx');
  const paras = findAll(kid(tx, 'rich'), 'p');
  if (paras.length) return paras.map((p) => findAll(p, 't').map((t) => t.text).join('')).join('\n');
  const v = find(tx, 'v');
  if (v) return v.text;
  return undefined;
};

/** Cached points of a c:numRef / c:strRef / c:numLit / c:strLit / c:multiLvlStrRef. */
const cache = (n: XNode | undefined): string[] => {
  if (!n) return [];
  const c = find(n, 'numCache') ?? find(n, 'strCache') ?? find(n, 'numLit') ?? find(n, 'strLit') ?? find(n, 'multiLvlStrCache');
  if (!c) return [];
  if (c.name === 'multiLvlStrCache') {
    const lvl = kids(c, 'lvl')[0];
    return pointsOf(lvl, numAttr(kid(c, 'ptCount'), 'val'));
  }
  return pointsOf(c, numAttr(kid(c, 'ptCount'), 'val'));
};
const pointsOf = (c: XNode | undefined, count: number | undefined): string[] => {
  const pts = kids(c, 'pt');
  const n = Math.min(100000, Math.max(count ?? 0, ...pts.map((p) => (numAttr(p, 'idx') ?? 0) + 1), 0));
  const out = new Array<string>(n).fill('');
  for (const p of pts) { const i = numAttr(p, 'idx') ?? 0; if (i >= 0 && i < n) out[i] = kid(p, 'v')?.text ?? ''; }
  return out;
};

const seriesColor = (ser: XNode, c: ColorCtx): Color | undefined => {
  const sp = kid(ser, 'spPr');
  const fill = kid(sp, 'solidFill') ?? kid(kid(sp, 'ln'), 'solidFill') ?? kid(kid(kid(ser, 'marker'), 'spPr'), 'solidFill');
  return fill ? readColor(fill, c) : undefined;
};

const LEGEND: Record<string, Chart['legend']> = { r: 'r', b: 'b', t: 't', l: 'l', tr: 'r' };

const groupKind = (g: XNode): ChartType | undefined => {
  switch (g.name) {
    case 'barChart': case 'bar3DChart': return attr(kid(g, 'barDir'), 'val') === 'bar' ? 'bar' : 'col';
    case 'lineChart': case 'line3DChart': return 'line';
    case 'stockChart': return 'stock';
    case 'areaChart': case 'area3DChart': return 'area';
    case 'pieChart': case 'pie3DChart': case 'ofPieChart': return 'pie';
    case 'doughnutChart': return 'doughnut';
    case 'scatterChart': return 'scatter';
    case 'bubbleChart': return 'bubble';
    case 'radarChart': return 'radar';
    case 'surfaceChart': case 'surface3DChart': return 'surface';
    default: return undefined;
  }
};

/** Reads a chart part. Returns undefined when it has no plot we understand (the caller keeps it raw). */
export const readChartPart = (root: XNode, c: ColorCtx): Pick<Chart, 'chartType' | 'grouping' | 'categories' | 'series' | 'title' | 'legend' | 'dataLabels' | 'axes' | 'style' | 'holeSize'> | undefined => {
  const chart = kid(root, 'chart');
  const plot = kid(chart, 'plotArea');
  if (!plot) return undefined;
  const groups = plot.children.map((g) => ({ g, t: groupKind(g) })).filter((x): x is { g: XNode; t: ChartType } => !!x.t && kids(x.g, 'ser').length > 0);
  if (!groups.length) return undefined;
  const combo = new Set(groups.map((x) => x.t)).size > 1;
  const primaryAx = new Set(kids(groups[0]!.g, 'axId').map((a) => attr(a, 'val')));
  const series: ChartSeries[] = [];
  let categories: string[] = [];
  for (const { g, t } of groups) {
    const secondary = kids(g, 'axId').length > 0 && !kids(g, 'axId').some((a) => primaryAx.has(attr(a, 'val')));
    for (const ser of kids(g, 'ser')) {
      const cat = cache(kid(ser, 'cat') ?? kid(ser, 'xVal'));
      const vals = cache(kid(ser, 'val') ?? kid(ser, 'yVal')).map((v) => (v === '' ? NaN : Number(v))).map((v) => (Number.isFinite(v) ? v : 0));
      const name = richText(ser) ?? cache(kid(ser, 'tx'))[0] ?? `Series ${series.length + 1}`;
      const s: ChartSeries = { name, values: vals };
      if (t === 'scatter' || t === 'bubble') s.x = cat.map((v) => Number(v) || 0);
      else if (!categories.length && cat.length) categories = cat;
      if (t === 'bubble') s.sizes = cache(kid(ser, 'bubbleSize')).map((v) => Number(v) || 0);
      const col = seriesColor(ser, c);
      if (col !== undefined) s.color = col;
      if (combo) s.type = t;
      if (secondary) s.secondary = true;
      const sm = attr(kid(ser, 'smooth'), 'val');
      if (sm === '1' || sm === 'true') s.smooth = true;
      const sym = attr(kid(kid(ser, 'marker'), 'symbol'), 'val');
      if (sym) s.marker = sym;
      const dl = kid(ser, 'dLbls');
      if (dl && attr(kid(dl, 'showVal'), 'val') === '1') s.labels = true;
      series.push(s);
    }
  }
  if (!categories.length) {
    const n = Math.max(0, ...series.map((s) => s.values.length));
    categories = Array.from({ length: n }, (_, i) => String(i + 1));
  }
  const first = groups[0]!.g;
  const grouping = attr(kid(first, 'grouping'), 'val');
  const out: ReturnType<typeof readChartPart> & object = {
    chartType: combo ? 'combo' : groups[0]!.t,
    categories,
    series,
  };
  if (grouping === 'stacked' || grouping === 'percentStacked' || grouping === 'clustered' || grouping === 'standard') out.grouping = grouping;
  const autoDel = attr(kid(chart, 'autoTitleDeleted'), 'val');
  const title = richText(kid(chart, 'title')) ?? (kid(chart, 'title') && autoDel !== '1' && series.length === 1 ? series[0]!.name : undefined);
  if (title) out.title = title;
  const legend = kid(chart, 'legend');
  out.legend = legend ? LEGEND[attr(kid(legend, 'legendPos'), 'val') ?? 'r'] ?? 'r' : 'none';
  const lbls = [kid(first, 'dLbls')].filter(Boolean) as XNode[];
  if (lbls.some((n) => attr(kid(n, 'showVal'), 'val') === '1' || attr(kid(n, 'showPercent'), 'val') === '1')) out.dataLabels = true;
  const axes = plot.children.filter((n) => /Ax$/.test(n.name));
  const catAx = axes.find((a) => a.name === 'catAx' || a.name === 'dateAx') ?? axes.find((a) => /^[bt]$/.test(attr(kid(a, 'axPos'), 'val') ?? ''));
  const valAx = axes.find((a) => a.name === 'valAx' && a !== catAx);
  const ax: NonNullable<Chart['axes']> = {};
  const xt = richText(kid(catAx, 'title')), yt = richText(kid(valAx, 'title'));
  if (xt) ax.xTitle = xt;
  if (yt) ax.yTitle = yt;
  if (valAx) {
    ax.gridlines = !!kid(valAx, 'majorGridlines');
    const mn = numAttr(kid(kid(valAx, 'scaling'), 'min'), 'val'), mx = numAttr(kid(kid(valAx, 'scaling'), 'max'), 'val');
    if (mn !== undefined) ax.min = mn;
    if (mx !== undefined) ax.max = mx;
  }
  if (Object.keys(ax).length) out.axes = ax;
  const style = numAttr(kid(root, 'style'), 'val');
  if (style) out.style = style;
  const hole = numAttr(kid(first, 'holeSize'), 'val');
  if (hole !== undefined) out.holeSize = hole;
  return out;
};

// ---------- Writing ----------

const v = (tag: string, val: string | number): string => `<c:${tag} val="${val}"/>`;
const txRich = (text: string): string =>
  `<c:tx><c:rich><a:bodyPr/><a:lstStyle/>${text.split('\n').map((l) => `<a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:t>${esc(l)}</a:t></a:r></a:p>`).join('')}</c:rich></c:tx>`;
const titleXml = (t: string | undefined): string => (t ? `<c:title>${txRich(t)}<c:overlay val="0"/></c:title>` : '');

const colLetter = (n: number): string => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

const strCache = (vals: string[], ref?: string): string =>
  `<c:strRef>${ref ? `<c:f>${ref}</c:f>` : ''}<c:strCache>${v('ptCount', vals.length)}${vals.map((x, i) => `<c:pt idx="${i}"><c:v>${esc(x)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef>`;
const numCache = (vals: number[], ref?: string): string =>
  `<c:numRef>${ref ? `<c:f>${ref}</c:f>` : ''}<c:numCache><c:formatCode>General</c:formatCode>${v('ptCount', vals.length)}${vals.map((x, i) => (Number.isFinite(x) ? `<c:pt idx="${i}"><c:v>${x}</c:v></c:pt>` : '')).join('')}</c:numCache></c:numRef>`;

type Kind = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'bubble' | 'radar';

const fillOf = (c: Color | undefined): string => (c === undefined ? '' : `<a:solidFill>${colorXml(c)}</a:solidFill>`);

const DL = (show: boolean, pct = false): string => `<c:dLbls>${v('showLegendKey', 0)}${v('showVal', show && !pct ? 1 : 0)}${v('showCatName', 0)}${v('showSerName', 0)}${v('showPercent', pct ? 1 : 0)}${v('showBubbleSize', 0)}</c:dLbls>`;

/** Sheet references for the embedded workbook layout: categories in column A, series in B, C, ... */
const refs = (c: Chart, i: number, withSheet: boolean) => {
  if (!withSheet) return { name: undefined, cat: undefined, val: undefined };
  const n = Math.max(1, c.categories.length);
  const col = colLetter(i + 1);
  return { name: `Sheet1!$${col}$1`, cat: `Sheet1!$A$2:$A$${n + 1}`, val: `Sheet1!$${col}$2:$${col}$${n + 1}` };
};

const serXml = (c: Chart, s: ChartSeries, i: number, kind: Kind, withSheet: boolean): string => {
  const r = refs(c, i, withSheet);
  let x = v('idx', i) + v('order', i) + `<c:tx>${strCache([s.name], r.name)}</c:tx>`;
  const f = fillOf(s.color);
  if (kind === 'line' || kind === 'radar') x += `<c:spPr><a:ln w="28575" cap="rnd">${f || ''}<a:round/></a:ln></c:spPr><c:marker>${v('symbol', s.marker ?? (kind === 'line' ? 'none' : 'none'))}</c:marker>`;
  else if (kind === 'scatter') x += `<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker>${v('symbol', s.marker ?? 'circle')}${v('size', 7)}${f ? `<c:spPr>${f}</c:spPr>` : ''}</c:marker>`;
  else if (f && kind !== 'pie') x += `<c:spPr>${f}</c:spPr>`;
  if (kind === 'bar' || kind === 'bubble') x += v('invertIfNegative', 0);
  if (s.labels) x += DL(true);
  if (kind === 'scatter' || kind === 'bubble') {
    const xs = s.x ?? s.values.map((_, k) => k + 1);
    x += `<c:xVal>${numCache(xs)}</c:xVal><c:yVal>${numCache(s.values, r.val)}</c:yVal>`;
    if (kind === 'bubble') x += `<c:bubbleSize>${numCache(s.sizes ?? s.values.map(() => 1))}</c:bubbleSize>${v('bubble3D', 0)}`;
    else x += v('smooth', s.smooth ? 1 : 0);
  } else {
    x += `<c:cat>${strCache(c.categories, r.cat)}</c:cat><c:val>${numCache(s.values, r.val)}</c:val>`;
    if (kind === 'line') x += v('smooth', s.smooth ? 1 : 0);
  }
  return `<c:ser>${x}</c:ser>`;
};

const AX = [500000001, 500000002, 500000003, 500000004];

const axesXml = (c: Chart, horizontal: boolean, scatter: boolean, secondary: boolean): string => {
  const a = c.axes ?? {};
  const common = (id: number, cross: number, pos: string, title: string | undefined, grid: boolean, bounds: boolean, del = false) =>
    v('axId', id) + `<c:scaling>${v('orientation', 'minMax')}${bounds && a.max !== undefined ? v('max', a.max) : ''}${bounds && a.min !== undefined ? v('min', a.min) : ''}</c:scaling>`
    + v('delete', del ? 1 : 0) + v('axPos', pos) + (grid ? '<c:majorGridlines/>' : '') + titleXml(title)
    + '<c:numFmt formatCode="General" sourceLinked="1"/>' + v('majorTickMark', 'out') + v('minorTickMark', 'none') + v('tickLblPos', 'nextTo') + v('crossAx', cross) + v('crosses', pos === 'r' ? 'max' : 'autoZero');
  const grid = a.gridlines !== false;
  const catPos = horizontal ? 'l' : 'b', valPos = horizontal ? 'b' : 'l';
  const cat = scatter
    ? `<c:valAx>${common(AX[0]!, AX[1]!, catPos, a.xTitle, false, false)}${v('crossBetween', 'midCat')}</c:valAx>`
    : `<c:catAx>${common(AX[0]!, AX[1]!, catPos, a.xTitle, false, false)}${v('auto', 1)}${v('lblAlgn', 'ctr')}${v('lblOffset', 100)}${v('noMultiLvlLbl', 0)}</c:catAx>`;
  const val = `<c:valAx>${common(AX[1]!, AX[0]!, valPos, a.yTitle, grid, true)}${v('crossBetween', scatter ? 'midCat' : 'between')}</c:valAx>`;
  if (!secondary) return cat + val;
  return cat + val + `<c:catAx>${common(AX[2]!, AX[3]!, 'b', undefined, false, false, true)}${v('auto', 1)}${v('lblAlgn', 'ctr')}${v('lblOffset', 100)}${v('noMultiLvlLbl', 0)}</c:catAx>`
    + `<c:valAx>${common(AX[3]!, AX[2]!, 'r', undefined, false, false)}${v('crossBetween', 'between')}</c:valAx>`;
};

const kindOf = (t: ChartType | undefined): Kind => {
  switch (t) {
    case 'line': case 'stock': return 'line';
    case 'area': return 'area';
    case 'pie': case 'doughnut': return 'pie';
    case 'scatter': return 'scatter';
    case 'bubble': return 'bubble';
    case 'radar': return 'radar';
    default: return 'bar';
  }
};

/** The chart types DrawingML can't hold are saved as clustered columns. */
export const chartSpaceXml = (c: Chart, opts: { workbookRel?: string } = {}): string => {
  const withSheet = !!opts.workbookRel;
  const idx = c.series.map((s, i) => ({ s, i }));
  const grouping = c.grouping ?? (c.chartType === 'bar' || c.chartType === 'col' ? 'clustered' : 'standard');
  const dl = DL(!!c.dataLabels);
  const axIds = (sec: boolean) => (sec ? v('axId', AX[2]!) + v('axId', AX[3]!) : v('axId', AX[0]!) + v('axId', AX[1]!));
  const group = (kind: Kind, list: typeof idx, sec: boolean, t: ChartType): string => {
    const sers = list.map(({ s, i }) => serXml(c, s, i, kind, withSheet)).join('');
    switch (kind) {
      case 'bar': {
        const g = grouping === 'standard' ? 'clustered' : grouping;
        return `<c:barChart>${v('barDir', t === 'bar' ? 'bar' : 'col')}${v('grouping', g)}${v('varyColors', 0)}${sers}${dl}${v('gapWidth', 150)}${g !== 'clustered' ? v('overlap', 100) : ''}${axIds(sec)}</c:barChart>`;
      }
      case 'line': return `<c:lineChart>${v('grouping', grouping === 'clustered' ? 'standard' : grouping)}${v('varyColors', 0)}${sers}${dl}${v('marker', 1)}${axIds(sec)}</c:lineChart>`;
      case 'area': return `<c:areaChart>${v('grouping', grouping === 'clustered' ? 'standard' : grouping)}${v('varyColors', 0)}${sers}${dl}${axIds(sec)}</c:areaChart>`;
      case 'pie': {
        const pdl = c.dataLabels ? DL(false, true) : DL(false);
        return t === 'doughnut'
          ? `<c:doughnutChart>${v('varyColors', 1)}${sers}${pdl}${v('firstSliceAng', 0)}${v('holeSize', Math.round(c.holeSize ?? 50))}</c:doughnutChart>`
          : `<c:pieChart>${v('varyColors', 1)}${list.slice(0, 1).map(({ s, i }) => serXml(c, s, i, 'pie', withSheet)).join('')}${pdl}${v('firstSliceAng', 0)}</c:pieChart>`;
      }
      case 'scatter': return `<c:scatterChart>${v('scatterStyle', 'lineMarker')}${v('varyColors', 0)}${sers}${dl}${axIds(sec)}</c:scatterChart>`;
      case 'bubble': return `<c:bubbleChart>${v('varyColors', 0)}${sers}${dl}${v('bubbleScale', 100)}${v('showNegBubbles', 0)}${axIds(sec)}</c:bubbleChart>`;
      case 'radar': return `<c:radarChart>${v('radarStyle', 'marker')}${v('varyColors', 0)}${sers}${dl}${axIds(sec)}</c:radarChart>`;
    }
  };
  let body = '';
  let secondary = false;
  const main = c.chartType;
  if (main === 'combo' || c.series.some((s) => s.type && s.type !== main) || c.series.some((s) => s.secondary)) {
    const order: Kind[] = ['area', 'bar', 'line', 'scatter', 'radar'];
    for (const sec of [false, true]) {
      for (const k of order) {
        const list = idx.filter(({ s }) => kindOf(s.type ?? (main === 'combo' ? 'col' : main)) === k && !!s.secondary === sec);
        if (!list.length) continue;
        if (sec) secondary = true;
        const t = list[0]!.s.type ?? (main === 'combo' ? 'col' : main);
        body += group(k, list, sec, t);
      }
    }
  } else body = group(kindOf(main), idx, false, main);
  const k = kindOf(main);
  const axes = k === 'pie' ? '' : axesXml(c, main === 'bar', k === 'scatter' || k === 'bubble', secondary);
  const legend = c.legend === 'none' ? '' : `<c:legend>${v('legendPos', c.legend ?? 'r')}<c:overlay val="0"/></c:legend>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
    + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + v('date1904', 0) + v('roundedCorners', 0) + (c.style ? v('style', c.style) : '')
    + '<c:chart>' + (c.title ? titleXml(c.title) + v('autoTitleDeleted', 0) : v('autoTitleDeleted', 1))
    + `<c:plotArea><c:layout/>${body}${axes}</c:plotArea>${legend}${v('plotVisOnly', 1)}${v('dispBlanksAs', 'gap')}</c:chart>`
    + '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>'
    + (opts.workbookRel ? `<c:externalData r:id="${opts.workbookRel}"><c:autoUpdate val="0"/></c:externalData>` : '')
    + dataLinkXml(c)
    + '</c:chartSpace>';
};

// ---------- Embedded workbook (so the chart data stays editable in other apps) ----------

const cellRef = (c: number, r: number) => `${colLetter(c)}${r + 1}`;

/** Minimal SpreadsheetML workbook holding the chart data (inline strings, no shared strings part). */
export const chartWorkbookFiles = (c: Chart): Record<string, string> => {
  const rows: string[] = [];
  const head = ['', ...c.series.map((s) => s.name)];
  const cellStr = (col: number, r: number, t: string) => `<c r="${cellRef(col, r)}" t="inlineStr"><is><t>${esc(t)}</t></is></c>`;
  rows.push(`<row r="1">${head.map((t, i) => (i === 0 ? '' : cellStr(i, 0, t))).join('')}</row>`);
  c.categories.forEach((cat, r) => {
    rows.push(`<row r="${r + 2}">${cellStr(0, r + 1, cat)}${c.series.map((s, i) => (Number.isFinite(s.values[r]) ? `<c r="${cellRef(i + 1, r + 1)}"><v>${s.values[r]}</v></c>` : '')).join('')}</row>`);
  });
  const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return {
    '[Content_Types].xml': `${H}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels': `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${H}<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `${H}<worksheet xmlns="${S}"><sheetData>${rows.join('')}</sheetData></worksheet>`,
  };
};

// ---------- Link to the spreadsheet file the data came from (our own extension; other apps skip it) ----------

const LINK_URI = '{6F3B7E52-0C1D-4C55-9A57-3C1A2E7D9B10}';
const LINK_NS = 'urn:clerdo:frame:chart-link';

const dataLinkXml = (c: Chart): string => {
  const l = c.dataLink;
  if (!l?.file) return '';
  const a = `file="${esc(l.file)}"${l.sheet ? ` sheet="${esc(l.sheet)}"` : ''}${l.range ? ` range="${esc(l.range)}"` : ''}`;
  return `<c:extLst><c:ext uri="${LINK_URI}" xmlns:cfl="${LINK_NS}"><cfl:dataLink ${a}/></c:ext></c:extLst>`;
};

/** The data link written by dataLinkXml, if the chart part has one. */
export const readDataLink = (root: XNode): Chart['dataLink'] | undefined => {
  const ext = kids(kid(root, 'extLst'), 'ext').find((e) => attr(e, 'uri') === LINK_URI);
  const n = kid(ext, 'dataLink');
  const file = attr(n, 'file');
  if (!file) return undefined;
  const sheet = attr(n, 'sheet'), range = attr(n, 'range');
  return { file: file.slice(0, 500), ...(sheet ? { sheet: sheet.slice(0, 200) } : {}), ...(range && /^[A-Za-z]{1,3}\d+(:[A-Za-z]{1,3}\d+)?$/.test(range) ? { range } : {}) };
};
