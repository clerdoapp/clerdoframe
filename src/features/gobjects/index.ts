import { createElement } from 'react';
import { openDialog, registerCommands } from '../../app/commands';
import { registerDialog, registerMenu, registerPanelSection } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { AutoShape, Chart, Picture } from '../../model/deck';
import { isLineGeom, preset } from '../../render/geometry';
import { setHandleSolver } from '../editor/interact';
import { IMAGE_TYPES, loadImage, pickFiles } from '../insert/media';
import { CATEGORIES } from '../shapes/presets';
import { solveHandle } from '../shapes/engine';
import { setTool } from '../shapes/tools';
import { CURVE_TOOL, finishCurve, registerCurve } from './curve';
import { updateLinkedChart } from './linked';
import { toCustom } from './pathEdit';
import { applyAspect, applyRecolor, coverCrop, parseAspect, RECOLOR_PRESETS } from './picture';
import { editingPoints, editPointsTarget, pointAction, registerPoints, startEditPoints, stopEditPoints } from './points';
import { registerOwnPresets, solveOwnHandle } from './presets';
import { CameraDialog, ChangeShapeDialog, FromFileDialog, MaskShapeDialog, MaskTools, MoreSection, RecolorGallery, ReflectionPresets, ShapeTools } from './ui';
import './gobjects.css';

export { registerOwnPresets } from './presets';

const editable = (s: FrameStore) => (s.view.mode === 'normal' || s.view.mode === 'master') && !s.deck.final;
const autoShapes = (s: FrameStore): AutoShape[] => s.selected().filter((x): x is AutoShape => x.kind === 'shape' && !x.locked);
const pics = (s: FrameStore): Picture[] => s.selected().filter((x): x is Picture => x.kind === 'picture' && !x.locked);
const linkedChart = (s: FrameStore): Chart | null => { const x = s.one(); return x?.kind === 'chart' && x.dataLink ? x : null; };

/** Where our presets go in the gallery: [category, insert after (null = first), names]. */
const GALLERY: [string, string | null, string[]][] = [
  ['Callouts', null, ['speech', 'roundedSpeech', 'thoughtBubble']],
  ['Stars and Banners', 'irregularSeal2', ['starburst']],
  ['Block Arrows', 'curvedDownArrow', ['arrowNorthEast']],
];
const addToGallery = (): void => {
  for (const [name, after, list] of GALLERY) {
    const cat = CATEGORIES.find((c) => c.name === name);
    if (!cat) continue;
    const add = list.filter((g) => !cat.shapes.includes(g));
    const i = after ? cat.shapes.indexOf(after) + 1 : 0;
    cat.shapes.splice(i > 0 || !after ? i : cat.shapes.length, 0, ...add);
  }
};

const replacePicture = async (s: FrameStore): Promise<void> => {
  const p = pics(s)[0];
  if (!p) return;
  const [f] = await pickFiles('image/*', false);
  if (!f) return;
  const img = await loadImage(s, f);
  if (!img) { if (!IMAGE_TYPES.test(f.type)) s.notify(`${f.name} is not a picture.`); return; }
  s.tryChange('Replace picture', () => {
    const x = s.shape(p.id);
    if (x?.kind !== 'picture') return;
    x.media = img.id;
    delete x.cutout;
    const c = coverCrop(img.w, img.h, x.w, x.h);
    if (c) x.crop = c; else delete x.crop;
  });
};

/** gobjects feature module: more shapes, curves and point editing, reflections, picture tools, linked data. */
export const registerGObjects = (): void => {
  registerOwnPresets();
  addToGallery();
  registerPoints();
  registerCurve();
  setHandleSolver((name, w, h, adj, i, px, py) => solveOwnHandle(name, w, h, i, px, py) ?? solveHandle(name, w, h, adj, i, px, py));

  registerDialog('gobjects.changeShape', ChangeShapeDialog);
  registerDialog('gobjects.maskShape', MaskShapeDialog);
  registerDialog('gobjects.camera', CameraDialog);
  registerDialog('gobjects.fromFile', FromFileDialog);

  registerCommands([
    // ---------- Shapes ----------
    {
      id: 'shape.change', label: 'Change shape', group: 'Shape', hidden: true, enabled: (s) => editable(s) && autoShapes(s).length > 0,
      run: (s, arg) => {
        const g = typeof arg === 'string' ? arg : typeof arg === 'object' && arg && 'geom' in arg ? String((arg as { geom: unknown }).geom) : '';
        if (!preset(g)) return;
        s.tryChange('Change shape', () => {
          for (const x of autoShapes(s)) {
            const wasLine = isLineGeom(x.geom || 'rect');
            x.geom = g;
            delete x.path; delete x.adj;
            if (wasLine && !isLineGeom(g) && !x.fill) x.fill = { type: 'solid', color: { theme: 'accent1' } };
          }
        });
      },
    },
    { id: 'shape.changeDialog', label: 'Change shape…', group: 'Shape', enabled: (s) => editable(s) && autoShapes(s).length > 0, run: (s) => openDialog(s, 'gobjects.changeShape') },
    {
      id: 'shape.editPoints', label: 'Edit points', group: 'Shape', enabled: (s) => editable(s) && (editingPoints(s) || !!editPointsTarget(s)), active: editingPoints,
      run: (s) => (editingPoints(s) ? stopEditPoints(s) : startEditPoints(s)),
    },
    {
      id: 'shape.convertToFreeform', label: 'Convert to freeform', group: 'Shape', enabled: (s) => editable(s) && autoShapes(s).some((x) => x.geom !== 'custom'),
      run: (s) => { s.tryChange('Convert to freeform', () => { for (const x of autoShapes(s)) toCustom(x); }); },
    },
    { id: 'points.smooth', label: 'Smooth point', group: 'Shape', hidden: true, enabled: editingPoints, run: (s) => pointAction(s, 'smooth') },
    { id: 'points.corner', label: 'Corner point', group: 'Shape', hidden: true, enabled: editingPoints, run: (s) => pointAction(s, 'corner') },
    { id: 'points.delete', label: 'Delete point', group: 'Shape', hidden: true, enabled: editingPoints, run: (s) => pointAction(s, 'delete') },
    { id: 'points.done', label: 'Stop editing points', group: 'Shape', hidden: true, enabled: editingPoints, run: stopEditPoints },
    {
      id: 'draw.curve', label: 'Curve', group: 'Insert', enabled: editable, active: (s) => s.tool === CURVE_TOOL,
      run: (s) => {
        finishCurve(s, false);
        const on = s.tool !== CURVE_TOOL;
        setTool(s, on ? CURVE_TOOL : null);
        if (on) s.notify('Tap to place points. Double-tap or press Enter to finish; tap the first point to close the shape.');
      },
    },
    {
      id: 'draw.polyline', label: 'Polyline', group: 'Insert', enabled: editable, active: (s) => s.tool === 'freeform',
      run: (s) => {
        const on = s.tool !== 'freeform';
        setTool(s, on ? 'freeform' : null);
        if (on) s.notify('Tap to place points. Double-tap or press Enter to finish; tap the first point to close the shape.');
      },
    },

    // ---------- Pictures ----------
    { id: 'picture.replace', label: 'Replace picture…', group: 'Picture', enabled: (s) => editable(s) && pics(s).length === 1, run: (s) => { void replacePicture(s); } },
    {
      id: 'picture.mask', label: 'Crop to shape', group: 'Picture', hidden: true, enabled: (s) => editable(s) && pics(s).length > 0,
      run: (s, arg) => {
        const g = typeof arg === 'string' ? arg : 'rect';
        if (!preset(g) || isLineGeom(g)) return;
        s.tryChange('Crop to shape', () => { for (const p of pics(s)) { if (g === 'rect') delete p.geom; else p.geom = g; } });
      },
    },
    { id: 'picture.maskDialog', label: 'Crop to shape…', group: 'Picture', enabled: (s) => editable(s) && pics(s).length > 0, run: (s) => openDialog(s, 'gobjects.maskShape') },
    {
      id: 'picture.aspect', label: 'Crop to aspect ratio', group: 'Picture', hidden: true, enabled: (s) => editable(s) && pics(s).length > 0,
      run: (s, arg) => {
        const r = parseAspect(typeof arg === 'string' ? arg : '1:1');
        if (!r) return;
        s.tryChange('Crop to aspect ratio', () => { for (const p of pics(s)) applyAspect(p, r); });
      },
    },
    {
      id: 'picture.recolor', label: 'Recolor picture', group: 'Picture', hidden: true, enabled: (s) => editable(s) && pics(s).length > 0,
      run: (s, arg) => {
        const pr = RECOLOR_PRESETS.find((r) => r.id === arg) ?? null;
        if (!pr && arg !== 'none' && arg !== null && arg !== undefined) return;
        s.tryChange('Recolor', () => { for (const p of pics(s)) applyRecolor(p, pr); });
      },
    },
    { id: 'insert.camera', label: 'Camera…', group: 'Insert', enabled: (s) => editable(s) && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, run: (s) => openDialog(s, 'gobjects.camera') },

    // ---------- Linked data ----------
    { id: 'chart.fromFile', label: 'Chart from file…', group: 'Insert', enabled: (s) => editable(s) && !!s.surface(), run: (s) => openDialog(s, 'gobjects.fromFile', { mode: 'chart' }) },
    { id: 'table.fromFile', label: 'Table from file…', group: 'Insert', enabled: (s) => editable(s) && !!s.surface(), run: (s) => openDialog(s, 'gobjects.fromFile', { mode: 'table' }) },
    { id: 'chart.update', label: 'Update chart data', group: 'Chart', enabled: (s) => editable(s) && !!linkedChart(s), run: (s) => { const c = linkedChart(s); if (c) void updateLinkedChart(s, c.id); } },
    {
      id: 'chart.unlink', label: 'Unlink chart data', group: 'Chart', enabled: (s) => editable(s) && !!linkedChart(s),
      run: (s) => { const c = linkedChart(s); if (c) s.tryChange('Unlink chart data', () => { const x = s.shape(c.id); if (x?.kind === 'chart') delete x.dataLink; }); },
    },
  ]);

  registerMenu({
    kind: 'shape', order: 5,
    items: (s) => {
      const one = s.one();
      if (one?.kind === 'shape' && !one.locked) return [{ label: 'Change shape…', command: 'shape.changeDialog' }, { label: 'Edit points', command: 'shape.editPoints' }];
      if (one?.kind === 'picture') return [{ label: 'Replace picture…', command: 'picture.replace' }, { label: 'Crop to shape…', command: 'picture.maskDialog' }];
      if (one?.kind === 'chart' && one.dataLink) return [{ label: 'Update chart data', command: 'chart.update' }];
      return [];
    },
  });

  const hasShape = (s: FrameStore) => autoShapes(s).length > 0;
  const hasPic = (s: FrameStore) => pics(s).length > 0;
  registerPanelSection({ tab: 'insert', title: 'More', order: 110, render: (s) => createElement(MoreSection, { store: s }) });
  registerPanelSection({ tab: 'home', title: 'Shape', order: -9, when: hasShape, render: (s) => createElement(ShapeTools, { store: s }) });
  registerPanelSection({ tab: 'home', title: 'Picture', order: -9, when: hasPic, render: (s) => createElement(MaskTools, { store: s }) });
  registerPanelSection({ tab: 'format:shape', title: 'Shape', when: hasShape, render: (s) => createElement(ShapeTools, { store: s }) });
  registerPanelSection({ tab: 'format:reflection', title: 'Presets', render: (s) => createElement(ReflectionPresets, { store: s }) });
  registerPanelSection({ tab: 'format:picture', title: 'Recolor with theme colors', when: hasPic, render: (s) => createElement(RecolorGallery, { store: s }) });
  registerPanelSection({ tab: 'format:picture', title: 'Mask and replace', when: hasPic, render: (s) => createElement(MaskTools, { store: s }) });
};
