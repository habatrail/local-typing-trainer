"use strict";

const STORAGE_KEY = "localKeybrTrainerStateV1";

/**
 * Stages:
 *  - Each stage defines a *new* group of keys to focus on.
 *  - unlockedChars is the union of all stages up to currentStageIndex.
 */
const KEY_STAGES = [
  {
    id: "home-full",
    name: "Home Row - Full",
    keys: "asdfjkl;"
  },
  {
    id: "home-center",
    name: "Home Row - Center (G, H)",
    keys: "gh"
  },
  {
    id: "top-inner",
    name: "Top Row - Inner (R T Y U)",
    keys: "rtyu"
  },
  {
    id: "top-outer",
    name: "Top Row - Outer (Q W E I O)",
    keys: "qweio"
  },
  {
    id: "top-edge",
    name: "Top Row - Edge (P)",
    keys: "p"
  },
  {
    id: "bottom-inner",
    name: "Bottom Row - Inner (V B N)",
    keys: "vbn"
  },
  {
    id: "bottom-outer",
    name: "Bottom Row - Outer (Z X C M)",
    keys: "zxcm"
  },
  {
    id: "bottom-edge",
    name: "Bottom Row - Edge (, . /)",
    keys: ",./"
  }
];

const PROGRESSION_CONFIG = {
  minAttemptsPerChar: 40,
  minAccuracy: 0.93,
  regressMinAttemptsPerChar: 60,
  regressAccuracy: 0.85
};

/* Keyboard layouts */

// Full normal QWERTY rows
const NORMAL_KEYBOARD_ROWS = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"]
];

// Split halves (letters + nearby punctuation)
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

const KEYBOARD_LAYOUTS = {
  "normal": { type: "normal" },
  "split-straight": { type: "splitStraight" }
};

let state = {
  currentStageIndex: 0,
  unlockedChars: "asdfjkl;",                // full home row to start
  newestStageChars: new Set("asdfjkl;"),
  text: "",
  cursorPos: 0,
  session: {
    startedAt: null,
    lastKeyTime: null,
    elapsedMs: 0,
    keystrokes: 0,
    errors: 0
  },
  charStats: {},
  settings: {
    soundOnError: false,
    backspaceMode: "discouraged",
    fontSize: 32,
    keyboardLayout: "normal"
  }
};

let dom = {};
let audioCtx = null;

// Safe init
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

function init() {
  cacheDom();
  loadState();
  prepareNewestStageSet();
  state.unlockedChars = computeUnlockedCharsUpTo(state.currentStageIndex);
  buildKeyboardBase();
  applySettingsToUI();
  attachListeners();
  generateNewText();
  renderAll();
}

/* DOM / SETUP */

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
}

function attachListeners() {
  if (!dom.typingArea) return;

  dom.typingArea.addEventListener("click", () => {
    dom.typingArea.focus();
  });

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
    const size = parseInt(dom.settingFontSize.value, 10) || 32;
    state.settings.fontSize = size;
    dom.generatedText.style.fontSize = size + "px";
    saveState();
  });

  dom.settingKeyboardLayout.addEventListener("change", () => {
    const value = dom.settingKeyboardLayout.value || "normal";
    state.settings.keyboardLayout = value;
    saveState();
    buildKeyboardBase();
    renderKeyboardDynamic();
  });
}

/* MAIN INPUT HANDLER */

function handleKeydown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return;
  }

  const key = e.key;

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

  if (key.length !== 1) {
    return;
  }

  if (!state.session.startedAt) {
    startSession();
  }

  const expected = state.text[state.cursorPos];
  if (expected === undefined) return;

  const now = performance.now();
  const normalizedKey = key === " " ? " " : key;
  const rt = computeReactionTime(now);

  updateCharStats(expected, normalizedKey, rt);

  if (normalizedKey === expected) {
    state.cursorPos += 1;
  } else {
    state.session.errors += 1;
    if (state.settings.soundOnError) {
      playErrorSound();
    }
  }

  state.session.keystrokes += 1;
  state.session.lastKeyTime = now;

  if (state.cursorPos >= state.text.length) {
    generateNewText();
    state.cursorPos = 0;
  }

  updateElapsed();
  evaluateProgression();
  saveState();
  renderAll();
}

/* PROGRESSION / REGRESSION */

function evaluateProgression() {
  const oldStage = state.currentStageIndex;

  maybeAdvanceStage();
  maybeRegressStage();

  if (state.currentStageIndex !== oldStage) {
    state.unlockedChars = computeUnlockedCharsUpTo(state.currentStageIndex);
    prepareNewestStageSet();
    generateNewText();
    state.cursorPos = 0;
  }
}

function maybeAdvanceStage() {
  const stageIndex = state.currentStageIndex;
  if (stageIndex >= KEY_STAGES.length - 1) return;

  const currentStage = KEY_STAGES[stageIndex];
  const chars = currentStage.keys.split("");

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const stat = state.charStats[ch];
    if (!stat || stat.attempts < PROGRESSION_CONFIG.minAttemptsPerChar) return;
    const acc = (stat.attempts - stat.errors) / stat.attempts;
    if (acc < PROGRESSION_CONFIG.minAccuracy) return;
  }

  state.currentStageIndex += 1;
}

function maybeRegressStage() {
  const stageIndex = state.currentStageIndex;
  if (stageIndex <= 0) return;

  const currentStage = KEY_STAGES[stageIndex];
  const chars = currentStage.keys.split("");

  let shouldRegress = false;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const stat = state.charStats[ch];
    if (!stat || stat.attempts < PROGRESSION_CONFIG.regressMinAttemptsPerChar) {
      continue;
    }
    const acc = (stat.attempts - stat.errors) / stat.attempts;
    if (acc < PROGRESSION_CONFIG.regressAccuracy) {
      shouldRegress = true;
      break;
    }
  }

  if (shouldRegress) {
    state.currentStageIndex -= 1;
  }
}

// unlocked chars = union of keys from all stages up to stageIndex inclusive
function computeUnlockedCharsUpTo(stageIndex) {
  const set = new Set();
  for (let i = 0; i <= stageIndex && i < KEY_STAGES.length; i++) {
    KEY_STAGES[i].keys.split("").forEach((ch) => set.add(ch));
  }
  return Array.from(set).join("");
}

/* STATS & SESSION */

function computeReactionTime(now) {
  const sess = state.session;
  if (!sess.lastKeyTime) return null;

  const rt = now - sess.lastKeyTime;
  if (rt < 50 || rt > 8000) return null;
  return rt;
}

function updateCharStats(expected, pressed, rt) {
  const charsToUpdate = new Set([expected]);
  if (pressed !== expected) {
    charsToUpdate.add(pressed);
  }

  charsToUpdate.forEach((ch) => {
    if (!state.charStats[ch]) {
      state.charStats[ch] = {
        attempts: 0,
        errors: 0,
        totalRT: 0,
        rtSamples: 0
      };
    }
  });

  const stat = state.charStats[expected];
  stat.attempts += 1;
  if (pressed !== expected) {
    stat.errors += 1;
  }
  if (rt !== null) {
    stat.totalRT += rt;
    stat.rtSamples += 1;
  }

  if (pressed !== expected) {
    const ps = state.charStats[pressed];
    ps.attempts += 1;
    ps.errors += 1;
    if (rt !== null) {
      ps.totalRT += rt;
      ps.rtSamples += 1;
    }
  }
}

function startSession() {
  const now = performance.now();
  state.session.startedAt = now;
  state.session.lastKeyTime = now;
  state.session.elapsedMs = 0;
  state.session.keystrokes = 0;
  state.session.errors = 0;
}

function resetSession() {
  state.session.startedAt = null;
  state.session.lastKeyTime = null;
  state.session.elapsedMs = 0;
  state.session.keystrokes = 0;
  state.session.errors = 0;
}

function endSession() {
  // later: store session history
}

function updateElapsed() {
  if (!state.session.startedAt) return;
  const now = performance.now();
  state.session.elapsedMs = now - state.session.startedAt;
}

/* TEXT GENERATION */

function generateNewText() {
  const activeChars = state.unlockedChars;
  const newestSet = state.newestStageChars;
  const wordCount = 8;
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    const len = randInt(3, 7);
    words.push(generatePseudoWord(activeChars, newestSet, len));
  }
  state.text = words.join(" ");
}

function generatePseudoWord(activeChars, newestSet, length) {
  let word = "";
  let lastChar = null;
  for (let i = 0; i < length; i++) {
    const ch = weightedPickChar(activeChars, newestSet, lastChar);
    word += ch;
    lastChar = ch;
  }
  return word;
}

function weightedPickChar(chars, newestSet, lastChar) {
  const arr = chars.split("");
  const weights = [];
  let total = 0;

  for (let i = 0; i < arr.length; i++) {
    const ch = arr[i];
    let w = 1;

    const stat = state.charStats[ch];
    if (!stat || stat.attempts < 10) {
      w += 1.5;
    } else {
      const acc = (stat.attempts - stat.errors) / stat.attempts;
      w += (1 - acc) * 3;
    }

    if (newestSet.has(ch)) {
      w += 2;
    }

    if (ch === lastChar) {
      w *= 0.6;
    }

    weights.push(w);
    total += w;
  }

  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

/* PERSISTENCE */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state = {
      ...state,
      ...data,
      session: {
        ...state.session
      }
    };

    if (typeof state.currentStageIndex !== "number") {
      state.currentStageIndex = 0;
    }
    if (!state.settings) {
      state.settings = {
        soundOnError: false,
        backspaceMode: "discouraged",
        fontSize: 32,
        keyboardLayout: "normal"
      };
    } else {
      if (!state.settings.fontSize) state.settings.fontSize = 32;
      if (!state.settings.keyboardLayout) state.settings.keyboardLayout = "normal";
    }
    if (!state.unlockedChars) {
      state.unlockedChars = computeUnlockedCharsUpTo(state.currentStageIndex);
    }
  } catch (e) {
    console.warn("Failed to load state:", e);
  }
}

function saveState() {
  const toSave = {
    currentStageIndex: state.currentStageIndex,
    unlockedChars: state.unlockedChars,
    charStats: state.charStats,
    settings: state.settings
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn("Failed to save state:", e);
  }
}

function prepareNewestStageSet() {
  const stage = KEY_STAGES[state.currentStageIndex];
  state.newestStageChars = new Set(stage.keys.split(""));
}

/* RENDERING */

function renderAll() {
  renderStageInfo();
  renderText();
  renderSessionStats();
  renderCharStats();
  renderKeyboardDynamic();
}

function renderStageInfo() {
  const stage = KEY_STAGES[state.currentStageIndex];
  dom.stageName.textContent = stage.name;
  dom.activeKeys.textContent = state.unlockedChars.split("").join(" ");
}

function renderText() {
  const text = state.text;
  const cursor = state.cursorPos;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const span = document.createElement("span");
    span.textContent = ch;
    span.classList.add("char");
    if (ch === " ") {
      span.classList.add("space");
      span.textContent = "·";
    }

    if (i < cursor) {
      span.classList.add("correct");
    } else if (i === cursor) {
      span.classList.add("current");
    } else {
      span.classList.add("upcoming");
    }
    frag.appendChild(span);
  }

  dom.generatedText.innerHTML = "";
  dom.generatedText.appendChild(frag);

  dom.generatedText.style.fontSize = state.settings.fontSize + "px";

  dom.cursorPosition.textContent = `Position: ${cursor}/${text.length}`;
  const percent = text.length === 0 ? 0 : Math.round((cursor / text.length) * 100);
  dom.progressPercent.textContent = `Block: ${percent}%`;
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
    accuracy =
      (state.session.keystrokes - state.session.errors) / state.session.keystrokes;
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

  chars.forEach((ch) => {
    const stat = state.charStats[ch];
    const tr = document.createElement("tr");

    const acc = stat.attempts
      ? (stat.attempts - stat.errors) / stat.attempts
      : 1;
    const avgRT = stat.rtSamples ? stat.totalRT / stat.rtSamples : 0;

    const cells = [
      ch === " " ? "␣" : ch,
      stat.attempts,
      stat.errors,
      `${(acc * 100).toFixed(1)}%`,
      avgRT ? avgRT.toFixed(0) : "–"
    ];

    cells.forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });

    dom.charStatsBody.appendChild(tr);
  });
}

/* ON-SCREEN KEYBOARD */

function buildKeyboardBase() {
  if (!dom.keyboardVisual) return;
  dom.keyboardVisual.innerHTML = "";

  const layoutKey = state.settings.keyboardLayout || "normal";
  const layout = KEYBOARD_LAYOUTS[layoutKey] || KEYBOARD_LAYOUTS["normal"];

  if (layout.type === "normal") {
    NORMAL_KEYBOARD_ROWS.forEach((row) => {
      const rowDiv = document.createElement("div");
      rowDiv.classList.add("keyboard-row");

      row.forEach((key) => {
        const keyDiv = document.createElement("div");
        keyDiv.classList.add("key");
        keyDiv.dataset.key = key;
        keyDiv.textContent = key.toUpperCase();

        if ("asdfjkl;".includes(key)) {
          keyDiv.classList.add("key-home");
        }

        rowDiv.appendChild(keyDiv);
      });

      dom.keyboardVisual.appendChild(rowDiv);
    });

    // Spacebar row
    const spaceRow = document.createElement("div");
    spaceRow.classList.add("keyboard-row");
    const spaceKey = document.createElement("div");
    spaceKey.classList.add("key", "key-space");
    spaceKey.dataset.key = " ";
    spaceKey.textContent = "Space";
    spaceRow.appendChild(spaceKey);
    dom.keyboardVisual.appendChild(spaceRow);
    return;
  }

  // Split-straight layout
  const splitContainer = document.createElement("div");
  splitContainer.classList.add("keyboard-split");

  const leftCol = document.createElement("div");
  leftCol.classList.add("keyboard-col");

  const rightCol = document.createElement("div");
  rightCol.classList.add("keyboard-col");

  SPLIT_LEFT_ROWS.forEach((row) => {
    const rowDiv = document.createElement("div");
    rowDiv.classList.add("keyboard-row");
    row.forEach((key) => {
      const keyDiv = document.createElement("div");
      keyDiv.classList.add("key");
      keyDiv.dataset.key = key;
      keyDiv.textContent = key.toUpperCase();
      if ("asdfjkl;".includes(key)) {
        keyDiv.classList.add("key-home");
      }
      rowDiv.appendChild(keyDiv);
    });
    leftCol.appendChild(rowDiv);
  });

  SPLIT_RIGHT_ROWS.forEach((row) => {
    const rowDiv = document.createElement("div");
    rowDiv.classList.add("keyboard-row");
    row.forEach((key) => {
      const keyDiv = document.createElement("div");
      keyDiv.classList.add("key");
      keyDiv.dataset.key = key;
      keyDiv.textContent = key.toUpperCase();
      if ("asdfjkl;".includes(key)) {
        keyDiv.classList.add("key-home");
      }
      rowDiv.appendChild(keyDiv);
    });
    rightCol.appendChild(rowDiv);
  });

  splitContainer.appendChild(leftCol);
  splitContainer.appendChild(rightCol);

  // Spacebar under both halves
  const spaceRow = document.createElement("div");
  spaceRow.classList.add("keyboard-row");
  const spaceKey = document.createElement("div");
  spaceKey.classList.add("key", "key-space");
  spaceKey.dataset.key = " ";
  spaceKey.textContent = "Space";
  spaceRow.appendChild(spaceKey);

  dom.keyboardVisual.appendChild(splitContainer);
  dom.keyboardVisual.appendChild(spaceRow);
}

function renderKeyboardDynamic() {
  if (!dom.keyboardVisual) return;
  const keys = dom.keyboardVisual.querySelectorAll(".key");
  const unlockedSet = new Set(state.unlockedChars.split(""));
  const currentChar = state.text[state.cursorPos] || null;

  keys.forEach((el) => {
    const ch = el.dataset.key;
    if (ch === undefined) return;

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

/* UTILITIES */

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

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applySettingsToUI() {
  dom.settingSoundError.checked = !!state.settings.soundOnError;
  dom.settingBackspaceMode.value = state.settings.backspaceMode || "discouraged";
  dom.settingFontSize.value = state.settings.fontSize || 32;
  dom.generatedText.style.fontSize = (state.settings.fontSize || 32) + "px";
  dom.settingKeyboardLayout.value = state.settings.keyboardLayout || "normal";
}
