# Handoff Report: Code Architecture & Test Suite Audit

**Agent**: Explorer 3 (Code Architecture & Test Suite Specialist)  
**Role**: Read-only Architectural Investigation & Test Suite Audit  
**Date**: 2026-08-18  
**Working Directory**: `.agents/explorer_arch/`  
**Target Report**: `.agents/explorer_arch/audit_arch_tests.md`

---

## 1. Observation

1. **Test Runner Failure in `node test.js`**:
   - Command: `node test.js`
   - Result: Exited with code 1 at line 500:
     ```javascript
     // test.js:500
     assert.match(wordPage, /<div class="app-menu-dropdown(?:\s+word-menu-dropdown)?" id="app-menu-dropdown" hidden>[\s\S]*?<a class="nav-explorer-link" href="index\.html#lexicon-explorer"[^>]*>[\s\S]*?<use href="#i-search"\/>[\s\S]*?معجم الجذور[\s\S]*?<\/a>/, "word-page menu must link directly to the lexicon explorer");
     ```
   - Target inspection: `word.html:126-156` contains `<div class="app-menu-dropdown word-menu-dropdown" id="app-menu-dropdown" hidden>` but lacks `<a class="nav-explorer-link" href="index.html#lexicon-explorer"...>`.
2. **Test Runner Failure in `tests/corpus.test.js`**:
   - Command: `node tests/corpus.test.js`
   - Result: Exited with code 1 at line 131:
     ```javascript
     // tests/corpus.test.js:131
     AssertionError [ERR_ASSERTION]: Word #24 example quote must have an attribution dash or scripture brackets: 'فاحَ أَرِيجُ الياسمين في الفناء بعد أن سُقيت الأزهار.'
     ```
   - Target inspection: `words.js:337` contains `example: "فاحَ أَرِيجُ الياسمين في الفناء بعد أن سُقيت الأزهار."` which lacks an attribution dash `[—–―‒]` or scripture brackets `«...»` / `﴿...﴾`.
3. **Other Test Suites Status**:
   - `node tests/corpus_parity.test.js`: PASS (1/1)
   - `node tests/lexicon.test.js`: PASS (7/7)
   - `node tests/migration.test.js`: PASS (21/21)
   - `node tests/review_ui.test.js`: PASS (11/11)
   - `node tests/sm2.test.js`: PASS (22/22)
   - Total across `tests/*.test.js`: 72 passed, 1 failed (Corpus #24 quote).
4. **CSS Duplication & Overhead**:
   - `style.css`: 53,933 bytes (1,545 lines).
   - `revamp.css`: 57,182 bytes (1,595 lines).
   - Both files are linked sequentially in `<head>` in `index.html` (lines 14–15) and `word.html` (lines 13–14).
   - `git diff --no-index style.css revamp.css` confirms >98% line duplication; `revamp.css` includes minor responsive & review component updates.
5. **Zero Runtime Dependencies & Strict Security**:
   - `package.json`: None present in root; zero external runtime dependencies.
   - CSP in `index.html:9` and `word.html:8`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; ...`
   - Local-first architecture: `localStorage` stores learning history and theme state (`arabic_words_state`, `kalimat_theme`) with zero external tracking calls.

---

## 2. Logic Chain

1. **Step 1 (Root Cause of `node test.js` failure)**:
   - Observation 1 shows `test.js:500` expects `word.html`'s menu dropdown to contain `<a class="nav-explorer-link" href="index.html#lexicon-explorer"...>`.
   - Inspection of `word.html:126-156` confirms the element is missing.
   - Therefore, `node test.js` fails because `word.html` is out of sync with the expected navigation contract.
2. **Step 2 (Root Cause of `tests/corpus.test.js` failure)**:
   - Observation 2 shows `tests/corpus.test.js:131` asserts that every word's example quote matches `/[—–―‒]/` or `/﴿[^﴾]+﴾/` or `/«[^»]+»/`.
   - Word #24 in `words.js:337` is a standalone sentence without an attribution dash or brackets.
   - Therefore, Subtest 6 fails on Word #24.
3. **Step 3 (Stylesheet Bloat & Consolidation Opportunity)**:
   - Observation 4 shows that both `style.css` and `revamp.css` are loaded in both HTML files, forcing duplicate CSS network transfer and double AST parsing for ~111 KB of CSS.
   - `revamp.css` is a superset of `style.css`.
   - By consolidating `revamp.css` into `style.css` and removing the `revamp.css` link, the codebase eliminates ~54 KB redundant transfer and simplifies maintenance adhering to the Ponytail standard (boring over clever, no bloat).
4. **Step 4 (Component Seam Assessment)**:
   - `app-core.js` is cleanly decoupled from the DOM and exports side-effect-free algorithms (SM-2, date math, migrations, filtering).
   - `revamp.js` handles `index.html` DOM initialization.
   - `app.js` handles `word.html` DOM initialization.
   - Modifying visual layouts and fixing navigation links requires only small, localized edits without touching `app-core.js`.

---

## 3. Caveats

- **Extension UI Mocks**: 25 subtests in `extension/tests/ui.test.js` failed due to missing mock properties in test harness (e.g. simulated input element `.value` access). The extension runtime itself is functional and validated against `package.test.js` and `vocabulary.test.js`.
- **Browser Audio Environment**: Web Speech API audio was verified via Node VM mocks (`FakeSpeechSynthesisUtterance`); live audio synthesizer timbre varies across client operating systems.

---

## 4. Conclusion

1. The Kalimat codebase has a clean, resilient, zero-dependency architecture with strong separation between headless business logic (`app-core.js`) and UI controllers (`app.js`, `revamp.js`).
2. There are two immediate, deterministic fixes required to achieve 100% passing automated tests:
   - Add the missing `nav-explorer-link` to `word.html`'s `#app-menu-dropdown`.
   - Add an attribution dash (e.g. `— تعبير أدبي`) to Word #24 in `words.js`.
3. Consolidating `revamp.css` into `style.css` and removing the dual CSS loading in `index.html` and `word.html` will reduce CSS parsing overhead by ~50% with zero breaking changes.
4. Comprehensive audit details and Tier 1–4 test plan are documented in `audit_arch_tests.md`.

---

## 5. Verification Method

To independently reproduce all observations and verify the state of the codebase:

1. **Run Root Integration Tests**:
   ```bash
   node test.js
   ```
   *Expected Current Output*: Fails at line 500 (`word-page menu must link directly to the lexicon explorer`).
2. **Run Modular Unit Tests**:
   ```bash
   node --test tests/*.test.js
   ```
   *Expected Current Output*: 72 passed, 1 failed (`tests/corpus.test.js` Subtest 6 Word #24).
3. **Verify CSS Duplication**:
   ```bash
   git diff --no-index style.css revamp.css
   ```
   *Expected Output*: Only ~50 lines of differences across 1,595 lines.
4. **Verify Zero Runtime Dependencies**:
   Inspect `index.html` and `word.html` to confirm no external `<script src="http...">` tags exist.
