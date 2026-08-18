"use strict";

const fs = require("node:fs");
const path = require("node:path");
const words = require("../../words.js");
const { validateVocabulary } = require("../shared/vocabulary.js");
const existingOutputPath = path.join(__dirname, "..", "data", "vocabulary.json");
let existingMetadata = new Map();
try {
  const existing = JSON.parse(fs.readFileSync(existingOutputPath, "utf8"));
  existingMetadata = new Map(existing.filter((record) => record && record.id !== undefined).map((record) => [record.id, record]));
} catch (_) {
  // A clean checkout can still run the converter once metadata is complete.
}

const METADATA = [
  { sourceId: 1, id: 1, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "language"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 2, id: 2, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "language"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 3, id: 3, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["daily-life", "travel", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 4, id: 4, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 5, id: 5, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 6, id: 6, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 7, id: 7, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["daily-life", "travel"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 8, id: 8, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic", "family", "language"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 9, id: 9, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "travel"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 10, id: 10, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 11, id: 11, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["classical-arabic", "daily-life"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 12, id: 12, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 13, id: 13, contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 14, id: 14, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "family"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 15, id: 15, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "food", "language"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 16, id: 16, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "food"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 17, id: 17, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family", "language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 18, id: 18, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic", "family"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 19, id: 19, contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 20, id: 20, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 21, id: 21, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["daily-life", "travel", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 22, id: 22, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family", "daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 23, id: 23, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 24, id: 24, contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 25, id: 25, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic", "family", "language"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 26, id: 26, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic", "family"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 27, id: 27, contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 28, id: 28, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["travel", "daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 29, id: 29, contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["family", "daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 30, id: 30, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["daily-life", "travel", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 31, id: 31, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 32, id: 32, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family", "daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 33, id: 33, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family", "language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 34, id: 34, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 35, id: 35, contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "travel"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 36, id: 36, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "travel"], partOfSpeech: "adverb", register: "classical", reviewed: true },
  { sourceId: 37, id: 37, contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["family", "food", "daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 38, id: 38, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["language", "daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 39, id: 39, contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "travel", "language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 40, id: 40, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["language"], partOfSpeech: "adjective", register: "standard", reviewed: true },
  { sourceId: 41, id: 41, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["travel"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 42, id: 42, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family", "travel"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 43, id: 43, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family", "language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 44, id: 44, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 45, id: 45, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 46, id: 46, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "adjective", register: "standard", reviewed: true },
  { sourceId: 47, id: 47, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "travel"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 48, id: 48, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 49, id: 49, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "low", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 50, id: 50, contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 51, id: 51, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 52, id: 52, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family", "language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 53, id: 53, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["travel", "language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 54, id: 54, contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 55, id: 55, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 56, id: 56, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family", "daily-life", "travel"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 57, id: 57, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["travel"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 58, id: 58, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["classical-arabic", "travel", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 59, id: 59, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 60, id: 60, contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
];

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
  const metadata = METADATA[index] || existingMetadata.get(seed.id);
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
