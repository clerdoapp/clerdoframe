/**
 * Linear math format to MathML. Supports:
 *  - fractions a/b (operands are atoms: groups, numbers, words, scripted atoms)
 *  - sub/superscripts x_i, x^2, x_i^2, with (…) grouping (parentheses are removed)
 *  - √x, √(…), ∛, ∜, \sqrt
 *  - large operators ∑ ∏ ∫ ∬ ∮ ⋃ ⋂ with limits (_ and ^)
 *  - \alpha … Greek and other named symbols, functions (sin, cos, log, lim…)
 *  - brackets ( ) [ ] { } | |, matrices \matrix(a&b@c&d), accents \hat \bar \vec \dot \tilde
 * Unknown input never throws; it falls back to plain text.
 */

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ϵ', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ',
  rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝',
  partial: '∂', nabla: '∇', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', cup: '∪', cap: '∩', forall: '∀', exists: '∃', emptyset: '∅',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', degree: '°', cdots: '⋯', ldots: '…', dots: '…', hbar: 'ℏ', ell: 'ℓ',
  sum: '∑', prod: '∏', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂', sqrt: '√', cbrt: '∛', qdrt: '∜', angle: '∠', perp: '⊥', parallel: '∥', therefore: '∴', because: '∵',
};
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'det', 'dim', 'gcd', 'mod', 'sup', 'inf', 'arg']);
const LARGE = new Set(['∑', '∏', '∫', '∬', '∭', '∮', '⋃', '⋂']);
const RADICALS: Record<string, number> = { '√': 2, '∛': 3, '∜': 4 };
const ACCENTS: Record<string, string> = { hat: '^', bar: '¯', vec: '→', dot: '˙', ddot: '¨', tilde: '~' };
const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}', '⟨': '⟩' };
const OPS = new Set('+-−=<>≤≥≠≈±∓×÷⋅·,;:!→←⇒⇔↔∈∉⊂⊆∪∩∝∼≡∀∃∠⊥∥∴∵'.split(''));

type Tok = { t: 'num' | 'id' | 'op' | 'sym' | 'open' | 'close' | 'sub' | 'sup' | 'frac' | 'fn' | 'accent' | 'matrix' | 'amp' | 'row' | 'space' | 'text'; v: string };

export const tokenize = (src: string): Tok[] => {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ') { out.push({ t: 'space', v: ' ' }); i++; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+)/.exec(src.slice(i));
      if (m) {
        const w = m[1]!;
        i += m[0].length;
        if (w === 'matrix' || w === 'pmatrix' || w === 'bmatrix') out.push({ t: 'matrix', v: w });
        else if (ACCENTS[w]) out.push({ t: 'accent', v: w });
        else if (FUNCS.has(w)) out.push({ t: 'fn', v: w });
        else if (SYMBOLS[w]) { const s = SYMBOLS[w]!; out.push(RADICALS[s] ? { t: 'sym', v: s } : LARGE.has(s) ? { t: 'sym', v: s } : OPS.has(s) ? { t: 'op', v: s } : { t: 'id', v: s }); }
        else out.push({ t: 'id', v: w });
        continue;
      }
      i++;
      if (i < src.length) { out.push({ t: 'id', v: src[i]! }); i++; }
      continue;
    }
    if (c === '"') { const e = src.indexOf('"', i + 1); const end = e < 0 ? src.length : e; out.push({ t: 'text', v: src.slice(i + 1, end) }); i = end + 1; continue; }
    if (/[0-9.]/.test(c)) { const m = /^[0-9]*\.?[0-9]+|^[0-9]+/.exec(src.slice(i))!; out.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z]+/.exec(src.slice(i))!;
      const fn = [...FUNCS].sort((a, b) => b.length - a.length).find((f) => m[0].startsWith(f) && (m[0].length === f.length || f.length >= 3));
      if (fn && m[0].startsWith(fn)) { out.push({ t: 'fn', v: fn }); i += fn.length; continue; }
      out.push({ t: 'id', v: c }); i++; continue;
    }
    if (c === '_') { out.push({ t: 'sub', v: c }); i++; continue; }
    if (c === '^') { out.push({ t: 'sup', v: c }); i++; continue; }
    if (c === '/') { out.push({ t: 'frac', v: c }); i++; continue; }
    if (c === '&') { out.push({ t: 'amp', v: c }); i++; continue; }
    if (c === '@') { out.push({ t: 'row', v: c }); i++; continue; }
    if (OPEN[c]) { out.push({ t: 'open', v: c }); i++; continue; }
    if (c === ')' || c === ']' || c === '}' || c === '⟩') { out.push({ t: 'close', v: c }); i++; continue; }
    if (RADICALS[c] || LARGE.has(c)) { out.push({ t: 'sym', v: c }); i++; continue; }
    if (c === '|' || c === '‖') { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '-' ) { out.push({ t: 'op', v: '−' }); i++; continue; }
    if (c === '*') { out.push({ t: 'op', v: '∗' }); i++; continue; }
    if (OPS.has(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    out.push({ t: 'id', v: c }); i++;
  }
  return out;
};

// ---------- MathML building (strings, escaped) ----------

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const row = (xs: string[]): string => (xs.length === 1 ? xs[0]! : `<mrow>${xs.join('')}</mrow>`);

class Parser {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek(o = 0): Tok | undefined { return this.toks[this.i + o]; }
  next(): Tok | undefined { return this.toks[this.i++]; }
  skipSpace(): void { while (this.peek()?.t === 'space') this.i++; }

  /** A sequence until a closing bracket, &, @ or the end. */
  expr(stop?: string): string[] {
    const out: string[] = [];
    for (;;) {
      const t = this.peek();
      if (!t) break;
      if (t.t === 'close' && (!stop || t.v === stop || stop === '*')) break;
      if ((t.t === 'amp' || t.t === 'row') && stop === '*') break;
      if (t.t === 'space') { this.i++; continue; }
      // Fractions bind atoms on both sides: a/b, (a+b)/(c+d), x^2/2. A bracket group right before / loses its brackets.
      const run = this.plainRun();
      let a = run > 1 && this.toks[this.i + run]?.t === 'frac' ? this.takeRun(run) : t.t === 'open' && t.v === '(' && this.groupThenFrac() ? this.groupScripted() : this.scripted();
      this.skipSpace();
      while (this.peek()?.t === 'frac') {
        this.i++;
        this.skipSpace();
        const n = this.peek();
        const nr = this.plainRun();
        const b = n?.t === 'open' && n.v === '(' ? this.groupScripted() : nr > 1 ? this.takeRun(nr, true) : this.scripted();
        a = `<mfrac>${a}${b}</mfrac>`;
        this.skipSpace();
      }
      out.push(a);
    }
    return out;
  }

  /** Length of the run of adjacent number and letter tokens at the cursor (no spaces or operators). */
  plainRun(): number {
    let k = 0;
    while (this.toks[this.i + k] && (this.toks[this.i + k]!.t === 'num' || this.toks[this.i + k]!.t === 'id')) k++;
    return k;
  }

  /** Takes `n` run tokens as one fraction operand; the last may carry scripts. */
  takeRun(n: number, scriptLast = false): string {
    const parts: string[] = [];
    for (let k = 0; k < n; k++) parts.push(k === n - 1 && scriptLast ? this.scripted() : this.atom());
    return row(parts);
  }

  /** True when the ( at the cursor closes right before a /. */
  groupThenFrac(): boolean {
    let depth = 0;
    for (let k = this.i; k < this.toks.length; k++) {
      const t = this.toks[k]!;
      if (t.t === 'open') depth++;
      else if (t.t === 'close' && --depth === 0) {
        let j = k + 1;
        while (this.toks[j]?.t === 'space') j++;
        return this.toks[j]?.t === 'frac';
      }
    }
    return false;
  }

  /** An atom with optional _ and ^ scripts. Parentheses directly after _ ^ or / group without showing. */
  scripted(): string {
    const t = this.peek();
    if (t?.t === 'sym' && LARGE.has(t.v)) return this.large();
    const fn = t?.t === 'fn' ? t.v : null;
    let base = fn ? (this.i++, `<mi>${fn}</mi>`) : this.atom();
    let sub: string | null = null, sup: string | null = null;
    for (;;) {
      const s = this.peek();
      if (s?.t === 'sub' && sub === null) { this.i++; sub = this.scriptArg(); continue; }
      if (s?.t === 'sup' && sup === null) { this.i++; sup = this.scriptArg(); continue; }
      break;
    }
    // Factorial binds to its atom so x/2! reads as x over 2!.
    if (this.peek()?.t === 'op' && this.peek()!.v === '!' && sub === null && sup === null) { this.i++; base = `<mrow>${base}<mo>!</mo></mrow>`; }
    const apply = fn ? '<mo>&#x2061;</mo><mspace width="0.17em"/>' : '';
    if (fn && ['lim', 'max', 'min', 'sup', 'inf'].includes(fn) && sub !== null) return `<munder>${base}${sub}</munder>${apply}`;
    if (sub !== null && sup !== null) base = `<msubsup>${base}${sub}${sup}</msubsup>`;
    else if (sub !== null) base = `<msub>${base}${sub}</msub>`;
    else if (sup !== null) base = `<msup>${base}${sup}</msup>`;
    return base + apply;
  }

  /** A bracket group with its brackets dropped, plus any scripts on it: (a+b)^2 keeps them. */
  groupScripted(): string {
    const start = this.i;
    const g = this.operand();
    const s = this.peek();
    if (s?.t === 'sub' || s?.t === 'sup') { this.i = start; return this.scripted(); }
    return g;
  }

  /** Script operand: a bracket group (brackets dropped) or one atom. */
  scriptArg(): string {
    const t = this.peek();
    if (t?.t === 'open' && t.v === '(') return this.operand();
    return this.atom();
  }

  /** Fraction operand: a parenthesised group loses its brackets. */
  operand(): string {
    this.skipSpace();
    const t = this.peek();
    if (t?.t === 'open' && t.v === '(') {
      this.i++;
      const inner = this.expr(')');
      if (this.peek()?.t === 'close') this.i++;
      return row(inner.length ? inner : ['<mrow/>']);
    }
    return this.scripted();
  }

  large(): string {
    const op = this.next()!.v;
    let sub: string | null = null, sup: string | null = null;
    for (;;) {
      const s = this.peek();
      if (s?.t === 'sub' && sub === null) { this.i++; sub = this.scriptArg(); continue; }
      if (s?.t === 'sup' && sup === null) { this.i++; sup = this.scriptArg(); continue; }
      break;
    }
    const mo = `<mo largeop="true" movablelimits="false">${op}</mo>`;
    const integral = op.startsWith('∫') || op === '∬' || op === '∭' || op === '∮';
    if (sub === null && sup === null) return mo;
    if (integral) return sub !== null && sup !== null ? `<msubsup>${mo}${sub}${sup}</msubsup>` : sub !== null ? `<msub>${mo}${sub}</msub>` : `<msup>${mo}${sup}</msup>`;
    return sub !== null && sup !== null ? `<munderover>${mo}${sub}${sup}</munderover>` : sub !== null ? `<munder>${mo}${sub}</munder>` : `<mover>${mo}${sup}</mover>`;
  }

  atom(): string {
    const t = this.next();
    if (!t) return '<mrow/>';
    switch (t.t) {
      case 'num': return `<mn>${esc(t.v)}</mn>`;
      case 'id': return `<mi>${esc(t.v)}</mi>`;
      case 'text': return `<mtext>${esc(t.v)}</mtext>`;
      case 'fn': return `<mi>${t.v}</mi><mo>&#x2061;</mo>`;
      case 'op': return t.v === '|' || t.v === '‖' ? `<mo lspace="0" rspace="0">${esc(t.v)}</mo>` : `<mo>${esc(t.v)}</mo>`;
      case 'space': return '<mspace width="0.2em"/>';
      case 'sym': {
        const deg = RADICALS[t.v];
        if (deg) {
          const body = this.operand();
          return deg === 2 ? `<msqrt>${body}</msqrt>` : `<mroot>${body}<mn>${deg}</mn></mroot>`;
        }
        return `<mo>${esc(t.v)}</mo>`;
      }
      case 'accent': {
        const body = this.operand();
        return `<mover accent="true">${body}<mo>${ACCENTS[t.v]}</mo></mover>`;
      }
      case 'matrix': {
        this.skipSpace();
        if (this.peek()?.t !== 'open') return '<mi>matrix</mi>';
        this.i++;
        const rows: string[][] = [[]];
        for (;;) {
          const cell = this.expr('*');
          rows.at(-1)!.push(row(cell.length ? cell : ['<mrow/>']));
          const s = this.next();
          if (!s || s.t === 'close') break;
          if (s.t === 'row') rows.push([]);
        }
        const table = `<mtable>${rows.map((r) => `<mtr>${r.map((c) => `<mtd>${c}</mtd>`).join('')}</mtr>`).join('')}</mtable>`;
        if (t.v === 'pmatrix') return `<mrow><mo>(</mo>${table}<mo>)</mo></mrow>`;
        if (t.v === 'bmatrix') return `<mrow><mo>[</mo>${table}<mo>]</mo></mrow>`;
        return table;
      }
      case 'open': {
        const close = OPEN[t.v]!;
        const inner = this.expr(close);
        const hasClose = this.peek()?.t === 'close';
        if (hasClose) this.i++;
        const big = inner.some((x) => /<(mfrac|munder|mover|munderover|mtable|msubsup)/.test(x));
        const fo = (c: string) => `<mo stretchy="${big}" lspace="0" rspace="0">${esc(c)}</mo>`;
        return `<mrow>${fo(t.v)}${inner.join('')}${hasClose ? fo(close) : ''}</mrow>`;
      }
      case 'close': return `<mo>${esc(t.v)}</mo>`;
      case 'sub': case 'sup': case 'frac': case 'amp': case 'row':
        return `<mo>${esc(t.v)}</mo>`;
    }
  }
}

/** MathML markup (an <math> element) for a linear-format string. */
export const linearToMathML = (src: string, display = true): string => {
  let body: string;
  try {
    const p = new Parser(tokenize(src.trim()));
    const parts: string[] = [];
    for (;;) {
      parts.push(...p.expr());
      if (!p.peek()) break;
      parts.push(p.atom());
    }
    body = parts.join('');
  } catch {
    body = `<mtext>${esc(src)}</mtext>`;
  }
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}><mrow>${body}</mrow></math>`;
};

/** Built-in equations people often need. */
export const COMMON_EQUATIONS: { label: string; linear: string }[] = [
  { label: 'Area of a circle', linear: 'A=πr^2' },
  { label: 'Binomial theorem', linear: '(x+a)^n=∑_(k=0)^n (\\matrix(n@k)) x^k a^(n-k)' },
  { label: 'Expansion of a sum', linear: '(1+x)^n=1+nx/1!+(n(n-1)x^2)/2!+⋯' },
  { label: 'Fourier series', linear: 'f(x)=a_0+∑_(n=1)^∞ (a_n cos (nπx)/L+b_n sin (nπx)/L)' },
  { label: 'Pythagorean theorem', linear: 'a^2+b^2=c^2' },
  { label: 'Quadratic formula', linear: 'x=(-b±√(b^2-4ac))/2a' },
  { label: 'Taylor expansion', linear: 'e^x=1+x/1!+x^2/2!+x^3/3!+⋯,  -∞<x<∞' },
  { label: 'Trig identity 1', linear: 'sin α±sin β=2 sin 1/2(α±β) cos 1/2(α∓β)' },
  { label: 'Trig identity 2', linear: 'cos α+cos β=2 cos 1/2(α+β) cos 1/2(α-β)' },
  { label: 'Normal distribution', linear: 'f(x)=1/(σ√(2π)) e^(-(x-μ)^2/(2σ^2))' },
  { label: 'Integral', linear: '∫_a^b f(x) dx=F(b)-F(a)' },
  { label: 'Limit definition of e', linear: 'e=lim_(n→∞) (1+1/n)^n' },
];

/** Structures for the palette: label and linear text inserted at the cursor. ▫ marks where to type next. */
export const STRUCTURES: { group: string; items: { label: string; text: string }[] }[] = [
  { group: 'Fraction', items: [{ label: 'Fraction', text: '(▫)/(▫)' }, { label: 'Half', text: '1/2' }, { label: 'dy/dx', text: 'dy/dx' }] },
  { group: 'Script', items: [{ label: 'Superscript', text: '▫^(▫)' }, { label: 'Subscript', text: '▫_(▫)' }, { label: 'Both', text: '▫_(▫)^(▫)' }] },
  { group: 'Radical', items: [{ label: 'Square root', text: '√(▫)' }, { label: 'Cube root', text: '∛(▫)' }, { label: 'Fourth root', text: '∜(▫)' }] },
  { group: 'Integral', items: [{ label: 'Integral', text: '∫_(▫)^(▫) ▫ dx' }, { label: 'Double integral', text: '∬ ▫ dA' }, { label: 'Contour integral', text: '∮ ▫' }] },
  { group: 'Large operator', items: [{ label: 'Sum', text: '∑_(i=1)^n ▫' }, { label: 'Product', text: '∏_(i=1)^n ▫' }, { label: 'Union', text: '⋃_(i=1)^n ▫' }, { label: 'Intersection', text: '⋂_(i=1)^n ▫' }] },
  { group: 'Bracket', items: [{ label: 'Parentheses', text: '(▫)' }, { label: 'Square brackets', text: '[▫]' }, { label: 'Braces', text: '{▫}' }, { label: 'Absolute value', text: '|▫|' }] },
  { group: 'Function', items: [{ label: 'sin', text: 'sin ▫' }, { label: 'cos', text: 'cos ▫' }, { label: 'tan', text: 'tan ▫' }, { label: 'log', text: 'log_(▫) ▫' }, { label: 'ln', text: 'ln ▫' }] },
  { group: 'Accent', items: [{ label: 'Hat', text: '\\hat(▫)' }, { label: 'Bar', text: '\\bar(▫)' }, { label: 'Vector', text: '\\vec(▫)' }, { label: 'Dot', text: '\\dot(▫)' }, { label: 'Tilde', text: '\\tilde(▫)' }] },
  { group: 'Limit', items: [{ label: 'Limit', text: 'lim_(n→∞) ▫' }, { label: 'Max', text: 'max_(▫) ▫' }, { label: 'Min', text: 'min_(▫) ▫' }] },
  { group: 'Operator', items: [{ label: 'Defined as', text: '≝' }, { label: 'Right arrow', text: '→' }, { label: 'Implies', text: '⇒' }, { label: 'If and only if', text: '⇔' }] },
  { group: 'Matrix', items: [{ label: '2 by 2', text: '\\pmatrix(▫&▫@▫&▫)' }, { label: '3 by 3', text: '\\bmatrix(▫&▫&▫@▫&▫&▫@▫&▫&▫)' }, { label: 'Column', text: '\\pmatrix(▫@▫)' }] },
];

export const SYMBOL_SET: string[] = ['±', '∓', '×', '÷', '⋅', '≠', '≈', '≡', '≤', '≥', '∝', '∞', '∂', '∇', '∈', '∉', '⊂', '⊆', '∪', '∩', '∀', '∃', '∅', '→', '⇒', '⇔', '°', '∠', '⊥', '∥', '∴', 'α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Δ', 'Σ', 'Π', 'Ω'];
