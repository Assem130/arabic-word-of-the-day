# كَلِمات — Arabic Word of the Day

A calm, Arabic-first daily reading experience for one word at a time.

## What it does

- Selects the same word for everyone on a given local calendar day, deterministically from the bundled word list.
- Shows the Arabic word, vocalization, pattern, root, category, meaning, pronunciation, English gloss, example, and a countdown to the next word.
- Saves opened words and the optional English-gloss preference automatically in this browser's local storage.
- Keeps the English gloss concise and optional; it is visible by default and its setting persists after a reload.
- Provides browser speech when available, plus copy/share fallbacks and an accessible archive dialog.
- Exports the local archive as JSON and imports compatible JSON by merging records rather than replacing them. When the same word exists in both places, the earliest first-seen date wins—ready for a future sync layer without adding one now.

## Privacy and transfer

There is no account, backend, analytics pipeline, or server-side history store. The local server only serves the static files during development. Your reading history stays in your browser unless you explicitly export it.

Cross-device transfer is manual: export a JSON backup on one device, then import it on another. Importing does not erase the existing archive; compatible histories merge.

## Run locally

Python 3 is the only requirement:

```powershell
git clone https://github.com/Assem130/arabic-word-of-the-day.git
cd arabic-word-of-the-day
python server.py
```

Open <http://localhost:8000>. The included server sends UTF-8 headers for the Arabic HTML, CSS, and JavaScript files.

## Project structure

```text
arabic-word-of-the-day/
├── index.html       # Landing page
├── word.html        # Daily-word experience and controls
├── revamp.css       # Responsive RTL presentation
├── revamp.js        # Landing-page motion
├── words.js         # Bundled Arabic-word dataset
├── app-core.js      # Deterministic selection and backup-state logic
├── app.js           # Rendering, local history, speech, sharing, import/export
├── test.js          # Dependency-free deterministic and UI-state checks
└── server.py        # Local UTF-8 development server
```

## Verify

```powershell
node test.js
git diff --check
```
