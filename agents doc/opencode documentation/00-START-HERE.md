# START HERE — Kalimat remediation branch `kalimat-nine-plus`

You are picking up work on the **Kalimat** repo (Arabic daily-word learning PWA + MV3 extension).
A previous agent ("opencode", session of 2026-08-21) audited the repo, planned a 12-task remediation,
and executed all of it on this branch. This folder documents everything so you can continue without
re-deriving context.

## Where things stand (as of commit `c0dbab9`)

- **Branch:** `kalimat-nine-plus`, checked out in worktree `.worktrees/kalimat-nine-plus`, 17 commits ahead of `main`. **Not merged, not pushed.**
- **All 12 planned tasks: COMPLETE.** Final whole-branch review done; its follow-ups landed in `c0dbab9`.
- **Verification at HEAD, all green:** `node test.js` ✓ · `node --test "tests/*.test.js"` 79/79 ✓ · `node --test "extension/tests/*.test.js"` 254/254 ✓ · `git diff --check` ✓ · extension dist rebuilt + hash-verified by packaging tests.

## The ONE known pending fix (resume here)

Live QA in a browser found a **pre-existing contrast bug** that was identified but deliberately left
unfixed when the user paused the session:

> In the `midnight` theme, `.secondary-button` (the "معجم الجذور والأوزان" button in the landing hero)
> renders its label invisible — dark text (`--paper-light` flips dark in midnight) on the dark hero.

**Fix:** add `html[data-theme="midnight"] .secondary-button` to the light-text override group in
`style.css` (the block starting `html[data-theme="midnight"] .primary-button,` around line ~1914).
Then run `node test.js`, commit. Web-only change; no dist rebuild needed.

## After that

1. Have the human eyeball index.html / word.html in all three themes (paper/emerald/midnight).
2. Merge via PR (superpowers:finishing-a-development-branch flow) — do NOT push/merge without the human's explicit go.
3. Delete this branch's SDD workspace after merge if you like: `.superpowers/sdd/2026-08-21-kalimat-nine-plus/`.

## How to run things

```powershell
# from this worktree root:
python server.py            # dev server → http://localhost:8000 (Host header must be localhost/127.0.0.1)
node test.js                # main test runner (~1400 assertions)
node --test "tests/*.test.js"          # web test files
node --test "extension/tests/*.test.js" # extension tests (packaging test auto-runs tools/package.ps1 if dist is stale)
powershell -File extension/tools/package.ps1  # rebuild extension/dist/{chrome,firefox} after editing extension source
```

## Read next

| File | Contents |
|---|---|
| `01-project-overview.md` | What Kalimat is, architecture map |
| `02-audit-findings.md` | The original 4-dimension audit (scores + evidence) |
| `03-plan-and-decisions.md` | The 12-task plan and every locked decision |
| `04-execution-log.md` | Task-by-task record with commits |
| `05-rulings-and-deferred.md` | All rulings made on the human's behalf + deferred backlog |
| `06-gotchas.md` | Harness/environment traps the hard way |

Worktree-local scratch (git-ignored): `.superpowers/sdd/2026-08-21-kalimat-nine-plus/` holds the raw
plan file, task briefs, reports, and review packages if you need primary sources.
