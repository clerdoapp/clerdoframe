/** Transition and animation sounds made with WebAudio: short generated tones, no sound files. */

export const SOUNDS: [string, string][] = [
  ['', 'No sound'], ['chime', 'Chime'], ['click', 'Click'], ['whoosh', 'Whoosh'], ['pop', 'Pop'], ['rise', 'Rise'], ['bell', 'Bell'], ['drum', 'Drum'],
];

let ctx: AudioContext | null = null;
const audio = (): AudioContext | null => {
  if (ctx) return ctx;
  const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try { ctx = new C(); } catch { return null; }
  return ctx;
};

const tone = (a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.25, slide?: number): void => {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
};

const noise = (a: AudioContext, at: number, dur: number, vol = 0.2, from = 400, to = 3000): void => {
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(at);
};

/** Plays a named sound. Unknown names (for example media ids from opened files) play a soft chime. */
export const playSound = (name: string | undefined): void => {
  if (!name) return;
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
  const t = a.currentTime + 0.01;
  switch (name) {
    case 'click': tone(a, 1800, t, 0.04, 'square', 0.12); break;
    case 'whoosh': noise(a, t, 0.5, 0.35); break;
    case 'pop': tone(a, 600, t, 0.12, 'sine', 0.3, 180); break;
    case 'rise': tone(a, 300, t, 0.5, 'triangle', 0.2, 1200); break;
    case 'bell': tone(a, 880, t, 1.2, 'sine', 0.2); tone(a, 1320, t, 0.9, 'sine', 0.08); break;
    case 'drum': tone(a, 140, t, 0.3, 'sine', 0.5, 50); noise(a, t, 0.08, 0.15, 2000, 800); break;
    default: tone(a, 1046.5, t, 0.6, 'sine', 0.18); tone(a, 1568, t + 0.08, 0.6, 'sine', 0.12); break;
  }
};
