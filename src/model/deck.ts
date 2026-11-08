/**
 * The presentation document model. Everything is plain JSON-compatible data so undo can
 * snapshot it with structuredClone. Binary media lives in `Deck.media` (append-only, never
 * snapshotted) and shapes refer to it by id.
 *
 * Units: pixels at 96 dpi. A 16:9 slide is 1280 x 720 (13.333 in x 7.5 in).
 * Angles are degrees, clockwise. Font sizes are points.
 */

export type Id = string;

let seq = 0;
export const uid = (prefix = 'i'): Id => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const EMU_PER_PX = 9525;
export const PX_PER_PT = 96 / 72;

// ---------- Colors and fills ----------

export type ThemeColorName = 'dk1' | 'lt1' | 'dk2' | 'lt2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'hlink' | 'folHlink'
  | 'tx1' | 'bg1' | 'tx2' | 'bg2';

/** A color: a literal '#rrggbb', or a theme slot with optional tint (lighten 0..1) / shade (darken 0..1). */
export type Color = string | { theme: ThemeColorName; lum?: number; alpha?: number } | { hex: string; alpha?: number };

export interface GradientStop { pos: number; color: Color }

export type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: Color }
  | { type: 'gradient'; kind: 'linear' | 'radial' | 'rect' | 'path'; angle: number; stops: GradientStop[] }
  | { type: 'picture'; media: Id; mode: 'stretch' | 'tile'; transparency?: number; crop?: Crop }
  | { type: 'pattern'; pattern: PatternName; fg: Color; bg: Color }
  | { type: 'background' };

export type PatternName = 'pct5' | 'pct10' | 'pct20' | 'pct25' | 'pct50' | 'pct75' | 'horz' | 'vert' | 'ltHorz' | 'ltVert' | 'dkHorz' | 'dkVert' | 'cross' | 'diagCross'
  | 'dnDiag' | 'upDiag' | 'ltDnDiag' | 'ltUpDiag' | 'dkDnDiag' | 'dkUpDiag' | 'smGrid' | 'lgGrid' | 'smCheck' | 'lgCheck' | 'dotGrid' | 'dotDmnd' | 'shingle' | 'trellis' | 'sphere' | 'weave' | 'plaid' | 'divot' | 'zigZag' | 'wave';

export type Dash = 'solid' | 'dot' | 'dash' | 'lgDash' | 'dashDot' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot' | 'sysDashDot' | 'sysDashDotDot';
export type ArrowHead = 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval' | 'arrow';

export interface Line {
  fill: Fill;
  /** Points. */
  width: number;
  dash?: Dash;
  cap?: 'flat' | 'round' | 'square';
  join?: 'round' | 'bevel' | 'miter';
  compound?: 'sng' | 'dbl' | 'thickThin' | 'thinThick' | 'tri';
  head?: { type: ArrowHead; w?: 'sm' | 'med' | 'lg'; len?: 'sm' | 'med' | 'lg' };
  tail?: { type: ArrowHead; w?: 'sm' | 'med' | 'lg'; len?: 'sm' | 'med' | 'lg' };
}

export interface Effects {
  shadow?: { kind: 'outer' | 'inner' | 'perspective'; color: Color; blur: number; dist: number; angle: number; alpha?: number };
  glow?: { color: Color; radius: number; alpha?: number };
  softEdge?: number;
  reflection?: { alpha: number; size: number; dist: number; blur: number };
  bevel?: { kind: string; w: number; h: number };
  /** 3D rotation preset name kept for round-trips. */
  rot3d?: string;
}

export interface Crop { l: number; t: number; r: number; b: number }

// ---------- Text ----------

export interface RunStyle {
  font?: string;
  /** East-Asian and complex-script fonts, kept for round-trips. */
  fontEa?: string;
  fontCs?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: 'none' | 'sng' | 'dbl' | 'heavy' | 'dotted' | 'dash' | 'wavy';
  strike?: 'none' | 'sng' | 'dbl';
  color?: Color;
  fill?: Fill;
  outline?: Line;
  highlight?: Color;
  /** Percent: positive superscript, negative subscript. */
  baseline?: number;
  caps?: 'none' | 'all' | 'small';
  /** Character spacing in points. */
  spacing?: number;
  link?: Hyperlink;
  lang?: string;
  shadow?: boolean;
}

export interface Run { text: string; style?: RunStyle; /** Line break run. */ br?: boolean; field?: 'slidenum' | 'datetime' | 'footer' }

export type BulletSpec =
  | { type: 'none' }
  | { type: 'char'; char: string; font?: string; color?: Color; size?: number }
  | { type: 'auto'; scheme: AutoNumber; start?: number; color?: Color; size?: number }
  | { type: 'picture'; media: Id };

export type AutoNumber = 'arabicPeriod' | 'arabicParenR' | 'arabicParenBoth' | 'alphaLcPeriod' | 'alphaUcPeriod' | 'alphaLcParenR' | 'alphaUcParenR' | 'romanLcPeriod' | 'romanUcPeriod' | 'arabicPlain';

export interface ParaStyle {
  align?: 'l' | 'ctr' | 'r' | 'just' | 'dist';
  /** 0..8 */
  level?: number;
  /** Pixels. */
  marginLeft?: number;
  indent?: number;
  /** Percent of font size (100 = single) or points when `lineSpacingPts`. */
  lineSpacing?: number;
  lineSpacingPts?: boolean;
  spaceBefore?: number;
  spaceAfter?: number;
  bullet?: BulletSpec;
  rtl?: boolean;
  tabs?: { pos: number; align: 'l' | 'ctr' | 'r' | 'dec' }[];
  defRun?: RunStyle;
}

export interface Paragraph { runs: Run[]; style?: ParaStyle }

export interface TextBody {
  paras: Paragraph[];
  vAlign?: 't' | 'ctr' | 'b';
  /** Insets in px. */
  inset?: { l: number; t: number; r: number; b: number };
  wrap?: boolean;
  autofit?: 'none' | 'shrink' | 'resize';
  /** Applied scale when autofit is shrink. */
  fontScale?: number;
  columns?: number;
  columnGap?: number;
  vert?: 'horz' | 'vert' | 'vert270' | 'wordArtVert' | 'eaVert';
  /** Text-wide rotation in degrees. */
  rot?: number;
  /** WordArt warp preset (prstTxWarp). */
  warp?: string;
  /** List style levels 0..8 (lstStyle) from an opened file; on layout and master placeholders they set the defaults per level. */
  levels?: ParaStyle[];
}

export interface Hyperlink {
  /** External URL (https:, mailto:) */
  url?: string;
  /** Jump inside the deck. */
  action?: 'next' | 'prev' | 'first' | 'last' | 'end' | 'slide';
  slide?: Id;
  tooltip?: string;
  /** Sound played when the link or action runs (media id). */
  sound?: Id;
}

// ---------- Shapes ----------

export type PlaceholderType = 'title' | 'ctrTitle' | 'subTitle' | 'body' | 'obj' | 'pic' | 'chart' | 'tbl' | 'dgm' | 'media' | 'clipArt' | 'dt' | 'ftr' | 'sldNum' | 'sldImg' | 'hdr';

export interface Placeholder { type: PlaceholderType; idx?: number }

interface ShapeBase {
  id: Id;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  flipH?: boolean;
  flipV?: boolean;
  hidden?: boolean;
  locked?: boolean;
  alt?: string;
  /** Marks the shape as decorative for screen readers. */
  decorative?: boolean;
  /** Alt text title (short name read before the description). */
  altTitle?: string;
  /** Keep width and height in proportion when resizing. */
  lockAspect?: boolean;
  ph?: Placeholder;
  link?: Hyperlink;
  /** Action when the pointer rests on the shape during a show. */
  hoverLink?: Hyperlink;
  effects?: Effects;
  /** Opaque XML kept from an opened file so saving doesn't lose what we don't edit. */
  keep?: Record<string, string>;
}

/** An auto shape: preset geometry (or custom path) with optional text. Text boxes are rect shapes with no fill. */
export interface AutoShape extends ShapeBase {
  kind: 'shape';
  geom: string;
  /** Adjustment values by name (adj, adj1, adj2...), in the preset's own units (usually 1/100000). */
  adj?: Record<string, number>;
  /** Custom geometry as SVG path data in a 0..pathW x 0..pathH box, when geom is 'custom'. */
  path?: { d: string; w: number; h: number }[];
  fill?: Fill;
  line?: Line;
  text?: TextBody;
  textbox?: boolean;
  /** Connector ends glued to other shapes. */
  conn?: { start?: { shape: Id; site: number }; end?: { shape: Id; site: number } };
  /** Style references from the theme (the quick-style gallery). */
  styleRef?: { fill?: ThemeColorName; line?: ThemeColorName; font?: ThemeColorName; idx?: number };
}

export interface Picture extends ShapeBase {
  kind: 'picture';
  media: Id;
  crop?: Crop;
  /** Mask the picture to a preset geometry. */
  geom?: string;
  line?: Line;
  adjust?: { brightness?: number; contrast?: number; saturation?: number; temperature?: number; transparency?: number; grayscale?: boolean; sepia?: boolean; blur?: number; recolor?: Color; /** Duotone direction for recolor: 'dark' maps black to the colour, 'light' maps the colour to white. */ recolorMode?: 'light' | 'dark'; /** -100..100, kept as data. */ sharpness?: number };
  /** Background-removed copy, when made. */
  cutout?: Id;
}

export interface TableCell {
  text: TextBody;
  fill?: Fill;
  borders?: { l?: Line; r?: Line; t?: Line; b?: Line; tl2br?: Line; bl2tr?: Line };
  gridSpan?: number;
  rowSpan?: number;
  /** Covered by a merge from the left or above. */
  hMerge?: boolean;
  vMerge?: boolean;
  margin?: { l: number; t: number; r: number; b: number };
  vAlign?: 't' | 'ctr' | 'b';
}

export interface Table extends ShapeBase {
  kind: 'table';
  cols: number[];
  rows: { h: number; cells: TableCell[] }[];
  style?: string;
  opts?: { firstRow?: boolean; lastRow?: boolean; firstCol?: boolean; lastCol?: boolean; bandRow?: boolean; bandCol?: boolean };
}

export type ChartType = 'bar' | 'col' | 'line' | 'pie' | 'doughnut' | 'area' | 'scatter' | 'bubble' | 'radar' | 'stock' | 'surface' | 'combo' | 'histogram' | 'waterfall' | 'funnel' | 'treemap' | 'sunburst' | 'boxWhisker' | 'map';

export interface ChartSeries { name: string; values: number[]; x?: number[]; sizes?: number[]; color?: Color; type?: ChartType; secondary?: boolean; labels?: boolean; marker?: string; smooth?: boolean }

export interface Chart extends ShapeBase {
  kind: 'chart';
  chartType: ChartType;
  grouping?: 'clustered' | 'stacked' | 'percentStacked' | 'standard';
  categories: string[];
  series: ChartSeries[];
  title?: string;
  legend?: 'none' | 'r' | 'l' | 't' | 'b';
  dataLabels?: boolean;
  axes?: { xTitle?: string; yTitle?: string; gridlines?: boolean; min?: number; max?: number };
  style?: number;
  holeSize?: number;
  /** Colour set: 'colorful1'..'colorful4' or 'mono1'..'mono6' (one accent in shades). */
  colors?: string;
  /** Subtype detail, e.g. 'markers', 'filled', 'lines', 'smooth', 'ohlc', 'contour'. */
  variant?: string;
  /** Original chart part kept for round trip. */
  rawXml?: string;
  /** Spreadsheet file the data came from, so it can be read again. */
  dataLink?: { file: string; sheet?: string; range?: string };
}

export interface Group extends ShapeBase {
  kind: 'group';
  children: Shape[];
  /** Child coordinate space; children are positioned inside it and scaled to the group box. */
  childBox?: { x: number; y: number; w: number; h: number };
}

export interface Media extends ShapeBase {
  kind: 'media';
  mediaType: 'video' | 'audio';
  media: Id;
  poster?: Id;
  trim?: { start: number; end: number };
  autoplay?: boolean;
  loop?: boolean;
  volume?: number;
  hideWhenStopped?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  /** Plays on top of slides that follow (background audio). */
  acrossSlides?: boolean;
  /** Video fills the screen while it plays in the show. */
  fullScreen?: boolean;
  /** Goes back to the start (poster) when it finishes. */
  rewind?: boolean;
}

export interface InkStroke { points: [number, number, number?][]; color: Color; width: number; tool: 'pen' | 'pencil' | 'highlighter' }
export interface Ink extends ShapeBase { kind: 'ink'; strokes: InkStroke[] }

export type DiagramLayout = 'basicList' | 'verticalList' | 'process' | 'chevronProcess' | 'cycle' | 'radial' | 'hierarchy' | 'orgChart' | 'pyramid' | 'invertedPyramid' | 'venn' | 'matrix' | 'funnel' | 'timeline' | 'gear' | 'target' | 'stepUp' | 'bendingProcess' | 'pictureList' | 'arrowRibbon' | 'grid' | 'stepsDown';
export interface DiagramNode { id: Id; text: string; level: number; media?: Id }
/** A diagram (SmartArt-like): a node outline laid out into shapes when drawn. */
export interface Diagram extends ShapeBase {
  kind: 'diagram';
  layout: DiagramLayout;
  nodes: DiagramNode[];
  colorScheme?: string;
  styleName?: string;
  /** Shapes from an opened file's drawing part, used until the diagram is edited. */
  cached?: Shape[];
}

/** An equation stored as linear text with rendered MathML-ish markup. */
export interface Equation extends ShapeBase { kind: 'equation'; linear: string; size: number; color?: Color; omml?: string }

/** A 3D model or other object we only display and keep. */
export interface Ole extends ShapeBase { kind: 'ole'; preview?: Id; progId?: string }

/** A live web page or zoom link (slide zoom / section zoom / summary zoom). */
export interface Zoom extends ShapeBase { kind: 'zoom'; target: Id; targetKind: 'slide' | 'section'; returnToZoom?: boolean; preview?: Id }

export type Shape = AutoShape | Picture | Table | Chart | Group | Media | Ink | Diagram | Equation | Ole | Zoom;
export type ShapeKind = Shape['kind'];

// ---------- Animation and transitions ----------

export type TransitionName =
  | 'none' | 'morph' | 'fade' | 'push' | 'wipe' | 'split' | 'reveal' | 'randomBars' | 'shape' | 'uncover' | 'cover' | 'flash'
  | 'fallOver' | 'drape' | 'curtains' | 'wind' | 'prestige' | 'fracture' | 'crush' | 'peelOff' | 'pageCurl' | 'airplane' | 'origami'
  | 'dissolve' | 'checkerboard' | 'blinds' | 'clock' | 'ripple' | 'honeycomb' | 'glitter' | 'vortex' | 'shred' | 'switch' | 'flip'
  | 'gallery' | 'cube' | 'doors' | 'box' | 'comb' | 'zoom' | 'random' | 'pan' | 'ferris' | 'conveyor' | 'rotate' | 'window' | 'orbit' | 'flythrough';

export interface Transition {
  name: TransitionName;
  /** Effect option such as direction: 'l', 'r', 'u', 'd', 'in', 'out', 'h', 'v', ... */
  option?: string;
  /** Seconds. */
  duration: number;
  sound?: Id;
  advanceOnClick?: boolean;
  /** Advance automatically after this many seconds. */
  advanceAfter?: number;
}

export type AnimClass = 'entr' | 'emph' | 'exit' | 'path';
export type AnimTrigger = 'click' | 'with' | 'after';

export interface Animation {
  id: Id;
  shape: Id;
  cls: AnimClass;
  /** Effect name, e.g. 'appear', 'fade', 'flyIn', 'pulse', 'spin', 'line'. */
  effect: string;
  option?: string;
  trigger: AnimTrigger;
  /** Starts when this shape is clicked instead of on slide click. */
  triggerShape?: Id;
  duration: number;
  delay: number;
  repeat?: number | 'untilNextClick' | 'untilEnd';
  rewind?: boolean;
  /** Text animated by paragraph / word / letter. */
  textBy?: 'all' | 'para' | 'word' | 'letter';
  /** For emphasis: color, scale %, angle. */
  value?: string | number;
  /** Motion path as SVG path data relative to the shape centre (px). */
  path?: string;
  smoothStart?: number;
  smoothEnd?: number;
  bounceEnd?: number;
  afterAnim?: 'none' | 'hide' | 'hideOnClick' | 'dim';
  dimColor?: Color;
  sound?: Id;
}

// ---------- Slides, layouts, masters ----------

export interface Background { fill: Fill; hideMasterGraphics?: boolean }

export interface HeaderFooter { dateTime?: boolean; dateFixed?: string; dateFormat?: string; slideNumber?: boolean; footer?: boolean; footerText?: string; hideOnTitle?: boolean;
  /** Notes pages and handouts. */
  notes?: { dateTime?: boolean; dateFixed?: string; dateFormat?: string; header?: boolean; headerText?: string; footer?: boolean; footerText?: string; pageNumber?: boolean } }

export interface Comment { id: Id; author: string; initials?: string; at: string; text: string; x?: number; y?: number; shape?: Id; replies?: Comment[]; resolved?: boolean; /** Person the comment is assigned to (an @mention name). */ assignee?: string }

export interface Slide {
  id: Id;
  layout: Id;
  name?: string;
  background?: Background;
  shapes: Shape[];
  notes: TextBody;
  transition?: Transition;
  animations: Animation[];
  hidden?: boolean;
  comments?: Comment[];
  /** Rehearsed time on slide (s). */
  timing?: number;
  keep?: Record<string, string>;
}

export interface Layout {
  id: Id;
  name: string;
  /** ECMA layout type, e.g. 'title', 'obj', 'twoObj', 'titleOnly', 'blank', 'secHead'... */
  type: string;
  background?: Background;
  shapes: Shape[];
  hideMasterGraphics?: boolean;
  keep?: Record<string, string>;
}

/** Default text levels for title, body and other text on a master. */
export interface TextStyles { title: ParaStyle[]; body: ParaStyle[]; other: ParaStyle[] }

export interface Master {
  id: Id;
  name: string;
  background: Background;
  shapes: Shape[];
  layouts: Layout[];
  textStyles: TextStyles;
  theme: Theme;
  keep?: Record<string, string>;
}

export interface Theme {
  name: string;
  colors: Record<'dk1' | 'lt1' | 'dk2' | 'lt2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'hlink' | 'folHlink', string>;
  colorsName?: string;
  fonts: { major: string; minor: string; name?: string };
  /** Effect / fill style lists from the theme, kept raw. */
  formatXml?: string;
}

export interface Section { id: Id; name: string; /** First slide in the section. */ first: Id; collapsed?: boolean }

export interface CustomShow { id: Id; name: string; slides: Id[] }

export interface ShowSettings {
  type: 'presenter' | 'browsed' | 'kiosk';
  loop?: boolean;
  noNarration?: boolean;
  noAnimation?: boolean;
  range?: { from: number; to: number };
  customShow?: Id;
  useTimings?: boolean;
  penColor?: Color;
  laserColor?: Color;
}

export interface MediaItem { id: Id; type: string; name: string; data: Uint8Array }

export interface DeckProps { title?: string; subject?: string; author?: string; keywords?: string; description?: string; category?: string; created?: string; modified?: string; company?: string; lastModifiedBy?: string; /** Proofing language, e.g. 'en-US'. */ language?: string; /** Stable id of this document (version history). */ docId?: string }

export interface Deck {
  w: number;
  h: number;
  masters: Master[];
  slides: Slide[];
  sections: Section[];
  customShows: CustomShow[];
  show: ShowSettings;
  headerFooter: HeaderFooter;
  props: DeckProps;
  /** Notes page and handout master settings kept for round trips. */
  notesMaster?: { keep?: Record<string, string> };
  /** Binary parts by id. Never cloned by undo. */
  media: Record<Id, MediaItem>;
  /** Parts from an opened file we keep as-is (path -> bytes). */
  extraParts?: Record<string, Uint8Array>;
  /** Font files embedded in the file, when present. */
  embeddedFonts?: string[];
  /** Mark as final / read-only recommendation. */
  final?: boolean;
  rtl?: boolean;
}

// ---------- Helpers ----------

export const SLIDE_SIZES: Record<string, { label: string; w: number; h: number }> = {
  wide: { label: 'Widescreen (16:9)', w: 1280, h: 720 },
  standard: { label: 'Standard (4:3)', w: 960, h: 720 },
  a4: { label: 'A4 paper', w: 1040, h: 720 },
  letter: { label: 'Letter paper', w: 960, h: 720 },
  wide1610: { label: 'Widescreen (16:10)', w: 1152, h: 720 },
  banner: { label: 'Banner', w: 768, h: 96 },
  portrait: { label: 'Portrait (9:16)', w: 720, h: 1280 },
  square: { label: 'Square', w: 1080, h: 1080 },
};

export const emptyText = (paras: Paragraph[] = [{ runs: [] }]): TextBody => ({ paras });
export const textOf = (t: TextBody | undefined): string => (t?.paras ?? []).map((p) => p.runs.map((r) => (r.br ? '\n' : r.text)).join('')).join('\n');
export const textBody = (text: string, style?: RunStyle, para?: ParaStyle): TextBody => ({
  paras: text.split('\n').map((line) => ({ runs: line ? [{ text: line, ...(style ? { style } : {}) }] : [], ...(para ? { style: para } : {}) })),
});

export const masterOf = (deck: Deck, layoutId: Id): { master: Master; layout: Layout } => {
  for (const m of deck.masters) {
    const l = m.layouts.find((x) => x.id === layoutId);
    if (l) return { master: m, layout: l };
  }
  const m = deck.masters[0]!;
  return { master: m, layout: m.layouts[0]! };
};

/** Walks every shape, groups included. Return false from fn to skip a group's children. */
export const walkShapes = (shapes: Shape[], fn: (s: Shape, parent: Group | null) => boolean | void, parent: Group | null = null): void => {
  for (const s of shapes) {
    const r = fn(s, parent);
    if (s.kind === 'group' && r !== false) walkShapes(s.children, fn, s);
  }
};

export const findShape = (shapes: Shape[], id: Id): Shape | null => {
  let hit: Shape | null = null;
  walkShapes(shapes, (s) => { if (s.id === id) hit = s; });
  return hit;
};

export const hasText = (s: Shape): s is AutoShape => s.kind === 'shape';
