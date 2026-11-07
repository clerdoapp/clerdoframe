import { describe, expect, it } from 'vitest';
import { COMMON_EQUATIONS, linearToMathML, STRUCTURES, tokenize } from '../src/features/charts/equation/math';

const m = (s: string) => linearToMathML(s, false).replace(/^<math[^>]*><mrow>|<\/mrow><\/math>$/g, '');

describe('linear math', () => {
  it('builds fractions and drops grouping brackets', () => {
    expect(m('a/b')).toBe('<mfrac><mi>a</mi><mi>b</mi></mfrac>');
    expect(m('(a+b)/(c)')).toBe('<mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mi>c</mi></mfrac>');
    expect(m('dy/dx')).toBe('<mfrac><mrow><mi>d</mi><mi>y</mi></mrow><mrow><mi>d</mi><mi>x</mi></mrow></mfrac>');
  });
  it('handles scripts, roots and the quadratic formula', () => {
    expect(m('x^2')).toBe('<msup><mi>x</mi><mn>2</mn></msup>');
    expect(m('x_i^(n+1)')).toBe('<msubsup><mi>x</mi><mi>i</mi><mrow><mi>n</mi><mo>+</mo><mn>1</mn></mrow></msubsup>');
    expect(m('√(x)')).toBe('<msqrt><mi>x</mi></msqrt>');
    expect(m('∛8')).toBe('<mroot><mn>8</mn><mn>3</mn></mroot>');
    const q = m('x=(-b±√(b^2-4ac))/2a');
    expect(q).toContain('<mfrac><mrow><mo>−</mo><mi>b</mi><mo>±</mo><msqrt>');
    expect(q).toContain('<mrow><mn>2</mn><mi>a</mi></mrow></mfrac>');
  });
  it('puts limits under and over large operators', () => {
    expect(m('\\sum_(i=1)^n i')).toContain('<munderover><mo largeop="true" movablelimits="false">∑</mo>');
    expect(m('∫_0^1 x')).toContain('<msubsup><mo largeop="true" movablelimits="false">∫</mo><mn>0</mn><mn>1</mn></msubsup>');
    expect(m('lim_(n→∞) a_n')).toContain('<munder><mi>lim</mi><mrow><mi>n</mi><mo>→</mo><mi>∞</mi></mrow></munder>');
  });
  it('knows Greek, functions, accents and matrices', () => {
    expect(tokenize('\\alpha+\\Omega').map((t) => t.v)).toEqual(['α', '+', 'Ω']);
    expect(m('sin x')).toContain('<mi>sin</mi><mo>&#x2061;</mo>');
    expect(m('\\hat(n)')).toBe('<mover accent="true"><mi>n</mi><mo>^</mo></mover>');
    expect(m('\\matrix(a&b@c&d)')).toBe('<mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr><mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable>');
  });
  it('escapes markup and never throws on odd input', () => {
    expect(linearToMathML('<script>')).not.toContain('<script>');
    for (const s of ['', ')', '((', '/', '^_', 'a//b', '\\matrix(', '"unclosed', '√']) expect(() => linearToMathML(s)).not.toThrow();
  });
  it('renders every built-in and palette item', () => {
    for (const e of COMMON_EQUATIONS) expect(linearToMathML(e.linear).length, e.label).toBeGreaterThan(60);
    for (const g of STRUCTURES) for (const it of g.items) expect(() => linearToMathML(it.text)).not.toThrow();
  });
});
