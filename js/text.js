// Lesson text generator: real words first, phonetic pseudo-words as padding,
// occasional punctuation.
//
// Reimplemented from keybr.com (https://github.com/aradzie/keybr.com),
// packages/keybr-lesson: guided.ts (generate), dictionary.ts, text/words.ts,
// text/fragment.ts. Copyright (c) Aleksei Radzievskii, AGPL-3.0.
"use strict";
(function (LTT) {
  const PUNCTUATION = [";", "'", ",", ".", "/"];
  const PUNCTUATION_RATE = 0.15;
  const MAX_DICTIONARY_WORDS = 1000;
  const MIN_POOL = 15;

  function buildPool(letters, focus, rng) {
    const allowed = new Set(letters);
    const pool = [];
    for (const w of globalThis.LTT_DATA.wordsEn) {
      if (w.length <= 2) continue;
      if (focus && !w.includes(focus)) continue;
      let ok = true;
      for (const c of w) if (!allowed.has(c)) { ok = false; break; }
      if (!ok) continue;
      pool.push(w);
      if (pool.length >= MAX_DICTIONARY_WORDS) break;
    }
    const model = LTT.getModel();
    while (pool.length < MIN_POOL) {
      const w = model.nextWord(allowed, focus, rng);
      if (!w) break;
      pool.push(w);
    }
    if (pool.length === 0) pool.push(letters.join("").slice(0, 3));
    return pool;
  }

  function generateLessonText({ letters, focus, punctuation, lengthSetting, rng }) {
    rng = rng || Math.random;
    punctuation = punctuation || [];
    const pool = buildPool(letters, focus, rng);
    const target = 100 + Math.round((lengthSetting || 0) * 100);

    let last = "";
    const nextWord = () => {
      let w = pool[Math.floor(rng() * pool.length)];
      for (let n = 0; n < 3 && w === last && pool.length > 1; n++) {
        w = pool[Math.floor(rng() * pool.length)];
      }
      last = w;
      return w;
    };

    const words = [];
    let chars = 0;
    while (chars < target) {
      let w = nextWord();
      if (punctuation.length && rng() < PUNCTUATION_RATE) {
        const p = punctuation[Math.floor(rng() * punctuation.length)];
        if (p === "'") w = "'" + w + "'";
        else if (p === "/") w = w + "/" + nextWord();
        else w = w + p;
      }
      words.push(w);
      chars += w.length;
    }
    return words.join(" ");
  }

  Object.assign(LTT, { PUNCTUATION, generateLessonText });
})((globalThis.LTT = globalThis.LTT || {}));
