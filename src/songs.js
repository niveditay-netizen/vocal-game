import { NOTE_NAMES } from './audio.js';
import hotCrossBuns from '../songs/hot-cross-buns.json';
import twinkle from '../songs/twinkle.json';
import happyBirthday from '../songs/happy-birthday.json';
import overTheRainbow from '../songs/over-the-rainbow.json';
import maryLamb from '../songs/mary-had-a-little-lamb.json';
import amazingGrace from '../songs/amazing-grace.json';
import jingleBells from '../songs/jingle-bells.json';
import odeToJoy from '../songs/ode-to-joy.json';
import doReMi from '../songs/do-re-mi.json';
import merryChristmas from '../songs/we-wish-you-merry-christmas.json';

function noteToClass(name) {
  const i = NOTE_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Unknown note in song: ${name}`);
  return i;
}

export function parseSong(raw) {
  const notes = raw.notes
    .map(({ t, note, n, lyric }) => ({ t, n: n ?? noteToClass(note), lyric: lyric ?? '' }))
    .sort((a, b) => a.t - b.t);
  return { title: raw.title, bpm: raw.bpm, notes };
}

export const SONG_LIST = [
  { id: 'hot-cross-buns',              title: 'Hot Cross Buns' },
  { id: 'twinkle',                     title: 'Twinkle Twinkle' },
  { id: 'happy-birthday',              title: 'Happy Birthday' },
  { id: 'mary-had-a-little-lamb',      title: 'Mary Had a Little Lamb' },
  { id: 'amazing-grace',               title: 'Amazing Grace' },
  { id: 'jingle-bells',                title: 'Jingle Bells' },
  { id: 'ode-to-joy',                  title: 'Ode to Joy' },
  { id: 'do-re-mi',                    title: 'Do Re Mi' },
  { id: 'we-wish-you-merry-christmas', title: 'We Wish You a Merry Christmas' },
  { id: 'over-the-rainbow',            title: 'Over the Rainbow' },
];

export const SONGS = {
  'hot-cross-buns':              parseSong(hotCrossBuns),
  'twinkle':                     parseSong(twinkle),
  'happy-birthday':              parseSong(happyBirthday),
  'over-the-rainbow':            parseSong(overTheRainbow),
  'mary-had-a-little-lamb':      parseSong(maryLamb),
  'amazing-grace':               parseSong(amazingGrace),
  'jingle-bells':                parseSong(jingleBells),
  'ode-to-joy':                  parseSong(odeToJoy),
  'do-re-mi':                    parseSong(doReMi),
  'we-wish-you-merry-christmas': parseSong(merryChristmas),
};
