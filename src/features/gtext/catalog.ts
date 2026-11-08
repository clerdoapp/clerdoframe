/** The bundled font families: how they're grouped in the font library and which package holds them. */

export type FontCategory = 'serif' | 'sans' | 'display' | 'hand' | 'mono';
export type FontScript = 'latin' | 'arabic' | 'ja' | 'ko' | 'zh';

export interface FontFamily {
  name: string;
  /** @fontsource package name. */
  pkg: string;
  cat: FontCategory;
  scripts: FontScript[];
  /** Loaded with the app (no lazy loading needed). */
  core?: boolean;
  /** Only the regular weight is loaded (very large families). */
  regularOnly?: boolean;
}

const f = (name: string, cat: FontCategory, extra: Partial<FontFamily> = {}): FontFamily => ({
  name, cat, pkg: name.toLowerCase().replace(/\s+/g, '-'), scripts: ['latin'], ...extra,
});

/** In rough order of how often people pick them; the library's "Popular" sort uses this order. */
export const FAMILIES: FontFamily[] = [
  f('Roboto', 'sans', { core: true }),
  f('Open Sans', 'sans', { core: true }),
  f('Lato', 'sans', { core: true }),
  f('Montserrat', 'sans', { core: true }),
  f('Inter', 'sans', { core: true }),
  f('Poppins', 'sans'),
  f('Noto Sans', 'sans'),
  f('Source Sans 3', 'sans'),
  f('Raleway', 'sans'),
  f('Nunito', 'sans'),
  f('Nunito Sans', 'sans'),
  f('Playfair Display', 'serif'),
  f('Merriweather', 'serif'),
  f('Lora', 'serif'),
  f('Rubik', 'sans'),
  f('Work Sans', 'sans'),
  f('PT Sans', 'sans'),
  f('PT Serif', 'serif'),
  f('Oswald', 'display'),
  f('Mulish', 'sans'),
  f('Noto Serif', 'serif'),
  f('Fira Sans', 'sans'),
  f('Quicksand', 'sans'),
  f('Barlow', 'sans'),
  f('DM Sans', 'sans'),
  f('Karla', 'sans'),
  f('Josefin Sans', 'sans'),
  f('IBM Plex Sans', 'sans'),
  f('Libre Baskerville', 'serif'),
  f('EB Garamond', 'serif'),
  f('Bitter', 'serif'),
  f('Crimson Text', 'serif'),
  f('Source Serif 4', 'serif'),
  f('Roboto Serif', 'serif'),
  f('Spectral', 'serif'),
  f('Cormorant Garamond', 'serif'),
  f('Alegreya', 'serif'),
  f('Arvo', 'serif'),
  f('Zilla Slab', 'serif'),
  f('Gelasio', 'serif'),
  f('IBM Plex Serif', 'serif'),
  f('Lexend', 'sans'),
  f('Cabin', 'sans'),
  f('Archivo', 'sans'),
  f('Space Grotesk', 'sans'),
  f('Comfortaa', 'display'),
  f('Bebas Neue', 'display'),
  f('Anton', 'display'),
  f('Lobster', 'display'),
  f('Abril Fatface', 'display'),
  f('Righteous', 'display'),
  f('Bungee', 'display'),
  f('Press Start 2P', 'display'),
  f('Amatic SC', 'display'),
  f('Dancing Script', 'hand'),
  f('Pacifico', 'hand'),
  f('Caveat', 'hand'),
  f('Shadows Into Light', 'hand'),
  f('Permanent Marker', 'hand'),
  f('Indie Flower', 'hand'),
  f('Satisfy', 'hand'),
  f('Great Vibes', 'hand'),
  f('Kalam', 'hand'),
  f('Patrick Hand', 'hand'),
  f('Comic Neue', 'hand'),
  f('Roboto Mono', 'mono', { core: true }),
  f('Fira Code', 'mono'),
  f('JetBrains Mono', 'mono'),
  f('IBM Plex Mono', 'mono'),
  f('Noto Sans Arabic', 'sans', { scripts: ['arabic', 'latin'] }),
  f('Cairo', 'sans', { scripts: ['arabic', 'latin'] }),
  f('Tajawal', 'sans', { scripts: ['arabic', 'latin'] }),
  f('Almarai', 'sans', { scripts: ['arabic'] }),
  f('Amiri', 'serif', { scripts: ['arabic', 'latin'] }),
  f('Noto Naskh Arabic', 'serif', { scripts: ['arabic'], core: true }),
  f('Noto Sans JP', 'sans', { scripts: ['ja', 'latin'], regularOnly: true }),
  f('Noto Sans KR', 'sans', { scripts: ['ko', 'latin'], regularOnly: true }),
  f('Noto Sans SC', 'sans', { scripts: ['zh', 'latin'], regularOnly: true }),
  f('Carlito', 'sans', { core: true }),
  f('Caladea', 'serif', { core: true }),
  f('Arimo', 'sans', { core: true }),
  f('Tinos', 'serif', { core: true }),
  f('Cousine', 'mono', { core: true }),
  f('Hanken Grotesk', 'sans', { core: true }),
];

const byName = new Map(FAMILIES.map((x) => [x.name.toLowerCase(), x]));
export const familyOf = (name: string): FontFamily | undefined => byName.get(name.trim().replace(/^["']|["']$/g, '').toLowerCase());

/** Families added to the font list by this feature (the rest were already listed). */
export const LISTED_EXTRA = FAMILIES.filter((x) => !x.core).map((x) => x.name).sort((a, b) => a.localeCompare(b));

export const CATEGORY_LABEL: Record<FontCategory, string> = { serif: 'Serif', sans: 'Sans serif', display: 'Display', hand: 'Handwriting', mono: 'Monospace' };
export const SCRIPT_LABEL: Record<FontScript, string> = { latin: 'Latin', arabic: 'Arabic', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' };
export const SCRIPT_SAMPLE: Record<FontScript, string> = { latin: 'The quick brown fox jumps', arabic: 'نص تجريبي للعرض', ja: 'こんにちは世界', ko: '안녕하세요 세계', zh: '你好，世界' };
