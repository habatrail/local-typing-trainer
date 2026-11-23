"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./helpers");

const LTT = loadApp();
const START_LETTERS = ["a", "s", "d", "f", "j", "k", "l"];

function hist(map) {
  const h = {};
  for (const [ch, t] of Object.entries(map)) h[ch] = { hitCount: 10, missCount: 0, timeToType: t };
  return h;
}
function statsWith(map) {
  const ks = {};
  LTT.addLessonToKeyStats(ks, hist(map), 1, 1000);
  return ks;
}
const fast = (letters) => Object.fromEntries(letters.map((c) => [c, 300]));

test("EMA with alpha 0.1 and best time", () => {
  const ks = {};
  LTT.addLessonToKeyStats(ks, hist({ a: 300 }), 1, 1);
  LTT.addLessonToKeyStats(ks, hist({ a: 200 }), 2, 2);
  assert.strictEqual(ks.a.samples[0].filteredTimeToType, 300);
  assert.strictEqual(ks.a.samples[1].filteredTimeToType, 290);
  assert.strictEqual(ks.a.timeToType, 290);
  assert.strictEqual(ks.a.bestTimeToType, 290);
  assert.strictEqual(ks.a.lessons, 2);
  assert.strictEqual(ks.a.hitCount, 20);
});

test("typo-only sample keeps speed but counts hits and misses", () => {
  const ks = {};
  LTT.addLessonToKeyStats(ks, hist({ a: 300 }), 1, 1);
  LTT.addLessonToKeyStats(ks, { a: { hitCount: 2, missCount: 2, timeToType: 0 } }, 2, 2);
  assert.strictEqual(ks.a.timeToType, 300);
  assert.strictEqual(ks.a.missCount, 2);
  assert.strictEqual(ks.a.hitCount, 12);
});

test("keeps at most 100 samples per key, totals intact", () => {
  const ks = {};
  for (let i = 0; i < 150; i++) LTT.addLessonToKeyStats(ks, hist({ a: 300 }), i, i);
  assert.strictEqual(ks.a.samples.length, 100);
  assert.strictEqual(ks.a.lessons, 150);
});

test("confidence relative to target speed", () => {
  assert.ok(Math.abs(LTT.confidence(60000 / 175, 35) - 1) < 1e-9);
  assert.strictEqual(LTT.confidence(null, 35), null);
});

test("fresh start: home row unlocked, focus a", () => {
  const r = LTT.updateProgression({ unlocked: [], keyStats: {}, targetWpm: 35, recoverKeys: false });
  assert.deepStrictEqual(r.unlocked, LTT.START_KEYS);
  assert.strictEqual(r.focus, "a");
  assert.deepStrictEqual(r.newlyUnlocked, []);
});

test("all home letters at target unlocks e (punctuation ; not required)", () => {
  const r = LTT.updateProgression({
    unlocked: LTT.START_KEYS, keyStats: statsWith(fast(START_LETTERS)), targetWpm: 35, recoverKeys: false,
  });
  assert.deepStrictEqual(r.newlyUnlocked, ["e"]);
  assert.strictEqual(r.focus, "e");
});

test("a slowed key blocks the next unlock but never re-locks", () => {
  const unlocked = LTT.START_KEYS.concat(["e"]);
  const ks = statsWith(fast(START_LETTERS.concat(["e"])));
  for (let i = 0; i < 30; i++) LTT.addLessonToKeyStats(ks, hist({ s: 2000 }), 2 + i, 2 + i);
  const off = LTT.updateProgression({ unlocked, keyStats: ks, targetWpm: 35, recoverKeys: false });
  assert.deepStrictEqual(off.newlyUnlocked, ["i"], "best confidence still counts when recover is off");
  const on = LTT.updateProgression({ unlocked, keyStats: ks, targetWpm: 35, recoverKeys: true });
  assert.deepStrictEqual(on.newlyUnlocked, []);
  assert.ok(on.unlocked.includes("e"));
  assert.strictEqual(on.focus, "s");
});

test("punctuation unlocks automatically after z", () => {
  const letters = START_LETTERS.concat("eighrtyuowqpvbncmxz".split(""));
  const unlocked = LTT.START_KEYS.concat("eighrtyuowqpvbncmx".split(""));
  const r = LTT.updateProgression({ unlocked, keyStats: statsWith(fast(letters)), targetWpm: 35, recoverKeys: false });
  assert.deepStrictEqual(r.newlyUnlocked, ["z", "'", ",", ".", "/"]);
  assert.strictEqual(r.focus, null);
});

test("raising the target never removes keys", () => {
  const unlocked = LTT.START_KEYS.concat(["e", "i", "g"]);
  const r = LTT.updateProgression({
    unlocked, keyStats: statsWith(fast(START_LETTERS)), targetWpm: 150, recoverKeys: true,
  });
  for (const k of unlocked) assert.ok(r.unlocked.includes(k));
  assert.deepStrictEqual(r.newlyUnlocked, []);
});

test("displayConfidence matches the measure the unlock rules use", () => {
  const ks = {};
  LTT.addLessonToKeyStats(ks, hist({ a: 300 }), 1, 1);
  for (let i = 0; i < 30; i++) LTT.addLessonToKeyStats(ks, hist({ a: 2000 }), 2 + i, 2 + i);
  const best = LTT.confidence(ks.a.bestTimeToType, 35);
  const cur = LTT.confidence(ks.a.timeToType, 35);
  assert.strictEqual(LTT.keyConfidence(ks.a, { targetWpm: 35, recoverKeys: false }), best);
  assert.strictEqual(LTT.keyConfidence(ks.a, { targetWpm: 35, recoverKeys: true }), cur);
  assert.strictEqual(LTT.keyConfidence(undefined, { targetWpm: 35, recoverKeys: false }), null);
});

test("package license matches keybr's AGPL-3.0 (only)", () => {
  const pkg = require("../package.json");
  assert.strictEqual(pkg.license, "AGPL-3.0-only");
});
