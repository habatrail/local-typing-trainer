"use strict";

const STORAGE_KEY = "localKeybrTrainerStateV2_oneKeyUnlock";

/**
 * Start with BOTH home rows: asdfjkl;
 * Then unlock one key at a time, in a sensible order.
 *
 * You can reorder this list later; just keep it to letters/punctuation you want to unlock.
 */
const START_UNLOCKED = "asdfjkl;";

const UNLOCK_ORDER = [
  // finish home row:
  "g", "h",
  // top row (center-ish first):
  "r", "t", "y", "u",
  "e", "i",
  "w", "o",
  "q", "p",
  // bottom row:
  "v", "b", "n",
  "c", "m",
  "x", "z",
  // common punctuation near letters:
  "'", ",", ".", "/"
];

const PROGRESSION = {
  // Mastery required to unlock NEXT key:
  minAttempts: 60,
  minRecentAccuracy: 0.93,

  // “Maintain” threshold: if user starts struggling, we stop unlocking and bias practice toward weak keys
  maintainRecentAccuracy: 0.86,

  recentWindow: 50
};

const KEYBOARD_LAYOUTS = {
  normal: { type: "normal" },
  "split-straight": { type: "splitStraight" }
};

// Full normal QWERTY rows
const NORMAL_KEYBOARD_ROWS = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"]
];

const SPLIT_LEFT_ROWS = [
  ["q", "w", "e", "r", "t"],
  ["a", "s", "d", "f", "g"],
  ["z", "x", "c", "v", "b"]
];

const SPLIT_RIGHT_ROWS = [
  ["y", "u", "i", "o", "p"],
  ["h", "j", "k", "l", ";"],
  ["n", "m", ",", ".", "/"]
];

let state = {
  unlocked: START_UNLOCKED,
  nextUnlockIndex: 0,          // points into UNLOCK_ORDER
  focusKey: null,              // newest unlocked (or weakest), used for stage name + weighting
  text: "",
  cursorPos: 0,

  session: {
    startedAt: null,
    lastKeyTime: null,
    elapsedMs: 0,
    keystrokes: 0,
    errors: 0,

    // time series for charts (sampled ~1/sec)
    samples: [] // [{tSec, grossWpm, netWpm, acc}]
  },

  // per-key stats:
  // key -> { attempts, errors, totalRT, rtSamples, recent: [0/1 correct flags] }
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
  generateNewText();
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
  });
}

function handleKeydown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const key = e.key;
    // Prevent Space from scrolling the page while typing
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  const isFormField =
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (e.target && e.target.isContentEditable);

  // Space can show up as " " (modern) or "Spacebar" (older)
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
    }
    return;
  }

  if (key.length !== 1) return;

  if (!state.session.startedAt) startSession();

  const expected = state.text[state.cursorPos];
  if (expected === undefined) return;

  const now = performance.now();
  const pressed = key === " " ? " " : key;
  const rt = computeReactionTime(now);

  const correct = (pressed === expected);
  updateCharStats(expected, pressed, rt, correct);

  if (correct) {
    state.cursorPos += 1;
  } else {
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
  maybeUnlockNextKey();     // <-- one-key progression
  chooseFocusKey();         // <-- keeps practice targeted if you struggle

  saveState();
  renderAll();
}

/* ---------- One-key progression ---------- */

function normalizeUnlockIndex() {
  // Ensure nextUnlockIndex points to the first not-yet-unlocked key in UNLOCK_ORDER
  const unlockedSet = new Set(state.unlocked.split(""));
  let idx = 0;
  while (idx < UNLOCK_ORDER.length && unlockedSet.has(UNLOCK_ORDER[idx])) idx++;
  state.nextUnlockIndex = idx;
}

function getNewestUnlockedKey() {
  // newest unlocked is the last item in UNLOCK_ORDER that is already in unlocked, otherwise fallback
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
  // If we’re out of keys, stop.
  if (state.nextUnlockIndex >= UNLOCK_ORDER.length) return;

  // Mastery is judged on the newest unlocked key.
  const newest = getNewestUnlockedKey();
  if (!newest) return;

  if (isKeyMastered(newest)) {
    const next = UNLOCK_ORDER[state.nextUnlockIndex];
    state.unlocked = unionChars(state.unlocked, next);
    state.focusKey = next;
    state.nextUnlockIndex += 1;
    generateNewText();
    state.cursorPos = 0;
  }
}

function chooseFocusKey() {
  // If your unlocked set starts dropping below maintain accuracy, focus weak key (no regression/locking).
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
    // Otherwise focus newest unlocked (feels like keybr)
    state.focusKey = getNewestUnlockedKey();
  }
}

/* ---------- Stats ---------- */

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

function updateCharStats(expected, pressed, rt, correct) {
  ensureCharStat(expected);
  ensureCharStat(pressed);

  // expected key stats
  const s = state.charStats[expected];
  s.attempts += 1;
  if (!correct) s.errors += 1;
  if (rt !== null) {
    s.totalRT += rt;
    s.rtSamples += 1;
  }
  pushRecent(expected, correct ? 1 : 0);

  // pressed key stats (only meaningful if wrong; still record as “bad press”)
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

function pushRecent(ch, val) {
  const s = state.charStats[ch];
  s.recent.push(val);
  if (s.recent.length > PROGRESSION.recentWindow) {
    s.recent.shift();
  }
}

function computeReactionTime(now) {
  const sess = state.session;
  if (!sess.lastKeyTime) return null;
  const rt = now - sess.lastKeyTime;
  if (rt < 50 || rt > 8000) return null;
  return rt;
}

function startSession() {
  const now = performance.now();
  state.session.startedAt = now;
  state.session.lastKeyTime = now;
  state.session.elapsedMs = 0;
  state.session.keystrokes = 0;
  state.session.errors = 0;
  state.session.samples = [];
}

function resetSession() {
  state.session.startedAt = null;
  state.session.lastKeyTime = null;
  state.session.elapsedMs = 0;
  state.session.keystrokes = 0;
  state.session.errors = 0;
  state.session.samples = [];
}

function endSession() { /* later */ }

function updateElapsed() {
  if (!state.session.startedAt) return;
  state.session.elapsedMs = performance.now() - state.session.startedAt;
}

/* ---------- Text generation ---------- */

function generateNewText() {
  const active = state.unlocked;
  const wordCount = 8;
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(generatePseudoWord(active, randInt(3, 7)));
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

    // strongly emphasize focusKey (newest or weakest)
    if (focus && ch === focus) w += 5;

    const s = state.charStats[ch];
    if (!s || s.attempts < 10) {
      w += 2;
    } else {
      const r = recentAccuracyForKey(ch);
      if (r !== null) w += (1 - r) * 6;
    }

    if (ch === lastChar) w *= 0.6;

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

/* ---------- Persistence ---------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    state = {
      ...state,
      ...data,
      session: { ...state.session }, // don’t restore running session timing
      settings: { ...state.settings, ...(data.settings || {}) }
    };

    // sanitize
    if (!state.unlocked || typeof state.unlocked !== "string") state.unlocked = START_UNLOCKED;
    if (!state.charStats || typeof state.charStats !== "object") state.charStats = {};
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

/* ---------- Rendering ---------- */

function renderAll() {
  renderStageInfo();
  renderText();
  renderSessionStats();
  renderCharStats();
  renderKeyboardDynamic();
  renderCharts();
}

function renderStageInfo() {
  const next = (state.nextUnlockIndex < UNLOCK_ORDER.length) ? UNLOCK_ORDER[state.nextUnlockIndex] : "Done";
  const focusLabel = state.focusKey ? `Focus: ${state.focusKey.toUpperCase()}` : "Focus: -";
  dom.stageName.textContent = `${focusLabel} | Next unlock: ${next === "Done" ? "Done" : next.toUpperCase()}`;
  dom.activeKeys.textContent = state.unlocked.split("").join(" ");
}

function renderText() {
  const text = state.text;
  const cursor = state.cursorPos;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const span = document.createElement("span");
    span.textContent = (ch === " ") ? "·" : ch;
    span.classList.add("char");
    if (ch === " ") span.classList.add("space");

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
  let grossWpm = 0;
  let netWpm = 0;
  let accuracy = 1;

  if (elapsedSec > 1 && state.session.keystrokes > 0) {
    grossWpm = (state.session.keystrokes / 5) / Math.max(minutes, 1 / 60);
    accuracy = (state.session.keystrokes - state.session.errors) / state.session.keystrokes;
    netWpm = grossWpm * accuracy;
  }

  dom.statGrossWpm.textContent = grossWpm.toFixed(1);
  dom.statNetWpm.textContent = netWpm.toFixed(1);
  dom.statAccuracy.textContent = `${(accuracy * 100).toFixed(1)}%`;
  dom.statKeystrokes.textContent = String(state.session.keystrokes);
  dom.statErrors.textContent = String(state.session.errors);
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

/* ---------- Charts ---------- */

function maybeSampleCharts() {
  if (!state.session.startedAt) return;

  const elapsedSec = state.session.elapsedMs / 1000;
  const last = state.session.samples[state.session.samples.length - 1];
  if (last && (elapsedSec - last.tSec) < 1.0) return; // ~1 sample/sec

  // compute current stats snapshot
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

  state.session.samples.push({
    tSec: elapsedSec,
    grossWpm,
    netWpm,
    acc
  });

  // cap memory a bit
  if (state.session.samples.length > 1200) {
    state.session.samples.shift();
  }
}

function renderCharts() {
  drawLineChart(dom.chartWpm, state.session.samples, "tSec", "netWpm", 0, 160);
  drawLineChart(dom.chartAcc, state.session.samples, "tSec", "acc", 0, 1);
}

function drawLineChart(canvas, samples, xKey, yKey, yMin, yMax) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // clear
  ctx.clearRect(0, 0, w, h);

  // background
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, w, h);

  // axes padding
  const padL = 44;
  const padR = 12;
  const padT = 10;
  const padB = 26;

  // grid
  ctx.strokeStyle = "rgba(148,163,184,0.18)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = padT + (i * (h - padT - padB)) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  // no data
  if (!samples || samples.length < 2) {
    ctx.fillStyle = "rgba(148,163,184,0.7)";
    ctx.font = "14px system-ui";
    ctx.fillText("Start typing to populate the chart", padL, h / 2);
    return;
  }

  const x0 = samples[0][xKey];
  const x1 = samples[samples.length - 1][xKey];
  const xSpan = Math.max(1e-6, x1 - x0);

  const plotW = (w - padL - padR);
  const plotH = (h - padT - padB);

  // line
  ctx.strokeStyle = "rgba(59,130,246,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i < samples.length; i++) {
    const xVal = samples[i][xKey];
    const yValRaw = samples[i][yKey];

    const yVal = Math.max(yMin, Math.min(yMax, yValRaw));
    const px = padL + ((xVal - x0) / xSpan) * plotW;
    const py = padT + (1 - (yVal - yMin) / (yMax - yMin)) * plotH;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.stroke();

  // labels (very light)
  ctx.fillStyle = "rgba(148,163,184,0.85)";
  ctx.font = "12px system-ui";

  const yLabelTop = (yKey === "acc") ? "100%" : `${Math.round(yMax)}`;
  const yLabelBot = (yKey === "acc") ? "0%" : `${Math.round(yMin)}`;

  ctx.fillText(yLabelTop, 10, 16);
  ctx.fillText(yLabelBot, 10, h - 10);

  ctx.fillText(`${Math.round(x0)}s`, padL, h - 8);
  ctx.fillText(`${Math.round(x1)}s`, w - padR - 34, h - 8);
}

/* ---------- Keyboard ---------- */

function buildKeyboardBase() {
  if (!dom.keyboardVisual) return;
  dom.keyboardVisual.innerHTML = "";

  const layoutKey = state.settings.keyboardLayout || "normal";
  const layout = KEYBOARD_LAYOUTS[layoutKey] || KEYBOARD_LAYOUTS.normal;

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

  // split straight
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
  const keyDiv = document.createElement("div");
  keyDiv.classList.add("key");
  keyDiv.dataset.key = key;
  keyDiv.textContent = key.toUpperCase();

  if ("asdfjkl;".includes(key)) keyDiv.classList.add("key-home");
  return keyDiv;
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
  if (!dom.keyboardVisual) return;

  const unlockedSet = new Set(state.unlocked.split(""));
  const currentChar = state.text[state.cursorPos] || null;
  const focus = state.focusKey;

  const keys = dom.keyboardVisual.querySelectorAll(".key");
  keys.forEach((el) => {
    const ch = el.dataset.key;

    el.classList.remove("key-unlocked", "key-locked", "key-current");

    // unlocked/locked styling
    if (ch === " ") {
      el.classList.add("key-unlocked");
    } else if (unlockedSet.has(ch)) {
      el.classList.add("key-unlocked");
    } else {
      el.classList.add("key-locked");
    }

    // current target highlight
    if (currentChar && ch === currentChar) {
      el.classList.add("key-current");
    }

    // Heatmap: tint unlocked keys based on recent accuracy
    // We do this with inline background so it doesn’t fight the base classes too much.
    if (ch !== " " && unlockedSet.has(ch)) {
      const rAcc = recentAccuracyForKey(ch);
      if (rAcc !== null) {
        // map acc 0.7..1.0 to lightness 18..34 (still dark UI)
        const clamped = Math.max(0.7, Math.min(1.0, rAcc));
        const light = 18 + (clamped - 0.7) * (34 - 18) / 0.3; // 18..34
        // bluish hue; lower accuracy = darker
        el.style.background = `hsl(221 70% ${light}%)`;
      } else {
        el.style.background = "";
      }
    } else {
      el.style.background = "";
    }

    // Slight extra cue for focus key
    if (focus && ch === focus) {
      el.style.boxShadow = "0 0 0 2px rgba(59,130,246,0.6)";
    } else if (!el.classList.contains("key-current")) {
      el.style.boxShadow = "";
    }
  });
}

/* ---------- Utilities ---------- */

function renderAllStartupSafe() { /* not used */ }

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
