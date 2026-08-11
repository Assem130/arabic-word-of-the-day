"use strict";

const fs = require("node:fs");
const path = require("node:path");
const words = require("../../words.js");
const { validateVocabulary } = require("../shared/vocabulary.js");

const METADATA = [
  { sourceId: 1, id: "w1", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "language"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 2, id: "w2", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "language"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 3, id: "w3", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "travel", "food"], partOfSpeech: "verb", register: "standard", reviewed: true },
  { sourceId: 4, id: "w4", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 5, id: "w5", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life"], partOfSpeech: "verb", register: "standard", reviewed: true },
  { sourceId: 6, id: "w6", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 7, id: "w7", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "travel"], partOfSpeech: "verb", register: "standard", reviewed: true },
  { sourceId: 8, id: "w8", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic", "family", "language"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 9, id: "w9", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "travel"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 10, id: "w10", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 11, id: "w11", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["classical-arabic", "daily-life"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 12, id: "w12", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life"], partOfSpeech: "verb", register: "standard", reviewed: true },
  { sourceId: 13, id: "w13", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 14, id: "w14", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "family"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 15, id: "w15", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "food", "language"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 16, id: "w16", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "food"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 17, id: "w17", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family", "language"], partOfSpeech: "phrase", register: "standard", reviewed: true },
  { sourceId: 18, id: "w18", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic", "family"], partOfSpeech: "phrase", register: "classical", reviewed: true },
  { sourceId: 19, id: "w19", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 20, id: "w20", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family"], partOfSpeech: "phrase", register: "standard", reviewed: true },
  { sourceId: 21, id: "w21", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "travel", "food"], partOfSpeech: "verb", register: "standard", reviewed: true },
  { sourceId: 22, id: "w22", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["family", "daily-life"], partOfSpeech: "phrase", register: "standard", reviewed: true },
  { sourceId: 23, id: "w23", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 24, id: "w24", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "food"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 25, id: "w25", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic", "family", "language"], partOfSpeech: "phrase", register: "classical", reviewed: true },
  { sourceId: 26, id: "w26", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic", "family"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 27, id: "w27", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 28, id: "w28", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["travel", "daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 29, id: "w29", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["family", "daily-life"], partOfSpeech: "phrase", register: "standard", reviewed: true },
  { sourceId: 30, id: "w30", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "travel", "food"], partOfSpeech: "verb", register: "standard", reviewed: true },
  { sourceId: 31, id: "w31", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["language"], partOfSpeech: "adjective", register: "standard", reviewed: true },
  { sourceId: 32, id: "w32", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["family", "daily-life"], partOfSpeech: "phrase", register: "standard", reviewed: true },
  { sourceId: 33, id: "w33", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["family", "language"], partOfSpeech: "phrase", register: "standard", reviewed: true },
  { sourceId: 34, id: "w34", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic"], partOfSpeech: "adjective", register: "classical", reviewed: true },
  { sourceId: 35, id: "w35", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "travel"], partOfSpeech: "verb", register: "standard", reviewed: true },
  { sourceId: 36, id: "w36", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "travel"], partOfSpeech: "verb", register: "classical", reviewed: true },
  { sourceId: 37, id: "w37", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["family", "food", "daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 38, id: "w38", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "high", topics: ["language", "daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 39, id: "w39", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life", "travel", "language"], partOfSpeech: "verb", register: "standard", reviewed: true },
  { sourceId: 40, id: "w40", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["language"], partOfSpeech: "adjective", register: "standard", reviewed: true },
  { sourceId: 41, id: "w41", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["travel"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 42, id: "w42", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family", "travel"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 43, id: "w43", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["family", "language"], partOfSpeech: "phrase", register: "standard", reviewed: true },
  { sourceId: 44, id: "w44", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 45, id: "w45", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 46, id: "w46", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "adjective", register: "standard", reviewed: true },
  { sourceId: 47, id: "w47", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "low", topics: ["classical-arabic", "travel"], partOfSpeech: "verb", register: "classical", reviewed: true },
  { sourceId: 48, id: "w48", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 49, id: "w49", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "low", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 50, id: "w50", contentVersion: 2, difficultyBand: "beginner", usefulnessBand: "high", topics: ["daily-life"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 51, id: "w51", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 52, id: "w52", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family", "language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 53, id: "w53", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["travel", "language"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 54, id: "w54", contentVersion: 2, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "phrase", register: "classical", reviewed: true },
  { sourceId: 55, id: "w55", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 56, id: "w56", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family", "daily-life", "travel"], partOfSpeech: "phrase", register: "standard", reviewed: true },
  { sourceId: 57, id: "w57", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["travel"], partOfSpeech: "verb", register: "standard", reviewed: true },
  { sourceId: 58, id: "w58", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["classical-arabic", "travel", "food"], partOfSpeech: "verb", register: "classical", reviewed: true },
  { sourceId: 59, id: "w59", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
  { sourceId: 60, id: "w60", contentVersion: 2, difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["family"], partOfSpeech: "noun", register: "standard", reviewed: true },
];

function normalizeArabic(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .normalize("NFC");
}

if (words.length !== METADATA.length) throw new Error("Vocabulary seed and review metadata must have the same length.");
const vocabulary = words.map((seed, index) => {
  const metadata = METADATA[index];
  if (seed.id !== metadata.sourceId) throw new Error(`Metadata does not match seed word ${seed.id}.`);
  return {
    ...metadata,
    id: metadata.id,
    word: seed.word,
    normalized: normalizeArabic(seed.word),
    pronunciation: seed.pronunciation,
    meaningAr: seed.meaning,
    meaningEn: seed.englishMeaning,
    exampleAr: seed.example,
    contextAr: seed.context,
    contextEn: seed.contextEnglish,
    ...(seed.root ? { root: seed.root } : {}),
    ...(seed.weight ? { pattern: seed.weight } : {}),
  };
});

for (const word of vocabulary) {
  delete word.sourceId;
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
