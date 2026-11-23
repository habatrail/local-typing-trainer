// UI layer: wires the LTT engine (js/*.js) to the page.
"use strict";
(function () {
  const LTT = globalThis.LTT;
  const PUNCT = new Set(LTT.PUNCTUATION);
  const SAVE_DEBOUNCE_MS = 400;
  const FADE_STREAK = 30;
  const CHART_LESSONS = 100;

  const NORMAL_ROWS = [
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
    ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
  ];
  const SPLIT_LEFT = [["q", "w", "e", "r", "t"], ["a", "s", "d", "f", "g"], ["z", "x", "c", "v", "b"]];
  const SPLIT_RIGHT = [["y", "u", "i", "o", "p"], ["h", "j", "k", "l", ";"], ["n", "m", ",", ".", "/"]];
  const HOME = new Set(["a", "s", "d", "f", "j", "k", "l", ";"]);
  const TRAINED = new Set(LTT.START_KEYS.concat(LTT.UNLOCK_ORDER));

  // ---------- storage (localStorage can throw in private modes) ----------
  let storage;
  try {
    storage = window.localStorage;
    storage.getItem("__probe__");
  } catch (e) {
    storage = { getItem: () => null, setItem: () => {} };
  }

  let state = LTT.loadState(storage);
  let streak = 0;
  let saveTimer = null;
  let audioCtx = null;
  const $ = (id) => document.getElementById(id);

  // ---------- persistence ----------
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const ok = LTT.saveState(storage, state);
    $("save-warning").hidden = ok;
  }
  function saveSoon() {
    if (!saveTimer) saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }

  // ---------- progression / lessons ----------
  function refreshProgression() {
    const prog = LTT.updateProgression({
      unlocked: state.unlocked,
      keyStats: state.keyStats,
      targetWpm: state.settings.targetWpm,
      recoverKeys: state.settings.recoverKeys,
    });
    state.unlocked = prog.unlocked;
    state.focus = prog.focus;
    return prog;
  }

  function startNewLesson() {
    const letters = state.unlocked.filter((k) => !PUNCT.has(k));
    const punctuation = state.unlocked.filter((k) => PUNCT.has(k));
    const text = LTT.generateLessonText({
      letters,
      focus: state.focus,
      punctuation,
      lengthSetting: state.settings.lessonLength,
    });
    state.current = LTT.newLesson(text);
    streak = 0;
  }

  function completeLesson() {
    const result = LTT.lessonResult(state.current);
    if (!result.valid) {
      showSummary("Lesson too short to count — here's another.");
      startNewLesson();
      return;
    }
    const index = (state.lessons.length ? state.lessons[state.lessons.length - 1].index : 0) + 1;
    const ts = Date.now();
    const recent = state.lessons.slice(-10);
    const prevAvg = recent.length ? recent.reduce((a, l) => a + l.wpm, 0) / recent.length : null;

    LTT.addLessonToKeyStats(state.keyStats, result.histogram, index, ts);
    const prog = refreshProgression();
    state.lessons.push({
      index,
      ts,
      wpm: result.wpm,
      accuracy: result.accuracy,
      length: state.current.text.length,
      activeMs: result.activeMs,
      unlockedCount: state.unlocked.length,
      newKeys: prog.newlyUnlocked,
    });
    if (state.lessons.length > 2000) state.lessons.splice(0, state.lessons.length - 2000);

    const delta = prevAvg == null ? "" : (() => {
      const d = result.wpm - prevAvg;
      const cls = d >= 0 ? "up" : "down";
      return ` · <span class="${cls}">${d >= 0 ? "+" : ""}${d.toFixed(1)}</span> vs last-10 avg`;
    })();
    showSummary(
      `Lesson ${index}: <b>${result.wpm.toFixed(1)} WPM</b> · ${(result.accuracy * 100).toFixed(1)}% accuracy${delta}`,
      true
    );

    announceUnlocks(prog.newlyUnlocked);
    startNewLesson();
  }

  function announceUnlocks(newlyUnlocked) {
    const newLetters = newlyUnlocked.filter((k) => !PUNCT.has(k));
    const newPunct = newlyUnlocked.filter((k) => PUNCT.has(k));
    const parts = [];
    if (newLetters.length) parts.push(`New key: ${newLetters.map((k) => k.toUpperCase()).join(" ")}`);
    if (newPunct.length) parts.push(`Punctuation unlocked: ${newPunct.join(" ")}`);
    showBanner(parts.length ? parts.join(" · ") : null);
    if (parts.length) streak = 0;
  }

  // ---------- input ----------
  function isFormTarget(t) {
    if (!t || !t.tagName) return false;
    const tag = t.tagName.toLowerCase();
    if (tag === "input") return ["number", "text", "search"].includes(t.type);
    return tag === "textarea" || t.isContentEditable;
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isFormTarget(e.target)) return;
    if (e.key === " " || e.key === "Tab" || e.key === "Backspace" || e.key === "'" || e.key === "/") {
      e.preventDefault(); // no page scroll, focus change, or Firefox quick-find
    }
    if (e.isComposing || e.key.length !== 1) return;

    const outcome = LTT.applyKey(state.current, e.key, performance.now());
    if (outcome === "ignored") return;
    if (outcome === "hit") {
      streak += 1;
    } else {
      streak = 0;
      if (state.settings.soundOnError) playErrorSound();
    }
    if (LTT.isLessonDone(state.current)) {
      completeLesson();
      saveNow();
      renderAll();
    } else {
      saveSoon();
      renderLesson();
      renderLive();
      renderKeyboard();
    }
  }

  // ---------- rendering ----------
  function confColor(conf) {
    if (conf == null) return null;
    const c = Math.max(0, Math.min(1, conf));
    return `hsl(${Math.round(c * 120)}, 60%, ${c >= 1 ? 35 : 45}%)`;
  }

  function keyConf(ch) {
    return LTT.keyConfidence(state.keyStats[ch], state.settings);
  }

  function nextLockedKey() {
    return LTT.UNLOCK_ORDER.find((k) => !state.unlocked.includes(k)) || null;
  }

  function showSummary(html, isHtml) {
    const el = $("summary");
    if (isHtml) el.innerHTML = html;
    else el.textContent = html;
  }

  function showBanner(text) {
    const el = $("banner");
    el.hidden = !text;
    el.textContent = text || "";
  }

  function renderChips() {
    const wrap = $("key-chips");
    wrap.innerHTML = "";
    for (const k of state.unlocked) {
      const chip = document.createElement("span");
      chip.className = "chip" + (k === state.focus ? " focus" : "");
      chip.textContent = k.toUpperCase();
      const col = confColor(keyConf(k));
      if (col) chip.style.background = col;
      const conf = keyConf(k);
      chip.title = conf == null ? `${k}: no data yet` : `${k}: ${Math.round(conf * 100)}% of target`;
      wrap.appendChild(chip);
    }
    const next = nextLockedKey();
    if (next) {
      const chip = document.createElement("span");
      chip.className = "chip locked";
      chip.textContent = next.toUpperCase();
      chip.title = `Next to unlock: ${next}`;
      wrap.appendChild(chip);
    }
  }

  function renderLesson() {
    const l = state.current;
    const root = $("lesson-text");
    root.style.fontSize = state.settings.fontSize + "px";
    const frag = document.createDocumentFragment();
    let word = null;
    for (let i = 0; i < l.text.length; i++) {
      const ch = l.text[i];
      const span = document.createElement("span");
      span.className = "char " + (i < l.pos ? "typed" : i === l.pos ? "current" : "upcoming");
      if (i === l.pos && l.typo) span.classList.add("typo");
      if (ch === " ") {
        span.classList.add("space");
        span.textContent = "·";
        word = null;
        frag.appendChild(span);
        // allow a line break after each space
        frag.appendChild(document.createTextNode("​"));
      } else {
        if (!word) {
          word = document.createElement("span");
          word.className = "word";
          frag.appendChild(word);
        }
        span.textContent = ch;
        word.appendChild(span);
      }
    }
    root.innerHTML = "";
    root.appendChild(frag);
  }

  function renderLive() {
    const l = state.current;
    const mins = l.activeMs / 60000;
    const wpm = mins > 0 ? (l.pos / 5) / mins : 0;
    const steps = l.steps.length;
    const clean = l.steps.filter((s) => !s.typo).length;
    $("live-wpm").textContent = wpm.toFixed(1);
    $("live-acc").textContent = ((steps ? clean / steps : 1) * 100).toFixed(1) + "%";
    $("live-time").textContent = Math.round(l.activeMs / 1000) + "s";
  }

  function makeKey(k) {
    const el = document.createElement("div");
    el.className = "key" + (HOME.has(k) ? " home" : "") + (k === " " ? " space" : "");
    el.dataset.key = k;
    el.textContent = k === " " ? "space" : k.toUpperCase();
    return el;
  }

  function buildKeyboard() {
    const kb = $("keyboard");
    kb.innerHTML = "";
    const row = (keys) => {
      const r = document.createElement("div");
      r.className = "keyboard-row";
      keys.forEach((k) => r.appendChild(makeKey(k)));
      return r;
    };
    if (state.settings.keyboardLayout === "split-straight") {
      const split = document.createElement("div");
      split.className = "keyboard-split";
      for (const side of [SPLIT_LEFT, SPLIT_RIGHT]) {
        const col = document.createElement("div");
        col.className = "keyboard-col";
        side.forEach((keys) => col.appendChild(row(keys)));
        split.appendChild(col);
      }
      kb.appendChild(split);
    } else {
      NORMAL_ROWS.forEach((keys) => kb.appendChild(row(keys)));
    }
    kb.appendChild(row([" "]));
  }

  function renderKeyboard() {
    const unlocked = new Set(state.unlocked);
    const next = nextLockedKey();
    const current = state.current.text[state.current.pos];
    for (const el of $("keyboard").querySelectorAll(".key")) {
      const k = el.dataset.key;
      el.classList.remove("active", "locked", "next", "focus", "current");
      el.style.background = "";
      if (k === " " || unlocked.has(k)) {
        el.classList.add("active");
        const col = k === " " ? null : confColor(keyConf(k));
        if (col) el.style.background = col;
      } else if (TRAINED.has(k)) {
        el.classList.add("locked");
      }
      if (k === next) el.classList.add("next");
      if (k === state.focus) el.classList.add("focus");
      if (k === current) el.classList.add("current");
    }
    const panel = $("keyboard-panel");
    if (state.settings.keyboardFade) {
      panel.style.opacity = String(Math.max(0, 1 - streak / FADE_STREAK));
    } else {
      panel.style.opacity = "1";
    }
  }

  function wpmFromTime(t) {
    return t ? 12000 / t : null;
  }

  function renderKeyTable() {
    const body = $("key-table-body");
    body.innerHTML = "";
    const rows = state.unlocked.slice();
    const next = nextLockedKey();
    if (next) rows.push(next);
    for (const k of rows) {
      const s = state.keyStats[k];
      const conf = keyConf(k);
      const tr = document.createElement("tr");
      if (k === next) tr.className = "locked";
      const cells = [
        (k === state.focus ? "▸ " : "") + k + (k === next ? " (next)" : ""),
        null,
        s && s.timeToType ? wpmFromTime(s.timeToType).toFixed(1) : "–",
        s && s.bestTimeToType ? wpmFromTime(s.bestTimeToType).toFixed(1) : "–",
        s ? s.lessons : 0,
        s ? s.hitCount : 0,
        s ? s.missCount : 0,
        s && s.hitCount ? (((s.hitCount - s.missCount) / s.hitCount) * 100).toFixed(1) + "%" : "–",
      ];
      cells.forEach((v, i) => {
        const td = document.createElement("td");
        if (i === 1) {
          if (conf == null) {
            td.textContent = "–";
          } else {
            const bar = document.createElement("span");
            bar.className = "conf-bar";
            const fill = document.createElement("i");
            fill.style.width = Math.min(100, conf * 100) + "%";
            fill.style.background = confColor(conf);
            bar.appendChild(fill);
            td.appendChild(bar);
            td.appendChild(document.createTextNode(Math.round(conf * 100) + "%"));
          }
        } else {
          td.textContent = v;
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }
  }

  function renderTotals() {
    const ls = state.lessons;
    $("tot-lessons").textContent = String(ls.length);
    const totalMin = ls.reduce((a, l) => a + (l.activeMs || 0), 0) / 60000;
    $("tot-time").textContent = totalMin >= 60 ? `${(totalMin / 60).toFixed(1)}h` : `${Math.round(totalMin)}m`;
    $("tot-top").textContent = ls.length ? Math.max(...ls.map((l) => l.wpm)).toFixed(1) : "–";
    const recent = ls.slice(-10);
    $("tot-avg").textContent = recent.length ? (recent.reduce((a, l) => a + l.wpm, 0) / recent.length).toFixed(1) : "–";
  }

  function drawChart(canvas, values, { min, max, format, refLine }) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 200;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const padL = 40, padR = 10, padT = 10, padB = 20;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;
    const y = (v) => padT + (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min)) * h;

    ctx.font = "11px system-ui";
    ctx.fillStyle = "#94a3b8";
    ctx.strokeStyle = "rgba(148,163,184,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4;
      const yy = y(v);
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(padL + w, yy);
      ctx.stroke();
      ctx.fillText(format(v), 4, yy + 4);
    }

    if (refLine != null) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(250,204,21,0.8)";
      ctx.beginPath();
      ctx.moveTo(padL, y(refLine));
      ctx.lineTo(padL + w, y(refLine));
      ctx.stroke();
      ctx.restore();
    }

    if (values.length === 0) {
      ctx.fillText("Finish a lesson to see your progress here", padL + 8, padT + h / 2);
      return;
    }
    const x = (i) => padL + (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.stroke();
    ctx.fillStyle = "#3b82f6";
    values.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(x(i), y(v), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function renderCharts() {
    const ls = state.lessons.slice(-CHART_LESSONS);
    const speeds = ls.map((l) => l.wpm);
    const target = state.settings.targetWpm;
    const top = Math.max(target * 1.25, ...speeds, 10);
    drawChart($("chart-speed"), speeds, {
      min: 0, max: Math.ceil(top / 10) * 10, format: (v) => String(Math.round(v)), refLine: target,
    });
    const accs = ls.map((l) => l.accuracy);
    const low = Math.min(0.8, ...accs);
    drawChart($("chart-acc"), accs, {
      min: Math.floor(low * 10) / 10, max: 1, format: (v) => Math.round(v * 100) + "%",
    });
  }

  function renderAll() {
    renderChips();
    renderLesson();
    renderLive();
    renderKeyboard();
    renderKeyTable();
    renderTotals();
    renderCharts();
  }

  // ---------- settings & buttons ----------
  function applySettingsToUI() {
    const s = state.settings;
    $("set-target").value = s.targetWpm;
    $("set-length").value = s.lessonLength;
    $("set-length-out").textContent = `(~${100 + Math.round(s.lessonLength * 100)} letters)`;
    $("set-recover").checked = s.recoverKeys;
    $("set-fade").checked = s.keyboardFade;
    $("set-sound").checked = s.soundOnError;
    $("set-font").value = s.fontSize;
    $("set-layout").value = s.keyboardLayout;
  }

  function changeSetting(key, value, { progression = false, rebuildKeyboard = false } = {}) {
    state.settings = LTT.sanitizeState({ settings: Object.assign({}, state.settings, { [key]: value }) }).settings;
    if (progression) {
      const prog = refreshProgression();
      if (prog.newlyUnlocked.length) {
        announceUnlocks(prog.newlyUnlocked);
        startNewLesson(); // new lesson so the new key gets practised
      }
    }
    if (rebuildKeyboard) buildKeyboard();
    applySettingsToUI();
    saveNow();
    renderAll();
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function attachListeners() {
    document.addEventListener("keydown", onKeyDown);
    $("typing-area").addEventListener("click", () => $("typing-area").focus());

    // Buttons shouldn't keep focus, or Space would "click" them while typing.
    for (const b of document.querySelectorAll("button")) {
      b.addEventListener("click", () => b.blur());
    }

    $("skip-btn").addEventListener("click", () => {
      startNewLesson();
      showSummary("Skipped — this lesson wasn't counted.");
      saveNow();
      renderAll();
    });

    $("set-target").addEventListener("change", (e) =>
      changeSetting("targetWpm", parseInt(e.target.value, 10), { progression: true }));
    $("set-length").addEventListener("input", (e) => changeSetting("lessonLength", parseFloat(e.target.value)));
    $("set-recover").addEventListener("change", (e) =>
      changeSetting("recoverKeys", e.target.checked, { progression: true }));
    $("set-fade").addEventListener("change", (e) => changeSetting("keyboardFade", e.target.checked));
    $("set-sound").addEventListener("change", (e) => changeSetting("soundOnError", e.target.checked));
    $("set-font").addEventListener("input", (e) => changeSetting("fontSize", parseInt(e.target.value, 10)));
    $("set-layout").addEventListener("change", (e) =>
      changeSetting("keyboardLayout", e.target.value, { rebuildKeyboard: true }));

    // Checkboxes, sliders and dropdowns hand focus back to the lesson, so the
    // next keystrokes type instead of toggling the control.
    for (const id of ["set-length", "set-recover", "set-fade", "set-sound", "set-font", "set-layout"]) {
      $(id).addEventListener("change", () => $("typing-area").focus());
    }

    $("export-btn").addEventListener("click", () => {
      saveNow();
      const date = new Date().toISOString().slice(0, 10);
      download(`typing-trainer-progress-${date}.json`, LTT.exportState(state));
    });

    $("import-btn").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const imported = LTT.importState(await file.text());
        state = imported;
        refreshProgression();
        if (state.current) LTT.resumeLesson(state.current);
        else startNewLesson();
        buildKeyboard();
        applySettingsToUI();
        saveNow();
        showSummary(`Imported ${state.lessons.length} lessons.`);
        showBanner(null);
        renderAll();
      } catch (err) {
        alert(err.message);
      }
    });

    $("reset-btn").addEventListener("click", () => {
      if (!confirm("Reset all progress? Your settings are kept. This can't be undone — export first if unsure.")) return;
      const settings = state.settings;
      state = LTT.defaultState();
      state.settings = settings;
      refreshProgression();
      startNewLesson();
      saveNow();
      showSummary("Progress reset. Back to the home row.");
      showBanner(null);
      renderAll();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveNow();
    });
    window.addEventListener("pagehide", saveNow);
    window.addEventListener("resize", () => renderCharts());
  }

  function playErrorSound() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
      }
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 220;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      /* sound is optional */
    }
  }

  // ---------- boot ----------
  function init() {
    refreshProgression();
    if (state.current && !LTT.isLessonDone(state.current)) {
      LTT.resumeLesson(state.current);
      if (state.current.pos > 0) showSummary("Welcome back — picking up where you left off.");
    } else {
      startNewLesson();
    }
    buildKeyboard();
    applySettingsToUI();
    attachListeners();
    saveNow();
    renderAll();
    $("typing-area").focus();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
