/** Converts simple SVG elements (as used by the icon library) into path data. */

const n = (el: Element, a: string): number => parseFloat(el.getAttribute(a) ?? '0') || 0;
const f = (v: number) => Math.round(v * 1000) / 1000;

export const elementToPath = (el: Element): string | null => {
  switch (el.tagName.toLowerCase()) {
    case 'path': return el.getAttribute('d');
    case 'line': return `M${f(n(el, 'x1'))} ${f(n(el, 'y1'))}L${f(n(el, 'x2'))} ${f(n(el, 'y2'))}`;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (pts.length < 4) return null;
      let d = '';
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${f(pts[i]!)} ${f(pts[i + 1]!)}`;
      return el.tagName.toLowerCase() === 'polygon' ? `${d}Z` : d;
    }
    case 'circle': case 'ellipse': {
      const cx = n(el, 'cx'), cy = n(el, 'cy');
      const rx = el.tagName.toLowerCase() === 'circle' ? n(el, 'r') : n(el, 'rx');
      const ry = el.tagName.toLowerCase() === 'circle' ? rx : n(el, 'ry');
      if (!rx || !ry) return null;
      return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
    }
    case 'rect': {
      const x = n(el, 'x'), y = n(el, 'y'), w = n(el, 'width'), h = n(el, 'height');
      let rx = el.hasAttribute('rx') ? n(el, 'rx') : n(el, 'ry');
      let ry = el.hasAttribute('ry') ? n(el, 'ry') : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx || !ry) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
      return `M${f(x + rx)} ${f(y)}H${f(x + w - rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w)} ${f(y + ry)}V${f(y + h - ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w - rx)} ${f(y + h)}H${f(x + rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x)} ${f(y + h - ry)}V${f(y + ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + rx)} ${f(y)}Z`;
    }
    default: return null;
  }
};

/**
 * Turns relative path commands into absolute ones, so the renderer's scalePath (which only
 * understands absolute commands) can resize the shape.
 */
export const absolutize = (d: string): string => {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: string[] = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  const num = () => parseFloat(tokens[i++]!);
  const isNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) cmd = tokens[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { out.push('Z'); x = sx; y = sy; if (!isNum()) continue; }
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (C) {
      case 'M': { x = ox + num(); y = oy + num(); sx = x; sy = y; out.push(`M${f(x)} ${f(y)}`); cmd = rel ? 'l' : 'L'; break; }
      case 'L': { x = ox + num(); y = oy + num(); out.push(`L${f(x)} ${f(y)}`); break; }
      case 'H': { x = (rel ? x : 0) + num(); out.push(`L${f(x)} ${f(y)}`); break; }
      case 'V': { y = (rel ? y : 0) + num(); out.push(`L${f(x)} ${f(y)}`); break; }
      case 'C': { const a = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]; x = a[4]!; y = a[5]!; out.push(`C${a.map(f).join(' ')}`); break; }
      case 'S': { const a = [ox + num(), oy + num(), ox + num(), oy + num()]; x = a[2]!; y = a[3]!; out.push(`S${a.map(f).join(' ')}`); break; }
      case 'Q': { const a = [ox + num(), oy + num(), ox + num(), oy + num()]; x = a[2]!; y = a[3]!; out.push(`Q${a.map(f).join(' ')}`); break; }
      case 'T': { x = ox + num(); y = oy + num(); out.push(`T${f(x)} ${f(y)}`); break; }
      case 'A': {
        const rx = num(), ry = num(), rot = num();
        // Flags may be packed together ("011") in minified data.
        let fl = tokens[i]!;
        let large: number, sweep: number;
        if (/^[01]{2,}/.test(fl)) { large = +fl[0]!; sweep = +fl[1]!; const rest = fl.slice(2); if (rest) tokens[i] = rest; else i++; }
        else { large = num(); fl = tokens[i]!; if (/^[01]{2,}/.test(fl)) { sweep = +fl[0]!; tokens[i] = fl.slice(1); } else sweep = num(); }
        x = ox + num(); y = oy + num();
        out.push(`A${f(rx)} ${f(ry)} ${f(rot)} ${large} ${sweep} ${f(x)} ${f(y)}`);
        break;
      }
      default: i++;
    }
  }
  return out.join('');
};

/** All drawable children of an SVG as absolute path data, joined. */
export const svgToPath = (svg: SVGSVGElement): string => {
  const parts: string[] = [];
  svg.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect').forEach((el) => { const d = elementToPath(el); if (d) parts.push(absolutize(d)); });
  return parts.join('');
};
