# 01 — Project overview

**Kalimat (كَلِمات)** — a local-first Arabic learning experience: one word per day, read slowly,
with SM-2 spaced-repetition review. Zero build step, zero dependencies, zero telemetry.

## Two surfaces

1. **Website (PWA)** — `index.html` (landing + lexicon explorer) and `word.html` (daily word page).
   State in `localStorage` under `arabic_words_state` (schema v2), theme in `kalimat_theme`.
2. **Browser extension (MV3, Chrome + Firefox)** — under `extension/`: popup (daily word + review),
   atlas page (corpus explorer + review), background service worker. Profile in `chrome.storage.local`.
   The two surfaces do NOT sync with each other (documented boundary).

## Key files (web)

| File | Role |
|---|---|
| `words.js` | 365-word corpus as a global `WORDS_DB` (~361KB, loaded eagerly) |
| `app-core.js` | Headless engine: date math/word rotation, SM-2 (`extension/shared/review-policy.js` is the single shared SM-2 source), state migration/validation, search, CSV export, audio probing. Exported as `KalimatCore`. |
| `app.js` | word.html view controller: render, history, speech/audio, share/export/import, review flow, onboarding, install prompt, reminders |
| `web-ui.js` | Lexicon explorer controller (`initLexiconExplorer`) + theme controller |
| `revamp.js` | index.html controller: SW registration, theme, streak/due badges, hero countdown, lexicon init |
| `style.css` | **The single stylesheet** (revamp.css was merged into it and deleted on this branch) |
| `sw.js` | Service worker: precache shell v1.6, SWR for same-origin static, network-first HTML, capped FIFO audio cache |
| `server.py` | Dev server (UTF-8 headers, Host allowlist, nosniff, loopback only) |

## Key files (extension)

| File | Role |
|---|---|
| `extension/background.js` | Service worker: assignment/review/settings messages, reminders (one-shot alarms), omnibox, context menu, due-badge |
| `extension/shared/*.js` | Domain modules: `state.js` (profile validation), `review-policy.js` (SM-2, shared WITH website), `vocabulary.js`, `selector.js`, `streak.js`, `export.js`, `lookup.js` (permission-gated Wiktionary, Chrome-only), `theme.js/css`, `date.js`, `speech.js` |
| `extension/popup/`, `extension/atlas/` | UI pages |
| `extension/dist/{chrome,firefox}/` | Packaged copies — MUST stay byte-identical to source; enforced by `tests/package.test.js` (sha256). Rebuild with `tools/package.ps1` after editing extension source. |

## Invariants to preserve

- Local-first privacy: no analytics, no new network origins (CSP meta is strict: `script-src 'self'`, no unsafe-inline for scripts).
- No build step, no dependencies, vanilla ES2022.
- RTL: use CSS logical properties; Arabic text must never get positive `letter-spacing`; display headings ≥1.35 line-height.
- `.review-release/`, `.agents/`, `.superpowers/`, `.codex/` are snapshot/scratch dirs — never edit.
