# Local Typing Trainer

An offline, keybr-style touch-typing trainer written in plain HTML, CSS and
JavaScript. No ads, no account, no server: your progress lives in your
browser and survives reloads, even mid-lesson.

## Running it

Open `index.html` in a browser. That's it — no install or build step.

## How progression works

The trainer follows [keybr.com](https://www.keybr.com)'s "prove it to unlock
it" rules, with a home-row start:

- **You start with the home row:** `a s d f j k l ;`
- **Keys unlock one at a time** in this order:
  `e i g h r t y u o w q p v b n c m x z ' , . /`
- **Each key has a speed score**, smoothed over your lessons. A key is
  *confident* once it reaches the target speed (35 WPM by default; change it
  in Settings).
- **A new letter unlocks only when every unlocked letter has reached the
  target.** Once unlocked, a key stays unlocked.
- **Practice focuses on your weakest letter.** Lesson text leans heavily
  toward it (outlined in yellow on the keyboard and in the header).
- **Punctuation** (`; ' , . /`) is sprinkled into lessons once unlocked but
  never holds back the next letter.
- **Recover keys** (optional setting): a key that drops back below target
  blocks the next unlock until you bring it back up.

Lessons are real English words made only from your unlocked letters. When
there aren't enough real words, keybr's phonetic model fills in with
pronounceable made-up words.

The cursor doesn't move past a mistake — type the right key to continue.
Each character counts at most one miss, and only characters typed cleanly
count toward speed.

## Your data

Progress is saved automatically in your browser's local storage, after every
keystroke. Use **Export progress** to save a JSON backup (recommended — clearing
browser data deletes it) and **Import progress** to restore it, including in
another browser.

## Development

Requires Node.js 18+ (for tests only).

```sh
npm test            # run the unit tests
npm run build-data  # regenerate data/*.js from data/raw/
```

Layout:

| Path | What it does |
|---|---|
| `index.html`, `styles.css`, `main.js` | Page, styling, and UI wiring |
| `js/phonetic.js` | Reads keybr's phonetic model; generates pseudo-words |
| `js/text.js` | Builds lesson text |
| `js/lesson.js` | Applies keystrokes; per-key timing and misses |
| `js/keystats.js` | Smoothed per-key speed across lessons |
| `js/progression.js` | Unlocking and focus rules |
| `js/storage.js` | Saving, loading, import/export |
| `data/raw/` | Unmodified data files from keybr.com |
| `data/*.js` | Generated: the same data embedded as scripts (works over `file://`) |

## License and credits

Licensed under the **GNU Affero General Public License v3.0** — see
[LICENSE](LICENSE).

The English phonetic model, word list and word blacklist come from
[keybr.com](https://github.com/aradzie/keybr.com) by Aleksei Radzievskii
(AGPL-3.0), and the progression, timing and word-generation rules are
reimplemented from its source. See [NOTICE](NOTICE) for details.
