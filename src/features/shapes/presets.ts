import { registerPreset } from '../../render/geometry';
import { adjustDefaults, evalPreset, presetNames } from './engine';

/** Gallery categories in display order, each with its presets in order. */
export const CATEGORIES: { name: string; shapes: string[] }[] = [
  { name: 'Lines', shapes: ['line', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5', 'curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5', 'arc', 'lineInv'] },
  { name: 'Rectangles', shapes: ['rect', 'roundRect', 'snip1Rect', 'snip2SameRect', 'snip2DiagRect', 'snipRoundRect', 'round1Rect', 'round2SameRect', 'round2DiagRect'] },
  {
    name: 'Basic Shapes', shapes: ['ellipse', 'triangle', 'rtTriangle', 'parallelogram', 'trapezoid', 'nonIsoscelesTrapezoid', 'diamond', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'decagon', 'dodecagon',
      'pie', 'chord', 'teardrop', 'frame', 'halfFrame', 'corner', 'diagStripe', 'plus', 'plaque', 'can', 'cube', 'bevel', 'donut', 'noSmoking', 'blockArc', 'foldedCorner', 'smileyFace', 'heart',
      'lightningBolt', 'sun', 'moon', 'cloud', 'bracketPair', 'bracePair', 'leftBracket', 'rightBracket', 'leftBrace', 'rightBrace', 'pieWedge', 'funnel', 'gear6', 'gear9'],
  },
  {
    name: 'Block Arrows', shapes: ['rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'upDownArrow', 'quadArrow', 'leftRightUpArrow', 'bentArrow', 'uturnArrow', 'leftUpArrow', 'bentUpArrow',
      'curvedRightArrow', 'curvedLeftArrow', 'curvedUpArrow', 'curvedDownArrow', 'stripedRightArrow', 'notchedRightArrow', 'homePlate', 'chevron', 'rightArrowCallout', 'downArrowCallout', 'leftArrowCallout',
      'upArrowCallout', 'leftRightArrowCallout', 'upDownArrowCallout', 'quadArrowCallout', 'circularArrow', 'leftCircularArrow', 'leftRightCircularArrow', 'swooshArrow'],
  },
  { name: 'Equation Shapes', shapes: ['mathPlus', 'mathMinus', 'mathMultiply', 'mathDivide', 'mathEqual', 'mathNotEqual'] },
  {
    name: 'Flowchart', shapes: ['flowChartProcess', 'flowChartAlternateProcess', 'flowChartDecision', 'flowChartInputOutput', 'flowChartPredefinedProcess', 'flowChartInternalStorage', 'flowChartDocument',
      'flowChartMultidocument', 'flowChartTerminator', 'flowChartPreparation', 'flowChartManualInput', 'flowChartManualOperation', 'flowChartConnector', 'flowChartOffpageConnector', 'flowChartPunchedCard',
      'flowChartPunchedTape', 'flowChartSummingJunction', 'flowChartOr', 'flowChartCollate', 'flowChartSort', 'flowChartExtract', 'flowChartMerge', 'flowChartOnlineStorage', 'flowChartDelay',
      'flowChartMagneticTape', 'flowChartMagneticDisk', 'flowChartMagneticDrum', 'flowChartDisplay', 'flowChartOfflineStorage'],
  },
  {
    name: 'Stars and Banners', shapes: ['irregularSeal1', 'irregularSeal2', 'star4', 'star5', 'star6', 'star7', 'star8', 'star10', 'star12', 'star16', 'star24', 'star32', 'ribbon2', 'ribbon', 'ellipseRibbon2',
      'ellipseRibbon', 'leftRightRibbon', 'verticalScroll', 'horizontalScroll', 'wave', 'doubleWave'],
  },
  {
    name: 'Callouts', shapes: ['wedgeRectCallout', 'wedgeRoundRectCallout', 'wedgeEllipseCallout', 'cloudCallout', 'borderCallout1', 'borderCallout2', 'borderCallout3', 'accentCallout1', 'accentCallout2',
      'accentCallout3', 'callout1', 'callout2', 'callout3', 'accentBorderCallout1', 'accentBorderCallout2', 'accentBorderCallout3'],
  },
  {
    name: 'Action Buttons', shapes: ['actionButtonBackPrevious', 'actionButtonForwardNext', 'actionButtonBeginning', 'actionButtonEnd', 'actionButtonHome', 'actionButtonInformation', 'actionButtonReturn',
      'actionButtonMovie', 'actionButtonDocument', 'actionButtonSound', 'actionButtonHelp', 'actionButtonBlank'],
  },
  { name: 'Other', shapes: ['chartPlus', 'chartX', 'chartStar', 'cornerTabs', 'squareTabs', 'plaqueTabs'] },
];

const LABELS: Record<string, string> = {
  line: 'Line', straightConnector1: 'Arrow', bentConnector2: 'Elbow (2)', bentConnector3: 'Elbow connector', bentConnector4: 'Elbow (4)', bentConnector5: 'Elbow (5)',
  curvedConnector2: 'Curve (2)', curvedConnector3: 'Curved connector', curvedConnector4: 'Curve (4)', curvedConnector5: 'Curve (5)', arc: 'Arc', lineInv: 'Line (reversed)',
  rect: 'Rectangle', roundRect: 'Rounded rectangle', snip1Rect: 'Snipped corner', snip2SameRect: 'Snipped same side', snip2DiagRect: 'Snipped diagonal', snipRoundRect: 'Snipped and rounded',
  round1Rect: 'Rounded corner', round2SameRect: 'Rounded same side', round2DiagRect: 'Rounded diagonal',
  ellipse: 'Oval', triangle: 'Triangle', rtTriangle: 'Right triangle', parallelogram: 'Parallelogram', trapezoid: 'Trapezoid', nonIsoscelesTrapezoid: 'Uneven trapezoid', diamond: 'Diamond',
  pentagon: 'Pentagon', hexagon: 'Hexagon', heptagon: 'Heptagon', octagon: 'Octagon', decagon: 'Decagon', dodecagon: 'Dodecagon', pie: 'Pie', chord: 'Chord', teardrop: 'Teardrop', frame: 'Frame',
  halfFrame: 'Half frame', corner: 'L-shape', diagStripe: 'Diagonal stripe', plus: 'Cross', plaque: 'Plaque', can: 'Cylinder', cube: 'Cube', bevel: 'Bevel', donut: 'Ring', noSmoking: 'No symbol',
  blockArc: 'Block arc', foldedCorner: 'Folded corner', smileyFace: 'Smiley face', heart: 'Heart', lightningBolt: 'Lightning bolt', sun: 'Sun', moon: 'Moon', cloud: 'Cloud',
  bracketPair: 'Double bracket', bracePair: 'Double brace', leftBracket: 'Left bracket', rightBracket: 'Right bracket', leftBrace: 'Left brace', rightBrace: 'Right brace', pieWedge: 'Quarter pie',
  funnel: 'Funnel', gear6: 'Gear (6 teeth)', gear9: 'Gear (9 teeth)',
  rightArrow: 'Right arrow', leftArrow: 'Left arrow', upArrow: 'Up arrow', downArrow: 'Down arrow', leftRightArrow: 'Left-right arrow', upDownArrow: 'Up-down arrow', quadArrow: 'Four-way arrow',
  leftRightUpArrow: 'Three-way arrow', bentArrow: 'Bent arrow', uturnArrow: 'U-turn arrow', leftUpArrow: 'Left-up arrow', bentUpArrow: 'Bent-up arrow', curvedRightArrow: 'Curved right arrow',
  curvedLeftArrow: 'Curved left arrow', curvedUpArrow: 'Curved up arrow', curvedDownArrow: 'Curved down arrow', stripedRightArrow: 'Striped arrow', notchedRightArrow: 'Notched arrow',
  homePlate: 'Pentagon arrow', chevron: 'Chevron', rightArrowCallout: 'Right arrow callout', downArrowCallout: 'Down arrow callout', leftArrowCallout: 'Left arrow callout', upArrowCallout: 'Up arrow callout',
  leftRightArrowCallout: 'Left-right arrow callout', upDownArrowCallout: 'Up-down arrow callout', quadArrowCallout: 'Four-way arrow callout', circularArrow: 'Circular arrow',
  leftCircularArrow: 'Left circular arrow', leftRightCircularArrow: 'Two-way circular arrow', swooshArrow: 'Swoosh arrow',
  mathPlus: 'Plus', mathMinus: 'Minus', mathMultiply: 'Multiply', mathDivide: 'Divide', mathEqual: 'Equal', mathNotEqual: 'Not equal',
  flowChartProcess: 'Process', flowChartAlternateProcess: 'Alternate process', flowChartDecision: 'Decision', flowChartInputOutput: 'Data', flowChartPredefinedProcess: 'Predefined process',
  flowChartInternalStorage: 'Internal storage', flowChartDocument: 'Document', flowChartMultidocument: 'Multiple documents', flowChartTerminator: 'Terminator', flowChartPreparation: 'Preparation',
  flowChartManualInput: 'Manual input', flowChartManualOperation: 'Manual operation', flowChartConnector: 'Connector', flowChartOffpageConnector: 'Off-page connector', flowChartPunchedCard: 'Card',
  flowChartPunchedTape: 'Punched tape', flowChartSummingJunction: 'Summing junction', flowChartOr: 'Or', flowChartCollate: 'Collate', flowChartSort: 'Sort', flowChartExtract: 'Extract',
  flowChartMerge: 'Merge', flowChartOnlineStorage: 'Stored data', flowChartDelay: 'Delay', flowChartMagneticTape: 'Sequential access storage', flowChartMagneticDisk: 'Magnetic disk',
  flowChartMagneticDrum: 'Direct access storage', flowChartDisplay: 'Display', flowChartOfflineStorage: 'Offline storage',
  irregularSeal1: 'Explosion 1', irregularSeal2: 'Explosion 2', star4: '4-point star', star5: '5-point star', star6: '6-point star', star7: '7-point star', star8: '8-point star', star10: '10-point star',
  star12: '12-point star', star16: '16-point star', star24: '24-point star', star32: '32-point star', ribbon2: 'Ribbon up', ribbon: 'Ribbon down', ellipseRibbon2: 'Curved ribbon up',
  ellipseRibbon: 'Curved ribbon down', leftRightRibbon: 'Two-way ribbon', verticalScroll: 'Vertical scroll', horizontalScroll: 'Horizontal scroll', wave: 'Wave', doubleWave: 'Double wave',
  wedgeRectCallout: 'Speech rectangle', wedgeRoundRectCallout: 'Speech rounded rectangle', wedgeEllipseCallout: 'Speech oval', cloudCallout: 'Thought cloud',
  borderCallout1: 'Line callout 1', borderCallout2: 'Line callout 2', borderCallout3: 'Line callout 3', accentCallout1: 'Accent callout 1', accentCallout2: 'Accent callout 2', accentCallout3: 'Accent callout 3',
  callout1: 'Callout, no border 1', callout2: 'Callout, no border 2', callout3: 'Callout, no border 3', accentBorderCallout1: 'Accent line callout 1', accentBorderCallout2: 'Accent line callout 2',
  accentBorderCallout3: 'Accent line callout 3',
  actionButtonBackPrevious: 'Back button', actionButtonForwardNext: 'Next button', actionButtonBeginning: 'First button', actionButtonEnd: 'Last button', actionButtonHome: 'Home button',
  actionButtonInformation: 'Information button', actionButtonReturn: 'Return button', actionButtonMovie: 'Video button', actionButtonDocument: 'Document button', actionButtonSound: 'Sound button',
  actionButtonHelp: 'Help button', actionButtonBlank: 'Blank button',
  chartPlus: 'Chart plus', chartX: 'Chart cross', chartStar: 'Chart star', cornerTabs: 'Corner tabs', squareTabs: 'Square tabs', plaqueTabs: 'Plaque tabs',
};

/** Open-path presets: drawn as lines, no fill. */
export const LINE_PRESETS = new Set(['line', 'lineInv', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5', 'curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5', 'arc', 'leftBracket', 'rightBracket', 'leftBrace', 'rightBrace', 'bracketPair', 'bracePair']);
/** Presets drawn only as lines (no fill area at all). */
const PURE_LINES = new Set(['line', 'lineInv', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5', 'curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5']);

export const labelOf = (name: string): string => LABELS[name] ?? name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const categoryOf = new Map(CATEGORIES.flatMap((c) => c.shapes.map((s) => [s, c.name] as const)));

/** Registers every preset from the spec data, replacing the basic built-in ones. */
export const registerAllPresets = (): void => {
  for (const name of presetNames()) {
    registerPreset({
      name, label: labelOf(name), category: categoryOf.get(name) ?? 'Other', defaults: adjustDefaults(name),
      ...(PURE_LINES.has(name) ? { line: true } : {}),
      fn: (w, h, adj) => evalPreset(name, w, h, adj) ?? { paths: [] },
    });
  }
};
