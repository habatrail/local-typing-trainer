// Lesson engine: applies keystrokes to a lesson text and computes per-key
// timing and misses.
//
// Timing and miss rules reimplemented from keybr.com
// (https://github.com/aradzie/keybr.com), packages/keybr-textinput:
// histogram.ts, textinput.ts. Copyright (c) Aleksei Radzievskii, AGPL-3.0.
"use strict";
(function (LTT) {
  const PAUSE_MS = 3000;
  const MIN_TIME_TO_TYPE = 40; // faster than 300 WPM: implausible
  const MAX_TIME_TO_TYPE = 12000; // slower than 1 WPM: implausible

  function newLesson(text) {
    return { text, pos: 0, typo: false, steps: [], lastTime: null, activeMs: 0, missCount: 0 };
  }

  function isLessonDone(lesson) {
    return lesson.pos >= lesson.text.length;
  }

  function resumeLesson(lesson) {
    lesson.lastTime = null;
    return lesson;
  }

  function applyKey(lesson, key, now) {
    if (typeof key !== "string" || key.length !== 1) return "ignored";
    if (isLessonDone(lesson)) return "ignored";

    const gap = lesson.lastTime == null ? null : now - lesson.lastTime;
    const counted = gap != null && gap >= 0 && gap <= PAUSE_MS;
    if (counted) lesson.activeMs += gap;
    lesson.lastTime = now;

    const expected = lesson.text[lesson.pos];
    if (key === expected) {
      lesson.steps.push({ ch: expected, t: counted ? gap : 0, typo: lesson.typo });
      lesson.pos += 1;
      lesson.typo = false;
      return "hit";
    }
    if (!lesson.typo) {
      lesson.missCount += 1;
      lesson.typo = true;
    }
    return "miss";
  }

  function lessonResult(lesson) {
    const acc = new Map();
    let clean = 0;
    for (const { ch, t, typo } of lesson.steps) {
      let s = acc.get(ch);
      if (!s) acc.set(ch, (s = { hitCount: 0, missCount: 0, time: 0, count: 0 }));
      s.hitCount += 1;
      if (typo) {
        s.missCount += 1;
      } else {
        clean += 1;
        if (t > 0) {
          s.time += t;
          s.count += 1;
        }
      }
    }
    const histogram = {};
    for (const [ch, s] of acc) {
      const timeToType = s.count > 0 ? Math.round(s.time / s.count) : 0;
      if (timeToType > 0 && (timeToType < MIN_TIME_TO_TYPE || timeToType > MAX_TIME_TO_TYPE)) continue;
      histogram[ch] = { hitCount: s.hitCount, missCount: s.missCount, timeToType };
    }
    const steps = lesson.steps.length;
    const activeMs = lesson.activeMs;
    return {
      histogram,
      wpm: activeMs > 0 ? (lesson.text.length / 5) / (activeMs / 60000) : 0,
      accuracy: steps > 0 ? clean / steps : 1,
      activeMs,
      valid: Object.keys(histogram).length >= 3 && activeMs > 0,
    };
  }

  Object.assign(LTT, { PAUSE_MS, newLesson, isLessonDone, resumeLesson, applyKey, lessonResult });
})((globalThis.LTT = globalThis.LTT || {}));
