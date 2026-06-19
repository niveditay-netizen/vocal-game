import './style.css';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { createPitchTracker, NOTE_NAMES } from './audio.js';
import { initSfx, playPop, playMiss, playTone, playSuccess, playWrong } from './sfx.js';
import { SONG_LIST, SONGS } from './songs.js';
import { LEVELS, levelNoteClasses } from './levels.js';
import { getUnlockedLevels, unlockLevel, isLevelUnlocked, isSongLibraryUnlocked, unlockSongLibrary } from './progress.js';

// ── Bright note colors C..B (noteClass 0..11) ────────────
const LANE_COLORS = [
  0xFF4757, 0xFF6348, 0xFFA502, 0xECCC68, 0x7BED9F, 0x2ED573,
  0x00B894, 0x1E90FF, 0x5352ED, 0xA29BFE, 0xFD79A8, 0xE84393,
];
const NOTE_NAMES_CSS = [
  '#FF4757','#FF6348','#FFA502','#ECCC68','#7BED9F','#2ED573',
  '#00B894','#1E90FF','#5352ED','#A29BFE','#FD79A8','#E84393',
];

const INK    = 0x1A1A2E;
const MUTED  = 0x6B7280;
const GLASS  = 0xFFFFFF;
const LINE   = 0xDDD5CB;
const FONT   = "'Nunito', system-ui, sans-serif";

const CALIB_R = 110;
const CALIB_HOLD_MS = 5000;
const TOP_BAR_H = 56; // HUD height in pixels
const ZONE_FRAC = 0.6;
const LANE_COOLDOWN_MS = 300;
const SHAPE_RADIUS = 22;
const SMASH_DURATION_MS = 60_000;
const PASS_THRESHOLD = 0.80;
const LEARN_HOLD_MS = 1500;

const DIFFICULTY = {
  easy:   { spawnIntervalMs: 2000, shapeSpeed: 110 },
  normal: { spawnIntervalMs: 1400, shapeSpeed: 145 },
  hard:   { spawnIntervalMs: 950,  shapeSpeed: 185 },
};

// ── DOM refs ──────────────────────────────────────────────
const elHomeScreen    = document.getElementById('screen-home');
const elLevelMap      = document.getElementById('screen-level-map');
const elLearnScreen   = document.getElementById('screen-learn');
const elTestScreen    = document.getElementById('screen-test');
const elRoundComplete = document.getElementById('screen-round-complete');
const elSmashHud      = document.getElementById('smash-hud');
const elSmashSongRow   = document.getElementById('smash-song-row');
const elFreeHud        = document.getElementById('free-hud');
const elSkipCalib      = document.getElementById('skip-calib');
const elHomeStatus     = document.getElementById('home-status');
const elLevelGrid      = document.getElementById('level-grid');
const elCountdownOverlay = document.getElementById('countdown-overlay');
const elCountdownNum     = document.getElementById('countdown-number');
const elSongEndToast     = document.getElementById('song-end-toast');
const elLyricBanner      = document.getElementById('lyric-banner');
const elFreeTimer        = document.getElementById('free-timer');
const elMilestoneToast   = document.getElementById('milestone-toast');
const elBtnFreeAgain     = document.getElementById('btn-free-again');
const elBtnFreeChangeSong = document.getElementById('btn-free-change-song');

// HUD elements
const elSmashTimer    = document.getElementById('smash-timer');
const elSmashAcc      = document.getElementById('smash-accuracy');
const elSmashScore    = document.getElementById('smash-score');
const elSmashCombo    = document.getElementById('smash-combo');
const elSmashSongSel  = document.getElementById('smash-song-select');
const elFreeScore     = document.getElementById('free-score');
const elFreeCombo     = document.getElementById('free-combo');
const elFreeSongSel   = document.getElementById('free-song-select');
const elFreeDiff      = document.getElementById('free-difficulty');
const elFreePauseBtn  = document.getElementById('free-pause-btn');

// Learn elements
const elLearnDots     = document.getElementById('learn-step-dots');
const elLearnCard     = document.getElementById('learn-note-card');
const elLearnName     = document.getElementById('learn-note-name');
const elLearnDesc     = document.getElementById('learn-note-desc');
const elLearnPlayBtn  = document.getElementById('learn-play-btn');
const elLearnHoldBar  = document.getElementById('learn-hold-bar');
const elLearnPitch    = document.getElementById('learn-pitch-label');
const elLearnResult   = document.getElementById('learn-result');

// Test elements
const elTestQCount    = document.getElementById('test-q-count');
const elTestProgFill  = document.getElementById('test-progress-fill');
const elTestPlayBtn   = document.getElementById('test-play-btn');
const elTestChoices   = document.getElementById('test-choices');
const elTestResult    = document.getElementById('test-result');

// Result elements
const elResultTitle   = document.getElementById('result-title');
const elResultBadge   = document.getElementById('result-badge');
const elResultAcc     = document.getElementById('result-accuracy');
const elResultHits    = document.getElementById('result-hits');
const elResultCombo   = document.getElementById('result-best-combo');
const elResultScore   = document.getElementById('result-score');
const elBtnNextLevel  = document.getElementById('btn-next-level');

// Populate song selects
for (const { id, title } of SONG_LIST) {
  const opt1 = document.createElement('option');
  opt1.value = id; opt1.textContent = title;
  elSmashSongSel.appendChild(opt1);
  const opt2 = document.createElement('option');
  opt2.value = id; opt2.textContent = title;
  elFreeSongSel.appendChild(opt2);
}

// ── Game state ────────────────────────────────────────────
let gameState = 'home'; // home | level-map | learn | test | smash | round-complete | free-calib | free-playing
let trackerActive = false;
let sfxReady = false;
let paused = false;

// Active lanes: noteClasses in display order (highest pitch = index 0 = top of screen)
let activeLanes = [11,10,9,8,7,6,5,4,3,2,1,0]; // default all 12

// Current training state
let currentLevel = null; // LEVELS entry

// Learn state
let learnStep = 0;
let learnHoldMs = 0;
let learnDoneNotes = [];

// Test state
let testQuestions = [];
let testStep = 0;
let testResults = [];
let testTargetNc = -1;
let testAnswered = false;



// Smash state
let smashTimeLeft = SMASH_DURATION_MS;
let smashHits = 0;
let smashMisses = 0;
let smashBestCombo = 0;
let smashMode = 'random'; // 'random' | 'song'
let smashSongId = '';

// Free play state
let freeActiveSong = null;
let freeSpawnIntervalMs = DIFFICULTY.easy.spawnIntervalMs;
let freeShapeSpeed = DIFFICULTY.easy.shapeSpeed;
let freeHitCount = 0;
let freeMissCount = 0;
let freeSpawnedCount = 0;
let freeElapsedMs = 0;
let nextCheckInMs = 30000;
let freeSongEnding = false;
let freeSongEndTimer = 0;
let pendingFreeResults = false;
const FREE_ROUND_MS = 60_000;
const COMBO_MILESTONES = new Set([10, 25, 50, 100]);
let reachedComboMilestones = new Set();
let milestoneToastTimer = null;

// Shared gameplay state
const shapes = [];
const particles = [];
const rings = [];
const laneFlash = new Array(12).fill(0);
const laneCooldown = new Array(12).fill(0);
let spawnTimer = 0;
let activeSong = null;
let songClock = 0;
let songEventIdx = 0;
let currentLyric = '';
let score = 0;
let combo = 0;
let bestCombo = 0;
let comboPulse = 0;
let trauma = 0;
let shapeSpeed = DIFFICULTY.easy.shapeSpeed;
let spawnIntervalMs = DIFFICULTY.easy.spawnIntervalMs;

// Calibration
let calibHeld = 0;
let calibPitchSum = 0;
let calibPitchCount = 0;

const tracker = createPitchTracker();

// ── Screen management ─────────────────────────────────────
const allScreens = [elHomeScreen, elLevelMap, elLearnScreen, elTestScreen, elRoundComplete];
const allHuds = [elSmashHud, elFreeHud];

function showScreen(el) {
  allScreens.forEach(s => s.classList.add('hidden'));
  allHuds.forEach(h => h.classList.add('hidden'));
  elSmashSongRow.classList.add('hidden');
  elSkipCalib.classList.add('hidden');
  if (el) el.classList.remove('hidden');
}

function showHud(el) {
  allHuds.forEach(h => h.classList.add('hidden'));
  if (el) el.classList.remove('hidden');
}

// ── Level Map ─────────────────────────────────────────────
function buildLevelMap() {
  const unlocked = getUnlockedLevels();
  elLevelGrid.innerHTML = '';

  LEVELS.forEach(level => {
    const isUnlocked = unlocked.has(level.id);
    const card = document.createElement('div');
    card.className = `level-card${isUnlocked ? '' : ' locked'}`;
    card.style.setProperty('--level-color', level.color);
    card.style.borderColor = isUnlocked ? level.color + '44' : 'transparent';

    // left accent bar
    const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:5px;border-radius:16px 0 0 16px;background:${level.color};`;
    card.appendChild(bar);

    const num = document.createElement('div');
    num.className = 'level-number';
    num.textContent = level.id;
    num.style.color = level.color;
    card.appendChild(num);

    const info = document.createElement('div');
    info.className = 'level-info';
    info.innerHTML = `<div class="level-name">${level.name}</div><div class="level-subtitle">${level.subtitle}</div>`;
    const notesRow = document.createElement('div');
    notesRow.className = 'level-notes-row';
    level.notes.forEach(n => {
      const chip = document.createElement('span');
      chip.className = 'note-chip';
      chip.textContent = n;
      const nc = NOTE_NAMES.indexOf(n);
      chip.style.background = NOTE_NAMES_CSS[nc] + '22';
      chip.style.color = NOTE_NAMES_CSS[nc];
      notesRow.appendChild(chip);
    });
    info.appendChild(notesRow);
    card.appendChild(info);

    const icon = document.createElement('div');
    icon.className = 'level-status-icon';
    icon.textContent = isUnlocked ? '▶' : '🔒';
    card.appendChild(icon);

    if (isUnlocked) {
      card.addEventListener('click', () => enterLevel(level));
    }
    elLevelGrid.appendChild(card);
  });

  // Smash button — only shown once ALL levels are cleared
  if (isSongLibraryUnlocked()) {
    const smashBtn = document.createElement('button');
    smashBtn.className = 'smash-unlock-btn';
    smashBtn.innerHTML = `<span>🎮</span><span class="smash-btn-text"><span class="smash-btn-title">Smash Mode</span><span class="smash-btn-sub">All notes unlocked — sing to smash!</span></span>`;
    smashBtn.addEventListener('click', () => enterSmash());
    elLevelGrid.appendChild(smashBtn);
  }
}

function enterLevel(level) {
  currentLevel = level;
  learnDoneNotes = [];
  enterLearn(0);
}

// ── Learn Phase ───────────────────────────────────────────
function enterLearn(startStep) {
  gameState = 'learn';
  learnStep = startStep;
  learnHoldMs = 0;
  showScreen(elLearnScreen);

  buildLearnDots();
  showLearnNote(learnStep);
  elLearnResult.classList.add('hidden');
}

function buildLearnDots() {
  elLearnDots.innerHTML = '';
  currentLevel.notes.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'step-dot' + (i < learnStep ? ' done' : i === learnStep ? ' active' : '');
    elLearnDots.appendChild(dot);
  });
}

function showLearnNote(step) {
  const noteName = currentLevel.notes[step];
  const nc = NOTE_NAMES.indexOf(noteName);
  const color = NOTE_NAMES_CSS[nc];
  elLearnName.textContent = noteName;
  elLearnName.style.color = color;
  elLearnDesc.textContent = `This is the note ${noteName}`;
  elLearnCard.style.borderColor = color + '55';
  elLearnCard.style.boxShadow = `0 8px 40px ${color}22`;
  elLearnHoldBar.style.width = '0%';
  elLearnPitch.textContent = '—';
  elLearnPitch.style.color = 'var(--muted)';
  learnHoldMs = 0;
  buildLearnDots();
}

function updateLearnPitch(s, dt) {
  if (gameState !== 'learn') return;
  const targetName = currentLevel.notes[learnStep];
  const targetNc = NOTE_NAMES.indexOf(targetName);
  const nc = s.activeNoteClass;

  if (nc !== null) {
    const noteName = NOTE_NAMES[nc];
    elLearnPitch.textContent = noteName;
    elLearnPitch.style.color = NOTE_NAMES_CSS[nc];
  } else {
    elLearnPitch.textContent = '—';
    elLearnPitch.style.color = 'var(--muted)';
  }

  if (nc === targetNc) {
    learnHoldMs = Math.min(LEARN_HOLD_MS, learnHoldMs + dt);
    elLearnHoldBar.style.width = `${(learnHoldMs / LEARN_HOLD_MS) * 100}%`;
    if (learnHoldMs >= LEARN_HOLD_MS) confirmLearnNote();
  } else {
    learnHoldMs = Math.max(0, learnHoldMs - dt * 1.5);
    elLearnHoldBar.style.width = `${(learnHoldMs / LEARN_HOLD_MS) * 100}%`;
  }
}

function confirmLearnNote() {
  const noteName = currentLevel.notes[learnStep];
  const nc = NOTE_NAMES.indexOf(noteName);
  learnHoldMs = 0;
  elLearnHoldBar.style.width = '0%';

  elLearnResult.textContent = `✓ Got it! Great job on ${noteName}`;
  elLearnResult.className = 'phase-result success';
  playSuccess();

  if (sfxReady) playTone(nc);

  setTimeout(() => {
    elLearnResult.classList.add('hidden');
    if (learnStep + 1 < currentLevel.notes.length) {
      learnStep++;
      showLearnNote(learnStep);
    } else if (currentLevel.notes.length === 1) {
      // Single-note level — no test needed; unlock next level and keep going
      const nextId = currentLevel.id + 1;
      if (nextId <= LEVELS.length) {
        unlockLevel(nextId);
        elLearnResult.textContent = `✓ Level ${nextId} unlocked! Keep going!`;
        elLearnResult.className = 'phase-result success';
        setTimeout(() => {
          currentLevel = LEVELS[nextId - 1];
          enterLearn(0);
        }, 1100);
      }
    } else {
      // All notes learned — move to test
      setTimeout(() => enterTest(), 400);
    }
  }, 900);
}

// ── Test Phase ────────────────────────────────────────────
function buildTestQuestions(notes) {
  // 2 questions per note, capped at 10; minimum 4
  const target = Math.min(10, Math.max(4, notes.length * 2));
  const pool = [];
  while (pool.length < target) pool.push(...notes);
  return shuffleArray(pool).slice(0, target);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function enterTest() {
  gameState = 'test';
  testQuestions = buildTestQuestions(currentLevel.notes);
  testStep = 0;
  testResults = [];
  testAnswered = false;
  showScreen(elTestScreen);
  buildTestChoiceButtons();
  showTestQuestion(0);
}

function buildTestChoiceButtons() {
  elTestChoices.innerHTML = '';
  currentLevel.notes.forEach(noteName => {
    const nc = NOTE_NAMES.indexOf(noteName);
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = noteName;
    btn.style.background = NOTE_NAMES_CSS[nc];
    btn.dataset.nc = String(nc);
    btn.addEventListener('click', () => {
      if (testAnswered) return;
      recordTestAnswer(nc, btn);
    });
    elTestChoices.appendChild(btn);
  });
}

function showTestQuestion(step) {
  if (step >= testQuestions.length) {
    finishTest();
    return;
  }
  const noteName = testQuestions[step];
  const nc = NOTE_NAMES.indexOf(noteName);
  testTargetNc = nc;
  testAnswered = false;

  elTestQCount.textContent = `${step + 1} / ${testQuestions.length}`;
  elTestProgFill.style.width = `${(step / testQuestions.length) * 100}%`;
  elTestResult.classList.add('hidden');

  // Reset all choice buttons
  elTestChoices.querySelectorAll('.choice-btn').forEach(btn => {
    btn.classList.remove('correct', 'wrong');
    btn.disabled = false;
  });

  // Auto-play the note after a short pause so user is ready
  setTimeout(() => { if (sfxReady) playTone(testTargetNc); }, 300);
}

function recordTestAnswer(nc, clickedBtn) {
  if (testAnswered) return;
  testAnswered = true;
  const correct = nc === testTargetNc;
  testResults.push(correct);
  const targetName = testQuestions[testStep];

  // Disable all buttons and mark correct/wrong
  elTestChoices.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = true;
    if (Number(btn.dataset.nc) === testTargetNc) btn.classList.add('correct');
  });
  if (!correct) clickedBtn.classList.add('wrong');

  if (correct) {
    elTestResult.textContent = `✓ That's ${targetName}!`;
    elTestResult.className = 'phase-result success';
    playSuccess();
  } else {
    const chosen = NOTE_NAMES[nc];
    elTestResult.textContent = `That was ${targetName}, not ${chosen}. Listen again!`;
    elTestResult.className = 'phase-result fail';
    playWrong();
  }
  elTestResult.classList.remove('hidden');

  setTimeout(() => {
    testStep++;
    showTestQuestion(testStep);
  }, correct ? 800 : 1200);
}

function finishTest() {
  const passed = testResults.filter(Boolean).length;
  const total = testResults.length;
  const accuracy = passed / total;

  if (accuracy >= PASS_THRESHOLD) {
    const nextId = currentLevel.id + 1;
    const hasNext = nextId <= LEVELS.length;

    if (hasNext) {
      // Unlock next level and continue learning
      unlockLevel(nextId);
      elTestResult.textContent = `🎉 ${passed}/${total} correct! Level ${nextId} unlocked — keep going!`;
      elTestResult.className = 'phase-result success';
      elTestResult.classList.remove('hidden');
      playSuccess();
      setTimeout(() => {
        currentLevel = LEVELS[nextId - 1];
        enterLearn(0);
      }, 1600);
    } else {
      // All 6 levels done — unlock Smash!
      unlockSongLibrary(); // reused flag: "all levels cleared"
      elTestResult.textContent = `🏆 All levels cleared! Smash is now unlocked!`;
      elTestResult.className = 'phase-result success';
      elTestResult.classList.remove('hidden');
      playSuccess();
      setTimeout(() => {
        buildLevelMap();
        showScreen(elLevelMap);
        gameState = 'level-map';
      }, 2200);
    }
  } else {
    // Fail → back to learn with failed notes
    const wrongNotes = new Set();
    testResults.forEach((ok, i) => { if (!ok) wrongNotes.add(testQuestions[i]); });
    const failList = [...wrongNotes].join(', ');
    elTestResult.textContent = `${passed}/${total} — review ${failList} and try again!`;
    elTestResult.className = 'phase-result fail';
    elTestResult.classList.remove('hidden');
    playWrong();
    setTimeout(() => enterLearn(0), 2000);
  }
}

// ── Smash Phase ───────────────────────────────────────────
function enterSmash() {
  // Build active lanes from every unlocked level's notes
  const unlocked = getUnlockedLevels();
  const noteSet = new Set();
  LEVELS.forEach(level => {
    if (unlocked.has(level.id)) levelNoteClasses(level).forEach(nc => noteSet.add(nc));
  });
  activeLanes = [...noteSet].sort((a, b) => b - a);

  gameState = 'smash';
  smashTimeLeft = SMASH_DURATION_MS;
  smashHits = 0;
  smashMisses = 0;
  smashBestCombo = 0;
  smashMode = 'random';
  smashSongId = '';

  showScreen(null);
  showHud(elSmashHud);
  elSkipCalib.classList.add('hidden');

  document.getElementById('btn-mode-random').classList.add('active');
  document.getElementById('btn-mode-song').classList.remove('active');
  elSmashSongRow.classList.add('hidden');

  resetGameplay();
  // Difficulty scales with how many notes are active
  spawnIntervalMs = Math.max(800, DIFFICULTY.normal.spawnIntervalMs - (activeLanes.length - 1) * 40);
  shapeSpeed = DIFFICULTY.normal.shapeSpeed + activeLanes.length * 2;
  activeSong = null;
  gameLayer.visible = true;
  calibLayer.visible = false;
  layout = computeLayout();
  drawStatic();
  updateSmashHud();
}

function updateSmashHud() {
  const totalSec = Math.max(0, Math.ceil(smashTimeLeft / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  elSmashTimer.textContent = `${m}:${String(s).padStart(2, '0')}`;
  elSmashTimer.classList.toggle('danger', smashTimeLeft <= 10000);

  const total = smashHits + smashMisses;
  const acc = total > 0 ? Math.round((smashHits / total) * 100) : '—';
  elSmashAcc.textContent = `${acc}%`;

  elSmashScore.textContent = String(score).padStart(6, '0');
  elSmashCombo.textContent = combo >= 2 ? `${combo}× combo` : '';
}

function updateSmash(s, dt) {
  if (paused) return;

  smashTimeLeft -= dt;
  if (smashTimeLeft <= 0) {
    smashTimeLeft = 0;
    updateSmashHud();
    endSmash();
    return;
  }

  updateGameplay(s, dt, 'smash');
  updateSmashHud();
}

function endSmash() {
  gameState = 'round-complete';
  gameLayer.visible = false;
  shapes.length = 0;

  const total = smashHits + smashMisses;
  const accuracy = total > 0 ? smashHits / total : 0;
  const passed = accuracy >= PASS_THRESHOLD;

  elResultTitle.textContent = passed ? 'Level Cleared!' : 'Round Complete';
  elResultBadge.textContent = passed
    ? `🏆 Unlocked Level ${currentLevel.id + 1}!`
    : `Need ${Math.round(PASS_THRESHOLD * 100)}% accuracy to unlock next level`;
  elResultBadge.className = `result-badge ${passed ? 'pass' : 'fail'}`;

  elResultAcc.textContent = `${Math.round(accuracy * 100)}%`;
  elResultHits.textContent = `${smashHits} / ${smashHits + smashMisses}`;
  elResultCombo.textContent = `${smashBestCombo}×`;
  elResultScore.textContent = String(score).padStart(6, '0');

  elBtnNextLevel.classList.add('hidden');
  document.getElementById('btn-retry-smash').classList.remove('hidden');
  document.getElementById('btn-to-level-map').classList.remove('hidden');
  elBtnFreeAgain.classList.add('hidden');
  elBtnFreeChangeSong.classList.add('hidden');

  if (passed) playSuccess();
  showScreen(elRoundComplete);
}

// ── Free Play ─────────────────────────────────────────────
async function enterFreePlay() {
  if (!trackerActive) {
    elHomeStatus.textContent = 'Starting microphone…';
    try {
      await tracker.start();
      await initSfx();
      trackerActive = true;
      sfxReady = true;
      elHomeStatus.textContent = '';
    } catch (err) {
      elHomeStatus.textContent = `Mic error: ${err.message}`;
      return;
    }
  }

  activeLanes = [11,10,9,8,7,6,5,4,3,2,1,0]; // all 12
  gameState = 'free-calib';
  calibHeld = 0;
  calibPitchSum = 0;
  calibPitchCount = 0;
  tracker.clearReference();

  showScreen(null);
  elSkipCalib.classList.remove('hidden');
  gameLayer.visible = false;
  calibLayer.visible = true;
  layout = computeLayout();
  drawStatic();
  layoutCalibration();
}

let songEndToastTimer = null;

function showSongEndToast() {
  if (songEndToastTimer) clearTimeout(songEndToastTimer);
  // Re-trigger CSS animation by force-reflow
  elSongEndToast.classList.add('hidden');
  void elSongEndToast.offsetWidth;
  elSongEndToast.classList.remove('hidden');
  songEndToastTimer = setTimeout(() => elSongEndToast.classList.add('hidden'), 2800);
}

function runCountdown(onDone) {
  const steps = ['3', '2', '1', 'GO!'];
  let i = 0;
  elCountdownOverlay.classList.remove('hidden');

  function tick() {
    elCountdownNum.textContent = steps[i];
    // Force animation restart
    elCountdownNum.style.animation = 'none';
    void elCountdownNum.offsetWidth;
    elCountdownNum.style.animation = '';
    i++;
    if (i < steps.length) {
      setTimeout(tick, 850);
    } else {
      setTimeout(() => {
        elCountdownOverlay.classList.add('hidden');
        onDone();
      }, 650);
    }
  }
  tick();
}

function startFreePlaying() {
  activeLanes = [11,10,9,8,7,6,5,4,3,2,1,0];
  calibLayer.visible = false;
  gameLayer.visible = true;
  elSkipCalib.classList.add('hidden');
  showScreen(null);
  showHud(elFreeHud);

  if (isSongLibraryUnlocked()) {
    elFreeSongSel.disabled = false;
  }

  applyFreeDifficulty();
  applyFreeSong();
  layout = computeLayout();
  drawStatic();

  // Freeze gameplay until countdown finishes
  resetGameplay();
  gameState = 'free-countdown';
  runCountdown(() => {
    gameState = 'free-playing';
  });
}

function applyFreeDifficulty() {
  const d = DIFFICULTY[elFreeDiff.value] ?? DIFFICULTY.easy;
  freeSpawnIntervalMs = d.spawnIntervalMs;
  freeShapeSpeed = d.shapeSpeed;
  spawnIntervalMs = freeSpawnIntervalMs;
  shapeSpeed = freeShapeSpeed;
}

function applyFreeSong() {
  const id = elFreeSongSel.value;
  freeActiveSong = id && SONGS[id] ? SONGS[id] : null;
  activeSong = freeActiveSong;
  songClock = 0;
  songEventIdx = 0;
}

function updateFreePlaying(s, dt) {
  if (paused) return;

  if (pendingFreeResults) {
    pendingFreeResults = false;
    enterFreeResults();
    return;
  }

  freeElapsedMs += dt;

  // 30-second check-ins
  if (freeElapsedMs >= nextCheckInMs) {
    nextCheckInMs += 30000;
    const total = freeHitCount + freeMissCount;
    const acc = total > 0 ? freeHitCount / total : null;
    showCheckIn(acc, freeElapsedMs);
  }

  const isSongMode = !!(activeSong || freeSongEnding || freeActiveSong);

  if (isSongMode) {
    // Song progress: elapsed / total
    const totalMs = freeActiveSong ? (freeActiveSong.notes[freeActiveSong.notes.length - 1]?.t ?? 0) + 1000 : 0;
    const elapsed = Math.min(songClock, totalMs);
    const fmt = (ms) => {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    elFreeTimer.textContent = `${fmt(elapsed)} / ${fmt(totalMs)}`;
    elFreeTimer.classList.remove('hidden', 'urgent');
  } else {
    // Random mode countdown
    const remaining = Math.max(0, FREE_ROUND_MS - freeElapsedMs);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    elFreeTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    elFreeTimer.classList.remove('hidden');
    elFreeTimer.classList.toggle('urgent', remaining < 15000);
    if (remaining <= 0) {
      enterFreeResults();
      return;
    }
  }

  updateGameplay(s, dt, 'free');
  elFreeScore.textContent = String(score).padStart(6, '0');
  elFreeCombo.textContent = combo >= 2 ? `${combo}× combo` : '';
  if (comboPulse > 0) {
    elFreeCombo.style.transform = `scale(${1 + comboPulse * 0.3})`;
  } else {
    elFreeCombo.style.transform = '';
  }
}

function showMilestoneToast(html, durationMs = 2200) {
  if (milestoneToastTimer) clearTimeout(milestoneToastTimer);
  elMilestoneToast.innerHTML = html;
  elMilestoneToast.classList.add('hidden');
  void elMilestoneToast.offsetWidth;
  elMilestoneToast.classList.remove('hidden');
  milestoneToastTimer = setTimeout(() => elMilestoneToast.classList.add('hidden'), durationMs);
}

function showCheckIn(acc, elapsedMs) {
  const remaining = FREE_ROUND_MS - elapsedMs;
  let line1, line2;
  if (acc === null) {
    line1 = 'Keep singing!'; line2 = 'Orbs are coming…';
  } else {
    const pct = Math.round(acc * 100);
    if (pct >= 90)      { line1 = 'Incredible! 🔥';  line2 = `${pct}% accuracy`; }
    else if (pct >= 75) { line1 = 'Great job! 🎵';   line2 = `${pct}% accuracy`; }
    else if (pct >= 50) { line1 = 'Keep going! 💪';  line2 = `${pct}% accuracy`; }
    else                { line1 = 'You\'ve got this!'; line2 = `${pct}% — practice makes perfect`; }
  }
  if (remaining > 0 && remaining < 35000) line2 += ` · ${Math.ceil(remaining / 1000)}s left!`;
  showMilestoneToast(`<div style="font-size:1.15em">${line1}</div><div style="font-size:0.82em;opacity:0.8;margin-top:3px">${line2}</div>`, 2800);
}

const GRADE = (acc) => {
  if (acc >= 0.95) return 'S ⭐';
  if (acc >= 0.85) return 'A';
  if (acc >= 0.70) return 'B';
  if (acc >= 0.50) return 'C';
  return 'D';
};

function enterFreeResults() {
  gameState = 'round-complete';
  gameLayer.visible = false;
  shapes.length = 0;
  elFreeTimer.classList.add('hidden');
  elLyricBanner.classList.add('hidden');
  currentLyric = '';
  elMilestoneToast.classList.add('hidden');

  const total = freeHitCount + freeMissCount;
  const acc = total > 0 ? freeHitCount / total : 0;
  const grade = GRADE(acc);
  const isSong = !!freeActiveSong;

  elResultTitle.textContent = isSong ? `${freeActiveSong.title}` : 'Round Complete!';
  elResultBadge.textContent = grade;
  elResultBadge.className = `result-badge ${acc >= 0.70 ? 'pass' : 'fail'}`;
  elResultAcc.textContent = total > 0 ? `${Math.round(acc * 100)}%` : '—';
  elResultHits.textContent = `${freeHitCount} / ${freeSpawnedCount}`;
  elResultCombo.textContent = `${bestCombo}×`;
  elResultScore.textContent = String(score).padStart(6, '0');

  // Show free-play buttons, hide smash buttons
  elBtnNextLevel.classList.add('hidden');
  document.getElementById('btn-retry-smash').classList.add('hidden');
  document.getElementById('btn-to-level-map').classList.add('hidden');
  elBtnFreeAgain.classList.remove('hidden');
  elBtnFreeChangeSong.classList.remove('hidden');
  elBtnFreeChangeSong.textContent = isSong ? 'Try Another Song' : 'Try Different Mode';

  if (acc >= 0.70) playSuccess();
  showScreen(elRoundComplete);
}

// ── Shared Gameplay ───────────────────────────────────────
function resetGameplay() {
  shapes.length = 0;
  particles.length = 0;
  rings.length = 0;
  laneFlash.fill(0);
  laneCooldown.fill(0);
  spawnTimer = 0;
  songClock = 0;
  songEventIdx = 0;
  currentLyric = '';
  elLyricBanner.classList.add('hidden');
  score = 0;
  combo = 0;
  bestCombo = 0;
  comboPulse = 0;
  trauma = 0;
  paused = false;
  gameLayer.x = 0;
  gameLayer.y = 0;
  freeHitCount = 0;
  freeMissCount = 0;
  freeSpawnedCount = 0;
  freeElapsedMs = 0;
  nextCheckInMs = 30000;
  freeSongEnding = false;
  freeSongEndTimer = 0;
  pendingFreeResults = false;
  reachedComboMilestones = new Set();
  elFreeTimer.classList.add('hidden');
}

function updateGameplay(s, dt, mode) {
  const dts = dt / 1000;

  for (let i = 0; i < 12; i++) laneCooldown[i] = Math.max(0, laneCooldown[i] - dt);

  if (activeSong) {
    songClock += dt;
    updateSongSpawns();
    const lastNoteT = activeSong.notes[activeSong.notes.length - 1]?.t ?? 0;
    const leadMs = getSpawnLeadMs();
    // All orbs spawned once songClock passes last note time
    if (songClock > lastNoteT + leadMs + 500) {
      activeSong = null;
      currentLyric = '';
      elLyricBanner.classList.add('hidden');
      if (mode === 'free') {
        freeSongEnding = true;
        freeSongEndTimer = 0;
      }
    }
  } else if (freeSongEnding && mode === 'free') {
    // Drain: wait for remaining orbs to clear (max 3.5s)
    freeSongEndTimer += dt;
    const allClear = shapes.every(sh => !sh.alive);
    if (allClear || freeSongEndTimer > 3500) {
      freeSongEnding = false;
      pendingFreeResults = true;
    }
  } else if (!freeSongEnding) {
    // Random mode: keep spawning
    spawnTimer += dt;
    if (spawnTimer >= spawnIntervalMs) {
      spawnTimer -= spawnIntervalMs;
      spawnRandomShape();
    }
  }

  for (const sh of shapes) {
    if (!sh.alive) continue;
    sh.x -= shapeSpeed * dts;
    if (sh.x < layout.padX - sh.r) {
      sh.alive = false;
      combo = 0;
      if (mode === 'smash') smashMisses++;
      if (mode === 'free') freeMissCount++;
      trauma = Math.min(1, trauma + 0.45);
      playMiss();
    }
  }

  // Update lyric banner: show lyric of the next orb approaching the hit zone
  if (activeSong || shapes.some(sh => sh.alive && sh.lyric)) {
    let closest = null;
    for (const sh of shapes) {
      if (!sh.alive) continue;
      if (sh.x > layout.padX && sh.x <= layout.spawnX) {
        if (!closest || sh.x < closest.x) closest = sh;
      }
    }
    const word = closest?.lyric ?? '';
    if (word !== currentLyric) {
      currentLyric = word;
      if (word) {
        elLyricBanner.textContent = word;
        elLyricBanner.classList.remove('hidden');
      } else {
        elLyricBanner.classList.add('hidden');
      }
    }
  }

  const nc = s.activeNoteClass;
  if (nc !== null && activeLanes.includes(nc) && laneCooldown[nc] === 0) {
    let target = null;
    for (const sh of shapes) {
      if (sh.alive && sh.lane === nc && sh.x <= layout.zoneRight) {
        if (!target || sh.x < target.x) target = sh;
      }
    }
    if (target) {
      target.alive = false;
      laneCooldown[nc] = LANE_COOLDOWN_MS;
      combo++;
      if (combo > bestCombo) bestCombo = combo;
      if (mode === 'smash' && combo > smashBestCombo) smashBestCombo = combo;
      score += 10 * Math.max(1, combo);
      comboPulse = 1;
      if (mode === 'smash') smashHits++;
      if (mode === 'free') {
        freeHitCount++;
        if (COMBO_MILESTONES.has(combo) && !reachedComboMilestones.has(combo)) {
          reachedComboMilestones.add(combo);
          showMilestoneToast(`🔥 ${combo}× COMBO!`, 1800);
        }
      }
      const y = laneY(nc);
      burst(target.x, y, target.color, 1 + Math.min(1.2, combo * 0.1));
      laneFlash[nc] = 180;
      trauma = Math.min(1, trauma + 0.22 + Math.min(0.2, combo * 0.02));
      flashAmt = Math.min(0.5, flashAmt + 0.12);
      flashColor = 0xffffff;
      playPop(nc, combo);
    }
  }

  trauma = Math.max(0, trauma - dt / 350);
  flashAmt = Math.max(0, flashAmt - dt / 220);
  comboPulse = Math.max(0, comboPulse - dt / 250);
  for (let i = 0; i < 12; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt);

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

  const sh = trauma * trauma;
  gameLayer.x = (Math.random() * 2 - 1) * 14 * sh;
  gameLayer.y = (Math.random() * 2 - 1) * 14 * sh;

  flashGfx.clear();
  if (flashAmt > 0.001) {
    flashGfx.rect(-30, -30, layout.W + 60, layout.H + 60).fill({ color: flashColor, alpha: flashAmt * 0.18 });
  }
}

function spawnRandomShape() {
  const nc = activeLanes[Math.floor(Math.random() * activeLanes.length)];
  spawnShapeInLane(nc);
}

function spawnShapeInLane(nc, x = layout.spawnX, lyric = '') {
  shapes.push({ lane: nc, x, r: SHAPE_RADIUS, color: LANE_COLORS[nc], alive: true, spin: 0, lyric });
  if (gameState === 'free-playing') freeSpawnedCount++;
}

function getSpawnLeadMs() {
  const travel = layout.spawnX - layout.zoneRight;
  return (travel / shapeSpeed) * 1000;
}

function updateSongSpawns() {
  if (!activeSong) return;
  const leadMs = getSpawnLeadMs();
  while (songEventIdx < activeSong.notes.length) {
    const ev = activeSong.notes[songEventIdx];
    if (songClock < ev.t - leadMs) break;
    // In smash mode, only spawn notes in the active level
    if (activeLanes.includes(ev.n)) {
      const travel = layout.spawnX - layout.zoneRight;
      const remaining = Math.max(0, ev.t - songClock);
      const frac = leadMs > 0 ? Math.min(1, remaining / leadMs) : 0;
      spawnShapeInLane(ev.n, layout.zoneRight + travel * frac, ev.lyric ?? '');
    }
    songEventIdx++;
  }
}

function burst(x, y, color, power = 1) {
  const n = Math.round(14 * power);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const sp = (130 + Math.random() * 150) * power;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 14,
      size: 3 + Math.random() * 5,
      life: 0, max: 320 + Math.random() * 200, color,
    });
  }
  rings.push({ x, y, life: 0, max: 300, color });
}

// ── Calibration ───────────────────────────────────────────
function layoutCalibration() {
  calibGroup.position.set(layout.W / 2, layout.H * 0.52);
  calibPrompt.style.wordWrapWidth = Math.min(440, layout.W - 48);
}

function updateCalibration(s, dt) {
  const sustaining = s.note !== null && s.pitch > 0;
  if (sustaining) {
    calibHeld = Math.min(CALIB_HOLD_MS, calibHeld + dt);
    calibPitchSum += s.pitch;
    calibPitchCount++;
  } else {
    calibHeld = Math.max(0, calibHeld - dt * 1.5);
  }

  const pct = calibHeld / CALIB_HOLD_MS;
  const R = CALIB_R;
  const secsLeft = Math.ceil((CALIB_HOLD_MS - calibHeld) / 1000);

  calibCircle.clear();
  calibCircle.circle(0, 0, R + 5).fill({ color: 0xFFF5F0, alpha: 0.8 });
  calibCircle.circle(0, 0, R).fill({ color: 0xFFE8E0, alpha: sustaining ? 0.5 : 0.3 });
  calibCircle.circle(0, 0, R).stroke({ color: 0xDDD5CB, width: 2, alpha: 0.7 });
  if (pct > 0) {
    const startA = -Math.PI / 2;
    calibCircle.moveTo(R * Math.cos(startA), R * Math.sin(startA))
      .arc(0, 0, R, startA, startA + pct * Math.PI * 2)
      .stroke({ color: 0xFF4757, width: 5, cap: 'round', alpha: 0.9 });
  }

  calibNote.text = s.note ? `${s.note.name}${s.note.octave}` : '';
  calibNote.style.fill = sustaining ? 0xFF4757 : INK;

  if (sustaining && calibHeld > 0) {
    calibPrompt.text = secsLeft > 0 ? `Keep holding… ${secsLeft}s` : 'Almost there…';
  } else {
    calibPrompt.text = 'Sing any comfortable note\nand hold it to set your C';
  }

  if (calibHeld >= CALIB_HOLD_MS) finishCalibration();
}

function finishCalibration() {
  if (calibPitchCount > 0) tracker.setReferenceHz(calibPitchSum / calibPitchCount);
  startFreePlaying();
}

// ── PixiJS scene ──────────────────────────────────────────
const app = new Application();
let layout;

const gameLayer  = new Container();
const laneLayer  = new Container();
const labelLayer = new Container();
const dynLayer   = new Container();
const calibLayer = new Container();
const dynGfx     = new Graphics();
const shapeGfx   = new Graphics();
const flashGfx   = new Graphics();
let flashAmt = 0;
let flashColor = 0xffffff;

const laneLines  = [];
const laneLabels = [];
let hitZone;

let calibCircle, calibNote, calibPrompt;
const calibGroup = new Container();

function computeLayout() {
  const W = app.screen.width;
  const H = app.screen.height;
  const padX = 72;
  const padY = TOP_BAR_H + 8;
  const bottomPad = 20;
  const numLanes = activeLanes.length || 1;
  const laneH = (H - padY - bottomPad) / numLanes;
  const laneRight = W - 16;
  const zoneRight = padX + (laneRight - padX) * ZONE_FRAC;
  return { W, H, padX, padY, laneH, laneRight, zoneRight, spawnX: laneRight + SHAPE_RADIUS };
}

function laneY(nc) {
  const idx = activeLanes.indexOf(nc);
  if (idx < 0) return -200;
  return layout.padY + layout.laneH * idx + layout.laneH / 2;
}

async function boot() {
  await app.init({
    resizeTo: window,
    antialias: true,
    backgroundAlpha: 0,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  document.getElementById('app').appendChild(app.canvas);
  app.canvas.style.zIndex = '1';

  buildScene();
  app.ticker.add(loop);
  showScreen(elHomeScreen);
}

function buildScene() {
  gameLayer.addChild(laneLayer, labelLayer, dynLayer, shapeGfx);
  dynLayer.addChild(dynGfx);
  app.stage.addChild(gameLayer, calibLayer);
  gameLayer.visible = false;

  // Build lane lines + labels for all 12 possible notes
  for (let i = 0; i < 12; i++) {
    const line = new Graphics();
    laneLayer.addChild(line);
    laneLines.push(line);

    const label = new Text({
      text: '',
      style: { fill: MUTED, fontSize: 14, fontWeight: '800', fontFamily: FONT },
    });
    label.anchor.set(0.5);
    labelLayer.addChild(label);
    laneLabels.push(label);
  }

  hitZone = new Graphics();
  laneLayer.addChildAt(hitZone, 0);

  // Calibration
  calibCircle = new Graphics();
  calibNote = new Text({
    text: '',
    style: { fill: INK, fontSize: 64, fontWeight: '900', fontFamily: FONT, align: 'center' },
  });
  calibNote.anchor.set(0.5);
  calibPrompt = new Text({
    text: 'Sing any comfortable note\nand hold it to set your C',
    style: {
      fill: MUTED, fontSize: 16, fontWeight: '700', fontFamily: FONT,
      align: 'center', lineHeight: 24, wordWrap: true, wordWrapWidth: 440,
    },
  });
  calibPrompt.anchor.set(0.5);
  calibPrompt.y = CALIB_R + 36;
  calibGroup.addChild(calibCircle, calibNote, calibPrompt);
  calibLayer.addChild(calibGroup);
  calibLayer.visible = false;

  gameLayer.addChild(flashGfx);
  layout = computeLayout();
  drawStatic();

  window.addEventListener('resize', () => {
    layout = computeLayout();
    drawStatic();
    if (gameState === 'free-calib' || gameState === 'smash') layoutCalibration();
  });
}

function drawStatic() {
  const { W, padX, padY, laneH, laneRight, zoneRight } = layout;

  hitZone.clear();
  hitZone
    .roundRect(padX - 12, padY - 8, laneRight - padX + 24, laneH * activeLanes.length + 16, 16)
    .fill({ color: 0xFFFFFF, alpha: 0.35 })
    .stroke({ color: 0xFFFFFF, width: 1, alpha: 0.5 });

  hitZone
    .rect(padX, padY, zoneRight - padX, laneH * activeLanes.length)
    .fill({ color: 0xFFFFFF, alpha: 0.06 });
  hitZone
    .moveTo(zoneRight, padY)
    .lineTo(zoneRight, padY + laneH * activeLanes.length)
    .stroke({ color: LINE, alpha: 0.5, width: 1.5 });

  // Draw only active lanes
  for (let i = 0; i < 12; i++) {
    laneLines[i].clear();
    laneLabels[i].text = '';
  }

  activeLanes.forEach((nc, idx) => {
    const y = layout.padY + laneH * idx + laneH / 2;
    const line = laneLines[idx];
    line.clear();
    line
      .moveTo(padX, y)
      .lineTo(laneRight, y)
      .stroke({ color: LANE_COLORS[nc], alpha: idx === 0 || idx === activeLanes.length - 1 ? 0.4 : 0.22, width: 1 });

    const label = laneLabels[idx];
    label.text = NOTE_NAMES[nc];
    label.x = padX - 30;
    label.y = y;
    label.style.fill = LANE_COLORS[nc];
  });

  layoutCalibration();
}

function drawGlossyOrb(gfx, x, y, r, color, { ghost = false, fillAlpha = 0.7 } = {}) {
  if (ghost) {
    gfx.circle(x, y, r).fill({ color, alpha: 0.12 });
    gfx.circle(x, y, r).stroke({ color, width: 1.5, alpha: 0.4 });
    gfx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.3, r * 0.2).fill({ color: GLASS, alpha: 0.15 });
    return;
  }
  gfx.circle(x, y, r + 1.5).fill({ color: GLASS, alpha: 0.07 });
  gfx.circle(x, y, r).fill({ color, alpha: fillAlpha });
  gfx.circle(x, y, r).stroke({ color: GLASS, width: 1.5, alpha: 0.4 });
  gfx.ellipse(x - r * 0.28, y - r * 0.32, r * 0.38, r * 0.24).fill({ color: GLASS, alpha: 0.32 });
  gfx.ellipse(x + r * 0.1, y + r * 0.2, r * 0.16, r * 0.1).fill({ color: GLASS, alpha: 0.12 });
}

function drawShapes() {
  const { padX, laneH, laneRight } = layout;
  shapeGfx.clear();

  activeLanes.forEach((nc, idx) => {
    if (laneFlash[nc] <= 0) return;
    const a = (laneFlash[nc] / 180) * 0.15;
    const y = layout.padY + laneH * idx;
    shapeGfx.rect(padX, y, laneRight - padX, laneH).fill({ color: LANE_COLORS[nc], alpha: a });
  });

  for (const sh of shapes) {
    const y = laneY(sh.lane);
    const inZone = sh.x <= layout.zoneRight;
    drawGlossyOrb(shapeGfx, sh.x, y, sh.r, sh.color, { ghost: !inZone });
  }

  for (const ring of rings) {
    const t = ring.life / ring.max;
    const radius = 10 + t * 65;
    shapeGfx.circle(ring.x, ring.y, radius).stroke({ color: GLASS, width: 2 * (1 - t), alpha: (1 - t) * 0.4 });
  }

  for (const p of particles) {
    const t = 1 - p.life / p.max;
    drawGlossyOrb(shapeGfx, p.x, p.y, p.size * 0.7, p.color, { fillAlpha: t * 0.6 });
  }
}

function drawDynamic(s) {
  const { W, padX, laneH } = layout;
  dynGfx.clear();

  const nc = s.activeNoteClass;
  const activeNc = (nc !== null && activeLanes.includes(nc)) ? nc : null;

  if (activeNc !== null) {
    const idx = activeLanes.indexOf(activeNc);
    const y = layout.padY + laneH * idx + laneH / 2;
    const color = LANE_COLORS[activeNc];

    dynGfx.rect(padX, y - laneH / 2, W - padX - 16, laneH).fill({ color, alpha: 0.12 });
    dynGfx.moveTo(padX, y).lineTo(W - 16, y).stroke({ color, alpha: 0.6, width: 2 });

    const cents = s.note ? s.note.cents : 0;
    const markerY = y - (cents / 50) * (laneH / 2.5);
    drawGlossyOrb(dynGfx, padX + 26, markerY, 10, color, { fillAlpha: 0.6 });

    laneLabels[idx].scale.set(1.15);
    laneLabels[idx].style.fill = color;
  }

  // Reset all labels not actively sung
  activeLanes.forEach((nc2, idx) => {
    if (activeNc === null || nc2 !== activeNc) {
      laneLabels[idx].scale.set(1);
      laneLabels[idx].style.fill = LANE_COLORS[nc2];
    }
  });
}

// ── Main loop ─────────────────────────────────────────────
function loop(ticker) {
  if (!trackerActive) return;
  const s = tracker.update();
  const dt = ticker.deltaMS;

  if (gameState === 'free-calib') {
    updateCalibration(s, dt);
  } else if (gameState === 'learn') {
    updateLearnPitch(s, dt);
  } else if (gameState === 'smash') {
    if (!paused) {
      updateSmash(s, dt);
      drawDynamic(s);
      drawShapes();
    }
  } else if (gameState === 'free-countdown') {
    drawDynamic(s); // draw mic feedback but don't advance orbs
  } else if (gameState === 'free-playing') {
    if (!paused) {
      updateFreePlaying(s, dt);
      drawDynamic(s);
      drawShapes();
    }
  }
}

// ── Event Listeners ───────────────────────────────────────

// Home
document.getElementById('btn-train').addEventListener('click', async () => {
  if (!trackerActive) {
    elHomeStatus.textContent = 'Starting microphone…';
    try {
      await tracker.start();
      await initSfx();
      trackerActive = true;
      sfxReady = true;
      elHomeStatus.textContent = '';
    } catch (err) {
      elHomeStatus.textContent = `Mic error: ${err.message}`;
      return;
    }
  }
  gameState = 'level-map';
  buildLevelMap();
  showScreen(elLevelMap);
});

document.getElementById('btn-free').addEventListener('click', () => enterFreePlay());

// Level map back
document.getElementById('btn-back-home').addEventListener('click', () => {
  gameState = 'home';
  showScreen(elHomeScreen);
});

// Learn back
document.getElementById('btn-back-to-levels-learn').addEventListener('click', () => {
  buildLevelMap();
  showScreen(elLevelMap);
  gameState = 'level-map';
});

// Test back
document.getElementById('btn-back-to-levels-test').addEventListener('click', () => {
  buildLevelMap();
  showScreen(elLevelMap);
  gameState = 'level-map';
});

// Learn: play note button
elLearnPlayBtn.addEventListener('click', () => {
  if (!currentLevel) return;
  const noteName = currentLevel.notes[learnStep];
  const nc = NOTE_NAMES.indexOf(noteName);
  if (sfxReady) playTone(nc);
});

// Test: play note button
elTestPlayBtn.addEventListener('click', () => {
  if (testTargetNc >= 0 && sfxReady) playTone(testTargetNc);
});

// Smash: mode toggle
document.getElementById('btn-mode-random').addEventListener('click', () => {
  smashMode = 'random';
  activeSong = null;
  songClock = 0;
  songEventIdx = 0;
  shapes.length = 0;
  document.getElementById('btn-mode-random').classList.add('active');
  document.getElementById('btn-mode-song').classList.remove('active');
  elSmashSongRow.classList.add('hidden');
});

document.getElementById('btn-mode-song').addEventListener('click', () => {
  smashMode = 'song';
  document.getElementById('btn-mode-song').classList.add('active');
  document.getElementById('btn-mode-random').classList.remove('active');
  elSmashSongRow.classList.remove('hidden');
  applySongToSmash();
});

elSmashSongSel.addEventListener('change', () => {
  if (smashMode === 'song') applySongToSmash();
});

function applySongToSmash() {
  const id = elSmashSongSel.value;
  activeSong = id && SONGS[id] ? SONGS[id] : null;
  songClock = 0;
  songEventIdx = 0;
  shapes.length = 0;
}

// Smash: pause
document.getElementById('smash-pause-btn').addEventListener('click', () => {
  paused = !paused;
  document.getElementById('smash-pause-btn').textContent = paused ? '▶' : '⏸';
});

// Free: pause
elFreePauseBtn.addEventListener('click', () => {
  paused = !paused;
  elFreePauseBtn.textContent = paused ? '▶' : '⏸';
  elFreePauseBtn.setAttribute('aria-pressed', String(paused));
});

// Free: back to home
document.getElementById('btn-back-from-free').addEventListener('click', () => {
  gameState = 'home';
  gameLayer.visible = false;
  paused = false;
  elCountdownOverlay.classList.add('hidden');
  elLyricBanner.classList.add('hidden');
  currentLyric = '';
  if (songEndToastTimer) { clearTimeout(songEndToastTimer); elSongEndToast.classList.add('hidden'); }
  showScreen(elHomeScreen);
});

// Free: difficulty + song
elFreeDiff.addEventListener('change', () => {
  applyFreeDifficulty();
  if (gameState === 'free-playing' || gameState === 'free-countdown') {
    resetGameplay();
    gameState = 'free-playing';
  }
});
elFreeSongSel.addEventListener('change', () => {
  applyFreeSong();
  if (gameState === 'free-playing' || gameState === 'free-countdown') {
    elCountdownOverlay.classList.add('hidden');
    elLyricBanner.classList.add('hidden');
    currentLyric = '';
    resetGameplay();
    gameState = 'free-countdown';
    runCountdown(() => { gameState = 'free-playing'; });
  }
});

// Skip calibration (free play only)
elSkipCalib.addEventListener('click', () => {
  tracker.clearReference();
  startFreePlaying();
});

// Round complete
elBtnNextLevel.addEventListener('click', () => {
  const nextId = currentLevel.id + 1;
  if (nextId <= LEVELS.length) {
    currentLevel = LEVELS[nextId - 1];
    enterLearn(0);
  } else {
    buildLevelMap();
    showScreen(elLevelMap);
    gameState = 'level-map';
  }
});

document.getElementById('btn-retry-smash').addEventListener('click', () => {
  enterSmash();
});

document.getElementById('btn-to-level-map').addEventListener('click', () => {
  buildLevelMap();
  showScreen(elLevelMap);
  gameState = 'level-map';
});

// Free play result buttons
elBtnFreeAgain.addEventListener('click', () => {
  showScreen(null);
  showHud(elFreeHud);
  gameLayer.visible = true;
  applyFreeDifficulty();
  applyFreeSong();
  layout = computeLayout();
  drawStatic();
  resetGameplay();
  gameState = 'free-countdown';
  runCountdown(() => { gameState = 'free-playing'; });
});

elBtnFreeChangeSong.addEventListener('click', () => {
  // Reset song select to "Free play" (random) and re-enter
  elFreeSongSel.value = '';
  freeActiveSong = null;
  activeSong = null;
  showScreen(null);
  showHud(elFreeHud);
  gameLayer.visible = true;
  applyFreeDifficulty();
  layout = computeLayout();
  drawStatic();
  resetGameplay();
  gameState = 'free-countdown';
  runCountdown(() => { gameState = 'free-playing'; });
});

// Spacebar pause in game phases
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  if (gameState !== 'smash' && gameState !== 'free-playing') return;
  const tag = e.target?.tagName;
  if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT') return;
  e.preventDefault();
  paused = !paused;
  if (gameState === 'smash') {
    document.getElementById('smash-pause-btn').textContent = paused ? '▶' : '⏸';
  } else {
    elFreePauseBtn.textContent = paused ? '▶' : '⏸';
    elFreePauseBtn.setAttribute('aria-pressed', String(paused));
  }
});

boot();
