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

test("canonicalSearchKey removes tatweel, diacritics, maps alef variants and maqsura without mapping taa marbuta or conflating hamzas", () => {
  const { canonicalSearchKey } = vocabularyApi();
  assert.equal(typeof canonicalSearchKey, "function", "canonicalSearchKey must be exported");
  // Tashkeel / diacritics / Quranic marks stripping (U+064B-U+065F, U+0670, U+06D6-U+06ED)
  assert.equal(canonicalSearchKey("كَلِمَةٌ"), "كلمة");
  assert.equal(canonicalSearchKey("السَّمَيْدَعُ"), "السميدع");
  // Tatweel removal (U+0640)
  assert.equal(canonicalSearchKey("كـــلـــمـــة"), "كلمة");
  // Alef variants mapped to bare alef (أ, إ, آ, ٱ -> ا)
  assert.equal(canonicalSearchKey("أَحْمَد"), "احمد");
  assert.equal(canonicalSearchKey("إِسْلَام"), "اسلام");
  assert.equal(canonicalSearchKey("آيَة"), "اية");
  assert.equal(canonicalSearchKey("ٱسْم"), "اسم");
  // Maqsura mapped to ya (ى -> ي)
  assert.equal(canonicalSearchKey("هُدَى"), "هدي");
  // Does NOT map taa marbuta to ha
  assert.notEqual(canonicalSearchKey("كلمة"), canonicalSearchKey("كلمه"));
  assert.equal(canonicalSearchKey("كَلِمَة"), "كلمة");
  // Does NOT conflate hamza-on-waw or hamza-on-ya
  assert.notEqual(canonicalSearchKey("سُؤَال"), "سوال");
  assert.notEqual(canonicalSearchKey("رَئِيس"), "ريس");
  assert.equal(canonicalSearchKey("سُؤَال"), "سؤال");
  assert.equal(canonicalSearchKey("رَئِيس"), "رئيس");
  // English case and whitespace trimming
  assert.equal(canonicalSearchKey("  Language TRAVEL  "), "language travel");
  // Safe edge cases
  assert.equal(canonicalSearchKey(""), "");
  assert.equal(canonicalSearchKey(null), "");
  assert.equal(canonicalSearchKey(undefined), "");
  assert.equal(canonicalSearchKey(123), "");
});

test("rankVocabulary ranks exact headword, prefix, headword substring, metadata, and applies tie-breaks", () => {
  const { rankVocabulary, validateVocabulary } = vocabularyApi();
  assert.equal(typeof rankVocabulary, "function", "rankVocabulary must be exported");

  const sample = validateVocabulary([
    validWord({ id: "w1", word: "كَلِمَة", normalized: "كلمة", meaningAr: "لفظ يدل على معنى", meaningEn: "A spoken word", root: "ك-ل-م", difficultyBand: "beginner", usefulnessBand: "high", topics: ["language"] }),
    validWord({ id: "w2", word: "كَلَام", normalized: "كلام", meaningAr: "حديث ونطق", meaningEn: "Speech and talk", root: "ك-ل-م", difficultyBand: "beginner", usefulnessBand: "high", topics: ["language", "daily-life"] }),
    validWord({ id: "w3", word: "مُتَكَلِّم", normalized: "متكلم", meaningAr: "الناطق بالحديث", meaningEn: "Speaker", root: "ك-ل-م", difficultyBand: "intermediate", usefulnessBand: "medium", topics: ["language"] }),
    validWord({ id: "w4", word: "سَفَر", normalized: "سفر", meaningAr: "ارتحال وتنقل كلمة", meaningEn: "Travel journey", root: "س-ف-ر", difficultyBand: "beginner", usefulnessBand: "high", topics: ["travel"] }),
  ]);

  // Blank query renders all entries
  assert.deepEqual(rankVocabulary(sample, "").map((w) => w.id), ["w1", "w2", "w3", "w4"]);
  assert.deepEqual(rankVocabulary(sample, "   ").map((w) => w.id), ["w1", "w2", "w3", "w4"]);

  // 1. Exact headword match ranks first
  const exact = rankVocabulary(sample, "كلمة");
  assert.equal(exact[0].id, "w1");

  // 2. Prefix match ranks before other substrings/metadata
  const prefix = rankVocabulary(sample, "كل");
  assert.ok(["w1", "w2"].includes(prefix[0].id));
  assert.ok(prefix.findIndex((w) => w.id === "w1") < prefix.findIndex((w) => w.id === "w3"));

  // 3. Remaining headword substring ranks before metadata match
  const substring = rankVocabulary(sample, "كلم");
  assert.ok(substring.findIndex((w) => w.id === "w3") < substring.findIndex((w) => w.id === "w4"));

  // 4. Metadata match (root, meaning, topic)
  const rootMatches = rankVocabulary(sample, "ك-ل-م");
  assert.ok(rootMatches.some((w) => w.id === "w1") && rootMatches.some((w) => w.id === "w2") && rootMatches.some((w) => w.id === "w3"));
  assert.equal(rootMatches.some((w) => w.id === "w4"), false);

  const englishMatches = rankVocabulary(sample, "travel");
  assert.equal(englishMatches.length, 1);
  assert.equal(englishMatches[0].id, "w4");

  // No match
  assert.deepEqual(rankVocabulary(sample, "غيرموجود"), []);
});

test("all 60 reviewed vocabulary records are discoverable through canonical Explore ranking", () => {
  const { validateVocabulary, rankVocabulary } = vocabularyApi();
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "vocabulary.json"), "utf8"));
  const vocabulary = validateVocabulary(raw);

  // Blank Explore renders all 60 reviewed entries
  const allExplore = rankVocabulary(vocabulary, "");
  assert.equal(allExplore.length, 60);

  for (const item of vocabulary) {
    const byWord = rankVocabulary(vocabulary, item.word);
    assert.ok(byWord.length > 0, `Word "${item.word}" should return search results`);
    assert.equal(byWord[0].id, item.id, `Word "${item.word}" should rank #1 for its exact form`);

    const byNormalized = rankVocabulary(vocabulary, item.normalized);
    assert.ok(byNormalized.length > 0, `Normalized "${item.normalized}" should return search results`);
    assert.ok(byNormalized.some((w) => w.id === item.id), `Normalized search should include "${item.id}"`);

    if (item.root) {
      const byRoot = rankVocabulary(vocabulary, item.root);
      assert.ok(byRoot.some((w) => w.id === item.id), `Root search "${item.root}" should include "${item.id}"`);
    }
  }
});
