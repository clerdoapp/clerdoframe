import { registerCore } from './core';
import { registerEditor } from './editor';
import { registerFormat } from './format';
import { registerInsert } from './insert';
import { registerShapes } from './shapes';
import { registerCharts } from './charts';
import { registerDiagrams } from './diagrams';
import { registerDraw } from './draw';
import { registerShow } from './show';
import { registerDesign } from './design';
import { registerReview } from './review';
import { registerViews } from './views';
import { registerFiles } from './files';

let done = false;
/** Registers every feature module once at start-up. Order sets the order of tool-panel sections within a tab. */
export const registerFeatures = (): void => {
  if (done) return;
  done = true;
  registerCore();
  registerShapes();
  registerEditor();
  registerFormat();
  registerInsert();
  registerCharts();
  registerDiagrams();
  registerDraw();
  registerDesign();
  registerShow();
  registerReview();
  registerViews();
  registerFiles();
};
