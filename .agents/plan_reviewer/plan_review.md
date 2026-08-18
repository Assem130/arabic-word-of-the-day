# Adversarial Master Plan Review: Kalimat (كَلِمات)

**Date**: 2026-08-18  
**Reviewer**: Adversarial Plan Reviewer & Critic  
**Scope**: `PROJECT.md`, `ORIGINAL_REQUEST.md`, explorer reports (`audit_ux_a11y.md`, `audit_logic_features.md`, `audit_arch_tests.md`), and live codebase state.  
**Verdict**: **REQUEST_CHANGES**

---

## Executive Summary

The master plan in `PROJECT.md` establishes a strong architectural direction for Kalimat: 100% zero-dependency vanilla web architecture, local-first privacy, PWA offline readiness, and classical Arabic linguistic rigor.

However, an adversarial forensic review revealed **three critical structural flaws** that would cause serious regressions, state corruption, test suite failures, or worker race conditions if implemented as currently drafted:

1. **CRITICAL: Inaccurate Data Model & LocalStorage Schema Contract in `PROJECT.md`**:
   - `PROJECT.md` (lines 56–82) defines a pseudo-schema with `history` as an array, `favorites` as an array of IDs, `srs` with fields `easeFactor` and `dueDate`, and `theme` inside `preferences`.
   - The actual, battle-tested Schema v2 in `app-core.js` uses `history` as a hash map (`Record<string, { firstSeen: string }>`), `favorites` as a boolean map (`Record<string, boolean>`), `srs` with fields `ef` and `nextReviewDate`, and `theme` stored independently in the `kalimat_theme` localStorage key.
   - **Impact**: If a subagent implements the schema written in `PROJECT.md`, it will corrupt existing user localStorage data, break backward compatibility with v0/v1 migrations, and immediately fail all 43 unit tests in `tests/migration.test.js` and `tests/sm2.test.js`.
2. **MAJOR: Misidentified Baseline Test Failures**:
   - `PROJECT.md` (lines 21 & 36) specifies fixing `test.js:500` (lexicon menu link) and `tests/corpus.test.js:131` (Word #24 citation).
   - In the live repository, `test.js` and `tests/corpus.test.js` currently pass. The **actual failing test** is `tests/corpus_parity.test.js` (Subtest 1: Word #14 `التَّلِيد` root mismatch: `root: "ت ل د"` in `words.js` vs `root: "و ل د"` in `extension/data/vocabulary.json`).
   - **Impact**: Parallel workers would attempt to solve non-existent bugs while leaving the real test blocker unresolved.
3. **MAJOR: Execution Collision Risk & Cascading Test Breakage from CSS Consolidation**:
   - Merging `revamp.css` into `style.css` and deleting `revamp.css` will immediately cause `test.js:484` (`fs.readFileSync("revamp.css")`) and `tests/review_ui.test.js:16,24,410` to crash with `ENOENT` if not atomically updated alongside the stylesheet.
   - `index.html` and `word.html` have overlapping modifications proposed across Styling (removing `<link href="revamp.css">`), Logic (ARIA `role="status"` removal, CSP tightening), and Navigation.
   - **Impact**: Concurrent subagents will experience git merge conflicts or overwrite each other's HTML modifications.

---

## Detailed Evaluation along Core Dimensions

### 1. Ponytail Standard & Minimalist Engineering
- **Over-Engineering & Speculative Code**:
  - The core architecture is commendably lean: native HTML `<dialog>`, `<details>/<summary>`, Web Speech API fallback, and zero npm/CDN dependencies.
  - *Finding 1.1 (Minor)*: In typography fixes, avoid nested `clamp()` calculations for line-height (e.g. `clamp(1.25, 1.35em, 1.45)`). Stick to straightforward `line-height: 1.35;` and `padding-block: 0.08em;` on Arabic headings.
- **CSS Consolidation Assessment**:
  - Consolidating `revamp.css` into `style.css` is strictly aligned with the Ponytail standard (eliminates ~54KB of duplicated CSS parsing across both pages and in `sw.js`).
  - *Risk*: `test.js` and `tests/review_ui.test.js` hardcode reads of `revamp.css`. The consolidation must include updating test fixtures to inspect `style.css` exclusively.
- **Dependency Discipline**:
  - Strict zero runtime and build dependencies maintained. CSP `script-src 'self'` enforced.

---

### 2. Local-First Data Safety & Backward Compatibility

#### Forensic Comparison of Schemas

| Field / Dimension | `PROJECT.md` (Proposed Draft) | `app-core.js` (Actual Schema v2) | Risk Assessment |
|---|---|---|---|
| `history` | `Array<{ id, date, reviewedAt?, rating? }>` | `Record<string, { firstSeen: string }>` | **CRITICAL**: Breaks `calculateStreak()`, `normalizeState()`, and history dialog rendering. |
| `favorites` | `number[]` (Array of IDs) | `Record<string, boolean>` (e.g. `{"1": true}`) | **CRITICAL**: Breaks `toggleFavorite()`, `isFavorite()`, and history filters. |
| `srs[id].ef` | `easeFactor: number` | `ef: number` (clamped >= 1.3, <= 5.0) | **CRITICAL**: Breaks SM-2 interval calculations and `calculateNextReview()`. |
| `srs[id].dueDate` | `dueDate: string` | `nextReviewDate: string` (`YYYY-MM-DD`) | **CRITICAL**: Breaks `getDueReviewWords()` queue filtering and badge counter. |
| `srs[id]` extra fields | Missing `lastReviewedDate`, `reviewCount`, `lapses`, `history` | Required for SM-2 lapses and recovery logging (bounded to 50 entries) | **CRITICAL**: Loss of review history and lapse recovery. |
| `preferences` | `{ theme, autoAudio, audioVoice }` | `{ showEnglish, speechRate, speechRepeat, dailyReviewLimit }` | **CRITICAL**: Theme is stored in `kalimat_theme`, not in state. `speechRate` / `dailyReviewLimit` would be lost. |
| `streak` / `lastActiveDate` | Explicit stored properties | Dynamically derived from `history` dates via `calculateStreak()` | **MAJOR**: Redundant state duplication susceptible to stale cache drift. |

#### Required Action:
Update `PROJECT.md` Section "Data Model & LocalStorage Schema (v2)" to specify the exact canonical schema from `app-core.js`.

---

### 3. Execution Seams & Write Ownership for Parallel Workers

To enable parallel execution across subagents without git collisions or broken intermediate states, file write ownership must be strictly partitioned:

```
+-----------------------------------------------------------------------------------+
|                        PARALLEL WORKER WRITE OWNERSHIP MATRIX                     |
+-----------------------------------------------------------------------------------+
| Worker / Agent              | Sole Write Ownership       | Read Access            |
+-----------------------------+----------------------------+------------------------+
| Worker 1: Design & Styling  | - `style.css`              | - `index.html`         |
|                             | - Deletes `revamp.css`     | - `word.html`          |
|                             | - `tests/review_ui.test.js`| - `words.js`           |
+-----------------------------+----------------------------+------------------------+
| Worker 2: Logic, A11y, PWA  | - `index.html`             | - `style.css`          |
|                             | - `word.html`              | - `words.js`           |
|                             | - `app-core.js`            |                        |
|                             | - `app.js`                 |                        |
|                             | - `revamp.js`              |                        |
|                             | - `sw.js`                  |                        |
+-----------------------------+----------------------------+------------------------+
| Worker 3: Corpus & Tests    | - `words.js`               | - `index.html`         |
|                             | - `extension/data/`        | - `word.html`          |
|                             |   `vocabulary.json`        | - `app-core.js`        |
|                             | - `test.js`                | - `style.css`          |
|                             | - `tests/*.test.js`        |                        |
+-----------------------------+----------------------------+------------------------+
```

#### Collision Prevention Rules:
1. **HTML Modification Handshake**: Worker 2 owns `index.html` and `word.html`. When updating HTML, Worker 2 removes `<link rel="stylesheet" href="revamp.css">` and cleans CSP / ARIA attributes in a single cohesive pass.
2. **Test File Synchronization**: Worker 1 updates `tests/review_ui.test.js` to reference only `style.css`. Worker 3 updates `test.js` line 484 to load `style.css`.

---

### 4. Test Suite Coverage & Verification Rigor

#### Identified Discrepancy & Actual Test Failure
- Current status:
  - `node test.js`: **PASSED** (exit code 0).
  - `node --test tests/corpus.test.js`: **PASSED** (exit code 0).
  - `node --test tests/corpus_parity.test.js`: **FAILED** (exit code 1):
    `AssertionError: Corpus parity mismatch for record 14, field root -> root: 'و ل د' !== 'ت ل د'`.
- Root cause: In `words.js`, Word #14 (`التَّلِيد`) has `root: "ت ل د"`. In `extension/data/vocabulary.json`, Word #14 has `root: "و ل د"`.
- Required fix: Harmonize Word #14 root to `"ت ل د"` in `extension/data/vocabulary.json` (or update both consistently) to restore full corpus parity.

#### Expanded Tier 1–4 Test Suite Specifications
`PROJECT.md` Milestone M4 must explicitly outline the test suites:
- **Tier 1 (Corpus & Linguistic Invariants)**:
  - Validate 365 words have 12 mandatory fields, classical attribution dash `—`, valid Arabic roots, and lexical parity with extension vocabulary.
- **Tier 2 (Persistence & State Migrations)**:
  - Validate v0 -> v1 -> v2 migration idempotence, corrupt JSON recovery, Anki RFC 4180 CSV export with UTF-8 BOM, and backup JSON serialization.
- **Tier 3 (Interactive Components, SM-2 & Audio)**:
  - Validate SM-2 EF formulas, due queue ordering, dual audio cascade (MP3 404 -> Web Speech API with V8 GC anchoring), and Lexicon search filter metrics.
- **Tier 4 (Accessibility, Typography & Contrast)**:
  - Validate WCAG 2.1 AA/AAA contrast math (>= 4.5:1 text, >= 3:1 borders), ARIA semantics (`role="status"` removal on buttons), logical RTL properties, and touch targets (>= 44x44px).

---

## Actionable Revisions Required in `PROJECT.md`

Before approving the plan for parallel implementation, `PROJECT.md` must be updated with the following 4 revisions:

1. **Correct Interface Contracts / Data Model (Lines 56–82)**:
   Replace the TypeScript interface with the accurate `KalimatState` schema matching `app-core.js`.
2. **Update Feature Inventory Item #1 & Milestone M1 (Lines 21, 36)**:
   Change target from the already passing tests to fixing `tests/corpus_parity.test.js` (Word #14 root parity).
3. **Include the Parallel Worker Write Ownership Matrix**:
   Explicitly delineate file ownership for Design, Logic, and Tests.
4. **Detail Tier 1–4 Test Suite Requirements in Milestone M4**:
   Enumerate specific test requirements across corpus, persistence, interactive logic, and a11y.

---

## Findings Summary Matrix

| ID | Severity | Location | Issue | Required Revision |
|---|---|---|---|---|
| **F-01** | **Critical** | `PROJECT.md:57-81` | Incorrect `KalimatState` schema contract (arrays instead of maps, mismatched field names). | Replace with canonical Schema v2 from `app-core.js`. |
| **F-02** | **Major** | `PROJECT.md:21,36` | Outdated test defect description (mentions passing tests instead of Word 14 root parity failure). | Update Feature #1 and Milestone M1 to target `tests/corpus_parity.test.js`. |
| **F-03** | **Major** | `PROJECT.md:32-41` | Missing explicit file write ownership boundaries for parallel subagents. | Add parallel write ownership matrix to prevent HTML/CSS race conditions. |
| **F-04** | **Major** | `PROJECT.md:22` | Cascading `ENOENT` risk in `test.js` and `tests/review_ui.test.js` upon deleting `revamp.css`. | Document atomic test fixture update requirement during CSS consolidation. |
| **F-05** | **Minor** | `PROJECT.md:23` | Over-complicated typography clamp rules suggested in exploratory notes. | Specify clean `line-height: 1.35;` and `letter-spacing: normal;` rules. |
