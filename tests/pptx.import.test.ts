import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { Chart, Diagram, Group, Picture } from '../src/model/deck';
import { readPptx, writePptx } from '../src/formats/pptx';
import { asShape, byName, checkPackage, parts, textOfShape } from './pptx.helpers';
import { PRES, fixtureFiles, zipFixture } from './pptx.fixtures';

const open = () => readPptx(zipFixture());

describe('import of hand-written files', () => {
  it('reads size, theme with colour map, fonts and master text styles', () => {
    const { deck } = open();
    expect([deck.w, deck.h]).toEqual([960, 720]);
    const m = deck.masters[0]!;
    // The master maps tx1 to lt1 (a dark design): our dk1 slot shows what tx1 shows.
    expect(m.theme.colors.dk1).toBe('#FFFFFF');
    expect(m.theme.colors.lt1).toBe('#000000');
    expect(m.theme.colors.accent1).toBe('#4472C4');
    expect(m.theme.fonts).toMatchObject({ major: 'Calibri Light', minor: 'Calibri' });
    expect(m.theme.formatXml).toContain('<a:fmtScheme');
    expect(m.textStyles.title[0]!.defRun).toMatchObject({ size: 44, font: '+mj-lt', color: { theme: 'tx1' } });
    expect(m.textStyles.body[0]).toMatchObject({ marginLeft: 24, indent: -24, spaceBefore: 10, bullet: { type: 'char', char: '•', font: 'Arial' } });
    expect(m.textStyles.body[1]!.bullet).toEqual({ type: 'char', char: '-' });
    expect(m.background.fill).toEqual({ type: 'solid', color: { theme: 'bg1' } });
  });

  it('reads layouts with list-style levels and placeholder boxes inherited by slides', () => {
    const { deck } = open();
    const l = deck.masters[0]!.layouts[0]!;
    expect(l.type).toBe('obj');
    expect(l.name).toBe('Title and Content');
    const body = asShape(l.shapes.find((s) => s.ph?.idx === 1));
    expect(body.text?.levels?.[0]?.defRun?.size).toBe(20);
    const s = deck.slides[0]!;
    const title = s.shapes.find((x) => x.ph?.type === 'title')!;
    // Title box comes from the master (layout title has no xfrm).
    expect([Math.round(title.x), Math.round(title.y), Math.round(title.w)]).toEqual([88, 38, 1104]);
    expect(textOfShape(title)).toBe('Quarterly & review');
    const content = asShape(s.shapes.find((x) => x.ph?.idx === 1));
    expect(Math.round(content.w)).toBe(525);
    expect(content.text?.autofit).toBe('shrink');
    expect(content.text?.fontScale).toBe(0.925);
    expect(content.text?.paras[1]!.style?.level).toBe(1);
  });

  it('resolves theme style references to explicit fill, line and font colour', () => {
    const s = open().deck.slides[0]!.shapes;
    const st = asShape(byName(s, 'Styled'));
    expect(st.fill).toEqual({ type: 'solid', color: { theme: 'accent1' } });
    expect(st.line?.width).toBe(1);
    expect(st.line?.fill).toEqual({ type: 'solid', color: { theme: 'accent1', lum: -0.5 } });
    // lt1 is what tx1 shows under this master's inverted colour map, which our dk1 slot holds.
    expect(st.text?.paras[0]!.style?.defRun?.color).toEqual({ theme: 'dk1' });
    expect(st.styleRef).toMatchObject({ fill: 'accent1', line: 'accent1', font: 'dk1' });
  });

  it('maps colour transforms to theme tints or resolved colours', () => {
    const s = open().deck.slides[0]!.shapes;
    const t = asShape(byName(s, 'Transforms'));
    expect(t.fill).toEqual({ type: 'solid', color: { theme: 'accent2', lum: 0.4 } });
    const c = t.line?.fill;
    expect(c?.type === 'solid' && typeof c.color === 'string' && c.color).toMatch(/^#[0-9A-F]{6}$/);
    expect(c?.type === 'solid' && c.color).not.toBe('#FF0000');
  });

  it('uses the master colour map for tx1 / bg1 in slides', () => {
    const s = open().deck.slides[0]!.shapes;
    const runs = asShape(byName(s, 'Bg text')).text!.paras[0]!.runs;
    expect(runs[0]!.style?.color).toEqual({ theme: 'tx1' });
    expect(runs[1]!.style?.color).toEqual({ theme: 'bg1' });
  });

  it('drops unsafe links', () => {
    const s = open().deck.slides[0]!.shapes;
    expect(asShape(byName(s, 'Bg text')).text!.paras[0]!.runs[0]!.style?.link).toBeUndefined();
  });

  it('picks the AlternateContent branch it knows', () => {
    const s = open().deck.slides[0]!.shapes;
    expect(asShape(byName(s, 'Choice')).geom).toBe('star5');
    expect(byName(s, 'Fallback')).toBeUndefined();
    expect(byName(s, 'Chart fallback')).toBeTruthy();
    expect(byName(s, 'NewChart')).toBeUndefined();
  });

  it('reads diagrams: data model nodes, a layout guess and the cached drawing', () => {
    const d = byName(open().deck.slides[0]!.shapes, 'Diagram 8') as Diagram;
    expect(d.kind).toBe('diagram');
    expect(d.layout).toBe('process');
    expect(d.nodes.map((n) => [n.text, n.level])).toEqual([['Plan', 0], ['Detail', 1], ['Build', 0]]);
    expect(d.cached).toHaveLength(1);
    expect(textOfShape(d.cached![0])).toBe('Plan');
  });

  it('reads groups with child space and group fill', () => {
    const g = byName(open().deck.slides[0]!.shapes, 'Grp') as Group;
    expect(g.childBox).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect([g.x, g.y, g.w, g.h]).toEqual([100, 100, 200, 200]);
    expect(asShape(g.children[0]).fill).toEqual({ type: 'solid', color: '#00FF00' });
  });

  it('keeps pictures whose image is missing, with alt text', () => {
    const p = byName(open().deck.slides[0]!.shapes, 'Missing pic') as Picture;
    expect(p.kind).toBe('picture');
    expect(p.alt).toBe('A chart');
    expect(p.media).toBe('');
  });

  it('evaluates custom geometry guides and arcs', () => {
    const e = asShape(byName(open().deck.slides[0]!.shapes, 'Evil'));
    expect(e.geom).toBe('custom');
    expect(e.path![0]!.d).toMatch(/^M0 0L5 10A5 5 0 0 1 /);
  });

  it('reads transitions, timing, notes and modern comments', () => {
    const { deck } = open();
    const s = deck.slides[0]!;
    expect(s.transition).toMatchObject({ name: 'split', option: 'vin', duration: 1.6 });
    expect(s.animations.map((a) => [a.effect, a.option, a.trigger, a.duration, a.delay])).toEqual([['fade', undefined, 'click', 0.5, 0], ['flyIn', 'l', 'with', 0.75, 0.25]]);
    expect(s.animations[0]!.shape).toBe(byName(s.shapes, 'Styled')!.id);
    expect(s.notes.paras[0]!.runs[0]!.text).toBe('Remember the numbers');
    expect(s.comments).toHaveLength(1);
    expect(s.comments![0]).toMatchObject({ author: 'Noor Haddad', initials: 'NH', text: 'Typo here', resolved: true, x: 100 });
    expect(s.comments![0]!.replies![0]!.text).toBe('Fixed');
  });

  it('reads charts from the cached values', () => {
    const c = open().deck.slides[1]!.shapes[0] as Chart;
    expect(c.kind).toBe('chart');
    expect(c.chartType).toBe('col');
    expect(c.categories).toEqual(['Jan', '', 'Mar']);
    expect(c.series[0]).toMatchObject({ name: 'Revenue', values: [4.3, 2.5, 3.5], color: { theme: 'accent2' } });
    expect(c.legend).toBe('r');
    expect(c.axes?.gridlines).toBe(true);
  });

  it('reads sections, properties and embedded font names', () => {
    const { deck } = open();
    expect(deck.sections.map((s) => s.name)).toEqual(['Start', 'Data']);
    expect(deck.sections[1]!.first).toBe(deck.slides[1]!.id);
    expect(deck.props.title).toBe('Fixture deck');
    expect(deck.props.author).toBe('Someone');
    expect(deck.embeddedFonts).toEqual(['Lobster']);
  });

  it('keeps unknown parts (tags) on save and writes a valid package', () => {
    const { deck } = open();
    expect(deck.extraParts?.['ppt/tags/tag1.xml']).toBeTruthy();
    const bytes = writePptx(deck);
    expect(checkPackage(bytes)).toEqual([]);
    const p = parts(bytes);
    expect(p['ppt/tags/tag1.xml']).toContain('KEEP');
    expect(p['ppt/_rels/presentation.xml.rels']).toContain('tags/tag1.xml');
    expect(Object.values(p).join('')).not.toContain('passwd');
    const again = readPptx(bytes).deck;
    expect(again.slides).toHaveLength(2);
    expect((again.slides[0]!.shapes.find((s) => s.name === 'Diagram 8') as Group).kind).toBe('group');
  });
});

describe('untrusted input', () => {
  it('ignores DOCTYPE / entity declarations', () => {
    const f = fixtureFiles();
    f['ppt/presentation.xml'] = PRES.replace('<p:presentation', '<!DOCTYPE p [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><p:presentation');
    f['docProps/core.xml'] = (f['docProps/core.xml'] as string).replace('Fixture deck', '&xxe;');
    const { deck } = readPptx(zipFixture(f));
    expect(deck.props.title).toBe('&xxe;');
    expect(deck.slides).toHaveLength(2);
  });

  it('survives broken parts', () => {
    const f = fixtureFiles();
    f['ppt/slides/slide1.xml'] = '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2"';
    f['ppt/charts/chart1.xml'] = 'not xml';
    delete f['ppt/slideLayouts/slideLayout1.xml'];
    const { deck } = readPptx(zipFixture(f));
    expect(deck.slides.length).toBeGreaterThanOrEqual(1);
    expect(() => writePptx(deck)).not.toThrow();
  });

  it('rejects packages that unpack too large', () => {
    // A highly compressible part above the per-part limit.
    const big = new Uint8Array(8 * 1024 * 1024);
    const z = zipSync({ 'a.bin': [big, { level: 9 }], 'ppt/presentation.xml': strToU8(PRES) });
    expect(z.length).toBeLessThan(64 * 1024);
    expect(() => readPptx(z, { limits: { part: 4 * 1024 * 1024 } })).toThrow(/too large/);
    expect(() => readPptx(z, { limits: { total: 6 * 1024 * 1024 } })).toThrow(/too large/);
  });
});
