// The 'html' file format: the deck as one self-contained web page that plays the slides.
import { registerFormat } from '../../app/registry';
import type { Deck } from '../../model/deck';
import { defaultPublish, type PublishOptions } from '../../formats/html';

let opts: PublishOptions | null = null;
let forDeck: { w: number; h: number } | null = null;

/** Options for the next web page export, set by the Publish dialog. */
export const publishOptions = (deck: Deck): PublishOptions => {
  if (!opts || !forDeck || forDeck.w !== deck.w || forDeck.h !== deck.h) { opts = defaultPublish(deck); forDeck = { w: deck.w, h: deck.h }; }
  return opts;
};

export const registerHtmlFormat = (): void => {
  registerFormat({
    id: 'html', label: 'Web page that plays the slides (.html)', extensions: ['html'], mime: 'text/html',
    write: async (deck) => {
      const [{ publishHtml }, { inlineFonts }] = await Promise.all([import('../../formats/html'), import('../../formats/raster')]);
      let css = '';
      try { css = await inlineFonts(); } catch { /* fonts fall back to the viewer's */ }
      return new TextEncoder().encode(publishHtml(deck, publishOptions(deck), css));
    },
  });
};
