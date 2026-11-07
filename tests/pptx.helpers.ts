import { unzipSync, strFromU8 } from 'fflate';
import type { AutoShape, Deck, Shape } from '../src/model/deck';
import { readPptx, writePptx } from '../src/formats/pptx';
import { parseRoot } from '../src/formats/xml';

export const roundTrip = (deck: Deck): Deck => readPptx(writePptx(deck)).deck;

export const parts = (data: Uint8Array): Record<string, string> => {
  const z = unzipSync(data);
  return Object.fromEntries(Object.entries(z).map(([k, v]) => [k, /\.(xml|rels)$/.test(k) ? strFromU8(v) : `<${v.length} bytes>`]));
};

/** Every XML part parses and every internal relationship target exists; every part has a content type. */
export const checkPackage = (data: Uint8Array): string[] => {
  const z = unzipSync(data);
  const errs: string[] = [];
  const ct = strFromU8(z['[Content_Types].xml']!);
  const defaults = [...ct.matchAll(/Default Extension="([^"]+)"/g)].map((m) => m[1]!.toLowerCase());
  const overrides = new Set([...ct.matchAll(/Override PartName="\/([^"]+)"/g)].map((m) => m[1]!));
  for (const [name, bytes] of Object.entries(z)) {
    if (name === '[Content_Types].xml') continue;
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    if (!overrides.has(name) && !defaults.includes(ext)) errs.push(`no content type: ${name}`);
    if (/\.(xml|rels)$/.test(name)) {
      const src = strFromU8(bytes);
      if (!src.startsWith('<?xml')) errs.push(`no xml head: ${name}`);
      // Balanced tags (cheap well-formedness check).
      const stack: string[] = [];
      for (const m of src.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g)) {
        if (m[0].startsWith('<?')) continue;
        if (m[1]) { if (stack.pop() !== m[2]) { errs.push(`unbalanced </${m[2]}> in ${name}`); break; } }
        else if (!m[4]) stack.push(m[2]!);
      }
      if (stack.length) errs.push(`unclosed <${stack.at(-1)}> in ${name}`);
      if (/\.rels$/.test(name)) {
        const dir = name === '_rels/.rels' ? '' : name.replace(/_rels\/[^/]+\.rels$/, '');
        for (const r of parseRoot(src).children) {
          if (r.attrs.TargetMode === 'External') continue;
          const t = r.attrs.Target ?? '';
          const parts2 = (t.startsWith('/') ? t.slice(1) : dir + t).split('/');
          const out: string[] = [];
          for (const p of parts2) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
          const target = out.join('/');
          if (!z[target]) errs.push(`missing target ${target} from ${name}`);
        }
      }
    }
  }
  for (const o of overrides) if (!z[o]) errs.push(`override for missing part ${o}`);
  return errs;
};

export const textOfShape = (s: Shape | undefined): string => (s && s.kind === 'shape' ? (s.text?.paras ?? []).map((p) => p.runs.map((r) => (r.br ? '\n' : r.text)).join('')).join('\n') : '');
export const byName = (shapes: Shape[], name: string): Shape | undefined => shapes.find((s) => s.name === name);
export const asShape = (s: Shape | undefined): AutoShape => { if (!s || s.kind !== 'shape') throw new Error(`not a shape: ${s?.kind}`); return s; };
