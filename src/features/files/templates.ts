// Starter templates: our own designs, built from the model and the theme so they recolour with it.
import type { Deck, Shape, Theme } from '../../model/deck';
import { addSlide, designDeck, rect, shape, solid, T, type Design } from './build';

const theme = (name: string, colors: Partial<Theme['colors']>, major: string, minor: string): Theme => ({
  name, colorsName: name, fonts: { major, minor, name },
  colors: {
    dk1: '#1A1A1A', lt1: '#FFFFFF', dk2: '#2B2F38', lt2: '#EEF0F3',
    accent1: '#2C7BE5', accent2: '#F5A623', accent3: '#1FA971', accent4: '#E8401C', accent5: '#8E44AD', accent6: '#00A3B4',
    hlink: '#2C5BD8', folHlink: '#7A4FB0', ...colors,
  },
});

const sx = (W: number) => W / 1280, sy = (H: number) => H / 720;

export const DESIGNS: Design[] = [
  {
    name: 'Ember',
    theme: theme('Ember', { dk2: '#3A1A12', lt2: '#FBEDE7', accent1: '#E8401C', accent2: '#F5A623', accent3: '#B8321A', accent4: '#2C7BE5' }, 'Montserrat', 'Open Sans'),
    master: (W, H) => [rect('Accent bar', 0, 0, W, Math.round(10 * sy(H)), solid(T('accent1')))],
    title: (W, H) => [
      rect('Band', 0, 0, W, H, { type: 'gradient', kind: 'linear', angle: 135, stops: [{ pos: 0, color: T('accent1') }, { pos: 1, color: T('accent2') }] }),
      shape('ellipse', 'Glow', W * 0.62, -H * 0.3, W * 0.6, W * 0.6, solid(T('bg1', 0, 0.12))),
    ],
    titleInk: T('bg1'),
  },
  {
    name: 'Harbor',
    theme: theme('Harbor', { dk1: '#0E2233', dk2: '#13344F', lt2: '#E6F0F7', accent1: '#1C6EA4', accent2: '#2AB3A6', accent3: '#F2B134', accent4: '#E4572E' }, 'Lato', 'Lato'),
    master: (W, H) => [rect('Side', 0, 0, Math.round(14 * sx(W)), H, solid(T('accent1')))],
    title: (W, H) => [rect('Panel', 0, 0, W, H, solid(T('tx2'))), rect('Line', 0, H - 18 * sy(H), W, 18 * sy(H), solid(T('accent2'))), rect('Side', 0, 0, Math.round(14 * sx(W)), H, solid(T('accent1')))],
    titleInk: T('bg1'),
  },
  {
    name: 'Meadow',
    theme: theme('Meadow', { dk1: '#1F2A1E', dk2: '#2F4A2C', lt2: '#EEF5EA', accent1: '#3E8E41', accent2: '#A4C639', accent3: '#F4B942', accent4: '#5B8DB8' }, 'Raleway', 'Nunito'),
    background: solid(T('bg2', 0.5)),
    master: (W, H) => [shape('ellipse', 'Leaf', W - 160 * sx(W), H - 160 * sy(H), 260 * sx(W), 260 * sx(W), solid(T('accent2', 0, 0.25)))],
    title: (W, H) => [shape('ellipse', 'Sun', W * 0.68, H * 0.08, W * 0.44, W * 0.44, solid(T('accent2', 0.4))), shape('ellipse', 'Hill', -W * 0.2, H * 0.62, W * 1.4, H * 0.9, solid(T('accent1')))],
  },
  {
    name: 'Graphite',
    theme: theme('Graphite', { dk1: '#F4F5F7', lt1: '#16181D', dk2: '#C9CED6', lt2: '#22252C', accent1: '#4FC3F7', accent2: '#FFB74D', accent3: '#81C784', accent4: '#F06292' }, 'Inter', 'Inter'),
    master: (W, H) => [rect('Rule', 88 * sx(W), H - 72 * sy(H), W - 176 * sx(W), 2, solid(T('accent1', 0, 0.6)))],
    title: (W, H) => [rect('Glow', 0, H * 0.72, W, H * 0.28, { type: 'gradient', kind: 'linear', angle: 270, stops: [{ pos: 0, color: T('accent1', 0, 0.35) }, { pos: 1, color: T('bg1', 0, 0) }] })],
  },
  {
    name: 'Paper',
    theme: theme('Paper', { dk1: '#2A2622', dk2: '#5B4E43', lt1: '#FFFDF8', lt2: '#F3ECE1', accent1: '#B5523B', accent2: '#3C6E71', accent3: '#D9A441', accent4: '#6A4C93' }, 'Playfair Display', 'Source Serif 4'),
    background: solid(T('bg1')),
    master: (W, H) => [rect('Frame', 24 * sx(W), 24 * sy(H), W - 48 * sx(W), H - 48 * sy(H), { type: 'none' }, { line: { fill: solid(T('accent1', 0, 0.5)), width: 1 } })],
    title: (W, H) => [rect('Frame', 24 * sx(W), 24 * sy(H), W - 48 * sx(W), H - 48 * sy(H), { type: 'none' }, { line: { fill: solid(T('accent1')), width: 2 } }), rect('Dash', W / 2 - 60, H * 0.5, 120, 3, solid(T('accent1')))],
  },
  {
    name: 'Citrus',
    theme: theme('Citrus', { dk1: '#232323', dk2: '#3B3B3B', lt2: '#FFF6E0', accent1: '#FF8A00', accent2: '#FFC300', accent3: '#00A86B', accent4: '#2D7DD2' }, 'Poppins', 'Poppins'),
    master: (W, H) => [shape('ellipse', 'Dot', W - 70 * sx(W), 28 * sy(H), 36 * sx(W), 36 * sx(W), solid(T('accent2')))],
    title: (W, H) => [rect('Back', 0, 0, W, H, solid(T('accent2', 0.7))), shape('ellipse', 'Orange', W * 0.66, H * 0.12, H * 0.76, H * 0.76, solid(T('accent1'))), shape('ellipse', 'Slice', W * 0.71, H * 0.21, H * 0.58, H * 0.58, solid(T('accent2')))],
    titleAlign: 'l',
  },
  {
    name: 'Nordic',
    theme: theme('Nordic', { dk1: '#1D2733', dk2: '#3C4B5C', lt2: '#EDF1F5', accent1: '#5E81AC', accent2: '#88C0D0', accent3: '#A3BE8C', accent4: '#D08770' }, 'DM Sans', 'DM Sans'),
    background: solid(T('bg2', 0.4)),
    master: () => [],
    title: (W, H) => [rect('Block', W * 0.08, H * 0.16, W * 0.84, H * 0.68, solid(T('bg1'))), rect('Bar', W * 0.08, H * 0.16, 10, H * 0.68, solid(T('accent1')))],
  },
  {
    name: 'Midnight',
    theme: theme('Midnight', { dk1: '#FFFFFF', lt1: '#0B1530', dk2: '#C8D3F0', lt2: '#13224A', accent1: '#7C5CFF', accent2: '#00D1B2', accent3: '#FFC857', accent4: '#FF6B8B' }, 'Montserrat', 'Roboto'),
    background: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: T('bg1') }, { pos: 1, color: T('bg2') }] },
    master: (W, H) => [shape('ellipse', 'Orb', W * 0.8, -H * 0.2, W * 0.4, W * 0.4, solid(T('accent1', 0, 0.18)))],
    title: (W, H) => [shape('ellipse', 'Orb', W * 0.55, -H * 0.35, W * 0.7, W * 0.7, solid(T('accent1', 0, 0.3))), shape('ellipse', 'Orb 2', -W * 0.1, H * 0.6, W * 0.4, W * 0.4, solid(T('accent2', 0, 0.2)))],
  },
  {
    name: 'Studio',
    theme: theme('Studio', { dk1: '#111111', dk2: '#444444', lt2: '#F2F2F2', accent1: '#111111', accent2: '#E63946', accent3: '#457B9D', accent4: '#A8DADC' }, 'Bebas Neue', 'Inter'),
    master: (W, H) => [rect('Tag', W - 120 * sx(W), H - 46 * sy(H), 120 * sx(W), 46 * sy(H), solid(T('accent2')))],
    title: (W, H) => [rect('Band', 0, H * 0.8, W, H * 0.2, solid(T('tx1'))), rect('Red', W * 0.125, H * 0.8 - 20, 40, 40, solid(T('accent2')))],
    titleAlign: 'l',
  },
  {
    name: 'Coral reef',
    theme: theme('Coral reef', { dk1: '#14213D', dk2: '#1F3B57', lt2: '#FFF1EC', accent1: '#FF7F50', accent2: '#2EC4B6', accent3: '#FFBF69', accent4: '#3D5A80' }, 'Nunito', 'Nunito'),
    master: (W, H) => [shape('wave', 'Wave', -20, H - 60 * sy(H), W + 40, 80 * sy(H), solid(T('accent2', 0, 0.35)))],
    title: (W, H) => [rect('Sea', 0, 0, W, H, { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: T('accent2', 0.6) }, { pos: 1, color: T('accent2') }] }), shape('wave', 'Wave', -40, H * 0.7, W + 80, H * 0.32, solid(T('accent1')))],
  },
  {
    name: 'Ledger',
    theme: theme('Ledger', { dk1: '#1C1C1C', dk2: '#20343F', lt2: '#EEF2F2', accent1: '#20343F', accent2: '#C9A227', accent3: '#4F7C82', accent4: '#9AA5A8' }, 'Merriweather', 'Lato'),
    master: (W, H) => [rect('Top', 0, 0, W, 54 * sy(H), solid(T('tx2'))), rect('Gold', 0, 54 * sy(H), W, 4, solid(T('accent2')))],
    title: (W, H) => [rect('Back', 0, 0, W, H, solid(T('tx2'))), rect('Gold', W * 0.125, H * 0.66, W * 0.2, 4, solid(T('accent2')))],
    titleInk: T('bg1'),
    titleAlign: 'l',
  },
  {
    name: 'Blossom',
    theme: theme('Blossom', { dk1: '#3B2B33', dk2: '#6B4C5A', lt2: '#FCEFF3', accent1: '#E56B9F', accent2: '#9B5DE5', accent3: '#F7B267', accent4: '#4ECDC4' }, 'Playfair Display', 'Raleway'),
    background: solid(T('bg2', 0.5)),
    master: (W, H) => [shape('ellipse', 'Petal', -60 * sx(W), H - 120 * sy(H), 200 * sx(W), 200 * sx(W), solid(T('accent1', 0, 0.2)))],
    title: (W, H) => [shape('ellipse', 'Petal', W * 0.74, H * 0.05, W * 0.3, W * 0.3, solid(T('accent1', 0, 0.45))), shape('ellipse', 'Petal 2', W * 0.86, H * 0.42, W * 0.18, W * 0.18, solid(T('accent2', 0, 0.35))), shape('ellipse', 'Petal 3', -W * 0.06, H * 0.7, W * 0.2, W * 0.2, solid(T('accent3', 0, 0.4)))],
  },
];

/** A template deck: a title slide and a few content slides that show the layouts. */
export const templateDeck = (d: Design, W = 1280, H = 720): Deck => {
  const deck = designDeck(d, W, H);
  deck.slides = [];
  addSlide(deck, 'title', { title: d.name, sub: 'Presentation subtitle' });
  addSlide(deck, 'obj', { title: 'Title and content', body: 'First point\nSecond point\n\tA detail\nThird point' });
  addSlide(deck, 'twoObj', { title: 'Two columns', body: 'Left side\nMore here', body2: 'Right side\nAnd here' });
  addSlide(deck, 'secHead', { title: 'Section title', body: 'What this part is about' });
  deck.props = { title: d.name, created: new Date().toISOString() };
  return deck;
};

/** Blank presentation in a design (only the title slide). */
export const blankFrom = (d: Design): Deck => {
  const deck = designDeck(d);
  return deck;
};

export const allShapes = (deck: Deck): Shape[] => deck.slides.flatMap((s) => s.shapes);
