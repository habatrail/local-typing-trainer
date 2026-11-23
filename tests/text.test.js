"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { loadApp, mulberry32 } = require("./helpers");

const LTT = loadApp();
const START_LETTERS = ["a", "s", "d", "f", "j", "k", "l"];
const ORDER_LETTERS = "eighrtyuowqpvbncmxz".split("");

test("bare start set gives a full lesson of start letters", () => {
  const text = LTT.generateLessonText({
    letters: START_LETTERS, focus: null, punctuation: [], lengthSetting: 0, rng: mulberry32(2),
  });
  assert.ok(text.length >= 100, "too short: " + text.length);
  assert.match(text, /^[asdfjkl ]+$/);
  assert.ok(!text.includes("  "));
});

test("every focus letter along the unlock path yields focused, non-empty text", () => {
  const all = START_LETTERS.concat(ORDER_LETTERS);
  for (let i = 0; i < all.length; i++) {
    const focus = all[i];
    const letters = i < START_LETTERS.length ? START_LETTERS : all.slice(0, i + 1);
    const text = LTT.generateLessonText({
      letters, focus, punctuation: [], lengthSetting: 0, rng: mulberry32(10 + i),
    });
    assert.ok(text.length >= 100, `focus ${focus}: too short`);
    assert.ok(!text.includes("  ") && !text.startsWith(" ") && !text.endsWith(" "), `focus ${focus}: empty word`);
    for (const c of text.replace(/ /g, "")) assert.ok(letters.includes(c), `focus ${focus}: bad char ${c}`);
    const words = text.split(" ");
    const withFocus = words.filter((w) => w.includes(focus)).length;
    assert.ok(withFocus / words.length >= 0.7, `focus ${focus}: ${withFocus}/${words.length}`);
  }
});

test("punctuation only from the given set, and it appears", () => {
  const rng = mulberry32(3);
  let semis = 0;
  for (let n = 0; n < 20; n++) {
    const text = LTT.generateLessonText({
      letters: START_LETTERS.concat(["e", "i"]), focus: "e", punctuation: [";", ","], lengthSetting: 0.5, rng,
    });
    assert.match(text, /^[asdfjklei ;,]+$/);
    semis += text.split(" ").filter((w) => w.endsWith(";")).length;
  }
  assert.ok(semis > 0);
});

test("apostrophe wraps and slash joins words", () => {
  const rng = mulberry32(4);
  let quoted = 0, slashed = 0;
  for (let n = 0; n < 20; n++) {
    const text = LTT.generateLessonText({
      letters: START_LETTERS.concat(["e", "i"]), focus: null, punctuation: ["'", "/"], lengthSetting: 0.5, rng,
    });
    for (const w of text.split(" ")) {
      if (w.includes("'")) { assert.match(w, /^'[a-z]+'$/); quoted++; }
      if (w.includes("/")) { assert.match(w, /^[a-z]+\/[a-z]+$/); slashed++; }
    }
  }
  assert.ok(quoted > 0 && slashed > 0);
});

test("lengthSetting 1 gives at least 200 chars", () => {
  const text = LTT.generateLessonText({
    letters: START_LETTERS.concat(ORDER_LETTERS), focus: null, punctuation: [], lengthSetting: 1, rng: mulberry32(5),
  });
  assert.ok(text.length >= 200);
});
