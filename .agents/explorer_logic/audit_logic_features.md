# Kalimat — In-Depth Logic, State & PWA Capabilities Audit Report
**Agent**: Explorer 2 (Interactive Features & State Logic Specialist)  
**Date**: 2026-08-18  
**Scope**: `app.js`, `app-core.js`, `revamp.js`, `sw.js`, `manifest.webmanifest`, `words.js`, test suites (`test.js`, `tests/*`)

---

## Executive Summary

Kalimat is architected as a **100% zero-dependency, local-first vanilla JavaScript web application and PWA**. The state management, spaced repetition engine, deterministic daily rotation, Arabic text normalization, and offline caching mechanisms are well-engineered with defensive fallbacks.

The audit confirmed:
1. **Deterministic Rotation & Leap Year Stability**: Calendar math correctly converts local date keys (`YYYY-MM-DD`) into UTC epoch day ordinals, guaranteeing invariant 365-day sequential rotation without timezone drift or leap year skew. Midnight rollover is dynamically detected in real-time.
2. **Dual-Tier Audio Playback & Voice Ranking**: Local HTML5 audio for curated pronunciation with seamless fallback to browser Web Speech API. Includes a 10-tier voice scoring heuristic, V8 garbage collection anchoring, and polite ARIA live announcements.
3. **SM-2 Spaced Repetition & History Architecture**: Strict Schema v2 data model with backward-compatible migration from v0/v1, self-healing corrupted state recovery, and 4-tier SM-2 algorithm.
4. **Arabic Linguistic Search & Morphological Lexicon**: Robust multi-facet filter with diacritics stripping, Alef/Ya normalization, morphological roots index, weights, and dual/plural Arabic grammar.
5. **Local-First Privacy & PWA Health**: Zero remote tracking, telemetry, or analytics. Service Worker implements tiered caching (immutable cache-first audio, network-first HTML, stale-while-revalidate static assets).

Two localized defects were identified in the existing test baseline:
- Missing Lexicon Explorer link in `word.html`'s `#app-menu-dropdown` causing `test.js:500` failure.
- Missing attribution punctuation in Word #24 (`words.js:329`) causing `tests/corpus.test.js:127` failure.

---

## 1. Interactive Features & State Logic Audit

### 1.1 Daily Word Flow & Rotation Algorithm
- **Date Key Generation**: `getLocalDateKey(date)` (`app-core.js:64-69`) formats the client's local year, month, and day as `YYYY-MM-DD`. This guarantees that the user's local date determines the word of the day regardless of UTC offsets.
- **Ordinal & Modulo Computation**: `getDailyWordIndex(dateKey, wordCount)` (`app-core.js:71-78`):
  ```js
  const [year, month, day] = dateKey.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  return ((ordinal % wordCount) + wordCount) % wordCount;
  ```
  - **Timezone Robustness**: Using `Date.UTC(year, month - 1, day)` on the parsed local date string converts the local calendar date into an absolute UTC midnight timestamp, avoiding daylight saving time (DST) and local timezone drift.
  - **Leap Year Stability**: Verified across leap years (e.g. 2024-02-28 -> 2024-02-29 -> 2024-03-01). The ordinal increases by exactly 1 every 24 hours.
- **Midnight Rollover**:
  - `startCountdown()` / `updateTimer()` in `app.js:2343-2362` runs a 1000ms tick.
  - When `Core.getLocalDateKey(new Date()) !== activeDateKey`, it immediately updates `activeDateKey` and calls `renderTodayWord()`, resetting the daily word and streak UI without requiring user reload.
  - The countdown timer calculates `tomorrow.setHours(24, 0, 0, 0) - now` and displays `HH:MM:SS`.
- **Deep-Linking & Archive Preview**:
  - `resolveWordSelection()` (`app-core.js:274-288`) and `parseWordIdFromQuery()` (`app-core.js:242-272`) allow browsing past words via `word.html?id=N` or `word.html?id=N&date=YYYY-MM-DD`.
  - When viewing an archived word, `app.js:242-248` sets `archivePreviewNote.hidden = false` ("أنت تستعرض كلمة من مخزونك بتاريخ..."), shows `btnReturnToday`, and updates date label from "اليوم" to "التاريخ".

---

### 1.2 Pronunciation Audio Playback Mechanism
- **Two-Tier Fallback Architecture**:
  1. **Tier 1 (Curated Human Audio)**: `Core.getHumanAudioUrl(item, type)` (`app-core.js:700-730`) resolves `assets/audio/words/${id}.mp3` and `assets/audio/examples/${id}.mp3`. `playAudioSource()` (`app.js:433-546`) plays through standard HTML5 `Audio` with an 8-second timeout guard.
  2. **Tier 2 (Web Speech API)**: If audio files are missing, network fails, or audio fails, `speakText()` (`app.js:713-940`) falls back to `window.speechSynthesis`.
- **Text Preprocessing**:
  - `Core.extractSpokenText(quote)` (`app-core.js:450-473`) removes attribution dashes (`—`), poetic brackets, footnotes, and Quranic recitation marks (`\u06D6-\u06ED`), leaving clean speakable Arabic.
- **Arabic Voice Ranking Engine**:
  - `scoreArabicVoice()` & `filterArabicVoices()` (`app-core.js:627-698`):
    - Base score: 100
    - Regional bonuses: +30 for Modern Standard / Saudi (`ar-SA`, `ar-001`), +28 for `ar-XA`, +25 for `ar-EG`/`ar-AE`.
    - Engine bonuses: +60 for Neural/Natural, +50 for Premium/Studio/WaveNet/Neural2.
    - Name heuristics: +35 for known high-quality Arabic voices (*Naayf, Hoda, Shakir, Fatima, Hamed, Salma, Zariyah, Zeina, Maged, Tarik, Laila, Mariam, Siri*), +30 for Google, +20 for Samsung.
- **Chromium V8 Garbage Collection Bug Prevention**:
  - In Chromium/V8, `SpeechSynthesisUtterance` instances are liable to premature garbage collection during long playback, silently dropping `onend`/`onerror` handlers.
  - `app.js:861, 903` and `app-core.js:1950` explicitly anchor the active utterance via `window._activeUtterance = utterance;` until `onend` or `onerror` fires.
- **Multi-State Audio Controls UI**:
  - `setButtonPlaybackState(buttonEl, state)` (`app.js:942-989`) manages 4 distinct states:
    - `loading`: Sets `aria-busy="true"`, `aria-pressed="false"`, label "جارٍ تحميل النطق".
    - `buffering`: Sets `aria-busy="true"`, `aria-pressed="true"`, label "جارٍ تجهيز النطق".
    - `speaking`: Sets `aria-busy="false"`, `aria-pressed="true"`, label "إيقاف النطق", waveform icon `#i-waveform`.
    - `idle`: Sets `aria-busy="false"`, `aria-pressed="false"`, default volume icon `#i-volume-high`.
- **Accessibility & Live Announcer**:
  - ARIA Live Polite container (`#audio-announcer`) dispatches screen reader updates on playback start ("استماع لنطق كلمة «...»") and status changes.
  - Audio speed (0.70x, 0.85x, 1.0x) and repetition (1x, 3x for memorization) settings persist in `preferences`.

---

### 1.3 Learning History, Bookmarking & Spaced Repetition (SM-2)
- **Streak Calculation**:
  - `calculateStreak(historyOrDates, todayKey)` (`app-core.js:80-172`):
    - Converts unique history dates to UTC day ordinals.
    - Counts continuous backward chain starting from today (if visited) or yesterday (grace day if today is still active).
    - Computes `currentStreak`, `maxStreak`, and `isTodayVisited`.
    - Formats with classical Arabic grammar rules (`formatStreakText`: 0 -> "لا يوجد تتابع بعد", 1 -> "يوم واحد", 2 -> "يومان", 3-10 -> "N أيام", 11+ -> "N يوماً").
- **SM-2 Algorithm Implementation**:
  - `calculateNextReview(item, rating, reviewDateKey)` (`app-core.js:832-905`):
    - Ratings: `again` (grade 1), `hard` (grade 3), `good` (grade 4), `easy` (grade 5).
    - Easiness Factor: $EF' = \max(1.3, EF + (0.1 - (5 - q) \cdot (0.08 + (5 - q) \cdot 0.02)))$.
    - Interval:
      - Lapse ($q < 3$): Repetition resets to 0, interval resets to 1 day, lapses count increments.
      - Success ($q \ge 3$): Rep 0 -> 1 day, Rep 1 -> 6 days, Rep $\ge 2$ -> $\text{round}(\text{interval} \cdot EF')$.
    - History bounded at last 50 entries to conserve storage.
- **Queue Prioritization & Session Caps**:
  - `getDueReviewWords(state, wordsList, dateKey, limit)` (`app-core.js:1111-1188`):
    - Filters words where `nextReviewDate <= todayKey`.
    - Sorts by: (1) Days overdue desc, (2) Interval asc, (3) EF asc, (4) Repetition asc, (5) Word ID asc.
    - Caps active session to `preferences.dailyReviewLimit` (default: 20).
- **Interactive Review Modal (`practice-dialog`)**:
  - Accessible dialog (`practice-dialog`) with progress bar (`role="progressbar"`), 3D flip interaction (`#card-front-flip` / `Space` / `Enter`), audio buttons front & back, rating buttons (`1-4` / `١-٤`), and full focus management / restoration.
  - Dual badge counters on homepage and word-page stay dynamically synchronized with the SM-2 due queue.

---

### 1.4 Arabic Text Normalization & Lexicon Search
- **Normalization Strategy (`normalizeArabicText` in `app-core.js:567-575`)**:
  ```js
  text.replace(/\u0640/g, "")                         // Tatweel
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // Diacritics & Quranic marks
      .replace(/[أإآٱ]/g, "ا")                         // Alef variants
      .replace(/ى/g, "ي")                             // Alif Maqsura
      .trim();
  ```
- **Lexicon Search (`searchLexicon` in `app-core.js:577-602`)**:
  - Matches across normalized headword, compact root (spaces stripped), full root, morphological weight, category, meaning, and English translation.
- **Lexicon Explorer (`initLexiconExplorer` in `app-core.js:1414-1978`)**:
  - Reactive multi-facet filter combining query, category chips (`getLexiconCategories`), roots dropdown (`getLexiconRoots`), weights dropdown (`getLexiconWeights`), and Arabic letter bar (`getLexiconLetters`).
  - Strict Dual/Plural grammar counter: `formatLexiconCountText(count, total)` produces "عرض لفظ واحد", "عرض لفظين", "عرض ٣ ألفاظ", "عرض ١١ لفظاً".

---

## 2. Data & State Architecture Audit

### 2.1 Storage Keys & Schemas
- **Keys**:
  - `arabic_words_state`: Main application state (JSON).
  - `kalimat_theme`: Current theme (`"paper"`, `"emerald"`, `"midnight"`).
- **Schema Version 2 Contract (`createDefaultState` in `app-core.js:290-304`)**:
  ```json
  {
    "version": 2,
    "schemaVersion": 2,
    "srs": {
      "1": {
        "wordId": 1,
        "repetition": 1,
        "interval": 6,
        "ef": 2.5,
        "nextReviewDate": "2026-08-24",
        "lastReviewedDate": "2026-08-18",
        "reviewCount": 1,
        "lapses": 0,
        "history": [{ "date": "2026-08-18", "grade": 4, "rating": "good", "interval": 1, "ef": 2.5 }]
      }
    },
    "history": {
      "1": { "firstSeen": "2026-08-18" }
    },
    "favorites": {
      "1": true
    },
    "preferences": {
      "showEnglish": true,
      "speechRate": 0.85,
      "speechRepeat": 1,
      "dailyReviewLimit": 20
    }
  }
  ```

### 2.2 Migration Safety & Self-Healing
- **Multi-Version Migration (`migrateState` in `app-core.js:930-1109`)**:
  - Handles legacy v0 format (`learnedWords: [{ id: 1 }, ...]`).
  - Handles Schema v1 format (`schemaVersion: 1`, array/object favorites, history).
  - Handles Schema v2 format with self-healing:
    - If a word exists in `srs` but missing in `history`, creates `{ firstSeen: lastReviewedDate || nextReviewDate }`.
    - If a word exists in `history` but missing in `srs`, creates default SRS record with `ef = 2.5`.
    - Clamps invalid bounds: `ef = Math.max(1.3, ...)`, `interval = Math.max(0, ...)`, `dailyReviewLimit` 1..100.
    - Strips orphan IDs when `validIds` set is provided.
- **Storage Resilience**:
  - `inspectStoredState()` (`app-core.js:399-405`) safely catches parse errors or missing storage in incognito/restricted mode.
  - If persistence fails, sets `persistenceBlocked = true`, unhides `#storage-warning` banner, allows session execution in memory, and provides `#btn-reset-storage` to wipe corrupted data.

### 2.3 Import / Export Resilience
- **JSON Backup (`parseBackup` / `serializeBackup`)**:
  - File size bounded to 1MB (`MAX_BACKUP_BYTES = 1024 * 1024`).
  - Rejects malformed JSON and unsupported schema versions.
  - `mergeStates()` combines existing and imported states: retains earliest `firstSeen`, true favorites, and most advanced SRS review dates.
- **Anki CSV Deck (`serializeAnkiCSV` in `app-core.js:191-236`)**:
  - Generates RFC 4180 CSV with UTF-8 BOM (`\uFEFF`) and headers `Word,Root,Weight,Vocalization,Meaning,English Meaning,Example`.
  - Quotes and escapes all fields (`"foo""bar"`).

### 2.4 Local-First Privacy Audit
- **Telemetry / Remote Tracking**: Verified **0 trackers, 0 analytics beacons, 0 remote API calls, 0 third-party telemetry scripts**.
- **External Connections**:
  - Limited strictly to Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`).
  - `getNaturalAudioUrl()` explicitly enforces local-first policy (`return ""`).
- **Content-Security-Policy (CSP)**:
  - `word.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'self'; manifest-src 'self'`
  - `index.html`: Contains unused `picsum.photos` in `img-src` which should be pruned to match `word.html`.

---

## 3. PWA & Offline Health Audit

### 3.1 Service Worker (`sw.js`)
- **Cache Strategy Breakdown**:
  | Resource Type | Cache Target | Strategy | Invalidation / Revalidation |
  |---|---|---|---|
  | Audio (`.mp3`, `/assets/audio/`) | `kalimat-audio-v1` | **Cache-First (Immutable)** | Cached on-demand; no background revalidation |
  | Navigation (`text/html`) | `kalimat-static-v1.3` | **Network-First** | Falls back to cached `word.html` / `index.html` |
  | Static Assets (CSS, JS, Fonts) | `kalimat-static-v1.3` | **Stale-While-Revalidate** | Serves cached, updates in background |
- **Cache Invalidation**:
  - In `activate` event (`sw.js:41-51`), caches not matching `STATIC_CACHE_NAME` (`kalimat-static-v1.3`) or `AUDIO_CACHE_NAME` (`kalimat-audio-v1`) are deleted immediately.
- **Pre-cached Inventory**:
  - Covers 100% of core assets: `./`, `./index.html`, `./word.html`, `./style.css`, `./revamp.css`, `./app-core.js`, `./revamp.js`, `./words.js`, `./app.js`, `./manifest.webmanifest`, `./assets/icons/icon-192.png`, `./assets/icons/icon-512.png`.

### 3.2 Manifest Configuration (`manifest.webmanifest`)
- `name`: "كَلِمات | العربية الفصحى", `short_name`: "كَلِمات"
- `start_url`: "./index.html", `scope`: "./"
- `display`: "standalone", `orientation`: "any"
- `dir`: "rtl", `lang`: "ar"
- `theme_color`: "#14211b", `background_color`: "#0f172a"
- `icons`: 192x192 and 512x512 with `purpose: "any maskable"` present in `assets/icons/`.

---

## 4. Discovered Defects & Recommended Fixes

### Defect 1: Missing Lexicon Explorer Link in `word.html` Dropdown Menu
- **Observation**: `test.js:500` fails assertion:
  ```js
  assert.match(wordPage, /<div class="app-menu-dropdown(?:\s+word-menu-dropdown)?" id="app-menu-dropdown" hidden>[\s\S]*?<a class="nav-explorer-link" href="index\.html#lexicon-explorer"[^>]*>[\s\S]*?<use href="#i-search"\/>[\s\S]*?معجم الجذور[\s\S]*?<\/a>/);
  ```
- **Root Cause**: `word.html` line 126 (`#app-menu-dropdown`) lacks the direct navigation link to the lexicon explorer that exists in `index.html`.
- **Proposed Solution**: Insert the link inside `word.html`'s `#app-menu-dropdown`:
  ```html
  <a class="nav-explorer-link" href="index.html#lexicon-explorer" title="معجم الجذور والأوزان"><svg class="icon"><use href="#i-search"/></svg> <span>معجم الجذور</span></a>
  ```

### Defect 2: Corpus Quote Attribution Missing in Word #24 (`words.js`)
- **Observation**: `tests/corpus.test.js:127` fails on Word #24 (الأَرِيج):
  `Word #24 example quote must have an attribution dash or scripture brackets: 'فاحَ أَرِيجُ الياسمين في الفناء بعد أن سُقيت الأزهار.'`
- **Root Cause**: Word #24's `example` lacks an attribution dash (`—`) or classical citation source.
- **Proposed Solution**: Update `words.js:329` to append proper classical attribution (e.g. `— مَثَلٌ سائر` or classical poet).

### Defect 3: CSP Cleanup in `index.html`
- **Observation**: `index.html:9` includes `https://picsum.photos https://fastly.picsum.photos` in `img-src`.
- **Root Cause**: Leftover from early prototyping; no picsum images exist in the codebase.
- **Proposed Solution**: Clean up to `img-src 'self' data;` to match `word.html`.

---

## 5. Audit Matrix & Quality Checklist

| Audit Dimension | Status | Notes |
|---|---|---|
| Zero External Frameworks | **PASSED** | 100% pure vanilla JS, HTML5, CSS3 |
| Local-First Privacy | **PASSED** | 0 tracking / analytics / telemetry; CSP enforced |
| Deterministic Rotation | **PASSED** | Local date -> UTC epoch ordinal -> modulo 365 |
| Leap Year & Midnight Rollover | **PASSED** | Real-time interval detection & instant re-render |
| Dual-Tier Audio Playback | **PASSED** | Human MP3 -> Ranked Web Speech fallback |
| V8 GC Bug Immunity | **PASSED** | Active utterance reference anchored to `window` |
| SM-2 Spaced Repetition Engine | **PASSED** | Standard 4-tier EF formula, bounded log, due queue sorting |
| Schema Migration & Self-Healing | **PASSED** | v0/v1 -> v2 automatic migration, repair on corrupted data |
| Arabic Text Normalization | **PASSED** | Diacritics, Tatweel, Alef, and Ya normalized |
| Dual/Plural Grammar Rules | **PASSED** | 1, 2, 3-10, 11+ handled across streaks & lexicon counts |
| Keyboard Accessibility & Focus Trap | **PASSED** | Dialog focus trapping, shortcut navigation, focus restore |
| Offline PWA & Service Worker | **PASSED** | Full pre-cached offline bundle, tiered caching strategies |
