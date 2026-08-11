const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function vocabularyApi() {
  return require("../shared/vocabulary.js");
}

function dateApi() {
  return require("../shared/date.js");
}

function validWord(overrides = {}) {
  return {
    id: "w1",
    contentVersion: 2,
    word: "كَلِمَة",
    normalized: "كلمة",
    pronunciation: "/kalima/",
    meaningAr: "لفظ يدل على معنى.",
    meaningEn: "A word with a meaning.",
    exampleAr: "هذه كلمة عربية.",
    contextAr: "في سياق لغوي.",
    contextEn: "In a language context.",
    difficultyBand: "beginner",
    usefulnessBand: "high",
    topics: ["language"],
    partOfSpeech: "noun",
    register: "standard",
    reviewed: true,
    ...overrides,
  };
}

test("rejects unknown, invalid, and unreviewed records", () => {
  const { validateVocabulary } = vocabularyApi();
  assert.throws(() => validateVocabulary([{ id: "__proto__", reviewed: true }]), /vocabulary/i);
  assert.throws(() => validateVocabulary([validWord({ extra: true })]), /vocabulary/i);
  assert.throws(() => validateVocabulary([validWord({ reviewed: false })]), /reviewed/i);
});

test("accepts optional linguistic fields being absent", () => {
  const { validateVocabulary } = vocabularyApi();
  const [word] = validateVocabulary([validWord({ root: undefined, pattern: undefined })]);
  assert.equal(word.id, "w1");
});

test("requires non-empty Arabic and English context for v2 records", () => {
  const { validateVocabulary } = vocabularyApi();
  assert.throws(() => validateVocabulary([validWord({ contextAr: "" })]), /vocabulary/i);
  assert.throws(() => validateVocabulary([validWord({ contextEn: undefined })]), /vocabulary/i);
  const [word] = validateVocabulary([validWord()]);
  assert.equal(word.contextAr, "في سياق لغوي.");
  assert.equal(word.contextEn, "In a language context.");
});

test("freezes validated records and resolves stable IDs", () => {
  const { validateVocabulary, findWord } = vocabularyApi();
  const vocabulary = validateVocabulary([validWord(), validWord({ id: "w2", word: "فِعْل", normalized: "فعل", relatedIds: ["w1"] })]);
  assert.equal(Object.isFrozen(vocabulary[0]), true);
  assert.equal(findWord(vocabulary, "w2").word, "فِعْل");
  assert.equal(findWord(vocabulary, "missing"), undefined);
  assert.throws(() => validateVocabulary([validWord(), validWord()]), /unique/i);
  assert.throws(() => validateVocabulary([validWord({ relatedIds: ["missing"] })]), /related/i);
});

test("uses valid local calendar date keys", () => {
  const { getLocalDateKey, isDateKey } = dateApi();
  assert.equal(getLocalDateKey(new Date(2026, 6, 30)), "2026-07-30");
  assert.equal(isDateKey("2024-02-29"), true);
  assert.equal(isDateKey("2025-02-29"), false);
  assert.equal(isDateKey("2026-7-30"), false);
});

test("loads all 60 reviewed Arabic seed records", () => {
  const { validateVocabulary } = vocabularyApi();
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "vocabulary.json"), "utf8"));
  const vocabulary = validateVocabulary(raw);
  assert.equal(vocabulary.length, 60);
  assert.ok(vocabulary.every((word) => word.contentVersion === 2 && word.contextAr && word.contextEn));
  const atLeast = (field, value, minimum) => assert.ok(vocabulary.filter((word) => word[field] === value).length >= minimum, `${field}:${value}`);
  atLeast("difficultyBand", "beginner", 18);
  atLeast("difficultyBand", "intermediate", 18);
  atLeast("difficultyBand", "advanced", 12);
  atLeast("register", "standard", 36);
  atLeast("register", "classical", 12);
  atLeast("partOfSpeech", "noun", 12);
  atLeast("partOfSpeech", "verb", 8);
  atLeast("partOfSpeech", "adjective", 8);
  atLeast("partOfSpeech", "phrase", 8);
  atLeast("usefulnessBand", "high", 24);
  assert.ok(vocabulary.filter((word) => word.usefulnessBand === "low").length <= 12, "usefulnessBand:low");
  for (const topic of ["classical-arabic", "daily-life", "family", "food", "language", "travel"]) {
    assert.ok(vocabulary.filter((word) => word.topics.includes(topic)).length >= 6, `topic:${topic}`);
  }
  assert.equal(vocabulary[0].word, "السَّمَيْدَع");
  assert.equal(vocabulary[29].word, "الجَوْد");
  assert.equal(vocabulary[59].word, "الخَفُوق");
});
