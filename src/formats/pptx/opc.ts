// Open Packaging Conventions (ECMA-376 Part 2): zip container, content types and relationships.
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { attr, kids, parseRoot, type XNode } from '../xml';

/** Limits for untrusted packages. */
export const MAX_PART = 512 * 1024 * 1024;
export const MAX_TOTAL = 1024 * 1024 * 1024;
export const MAX_PARTS = 20000;

export interface Rel { id: string; type: string; /** Package path (resolved), or the raw URL when external. */ target: string; external: boolean }

export const relType = (t: string): string => t.slice(t.lastIndexOf('/') + 1);
export const dirOf = (p: string): string => p.slice(0, p.lastIndexOf('/') + 1);
export const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/** Resolves a relationship target against the source part. Never climbs above the package root. */
export const resolvePath = (base: string, target: string): string => {
  const t = target.replace(/\\/g, '/').split('#')[0]!;
  const parts = (t.startsWith('/') ? t.slice(1) : dirOf(base) + t).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(decodeURIComponentSafe(p));
  }
  return out.join('/');
};
const decodeURIComponentSafe = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

/** Relative target from one part to another, for writing rels. */
export const relativePath = (from: string, to: string): string => {
  const a = dirOf(from).split('/').filter(Boolean);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
};

export const relsPath = (part: string): string => `${dirOf(part)}_rels/${baseName(part)}.rels`;

export class Package {
  files: Record<string, Uint8Array> = {};
  private lower = new Map<string, string>();
  private dec = new TextDecoder('utf-8');
  private relCache = new Map<string, Rel[]>();
  private types: { defaults: Record<string, string>; overrides: Record<string, string> } | null = null;

  constructor(data: Uint8Array, limits: { part?: number; total?: number } = {}) {
    let total = 0, count = 0;
    const maxPart = limits.part ?? MAX_PART, maxTotal = limits.total ?? MAX_TOTAL;
    this.files = unzipSync(data, {
      filter: (f) => {
        total += f.originalSize;
        if (++count > MAX_PARTS || f.originalSize > maxPart || total > maxTotal) throw new Error('This file is too large to open.');
        // Zip-slip style names are skipped; parts are only ever looked up by resolved name.
        return !f.name.includes('..') && !f.name.endsWith('/');
      },
    });
    for (const k of Object.keys(this.files)) this.lower.set(k.toLowerCase(), k);
  }

  name(p: string): string | undefined { return this.files[p] ? p : this.lower.get(p.toLowerCase()); }
  has(p: string): boolean { return !!this.name(p); }
  bytes(p: string): Uint8Array | undefined { const n = this.name(p); return n ? this.files[n] : undefined; }
  text(p: string): string | undefined {
    const b = this.bytes(p);
    if (!b) return undefined;
    if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
    return this.dec.decode(b);
  }
  xml(p: string): { root: XNode; src: string } | undefined {
    const src = this.text(p);
    if (src === undefined) return undefined;
    try { return { root: parseRoot(src), src }; } catch { return undefined; }
  }

  rels(part: string): Rel[] {
    const hit = this.relCache.get(part);
    if (hit) return hit;
    const x = this.xml(relsPath(part));
    const out: Rel[] = [];
    for (const r of kids(x?.root, 'Relationship')) {
      const id = attr(r, 'Id'), type = attr(r, 'Type') ?? '', target = attr(r, 'Target') ?? '';
      if (!id) continue;
      const external = attr(r, 'TargetMode') === 'External';
      out.push({ id, type, target: external ? target : resolvePath(part, target), external });
    }
    this.relCache.set(part, out);
    return out;
  }
  rel(part: string, id: string | undefined): Rel | undefined { return id ? this.rels(part).find((r) => r.id === id) : undefined; }
  relsOfType(part: string, type: string): Rel[] { return this.rels(part).filter((r) => relType(r.type) === type); }

  contentType(p: string): string | undefined {
    if (!this.types) {
      const x = this.xml('[Content_Types].xml');
      const defaults: Record<string, string> = {}, overrides: Record<string, string> = {};
      for (const d of kids(x?.root, 'Default')) defaults[(attr(d, 'Extension') ?? '').toLowerCase()] = attr(d, 'ContentType') ?? '';
      for (const o of kids(x?.root, 'Override')) overrides[(attr(o, 'PartName') ?? '').replace(/^\//, '').toLowerCase()] = attr(o, 'ContentType') ?? '';
      this.types = { defaults, overrides };
    }
    const n = (this.name(p) ?? p).toLowerCase();
    return this.types.overrides[n] ?? this.types.defaults[n.slice(n.lastIndexOf('.') + 1)];
  }
}

// ---------- Writing ----------

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

export const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  p15: 'http://schemas.microsoft.com/office/powerpoint/2012/main',
  p159: 'http://schemas.microsoft.com/office/powerpoint/2015/09/main',
  a14: 'http://schemas.microsoft.com/office/drawing/2010/main',
  a16: 'http://schemas.microsoft.com/office/drawing/2014/main',
  pr: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
};

export const REL = {
  officeDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  app: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
  notesSlide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  presProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps',
  viewProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps',
  tableStyles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles',
  commentAuthors: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentAuthors',
  comments: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  video: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video',
  audio: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio',
  media: 'http://schemas.microsoft.com/office/2007/relationships/media',
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
  chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
  package: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
};

export const CT = {
  presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  template: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml',
  show: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  layout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  master: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  notesMaster: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml',
  notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
  presProps: 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml',
  viewProps: 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml',
  tableStyles: 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml',
  commentAuthors: 'application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml',
  comments: 'application/vnd.openxmlformats-officedocument.presentationml.comments+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
  chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml',
  webp: 'image/webp', emf: 'image/x-emf', wmf: 'image/x-wmf', ico: 'image/x-icon',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', mpg: 'video/mpeg', mpeg: 'video/mpeg',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', wma: 'audio/x-ms-wma', ogg: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac',
  xlsx: CT.xlsx, bin: 'application/vnd.openxmlformats-officedocument.oleObject', fntdata: 'application/x-fontdata', xml: 'application/xml',
};
export const extFor = (mime: string, name = ''): string => {
  const fromName = name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  if (fromName && MEDIA_TYPES[fromName] === mime) return fromName;
  const hit = Object.entries(MEDIA_TYPES).find(([, t]) => t === mime);
  return hit ? hit[0] : fromName ?? 'bin';
};

/** Relationships of one part while it is being written. */
export class RelSet {
  list: { id: string; type: string; target: string; external: boolean }[] = [];
  constructor(public part: string) {}
  /** Adds (or reuses) a relationship to a package path or external URL; returns its id. */
  add(type: string, target: string, external = false): string {
    const t = external ? target : relativePath(this.part, target);
    const hit = this.list.find((r) => r.type === type && r.target === t && r.external === external);
    if (hit) return hit.id;
    const id = `rId${this.list.length + 1}`;
    this.list.push({ id, type, target: t, external });
    return id;
  }
  xml(): string {
    return XML_HEAD + `<Relationships xmlns="${NS.pr}">`
      + this.list.map((r) => `<Relationship Id="${r.id}" Type="${escA(r.type)}" Target="${escA(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')
      + '</Relationships>';
  }
}

const escA = (s: string): string => s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

/** Collects parts, content types and rels; zips the package. */
export class PackageWriter {
  parts = new Map<string, Uint8Array>();
  overrides = new Map<string, string>();
  defaults = new Map<string, string>([['rels', CT.rels], ['xml', 'application/xml']]);
  private enc = new TextEncoder();
  rels = new Map<string, RelSet>();

  relsFor(part: string): RelSet {
    let r = this.rels.get(part);
    if (!r) { r = new RelSet(part); this.rels.set(part, r); }
    return r;
  }
  put(path: string, data: string | Uint8Array, contentType?: string): void {
    this.parts.set(path, typeof data === 'string' ? this.enc.encode(data) : data);
    if (contentType) {
      const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
      if (ext !== 'xml' && !this.overrides.has(path) && (!this.defaults.has(ext) || this.defaults.get(ext) === contentType)) this.defaults.set(ext, contentType);
      else if (this.defaults.get(ext) !== contentType) this.overrides.set(path, contentType);
    }
  }
  has(path: string): boolean { return this.parts.has(path); }
  /** A free part name like ppt/media/image7.png. */
  unique(dir: string, stem: string, ext: string): string {
    for (let i = 1; ; i++) { const p = `${dir}${stem}${i}.${ext}`; if (!this.parts.has(p)) return p; }
  }
  zip(): Uint8Array {
    for (const [part, r] of this.rels) if (r.list.length) this.parts.set(part === '' ? '_rels/.rels' : relsPath(part), this.enc.encode(r.xml()));
    const ct = XML_HEAD + `<Types xmlns="${NS.ct}">`
      + [...this.defaults].map(([e, t]) => `<Default Extension="${escA(e)}" ContentType="${escA(t)}"/>`).join('')
      + [...this.overrides].filter(([p]) => this.parts.has(p)).map(([p, t]) => `<Override PartName="/${escA(p)}" ContentType="${escA(t)}"/>`).join('')
      + '</Types>';
    const files: Zippable = { '[Content_Types].xml': this.enc.encode(ct) };
    for (const [p, d] of this.parts) {
      const ext = p.slice(p.lastIndexOf('.') + 1).toLowerCase();
      const stored = /^(png|jpe?g|gif|mp4|mov|webm|mp3|m4a|wmv|avi|zip|xlsx|docx|fntdata)$/.test(ext);
      files[p] = stored ? [d, { level: 0 }] : d;
    }
    return zipSync(files, { level: 6 });
  }
}

/** Parses a raw relationships list kept from an opened file. */
export const parseKeptRels = (json: string | undefined): Rel[] => {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((r): r is Rel => !!r && typeof r === 'object' && typeof (r as Rel).id === 'string' && typeof (r as Rel).type === 'string' && typeof (r as Rel).target === 'string') : [];
  } catch { return []; }
};

export const relIdAttrs = /\b(r:(?:id|embed|link|pict|dm|lo|qs|cs|href))="([^"]*)"/g;

/** Rewrites r:* relationship ids in kept XML to new ids added to `rels`. Targets missing from the package are dropped. */
export const remapRels = (xml: string, kept: Rel[], rels: RelSet, exists: (path: string) => boolean): string => {
  const map = new Map<string, string>();
  for (const r of kept) {
    if (r.external) { if (/^(https:|mailto:)/i.test(r.target)) map.set(r.id, rels.add(r.type, r.target, true)); continue; }
    if (exists(r.target)) map.set(r.id, rels.add(r.type, r.target));
  }
  return xml.replace(relIdAttrs, (m, a: string, id: string) => (map.has(id) ? `${a}="${map.get(id)}"` : m.includes('r:id') || m.includes('r:embed') ? `${a}=""` : m));
};

export const relsOfNode = (pkg: Package, part: string, node: XNode, src: string): Rel[] => {
  const raw = src.slice(node.s, node.e);
  const ids = new Set<string>();
  for (const m of raw.matchAll(relIdAttrs)) ids.add(m[2]!);
  return pkg.rels(part).filter((r) => ids.has(r.id));
};
