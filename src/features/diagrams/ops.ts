import { uid, type AutoShape, type Diagram, type DiagramLayout, type DiagramNode, type Group, type Paragraph, type Theme } from '../../model/deck';
import { layoutDiagram } from './layout';

export type DiagramGroup = 'List' | 'Process' | 'Cycle' | 'Hierarchy' | 'Relationship' | 'Matrix' | 'Pyramid' | 'Picture';
export const DIAGRAM_GROUPS: DiagramGroup[] = ['List', 'Process', 'Cycle', 'Hierarchy', 'Relationship', 'Matrix', 'Pyramid', 'Picture'];

export const DIAGRAM_LAYOUTS: { id: DiagramLayout; label: string; group: DiagramGroup }[] = [
  { id: 'basicList', label: 'Blocks', group: 'List' },
  { id: 'verticalList', label: 'Stacked list', group: 'List' },
  { id: 'target', label: 'Target list', group: 'List' },
  { id: 'grid', label: 'Card grid', group: 'List' },
  { id: 'process', label: 'Steps', group: 'Process' },
  { id: 'chevronProcess', label: 'Chevrons', group: 'Process' },
  { id: 'bendingProcess', label: 'Bending steps', group: 'Process' },
  { id: 'stepUp', label: 'Rising steps', group: 'Process' },
  { id: 'stepsDown', label: 'Falling steps', group: 'Process' },
  { id: 'timeline', label: 'Timeline', group: 'Process' },
  { id: 'arrowRibbon', label: 'Opposing arrows', group: 'Process' },
  { id: 'cycle', label: 'Cycle', group: 'Cycle' },
  { id: 'radial', label: 'Hub and spokes', group: 'Cycle' },
  { id: 'gear', label: 'Gears', group: 'Cycle' },
  { id: 'orgChart', label: 'Organization chart', group: 'Hierarchy' },
  { id: 'hierarchy', label: 'Tree', group: 'Hierarchy' },
  { id: 'venn', label: 'Overlapping circles', group: 'Relationship' },
  { id: 'funnel', label: 'Funnel', group: 'Relationship' },
  { id: 'matrix', label: 'Quadrants', group: 'Matrix' },
  { id: 'pyramid', label: 'Pyramid', group: 'Pyramid' },
  { id: 'invertedPyramid', label: 'Inverted pyramid', group: 'Pyramid' },
  { id: 'pictureList', label: 'Picture cards', group: 'Picture' },
];

const N = (text: string, level = 0): DiagramNode => ({ id: uid('n'), text, level });

/** Sample outline for a new diagram of a layout. */
export const sampleNodes = (layout: DiagramLayout): DiagramNode[] => {
  switch (layout) {
    case 'orgChart': return [N('Director'), N('Design', 1), N('Lead', 2), N('Team', 2), N('Product', 1), N('Engineering', 1), N('Platform', 2), N('Apps', 2)];
    case 'hierarchy': return [N('Goal'), N('Plan A', 1), N('Step 1', 2), N('Step 2', 2), N('Plan B', 1), N('Step 3', 2)];
    case 'radial': return [N('Core'), N('Idea', 1), N('Team', 1), N('Tools', 1), N('Users', 1), N('Data', 1)];
    case 'matrix': return [N('Strengths'), N('Weaknesses'), N('Opportunities'), N('Threats')];
    case 'venn': return [N('People'), N('Process'), N('Tools')];
    case 'gear': return [N('Plan'), N('Build'), N('Ship')];
    case 'arrowRibbon': return [N('Costs'), N('Benefits')];
    case 'verticalList': case 'chevronProcess': return [N('Discover'), N('Talk to users', 1), N('Define'), N('Write the brief', 1), N('Deliver'), N('Build and ship', 1)];
    case 'pyramid': case 'invertedPyramid': case 'funnel': case 'target': return [N('Vision'), N('Strategy'), N('Goals'), N('Tasks')];
    case 'timeline': return [N('2023'), N('Launch', 1), N('2024'), N('Grow', 1), N('2025'), N('Expand', 1), N('2026'), N('Lead', 1)];
    case 'cycle': return [N('Plan'), N('Do'), N('Check'), N('Act'), N('Learn')];
    case 'pictureList': return [N('Mountains'), N('Coast'), N('Cities')];
    case 'grid': return [N('Plan'), N('Set the goal', 1), N('Build'), N('Make it work', 1), N('Test'), N('Check with users', 1), N('Ship'), N('Release it', 1)];
    case 'stepsDown': return [N('Start'), N('Prepare'), N('Run'), N('Review')];
    default: return [N('First'), N('Second'), N('Third'), N('Fourth'), N('Fifth')];
  }
};

export const newDiagram = (layout: DiagramLayout, box: { x: number; y: number; w: number; h: number }): Diagram => ({
  id: uid('s'), kind: 'diagram', name: 'Diagram', ...box, layout, nodes: sampleNodes(layout), colorScheme: 'primary', styleName: 'flat',
});

/** Keeps the first `n` top-level items (with their sub-items), adding numbered ones when there are fewer. */
export const withItemCount = (nodes: DiagramNode[], n: number): DiagramNode[] => {
  const want = Math.max(1, Math.min(30, Math.round(n)));
  const out: DiagramNode[] = [];
  let roots = 0;
  for (const x of nodes) {
    if (x.level === 0) roots++;
    if (roots > want) break;
    out.push(x);
  }
  for (let k = roots; k < want; k++) out.push(N(`Item ${k + 1}`));
  return out;
};

/** Anything edited drops the cached drawing from an opened file. */
export const touched = (d: Diagram): void => { delete d.cached; };

// ---------- Outline edits (pure; act on a node index) ----------

/** Index range [i, end) of node i and its descendants. */
export const subtree = (nodes: DiagramNode[], i: number): [number, number] => {
  const lv = nodes[i]?.level ?? 0;
  let e = i + 1;
  while (e < nodes.length && nodes[e]!.level > lv) e++;
  return [i, e];
};

export type AddWhere = 'after' | 'before' | 'above' | 'below';

/** Adds a node relative to node i; returns the new node's index. */
export const addNode = (d: Diagram, i: number, where: AddWhere, text = ''): number => {
  const ns = d.nodes;
  const cur = ns[i];
  const node = N(text, 0);
  if (!cur) { ns.push(node); touched(d); return ns.length - 1; }
  let at: number;
  if (where === 'before') { node.level = cur.level; at = i; }
  else if (where === 'after') { node.level = cur.level; at = subtree(ns, i)[1]; }
  else if (where === 'below') { node.level = cur.level + 1; at = subtree(ns, i)[1]; }
  else {
    // A new parent: it takes the node's place and the node's subtree moves one level down.
    node.level = cur.level;
    const [a, b] = subtree(ns, i);
    for (let k = a; k < b; k++) ns[k]!.level++;
    at = i;
  }
  ns.splice(at, 0, node);
  touched(d);
  return at;
};

export const removeNode = (d: Diagram, i: number): void => {
  const ns = d.nodes;
  const [a, b] = subtree(ns, i);
  for (let k = a + 1; k < b; k++) ns[k]!.level--;
  ns.splice(i, 1);
  touched(d);
};

/** Shifts node i (and its subtree) one level; a node can be at most one deeper than the one before it. */
export const shiftLevel = (d: Diagram, i: number, delta: 1 | -1): boolean => {
  const ns = d.nodes;
  const cur = ns[i];
  if (!cur) return false;
  if (delta > 0 && (i === 0 || cur.level >= (ns[i - 1]!.level + 1) || cur.level >= 8)) return false;
  if (delta < 0 && cur.level === 0) return false;
  const [a, b] = subtree(ns, i);
  for (let k = a; k < b; k++) ns[k]!.level = Math.max(0, ns[k]!.level + delta);
  touched(d);
  return true;
};

/** Moves node i with its subtree past its previous / next sibling. Returns the new index. */
export const moveNode = (d: Diagram, i: number, dir: -1 | 1): number => {
  const ns = d.nodes;
  const cur = ns[i];
  if (!cur) return i;
  const [a, b] = subtree(ns, i);
  if (dir < 0) {
    let p = a - 1;
    while (p >= 0 && ns[p]!.level > cur.level) p--;
    if (p < 0 || ns[p]!.level !== cur.level) return i;
    const block = ns.splice(a, b - a);
    ns.splice(p, 0, ...block);
    touched(d);
    return p;
  }
  if (b >= ns.length || ns[b]!.level !== cur.level) return i;
  const [, nb] = subtree(ns, b);
  const block = ns.splice(a, b - a);
  ns.splice(nb - (b - a), 0, ...block);
  touched(d);
  return nb - (b - a);
};

/** Parses outline text (tabs or two-space indents give levels) into nodes, keeping ids by position. */
export const nodesFromText = (text: string, old: DiagramNode[] = []): DiagramNode[] => {
  const out: DiagramNode[] = [];
  text.split('\n').forEach((raw, k) => {
    const m = /^([\t ]*)(.*)$/.exec(raw)!;
    const ind = m[1]!.replace(/ {2}/g, '\t').replace(/ /g, '').length;
    const prev = out.at(-1)?.level ?? -1;
    const level = Math.max(0, Math.min(ind, prev + 1));
    const o = old[k];
    out.push({ ...(o ?? {}), id: o?.id ?? uid('n'), text: m[2]!.replace(/^[-*•]\s+/, ''), level });
  });
  return out.length ? out : [N('')];
};

export const textFromNodes = (nodes: DiagramNode[]): string => nodes.map((n) => '\t'.repeat(n.level) + n.text).join('\n');

/** Text box paragraphs (with levels) to diagram nodes. */
export const nodesFromParas = (paras: Paragraph[]): DiagramNode[] => {
  const raw = paras.map((p) => ({ text: p.runs.map((r) => (r.br ? ' ' : r.text)).join('').trim(), level: p.style?.level ?? 0 })).filter((p) => p.text);
  const out: DiagramNode[] = [];
  for (const p of raw) {
    const prev = out.at(-1)?.level ?? -1;
    out.push(N(p.text, Math.max(0, Math.min(p.level, prev + 1))));
  }
  return out;
};

/** Diagram nodes back to bulleted paragraphs. */
export const parasFromNodes = (nodes: DiagramNode[]): Paragraph[] =>
  nodes.map((n) => ({ runs: n.text ? [{ text: n.text }] : [], style: { level: Math.min(8, n.level) } }));

/** The laid-out shapes placed in a group the size of the diagram. */
export const toGroup = (d: Diagram, theme: Theme): Group => {
  const shapes: AutoShape[] = (d.cached?.filter((s): s is AutoShape => s.kind === 'shape') ?? layoutDiagram(d, theme)).map((s) => ({ ...structuredClone(s), id: uid('s') }));
  return {
    id: uid('s'), kind: 'group', name: d.name || 'Diagram', x: d.x, y: d.y, w: d.w, h: d.h, ...(d.rot ? { rot: d.rot } : {}),
    children: shapes, childBox: { x: 0, y: 0, w: d.w, h: d.h },
  };
};
