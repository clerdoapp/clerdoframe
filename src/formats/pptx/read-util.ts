import { attr, type XNode } from '../xml';

/** '#RRGGBB' from a container with an srgbClr child (used where no theme context exists). */
export const colorXmlToHex = (n: XNode | undefined): string | undefined => {
  const c = n?.children.find((x) => x.name === 'srgbClr');
  const v = attr(c, 'val');
  return v && /^[0-9a-f]{6}$/i.test(v) ? `#${v.toUpperCase()}` : undefined;
};
