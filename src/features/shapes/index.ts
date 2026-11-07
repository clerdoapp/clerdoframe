import { registerCommands } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import { isLineGeom, preset } from '../../render/geometry';
import { registerAllPresets } from './presets';
import { addShape, cancelFreeform, INCH, newAutoShape, newTextBox, registerShapeTools, setTool } from './tools';

export { ShapeIcon } from './icon';
export { ShapeGallery } from './gallery';
export { CATEGORIES, labelOf } from './presets';
export { solveHandle, adjustDefaults } from './engine';
export { newAutoShape, newTextBox, addShape, setTool } from './tools';

const editable = (s: FrameStore) => s.view.mode === 'normal' || s.view.mode === 'master';
const toggle = (s: FrameStore, t: string) => setTool(s, s.tool === t ? null : t);

/** shapes feature module: the full preset geometry library and the drawing tools. */
export const registerShapes = (): void => {
  registerAllPresets();
  registerShapeTools();
  registerCommands([
    {
      id: 'insert.shape', label: 'Draw a shape', group: 'Insert', hidden: true, enabled: editable,
      run: (s, arg) => {
        const o = typeof arg === 'object' && arg ? (arg as { geom?: string; locked?: boolean }) : {};
        const g = typeof arg === 'string' ? arg : o.geom ?? 'rect';
        if (!preset(g)) return;
        setTool(s, s.tool === `shape:${g}` && !o.locked ? null : `shape:${g}`, !!o.locked);
      },
    },
    {
      id: 'insert.shapeAt', label: 'Insert shape', group: 'Insert', hidden: true, enabled: editable,
      run: (s, arg) => {
        const g = typeof arg === 'string' && preset(arg) ? arg : 'rect';
        addShape(s, 'Insert shape', newAutoShape(s, g, (s.deck.w - INCH) / 2, (s.deck.h - INCH) / 2, INCH, isLineGeom(g) ? 0 : INCH));
      },
    },
    { id: 'insert.textbox', label: 'Text box', group: 'Insert', enabled: editable, active: (s) => s.tool === 'text', run: (s) => toggle(s, 'text') },
    {
      id: 'insert.textboxAt', label: 'Insert text box', group: 'Insert', hidden: true, enabled: editable,
      run: (s, arg) => {
        const tb = newTextBox(s, s.deck.w / 2 - 1.5 * INCH, s.deck.h / 2 - 20, 3 * INCH, 40, typeof arg === 'string' ? arg : '');
        if (addShape(s, 'Insert text box', tb)) { s.editing = { shape: tb.id }; s.emit(); }
      },
    },
    { id: 'draw.line', label: 'Draw a line', group: 'Insert', enabled: editable, active: (s) => s.tool === 'shape:line', run: (s) => toggle(s, 'shape:line') },
    { id: 'draw.arrow', label: 'Draw an arrow', group: 'Insert', enabled: editable, active: (s) => s.tool === 'shape:straightConnector1', run: (s) => toggle(s, 'shape:straightConnector1') },
    { id: 'draw.freeform', label: 'Freeform shape', group: 'Insert', enabled: editable, active: (s) => s.tool === 'freeform', run: (s) => toggle(s, 'freeform') },
    { id: 'draw.scribble', label: 'Scribble', group: 'Insert', enabled: editable, active: (s) => s.tool === 'scribble', run: (s) => toggle(s, 'scribble') },
    { id: 'tool.finish', label: 'Finish freeform', hidden: true, enabled: (s) => s.tool === 'freeform', run: (s) => cancelFreeform(s, true) },
    { id: 'tool.cancel', label: 'Stop drawing', hidden: true, enabled: (s) => !!s.tool, run: (s) => { cancelFreeform(s, false); setTool(s, null); } },
  ]);
};
