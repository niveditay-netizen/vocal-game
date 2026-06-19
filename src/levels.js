import { NOTE_NAMES } from './audio.js';

export const LEVELS = [
  {
    id: 1,
    name: 'One Note',
    subtitle: 'Just C',
    notes: ['C'],
    color: '#FF4757',
    description: 'Learn to lock in on a single pitch.',
  },
  {
    id: 2,
    name: 'Perfect Fifth',
    subtitle: 'C + G',
    notes: ['C', 'G'],
    color: '#FF8C42',
    description: 'Add the fifth — the strongest interval.',
  },
  {
    id: 3,
    name: 'Major Triad',
    subtitle: 'C + E + G',
    notes: ['C', 'E', 'G'],
    color: '#FFA502',
    description: 'Three notes that make a chord.',
  },
  {
    id: 4,
    name: 'Pentatonic',
    subtitle: '5 Notes',
    notes: ['C', 'D', 'E', 'G', 'A'],
    color: '#2ED573',
    description: 'Five notes that power most pop melodies.',
  },
  {
    id: 5,
    name: 'Full Scale',
    subtitle: '7 Notes',
    notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    color: '#1E90FF',
    description: 'The complete major scale.',
  },
  {
    id: 6,
    name: 'Chromatic',
    subtitle: 'All 12',
    notes: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    color: '#A29BFE',
    description: 'Every note. The final challenge.',
  },
];

export function noteNameToClass(name) {
  const i = NOTE_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Unknown note: ${name}`);
  return i;
}

export function levelNoteClasses(level) {
  return level.notes.map(noteNameToClass);
}
