# 🎤 Vocal Game

**Your voice is the controller.** Shapes glide in from the right on twelve note-lanes — sing the right note and they shatter. Miss one and it slips past. No keyboard, no mouse, no buttons. Just you and the scale.

Built with [PixiJS](https://pixijs.com/) (WebGL) and real-time pitch detection in the browser. Nothing leaves your machine — the mic stream is analyzed locally and never uploaded.

---

## How it plays

1. **Tap the mic button** and grant microphone access.
2. **Calibrate** — sing and hold *any* comfortable note and call it your "C". The game tunes itself to *your* voice, so it works whatever your range.
3. **Sing to smash.** Glossy orbs drift in across 12 lanes (one per chromatic note). Hit a lane's note while its orb is in the strike zone and it bursts — with a sound *pitched to that very note*, so clearing shapes literally plays music.
4. **Stack combos.** Consecutive hits multiply your score and layer in a shimmer; let an orb escape and your combo resets with a thud.

### Modes
- **Free play** — endless, randomized spawns.
- **Songs** — *Hot Cross Buns* and *Twinkle Twinkle* are charted out; sing the melody to clear them.
- **Difficulty** — Easy / Normal / Hard tune spawn rate and speed.
- **Pause** anytime with the pause button or the **Spacebar**.

---

## Why it feels good

- **Octave-agnostic.** Singing a C in *any* octave hits the C lane — every voice can play.
- **Forgiving by design.** A wide strike zone plus pitch-stability smoothing absorbs mic latency and tuning wobble, so it rewards hitting the *note*, not frame-perfect timing.
- **No spam-cheese.** Each lane has a brief cooldown after a pop, so you can't just glissando up the scale to clear the board.
- **Juice.** Screen shake, shockwave rings, lane flashes, glass-shard particles, and per-note synthesized audio — all generated at runtime, zero asset files.

---

## Tech

| Concern | Choice |
|---|---|
| Rendering | PixiJS 8 (WebGL) |
| Pitch detection | [`pitchy`](https://github.com/ianprime0509/pitchy) (McLeod pitch method) over Web Audio `AnalyserNode` |
| Sound | Web Audio API — oscillators + noise, synthesized live |
| Icons | `lucide` |
| Build | Vite |

### Project structure
```
src/
  main.js     game loop, scene graph, input, UI wiring
  audio.js    mic capture + pitch tracking (absolute & calibration-relative)
  sfx.js      synthesized pop / miss / combo sounds
  songs.js    song loader + note→lane parsing
songs/        song charts (JSON)
```

---

## Run it locally

Requires **Node 18+**.

```bash
npm install
npm run dev      # http://localhost:5173
```

Build for production:

```bash
npm run build    # outputs to dist/
npm run preview  # serve the build locally
```

> **Heads up:** microphone access requires a secure context — `localhost` works out of the box; any other host needs HTTPS.

---

## Add your own song

Drop a JSON file in `songs/`:

```json
{
  "title": "My Tune",
  "bpm": 120,
  "notes": [
    { "t": 0,    "note": "C" },
    { "t": 500,  "note": "D" },
    { "t": 1000, "note": "E" }
  ]
}
```

`t` is the time in milliseconds when the orb should reach the strike zone; `note` is its pitch class (`C`, `C#`, … `B`). Register it in `src/songs.js` and it appears in the song picker.

---

## Tuning

The feel-knobs live at the top of `src/main.js`:

```js
const ZONE_FRAC = 0.6;          // how much of the lane is "strikeable"
const LANE_COOLDOWN_MS = 300;   // anti-spam cooldown after a pop
const DIFFICULTY = { ... };     // spawn interval + shape speed per level
const CALIBRATION_HOLD_MS = 5000;
```

---

Made for fun. Bring your voice. 🎶
