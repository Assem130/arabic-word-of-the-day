"use strict";

const fs = require("node:fs");
const path = require("node:path");
const words = require("../../words.js");
const { validateVocabulary } = require("../shared/vocabulary.js");
const metadataPath = path.join(__dirname, "..", "data", "vocabulary-metadata.json");
const METADATA = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const metadataBySourceId = new Map(METADATA.map((record) => [record.sourceId, record]));

const EXTENSION_EXAMPLE_OVERRIDES = {
  24: "فاحَ أَرِيجُ الياسمين في الفناء بعد أن سُقيت الأزهار.",
  25: "أثارَت الرسالةُ القديمةُ في نفسه شَجَنًا ممزوجًا بالشوق.",
  32: "سادَ الوِئامُ بين أفراد الفريق بعد حوار صريح.",
  41: "أضاءَ القمرُ الطريقَ وسطَ الدُّجى.",
  46: "بدا وجهُ الطفل نَضيرًا بعد نوم هادئ.",
};

const CATEGORY_TOPICS = {
  "شمائل ومروءة": ["virtues", "character", "classical-arabic"],
  "أدب وشعر": ["poetry", "literature", "classical-arabic"],
  "طبيعة وفلك": ["nature", "astronomy", "classical-arabic"],
  "رحلة وعزم": ["travel", "resolve", "classical-arabic"],
  "خلق وحياة": ["creation", "life", "classical-arabic"],
  "مشاعر وفؤاد": ["emotions", "heart", "classical-arabic"],
  "زمن وفصول": ["time", "seasons", "classical-arabic"],
  "لغة وفصاحة": ["language", "eloquence", "classical-arabic"],
  "مجتمع وألفة": ["community", "society", "classical-arabic"],
  "إيمان وروحانية": ["faith", "spirituality", "classical-arabic"],
  "علم ومعرفة": ["knowledge", "intellect", "classical-arabic"],
  "حكمة وفلسفة": ["wisdom", "philosophy", "classical-arabic"],
};

function normalizeArabic(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .normalize("NFC");
}

const vocabulary = words.map((seed, index) => {
  const metadata = metadataBySourceId.get(seed.id);
  if (!metadata || metadata.reviewed !== true) throw new TypeError(`Missing reviewed metadata for source ${seed.id}.`);
  const source = seed;
  const exampleAr = EXTENSION_EXAMPLE_OVERRIDES[seed.id] || source.example;
  return {
    id: seed.id,
    contentVersion: 2,
    difficultyBand: metadata.difficultyBand || "advanced",
    usefulnessBand: metadata.usefulnessBand || "medium",
    topics: metadata.topics || CATEGORY_TOPICS[seed.category] || ["classical-arabic"],
    category: source.category,
    partOfSpeech: metadata.partOfSpeech || "noun",
    register: metadata.register || "classical",
    reviewed: true,
    word: source.word,
    normalized: normalizeArabic(source.word),
    pronunciation: source.pronunciation,
    vocalization: source.vocalization,
    weight: source.weight,
    pattern: source.weight,
    root: source.root ? source.root.replace(/ـ/g, "") : "",
    meaning: source.meaning,
    meaningAr: source.meaning,
    englishMeaning: source.englishMeaning,
    meaningEn: source.englishMeaning,
    example: source.example,
    exampleAr,
    context: source.context,
    contextAr: source.context,
    contextEnglish: source.contextEnglish,
    contextEn: source.contextEnglish,
  };
});

for (const word of vocabulary) {
  for (const field of ["contextAr", "contextEn"]) {
    if (typeof word[field] !== "string" || word[field].length < 1 || word[field].length > 4096) {
      throw new TypeError(`Invalid vocabulary context: ${word.id}.${field}`);
    }
  }
}
const validated = validateVocabulary(vocabulary);
const output = path.join(__dirname, "..", "data", "vocabulary.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
console.log(`Validated ${validated.length} vocabulary records: ${output}`);
