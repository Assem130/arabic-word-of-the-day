"use strict";

const fs = require("node:fs");
const path = require("node:path");
const words = require("../../words.js");
const { validateVocabulary } = require("../shared/vocabulary.js");

// Editorial review is explicit: a seed word is never treated as reviewed by default.
const METADATA = [
  { sourceId: 1, id: "w1", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 2, id: "w2", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 3, id: "w3", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 4, id: "w4", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 5, id: "w5", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 6, id: "w6", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 7, id: "w7", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 8, id: "w8", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 9, id: "w9", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 10, id: "w10", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 11, id: "w11", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 12, id: "w12", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 13, id: "w13", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 14, id: "w14", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 15, id: "w15", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 16, id: "w16", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 17, id: "w17", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 18, id: "w18", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 19, id: "w19", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 20, id: "w20", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 21, id: "w21", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 22, id: "w22", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 23, id: "w23", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 24, id: "w24", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 25, id: "w25", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 26, id: "w26", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 27, id: "w27", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 28, id: "w28", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 29, id: "w29", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 30, id: "w30", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 31, id: "w31", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 32, id: "w32", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 33, id: "w33", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 34, id: "w34", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 35, id: "w35", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 36, id: "w36", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 37, id: "w37", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 38, id: "w38", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 39, id: "w39", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 40, id: "w40", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 41, id: "w41", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 42, id: "w42", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 43, id: "w43", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 44, id: "w44", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 45, id: "w45", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 46, id: "w46", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 47, id: "w47", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 48, id: "w48", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 49, id: "w49", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 50, id: "w50", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 51, id: "w51", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 52, id: "w52", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 53, id: "w53", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 54, id: "w54", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 55, id: "w55", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 56, id: "w56", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 57, id: "w57", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 58, id: "w58", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 59, id: "w59", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
  { sourceId: 60, id: "w60", contentVersion: 1, difficultyBand: "advanced", usefulnessBand: "medium", topics: ["classical-arabic"], partOfSpeech: "noun", register: "classical", reviewed: true },
];

function normalizeArabic(value) {
  return value.normalize("NFD").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").normalize("NFC");
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
    ...(seed.root ? { root: seed.root } : {}),
    ...(seed.weight ? { pattern: seed.weight } : {}),
  };
});

for (const word of vocabulary) delete word.sourceId;
const validated = validateVocabulary(vocabulary);
const output = path.join(__dirname, "..", "data", "vocabulary.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
console.log(`Validated ${validated.length} vocabulary records: ${output}`);
