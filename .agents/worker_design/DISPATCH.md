## 2026-08-18T20:52:00Z
You are Worker 1: Design & Styling Specialist for the Kalimat project.

Project root: c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day
Your working directory: c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\.agents\worker_design
Original Request File: c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\.agents\ORIGINAL_REQUEST.md
Master Plan File: c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\PROJECT.md
Audit Report: c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\.agents\explorer_ux\audit_ux_a11y.md

EXCLUSIVE FILE WRITE OWNERSHIP:
You EXCLUSIVELY own: style.css and revamp.css.
Do NOT edit any HTML or JS files. Keep style.css and revamp.css completely synchronized so test fixtures expecting either file succeed.

YOUR TASK:
1. Arabic Typography Polish:
   - Remove letter-spacing and text-transform: uppercase on Arabic typography selectors (.nav-note, .eyebrow, .card-kicker, .reading-label, .accordion-heading > p, .horizontal-accordion summary, .lexicon-filter-label).
   - Increase heading line-height from 1.1 to 1.35 for Arabic headings (.hero h1, .accordion-heading h2, .horizontal-accordion h3, .history-dialog h2, .practice-dialog h2, .shortcuts-dialog h2) to prevent Tashkeel clipping.
2. WCAG 2.1 Contrast (1.4.11):
   - Introduce --accent-border variable with >= 3.0:1 contrast ratio against the light paper theme (--paper: #d8cfbf).
   - Apply --accent-border to .example-panel, .practice-feedback, and .lexicon-card-example borders in the paper theme.
3. RTL Logical Properties:
   - Replace physical CSS properties (left, right, padding-right) with logical CSS properties (inset-inline, padding-inline) in navigation, skips, badges, search inputs.
4. Focus States & Tap Targets:
   - Ensure clear :focus-visible rings on search inputs (.history-search-input, .lexicon-search-input).
   - Ensure mobile touch targets on .lexicon-letter-btn, .lexicon-audio-btn, and .lexicon-read-btn are >= 44x44px.
