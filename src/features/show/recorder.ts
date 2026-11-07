/** Records narration per slide with MediaRecorder; saves an audio (or camera video) shape on each slide. */
import type { FrameStore } from '../../app/store';
import { uid, type Media, type Slide } from '../../model/deck';
import type { ShowController } from './controller';

const pickType = (video: boolean): string => {
  const R = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  const list = video ? ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return list.find((t) => R?.isTypeSupported?.(t)) ?? '';
};

export const recordingSupported = (): boolean => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export class Recorder {
  stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private current: Slide | null = null;
  private pending: Promise<void>[] = [];
  readonly clips = new Map<string, { data: Uint8Array; type: string }>();
  constructor(private camera: boolean) {}

  async open(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.camera ? { width: 640, height: 480 } : false });
      return true;
    } catch {
      return false;
    }
  }

  startSlide(slide: Slide): void {
    if (!this.stream) return;
    this.stopSlide();
    const type = pickType(this.camera);
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined); } catch { return; }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const id = slide.id;
    this.pending.push(new Promise<void>((res) => {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' });
        void blob.arrayBuffer().then((b) => { if (b.byteLength) this.clips.set(id, { data: new Uint8Array(b), type: blob.type.split(';')[0]! }); res(); });
      };
    }));
    rec.start(250);
    this.rec = rec;
    this.current = slide;
  }

  pause(on: boolean): void {
    if (!this.rec) return;
    try { if (on && this.rec.state === 'recording') this.rec.pause(); else if (!on && this.rec.state === 'paused') this.rec.resume(); } catch { /* unsupported */ }
  }

  stopSlide(): void {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    this.rec = null;
    this.current = null;
  }

  async close(): Promise<void> {
    this.stopSlide();
    await Promise.all(this.pending);
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
  }

  get slide(): Slide | null { return this.current; }
}

/** Writes the recorded clips and timings into the deck as one undo step. */
export const saveRecording = (store: FrameStore, c: ShowController, r: Recorder, camera: boolean): void => {
  const deck = store.deck;
  if (!r.clips.size && !Object.keys(c.timings).length) return;
  store.tryChange('Record slide show', () => {
    for (const s of deck.slides) {
      const t = c.timings[s.id];
      if (t !== undefined) s.timing = Math.round(t * 10) / 10;
      const clip = r.clips.get(s.id);
      if (!clip) continue;
      // Replace an older narration on the slide.
      s.shapes = s.shapes.filter((x) => !(x.kind === 'media' && x.name.startsWith('Narration')));
      const mid = store.addMedia(clip.type, `narration-${s.id}.${clip.type.includes('mp4') ? (camera ? 'mp4' : 'm4a') : 'webm'}`, clip.data);
      const video = camera && clip.type.startsWith('video');
      const size = video ? { w: 240, h: 180 } : { w: 48, h: 48 };
      const shape: Media = {
        id: uid('s'), kind: 'media', name: video ? 'Narration video' : 'Narration audio', mediaType: video ? 'video' : 'audio', media: mid,
        x: deck.w - size.w - 24, y: deck.h - size.h - 24, ...size,
        autoplay: true, acrossSlides: false, hideWhenStopped: !video,
      };
      s.shapes.push(shape);
    }
    deck.show.useTimings = true;
  });
};
