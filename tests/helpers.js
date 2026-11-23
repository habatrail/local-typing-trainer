"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FILES = [
  "data/model-en.js",
  "data/words-en.js",
  "data/blacklist-en.js",
  "js/phonetic.js",
  "js/text.js",
  "js/lesson.js",
  "js/keystats.js",
  "js/progression.js",
  "js/storage.js",
];

function loadApp() {
  for (const f of FILES) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) require(p);
  }
  return globalThis.LTT;
}

// Deterministic RNG for tests.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { loadApp, mulberry32, ROOT };
