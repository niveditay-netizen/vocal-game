import './style.css';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { createElement, Mic, Loader2 } from 'lucide';
import { createPitchTracker, NOTE_NAMES } from './audio.js';
import { initSfx, playPop, playMiss } from './sfx.js';
import { SONG_LIST, SONGS } from './songs.js';

// Lanes are drawn highest-pitch on top. Row 0 = B (top) ... Row 11 = C (bottom).
// noteClass 0..11 = C..B, so row = 11 - noteClass.
const rowForNoteClass = (nc) => 11 - nc;

const LANE_COLORS = [
  0xff385c, 0xff6b4a, 0xff9470, 0xc4a882, 0x8fad88, 0x6aab9a,
  0x5898b0, 0x5b85c4, 0x7b72c4, 0xa86ea8, 0xc46888, 0x9a5568,
];

const ACCENT = 0xff385c;
const INK = 0x222222;
const MUTED = 0x717171;
const FONT = 'Inter, system-ui, sans-serif';
const GLASS = 0xe8e2da; // warm glass tint — avoids pure-white wash
const LINE = 0xb8aea4;

const CALIB_R = 120;

function setStartIcon(Icon = Mic) {
  startBtn.replaceChildren(createElement(Icon, { width: 26, height: 26, 'stroke-width': 1.75 }));
}

function layoutCalibration() {
  const { W, H } = layout;
  calibGroup.position.set(W / 2, H / 2);
  calibNote.position.set(0, 0);
  calibPrompt.position.set(0, CALIB_R + 36);
}
const CALIBRATION_HOLD_MS = 5_000;

// --- Phase 3 gameplay tunables ---
const ZONE_FRAC = 0.6;
const LANE_COOLDOWN_MS = 300;
const SHAPE_RADIUS = 24;

const DIFFICULTY = {
  easy:   { spawnIntervalMs: 2000, shapeSpeed: 120 },
  normal: { spawnIntervalMs: 1400, shapeSpeed: 155 },
  hard:   { spawnIntervalMs: 950,  shapeSpeed: 195 },
};

let spawnIntervalMs = DIFFICULTY.easy.spawnIntervalMs;
let shapeSpeed = DIFFICULTY.easy.shapeSpeed;

const TOP_BAR_H = 52;

const tracker = createPitchTracker();

let game = 'idle'; // 'idle' | 'calibrating' | 'playing'
let paused = false;
let calibrationHeld = 0; // ms accumulated holding a steady pitch
let calibPitchSum = 0;
let calibPitchCount = 0;

// gameplay state
const shapes = []; // { lane, x, r, color, alive, spin }
const particles = []; // { x, y, vx, vy, rot, vr, size, life, max, color }
const rings = []; // shockwaves { x, y, life, max, color }
const laneFlash = new Array(12).fill(0); // ms remaining of a lane flash
const laneCooldown = new Array(12).fill(0); // ms remaining before a lane can pop again
let spawnTimer = 0;
let score = 0;
let combo = 0;
let comboPulse = 0; // 0..1 scale-pulse on the combo readout
let trauma = 0; // 0..1 screen-shake intensity (decays each frame)
let spawnSeed = 1; // deterministic-ish lane picker (free play)

// song mode
let activeSong = null; // parsed song or null for free play
let songClock = 0;
let songEventIdx = 0;

// --- DOM overlay (just the start button + status) ---
const startBtn = document.getElementById('start');
const pauseBtn = document.getElementById('pause');
const skipCalibBtn = document.getElementById('skip-calib');
const hudCard = document.getElementById('hud-card');
const scoreDisplay = document.getElementById('score-display');
const comboDisplay = document.getElementById('combo-display');
const difficultySelect = document.getElementById('difficulty');
const songSelect = document.getElementById('song-select');
const readout = document.getElementById('readout');
const statusEl = document.getElementById('status');
readout.remove(); // Pixi handles the visuals now

for (const { id, title } of SONG_LIST) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = title;
  songSelect.appendChild(opt);
}

const app = new Application();

async function boot() {
  await app.init({
    resizeTo: window,
    antialias: true,
    backgroundAlpha: 0,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  document.getElementById('app').appendChild(app.canvas);

  buildScene();
  app.ticker.add(loop);
}

// --- Scene graph ---
let layout;
const laneLayer = new Container();
const labelLayer = new Container();
const dynLayer = new Container(); // redrawn each frame (highlights, voice marker)
const gameLayer = new Container(); // wraps everything that belongs to the playfield
const calibLayer = new Container();
const laneLines = [];
const laneLabels = [];
let hitZone;
let calibCircle, calibNote, calibPrompt;
const calibGroup = new Container();
const dynGfx = new Graphics();
const shapeGfx = new Graphics(); // shapes + particles, redrawn each frame
const flashGfx = new Graphics(); // full-screen flash on pop
let flashAmt = 0;
let flashColor = 0xffffff;

function computeLayout() {
  const W = app.screen.width;
  const H = app.screen.height;
  const padX = 80;
  const padY = TOP_BAR_H + 12;
  const bottomPad = 24;
  const laneH = (H - padY - bottomPad) / 12;
  const laneRight = W - 20;
  const zoneRight = padX + (laneRight - padX) * ZONE_FRAC;
  return { W, H, padX, padY, laneH, laneRight, zoneRight, spawnX: laneRight + SHAPE_RADIUS };
}

function buildScene() {
  gameLayer.addChild(laneLayer, labelLayer, dynLayer, shapeGfx);
  app.stage.addChild(gameLayer, calibLayer);
  dynLayer.addChild(dynGfx);
  gameLayer.visible = false;
  layout = computeLayout();

  // Hit zone band (where shapes will need to be crushed later)
  hitZone = new Graphics();
  laneLayer.addChild(hitZone);

  for (let row = 0; row < 12; row++) {
    const nc = 11 - row;
    const line = new Graphics();
    laneLayer.addChild(line);
    laneLines.push(line);

    const label = new Text({
      text: NOTE_NAMES[nc],
      style: { fill: MUTED, fontSize: 15, fontWeight: '500', fontFamily: FONT },
    });
    label.anchor.set(0.5);
    labelLayer.addChild(label);
    laneLabels.push(label);
  }

  // Calibration screen: a single large circle that shows the note you're singing.
  calibCircle = new Graphics();
  calibNote = new Text({
    text: '',
    style: { fill: INK, fontSize: 72, fontWeight: '600', fontFamily: FONT, align: 'center' },
  });
  calibNote.anchor.set(0.5);
  calibPrompt = new Text({
    text: 'Sing the note you\u2019d call C',
    style: { fill: MUTED, fontSize: 18, fontWeight: '400', fontFamily: FONT, align: 'center' },
  });
  calibPrompt.anchor.set(0.5);
  calibGroup.addChild(calibCircle, calibNote, calibPrompt);
  calibLayer.addChild(calibGroup);
  calibLayer.visible = false;

  gameLayer.addChild(flashGfx);

  setStartIcon();
  startBtn.setAttribute('aria-label', 'Start microphone');

  drawStatic();
  window.addEventListener('resize', () => {
    layout = computeLayout();
    drawStatic();
  });
}

function laneY(row) {
  return layout.padY + layout.laneH * row + layout.laneH / 2;
}

function drawGlossyOrb(gfx, x, y, r, color, { ghost = false, fillAlpha = 0.58 } = {}) {
  if (ghost) {
    gfx.circle(x, y, r).fill({ color, alpha: 0.12 });
    gfx.circle(x, y, r).stroke({ color, width: 1.5, alpha: 0.45 });
    gfx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.34, r * 0.22).fill({ color: GLASS, alpha: 0.14 });
    return;
  }
  gfx.circle(x, y, r + 1.5).fill({ color: GLASS, alpha: 0.08 });
  gfx.circle(x, y, r).fill({ color, alpha: fillAlpha });
  gfx.circle(x, y, r).stroke({ color: GLASS, width: 1.5, alpha: 0.35 });
  gfx.ellipse(x - r * 0.28, y - r * 0.32, r * 0.4, r * 0.26).fill({ color: GLASS, alpha: 0.22 });
  gfx.ellipse(x + r * 0.12, y + r * 0.22, r * 0.18, r * 0.12).fill({ color: GLASS, alpha: 0.08 });
}

function drawStatic() {
  const { W, padX, padY, laneH, laneRight, zoneRight } = layout;

  // Frosted playfield panel
  hitZone.clear();
  hitZone
    .roundRect(padX - 14, padY - 10, laneRight - padX + 28, laneH * 12 + 20, 18)
    .fill({ color: GLASS, alpha: 0.14 })
    .stroke({ color: GLASS, width: 1, alpha: 0.32 });

  // Hit zone — subtle glass tint
  hitZone
    .rect(padX, padY, zoneRight - padX, laneH * 12)
    .fill({ color: GLASS, alpha: 0.06 });
  hitZone
    .moveTo(zoneRight, padY)
    .lineTo(zoneRight, padY + laneH * 12)
    .stroke({ color: LINE, alpha: 0.45, width: 1 });

  for (let row = 0; row < 12; row++) {
    const nc = 11 - row;
    const y = laneY(row);
    const line = laneLines[row];
    line.clear();
    line
      .moveTo(padX, y)
      .lineTo(W - 20, y)
      .stroke({ color: LINE, alpha: row === 0 || row === 11 ? 0.55 : 0.35, width: 1 });

    const label = laneLabels[row];
    label.x = padX - 36;
    label.y = y;
    label.style.fill = LANE_COLORS[nc];
  }

  // calibration layout (group is centered on screen)
  layoutCalibration();
}

// --- Per-frame loop ---
function loop(ticker) {
  if (game === 'idle' || paused) return;

  const s = tracker.update();
  const dt = ticker.deltaMS;

  if (game === 'calibrating') {
    updateCalibration(s, dt);
  } else if (game === 'playing') {
    updatePlaying(s, dt);
    drawDynamic(s);
    drawShapes();
  }
}

function applyDifficulty(key) {
  const d = DIFFICULTY[key] ?? DIFFICULTY.easy;
  spawnIntervalMs = d.spawnIntervalMs;
  shapeSpeed = d.shapeSpeed;
}

function formatScore(n) {
  return String(n).padStart(6, '0');
}

function updateHud() {
  scoreDisplay.textContent = formatScore(score);
  comboDisplay.textContent = combo >= 2 ? `${combo}× combo` : '';
  comboDisplay.style.transform = `scale(${1 + comboPulse * 0.35})`;
}

function getSpawnLeadMs() {
  const travel = layout.spawnX - layout.zoneRight;
  return (travel / shapeSpeed) * 1000;
}

function applySong(id) {
  activeSong = id ? SONGS[id] ?? null : null;
}

function restartRound() {
  shapes.length = 0;
  particles.length = 0;
  rings.length = 0;
  laneFlash.fill(0);
  laneCooldown.fill(0);
  spawnTimer = 0;
  songClock = 0;
  songEventIdx = 0;
  score = 0;
  combo = 0;
  comboPulse = 0;
  trauma = 0;
  flashAmt = 0;
  gameLayer.x = 0;
  gameLayer.y = 0;
  paused = false;
  pauseBtn.setAttribute('aria-pressed', 'false');
  pauseBtn.setAttribute('aria-label', 'Pause');
  shapeGfx.clear();
  dynGfx.clear();
  flashGfx.clear();
  updateHud();
}

function nextLane() {
  // simple LCG so we don't depend on Math.random (unavailable in some contexts)
  spawnSeed = (spawnSeed * 1103515245 + 12345) & 0x7fffffff;
  // use upper bits: raw % 12 only ever hits 7 lanes and heavily favors 0, 4, 8
  return (spawnSeed >>> 16) % 12;
}

function spawnShapeInLane(lane) {
  shapes.push({ lane, x: layout.spawnX, r: SHAPE_RADIUS, color: LANE_COLORS[lane], alive: true, spin: 0 });
}

function spawnShape() {
  spawnShapeInLane(nextLane());
}

function updateSongSpawns() {
  if (!activeSong) return;
  const leadMs = getSpawnLeadMs();
  while (songEventIdx < activeSong.notes.length) {
    const ev = activeSong.notes[songEventIdx];
    if (songClock < ev.t - leadMs) break;
    spawnShapeInLane(ev.n);
    songEventIdx += 1;
  }
}

function burst(x, y, color, power = 1) {
  const n = Math.round(16 * power);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const sp = (140 + Math.random() * 160) * power;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 16,
      size: 3 + Math.random() * 5,
      life: 0, max: 350 + Math.random() * 250, color,
    });
  }
  rings.push({ x, y, life: 0, max: 320, color });
}

function updatePlaying(s, dt) {
  const dts = dt / 1000;

  // tick lane cooldowns
  for (let i = 0; i < 12; i++) laneCooldown[i] = Math.max(0, laneCooldown[i] - dt);

  if (activeSong) {
    songClock += dt;
    updateSongSpawns();
  } else {
    spawnTimer += dt;
    if (spawnTimer >= spawnIntervalMs) {
      spawnTimer -= spawnIntervalMs;
      spawnShape();
    }
  }

  // move shapes; flag misses
  for (const sh of shapes) {
    if (!sh.alive) continue;
    sh.x -= shapeSpeed * dts;
    sh.spin += dts * 1.5;
    if (sh.x < layout.padX - sh.r) {
      sh.alive = false;
      combo = 0;
      updateHud();
      trauma = Math.min(1, trauma + 0.45);
      playMiss();
    }
  }

  // collision: sung note pops the NEAREST in-zone shape in its lane (then lane cooldown)
  const nc = s.activeNoteClass;
  if (nc !== null && laneCooldown[nc] === 0) {
    let target = null;
    for (const sh of shapes) {
      if (sh.alive && sh.lane === nc && sh.x <= layout.zoneRight) {
        if (!target || sh.x < target.x) target = sh; // nearest to the left edge
      }
    }
    if (target) {
      target.alive = false;
      laneCooldown[nc] = LANE_COOLDOWN_MS;
      combo += 1;
      score += 10 * Math.max(1, combo);
      comboPulse = 1;
      updateHud();

      const y = laneY(rowForNoteClass(nc));
      burst(target.x, y, target.color, 1 + Math.min(1.2, combo * 0.1));
      laneFlash[nc] = 180;
      trauma = Math.min(1, trauma + 0.22 + Math.min(0.2, combo * 0.02));
      flashAmt = Math.min(0.5, flashAmt + 0.12);
      flashColor = 0xffffff;
      playPop(nc, combo);
    }
  }

  // decay juice timers
  trauma = Math.max(0, trauma - dt / 350);
  flashAmt = Math.max(0, flashAmt - dt / 220);
  comboPulse = Math.max(0, comboPulse - dt / 250);
  if (comboPulse <= 0) comboDisplay.style.transform = 'scale(1)';
  else updateHud();
  for (let i = 0; i < 12; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt);

  // advance particles + rings, prune dead entities
  for (const p of particles) {
    p.life += dt;
    p.x += p.vx * dts;
    p.y += p.vy * dts;
    p.rot += p.vr * dts;
    p.vx *= 0.9;
    p.vy *= 0.9;
  }
  for (const ring of rings) ring.life += dt;
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life >= particles[i].max) particles.splice(i, 1);
  for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life >= rings[i].max) rings.splice(i, 1);
  for (let i = shapes.length - 1; i >= 0; i--) if (!shapes[i].alive) shapes.splice(i, 1);

  // apply screen shake to the playfield (HUD stays put)
  const sh = trauma * trauma;
  gameLayer.x = (Math.random() * 2 - 1) * 16 * sh;
  gameLayer.y = (Math.random() * 2 - 1) * 16 * sh;

  // full-screen flash
  flashGfx.clear();
  if (flashAmt > 0.001) {
    flashGfx.rect(-30, -30, layout.W + 60, layout.H + 60).fill({ color: flashColor, alpha: flashAmt * 0.18 });
  }
}

function drawShapes() {
  const { padX, laneH, laneRight } = layout;
  shapeGfx.clear();

  // lane flashes (a popped lane briefly lights its whole row)
  for (let nc = 0; nc < 12; nc++) {
    if (laneFlash[nc] <= 0) continue;
    const a = (laneFlash[nc] / 180) * 0.12;
    const y = laneY(rowForNoteClass(nc));
    shapeGfx.rect(padX, y - laneH / 2, laneRight - padX, laneH).fill({ color: LANE_COLORS[nc], alpha: a });
  }

  for (const sh of shapes) {
    const y = laneY(rowForNoteClass(sh.lane));
    const inZone = sh.x <= layout.zoneRight;
    drawGlossyOrb(shapeGfx, sh.x, y, sh.r, sh.color, { ghost: !inZone });
  }

  // shockwave rings
  for (const ring of rings) {
    const t = ring.life / ring.max;
    const radius = 10 + t * 70;
    shapeGfx.circle(ring.x, ring.y, radius).stroke({ color: GLASS, width: 2 * (1 - t), alpha: (1 - t) * 0.35 });
  }

  // shards — tiny glass specks
  for (const p of particles) {
    const t = 1 - p.life / p.max;
    drawGlossyOrb(shapeGfx, p.x, p.y, p.size * 0.7, p.color, { fillAlpha: t * 0.55 });
  }
}

function drawDynamic(s) {
  const { W, padX, laneH } = layout;
  dynGfx.clear();

  const nc = s.activeNoteClass;
  if (nc !== null) {
    const row = rowForNoteClass(nc);
    const y = laneY(row);
    const color = LANE_COLORS[nc];

    // active lane — tinted highlight
    dynGfx
      .rect(padX, y - laneH / 2, W - padX - 20, laneH)
      .fill({ color, alpha: 0.1 });
    dynGfx
      .moveTo(padX, y)
      .lineTo(W - 20, y)
      .stroke({ color, alpha: 0.55, width: 2 });

    // voice marker — glossy bead
    const cents = s.note ? s.note.cents : 0;
    const markerY = y - (cents / 50) * (laneH / 2.5);
    drawGlossyOrb(dynGfx, padX + 30, markerY, 10, color, { fillAlpha: 0.55 });

    // brighten the active label
    laneLabels[row].scale.set(1.12);
    laneLabels[row].style.fill = color;
  }

  // reset non-active label scales
  for (let row = 0; row < 12; row++) {
    if (nc === null || row !== rowForNoteClass(nc)) {
      laneLabels[row].scale.set(1);
      laneLabels[row].style.fill = LANE_COLORS[11 - row];
    }
  }
}

function finishCalibration() {
  if (calibPitchCount > 0) {
    tracker.setReferenceHz(calibPitchSum / calibPitchCount);
  }
  startPlaying();
}

function updateCalibration(s, dt) {
  const sustaining = s.note !== null && s.pitch > 0;
  if (sustaining) {
    calibrationHeld = Math.min(CALIBRATION_HOLD_MS, calibrationHeld + dt);
    calibPitchSum += s.pitch;
    calibPitchCount += 1;
  } else {
    calibrationHeld = Math.max(0, calibrationHeld - dt * 1.5);
  }

  const pct = calibrationHeld / CALIBRATION_HOLD_MS;
  const R = CALIB_R;
  const secsLeft = Math.ceil((CALIBRATION_HOLD_MS - calibrationHeld) / 1000);

  calibCircle.clear();
  calibCircle.circle(0, 0, R + 6).fill({ color: GLASS, alpha: 0.08 });
  calibCircle.circle(0, 0, R).fill({ color: GLASS, alpha: sustaining ? 0.22 : 0.16 });
  calibCircle.circle(0, 0, R).stroke({ color: GLASS, width: 1.5, alpha: 0.38 });
  if (pct > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + pct * Math.PI * 2;
    calibCircle
      .moveTo(R * Math.cos(startAngle), R * Math.sin(startAngle))
      .arc(0, 0, R, startAngle, endAngle)
      .stroke({ color: ACCENT, width: 4, cap: 'round', alpha: 0.9 });
  }

  // During calibration show absolute pitch; after, gameplay uses relative mapping.
  calibNote.text = s.note ? `${s.note.name}${s.note.octave}` : '';
  calibNote.style.fill = sustaining ? ACCENT : INK;

  if (sustaining && calibrationHeld > 0) {
    calibPrompt.text = secsLeft > 0 ? `Keep holding\u2026 ${secsLeft}s` : 'Almost there…';
  } else {
    calibPrompt.text = 'Sing the note you\u2019d call C';
  }

  if (calibrationHeld >= CALIBRATION_HOLD_MS) {
    finishCalibration();
  }
}

function startCalibrating() {
  game = 'calibrating';
  paused = false;
  calibrationHeld = 0;
  calibPitchSum = 0;
  calibPitchCount = 0;
  tracker.clearReference();
  layoutCalibration();
  calibLayer.visible = true;
  gameLayer.visible = false;
  hudCard.classList.add('hidden');
  skipCalibBtn.classList.remove('hidden');
}

function togglePause() {
  paused = !paused;
  pauseBtn.setAttribute('aria-pressed', String(paused));
  pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
}

function startPlaying() {
  game = 'playing';
  calibLayer.visible = false;
  gameLayer.visible = true;
  skipCalibBtn.classList.add('hidden');
  hudCard.classList.remove('hidden');
  applyDifficulty(difficultySelect.value);
  applySong(songSelect.value);
  restartRound();
}

// --- Start flow ---
applyDifficulty(difficultySelect.value);
applySong(songSelect.value);

difficultySelect.addEventListener('change', () => {
  applyDifficulty(difficultySelect.value);
  if (game === 'playing') restartRound();
});

songSelect.addEventListener('change', () => {
  applySong(songSelect.value);
  if (game === 'playing') restartRound();
});

pauseBtn.addEventListener('click', togglePause);
skipCalibBtn.addEventListener('click', () => {
  tracker.clearReference();
  startPlaying();
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  if (game !== 'playing') return;
  const tag = e.target?.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault();
  togglePause();
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  setStartIcon(Loader2);
  try {
    const { sampleRate } = await tracker.start();
    await initSfx();
    startBtn.remove();
    startCalibrating();
  } catch (err) {
    statusEl.textContent = `Mic access failed: ${err.message}`;
    startBtn.disabled = false;
    setStartIcon(Mic);
  }
});

boot();
