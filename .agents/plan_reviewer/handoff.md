# Handoff Report: Adversarial Plan Review

**Author**: Adversarial Expert Plan Reviewer  
**Directory**: `.agents/plan_reviewer/`  
**Date**: 2026-08-18  
**Task**: Master Plan Evaluation & Adversarial Review (`PROJECT.md`)  
**Verdict**: `REQUEST_CHANGES`

---

## 1. Observation

1. **Schema Mismatch in `PROJECT.md`**:
   - `PROJECT.md` lines 58–81 specifies:
     ```typescript
     interface KalimatState {
       version: 2;
       lastActiveDate: string;
       streak: number;
       longestStreak: number;
       history: Array<{ id: number; date: string; reviewedAt?: string; rating?: 'again' | 'hard' | 'good' | 'easy'; }>;
       favorites: number[];
       srs: Record<number, { interval: number; repetition: number; easeFactor: number; dueDate: string; }>;
       preferences: { theme: 'paper' | 'emerald' | 'midnight'; autoAudio: boolean; audioVoice: string; };
     }
     ```
   - In `app-core.js` lines 290–304, `createDefaultState()` defines:
     ```javascript
     {
       version: 2,
       schemaVersion: 2,
       srs: {},
       history: {},
       favorites: {},
       preferences: { showEnglish: true, speechRate: 0.85, speechRepeat: 1, dailyReviewLimit: 20 }
     }
     ```
   - In `app-core.js` lines 325–345, SRS record fields are `wordId`, `repetition`, `interval`, `ef`, `nextReviewDate`, `lastReviewedDate`, `reviewCount`, `lapses`, `history`.
   - In `app-core.js` line 92, theme is stored in `localStorage.getItem("kalimat_theme")`, NOT inside the state object.

2. **Live Test Execution Results**:
   - Command: `node test.js`
     - Output: `All checks passed.` (Exit code: 0).
   - Command: `node --test tests/corpus.test.js`
     - Output: `11 pass, 0 fail` (Exit code: 0).
   - Command: `node --test tests/corpus_parity.test.js`
     - Output:
       ```
       not ok 1 - website and extension vocabularies stay lexically identical by ID
       Corpus parity mismatch for record 14, field root -> root
       'و ل د' !== 'ت ل د'
       ```
       (Exit code: 1).
   - In `PROJECT.md` lines 21 and 36, the plan states: `Fix test.js:500 (word.html lexicon menu link) and tests/corpus.test.js:131 (Word #24 citation)`.

3. **CSS File Hardcoding in Test Suites**:
   - `test.js` line 484: `const css = fs.readFileSync("revamp.css", "utf8");`
   - `tests/review_ui.test.js` lines 24 and 410:
     `const revampCss = fs.readFileSync(REVAMP_CSS_PATH, "utf8");`
     `for (const [filename, css] of [["style.css", styleCss], ["revamp.css", revampCss]])`

---

## 2. Logic Chain

1. **Step 1 (Schema Incompatibility)**:
   - Observation: `PROJECT.md` lines 58–81 defines `history` as `Array`, `favorites` as `number[]`, `srs` with `easeFactor` and `dueDate`.
   - Inference: Implementing this schema will break all existing user state in `localStorage`, invalidate `tests/migration.test.js` (21 subtests) and `tests/sm2.test.js` (22 subtests), and corrupt the SRS calculation pipeline.
   - Conclusion: The schema contract in `PROJECT.md` must be replaced with the verified `app-core.js` Schema v2 contract.

2. **Step 2 (Defect Targeting)**:
   - Observation: `node test.js` and `tests/corpus.test.js` pass, but `tests/corpus_parity.test.js` fails on Word #14 root mismatch.
   - Inference: `PROJECT.md` is targeting resolved issues and omitting the actual failing test in Milestone M1.
   - Conclusion: Milestone M1 and Feature #1 must be updated to target `tests/corpus_parity.test.js` (Word #14 root parity).

3. **Step 3 (Parallel Worker Seams & File Collisions)**:
   - Observation: Consolidation of `revamp.css` into `style.css` touches files read by test runners (`test.js`, `review_ui.test.js`) and linked in HTML (`index.html`, `word.html`, `sw.js`).
   - Inference: Uncoordinated parallel writes will lead to `ENOENT` test crashes and HTML merge conflicts.
   - Conclusion: Explicit write ownership boundaries must be established before launching parallel implementation agents.

---

## 3. Caveats

- The extension UI tests in `extension/tests/*.test.js` contain 25 failures due to mock DOM properties in the Atlas view; these are scoped to the extension test sandbox and do not affect web app runtime or core web app tests.
- Visual inspection of rendered fonts was performed via code and CSS token analysis; final in-browser rendering across physical devices will be verified during Milestone M5.

---

## 4. Conclusion

**Verdict**: `REQUEST_CHANGES`.

`PROJECT.md` requires 4 specific revisions before dispatching parallel implementation workers:
1. Update Data Model (lines 56–82) with the canonical Schema v2 definition.
2. Update Feature #1 and Milestone M1 to resolve the real `tests/corpus_parity.test.js` failure on Word #14.
3. Add the parallel subagent write ownership matrix.
4. Expand Milestone M4 with explicit Tier 1–4 test suite specifications.

Once these revisions are applied, the project will be ready for zero-collision parallel implementation.

---

## 5. Verification Method

To verify the observations and findings:
1. Run `node --test tests/corpus_parity.test.js` to observe the Word #14 mismatch.
2. Run `node test.js` and `node --test tests/corpus.test.js` to verify they currently pass.
3. Compare `PROJECT.md:58-81` against `app-core.js:290-345` to verify the schema mismatch.
4. Inspect `test.js:484` and `tests/review_ui.test.js:410` to verify hardcoded references to `revamp.css`.
