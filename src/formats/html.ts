// Web pages made from a deck:
// - publishHtml: one self-contained HTML file that plays the slides in any browser, offline
//   (slides pre-drawn as SVG, media and fonts inlined, a small player script).
// - accessibleDoc / accessibleHtml: the deck as plain, structured HTML for screen readers.
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { textOf, type Deck, type Paragraph, type Shape, type Slide, type TextBody } from '../model/deck';
import { mediaUrl } from '../render/paint';
import { SlideView } from '../render/SlideView';

export interface PublishOptions {
  /** Seconds between slides; 0 = advance by click only. */
  interval: number;
  loop: boolean;
  /** Start auto-advancing as soon as the page opens. */
  autoStart: boolean;
  controls: boolean;
  /** Size of the embed frame, px. */
  width: number;
  height: number;
  /** 1-based slide to open on. */
  start: number;
  /** Include hidden slides. */
  hidden?: boolean;
}

export const defaultPublish = (deck: Deck): PublishOptions => ({ interval: 0, loop: false, autoStart: false, controls: true, width: 960, height: Math.round((960 * deck.h) / deck.w), start: 1 });

const b64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

export const escHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON that is safe inside a <script> element. */
const scriptJson = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);

export const deckTitle = (deck: Deck): string => {
  if (deck.props.title) return deck.props.title;
  for (const s of deck.slides) { const t = slideTitle(s); if (t) return t; }
  return 'Presentation';
};

export const slideTitle = (s: Slide): string => {
  const t = s.shapes.find((x) => x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle'));
  return t?.kind === 'shape' ? textOf(t.text).replace(/\s+/g, ' ').trim() : '';
};

/** Click step at which each shape first enters (0 = with the slide). Shapes not listed are always shown. */
export const entranceSteps = (s: Slide): { steps: number; at: Map<string, number> } => {
  const at = new Map<string, number>();
  let step = 0;
  for (const a of s.animations) {
    if (a.triggerShape) continue;
    if (a.trigger === 'click') step++;
    if (a.cls === 'entr' && !at.has(a.shape)) at.set(a.shape, step);
  }
  return { steps: step, at };
};

/** Gives every id in an SVG a prefix, so several slides can sit in one page. */
export const prefixIds = (svg: string, pre: string): string => {
  const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!));
  if (!ids.size) return svg;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(id="|#)(${[...ids].sort((a, b) => b.length - a.length).map(esc).join('|')})(?=["')\\s])`, 'g');
  return svg.replace(re, (_m, a: string, id: string) => `${a}${pre}${id}`);
};

const transitionOf = (s: Slide): { kind: 'none' | 'fade' | 'push'; dir: string; dur: number } => {
  const t = s.transition;
  if (!t || t.name === 'none') return { kind: 'none', dir: 'l', dur: 0 };
  const push = ['push', 'cover', 'uncover', 'reveal', 'pan', 'conveyor', 'gallery', 'wipe', 'split'].includes(t.name);
  const dir = (t.option ?? '').toLowerCase();
  return { kind: push ? 'push' : 'fade', dir: ['r', 'u', 'd'].includes(dir) ? dir : 'l', dur: Math.max(0.2, Math.min(2.5, t.duration || 0.6)) };
};

export interface PublishSlide { html: string; steps: number; tr: ReturnType<typeof transitionOf>; title: string }

/** Draws the deck's slides for the page; media becomes tokens filled in by the player. */
export const publishSlides = (deck: Deck, o: Pick<PublishOptions, 'hidden'> = {}): { slides: PublishSlide[]; media: Record<string, { type: string; data: string }> } => {
  const media: Record<string, { type: string; data: string }> = {};
  const urls = Object.keys(deck.media).map((id, k) => ({ id, k, url: mediaUrl(deck, id) }));
  const slides: PublishSlide[] = [];
  deck.slides.forEach((s, i) => {
    if (s.hidden && !o.hidden) return;
    const { steps, at } = entranceSteps(s);
    const decorate = (sh: Shape, node: ReactNode): ReactNode => {
      const k = at.get(sh.id);
      return k === undefined ? node : createElement('g', { className: 'cf-a', 'data-step': k }, node);
    };
    let svg = renderToStaticMarkup(createElement(SlideView, { deck, slide: s, mode: 'print', decorate, slideNumber: i + 1 }));
    for (const u of urls) {
      if (!u.url || !svg.includes(u.url)) continue;
      const tok = `cfm-${u.k}-x`;
      svg = svg.split(u.url).join(tok);
      if (!media[tok]) { const m = deck.media[u.id]!; media[tok] = { type: m.type, data: b64(m.data) }; }
    }
    svg = prefixIds(svg, `s${slides.length}_`);
    slides.push({ html: svg, steps, tr: transitionOf(s), title: slideTitle(s) || `Slide ${i + 1}` });
  });
  return { slides, media };
};

const PLAYER_CSS = `
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#111;overflow:hidden;font:14px system-ui,-apple-system,"Segoe UI",sans-serif;color:#eee}
#cf-root{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;touch-action:pan-y pinch-zoom;user-select:none;-webkit-user-select:none}
#cf-stage{position:relative;overflow:hidden;background:#000;box-shadow:0 8px 40px rgba(0,0,0,.5)}
.cf-slide{position:absolute;inset:0;visibility:hidden}.cf-slide.on,.cf-slide.out{visibility:visible}
.cf-slide>svg{width:100%;height:100%;display:block}
.cf-a{transition:opacity .45s ease}.cf-a.off{opacity:0}
#cf-bar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:4px;align-items:center;padding:4px;border-radius:12px;background:rgba(20,20,20,.75);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:opacity .3s;z-index:5}
#cf-bar.idle{opacity:0}#cf-bar:hover,#cf-bar:focus-within{opacity:1}
#cf-bar button{min-width:40px;height:40px;border:0;border-radius:9px;background:none;color:#f2f2f2;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
#cf-bar button:hover,#cf-bar button:focus-visible{background:rgba(255,255,255,.14);outline:none}
#cf-bar svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
#cf-count{min-width:64px;text-align:center;font-variant-numeric:tabular-nums}
.cf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
`;

const ICONS = {
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  full: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
};
const icon = (k: keyof typeof ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

/** The player: navigation, counter, full screen, auto-advance, transitions and entrance fades. */
const PLAYER_JS = `(function(){
var D=JSON.parse(document.getElementById('cf-data').textContent);var O=D.opts;var N=D.slides.length;
var urls={};for(var k in D.media){try{var bin=atob(D.media[k].data),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);urls[k]=URL.createObjectURL(new Blob([u],{type:D.media[k].type}));}catch(e){urls[k]='';}}
var stage=document.getElementById('cf-stage'),root=document.getElementById('cf-root'),count=document.getElementById('cf-count'),live=document.getElementById('cf-live');
var els=D.slides.map(function(s,i){var h=s.html;for(var k in urls)h=h.split(k).join(urls[k]);var d=document.createElement('div');d.className='cf-slide';d.setAttribute('role','group');d.setAttribute('aria-roledescription','slide');d.setAttribute('aria-label',(i+1)+' of '+N+': '+s.title);d.innerHTML=h;stage.appendChild(d);return d;});
function fit(){var k=Math.min(innerWidth/D.w,innerHeight/D.h);stage.style.width=Math.floor(D.w*k)+'px';stage.style.height=Math.floor(D.h*k)+'px';}
addEventListener('resize',fit);fit();
var cur=-1,step=0,timer=null,playing=false;
function apply(i,st){var a=els[i].querySelectorAll('.cf-a');for(var j=0;j<a.length;j++){var n=+a[j].getAttribute('data-step');a[j].classList.toggle('off',n>st);}}
function show(i,st,dir){
  if(i<0||i>=N)return;var prev=cur;cur=i;step=st;
  apply(i,st);var t=D.slides[i].tr,el=els[i];
  els.forEach(function(e,k){if(k!==i&&k!==prev){e.className='cf-slide';e.style.cssText='';}});
  el.className='cf-slide on';el.style.cssText='';
  if(prev>=0&&prev!==i){var pe=els[prev];
    if(t.kind==='none'||dir===0){pe.className='cf-slide';}
    else{var dur=t.dur+'s';pe.className='cf-slide out';
      if(t.kind==='fade'){el.style.opacity='0';el.style.zIndex='2';void el.offsetWidth;el.style.transition='opacity '+dur;el.style.opacity='1';}
      else{var dx=t.dir==='r'?-1:t.dir==='l'?1:0,dy=t.dir==='d'?-1:t.dir==='u'?1:0;if(dir<0){dx=-dx;dy=-dy;}
        el.style.transform='translate('+dx*100+'%,'+dy*100+'%)';void el.offsetWidth;el.style.transition=pe.style.transition='transform '+dur+' ease';
        el.style.transform='translate(0,0)';pe.style.transform='translate('+(-dx*100)+'%,'+(-dy*100)+'%)';}
      setTimeout(function(){if(cur!==prev)pe.className='cf-slide';pe.style.cssText='';},t.dur*1000+60);}
  }
  if(count)count.textContent=(i+1)+' / '+N;if(live)live.textContent='Slide '+(i+1)+' of '+N+': '+D.slides[i].title;
  try{history.replaceState(null,'','#'+(i+1));}catch(e){}
  schedule();
}
function next(){if(step<D.slides[cur].steps){step++;apply(cur,step);schedule();return;}if(cur<N-1)show(cur+1,0,1);else if(O.loop)show(0,0,1);else stop();}
function prev(){if(step>0){step--;apply(cur,step);return;}if(cur>0)show(cur-1,D.slides[cur-1].steps,-1);else if(O.loop)show(N-1,D.slides[N-1].steps,-1);}
function schedule(){clearTimeout(timer);if(!playing||!O.interval)return;var more=step<D.slides[cur].steps;timer=setTimeout(function(){if(!more&&cur===N-1&&!O.loop){stop();return;}next();},more?900:O.interval*1000+(step===0?(D.slides[cur].tr.dur||0)*1000:0));}
var pb=document.getElementById('cf-play');
function setPlay(v){playing=v;if(pb){pb.innerHTML=v?${JSON.stringify(icon('pause'))}:${JSON.stringify(icon('play'))};pb.setAttribute('aria-label',v?'Pause':'Play');pb.title=v?'Pause':'Play';}schedule();}
function stop(){setPlay(false);}
function full(){var d=document;if(d.fullscreenElement||d.webkitFullscreenElement){(d.exitFullscreen||d.webkitExitFullscreen).call(d);}else{var e=d.documentElement;var f=e.requestFullscreen||e.webkitRequestFullscreen;if(f)f.call(e);}}
document.addEventListener('keydown',function(e){if(e.metaKey||e.ctrlKey||e.altKey)return;var k=e.key;
  if(k==='ArrowRight'||k==='ArrowDown'||k===' '||k==='PageDown'||k==='Enter'||k==='n'){e.preventDefault();next();}
  else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'||k==='Backspace'||k==='p'){e.preventDefault();prev();}
  else if(k==='Home'){e.preventDefault();show(0,0,0);}else if(k==='End'){e.preventDefault();show(N-1,D.slides[N-1].steps,0);}
  else if(k==='f'||k==='F'){e.preventDefault();full();}else if((k==='s'||k==='S')&&O.interval){setPlay(!playing);}});
var sx=0,sy=0,st=0,touch=false;
root.addEventListener('pointerdown',function(e){sx=e.clientX;sy=e.clientY;st=Date.now();touch=e.pointerType!=='mouse';});
root.addEventListener('pointerup',function(e){if(e.target.closest&&e.target.closest('#cf-bar,a'))return;if(e.button>0)return;var dx=e.clientX-sx,dy=e.clientY-sy;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){if(dx<0)next();else prev();return;}
  if(Math.abs(dx)<12&&Math.abs(dy)<12&&Date.now()-st<800){if(touch&&e.clientX<innerWidth*0.3)prev();else next();}});
var bar=document.getElementById('cf-bar'),idle=null;function poke(){if(!bar)return;bar.classList.remove('idle');clearTimeout(idle);idle=setTimeout(function(){bar.classList.add('idle');},2500);}
addEventListener('pointermove',poke);poke();
function on(id,f){var b=document.getElementById(id);if(b)b.addEventListener('click',function(e){e.stopPropagation();f();});}
on('cf-prev',prev);on('cf-next',next);on('cf-full',full);on('cf-play',function(){setPlay(!playing);});
var h=parseInt((location.hash||'').slice(1),10);var start=h>=1&&h<=N?h-1:Math.max(0,Math.min(N-1,(O.start||1)-1));
playing=!!(O.interval&&O.autoStart);show(start,0,0);setPlay(playing);
window.cfPlayer={next:next,prev:prev,go:function(i){show(i,0,0);},state:function(){return {slide:cur,step:step,playing:playing};}};
})();`;

/** Keeps the @font-face rules of families the slides use. */
const usedFonts = (css: string, markup: string): string =>
  css.split(/(?=@font-face)/).filter((r) => { const fam = /font-family:\s*["']?([^"';]+?)["']?\s*;/.exec(r)?.[1]; return !!fam && markup.includes(fam); }).join('\n');

/** One HTML file that plays the deck. fontCss: @font-face rules with inlined fonts. */
export const publishHtml = (deck: Deck, o: PublishOptions, fontCss = ''): string => {
  const { slides, media } = publishSlides(deck, o);
  fontCss = usedFonts(fontCss, slides.map((s) => s.html).join(''));
  const title = escHtml(deckTitle(deck));
  const data = { w: deck.w, h: deck.h, slides, media, opts: { interval: Math.max(0, o.interval), loop: o.loop, autoStart: o.autoStart, start: o.start } };
  const bar = o.controls ? `<div id="cf-bar" role="toolbar" aria-label="Slide controls">
<button id="cf-prev" aria-label="Previous slide" title="Previous slide">${icon('prev')}</button><span id="cf-count" aria-hidden="true"></span><button id="cf-next" aria-label="Next slide" title="Next slide">${icon('next')}</button>
${o.interval > 0 ? `<button id="cf-play" aria-label="Play" title="Play">${icon('play')}</button>` : ''}<button id="cf-full" aria-label="Full screen" title="Full screen">${icon('full')}</button></div>` : '';
  return `<!doctype html>
<html lang="${escHtml(deck.props.language ?? 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="ClerdoFrame"><title>${title}</title>
<style>${PLAYER_CSS}${fontCss.replace(/<\/style/gi, '<\\/style')}</style></head>
<body><main id="cf-root" aria-label="${title}"><div id="cf-stage"></div></main>${bar}<div id="cf-live" class="cf-sr" aria-live="polite"></div>
<script type="application/json" id="cf-data">${scriptJson(data)}</script>
<script>${PLAYER_JS}</script></body></html>
`;
};

/** An iframe snippet to embed the published file once it is hosted somewhere. */
export const embedCode = (fileName: string, o: Pick<PublishOptions, 'width' | 'height'>, title: string): string =>
  `<iframe src="${escHtml(fileName)}" width="${Math.round(o.width)}" height="${Math.round(o.height)}" title="${escHtml(title)}" style="border:0" allow="fullscreen" allowfullscreen loading="lazy"></iframe>`;

// ---------- Accessible view ----------

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'list'; ordered: boolean; items: { text: string; level: number }[] }
  | { kind: 'img'; alt: string }
  | { kind: 'table'; rows: string[][]; header: boolean }
  | { kind: 'note'; text: string };

export interface Article { n: number; title: string; hidden: boolean; blocks: Block[]; notes: string }

const paraText = (p: Paragraph): string => p.runs.map((r) => (r.br ? '\n' : r.text)).join('').trim();

const textBlocks = (t: TextBody | undefined, listy: boolean): Block[] => {
  const out: Block[] = [];
  for (const p of t?.paras ?? []) {
    const text = paraText(p);
    if (!text) continue;
    const b = p.style?.bullet;
    const isList = b ? b.type !== 'none' : listy;
    if (isList) {
      const ordered = b?.type === 'auto';
      const last = out.at(-1);
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push({ text, level: p.style?.level ?? 0 });
      else out.push({ kind: 'list', ordered, items: [{ text, level: p.style?.level ?? 0 }] });
    } else out.push({ kind: 'p', text });
  }
  return out;
};

const shapeBlocks = (s: Shape, out: Block[]): void => {
  if (s.hidden || s.decorative) return;
  const alt = [s.altTitle, s.alt].filter(Boolean).join(': ');
  switch (s.kind) {
    case 'shape': {
      if (s.ph && ['dt', 'ftr', 'sldNum'].includes(s.ph.type)) return;
      const listy = !!s.ph && ['body', 'obj'].includes(s.ph.type);
      const b = textBlocks(s.text, listy);
      if (b.length) out.push(...b); else if (alt) out.push({ kind: 'img', alt });
      return;
    }
    case 'picture': out.push({ kind: 'img', alt: alt || 'Picture' }); return;
    case 'table': {
      const rows = s.rows.map((r) => r.cells.filter((c) => !c.hMerge && !c.vMerge).map((c) => textOf(c.text).trim()));
      out.push({ kind: 'table', rows, header: s.opts?.firstRow !== false });
      return;
    }
    case 'group': for (const c of s.children) shapeBlocks(c, out); return;
    case 'chart': {
      out.push({ kind: 'img', alt: alt || `Chart${s.title ? `: ${s.title}` : ''}` });
      if (s.categories.length && s.series.length) out.push({ kind: 'table', header: true, rows: [['', ...s.series.map((x) => x.name)], ...s.categories.map((c, i) => [c, ...s.series.map((x) => String(x.values[i] ?? ''))])] });
      return;
    }
    case 'diagram': {
      const items = s.nodes.filter((n) => n.text.trim()).map((n) => ({ text: n.text.trim(), level: n.level }));
      if (alt) out.push({ kind: 'p', text: alt });
      if (items.length) out.push({ kind: 'list', ordered: false, items });
      return;
    }
    case 'equation': out.push({ kind: 'p', text: alt || s.linear }); return;
    case 'media': out.push({ kind: 'img', alt: alt || (s.mediaType === 'video' ? 'Video' : 'Audio') }); return;
    case 'ink': if (alt) out.push({ kind: 'img', alt }); return;
    default: if (alt) out.push({ kind: 'img', alt });
  }
};

/** The deck as articles: heading, then text in reading order (title first, then slide order). */
export const accessibleDoc = (deck: Deck): Article[] => deck.slides.map((s, i) => {
  const title = slideTitle(s);
  const blocks: Block[] = [];
  for (const sh of s.shapes) {
    if (sh.ph && (sh.ph.type === 'title' || sh.ph.type === 'ctrTitle')) continue;
    shapeBlocks(sh, blocks);
  }
  return { n: i + 1, title: title || `Slide ${i + 1}`, hidden: !!s.hidden, blocks, notes: textOf(s.notes).trim() };
});

const listHtml = (items: { text: string; level: number }[], ordered: boolean): string => {
  const tag = ordered ? 'ol' : 'ul';
  let html = '';
  let depth = -1;
  for (const it of items) {
    const lv = Math.max(0, Math.min(8, it.level));
    if (depth < 0) { html += `<${tag}>`; depth = 0; }
    while (depth < lv) { html += `<${tag}>`; depth++; }
    while (depth > lv) { html += `</${tag}>`; depth--; }
    html += `<li>${escHtml(it.text).replace(/\n/g, '<br>')}</li>`;
  }
  while (depth-- >= 0) html += `</${tag}>`;
  return html;
};

export const blockHtml = (b: Block): string => {
  switch (b.kind) {
    case 'p': return `<p>${escHtml(b.text).replace(/\n/g, '<br>')}</p>`;
    case 'list': return listHtml(b.items, b.ordered);
    case 'img': return `<p class="img" role="img" aria-label="${escHtml(b.alt)}">[${escHtml(b.alt)}]</p>`;
    case 'table': {
      const [head, ...body] = b.header ? b.rows : [undefined, ...b.rows];
      return `<table>${head ? `<thead><tr>${head.map((c) => `<th scope="col">${escHtml(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${body.map((r) => `<tr>${(r ?? []).map((c) => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    case 'note': return `<p>${escHtml(b.text)}</p>`;
  }
};

export const accessibleHtml = (deck: Deck, o: { notes: boolean; hidden?: boolean } = { notes: false }): string => {
  const title = escHtml(deckTitle(deck));
  const arts = accessibleDoc(deck).filter((a) => o.hidden !== false || !a.hidden);
  const body = arts.map((a) => `<article aria-labelledby="s${a.n}"><h2 id="s${a.n}"><span class="n">Slide ${a.n}${a.hidden ? ' (hidden)' : ''}.</span> ${escHtml(a.title)}</h2>${a.blocks.map(blockHtml).join('')}${o.notes && a.notes ? `<aside aria-label="Speaker notes"><h3>Notes</h3>${a.notes.split('\n').filter(Boolean).map((t) => `<p>${escHtml(t)}</p>`).join('')}</aside>` : ''}</article>`).join('\n');
  return `<!doctype html>
<html lang="${escHtml(deck.props.language ?? 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font:17px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:46rem;margin:0 auto;padding:1.5rem 1rem 4rem;color:#1b1b1b;background:#fff}
@media (prefers-color-scheme:dark){body{color:#eee;background:#161616}th,td{border-color:#555!important}}
article{border-top:1px solid #8884;padding:1rem 0}h1{font-size:1.7rem}h2{font-size:1.3rem;margin:.2rem 0 .6rem}.n{font-weight:400;opacity:.7}
table{border-collapse:collapse;margin:.6rem 0}th,td{border:1px solid #bbb;padding:.3rem .6rem;text-align:start}.img{font-style:italic;opacity:.85}aside{margin-top:.8rem;padding:.4rem .9rem;border-inline-start:3px solid #8888}aside h3{font-size:1rem;margin:.3rem 0}</style></head>
<body><main><h1>${title}</h1>
${body}
</main></body></html>
`;
};
