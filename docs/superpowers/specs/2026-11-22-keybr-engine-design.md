# Keybr-style engine rebuild — design

Date: 2026-11-22
Branch: `keybr-engine`

## Intent

The owner practises on keybr.com and likes its "prove your skill to unlock the
next key" progression, but ads on the site cause page reloads mid-practice that
wipe lesson progress. This repo is a local, offline replacement. The current
version has two problems:

1. **Stats are broken and don't persist.** Wrong presses are charged to the key
   that was pressed (not just the key that was expected), WPM decays while idle,
   session history is never saved (`endSession()` is a stub), and in
   "backspace allowed" mode retyped characters are re-counted.
2. **Text generation and progression are weak.** Text is weighted random letters
   (unpronounceable); unlocking depends only on the newest key's accuracy, so
   older keys can stay weak and progression feels uneven.

Goal: faithfully emulate keybr's guided-lesson progression and text quality,
locally, surviving reloads.

## Goals

- keybr's progression rules: per-key speed confidence, unlock a new key only
  when every included key has proven itself, focus the weakest key.
- keybr-quality text: real English words limited to unlocked letters, padded
  with keybr's phonetic pseudo-words when too few real words exist.
- Correct, persistent stats: per-key, per-lesson, and history across sessions.
- Nothing is lost on reload, including a lesson in progress.
- Still runs by opening `index.html` directly (file://), no build step, no server.

## Non-goals

- Manual key unlocking / locking. Proof of skill is the whole point.
- Multiple languages or keyboard layouts beyond the existing normal / split
  display. English QWERTY only.
- Accounts, sync, cloud anything.
- Code / numbers / book / custom-text lesson types.

## Anti-goals (failure even if it "works")

- Progress lost on reload or tab close.
- A key unlocking before every included key has reached target speed.
- Needing a build step or local web server to run.
- License violations: keybr is AGPL-3.0; anything taken from it must keep its
  notice and the repo must be AGPL.

## Decisions made with the owner

- **Approach A:** reimplement keybr's engine rules in the repo's own plain JS
  (not a TypeScript port, not patching the old engine).
- **Home-row start is kept.** keybr's frequency order (e n i t r l …) felt wrong
  to the owner. Start set stays `asdfjkl;`.
- **Vowels first in the unlock order.** Probing keybr's model with only
  `asdfjkl` gives ~30 distinct words per 300 (`ask lass fall lad all…`) and
  mostly fragments when focused on `j`/`k`. New order:
  `e i g h r t y u o w q p v b n c m x z ' , . /` (existing order with `e`,`i`
  moved to the front).
- **Only letters gate progression.** Punctuation (`; ' , . /`) never blocks an
  unlock and is never the focus key. A punctuation key in the unlock order
  unlocks automatically as soon as the sequence reaches it (so `' , . /` arrive
  right after `z`). Punctuation is still timed and shown in stats, and gets a
  steady injection rate once unlocked (keybr treats punctuation the same way).
- **Relicense MIT → AGPL-3.0** and **reuse keybr's English data**: the phonetic
  model `packages/keybr-phonetic-model/assets/model-en.data`, the word list
  `packages/keybr-content-words/lib/data/words-en.json`, and the censor
  blacklist for English. Credit keybr.com (Aleksei Radzievskii, AGPL-3.0) in the
  README and a `NOTICE` / file headers on derived files.
- **Existing saved progress resets.** The old accuracy-only stats can't be
  converted to per-lesson speed samples. Use a new storage key; old key may be
  left alone or deleted.

## Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| A | Rebuild engine to keybr's rules in plain JS, reuse keybr data | Big `main.js` rewrite; resets progress; faithful | **Chosen** |
| B | Patch current engine (fix stats, add speed check, better generator) | Less churn, still doesn't feel like keybr | Rejected |
| C | Port keybr's TypeScript directly | Needs build step; monorepo deps | Rejected |

## Design

### Lessons (the unit of progress)

Like keybr, practice is in **lessons**: a fixed generated text of ~100–200
characters (length configurable; keybr: `100 + round(length*100)` chars of words).
Stats are committed to per-key history **when a lesson is completed**.

Per keystroke during a lesson, record: expected char, typed char, timestamp,
hit/miss. Timing and misses follow **keybr's actual rules**
(`keybr-textinput/lib/histogram.ts`), not a looser reading:
- A miss is charged **only to the expected key**, and **at most once per
  character position**: three wrong presses on one character = one miss.
- A key's lesson **timeToType** = mean time from the previous keystroke to the
  keystroke for that character, **using only characters typed cleanly** (no miss
  at that position). Exclude the first character of the lesson and gaps longer
  than a pause threshold (builder's call, e.g. 2–5 s).
- Lesson accuracy = clean characters / total characters.

Abandoned lessons (restart / new text before finishing) are not committed.

### Per-key stats (keybr `KeyStats`)

For each key, keep a list of per-lesson samples:
`{ lessonIndex, timeStamp, hitCount, missCount, timeToType, filteredTimeToType }`.
- `filteredTimeToType` = exponential moving average over lesson samples with
  alpha 0.1 (keybr `makeFilter(0.1)`); first sample initialises it.
- `timeToType` (current) = latest `filteredTimeToType`.
- `bestTimeToType` = min of `filteredTimeToType` ever.
- Keys appear in samples only for lessons in which they were typed.

### Confidence and target speed

- Target speed setting, default **35 WPM** (= 175 chars/min, keybr default);
  allowed range 15–150 WPM.
- `confidence = (60000 / targetCpm) / timeToType`; `bestConfidence` same with
  `bestTimeToType`. ≥ 1 means "at target".

### Unlock and focus rules (keybr `GuidedLesson.update`)

Walk the unlock sequence (start set, then `UNLOCK_ORDER`). In the steps below
"key" means **letter**; punctuation is skipped for gating and focus (see
Decisions):
1. Start-set keys are always included.
2. Any key with `bestConfidence ≥ 1` is included.
3. The next key is included only when **every** currently included key has
   `bestConfidence ≥ 1` (or current `confidence ≥ 1` when the **recover keys**
   setting is on; default off, as in keybr). Stop at the first key not included.
4. **Focus** = the included key with the lowest confidence (best or current per
   the setting) that is still below 1. If all are ≥ 1, no focus key.

Rules are re-evaluated after each completed lesson, not per keystroke.

**Unlocks are permanent (my call; differs from keybr).** keybr recomputes the
included set from stats every time, so raising the target speed (or turning on
recover keys) can drop already-unlocked keys back out. Here the unlocked set is
**saved**, and a key once unlocked never re-locks. Rule 2 above becomes "any
previously unlocked key is included". Target speed and recover keys only affect
(a) whether the *next* key unlocks and (b) which key is focused. The
"New key: X" moment fires only when the saved set grows. On a new
unlock, show a clear "New key: X" moment and reset the keyboard fade.

### Text generation (keybr guided generator)

- **Letters vs punctuation:** the model only knows a–z. Unlocked letters drive
  word generation. Unlocked punctuation keys (`; ' , . /`) are applied keybr's
  `mangledWords` way: with some probability a word gets `word;`, `'word'`,
  `word,`, `word.`; `/` joins two words as `word/word` (our own extension, since
  keybr has no `/`). Punctuation is never the focus key; use a steady rate.
- **Real words first:** filter `words-en.json` to words of length > 2 made only
  of included letters; if a focus letter exists, only words containing it
  (keybr `Dictionary.find`). Take up to the first 1000 (list is
  frequency-ordered). If fewer than 15, pad with phonetic pseudo-words.
- **Phonetic pseudo-words:** reimplement keybr's `makePhoneticModel` /
  `TransitionTable` reader in plain JS (note: multi-byte values in the `.data`
  file are **big-endian**; header = `keybr.com` signature, order u8, alphabet
  size u8, alphabet u16s, then per segment: count u8 + (index u8, freq u8) pairs): order-4 Markov chain over
  space + a–z, word length 3–10, space boosted by `1.3^length`, prefix
  selection so the focus letter appears, up to 5 retries, censor blacklist.
- **No immediate repeats** (keybr `uniqueWords`).
- The `.data` file is binary and `fetch` doesn't work on file://, so embed it as
  a base64 string in a generated `.js` file (e.g. `data/model-en.js` setting a
  global), and the word list / blacklist likewise as `.js` files. Include the
  small script used to regenerate them.

### Persistence and reload safety

- Single storage key, versioned schema, e.g. `ltt.v4`.
- Saved: settings, per-key sample history, lesson history, **and the in-progress
  lesson** (text, cursor, keystroke log so far). Saved on every keystroke
  (debounce is fine as long as `beforeunload`/`visibilitychange` flushes).
- On load, resume the in-progress lesson exactly where it was. Time spent while
  the page was closed is not counted (store elapsed active time, not wall-clock
  start).
- **Export / import** progress as a JSON file (cheap insurance against browser
  storage being cleared).
- **Reset progress** button with confirmation.

### Stats display

- Live during lesson: speed (WPM), accuracy, elapsed active time.
- WPM: `(correct chars / 5) / active minutes`, where active time excludes gaps
  over the pause threshold. Accuracy: `hits / (hits + misses)`.
- After each lesson: summary line (speed, accuracy, Δ vs. average).
- History charts across lessons (replaces the current per-session canvas
  charts): speed and accuracy per lesson over time.
- Per-key table: key, confidence (as % of target), current & best speed (WPM),
  lessons, hit/miss totals, accuracy. Only included keys plus the next locked
  key.
- Keyboard view: colour each key by confidence (keybr-style), mark focus key and
  next-to-unlock key; keep the existing fade-on-streak behaviour.

### Backspace

The cursor never advances on a miss (keybr's default "stop on error"; the current
app already behaves this way), so backspace has nothing to correct. Today's
"allowed" mode only moves back over already-correct characters and re-counts
them. **Remove the backspace setting; backspace is ignored.** (My call.)

### Settings kept / added

Kept: sound on error, font size, keyboard display layout.
Added: target speed, lesson length, recover keys, keyboard fade on/off.

### Files

- `index.html`, `styles.css` — updated UI.
- `main.js` — may be split into a few plain `<script>` files (e.g. `model.js`,
  `lesson.js`, `stats.js`, `ui.js`) loaded in order; no modules required
  (ES modules don't load over file:// in all browsers).
- `data/` — embedded keybr data + regeneration script.
- `LICENSE` → AGPL-3.0 text; `NOTICE` crediting keybr; README rewritten (fix
  "Java" → JavaScript, how to run, how progression works, credits).

### Testing

Pure logic (model reader, word generation filter, EMA/confidence, unlock/focus
rules, stats math, storage migration) should be testable without a browser —
a tiny Node test file run with `node --test` (Node is a **dev-only** dependency
for tests; the owner will install it; the app itself never needs it), using the same plain JS files
(attach exports to a global or use a small UMD guard). Manual browser check for
UI and reload-resume.

## Left to the builder

- Exact pause threshold, debounce interval, punctuation probabilities.
- Visual styling details of new UI elements.
- File split and how to share code between browser and Node tests.
- Whether to delete the old localStorage key.
