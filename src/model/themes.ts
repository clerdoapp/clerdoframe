/**
 * Built-in designs: color sets, font pairs and themes. A theme builds a complete master
 * (background, decoration, text styles and layouts) from plain data, so applying one is a pure
 * function of the theme, the chosen color variant and the slide size.
 *
 * Decoration is drawn in a 1280 x 720 design space and scaled to the slide size. All decoration
 * colors are theme references, so picking another color set or variant recolors it.
 */
import {
  uid,
  type AutoShape, type Color, type Fill, type Layout, type Master, type ParaStyle, type Shape, type Theme, type ThemeColorName,
} from './deck';
import { newMaster } from './defaults';

export type ThemeColors = Theme['colors'];

export const COLOR_SLOTS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'dk1', label: 'Text 1' }, { key: 'lt1', label: 'Background 1' }, { key: 'dk2', label: 'Text 2' }, { key: 'lt2', label: 'Background 2' },
  { key: 'accent1', label: 'Accent 1' }, { key: 'accent2', label: 'Accent 2' }, { key: 'accent3', label: 'Accent 3' },
  { key: 'accent4', label: 'Accent 4' }, { key: 'accent5', label: 'Accent 5' }, { key: 'accent6', label: 'Accent 6' },
  { key: 'hlink', label: 'Link' }, { key: 'folHlink', label: 'Visited link' },
];

// ---------- Color sets ----------

export interface ColorSet { id: string; name: string; colors: ThemeColors }

const cs = (id: string, name: string, c: string): ColorSet => {
  const v = c.trim().split(/\s+/).map((x) => `#${x.toUpperCase()}`);
  const [dk1, lt1, dk2, lt2, accent1, accent2, accent3, accent4, accent5, accent6, hlink, folHlink] = v as [string, string, string, string, string, string, string, string, string, string, string, string];
  return { id, name, colors: { dk1, lt1, dk2, lt2, accent1, accent2, accent3, accent4, accent5, accent6, hlink, folHlink } };
};

/** Twenty original color sets: text 1, background 1, text 2, background 2, six accents, link, visited link. */
export const COLOR_SETS: ColorSet[] = [
  cs('clerdo', 'Clerdo', '000000 FFFFFF 1F2A44 EEF0F4 E8401C F5A623 2C7BE5 1FA971 8E44AD 00A3B4 2C5BD8 7A4FB0'),
  cs('coast', 'Coast', '17212B FFFFFF 14365D E6EEF6 1F6FB2 2BA3C7 F2A541 5B8C5A 8E5BA8 E05A47 1F6FB2 6A4C93'),
  cs('sunrise', 'Sunrise', '2A1B14 FFFFFF 5A2A1A FCEFE6 F26B38 F7B32B E5446D 7B4FA0 2E86AB 3FA34D D9532B 9C4F7E'),
  cs('moss', 'Moss', '1E2A1F FFFFFF 2F4A33 EEF3EA 4F8A3C A3C24A D9A43B 3E7C8C 9B6B43 6E5BA6 3E7C8C 7E5A9B'),
  cs('graphite', 'Graphite', '1A1A1A FFFFFF 3A3F45 EFEFEF 4A90E2 50B3A2 F5A623 D0021B 7B61FF 8B8F94 2F6FD0 7B61FF'),
  cs('plum', 'Plum', '24152C FFFFFF 4A2559 F4ECF6 8E3FA8 D15A9E F08A5D 5C7FD6 3BAA9C E2B33C 7A3FB8 A44C8E'),
  cs('citrus', 'Citrus', '1F2414 FFFFFF 33401C F5F7E8 8DBA1E F4C430 F28C28 2DA88E 3A7BD5 C74B50 2D7FB8 7A5BAA'),
  cs('glacier', 'Glacier', '0F2233 FFFFFF 1D4E6E EAF4FA 3A9AD9 6CC6E8 9AA9F0 4FC1A6 F07E6E F4B860 2C7FC0 6F67C9'),
  cs('terracotta', 'Terracotta', '2B1A12 FFFFFF 6B3A26 F7EEE6 C8553D E39B5A 7D9D5A 4F7A8C D3A84A 8C5A7A B04A35 7D5A8C'),
  cs('lagoon', 'Lagoon', '0E2626 FFFFFF 135454 E6F4F2 15A3A3 3DC1D3 F2C14E F47E5A 5A6FD6 8DC26F 128C8C 6B5BB5'),
  cs('orchid', 'Orchid', '2A1430 FFFFFF 5B2468 FBEFF8 C43E8C 8C4FD6 F27DA4 4DB6C9 F5B041 6CBF84 A33FB5 7D4FA0'),
  cs('saffron', 'Saffron', '2B2210 FFFFFF 5C4416 FBF4E4 E3A21A D9612B 3E8E7E 3D6FB6 9C4F8C 7AA43A C27A12 8C5A2E'),
  cs('slate', 'Slate', '1C232B FFFFFF 2E3B4A EDF0F3 4C6A88 7D9AB5 C98B5A 6E9E8C A87BA8 D9B44A 3D6A9C 7A6A9C'),
  cs('berry', 'Berry', '2A0F1A FFFFFF 5E1A36 FBEDF1 C2185B E2557D F29E4C 6A4BC4 2E9CB0 7CB342 B0174F 7B3FA0'),
  cs('evergreen', 'Evergreen', '0F2118 FFFFFF 1D4433 E8F2EC 2E7D55 6DB37E C9A65A 4A86A8 B5694E 8A7BB8 2E7D6A 6E5BA0'),
  cs('copper', 'Copper', '231A15 FFFFFF 4A3326 F4EEE9 B8733A D9A066 5D8C8A 8C5D6E 5A6E8C A8A04A A45D2A 7A5D8C'),
  cs('neon', 'Neon', '101018 FFFFFF 23233A EEEEF6 FF3D7F 00C2FF 7CFF6B FFC93D 9D5CFF FF7A3D 00A3E0 9D5CFF'),
  cs('pastel', 'Pastel', '2D2D3A FFFFFF 4A4A66 F6F4FB 8FB8DE F4A7B9 B8E0A8 F7D488 C6A8E8 8FD6D0 5E8FC4 9C7FC4'),
  cs('mono', 'Monochrome', '111111 FFFFFF 333333 F0F0F0 2B2B2B 555555 777777 999999 BBBBBB DDDDDD 444444 777777'),
  cs('deepsea', 'Deep Sea', '0A1A2F FFFFFF 0F2D4F E5ECF5 1B5FAA 2196C9 22B8B0 6C8ED6 F2A33A EF6A5A 1B6FC0 5C5BB0'),
];

// ---------- Font pairs ----------

export interface FontPair { id: string; name: string; major: string; minor: string }

export const FONT_PAIRS: FontPair[] = [
  { id: 'grotesk', name: 'Grotesk', major: 'Hanken Grotesk', minor: 'Hanken Grotesk' },
  { id: 'everyday', name: 'Everyday', major: 'Aptos Display', minor: 'Aptos' },
  { id: 'editorial', name: 'Editorial', major: 'Playfair Display', minor: 'Source Serif 4' },
  { id: 'geometric', name: 'Geometric', major: 'Montserrat', minor: 'Open Sans' },
  { id: 'rounded', name: 'Rounded', major: 'Nunito', minor: 'Nunito' },
  { id: 'modern', name: 'Modern', major: 'Poppins', minor: 'Inter' },
  { id: 'classic', name: 'Classic', major: 'Merriweather', minor: 'Lato' },
  { id: 'poster', name: 'Poster', major: 'Bebas Neue', minor: 'Lato' },
  { id: 'condensed', name: 'Condensed', major: 'Oswald', minor: 'Roboto' },
  { id: 'airy', name: 'Airy', major: 'Raleway', minor: 'Lato' },
  { id: 'technical', name: 'Technical', major: 'Roboto Mono', minor: 'Inter' },
  { id: 'neutral', name: 'Neutral', major: 'Inter', minor: 'Inter' },
  { id: 'friendly', name: 'Friendly', major: 'DM Sans', minor: 'DM Sans' },
  { id: 'bookish', name: 'Bookish', major: 'Source Serif 4', minor: 'Source Serif 4' },
  { id: 'contrast', name: 'Contrast', major: 'Playfair Display', minor: 'Montserrat' },
  { id: 'letterpress', name: 'Letterpress', major: 'Georgia', minor: 'Open Sans' },
  { id: 'terminal', name: 'Terminal', major: 'Fira Code', minor: 'Inter' },
  { id: 'safe', name: 'Plain', major: 'Arial', minor: 'Arial' },
];

// ---------- Decoration helpers (1280 x 720 design space) ----------

const th = (theme: ThemeColorName, lum?: number, alpha?: number): Color => ({ theme, ...(lum ? { lum } : {}), ...(alpha !== undefined ? { alpha } : {}) });
const solid = (c: Color): Fill => ({ type: 'solid', color: c });
const lin = (angle: number, ...stops: [number, Color][]): Fill => ({ type: 'gradient', kind: 'linear', angle, stops: stops.map(([pos, color]) => ({ pos, color })) });
const radial = (...stops: [number, Color][]): Fill => ({ type: 'gradient', kind: 'radial', angle: 0, stops: stops.map(([pos, color]) => ({ pos, color })) });

type Decor = AutoShape;
let decorN = 0;
const base = (geom: string, x: number, y: number, w: number, h: number, fill: Fill, extra: Partial<AutoShape> = {}): Decor => ({
  id: uid('s'), kind: 'shape', name: `Decoration ${++decorN}`, geom, x, y, w, h, fill, decorative: true, ...extra,
});
const rect = (x: number, y: number, w: number, h: number, fill: Fill, extra?: Partial<AutoShape>) => base('rect', x, y, w, h, fill, extra);
const oval = (x: number, y: number, w: number, h: number, fill: Fill, extra?: Partial<AutoShape>) => base('ellipse', x, y, w, h, fill, extra);
const ring = (x: number, y: number, w: number, h: number, c: Color, width: number) => base('ellipse', x, y, w, h, { type: 'none' }, { line: { fill: solid(c), width } });
const frame = (x: number, y: number, w: number, h: number, c: Color, width: number) => base('rect', x, y, w, h, { type: 'none' }, { line: { fill: solid(c), width } });
/** Custom polygon; points are in the shape's own box (0..w, 0..h). */
const poly = (x: number, y: number, w: number, h: number, pts: [number, number][], fill: Fill) =>
  base('custom', x, y, w, h, fill, { path: [{ d: pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join('') + 'Z', w, h }] });
const pathShape = (x: number, y: number, w: number, h: number, d: string, fill: Fill, line?: AutoShape['line']) =>
  base('custom', x, y, w, h, fill, { path: [{ d, w, h }], ...(line ? { line } : {}) });

/** A wave across the box, filled to the bottom. */
const wave = (y: number, h: number, fill: Fill, phase = 0) =>
  pathShape(0, y, 1280, h, phase
    ? `M0 ${h * 0.55} C ${320} ${h * 0.05}, ${640} ${h * 0.95}, ${960} ${h * 0.35} S ${1240} ${h * 0.2}, 1280 ${h * 0.3} L1280 ${h} L0 ${h} Z`
    : `M0 ${h * 0.35} C ${300} ${h * 0.85}, ${700} ${h * 0.0}, ${1000} ${h * 0.45} S ${1220} ${h * 0.7}, 1280 ${h * 0.5} L1280 ${h} L0 ${h} Z`, fill);

const dots = (x: number, y: number, w: number, h: number, fg: Color, bg: Color = th('bg1', 0, 0)): Decor =>
  rect(x, y, w, h, { type: 'pattern', pattern: 'dotGrid', fg, bg });

// ---------- Themes ----------

export interface Box { x: number; y: number; w: number; h: number }

export interface ThemeLook {
  /** Title text: size (pt), weight, capitals, letter spacing, color. */
  title: { size: number; bold?: boolean; caps?: boolean; spacing?: number; color?: Color; align?: 'l' | 'ctr' };
  body?: { bullet?: string; bulletColor?: Color; size?: number; color?: Color; lineSpacing?: number };
  /** Content area for ordinary layouts: placeholders are mapped from the standard area into this box. */
  content: Box;
  footerY?: number;
  cover: { title: Box; sub: Box; align: 'l' | 'ctr' | 'r'; size?: number; color?: Color; subColor?: Color; vAlign?: 't' | 'ctr' | 'b' };
  section: { title: Box; text: Box; align: 'l' | 'ctr' | 'r'; size?: number; color?: Color; textColor?: Color };
}

export interface ThemeDef {
  id: string;
  name: string;
  /** Short description for tooltips. */
  note: string;
  colors: ThemeColors;
  fonts: { major: string; minor: string; name: string };
  /** Light backgrounds keep variants' text 2 / background 2; dark ones keep their own. */
  dark?: boolean;
  /** Color set ids used for variants 2..4 (variant 1 is the theme's own colors). */
  variants: [string, string, string];
  background: Fill;
  coverBackground?: Fill;
  sectionBackground?: Fill;
  look: ThemeLook;
  master: () => Decor[];
  cover?: () => Decor[];
  section?: () => Decor[];
  /** Cover and section layouts draw only their own decoration. */
  ownCover?: boolean;
  ownSection?: boolean;
}

const C = (id: string): ThemeColors => ({ ...COLOR_SETS.find((x) => x.id === id)!.colors });
const withC = (id: string, over: Partial<ThemeColors>): ThemeColors =>
  ({ ...C(id), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, `#${String(v).replace('#', '').toUpperCase()}`])) });

const std: Box = { x: 88, y: 38, w: 1104, h: 611 };
const coverL = (y = 210): ThemeLook['cover'] => ({ title: { x: 110, y, w: 900, h: 200 }, sub: { x: 110, y: y + 214, w: 900, h: 110 }, align: 'l' });
const coverC = (y = 150): ThemeLook['cover'] => ({ title: { x: 160, y, w: 960, h: 230 }, sub: { x: 160, y: y + 244, w: 960, h: 120 }, align: 'ctr' });
const secL = (y = 300): ThemeLook['section'] => ({ title: { x: 110, y, w: 1000, h: 170 }, text: { x: 110, y: y + 178, w: 1000, h: 100 }, align: 'l' });
const secC = (y = 230): ThemeLook['section'] => ({ title: { x: 160, y, w: 960, h: 170 }, text: { x: 160, y: y + 178, w: 960, h: 100 }, align: 'ctr' });

export const THEMES: ThemeDef[] = [
  {
    id: 'clerdo', name: 'Clerdo', note: 'Clean white with an ember accent', colors: C('clerdo'),
    fonts: { major: 'Aptos Display', minor: 'Aptos', name: 'Everyday' }, variants: ['coast', 'moss', 'plum'],
    background: solid(th('bg1')), sectionBackground: solid(th('tx2')),
    look: {
      title: { size: 40, bold: true }, body: { bulletColor: th('accent1') }, content: std,
      cover: { ...coverL(200), size: 54 }, section: { ...secL(), color: th('bg1'), textColor: th('bg1', 0, 0.75) },
    },
    master: () => [rect(88, 172, 84, 6, solid(th('accent1')))],
    cover: () => [rect(0, 0, 26, 720, solid(th('accent1'))), oval(980, 440, 420, 420, solid(th('accent2', 0, 0.9))), oval(1110, 360, 140, 140, solid(th('accent1')))],
    section: () => [rect(110, 474, 120, 8, solid(th('accent1'))), oval(1060, -120, 360, 360, solid(th('accent1', 0, 0.85)))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'harbor', name: 'Harbor', note: 'Navy header line and calm blues', colors: C('coast'),
    fonts: { major: 'Montserrat', minor: 'Open Sans', name: 'Geometric' }, variants: ['deepsea', 'slate', 'lagoon'],
    background: solid(th('bg1')), coverBackground: lin(120, [0, th('tx2')], [1, th('accent1', -0.25)]), sectionBackground: solid(th('bg2')),
    look: {
      title: { size: 34, bold: true, color: th('tx2') }, body: { bulletColor: th('accent2'), bullet: '■' },
      content: { x: 88, y: 50, w: 1104, h: 599 },
      cover: { ...coverL(220), color: th('bg1'), subColor: th('bg1', 0, 0.8) }, section: { title: { x: 520, y: 250, w: 680, h: 170 }, text: { x: 520, y: 428, w: 680, h: 100 }, align: 'l' },
    },
    master: () => [rect(0, 0, 1280, 14, solid(th('tx2'))), rect(0, 14, 260, 5, solid(th('accent2')))],
    cover: () => [ring(860, 120, 520, 520, th('bg1', 0, 0.18), 2), ring(960, 220, 320, 320, th('accent2', 0, 0.6), 3), rect(110, 426, 90, 6, solid(th('accent3')))],
    section: () => [rect(0, 0, 440, 720, solid(th('tx2'))), rect(440, 0, 12, 720, solid(th('accent2'))), ring(110, 210, 220, 220, th('bg1', 0, 0.35), 2)],
    ownCover: true, ownSection: true,
  },
  {
    id: 'ember', name: 'Ember', note: 'Charcoal with glowing orange', dark: true,
    colors: withC('sunrise', { dk1: 'F4EEEA', lt1: '1C1A1A', dk2: 'FFD7C2', lt2: '2A2625' }),
    fonts: { major: 'Poppins', minor: 'Inter', name: 'Modern' }, variants: ['berry', 'saffron', 'glacier'],
    background: solid(th('bg1')), coverBackground: radial([0, th('bg2', 0.08)], [1, th('bg1', -0.3)]),
    look: {
      title: { size: 38, bold: true }, body: { bulletColor: th('accent1'), bullet: '–' }, content: std,
      cover: { ...coverL(230), size: 56 }, section: secL(320),
    },
    master: () => [rect(1192, 60, 6, 80, solid(th('accent1'))), rect(88, 652, 1104, 1, solid(th('tx1', 0, 0.15)))],
    cover: () => [oval(820, -260, 760, 760, radial([0, th('accent1', 0, 0.85)], [0.6, th('accent2', 0, 0.25)], [1, th('accent2', 0, 0)])), rect(110, 436, 60, 6, solid(th('accent1')))],
    section: () => [oval(-200, 380, 620, 620, radial([0, th('accent1', 0, 0.55)], [1, th('accent1', 0, 0)])), rect(110, 494, 60, 6, solid(th('accent2')))],
    ownCover: true,
  },
  {
    id: 'meadow', name: 'Meadow', note: 'Soft greens with rounded forms', colors: C('moss'),
    fonts: { major: 'Nunito', minor: 'Nunito', name: 'Rounded' }, variants: ['citrus', 'evergreen', 'pastel'],
    background: solid(th('bg1')), coverBackground: solid(th('bg2')), sectionBackground: solid(th('accent1', 0.85)),
    look: {
      title: { size: 38, bold: true, color: th('tx2') }, body: { bulletColor: th('accent1'), bullet: '●' }, content: { x: 88, y: 38, w: 1060, h: 611 },
      cover: { ...coverL(190), color: th('tx2') }, section: { ...secL(280), color: th('tx2') },
    },
    master: () => [oval(1170, 610, 220, 220, solid(th('accent2', 0.3))), oval(1220, 560, 90, 90, solid(th('accent1', 0.2)))],
    cover: () => [oval(820, 180, 640, 640, solid(th('accent1', 0.55))), oval(1010, 80, 280, 280, solid(th('accent2', 0.35))), oval(-90, -90, 240, 240, solid(th('accent3', 0.5)))],
    section: () => [oval(900, 260, 560, 560, solid(th('bg1', 0, 0.55))), oval(1050, 120, 200, 200, solid(th('accent2', 0.4)))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'atelier', name: 'Atelier', note: 'Cream paper, serif type, fine rules', colors: withC('terracotta', { lt1: 'FBF7F0', lt2: 'F1E8DA' }),
    fonts: { major: 'Playfair Display', minor: 'Source Serif 4', name: 'Editorial' }, variants: ['copper', 'slate', 'evergreen'],
    background: solid(th('bg1')),
    look: {
      title: { size: 40, color: th('tx2') }, body: { bulletColor: th('accent1'), bullet: '–', size: 24 }, content: { x: 120, y: 58, w: 1040, h: 580 },
      cover: { ...coverC(170), size: 58, color: th('tx2') }, section: { ...secC(250), color: th('tx2') },
    },
    master: () => [rect(120, 40, 1040, 1.5, solid(th('tx2', 0, 0.6))), rect(120, 656, 1040, 1.5, solid(th('tx2', 0, 0.6)))],
    cover: () => [frame(40, 40, 1200, 640, th('tx2', 0, 0.7), 1), frame(52, 52, 1176, 616, th('accent1', 0, 0.8), 0.75), rect(600, 408, 80, 3, solid(th('accent1')))],
    section: () => [rect(540, 220, 200, 1.5, solid(th('accent1'))), rect(540, 492, 200, 1.5, solid(th('accent1')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'nocturne', name: 'Nocturne', note: 'Deep indigo night gradient', dark: true,
    colors: withC('plum', { dk1: 'F3EEFA', lt1: '161230', dk2: 'D9CCFF', lt2: '221C45', accent1: '9D7BFF', accent2: '5CC8FF', accent3: 'FF7AC6' }),
    fonts: { major: 'Poppins', minor: 'DM Sans', name: 'Night' }, variants: ['neon', 'glacier', 'orchid'],
    background: lin(135, [0, th('bg1')], [1, th('bg2')]),
    look: {
      title: { size: 38, bold: true }, body: { bulletColor: th('accent2'), bullet: '›' }, content: std,
      cover: { ...coverC(170), size: 56 }, section: secC(250),
    },
    master: () => [oval(1050, -160, 360, 360, radial([0, th('accent1', 0, 0.35)], [1, th('accent1', 0, 0)]))],
    cover: () => [oval(-200, 300, 700, 700, radial([0, th('accent1', 0, 0.5)], [1, th('accent1', 0, 0)])), oval(860, -240, 640, 640, radial([0, th('accent2', 0, 0.4)], [1, th('accent2', 0, 0)])), rect(600, 400, 80, 4, lin(0, [0, th('accent1')], [1, th('accent2')]))],
    section: () => [oval(380, 60, 520, 520, radial([0, th('accent3', 0, 0.3)], [1, th('accent3', 0, 0)]))],
  },
  {
    id: 'linen', name: 'Linen', note: 'Warm gray, quiet and minimal', colors: withC('slate', { lt1: 'F7F5F2', lt2: 'EAE6E0', dk1: '2B2925' }),
    fonts: { major: 'Lato', minor: 'Lato', name: 'Quiet' }, variants: ['copper', 'glacier', 'mono'],
    background: solid(th('bg1')),
    look: {
      title: { size: 36, color: th('tx1') }, body: { bulletColor: th('accent1'), bullet: '•' }, content: std,
      cover: { ...coverL(260), size: 50 }, section: secL(320),
    },
    master: () => [rect(88, 168, 1104, 1, solid(th('tx1', 0, 0.25)))],
    cover: () => [rect(110, 466, 40, 3, solid(th('accent1'))), rect(0, 650, 1280, 70, solid(th('bg2')))],
    section: () => [rect(110, 494, 40, 3, solid(th('accent1')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'summit', name: 'Summit', note: 'Layered peaks along the base', colors: C('glacier'),
    fonts: { major: 'Montserrat', minor: 'Lato', name: 'Summit' }, variants: ['evergreen', 'deepsea', 'sunrise'],
    background: solid(th('bg1')), coverBackground: lin(90, [0, th('bg2')], [1, th('bg1')]),
    look: {
      title: { size: 36, bold: true, caps: true, spacing: 1, color: th('tx2') }, body: { bulletColor: th('accent1') }, content: { x: 88, y: 38, w: 1104, h: 560 },
      cover: { ...coverC(110), color: th('tx2') }, section: { ...secC(140), color: th('tx2') },
    },
    master: () => [poly(0, 640, 1280, 80, [[0, 80], [260, 20], [430, 60], [700, 0], [980, 55], [1140, 25], [1280, 60], [1280, 80]], solid(th('accent1', 0.75)))],
    cover: () => [
      poly(0, 380, 1280, 340, [[0, 340], [0, 210], [260, 70], [470, 190], [740, 10], [1010, 170], [1150, 100], [1280, 160], [1280, 340]], solid(th('accent1', 0.55))),
      poly(0, 470, 1280, 250, [[0, 250], [0, 140], [190, 60], [420, 160], [640, 40], [900, 180], [1110, 70], [1280, 130], [1280, 250]], solid(th('accent1'))),
      poly(0, 580, 1280, 140, [[0, 140], [0, 90], [320, 20], [560, 100], [820, 10], [1080, 90], [1280, 40], [1280, 140]], solid(th('tx2'))),
    ],
    section: () => [poly(0, 450, 1280, 270, [[0, 270], [0, 160], [300, 30], [520, 150], [800, 0], [1060, 140], [1280, 60], [1280, 270]], solid(th('accent1', 0.4))),
      poly(0, 560, 1280, 160, [[0, 160], [0, 80], [260, 20], [600, 120], [900, 30], [1280, 110], [1280, 160]], solid(th('accent1')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'quartz', name: 'Quartz', note: 'Faceted geometric corners', colors: C('lagoon'),
    fonts: { major: 'Raleway', minor: 'Lato', name: 'Airy' }, variants: ['plum', 'graphite', 'citrus'],
    background: solid(th('bg1')),
    look: {
      title: { size: 38, bold: true, color: th('tx2') }, body: { bulletColor: th('accent1'), bullet: '◆' }, content: { x: 88, y: 38, w: 1000, h: 611 },
      cover: { ...coverL(220), size: 54, color: th('tx2') }, section: { ...secL(300), color: th('tx2') },
    },
    master: () => [poly(1130, 0, 150, 260, [[150, 0], [150, 260], [40, 120], [0, 0]], solid(th('accent1', 0.6))), poly(1200, 0, 80, 140, [[80, 0], [80, 140], [0, 0]], solid(th('accent1')))],
    cover: () => [
      poly(780, 0, 500, 720, [[220, 0], [500, 0], [500, 720], [0, 720]], solid(th('accent1'))),
      poly(900, 0, 380, 720, [[380, 0], [380, 460], [120, 0]], solid(th('accent2', 0, 0.85))),
      poly(980, 300, 300, 420, [[300, 0], [300, 420], [0, 420]], solid(th('tx2', 0, 0.8))),
    ],
    section: () => [poly(0, 0, 460, 720, [[0, 0], [300, 0], [460, 720], [0, 720]], solid(th('accent1', 0.75))), poly(0, 420, 300, 300, [[0, 0], [300, 300], [0, 300]], solid(th('accent1')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'tidal', name: 'Tidal', note: 'Flowing teal waves', colors: C('lagoon'),
    fonts: { major: 'Nunito', minor: 'Open Sans', name: 'Tidal' }, variants: ['deepsea', 'glacier', 'orchid'],
    background: solid(th('bg1')), coverBackground: lin(90, [0, th('accent1', 0.88)], [1, th('bg1')]),
    look: {
      title: { size: 38, bold: true, color: th('tx2') }, body: { bulletColor: th('accent1') }, content: { x: 88, y: 38, w: 1104, h: 570 },
      cover: { ...coverC(100), color: th('tx2') }, section: { ...secC(150), color: th('tx2') },
    },
    master: () => [wave(640, 80, solid(th('accent1', 0.7))), wave(668, 52, solid(th('accent1')), 1)],
    cover: () => [wave(420, 300, solid(th('accent2', 0.5))), wave(480, 240, solid(th('accent1', 0, 0.85)), 1), wave(570, 150, solid(th('tx2')))],
    section: () => [wave(470, 250, solid(th('accent1', 0.5)), 1), wave(560, 160, solid(th('accent1')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'monolith', name: 'Monolith', note: 'Bold black and white with a yellow edge', colors: withC('mono', { accent1: 'FFD12E', accent2: '2B2B2B', accent3: '8A8A8A', hlink: '1F5FD0' }),
    fonts: { major: 'Oswald', minor: 'Roboto', name: 'Condensed' }, variants: ['neon', 'berry', 'graphite'],
    background: solid(th('bg1')), coverBackground: solid(th('tx1')), sectionBackground: solid(th('accent1')),
    look: {
      title: { size: 40, bold: true, caps: true, spacing: 0.5 }, body: { bulletColor: th('tx1'), bullet: '■' }, content: { x: 120, y: 38, w: 1072, h: 611 },
      cover: { ...coverL(200), size: 64, color: th('bg1'), subColor: th('accent1') }, section: { ...secL(260), size: 60, color: th('tx1'), textColor: th('tx1') },
    },
    master: () => [rect(0, 0, 40, 720, solid(th('tx1'))), rect(40, 0, 10, 720, solid(th('accent1')))],
    cover: () => [rect(0, 640, 1280, 80, solid(th('accent1'))), rect(110, 406, 140, 10, solid(th('accent1')))],
    section: () => [rect(0, 0, 1280, 40, solid(th('tx1'))), rect(110, 434, 140, 10, solid(th('tx1')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'orchard', name: 'Orchard', note: 'Warm peach with a sun disc', colors: withC('sunrise', { lt2: 'FDEBDD' }),
    fonts: { major: 'DM Sans', minor: 'DM Sans', name: 'Friendly' }, variants: ['terracotta', 'saffron', 'berry'],
    background: solid(th('bg1')), coverBackground: solid(th('bg2')),
    look: {
      title: { size: 38, bold: true, color: th('tx2') }, body: { bulletColor: th('accent1'), bullet: '●' }, content: std,
      cover: { title: { x: 110, y: 200, w: 640, h: 220 }, sub: { x: 110, y: 430, w: 640, h: 110 }, align: 'l', color: th('tx2') }, section: { ...secL(300), color: th('tx2') },
    },
    master: () => [oval(1200, 30, 40, 40, solid(th('accent1')))],
    cover: () => [oval(780, 110, 500, 500, solid(th('accent1'))), oval(1020, 70, 170, 170, solid(th('accent2'))), rect(110, 424, 70, 6, solid(th('accent1')))],
    section: () => [oval(940, 180, 360, 360, solid(th('accent2', 0.4))), oval(1000, 240, 240, 240, solid(th('accent1')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'ledger', name: 'Ledger', note: 'Business-like header band', colors: C('graphite'),
    fonts: { major: 'Inter', minor: 'Inter', name: 'Neutral' }, variants: ['coast', 'evergreen', 'copper'],
    background: solid(th('bg1')), coverBackground: solid(th('tx2')), sectionBackground: solid(th('bg2')),
    look: {
      title: { size: 32, bold: true, color: th('bg1') }, body: { bulletColor: th('accent1'), bullet: '▪' },
      content: { x: 88, y: 18, w: 1104, h: 631 },
      cover: { ...coverL(240), color: th('bg1'), subColor: th('accent1', 0.5) }, section: { ...secL(280), color: th('tx2') },
    },
    master: () => [rect(0, 0, 1280, 134, solid(th('tx2'))), rect(0, 134, 1280, 5, solid(th('accent1')))],
    cover: () => [rect(0, 600, 1280, 120, solid(th('tx2', -0.35))), rect(0, 600, 1280, 5, solid(th('accent1'))), rect(110, 446, 80, 6, solid(th('accent1')))],
    section: () => [rect(0, 0, 30, 720, solid(th('accent1'))), rect(110, 270, 1060, 2, solid(th('tx2', 0, 0.25)))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'prism', name: 'Prism', note: 'Diagonal spectrum band', colors: C('neon'),
    fonts: { major: 'Poppins', minor: 'Poppins', name: 'Prism' }, variants: ['orchid', 'sunrise', 'lagoon'],
    background: solid(th('bg1')),
    look: {
      title: { size: 38, bold: true }, body: { bulletColor: th('accent1') }, content: std,
      cover: { ...coverL(160), size: 56 }, section: secL(240),
    },
    master: () => [poly(1080, 0, 200, 720, [[160, 0], [200, 0], [200, 720], [0, 720]], lin(90, [0, th('accent1')], [0.5, th('accent5')], [1, th('accent2')]))],
    cover: () => [
      poly(560, 0, 720, 720, [[420, 0], [560, 0], [140, 720], [0, 720]], solid(th('accent1'))),
      poly(700, 0, 580, 720, [[420, 0], [520, 0], [100, 720], [0, 720]], solid(th('accent5'))),
      poly(820, 0, 460, 720, [[420, 0], [460, 0], [460, 140], [80, 720], [0, 720]], solid(th('accent2'))),
      poly(980, 0, 300, 720, [[300, 240], [300, 720], [20, 720]], solid(th('accent4'))),
    ],
    section: () => [rect(0, 640, 1280, 10, lin(0, [0, th('accent1')], [0.33, th('accent5')], [0.66, th('accent2')], [1, th('accent4')]))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'folio', name: 'Folio', note: 'Magazine side panel and serif titles', colors: C('evergreen'),
    fonts: { major: 'Merriweather', minor: 'Lato', name: 'Classic' }, variants: ['berry', 'deepsea', 'saffron'],
    background: solid(th('bg1')), sectionBackground: solid(th('accent1')),
    look: {
      title: { size: 34, bold: true, color: th('tx2') }, body: { bulletColor: th('accent1') }, content: { x: 150, y: 38, w: 1042, h: 611 },
      cover: { title: { x: 560, y: 190, w: 640, h: 230 }, sub: { x: 560, y: 430, w: 640, h: 110 }, align: 'l', color: th('tx2') },
      section: { ...secL(280), color: th('bg1'), textColor: th('bg1', 0, 0.8) },
    },
    master: () => [rect(0, 0, 96, 720, solid(th('bg2'))), rect(96, 0, 4, 720, solid(th('accent1')))],
    cover: () => [rect(0, 0, 480, 720, solid(th('accent1'))), rect(480, 0, 14, 720, solid(th('accent2'))), dots(60, 60, 360, 600, th('bg1', 0, 0.35), th('accent1', 0, 0)), rect(560, 424, 90, 5, solid(th('accent1')))],
    section: () => [rect(0, 620, 1280, 100, solid(th('accent1', -0.3))), rect(110, 454, 90, 5, solid(th('accent2')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'signal', name: 'Signal', note: 'Dark slate with a dotted grid', dark: true,
    colors: withC('glacier', { dk1: 'E8F1F8', lt1: '0F1A24', dk2: '9FD8FF', lt2: '172634', accent1: '38BDF8', accent2: '34D399', accent3: 'FBBF24' }),
    fonts: { major: 'Roboto Mono', minor: 'Inter', name: 'Technical' }, variants: ['neon', 'lagoon', 'citrus'],
    background: solid(th('bg1')),
    look: {
      title: { size: 34, bold: true, color: th('tx1') }, body: { bulletColor: th('accent2'), bullet: '>' }, content: std,
      cover: { ...coverL(240), size: 50 }, section: secL(320),
    },
    master: () => [dots(0, 0, 1280, 720, th('tx1', 0, 0.07)), rect(88, 30, 34, 4, solid(th('accent1'))), rect(126, 30, 12, 4, solid(th('accent2')))],
    cover: () => [rect(110, 446, 160, 4, solid(th('accent1'))), rect(276, 446, 40, 4, solid(th('accent2'))), frame(880, 120, 280, 280, th('accent1', 0, 0.5), 1.5), frame(940, 180, 280, 280, th('accent2', 0, 0.4), 1.5)],
    section: () => [rect(110, 494, 120, 4, solid(th('accent2')))],
  },
  {
    id: 'bloom', name: 'Bloom', note: 'Pastel blossoms and soft shapes', colors: withC('pastel', { accent1: 'E77FA0', accent2: 'A98BE0', dk2: '5A3D6E' }),
    fonts: { major: 'Nunito', minor: 'Nunito', name: 'Rounded' }, variants: ['orchid', 'glacier', 'citrus'],
    background: solid(th('bg1')), coverBackground: lin(45, [0, th('accent1', 0.85)], [1, th('accent2', 0.8)]),
    look: {
      title: { size: 38, bold: true, color: th('tx2') }, body: { bulletColor: th('accent1'), bullet: '●' }, content: std,
      cover: { ...coverC(160), color: th('tx2') }, section: { ...secC(240), color: th('tx2') },
    },
    master: () => [oval(-80, 600, 200, 200, solid(th('accent1', 0.6))), oval(40, 660, 90, 90, solid(th('accent2', 0.5)))],
    cover: () => [oval(-120, -140, 420, 420, solid(th('bg1', 0, 0.5))), oval(980, 420, 420, 420, solid(th('bg1', 0, 0.45))), oval(1080, 380, 140, 140, solid(th('accent1', 0, 0.6))), oval(150, 520, 110, 110, solid(th('accent2', 0, 0.55)))],
    section: () => [oval(-100, 380, 420, 420, solid(th('accent1', 0.7))), oval(1000, -100, 380, 380, solid(th('accent2', 0.7)))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'canyon', name: 'Canyon', note: 'Sandstone tones and poster type', colors: withC('terracotta', { lt1: 'FFFFFF', lt2: 'F5E6D8' }),
    fonts: { major: 'Bebas Neue', minor: 'Lato', name: 'Poster' }, variants: ['copper', 'saffron', 'slate'],
    background: solid(th('bg1')), coverBackground: solid(th('accent1')), sectionBackground: solid(th('bg2')),
    look: {
      title: { size: 48, color: th('accent1', -0.25), spacing: 1 }, body: { bulletColor: th('accent2'), bullet: '■' }, content: std,
      cover: { ...coverL(200), size: 88, color: th('bg1'), subColor: th('bg1', 0, 0.85) }, section: { ...secL(260), size: 72, color: th('accent1') },
    },
    master: () => [rect(0, 690, 1280, 30, solid(th('accent1'))), rect(0, 682, 1280, 8, solid(th('accent2')))],
    cover: () => [
      poly(0, 520, 1280, 200, [[0, 200], [0, 60], [210, 60], [210, 0], [520, 0], [520, 90], [860, 90], [860, 30], [1280, 30], [1280, 200]], solid(th('accent1', -0.3))),
      poly(0, 610, 1280, 110, [[0, 110], [0, 40], [380, 40], [380, 0], [760, 0], [760, 50], [1280, 50], [1280, 110]], solid(th('accent2', -0.2))),
    ],
    section: () => [rect(0, 0, 1280, 26, solid(th('accent1'))), rect(0, 26, 1280, 8, solid(th('accent2')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'arctic', name: 'Arctic', note: 'Icy blue light and thin type', colors: C('glacier'),
    fonts: { major: 'Raleway', minor: 'Raleway', name: 'Arctic' }, variants: ['deepsea', 'pastel', 'slate'],
    background: lin(90, [0, th('bg2')], [0.35, th('bg1')], [1, th('bg1')]),
    look: {
      title: { size: 38, color: th('tx2') }, body: { bulletColor: th('accent1'), bullet: '–' }, content: std,
      cover: { ...coverC(170), size: 56, color: th('tx2') }, section: { ...secC(250), color: th('tx2') },
    },
    master: () => [rect(88, 30, 1104, 2, lin(0, [0, th('accent1', 0, 0)], [0.5, th('accent1')], [1, th('accent2', 0, 0)]))],
    cover: () => [oval(140, -520, 1000, 900, radial([0, th('accent2', 0.4, 0.8)], [1, th('accent2', 0, 0)])), rect(560, 404, 160, 2, solid(th('accent1')))],
    section: () => [rect(560, 214, 160, 2, solid(th('accent1')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'sable', name: 'Sable', note: 'Black with gold, refined serif', dark: true,
    colors: withC('copper', { dk1: 'F5EFE4', lt1: '121110', dk2: 'E2C27A', lt2: '1E1C19', accent1: 'C9A24B', accent2: 'E8D3A0', accent3: '8C7A5B' }),
    fonts: { major: 'Playfair Display', minor: 'Lato', name: 'Contrast' }, variants: ['saffron', 'berry', 'evergreen'],
    background: solid(th('bg1')),
    look: {
      title: { size: 38, color: th('tx2') }, body: { bulletColor: th('accent1'), bullet: '◆' }, content: { x: 110, y: 50, w: 1060, h: 590 },
      cover: { ...coverC(170), size: 58, color: th('tx2'), subColor: th('tx1', 0, 0.8) }, section: { ...secC(250), color: th('tx2') },
    },
    master: () => [frame(28, 28, 1224, 664, th('accent1', 0, 0.55), 0.75)],
    cover: () => [frame(36, 36, 1208, 648, th('accent1'), 1), frame(48, 48, 1184, 624, th('accent1', 0, 0.4), 0.5), poly(610, 400, 60, 20, [[0, 10], [30, 0], [60, 10], [30, 20]], solid(th('accent1')))],
    section: () => [rect(500, 214, 280, 1, solid(th('accent1'))), rect(500, 496, 280, 1, solid(th('accent1')))],
    ownCover: true,
  },
  {
    id: 'grove', name: 'Grove', note: 'Forest green with cream text', dark: true,
    colors: withC('evergreen', { dk1: 'F3EEDD', lt1: '17301F', dk2: 'D4E8B0', lt2: '20402B', accent1: 'A8C66C', accent2: 'E6B85C', accent3: '7FB8A4' }),
    fonts: { major: 'Merriweather', minor: 'Open Sans', name: 'Grove' }, variants: ['moss', 'copper', 'lagoon'],
    background: solid(th('bg1')), coverBackground: lin(160, [0, th('bg2')], [1, th('bg1', -0.25)]),
    look: {
      title: { size: 34, bold: true, color: th('tx2') }, body: { bulletColor: th('accent2') }, content: std,
      cover: { ...coverL(220), size: 50, color: th('tx1') }, section: secL(300),
    },
    master: () => [rect(1240, 0, 40, 720, solid(th('bg2'))), rect(1236, 0, 4, 720, solid(th('accent1')))],
    cover: () => [
      pathShape(820, 0, 460, 720, 'M460 0 L460 720 L120 720 C 260 560, 40 420, 200 260 C 320 140, 200 60, 280 0 Z', solid(th('accent1', 0, 0.85))),
      pathShape(980, 0, 300, 720, 'M300 0 L300 720 L160 720 C 260 560, 80 440, 180 300 C 260 180, 140 80, 200 0 Z', solid(th('accent2', 0, 0.8))),
      rect(110, 426, 80, 5, solid(th('accent2'))),
    ],
    section: () => [pathShape(1000, 0, 280, 720, 'M280 0 L280 720 L140 720 C 220 520, 40 380, 160 220 C 240 120, 140 40, 180 0 Z', solid(th('accent1', 0, 0.7)))],
  },
  {
    id: 'studio', name: 'Studio', note: 'Bold color block on the right', colors: C('citrus'),
    fonts: { major: 'Montserrat', minor: 'Montserrat', name: 'Studio' }, variants: ['berry', 'coast', 'sunrise'],
    background: solid(th('bg1')), sectionBackground: solid(th('accent1')),
    look: {
      title: { size: 36, bold: true, color: th('tx2') }, body: { bulletColor: th('accent1'), bullet: '■' }, content: { x: 88, y: 38, w: 1020, h: 611 },
      cover: { title: { x: 110, y: 190, w: 640, h: 240 }, sub: { x: 110, y: 440, w: 640, h: 110 }, align: 'l', size: 52, color: th('tx2') },
      section: { ...secL(280), color: th('tx1'), textColor: th('tx1', 0, 0.8) },
    },
    master: () => [rect(1176, 0, 104, 120, solid(th('accent1'))), rect(1176, 120, 104, 24, solid(th('accent2')))],
    cover: () => [rect(820, 0, 460, 720, solid(th('accent1'))), rect(820, 0, 460, 220, solid(th('accent2'))), rect(760, 480, 200, 200, solid(th('tx2'))), rect(110, 434, 100, 8, solid(th('accent1')))],
    section: () => [rect(980, 0, 300, 720, solid(th('accent2'))), rect(920, 520, 120, 120, solid(th('tx2')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'pulse', name: 'Pulse', note: 'Vivid magenta and cyan stripes', colors: withC('neon', { lt1: 'FFFFFF', dk2: '2A1442' }),
    fonts: { major: 'Poppins', minor: 'Inter', name: 'Modern' }, variants: ['orchid', 'lagoon', 'sunrise'],
    background: solid(th('bg1')), coverBackground: solid(th('tx2')), sectionBackground: solid(th('tx2')),
    look: {
      title: { size: 38, bold: true, color: th('tx2') }, body: { bulletColor: th('accent1') }, content: { x: 120, y: 38, w: 1072, h: 611 },
      cover: { ...coverL(220), size: 56, color: th('bg1'), subColor: th('accent2') }, section: { ...secL(290), color: th('bg1'), textColor: th('accent2') },
    },
    master: () => [rect(40, 60, 10, 110, solid(th('accent1'))), rect(58, 60, 10, 70, solid(th('accent2')))],
    cover: () => [
      poly(900, 0, 380, 720, [[200, 0], [260, 0], [60, 720], [0, 720]], solid(th('accent1'))),
      poly(980, 0, 300, 720, [[200, 0], [240, 0], [40, 720], [0, 720]], solid(th('accent2'))),
      poly(1060, 0, 220, 720, [[200, 0], [220, 0], [220, 60], [40, 720], [0, 720]], solid(th('accent4'))),
      rect(110, 426, 60, 8, solid(th('accent1'))), rect(176, 426, 24, 8, solid(th('accent2'))),
    ],
    section: () => [rect(0, 0, 1280, 12, lin(0, [0, th('accent1')], [1, th('accent2')])), rect(110, 464, 60, 8, solid(th('accent1')))],
    ownCover: true, ownSection: true,
  },
  {
    id: 'horizon', name: 'Horizon', note: 'Sunset gradient opener', colors: C('sunrise'),
    fonts: { major: 'DM Sans', minor: 'DM Sans', name: 'Friendly' }, variants: ['orchid', 'deepsea', 'saffron'],
    background: solid(th('bg1')),
    coverBackground: lin(90, [0, th('accent4', -0.2)], [0.55, th('accent3')], [1, th('accent2')]),
    sectionBackground: lin(0, [0, th('accent1')], [1, th('accent3')]),
    look: {
      title: { size: 38, bold: true, color: th('tx2') }, body: { bulletColor: th('accent1') }, content: std,
      cover: { ...coverC(150), size: 58, color: th('bg1'), subColor: th('bg1', 0, 0.85) }, section: { ...secC(240), color: th('bg1'), textColor: th('bg1', 0, 0.85) },
    },
    master: () => [rect(0, 712, 1280, 8, lin(0, [0, th('accent4')], [0.5, th('accent3')], [1, th('accent2')]))],
    cover: () => [oval(440, 470, 400, 400, solid(th('accent2', 0.4, 0.9))), rect(0, 600, 1280, 120, lin(90, [0, th('accent1', 0, 0.2)], [1, th('accent1', -0.4, 0.95)]))],
    section: () => [oval(1040, 480, 300, 300, solid(th('bg1', 0, 0.2)))],
    ownCover: true, ownSection: true,
  },
];

export const themeById = (id: string): ThemeDef | undefined => THEMES.find((t) => t.id === id);
export const themeByName = (name: string | undefined): ThemeDef | undefined => (name ? THEMES.find((t) => t.name === name) : undefined);

/** Colors for variant 0..3 of a theme. Variant 0 is the theme's own palette. */
export const variantColors = (def: ThemeDef, v: number): { name: string; colors: ThemeColors } => {
  if (v <= 0) return { name: def.name, colors: { ...def.colors } };
  const set = COLOR_SETS.find((x) => x.id === def.variants[v - 1]) ?? COLOR_SETS[0]!;
  const c = set.colors;
  const keep = def.dark ? { dk1: def.colors.dk1, lt1: def.colors.lt1, dk2: def.colors.dk2, lt2: def.colors.lt2 } : { dk1: def.colors.dk1, lt1: def.colors.lt1, dk2: c.dk2, lt2: def.colors.lt2 };
  return { name: `${def.name} ${set.name}`, colors: { ...c, ...keep } };
};

export const themeOf = (def: ThemeDef, v = 0): Theme => {
  const vc = variantColors(def, v);
  return { name: def.name, colorsName: vc.name, colors: vc.colors, fonts: { ...def.fonts } };
};

// ---------- Building a master ----------

const FIELD = new Set(['dt', 'ftr', 'sldNum']);
const CONTENT_TYPES = new Set(['obj', 'twoObj', 'twoTxTwoObj', 'titleOnly', 'vertTx', 'objTx', 'picTx', 'vertTitleAndTx', 'tx', 'txAndObj', 'objAndTx', 'cust']);

const mapBox = (s: { x: number; y: number; w: number; h: number }, to: Box): void => {
  const kx = to.w / std.w, ky = to.h / std.h;
  const x = to.x + (s.x - std.x) * kx, y = to.y + (s.y - std.y) * ky;
  s.w = Math.round(s.w * kx); s.h = Math.round(s.h * ky); s.x = Math.round(x); s.y = Math.round(y);
};

const setPara0 = (s: AutoShape, st: ParaStyle, vAlign?: 't' | 'ctr' | 'b'): void => {
  const p0 = s.text?.paras[0];
  const style = { ...(p0?.style ?? {}), ...st, defRun: { ...(p0?.style?.defRun ?? {}), ...(st.defRun ?? {}) } };
  s.text = { ...(s.text ?? { paras: [] }), paras: [{ runs: [], style }], ...(vAlign ? { vAlign } : {}) };
};

const fade = (c: Color | undefined): Color | undefined =>
  c === undefined ? undefined : typeof c === 'string' ? { hex: c, alpha: 0.8 } : 'hex' in c ? { ...c, alpha: 0.8 } : { theme: c.theme, ...(c.lum ? { lum: c.lum } : {}), alpha: 0.8 };

const place = (s: Shape, b: Box): void => { s.x = b.x; s.y = b.y; s.w = b.w; s.h = b.h; };

/** Scales shapes from the 1280 x 720 design space to the slide size (x and y separately). */
export const scaleShapesXY = (shapes: Shape[], sx: number, sy: number): void => {
  if (sx === 1 && sy === 1) return;
  for (const s of shapes) { s.x = Math.round(s.x * sx); s.y = Math.round(s.y * sy); s.w = Math.round(s.w * sx); s.h = Math.round(s.h * sy); }
};

const fresh = (shapes: Decor[]): Shape[] => shapes.map((s) => ({ ...s, id: uid('s') }));

/** A complete master for a theme at a slide size. */
export const buildThemeMaster = (def: ThemeDef, variant: number, W: number, H: number): Master => {
  const m = newMaster(1280, 720, themeOf(def, variant));
  const L = def.look;
  const align = (a: 'l' | 'ctr' | 'r' | undefined) => a ?? 'l';
  // Text styles
  const t0 = m.textStyles.title[0]!;
  m.textStyles.title[0] = {
    ...t0, align: align(L.title.align),
    defRun: { ...t0.defRun, size: L.title.size, ...(L.title.bold ? { bold: true } : {}), ...(L.title.caps ? { caps: 'all' } : {}), ...(L.title.spacing ? { spacing: L.title.spacing } : {}), color: L.title.color ?? { theme: 'tx1' } },
  };
  m.textStyles.body = m.textStyles.body.map((p, i) => ({
    ...p,
    ...(L.body?.lineSpacing ? { lineSpacing: L.body.lineSpacing } : {}),
    bullet: { type: 'char', char: L.body?.bullet ?? '•', font: 'Arial', ...(['◆', '■', '—', '●'].includes(L.body?.bullet ?? '') ? { size: 70 } : {}), ...(L.body?.bulletColor ? { color: L.body.bulletColor } : {}) },
    defRun: { ...p.defRun, ...(i === 0 && L.body?.size ? { size: L.body.size } : {}), color: L.body?.color ?? { theme: 'tx1' } },
  }));
  // Master placeholders and decoration
  const fy = L.footerY ?? 667;
  for (const s of m.shapes) {
    if (s.ph && FIELD.has(s.ph.type)) { mapBox(s, L.content); s.y = fy; s.h = 38; } else if (s.ph) mapBox(s, L.content);
  }
  m.background = { fill: structuredClone(def.background) };
  m.shapes = [...fresh(def.master()), ...m.shapes];
  // Layouts
  for (const l of m.layouts) {
    for (const s of l.shapes) if (s.ph && FIELD.has(s.ph.type)) { mapBox(s, L.content); s.y = fy; s.h = 38; }
    if (l.type === 'title') {
      const c = L.cover;
      for (const s of l.shapes) {
        if (s.kind !== 'shape' || !s.ph) continue;
        if (s.ph.type === 'ctrTitle') { place(s, c.title); setPara0(s, { align: c.align, defRun: { ...(c.size ? { size: c.size } : {}), ...(c.color ? { color: c.color } : {}) } }, c.vAlign ?? 'b'); }
        if (s.ph.type === 'subTitle') { const sc = c.subColor ?? fade(c.color); place(s, c.sub); setPara0(s, { align: c.align, bullet: { type: 'none' }, marginLeft: 0, indent: 0, defRun: { size: 22, ...(sc ? { color: sc } : {}) } }); }
      }
      if (def.coverBackground) l.background = { fill: structuredClone(def.coverBackground) };
      if (def.cover) l.shapes = [...fresh(def.cover()), ...l.shapes];
      if (def.ownCover) l.hideMasterGraphics = true;
    } else if (l.type === 'secHead') {
      const c = L.section;
      for (const s of l.shapes) {
        if (s.kind !== 'shape' || !s.ph) continue;
        if (s.ph.type === 'title') { place(s, c.title); setPara0(s, { align: c.align, defRun: { size: c.size ?? 44, ...(c.color ? { color: c.color } : {}) } }, 'b'); }
        if (s.ph.type === 'body') { place(s, c.text); setPara0(s, { align: c.align, bullet: { type: 'none' }, marginLeft: 0, indent: 0, defRun: { size: 20, ...(c.textColor ?? c.color ? { color: c.textColor ?? c.color! } : {}) } }); }
      }
      if (def.sectionBackground) l.background = { fill: structuredClone(def.sectionBackground) };
      if (def.section) l.shapes = [...fresh(def.section()), ...l.shapes];
      if (def.ownSection) l.hideMasterGraphics = true;
    } else if (CONTENT_TYPES.has(l.type)) {
      for (const s of l.shapes) if (s.ph && !FIELD.has(s.ph.type)) mapBox(s, L.content);
    }
  }
  const sx = W / 1280, sy = H / 720;
  scaleShapesXY(m.shapes, sx, sy);
  for (const l of m.layouts) scaleShapesXY(l.shapes, sx, sy);
  // Circles stay round on slides that aren't 16:9.
  if (Math.abs(sx - sy) > 0.01) {
    const round = (list: Shape[]) => {
      for (const s of list) if (!s.ph && s.kind === 'shape' && s.geom === 'ellipse') {
        const d = Math.min(s.w, s.h), cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        s.w = s.h = d; s.x = Math.round(cx - d / 2); s.y = Math.round(cy - d / 2);
      }
    };
    round(m.shapes); for (const l of m.layouts) round(l.shapes);
  }
  return m;
};

/** Layouts by type for quick lookups. */
export const layoutByType = (m: Master, type: string): Layout | undefined => m.layouts.find((l) => l.type === type);

// ---------- Background styles ----------

export interface BackgroundStyle { id: string; name: string; fill: Fill }

/** Twelve background styles built from the theme's background and text colors. */
export const BACKGROUND_STYLES: BackgroundStyle[] = [
  { id: 'bg1', name: 'Background 1', fill: solid(th('bg1')) },
  { id: 'bg2', name: 'Background 2', fill: solid(th('bg2')) },
  { id: 'tx2', name: 'Text 2', fill: solid(th('tx2')) },
  { id: 'tx1', name: 'Text 1', fill: solid(th('tx1')) },
  { id: 'g1', name: 'Soft fade', fill: lin(90, [0, th('bg1')], [1, th('bg2')]) },
  { id: 'g2', name: 'Light glow', fill: radial([0, th('bg1')], [1, th('bg2', -0.08)]) },
  { id: 'g3', name: 'Deep fade', fill: lin(90, [0, th('tx2', 0.15)], [1, th('tx2', -0.35)]) },
  { id: 'g4', name: 'Accent dusk', fill: lin(135, [0, th('tx2')], [1, th('accent1', -0.3)]) },
  { id: 'p1', name: 'Paper dots', fill: { type: 'pattern', pattern: 'dotGrid', fg: th('bg2', -0.12), bg: th('bg1') } },
  { id: 'p2', name: 'Fine grid', fill: { type: 'pattern', pattern: 'cross', fg: th('bg2', -0.06), bg: th('bg1') } },
  { id: 'g5', name: 'Accent wash', fill: lin(45, [0, th('accent1', 0.85)], [1, th('accent2', 0.8)]) },
  { id: 'g6', name: 'Night glow', fill: radial([0, th('tx2', 0.1)], [1, th('tx1')]) },
];
