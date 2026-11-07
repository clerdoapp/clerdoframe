import { registerWarpText } from '../../render/SlideView';
import { registerInsertCommands } from './commands';
import { registerInsertDialogs } from './dialogs';
import { registerTableUi } from './tableUi';
import { registerInsertPanel } from './ui';
import { WarpedText } from './wordart';
import { warpPath } from './data';
import { registerZoomKind } from './zoom';

/** insert feature module: the Insert tool panel, its dialogs, tables, media and zoom. */
export const registerInsert = (): void => {
  registerInsertCommands();
  registerInsertDialogs();
  registerInsertPanel();
  registerTableUi();
  registerZoomKind();
  registerWarpText((s, ctx) => (s.text?.warp && warpPath(s.text.warp, s.w, s.h) ? <WarpedText shape={s} theme={ctx.theme} /> : null));
};
