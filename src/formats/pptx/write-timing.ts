// Transitions and the animation timing tree (standard par / seq structure, ECMA-376 Part 1, 19.5).
import type { Animation, Color, Transition } from '../../model/deck';
import { esc } from '../xml';
import { colorXml } from './dml';
import { fallbackTransition, presetOf, transitionXml, type TransXml } from './presets';

const tx = (x: TransXml): string => `<${x.ns}:${x.tag}${Object.entries(x.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}/>`;

export const transitionXmlFor = (t: Transition | undefined): string => {
  if (!t) return '';
  const adv = `${t.advanceOnClick === false ? ' advClick="0"' : ''}${t.advanceAfter !== undefined ? ` advTm="${Math.round(t.advanceAfter * 1000)}"` : ''}`;
  if (t.name === 'none') return adv ? `<p:transition${adv}/>` : '';
  const dur = Math.max(0, Math.round(t.duration * 1000));
  const spd = dur <= 500 ? 'fast' : dur <= 750 ? 'med' : 'slow';
  const x = transitionXml(t.name, t.option);
  if (x.ns === 'p') {
    return `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14"><p:transition spd="${spd}" p14:dur="${dur}"${adv}>${tx(x)}</p:transition></mc:Choice>`
      + `<mc:Fallback><p:transition spd="${spd}"${adv}>${tx(x)}</p:transition></mc:Fallback></mc:AlternateContent>`;
  }
  const fb = fallbackTransition(x);
  const nsDecl = x.ns === 'p15' ? ' xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main"' : x.ns === 'p159' ? ' xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main"' : '';
  // Morph / 2012 effects: p14 choice with the element inside the transition's extension.
  if (x.ns === 'p159' || x.ns === 'p15') {
    return `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"${nsDecl} Requires="${x.ns}"><p:transition spd="${spd}" p14:dur="${dur}"${adv}>${tx(x)}</p:transition></mc:Choice>`
      + `<mc:Fallback><p:transition spd="${spd}"${adv}>${tx(fb)}</p:transition></mc:Fallback></mc:AlternateContent>`;
  }
  return `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14"><p:transition spd="${spd}" p14:dur="${dur}"${adv}>${tx(x)}</p:transition></mc:Choice>`
    + `<mc:Fallback><p:transition spd="${spd}"${adv}>${tx(fb)}</p:transition></mc:Fallback></mc:AlternateContent>`;
};

// ---------- Timing ----------

let ctnId = 0;
const nid = () => ++ctnId;

const tgt = (spid: number) => `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
const set = (spid: number, attr: string, val: string, dur = 1, delay = 0) =>
  `<p:set><p:cBhvr><p:cTn id="${nid()}" dur="${dur}" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>${tgt(spid)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${val}"/></p:to></p:set>`;
const animEffect = (spid: number, filter: string, dur: number, transition: 'in' | 'out') =>
  `<p:animEffect transition="${transition}" filter="${esc(filter)}"><p:cBhvr><p:cTn id="${nid()}" dur="${dur}"/>${tgt(spid)}</p:cBhvr></p:animEffect>`;
const anim = (spid: number, attr: string, from: string, to: string, dur: number) =>
  `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${nid()}" dur="${dur}" fill="hold"/>${tgt(spid)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;

const hexOf = (v: unknown): Color => (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v) ? (v.startsWith('#') ? v : `#${v}`) : '#FF0000');

/** Behaviours for one effect. Simple and readable by other apps; exact motion is up to the player. */
const behaviours = (a: Animation, spid: number, ms: number): string => {
  const p = presetOf(a.cls, a.effect, a.option);
  if (a.cls === 'entr' || a.cls === 'exit') {
    const vis = a.cls === 'entr' ? set(spid, 'style.visibility', 'visible') : '';
    const hide = a.cls === 'exit' ? set(spid, 'style.visibility', 'hidden', 1, Math.max(0, ms - 1)) : '';
    if (a.effect === 'appear' || a.effect === 'disappear') return a.cls === 'entr' ? vis : set(spid, 'style.visibility', 'hidden');
    if (a.effect === 'flyIn' || a.effect === 'flyOut') {
      const d = a.option ?? 'b';
      const ox = d.includes('l') ? '0-#ppt_w/2' : d.includes('r') ? '1+#ppt_w/2' : '#ppt_x';
      const oy = d.includes('t') ? '0-#ppt_h/2' : d.includes('b') ? '1+#ppt_h/2' : '#ppt_y';
      return a.cls === 'entr'
        ? vis + anim(spid, 'ppt_x', ox, '#ppt_x', ms) + anim(spid, 'ppt_y', oy, '#ppt_y', ms)
        : anim(spid, 'ppt_x', '#ppt_x', ox, ms) + anim(spid, 'ppt_y', '#ppt_y', oy, ms) + hide;
    }
    if (['zoom', 'basicZoom', 'growTurn', 'fadedZoom', 'expand', 'compress', 'spinner'].includes(a.effect) || /shrinkTurn|contract/.test(a.effect)) {
      const sc = a.cls === 'entr'
        ? anim(spid, 'ppt_w', '0', '#ppt_w', ms) + anim(spid, 'ppt_h', '0', '#ppt_h', ms)
        : anim(spid, 'ppt_w', '#ppt_w', '0', ms) + anim(spid, 'ppt_h', '#ppt_h', '0', ms);
      return vis + sc + (p.filter ? animEffect(spid, p.filter, ms, a.cls === 'entr' ? 'in' : 'out') : '') + hide;
    }
    return vis + animEffect(spid, p.filter ?? 'fade', ms, a.cls === 'entr' ? 'in' : 'out') + hide;
  }
  if (a.cls === 'emph') {
    switch (a.effect) {
      case 'spin': {
        const by = Math.round((typeof a.value === 'number' ? a.value : 360) * (a.option === 'ccw' ? -1 : 1) * 60000);
        return `<p:animRot by="${by}"><p:cBhvr><p:cTn id="${nid()}" dur="${ms}" fill="hold"/>${tgt(spid)}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`;
      }
      case 'growShrink': case 'pulse': {
        const v = Math.round((typeof a.value === 'number' ? a.value : a.effect === 'pulse' ? 105 : 150) * 1000);
        const x = a.option === 'v' ? 100000 : v, y = a.option === 'h' ? 100000 : v;
        return `<p:animScale><p:cBhvr><p:cTn id="${nid()}" dur="${ms}" fill="hold"${a.effect === 'pulse' ? ' autoRev="1"' : ''}/>${tgt(spid)}</p:cBhvr><p:by x="${x}" y="${y}"/></p:animScale>`;
      }
      case 'transparency': {
        const v = (1 - (typeof a.value === 'number' ? a.value : 50) / 100).toFixed(2);
        return set(spid, 'style.opacity', v, ms);
      }
      case 'fillColor': case 'objectColor': case 'lineColor': case 'fontColor': case 'colorPulse': {
        const attr = a.effect === 'lineColor' ? 'stroke.color' : a.effect === 'fontColor' ? 'style.color' : 'fillcolor';
        return `<p:animClr clrSpc="rgb" dir="cw"><p:cBhvr><p:cTn id="${nid()}" dur="${ms}" fill="hold"${a.effect === 'colorPulse' ? ' autoRev="1"' : ''}/>${tgt(spid)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:to>${colorXml(hexOf(a.value))}</p:to></p:animClr>`;
      }
      default:
        return `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${nid()}" dur="${ms}" autoRev="1"/>${tgt(spid)}</p:cBhvr></p:animEffect>`;
    }
  }
  // Motion path in slide fractions.
  return `<p:animMotion origin="layout" path="${esc(a.path ? '' : 'M 0 0 L 0.25 0 E')}" pathEditMode="relative" ptsTypes=""><p:cBhvr><p:cTn id="${nid()}" dur="${ms}" fill="hold"/>${tgt(spid)}<p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:rCtr x="0" y="0"/></p:animMotion>`;
};

/** px path data to slide fractions ("M 0 0 L 0.1 0.2 E"). */
export const motionToFrac = (d: string, W: number, H: number): string => {
  const tok = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let k = 0;
  const out = tok.map((t) => (/^[a-zA-Z]$/.test(t) ? (k = 0, t.toUpperCase()) : (k++ % 2 === 1 ? (Number(t) / H) : (Number(t) / W)).toFixed(5).replace(/\.?0+$/, '') || '0'));
  return `${out.join(' ')} E`;
};

const effectPar = (a: Animation, spid: number, nodeType: string, grp: number, W: number, H: number): string => {
  const p = presetOf(a.cls, a.effect, a.option);
  const ms = Math.max(1, Math.round((a.duration || (a.effect === 'appear' || a.effect === 'disappear' ? 0.001 : 0.5)) * 1000));
  const rep = a.repeat === 'untilNextClick' || a.repeat === 'untilEnd' ? ' repeatCount="indefinite"' : typeof a.repeat === 'number' && a.repeat > 1 ? ` repeatCount="${Math.round(a.repeat * 1000)}"` : '';
  const acc = `${a.smoothStart ? ` accel="${Math.round(a.smoothStart * 100000)}"` : ''}${a.smoothEnd ? ` decel="${Math.round(a.smoothEnd * 100000)}"` : ''}`;
  let beh = behaviours(a, spid, ms);
  if (a.cls === 'path') beh = beh.replace('path=""', `path="${esc(motionToFrac(a.path ?? 'M0 0 L100 0', W, H))}"`);
  return `<p:par><p:cTn id="${nid()}" presetID="${p.id}" presetClass="${a.cls}" presetSubtype="${p.sub}"${a.rewind ? ' fill="remove"' : ' fill="hold"'}${rep}${acc} grpId="${grp}" nodeType="${nodeType}"${a.afterAnim === 'hide' ? ' afterEffect="1"' : ''}>`
    + `<p:stCondLst><p:cond delay="${Math.round((a.delay || 0) * 1000)}"/></p:stCondLst><p:childTnLst>${beh}</p:childTnLst></p:cTn></p:par>`;
};

/** Groups a sequence into click steps, each a list of start-time groups (with + after chains). */
const clickSteps = (list: Animation[]): Animation[][][] => {
  const steps: Animation[][][] = [];
  for (const a of list) {
    if (a.trigger === 'click' || !steps.length) steps.push([[a]]);
    else if (a.trigger === 'with') steps.at(-1)!.at(-1)!.push(a);
    else steps.at(-1)!.push([a]);
  }
  return steps;
};

const groupLen = (g: Animation[]): number => Math.max(...g.map((a) => (a.delay || 0) + (a.duration || 0) * (typeof a.repeat === 'number' ? a.repeat : 1)));

const seqXml = (list: Animation[], ids: Map<string, number>, W: number, H: number, grpOf: Map<Animation, number>, trigger?: number): string => {
  const steps = clickSteps(list);
  const firstAuto = list[0] && list[0].trigger !== 'click';
  const pars = steps.map((step, si) => {
    let t = 0;
    const groups = step.map((g, gi) => {
      const start = t;
      t += groupLen(g);
      const inner = g.map((a, ai) => {
        const spid = ids.get(a.shape) ?? 0;
        const nodeType = ai === 0 && gi === 0 ? (si === 0 && firstAuto ? (a.trigger === 'with' ? 'withEffect' : 'afterEffect') : 'clickEffect') : ai === 0 ? 'afterEffect' : 'withEffect';
        return effectPar(a, spid, nodeType, grpOf.get(a) ?? 0, W, H);
      }).join('');
      return `<p:par><p:cTn id="${nid()}" fill="hold"><p:stCondLst><p:cond delay="${Math.round(start * 1000)}"/></p:stCondLst><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par>`;
    }).join('');
    const cond = trigger !== undefined || si === 0 && firstAuto ? '<p:cond delay="0"/>' : '<p:cond delay="indefinite"/>';
    const cond2 = si === 0 && firstAuto && trigger === undefined ? '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '';
    return `<p:par><p:cTn id="${nid()}" fill="hold"><p:stCondLst>${si === 0 && firstAuto && trigger === undefined ? '<p:cond delay="indefinite"/>' + cond2 : cond}</p:stCondLst><p:childTnLst>${groups}</p:childTnLst></p:cTn></p:par>`;
  }).join('');
  if (trigger !== undefined) {
    return `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${nid()}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0">${tgt(trigger)}</p:cond></p:stCondLst>`
      + `<p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync><p:childTnLst>${pars}</p:childTnLst></p:cTn><p:nextCondLst><p:cond evt="onClick" delay="0">${tgt(trigger)}</p:cond></p:nextCondLst></p:seq>`;
  }
  return `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${nid()}" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${pars}</p:childTnLst></p:cTn>`
    + '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>';
};

export const timingXml = (anims: Animation[], ids: Map<string, number>, W: number, H: number): string => {
  const list = anims.filter((a) => ids.has(a.shape));
  if (!list.length) return '';
  ctnId = 1;
  const grpOf = new Map<Animation, number>();
  const perShape = new Map<string, number>();
  for (const a of list) { const n = perShape.get(a.shape) ?? 0; grpOf.set(a, n); perShape.set(a.shape, n + 1); }
  const main = list.filter((a) => !a.triggerShape || !ids.has(a.triggerShape));
  const triggered = new Map<string, Animation[]>();
  for (const a of list) if (a.triggerShape && ids.has(a.triggerShape)) { const l = triggered.get(a.triggerShape) ?? []; l.push({ ...a, trigger: l.length ? a.trigger : 'click' }); triggered.set(a.triggerShape, l); }
  // Map copies back to their group ids.
  for (const [, l] of triggered) for (const a of l) { const orig = list.find((x) => x.id === a.id); if (orig) grpOf.set(a, grpOf.get(orig) ?? 0); }
  const root = nid();
  let seqs = main.length ? seqXml(main, ids, W, H, grpOf) : '';
  for (const [shape, l] of triggered) seqs += seqXml(l, ids, W, H, grpOf, ids.get(shape));
  const builds = list.filter((a) => a.textBy === 'para' && (a.cls === 'entr' || a.cls === 'exit' || a.cls === 'emph')).map((a) => `<p:bldP spid="${ids.get(a.shape)}" grpId="${grpOf.get(a) ?? 0}" build="p"/>`);
  const bld = [...new Set(builds)];
  return `<p:timing><p:tnLst><p:par><p:cTn id="${root}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${seqs}</p:childTnLst></p:cTn></p:par></p:tnLst>${bld.length ? `<p:bldLst>${bld.join('')}</p:bldLst>` : ''}</p:timing>`;
};
