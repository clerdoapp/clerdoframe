/**
 * Character sets for the special characters dialog, generated from Unicode ranges (nothing is
 * downloaded). Emoji are taken from the emoji blocks and kept only where the browser's Unicode
 * data says they are emoji.
 */

export interface CharCategory { id: string; name: string; group?: 'emoji'; chars: string[] }

type R = [number, number];

const EMOJI = /\p{Emoji}/u;
const PRESENTED = /\p{Emoji_Presentation}/u;
const ASSIGNED = /\P{Cn}/u;
const CONTROL = /[\p{Cc}\p{Cf}\p{Zs}\p{Mn}\p{Co}]/u;

const fromRanges = (ranges: R[], keep: (c: string, n: number) => boolean): string[] => {
  const out: string[] = [];
  for (const [a, b] of ranges) for (let n = a; n <= b; n++) { const c = String.fromCodePoint(n); if (keep(c, n)) out.push(c); }
  return out;
};
const text = (ranges: R[], skip: number[] = []): string[] => fromRanges(ranges, (c, n) => ASSIGNED.test(c) && !CONTROL.test(c) && !skip.includes(n));
const emoji = (ranges: R[]): string[] => fromRanges(ranges, (c, n) => n > 0xff && EMOJI.test(c)).map((c) => (PRESENTED.test(c) ? c : `${c}️`));

const FLAG_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET EU FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM UN US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');
export const flagOf = (code: string): string => [...code.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');

const EMOJI_GROUPS: [string, string, R[]][] = [
  ['smileys', 'Smileys and emotion', [[0x1f600, 0x1f637], [0x1f641, 0x1f644], [0x1f910, 0x1f915], [0x1f917, 0x1f917], [0x1f920, 0x1f925], [0x1f927, 0x1f92f], [0x1f970, 0x1f976], [0x1f978, 0x1f97a], [0x1f9d0, 0x1f9d0], [0x1fae0, 0x1faef], [0x1f47b, 0x1f47d], [0x1f480, 0x1f480], [0x1f4a9, 0x1f4a9], [0x1f479, 0x1f47a], [0x1f648, 0x1f64a], [0x1f638, 0x1f640], [0x1f48b, 0x1f48b], [0x1f493, 0x1f49f], [0x2763, 0x2764], [0x1f5a4, 0x1f5a4], [0x1f90d, 0x1f90e], [0x1f9e1, 0x1f9e1], [0x1fa75, 0x1fa77], [0x1f4a2, 0x1f4a6], [0x1f4a8, 0x1f4a8], [0x1f4ab, 0x1f4ad], [0x1f5e8, 0x1f5e8], [0x1f5ef, 0x1f5ef], [0x2639, 0x263a]]],
  ['people', 'People and body', [[0x1f44a, 0x1f450], [0x1f446, 0x1f449], [0x1f44b, 0x1f44b], [0x1f590, 0x1f590], [0x1f595, 0x1f596], [0x270a, 0x270d], [0x261d, 0x261d], [0x1f918, 0x1f91f], [0x1f932, 0x1f932], [0x1f4aa, 0x1f4aa], [0x1f9be, 0x1f9bf], [0x1f9b5, 0x1f9b6], [0x1f442, 0x1f445], [0x1f9e0, 0x1f9e0], [0x1fac0, 0x1fac5], [0x1faf0, 0x1faf8], [0x1f466, 0x1f478], [0x1f481, 0x1f483], [0x1f485, 0x1f487], [0x1f574, 0x1f575], [0x1f57a, 0x1f57a], [0x1f645, 0x1f647], [0x1f64b, 0x1f64f], [0x1f6a3, 0x1f6a3], [0x1f6b4, 0x1f6b6], [0x1f6c0, 0x1f6c0], [0x1f6cc, 0x1f6cc], [0x1f926, 0x1f926], [0x1f930, 0x1f931], [0x1f933, 0x1f93e], [0x1f977, 0x1f977], [0x1f9b8, 0x1f9b9], [0x1f9cd, 0x1f9cf], [0x1f9d1, 0x1f9df], [0x1f463, 0x1f465], [0x1f5e3, 0x1f5e3], [0x1fac2, 0x1fac2]]],
  ['nature', 'Animals and nature', [[0x1f400, 0x1f43f], [0x1f980, 0x1f9ae], [0x1f54a, 0x1f54a], [0x1f577, 0x1f578], [0x1fab0, 0x1fabf], [0x1facf, 0x1facf], [0x1f330, 0x1f344], [0x1f490, 0x1f490], [0x1f4ae, 0x1f4ae], [0x1fab4, 0x1fab7], [0x2618, 0x2618], [0x1f300, 0x1f320], [0x1f321, 0x1f32c], [0x2600, 0x2604], [0x2614, 0x2614], [0x26a1, 0x26a1], [0x26c4, 0x26c5], [0x26c8, 0x26c8], [0x2744, 0x2744], [0x1f525, 0x1f525], [0x1f4a7, 0x1f4a7], [0x1f30a, 0x1f30a]]],
  ['food', 'Food and drink', [[0x1f345, 0x1f37f], [0x1f950, 0x1f96f], [0x1f9c0, 0x1f9cb], [0x1fad0, 0x1fadb], [0x1f32d, 0x1f32f], [0x2615, 0x2615], [0x1f942, 0x1f94f]]],
  ['travel', 'Travel and places', [[0x1f680, 0x1f6c5], [0x1f6cb, 0x1f6d2], [0x1f6d5, 0x1f6df], [0x1f6e0, 0x1f6ec], [0x1f6f0, 0x1f6fc], [0x1f3d4, 0x1f3f0], [0x1f5fa, 0x1f5ff], [0x26e9, 0x26fd], [0x2708, 0x2708], [0x1f3a0, 0x1f3a2], [0x1f488, 0x1f488], [0x1f30b, 0x1f30f], [0x1f550, 0x1f567], [0x231a, 0x231b], [0x23f0, 0x23f3], [0x1f6f8, 0x1f6f8], [0x1f9f3, 0x1f9f3]]],
  ['activities', 'Activities', [[0x1f380, 0x1f393], [0x1f396, 0x1f397], [0x1f399, 0x1f39b], [0x1f39e, 0x1f39f], [0x1f3a3, 0x1f3d3], [0x1f93a, 0x1f93a], [0x1f93c, 0x1f93e], [0x1f945, 0x1f94f], [0x26bd, 0x26be], [0x26f3, 0x26f3], [0x26f8, 0x26f8], [0x1f3af, 0x1f3af], [0x1f3ae, 0x1f3ae], [0x1f579, 0x1f579], [0x1f0cf, 0x1f0cf], [0x1f004, 0x1f004], [0x1f3b4, 0x1f3b4], [0x1fa80, 0x1fa8f], [0x2660, 0x2667], [0x265f, 0x265f], [0x1f9e9, 0x1f9e9], [0x1f9f5, 0x1f9f6], [0x1faa1, 0x1faa1], [0x1faa2, 0x1faa2]]],
  ['objects', 'Objects', [[0x1f451, 0x1f462], [0x1f453, 0x1f45f], [0x1f484, 0x1f484], [0x1f48c, 0x1f48f], [0x1f4b0, 0x1f4ff], [0x1f500, 0x1f53d], [0x1f56f, 0x1f570], [0x1f573, 0x1f573], [0x1f587, 0x1f587], [0x1f58a, 0x1f58d], [0x1f5a5, 0x1f5a5], [0x1f5a8, 0x1f5a8], [0x1f5b1, 0x1f5b2], [0x1f5bc, 0x1f5bc], [0x1f5c2, 0x1f5c4], [0x1f5d1, 0x1f5d3], [0x1f5dc, 0x1f5de], [0x1f5e1, 0x1f5e1], [0x1f5f3, 0x1f5f3], [0x1f9e2, 0x1f9ff], [0x1fa70, 0x1fa7c], [0x1fa90, 0x1faaf], [0x1fab8, 0x1fabd], [0x2328, 0x2328], [0x23e9, 0x23ef], [0x23f8, 0x23fa], [0x260e, 0x260e], [0x2692, 0x2697], [0x2699, 0x269b], [0x26b0, 0x26b1], [0x26cf, 0x26cf], [0x26d1, 0x26d1], [0x26d3, 0x26d3], [0x2702, 0x2702], [0x2709, 0x2709], [0x270f, 0x270f], [0x2712, 0x2712], [0x1f6e2, 0x1f6e2], [0x1f3f7, 0x1f3f7], [0x1f399, 0x1f39b]]],
  ['symbols', 'Symbols', [[0x2648, 0x2653], [0x267b, 0x267f], [0x2690, 0x2691], [0x269c, 0x26a0], [0x26a7, 0x26ab], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x2705, 0x2705], [0x2714, 0x2714], [0x2716, 0x2716], [0x271d, 0x271d], [0x2721, 0x2721], [0x2728, 0x2728], [0x2733, 0x2734], [0x2747, 0x2747], [0x274c, 0x274e], [0x2753, 0x2757], [0x2795, 0x2797], [0x27a1, 0x27a1], [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2934, 0x2935], [0x2b05, 0x2b07], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55], [0x3030, 0x3030], [0x303d, 0x303d], [0x3297, 0x3297], [0x3299, 0x3299], [0x1f170, 0x1f251], [0x1f4af, 0x1f4af], [0x1f4a0, 0x1f4a1], [0x1f522, 0x1f524], [0x1f53a, 0x1f53d], [0x1f549, 0x1f54e], [0x1f6ae, 0x1f6af], [0x1f6b0, 0x1f6b3], [0x1f6b7, 0x1f6bf], [0x1f6d0, 0x1f6d0], [0x1f7e0, 0x1f7f0], [0x2194, 0x21aa], [0x25aa, 0x25fe], [0x2122, 0x2122], [0x2139, 0x2139], [0x203c, 0x203c], [0x2049, 0x2049], [0x24c2, 0x24c2], [0x2611, 0x2611], [0x262e, 0x262f], [0x2638, 0x2638], [0x262a, 0x262a], [0x2626, 0x2626], [0x2622, 0x2623], [0x2640, 0x2642], [0x2665, 0x2666], [0x00a9, 0x00a9], [0x00ae, 0x00ae], [0x1f3e7, 0x1f3e7]]],
];

let built: CharCategory[] | null = null;

/** All categories: emoji groups first, then symbol sets. Built once, on first use. */
export const charCategories = (): CharCategory[] => {
  if (built) return built;
  const seen = new Set<string>();
  const uniq = (xs: string[]) => xs.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
  const emojiCats: CharCategory[] = EMOJI_GROUPS.map(([id, name, ranges]) => ({ id: `emoji-${id}`, name, group: 'emoji' as const, chars: uniq(emoji(ranges).concat(id === 'symbols' ? fromRanges([[0x00a9, 0x00a9], [0x00ae, 0x00ae]], () => true).map((c) => `${c}️`) : [])) }));
  emojiCats.push({ id: 'emoji-flags', name: 'Flags', group: 'emoji', chars: ['🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', ...FLAG_CODES.map(flagOf)] });
  built = [
    ...emojiCats,
    { id: 'arrows', name: 'Arrows', chars: text([[0x2190, 0x21ff], [0x27f0, 0x27ff], [0x2900, 0x297f], [0x2b00, 0x2b11], [0x2b30, 0x2b4c]]) },
    { id: 'math', name: 'Math', chars: ['±', '×', '÷', '¬', '°', 'µ', '¹', '²', '³', '¼', '½', '¾', ...text([[0x2070, 0x209c], [0x2200, 0x22ff], [0x27c0, 0x27ef], [0x2980, 0x29ff], [0x2a00, 0x2a2f]])] },
    { id: 'latin', name: 'Latin', chars: text([[0x00c0, 0x00ff], [0x0100, 0x017f], [0x0180, 0x024f], [0x1e00, 0x1eff]], [0xd7, 0xf7]) },
    { id: 'greek', name: 'Greek', chars: text([[0x0391, 0x03a9], [0x03b1, 0x03c9], [0x03d0, 0x03f5]]) },
    { id: 'cyrillic', name: 'Cyrillic', chars: text([[0x0400, 0x045f], [0x0460, 0x04ff]]) },
    { id: 'punct', name: 'Punctuation', chars: ['¡', '¿', '«', '»', '§', '¶', '·', '¦', ...text([[0x2010, 0x2027], [0x2030, 0x205e], [0x2e00, 0x2e2e]])] },
    { id: 'currency', name: 'Currency', chars: ['$', '¢', '£', '¤', '¥', ...text([[0x20a0, 0x20c0]])] },
    { id: 'technical', name: 'Technical', chars: text([[0x2300, 0x23ff]]) },
    { id: 'letterlike', name: 'Letter-like and numbers', chars: text([[0x2100, 0x214f], [0x2150, 0x218b], [0x2460, 0x24ff], [0x2776, 0x2793]]) },
    { id: 'geometric', name: 'Geometric shapes', chars: text([[0x25a0, 0x25ff], [0x2b1a, 0x2b2f], [0x2b50, 0x2b59]]) },
    { id: 'box', name: 'Box drawing and blocks', chars: text([[0x2500, 0x259f]]) },
    { id: 'misc', name: 'Symbols and dingbats', chars: text([[0x2600, 0x26ff], [0x2700, 0x27bf]]) },
    { id: 'cjk', name: 'CJK symbols', chars: text([[0x3000, 0x303f], [0x3200, 0x32ff], [0xff01, 0xff0f], [0x3190, 0x319f]], [0x3000]) },
  ];
  return built;
};

// ---------- Names for search ----------

const GREEK = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho final-sigma sigma tau upsilon phi chi psi omega'.split(' ');
const MARKS: Record<string, string> = { '̀': 'grave', '́': 'acute', '̂': 'circumflex', '̃': 'tilde', '̄': 'macron', '̆': 'breve', '̇': 'dot', '̈': 'diaeresis umlaut', '̊': 'ring', '̋': 'double acute', '̌': 'caron', '̧': 'cedilla', '̨': 'ogonek', '̣': 'dot below' };

/** Short names for common characters (English). */
const NAMES: Record<string, string> = {
  '©': 'copyright', '®': 'registered', '™': 'trade mark trademark', '°': 'degree', '±': 'plus minus', '×': 'multiply times', '÷': 'divide division', '€': 'euro', '£': 'pound sterling', '¥': 'yen yuan',
  '$': 'dollar', '¢': 'cent', '₹': 'rupee', '₽': 'ruble', '₩': 'won', '₪': 'shekel', '₺': 'lira', '₿': 'bitcoin', '₫': 'dong', '₱': 'peso', '﷼': 'riyal rial',
  '§': 'section', '¶': 'pilcrow paragraph', '•': 'bullet', '…': 'ellipsis', '—': 'em dash', '–': 'en dash', '‰': 'per mille', '†': 'dagger', '‡': 'double dagger', '«': 'guillemet quote', '»': 'guillemet quote',
  '“': 'left double quote', '”': 'right double quote', '‘': 'left single quote', '’': 'right single quote apostrophe', '′': 'prime minute', '″': 'double prime second',
  '→': 'right arrow', '←': 'left arrow', '↑': 'up arrow', '↓': 'down arrow', '↔': 'left right arrow', '↕': 'up down arrow', '⇒': 'double right arrow implies', '⇐': 'double left arrow', '⇔': 'double arrow iff', '↻': 'clockwise arrow refresh', '↺': 'anticlockwise arrow undo',
  '∞': 'infinity', '≈': 'almost equal approximately', '≠': 'not equal', '≤': 'less than or equal', '≥': 'greater than or equal', '√': 'square root', '∑': 'sum sigma', '∏': 'product', '∫': 'integral', '∂': 'partial', '∆': 'delta increment', '∇': 'nabla',
  '∈': 'element of in', '∉': 'not element', '⊂': 'subset', '⊃': 'superset', '∪': 'union', '∩': 'intersection', '∀': 'for all', '∃': 'exists', '∅': 'empty set', '¬': 'not', '∧': 'and', '∨': 'or', '≡': 'identical', '∝': 'proportional', '∠': 'angle', '⊥': 'perpendicular', '∴': 'therefore', '∵': 'because',
  'µ': 'micro', '½': 'half', '¼': 'quarter', '¾': 'three quarters', '²': 'squared superscript two', '³': 'cubed superscript three', '¹': 'superscript one',
  '✓': 'check mark tick', '✔': 'heavy check mark tick', '✗': 'ballot x cross', '✘': 'heavy ballot x', '★': 'black star', '☆': 'white star', '☐': 'ballot box checkbox', '☑': 'checked box checkbox', '☒': 'box with x',
  '♠': 'spade', '♣': 'club', '♥': 'heart', '♦': 'diamond', '♪': 'note music', '♫': 'notes music', '☀': 'sun', '☁': 'cloud', '☂': 'umbrella', '☎': 'telephone phone', '✉': 'envelope mail', '✂': 'scissors', '✈': 'airplane plane', '⌘': 'command', '⌥': 'option', '⇧': 'shift', '⌫': 'delete backspace', '⏎': 'return enter',
  '■': 'black square', '□': 'white square', '▲': 'black triangle up', '△': 'white triangle up', '▼': 'triangle down', '▶': 'triangle right play', '◀': 'triangle left', '●': 'black circle', '○': 'white circle', '◆': 'black diamond', '◇': 'white diamond', '♀': 'female', '♂': 'male', '☯': 'yin yang', '☮': 'peace', '⚠': 'warning',
  '😀': 'grinning face smile', '😃': 'smile happy', '😄': 'smile happy laugh', '😁': 'grin', '😆': 'laugh', '😅': 'sweat smile', '🤣': 'rolling laughing', '😂': 'tears of joy laugh', '🙂': 'slight smile', '😉': 'wink', '😊': 'blush smile', '😇': 'halo angel', '🥰': 'love hearts', '😍': 'heart eyes love', '😘': 'kiss',
  '😋': 'yum tasty', '😛': 'tongue', '😜': 'wink tongue', '🤪': 'zany crazy', '🤔': 'thinking', '🤐': 'zipper', '😐': 'neutral', '😑': 'expressionless', '😶': 'no mouth', '😏': 'smirk', '😒': 'unamused', '🙄': 'eye roll', '😬': 'grimace', '😌': 'relieved', '😔': 'pensive sad', '😪': 'sleepy', '😴': 'sleeping',
  '😷': 'mask sick', '🤒': 'thermometer sick', '🤕': 'bandage hurt', '🤢': 'nauseated', '🤮': 'vomit', '🥵': 'hot', '🥶': 'cold', '😵': 'dizzy', '🤯': 'mind blown exploding', '🥳': 'party celebrate', '😎': 'sunglasses cool', '🤓': 'nerd', '😕': 'confused', '😟': 'worried', '🙁': 'frown', '😮': 'open mouth surprise', '😲': 'astonished', '😳': 'flushed',
  '🥺': 'pleading', '😢': 'cry tear sad', '😭': 'sob crying', '😱': 'scream fear', '😖': 'confounded', '😞': 'disappointed', '😓': 'sweat', '😩': 'weary', '😫': 'tired', '😤': 'triumph steam', '😡': 'angry pout', '😠': 'angry', '🤬': 'cursing', '😈': 'devil smiling', '👿': 'devil imp', '💀': 'skull', '💩': 'poo', '🤡': 'clown', '👻': 'ghost', '👽': 'alien', '🤖': 'robot',
  '❤️': 'red heart love', '❤': 'heart love', '💔': 'broken heart', '💕': 'two hearts', '💖': 'sparkling heart', '💯': 'hundred points', '💥': 'collision boom', '💫': 'dizzy star', '💬': 'speech bubble', '💭': 'thought bubble',
  '👍': 'thumbs up like yes', '👎': 'thumbs down no', '👏': 'clap applause', '🙌': 'raising hands hooray', '👋': 'wave hello bye', '🙏': 'pray please thanks', '👌': 'ok', '✌️': 'victory peace', '🤞': 'fingers crossed luck', '💪': 'muscle strong flex', '👉': 'point right', '👈': 'point left', '👆': 'point up', '👇': 'point down', '✋': 'hand stop', '🤝': 'handshake deal', '✍️': 'writing',
  '👀': 'eyes look', '🧠': 'brain', '👶': 'baby', '👦': 'boy', '👧': 'girl', '👨': 'man', '👩': 'woman', '🧑': 'person', '👴': 'old man', '👵': 'old woman', '👮': 'police', '👷': 'construction worker', '💂': 'guard', '🕵️': 'detective', '🤷': 'shrug', '🤦': 'facepalm', '🙋': 'raising hand', '🏃': 'running', '🚶': 'walking', '💃': 'dancing',
  '🐶': 'dog puppy', '🐱': 'cat kitten', '🐭': 'mouse', '🐰': 'rabbit bunny', '🦊': 'fox', '🐻': 'bear', '🐼': 'panda', '🐨': 'koala', '🐯': 'tiger', '🦁': 'lion', '🐮': 'cow', '🐷': 'pig', '🐸': 'frog', '🐵': 'monkey', '🐔': 'chicken', '🐧': 'penguin', '🐦': 'bird', '🦆': 'duck', '🦅': 'eagle', '🦉': 'owl', '🐴': 'horse', '🦄': 'unicorn', '🐝': 'bee', '🦋': 'butterfly', '🐌': 'snail', '🐞': 'ladybug', '🐢': 'turtle', '🐍': 'snake', '🐙': 'octopus', '🐟': 'fish', '🐬': 'dolphin', '🐳': 'whale', '🦈': 'shark', '🐪': 'camel', '🐫': 'camel', '🐘': 'elephant',
  '🌲': 'tree evergreen', '🌳': 'tree', '🌴': 'palm tree', '🌵': 'cactus', '🌷': 'tulip flower', '🌹': 'rose flower', '🌻': 'sunflower', '🌼': 'blossom flower', '🌸': 'cherry blossom', '🍀': 'four leaf clover luck', '🍁': 'maple leaf', '🍂': 'fallen leaf autumn', '🌍': 'globe earth world', '🌙': 'moon crescent', '⭐': 'star', '🌟': 'glowing star', '🔥': 'fire flame hot', '🌈': 'rainbow', '☀️': 'sun sunny', '⛅': 'cloud sun', '🌧️': 'rain', '⛄': 'snowman', '❄️': 'snowflake', '⚡': 'lightning high voltage', '💧': 'droplet water', '🌊': 'wave ocean',
  '🍏': 'green apple', '🍎': 'apple', '🍐': 'pear', '🍊': 'orange tangerine', '🍋': 'lemon', '🍌': 'banana', '🍉': 'watermelon', '🍇': 'grapes', '🍓': 'strawberry', '🍒': 'cherries', '🍑': 'peach', '🍍': 'pineapple', '🥑': 'avocado', '🍅': 'tomato', '🌽': 'corn', '🥕': 'carrot', '🍞': 'bread', '🧀': 'cheese', '🍗': 'chicken leg', '🍔': 'burger hamburger', '🍟': 'fries', '🍕': 'pizza', '🌮': 'taco', '🍣': 'sushi', '🍜': 'noodles ramen', '🍩': 'donut doughnut', '🍪': 'cookie', '🎂': 'birthday cake', '🍰': 'cake', '🍫': 'chocolate', '🍿': 'popcorn', '☕': 'coffee hot drink', '🍵': 'tea', '🍺': 'beer', '🍷': 'wine', '🥤': 'drink cup', '🧃': 'juice', '🍽️': 'plate dinner',
  '🚗': 'car', '🚕': 'taxi', '🚌': 'bus', '🚑': 'ambulance', '🚒': 'fire engine', '🚓': 'police car', '🚲': 'bicycle bike', '🛵': 'scooter', '🏍️': 'motorcycle', '🚂': 'train locomotive', '🚆': 'train', '🚇': 'metro subway', '✈️': 'airplane plane flight', '🚀': 'rocket launch', '🛸': 'ufo', '🚁': 'helicopter', '⛵': 'sailboat', '🚢': 'ship', '⚓': 'anchor', '🏠': 'house home', '🏢': 'office building', '🏥': 'hospital', '🏫': 'school', '🏦': 'bank', '🏨': 'hotel', '🕌': 'mosque', '⛪': 'church', '🗽': 'statue of liberty', '🗼': 'tower', '🏰': 'castle', '⛺': 'tent camping', '🗺️': 'map', '⏰': 'alarm clock', '⌛': 'hourglass', '⌚': 'watch',
  '⚽': 'soccer football', '🏀': 'basketball', '🏈': 'american football', '⚾': 'baseball', '🎾': 'tennis', '🏐': 'volleyball', '🏆': 'trophy winner', '🥇': 'gold medal first', '🥈': 'silver medal', '🥉': 'bronze medal', '🎯': 'target bullseye', '🎮': 'video game controller', '🎲': 'dice game', '🧩': 'puzzle', '🎨': 'art palette', '🎬': 'movie clapper film', '🎤': 'microphone', '🎧': 'headphones', '🎵': 'music note', '🎸': 'guitar', '🎹': 'piano keyboard', '🎉': 'party popper tada celebrate', '🎊': 'confetti', '🎁': 'gift present', '🎈': 'balloon', '🎄': 'christmas tree', '🎃': 'pumpkin halloween', '🎓': 'graduation cap',
  '💡': 'light bulb idea', '📱': 'mobile phone', '💻': 'laptop computer', '🖥️': 'desktop computer', '⌨️': 'keyboard', '🖱️': 'mouse computer', '🖨️': 'printer', '📷': 'camera', '📹': 'video camera', '📺': 'television tv', '📻': 'radio', '🔋': 'battery', '🔌': 'plug', '📞': 'telephone', '📧': 'email', '✉️': 'envelope', '📦': 'package box', '📝': 'memo note', '📄': 'page document', '📊': 'bar chart', '📈': 'chart increasing growth', '📉': 'chart decreasing', '📅': 'calendar', '📆': 'calendar', '📌': 'pushpin pin', '📎': 'paperclip', '✏️': 'pencil', '🖊️': 'pen', '📚': 'books', '📖': 'book open', '🔍': 'magnifying glass search', '🔒': 'lock locked', '🔓': 'unlocked', '🔑': 'key', '🔨': 'hammer', '🔧': 'wrench', '⚙️': 'gear settings', '🧰': 'toolbox', '🧪': 'test tube', '🔬': 'microscope', '🔭': 'telescope', '💊': 'pill', '💰': 'money bag', '💵': 'dollar banknote', '💳': 'credit card', '🛒': 'shopping cart', '🎒': 'backpack', '👓': 'glasses', '👕': 't-shirt', '👗': 'dress', '👟': 'shoe sneaker', '👑': 'crown', '💍': 'ring', '💎': 'gem diamond', '🔔': 'bell', '📣': 'megaphone', '📢': 'loudspeaker', '🗑️': 'wastebasket trash', '⏳': 'hourglass', '🧭': 'compass',
  '✅': 'check mark button done', '❌': 'cross mark no', '❎': 'cross mark button', '❓': 'question mark', '❗': 'exclamation mark', '⚠️': 'warning', '⛔': 'no entry', '🚫': 'prohibited', '♻️': 'recycle', '✨': 'sparkles', '➕': 'plus', '➖': 'minus', '➗': 'divide', '✖️': 'multiply', '🔴': 'red circle', '🟠': 'orange circle', '🟡': 'yellow circle', '🟢': 'green circle', '🔵': 'blue circle', '🟣': 'purple circle', '⚫': 'black circle', '⚪': 'white circle', '🟥': 'red square', '🟩': 'green square', '🟦': 'blue square', '⬛': 'black square', '⬜': 'white square', '🔺': 'red triangle up', '🔻': 'red triangle down', '🆗': 'ok button', '🆕': 'new button', '🆓': 'free button', '🔝': 'top', '🔜': 'soon', '➡️': 'right arrow', '⬅️': 'left arrow', '⬆️': 'up arrow', '⬇️': 'down arrow', '🔄': 'counterclockwise arrows repeat', '🔁': 'repeat', '♈': 'aries', '☪️': 'star and crescent', '☮️': 'peace', '☯️': 'yin yang', '🏁': 'chequered flag finish', '🚩': 'red flag', '🏳️': 'white flag', '🏳️‍🌈': 'rainbow flag',
};

const LATIN_EXTRA: Record<string, string> = { 'ß': 'sharp s eszett', 'æ': 'ae ash', 'Æ': 'ae ash', 'ø': 'o stroke slash', 'Ø': 'o stroke slash', 'œ': 'oe ligature', 'Œ': 'oe ligature', 'ð': 'eth', 'Ð': 'eth', 'þ': 'thorn', 'Þ': 'thorn', 'ł': 'l stroke', 'Ł': 'l stroke', 'đ': 'd stroke', 'Đ': 'd stroke', 'ı': 'dotless i' };

/** Searchable name for a character: its name when known, letters with their accents, Greek letter names. */
export const charName = (c: string): string => {
  const known = NAMES[c] ?? NAMES[c.replace(/️/g, '')] ?? LATIN_EXTRA[c];
  if (known) return known;
  const n = c.codePointAt(0)!;
  if (n >= 0x391 && n <= 0x3c9) {
    const i = n >= 0x3b1 ? n - 0x3b1 : n - 0x391;
    const nm = GREEK[i];
    if (nm) return `${n >= 0x3b1 ? 'small' : 'capital'} ${nm} greek`;
  }
  const d = c.normalize('NFD');
  if (d.length > 1 && /^[A-Za-z]$/.test(d[0]!)) {
    const marks = [...d.slice(1)].map((m) => MARKS[m]).filter(Boolean).join(' ');
    if (marks) return `${d[0]!.toLowerCase()} ${marks} ${d[0] === d[0]!.toUpperCase() ? 'capital' : 'small'}`;
  }
  if (c.startsWith('\u{1F1E6}'.slice(0, 1)) && [...c].length === 2) {
    const cps = [...c].map((x) => x.codePointAt(0)! - 0x1f1e6);
    if (cps.every((x) => x >= 0 && x < 26)) return `flag ${String.fromCharCode(...cps.map((x) => 65 + x))}`;
  }
  return '';
};

export const codeOf = (c: string): string => [...c.replace(/️/g, '')].map((x) => `U+${x.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ');

/** Characters matching a search: a code point (U+2192, 0x2192, 2192), a category name or words of a character's name. */
export const searchChars = (q: string, cats: CharCategory[] = charCategories()): string[] => {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const out = new Set<string>();
  const hex = /^(?:u\+|0x)?([0-9a-f]{2,6})$/i.exec(t);
  if (hex) { const n = parseInt(hex[1]!, 16); if (n > 31 && n < 0x110000) out.add(String.fromCodePoint(n)); }
  if (t.length === 1 || [...t].length === 1) out.add(q.trim());
  const words = t.split(/\s+/);
  for (const cat of cats) {
    const catHit = cat.name.toLowerCase().includes(t);
    for (const c of cat.chars) {
      if (catHit && t.length >= 3) { out.add(c); continue; }
      const nm = charName(c);
      if (nm && words.every((w) => nm.includes(w))) out.add(c);
    }
  }
  return [...out].slice(0, 600);
};
