# Handoff Report — Explorer 2: Interactive Features & State Logic Specialist

**Target**: Orchestrator / Implementation Team  
**Date**: 2026-08-18  
**Scope**: Full logic, state management, audio playback, spaced repetition, search, storage, and PWA capabilities audit.  
**Deliverable Document**: `.agents/explorer_logic/audit_logic_features.md`

---

## 1. Observation

### Codebase Inspection Facts:
1. **Deterministic Calendar Rotation**:
   - `app-core.js:64-69`: `getLocalDateKey(date)` extracts `${year}-${month}-${day}` from client's local date.
   - `app-core.js:71-78`: `getDailyWordIndex(dateKey, wordCount)` computes UTC epoch day ordinal `Math.floor(Date.UTC(year, month - 1, day) / 86400000)` and takes modulo `((ordinal % wordCount) + wordCount) % wordCount`.
   - `app.js:2348-2354`: `updateTimer()` checks `dateKey !== activeDateKey` every second and immediately invokes `renderTodayWord()` on midnight rollover.
2. **Dual-Tier Audio Playback & Voice Ranking**:
   - `app-core.js:700-730`: `getHumanAudioUrl` resolves local audio paths (`assets/audio/words/${id}.mp3`, `assets/audio/examples/${id}.mp3`).
   - `app.js:777-802`: `speakText` attempts HTML5 `Audio` first, then falls back seamlessly to `window.speechSynthesis`.
   - `app-core.js:627-698`: `scoreArabicVoice` implements a 10-tier scoring heuristic prioritizing Saudi/MSA dialects (`ar-SA`, `ar-001`), neural/natural engines, and known natural voice names.
   - `app.js:861, 903` & `app-core.js:1950`: `window._activeUtterance = utterance;` prevents premature Chromium V8 garbage collection.
   - `app.js:942-989`: `setButtonPlaybackState` provides multi-state visual and ARIA attributes (`idle`, `loading`, `buffering`, `speaking`).
3. **State Management & SM-2 Spaced Repetition**:
   - `app-core.js:290-304`: Schema v2 contract with `srs`, `history`, `favorites`, and `preferences`.
   - `app-core.js:832-905`: Standard SM-2 formula with 4-tier ratings (`again`, `hard`, `good`, `easy`), $EF \ge 1.3$, lapse recovery, and bounded 50-entry history log.
   - `app-core.js:930-1109`: Backward-compatible migration from v0 (`learnedWords`) and v1 to v2 with self-healing of corrupted fields.
   - `app.js:1711-2144`: Full accessible modal workflow (`practice-dialog`) with progress bar, 3D flip card, keyboard shortcuts, and session statistics.
4. **Search, Diacritics & Morphological Lexicon**:
   - `app-core.js:567-575`: `normalizeArabicText` removes Tatweel (`\u0640`), Tashkeel (`[\u064B-\u065F\u0670\u06D6-\u06ED]`), normalizes Alef variants (`[أإآٱ]` -> `ا`), and Alif Maqsura (`ى` -> `ي`).
   - `app-core.js:1414-1978`: `initLexiconExplorer` powers multi-facet reactive filtering across queries, categories, roots, weights, and letter bar.
5. **Privacy & PWA Health**:
   - Zero remote tracking, analytics, or telemetry.
   - `sw.js:1-120`: Service Worker provides cache-first for audio, network-first for HTML navigation, and stale-while-revalidate for static assets.
   - `manifest.webmanifest`: Complete standalone PWA configuration with 192x192 and 512x512 maskable icons.

### Automated Test Suite Execution Results:
- `node tests/corpus_parity.test.js`: **PASSED** (1/1 suites)
- `node tests/lexicon.test.js`: **PASSED** (7/7 suites)
- `node tests/migration.test.js`: **PASSED** (8/8 suites, 21 subtests)
- `node tests/review_ui.test.js`: **PASSED** (11/11 suites)
- `node tests/sm2.test.js`: **PASSED** (15/15 suites, 22 subtests)
- `node test.js`: **FAILED** at line 500 (`assert.match(wordPage, /...<a class="nav-explorer-link" href="index\.html#lexicon-explorer".../);` - missing lexicon explorer link in `word.html` `#app-menu-dropdown`).
- `node tests/corpus.test.js`: **FAILED** at subtest 6 (`tests/corpus.test.js:127` - Word #24 in `words.js:329` lacks attribution dash or scripture brackets).

---

## 2. Logic Chain

1. **Deterministic Calendar Rotation**:
   - *Observation*: Local date string `YYYY-MM-DD` is parsed into year, month-1, day, and passed to `Date.UTC(...) / 86400000`.
   - *Reasoning*: Because `Date.UTC` converts calendar dates into absolute UTC midnight epoch days, local daylight saving shifts do not alter the day integer. Modulo 365 guarantees consistent cycling indefinitely across leap years.
   - *Deduction*: The daily word rotation algorithm is mathematically sound and timezone-immune.

2. **Dual-Tier Audio Playback & V8 GC Resilience**:
   - *Observation*: `speakText` tries local MP3 files first, falls back to Web Speech API, anchors `_activeUtterance`, and sets 4 UI playback states.
   - *Reasoning*: Local human audio provides optimal pronunciation when available; SpeechSynthesis provides universal fallback; anchoring the utterance prevents known Chromium garbage collection stalls; multi-state UI satisfies WCAG 2.1 AA screen reader and visual feedback standards.
   - *Deduction*: Audio engine is robust, accessible, and offline-capable.

3. **SM-2 State Integrity & Migration**:
   - *Observation*: `migrateState` validates and clamps all properties, synthesizes missing SRS records for history items, and handles v0/v1 structures cleanly.
   - *Reasoning*: Stored user progress cannot be corrupted or lost when switching versions or importing older JSON backups.
   - *Deduction*: Data architecture adheres to zero-data-loss and backward compatibility standards.

4. **Identified Defects**:
   - *Observation*: `word.html` does not include `<a class="nav-explorer-link" href="index.html#lexicon-explorer"...>` in `#app-menu-dropdown`, causing `test.js:500` to fail.
   - *Observation*: `words.js` entry #24 lacks an attribution dash `—`, causing `tests/corpus.test.js:127` to fail.
   - *Observation*: `index.html` CSP allows unused `picsum.photos` domain.
   - *Reasoning*: These 3 defects are isolated and easily remediable during implementation without architectural churn.

---

## 3. Caveats

- **Audio Asset Availability**: Physical MP3 files in `assets/audio/` are not currently bundled in the repository, so the playback engine operates in Web Speech API fallback mode by default. The Service Worker and audio engine are ready to cache and play them once MP3 assets are added.
- **Browser TTS Differences**: SpeechSynthesis voice quality depends on the user's operating system (iOS/macOS Siri voices, Android/Chrome Google Natural voices, Windows Microsoft Naayf/Hoda). The voice scoring engine selects the best available voice automatically.

---

## 4. Conclusion

Kalimat's interactive features, state management, Arabic linguistics, and offline PWA architecture are robust, zero-dependency, and local-first compliant.

**Actionable Recommendations for Implementation Phase**:
1. **Fix `word.html` Menu Link**: Add `<a class="nav-explorer-link" href="index.html#lexicon-explorer" title="معجم الجذور والأوزان"><svg class="icon"><use href="#i-search"/></svg> <span>معجم الجذور</span></a>` to `#app-menu-dropdown` in `word.html`.
2. **Fix Word #24 Citation**: Update Word #24 in `words.js:329` to append a classical attribution citation (e.g. `— مَثَلٌ سائر`).
3. **Harden `index.html` CSP**: Remove `https://picsum.photos https://fastly.picsum.photos` from `img-src` in `index.html:9`.

---

## 5. Verification Method

To independently verify the findings in this report:

1. **Run Full Test Suite**:
   ```bash
   node tests/corpus.test.js
   node tests/corpus_parity.test.js
   node tests/lexicon.test.js
   node tests/migration.test.js
   node tests/review_ui.test.js
   node tests/sm2.test.js
   node test.js
   ```
2. **Inspect Files**:
   - Check `app-core.js:71-78` (`getDailyWordIndex`), `app-core.js:567-575` (`normalizeArabicText`), `app-core.js:832-905` (`calculateNextReview`).
   - Check `app.js:433-562` (`attemptAudioPlayback`), `app.js:1711-2144` (`startSpacedRepetitionReview`), `app.js:2343-2362` (`startCountdown`).
   - Check `sw.js:1-120` (`STATIC_ASSETS`, `isAudioRequest`, caching strategies).
   - Check `manifest.webmanifest`.
