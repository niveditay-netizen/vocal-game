import { PitchDetector } from 'pitchy';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Tuning knobs ---
const CLARITY_THRESHOLD = 0.9; // pitchy confidence 0..1
const RMS_GATE = 0.01; // ignore quiet/silent input
const MIN_HZ = 70;
const MAX_HZ = 1100;
const STABILITY_FRAMES = 3; // noteClass must repeat this many frames before it's "committed"

function freqToNote(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const midiRounded = Math.round(midi);
  const cents = Math.round((midi - midiRounded) * 100);
  const noteClass = ((midiRounded % 12) + 12) % 12;
  const octave = Math.floor(midiRounded / 12) - 1;
  return { name: NOTE_NAMES[noteClass], octave, cents, noteClass };
}

/** Map freq against a user-calibrated "C" reference (any sustained pitch). */
function freqToRelativeNote(freq, refHz) {
  const deltaMidi = 12 * Math.log2(freq / refHz);
  const midiRounded = Math.round(deltaMidi);
  const cents = Math.round((deltaMidi - midiRounded) * 100);
  const noteClass = ((midiRounded % 12) + 12) % 12;
  const octave = Math.floor(midiRounded / 12);
  return { name: NOTE_NAMES[noteClass], octave, cents, noteClass };
}

function rms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

/**
 * Live pitch tracker. After start(), read state every frame via .state.
 * state = {
 *   level,                // RMS 0..~
 *   pitch, clarity,       // raw detector output (pitch in Hz, or 0)
 *   note,                 // { name, octave, cents, noteClass } or null this frame
 *   activeNoteClass,      // 0..11 stabilized lane, or null. THIS is what the game matches on.
 * }
 * After setReferenceHz(), note classes are relative to the user's calibrated C.
 */
export function createPitchTracker() {
  const state = {
    level: 0,
    pitch: 0,
    clarity: 0,
    note: null,
    activeNoteClass: null,
  };

  let input, detector, analyser, audioCtx;
  let running = false;
  let referenceHz = null; // user-calibrated "C"; null = standard absolute tuning

  // hysteresis: only commit a noteClass once it's been seen STABILITY_FRAMES in a row
  let candidate = null;
  let candidateCount = 0;

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
    });

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    input = new Float32Array(analyser.fftSize);
    detector = PitchDetector.forFloat32Array(analyser.fftSize);
    detector.minVolumeDecibels = -40;

    running = true;
    return { sampleRate: audioCtx.sampleRate };
  }

  // Call once per animation frame.
  function update() {
    if (!running) return state;

    analyser.getFloatTimeDomainData(input);
    state.level = rms(input);

    let detected = null;
    if (state.level >= RMS_GATE) {
      const [pitch, clarity] = detector.findPitch(input, audioCtx.sampleRate);
      state.pitch = pitch;
      state.clarity = clarity;
      if (clarity >= CLARITY_THRESHOLD && pitch >= MIN_HZ && pitch <= MAX_HZ) {
        detected = referenceHz
          ? freqToRelativeNote(pitch, referenceHz)
          : freqToNote(pitch);
      }
    } else {
      state.pitch = 0;
      state.clarity = 0;
    }

    state.note = detected;

    // Stabilize the note class for lane matching
    const nc = detected ? detected.noteClass : null;
    if (nc === candidate) {
      candidateCount++;
    } else {
      candidate = nc;
      candidateCount = 1;
    }

    if (candidate === null) {
      state.activeNoteClass = null;
    } else if (candidateCount >= STABILITY_FRAMES) {
      state.activeNoteClass = candidate;
    }
    // else: keep previous activeNoteClass until the new one stabilizes (avoids flicker)

    return state;
  }

  function setReferenceHz(hz) {
    referenceHz = hz;
  }

  function clearReference() {
    referenceHz = null;
  }

  return { start, update, setReferenceHz, clearReference, state };
}

export { freqToNote, freqToRelativeNote };
