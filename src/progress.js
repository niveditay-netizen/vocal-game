const UNLOCKED_KEY = 'ps_unlockedLevels';
const SONGS_KEY = 'ps_songLibraryUnlocked';

export function getUnlockedLevels() {
  try {
    const val = localStorage.getItem(UNLOCKED_KEY);
    if (!val) return new Set([1]);
    return new Set(val.split(',').map(Number).filter(Boolean));
  } catch {
    return new Set([1]);
  }
}

export function unlockLevel(id) {
  const unlocked = getUnlockedLevels();
  unlocked.add(id);
  try {
    localStorage.setItem(UNLOCKED_KEY, [...unlocked].join(','));
  } catch {}
}

export function isLevelUnlocked(id) {
  return getUnlockedLevels().has(id);
}

export function isSongLibraryUnlocked() {
  try {
    return localStorage.getItem(SONGS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function unlockSongLibrary() {
  try {
    localStorage.setItem(SONGS_KEY, 'true');
  } catch {}
}
