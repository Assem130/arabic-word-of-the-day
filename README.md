# كَلِمات · Kalimat

كلمة عربية فصيحة واحدة كل يوم: اسمعها، افهم معناها، وراجعها حتى تثبت.

Kalimat is a calm, local-first Arabic learning experience for intermediate-and-advanced learners. It is currently a public beta (`0.3.0`, planned tag `v0.3.0-beta.1`).

- **Live site:** <https://assem130.github.io/arabic-word-of-the-day/>
- **Privacy:** <https://assem130.github.io/arabic-word-of-the-day/privacy.html>
- **Support:** <https://github.com/Assem130/arabic-word-of-the-day/issues>

## القناتان / Two surfaces

The website and extension complement each other, but they are separate local experiences:

- **Website:** one universal, date-based daily word; the full lexicon; browser speech; and local spaced review. Reading history is stored in browser `localStorage`.
- **Chrome / Firefox extension:** an optional personalized companion with challenge level, interests, reminders, Atlas exploration, and the same review policy. Its learner profile is stored in extension `storage.local`.

Assignments, reviews, and stores do not sync between the website and extension. There is no account, backend, telemetry, analytics, gamification, or vocabulary expansion in this beta. The product does not claim beginner coverage.

## الخصوصية / Privacy

Learning data remains on the device until you delete it. Both surfaces provide JSON export and deletion controls. The website may request Google Fonts; system fonts are the offline fallback. Chrome can make an explicit, read-only Arabic Wiktionary lookup when you submit a search, sending only the normalized term. Firefox remains local-only. Read the full [privacy policy](https://assem130.github.io/arabic-word-of-the-day/privacy.html).

## Try the website

Open the [live site](https://assem130.github.io/arabic-word-of-the-day/) or run the no-build local server:

```powershell
git clone https://github.com/Assem130/arabic-word-of-the-day.git
cd arabic-word-of-the-day
python server.py
```

Then open <http://localhost:8000/>. Python 3 is the only development runtime required.

## Extension beta installation

If the planned GitHub release `v0.3.0-beta.1` has been published, download its assets:

- Download the matching `kalimat-chrome-0.3.0.zip` or `kalimat-firefox-0.3.0.zip`, then extract the ZIP.
- **Chrome:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted Chrome folder (the folder containing `manifest.json`).
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the extracted Firefox `manifest.json` file.

Until that release is published, build locally with the packaging command below and load the unpacked `extension/dist/chrome` or `extension/dist/firefox` directory in the relevant browser. Store listing links are intentionally omitted until the stores approve a public submission.

## Verification

Run the complete local gate from the repository root:

```powershell
node test.js
node --test tests/*.test.js extension/tests/*.test.js
git ls-files '*.js' | Where-Object { $_ -notlike 'extension/dist/*' } | ForEach-Object { node --check $_ }
powershell -NoProfile -ExecutionPolicy Bypass -File extension/tools/package.ps1
$env:KALIMAT_PACKAGE_ALREADY_BUILT = '1'; node extension/tests/package.test.js; Remove-Item Env:KALIMAT_PACKAGE_ALREADY_BUILT
git diff --check
```

The managed Windows runner may report `spawn EPERM` for Node child workers; rerun the identical command with permitted process execution. A clean package must emit `extension/dist/kalimat-chrome-0.3.0.zip` and `extension/dist/kalimat-firefox-0.3.0.zip`.

## Project map

```text
index.html       editorial home, lexicon, and website review entry point
word.html        daily-word permalink, history, export/import, and review
words.js         canonical 365-word website corpus
app-core.js      date selection, local state, and review policy adapters
app.js           word-page controller and browser-speech UI
revamp.js        home-page controller and lexicon/review UI
web-ui.js        shared website UI helpers
sw.js            offline app-shell service worker
extension/       optional Chrome/Firefox MV3 companion and Atlas
server.py        local UTF-8 development server
```

The implementation intentionally stays vanilla HTML, CSS, and JavaScript with no package dependencies.
