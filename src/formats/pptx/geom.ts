// Custom geometry (ECMA-376 Part 1, 20.1.9): a:custGeom <-> SVG path data in our {d, w, h} form.
import { attr, kid, kids, numAttr, type XNode } from '../xml';

type Vars = Record<string, number>;

const builtins = (w: number, h: number): Vars => {
  const ss = Math.min(w, h), ls = Math.max(w, h);
  const v: Vars = { w, h, l: 0, t: 0, r: w, b: h, hc: w / 2, vc: h / 2, ss, ls, wd2: w / 2, hd2: h / 2, cd2: 10800000, cd4: 5400000, cd8: 2700000, '3cd4': 16200000, '3cd8': 8100000, '5cd8': 13500000, '7cd8': 18900000 };
  for (const d of [3, 4, 5, 6, 8, 10, 12, 16, 32]) { v[`wd${d}`] = w / d; v[`hd${d}`] = h / d; v[`ssd${d}`] = ss / d; }
  v.ssd2 = ss / 2;
  return v;
};

const RAD = Math.PI / 10800000;
const evalFmla = (f: string, v: Vars): number => {
  const p = f.trim().split(/\s+/);
  const a = (i: number) => { const t = p[i]; if (t === undefined) return 0; const n = Number(t); return Number.isFinite(n) ? n : v[t] ?? 0; };
  switch (p[0]) {
    case '*/': return a(3) ? (a(1) * a(2)) / a(3) : 0;
    case '+-': return a(1) + a(2) - a(3);
    case '+/': return a(3) ? (a(1) + a(2)) / a(3) : 0;
    case '?:': return a(1) > 0 ? a(2) : a(3);
    case 'abs': return Math.abs(a(1));
    case 'at2': return Math.atan2(a(2), a(1)) / RAD;
    case 'cat2': return a(1) * Math.cos(Math.atan2(a(3), a(2)));
    case 'sat2': return a(1) * Math.sin(Math.atan2(a(3), a(2)));
    case 'cos': return a(1) * Math.cos(a(2) * RAD);
    case 'sin': return a(1) * Math.sin(a(2) * RAD);
    case 'tan': return a(1) * Math.tan(a(2) * RAD);
    case 'max': return Math.max(a(1), a(2));
    case 'min': return Math.min(a(1), a(2));
    case 'mod': return Math.sqrt(a(1) ** 2 + a(2) ** 2 + a(3) ** 2);
    case 'pin': return a(2) < a(1) ? a(1) : a(2) > a(3) ? a(3) : a(2);
    case 'sqrt': return Math.sqrt(Math.max(0, a(1)));
    case 'val': return a(1);
    default: return 0;
  }
};

const f2 = (n: number): string => (Math.round(n * 100) / 100).toString();

/** Reads a:custGeom into path data. Shape size in EMU is used for guides when the path has no own size. */
export const readCustGeom = (cg: XNode, wEmu: number, hEmu: number, adj: Record<string, number> = {}): { d: string; w: number; h: number; fill?: boolean; stroke?: boolean }[] => {
  const vars = builtins(wEmu, hEmu);
  for (const g of kids(kid(cg, 'avLst'), 'gd')) { const f = attr(g, 'fmla'); const n = attr(g, 'name'); if (n && f) vars[n] = adj[n] ?? evalFmla(f, vars); }
  let guard = 0;
  for (const g of kids(kid(cg, 'gdLst'), 'gd')) { if (++guard > 2000) break; const f = attr(g, 'fmla'); const n = attr(g, 'name'); if (n && f) vars[n] = evalFmla(f, vars); }
  const val = (n: XNode | undefined, k: string): number => { const t = attr(n, k); if (t === undefined) return 0; const x = Number(t); return Number.isFinite(x) ? x : vars[t] ?? 0; };
  const out: { d: string; w: number; h: number; fill?: boolean; stroke?: boolean }[] = [];
  let count = 0;
  for (const path of kids(kid(cg, 'pathLst'), 'path')) {
    const w = numAttr(path, 'w') ?? wEmu, h = numAttr(path, 'h') ?? hEmu;
    let d = '';
    let cx = 0, cy = 0, sx = 0, sy = 0;
    for (const c of path.children) {
      if (++count > 200000) break;
      const pts = kids(c, 'pt');
      if (c.name === 'moveTo' && pts[0]) { cx = sx = val(pts[0], 'x'); cy = sy = val(pts[0], 'y'); d += `M${f2(cx)} ${f2(cy)}`; }
      else if (c.name === 'lnTo' && pts[0]) { cx = val(pts[0], 'x'); cy = val(pts[0], 'y'); d += `L${f2(cx)} ${f2(cy)}`; }
      else if (c.name === 'cubicBezTo' && pts.length >= 3) {
        d += 'C' + pts.slice(0, 3).map((p) => `${f2(val(p, 'x'))} ${f2(val(p, 'y'))}`).join(' ');
        cx = val(pts[2], 'x'); cy = val(pts[2], 'y');
      } else if (c.name === 'quadBezTo' && pts.length >= 2) {
        d += 'Q' + pts.slice(0, 2).map((p) => `${f2(val(p, 'x'))} ${f2(val(p, 'y'))}`).join(' ');
        cx = val(pts[1], 'x'); cy = val(pts[1], 'y');
      } else if (c.name === 'arcTo') {
        const wR = val(c, 'wR'), hR = val(c, 'hR'), st = val(c, 'stAng') * RAD, sw = val(c, 'swAng') * RAD;
        // Centre of the ellipse the arc starts on; angles are on the ellipse's parametric circle.
        const ox = cx - wR * Math.cos(st), oy = cy - hR * Math.sin(st);
        const ex = ox + wR * Math.cos(st + sw), ey = oy + hR * Math.sin(st + sw);
        if (Math.abs(sw) >= Math.PI * 2 - 1e-6) {
          const mx = ox + wR * Math.cos(st + Math.PI), my = oy + hR * Math.sin(st + Math.PI);
          d += `A${f2(wR)} ${f2(hR)} 0 0 ${sw > 0 ? 1 : 0} ${f2(mx)} ${f2(my)}A${f2(wR)} ${f2(hR)} 0 0 ${sw > 0 ? 1 : 0} ${f2(ex)} ${f2(ey)}`;
        } else d += `A${f2(wR)} ${f2(hR)} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${f2(ex)} ${f2(ey)}`;
        cx = ex; cy = ey;
      } else if (c.name === 'close') { d += 'Z'; cx = sx; cy = sy; }
    }
    if (d) out.push({ d, w: w || 1, h: h || 1, ...(attr(path, 'fill') === 'none' ? { fill: false } : {}), ...(attr(path, 'stroke') === '0' || attr(path, 'stroke') === 'false' ? { stroke: false } : {}) });
  }
  return out;
};

// ---------- Writing ----------

type Seg = { c: 'M' | 'L' | 'C' | 'Q' | 'Z'; p: number[] };

/** Converts an SVG arc to cubic Bezier segments (endpoint parameterisation, SVG 1.1 F.6.5). */
const arcToBeziers = (x1: number, y1: number, rx: number, ry: number, phi: number, fa: number, fs: number, x2: number, y2: number): number[][] => {
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const sin = Math.sin((phi * Math.PI) / 180), cos = Math.cos((phi * Math.PI) / 180);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / (den || 1)));
  const cxp = (k * rx * y1p) / ry, cyp = (-k * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= Math.PI * 2; else if (fs && dt < 0) dt += Math.PI * 2;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / n, al = (4 / 3) * Math.tan(step / 4);
  const out: number[][] = [];
  const pt = (t: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const dpt = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step, b = a + step;
    const [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = dpt(a), [dbx, dby] = dpt(b);
    out.push([ax + al * dax, ay + al * day, bx - al * dbx, by - al * dby, bx, by]);
  }
  return out;
};

/** Parses SVG path data (absolute and relative M L H V C S Q T A Z) to absolute M/L/C/Q/Z segments. */
export const parseSvgPath = (d: string): Seg[] => {
  const tok = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Seg[] = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lq = false, lc = false;
  const n = () => { const v = Number(tok[i++]); return Number.isFinite(v) ? v : 0; };
  const isNum = () => i < tok.length && !/^[a-zA-Z]$/.test(tok[i]!);
  let guard = 0;
  while (i < tok.length && guard++ < 1_000_000) {
    if (/^[a-zA-Z]$/.test(tok[i]!)) cmd = tok[i++]!;
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { out.push({ c: 'Z', p: [] }); x = sx; y = sy; lq = lc = false; if (isNum()) cmd = 'L'; continue; }
    if (!isNum()) continue;
    switch (C) {
      case 'M': x = ox + n(); y = oy + n(); sx = x; sy = y; out.push({ c: 'M', p: [x, y] }); cmd = rel ? 'l' : 'L'; lq = lc = false; break;
      case 'L': x = ox + n(); y = oy + n(); out.push({ c: 'L', p: [x, y] }); lq = lc = false; break;
      case 'H': x = ox + n(); out.push({ c: 'L', p: [x, y] }); lq = lc = false; break;
      case 'V': y = oy + n(); out.push({ c: 'L', p: [x, y] }); lq = lc = false; break;
      case 'C': { const p = [ox + n(), oy + n(), ox + n(), oy + n(), ox + n(), oy + n()]; out.push({ c: 'C', p }); lcx = p[2]!; lcy = p[3]!; x = p[4]!; y = p[5]!; lc = true; lq = false; break; }
      case 'S': { const c1x = lc ? 2 * x - lcx : x, c1y = lc ? 2 * y - lcy : y; const p = [c1x, c1y, ox + n(), oy + n(), ox + n(), oy + n()]; out.push({ c: 'C', p }); lcx = p[2]!; lcy = p[3]!; x = p[4]!; y = p[5]!; lc = true; lq = false; break; }
      case 'Q': { const p = [ox + n(), oy + n(), ox + n(), oy + n()]; out.push({ c: 'Q', p }); lcx = p[0]!; lcy = p[1]!; x = p[2]!; y = p[3]!; lq = true; lc = false; break; }
      case 'T': { const c1x = lq ? 2 * x - lcx : x, c1y = lq ? 2 * y - lcy : y; const p = [c1x, c1y, ox + n(), oy + n()]; out.push({ c: 'Q', p }); lcx = c1x; lcy = c1y; x = p[2]!; y = p[3]!; lq = true; lc = false; break; }
      case 'A': {
        const rx = n(), ry = n(), phi = n(), fa = n(), fs = n(), ex = ox + n(), ey = oy + n();
        for (const b of arcToBeziers(x, y, rx, ry, phi, fa, fs, ex, ey)) out.push({ c: 'C', p: b });
        x = ex; y = ey; lq = lc = false;
        break;
      }
      default: i++;
    }
  }
  return out;
};

/** a:custGeom for our path list, sized to the shape (EMU). */
export const custGeomXml = (paths: { d: string; w: number; h: number }[], fills?: (boolean | undefined)[]): string => {
  const list = paths.map((p, idx) => {
    const segs = parseSvgPath(p.d);
    const W = Math.max(1, Math.round(p.w * 100)), H = Math.max(1, Math.round(p.h * 100));
    const k = (v: number) => Math.round(v * 100);
    const pt = (a: number, b: number) => `<a:pt x="${k(a)}" y="${k(b)}"/>`;
    const body = segs.map((s) => {
      switch (s.c) {
        case 'M': return `<a:moveTo>${pt(s.p[0]!, s.p[1]!)}</a:moveTo>`;
        case 'L': return `<a:lnTo>${pt(s.p[0]!, s.p[1]!)}</a:lnTo>`;
        case 'C': return `<a:cubicBezTo>${pt(s.p[0]!, s.p[1]!)}${pt(s.p[2]!, s.p[3]!)}${pt(s.p[4]!, s.p[5]!)}</a:cubicBezTo>`;
        case 'Q': return `<a:quadBezTo>${pt(s.p[0]!, s.p[1]!)}${pt(s.p[2]!, s.p[3]!)}</a:quadBezTo>`;
        default: return '<a:close/>';
      }
    }).join('');
    return `<a:path w="${W}" h="${H}"${fills?.[idx] === false ? ' fill="none"' : ''}>${body}</a:path>`;
  }).join('');
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>${list}</a:pathLst></a:custGeom>`;
};
