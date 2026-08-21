# Kalimat public-beta store listing kit

## Release identity

- Product: **Kalimat — Arabic Word of the Day / كَلِمات — كلمة عربية كل يوم**
- Beta label: **Public beta · 0.3.0**
- Published GitHub release: [`v0.3.0-beta.1`](https://github.com/Assem130/arabic-word-of-the-day/releases/tag/v0.3.0-beta.1)
- Archive names: `kalimat-chrome-0.3.0.zip`, `kalimat-firefox-0.3.0.zip`
- Audience: self-identified intermediate-and-advanced Arabic learners

## Single purpose

**Arabic:** يقدّم كَلِمات كلمة عربية فصيحة واحدة يومياً مع معناها وسياقها ونطقها ومراجعة محلية تساعد المتعلم على تذكّرها.

**English:** Kalimat presents one eloquent Arabic word at a time with meaning, context, pronunciation, and local review so intermediate-and-advanced learners can retain it.

## Short description

**Arabic:** كلمة عربية فصيحة واحدة كل يوم: اسمعها، افهمها، وراجعها.

**English:** One eloquent Arabic word at a time: hear it, understand it, and review it.

## Full description

### العربية

كَلِمات تجربة محلية أولاً للمتعلمين المتوسطين والمتقدمين في العربية الفصحى. افتح كلمة اليوم، اقرأ معناها ومثالها، استمع إلى نطق المتصفح، ثم راجع الكلمات التي مرّت بك وفق تذكّرك.

يعمل الامتداد كرفيق اختياري: يتيح مستوى تحدٍّ واهتمامات وتذكيراً يومياً وأطلساً لاستكشاف الكلمات. تجربة الموقع وتجربة الامتداد محليتان منفصلتان؛ لا حسابات، ولا مزامنة، ولا تحليلات، ولا إعلانات، ولا خادم خلفي. لا يقدّم المنتج دورة للمبتدئين أو وعوداً بنتيجة تعليمية.

### English

Kalimat is a local-first experience for intermediate-and-advanced Modern Standard Arabic learners. Open the daily word, read its meaning and live context, hear browser speech, and review encountered words according to recall.

The extension is an optional companion with challenge level, interests, a daily reminder through its own MV3 alarms/notifications setting, and Atlas exploration. Website and extension are separate local experiences: no account, sync, analytics, advertising, or backend. Kalimat is not a beginner course and makes no unsupported learning-outcome claim.

## Permissions and why they are needed

### Chrome

- `storage` — keep the learner profile locally in `storage.local`.
- `contextMenus` — offer the explicit word lookup action from the browser context menu.
- Optional `alarms` and `notifications` — schedule an optional daily reminder only after the learner enables it.
- Optional host permission `https://ar.wiktionary.org/*` — perform the explicit, read-only Arabic Wiktionary search after the learner submits a term. Only the normalized search term is sent; no browsing history or learner profile is sent.

### Firefox

- `storage` — keep the learner profile locally in `storage.local`.
- `contextMenus` — offer the local context-menu action.
- Optional `alarms` and `notifications` — schedule an optional reminder after opt-in.
- No host permission and no online lookup; Firefox remains local-only.
- Firefox disclosure: `browser_specific_settings.gecko.data_collection_permissions.required` is `['none']`.

## Data and privacy disclosures

- Website data is in browser `localStorage`; extension data is in `storage.local`. The stores, assignments, and reviews are separate.
- Data remains on the device until the learner deletes it. JSON export and deletion controls are available on the website and in Atlas settings.
- No account, sync, backend, analytics, telemetry, advertising, cookies, or background collection is used by Kalimat.
- The website uses self-hosted local WOFF2 fonts and makes no external font request.
- The website reminder is an opt-in browser `Notification` that fires only while a Kalimat tab is open. Website clear-data removes learning state, onboarding, and reminder settings while preserving `kalimat_theme`; the extension reminder remains a separate MV3 `alarms`/`notifications` setting.
- Chrome’s optional dictionary path sends only an explicitly submitted normalized term to Arabic Wiktionary. Results are visibly unreviewed and are not stored in the learner profile. Firefox is local-only.

## Public links

- Privacy policy: <https://assem130.github.io/arabic-word-of-the-day/privacy.html>
- Support: <https://github.com/Assem130/arabic-word-of-the-day/issues>

No Chrome Web Store or Firefox Add-ons URL is listed yet; store accounts and final submissions remain release-owner steps.

## Screenshot mapping

Submit exactly these three real PNGs, each 1280×800:

| File | Surface | What it demonstrates |
| --- | --- | --- |
| `docs/store/screenshots/01-daily-word.png` | Website `word.html` | A clean daily-word view with Arabic word, meaning, context, and speech control. |
| `docs/store/screenshots/02-review.png` | Website review dialog | The real review flow after opening the local review dialog; no fabricated learner data. |
| `docs/store/screenshots/03-atlas.png` | Extension Atlas | A real Atlas view from a clean extension session. If browser extension access is blocked, leave this asset absent and record the blocker in the Task 4 report. |

## Account and submission checklist

- [ ] Confirm the public beta audience is intermediate-and-advanced; remove any beginner-course wording.
- [ ] Publish `privacy.html` at the exact privacy URL and verify it loads over HTTPS.
- [ ] Verify the support URL accepts issue reports.
- [ ] Create or verify the Chrome Web Store and Firefox Add-ons publisher accounts (user-owned prerequisite).
- [ ] Upload the matching `0.3.0` archive and listing copy for each browser.
- [ ] Declare Chrome’s optional Wiktionary host permission and data boundary exactly as above.
- [ ] Declare Firefox `required: ['none']` data collection.
- [ ] Upload only the three real 1280×800 screenshots and map them to the listing fields.
- [ ] Complete each store’s review questionnaire and privacy/data-safety form; do not invent store URLs before approval.
- [ ] Stop for release-owner approval before submitting, paying, or changing external repository/store state.
