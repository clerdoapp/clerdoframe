// Parts from an opened file that are written back unchanged. They live in deck.extraParts by their
// original path; one JSON entry records their content types and package-level XML we keep.
import type { Deck } from '../../model/deck';
import { Package, relsPath, type Rel } from './opc';

export const META = 'clerdoframe/kept.json';

export interface KeptMeta {
  types: Record<string, string>;
  /** XML fragments of presentation.xml kept as-is, with the relationships they use. */
  presentation?: { xml: string; rels: Rel[] }[];
  /** Package-root relationships to kept parts (custom properties, thumbnails...). */
  root?: Rel[];
  /** Presentation-part relationships to kept parts (tags, customXml...). */
  pres?: Rel[];
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export const readMeta = (deck: Deck): KeptMeta => {
  const b = deck.extraParts?.[META];
  if (!b) return { types: {} };
  try {
    const v = JSON.parse(dec.decode(b)) as KeptMeta;
    return v && typeof v === 'object' && v.types && typeof v.types === 'object' ? v : { types: {} };
  } catch { return { types: {} }; }
};
export const writeMeta = (deck: Deck, m: KeptMeta): void => {
  deck.extraParts = { ...(deck.extraParts ?? {}), [META]: enc.encode(JSON.stringify(m)) };
};

/** Never kept: code and signatures don't survive our save. */
const UNSAFE = /(vbaProject|vbaData|\.bin$|_xmlsignatures|activeX|\.exe$|\.dll$)/i;
const SAFE_OLE = /^ppt\/embeddings\/.*\.(xlsx|docx|pptx|xlsm?)$/i;

/** Copies a part, its rels and everything those reference, into the deck. Returns false when it can't be kept. */
export class Keeper {
  meta: KeptMeta = { types: {} };
  parts: Record<string, Uint8Array> = {};
  constructor(private pkg: Package) {}

  keep(path: string, depth = 0): boolean {
    if (depth > 6) return false;
    const name = this.pkg.name(path);
    if (!name) return false;
    if (UNSAFE.test(name) && !SAFE_OLE.test(name)) return false;
    if (this.parts[name]) return true;
    const b = this.pkg.bytes(name)!;
    this.parts[name] = b;
    const ct = this.pkg.contentType(name);
    if (ct) this.meta.types[name] = ct;
    const rp = relsPath(name);
    const rb = this.pkg.bytes(rp);
    if (rb) {
      this.parts[this.pkg.name(rp)!] = rb;
      for (const r of this.pkg.rels(name)) if (!r.external) this.keep(r.target, depth + 1);
    }
    return true;
  }

  /** Keeps the internal targets of a list of relationships. */
  keepRels(rels: Rel[]): Rel[] {
    return rels.filter((r) => (r.external ? /^(https:|mailto:)/i.test(r.target) : this.keep(r.target)));
  }

  into(deck: Deck): void {
    if (!Object.keys(this.parts).length && !this.meta.presentation?.length) return;
    deck.extraParts = { ...(deck.extraParts ?? {}), ...this.parts };
    writeMeta(deck, this.meta);
  }
}
