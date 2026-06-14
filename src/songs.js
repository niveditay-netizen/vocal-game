import { NOTE_NAMES } from './audio.js';
import hotCrossBuns from '../songs/hot-cross-buns.json';
import twinkle from '../songs/twinkle.json';

function noteToClass(name) {
  const i = NOTE_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Unknown note in song: ${name}`);
  return i;
}

/** Normalize raw JSON into sorted { t, n } events (t = ms when note reaches hit zone). */
export function parseSong(raw) {
  const notes = raw.notes
    .map(({ t, note, n }) => ({ t, n: n ?? noteToClass(note) }))
    .sort((a, b) => a.t - b.t);
  return { title: raw.title, bpm: raw.bpm, notes };
}

export const SONG_LIST = [
  { id: 'hot-cross-buns', title: 'Hot Cross Buns' },
  { id: 'twinkle', title: 'Twinkle Twinkle' },
];

export const SONGS = {
  'hot-cross-buns': parseSong(hotCrossBuns),
  'twinkle': parseSong(twinkle),
};
