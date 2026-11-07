// File formats offered to open, save and export. Writers that rasterize are loaded on demand.
import { registerFormat, type FileFormat } from '../app/registry';
import type { FrameStore } from '../app/store';
import type { Deck, Diagram, Shape } from '../model/deck';
import { layoutDiagram } from '../features/diagrams/layout';
import { writeOdp } from './odp';
import { outlineRtf, outlineText } from './outline';
import type { PageOptions } from './pages';
import { readPptx, writePptx, type PptxKind } from './pptx';

const enc = new TextEncoder();

/** Diagrams are written as the shapes they are drawn with (the layout function is pure). */
const diagramShapes = (deck: Deck) => (d: Diagram): Shape[] => {
  const m = deck.masters[0];
  return m ? layoutDiagram(d, m.theme) : [];
};

const pptxWrite = (kind: PptxKind) => (deck: Deck, _store?: FrameStore): Uint8Array => writePptx(deck, { kind, diagramShapes: diagramShapes(deck) });

/** Export options set by the export dialogs before the format's write runs. */
export const exportOptions: { pdf: PageOptions & { dpi?: number; grayscale?: boolean }; image: { width: number; slides: 'current' | 'all' }; motion: { width: number; seconds: number; useTimings: boolean } } = {
  pdf: { kind: 'slides' },
  image: { width: 1920, slides: 'current' },
  motion: { width: 1280, seconds: 5, useTimings: true },
};

const lazy = () => import('./exports');

export const FORMATS: FileFormat[] = [
  {
    id: 'pptx', label: 'Presentation (.pptx)', extensions: ['pptx', 'pptm'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', native: true,
    read: (data) => readPptx(data).deck, write: (d, s) => pptxWrite('presentation')(d, s),
  },
  { id: 'potx', label: 'Template (.potx)', extensions: ['potx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.template', read: (data) => readPptx(data).deck, write: (d, s) => pptxWrite('template')(d, s) },
  { id: 'ppsx', label: 'Slide show (.ppsx)', extensions: ['ppsx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow', read: (data) => readPptx(data).deck, write: (d, s) => pptxWrite('show')(d, s) },
  { id: 'odp', label: 'OpenDocument presentation (.odp)', extensions: ['odp'], mime: 'application/vnd.oasis.opendocument.presentation', write: (d) => writeOdp(d) },
  { id: 'pdf', label: 'PDF (.pdf)', extensions: ['pdf'], mime: 'application/pdf', write: async (d) => (await lazy()).exportPdf(d, exportOptions.pdf) },
  { id: 'png', label: 'PNG image (.png)', extensions: ['png'], mime: 'image/png', write: async (d, s) => (await (await lazy()).exportImages(d, { type: 'png', width: exportOptions.image.width, slides: 'current', current: s.cur })).data },
  { id: 'jpeg', label: 'JPEG image (.jpg)', extensions: ['jpg'], mime: 'image/jpeg', write: async (d, s) => (await (await lazy()).exportImages(d, { type: 'jpeg', width: exportOptions.image.width, slides: 'current', current: s.cur })).data },
  { id: 'pngAll', label: 'PNG images of all slides (.zip)', extensions: ['zip'], mime: 'application/zip', write: async (d, s) => (await (await lazy()).exportImages(d, { type: 'png', width: exportOptions.image.width, slides: 'all', current: s.cur })).data },
  { id: 'jpegAll', label: 'JPEG images of all slides (.zip)', extensions: ['zip'], mime: 'application/zip', write: async (d, s) => (await (await lazy()).exportImages(d, { type: 'jpeg', width: exportOptions.image.width, slides: 'all', current: s.cur })).data },
  { id: 'svg', label: 'SVG of this slide (.svg)', extensions: ['svg'], mime: 'image/svg+xml', write: async (d, s) => (await lazy()).exportSvg(d, s.cur) },
  { id: 'gif', label: 'Animated GIF (.gif)', extensions: ['gif'], mime: 'image/gif', write: async (d) => (await lazy()).exportGif(d, exportOptions.motion) },
  { id: 'webm', label: 'Video (.webm)', extensions: ['webm'], mime: 'video/webm', write: async (d) => (await lazy()).exportVideo(d, exportOptions.motion) },
  { id: 'rtf', label: 'Outline (.rtf)', extensions: ['rtf'], mime: 'application/rtf', write: (d) => enc.encode(outlineRtf(d)) },
  { id: 'txt', label: 'Outline as plain text (.txt)', extensions: ['txt'], mime: 'text/plain', write: (d) => enc.encode(outlineText(d)) },
];

export const registerFormats = (): void => { for (const f of FORMATS) registerFormat(f); };
