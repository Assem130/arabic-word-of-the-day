# Current App Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bold, accessible, local-first overhaul of the existing two-page Arabic word-of-the-day app with deterministic daily words, compact portable history, and optional concise English help.

**Architecture:** Keep the existing vanilla HTML/CSS/JavaScript app and split only the oversized mixed-responsibility `app.js`: `words.js` owns data, `app-core.js` owns pure deterministic state/backup logic, and `app.js` owns browser rendering and interactions. Store one versioned state object in `localStorage`; export/import and any future remote sync reuse the same normalization and merge functions.

**Tech Stack:** Semantic HTML, CSS, browser JavaScript, localStorage, Web Speech API, Web Share API, Clipboard API, native `<dialog>`, Node.js built-in `assert`, existing Python UTF-8 server, existing GSAP homepage enhancement.

## Global Constraints

- Do not modify `kalimat-minimal/`.
- Do not add accounts, a backend, analytics, a database, a framework, a build step, or a dependency.
- Arabic is primary; English is limited to existing transliteration plus one concise gloss per word.
- History is automatic, compact, versioned, exportable, importable, and merge-safe.
- The palette is deep green, muted warm paper, and existing lime `#D9FF76` used only for a thin transition, primary actions, and small markers.
- Preserve graceful no-motion, no-speech, no-share, no-clipboard, and no-storage behavior.
- Preserve keyboard access, semantic structure, Arabic shaping, RTL reading order, LTR English glosses, and phone-width usability.
- Use no speculative storage adapter or synchronization framework.

## File map

- Create `words.js`: word records only; exposes `WORDS_DB` in browsers and CommonJS.
- Create `app-core.js`: pure date, state, validation, merge, import, and export functions.
- Create `test.js`: one dependency-free self-check for data and core behavior.
- Modify `app.js`: DOM rendering and browser integration using `WORDS_DB` and `KalimatCore`.
- Modify `word.html`: semantic word layout, native archive dialog, English and portability controls, script order.
- Modify `index.html`: bold editorial hierarchy while retaining the two-page flow.
- Modify `revamp.css`: approved responsive palette and layouts.
- Modify `revamp.js`: restrained progressive motion only.
- Modify `README.md`: accurate feature, storage, backup, and file-structure documentation.
- Leave `server.py` unchanged unless browser QA proves a concrete serving defect.

---

### Task 1: Pure local-first state and backup core

**Files:**
- Create: `app-core.js`
- Create: `test.js`

**Interfaces:**
- Produces: `KalimatCore.SCHEMA_VERSION: 1`
- Produces: `getLocalDateKey(date: Date): string`
- Produces: `getDailyWordIndex(dateKey: string, wordCount: number): number`
- Produces: `createDefaultState(): {schemaVersion, history, preferences}`
- Produces: `normalizeState(raw: unknown, validIds: Set<number>, fallbackDate: string): State`
- Produces: `mergeStates(local: State, incoming: State, validIds: Set<number>): State`
- Produces: `parseBackup(text: string, validIds: Set<number>): State`
- Produces: `serializeBackup(state: State): string`

- [ ] **Step 1: Write failing core tests**

Create `test.js` with Node built-ins only:

```js
"use strict";

const assert = require("node:assert/strict");
const Core = require("./app-core.js");

const ids = new Set([1, 2, 3]);

assert.equal(Core.getLocalDateKey(new Date(2026, 6, 20)), "2026-07-20");
assert.equal(Core.getDailyWordIndex("1970-01-01", 60), 0);
assert.equal(Core.getDailyWordIndex("1970-01-02", 60), 1);
assert.equal(Core.getDailyWordIndex("2026-07-20", 60), Core.getDailyWordIndex("2026-07-20", 60));
assert.throws(() => Core.getDailyWordIndex("2026-02-30", 60), /Invalid daily word input/);

const defaults = Core.createDefaultState();
assert.deepEqual(defaults, {
    schemaVersion: 1,
    history: {},
    preferences: { showEnglish: true }
});

const normalized = Core.normalizeState({
    schemaVersion: 1,
    history: {
        1: { firstSeen: "2026-07-20" },
        99: { firstSeen: "2026-07-19" }
    },
    preferences: { showEnglish: false }
}, ids, "2026-07-21");
assert.deepEqual(normalized.history, { 1: { firstSeen: "2026-07-20" } });
assert.equal(normalized.preferences.showEnglish, false);

const migrated = Core.normalizeState({
    learnedWords: [{ id: 2 }, { id: 3 }]
}, ids, "2026-07-21");
assert.deepEqual(migrated.history, {
    2: { firstSeen: "2026-07-21" },
    3: { firstSeen: "2026-07-21" }
});

const merged = Core.mergeStates(
    { schemaVersion: 1, history: { 1: { firstSeen: "2026-07-20" } }, preferences: { showEnglish: false } },
    { schemaVersion: 1, history: { 1: { firstSeen: "2026-07-18" }, 2: { firstSeen: "2026-07-19" } }, preferences: { showEnglish: true } },
    ids
);
assert.deepEqual(merged.history, {
    1: { firstSeen: "2026-07-18" },
    2: { firstSeen: "2026-07-19" }
});
assert.equal(merged.preferences.showEnglish, false);

const exported = Core.serializeBackup(merged);
assert.deepEqual(Core.parseBackup(exported, ids), merged);
assert.throws(() => Core.parseBackup("not json", ids), /Invalid backup file/);
assert.throws(() => Core.parseBackup('{"schemaVersion":1}'), /Invalid backup file/);
assert.throws(() => Core.parseBackup('{"schemaVersion":2}', ids), /Unsupported backup version/);

console.log("All checks passed.");
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run: `node test.js`

Expected: FAIL with `Cannot find module './app-core.js'`.

- [ ] **Step 3: Implement the minimal pure core**

Create `app-core.js` as a browser/CommonJS module. Use this exact public surface and behavior:

```js
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.KalimatCore = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";

    const SCHEMA_VERSION = 1;
    const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

    function isDateKey(value) {
        if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }

    function getLocalDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function getDailyWordIndex(dateKey, wordCount) {
        if (!isDateKey(dateKey) || !Number.isInteger(wordCount) || wordCount < 1) {
            throw new TypeError("Invalid daily word input.");
        }
        const [year, month, day] = dateKey.split("-").map(Number);
        const ordinal = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
        return ((ordinal % wordCount) + wordCount) % wordCount;
    }

    function createDefaultState() {
        return { schemaVersion: SCHEMA_VERSION, history: {}, preferences: { showEnglish: true } };
    }

    function normalizeState(raw, validIds, fallbackDate) {
        const state = createDefaultState();
        if (!raw || typeof raw !== "object") return state;

        const sourceHistory = raw.schemaVersion === SCHEMA_VERSION && raw.history && typeof raw.history === "object" && !Array.isArray(raw.history)
            ? Object.entries(raw.history)
            : Array.isArray(raw.learnedWords)
                ? raw.learnedWords.map(item => [item.id, { firstSeen: fallbackDate }])
                : [];

        for (const [rawId, record] of sourceHistory) {
            const id = Number(rawId);
            if (!validIds.has(id) || !record || !isDateKey(record.firstSeen)) continue;
            state.history[id] = { firstSeen: record.firstSeen };
        }

        if (raw.preferences && typeof raw.preferences === "object") {
            state.preferences.showEnglish = raw.preferences.showEnglish !== false;
        }
        return state;
    }

    function mergeStates(local, incoming, validIds) {
        const merged = normalizeState(local, validIds, getLocalDateKey(new Date()));
        const other = normalizeState(incoming, validIds, getLocalDateKey(new Date()));
        for (const [id, record] of Object.entries(other.history)) {
            const current = merged.history[id];
            if (!current || record.firstSeen < current.firstSeen) merged.history[id] = record;
        }
        return merged;
    }

    function parseBackup(text, validIds) {
        let raw;
        try { raw = JSON.parse(text); } catch { throw new Error("Invalid backup file."); }
        if (!raw || raw.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported backup version.");
        if (!raw.history || typeof raw.history !== "object" || Array.isArray(raw.history)
            || !raw.preferences || typeof raw.preferences !== "object" || Array.isArray(raw.preferences)) {
            throw new Error("Invalid backup file.");
        }
        return normalizeState(raw, validIds, getLocalDateKey(new Date()));
    }

    function serializeBackup(state) {
        return `${JSON.stringify(state, null, 2)}\n`;
    }

    return { SCHEMA_VERSION, getLocalDateKey, getDailyWordIndex, createDefaultState, normalizeState, mergeStates, parseBackup, serializeBackup };
});
```

- [ ] **Step 4: Run the tests and verify success**

Run: `node test.js`

Expected: `All checks passed.`

- [ ] **Step 5: Commit the core**

```powershell
git add app-core.js test.js
git commit -m "Add local-first state core"
```

---

### Task 2: Extract and validate the word dataset

**Files:**
- Create: `words.js`
- Modify: `app.js:2-664`
- Modify: `test.js`

**Interfaces:**
- Consumes: the current 60 `WORDS_DB` records from `app.js`.
- Produces: `globalThis.WORDS_DB: Word[]` in browsers.
- Produces: `module.exports: Word[]` in Node.
- `Word` shape: `{id, word, pronunciation, vocalization, weight, root, category, meaning, englishMeaning, example}`.

- [ ] **Step 1: Extend the self-check before moving data**

Append to `test.js` before the final log:

```js
const words = require("./words.js");
assert.equal(words.length, 60);
assert.equal(new Set(words.map(word => word.id)).size, words.length);
for (const word of words) {
    assert.equal(Number.isInteger(word.id), true);
    for (const field of ["word", "pronunciation", "vocalization", "weight", "root", "category", "meaning", "englishMeaning", "example"]) {
        assert.equal(typeof word[field], "string", `Word ${word.id} ${field} must be a string`);
        assert.equal(word[field].trim().length > 0, true, `Word ${word.id} ${field} must not be empty`);
    }
    assert.equal(word.englishMeaning.length <= 180, true, `Word ${word.id} English gloss is too long`);
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node test.js`

Expected: FAIL with `Cannot find module './words.js'`.

- [ ] **Step 3: Move the existing records without rewriting Arabic content**

Use `apply_patch` to move the complete array expression currently assigned by `const WORDS_DB = [` at `app.js:2` through its closing `];` at `app.js:664` into `words.js`. Rename only the binding from `WORDS_DB` to `words`, then add this exact wrapper around that unchanged array:

```js
(function (root) {
    "use strict";
```

```js
    if (typeof module === "object" && module.exports) module.exports = words;
    root.WORDS_DB = words;
})(typeof globalThis === "object" ? globalThis : this);
```

Remove only the original dataset declaration from `app.js`; do not change rendering in this step. Confirm the moved array still contains IDs 1 through 60 in the original order with `node test.js`.

- [ ] **Step 4: Add one faithful concise English gloss per record**

Add an `englishMeaning` string immediately after each Arabic `meaning`. Translate only the existing meaning, use one sentence or compact phrase, and keep each value at or below 180 characters. Use this exact style:

```js
meaning: "الطمأنينة والهدوء الذي يستقر في النفس.",
englishMeaning: "Serenity; a settled state of inner calm and reassurance.",
```

Do not translate interface labels or literary examples. Do not change Arabic spelling, tashkeel, roots, weights, categories, or examples while adding glosses.

- [ ] **Step 5: Run the data check**

Run: `node test.js`

Expected: `All checks passed.`

- [ ] **Step 6: Commit the dataset split**

```powershell
git add words.js app.js test.js
git commit -m "Separate and enrich word data"
```

---

### Task 3: Integrate deterministic history, English preference, and backup controls

**Files:**
- Modify: `word.html:32-110`
- Modify: `app.js:666-1060`
- Modify: `test.js`

**Interfaces:**
- Consumes: `window.WORDS_DB` from `words.js`.
- Consumes: `window.KalimatCore` from `app-core.js`.
- Persists: existing key `arabic_words_state`, normalized to schema version 1.
- Produces DOM IDs: `word-pronunciation`, `word-meaning-en`, `btn-toggle-english`, `history-dialog`, `btn-export-history`, `btn-import-history`, `input-import-history`, `storage-warning`.

- [ ] **Step 1: Add integration assertions to the self-check**

Append before the final log in `test.js`:

```js
const todayKey = Core.getLocalDateKey(new Date(2026, 6, 20));
const todayWord = words[Core.getDailyWordIndex(todayKey, words.length)];
assert.equal(words.includes(todayWord), true);

const viewed = Core.createDefaultState();
viewed.history[todayWord.id] = { firstSeen: todayKey };
const viewedAgain = Core.mergeStates(viewed, viewed, new Set(words.map(word => word.id)));
assert.equal(Object.keys(viewedAgain.history).length, 1);
assert.equal(viewedAgain.history[todayWord.id].firstSeen, todayKey);
```

- [ ] **Step 2: Load scripts in dependency order**

Replace the final script in `word.html` with:

```html
<script src="words.js" charset="utf-8"></script>
<script src="app-core.js" charset="utf-8"></script>
<script src="app.js" charset="utf-8"></script>
```

- [ ] **Step 3: Add the approved learning and portability controls**

Within the meaning section add:

```html
<p class="word-pronunciation" id="word-pronunciation" dir="ltr">...</p>
<p class="meaning-english" id="word-meaning-en" dir="ltr" lang="en">...</p>
```

Replace the archive `<aside>` with a native dialog:

```html
<dialog class="history-dialog" id="history-dialog" aria-labelledby="history-title">
    <header>
        <div><p>مخزونك اللغوي</p><h2 id="history-title">الكلمات التي مرّت من هنا</h2></div>
        <button class="icon-button" id="btn-close-history" type="button" aria-label="إغلاق المخزون">
            <svg class="icon"><use href="#i-xmark"/></svg>
        </button>
    </header>
    <div class="drawer-content">
        <p class="drawer-empty-msg" id="drawer-empty-msg">لم تفتح أي كلمات بعد.</p>
        <ul class="history-list" id="history-list"></ul>
    </div>
</dialog>
```

Add these menu controls and file input:

```html
<button id="btn-toggle-english" type="button" aria-pressed="true">إخفاء الإنجليزية</button>
<button id="btn-export-history" type="button">تصدير المخزون</button>
<button id="btn-import-history" type="button">استيراد المخزون</button>
<input id="input-import-history" type="file" accept="application/json,.json" hidden>
<p id="storage-warning" class="storage-warning" role="alert" hidden>تعذّر حفظ المخزون على هذا الجهاز؛ ستبقى الجلسة الحالية متاحة.</p>
```

Set the toast to `<div class="toast" id="toast" role="status" aria-live="polite"></div>`.

- [ ] **Step 4: Replace random per-history selection with deterministic selection**

Use the core and store IDs only:

```js
const Core = window.KalimatCore;
const STORAGE_KEY = "arabic_words_state";
const VALID_WORD_IDS = new Set(WORDS_DB.map(word => word.id));
let appState = Core.createDefaultState();

function loadState() {
    const fallbackDate = Core.getLocalDateKey(new Date());
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        appState = Core.normalizeState(raw, VALID_WORD_IDS, fallbackDate);
        saveState();
    } catch {
        appState = Core.createDefaultState();
        document.getElementById("storage-warning").hidden = false;
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        return true;
    } catch {
        document.getElementById("storage-warning").hidden = false;
        return false;
    }
}

function determineTodayWord(now = new Date()) {
    const dateKey = Core.getLocalDateKey(now);
    const word = WORDS_DB[Core.getDailyWordIndex(dateKey, WORDS_DB.length)];
    if (!appState.history[word.id]) appState.history[word.id] = { firstSeen: dateKey };
    saveState();
    return word;
}
```

Keep a separate `currentWord` variable for archive preview selection; opening an archived word must not alter the deterministic daily selection.

- [ ] **Step 5: Render English help and history from IDs**

Render the approved fields and preference:

```js
function renderWord(word) {
    currentWord = word;
    elMainWord.textContent = word.word;
    document.getElementById("word-pronunciation").textContent = word.pronunciation;
    elMeaning.textContent = word.meaning;
    const english = document.getElementById("word-meaning-en");
    english.textContent = word.englishMeaning;
    english.hidden = !appState.preferences.showEnglish;
    const toggle = document.getElementById("btn-toggle-english");
    toggle.setAttribute("aria-pressed", String(appState.preferences.showEnglish));
    toggle.textContent = appState.preferences.showEnglish ? "إخفاء الإنجليزية" : "إظهار الإنجليزية";
}
```

Build archive list items with `textContent`, look up each saved ID in `WORDS_DB`, sort by `firstSeen` descending, and label the date using an Arabic locale. Never interpolate imported storage values into `innerHTML`.

- [ ] **Step 6: Add safe export and merge-import behavior**

Implement these handlers:

```js
function exportHistory() {
    const blob = new Blob([Core.serializeBackup(appState)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kalimat-history-${Core.getLocalDateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("تم تصدير المخزون.");
}

async function importHistory(file) {
    try {
        const incoming = Core.parseBackup(await file.text(), VALID_WORD_IDS);
        appState = Core.mergeStates(appState, incoming, VALID_WORD_IDS);
        saveState();
        updateHistoryUI();
        showToast("تم دمج المخزون بنجاح.");
    } catch (error) {
        showToast(error.message === "Unsupported backup version."
            ? "إصدار ملف المخزون غير مدعوم."
            : "ملف المخزون غير صالح.");
    }
}
```

Wire export, import button, file input reset, English toggle, native dialog `showModal()`/`close()`, and existing share/copy/speech behavior. Disable speech with an accessible label when `speechSynthesis` or `SpeechSynthesisUtterance` is unavailable.

- [ ] **Step 7: Run the full self-check**

Run: `node test.js`

Expected: `All checks passed.`

- [ ] **Step 8: Commit browser behavior**

```powershell
git add word.html app.js test.js
git commit -m "Add portable daily word history"
```

---

### Task 4: Implement the approved bold editorial interface

**Files:**
- Modify: `index.html:24-88`
- Modify: `word.html:30-125`
- Modify: `revamp.css:1-383`
- Modify: `revamp.js:1-45`

**Interfaces:**
- Consumes all DOM IDs established in Task 3.
- Produces responsive desktop and phone layouts without changing data behavior.
- Uses CSS tokens `--ink`, `--paper`, `--lime`, `--ink-soft`, and `--line`.

- [ ] **Step 1: Establish the approved palette and geometry**

Replace competing color declarations with these root tokens:

```css
:root {
    --ink: #14211b;
    --ink-soft: #24332b;
    --paper: #d8cfbf;
    --paper-light: #f3efe5;
    --lime: #d9ff76;
    --line-dark: rgb(20 33 27 / 34%);
    --line-light: rgb(243 239 229 / 40%);
    --content: min(1180px, calc(100% - 40px));
}
```

Use lime only on `.primary-button`, `.speak-button`, the four-pixel transition between `.word-identity` and `.word-reading`, and the literary quote marker. Do not use lime as a page, card, facts-grid, or archive background.

- [ ] **Step 2: Refine the homepage into one bold entry path**

Keep the existing semantic sections but make the hero the dominant composition:

```html
<div class="hero-copy">
    <p class="eyebrow">مجلة لغوية يومية</p>
    <h1>العربية،<br><span>بحضور أكبر.</span></h1>
    <p class="hero-lede">لفظة واحدة كل يوم؛ معناها، بنيتها، وصوتها في مساحة تمنحها ما تستحق.</p>
    <a class="primary-button" href="word.html">ابدأ القراءة <svg class="icon"><use href="#i-arrow"/></svg></a>
</div>
<div class="hero-art" aria-hidden="true"><div class="hero-glyph">ض</div></div>
```

Retain only supporting content that explains the three-step value: contemplate, understand, retain. Remove duplicate calls to action and decorative copy that repeats the hero promise.

- [ ] **Step 3: Build the two-surface word composition**

Structure `word.html` so `.word-identity` contains the masthead, date, word, listen action, and four linguistic facts on deep green. Place `.word-reading` immediately after it on muted warm paper, containing meaning, English gloss, example, pronunciation, archive notice, secondary actions, countdown, and import/export links.

Use this responsive skeleton:

```css
.word-experience { width: var(--content); margin-inline: auto; overflow: clip; }
.word-identity { background: var(--ink); color: var(--paper-light); border-bottom: 4px solid var(--lime); }
.word-reading { background: var(--paper); color: var(--ink); padding: clamp(24px, 4vw, 56px); }
.reading-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(220px, .7fr); gap: clamp(28px, 5vw, 72px); }
.meaning-english { direction: ltr; text-align: left; max-width: 62ch; }
.example-panel { border-inline-start: 3px solid var(--lime); }
@media (max-width: 720px) {
    .reading-grid { grid-template-columns: 1fr; }
    .linguistic-data { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 4: Make controls and overlays accessible and restrained**

Use native buttons, visible `:focus-visible` outlines, minimum 44-pixel touch targets, and `dialog::backdrop`. Prevent body scroll only while the history dialog is open. Use `hidden` for the menu state and keep `aria-expanded` synchronized on its trigger. Ensure no action relies only on an icon or color.

- [ ] **Step 5: Keep motion progressive**

In `revamp.js`, return before registering animations when GSAP, ScrollTrigger, or motion permission is unavailable:

```js
document.addEventListener("DOMContentLoaded", () => {
    if (!window.gsap || !window.ScrollTrigger || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    gsap.from(".hero-copy > *", { opacity: 0, y: 28, duration: .8, stagger: .1, ease: "power3.out" });
    gsap.fromTo(".hero-glyph", { scale: .9 }, {
        scale: 1.04,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
    });
});
```

Do not animate word-reading content needed to understand the page.

- [ ] **Step 6: Run the self-check and inspect the diff**

Run: `node test.js`

Expected: `All checks passed.`

Run: `git diff --check`

Expected: no output.

- [ ] **Step 7: Commit the approved interface**

```powershell
git add index.html word.html revamp.css revamp.js
git commit -m "Overhaul the current app interface"
```

---

### Task 5: Browser QA and accurate documentation

**Files:**
- Modify: `README.md`
- Modify only if QA finds a defect: `index.html`, `word.html`, `revamp.css`, `revamp.js`, `app.js`, `app-core.js`, `words.js`, `test.js`

**Interfaces:**
- Consumes the complete app from Tasks 1-4.
- Produces a verified local release and accurate setup/feature documentation.

- [ ] **Step 1: Update README features and structure**

Document deterministic daily selection, automatic local history, concise optional English help, JSON export/import, privacy boundary, and future-sync-ready merge semantics. Update the file tree to include `words.js`, `app-core.js`, and `test.js`. State explicitly that cross-device transfer is manual and no account or server stores history.

- [ ] **Step 2: Run deterministic checks**

Run: `node test.js`

Expected: `All checks passed.`

Run: `git diff --check`

Expected: no output.

- [ ] **Step 3: Start the existing local server**

Run: `python server.py`

Expected: the server reports `http://localhost:8000` and serves UTF-8 HTML.

- [ ] **Step 4: Complete desktop browser QA at 1440 × 900**

Verify:

- Homepage primary action opens `word.html`.
- The word, facts, Arabic meaning, concise English gloss, example, and countdown render.
- English is visible by default, hides immediately, and remains hidden after reload.
- Speech works when available; unavailable speech is disabled accessibly.
- Share cancellation is silent; unsupported share copies instead.
- Archive opens as a modal dialog, closes by button and Escape, and restores focus.
- Copy, export, valid import, duplicate import, invalid JSON import, and unsupported schema import show the correct status without data loss.

- [ ] **Step 5: Complete phone browser QA at 390 × 844**

Verify:

- No horizontal overflow or clipped Arabic glyphs.
- Facts reflow to two columns and reading content becomes one column.
- Buttons remain at least 44 pixels high and do not overlap.
- Archive content scrolls inside the viewport.
- RTL Arabic and LTR English remain correctly aligned.

- [ ] **Step 6: Verify reduced motion and keyboard behavior**

Emulate `prefers-reduced-motion: reduce`, reload, and verify all content is immediately visible. Tab through the skip link, navigation, listen, menu, archive, English toggle, copy/share, export/import, and close controls. Verify focus is always visible and logical.

- [ ] **Step 7: Commit QA fixes and documentation**

```powershell
git add README.md index.html word.html revamp.css revamp.js app.js app-core.js words.js test.js
git commit -m "Verify and document local-first overhaul"
```

- [ ] **Step 8: Run final release checks**

Run: `node test.js`

Expected: `All checks passed.`

Run: `git diff --check`

Expected: no output.

Run: `git status --short`

Expected: only the pre-existing untracked `kalimat-minimal/` directory; no current-app implementation files remain modified or untracked.
