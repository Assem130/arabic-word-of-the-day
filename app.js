// ponytail: embedded word list database directly in code to avoid fetch/CORS errors when running from a local file protocol (file://)
const WORDS_DB = [
    {
        id: 1,
        word: "السَّمَيْدَع",
        pronunciation: "/as-samayda‘/",
        vocalization: "بفتح السين والميم، وسكون الياء، وفتح الدال",
        weight: "فَعَيْلَل",
        root: "س م د ع",
        category: "شجاعة وسيادة",
        meaning: "السيد الشريف الشجاع الكريم، الجريء في أفعاله الذي لا يهاب المصاعب أو المهالك.",
        example: "أعينيّ جودا ولا تجمدا ... ألا تبكيان لصخر الندى؟ ألا تبكيان الجريء الجميل؟ ألا تبكيان الفتى السَّمَيْدَعا؟ — الخنساء"
    },
    {
        id: 2,
        word: "الخِنْذِيذ",
        pronunciation: "/al-khindheedh/",
        vocalization: "بكسر الخاء والذال الأولى، وسكون النون",
        weight: "فِعْلِيل",
        root: "خ ن ذ ذ",
        category: "بلاغة وسيادة",
        meaning: "السيد الحليم الواسع الصبر، ويطلق كذلك على الشاعر الفذ والمفلق ذي القريحة البديعة، وعلى الشجاع البطل والخيل الجياد الكريمة.",
        example: "وإني من القوم الذين سَمَوْا بهِمْ... خَنَاذِيذُ غُلْبٌ في الخطوبِ شِدادُ — شجاع بن وهب"
    },
    {
        id: 3,
        word: "الدَّيْمَة",
        pronunciation: "/ad-daymah/",
        vocalization: "بفتح الدال وسكون الياء",
        weight: "فَعْلَة",
        root: "د و م",
        category: "طبيعة ومطر",
        meaning: "المطر الذي يدوم في هدوء وسكون أياماً، بلا رعد مخيف ولا برق خاطف ولا عواصف.",
        example: "سُئلت عائشة رضي الله عنها عن عمل رسول الله ﷺ فقالت: «كانَ عَمَلُهُ دِيمَةً» (أي مستمراً في هدوء وسكينة)."
    },
    {
        id: 4,
        word: "العَرَمْرَم",
        pronunciation: "/al-‘aramram/",
        vocalization: "بفتح العين والراء والميم الأولى، وسكون الراء الثانية",
        weight: "فَعَلْعَل",
        root: "ع ر م",
        category: "شجاعة وحرب",
        meaning: "الجيش العظيم الكثيف الشديد، والشيء الكثير القوي الذي لا يغلب.",
        example: "طلبتَهمُ على كَبِدِ الأُتَيْمِ... بِجَمْعٍ مِنْ بَنِي نِزَارٍ عَرَمْرَمِ — المتنبي"
    },
    {
        id: 5,
        word: "الوَصَب",
        pronunciation: "/al-wasab/",
        vocalization: "بفتح الواو والصاد",
        weight: "فَعَل",
        root: "و ص ب",
        category: "حياة وإنسان",
        meaning: "الوجع والمرض المستمر الملازم، والضعف الدائم الذي يصيب الجسد من شدة التعب.",
        example: "قوله تعالى: ﴿وَلَهُ الدِّينُ وَاصِبًا﴾ (أي دائماً ثابتاً)، وفي الحديث الشريف: «ما يصيب المسلم من نصب ولا وصب»."
    },
    {
        id: 6,
        word: "الصَّبَابَة",
        pronunciation: "/as-sababah/",
        vocalization: "بفتح الصاد والباء الأولى المشددة",
        weight: "فَعَالَة",
        root: "ص ب ب",
        category: "مشاعر وعاطفة",
        meaning: "الشوق الرقيق والحرقة ولوع الغرام، أو بقية الماء اليسيرة المتبقية في أسفل الإناء.",
        example: "ولقد وقفتُ على ديارهمُ... والدمعُ يسبقني بصَبابةِ الوَجْدِ — الشريف الرضي"
    },
    {
        id: 7,
        word: "الغَسَق",
        pronunciation: "/al-ghasaq/",
        vocalization: "بفتح الغين والسين",
        weight: "فَعَل",
        root: "غ س ق",
        category: "وقت وزمن",
        meaning: "أول ظلمة الليل بعد غروب الشمس، أو اشتداد الظلام الحالك وتكامل عتمة الليل.",
        example: "قوله تعالى: ﴿أَقِمِ الصَّلَاةَ لِدُلُوكِ الشَّمْسِ إِلَىٰ غَسَقِ اللَّيْلِ﴾."
    },
    {
        id: 8,
        word: "الأَثِيل",
        pronunciation: "/al-atheel/",
        vocalization: "بفتح الهمزة وكسر الثاء",
        weight: "فَعِيل",
        root: "أ ث ل",
        category: "بلاغة وسيادة",
        meaning: "المجد الأصيل العريق الراسخ ذو الأصول الطيبة، والمال أو الشرف الموروث المتراكم عبر الأجيال.",
        example: "وَنَحْنُ مُلُوكُ النَّاسِ مِنْ عَهْدِ آدَمٍ... لَنَا شَرَفٌ صَعْبٌ وَمَجْدٌ أَثِيلُ — امرؤ القيس"
    },
    {
        id: 9,
        word: "اليَهْمَاء",
        pronunciation: "/al-yahmaa’/",
        vocalization: "بفتح الياء وسكون الهاء، ممدودة",
        weight: "فَعْلَاء",
        root: "ي ه م",
        category: "طبيعة وأرض",
        meaning: "الأرض الفضاء الواسعة، القفر الجافة التي لا ماء فيها ولا طريق واضح يُهتدى به.",
        example: "وَلَقَدْ أَبِيتُ عَلَى الطَّوَى وَأَظَلُّهُ... حَتَّى أَنَالَ بِهِ كَرِيمَ المَأْكَلِ في يَهْمَاءَ عاتيةٍ — عنترة بن شداد"
    },
    {
        id: 10,
        word: "الأَبْلَق",
        pronunciation: "/al-ablaq/",
        vocalization: "بفتح الهمزة واللام، وسكون الباء",
        weight: "أَفْعَل",
        root: "ب ل ق",
        category: "وصف وألوان",
        meaning: "الشيء الذي اجتمع فيه لونان: سواد وبياض مختلطان، ويشتهر به الخيل والقصور القديمة كحصن الأبلق الفرد للسموأل.",
        example: "تركتُ قَرينَ القلبِ يُدْمى حشاياهُ... على كلِّ أبلَقَ كالظِّمْءِ شَمَرْدَلِ — امرؤ القيس"
    },
    {
        id: 11,
        word: "الهَتُون",
        pronunciation: "/al-hatoon/",
        vocalization: "بفتح الهاء وضم التاء",
        weight: "فَعُول",
        root: "ه ت ن",
        category: "طبيعة ومطر",
        meaning: "السحاب الذي يصب مطراً غزيراً متتابعاً ببطء وسكون، أو الدمع السائل الغزير المنسكب.",
        example: "فَأَصْبَحَ مَغْنَاكُمْ بِهِ مُتَأَلِّقًا... بِجَوْدٍ مِنَ الأَنْوَاءِ غَمْرٍ هَتُونِ — البحتري"
    },
    {
        id: 12,
        word: "السُّهَاد",
        pronunciation: "/as-suhaad/",
        vocalization: "بضم السين وفتح الهاء",
        weight: "فُعَال",
        root: "س هـ د",
        category: "حياة وإنسان",
        meaning: "الأرق والامتناع التام عن النوم بالليل من شدة الهم والغم، أو الوجد والشوق والمخاوف.",
        example: "يَا سَاهِرًا في الدُّجَى يُسْنِيهِ سُهَادُهُ... هَلْ لِلفُؤَادِ جَوَابٌ يَنْتَهِي عَنْهُ؟ — ابن زيدون"
    },
    {
        id: 13,
        word: "العَبَق",
        pronunciation: "/al-‘abaq/",
        vocalization: "بفتح العين والباء",
        weight: "فَعَل",
        root: "ع b q",
        root: "ع ب ق",
        category: "حواس وجمال",
        meaning: "رائحة الطيب الذكية إذا علقت بالثوب أو المكان وثبتت فيه واستمرت طويلاً.",
        example: "أَمِنْ أُمِّ الصَّبِيِّ صَرَمْتَ الحَبْلا... وَقَدْ أَوْرَثَتْ فِي القَلْبِ عَبَقا؟ — جرير"
    },
    {
        id: 14,
        word: "التَّلِيد",
        pronunciation: "/at-taleed/",
        vocalization: "بفتح التاء وكسر اللام",
        weight: "فَعِيل",
        root: "و ل د",
        category: "بلاغة وسيادة",
        meaning: "القديم الموروث من مجد أو شرف أو مال وعز (وعكسه الطريف، وهو الجديد المستحدث).",
        example: "فَمَا زَالَ تِشْرَابِي الخُمُورَ وَلَذَّتِي... وَبَيْعِي وَإِنْفَاقِي طَرِيفِي وَتَلِيدِي — طرفة بن العبد"
    },
    {
        id: 15,
        word: "السُّلاَف",
        pronunciation: "/as-sulaaf/",
        vocalization: "بضم السين وفتح اللام",
        weight: "فُعَال",
        root: "س ل ف",
        category: "وصف وجمال",
        meaning: "أفضل وخلاصة كل شيء، ويطلق تاريخياً على أول ما يسيل من عصير العنب بلا عصر شديد.",
        example: "كَأَنَّ سُلافَةً صُفِّيَتْ بِمَاءٍ... تَجُولُ بِرِيقِهَا بَعْدَ المَنَامِ — امرؤ القيس"
    },
    {
        id: 16,
        word: "الرُّضَاب",
        pronunciation: "/ar-rudaab/",
        vocalization: "بضم الراء وفتح الضاد",
        weight: "فُعَال",
        root: "ر ض ب",
        category: "مشاعر وعاطفة",
        meaning: "اللعاب العذب البارد الرقيق في الفم، أو رذاذ الماء العذب، وحبات الندى المتساقطة على الزهر كقطع اللؤلؤ.",
        example: "فَرَشْفُ رُضَابِكَ الشَّافِي شِفَائِي... وَلَكِنْ دُونَ مَوْرِدِهِ بَلاءُ — المتنبي"
    },
    {
        id: 17,
        word: "التَّوْق",
        pronunciation: "/at-tawq/",
        vocalization: "بفتح التاء وسكون الواو",
        weight: "فَعْل",
        root: "ت و ق",
        category: "مشاعر وعاطفة",
        meaning: "النزوع النفسي الشديد واللهفة الصادقة والشوق الغامر للوصول إلى شيء أو ملاقاة حبيب.",
        example: "عَمَرْتُ بِهِ شَرْخَ الشَّبَابِ وَإِنَّمَا... بَنَى تَوْقَ نَفْسِي لِلْحَبِيبِ مَنَازِلَا — ابن الرومي"
    },
    {
        id: 18,
        word: "الخَفَر",
        pronunciation: "/al-khafar/",
        vocalization: "بفتح الخاء والفاء",
        weight: "فَعَل",
        root: "خ ف ر",
        category: "صفات وأخلاق",
        meaning: "شدة الحياء والوقار العظيم وصون النفس العفيفة والترفع عن القبيح.",
        example: "يَغْضِينَ غَضَّ الخَافِرَاتِ طَلالَةً... وَيُجِيبْنَ عَنْ أَرَبٍ بِحُسْنِ خَفَارِ — جرير"
    },
    {
        id: 19,
        word: "الجَذَل",
        pronunciation: "/al-jadhal/",
        vocalization: "بفتح الجيم والذال",
        weight: "فَعَل",
        root: "ج ذ ل",
        category: "مشاعر وعاطفة",
        meaning: "الفرح الشديد والابتهاج والسرور التام الذي ينشرح به الصدر ويرتاح له القلب.",
        example: "فَإِنَّ الحُسْنَ بَعْضُ جَذَلِ المَعَالِي... وَإِنَّ المَجْدَ بَعْضُ نَدَى اليَدَيْنِ — المتنبي"
    },
    {
        id: 20,
        word: "الكَمَد",
        pronunciation: "/al-kamad/",
        vocalization: "بفتح الكاف والميم",
        weight: "فَعَل",
        root: "ك م د",
        category: "مشاعر وعاطفة",
        meaning: "الحزن المكتوم الشديد في الصدر الذي لا يستطيع صاحبه إفشاءه أو إظهاره للناس فيمرض به قلبه.",
        example: "فَقَدْ بَانَ عَنِّي صَبْرِي وَأَوْرَثَنِي الكَمَدْ... فَتًى كَانَ لِي عَوْنًا عَلَى كُلِّ ذِي نَكَدْ — الخنساء"
    },
    {
        id: 21,
        word: "الفَنَن",
        pronunciation: "/al-fanan/",
        vocalization: "بفتح الفاء والنون الأولى",
        weight: "فَعَل",
        root: "ف ن ن",
        category: "طبيعة وأرض",
        meaning: "الغصن المستقيم الرطب النضر في الشجرة، وتجمع على (أفنان) دلالة على جمال البساتين.",
        example: "قوله تعالى: ﴿ذَوَاتَا أَفْنَانٍ﴾ (أي أغصان نضرة ومثمرة في الجنة)."
    },
    {
        id: 22,
        word: "الخِلّ",
        pronunciation: "/al-khill/",
        vocalization: "بكسر الخاء وتشديد اللام",
        weight: "فِعْل",
        root: "خ ل ل",
        category: "علاقات وإنسان",
        meaning: "الصديق المخلص الصادق الود الملازم الذي يماثلك في الطباع ولا يخون عهدك وسرائرك.",
        example: "شَرُّ البِلادِ مَكَانٌ لا صَدِيقَ بِهِ... وَشَرُّ مَا يَكْسِبُ الإِنْسَانُ مَا يَصِمُ... وَشَرُّ الخِلَّانِ مَنْ لا يُرْجَى نَفْعُهُ — المتنبي"
    },
    {
        id: 23,
        word: "العِشْق",
        pronunciation: "/al-‘ishq/",
        vocalization: "بكسر العين وسكون الشين",
        weight: "فِعْل",
        root: "ع ش ق",
        category: "مشاعر وعاطفة",
        meaning: "إفراط الحب وفرط التعلق بالمحبوب حتى يملك مجامع القلب ويستولي على العقل والروح.",
        example: "قَلْبِي يُحَدِّثُنِي بِأَنَّكَ مُتْلِفِي... رُوحِي فِدَاكَ عَرَفْتَ أَمْ لَمْ تَعْرِفِ... لَمْ أَقْضِ حَقَّ هَوَاكَ إِنْ كُنْتُ لَمْ أَمُتْ عِشْقًا — ابن الفارض"
    },
    {
        id: 24,
        word: "الأَرِيج",
        pronunciation: "/al-areej/",
        vocalization: "بفتح الهمزة وكسر الراء",
        weight: "فَعِيل",
        root: "أ ر ج",
        category: "حواس وجمال",
        meaning: "انتشار الرائحة الطيبة العطرة وتوهج أريج الأزهار والطيب في الأرجاء.",
        example: "فَاحَ الأَرِيجُ بِنَدِّ عِطْرٍ فَاخِرٍ... كَمِسْكِ رَوْضٍ بَعْدَ سَيْلٍ مَاطِرِ — شاعر قديم"
    },
    {
        id: 25,
        word: "الشَّجَن",
        pronunciation: "/ash-shajan/",
        vocalization: "بفتح الشين والجيم",
        weight: "فَعَل",
        root: "ش ج ن",
        category: "مشاعر وعاطفة",
        meaning: "الحزن والهم المتشابك الملازم للقلب من لوعة الشوق أو كربة الحياة، والحاجة الشاغلة للنفس.",
        example: "هَيَّجْتَ لِي شَجَنًا قَدْ كُنْتُ نَاسِيَهُ... وَأَيْقَظَتْ عَيْنِيَ العَبْرَى سَنَا الفَجْرِ — شاعر قديم"
    },
    {
        id: 26,
        word: "الهُيَام",
        pronunciation: "/al-huyaam/",
        vocalization: "بضم الهاء وفتح الياء",
        weight: "فُعَال",
        root: "هـ ي م",
        category: "مشاعر وعاطفة",
        meaning: "أشد درجات الحب والوجد حتى يفقد العاشق رشده ويهيم على وجهه، أو العطش الشديد الذي لا يروى.",
        example: "وَمَا حُبُّ الدِّيَارِ شَغَفْنَ قَلْبِي... وَلَكِنْ حُبُّ مَنْ سَكَنَ الدِّيَارَا... هُيَامٌ لا يُفَارِقُنِي — قيس بن الملوح"
    },
    {
        id: 27,
        word: "الوَتِين",
        pronunciation: "/al-wateen/",
        vocalization: "بفتح الواو وكسر التاء",
        weight: "فَعِيل",
        root: "و ت ن",
        category: "حياة وإنسان",
        meaning: "شريان القلب الرئيسي (الأبهر) الذي يغذي جسم الإنسان بالدم وإذا انقطع أو تلف هلك صاحبه فوراً.",
        example: "قوله تعالى: ﴿ثُمَّ لَقَطَعْنَا مِنْهُ الْوَتِينَ﴾."
    },
    {
        id: 28,
        word: "الوَرَى",
        pronunciation: "/al-waraa/",
        vocalization: "بفتح الواو والراء",
        weight: "فَعَل",
        root: "و ر ي",
        category: "حياة وإنسان",
        meaning: "الخلق والناس أجمعين من البشر السائرين على وجه الأرض.",
        example: "خَيْرُ الوَرَى نَسَبًا وَأَكْرَمُهُمْ أَبًا... وَأَجَلُّ مَنْ حَمَلَتْهُ أَرْضٌ أَوْ سَمَا — البحتري"
    },
    {
        id: 29,
        word: "السَّكِينَة",
        pronunciation: "/as-sakeenah/",
        vocalization: "بفتح السين وكسر الكاف",
        weight: "فَعِيلَة",
        root: "س ك ن",
        category: "صفات وأخلاق",
        meaning: "الطمأنينة والهدوء العالي، والوقار والرحمة التي تتنزل على النفوس فتهدئ روعها وقلقها.",
        example: "قوله تعالى: ﴿هُوَ الَّذِي أَنْزَلَ السَّكِينَةَ فِي قُلُوبِ الْمُؤْمِنِينَ﴾."
    },
    {
        id: 30,
        word: "الجَوْد",
        pronunciation: "/al-jawd/",
        vocalization: "بفتح الجيم وسكون الواو",
        weight: "فَعْل",
        root: "ج و د",
        category: "طبيعة ومطر",
        meaning: "المطر الغزير الكثيف الذي يروي عطش الأرض الجافة ويعيد إليها الحياة والخصوبة.",
        example: "دِيَارٌ لَهَا بِالرَّقْمَتَيْنِ كَأَنَّهَا... مَرَاجِعُ وَشْمٍ فِي نَوَاشِرِ مِعْصَمِ... سَقَاهَا رَوَايَا الجَوْدِ — امرؤ القيس"
    },
    {
        id: 31,
        word: "السُّمُوّ",
        pronunciation: "/as-sumuww/",
        vocalization: "بضم السين والميم وتشديد الواو",
        weight: "فُعُول",
        root: "س م و",
        category: "صفات وأخلاق",
        meaning: "العلو والارتقاء والرفعة بالنفس والأخلاق والمنزلة العالية البعيدة عن صغائر الأمور.",
        example: "سُمُوٌّ فِي الحَيَاةِ وَفِي المَمَاتِ... لَقَدْ نِلْتَ المَعَالِيَ كُلَّ آنِ — أبو تمام"
    },
    {
        id: 32,
        word: "الوِئَام",
        pronunciation: "/al-wi’aam/",
        vocalization: "بكسر الواو وفتح الهمزة",
        weight: "فِعَال",
        root: "و ء م",
        category: "علاقات وإنسان",
        meaning: "الاتفاق الصادق، والتفاهم والوفاق والمحبة التي تجمع القلوب وتمنع الخصومات.",
        example: "وَمَا العَيْشُ إِلَّا أَنْ نَعِيشَ بِأُلْفَةٍ... وَأَنْ يَجْمَعَ الشَّمْلَ التَّآخِي وَالوِئَامُ — شاعر قديم"
    },
    {
        id: 33,
        word: "الغَبْطَة",
        pronunciation: "/al-ghabtah/",
        vocalization: "بفتح الغين وسكون الباء",
        weight: "فَعْلَة",
        root: "غ ب ط",
        category: "مشاعر وعاطفة",
        meaning: "تمني مثل نعمة الآخرين وسعادتهم دون أن تزول عنهم، وفرح وسرور النفس بنعم الله الجزيلة.",
        example: "فِي غَبْطَةٍ وَسُرُورٍ لا انْقِطَاعَ لَهُ... مَعَ الأَحِبَّةِ فِي رَغْدٍ مِنَ العُمُرِ — ابن معتوق"
    },
    {
        id: 34,
        word: "الصَّمَد",
        pronunciation: "/as-samad/",
        vocalization: "بفتح الصاد والميم",
        weight: "فَعَل",
        root: "ص م د",
        category: "بلاغة وسيادة",
        meaning: "السيد المطاع ذو المنزلة العليا الذي لا يُقضى أمر دونه، والمقصود والملجأ في الحوائج والنوائب الكبرى.",
        example: "قوله تعالى: ﴿اللَّهُ الصَّمَدُ﴾، وقول الشاعر: «بِعَمْرِو بْنِ مَسْعُودٍ وَبِالسَّيِّدِ الصَّمَدْ»."
    },
    {
        id: 35,
        word: "الفَلَق",
        pronunciation: "/al-falaq/",
        vocalization: "بفتح الفاء واللام",
        weight: "فَعَل",
        root: "ف ل ق",
        category: "وقت وزمن",
        meaning: "ضوء الصبح الساطع الذي يشق ظلمة الليل الحالكة ليؤذن ببداية النهار.",
        example: "قوله تعالى: ﴿قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ﴾."
    },
    {
        id: 36,
        word: "القَهْقَرَى",
        pronunciation: "/al-qahqaraa/",
        vocalization: "بفتح القاف والهاء وسكون القاف الثانية",
        weight: "فَعْلَلَى",
        root: "ق هـ ق ر",
        category: "وصف وحركة",
        meaning: "الرجوع إلى الخلف أو التراجع إلى الوراء دون استدارة الوجه أو الالتفات.",
        example: "رجع القومُ القهقرى إذا تراجعوا منهزمين في ساحة المعركة."
    },
    {
        id: 37,
        word: "الرَّغَد",
        pronunciation: "/ar-raghad/",
        vocalization: "بفتح الراء والغين",
        weight: "فَعَل",
        root: "ر غ د",
        category: "حياة وإنسان",
        meaning: "العيش الهنيء الطيب الواسع الكثير النعم، والحياة المريحة المليئة بالرخاء والاستقرار.",
        example: "قوله تعالى: ﴿وَكُلَا مِنْهَا رَغَدًا حَيْثُ شِئْتُمَا﴾."
    },
    {
        id: 38,
        word: "الفِرَاسَة",
        pronunciation: "/al-firaasah/",
        vocalization: "بكسر الفاء وفتح الراء",
        weight: "فِعَالَة",
        root: "ف ر س",
        category: "تفكير وذكاء",
        meaning: "قوة الفطنة والذكاء والمهارة في الاستدلال بالأحوال الظاهرة لمعرفة الأخلاق والبواطن الخفية.",
        example: "في الحديث الشريف: «اتقوا فراسة المؤمن فإنه ينظر بنور الله»، وقول الشاعر: «أَرَى بِفِرَاسَتِي مَا لا يُرَاهُ»."
    },
    {
        id: 39,
        word: "الهَمْس",
        pronunciation: "/al-hams/",
        vocalization: "بفتح الهاء وسكون الميم",
        weight: "فَعْل",
        root: "هـ م س",
        category: "حواس وجمال",
        meaning: "الكلام الخفي السري الدقيق الذي لا يُسمع منه إلا الصوت الواهي، أو وقع الأقدام الخفيف.",
        example: "قوله تعالى: ﴿فَلَا تَسْمَعُ إِلَّا هَمْسًا﴾."
    },
    {
        id: 40,
        word: "الأَرِيب",
        pronunciation: "/al-areeb/",
        vocalization: "بفتح الهمزة وكسر الراء",
        weight: "فَعِيل",
        root: "أ ر ب",
        category: "تفكير وذكاء",
        meaning: "العاقل اللبيب والذكي الفطن ذو الرأي السديد والبصيرة والحيلة المجربة في تصريف الأمور.",
        example: "لَبِسْتَ الخَلْعَةَ الحَمْرَاءِ زُهْوًا... وَكُنْتَ أَرِيبًا فِي كُلِّ أَمْرِ — المتنبي"
    },
    {
        id: 41,
        word: "الدُّجَى",
        pronunciation: "/ad-dujaa/",
        vocalization: "بضم الدال وفتح الجيم",
        weight: "فُعَل",
        root: "د ج و",
        category: "وقت وزمن",
        meaning: "الظلمات الشديدة الحالكة السواد (مفردها دُجية)، وتستخدم للدلالة على أوقات الليل الصعبة.",
        example: "إِذَا مَا اللَّيْلُ أَسْدَلَ مِعْطَفَيْهِ... وَمَدَّ الدُّجَى عَلَى الكَوْنِ السِّتَارَا — شاعر حديث"
    },
    {
        id: 42,
        word: "النَّوَى",
        pronunciation: "/an-nawaa/",
        vocalization: "بفتح النون والواو",
        weight: "فَعَل",
        root: "ن و ي",
        category: "مشاعر وعاطفة",
        meaning: "البعد والرحيل والغربة والارتحال عن الوطن والأهل والأحبة، ويطلق كذلك على النواة.",
        example: "بِنْتُمْ وَبِنَّا فَمَا ابْتَلَّتْ جَوَانِحُنَا... شَوْقًا إِلَيْكُمْ وَلا جَفَّتْ مَآقِينَا... كَانَ النَّوَى يَسْقِي نَدَامَانَا — ابن زيدون"
    },
    {
        id: 43,
        word: "النَّجْوى",
        pronunciation: "/an-najwaa/",
        vocalization: "بفتح النون وسكون الجيم",
        weight: "فَعْلَى",
        root: "ن ج و",
        category: "حواس وجمال",
        meaning: "الحديث السري والهمس الخفي الخالص بين شخصين أو أكثر، ومناجاة الروح لخالقها في جوف الليل.",
        example: "قوله تعالى: ﴿إِذْ هُمْ نَجْوَىٰ﴾."
    },
    {
        id: 44,
        word: "الأَثَرَة",
        pronunciation: "/al-atharah/",
        vocalization: "بفتح الهمزة والثاء والراء",
        weight: "فَعَلَة",
        root: "أ ث ر",
        category: "صفات وأخلاق",
        meaning: "الأنانية والاستئثار بالخير والمنفعة لنفسه وحجبها عن الآخرين (وهي عكس الإيثار).",
        example: "في الحديث الشريف: «إنكم سترون بعدي أثرة وأموراً تنكرونها»."
    },
    {
        id: 45,
        word: "الخُيَلاء",
        pronunciation: "/al-khuyalaa’/",
        vocalization: "بضم الخخاء وفتح الياء، ممدودة",
        weight: "فُعَلَاء",
        root: "خ ي ل",
        category: "صفات وأخلاق",
        meaning: "التكبر والتبختر والعجب بالنفس في المشية والتكبر على الآخرين زهواً بالمال أو النسب.",
        example: "قوله تعالى: ﴿إِنَّ اللَّهَ لَا يُحِبُّ مَنْ كَانَ مُخْتَالًا فَخُورًا﴾، وفي الشعر: «يَمْشِي الخُيَلاءَ إِعْجَابًا بِمَنْزِلَةٍ»."
    },
    {
        id: 46,
        word: "النَّضِير",
        pronunciation: "/an-nadeer/",
        vocalization: "بفتح النون وكسر الضاد",
        weight: "فَعِيل",
        root: "ن ض ر",
        category: "وصف وجمال",
        meaning: "الذهب الخالص اللامع، أو الشيء والوجه المشرق الممتلئ حسناً ونضارة ونعمة وبهاءً.",
        example: "وَجْهٌ نَضِيرٌ وَخَدٌّ زَانَهُ شَنَفٌ... يَسْبِي القُلُوبَ إِذَا مَا رَنَّ نَاظِرُهُ — شاعر قديم"
    },
    {
        id: 47,
        word: "العَسْعَسَة",
        pronunciation: "/al-‘as‘asah/",
        vocalization: "بفتح العين والسين الأولى وسكون العين الثانية",
        weight: "فَعْلَلَة",
        root: "ع س س",
        category: "وقت وزمن",
        meaning: "إقبال الليل بظلامه وسواده في أوله، أو إدباره وولايته وانقشاعه عند أول الفجر (وهي من الأضداد).",
        example: "قوله تعالى: ﴿وَاللَّيْلِ إِذَا عَسْعَسَ﴾."
    },
    {
        id: 48,
        word: "القَرِيحَة",
        pronunciation: "/al-qareehaah/",
        vocalization: "بفتح القاف وكسر الراء",
        weight: "فَعِيلَة",
        root: "ق ر ح",
        category: "تفكير وذكاء",
        meaning: "الموهبة والفطرة والطبيعة التي ينطلق منها الكلام البليغ والشعر الرائق بلا جهد وتكلف.",
        example: "فُلانٌ ذُو قَرِيحَةٍ بَاضِعَةٍ فِي الشِّعْرِ، وجادت قريحته بأبدع الأبيات."
    },
    {
        id: 49,
        word: "الشَّنَف",
        pronunciation: "/ash-shanaf/",
        vocalization: "بفتح الشين والنون",
        weight: "فَعَل",
        root: "ش ش ن ف",
        root: "ش ن ف",
        category: "حواس وجمال",
        meaning: "القرط الذي يُعلق في الجزء الأعلى من أذن المرأة لتزيينها، والتطلع والنظر الطويل إعجاباً وشغفاً.",
        example: "يَرَى الشَّنَفَ فِي أُذُنَيْ غَزَالٍ مُهَفْهَفٍ... فَيَسْكُبُ دَمْعًا كَاللُّجَيْنِ المُنَظَّمِ — المتنبي"
    },
    {
        id: 50,
        word: "الوَهَن",
        pronunciation: "/al-wahan/",
        vocalization: "بفتح الواو والهاء",
        weight: "فَعَل",
        root: "و هـ ن",
        category: "حياة وإنسان",
        meaning: "الضعف الشديد، والفتور والكلل والتعب والعجز الذي يحل في البدن أو يضعف العزائم.",
        example: "قوله تعالى: ﴿قَالَ رَبِّ إِنِّي وَهَنَ الْعَظْمُ مِنِّي﴾، وفي موضع آخر: ﴿وَلَا تَهِنُوا وَلَا تَحْزَنُوا﴾."
    },
    {
        id: 51,
        word: "الحِجَى",
        pronunciation: "/al-hijaa/",
        vocalization: "بكسر الحاء وفتح الجيم",
        weight: "فِعَل",
        root: "ح ج ي",
        category: "تفكير وذكاء",
        meaning: "العقل والوعي الراجح، والفطنة وحدة الذكاء والقدرة على التدبر والفهم.",
        example: "وَإِنَّمَا رَأْيُ الفَتَى بَعْدَ الحِجَى... يَجْلُو العَمَى عَنْ حَائِرٍ فِيهِ الرَّدَى — أبو تمام"
    },
    {
        id: 52,
        word: "الوِقَار",
        pronunciation: "/al-wiqaar/",
        vocalization: "بكسر الواو وفتح القاف",
        weight: "فِعَال",
        root: "و ق ر",
        category: "صفات وأخلاق",
        meaning: "الرزانة والهدوء، والسكينة والسمت الطيب الذي يهابه الناس ويعظمه المحيطون لمهابته.",
        example: "يَمْشِي وَفِيهِ مِنَ الوِقَارِ جَلالَةٌ... تَهَابُهُ الأَعْيُنُ وَتُعَظِّمُهُ القُلُوبُ — البحتري"
    },
    {
        id: 53,
        word: "الصَّدَى",
        pronunciation: "/as-sadaa/",
        vocalization: "بفتح الصاد والدال",
        weight: "فَعَل",
        root: "ص د ي",
        category: "حواس وجمال",
        meaning: "رجع الصوت وتكرره وانعكاسه في الجبال والوديان والبيوت الفارغة، أو العطش الشديد.",
        example: "وَمَا أَنَا إِلَّا صَدَى صَوْتِكُمْ... إِذَا صِحْتُمُ صِحْتُ أَوْ كُنْتُمُ — امرؤ القيس"
    },
    {
        id: 54,
        word: "التَّبَتُّل",
        pronunciation: "/at-tabattul/",
        vocalization: "بفتح التاء والباء وضم التاء الثانية المشددة",
        weight: "تَفَعُّل",
        root: "ب ت ل",
        category: "صفات وأخلاق",
        meaning: "الزهد التام والانقطاع للعبادة والإخلاص لله سبحانه وتعالى والإعراض عما يشغل النفس عن طاعته.",
        example: "قوله تعالى: ﴿وَاذْكُرِ اسْمَ رَبِّكَ وَتَبَتَّلْ إِلَيْهِ تَبْتِيلًا﴾."
    },
    {
        id: 55,
        word: "الحَمِيَّة",
        pronunciation: "/al-hamiyyah/",
        vocalization: "بفتح الحاء وكسر الميم وتشديد الياء",
        weight: "فَعِيلَة",
        root: "ح م ي",
        category: "صفات وأخلاق",
        meaning: "الأنفة والشرف والغيرة الشديدة والحرص على حماية العرض والكرامة والذمار والدفاع عنها.",
        example: "أَبَتْ حَمِيَّتُهُ أَنْ يَقْبَلَ الضَّيْمَ... وَسَارَ فِي جَيْشٍ يَشُقُّ الظَّلْمَ — جرير"
    },
    {
        id: 56,
        word: "السَّمَر",
        pronunciation: "/as-samar/",
        vocalization: "بفتح السين والميم",
        weight: "فَعَل",
        root: "س م ر",
        category: "علاقات وإنسان",
        meaning: "الحديث اللطيف، وتبادل أطراف الكلام ليلاً مع الأصدقاء تحت ضوء القمر والنجوم الساطعة.",
        example: "طَابَ السَّمَرُ فِي لَيْلَةٍ قَمْرَاءِ... بِقُرْبِ أَحِبَّةٍ لَهُمْ عِنْدِي مَكَانَةُ العَلْيَاءِ — ابن خفاجة"
    },
    {
        id: 57,
        word: "الأَفَل",
        pronunciation: "/al-afal/",
        vocalization: "بفتح الهمزة والفاء",
        weight: "فَعَل",
        root: "أ ف ل",
        category: "وقت وزمن",
        meaning: "الغروب والغياب والغياب التام خلف الأفق، ويقال أفل نجمه للدلالة على أفول الشهرة.",
        example: "قوله تعالى: ﴿فَلَمَّا أَفَلَ قَالَ لَا أُحِبُّ الْآفِلِينَ﴾."
    },
    {
        id: 58,
        word: "الغَسِيل",
        pronunciation: "/al-ghaseel/",
        vocalization: "بفتح الغين وكسر السين",
        weight: "فَعِيل",
        root: "غ س ل",
        category: "طبيعة ومطر",
        meaning: "المطر الغزير المتدفق بقوة كأنما يغسل الأرض ويطهر الشجر والجبال من الغبار والدرن.",
        example: "سَقَى دارَ مَيّةَ بَعْدَ البِلَى... غَسِيلُ الغَمامِ وَوَبْلٌ هَطِلْ — الفرزدق"
    },
    {
        id: 59,
        word: "الوَلَه",
        pronunciation: "/al-walah/",
        vocalization: "بفتح الواو واللام",
        weight: "فَعَل",
        root: "w l h",
        root: "و ل هـ",
        category: "مشاعر وعاطفة",
        meaning: "الحيرة والذهول وفقدان العقل والصبر من شدة الحب أو لوعة الفراق والوجد المأساوي.",
        example: "وَإِنِّي لأَلْقَى الوَلَهَ فِي كُلِّ سَاعَةٍ... إِذَا مَا ذَكَرْتُ العَهْدَ وَالعَامِرِيَّةَ — قيس بن الملوح"
    },
    {
        id: 60,
        word: "الخَفُوق",
        pronunciation: "/al-khafooq/",
        vocalization: "بفتح الخاء وضم الفاء",
        weight: "فَعُول",
        root: "خ ف q",
        root: "خ ف ق",
        category: "مشاعر وعاطفة",
        meaning: "القلب الشديد النبض والخفقان من شدة الحب أو الخوف، أو الريح السريعة الشديدة الهبوب.",
        example: "عَيْنِي عَلَى الدَّرْبِ وَالقَلْبُ الخَفُوقُ... يَرْنُو إِلَيْكُمْ بِشَوْقٍ لَيْسَ يُطِيقُهُ — ابن الرومي"
    }
];

// App State Management (ponytail: native localStorage state to manage daily assignment & learned history)
let appState = {
    todayWord: null,
    todayDateString: "",
    learnedWords: []
};

// DOM Elements
const elMainWord = document.getElementById("main-word");
const elDateDisplay = document.getElementById("date-display");
const elVocalization = document.getElementById("word-vocalization");
const elWeight = document.getElementById("word-weight");
const elRoot = document.getElementById("word-root");
const elCategory = document.getElementById("word-category");
const elMeaning = document.getElementById("word-meaning");
const elExampleText = document.getElementById("word-example-text");
const elCountdownTimer = document.getElementById("countdown-timer");

const btnSpeak = document.getElementById("btn-speak");
const btnShare = document.getElementById("btn-share");
const btnCopyLink = document.getElementById("btn-copy-link");
const btnToggleHistory = document.getElementById("btn-toggle-history");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const btnToggleMenu = document.getElementById("btn-toggle-menu");

const drawerHistory = document.getElementById("history-drawer");
const listHistory = document.getElementById("history-list");
const countHistoryBadge = document.getElementById("history-count");
const drawerEmptyMsg = document.getElementById("drawer-empty-msg");
const dropdownMenu = document.getElementById("app-menu-dropdown");

const toast = document.getElementById("toast");

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
    loadState();
    determineTodayWord();
    renderTodayWord();
    setupSpeech();
    setupEventListeners();
    startCountdown();
});

// Load state from localStorage (ponytail: standard JSON parsing from localStorage)
function loadState() {
    const savedState = localStorage.getItem("arabic_words_state");
    if (savedState) {
        try {
            appState = JSON.parse(savedState);
        } catch (e) {
            console.error("Failed to parse state, resetting", e);
        }
    }
    
    // Ensure lists exist
    if (!appState.learnedWords) {
        appState.learnedWords = [];
    }
}

// Save state back to localStorage
function saveState() {
    localStorage.setItem("arabic_words_state", JSON.stringify(appState));
}

// Determine the word of the day without repeating until all are exhausted
function determineTodayWord() {
    const today = new Date();
    // Use date string as key to lock the word for the current local day (YYYY-MM-DD)
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // If word is already set for today, just load it
    if (appState.todayDateString === todayStr && appState.todayWord) {
        // Double-check if the word still exists in database (defensive)
        const wordExists = WORDS_DB.find(w => w.id === appState.todayWord.id);
        if (wordExists) {
            appState.todayWord = wordExists;
            return;
        }
    }

    // Otherwise, pick a new word that has not been learned yet
    const learnedIds = appState.learnedWords.map(w => w.id);
    let unseenWords = WORDS_DB.filter(w => !learnedIds.includes(w.id));

    // If all words have been learned, reset the history pool but keep it in the history display
    if (unseenWords.length === 0) {
        // ponytail: reset cycle but preserve the history of what has been learned
        unseenWords = [...WORDS_DB];
    }

    // Pick a random word from unseen
    const randomIndex = Math.floor(Math.random() * unseenWords.length);
    const selectedWord = unseenWords[randomIndex];

    // Update state
    appState.todayWord = selectedWord;
    appState.todayDateString = todayStr;
    
    // Add to learned list if not already there
    if (!appState.learnedWords.some(w => w.id === selectedWord.id)) {
        appState.learnedWords.push({
            id: selectedWord.id,
            word: selectedWord.word,
            meaning: selectedWord.meaning,
            learnedDate: getFormattedArabicDate(today)
        });
    }

    saveState();
}

// Render the current word on the UI
function renderTodayWord() {
    const word = appState.todayWord;
    if (!word) return;

    elMainWord.innerText = word.word;
    if (elVocalization) elVocalization.innerText = word.vocalization || "";
    if (elWeight) elWeight.innerText = word.weight || "";
    if (elRoot) elRoot.innerText = word.root || "";
    if (elCategory) elCategory.innerText = word.category || "";
    elMeaning.innerText = word.meaning;
    
    // Highlight the word inside the example/blockquote if present
    const cleanWord = word.word.replace(/[\u064B-\u065F]/g, ""); // Strip tashkeel for matching
    let highlightedExample = word.example;
    
    // ponytail: simple regex matching for Arabic words without heavy diacritic stripping libs
    const wordPattern = new RegExp(cleanWord.split('').join('[\\u064B-\\u065F]*'), 'g');
    highlightedExample = highlightedExample.replace(wordPattern, (match) => `<span class="highlight-word">${match}</span>`);

    // Splitting example by dash to format the author name beautifully
    const parts = highlightedExample.split(" — ");
    if (parts.length > 1) {
        highlightedExample = `«${parts[0]}» <cite>— ${parts[1]}</cite>`;
    } else {
        highlightedExample = `«${highlightedExample}»`;
    }
    elExampleText.innerHTML = highlightedExample;

    // Set today's date label in readable format
    const today = new Date();
    elDateDisplay.innerText = getFormattedArabicDate(today);

    // Update history drawer count
    updateHistoryUI();
}

// Format date nicely in Arabic (e.g. "الأحد، ٢١ يونيو ٢٠٢٦")
function getFormattedArabicDate(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('ar-EG', options);
}

// Setup Speech Synthesis for classical pronunciation (ponytail: native SpeechSynthesis to speak word)
function setupSpeech() {
    btnSpeak.addEventListener("click", () => {
        if (!appState.todayWord) return;

        // Stop any currently playing speech
        window.speechSynthesis.cancel();

        // Create utterance with Tashkeel for perfect reading
        const utterance = new SpeechSynthesisUtterance(appState.todayWord.word);
        utterance.lang = "ar-SA"; // Saudi Arabic voice standard
        
        // Find best Arabic voice
        const voices = window.speechSynthesis.getVoices();
        const arVoice = voices.find(voice => voice.lang.startsWith("ar"));
        if (arVoice) {
            utterance.voice = arVoice;
        }

        utterance.rate = 0.75; // Slow down slightly for clarity & eloquence
        utterance.pitch = 1.0;

        // Button micro-animation when speaking
        btnSpeak.innerHTML = `<svg class="icon"><use href="#i-waveform"/></svg>`;
        btnSpeak.classList.add("speaking");

        utterance.onend = () => {
            btnSpeak.innerHTML = `<svg class="icon"><use href="#i-volume-high"/></svg>`;
            btnSpeak.classList.remove("speaking");
        };

        utterance.onerror = () => {
            btnSpeak.innerHTML = `<svg class="icon"><use href="#i-volume-high"/></svg>`;
            btnSpeak.classList.remove("speaking");
        };

        window.speechSynthesis.speak(utterance);
    });

    // Mobile/Safari fallback: load voices when they change asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {};
    }
}

// Render history list inside the drawer
function updateHistoryUI() {
    const count = appState.learnedWords.length;
    countHistoryBadge.innerText = count;
    
    if (count === 0) {
        drawerEmptyMsg.style.display = "block";
        listHistory.innerHTML = "";
        return;
    }

    drawerEmptyMsg.style.display = "none";
    listHistory.innerHTML = "";

    // Show latest learned words first
    const reversedHistory = [...appState.learnedWords].reverse();
    
    reversedHistory.forEach(item => {
        const li = document.createElement("li");
        li.className = "history-item";
        // ponytail: build with textContent — history comes from tamperable localStorage, so never interpolate it into innerHTML
        const header = document.createElement("div");
        header.className = "history-item-header";
        const wordEl = document.createElement("span");
        wordEl.className = "history-word";
        wordEl.textContent = item.word;
        const dateEl = document.createElement("span");
        dateEl.className = "history-date";
        dateEl.textContent = item.learnedDate;
        header.append(wordEl, dateEl);
        const meaningEl = document.createElement("p");
        meaningEl.className = "history-meaning";
        meaningEl.textContent = item.meaning;
        li.append(header, meaningEl);

        // Click to view that word in detail
        li.addEventListener("click", () => {
            const originalWord = WORDS_DB.find(w => w.id === item.id);
            if (originalWord) {
                appState.todayWord = originalWord;
                renderTodayWord();
                // Close drawer on selection for better mobile experience
                drawerHistory.classList.remove("open");
            }
        });
        
        listHistory.appendChild(li);
    });
}

// Toast notification trigger
function showToast(message) {
    toast.innerText = message;
    toast.classList.add("show");
    
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

// Setup other event listeners
function setupEventListeners() {
    // Drawer toggle
    btnToggleHistory.addEventListener("click", (e) => {
        e.stopPropagation();
        drawerHistory.classList.add("open");
    });

    btnCloseDrawer.addEventListener("click", () => {
        drawerHistory.classList.remove("open");
    });

    // Menu toggle
    btnToggleMenu.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle("open");
    });

    // Close drawer and dropdown when clicking outside (ponytail: lightweight listener instead of complex modal backdrops)
    document.addEventListener("click", (e) => {
        if (!drawerHistory.contains(e.target) && 
            !btnToggleHistory.contains(e.target) && 
            drawerHistory.classList.contains("open")) {
            drawerHistory.classList.remove("open");
        }
        if (!dropdownMenu.contains(e.target) && 
            !btnToggleMenu.contains(e.target) && 
            dropdownMenu.classList.contains("open")) {
            dropdownMenu.classList.remove("open");
        }
    });

    // Copy Link / Copy Details button
    btnCopyLink.addEventListener("click", () => {
        const word = appState.todayWord;
        if (!word) return;
        
        const shareText = getShareText(word);
        copyToClipboard(shareText);
        dropdownMenu.classList.remove("open");
    });

    // Share word functionality (ponytail: native sharing API or clipboard fallback)
    btnShare.addEventListener("click", () => {
        const word = appState.todayWord;
        if (!word) return;

        const shareText = getShareText(word);
        dropdownMenu.classList.remove("open");

        if (navigator.share) {
            navigator.share({
                title: `كَلِمات | كلمة اليوم: ${word.word}`,
                text: shareText
            })
            .then(() => showToast("تمت المشاركة بنجاح!"))
            .catch(err => {
                // Ignore cancel errors
                if (err.name !== "AbortError") {
                    copyToClipboard(shareText);
                }
            });
        } else {
            copyToClipboard(shareText);
        }
    });
}

// ponytail: unified helper to compile share copy text
function getShareText(word) {
    return `✨ كلمة اليوم من تطبيق "كَلِمات" ✨

الكلمة: ${word.word}
النطق: ${word.pronunciation || ""}
الضبط: ${word.vocalization} (وزن ${word.weight})
الجذر: ${word.root}
التصنيف: ${word.category}

المعنى والدلالة:
${word.meaning}

الشاهد الأدبي:
${word.example}

تعلم كلمة جديدة كل يوم وأثرِ مخزونك اللغوي!`;
}

function copyToClipboard(text) {
    const copy = navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(text)
        : Promise.reject();

    copy
        .then(() => {
            showToast("تم نسخ تفاصيل الكلمة إلى الحافظة!");
        })
        .catch(() => {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            const copied = document.execCommand("copy");
            textarea.remove();
            showToast(copied ? "تم نسخ تفاصيل الكلمة إلى الحافظة!" : "تعذّر النسخ؛ يرجى المحاولة مجدداً.");
        });
}

// Countdown timer to midnight (ponytail: simple setInterval timer to keep UI fresh and trigger updates)
function startCountdown() {
    updateTimer();
    setInterval(updateTimer, 1000);
}

function updateTimer() {
    const now = new Date();
    const tomorrow = new Date();
    
    // Set to next midnight
    tomorrow.setHours(24, 0, 0, 0);
    
    const diffMs = tomorrow - now;
    
    if (diffMs <= 0) {
        // Midnight reached! Pick a new word for today
        determineTodayWord();
        renderTodayWord();
        return;
    }
    
    const hours = String(Math.floor(diffMs / (1000 * 60 * 60))).padStart(2, '0');
    const minutes = String(Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
    const seconds = String(Math.floor((diffMs % (1000 * 60)) / 1000)).padStart(2, '0');
    
    elCountdownTimer.innerText = `${hours}:${minutes}:${seconds}`;
}
