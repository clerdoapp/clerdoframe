// Import theme: copies masters (theme, background, layouts) from another file into the deck.
import { uid, walkShapes, type Deck, type Id, type Master, type Slide } from '../../model/deck';
import { fallbackType, moveSlide } from '../design/ops';

/** Copies a master from `src` into `deck` with new ids and its media. Returns the new master. */
export const importMaster = (deck: Deck, src: Deck, m: Master, addMedia: (type: string, name: string, data: Uint8Array) => Id): Master => {
  const copy = structuredClone({ ...m, keep: undefined }) as Master;
  copy.id = uid('m');
  for (const l of copy.layouts) { l.id = uid('l'); delete l.keep; }
  walkShapes(copy.shapes, (s) => { delete s.keep; });
  for (const l of copy.layouts) walkShapes(l.shapes, (s) => { delete s.keep; });
  // Media referenced anywhere in the master moves over, deduplicated by content.
  let json = JSON.stringify(copy);
  for (const [id, item] of Object.entries(src.media)) {
    const needle = `"${id}"`;
    if (!json.includes(needle)) continue;
    const nid = addMedia(item.type, item.name, item.data);
    if (nid !== id) json = json.split(needle).join(`"${nid}"`);
  }
  const out = JSON.parse(json) as Master;
  let name = out.name || out.theme.name || 'Imported design';
  const names = new Set(deck.masters.map((x) => x.name));
  for (let k = 2; names.has(name); k++) name = `${out.name || 'Imported design'} ${k}`;
  out.name = name;
  deck.masters.push(out);
  return out;
};

/** Moves slides onto a master's layouts, matching layouts by type. */
export const applyMaster = (deck: Deck, master: Master, slides: Slide[]): void => {
  for (const s of slides) {
    let from = null;
    for (const m of deck.masters) { const l = m.layouts.find((x) => x.id === s.layout); if (l) { from = l; break; } }
    const type = from?.type ?? 'obj';
    const to = master.layouts.find((l) => l.type === type) ?? master.layouts.find((l) => l.type === fallbackType(type)) ?? master.layouts.find((l) => l.type === 'obj') ?? master.layouts[0];
    if (to) moveSlide(s, from, to);
  }
};
