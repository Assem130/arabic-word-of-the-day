# 03 — Plan and locked decisions

Plan file (committed): `docs/superpowers/plans/2026-08-21-kalimat-nine-plus.md`.
Scope: **all HIGH + MED audit findings** (~24 fixes) plus cheap LOWs riding along.

## User-locked decisions (ask before changing)

1. **Scope** = all HIGH + MED (not just top-5, not every LOW).
2. **Landing language** = small English layer (tagline + 3-step how-it-works), NOT full i18n; Arabic-first identity preserved.
3. **Phantom audio** = probe-and-remember (HEAD-probe once, cache result in `localStorage["kalimat_audio_probe"]`, 7-day TTL on negatives). NOT removed, NOT real audio shipped.
4. **CSS consolidation** = merge revamp.css into style.css and DELETE revamp.css (not an override layer).
5. **Deferred by user-approved plan**: words.js corpus splitting, background copyProfile refactor, streak/vocabularyIndex/practice-modal dedup, quiz-engine UI wiring.

## Task list (all COMPLETE)

| # | Task | Commit(s) |
|---|---|---|
| T1 | CSS merge + delete revamp.css + typography/RTL/tap-target repair | bc2ae40, 396c175, a8c26d0 |
| T2 | Scripts → `<head defer>`, SW precache fixes, SWR strategy, canonical nav cache, audio FIFO cap 60, visibility-gated countdown | 72ef5cf |
| T3 | Self-host Amiri/Outfit woff2 + preload + tightened CSP | 971f574 |
| T4 | Security: innerHTML→DOM APIs ×3, streak import validation, CSV formula guard web+ext, server.py Host check + nosniff | 5bc65cd |
| T5 | Audio probe-and-remember (`KalimatCore.isAudioKnownAbsent` / `updateAudioProbe`) | e557bb9 |
| T6 | State efficiency: save only on change, review-stats identity cache, lazy history rebuild, 150ms search debounce | f7d6fe7 (+19b3c5d restore) |
| T7 | Search perf: WeakMap-memoized normalized keys (web+ext), result caps (web 60 w/ Arabic hint; atlas 100 query-only) | b18995b |
| T8 | Landing loop strip (streak/due/countdown), English tagline, how-it-works, OG/Twitter meta, i-flame/i-bolt sprite icons | 09268e7 |
| T9 | Onboarding dialog, beforeinstallprompt button, opt-in daily Notification reminder | d213122 |
| T10 | Tab roving-tabindex ARIA, max-streak display, history stats row, completion banner + review-all | 2bdcb62 |
| T11 | Atlas paint-before-hydrate, badge refresh on startup/install/alarm-tick, popup h1 tracking fix, dist rebuilt | dc580cf |
| T12 | Verification sweep + final whole-branch review + follow-up commit | c0dbab9 |

## Merge mechanics used for the CSS merge (reproducible recipe)

Positional block-level zip of style.css/revamp.css keyed on normalized selector text; revamp's version
won every conflict (it loaded last and ruled the cascade); unconsumed revamp-only blocks appended at
end. Result verified: zero visual change, all 36 diverged selectors resolved to revamp values.
