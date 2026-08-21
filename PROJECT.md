# Project: Kalimat (Arabic Word of the Day) — Master Plan & Architecture

## Architecture
- **Philosophy**: Pure Vanilla Zero-Dependency (Vanilla HTML5, CSS3, ES2022). Local-First Privacy (zero analytics, zero external network telemetry, offline-capable PWA).
- **Core Seams**:
  1. **Headless Engine (`app-core.js`)**: Side-effect-free business logic (deterministic UTC date math & word rotation, SM-2 spaced repetition with Schema v2, text normalization, search/filtering, human audio resolution & Web Speech API voice scoring).
  2. **View Controllers**:
     - `revamp.js`: Primary SPA view controller for `index.html` (Hero daily word, reading accordion, root lexicon explorer, SM-2 review modal, history modal, keyboard shortcuts, theme switching).
     - `app.js`: Dedicated word permalink view controller for `word.html` (Deep-link rendering, copy/share, audio playback, menu navigation).
  3. **Styling System (`style.css`)**: Single merged stylesheet, fully responsive with logical RTL properties, WCAG 2.1 AA/AAA contrast, and authentic Arabic typography hierarchy.
  4. **PWA Service Worker (`sw.js`) & Manifest (`manifest.webmanifest`)**: Cache-first for audio/fonts, network-first for HTML, stale-while-revalidate for CSS/JS.
  5. **Verification Harness (`test.js`, `tests/*.test.js`)**: Comprehensive unit and integration test runner validating corpus integrity, SM-2 math, state migrations, lexicon filters, and DOM contracts.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Corpus Parity Fix | Fix Word #14 (`التَّلِيد`) root parity (`ت ل د`) between `words.js` and `extension/data/vocabulary.json` to resolve `tests/corpus_parity.test.js` | M1: Baseline Integrity | Plan Review |
| 2 | Arabic Typography Polish | Remove `letter-spacing` and `text-transform: uppercase` on Arabic text; increase heading `line-height` to `1.35` for Tashkeel clarity | M2: Design & Typography | Survey |
| 3 | WCAG Contrast & Borders | Introduce `--accent-border` (contrast ratio >= 3:1 on light paper theme) for `.example-panel`, `.practice-feedback`, `.lexicon-card-example` | M2: Design & Typography | Survey |
| 4 | RTL Logical Properties | Convert remaining physical properties (`left`, `right`, `padding-right`) to logical CSS properties (`inset-inline`, `padding-inline`) | M2: Design & Typography | Survey |
| 5 | A11y & ARIA Polish | Fix `role="status"` on `<button id="due-review-badge">`, add `:focus-visible` rings on search inputs, expand mobile tap targets to >= 44px | M3: Logic, A11y & PWA | Survey |
| 6 | CSP & Privacy Hardening | Remove unused `picsum.photos` from `index.html` CSP header, verify 100% offline local-first privacy | M3: Logic, A11y & PWA | Survey |
| 7 | Test Suite Expansion | Add Tier 1-4 comprehensive automated tests in `tests/` covering word rotation, audio scoring, theme persistence, and RTL layout contracts | M4: Test Suite & Hardening | Survey |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Baseline Integrity | Resolve `tests/corpus_parity.test.js` failure on Word #14 root parity | None | PLANNED |
| M2 | Visual, Typography & Styling | Polish Arabic typography, fix WCAG contrast, adopt RTL logical properties in `style.css` and `revamp.css` | M1 | PLANNED |
| M3 | Logic, Accessibility & PWA Hardening | Refine ARIA semantics, mobile tap targets (>=44px), search focus states, CSP tightening | M2 | PLANNED |
| M4 | Comprehensive E2E & Tier 1-4 Test Suite | Expand unit & integration test coverage across all core functions, verify zero regression | M3 | PLANNED |
| M5 | Adversarial Audit & Final Gate | Multi-reviewer approval, challenger verification, forensic integrity audit | M4 | PLANNED |

---

## Parallel Worker Write Ownership Matrix

To prevent file collision and race conditions during parallel implementation:

| Worker | Subsystem | Owned Files | Read-Only Files |
|--------|-----------|-------------|-----------------|
| **Worker 1 (Design/Styling)** | Typography, Layout, Themes, RTL, Contrast | `style.css`, `revamp.css` | `index.html`, `word.html`, `test.js` |
| **Worker 2 (Core/Logic/PWA)** | A11y, ARIA, Modals, Word Parity, CSP | `index.html`, `word.html`, `words.js`, `extension/data/vocabulary.json`, `app.js`, `revamp.js`, `app-core.js`, `sw.js` | `style.css`, `revamp.css` |
| **Worker 3 (Test Suite)** | Integration & Unit Tests (Tiers 1-4) | `test.js`, `tests/*.test.js`, `tests/tier_tests.test.js` | All application files |

---

## Interface Contracts & Data Models

### Canonical LocalStorage Schema v2 (`app-core.js`)
```javascript
// State stored in localStorage under 'arabic_words_state'
{
  version: 2,
  schemaVersion: 2,
  srs: {
    // [wordId: string]: SRSRecord
    "1": {
      wordId: 1,
      repetition: 1,
      interval: 1,
      ef: 2.5,
      nextReviewDate: "YYYY-MM-DD",
      lastReviewedDate: "YYYY-MM-DD",
      reviewCount: 1,
      lapses: 0,
      history: []
    }
  },
  history: {
    // [wordId: string]: string (timestamp)
    "1": "2026-08-18T20:00:00.000Z"
  },
  favorites: {
    // [wordId: string]: boolean
    "1": true
  },
  preferences: {
    showEnglish: true,
    speechRate: 0.85,
    speechRepeat: 1,
    dailyReviewLimit: 20
  }
}
// Theme stored separately under 'kalimat_theme': "paper" | "emerald" | "midnight"
```

### Navigation & Deep-Links (`index.html` ↔ `word.html`)
- `word.html` dropdown menu MUST include:
  ```html
  <a class="nav-explorer-link" href="index.html#lexicon-explorer" title="معجم الجذور والأوزان">
    <svg class="icon"><use href="#i-search"/></svg>
    <span>معجم الجذور</span>
  </a>
  ```

---

## Tier 1-4 Test Suite Specification (Milestone M4)
- **Tier 1 (Feature Coverage)**: Happy path tests for daily word calculation, audio scoring heuristic, theme persistence, lexicon query matching, bookmark toggling.
- **Tier 2 (Boundary & Corner Cases)**: Leap day rotation (Feb 29), empty search inputs, diacritics-heavy queries, corrupt `localStorage` recovery, speech API failure fallback.
- **Tier 3 (Cross-Feature Combinations)**: Bookmark in lexicon explorer reflecting in review queue, theme change persisting across page reloads and modals.
- **Tier 4 (Real-World Application Scenarios)**: Multi-day simulated review cycle with SM-2 spaced repetition state transitions, offline service worker asset caching, and export/import round-trip.
