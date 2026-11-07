// Shared with the spreadsheet app (same authors, MIT). Extended with qualified names and source offsets.
// A small, fast, non-validating XML parser and writer helpers for OOXML parts.
// Element names are stored without their namespace prefix; attribute names keep theirs.

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** Concatenated direct text content (entities decoded). */
  text: string;
  /** Qualified element name as written (with prefix). */
  qn: string;
  /** Source offsets of the element (start of '<' to end of the end tag), for keeping XML as-is. */
  s: number;
  e: number;
}

const ENT: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export const decodeEntities = (s: string): string =>
  s.indexOf('&') < 0
    ? s
    : s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
        if (e[0] === '#') {
          const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
        }
        return ENT[e] ?? m;
      });

const localName = (q: string): string => {
  const i = q.indexOf(':');
  return i < 0 ? q : q.slice(i + 1);
};

const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export const parseXml = (src: string): XNode => {
  const root: XNode = { name: '#document', attrs: {}, children: [], text: '', qn: '', s: 0, e: src.length };
  const stack: XNode[] = [root];
  let pos = 0;
  const len = src.length;
  if (src.charCodeAt(0) === 0xfeff) pos = 1;
  while (pos < len) {
    const lt = src.indexOf('<', pos);
    const top = stack[stack.length - 1]!;
    if (lt < 0) { top.text += decodeEntities(src.slice(pos)); break; }
    if (lt > pos) top.text += decodeEntities(src.slice(pos, lt));
    const c = src.charCodeAt(lt + 1);
    if (c === 33 /* ! */) {
      if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); pos = e < 0 ? len : e + 3; continue; }
      if (src.startsWith('<![CDATA[', lt)) {
        const e = src.indexOf(']]>', lt + 9);
        top.text += src.slice(lt + 9, e < 0 ? len : e);
        pos = e < 0 ? len : e + 3;
        continue;
      }
      // DOCTYPE (possibly with an internal subset)
      let depth = 0, i = lt + 2;
      for (; i < len; i++) {
        const ch = src[i];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) break;
      }
      pos = i + 1;
      continue;
    }
    if (c === 63 /* ? */) { const e = src.indexOf('?>', lt + 2); pos = e < 0 ? len : e + 2; continue; }
    if (c === 47 /* / */) {
      const e = src.indexOf('>', lt + 2);
      const qn = src.slice(lt + 2, e < 0 ? len : e).trim();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.qn === qn) { stack[i]!.e = e < 0 ? len : e + 1; stack.length = i; break; }
      }
      pos = e < 0 ? len : e + 1;
      continue;
    }
    // Start tag: find the closing '>' outside quoted attribute values.
    let i = lt + 1;
    let q = 0;
    for (; i < len; i++) {
      const ch = src.charCodeAt(i);
      if (q) { if (ch === q) q = 0; }
      else if (ch === 34 || ch === 39) q = ch;
      else if (ch === 62) break;
    }
    const selfClose = src.charCodeAt(i - 1) === 47;
    const body = src.slice(lt + 1, selfClose ? i - 1 : i);
    let nameEnd = 0;
    while (nameEnd < body.length && !/[\s/>]/.test(body[nameEnd]!)) nameEnd++;
    const qn = body.slice(0, nameEnd);
    const node: XNode = { name: localName(qn), attrs: {}, children: [], text: '', qn, s: lt, e: i + 1 };
    if (nameEnd < body.length) {
      ATTR_RE.lastIndex = nameEnd;
      let m: RegExpExecArray | null;
      while ((m = ATTR_RE.exec(body))) node.attrs[m[1]!] = decodeEntities(m[3] ?? m[4] ?? '');
    }
    top.children.push(node);
    if (!selfClose) stack.push(node);
    pos = i + 1;
  }
  return root;
};

/** The document element. */
export const parseRoot = (src: string): XNode => parseXml(src).children[0] ?? { name: '', attrs: {}, children: [], text: '', qn: '', s: 0, e: 0 };

export const kid = (n: XNode | undefined, name: string): XNode | undefined => n?.children.find((c) => c.name === name);
export const kids = (n: XNode | undefined, name: string): XNode[] => (n ? n.children.filter((c) => c.name === name) : []);
export const path = (n: XNode | undefined, ...names: string[]): XNode | undefined => {
  let cur = n;
  for (const nm of names) cur = kid(cur, nm);
  return cur;
};
/** Depth-first search for the first descendant with this name. */
export const find = (n: XNode | undefined, name: string): XNode | undefined => {
  if (!n) return undefined;
  for (const c of n.children) {
    if (c.name === name) return c;
    const d = find(c, name);
    if (d) return d;
  }
  return undefined;
};
export const findAll = (n: XNode | undefined, name: string, out: XNode[] = []): XNode[] => {
  if (!n) return out;
  for (const c of n.children) {
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
};
/** All text below a node, in document order. */
export const deepText = (n: XNode): string => n.text + n.children.map(deepText).join('');

/** Attribute by local name (matches "r:id" for "id" when no exact match exists). */
export const attr = (n: XNode | undefined, name: string): string | undefined => {
  if (!n) return undefined;
  const v = n.attrs[name];
  if (v !== undefined) return v;
  for (const k in n.attrs) if (k.endsWith(':' + name)) return n.attrs[k];
  return undefined;
};
export const numAttr = (n: XNode | undefined, name: string): number | undefined => {
  const v = attr(n, name);
  if (v === undefined || v === '') return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
};
export const boolAttr = (n: XNode | undefined, name: string, dflt = false): boolean => {
  const v = attr(n, name);
  return v === undefined ? dflt : v === '1' || v === 'true' || v === 'on';
};

// ---- writing ----

// eslint-disable-next-line no-control-regex
const INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export const stripInvalid = (s: string): string => s.replace(INVALID, '');

export const esc = (s: string): string =>
  stripInvalid(s).replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

/** Cell text for ST_Xstring: control characters become _xHHHH_ (as other apps write them) instead of being dropped. */
export const escXstr = (s: string): string =>
  esc(
    s
      .replace(/_(x[0-9A-Fa-f]{4})_/g, '_x005F_$1_')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, (c) => `_x${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`),
  );

export const decodeXstr = (s: string): string =>
  s.indexOf('_x') < 0 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/** Attributes from an object; undefined/false-y-by-design values are skipped. */
export const attrs = (o: Record<string, string | number | boolean | undefined>): string => {
  let s = '';
  for (const k in o) {
    const v = o[k];
    if (v === undefined) continue;
    s += ` ${k}="${typeof v === 'boolean' ? (v ? '1' : '0') : esc(String(v))}"`;
  }
  return s;
};

export const el = (name: string, a: Record<string, string | number | boolean | undefined> = {}, inner?: string): string =>
  inner === undefined || inner === '' ? `<${name}${attrs(a)}/>` : `<${name}${attrs(a)}>${inner}</${name}>`;

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
