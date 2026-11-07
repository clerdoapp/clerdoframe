// Slide transitions (p:transition, 19.5.70) and the animation timing tree (p:timing, 19.5.87).
import { uid, type AnimClass, type Animation, type AnimTrigger, type Transition } from '../../model/deck';
import { attr, find, findAll, kid, kids, numAttr, type XNode } from '../xml';
import { effectOf, transitionOf } from './presets';
import { colorXmlToHex } from './read-util';

const SPEED: Record<string, number> = { slow: 1, med: 0.75, fast: 0.5 };

export const readTransition = (slide: XNode): Transition | undefined => {
  // The transition may sit inside mc:AlternateContent (Choice p14 / Fallback).
  let tr = kid(slide, 'transition');
  if (!tr) {
    for (const ac of kids(slide, 'AlternateContent')) {
      const ch = kids(ac, 'Choice').map((c) => kid(c, 'transition')).find(Boolean) ?? kid(kid(ac, 'Fallback'), 'transition');
      if (ch) { tr = ch; break; }
    }
  }
  if (!tr) return undefined;
  const dur = numAttr(tr, 'dur');
  const out: Transition = { name: 'none', duration: dur !== undefined ? dur / 1000 : SPEED[attr(tr, 'spd') ?? 'fast'] ?? 0.5 };
  for (const ch of tr.children) {
    if (ch.name === 'sndAc' || ch.name === 'extLst') continue;
    const t = transitionOf(ch.name, ch.attrs);
    if (t) { out.name = t.name; if (t.option !== undefined) out.option = t.option; break; }
  }
  // Newer effects sit in the extension list.
  for (const ext of findAll(kid(tr, 'extLst'), 'ext')) for (const ch of ext.children) {
    const t = transitionOf(ch.name, ch.attrs);
    if (t) { out.name = t.name; if (t.option !== undefined) out.option = t.option; else delete out.option; }
  }
  const adv = attr(tr, 'advClick');
  if (adv === '0' || adv === 'false') out.advanceOnClick = false;
  const tm = numAttr(tr, 'advTm');
  if (tm !== undefined) out.advanceAfter = tm / 1000;
  if (out.name === 'none' && out.advanceAfter === undefined && out.advanceOnClick === undefined && !tr.children.length) return undefined;
  return out;
};

const dur = (v: string | undefined): number | undefined => (v === undefined || v === 'indefinite' ? undefined : Number(v) / 1000);

interface Ctx { shapeFor: (spid: string) => string | undefined; W: number; H: number }

const bhvrTarget = (n: XNode): string | undefined => attr(find(n, 'spTgt'), 'spid');

/** One effect node (a p:par whose cTn has presetClass). */
const readEffect = (par: XNode, trigger: AnimTrigger, extraDelay: number, c: Ctx, builds: Map<string, string>): Animation | null => {
  const ctn = kid(par, 'cTn');
  if (!ctn) return null;
  const cls = (attr(ctn, 'presetClass') ?? 'entr') as AnimClass | 'verb' | 'mediacall';
  if (cls !== 'entr' && cls !== 'exit' && cls !== 'emph' && cls !== 'path') return null;
  const spid = bhvrTarget(ctn);
  const shape = spid ? c.shapeFor(spid) : undefined;
  if (!shape) return null;
  const { effect, option } = effectOf(cls, numAttr(ctn, 'presetID') ?? 0, numAttr(ctn, 'presetSubtype') ?? 0);
  const bhvrs = findAll(kid(ctn, 'childTnLst'), 'cTn');
  let d = 0;
  for (const b of bhvrs) {
    const x = dur(attr(b, 'dur'));
    const dl = Number(attr(kid(kid(b, 'stCondLst'), 'cond'), 'delay') ?? 0) / 1000;
    if (x !== undefined && Number.isFinite(x)) d = Math.max(d, x + (Number.isFinite(dl) ? dl : 0));
  }
  const delay = Number(attr(kid(kid(ctn, 'stCondLst'), 'cond'), 'delay') ?? 0) / 1000;
  const a: Animation = {
    id: uid('a'), shape, cls, effect, trigger, duration: Math.round(d * 1000) / 1000,
    delay: Math.round(((Number.isFinite(delay) ? delay : 0) + extraDelay) * 1000) / 1000,
  };
  if (option !== undefined) a.option = option;
  const rc = attr(ctn, 'repeatCount');
  if (rc === 'indefinite') a.repeat = 'untilNextClick';
  else if (rc && Number(rc) > 1000) a.repeat = Number(rc) / 1000;
  if (attr(ctn, 'fill') === 'remove' && cls === 'emph') a.rewind = true;
  const accel = numAttr(ctn, 'accel'), decel = numAttr(ctn, 'decel');
  if (accel) a.smoothStart = accel / 100000;
  if (decel) a.smoothEnd = decel / 100000;
  const grp = attr(ctn, 'grpId') ?? '0';
  const build = builds.get(`${spid}:${grp}`);
  if (build === 'p') a.textBy = 'para';
  const iter = kid(par, 'iterate') ?? kid(ctn, 'iterate');
  if (iter) a.textBy = attr(iter, 'type') === 'lt' ? 'letter' : attr(iter, 'type') === 'wd' ? 'word' : a.textBy;
  // Emphasis values and motion paths.
  if (cls === 'emph') {
    const rot = find(ctn, 'animRot');
    if (rot) { const by = numAttr(rot, 'by'); if (by !== undefined) a.value = by / 60000; }
    const sc = find(ctn, 'animScale');
    if (sc) { const by = find(sc, 'by'); const x = numAttr(by, 'x'); if (x !== undefined) a.value = Math.round(x / 1000); }
    const clr = find(ctn, 'animClr');
    if (clr) { const hex = colorXmlToHex(kid(clr, 'to')); if (hex) a.value = hex; }
    if (effect === 'transparency') { const s = findAll(ctn, 'set').map((x) => find(x, 'strVal')).find(Boolean); const v = Number(attr(s, 'val')); if (Number.isFinite(v)) a.value = Math.round((1 - v) * 100); }
  }
  if (cls === 'path') {
    const m = find(ctn, 'animMotion');
    const p = attr(m, 'path');
    if (p) a.path = motionToPx(p, c.W, c.H);
  }
  const ac = attr(ctn, 'afterEffect');
  if (ac === '1') a.afterAnim = 'hide';
  return a;
};

/** "M 0 0 L 0.25 0 E" (slide fractions) to px path data. */
export const motionToPx = (p: string, W: number, H: number): string => {
  const tok = p.replace(/\bE\b/g, '').trim().match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let k = 0;
  return tok.map((t) => (/^[a-zA-Z]$/.test(t) ? (k = 0, t.toUpperCase() === 'Z' ? 'Z' : t) : (k++ % 2 === 1 ? Math.round(Number(t) * H * 100) / 100 : Math.round(Number(t) * W * 100) / 100).toString())).join(' ').slice(0, 20000);
};

/** Effects of the main sequence and the trigger (interactive) sequences. */
export const readTiming = (slide: XNode, c: Ctx): Animation[] => {
  const timing = kid(slide, 'timing');
  if (!timing) return [];
  const builds = new Map<string, string>();
  for (const b of kids(kid(timing, 'bldLst'), 'bldP')) builds.set(`${attr(b, 'spid')}:${attr(b, 'grpId') ?? '0'}`, attr(b, 'build') ?? 'whole');
  const out: Animation[] = [];
  const seqs = findAll(timing, 'seq');
  for (const seq of seqs) {
    const sctn = kid(seq, 'cTn');
    const type = attr(sctn, 'nodeType');
    let triggerShape: string | undefined;
    if (type === 'interactiveSeq') {
      const spid = attr(find(kid(sctn, 'stCondLst'), 'spTgt'), 'spid');
      triggerShape = spid ? c.shapeFor(spid) : undefined;
      if (!triggerShape) continue;
    } else if (type !== 'mainSeq') continue;
    // seq > cTn > childTnLst > par (one per click) > cTn > childTnLst > par (one per start time) > cTn > childTnLst > par (effects)
    for (const click of kids(kid(sctn, 'childTnLst'), 'par')) {
      const groups = kids(kid(kid(click, 'cTn'), 'childTnLst'), 'par');
      groups.forEach((g, gi) => {
        const gDelay = Number(attr(kid(kid(kid(g, 'cTn'), 'stCondLst'), 'cond'), 'delay') ?? 0) / 1000;
        const effects = kids(kid(kid(g, 'cTn'), 'childTnLst'), 'par');
        effects.forEach((e, ei) => {
          const nt = attr(kid(e, 'cTn'), 'nodeType');
          let trigger: AnimTrigger = nt === 'withEffect' ? 'with' : nt === 'afterEffect' ? 'after' : 'click';
          if (gi === 0 && ei === 0 && nt !== 'withEffect' && nt !== 'afterEffect') trigger = 'click';
          else if (ei > 0) trigger = 'with';
          else if (gi > 0 && trigger === 'click') trigger = 'after';
          const a = readEffect(e, trigger, gi > 0 && trigger === 'after' ? 0 : 0, c, builds);
          if (!a) return;
          if (gi > 0 && ei === 0 && trigger === 'after' && Number.isFinite(gDelay) && gDelay > 0 && a.delay === 0) a.delay = 0;
          if (triggerShape) a.triggerShape = triggerShape;
          // The first effect of a slide that starts on its own (no click) is "after previous" in the file.
          out.push(a);
        });
      });
    }
  }
  return out;
};
