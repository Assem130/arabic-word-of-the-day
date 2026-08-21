# 06 — Gotchas (environment + repo traps, learned the hard way)

## This machine / harness

- **Windows PowerShell 5.1 is the shell.** `bash` exists but is an old WSL bash: skill scripts with
  `set -o pipefail` fail; `<(())` process substitution is a PowerShell parse error. The SDD skill
  scripts (`sdd-workspace`, `task-brief`, `review-package`) were replicated inline in PowerShell/Node.
- **Never rewrite UTF-8 text files via `Set-Content`** (default encoding mangles Arabic to `?`).
  Use `[System.IO.File]::ReadAllLines/WriteAllLines` with `new System.Text.UTF8Encoding($boolBOM)`
  — and preserve the original BOM state (`word.html` has BOM, most others don't).
- PowerShell string `.Replace()` needs exact line-ending matches (`\`r\`n` vs `\`n`) — when a replace
  silently no-ops, check CRLF first.
- `node --test tests/` fails ("cannot find module"); use the quoted glob: `node --test "tests/*.test.js"`.
- Subagents: `explore` type works reliably; the `general` seat returned empty twice. If you dispatch,
  verify work actually landed on disk before trusting any result.
- **Never run bare `git checkout <ref> -- .` during triage** — it reverted app.js once and the revert
  got committed. Always re-run full suites after any file-level git surgery.

## Repo contracts that bite

- `extension/dist/**` must be byte-identical to source (`extension/tests/package.test.js` sha256).
  After editing ANY extension source file, run `powershell -File extension/tools/package.ps1`.
- Extension pages ban timer APIs (`setInterval/setTimeout`) — enforced by regex in ui.test.js.
  No debouncing with timers there; memoize instead.
- Validated extension records are `Object.freeze`d — memoize in WeakMaps, never assign properties.
- test.js's FakeElement harness: no `createElementNS` (guard feature code or extend mock);
  `append(strings)` IS supported; `close()` now emits a `close` event (platform fidelity, added c0dbab9).
- Test regexes pin exact class strings, e.g. `class="due-icon badge-icon"` — keep class order when
  editing badge markup.
- Blank Explore query MUST render every reviewed word (test-pinned); result caps apply only to active queries.
- localStorage write counts are asserted by tests — don't add incidental writes on hot paths.
- CSP meta is strict (`script-src 'self'`, `font-src 'self'`): no CDN fonts/scripts; new asset types need CSP review.

## Verification bar (run ALL before claiming done)

```powershell
node test.js                            # expect: All checks passed.
node --test "tests/*.test.js"           # expect: # pass 79, # fail 0
node --test "extension/tests/*.test.js" # expect: # pass 254, # fail 0 (auto-rebuilds dist if stale)
git diff --check                        # expect: silence
node --check sw.js; node --check app.js; node --check extension/background.js  # syntax gates for edited JS
```
