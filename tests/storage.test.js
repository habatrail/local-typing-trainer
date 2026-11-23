"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./helpers");

const LTT = loadApp();

function memStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}
const throwing = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceeded"); },
};

function sampleState() {
  const s = LTT.defaultState();
  LTT.addLessonToKeyStats(s.keyStats, { a: { hitCount: 3, missCount: 1, timeToType: 250 } }, 1, 1000);
  s.lessons.push({ index: 1, ts: 1000, wpm: 40, accuracy: 0.95, length: 120, activeMs: 36000, unlockedCount: 8, newKeys: [] });
  s.current = LTT.newLesson("asdf jkl");
  LTT.applyKey(s.current, "a", 0);
  LTT.applyKey(s.current, "s", 200);
  return s;
}

test("defaults", () => {
  const s = LTT.defaultState();
  assert.strictEqual(s.version, 4);
  assert.deepStrictEqual(s.settings, LTT.DEFAULT_SETTINGS);
  assert.deepStrictEqual(s.unlocked, LTT.START_KEYS);
  assert.strictEqual(LTT.STORAGE_KEY, "ltt.v4");
});

test("save and load round trip keeps stats, history and the lesson in progress", () => {
  const st = memStorage();
  const s = sampleState();
  assert.strictEqual(LTT.saveState(st, s), true);
  const back = LTT.loadState(st);
  assert.deepStrictEqual(back.keyStats, s.keyStats);
  assert.deepStrictEqual(back.lessons, s.lessons);
  assert.strictEqual(back.current.text, "asdf jkl");
  assert.strictEqual(back.current.pos, 2);
  assert.deepStrictEqual(back.current.steps, s.current.steps);
});

test("corrupt or foreign stored data falls back to defaults", () => {
  for (const raw of ["{not json", "null", "[]", '{"version":4,"unlocked":"x"}', '{"version":4,"current":{"text":5}}']) {
    const s = LTT.loadState(memStorage({ "ltt.v4": raw }));
    assert.strictEqual(s.version, 4, raw);
    for (const k of LTT.START_KEYS) assert.ok(s.unlocked.includes(k), raw);
    assert.deepStrictEqual(s.settings, LTT.DEFAULT_SETTINGS, raw);
    assert.strictEqual(s.current, null, raw);
  }
});

test("storage that throws never crashes", () => {
  const s = LTT.loadState(throwing);
  assert.strictEqual(s.version, 4);
  assert.strictEqual(LTT.saveState(throwing, s), false);
});

test("settings are clamped and merged over defaults", () => {
  const s = LTT.sanitizeState({ version: 4, settings: { targetWpm: 9999, lessonLength: -3, fontSize: 40 } });
  assert.strictEqual(s.settings.targetWpm, 150);
  assert.strictEqual(s.settings.lessonLength, 0);
  assert.strictEqual(s.settings.fontSize, 40);
  assert.strictEqual(s.settings.recoverKeys, false);
  assert.strictEqual(LTT.sanitizeState({ settings: { targetWpm: 1 } }).settings.targetWpm, 15);
});

test("unlocked keys always include the start keys and only known keys", () => {
  const s = LTT.sanitizeState({ version: 4, unlocked: ["e", "zz", 7, "e"] });
  for (const k of LTT.START_KEYS) assert.ok(s.unlocked.includes(k));
  assert.ok(s.unlocked.includes("e"));
  assert.ok(!s.unlocked.includes("zz"));
  assert.strictEqual(s.unlocked.filter((k) => k === "e").length, 1);
});

test("export then import restores the same progress", () => {
  const s = sampleState();
  const back = LTT.importState(LTT.exportState(s));
  assert.deepStrictEqual(back.keyStats, s.keyStats);
  assert.deepStrictEqual(back.lessons, s.lessons);
});

test("importing a bad file throws a clear error", () => {
  for (const bad of ["hello", '{"app":"other","version":4}', '{"app":"local-typing-trainer","version":3}', "null"]) {
    assert.throws(() => LTT.importState(bad), { message: "Not a typing trainer progress file" }, bad);
  }
});

test("lesson history is capped at 2000", () => {
  const s = LTT.defaultState();
  for (let i = 0; i < 2100; i++) s.lessons.push({ index: i, ts: i, wpm: 1, accuracy: 1, length: 100, activeMs: 1, unlockedCount: 8, newKeys: [] });
  const back = LTT.sanitizeState(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(back.lessons.length, 2000);
  assert.strictEqual(back.lessons[0].index, 100);
});
