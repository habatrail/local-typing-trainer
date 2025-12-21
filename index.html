"use strict";

const STORAGE_KEY = "localKeybrTrainerStateV3_oneKey_unlock_fade";

/**
 * Start unlocked: BOTH home sides
 */
const START_UNLOCKED = "asdfjkl;";

/**
 * Unlock one key at a time in this order.
 * (You can reorder any time.)
 */
const UNLOCK_ORDER = [
  "g","h",
  "r","t","y","u",
  "e","i","o","w",
  "q","p",
  "v","b","n",
  "c","m",
  "x","z",
  "'",
  ",",".","/"
];

/**
 * Learning speed controls (adjust these to go faster/slower):
 * - minAttempts lower => faster
 * - minRecentAccuracy lower => faster
 * - recentWindow lower => reacts faster
 */
const PROGRESSION = {
  minAttempts: 35,
  minRecentAccuracy: 0.90,
  recentWindow: 35,

  // If any unlocked key is below this recent accuracy, we "focus" it (more practice)
  maintainRecentAccuracy: 0.82
};

/**
 * Keyboard fade behavior:
 * - streakToInvisible smaller => fades faster
 * - minOpacity 0 => fully invisible
 */
const KEYBOARD_FADE = {
  enabled: true,
  streakToInvisible: 30,
  minOpacity: 0.0
};

/* Keyboard layouts */

// Full normal QWERTY rows (display)
const NORMAL_KEYBOARD_ROWS = [
  ["`","1","2","3","4","5","6","7","8","9","0","-","="],
  ["q","w","e","r","t","y","u","i","o","p","[","]","\\"],
  ["a","s","d","f","g","h","j","k","l",";","'"],
  ["z","x","c","v","b","n","m",",",".","/"]
];

// Split halves (straight)
const SPLIT_LEFT_ROWS = [
  ["q","w","e","r","t"],
  ["a","s","d","f","g"],
  ["z","x","c","v","b"]
];

const SPLIT_RIGHT_ROWS = [
  ["y","u","i","o","p"],
  ["h","j","k","l",";"],
  ["n","m",",",".","/"]
];

const KEYBOARD_LAYOUTS = {
  "normal": { type: "normal" },
  "split-straight": { type: "splitStraight" }
};

let state = {
  unlocked: START_UNLOCKED,
  nextUnlockIndex: 0,
  focusKey: null,

  text: "",
  cursorPos: 0,

  correctStreak: 0,

  session: {
    startedAt: null,
    lastKeyTime: null,
    elapsedMs: 0,
    keystrokes: 0,
    errors: 0,
    samples: [] // {tSec, grossWpm, netWpm, acc}
  },

  // key -> { attempts, errors, totalRT, rtSamples, recent: [0/1] }
  charStats: {},

  settings: {
    soundOnError: false,
    backspaceMode: "discouraged",
    fontSize: 34,
    keyboardLayout: "normal"
  }
};

let dom = {};
let audioCtx = null;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

function init() {
  cacheDom();
  loadState();
  normalizeUnlockIndex();

  if (!state.focusKey) {
    state.focusKey = getNewestUnlockedKey();
  }

  buildKeyboardBase();
  applySettingsToUI();
  attachListeners();

  if (!state.text || typeof state.text !== "string" || state.text.length < 3) {
    generateNewText();
  }

  renderAll();
}

function cacheDom() {
  dom.stageName = document.getElementById("stage-name");
  dom.activeKeys = document.getElementById("active-keys");
  dom.typingArea = document.getElementById("typing-area");
  dom.generatedText = document.getElementById("generated-text");
  dom.cursorPosition = document.getElementById("cursor-position");
  dom.progressPercent = document.getElementById("progress-percent");

  dom.statElapsed = document.getElementById("stat-elapsed");
  dom.statGrossWpm = document.getElementById("stat-gross-wpm");
  dom.statNetWpm = document.getElementById("stat-net-wpm");
  dom.statAccuracy = document.getElementById("stat-accuracy");
  dom.statKeystrokes = document.getElementById("stat-keystrokes");
  dom.statErrors = document.getElementById("stat-errors");
  dom.charStatsBody = document.getElementById("char-stats-body");

  dom.restartSessionBtn = document.getElementById("restart-session-btn");
  dom.newTextBtn = document.getElementById("new-text-btn");

  dom.settingSoundError = document.getElementById("setting-sound-error");
  dom.settingBackspaceMode = document.getElementById("setting-backspace-mode");
  dom.settingFontSize = document.getElementById("setting-font-size");
  dom.settingKeyboardLayout = document.getElementById("setting-keyboard-layout");

  dom.keyboardVisual = document.getElementById("keyboard-visual");

  dom.chartWpm = document.getElementById("chart-wpm");
  dom.chartAcc = document.getElementById("chart-acc");
}

function attachListeners() {
  dom.typingArea.addEventListener("click", () => dom.typingArea.focus());

  document.addEventListener("keydown", handleKeydown);

  dom.restartSessionBtn.addEventListener("click", () => {
    endSession();
    resetSession();
    renderAll();
  });

  dom.newTextBtn.addEventListener("click", () => {
    generateNewText();
    state.cursorPos = 0;
    renderAll();
  });

  dom.settingSoundError.addEventListener("change", () => {
    state.settings.soundOnError = dom.settingSoundError.checked;
    saveState();
  });

  dom.settingBackspaceMode.addEventListener("change", () => {
    state.settings.backspaceMode = dom.settingBackspaceMode.value;
    saveState();
  });

  dom.settingFontSize.addEventListener("input", () => {
    const size = parseInt(dom.settingFontSize.value, 10) || 34;
    state.settings.fontSize = size;
    dom.generatedText.style.fontSize = size + "px";
    saveState();
  });

  dom.settingKeyboardLayout.addEventListener("change", () => {
    state.settings.keyboardLayout = dom.settingKeyboardLayout.value || "normal";
    saveState();
    buildKeyboardBase();
    renderKeyboardDynamic();
    applyKeyboardFade();
  });
}

/* ---------------- Input ---------------- */

function handleKeydown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const key = e.key;

  // Prevent Space from scrolling the page while typing (but not in form controls)
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  const isFormField =
    tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable);

  if (!isFormField && (key === " " || key === "Spacebar")) {
    e.preventDefault();
  }

  if (key === "Tab") {
    e.preventDefault();
    return;
  }

  if (key === "Backspace") {
    e.preventDefault();
    if (state.settings.backspaceMode === "allowed" && state.cursorPos > 0) {
      state.cursorPos -= 1;
      renderText();
      renderKeyboardDynamic();
      applyKeyboardFade();
    }
    return;
  }

  if (key.length !== 1) return;

  if (!state.session.startedAt) startSession();

  const expected = state.text[state.cursorPos];
  if (expected === undefined) return;

  const now = performance.now();
  const pressed = (key === " " ? " " : key);
  const rt = computeReactionTime(now);

  const correct = (pressed === expected);
  updateCharStats(expected, pressed, rt, correct);

  if (correct) {
    state.correctStreak += 1;
    state.cursorPos += 1;
  } else {
    state.correctStreak = 0;
    state.session.errors += 1;
    if (state.settings.soundOnError) playErrorSound();
  }

  state.session.keystrokes += 1;
  state.session.lastKeyTime = now;

  if (state.cursorPos >= state.text.length) {
    generateNewText();
    state.cursorPos = 0;
  }

  updateElapsed();
  maybeSampleCharts();
  maybeUnlockNextKey();
  chooseFocusKey();

  saveState();
  renderAll();
}

/* ---------------- One-key progression ---------------- */

function normalizeUnlockIndex() {
  const unlockedSet = new Set((state.unlocked || "").split(""));
  let idx = 0;
  while (idx < UNLOCK_ORDER.length && unlockedSet.has(UNLOCK_ORDER[idx])) idx++;
  state.nextUnlockIndex = idx;
}

function getNewestUnlockedKey() {
  const unlockedSet = new Set(state.unlocked.split(""));
  for (let i = UNLOCK_ORDER.length - 1; i >= 0; i--) {
    if (unlockedSet.has(UNLOCK_ORDER[i])) return UNLOCK_ORDER[i];
  }
  return state.unlocked[state.unlocked.length - 1] || null;
}

function recentAccuracyForKey(ch) {
  const s = state.charStats[ch];
  if (!s || !s.recent || s.recent.length === 0) return null;
  const sum = s.recent.reduce((a, b) => a + b, 0);
  return sum / s.recent.length;
}

function isKeyMastered(ch) {
  const s = state.charStats[ch];
  if (!s || s.attempts < PROGRESSION.minAttempts) return false;
  const r = recentAccuracyForKey(ch);
  if (r === null) return false;
  return r >= PROGRESSION.minRecentAccuracy;
}

function maybeUnlockNextKey() {
  if (state.nextUnlockIndex >= UNLOCK_ORDER.length) return;

  const newest = getNewestUnlockedKey();
  if (!newest) return;

  if (isKeyMastered(newest)) {
    const next = UNLOCK_ORDER[state.nextUnlockIndex];
    state.unlocked = unionChars(state.unlocked, next);
    state.focusKey = next;
    state.nextUnlockIndex += 1;

    generateNewText();
    state.cursorPos = 0;
    state.correctStreak = 0; // make keyboard visible for the new key
  }
}

function chooseFocusKey() {
  const unlockedChars = state.unlocked.split("");
  let weakest = null;
  let weakestAcc = Infinity;

  for (const ch of unlockedChars) {
    const r = recentAccuracyForKey(ch);
    if (r === null) continue;
    if (r < weakestAcc) {
      weakestAcc = r;
      weakest = ch;
    }
  }

  if (weakest !== null && weakestAcc < PROGRESSION.maintainRecentAccuracy) {
    state.focusKey = weakest;
  } else {
    state.focusKey = getNewestUnlockedKey();
  }
}

/* ---------------- Stats ---------------- */

function ensureCharStat(ch) {
  if (!state.charStats[ch]) {
    state.charStats[ch] = {
      attempts: 0,
      errors: 0,
      totalRT: 0,
      rtSamples: 0,
      recent: []
    };
  }
}

function pushRecent(ch, val) {
  const s = state.charStats[ch];
  s.recent.push(val);
  if (s.recent.length > PROGRESSION.recentWindow) {
    s.recent.shift();
  }
}

function updateCharStats(expected, pressed, rt, correct) {
  ensureCharStat(expected);
  ensureCharStat(pressed);

  const s = state.charStats[expected];
  s.attempts += 1;
  if (!correct) s.errors += 1;
  if (rt !== null) {
    s.totalRT += rt;
    s.rtSamples += 1;
  }
  pushRecent(expected, correct ? 1 : 0);

  if (!correct && pressed !== expected) {
    const p = state.charStats[pressed];
    p.attempts += 1;
    p.errors += 1;
    if (rt !== null) {
      p.totalRT += rt;
      p.rtSamples += 1;
    }
    pushRecent(pressed, 0);
  }
}

function computeReactionTime(now) {
  if (!state.session.lastKeyTime) return null;
  const rt = now - state.session.lastKeyTime;
  if (rt < 50 || rt > 8000) return null;
  return rt;
}

/* ---------------- Session ---------------- */

function startSession() {
  const now = performance.now();
  state.session.startedAt = now;
  state.session.lastKeyTime = now;
  state.session.elapsedMs = 0;
  state.session.keystrokes = 0;
  state.session.errors = 0;
  state.session.samples = [];
  state.correctStreak = 0;
}

function resetSession() {
  state.session.startedAt = null;
  state.session.lastKeyTime = null;
  state.session.elapsedMs = 0;
  state.session.keystrokes = 0;
  state.session.errors = 0;
  state.session.samples = [];
  state.correctStreak = 0;
}

function endSession() {
  // later: store session history
}

function updateElapsed() {
  if (!state.session.startedAt) return;
  state.session.elapsedMs = performance.now() - state.session.startedAt;
}

/* ---------------- Text generation ---------------- */

function generateNewText() {
  const active = state.unlocked;
  const wordCount = 8;
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    const len = randInt(3, 7);
    words.push(generatePseudoWord(active, len));
  }
  state.text = words.join(" ");
}

function generatePseudoWord(activeChars, length) {
  let word = "";
  let last = null;
  for (let i = 0; i < length; i++) {
    word += pickWeightedChar(activeChars, last);
    last = word[word.length - 1];
  }
  return word;
}

function pickWeightedChar(activeChars, lastChar) {
  const chars = activeChars.split("");
  const focus = state.focusKey;

  let total = 0;
  const weights = [];

  for (const ch of chars) {
    let w = 1;

    // emphasize focus key hard (newest/weakest)
    if (focus && ch === focus) w += 6;

    const s = state.charStats[ch];
    if (!s || s.attempts < 10) {
      w += 2;
    } else {
      const r = recentAccuracyForKey(ch);
      if (r !== null) w += (1 - r) * 6;
    }

    // mild anti-repeat
    if (ch === lastChar) w *= 0.7;

    weights.push(w);
    total += w;
  }

  let r = Math.random() * total;
  for (let i = 0; i < chars.length; i++) {
    r -= weights[i];
    if (r <= 0) return chars[i];
  }
  return chars[chars.length - 1];
}

/* ---------------- Persistence ---------------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    state = {
      ...state,
      ...data,
      session: { ...state.session }, // don't restore active timing
      settings: { ...state.settings, ...(data.settings || {}) }
    };

    if (!state.unlocked || typeof state.unlocked !== "string") {
      state.unlocked = START_UNLOCKED;
    }
    if (!state.charStats || typeof state.charStats !== "object") {
      state.charStats = {};
    }
    if (!state.settings) {
      state.settings = {
        soundOnError: false,
        backspaceMode: "discouraged",
        fontSize: 34,
        keyboardLayout: "normal"
      };
    }
  } catch (e) {
    console.warn("Failed to load state:", e);
  }
}

function saveState() {
  const toSave = {
    unlocked: state.unlocked,
    nextUnlockIndex: state.nextUnlockIndex,
    focusKey: state.focusKey,
    charStats: state.charStats,
    settings: state.settings
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn("Failed to save state:", e);
  }
}

/* ---------------- Rendering ---------------- */

function renderAll() {
  renderHeaderInfo();
  renderText();
  renderSessionStats();
  renderCharStats();
  renderKeyboardDynamic();
  applyKeyboardFade();
  renderCharts();
}

function renderHeaderInfo() {
  const next = (state.nextUnlockIndex < UNLOCK_ORDER.length)
    ? UNLOCK_ORDER[state.nextUnlockIndex].toUpperCase()
    : "DONE";

  const focus = state.focusKey ? state.focusKey.toUpperCase() : "-";
  dom.stageName.textContent = `Focus: ${focus} | Next: ${next}`;
  dom.activeKeys.textContent = state.unlocked.split("").join(" ");
}

function renderText() {
  const text = state.text;
  const cursor = state.cursorPos;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const span = document.createElement("span");
    span.classList.add("char");

    if (ch === " ") {
      span.classList.add("space");
      span.textContent = "·";
    } else {
      span.textContent = ch;
    }

    if (i < cursor) span.classList.add("correct");
    else if (i === cursor) span.classList.add("current");
    else span.classList.add("upcoming");

    frag.appendChild(span);
  }

  dom.generatedText.innerHTML = "";
  dom.generatedText.appendChild(frag);
  dom.generatedText.style.fontSize = state.settings.fontSize + "px";

  dom.cursorPosition.textContent = `Position: ${cursor}/${text.length}`;
  dom.progressPercent.textContent = `Unlocked: ${state.unlocked.length} keys`;
}

function renderSessionStats() {
  updateElapsed();
  const elapsedSec = state.session.elapsedMs / 1000;

  dom.statElapsed.textContent = `${elapsedSec.toFixed(1)}s`;

  const minutes = elapsedSec / 60;
  const ks = state.session.keystrokes;
  const errs = state.session.errors;

  let grossWpm = 0;
  let netWpm = 0;
  let acc = 1;

  if (elapsedSec > 1 && ks > 0) {
    grossWpm = (ks / 5) / Math.max(minutes, 1 / 60);
    acc = (ks - errs) / ks;
    netWpm = grossWpm * acc;
  }

  dom.statGrossWpm.textContent = grossWpm.toFixed(1);
  dom.statNetWpm.textContent = netWpm.toFixed(1);
  dom.statAccuracy.textContent = `${(acc * 100).toFixed(1)}%`;
  dom.statKeystrokes.textContent = String(ks);
  dom.statErrors.textContent = String(errs);
}

function renderCharStats() {
  const chars = Array.from(new Set(Object.keys(state.charStats))).sort();
  dom.charStatsBody.innerHTML = "";

  for (const ch of chars) {
    const s = state.charStats[ch];
    const acc = s.attempts ? (s.attempts - s.errors) / s.attempts : 1;
    const avgRT = s.rtSamples ? (s.totalRT / s.rtSamples) : 0;
    const rAcc = recentAccuracyForKey(ch);

    const tr = document.createElement("tr");
    const cells = [
      ch === " " ? "␣" : ch,
      s.attempts,
      s.errors,
      `${(acc * 100).toFixed(1)}%`,
      avgRT ? avgRT.toFixed(0) : "–",
      rAcc === null ? "–" : `${(rAcc * 100).toFixed(1)}%`
    ];

    cells.forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });

    dom.charStatsBody.appendChild(tr);
  }
}

/* ---------------- Charts ---------------- */

function maybeSampleCharts() {
  if (!state.session.startedAt) return;

  const elapsedSec = state.session.elapsedMs / 1000;
  const last = state.session.samples[state.session.samples.length - 1];
  if (last && (elapsedSec - last.tSec) < 1.0) return; // ~1/sec

  const minutes = elapsedSec / 60;
  const ks = state.session.keystrokes;
  const errs = state.session.errors;

  let grossWpm = 0;
  let acc = 1;
  let netWpm = 0;

  if (elapsedSec > 1 && ks > 0) {
    grossWpm = (ks / 5) / Math.max(minutes, 1 / 60);
    acc = (ks - errs) / ks;
    netWpm = grossWpm * acc;
  }

  state.session.samples.push({ tSec: elapsedSec, grossWpm, netWpm, acc });

  if (state.session.samples.length > 1200) {
    state.session.samples.shift();
  }
}

function renderCharts() {
  drawLineChart(dom.chartWpm, state.session.samples, "tSec", "netWpm", 0, 160, false);
  drawLineChart(dom.chartAcc, state.session.samples, "tSec", "acc", 0, 1, true);
}

function drawLineChart(canvas, samples, xKey, yKey, yMin, yMax, isPercent) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // background
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, w, h);

  const padL = 44, padR = 12, padT = 10, padB = 26;
  const plotW = (w - padL - padR);
  const plotH = (h - padT - padB);

  // grid
  ctx.strokeStyle = "rgba(148,163,184,0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i * plotH) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  if (!samples || samples.length < 2) {
    ctx.fillStyle = "rgba(148,163,184,0.7)";
    ctx.font = "14px system-ui";
    ctx.fillText("Start typing to populate the chart", padL, h / 2);
    return;
  }

  const x0 = samples[0][xKey];
  const x1 = samples[samples.length - 1][xKey];
  const xSpan = Math.max(1e-6, x1 - x0);

  // line
  ctx.strokeStyle = "rgba(59,130,246,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i < samples.length; i++) {
    const xVal = samples[i][xKey];
    const yRaw = samples[i][yKey];
    const yVal = Math.max(yMin, Math.min(yMax, yRaw));

    const px = padL + ((xVal - x0) / xSpan) * plotW;
    const py = padT + (1 - (yVal - yMin) / (yMax - yMin)) * plotH;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // labels
  ctx.fillStyle = "rgba(148,163,184,0.85)";
  ctx.font = "12px system-ui";
  const topLabel = isPercent ? "100%" : `${Math.round(yMax)}`;
  const botLabel = isPercent ? "0%" : `${Math.round(yMin)}`;

  ctx.fillText(topLabel, 10, 16);
  ctx.fillText(botLabel, 10, h - 10);

  ctx.fillText(`${Math.round(x0)}s`, padL, h - 8);
  ctx.fillText(`${Math.round(x1)}s`, w - padR - 34, h - 8);
}

/* ---------------- Keyboard ---------------- */

function buildKeyboardBase() {
  dom.keyboardVisual.innerHTML = "";

  const layoutKey = state.settings.keyboardLayout || "normal";
  const layout = KEYBOARD_LAYOUTS[layoutKey] || KEYBOARD_LAYOUTS["normal"];

  if (layout.type === "normal") {
    for (const row of NORMAL_KEYBOARD_ROWS) {
      const rowDiv = document.createElement("div");
      rowDiv.classList.add("keyboard-row");
      for (const key of row) rowDiv.appendChild(createKeyDiv(key));
      dom.keyboardVisual.appendChild(rowDiv);
    }
    dom.keyboardVisual.appendChild(createSpaceRow());
    return;
  }

  // split-straight
  const split = document.createElement("div");
  split.classList.add("keyboard-split");

  const leftCol = document.createElement("div");
  leftCol.classList.add("keyboard-col");
  for (const row of SPLIT_LEFT_ROWS) {
    const rowDiv = document.createElement("div");
    rowDiv.classList.add("keyboard-row");
    for (const key of row) rowDiv.appendChild(createKeyDiv(key));
    leftCol.appendChild(rowDiv);
  }

  const rightCol = document.createElement("div");
  rightCol.classList.add("keyboard-col");
  for (const row of SPLIT_RIGHT_ROWS) {
    const rowDiv = document.createElement("div");
    rowDiv.classList.add("keyboard-row");
    for (const key of row) rowDiv.appendChild(createKeyDiv(key));
    rightCol.appendChild(rowDiv);
  }

  split.appendChild(leftCol);
  split.appendChild(rightCol);

  dom.keyboardVisual.appendChild(split);
  dom.keyboardVisual.appendChild(createSpaceRow());
}

function createKeyDiv(key) {
  const el = document.createElement("div");
  el.classList.add("key");
  el.dataset.key = key;
  el.textContent = key.toUpperCase();

  if ("asdfjkl;".includes(key)) el.classList.add("key-home");
  return el;
}

function createSpaceRow() {
  const row = document.createElement("div");
  row.classList.add("keyboard-row");
  const space = document.createElement("div");
  space.classList.add("key", "key-space");
  space.dataset.key = " ";
  space.textContent = "Space";
  row.appendChild(space);
  return row;
}

function renderKeyboardDynamic() {
  const unlockedSet = new Set(state.unlocked.split(""));
  const currentChar = state.text[state.cursorPos] || null;

  const keys = dom.keyboardVisual.querySelectorAll(".key");
  keys.forEach((el) => {
    const ch = el.dataset.key;

    el.classList.remove("key-unlocked", "key-locked", "key-current");

    if (ch === " ") {
      el.classList.add("key-unlocked");
    } else if (unlockedSet.has(ch)) {
      el.classList.add("key-unlocked");
    } else {
      el.classList.add("key-locked");
    }

    if (currentChar && ch === currentChar) {
      el.classList.add("key-current");
    }
  });
}

/* ---------------- Keyboard fade ---------------- */

function applyKeyboardFade() {
  if (!KEYBOARD_FADE.enabled) return;

  const panel = dom.keyboardVisual.closest(".keyboard-panel");
  if (!panel) return;

  const s = Math.max(0, state.correctStreak || 0);
  const t = Math.max(1, KEYBOARD_FADE.streakToInvisible);

  // streak 0 => 1, streak >= t => minOpacity
  let opacity = 1 - (s / t);
  if (opacity < KEYBOARD_FADE.minOpacity) opacity = KEYBOARD_FADE.minOpacity;
  if (opacity > 1) opacity = 1;

  panel.style.opacity = String(opacity);
}

/* ---------------- Utilities ---------------- */

function unionChars(a, b) {
  const set = new Set(a.split(""));
  b.split("").forEach((ch) => set.add(ch));
  return Array.from(set).join("");
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applySettingsToUI() {
  dom.settingSoundError.checked = !!state.settings.soundOnError;
  dom.settingBackspaceMode.value = state.settings.backspaceMode || "discouraged";
  dom.settingFontSize.value = state.settings.fontSize || 34;
  dom.generatedText.style.fontSize = (state.settings.fontSize || 34) + "px";
  dom.settingKeyboardLayout.value = state.settings.keyboardLayout || "normal";
}

function playErrorSound() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.frequency.value = 220;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch (e) {
    console.warn("Error sound failed:", e);
  }
}
