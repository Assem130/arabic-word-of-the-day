# Kalimat v0.3.0-beta.1

## Public beta / الإصدار التجريبي العام

Kalimat is a focused, local-first Arabic learning experience for self-identified intermediate-and-advanced learners. This release is a public beta, not a beginner-course or mastery claim.

كَلِمات تجربة عربية محلية تركز على المتعلمين الذين يعرّفون أنفسهم بأنهم في المستوى المتوسط أو المتقدم. هذا إصدار تجريبي عام، وليس ادعاءً بدورة للمبتدئين أو بإتقان مضمون.

## Included / المتاح

- **Website / الموقع:** one universal date-based daily word, meaning and living context, browser speech, lexicon search, and local spaced review.
- **Chrome and Firefox companion / رفيق Chrome وFirefox:** optional challenge and interest preferences, reminders, Atlas exploration, and the shared review policy. Website and extension assignments, reviews, and learner stores remain separate.
- **Privacy / الخصوصية:** no account, sync, backend, analytics, telemetry, gamification, or corpus expansion. Website data stays in `localStorage`; extension data stays in browser `storage.local` until the learner exports or deletes it. Chrome’s optional Wiktionary lookup sends only an explicitly submitted normalized term; Firefox remains local-only.

- **الموقع:** كلمة يومية واحدة موحّدة حسب التاريخ، ومعنى وسياق حي، ونطق المتصفح، والبحث في المعجم، ومراجعة محلية متباعدة.
- **الامتدادان:** تفضيلات اختيارية للتحدي والاهتمامات، وتذكيرات، واستكشاف الأطلس، وسياسة المراجعة المشتركة، مع بقاء التعيينات والمراجعات ومخزونا التعلم منفصلة بين الموقع والامتداد.
- **الخصوصية:** لا حساب ولا مزامنة ولا خادم خلفي ولا تحليلات ولا قياس استخدام ولا ألعاب ولا توسعة للمجموعة. تبقى بيانات الموقع في `localStorage` وبيانات الامتداد في `storage.local` حتى يصدّرها المتعلم أو يحذفها. يرسل Chrome، عند طلب البحث صراحة، المصطلح المطبّع فقط إلى Wiktionary؛ ويظل Firefox محلياً.

## Packages / الحزم

| Archive / الأرشيف | Size / الحجم | SHA-256 |
| --- | ---: | --- |
| `kalimat-chrome-0.3.0.zip` | 498,270 bytes | `c493ef8dcb9b3eb8b0c6612db2fac1d41dfcbc429b6c9bfa52b772fbc302907d` |
| `kalimat-firefox-0.3.0.zip` | 498,365 bytes | `0b4447b5f3bdf34de45aeb819aed0c5640bd76441c8f60f48caa9474d0b285bc` |

Both archives contain the validated 32-file runtime allowlist and the browser-selected `0.3.0` manifest.

يحتوي كل أرشيف على قائمة التشغيل المعتمدة ذات الملفات الـ32 وعلى بيان `0.3.0` الخاص بالمتصفح.

## Verification / التحقق

- `node test.js` — pass (`All checks passed`).
- `node --test tests/*.test.js extension/tests/*.test.js` — pass, 344 tests. The first managed-Windows run hit sandbox-only `spawn EPERM`; the identical command passed with permitted child-process execution.
- `node --check` over every tracked JavaScript file outside `extension/dist` — pass, 42 files.
- Two clean `extension/tools/package.ps1` runs — pass, 32 files per browser with byte-identical archive hashes; `node extension/tests/package.test.js` — pass, 13/13.
- `git diff --check` — pass. Store screenshots `01-daily-word.png`, `02-review.png`, and `03-atlas.png` were inspected; each is a real 1280×800 PNG.

- `node test.js` — نجح.
- الاختبارات الموحّدة — نجحت جميع الاختبارات الـ344 بعد إعادة التشغيل المسموح بها بسبب قيد `spawn EPERM` في Windows المُدار.
- فحص صياغة JavaScript — نجح لـ42 ملفاً.
- الحزم واختبارات الحزم — نجحت؛ تكرارا بناء نظيفان متطابقان، و32 ملفاً لكل متصفح، و13/13 اختباراً.
- `git diff --check` — نجح، وتم فحص لقطات المتجر الثلاث، وكل واحدة 1280×800.

## Manual coverage / التحقق اليدوي

- **Verified / تم التحقق:** website home → daily word at desktop 1280×800; mobile 390×844 copy and lexicon search; speech feedback; review dialog keyboard flip and rating advancement; menu first-focus and Escape restoration; export success toast.
- **Blocked honestly / محجوب بوضوح:** the learning-data confirmation dialog appeared, but accepting deletion was not performed because local deletion requires action-time confirmation. The in-app browser exposes no service-worker API or offline toggle, so fresh-install/offline reload could not be proven there. Firefox was not an available live browser surface, and loading a clean Chrome package would install an extension into the external browser profile and requires action-time confirmation; therefore live extension onboarding, reminders, recovery, import, and explicit Wiktionary permission coverage remain unclaimed.
- Website import was not exercised in this run; no file was uploaded and no import success is claimed.

- **تم التحقق:** انتقال الموقع من الصفحة الرئيسية إلى كلمة اليوم على سطح مكتب 1280×800؛ النص والبحث في المعجم على هاتف 390×844؛ ملاحظات النطق؛ قلب بطاقة المراجعة وتقييمها بلوحة المفاتيح؛ تركيز القائمة وإعادته عند Escape؛ ورسالة نجاح التصدير.
- **محجوب بوضوح:** ظهرت نافذة تأكيد مسح بيانات التعلم، ولم يُقبل المسح لأن الحذف المحلي يحتاج تأكيداً وقت التنفيذ. لا يوفّر المتصفح المضمّن واجهة service worker أو مفتاحاً للعمل دون اتصال، لذلك لم يُثبت التثبيت الأول وإعادة التحميل دون شبكة. لم تتوفر جلسة Firefox، ويتطلب تحميل حزمة Chrome تثبيت امتداد في ملف المتصفح الخارجي وتأكيداً وقت التنفيذ؛ لذلك لا ندّعي تحققاً حياً من بدء الامتداد أو التذكيرات أو الاسترداد أو الاستيراد أو إذن Wiktionary الصريح. لم يُختبر استيراد الموقع في هذه الجولة.

## Store gate / بوابة المتجر

Chrome Web Store and Firefox Add-ons accounts, approvals, final uploads, and store URLs remain release-owner prerequisites. No store approval or 1.0 promotion is claimed. Promotion still depends on the documented manual 21-day cohort gates; Kalimat adds no telemetry to fill that gap.

تبقى حسابات المتاجر والموافقات والرفع النهائي والروابط مسؤولية مالك الإصدار. لا ندّعي موافقة متجر أو ترقية إلى 1.0؛ فالترقية تعتمد على بوابات المجموعة اليدوية الموثقة لـ21 يوماً، ولا تضيف كَلِمات أي قياس استخدام لسد الفجوة.
