# Keybr-style Engine Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trainer's engine with keybr's guided-lesson rules (speed confidence, all-keys gating, weakest-key focus), keybr's English word data, correct persistent stats, and reload-safe lessons — still opened directly as `index.html`.

**Architecture:** Plain classic `<script>` files that attach to a global `LTT` namespace (no modules, no build), loaded in order by `index.html`. All logic files are DOM-free, so Node's built-in test runner can `require` them into `globalThis`. `main.js` is the only DOM/UI file. keybr data is embedded as `.js` files generated from raw copies by a small Node script.

**Tech Stack:** HTML, CSS, vanilla JS (ES2020); Node ≥ 18 for `node --test` only.

**Spec:** `docs/superpowers/specs/2026-11-22-keybr-engine-design.md`

## Global Constraints

- App runs from `file://` by opening `index.html`; no build step, no server, no ES modules, no `fetch` of local files.
- Repo license becomes **AGPL-3.0**; keybr credited (keybr.com, Aleksei Radzievskii, AGPL-3.0) in `NOTICE`, README, and a header comment in every file derived from keybr code or data.
- Start set: `a s d f j k l ;` (always unlocked). Unlock order: `e i g h r t y u o w q p v b n c m x z ' , . /`.
- Punctuation set `; ' , . /`: never gates an unlock, never the focus key; auto-unlocks when the sequence reaches it.
- Target speed default **35 WPM** (= 175 chars/min), range 15–150. `confidence = (60000 / (targetWpm*5)) / timeToType`.
- EMA alpha **0.1** on per-lesson key timeToType; `bestTimeToType` = min filtered value ever.
- Miss charged only to the expected char, at most once per character position. Speed uses only clean (typo-free) characters. Per-key lesson sample rejected if its mean timeToType < 40 ms or > 12000 ms (keybr `validateSample`). Lesson valid only if ≥ 3 distinct chars typed.
- Cursor never advances on a miss; Backspace ignored (setting removed).
- Unlocks are permanent (saved set; never re-lock).
- Storage key `ltt.v4`. Old key `localKeybrTrainerStateV3_oneKey_unlock_fade` is left untouched.
- Pause threshold **3000 ms**: gaps longer than this count neither toward active time nor key timing.

## Review Focus

1. **Reload mid-lesson** — reopening resumes the same text at the same cursor; the first keystroke after resume is not timed (its gap spans the reload). Test in Task 4 + Task 6.
2. **Corrupt / partial / foreign localStorage, or storage that throws** (private mode) — app starts with defaults, never crashes. Test in Task 6.
3. **Importing a malformed or wrong file** — throws a clear error; current progress untouched. Test in Task 6.
4. **Walking away mid-lesson** (minutes-long pause) — WPM and key speeds unaffected by the gap. Test in Task 4.
5. **Generator with the bare start set, and with each possible focus letter** — always terminates and returns non-empty text of the requested length (no infinite censor loop, no empty words). Test in Task 3.

---

### Task 1: Relicense, keybr data, and test harness

**Files:**
- Modify: `LICENSE` (replace with AGPL-3.0 full text, copied from keybr repo `LICENSE`)
- Create: `NOTICE`
- Create: `data/raw/model-en.data`, `data/raw/words-en.json`, `data/raw/blacklist-en.json` (verbatim from keybr: `packages/keybr-phonetic-model/assets/model-en.data`, `packages/keybr-content-words/lib/data/words-en.json`, `packages/keybr-phonetic-model/lib/blacklist/blacklist-en.json`; download with `gh api repos/aradzie/keybr.com/contents/<path> --jq .content | base64 -d`)
- Create: `tools/build-data.js`
- Create (generated, committed): `data/model-en.js`, `data/words-en.js`, `data/blacklist-en.js`
- Create: `tests/helpers.js`, `tests/data.test.js`
- Create: `package.json` (`{"private":true,"scripts":{"test":"node --test tests/","build-data":"node tools/build-data.js"}}`)

**Interfaces:**
- Produces: `globalThis.LTT_DATA = { modelEnBase64: string, wordsEn: string[], blacklistEnScrambled: string[] }` (each data file does `(globalThis.LTT_DATA ||= {}).<name> = ...`).
- Produces: `tests/helpers.js` exporting `loadApp()` which `require`s, in order, `data/model-en.js`, `data/words-en.js`, `data/blacklist-en.js`, `js/phonetic.js`, `js/text.js`, `js/lesson.js`, `js/keystats.js`, `js/progression.js`, `js/storage.js` — skipping any not yet created — and returns `globalThis.LTT`.

- [ ] **Step 1:** Write `tests/data.test.js`: `wordsEn` is an array of length > 1000, every entry matches `/^[a-z]+$/`, first entry `"the"`; `modelEnBase64` decodes (via `Buffer.from(...,'base64')`) to bytes whose first 9 are ASCII `keybr.com` and whose length equals `data/raw/model-en.data`'s; `blacklistEnScrambled.length > 0`.
- [ ] **Step 2:** Run `npm test` → FAIL (data files missing).
- [ ] **Step 3:** Write `tools/build-data.js`: reads the three raw files, filters words to `/^[a-z]+$/` (keep order), writes the three `.js` files each starting with the keybr AGPL attribution comment.
- [ ] **Step 4:** Run `npm run build-data && npm test` → PASS.
- [ ] **Step 5:** Replace `LICENSE`, write `NOTICE` (what was taken from keybr, its license, source URL, what's original).
- [ ] **Step 6:** Commit `chore: relicense to AGPL-3.0, add keybr English data and test harness`.

### Task 2: Phonetic model (`js/phonetic.js`)

Reimplements keybr's `TransitionTable` + `makePhoneticModel` + `censor` (header attribution required).

**Files:**
- Create: `js/phonetic.js`
- Test: `tests/phonetic.test.js`

**Interfaces:**
- Consumes: `LTT_DATA.modelEnBase64`, `LTT_DATA.blacklistEnScrambled`.
- Produces:
  - `LTT.base64ToBytes(b64: string) -> Uint8Array` (use `atob`, available in browsers and Node ≥ 16).
  - `LTT.loadPhoneticModel(bytes: Uint8Array) -> { order: number, alphabet: string[], nextWord(letters: Set<string>, focus: string|null, rng: () => number) -> string }`. Throws `Error("Invalid model data")` on bad signature or leftover bytes.
  - `LTT.unscrambleWord(word: string) -> string`.
  - `LTT.makeBlacklist(scrambled: string[]) -> { allow(word: string) -> boolean }`.
  - `LTT.getModel() -> model` — lazily loads from `LTT_DATA` once and caches; its `nextWord` is censored.

Binary format (big-endian u16): 9-byte signature `keybr.com`; `order` u8; `size` u8; `size` × u16 code points; then `size^(order-1)` segments, each `count` u8 followed by `count` × (`alphabetIndex` u8, `frequency` u8). Segment index for the current word = Σ over the last `order-1` chars (space `0x20` when before word start) of `index(c) * size^(order-2-i)`.

Word algorithm (keybr `phoneticmodel.ts`): minLength 3, maxLength 10. Pick a start prefix: if `focus` set, a random prefix of length 1–3 that is a valid model path, uses only `letters`, and contains `focus`; if none, `[focus]`. Repeatedly take the segment, drop space while `word.length < 3`, drop letters not in `letters`, multiply space frequency by `1.3 ** word.length`, weighted-sample. Space ends the word. Dead end or length > 10 → retry from a new prefix, max 5 attempts, then return what exists. Censor: resample while the word is blacklisted, **max 20 times**, then return the last word (keybr loops forever — we cap it).

`unscrambleWord`: `s[i] = a[(23*i + 13) % length]`.

- [ ] **Step 1:** Write tests: `loadPhoneticModel` on real data gives `order === 4`, `alphabet.length === 27`, `alphabet[0] === " "`; corrupt first byte throws `"Invalid model data"`; with `letters = set("asdfjkleig")`, `focus="g"`, 200 words with a seeded rng (`mulberry32(1)` defined in the test) are all non-empty, length ≤ 11, only use `letters`, and ≥ 90% contain `"g"`; `unscrambleWord` of keybr's first entry `"nala"` yields a 4-letter string and `makeBlacklist(LTT_DATA.blacklistEnScrambled).allow(LTT.unscrambleWord("nala")) === false`, `allow("desk") === true`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement per the interface and algorithm above.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: phonetic word model reader (from keybr)`.

### Task 3: Lesson text generator (`js/text.js`)

**Files:**
- Create: `js/text.js`
- Test: `tests/text.test.js`

**Interfaces:**
- Consumes: `LTT.getModel()`, `LTT_DATA.wordsEn`.
- Produces: `LTT.PUNCTUATION = [";", "'", ",", ".", "/"]`; `LTT.generateLessonText({ letters: string[], focus: string|null, punctuation: string[], lengthSetting: number, rng?: () => number }) -> string`.

Behaviour (keybr `guided.ts` `generate` + `mangledWords` + `generateFragment`):
- Target chars `100 + Math.round(lengthSetting * 100)`; append words until total word chars ≥ target; join with single spaces.
- Word pool: `wordsEn` with length > 2, all chars in `letters`, containing `focus` if set; first 1000. If < 15, add `model.nextWord(...)` results until 15 (stop if one returns `""`). If still empty, use `[letters.join("").slice(0, 3)]`.
- Pick uniformly from the pool; avoid repeating the previous word (up to 3 tries).
- If `punctuation` non-empty, each word gets punctuation with probability **0.15**, char chosen uniformly from `punctuation`: `;` → `word;`, `,` → `word,`, `.` → `word.`, `'` → `'word'`, `/` → `word/next` (consumes the next word).

- [ ] **Step 1:** Tests: with `letters` = start letters `a s d f j k l` (no focus, no punctuation) text length ≥ 100 and only `[asdfjkl ]`; **for every letter L of `asdfjkleighrtyuowqpvbncmxz` as focus with letters = the start letters plus `UNLOCK_ORDER` letters up to and including L**, generation terminates, text ≥ 100 chars, no empty words (`!text.includes("  ")`), and ≥ 70% of words contain L; with `punctuation=[";", ","]` and seeded rng over 20 lessons, some word ends in `;` and no punctuation outside the given set appears; `lengthSetting=1` gives ≥ 200 chars.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: keybr-style lesson text generator`.

### Task 4: Lesson engine (`js/lesson.js`)

**Files:**
- Create: `js/lesson.js`
- Test: `tests/lesson.test.js`

**Interfaces:**
- Produces:
  - `LTT.PAUSE_MS = 3000`.
  - `LTT.newLesson(text: string) -> Lesson` where `Lesson = { text, pos: 0, typo: false, steps: [], lastTime: null, activeMs: 0, missCount: 0 }` (plain JSON-serialisable).
  - `LTT.applyKey(lesson, key: string, now: number) -> "hit" | "miss" | "ignored"` — mutates lesson. `key.length !== 1` → `"ignored"`. Gap = `lastTime == null ? null : now - lastTime`; if gap ≤ `PAUSE_MS` add to `activeMs`. Hit: push `{ ch, t: (gap != null && gap <= PAUSE_MS) ? gap : 0, typo: lesson.typo }`, `pos++`, `typo=false`. Miss: if `!typo` then `missCount++`, `typo=true`. Always set `lastTime = now`. After `pos === text.length`, further keys `"ignored"`.
  - `LTT.isLessonDone(lesson) -> boolean`.
  - `LTT.resumeLesson(lesson) -> lesson` — sets `lastTime = null` (used after reload).
  - `LTT.lessonResult(lesson) -> { histogram: { [ch]: { hitCount, missCount, timeToType } }, wpm, accuracy, activeMs, valid }`. Histogram per keybr: every step counts a hit; typo steps add a miss and are excluded from timing; `timeToType = round(mean t over clean steps with t > 0)` or 0; drop entries whose `timeToType` is non-zero and < 40 or > 12000. `wpm = (text.length/5) / (activeMs/60000)` (0 if activeMs 0). `accuracy = clean steps / steps`. `valid = histogram has ≥ 3 keys && activeMs > 0`.

- [ ] **Step 1:** Tests: typing `"asd"` correctly at t=0,200,400 → result `a.timeToType===0`, `s===200`, `d===200`, wpm = (3/5)/(400/60000)=90, accuracy 1; three wrong presses then correct on one char → that char `missCount===1`, `timeToType===0`, lesson `missCount===1`, `pos` advanced by 1 only; Backspace / `"Shift"` → `"ignored"`, pos unchanged; **a 5-minute gap** between two keys adds nothing to `activeMs` and that key's `t===0`; **`JSON.parse(JSON.stringify(lesson))` then `resumeLesson`** → next key's `t===0` and pos continues; a lesson typing only `"aa a"` has `valid===false`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: lesson engine with keybr timing and miss rules`.

### Task 5: Key stats and progression (`js/keystats.js`, `js/progression.js`)

**Files:**
- Create: `js/keystats.js`, `js/progression.js`
- Test: `tests/progression.test.js`

**Interfaces:**
- Consumes: `lessonResult(...).histogram` from Task 4.
- Produces (`keystats.js`):
  - `KeyStats = { [ch]: { samples: Sample[], timeToType: number|null, bestTimeToType: number|null, hitCount: number, missCount: number, lessons: number } }`, `Sample = { lesson: number, ts: number, hitCount, missCount, timeToType, filteredTimeToType: number|null }`.
  - `LTT.addLessonToKeyStats(keyStats, histogram, lessonIndex: number, ts: number) -> void` — mutates. If sample `timeToType > 0`: `filtered = prev == null ? t : prev + 0.1*(t - prev)`; update `timeToType`, `bestTimeToType = min`. Otherwise filtered unchanged. Keep at most the last **100** samples per key (best/totals kept in summary fields).
- Produces (`progression.js`):
  - `LTT.START_KEYS = ["a","s","d","f","j","k","l",";"]`, `LTT.UNLOCK_ORDER = ["e","i","g","h","r","t","y","u","o","w","q","p","v","b","n","c","m","x","z","'",",",".","/"]`.
  - `LTT.confidence(timeToType: number|null, targetWpm: number) -> number|null`.
  - `LTT.updateProgression({ unlocked: string[], keyStats, targetWpm, recoverKeys }) -> { unlocked: string[], focus: string|null, newlyUnlocked: string[] }`. Algorithm: start from `START_KEYS ∪ unlocked`. Walk `UNLOCK_ORDER`; skip already-unlocked; punctuation → unlock and continue; letter → unlock iff every unlocked **letter** has confidence ≥ 1 (best confidence, or current when `recoverKeys`; null counts as 0), else stop. Focus = unlocked letter with lowest confidence (same measure) below 1; ties → earliest in sequence; none → null. Returned `unlocked` ordered by sequence.

- [ ] **Step 1:** Tests: EMA — histograms with `a.timeToType` 300 then 200 → `filteredTimeToType` 300 then 290, `bestTimeToType` 290; a typo-only sample (timeToType 0) leaves `timeToType` unchanged but adds hit/miss; 150 lessons keep 100 samples; `confidence(342.857..., 35) ≈ 1` and `confidence(null,35)===null`; fresh state → unlocked = start keys, focus = `"a"`, newlyUnlocked `[]`; all start letters at 300 ms (≥ 35 WPM) → `newlyUnlocked` `["e"]` and focus `"e"`; then one start letter slows to 400 ms with `recoverKeys=false` → no further unlock, `e` still unlocked; same with `recoverKeys=true` → still no re-lock, focus is the slowed letter; every letter fast through `z` → `' , . /` unlocked in the same call; raising `targetWpm` to 150 never removes keys.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement both files.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: keybr confidence-based key stats and progression`.

### Task 6: Persistence (`js/storage.js`)

**Files:**
- Create: `js/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: `LTT.START_KEYS`, Lesson shape (Task 4), KeyStats shape (Task 5).
- Produces:
  - `LTT.STORAGE_KEY = "ltt.v4"`.
  - `LTT.DEFAULT_SETTINGS = { targetWpm: 35, lessonLength: 0.5, recoverKeys: false, keyboardFade: true, soundOnError: false, fontSize: 34, keyboardLayout: "normal" }`.
  - `AppState = { version: 4, settings, unlocked: string[], focus: string|null, keyStats, lessons: LessonSummary[], current: Lesson|null }`, `LessonSummary = { index, ts, wpm, accuracy, length, activeMs, unlockedCount, newKeys: string[] }` (keep last **2000**).
  - `LTT.defaultState() -> AppState`.
  - `LTT.sanitizeState(raw: any) -> AppState` — coerces/validates every field, merges settings over defaults (clamping `targetWpm` 15–150, `lessonLength` 0–1), ensures `unlocked ⊇ START_KEYS`, drops `current` if malformed.
  - `LTT.loadState(storage: {getItem}) -> AppState` — never throws; missing/corrupt/throwing → `defaultState()`.
  - `LTT.saveState(storage: {setItem}, state) -> boolean` — never throws.
  - `LTT.exportState(state) -> string` — `JSON.stringify({ app: "local-typing-trainer", ...state })`.
  - `LTT.importState(text: string) -> AppState` — throws `Error("Not a typing trainer progress file")` if not JSON or `app` mismatch or `version !== 4`; else `sanitizeState`.

- [ ] **Step 1:** Tests: round-trip save/load via an in-memory storage stub preserves `keyStats`, `lessons`, and `current` (including `pos`, `steps`); `getItem` returning `"{not json"`, `"null"`, `"[]"`, `'{"version":4,"unlocked":"x"}'` → valid default-shaped state with start keys; storage whose `getItem`/`setItem` throw → `loadState` returns defaults, `saveState` returns false; `importState("hello")` and `importState('{"app":"other"}')` throw the exact message; settings `{targetWpm: 9999}` clamp to 150.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: versioned, reload-safe persistence with import/export`.

### Task 7: UI rewrite (`index.html`, `styles.css`, `main.js`)

**Files:**
- Modify: `index.html` (full rewrite), `styles.css` (extend existing dark theme), `main.js` (full rewrite; DOM only, logic via `LTT`)

**Interfaces:**
- Consumes everything above. Script order in `index.html`: `data/model-en.js`, `data/words-en.js`, `data/blacklist-en.js`, `js/phonetic.js`, `js/text.js`, `js/lesson.js`, `js/keystats.js`, `js/progression.js`, `js/storage.js`, `main.js`.

Behaviour:
- On load: `loadState(localStorage)`; if `current` exists → `resumeLesson`, else generate a lesson from `updateProgression` output. Title `Local Typing Trainer`.
- Keydown (ignore when target is input/select/textarea, or ctrl/meta/alt): Space/Tab/Backspace `preventDefault`; `applyKey(current, e.key, performance.timeOrigin + performance.now())`; save (debounced ≤ 500 ms, plus flush on `visibilitychange`→hidden and `pagehide`).
- On lesson done: if `valid`, `addLessonToKeyStats`, push `LessonSummary`, `updateProgression`; show summary line ("Speed 42.1 WPM · Accuracy 96.3% · +2.4 vs avg"), and a prominent "New key: E" banner when `newlyUnlocked` contains a letter; reset keyboard fade streak. Then generate next lesson with letters = unlocked letters, punctuation = unlocked ∩ `PUNCTUATION`, focus.
- Header: unlocked keys rendered as chips coloured by confidence (`hsl(0..120)` red→green for 0..1, grey for no data), focus key outlined, next locked key shown dimmed.
- Live stats: WPM, accuracy, active time for current lesson.
- History: two canvas line charts (speed, accuracy) over lesson summaries (last 100), with target-speed line on the speed chart; totals: lessons, total time, top speed.
- Per-key table: included keys + next locked letter: key, confidence %, current WPM (`12000/timeToType`), best WPM, lessons, hits, misses, accuracy.
- Keyboard: existing normal/split layouts; key colour by confidence; focus and next-to-unlock marked; fade on streak (if `keyboardFade`).
- Buttons: Skip lesson (new text, current lesson discarded), Export (download `typing-trainer-progress-YYYY-MM-DD.json`), Import (file input; on error `alert(message)`, state unchanged), Reset progress (`confirm`).
- Settings: target speed (number 15–150), lesson length (range 0–1 step 0.1), recover keys, keyboard fade, sound on error, font size, keyboard layout. Changing target speed / recover keys re-runs `updateProgression` (focus may change, nothing re-locks).

- [ ] **Step 1:** Implement the three files.
- [ ] **Step 2:** `npm test` → PASS (logic unchanged).
- [ ] **Step 3:** Manual check in a browser via `file://`: type a full lesson → summary appears, history chart gains a point; reload mid-lesson → same text and cursor; typing into the target-speed box doesn't type into the lesson; export → reset → import restores lessons; no console errors. (Can be partly scripted with a headless browser if one is available.)
- [ ] **Step 4:** Commit `feat: new trainer UI on keybr-style engine`.

### Task 8: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Rewrite: what it is (offline keybr-style trainer, JavaScript not Java), how to run (open `index.html`), how progression works (start keys, unlock order, 35 WPM target, focus key, punctuation, permanent unlocks), where progress is stored + export/import, running tests (`npm test`), regenerating data (`npm run build-data`), license AGPL-3.0 and keybr credit.
- [ ] **Step 2:** Commit `docs: rewrite README`.
