// Per-key speed history, smoothed across lessons.
//
// Smoothing reimplemented from keybr.com (https://github.com/aradzie/keybr.com),
// packages/keybr-result/lib/keystats.ts. Copyright (c) Aleksei Radzievskii, AGPL-3.0.
"use strict";
(function (LTT) {
  const ALPHA = 0.1;
  const MAX_SAMPLES = 100;

  function addLessonToKeyStats(keyStats, histogram, lessonIndex, ts) {
    for (const [ch, h] of Object.entries(histogram)) {
      let k = keyStats[ch];
      if (!k) {
        k = keyStats[ch] = { samples: [], timeToType: null, bestTimeToType: null, hitCount: 0, missCount: 0, lessons: 0 };
      }
      let filtered = k.timeToType;
      if (h.timeToType > 0) {
        filtered = filtered == null ? h.timeToType : filtered + ALPHA * (h.timeToType - filtered);
        k.timeToType = filtered;
        k.bestTimeToType = k.bestTimeToType == null ? filtered : Math.min(k.bestTimeToType, filtered);
      }
      k.hitCount += h.hitCount;
      k.missCount += h.missCount;
      k.lessons += 1;
      k.samples.push({
        lesson: lessonIndex, ts, hitCount: h.hitCount, missCount: h.missCount,
        timeToType: h.timeToType, filteredTimeToType: filtered,
      });
      if (k.samples.length > MAX_SAMPLES) k.samples.splice(0, k.samples.length - MAX_SAMPLES);
    }
  }

  Object.assign(LTT, { addLessonToKeyStats });
})((globalThis.LTT = globalThis.LTT || {}));
