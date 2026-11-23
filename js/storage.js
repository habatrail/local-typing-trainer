// Versioned, reload-safe persistence with import/export. Never throws on bad
// stored data: anything unrecognised falls back to defaults.
"use strict";
(function (LTT) {
  const STORAGE_KEY = "ltt.v4";
  const VERSION = 4;
  const APP_ID = "local-typing-trainer";
  const MAX_LESSONS = 2000;
  const DEFAULT_SETTINGS = Object.freeze({
    targetWpm: 35,
    lessonLength: 0.5,
    recoverKeys: false,
    keyboardFade: true,
    soundOnError: false,
    fontSize: 34,
    keyboardLayout: "normal",
  });
  const LAYOUTS = ["normal", "split-straight"];

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function defaultState() {
    return {
      version: VERSION,
      settings: Object.assign({}, DEFAULT_SETTINGS),
      unlocked: LTT.START_KEYS.slice(),
      focus: null,
      keyStats: {},
      lessons: [],
      current: null,
    };
  }

  function sanitizeSettings(raw) {
    const r = isObj(raw) ? raw : {};
    const d = DEFAULT_SETTINGS;
    return {
      targetWpm: clamp(num(r.targetWpm, d.targetWpm), 15, 150),
      lessonLength: clamp(num(r.lessonLength, d.lessonLength), 0, 1),
      recoverKeys: typeof r.recoverKeys === "boolean" ? r.recoverKeys : d.recoverKeys,
      keyboardFade: typeof r.keyboardFade === "boolean" ? r.keyboardFade : d.keyboardFade,
      soundOnError: typeof r.soundOnError === "boolean" ? r.soundOnError : d.soundOnError,
      fontSize: clamp(num(r.fontSize, d.fontSize), 22, 56),
      keyboardLayout: LAYOUTS.includes(r.keyboardLayout) ? r.keyboardLayout : d.keyboardLayout,
    };
  }

  function sanitizeUnlocked(raw) {
    const sequence = LTT.START_KEYS.concat(LTT.UNLOCK_ORDER);
    const set = new Set(LTT.START_KEYS);
    if (Array.isArray(raw)) for (const k of raw) if (sequence.includes(k)) set.add(k);
    return sequence.filter((k) => set.has(k));
  }

  function sanitizeKeyStats(raw) {
    const out = {};
    if (!isObj(raw)) return out;
    for (const [ch, k] of Object.entries(raw)) {
      if (ch.length !== 1 || !isObj(k)) continue;
      out[ch] = {
        samples: Array.isArray(k.samples) ? k.samples.filter(isObj) : [],
        timeToType: numOrNull(k.timeToType),
        bestTimeToType: numOrNull(k.bestTimeToType),
        hitCount: num(k.hitCount, 0),
        missCount: num(k.missCount, 0),
        lessons: num(k.lessons, 0),
      };
    }
    return out;
  }

  function sanitizeLessons(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l) => isObj(l) && typeof l.wpm === "number" && typeof l.accuracy === "number")
      .slice(-MAX_LESSONS);
  }

  function sanitizeCurrent(c) {
    if (!isObj(c) || typeof c.text !== "string" || c.text.length === 0) return null;
    if (!Number.isInteger(c.pos) || c.pos < 0 || c.pos > c.text.length) return null;
    if (!Array.isArray(c.steps)) return null;
    return {
      text: c.text,
      pos: c.pos,
      typo: c.typo === true,
      steps: c.steps.filter((s) => isObj(s) && typeof s.ch === "string"),
      lastTime: null,
      activeMs: num(c.activeMs, 0),
      missCount: num(c.missCount, 0),
    };
  }

  function sanitizeState(raw) {
    const r = isObj(raw) ? raw : {};
    const unlocked = sanitizeUnlocked(r.unlocked);
    return {
      version: VERSION,
      settings: sanitizeSettings(r.settings),
      unlocked,
      focus: typeof r.focus === "string" && unlocked.includes(r.focus) ? r.focus : null,
      keyStats: sanitizeKeyStats(r.keyStats),
      lessons: sanitizeLessons(r.lessons),
      current: sanitizeCurrent(r.current),
    };
  }

  function loadState(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return sanitizeState(JSON.parse(raw));
    } catch (e) {
      return defaultState();
    }
  }

  function saveState(storage, state) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function exportState(state) {
    return JSON.stringify(Object.assign({ app: APP_ID }, state));
  }

  function importState(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
    if (!isObj(data) || data.app !== APP_ID || data.version !== VERSION) {
      throw new Error("Not a typing trainer progress file");
    }
    return sanitizeState(data);
  }

  Object.assign(LTT, {
    STORAGE_KEY, DEFAULT_SETTINGS, defaultState, sanitizeState, loadState, saveState, exportState, importState,
  });
})((globalThis.LTT = globalThis.LTT || {}));
