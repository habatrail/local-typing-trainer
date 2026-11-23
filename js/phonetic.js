// Phonetic word model: reads keybr.com's binary transition table and generates
// pronounceable pseudo-words restricted to a set of letters.
//
// Reimplemented from keybr.com (https://github.com/aradzie/keybr.com),
// packages/keybr-phonetic-model: transitiontable.ts, phoneticmodel.ts, censor.ts,
// blacklist/scramble.ts. Copyright (c) Aleksei Radzievskii, AGPL-3.0.
"use strict";
(function (LTT) {
  const SIGNATURE = "keybr.com";
  const MIN_LENGTH = 3;
  const MAX_LENGTH = 10;
  const MAX_ATTEMPTS = 5;
  const MAX_CENSOR_TRIES = 20;

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function invalid() {
    return new Error("Invalid model data");
  }

  function loadPhoneticModel(bytes) {
    let p = 0;
    const u8 = () => {
      if (p >= bytes.length) throw invalid();
      return bytes[p++];
    };
    const u16 = () => (u8() << 8) | u8(); // big-endian

    for (let i = 0; i < SIGNATURE.length; i++) {
      if (u8() !== SIGNATURE.charCodeAt(i)) throw invalid();
    }
    const order = u8();
    const size = u8();
    const alphabet = [];
    for (let i = 0; i < size; i++) alphabet.push(String.fromCharCode(u16()));
    const segmentCount = Math.pow(size, order - 1);
    const segments = new Array(segmentCount);
    for (let s = 0; s < segmentCount; s++) {
      const n = u8();
      const entries = new Array(n);
      for (let i = 0; i < n; i++) {
        const idx = u8();
        if (idx >= size) throw invalid();
        entries[i] = { ch: alphabet[idx], f: u8() };
      }
      segments[s] = entries;
    }
    if (p !== bytes.length) throw invalid();

    const indexOf = new Map(alphabet.map((c, i) => [c, i]));

    function segment(word) {
      const L = word.length;
      let index = 0;
      for (let i = 0; i < order - 1; i++) {
        const j = L - order + i + 1;
        const ch = j >= 0 ? word[j] : " ";
        index += indexOf.get(ch) * Math.pow(size, order - 2 - i);
      }
      return segments[index];
    }

    const prefixCache = new Map();

    // All prefixes of length 1..MIN_LENGTH reachable in the model, using only
    // allowed letters, containing the focus letter.
    function findPrefixes(letters, focus) {
      const key = [...letters].sort().join("") + "|" + focus;
      let found = prefixCache.get(key);
      if (found) return found;
      found = [];
      const walk = (word) => {
        for (const { ch } of segment(word)) {
          if (ch === " " || !letters.has(ch)) continue;
          word.push(ch);
          if (word.includes(focus)) found.push(word.slice());
          if (word.length < MIN_LENGTH) walk(word);
          word.pop();
        }
      };
      walk([]);
      if (found.length === 0) found.push([focus]);
      prefixCache.set(key, found);
      return found;
    }

    function weightedPick(entries, rng) {
      let total = 0;
      for (const e of entries) total += e.f;
      let r = rng() * total;
      for (const e of entries) {
        r -= e.f;
        if (r <= 0) return e;
      }
      return entries[entries.length - 1];
    }

    function nextWord(letters, focus, rng) {
      rng = rng || Math.random;
      const prefixes = focus ? findPrefixes(letters, focus) : [];
      let word = [];
      let attempt = 0;
      const retry = () => {
        if (attempt >= MAX_ATTEMPTS) return false;
        attempt++;
        word = prefixes.length ? prefixes[Math.floor(rng() * prefixes.length)].slice() : [];
        return true;
      };
      retry();
      for (;;) {
        const entries = [];
        for (const { ch, f } of segment(word)) {
          if (ch === " ") {
            if (word.length < MIN_LENGTH) continue;
            entries.push({ ch, f: f * Math.pow(1.3, word.length) });
          } else if (letters.has(ch)) {
            entries.push({ ch, f });
          }
        }
        if (entries.length === 0) {
          if (retry()) continue;
          return word.join("");
        }
        const e = weightedPick(entries, rng);
        if (e.ch === " ") return word.join("");
        if (word.length > MAX_LENGTH) {
          if (retry()) continue;
          return word.join("");
        }
        word.push(e.ch);
      }
    }

    return { order, alphabet, nextWord };
  }

  function unscrambleWord(word) {
    const a = [...word];
    const n = a.length;
    const s = new Array(n);
    for (let i = 0; i < n; i++) s[i] = a[(23 * i + 13) % n];
    return s.join("");
  }

  function makeBlacklist(scrambled) {
    const set = new Set(scrambled.map(unscrambleWord));
    return { allow: (word) => !set.has(word.toLowerCase()) };
  }

  function censor(model, blacklist) {
    return {
      order: model.order,
      alphabet: model.alphabet,
      nextWord(letters, focus, rng) {
        let word = "";
        for (let i = 0; i < MAX_CENSOR_TRIES; i++) {
          word = model.nextWord(letters, focus, rng);
          if (blacklist.allow(word)) return word;
        }
        return word;
      },
    };
  }

  let cachedModel = null;
  function getModel() {
    if (!cachedModel) {
      const D = globalThis.LTT_DATA;
      cachedModel = censor(
        loadPhoneticModel(base64ToBytes(D.modelEnBase64)),
        makeBlacklist(D.blacklistEnScrambled)
      );
    }
    return cachedModel;
  }

  Object.assign(LTT, { base64ToBytes, loadPhoneticModel, unscrambleWord, makeBlacklist, getModel });
})((globalThis.LTT = globalThis.LTT || {}));
