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
    contentVersion: 1,
    word: "كَلِمَة",
    normalized: "كلمة",
    pronunciation: "/kalima/",
    meaningAr: "لفظ يدل على معنى.",
    meaningEn: "A word with a meaning.",
    exampleAr: "هذه كلمة عربية.",
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
  assert.equal(vocabulary[0].word, "السَّمَيْدَع");
  assert.equal(vocabulary[29].word, "الجَوْد");
  assert.equal(vocabulary[59].word, "الخَفُوق");
});
