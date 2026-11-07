/** Static data for insert dialogs: symbol subsets and WordArt styles. */
import type { Fill, Line, RunStyle } from '../../model/deck';

const range = (a: number, b: number, skip: (n: number) => boolean = () => false): string[] => {
  const out: string[] = [];
  for (let n = a; n <= b; n++) if (!skip(n)) out.push(String.fromCodePoint(n));
  return out;
};

/** Unicode ranges that render as text in common fonts; emoji blocks are left out on purpose. */
export const SYMBOL_SETS: { id: string; name: string; chars: string[] }[] = [
  { id: 'latin1', name: 'Latin-1 supplement', chars: range(0xa1, 0xff, (n) => n === 0xad) },
  { id: 'latinA', name: 'Latin extended', chars: range(0x100, 0x17f) },
  { id: 'punct', name: 'Punctuation', chars: range(0x2010, 0x2027).concat(range(0x2030, 0x205e)) },
  { id: 'currency', name: 'Currency', chars: ['$', '¢', '£', '¤', '¥', '₠', '₡', '₢', '₣', '₤', '₥', '₦', '₧', '₨', '₩', '₪', '₫', '€', '₭', '₮', '₯', '₰', '₱', '₲', '₳', '₴', '₵', '₶', '₷', '₸', '₹', '₺', '₻', '₼', '₽', '₾', '₿'] },
  { id: 'letterlike', name: 'Letter-like', chars: range(0x2100, 0x214f) },
  { id: 'numbers', name: 'Number forms', chars: range(0x2150, 0x2189).concat(range(0x2460, 0x24ff)) },
  { id: 'arrows', name: 'Arrows', chars: range(0x2190, 0x21ff).concat(range(0x27f0, 0x27ff)) },
  { id: 'math', name: 'Math operators', chars: range(0x2200, 0x22ff) },
  { id: 'technical', name: 'Technical', chars: range(0x2300, 0x23ff, (n) => (n >= 0x231a && n <= 0x231b) || (n >= 0x23e9 && n <= 0x23f3) || (n >= 0x23f8 && n <= 0x23fa)) },
  { id: 'greek', name: 'Greek', chars: range(0x391, 0x3a9, (n) => n === 0x3a2).concat(range(0x3b1, 0x3c9)) },
  { id: 'cyrillic', name: 'Cyrillic', chars: range(0x410, 0x44f) },
  { id: 'box', name: 'Box drawing', chars: range(0x2500, 0x257f) },
  { id: 'blocks', name: 'Blocks', chars: range(0x2580, 0x259f) },
  { id: 'geometric', name: 'Geometric shapes', chars: range(0x25a0, 0x25ff, (n) => [0x25aa, 0x25ab, 0x25b6, 0x25c0, 0x25fb, 0x25fc, 0x25fd, 0x25fe].includes(n)) },
  // Miscellaneous symbols and dingbats, minus the code points that default to emoji presentation.
  {
    id: 'misc', name: 'Symbols and dingbats', chars: [
      ...'★☆☉☊☋☌☍☐☑☒☓☖☗☙☚☛☜☞☟☠☡☢☣☤☥☦☧☨☩☪☫☬☭☮☯☰☱☲☳☴☵☶☷☸☹☺☻☼☽☾☿♀♁♂♃♄♅♆♇♔♕♖♗♘♙♚♛♜♝♞♟♠♡♢♣♤♥♦♧♩♪♫♬♭♮♯⚀⚁⚂⚃⚄⚅',
      ...'✁✂✃✄✆✇✈✉✌✍✎✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝✞✟✠✡✢✣✤✥✦✧✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋❍❏❐❑❒❖❘❙❚❛❜❝❞❡❢❣❤❥❦❧➘➙➚➛➜➝➞➟➠➡➢➣➤➥➦➧➨➩➪➫➬➭➮➯➱➲➳➴➵➶➷➸➹➺➻➼➽➾',
    ],
  },
];

/** Fonts offered in the symbol dialog; all ship with the app or every system. */
export const SYMBOL_FONTS = ['(normal text)', 'Carlito', 'Arimo', 'Tinos', 'Cousine', 'Noto Naskh Arabic', 'serif', 'sans-serif', 'monospace'];

/** Short names for symbols that have a common one. */
export const SYMBOL_NAMES: Record<string, string> = {
  '©': 'Copyright', '®': 'Registered', '™': 'Trade mark', '°': 'Degree', '±': 'Plus-minus', '×': 'Multiply', '÷': 'Divide', '€': 'Euro', '£': 'Pound', '¥': 'Yen', '§': 'Section', '¶': 'Pilcrow',
  '•': 'Bullet', '…': 'Ellipsis', '—': 'Em dash', '–': 'En dash', '→': 'Right arrow', '←': 'Left arrow', '↑': 'Up arrow', '↓': 'Down arrow', '∞': 'Infinity', '≈': 'Almost equal', '≠': 'Not equal',
  '≤': 'Less or equal', '≥': 'Greater or equal', '√': 'Square root', '∑': 'Sum', 'π': 'Pi', 'Ω': 'Omega', 'µ': 'Micro', '✓': 'Check mark', '✗': 'Ballot X', '★': 'Black star', '☆': 'White star',
};

// ---------- WordArt ----------

export interface WordArtStyle { id: string; name: string; style: RunStyle }

const solid = (theme: 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'tx1' | 'bg1' | 'tx2', lum?: number): Fill =>
  ({ type: 'solid', color: lum ? { theme, lum } : { theme } });
const outline = (fill: Fill, width: number): Line => ({ fill, width });
const grad = (stops: [number, Parameters<typeof solid>[0], number?][], angle = 90): Fill =>
  ({ type: 'gradient', kind: 'linear', angle, stops: stops.map(([pos, theme, lum]) => ({ pos, color: lum ? { theme, lum } : { theme } })) });

export const WORDART_STYLES: WordArtStyle[] = [
  { id: 'plain', name: 'Plain, dark', style: { fill: solid('tx1'), color: { theme: 'tx1' } } },
  { id: 'accent1', name: 'Fill, accent 1', style: { fill: solid('accent1'), color: { theme: 'accent1' } } },
  { id: 'accent1Shadow', name: 'Fill, accent 1, shadow', style: { fill: solid('accent1'), color: { theme: 'accent1' }, shadow: true } },
  { id: 'accent2Outline', name: 'Fill, accent 2, outline', style: { fill: solid('accent2'), color: { theme: 'accent2' }, outline: outline(solid('accent2', -0.5), 1) } },
  { id: 'whiteOutline', name: 'White, accent 1 outline', style: { fill: solid('bg1'), color: { theme: 'bg1' }, outline: outline(solid('accent1'), 1.5), shadow: true } },
  { id: 'outlineOnly', name: 'Outline only', style: { fill: { type: 'none' }, color: { theme: 'bg1' }, outline: outline(solid('accent1'), 1.25) } },
  { id: 'gradWarm', name: 'Gradient, warm', style: { fill: grad([[0, 'accent2'], [1, 'accent1']]), color: { theme: 'accent1' } } },
  { id: 'gradCool', name: 'Gradient, cool', style: { fill: grad([[0, 'accent3', 0.3], [1, 'accent5']]), color: { theme: 'accent3' } } },
  { id: 'gradGreen', name: 'Gradient, fresh', style: { fill: grad([[0, 'accent4', 0.4], [1, 'accent6', -0.25]]), color: { theme: 'accent4' } } },
  { id: 'metal', name: 'Metal', style: { fill: grad([[0, 'tx1', 0.65], [0.5, 'tx1', 0.2], [1, 'tx1', 0.6]]), color: { theme: 'tx1', lum: 0.35 }, outline: outline(solid('tx1', 0.1), 0.5) } },
  { id: 'gold', name: 'Gold', style: { fill: grad([[0, 'accent2', 0.5], [0.5, 'accent2', -0.25], [1, 'accent2', 0.3]]), color: { theme: 'accent2' }, shadow: true } },
  { id: 'accent3Bold', name: 'Fill, accent 3, heavy outline', style: { fill: solid('accent3', 0.6), color: { theme: 'accent3', lum: 0.6 }, outline: outline(solid('accent3', -0.25), 2.25) } },
  { id: 'accent5Shadow', name: 'Fill, accent 5, shadow', style: { fill: solid('accent5'), color: { theme: 'accent5' }, shadow: true } },
  { id: 'darkOnLight', name: 'Dark blue, light outline', style: { fill: solid('tx2'), color: { theme: 'tx2' }, outline: outline(solid('bg1'), 1), shadow: true } },
  { id: 'accent6Outline', name: 'Light fill, accent 6 outline', style: { fill: solid('accent6', 0.8), color: { theme: 'accent6', lum: 0.8 }, outline: outline(solid('accent6'), 1.5) } },
];

/** Text warp presets (prstTxWarp names) offered under Transform. */
export const WARPS: { id: string; name: string }[] = [
  { id: 'textNoShape', name: 'No transform' },
  { id: 'textArchUp', name: 'Arch up' },
  { id: 'textArchDown', name: 'Arch down' },
  { id: 'textCircle', name: 'Circle' },
  { id: 'textWave1', name: 'Wave' },
  { id: 'textWave2', name: 'Double wave' },
  { id: 'textTriangle', name: 'Triangle up' },
  { id: 'textTriangleInverted', name: 'Triangle down' },
  { id: 'textChevron', name: 'Chevron up' },
  { id: 'textChevronInverted', name: 'Chevron down' },
  { id: 'textSlantUp', name: 'Slant up' },
  { id: 'textSlantDown', name: 'Slant down' },
  { id: 'textInflate', name: 'Inflate' },
  { id: 'textDeflate', name: 'Deflate' },
  { id: 'textFadeRight', name: 'Fade right' },
  { id: 'textFadeLeft', name: 'Fade left' },
  { id: 'textCanUp', name: 'Can up' },
  { id: 'textCanDown', name: 'Can down' },
];

/** Guide path a warp lays text along (box 0..w x 0..h), or null when the warp isn't a single-line path. */
export const warpPath = (id: string, w: number, h: number): string | null => {
  const f = (n: number) => Math.round(n * 10) / 10;
  switch (id) {
    case 'textArchUp': return `M${f(w * 0.02)} ${f(h * 0.9)}A${f(w * 0.48)} ${f(h * 0.8)} 0 0 1 ${f(w * 0.98)} ${f(h * 0.9)}`;
    case 'textArchDown': return `M${f(w * 0.02)} ${f(h * 0.15)}A${f(w * 0.48)} ${f(h * 0.8)} 0 0 0 ${f(w * 0.98)} ${f(h * 0.15)}`;
    case 'textCircle': return `M${f(w * 0.5)} ${f(h * 0.92)}A${f(w * 0.42)} ${f(h * 0.42)} 0 1 1 ${f(w * 0.5001)} ${f(h * 0.92)}`;
    case 'textWave1': return `M0 ${f(h * 0.6)}C${f(w * 0.25)} ${f(h * 0.1)} ${f(w * 0.25)} ${f(h * 0.1)} ${f(w * 0.5)} ${f(h * 0.6)}S${f(w * 0.75)} ${f(h * 1.1)} ${f(w)} ${f(h * 0.6)}`;
    case 'textWave2': return `M0 ${f(h * 0.6)}C${f(w * 0.12)} ${f(h * 0.2)} ${f(w * 0.12)} ${f(h * 0.2)} ${f(w * 0.25)} ${f(h * 0.6)}S${f(w * 0.37)} ${f(h)} ${f(w * 0.5)} ${f(h * 0.6)}S${f(w * 0.62)} ${f(h * 0.2)} ${f(w * 0.75)} ${f(h * 0.6)}S${f(w * 0.87)} ${f(h)} ${f(w)} ${f(h * 0.6)}`;
    case 'textTriangle': case 'textChevron': return `M0 ${f(h * 0.85)}L${f(w / 2)} ${f(h * 0.3)}L${f(w)} ${f(h * 0.85)}`;
    case 'textTriangleInverted': case 'textChevronInverted': return `M0 ${f(h * 0.35)}L${f(w / 2)} ${f(h * 0.85)}L${f(w)} ${f(h * 0.35)}`;
    case 'textSlantUp': return `M0 ${f(h * 0.9)}L${f(w)} ${f(h * 0.3)}`;
    case 'textSlantDown': return `M0 ${f(h * 0.4)}L${f(w)} ${f(h * 0.95)}`;
    case 'textCanUp': return `M0 ${f(h * 0.75)}Q${f(w / 2)} ${f(h * 1.05)} ${f(w)} ${f(h * 0.75)}`;
    case 'textCanDown': return `M0 ${f(h * 0.5)}Q${f(w / 2)} ${f(h * 0.15)} ${f(w)} ${f(h * 0.5)}`;
    default: return null;
  }
};
