import { useState } from 'react';
import type { DialogProps } from '../../app/registry';
import { Dialog } from '../../ui/kit';
import { pasteShapes, type PasteMode } from './clipboard';

const MODES: [PasteMode, string, string][] = [
  ['theme', 'Use this theme', 'Theme colours and fonts follow this presentation.'],
  ['source', 'Keep source formatting', 'Colours and fonts stay as they were where you copied them.'],
  ['picture', 'Picture', 'Pastes a picture of the copied shapes.'],
  ['text', 'Text only', 'Pastes the text in a new text box.'],
];

/** Paste special: choose how the copied shapes are pasted. */
export const PasteSpecialDialog = ({ store, close }: DialogProps) => {
  const [mode, setMode] = useState<PasteMode>('theme');
  return (
    <Dialog title="Paste special" close={close} okLabel="Paste" onOk={() => { pasteShapes(store, mode); }}>
      <div className="ed-pastemodes" role="radiogroup" aria-label="Paste as">
        {MODES.map(([m, label, help]) => (
          <label key={m} className="ed-pastemode">
            <input type="radio" name="pasteas" checked={mode === m} onChange={() => setMode(m)} />
            <span><b>{label}</b><small>{help}</small></span>
          </label>
        ))}
      </div>
    </Dialog>
  );
};
