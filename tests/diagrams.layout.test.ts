import { describe, expect, it } from 'vitest';
import { FrameStore } from '../src/app/store';
import { DEFAULT_THEME, newDeck } from '../src/model/defaults';
import type { Diagram, DiagramLayout } from '../src/model/deck';
import { buildTree, COLOR_SCHEMES, DIAGRAM_STYLES, fitSize, layoutDiagram, schemeColor } from '../src/features/diagrams/layout';
import { addNode, DIAGRAM_LAYOUTS, moveNode, newDiagram, nodesFromParas, nodesFromText, parasFromNodes, removeNode, sampleNodes, shiftLevel, subtree, textFromNodes, toGroup } from '../src/features/diagrams/ops';

const ALL: DiagramLayout[] = ['basicList', 'verticalList', 'process', 'chevronProcess', 'cycle', 'radial', 'hierarchy', 'orgChart', 'pyramid', 'invertedPyramid', 'venn', 'matrix', 'funnel', 'timeline', 'gear', 'target', 'stepUp', 'bendingProcess', 'pictureList', 'arrowRibbon'];
const box = { x: 100, y: 50, w: 800, h: 450 };
const lv = (d: Diagram) => d.nodes.map((n) => `${n.level}${n.text}`).join(' ');

describe('layoutDiagram', () => {
  it('lays out every layout inside the diagram box', () => {
    expect(DIAGRAM_LAYOUTS.map((l) => l.id).sort()).toEqual([...ALL].sort());
    for (const id of ALL) for (const scheme of ['primary', 'colorful', 'accent2Outline']) for (const style of DIAGRAM_STYLES.map((s) => s.id)) {
      const d = { ...newDiagram(id, box), colorScheme: scheme, styleName: style };
      const shapes = layoutDiagram(d, DEFAULT_THEME);
      expect(shapes.length, id).toBeGreaterThan(0);
      for (const s of shapes) {
        expect(s.kind).toBe('shape');
        expect(Number.isFinite(s.x + s.y + s.w + s.h), id).toBe(true);
        // Local coordinates: within the box, allowing rotation slack.
        expect(s.x, id).toBeGreaterThan(-box.w * 0.1);
        expect(s.y, id).toBeGreaterThan(-box.h * 0.1);
        expect(s.x + s.w, id).toBeLessThan(box.w * 1.1);
        expect(s.y + s.h, id).toBeLessThan(box.h * 1.1);
      }
    }
  });
  it('shows each node text once in text-bearing layouts', () => {
    for (const id of ALL.filter((x) => !['gear', 'arrowRibbon', 'matrix'].includes(x))) {
      const d = newDiagram(id, box);
      const texts = layoutDiagram(d, DEFAULT_THEME).flatMap((s) => s.text?.paras.map((p) => p.runs.map((r) => r.text).join('')) ?? []).filter(Boolean);
      for (const n of d.nodes) expect(texts, `${id}: ${n.text}`).toContain(n.text);
    }
  });
  it('is stable for the same input and copes with no nodes', () => {
    const d = newDiagram('orgChart', box);
    expect(JSON.stringify(layoutDiagram(d, DEFAULT_THEME))).toBe(JSON.stringify(layoutDiagram(d, DEFAULT_THEME)));
    expect(layoutDiagram({ ...d, nodes: [] }, DEFAULT_THEME).length).toBeGreaterThan(0);
  });
  it('builds an org chart tree with connectors', () => {
    const shapes = layoutDiagram(newDiagram('orgChart', box), DEFAULT_THEME);
    expect(shapes.filter((s) => s.geom === 'line').length).toBeGreaterThan(5);
    const director = shapes.find((s) => s.text?.paras[0]?.runs[0]?.text === 'Director')!;
    const lead = shapes.find((s) => s.text?.paras[0]?.runs[0]?.text === 'Lead')!;
    expect(director.y).toBeLessThan(lead.y);
  });
  it('fits text sizes to the box', () => {
    expect(fitSize('Hello', [], 400, 200)).toBe(32);
    expect(fitSize('A rather long label that must wrap', [], 120, 60)).toBeLessThan(14);
  });
  it('uses each colour scheme', () => {
    expect(COLOR_SCHEMES.length).toBeGreaterThan(10);
    expect(schemeColor('colorful', 2, 5)).toEqual({ theme: 'accent3' });
    expect(schemeColor('accent4', 0, 3)).toEqual({ theme: 'accent4', lum: -0.25 });
  });
  it('picture lists use node pictures', () => {
    const d = newDiagram('pictureList', box);
    d.nodes[0]!.media = 'm1';
    expect(layoutDiagram(d, DEFAULT_THEME).some((s) => s.fill?.type === 'picture' && s.fill.media === 'm1')).toBe(true);
  });
});

describe('outline editing', () => {
  const mk = () => ({ ...newDiagram('basicList', box), nodes: nodesFromText('A\n\tA1\n\tA2\nB\nC') });
  it('builds trees and subtrees from levels', () => {
    const d = mk();
    expect(buildTree(d.nodes).map((r) => r.children.length)).toEqual([2, 0, 0]);
    expect(subtree(d.nodes, 0)).toEqual([0, 3]);
  });
  it('adds before, after, above and below', () => {
    let d = mk(); addNode(d, 0, 'after', 'X'); expect(lv(d)).toBe('0A 1A1 1A2 0X 0B 0C');
    d = mk(); addNode(d, 3, 'before', 'X'); expect(lv(d)).toBe('0A 1A1 1A2 0X 0B 0C');
    d = mk(); addNode(d, 0, 'below', 'X'); expect(lv(d)).toBe('0A 1A1 1A2 1X 0B 0C');
    d = mk(); addNode(d, 0, 'above', 'X'); expect(lv(d)).toBe('0X 1A 2A1 2A2 0B 0C');
  });
  it('promotes, demotes and moves with subtrees', () => {
    const d = mk();
    expect(shiftLevel(d, 0, 1)).toBe(false);
    expect(shiftLevel(d, 3, 1)).toBe(true);
    expect(lv(d)).toBe('0A 1A1 1A2 1B 0C');
    expect(shiftLevel(d, 1, -1)).toBe(true);
    expect(lv(d)).toBe('0A 0A1 1A2 1B 0C');
    const e = mk();
    expect(moveNode(e, 3, -1)).toBe(0);
    expect(lv(e)).toBe('0B 0A 1A1 1A2 0C');
    expect(moveNode(e, 1, 1)).toBe(2);
    expect(lv(e)).toBe('0B 0C 0A 1A1 1A2');
  });
  it('removes a node and lifts its children', () => {
    const d = mk();
    removeNode(d, 0);
    expect(lv(d)).toBe('0A1 0A2 0B 0C');
  });
  it('drops the cached drawing when edited', () => {
    const d = { ...mk(), cached: [] };
    addNode(d, 0, 'after');
    expect(d.cached).toBeUndefined();
  });
  it('converts between outline text, paragraphs and nodes', () => {
    const d = mk();
    expect(textFromNodes(d.nodes)).toBe('A\n\tA1\n\tA2\nB\nC');
    expect(nodesFromText('  - X\nY', d.nodes).map((n) => [n.level, n.text])).toEqual([[0, 'X'], [0, 'Y']]);
    const paras = parasFromNodes(d.nodes);
    expect(nodesFromParas(paras).map((n) => `${n.level}${n.text}`)).toEqual(d.nodes.map((n) => `${n.level}${n.text}`));
    expect(nodesFromParas([{ runs: [{ text: 'deep' }], style: { level: 3 } }])[0]!.level).toBe(0);
  });
  it('turns a diagram into a group of shapes', () => {
    const d = newDiagram('process', box);
    const g = toGroup(d, DEFAULT_THEME);
    expect(g).toMatchObject({ kind: 'group', x: 100, y: 50, w: 800, h: 450, childBox: { x: 0, y: 0, w: 800, h: 450 } });
    expect(g.children.length).toBe(layoutDiagram(d, DEFAULT_THEME).length);
    expect(new Set(g.children.map((c) => c.id)).size).toBe(g.children.length);
  });
  it('gives sample nodes to every layout', () => {
    for (const id of ALL) expect(sampleNodes(id).length).toBeGreaterThan(1);
  });
  it('edits through the store as one undo step', () => {
    const s = new FrameStore(newDeck());
    const d = newDiagram('cycle', box);
    s.change('add', () => { s.deck.slides[0]!.shapes.push(d); });
    s.change('edit', () => { const x = s.shape(d.id) as Diagram; addNode(x, 0, 'after', 'New'); });
    expect((s.shape(d.id) as Diagram).nodes.length).toBe(6);
    s.undo();
    expect((s.shape(d.id) as Diagram).nodes.length).toBe(5);
  });
});
