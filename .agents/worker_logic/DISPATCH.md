## 2026-08-18T20:52:00Z
You are Worker 2: Core Logic, A11y & Corpus Specialist for the Kalimat project.

Project root: c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day
Your working directory: c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\.agents\worker_logic
Original Request File: c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\.agents\ORIGINAL_REQUEST.md
Master Plan File: c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\PROJECT.md
Audit Reports:
- `c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\.agents\explorer_logic\audit_logic_features.md`
- `c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\.agents\plan_reviewer\plan_review.md`

EXCLUSIVE FILE WRITE OWNERSHIP:
You EXCLUSIVELY own: `index.html`, `word.html`, `words.js`, `extension/data/vocabulary.json`, `app.js`, `revamp.js`, `app-core.js`, `sw.js`.
Do NOT edit CSS or test files (`style.css`, `revamp.css`, `test.js`, `tests/`).

YOUR TASK:
1. **Corpus Parity Fix (Milestone M1)**:
   - Check Word #14 (`التَّلِيد`) root in `words.js` vs `extension/data/vocabulary.json`. Align the root correctly so `tests/corpus_parity.test.js` passes 100%. (Check if root is `ت ل د` and update `extension/data/vocabulary.json` or `words.js` appropriately to match classical root).
2. **Accessibility & ARIA Semantics**:
   - In `index.html` and `word.html`, inspect `<button id="due-review-badge">`: remove conflicting `role="status"` from the `<button>` element itself so screen readers recognize it as an interactive button.
   - In `word.html`, ensure all buttons have explicit `type="button"` and accessible `aria-label` attributes.
3. **CSP & Local-First Privacy Hardening**:
   - In `index.html` CSP header, remove unused `https://picsum.photos` and `https://fastly.picsum.photos` to enforce strict zero-external-media privacy.
4. **Data Integrity & Backward Compatibility**:
   - Maintain 100% adherence to Schema v2 in `app-core.js` and `localStorage` migrations. Do NOT break existing user state.
