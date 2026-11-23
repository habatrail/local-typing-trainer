"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { loadApp, mulberry32 } = require("./helpers");

const LTT = loadApp();
const D = globalThis.LTT_DATA;

test("loads keybr's English model", () => {
  const m = LTT.loadPhoneticModel(LTT.base64ToBytes(D.modelEnBase64));
  assert.strictEqual(m.order, 4);
  assert.strictEqual(m.alphabet.length, 27);
  assert.strictEqual(m.alphabet[0], " ");
});

test("rejects corrupt model data", () => {
  const bytes = LTT.base64ToBytes(D.modelEnBase64);
  bytes[0] = 0;
  assert.throws(() => LTT.loadPhoneticModel(bytes), /Invalid model data/);
  const truncated = LTT.base64ToBytes(D.modelEnBase64).subarray(0, 1000);
  assert.throws(() => LTT.loadPhoneticModel(truncated), /Invalid model data/);
});

test("generates words from allowed letters containing the focus letter", () => {
  const m = LTT.getModel();
  const letters = new Set("asdfjkleig");
  const rng = mulberry32(1);
  let withFocus = 0;
  for (let i = 0; i < 200; i++) {
    const w = m.nextWord(letters, "g", rng);
    assert.ok(w.length > 0, "empty word");
    assert.ok(w.length <= 11, "too long: " + w);
    for (const c of w) assert.ok(letters.has(c), `bad letter ${c} in ${w}`);
    if (w.includes("g")) withFocus++;
  }
  assert.ok(withFocus >= 180, `only ${withFocus}/200 contain focus`);
});

test("blacklist unscrambles keybr's list", () => {
  const bad = LTT.unscrambleWord("nala");
  assert.strictEqual(bad.length, 4);
  const bl = LTT.makeBlacklist(D.blacklistEnScrambled);
  assert.strictEqual(bl.allow(bad), false);
  assert.strictEqual(bl.allow("desk"), true);
});
