// Extra data saved in .pptx files in our own custom XML part: the document id (version history)
// and comment assignees / resolved state, which the comment part has no place for.
import { uid, type Deck } from '../../model/deck';
import { registerPptxExtra } from '../../formats/pptx/kept';
import { parseRoot, kids, attr, esc } from '../../formats/xml';

const NS = 'urn:clerdo:frame:extras:1';

export const newDocId = (): string => uid('doc');

export const extrasXml = (deck: Deck): string | null => {
  const items: string[] = [];
  if (deck.props.docId) items.push(`<cf:doc id="${esc(deck.props.docId)}"/>`);
  deck.slides.forEach((s, si) => {
    // Index into the comment part, where replies follow their comment.
    let ci = 0;
    for (const c of s.comments ?? []) {
      if (c.assignee || c.resolved) items.push(`<cf:comment slide="${si}" i="${ci}"${c.assignee ? ` assignee="${esc(c.assignee)}"` : ''}${c.resolved ? ' resolved="1"' : ''}/>`);
      ci += 1 + (c.replies?.length ?? 0);
    }
  });
  return items.length ? `<cf:extras xmlns:cf="${NS}">${items.join('')}</cf:extras>` : null;
};

const clean = (v: string | undefined, max: number): string | undefined => {
  const t = v?.replace(/[\u0000-\u001f]/g, '').trim();
  return t ? t.slice(0, max) : undefined;
};

export const readExtras = (deck: Deck, xml: string): void => {
  const root = parseRoot(xml);
  const doc = kids(root, 'doc')[0];
  const id = clean(attr(doc, 'id'), 80);
  if (id && /^[\w-]+$/.test(id)) deck.props.docId = id;
  for (const c of kids(root, 'comment')) {
    const si = Number(attr(c, 'slide')), ci = Number(attr(c, 'i'));
    const cm = Number.isInteger(si) && Number.isInteger(ci) ? deck.slides[si]?.comments?.[ci] : undefined;
    if (!cm) continue;
    const a = clean(attr(c, 'assignee'), 120);
    if (a) cm.assignee = a;
    if (attr(c, 'resolved') === '1') cm.resolved = true;
  }
};

export const registerExtras = (): void => { registerPptxExtra({ id: 'extras', write: extrasXml, read: readExtras }); };
