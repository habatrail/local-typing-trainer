"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { loadApp, ROOT } = require("./helpers");

loadApp();
const D = globalThis.LTT_DATA || {};

test("word list is embedded, lowercase a-z, frequency ordered", () => {
  assert.ok(Array.isArray(D.wordsEn));
  assert.ok(D.wordsEn.length > 1000);
  assert.ok(D.wordsEn.every((w) => /^[a-z]+$/.test(w)));
  assert.strictEqual(D.wordsEn[0], "the");
});

test("phonetic model is embedded byte-for-byte", () => {
  const bytes = Buffer.from(D.modelEnBase64, "base64");
  assert.strictEqual(bytes.subarray(0, 9).toString("ascii"), "keybr.com");
  const raw = fs.readFileSync(path.join(ROOT, "data/raw/model-en.data"));
  assert.ok(bytes.equals(raw));
});

test("blacklist is embedded", () => {
  assert.ok(Array.isArray(D.blacklistEnScrambled));
  assert.ok(D.blacklistEnScrambled.length > 0);
});
