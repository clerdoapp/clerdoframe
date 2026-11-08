// Loaded on demand: the style sheets of the fonts that aren't loaded with the app.
// Each entry is its own lazy chunk, so a font's files are only fetched when it's used.

const latin = import.meta.glob('/node_modules/@fontsource/{poppins,noto-sans,source-sans-3,raleway,nunito,nunito-sans,playfair-display,merriweather,lora,rubik,work-sans,pt-sans,pt-serif,oswald,mulish,noto-serif,fira-sans,quicksand,barlow,dm-sans,karla,josefin-sans,ibm-plex-sans,libre-baskerville,eb-garamond,bitter,crimson-text,source-serif-4,roboto-serif,spectral,cormorant-garamond,alegreya,arvo,zilla-slab,gelasio,ibm-plex-serif,lexend,cabin,archivo,space-grotesk,comfortaa,bebas-neue,anton,lobster,abril-fatface,righteous,bungee,press-start-2p,amatic-sc,dancing-script,pacifico,caveat,shadows-into-light,permanent-marker,indie-flower,satisfy,great-vibes,kalam,patrick-hand,comic-neue,fira-code,jetbrains-mono,ibm-plex-mono,noto-sans-arabic,cairo,tajawal,almarai,amiri}/{400,700,400-italic,700-italic}.css');
const cjk = import.meta.glob('/node_modules/@fontsource/{noto-sans-jp,noto-sans-kr,noto-sans-sc}/400.css');

const all: Record<string, () => Promise<unknown>> = { ...latin, ...cjk };

/** Loaders for a package's style sheets. */
export const sheetsFor = (pkg: string): (() => Promise<unknown>)[] =>
  Object.entries(all).filter(([k]) => k.startsWith(`/node_modules/@fontsource/${pkg}/`)).map(([, v]) => v);
