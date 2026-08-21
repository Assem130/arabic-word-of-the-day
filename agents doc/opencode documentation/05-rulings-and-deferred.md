# 05 — Rulings made on the human's behalf + deferred backlog

Per SDD protocol, every judgment call is recorded. If any of these are wrong, rework is visible and cheap.

## Rulings (what / why / cost-if-wrong)

1. **Midnight theme keeps per-element overrides** (consolidated + `ponytail:` comment) instead of full
   surface-token rewrite — base rules hardcode paper-theme rgba everywhere; rewriting risks visual
   regressions across 3 themes for zero visual gain. Cost: a 4th theme requires token migration first.
   Dead surface tokens were later removed (c0dbab9); reintroduce when migrating.
2. **SDD process deviation** — controller implemented directly after the general-agent seat failed
   twice; explore agents reviewed T1 + final branch. Cost: less isolation than the skill intends.
3. **Fonts served via SWR, not precache** — saves ~305KB install weight. Cost: first-ever-offline
   visit falls back to serif fonts.
4. **Audio probe = synchronous map check + background HEAD** — keeps click→play path synchronous
   (tests pin it). Cost: one extra request per unknown URL per 7-day TTL window.
5. **No atlas search debounce** — packaging contract bans timer APIs in extension pages; WeakMap
   memoization keeps keystroke cost low. Revisit (and lift the ban) if corpus grows past ~2–3k records.
6. **Onboarding gate = flag absent AND history empty-or-only-today's-auto-add**; dismissal persists
   flag only via dialog close (no write during ratings — a test pins exact localStorage write counts).
7. **Static-template innerHTML kept** in flashcard audio buttons (no dynamic data, pre-existing);
   plan acceptance amended to "no innerHTML with dynamic data". Two dynamic sinks were converted.
8. **Countdown keeps 1s tick with seconds display**, visibility-gated; the plan's minute-granularity
   half was dropped deliberately (live seconds is a product feature).
9. **Atlas paint-order test rewritten** to assert paint-before-hydrate (plan-mandated behavior change;
   old test pinned the audited defect).
10. **register/partOfSpeech line skipped** — web corpus lacks the field; not worth editing 365 records.
11. **words.js corpus split deferred** — defer alone (head+defer) captured most of the win.
12. **ORIGINAL_REQUEST.md keeps its historical revamp.css mention** (record of past request, not living docs).
13. **Quiz engine UI wiring deferred** — new feature surface, deserves its own brainstorm.

## Deferred backlog (none block merge)

- words.js lazy/split delivery (today-stub + async full corpus)
- Background `copyProfile` O(profile) validation copies; `sameProfile` double-stringify compare
- Duplication pockets: streak logic (web vs ext), `vocabularyIndex` ×2, ~280-line practice-modal UI dup between popup.js/atlas.js
- Quiz engine (app-core.js:439–524) built and tested but wired to no UI
- Web anti-FOUC theme bootstrap (extension's `theme-init.js` pattern was never ported) — audit MED that slipped the plan; small win available
- Corpus capped at 365 words; extension shows literal dead-end copy (web now has completion banner instead)
- Cross-device sync beyond manual JSON export/import

## Post-remediation scorecard (self-assessed)

Security 9 → **9.5** · Performance 6.5 → **9** · Design 8 → **8.5** · Product 7 → **8.5**. Overall ≈ 8.9/10.
