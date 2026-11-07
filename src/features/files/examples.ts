// Example decks shipped in the repo (examples/*.pptx) and offered under New.
import { uid, type Animation, type Deck, type Picture, type Shape, type Slide } from '../../model/deck';
import { addSlide, bullets, chart, rect, shape, solid, T, table, text } from './build';
import { DESIGNS, templateDeck } from './templates';

const design = (name: string) => DESIGNS.find((d) => d.name === name) ?? DESIGNS[0]!;

const anim = (shapeId: string, effect: string, trigger: Animation['trigger'], extra: Partial<Animation> = {}): Animation =>
  ({ id: uid('a'), shape: shapeId, cls: 'entr', effect, trigger, duration: 0.5, delay: 0, ...extra });

const fresh = (name: string): Deck => { const d = templateDeck(design(name)); d.slides = []; return d; };

const card = (x: number, y: number, w: number, h: number, head: string, body: string, accent: Parameters<typeof T>[0]): Shape[] => [
  shape('roundRect', `${head} card`, x, y, w, h, solid(T('bg2')), { adj: { adj: 8000 } }),
  rect(`${head} mark`, x + 24, y + 24, 44, 6, solid(T(accent))),
  text(`${head} title`, x + 16, y + 40, w - 32, 44, head, { size: 22, bold: true, color: T('tx1') }),
  text(`${head} text`, x + 16, y + 86, w - 32, h - 100, body, { size: 15, color: T('tx1', 0.25) }),
];

export const welcomeDeck = (): Deck => {
  const d = fresh('Ember');
  d.props = { title: 'Welcome to ClerdoFrame', author: 'Clerdo', subject: 'A short tour' };
  addSlide(d, 'title', { title: 'Welcome to ClerdoFrame', sub: 'A free presentation app. Here is a short tour.' }, [], 'Press F5 or Present to play this deck.');
  const s2 = addSlide(d, 'titleOnly', { title: 'What you can do' }, [
    ...card(88, 200, 340, 260, 'Design', 'Themes, layouts, shapes, pictures and text that recolour with the theme.', 'accent1'),
    ...card(470, 200, 340, 260, 'Animate', 'Transitions between slides and effects on shapes, timed or on click.', 'accent2'),
    ...card(852, 200, 340, 260, 'Present', 'Presenter view with notes, a timer and a pen. Opens and saves .pptx.', 'accent3'),
  ]);
  const cards = s2.shapes.filter((s) => s.name.endsWith(' card'));
  s2.animations = cards.map((c, i) => anim(c.id, 'floatIn', i === 0 ? 'click' : 'after', { option: 'u', duration: 0.6 }));
  s2.transition = { name: 'push', option: 'u', duration: 0.6 };
  addSlide(d, 'obj', { title: 'Getting started', body: 'Open the File tab to start from a template\nAdd slides with New slide (Ctrl+M or Cmd+M)\nInsert pictures, charts, tables and diagrams\n\tEverything is a theme colour, so it recolours\nSave as .pptx to share with other apps' }).transition = { name: 'fade', duration: 0.5 };
  addSlide(d, 'titleOnly', { title: 'Charts that stay editable' }, [
    chart('Usage chart', 120, 190, 1040, 440, 'col', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], [
      { name: 'Slides made', values: [12, 18, 15, 22, 27], color: T('accent1') },
      { name: 'Slides shown', values: [8, 14, 13, 19, 24], color: T('accent2') },
    ], { title: 'This week' }),
  ]).transition = { name: 'wipe', option: 'r', duration: 0.7 };
  addSlide(d, 'secHead', { title: 'Thank you', body: 'clerdo.app' }).transition = { name: 'zoom', option: 'in', duration: 0.8 };
  return d;
};

export const pitchDeck = (): Deck => {
  const d = fresh('Midnight');
  d.props = { title: 'Pitch deck', author: 'Clerdo' };
  addSlide(d, 'title', { title: 'Northwind Labs', sub: 'Faster checkout for small shops' });
  addSlide(d, 'obj', { title: 'The problem', body: 'Small shops lose a third of carts at checkout\nPayment pages are slow on phones\nOwners have no time to tune them' });
  addSlide(d, 'twoObj', { title: 'Our answer', body: 'One-tap checkout\nWorks on any site\nSet up in ten minutes', body2: 'Fewer drop-offs\nClear daily reports\nFair flat pricing' });
  addSlide(d, 'titleOnly', { title: 'Traction' }, [
    chart('Revenue', 100, 180, 680, 450, 'line', ['Q1', 'Q2', 'Q3', 'Q4'], [{ name: 'Monthly revenue (k)', values: [12, 21, 37, 58], color: T('accent2'), smooth: true }], { title: 'Revenue', legend: 'none', dataLabels: true }),
    text('Stat 1', 820, 220, 360, 80, '4.8x', { size: 54, bold: true, color: T('accent1') }),
    text('Stat 1 label', 820, 300, 360, 40, 'growth this year', { size: 18, color: T('tx1', 0.3) }),
    text('Stat 2', 820, 380, 360, 80, '1,200', { size: 54, bold: true, color: T('accent2') }),
    text('Stat 2 label', 820, 460, 360, 40, 'shops live', { size: 18, color: T('tx1', 0.3) }),
  ]);
  addSlide(d, 'titleOnly', { title: 'Market' }, [
    chart('Market', 340, 170, 600, 470, 'doughnut', ['Ready now', 'Next year', 'Later'], [{ name: 'Shops', values: [35, 40, 25] }], { title: 'Small shops online', holeSize: 55, dataLabels: true, legend: 'r' }),
  ]);
  addSlide(d, 'obj', { title: 'The ask', body: 'Raising 2 million\n\t18 months of runway\n\tFive new hires\nLaunch in two more countries' });
  addSlide(d, 'secHead', { title: 'Thank you', body: 'hello@northwind.example' });
  for (const s of d.slides) s.transition = { name: 'fade', duration: 0.6 };
  return d;
};

export const lessonDeck = (): Deck => {
  const d = fresh('Meadow');
  d.props = { title: 'The water cycle', author: 'Clerdo', subject: 'A short lesson' };
  addSlide(d, 'title', { title: 'The water cycle', sub: 'How water moves around our planet' });
  addSlide(d, 'obj', { title: 'Today we will learn', body: 'The four stages of the water cycle\nWhere the energy comes from\nWhy it matters for weather' });
  const stage = (i: number, label: string, desc: string, color: Parameters<typeof T>[0]): Shape[] => {
    const x = 90 + i * 280;
    return [
      shape('ellipse', `${label} dot`, x + 70, 210, 120, 120, solid(T(color)), { text: { paras: [{ runs: [{ text: String(i + 1), style: { size: 40, bold: true, color: T('bg1') } }], style: { align: 'ctr' } }], vAlign: 'ctr' } }),
      text(`${label} name`, x, 350, 260, 44, [{ runs: [{ text: label, style: { size: 24, bold: true, color: T('tx1') } }], style: { align: 'ctr' } }]),
      text(`${label} desc`, x, 398, 260, 120, [{ runs: [{ text: desc, style: { size: 16, color: T('tx1', 0.3) } }], style: { align: 'ctr' } }]),
    ];
  };
  const s = addSlide(d, 'titleOnly', { title: 'Four stages' }, [
    ...stage(0, 'Evaporation', 'The sun warms water and it rises as vapour.', 'accent1'),
    ...stage(1, 'Condensation', 'Vapour cools and forms clouds.', 'accent4'),
    ...stage(2, 'Precipitation', 'Water falls as rain, snow or hail.', 'accent2'),
    ...stage(3, 'Collection', 'Water gathers in rivers, lakes and seas.', 'accent3'),
  ]);
  s.animations = s.shapes.filter((x) => x.name.endsWith(' dot')).map((x, i) => anim(x.id, 'zoom', i ? 'click' : 'click', { option: 'obj' }));
  addSlide(d, 'twoTxTwoObj', { title: 'Check your understanding' });
  const q = d.slides.at(-1)!;
  q.shapes = q.shapes.filter((x) => !x.ph || x.ph.type === 'title');
  q.shapes.push(text('Question', 120, 200, 1040, 60, 'What makes water evaporate?', { size: 28, bold: true, color: T('tx1') }),
    ...['The sun\'s heat', 'The moon', 'Strong wind only'].map((a, i) => shape('roundRect', `Answer ${i + 1}`, 120, 290 + i * 100, 640, 76, solid(T('bg1')), { line: { fill: solid(T('accent1')), width: 1.5 }, text: { paras: [{ runs: [{ text: `${String.fromCharCode(65 + i)}.  ${a}`, style: { size: 22, color: T('tx1') } }] }], vAlign: 'ctr', inset: { l: 24, t: 4, r: 24, b: 4 } } })));
  q.notes = { paras: [{ runs: [{ text: 'Answer: A. Ask the class why B and C are wrong.' }] }] };
  addSlide(d, 'secHead', { title: 'Well done', body: 'Next time: clouds and weather' });
  return d;
};

export const reportDeck = (): Deck => {
  const d = fresh('Ledger');
  d.props = { title: 'Quarterly report', author: 'Clerdo', category: 'Report' };
  addSlide(d, 'title', { title: 'Quarterly report', sub: 'Third quarter at a glance' });
  addSlide(d, 'obj', { title: 'Summary', body: 'Revenue up 14% on last quarter\nCosts held flat\nTwo new regions opened\nCustomer rating at an all-time high' });
  addSlide(d, 'titleOnly', { title: 'Revenue by region' }, [
    chart('Regions', 88, 110, 1104, 540, 'bar', ['North', 'South', 'East', 'West'], [
      { name: 'Q2', values: [3.1, 2.4, 1.8, 2.9], color: T('accent3') },
      { name: 'Q3', values: [3.6, 2.7, 2.3, 3.2], color: T('accent2') },
    ], { axes: { xTitle: 'Millions', gridlines: true }, dataLabels: true }),
  ]);
  addSlide(d, 'titleOnly', { title: 'Key numbers' }, [
    table('Numbers', 88, 140, 1104, [['Measure', 'Q2', 'Q3', 'Change'], ['Revenue', '10.2 m', '11.8 m', '+14%'], ['Costs', '7.4 m', '7.4 m', '0%'], ['New customers', '1,850', '2,240', '+21%'], ['Rating', '4.5', '4.7', '+0.2']], T('tx2')),
  ]);
  addSlide(d, 'twoObj', { title: 'Next quarter', body: 'Grow\n\tOpen the coastal region\n\tHire two account leads', body2: 'Improve\n\tFaster support replies\n\tNew onboarding guide' });
  return d;
};

const PHOTOS: [string, string][] = [['#2E86AB', '#F6F5AE'], ['#E4572E', '#FFC914'], ['#3E8E41', '#A4C639'], ['#6A4C93', '#F7B267'], ['#1C6EA4', '#2AB3A6'], ['#B5523B', '#F3ECE1']];

/** Small generated landscape pictures (SVG) so the album ships without photos from anywhere else. */
const scene = (a: string, b: string, n: number): Uint8Array => new TextEncoder().encode(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>`
  + `<rect width="800" height="600" fill="url(#s)"/><circle cx="${560 + n * 20}" cy="${150 + n * 10}" r="70" fill="#ffffff" opacity=".85"/>`
  + `<path d="M0 420 L${180 + n * 30} ${250 - n * 8} L${360 + n * 10} 400 L${540 - n * 20} ${220 + n * 6} L800 410 L800 600 L0 600 Z" fill="${a}"/>`
  + `<path d="M0 480 Q200 ${430 - n * 4} 400 480 T800 470 L800 600 L0 600 Z" fill="${a}" opacity=".6"/></svg>`);

export const albumDeck = (): Deck => {
  const d = fresh('Paper');
  d.props = { title: 'Photo album', author: 'Clerdo' };
  addSlide(d, 'title', { title: 'Summer album', sub: 'Places we went' });
  const pics = PHOTOS.map(([a, b], i) => {
    const id = `album${i + 1}`;
    d.media[id] = { id, type: 'image/svg+xml', name: `scene${i + 1}.svg`, data: scene(a, b, i) };
    return id;
  });
  const pic = (media: string, x: number, y: number, w: number, h: number, name: string): Picture =>
    ({ id: uid('s'), kind: 'picture', name, media, x, y, w, h, alt: `${name}, a drawn landscape`, line: { fill: solid(T('bg1')), width: 6 }, effects: { shadow: { kind: 'outer', color: '#000000', blur: 14, dist: 4, angle: 90, alpha: 0.3 } } });
  const captions = ['Mountains', 'Coast', 'Fields', 'Dusk', 'Lake', 'Home'];
  for (let p = 0; p < 3; p++) {
    const a = pics[p * 2]!, b = pics[p * 2 + 1]!;
    const s = addSlide(d, 'blank', {}, [
      pic(a, 110, 120, 500, 375, captions[p * 2]!), pic(b, 670, 160, 500, 375, captions[p * 2 + 1]!),
      text('Caption 1', 110, 515, 500, 40, [{ runs: [{ text: captions[p * 2]!, style: { size: 20, italic: true, color: T('tx1', 0.3) } }], style: { align: 'ctr' } }]),
      text('Caption 2', 670, 555, 500, 40, [{ runs: [{ text: captions[p * 2 + 1]!, style: { size: 20, italic: true, color: T('tx1', 0.3) } }], style: { align: 'ctr' } }]),
    ]);
    s.transition = { name: 'fade', duration: 1, advanceAfter: 4 };
  }
  return d;
};

export const timelineDeck = (): Deck => {
  const d = fresh('Harbor');
  d.props = { title: 'Project timeline', author: 'Clerdo' };
  addSlide(d, 'title', { title: 'Project timeline', sub: 'From idea to launch' });
  const steps: [string, string, string][] = [['Jan', 'Research', 'Talk to users'], ['Mar', 'Design', 'Sketch and test'], ['Jun', 'Build', 'First version'], ['Sep', 'Beta', 'Invite testers'], ['Nov', 'Launch', 'Open to all']];
  const shapes: Shape[] = [rect('Line', 120, 380, 1040, 6, solid(T('accent1', 0.4)))];
  steps.forEach(([m, h, b], i) => {
    const x = 120 + i * 260;
    const up = i % 2 === 0;
    shapes.push(
      shape('ellipse', `${h} point`, x - 18, 365, 36, 36, solid(T(i === steps.length - 1 ? 'accent2' : 'accent1')), { line: { fill: solid(T('bg1')), width: 4 } }),
      text(`${h} month`, x - 70, up ? 300 : 420, 140, 40, [{ runs: [{ text: m, style: { size: 18, bold: true, color: T('accent1') } }], style: { align: 'ctr' } }]),
      shape('roundRect', `${h} box`, x - 110, up ? 170 : 480, 220, 110, solid(T('bg2')), { adj: { adj: 10000 }, text: { paras: [{ runs: [{ text: h, style: { size: 20, bold: true, color: T('tx1') } }], style: { align: 'ctr' } }, { runs: [{ text: b, style: { size: 15, color: T('tx1', 0.3) } }], style: { align: 'ctr' } }], vAlign: 'ctr' } }),
    );
  });
  const s = addSlide(d, 'titleOnly', { title: 'This year' }, shapes);
  s.animations = s.shapes.filter((x) => x.name.endsWith(' box')).map((x, i) => anim(x.id, 'wipe', i ? 'after' : 'click', { option: x.y < 300 ? 'b' : 't', duration: 0.4 }));
  addSlide(d, 'obj', { title: 'Risks', body: bullets(['Beta feedback may need more time', 'Hiring for the build phase', '\tPlan: start interviews in February']) });
  addSlide(d, 'secHead', { title: 'Questions', body: 'Thank you' });
  return d;
};

export const EXAMPLES: { id: string; name: string; build: () => Deck }[] = [
  { id: 'welcome', name: 'Welcome tour', build: welcomeDeck },
  { id: 'pitch', name: 'Pitch deck', build: pitchDeck },
  { id: 'lesson', name: 'Lesson', build: lessonDeck },
  { id: 'report', name: 'Report', build: reportDeck },
  { id: 'album', name: 'Photo album', build: albumDeck },
  { id: 'timeline', name: 'Timeline', build: timelineDeck },
];

export type { Slide };
