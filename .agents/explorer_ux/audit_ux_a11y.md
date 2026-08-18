# تقرير التدقيق الشامل لتجربة المستخدم والطباعة وإمكانية الوصول (Kalimat UX, Typography & A11y Audit)

**التاريخ**: 18 أغسطس 2026  
**المشروع**: كَلِمات (Kalimat) — Arabic Word of the Day  
**الملفات المفحوصة**: `index.html`، `word.html`، `style.css`، `revamp.css`، `app.js`، `app-core.js`، `revamp.js`، `words.js`، `sw.js`  
**معيار التصميم**: Zero external CSS frameworks / Ponytail Standard (Native Web, Boring & Robust)

---

## 1. الملخص التنفيذي (Executive Summary)

تم إجراء تدقيق هندسي وبصري متعمق لمنصة **كَلِمات** عبر شاشات سطح المكتب والهواتف الذكية ومختلف أوضاع الإضاءة (Paper، Emerald، Midnight). أظهر الفحص بنية تحتية قوية قائمة على تقنيات الويب الأصيلة (Vanilla JS/HTML/CSS) بدون أطر عمل خارجية، والتزاماً متميزاً بالخصوصية المحلية وخدمة PWA بدون اتصال.

ومع ذلك، كشف التدقيق عن **٨ محاور حيوية** تحتاج إلى تحسين وصقل لرفع المنصة إلى مستوى النخبة في التجارب العربية الهادئة:
1. **ازدواجية ملفات الأنماط**: تحميل `style.css` و`revamp.css` معاً يسبب تكرار ~110KB من الشيفرات وصراعات في تدرج الخصائص (Cascade).
2. **تشوهات الطباعة العربية بسبب تباعد الحروف**: استخدام `letter-spacing` و`text-transform: uppercase` على نصوص عربية مما يفكك الحروف المتصلة (Ligatures).
3. **تزاحم علامات الضبط (التشكيل)**: استخدام `line-height: 1.1` شديد الضيق على العناوين الكبيرة يسبب قص علامات التشكيل العلوية والسفلية.
4. **قصور تباين الحواف والأطر في الوضع الفاتح (WCAG 1.4.11)**: انخفاض تباين خطوط الاقتباس والحواف بلون `--lime` على خلفية الورق إلى **1.36:1** (المطلوب >= 3:1).
5. **الاعتماد على الخصائص الفيزيائية بدل المنطقية في اتجاه اليمين لليسار (RTL)**: وجود قيم `left`/`right`/`padding-right` مباشرة بدلاً من `inset-inline` و`padding-inline`.
6. **تعارضات ARIA الدلالية**: استخدام `role="status"` على عناصر `<button>` تفاعلية مما يلغي دلالتها الوظيفية لدى قارئات الشاشة.
7. **أزرار أصغر من المعيار الموصى به للمس على الهواتف (< 44px)**: أزرار فهرس الحروف وأزرار الصوت في المعجم بقياس 38px بدلاً من 44px.
8. **فقدان رابط المعجم في قائمة صفحة الكلمة**: مما تسبب في إخفاق اختبار الفحص الآلي في `test.js:500`.

---

## 2. جدول نتائج التدقيق التفصيلي (Detailed Audit Matrix)

| الفئة | العنصر / الموقع | المشكلة المرصودة | معيار الجودة / WCAG | التأثير | الأولوية |
|---|---|---|---|---|---|
| **بنية الأنماط** | `index.html:14-15` / `word.html:13-14` | تحميل `style.css` و`revamp.css` بالتوازي مع تكرار 95% من القواعد | Web Performance & Clean CSS | استهلاك شبكة وذاكرة وتضارب نمطي | **حرجة** (P0) |
| **الطباعة العربية** | `revamp.css:214, 286, 307, 1057` | `letter-spacing` و `text-transform: uppercase` على نصوص عربية | فصاحة الخط العربي والاتصال الطبيعي | تقطيع الحروف العربية المتصلة وتشويهها | **عالية** (P1) |
| **الطباعة والتشكيل** | `revamp.css:287, 301, 312, 385, 461` | `line-height: 1.1` على العناوين الرئيسية والحوارات | وضوح حركات الإعراب والتنغيم | تداخل الحركات وقص الشدة والفتحة والكسرة | **عالية** (P1) |
| **التباين البصري** | `revamp.css:363, 928, 1366` | لون `--lime` للأطر على خلفية `--paper` بتباين 1.36:1 | WCAG 2.1 AA (1.4.11 Non-text Contrast >= 3:1) | صعوبة رؤية حدود الاقتباسات والملاحظات | **عالية** (P1) |
| **دقة RTL** | `revamp.css:188, 222, 363, 422, 448, 998, 1053` | استخدام `left`, `right`, `padding-right` بدلاً من الخصائص المنطقية | CSS Logical Properties & Values | ضعف اتساق الواجهة وقابلية التكيف | **متوسطة** (P2) |
| **إمكانية الوصول** | `index.html:49` / `word.html:132` | `role="status"` على عنصر `<button id="due-review-badge">` | WAI-ARIA 1.2 Button vs Status Role | قارئات الشاشة تفقد إمكانية النقر على الزر | **حرجة** (P1) |
| **إمكانية الوصول** | `word.html:103, 148, 149` | أزرار بدون `aria-label` صريح أو بدون `type="button"` | WCAG 2.1 (4.1.2 Name, Role, Value) | عدم وضوح وظيفة الزر لضعاف البصر | **متوسطة** (P2) |
| **إمكانية الوصول** | `revamp.css:446` | `outline: none` على حقل بحث المخزون بدون حلقة تركيز بديلة | WCAG 2.1 (2.4.7 Focus Visible & 2.4.11) | عدم وضوح موضع مؤشر لوحة المفاتيح | **عالية** (P1) |
| **تجربة اللمس** | `revamp.css:1137, 1269, 1380` | أزرار الحروف والصوت والقراءة بقياس 38px (< 44px) | WCAG 2.1 (2.5.5 / 2.5.8 Target Size >= 44x44px) | نقرات خاطئة على الشاشات اللمسية | **عالية** (P1) |
| **تكامل القوائم** | `word.html:126-156` | غياب رابط معجم الجذور في القائمة المنسدلة لصفحة الكلمة | تناسق التنقل واجتياز `test.js:500` | انكسار التنقل وإخفاق الاختبارات | **حرجة** (P0) |

---

## 3. التحليل المعمق حسب المحاور (In-Depth Analysis)

### أ. الطباعة العربية والنغم البصري (Typography & Tashkeel)

1. **معضلة تباعد الحروف (Letter-Spacing Collision)**:
   - **الملاحظة**: في ملف `revamp.css`:
     - السطر 214: `.nav-note { letter-spacing: .1em; }` (مطبق على "لفظٌ واحد. أفقٌ أوسع.").
     - السطر 286: `.eyebrow, .card-kicker, .reading-label, .accordion-heading > p { letter-spacing: .15em; text-transform: uppercase; }`.
     - السطر 307: `.horizontal-accordion summary { letter-spacing: .15em; }`.
     - السطر 1057: `.lexicon-filter-label { letter-spacing: .08em; text-transform: uppercase; }`.
     - السطر 1095: `.lexicon-subfilter-title { letter-spacing: .08em; text-transform: uppercase; }`.
   - **التحليل الفني**: الحرف العربي حرف متصل (Cursive Script). يؤدي تباعد الحروف في محركات التصيير (Blink/Gecko/WebKit) إلى بتر الوصلات بين الحروف أو ظهور فجوات بيضاء غير مألوفة داخل الكلمة الواحدة. كما أن تحويل الحروف الكبيرة (`text-transform: uppercase`) لا ينطبق على الأبجدية العربية.
   - **الحل المقترح**: ضبط `letter-spacing: normal; text-transform: none;` لجميع العناصر الحاوية على نصوص عربية، وقصر `letter-spacing` فقط على النصوص الإنجليزية مثل النطق الصوتي أو الترجمة عبر محدد `:lang(en)` أو `[dir="ltr"]`.

2. **ارتفاع السطر وحماية علامات التشكيل (Line-Height & Tashkeel Clearance)**:
   - **الملاحظة**: العناوين في الأسطر 287 و301 و312 و385 و461 تعتمد `line-height: 1.1`.
   - **التحليل الفني**: خط *Amiri* يعتمد النمط النسخي الأصيل ذو الارتفاعات الرأسية للهمزات والحركات (مثل الشدة فوق الألف، والضمة، وتنوين الفتح، والكسرة تحت الراء). مع `line-height: 1.1`، تتداخل الحركات بين السطور أو تقص الحركات الواقعة أعلى وأسفل الكلمة الرئيسية عند تفعيل `overflow: hidden` أو `overflow: clip`.
   - **الحل المقترح**: رفع ارتفاع السطر إلى `line-height: clamp(1.25, 1.35em, 1.45)` للعناوين الكبيرة، وإضافة هوامش أمان علوية وسفلية `padding-block: 0.1em 0.15em` على الكلمة المركزية `.main-word` و `.lexicon-card-word`.

3. **خصائص تصيير الخط وتفعيل الربط الطباعي (OpenType Features)**:
   - **الملاحظة**: لا توجد إعدادات `font-feature-settings` أو `text-rendering` في الأنماط العامة.
   - **الحل المقترح**: تضمين القواعد التالية في جذر الأنماط:
     ```css
     body {
         text-rendering: optimizeLegibility;
         -webkit-font-smoothing: antialiased;
         -moz-osx-font-smoothing: grayscale;
         font-feature-settings: "liga" 1, "calt" 1;
     }
     ```

---

### ب. الألوان والتباين وإمكانية الوصول البصري (Color Contrast & Elevation)

1. **تدقيق تباين السمات الثلاث (Paper, Emerald, Midnight)**:
   - **وضع الورق (Paper)**:
     - النص الأساسي (`#14211b`) على الخلفية (`#f3efe5`): معدل التباين **14.0:1** (ممتاز، يجتاز AAA).
     - النص الثانوي (`#24332b`) على الخلفية (`#f3efe5`): معدل التباين **11.0:1** (ممتاز، يجتاز AAA).
     - أزرار المراجعة الذكية (Again, Hard, Good, Easy): تتراوح بين **5.9:1** و **7.55:1** (تجتاز AA بالكامل).
     - **الخلل**: خط الاقتباس الجانبي في `.example-panel` و `.practice-feedback` يستخدم `var(--lime)` (`#d9ff76`) فوق خلفية `--paper` (`#d8cfbf`). معدل التباين هو **1.36:1** فقط، وهو غير مرئي تقريباً ويسقط في اختبار WCAG 1.4.11 (الحد الأدنى 3:1).
   - **الوضع الزمردي (Emerald)**:
     - النص الأساسي (`#062c22`) على الخلفية (`#f4f0e6`): معدل التباين **15.2:1** (AAA).
     - لون التمييز الذهبي (`#d4af37`) فوق الداكن (`#062c22`): معدل التباين **8.04:1** (AAA).
     - **الخلل**: استخدام الذهبي كحدود على الورق الفاتح يعطي تباين **1.50:1** (أقل من 3:1).
   - **الوضع الليلي (Midnight)**:
     - النص الأساسي (`#f1f5f9`) على الخلفية الليلية (`#0b1329`): معدل التباين **16.4:1** (AAA).
     - اللون السماوي (`#38bdf8`) على الخلفية الليلية: معدل التباين **9.56:1** (AAA).
     - تباين أزرار المراجعة الأربعة: جميعها تتجاوز **8.1:1** (AAA).

2. **معالجة تباين الأطر والحدود المقترحة**:
   - تعريف متغير دلالي مستقل للحدود التمييزية:
     - في `paper`: `--accent-border: #15803d;` (أو `--ink`) للحفاظ على تباين 4.5:1 على السطح الفاتح.
     - في `emerald`: `--accent-border: #062c22;` (أو لون زمردي داكن).
     - في `midnight`: `--accent-border: var(--lime);` (`#38bdf8`).

---

### ج. الاتجاه المنطقي الصارم (RTL Logical Properties Fidelity)

أظهر المسح وجود بقايا لخصائص اتجاهية فيزيائية يمكن استبدالها بخصائص CSS المنطقية الحديثة:

1. **شريط التنقل والقوائم المنسدلة**:
   - `revamp.css:379, 384`: `.app-menu-dropdown` تستخدم `left: max(...)` بدلاً من `inset-inline-end: max(...)`.
   - `revamp.css:222`: شارة التنبيهات `.badge` تستخدم `top: -7px; left: -7px;` بدلاً من `inset-block-start: -7px; inset-inline-end: -7px;`.
   - `revamp.css:188`: رابط التخطي `.skip-link` يستخدم `top: 10px; right: 10px;` بدلاً من `inset-block-start: 10px; inset-inline-start: 10px;`.

2. **حقول البحث والرموز المرافقة**:
   - `revamp.css:422, 448`: صندوق بحث المخزون `.history-search-box` يحتوي على `.search-icon { right: 14px; }` وحقل `.history-search-input { padding: 0 42px 0 16px; }`.
   - `revamp.css:998, 1053`: صندوق بحث المعجم `.lexicon-search-wrap` يحتوي على `.search-icon { right: 16px; }` وحقل `.lexicon-search-input { padding: 0 46px 0 16px; }`.
   - **التصحيح**: تحويلها إلى `inset-inline-start: 16px;` و `padding-inline-start: 46px; padding-inline-end: 16px;`.

3. **لوحات الاقتباس والشواهد**:
   - `revamp.css:363`: `.example-panel` تستخدم `padding: 0 24px 0 0;` بالتزامن مع `border-inline-start`.
   - **التصحيح**: `padding-block: 0; padding-inline-start: 24px; padding-inline-end: 0;`.

---

### د. إمكانية الوصول وقارئات الشاشة والتنقل بلوحة المفاتيح (A11y, ARIA & Keyboard)

1. **تصحيح دور شارة المراجعات المستحقة (`#due-review-badge`)**:
   - في `index.html:49` و `word.html:132`: الزر يحمل `role="status"`.
   - **المشكلة**: إضافة `role="status"` إلى عنصر `<button>` تحجب وظيفته كزر تفاعلي في شجرة إمكانية الوصول، وتمنع بعض قارئات الشاشة من إتاحة النقر عليه أو قراءته كأداة تحكم.
   - **التصحيح**: إزالة `role="status"` عن الزر، والاحتفاظ بـ `type="button"` و `aria-label="المراجعات المستحقة اليوم: X كلمات"`، أو وضع `role="status"` على عنصر `<span>` داخلي فقط.

2. **إدارة التركيز في حقول الإدخال والتبويبات**:
   - في `revamp.css:446`: حقل بحث المخزون يلغي حلقة التركيز `outline: none` ويكتفي بتغيير لون الإطار.
   - **التصحيح**: إضافة `.history-search-input:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }`.
   - في `word.html:173-176`: أزرار تبويب المخزون (`#tab-history-all`, `#tab-history-favs`) تستخدم `role="tab"` لكنها تفتقر إلى التنقل بالأسهم يميناً ويساراً (Roving tabindex).

3. **اختصارات لوحة المفاتيح ثنائية اللغة (Bilingual Keyboard Shortcuts)**:
   - تميز الكود في `app.js:2220-2260` بدعم الاختصارات باللغتين العربية والإنجليزية (`P`/`ح` للنطق، `F`/`ب` للمفضلة، `H`/`ا` للمخزون، `Q`/`ض` للمراجعة، `?`/`؟` للمساعدة).
   - انتقال الأسهم لليمين واليسار يتوافق بدقة مع حركة الزمن في اللغة العربية (السهم الأيسر هو التالي للأمام، والسهم الأيمن هو السابق للخلف).

---

### هـ. هندسة أهداف اللمس على الأجهزة المحمولة (Touch Target Ergonomics)

تحدد إرشادات WCAG 2.5.5 / 2.5.8 وإرشادات منصات iOS و Android حداً أدنى لمساحة النقر التفاعلية يبلغ **44px × 44px**.

تم رصد العناصر التالية تحت هذا المعيار:
1. **أزرار فهرس الحروف في المعجم (`.lexicon-letter-btn`)**:
   - الأبعاد الحالية: `38px × 38px` (السطر 1137).
   - المقترح: ترقيتها إلى `min-width: 44px; min-height: 44px;`.
2. **أزرار تشغيل الصوت في بطاقات المعجم (`.lexicon-audio-btn`)**:
   - الأبعاد الحالية: `38px × 38px` (السطر 1269).
   - المقترح: `min-width: 44px; min-height: 44px;`.
3. **أزرار فتح الكلمة في بطاقات المعجم (`.lexicon-read-btn`)**:
   - الأبعاد الحالية: `min-height: 38px;` (السطر 1380).
   - المقترح: `min-height: 44px;`.
4. **أزرار خيارات الصوت (`.audio-option-btn`)**:
   - الأبعاد الحالية: `height: 42px;` (السطر 409).
   - المقترح: `min-height: 44px;`.
5. **أزرار إجراءات الشاهد (`.example-action-btn`)**:
   - الارتفاع الحالي ~34px.
   - المقترح: `min-height: 44px; padding-block: 8px;`.
6. **رقائق التصنيفات والوسوم (`.lexicon-pill`, `.lexicon-chip`)**:
   - الارتفاع الحالي بين 24px و 32px.
   - المقترح: زيادة الحشوة الرأسية أو توفير منطقة لمس غير مرئية بمساحة 44px عبر عنصر وهمي `::after`.

---

## 4. خطة التحسينات المقترحة (Prioritized Recommendations)

### المرحلة 1: التحسينات الفورية والحرجة (Quick Wins & Critical Fixes)
1. **دمج ملفات الأنماط**:
   - توحيد `style.css` و `revamp.css` في ملف وحيد رشيق (`style.css` أو `revamp.css`) وإلغاء الاستدعاء المزدوج في `index.html` و `word.html`.
2. **إصلاح رابط المعجم في `word.html`**:
   - إضافة `<a class="nav-explorer-link" href="index.html#lexicon-explorer" title="معجم الجذور والأوزان"><svg class="icon"><use href="#i-search"/></svg> <span>معجم الجذور</span></a>` إلى `#app-menu-dropdown` في `word.html` لإصلاح التنقل واجتياز اختبار `test.js:500`.
3. **إلغاء `role="status"` عن أزرار المراجعة**:
   - تصحيح دلالات زر `#due-review-badge` في كلا الصفحتين.
4. **إلغاء `letter-spacing` و `text-transform` عن النصوص العربية**:
   - حماية اتصال الخط العربي في شريط التنقل، العناوين الفرعية، وملخصات التفاصيل.

### المرحلة 2: صقل التباين وأهداف اللمس (Visual Contrast & Touch Ergonomics)
1. **تصحيح تباين حدود الاقتباسات والملاحظات في الوضع الفاتح**:
   - تعديل ألوان أطر الشواهد الشعرية وملاحظات التثبيت لتحقيق نسبة تباين تتجاوز 4.5:1.
2. **توسيع أهداف اللمس على الهواتف الذكية**:
   - ضبط أزرار الحروف والصوت والقراءة لتكون بحجم 44px × 44px على الأقل.
3. **توحيد الخصائص المنطقية (RTL Logical Properties)**:
   - استبدال كافة التعيينات الفيزيائية المتبقية بخصائص `inset-inline`, `padding-inline`, `border-inline`.

### المرحلة 3: التناغم الحركي وإتقان الخطوط (Typography & Transitions)
1. **توسيع ارتفاع السطور للعناوين العربية**:
   - استخدام `line-height: 1.35` للعناوين وتوفير هوامش أمان لحركات التشكيل.
2. **تفعيل مزايا الخط المتقدمة (OpenType Font Features)**:
   - إضافة `font-feature-settings: "liga" 1, "calt" 1;` و `text-rendering: optimizeLegibility;`.

---

## 5. مقتطفات الشيفرة المقترحة (Code Snippets & Patches)

### أ. تصحيح تباعد الحروف وارتفاع السطور في CSS
```css
/* قبل التصحيح */
.eyebrow, .card-kicker, .reading-label, .accordion-heading > p {
    margin: 0 0 18px;
    color: inherit;
    font: 600 .7rem var(--sans);
    letter-spacing: .15em;
    text-transform: uppercase;
}

.hero h1 {
    font-size: clamp(4.6rem, 10vw, 10rem);
    font-weight: 400;
    line-height: 1.1;
}

/* بعد التصحيح */
.eyebrow, .card-kicker, .reading-label, .accordion-heading > p {
    margin: 0 0 18px;
    color: inherit;
    font: 600 .75rem var(--sans);
    letter-spacing: normal;
    text-transform: none;
}

.hero h1 {
    font-size: clamp(4.6rem, 10vw, 10rem);
    font-weight: 400;
    line-height: 1.3;
    padding-block: .08em;
}
```

### ب. تصحيح أهداف اللمس في المعجم
```css
/* قبل التصحيح */
.lexicon-letter-btn {
    width: 38px;
    height: 38px;
}
.lexicon-audio-btn {
    width: 38px;
    height: 38px;
}
.lexicon-read-btn {
    min-height: 38px;
}

/* بعد التصحيح */
.lexicon-letter-btn {
    min-width: 44px;
    min-height: 44px;
}
.lexicon-audio-btn {
    min-width: 44px;
    min-height: 44px;
}
.lexicon-read-btn {
    min-height: 44px;
}
```

### ج. تصحيح دلالات ARIA في `index.html` و `word.html`
```html
<!-- قبل التصحيح -->
<button id="due-review-badge" class="due-review-badge" type="button" title="المراجعات المستحقة اليوم (Q)" aria-label="المراجعات المستحقة اليوم: 0 كلمات" role="status">
    <span class="due-icon badge-icon">⚡</span>
    <span class="due-count" id="due-count">0</span>
    <span class="due-label">مراجعة</span>
</button>

<!-- بعد التصحيح -->
<button id="due-review-badge" class="due-review-badge" type="button" title="المراجعات المستحقة اليوم (Q)" aria-label="المراجعات المستحقة اليوم: 0 كلمات">
    <span class="due-icon badge-icon" aria-hidden="true">⚡</span>
    <span class="due-count" id="due-count">0</span>
    <span class="due-label">مراجعة</span>
</button>
```

---

## 6. الخلاصة (Conclusion)

يقدم تطبيق "كَلِمات" تجربة لغوية وبصرية فريدة تتميز بالأصالة والهدوء. تطبيق هذه التوصيات سيعزز التوافقية الكاملة مع معايير إمكانية الوصول العالمية (WCAG 2.1 AA/AAA)، ويضمن فصاحة الخط العربي والتشكيل، ويمنح مستخدمي الهواتف والحواسب تجربة مستقرة وبديهية وسلسة تليق بجماليات لغة الضاد.
