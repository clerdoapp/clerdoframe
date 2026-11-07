import { registerKind, SlideView } from '../../render/SlideView';
import type { Deck, Shape, Slide, Zoom } from '../../model/deck';

const targetSlide = (deck: Deck, z: Zoom): Slide | undefined => {
  if (z.targetKind === 'slide') return deck.slides.find((s) => s.id === z.target);
  const sec = deck.sections.find((s) => s.id === z.target);
  return sec ? deck.slides.find((s) => s.id === sec.first) : undefined;
};

/** The target slide with its own zooms flattened to plain frames, so previews never nest. */
const flat = new WeakMap<Slide, Slide>();
const flattened = (slide: Slide): Slide => {
  let f = flat.get(slide);
  if (!f) {
    const swap = (list: Shape[]): Shape[] => list.map((x) => (x.kind === 'zoom' ? { ...x, kind: 'zoomStub' } as unknown as Shape : x.kind === 'group' ? { ...x, children: swap(x.children) } : x));
    f = { ...slide, shapes: swap(slide.shapes) };
    flat.set(slide, f);
  }
  return f;
};

const frame = (w: number, h: number) => <rect width={w} height={h} fill="none" stroke="#c4c8cf" strokeWidth={1} vectorEffect="non-scaling-stroke" />;

export const registerZoomKind = (): void => {
  registerKind('zoomStub', (s) => <><rect width={s.w} height={s.h} fill="#eceef1" />{frame(s.w, s.h)}</>);
  registerKind('zoom', (s, ctx) => {
    if (s.kind !== 'zoom') return null;
    const slide = targetSlide(ctx.deck, s);
    if (!slide) {
      return (
        <>
          <rect width={s.w} height={s.h} fill="#f1f2f4" />
          <text x={s.w / 2} y={s.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(10, s.h / 9)} fill="#7a7f8a" fontFamily="sans-serif">Slide not found</text>
          {frame(s.w, s.h)}
        </>
      );
    }
    return (
      <>
        <foreignObject width={s.w} height={s.h}>
          <div style={{ width: s.w, height: s.h, overflow: 'hidden' }}>
            <SlideView deck={ctx.deck} slide={flattened(slide)} slideNumber={ctx.deck.slides.indexOf(slide) + 1} style={{ width: s.w, height: s.h }} />
          </div>
        </foreignObject>
        {frame(s.w, s.h)}
      </>
    );
  });
};
