// Key unlocking and focus: a new letter unlocks only when every unlocked letter
// has reached the target speed; practice focuses on the least confident letter.
//
// Rules reimplemented from keybr.com (https://github.com/aradzie/keybr.com),
// packages/keybr-lesson: guided.ts (update), target.ts.
// Copyright (c) Aleksei Radzievskii, AGPL-3.0.
// Differences from keybr: home-row start and custom unlock order, unlocks are
// permanent, and punctuation never gates or takes focus.
"use strict";
(function (LTT) {
  const START_KEYS = ["a", "s", "d", "f", "j", "k", "l", ";"];
  const UNLOCK_ORDER = ["e", "i", "g", "h", "r", "t", "y", "u", "o", "w", "q", "p",
    "v", "b", "n", "c", "m", "x", "z", "'", ",", ".", "/"];
  const SEQUENCE = START_KEYS.concat(UNLOCK_ORDER);
  const PUNCT = new Set([";", "'", ",", ".", "/"]);

  function confidence(timeToType, targetWpm) {
    if (timeToType == null || !(timeToType > 0)) return null;
    return (60000 / (targetWpm * 5)) / timeToType;
  }

  // The confidence the unlock and focus rules use: best speed ever, or current
  // speed when "recover keys" is on. The UI shows this same value.
  function keyConfidence(keyStat, { targetWpm, recoverKeys }) {
    if (!keyStat) return null;
    return confidence(recoverKeys ? keyStat.timeToType : keyStat.bestTimeToType, targetWpm);
  }

  function updateProgression({ unlocked, keyStats, targetWpm, recoverKeys }) {
    const set = new Set(START_KEYS.concat(unlocked || []));
    const conf = (ch) => keyConfidence(keyStats[ch], { targetWpm, recoverKeys }) || 0;
    const letters = () => SEQUENCE.filter((ch) => set.has(ch) && !PUNCT.has(ch));

    const newlyUnlocked = [];
    for (const ch of UNLOCK_ORDER) {
      if (set.has(ch)) continue;
      if (PUNCT.has(ch) || letters().every((l) => conf(l) >= 1)) {
        set.add(ch);
        newlyUnlocked.push(ch);
        continue;
      }
      break;
    }

    let focus = null;
    let lowest = 1;
    for (const l of letters()) {
      const c = conf(l);
      if (c < lowest) { lowest = c; focus = l; }
    }

    return { unlocked: SEQUENCE.filter((ch) => set.has(ch)), focus, newlyUnlocked };
  }

  Object.assign(LTT, { START_KEYS, UNLOCK_ORDER, confidence, keyConfidence, updateProgression });
})((globalThis.LTT = globalThis.LTT || {}));
