# Pitch Smash

**An ear training game where your voice is the controller.**

Sing notes to smash orbs. Learn to recognize notes by ear. Progress through 6 levels from a single note all the way to the full chromatic scale.

**Live at [pitch-smash.vercel.app](https://pitch-smash.vercel.app)**

Built with [PixiJS 8](https://pixijs.com/) (WebGL) and real-time pitch detection in the browser. The mic stream is analyzed locally — nothing leaves your machine.

---

## How it works

### Train & Unlock
Work through 6 levels in order. Each level has two phases:

**Learn** — The note plays through the speaker. Sing it back and hold it to confirm you've got it. Multi-note levels walk you through each note in the set.

**Test** — The note plays and you pick the name from colored buttons. This is actual ear training — you identify the note by sound, not by singing it back.

Complete all 6 levels to unlock the Smash game.

| Level | Name | Notes |
|---|---|---|
| 1 | One Note | C |
| 2 | Perfect Fifth | C G |
| 3 | Major Triad | C E G |
| 4 | Pentatonic | C D E G A |
| 5 | Full Scale | C D E F G A B |
| 6 | Chromatic | All 12 notes |

### Smash
A 60-second game using all notes from your unlocked levels. Orbs drift in from the right — sing the matching note while the orb is in the strike zone to smash it. Stack combos. Hit 80% accuracy to clear the round.

### Free Play
No unlocking required. Two modes:

- **Random** — 1-minute round with randomized orbs across all 12 lanes. Shows score, accuracy and grade at the end.
- **Song** — Pick from 10 charted songs. Orbs follow the melody with synced lyrics. Play the whole song, then see your results.

Free play features:
- 30-second check-ins with accuracy and encouragement
- Combo milestone toasts at 10×, 25×, 50×, 100×
- Song progress timer (elapsed / total)
- 3-2-1-GO! countdown on start and song change
- Grade (S / A / B / C / D) on the results screen

---

## Songs

10 songs included, all with synced lyrics:

- Hot Cross Buns
- Twinkle Twinkle Little Star
- Happy Birthday
- Mary Had a Little Lamb
- Amazing Grace
- Jingle Bells
- Ode to Joy
- Do Re Mi
- We Wish You a Merry Christmas
- Over the Rainbow

---

## Tech

| | |
|---|---|
| Rendering | PixiJS 8 (WebGL) |
| Pitch detection | [`pitchy`](https://github.com/ianprime0509/pitchy) — McLeod pitch method over Web Audio `AnalyserNode` |
| Sound | Web Audio API — oscillators + noise, synthesized live, no audio files |
| Build | Vite |

### Project structure
```
src/
  main.js      game loop, scene graph, all UI and game logic
  audio.js     mic capture + pitch tracking
  sfx.js       synthesized sound effects (pop, miss, tone, success, wrong)
  songs.js     song loader and note → lane parsing
  levels.js    level definitions (notes, colors, names)
  progress.js  localStorage-backed unlock state
songs/         song charts (JSON with timing + lyrics)
```

---

## Run locally

Requires Node 18+.

```bash
npm install
npm run dev      # http://localhost:5174
```

```bash
npm run build    # production build → dist/
npm run preview  # serve the build locally
```

Microphone access requires a secure context — `localhost` works; any other host needs HTTPS.

---

## Add a song

Drop a JSON file in `songs/` and register it in `src/songs.js`:

```json
{
  "title": "My Song",
  "bpm": 120,
  "notes": [
    { "t": 0,    "note": "C", "lyric": "do" },
    { "t": 500,  "note": "D", "lyric": "re" },
    { "t": 1000, "note": "E", "lyric": "mi" }
  ]
}
```

`t` is milliseconds when the orb reaches the strike zone. `lyric` is optional — shown as a banner at the bottom while the orb approaches.
