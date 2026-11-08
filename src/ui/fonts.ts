/** Font names offered in the font list. Office names map to bundled fonts with the same metrics when not installed. */
export const FONT_NAMES = [
  'Aptos', 'Aptos Narrow', 'Arial', 'Calibri', 'Calibri Light', 'Cambria', 'Courier New', 'Georgia', 'Helvetica', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana',
  'Carlito', 'Caladea', 'Arimo', 'Tinos', 'Cousine', 'Hanken Grotesk', 'Inter', 'Lato', 'Montserrat', 'Open Sans', 'Roboto', 'Roboto Mono', 'Noto Naskh Arabic',
];

/**
 * Extra groups at the top of font lists (My fonts, Recent fonts) and the "More fonts" entry, filled
 * in by the font library feature. `picked` is told about fonts chosen from a list.
 */
export const fontMenu: { groups: () => { label: string; fonts: string[] }[]; more: string | null; picked: (name: string) => void } = {
  groups: () => [], more: null, picked: () => undefined,
};
