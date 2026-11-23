"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./helpers");

const LTT = loadApp();

function typeAll(lesson, keys, times) {
  keys.forEach((k, i) => LTT.applyKey(lesson, k, times[i]));
}

test("clean typing: timing from previous key, first key untimed", () => {
  const l = LTT.newLesson("asd");
  typeAll(l, ["a", "s", "d"], [0, 200, 400]);
  assert.ok(LTT.isLessonDone(l));
  const r = LTT.lessonResult(l);
  assert.strictEqual(r.histogram.a.timeToType, 0);
  assert.strictEqual(r.histogram.s.timeToType, 200);
  assert.strictEqual(r.histogram.d.timeToType, 200);
  assert.strictEqual(r.activeMs, 400);
  assert.ok(Math.abs(r.wpm - 90) < 1e-9);
  assert.strictEqual(r.accuracy, 1);
  assert.strictEqual(r.valid, true);
});

test("repeated misses on one char count once, cursor stops, char untimed", () => {
  const l = LTT.newLesson("asd");
  assert.strictEqual(LTT.applyKey(l, "a", 0), "hit");
  assert.strictEqual(LTT.applyKey(l, "x", 100), "miss");
  assert.strictEqual(LTT.applyKey(l, "y", 200), "miss");
  assert.strictEqual(LTT.applyKey(l, "z", 300), "miss");
  assert.strictEqual(l.pos, 1);
  assert.strictEqual(LTT.applyKey(l, "s", 400), "hit");
  assert.strictEqual(l.pos, 2);
  LTT.applyKey(l, "d", 600);
  const r = LTT.lessonResult(l);
  assert.strictEqual(l.missCount, 1);
  assert.strictEqual(r.histogram.s.missCount, 1);
  assert.strictEqual(r.histogram.s.hitCount, 1);
  assert.strictEqual(r.histogram.s.timeToType, 0);
  assert.strictEqual(r.histogram.a.missCount, 0);
  assert.strictEqual(r.histogram.d.timeToType, 200);
  assert.strictEqual(r.accuracy, 2 / 3);
});

test("non-character keys are ignored", () => {
  const l = LTT.newLesson("asd");
  assert.strictEqual(LTT.applyKey(l, "Backspace", 0), "ignored");
  assert.strictEqual(LTT.applyKey(l, "Shift", 10), "ignored");
  assert.strictEqual(l.pos, 0);
  assert.strictEqual(l.missCount, 0);
});

test("keys after the end are ignored", () => {
  const l = LTT.newLesson("as");
  typeAll(l, ["a", "s"], [0, 100]);
  assert.strictEqual(LTT.applyKey(l, "d", 200), "ignored");
});

test("a long pause adds no active time and leaves that key untimed", () => {
  const l = LTT.newLesson("asdf");
  typeAll(l, ["a", "s", "d", "f"], [0, 200, 200 + 5 * 60 * 1000, 200 + 5 * 60 * 1000 + 250]);
  const r = LTT.lessonResult(l);
  assert.strictEqual(r.activeMs, 450);
  assert.strictEqual(r.histogram.d.timeToType, 0);
  assert.strictEqual(r.histogram.f.timeToType, 250);
});

test("lesson survives JSON round trip and resume; first key after resume untimed", () => {
  const l = LTT.newLesson("asdf");
  typeAll(l, ["a", "s"], [0, 200]);
  const restored = LTT.resumeLesson(JSON.parse(JSON.stringify(l)));
  assert.strictEqual(restored.pos, 2);
  // a fresh clock after reload (performance.now restarts) — even a small number
  assert.strictEqual(LTT.applyKey(restored, "d", 50), "hit");
  assert.strictEqual(LTT.applyKey(restored, "f", 250), "hit");
  const r = LTT.lessonResult(restored);
  assert.strictEqual(r.histogram.d.timeToType, 0);
  assert.strictEqual(r.histogram.f.timeToType, 200);
  assert.strictEqual(r.activeMs, 400);
});

test("too few distinct characters is not a valid lesson", () => {
  const l = LTT.newLesson("aa a");
  typeAll(l, ["a", "a", " ", "a"], [0, 200, 400, 600]);
  assert.strictEqual(LTT.lessonResult(l).valid, false);
});

test("implausibly fast or slow key averages are dropped", () => {
  const l = LTT.newLesson("asdf");
  typeAll(l, ["a", "s", "d", "f"], [0, 10, 210, 410]);
  const r = LTT.lessonResult(l);
  assert.strictEqual(r.histogram.s, undefined);
  assert.strictEqual(r.histogram.d.timeToType, 200);
});
