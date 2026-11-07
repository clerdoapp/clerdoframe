import type { FrameStore } from '../app/store';
import { EditCanvas } from '../features/editor/EditCanvas';

/** The editing canvas. Its behaviour lives in the editor feature (src/features/editor). */
export const Canvas = ({ store }: { store: FrameStore }) => <EditCanvas store={store} />;
