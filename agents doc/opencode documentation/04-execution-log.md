# 04 — Execution log (what actually happened, including the messy parts)

## Process shape

Planned subagent-driven development (fresh implementer + reviewer per task). **The `general`
implementer agent returned empty twice with zero work done**, so the controller implemented every
task directly and used `explore` agents as independent task reviewers. One full task review ran for T1;
T2–T11 relied on the repo's test suites + targeted self-verification (documented per task in the SDD
ledger `.superpowers/sdd/2026-08-21-kalimat-nine-plus/progress.md`).

## Timeline highlights

- **T1**: Mechanical merge scripted in Node (`parseBlocks` → positional zip by selector key).
  First review caught a **Critical**: `.toast.show` transform broke when toast base was reworked to
  `inset-inline` centering — fixed to `translateY(0)`. Also: dead shadow tokens consumed, duplicate
  tail token blocks removed, sw cache bumped v1.6, docs scrubbed of revamp.css references.
  - Incident: rewriting HTML via PowerShell `Set-Content` mangled UTF-8 Arabic into `?` — restored from
    git; all subsequent HTML edits use `[System.IO.File]::ReadAllLines/WriteAllLines` with explicit UTF8.
- **T2/T3**: straightforward; SW tests rewritten to assert the new SWR contract.
- **T4**: added CSV/streak/server tests. The mock DOM's `append()` didn't accept raw strings → fixed
  the mock (mirrors real DOM), which also unblocked T4's renderExample rewrite.
- **T5**: first design awaited the probe before playing — broke a test that pins synchronous
  click→play. Redesigned: sync `isAudioKnownAbsent()` map check + fire-and-forget `updateAudioProbe()`.
- **T6**: `updateHistoryUI(force)` gating — first attempt skipped init build (tests pin pre-open
  population); settled on "build once at init, rebuild on open/force".
- **INCIDENT between T6/T7**: during failure triage the controller ran `git checkout HEAD~1 -- .`,
  silently reverting app.js in the working tree; the next `git add -A` committed that revert inside
  b18995b. Detected later because `reviewStatsCache` grep came up empty. Fixed by
  `git checkout f7d6fe7 -- app.js` (19b3c5d) + re-applying the missed `todayKey` restore (1d720c4).
  **Lesson recorded: never bare-checkout files in this session pattern; always re-run full suites
  after any git file surgery.**
- **T7**: extension records are FROZEN — memoization had to move from object properties to WeakMap.
  Atlas debounce was REVERTED: packaging contract (`extension/tests/ui.test.js`) bans timer APIs in
  extension pages. Result caps made query-only (blank Explore must list ALL reviewed words — pinned).
- **T8**: sprite icons i-flame/i-bolt added to both pages' SVG sprites; badge emojis replaced.
  Test regex pins `class="due-icon badge-icon"` exactly — class order matters.
- **T9**: onboarding initially gated on "history empty" — but `determineTodayWord()` auto-adds today's
  word before the check, so it ALWAYS showed... wait, inverse: always SKIPPED? No: hasHistory was true
  → skipped for everyone. Final gate: flag absent AND history empty-or-only-today's-auto-add.
  Reminder toggle write-count conflict solved by NOT writing onboarding flag during ratings.
- **T11**: atlas paint-order test pinned the OLD blocking behavior; test rewritten to assert the new
  contract (plan-mandated change, ruled by controller). A background.js edit briefly left orphan
  braces (caught by `node --check`, fixed).
- **Final review** (explore agent): approved-with-follow-ups; all follow-ups landed in c0dbab9:
  acceptance tests added (OG meta, onboarding lifecycle, reminder gating, completion banner, ext CSV),
  og:url + absolute og:image, word.html due-badge emoji→bolt, dead tokens removed, PROJECT.md cleaned.

## Live QA (browser, post-completion)

Server `python server.py` in worktree → http://localhost:8000. Verified: hero loop strip renders
(streak/due/countdown live), English tagline present, Amiri self-hosted rendering, word page clean,
onboarding lifecycle works end-to-end, midnight theme correct EXCEPT the one open item:

> **OPEN:** midnight `.secondary-button` label invisible (dark-on-dark). Fix specified in `00-START-HERE.md`.
