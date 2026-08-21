# 02 — Original audit findings (what motivated the work)

Four parallel audits of `main@0b8d9ef` produced the scorecard that became the plan. Scores below are
BEFORE the remediation; see `04-execution-log.md` for what changed.

| Dimension | Before | Headline problems |
|---|---|---|
| Security | 9/10 | Two dynamic-data-adjacent `innerHTML` sinks (app.js related-word pills + renderExample); unvalidated `streak` passthrough on import; CSV formula-injection not neutralized; dev server no Host check |
| Performance | 6.5/10 | revamp.css ≈95% byte-duplicate of style.css (both loaded everywhere); words.js 370KB eagerly parsed for one word/day; zero debounce on lexicon/history search with full re-render per keystroke; scripts parser-blocking at end of body; network-first for same-origin assets; Google Fonts CDN (2 TLS handshakes + CLS); phantom human-audio path 404s before TTS; double state-write per load; SW precache missing review-policy.js/speech.js |
| Design | 8/10 | Positive letter-spacing on connected Arabic script (breaks ligatures) in nav/kicker/accordion/filter labels; line-height 1.1 clips tashkeel on display headings; sub-44px secondary tap targets; residual physical CSS properties; history tabs incomplete ARIA; emoji mixed with SVG icons; web pages lacked the extension's anti-FOUC theme bootstrap |
| Product | 7/10 | Retention loop invisible (streak/due/countdown buried in hamburger); landing Arabic-only (non-readers can't parse it); zero web onboarding; no install prompt / reminders / OG meta; phantom audio; quiz engine built but wired to nothing; 365-word cap dead-end copy |

**Overall before: 7.5/10.** Full evidence with file:line exists in the session archive; the plan file
(`.superpowers/sdd/2026-08-21-kalimat-nine-plus/` workspace or `docs/superpowers/plans/2026-08-21-kalimat-nine-plus.md`)
encodes every finding into tasks.
