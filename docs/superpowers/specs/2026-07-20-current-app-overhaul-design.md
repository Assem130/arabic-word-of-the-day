# Current App Overhaul Design

Date: 2026-07-20

## Goal

Turn the existing two-page Arabic word-of-the-day site into a bold, polished, ship-ready experience while keeping it simple, fast, local-first, and genuinely useful. The separate `kalimat-minimal/` experiment is out of scope and must remain untouched.

## Product principles

- Arabic stays primary.
- Every feature must provide direct reading, learning, recall, or portability value.
- No accounts, backend, analytics, database, framework, build step, or new dependency.
- History is automatic rather than requiring users to bookmark words.
- Local data remains compact and portable.
- Accessibility, mobile behavior, and data-loss prevention are required.

## Architecture

Retain the current vanilla structure:

- `index.html`: editorial introduction and primary entry point.
- `word.html`: daily word, learning details, controls, and archive.
- `revamp.css`: shared visual system and responsive layouts.
- `revamp.js`: homepage-only decorative motion.
- `app.js`: word data, deterministic daily selection, state, rendering, archive, speech, sharing, and import/export.
- `server.py`: existing local UTF-8 server.

Do not add an abstraction layer for hypothetical synchronization. Keep state access behind the existing small load/save functions, with pure normalization, validation, and merge helpers that can later be reused by a remote transport.

## Local-first state

Store one compact, versioned state object. It contains:

- `schemaVersion`.
- History entries keyed by stable word ID, with a first-seen local date.
- Preferences, initially whether English assistance is visible.

Do not persist full word definitions or duplicate dataset content. Viewing the daily word adds its ID to history automatically. Reopening a word must not duplicate the entry or change its original first-seen date.

The daily word is derived deterministically from the local calendar-date key and stable dataset order. Devices on the same local date therefore show the same word without synchronizing state. The calculation must not depend on browsing history.

## Portability and future synchronization

Export creates a compact JSON file containing the supported schema version, history, and preferences. Import must:

1. Parse JSON safely.
2. Reject unsupported or malformed top-level data.
3. Ignore unknown word IDs.
4. Normalize recognized records.
5. Merge history by word ID without deleting local entries.
6. Preserve the earliest valid first-seen date when both sources contain an entry.
7. Leave local state unchanged if validation fails.

This merge behavior is deterministic and reusable. A future synchronization feature would add only authentication or device identity, remote transport, and conflict timestamps; it can reuse the state schema, normalization, validation, and history merge logic.

## Audience and English assistance

The audience is broad, but the experience remains Arabic-first. Each word keeps its existing transliteration and gains one concise English gloss. Do not translate the interface, full Arabic definition, or literary example.

The English line appears directly beneath the Arabic meaning by default. A single control hides or shows English assistance, and the preference persists locally.

## Visual direction

Use a bold editorial composition within the existing two-page flow.

The visual palette is:

- Deep green ink for mastheads, identity, and the upper word section.
- Muted warm paper for longer reading areas.
- The existing bright lime `#D9FF76` as a restrained accent only.

On the daily-word page, lime is limited to a thin transition line, primary action emphasis, and a small quote marker. It must not become a large background surface. The daily word remains the largest typographic element. Metadata, meaning, English gloss, literary example, pronunciation, and actions follow in a clear reading sequence.

The homepage uses large Arabic type, disciplined spacing, one primary call to action, and restrained editorial motion. The daily-word page combines the dark identity area with the warmer reading area rather than using an entirely bright or entirely dark surface.

## Interaction design

The homepage has one primary action: open today's word.

The daily-word page provides:

- Listen.
- Copy.
- Share.
- Show or hide concise English assistance.
- Open the automatic archive.
- Export history.
- Import history.

Keep secondary actions visually quiet. The archive should use the existing drawer or an equivalent native, keyboard-accessible dialog pattern rather than becoming a separate application area.

## Failure handling

- If speech synthesis is unavailable, disable the listen control and explain its state accessibly.
- If native sharing is unavailable or fails for a reason other than user cancellation, fall back to copying.
- If clipboard access fails, retain the existing safe fallback and report success or failure.
- If persistent storage is unavailable, keep the current session usable and show a non-blocking warning.
- Invalid imports must show a concise error and never mutate saved state.
- Motion is decorative: the page remains complete if GSAP fails to load, JavaScript motion is disabled, or reduced motion is requested.

## Responsive and accessible behavior

- Preserve semantic heading order and the skip link.
- Use native controls with visible keyboard focus.
- Maintain sufficient contrast across green, paper, and lime combinations.
- Keep status feedback in an accessible live region.
- Ensure archive/dialog focus behavior works with keyboard and touch.
- Stack reading content and actions naturally on narrow screens.
- Avoid horizontal scrolling, clipped Arabic text, and undersized touch targets.
- Preserve Arabic shaping and right-to-left reading order; keep English glosses left-to-right.

## Verification

Add one runnable JavaScript self-check covering:

- Unique, stable word IDs.
- A transliteration and concise English gloss for every word.
- Deterministic word selection for fixed dates.
- State normalization and supported schema handling.
- Safe import validation.
- History merge behavior, including duplicates and earliest first-seen dates.

Complete browser QA at desktop and phone widths. Manually verify the homepage and word flow, automatic history, English preference persistence, speech fallback, sharing and copying, valid and invalid imports, keyboard navigation, reduced motion, Arabic shaping, and RTL/LTR alignment.

## Explicitly excluded

- Changes to `kalimat-minimal/`.
- Accounts or automatic cross-device synchronization.
- Quizzes, streaks, points, or progress dashboards.
- Full English localization.
- Framework migration or new runtime dependencies.
- Refactoring unrelated to the approved overhaul.
