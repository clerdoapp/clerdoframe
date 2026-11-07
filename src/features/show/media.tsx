/** Video and audio shapes: how they are drawn, and how they play in the show. */
import type { ReactNode } from 'react';
import type { Deck, Media, Slide } from '../../model/deck';
import { registerKind } from '../../render/SlideView';
import { mediaUrl } from '../../render/paint';

/** Shape id previewed on the editing canvas (Play on the Media section). */
export const preview = { id: null as string | null, at: 0 };

const FILM = 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4';
const NOTE = 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z';

const Badge = ({ w, h }: { w: number; h: number }) => {
  const r = Math.max(10, Math.min(28, Math.min(w, h) * 0.14));
  return (
    <g transform={`translate(${w / 2} ${h / 2})`} pointerEvents="none">
      <circle r={r} fill="rgba(0,0,0,.55)" />
      <path d={`M${-r * 0.32} ${-r * 0.48} L${r * 0.55} 0 L${-r * 0.32} ${r * 0.48} Z`} fill="#fff" />
    </g>
  );
};

const Icon = ({ d, size, x, y, color }: { d: string; size: number; x: number; y: number; color: string }) => (
  <g transform={`translate(${x} ${y}) scale(${size / 24})`}><path d={d} fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" /></g>
);

const placeholder = (m: Media, deck: Deck, editing: boolean): ReactNode => {
  const poster = mediaUrl(deck, m.poster);
  const audio = m.mediaType === 'audio';
  if (poster && !audio) {
    return <>
      <image href={poster} width={m.w} height={m.h} preserveAspectRatio="xMidYMid slice" />
      {editing && <Badge w={m.w} h={m.h} />}
    </>;
  }
  const s = Math.min(m.w, m.h);
  if (audio) {
    return <>
      <rect width={m.w} height={m.h} rx={s * 0.18} fill="#2b0f08" opacity={0.9} />
      <Icon d={NOTE} size={s * 0.56} x={(m.w - s * 0.56) / 2} y={(m.h - s * 0.56) / 2} color="#fde8e0" />
    </>;
  }
  return <>
    <rect width={m.w} height={m.h} fill="#1c1310" />
    <Icon d={FILM} size={s * 0.3} x={(m.w - s * 0.3) / 2} y={(m.h - s * 0.3) / 2 - (editing ? s * 0.08 : 0)} color="#b29a92" />
    {editing && <Badge w={m.w} h={m.h * 1.3} />}
  </>;
};

registerKind('media', (s, ctx, _defs, o) => {
  if (s.kind !== 'media') return null;
  const deck = ctx.deck;
  const url = mediaUrl(deck, s.media);
  const live = o.mode === 'show' || (o.mode === 'edit' && preview.id === s.id);
  if (!live || !url) return placeholder(s, deck, o.mode === 'edit');
  const video = s.mediaType === 'video';
  const poster = mediaUrl(deck, s.poster);
  // Audio that plays across slides is played by the show outside the slide; here only its icon.
  return (
    <foreignObject width={s.w} height={s.h} style={{ overflow: 'visible' }}>
      <div className={`show-media${video ? '' : ' audio'}`} data-media={s.id} style={{ width: s.w, height: s.h }}>
        {video ? (
          <video src={url} poster={poster} playsInline preload="auto" data-media-el={s.id} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : (
          <>
            <audio src={url} preload="auto" data-media-el={s.id} />
            <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden><rect width="24" height="24" rx="4" fill="#2b0f08" opacity=".9" /><g transform="translate(4 4) scale(.667)"><path d={NOTE} fill="none" stroke="#fde8e0" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></g></svg>
          </>
        )}
        <div className="show-media-bar" data-media-bar={s.id} />
      </div>
    </foreignObject>
  );
});

// ---------- Playback in the show ----------

type El = HTMLMediaElement & { __fade?: number; __shape?: Media };

const trimOf = (m: Media, el: HTMLMediaElement): { start: number; end: number } => {
  const dur = Number.isFinite(el.duration) ? el.duration : Infinity;
  const start = Math.max(0, m.trim?.start ?? 0);
  const end = m.trim?.end && m.trim.end > start ? Math.min(dur, m.trim.end) : dur;
  return { start, end };
};

const baseVol = (m: Media): number => Math.max(0, Math.min(1, m.volume ?? 1));

/** Volume from fades at the element's current time. */
const fadedVol = (m: Media, el: HTMLMediaElement): number => {
  const { start, end } = trimOf(m, el);
  const t = el.currentTime;
  let k = 1;
  if (m.fadeIn) k = Math.min(k, Math.max(0, (t - start) / m.fadeIn));
  if (m.fadeOut && Number.isFinite(end)) k = Math.min(k, Math.max(0, (end - t) / m.fadeOut));
  return baseVol(m) * k;
};

/** Hooks a media element up to its shape's settings once. */
export const wireMedia = (el: El, m: Media, opts: { onState?: () => void; muted?: boolean }): void => {
  if (el.__shape) { el.__shape = m; return; }
  el.__shape = m;
  el.muted = !!opts.muted;
  const seekStart = () => { const { start } = trimOf(m, el); if (start && el.currentTime < start) el.currentTime = start; };
  el.addEventListener('loadedmetadata', seekStart);
  el.addEventListener('timeupdate', () => {
    const sh = el.__shape!;
    const { start, end } = trimOf(sh, el);
    el.volume = fadedVol(sh, el);
    if (el.currentTime >= end - 0.03) {
      if (sh.loop) { el.currentTime = start; void el.play().catch(() => undefined); }
      else { el.pause(); el.dispatchEvent(new Event('ended')); }
    }
  });
  el.addEventListener('ended', () => {
    const sh = el.__shape!;
    if (sh.rewind) { try { el.currentTime = trimOf(sh, el).start; } catch { /* not seekable */ } }
    if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => undefined);
    opts.onState?.();
  });
  el.addEventListener('play', () => opts.onState?.());
  el.addEventListener('pause', () => opts.onState?.());
};

export const playMedia = (el: HTMLMediaElement, m: Media, fromStart = false): void => {
  const { start, end } = trimOf(m, el);
  if (fromStart || el.currentTime < start || el.currentTime >= end - 0.05) { try { el.currentTime = start; } catch { /* not loaded yet */ } }
  el.volume = fadedVol(m, el);
  void el.play().catch(() => undefined);
};

export const toggleMedia = (el: HTMLMediaElement, m: Media): void => { if (el.paused) playMedia(el, m); else el.pause(); };

/** Background audio that keeps playing while slides change. */
export class AcrossPlayer {
  private els = new Map<string, El>();
  constructor(private root: () => HTMLElement | null) {}
  start(deck: Deck, m: Media, muted: boolean): void {
    if (this.els.has(m.id)) return;
    const url = mediaUrl(deck, m.media);
    const host = this.root();
    if (!url || !host) return;
    const el = document.createElement('audio') as El;
    el.src = url;
    el.preload = 'auto';
    host.appendChild(el);
    wireMedia(el, m, { muted });
    el.addEventListener('ended', () => { if (!m.loop) this.stop(m.id); });
    this.els.set(m.id, el);
    playMedia(el, m, true);
  }
  stop(id: string): void { const el = this.els.get(id); if (el) { el.pause(); el.remove(); this.els.delete(id); } }
  has(id: string): boolean { return this.els.has(id); }
  stopAll(): void { for (const id of [...this.els.keys()]) this.stop(id); }
}

/** Media shapes on a slide. */
export const mediaOf = (slide: Slide | undefined): Media[] => (slide?.shapes ?? []).filter((s): s is Media => s.kind === 'media');

/** Grabs the current video frame as a PNG. */
export const frameAsPng = async (v: HTMLVideoElement): Promise<Uint8Array | null> => {
  const c = document.createElement('canvas');
  c.width = v.videoWidth || 1280;
  c.height = v.videoHeight || 720;
  const g = c.getContext('2d');
  if (!g) return null;
  try { g.drawImage(v, 0, 0, c.width, c.height); } catch { return null; }
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
};
