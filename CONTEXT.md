# Kalimat product context

Kalimat (كَلِمات) is a no-build, vanilla HTML/CSS/JavaScript Arabic learning experience for self-identified intermediate-and-advanced learners. It is a public beta, not a beginner course and not an unlimited vocabulary product.

## Product boundary

- The website assigns one universal, date-based daily word, exposes the 365-word lexicon, uses browser speech, schedules local review, and offers an opt-in browser notification reminder while a Kalimat tab is open.
- The Chrome and Firefox MV3 extension is an optional personalized companion with challenge level, interests, its own alarms/notifications reminder setting, Atlas exploration, and the shared review policy.
- Website and extension assignments, reviews, and learner data remain separate. There is no account, sync, backend, telemetry, analytics, gamification, or corpus expansion.

## Storage and privacy contracts

- Website learning state is in `localStorage` under `arabic_words_state`; website clear-data removes learning state, onboarding (`kalimat_onboarded`), and reminder settings (`kalimat_reminder`) while preserving the separate `kalimat_theme` preference.
- Extension learner state is in browser `storage.local` and is never merged with website state.
- Both surfaces provide JSON export and explicit deletion controls. Data is retained locally until the learner deletes it.
- The website uses self-hosted local WOFF2 assets and makes no external font request. Chrome may send only an explicitly submitted, normalized dictionary term to Arabic Wiktionary; Firefox remains local-only.

## Runtime seams

- `app-core.js` owns deterministic date selection, state migration, and review-policy adapters.
- `app.js` owns the word permalink; `revamp.js` owns the home/lexicon surface; `web-ui.js` contains shared website UI helpers.
- `extension/shared/review-policy.js` and `extension/shared/speech.js` are shared by the website and extension adapters.
- `sw.js` precaches the same-origin app shell, including the hosted privacy page; local WOFF2 assets are served from the app origin with no Google Fonts request.
- `extension/tools/package.ps1` emits the version `0.3.0` Chrome and Firefox archives from the validated runtime allowlist.

## Beta protocol and gates

Recruit 12–18 self-identified intermediate/advanced Arabic learners. Collect only participant-provided check-in notes; do not add telemetry or infer proficiency from usage.

Check in on days 0, 7, 14, and 21. Record baseline exposure and an unseen-sentence comprehension check; at later check-ins, ask learners to export their existing data and report days used, context usefulness, and difficulty fit.

Promote to 1.0 only when all four gates hold:

1. At least half of participants report using Kalimat on 12 of 21 days or more.
2. Each learner band has at least two consistent users.
3. Median practical-context usefulness is at least 4/5.
4. Day-21 unseen-sentence comprehension reaches at least 70%.

If the gate fails, revise content or positioning before adding words, surfaces, telemetry, or new review behavior.
