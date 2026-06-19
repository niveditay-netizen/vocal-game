// Synthesized sound effects — no asset files.

let ctx;
let master;

const BASE_C4 = 261.63; // Hz

export async function initSfx() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  await ctx.resume();
}

function noiseBurst(t, duration, gainVal, freq, q) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + duration);
}

// Pop = a plucked tone at the note's pitch + a percussive transient.
export function playPop(noteClass, combo = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const freq = BASE_C4 * Math.pow(2, noteClass / 12);

  noiseBurst(t, 0.06, 0.25, freq * 2, 6);

  for (const [type, detune, gain] of [['triangle', 0, 0.3], ['sine', 0.5, 0.18]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune * 100;
    o.frequency.exponentialRampToValueAtTime(freq * 0.98, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.4);
  }

  if (combo >= 3) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * 2;
    const g = ctx.createGain();
    const amp = Math.min(0.12, 0.03 * (combo - 2));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.3);
  }
}

// Miss = a dull low thud.
export function playMiss() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.35);
  noiseBurst(t, 0.18, 0.15, 200, 1);
}

// Sustained tone for the Learn phase — warm piano-ish note held ~1.2 seconds.
export function playTone(noteClass) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const freq = BASE_C4 * Math.pow(2, noteClass / 12);

  for (const [f, gainPeak, dur] of [[freq, 0.28, 1.3], [freq * 2, 0.07, 1.0]]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.04);
    g.gain.setValueAtTime(gainPeak, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(t, 0.04, 0.08, freq * 3, 8);
}

// Ascending chime for passing a test or clearing a level.
export function playSuccess() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [0, 4, 7, 12].forEach((semitones, i) => {
    const freq = BASE_C4 * Math.pow(2, semitones / 12);
    const start = t + i * 0.12;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    o.connect(g).connect(master);
    o.start(start);
    o.stop(start + 0.55);
  });
}

// Gentle wrong-answer blip.
export function playWrong() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.35);
}
