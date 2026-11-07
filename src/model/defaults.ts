import {
  emptyText, uid,
  type AutoShape, type Deck, type Layout, type Master, type ParaStyle, type Placeholder, type Shape, type Slide, type TextStyles, type Theme,
} from './deck';

export const DEFAULT_THEME: Theme = {
  name: 'Clerdo',
  colorsName: 'Clerdo',
  colors: {
    dk1: '#000000', lt1: '#FFFFFF', dk2: '#1F2A44', lt2: '#EEF0F4',
    accent1: '#E8401C', accent2: '#F5A623', accent3: '#2C7BE5', accent4: '#1FA971', accent5: '#8E44AD', accent6: '#00A3B4',
    hlink: '#2C5BD8', folHlink: '#7A4FB0',
  },
  fonts: { major: 'Aptos Display', minor: 'Aptos', name: 'Clerdo' },
};

const levels = (sizes: number[], bullets: boolean): ParaStyle[] => sizes.map((size, i) => ({
  level: i,
  marginLeft: bullets ? 30 + i * 40 : 0,
  indent: bullets ? -30 : 0,
  lineSpacing: 90,
  spaceBefore: bullets ? 13 : 0,
  bullet: bullets ? { type: 'char', char: '•', font: 'Arial' } : { type: 'none' },
  defRun: { size, font: '+mn-lt' },
}));

export const defaultTextStyles = (): TextStyles => ({
  title: [{ align: 'l', lineSpacing: 90, bullet: { type: 'none' }, defRun: { size: 44, font: '+mj-lt', color: { theme: 'tx1' } } }],
  body: levels([28, 24, 20, 18, 18, 18, 18, 18, 18], true).map((p) => ({ ...p, defRun: { ...p.defRun, color: { theme: 'tx1' } } })),
  other: levels([18, 18, 18, 18, 18, 18, 18, 18, 18], false),
});

const ph = (type: Placeholder['type'], name: string, x: number, y: number, w: number, h: number, idx?: number, extra: Partial<AutoShape> = {}): AutoShape => ({
  id: uid('s'), kind: 'shape', geom: 'rect', name, x, y, w, h,
  ph: idx === undefined ? { type } : { type, idx },
  text: emptyText(), ...extra,
});

/** Layout placeholders for a slide of the given size (designed at 1280 x 720 and scaled). */
export const buildLayouts = (W: number, H: number): Layout[] => {
  const sx = W / 1280, sy = H / 720;
  const P = (type: Placeholder['type'], name: string, x: number, y: number, w: number, h: number, idx?: number, extra: Partial<AutoShape> = {}) =>
    ph(type, name, Math.round(x * sx), Math.round(y * sy), Math.round(w * sx), Math.round(h * sy), idx, extra);
  const footer = () => [
    P('dt', 'Date Placeholder', 88, 667, 288, 38, 10),
    P('ftr', 'Footer Placeholder', 424, 667, 432, 38, 11),
    P('sldNum', 'Slide Number Placeholder', 904, 667, 288, 38, 12),
  ];
  const title = () => P('title', 'Title 1', 88, 38, 1104, 139);
  const body = (idx = 1, x = 88, y = 192, w = 1104, h = 457, name = 'Content Placeholder') => P('body', `${name} ${idx + 1}`, x, y, w, h, idx);
  const mk = (name: string, type: string, shapes: Shape[]): Layout => ({ id: uid('l'), name, type, shapes: [...shapes, ...footer()] });
  return [
    mk('Title Slide', 'title', [
      P('ctrTitle', 'Title 1', 160, 118, 960, 251, undefined, { text: { paras: [{ runs: [], style: { align: 'ctr' } }], vAlign: 'b' } }),
      P('subTitle', 'Subtitle 2', 160, 379, 960, 174, 1, { text: { paras: [{ runs: [], style: { align: 'ctr' } }] } }),
    ]),
    mk('Title and Content', 'obj', [title(), body()]),
    mk('Section Header', 'secHead', [
      P('title', 'Title 1', 87, 337, 1104, 281, undefined, { text: { paras: [{ runs: [] }], vAlign: 'b' } }),
      P('body', 'Text Placeholder 2', 87, 452, 1104, 148, 1),
    ]),
    mk('Two Content', 'twoObj', [title(), body(1, 88, 192, 544, 457), body(2, 648, 192, 544, 457)]),
    mk('Comparison', 'twoTxTwoObj', [title(),
      P('body', 'Text Placeholder 2', 88, 176, 542, 86, 1, { text: { paras: [{ runs: [] }], vAlign: 'b' } }), body(2, 88, 262, 542, 387),
      P('body', 'Text Placeholder 4', 648, 176, 544, 86, 3, { text: { paras: [{ runs: [] }], vAlign: 'b' } }), body(4, 648, 262, 544, 387)]),
    mk('Title Only', 'titleOnly', [title()]),
    mk('Blank', 'blank', []),
    mk('Content with Caption', 'objTx', [
      P('title', 'Title 1', 88, 48, 413, 168, undefined, { text: { paras: [{ runs: [] }], vAlign: 'b' } }),
      body(1, 544, 104, 648, 511),
      P('body', 'Text Placeholder 3', 88, 216, 413, 399, 2),
    ]),
    mk('Picture with Caption', 'picTx', [
      P('title', 'Title 1', 88, 48, 413, 168, undefined, { text: { paras: [{ runs: [] }], vAlign: 'b' } }),
      P('pic', 'Picture Placeholder 2', 544, 104, 648, 511, 1),
      P('body', 'Text Placeholder 3', 88, 216, 413, 399, 2),
    ]),
    mk('Title and Vertical Text', 'vertTx', [title(), body(1, 88, 192, 1104, 457, 'Vertical Text Placeholder')]),
    mk('Vertical Title and Text', 'vertTitleAndTx', [
      P('title', 'Vertical Title 1', 916, 38, 276, 611, undefined, { text: { paras: [{ runs: [] }], vert: 'eaVert' } }),
      body(1, 88, 38, 812, 611, 'Vertical Text Placeholder'),
    ]),
  ];
};

export const newMaster = (W: number, H: number, theme: Theme = DEFAULT_THEME): Master => {
  const sx = W / 1280, sy = H / 720;
  const r = (v: number, s: number) => Math.round(v * s);
  return {
    id: uid('m'),
    name: theme.name,
    theme: structuredClone(theme),
    background: { fill: { type: 'solid', color: { theme: 'bg1' } } },
    textStyles: defaultTextStyles(),
    layouts: buildLayouts(W, H),
    shapes: [
      ph('title', 'Title Placeholder 1', r(88, sx), r(38, sy), r(1104, sx), r(139, sy), undefined, { text: { paras: [{ runs: [] }], vAlign: 'ctr' } }),
      ph('body', 'Text Placeholder 2', r(88, sx), r(192, sy), r(1104, sx), r(457, sy), 1),
      ph('dt', 'Date Placeholder 3', r(88, sx), r(667, sy), r(288, sx), r(38, sy), 2, { text: { paras: [{ runs: [], style: { align: 'l', defRun: { size: 12, color: { theme: 'tx1', lum: 0.5 } } } }], vAlign: 'ctr' } }),
      ph('ftr', 'Footer Placeholder 4', r(424, sx), r(667, sy), r(432, sx), r(38, sy), 3, { text: { paras: [{ runs: [], style: { align: 'ctr', defRun: { size: 12, color: { theme: 'tx1', lum: 0.5 } } } }], vAlign: 'ctr' } }),
      ph('sldNum', 'Slide Number Placeholder 5', r(904, sx), r(667, sy), r(288, sx), r(38, sy), 4, { text: { paras: [{ runs: [{ text: '‹#›', field: 'slidenum' }], style: { align: 'r', defRun: { size: 12, color: { theme: 'tx1', lum: 0.5 } } } }], vAlign: 'ctr' } }),
    ],
  };
};

/** A new slide on a layout: copies the layout's content placeholders as empty shapes. */
export const newSlide = (layout: Layout): Slide => ({
  id: uid('p'),
  layout: layout.id,
  shapes: layout.shapes
    .filter((s) => s.ph && !['dt', 'ftr', 'sldNum'].includes(s.ph.type))
    .map((s) => ({ ...structuredClone(s), id: uid('s'), text: s.kind === 'shape' ? emptyText(s.text?.paras.slice(0, 1).map((p) => ({ ...p, runs: [] }))) : undefined } as Shape)),
  notes: emptyText(),
  animations: [],
});

export const newDeck = (W = 1280, H = 720): Deck => {
  const master = newMaster(W, H);
  return {
    w: W, h: H,
    masters: [master],
    slides: [newSlide(master.layouts[0]!)],
    sections: [],
    customShows: [],
    show: { type: 'presenter' },
    headerFooter: {},
    props: { created: new Date().toISOString() },
    media: {},
  };
};
