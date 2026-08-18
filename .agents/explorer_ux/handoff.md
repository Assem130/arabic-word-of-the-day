# تقرير التسليم النهائي (Handoff Report) — Explorer UX, Typography & A11y

**المُعد**: مستكشف تجربة المستخدم والطباعة وإمكانية الوصول (Explorer 1)  
**المستلم**: القائد المنسق (Orchestrator / Parent)  
**المسار الكامل للتقرير المفصل**: `c:\Users\assem\Personal\Vibe coded projects\arabic-word-of-the-day\.agents\explorer_ux\audit_ux_a11y.md`

---

## 1. الملاحظات المباشرة (Observation)

1. **ازدواجية استدعاء ملفات الأنماط (CSS File Duplication)**:
   - في `index.html` (السطور 14-15):
     ```html
     <link rel="stylesheet" href="style.css">
     <link rel="stylesheet" href="revamp.css">
     ```
   - وفي `word.html` (السطور 13-14):
     ```html
     <link rel="stylesheet" href="style.css">
     <link rel="stylesheet" href="revamp.css">
     ```
   - أمر المقارنة `git diff --no-index --stat style.css revamp.css` أظهر أن `revamp.css` هو نسخة متطابقة بنسبة 95% من `style.css` مع 75 سطراً مضافاً و 25 سطراً معدلاً فقط، مما يتسبب في تحميل مزدوج لـ ~111KB وتضارب في شجرة الأنماط.

2. **تشوهات تباعد الحروف في الطباعة العربية (Arabic Letter-Spacing & Uppercase)**:
   - في `revamp.css` السطور 214، 286، 307، 1057، 1095:
     ```css
     .nav-note { ... letter-spacing: .1em; }
     .eyebrow, .card-kicker, .reading-label, .accordion-heading > p { ... letter-spacing: .15em; text-transform: uppercase; }
     .horizontal-accordion summary { ... letter-spacing: .15em; }
     .lexicon-filter-label { ... letter-spacing: .08em; text-transform: uppercase; }
     ```
   - نصوص هذه العناصر عربية خالصة مثل: "لفظٌ واحد. أفقٌ أوسع."، "مجلة لغوية يومية"، "من اللفظ إلى الأثر"، "الجذر اللغوي"، "التصنيفات الموضوعية".

3. **ضيق ارتفاع السطر للعناوين العربية الكبيرة (Tight Line-Height & Diacritics Collision)**:
   - في `revamp.css` السطور 287، 301، 312، 385، 461:
     ```css
     .hero h1 { ... line-height: 1.1; }
     .accordion-heading h2 { ... line-height: 1.1; }
     .horizontal-accordion h3 { ... line-height: 1.1; }
     .history-dialog h2 { ... line-height: 1.1; }
     .practice-dialog h2, .shortcuts-dialog h2 { ... line-height: 1.1; }
     ```

4. **قصور تباين الحدود والاقتباسات في الوضع الفاتح (WCAG 1.4.11 Non-text Contrast)**:
   - في `revamp.css` السطور 363، 928، 1366:
     - `.example-panel { border-inline-start: 3px solid var(--lime); }`
     - `.practice-feedback { border-inline-start: 4px solid var(--lime); }`
     - `.lexicon-card-example { border-inline-start: 3px solid var(--lime); }`
   - قيمة `--lime` في النمط الورقي هي `#d9ff76` (Luminance 0.875) وقيمة الخلفية `--paper` هي `#d8cfbf` (Luminance 0.630). نسبة التباين المحسوبة هي **1.36:1**، وهي أدنى بكثير من الحد الأدنى لمعيار WCAG 1.4.11 البالغ 3.0:1.

5. **الاعتماد على الخصائص الفيزيائية بدل المنطقية في اتجاه RTL**:
   - `revamp.css:188`: `.skip-link { top: 10px; right: 10px; }`
   - `revamp.css:222`: `.badge { top: -7px; left: -7px; }`
   - `revamp.css:379, 384`: `.app-menu-dropdown { left: max(...); right: auto; }`
   - `revamp.css:363`: `.example-panel { padding: 0 24px 0 0; }`
   - `revamp.css:422, 448`: `.history-search-input { padding: 0 42px 0 16px; } .search-icon { right: 14px; }`
   - `revamp.css:998, 1053`: `.lexicon-search-input { padding: 0 46px 0 16px; } .search-icon { right: 16px; }`

6. **تعارضات ARIA الدلالية على عناصر الأزرار**:
   - في `index.html:49` و `word.html:132`:
     ```html
     <button id="due-review-badge" class="due-review-badge" type="button" title="المراجعات المستحقة اليوم (Q)" aria-label="المراجعات المستحقة اليوم: 0 كلمات" role="status">
     ```
   - في `word.html:103, 148, 149`: غياب `type="button"` و `aria-label` المخصص لزر النسخ والمشاركة.
   - في `revamp.css:446`: `.history-search-input { outline: none; }` بدون حلقة تركيز `:focus-visible`.

7. **أبعاد أهداف اللمس على الأجهزة المحمولة**:
   - في `revamp.css` السطور 1137، 1269، 1380:
     - `.lexicon-letter-btn`: أبعادها `38px × 38px`.
     - `.lexicon-audio-btn`: أبعادها `38px × 38px`.
     - `.lexicon-read-btn`: ارتفاعها `min-height: 38px`.
     - `.audio-option-btn`: ارتفاعها `height: 42px`.

8. **إخفاق الاختبار الآلي `test.js`**:
   - عند تشغيل `node test.js`:
     ```text
     AssertionError [ERR_ASSERTION]: word-page menu must link directly to the lexicon explorer
     expected: /<div class="app-menu-dropdown(?:\s+word-menu-dropdown)?" id="app-menu-dropdown" hidden>[\s\S]*?<a class="nav-explorer-link" href="index\.html#lexicon-explorer"[^>]*>[\s\S]*?<use href="#i-search"\/>[\s\S]*?معجم الجذور[\s\S]*?<\/a>/
     ```
   - السبب: عدم وجود رابط معجم الجذور في القائمة المنسدلة لصفحة `word.html`.

---

## 2. سلسلة الاستدلال المنطقي (Logic Chain)

1. **الازدواجية والأداء**: استدعاء كلا الملفين `style.css` و `revamp.css` في `index.html` و `word.html` يضاعف حجم الشيفرة المنزلة ويعقد عملية الصيانة (الملاحظة 1) -> دمج الملفين في ملف واحد نظيف يحقق مبدأ Ponytail ويسرع التحميل.
2. **سلامة الخط العربي**: الحروف العربية متصلة بطبيعتها، وتطبيق `letter-spacing` و `text-transform: uppercase` (الملاحظة 2) ينزع اتصال الحروف ويشوه بنيتها -> إزالة هذه الخصائص عن النصوص العربية يعيد للخط العربي انسيابيته الفصيحة.
3. **وضوح التشكيل**: خط Amiri له امتدادات رأسية علوية وسفلية لحركات التشكيل والهمزات، وارتفاع السطر `1.1` (الملاحظة 3) يسبب تلاصق السطور واقتصاص الحركات -> زيادة ارتفاع السطر إلى `1.35` يمنح مساحة كافية لكل حركة.
4. **إمكانية الرؤية والتباين**: خطوط الاقتباس والملاحظات الجانبية بلون `--lime` تسقط في اختبار التباين WCAG 1.4.11 بنسبة 1.36:1 (الملاحظة 4) -> استخدام متغير مستقل للحدود التمييزية مثل `--accent-border` بنسبة تباين >= 3:1 في الوضع الفاتح يضمن وضوح العناصر لكافة فئات المستخدمين.
5. **الاتساق المنطقي لاتجاه RTL**: استخدام الخصائص الفيزيائية (الملاحظة 5) يسبب خللاً في التجاوب عند تغيير الاتجاهات أو التعامل مع شاشات مختلفة -> التحويل للخصائص المنطقية `inset-inline` و `padding-inline` يضمن صلابة الواجهة.
6. **دقة إمكانية الوصول**: إضافة `role="status"` على `<button>` (الملاحظة 6) يلغي دلالة الزر البرمجية -> حصر `role="status"` في نص الشارة الداخلي أو `aria-live` يتيح لقارئات الشاشة التعرف عليه كزر قابل للنقر.
7. **سهولة الاستخدام باللمس**: أزرار الحروف والصوت بقياس 38px (الملاحظة 7) أقل من معيار 44px -> رفع الأبعاد إلى 44px يمنع النقرات الخاطئة على الهواتف.
8. **استقرار الاختبارات والتنقل**: غياب رابط المعجم في قائمة `word.html` (الملاحظة 8) يكسر مسار التنقل للمستخدم ويفشل الفحص الآلي -> إضافته يربط تجربة المستخدم بسلاسة ويجتاز الاختبار.

---

## 3. التحفظات والافتراضات (Caveats)

- **الخطوط المضمنة محلياً مقابل السحابية**: يعتمد المشروع على Google Fonts أثناء الاتصال بالإنترنت، مع وجود خطوط بديلة في النظام. تم افتراض بقاء استدعاء Google Fonts كخيار أساسي مع الحفاظ على التوافق الكامل مع العمل دون اتصال (Offline PWA).
- **عدم المساس بالبيانات المحلية للمستخدم**: جميع مقترحات التصميم وإمكانية الوصول لا تؤثر على هيكل البيانات المخزنة في `localStorage` أو خوارزمية التكرار المتباعد SM-2.
- **حدود نطاق المستكشف**: المستكشف جهة فحص وتدقيق (Read-Only)؛ لم يتم تعديل أي ملف كود مصدري خارج مجلد `.agents/explorer_ux/`.

---

## 4. الخلاصة والتوصيات الإجرائية (Conclusion)

تصميم منصة "كَلِمات" يتمتع بروح بصرية أصيلة ونقية. لتتويج هذا العمل والوصول به إلى أعلى معايير الجودة وإمكانية الوصول الدولية (WCAG 2.1 AA/AAA) ومعيار البساطة الهندسية (Ponytail Standard)، يوصى بتنفيذ حزمة الإصلاحات التالية في المرحلة القادمة:

1. **دمج ملفات الأنماط**: توحيد كافة الأنماط في ملف واحد وإلغاء الاستدعاء المزدوج في HTML.
2. **إصلاح رابط المعجم في `word.html`**: إضافة الرابط للقائمة لاجتياز اختبارات `node test.js`.
3. **تطهير الطباعة العربية**: إزالة `letter-spacing` و `text-transform: uppercase` عن النصوص العربية، وضبط `line-height: 1.35` للعناوين.
4. **تصحيح تباين الحواف الفاتحة**: ضبط `--accent-border` لتحقيق تباين يتجاوز 3:1 للاقتباسات وملاحظات التثبيت.
5. **اعتماد الخصائص المنطقية (RTL)**: استبدال `left`/`right`/`padding-right` بالخصائص المنطقية المناسبة.
6. **تنقيح دلالات ARIA وأهداف اللمس**: إزالة `role="status"` عن الأزرار، وتوسيع أزرار الحروف والصوت في المعجم إلى 44px × 44px.

---

## 5. طريقة التحقق المستقل (Verification Method)

يمكن للوكيل المنفذ (Implementer) أو المراجع المستقل التحقق من نتائج هذا التدقيق وتطبيق التوصيات باتباع الآتي:

1. **التحقق من اجتياز الاختبارات الآلية**:
   ```bash
   node test.js
   ```
   *شرط النجاح*: اجتياز الاختبارات بنسبة 100% دون أي خطأ توكيد (AssertionError).

2. **التحقق من سلامة الأنماط والخصائص المنطقية**:
   ```bash
   git diff --check
   ```
   *شرط النجاح*: عدم وجود مسافات بيضاء زائدة أو تشوهات ترميز.

3. **الفحص البصري لحلقات التركيز والتباين**:
   - فتح `index.html` و `word.html` في المتصفح والتنقل بالكامل عبر مفتاح `Tab`.
   - اختبار التبديل بين السمات الثلاث (Paper، Emerald، Midnight) والتحقق من وضوح خط الاقتباس الجانبي في بطاقة القراءة.
   - فحص علامات التشكيل في الكلمة الرئيسية وحركات العناوين للتأكد من عدم اقتصاصها.
   - فحص أزرار الحروف في معجم الجذور للتأكد من سهولة النقر عليها على شاشة الهاتف.
