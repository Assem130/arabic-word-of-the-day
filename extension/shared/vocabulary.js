(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatVocabulary = api;
})(globalThis, function () {
  "use strict";

  const REQUIRED_KEYS = ["id", "contentVersion", "word", "normalized", "pronunciation", "meaningAr", "meaningEn", "exampleAr", "difficultyBand", "usefulnessBand", "topics", "partOfSpeech", "register", "reviewed"];
  const V2_KEYS = ["contextAr", "contextEn"];
  const OPTIONAL_KEYS = ["root", "pattern", "relatedIds"];
  const ALLOWED_KEYS = new Set([...REQUIRED_KEYS, ...V2_KEYS, ...OPTIONAL_KEYS]);
  const ENUMS = {
    difficultyBand: new Set(["beginner", "intermediate", "advanced"]),
    usefulnessBand: new Set(["low", "medium", "high"]),
    partOfSpeech: new Set(["noun", "verb", "adjective", "adverb", "phrase", "other"]),
    register: new Set(["standard", "classical", "colloquial"]),
  };
  const ID = /^(?!__proto__$|constructor$|prototype$)[A-Za-z][A-Za-z0-9_-]{0,63}$/;
  const USEFULNESS_ORDER = { high: 3, medium: 2, low: 1 };
  const DIFFICULTY_ORDER = { beginner: 1, intermediate: 2, advanced: 3 };

  function fail(message) {
    throw new TypeError(`Invalid vocabulary: ${message}`);
  }

  function text(value, field, max = 4096) {
    if (typeof value !== "string" || value.length < 1 || value.length > max) fail(field);
    return value;
  }

  function validateVocabulary(raw) {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10000) fail("records");
    const ids = new Set();
    const records = raw.map((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record) || Object.getPrototypeOf(record) !== Object.prototype) fail("record");
      const keys = Object.keys(record);
      if (keys.length > REQUIRED_KEYS.length + V2_KEYS.length + OPTIONAL_KEYS.length || keys.some((key) => !ALLOWED_KEYS.has(key)) || REQUIRED_KEYS.some((key) => !Object.hasOwn(record, key))) fail("record keys");
      if (!ID.test(record.id) || ids.has(record.id)) fail(ids.has(record.id) ? "unique IDs" : "id");
      ids.add(record.id);
      if (!Number.isInteger(record.contentVersion) || record.contentVersion < 1 || record.contentVersion > 1000) fail("contentVersion");
      if (record.contentVersion === 2 && V2_KEYS.some((key) => !Object.hasOwn(record, key))) fail("record keys");
      for (const field of ["word", "normalized", "pronunciation", "meaningAr", "meaningEn", "exampleAr"]) text(record[field], field);
      if (record.contentVersion === 2) for (const field of V2_KEYS) text(record[field], field);
      for (const field of ["difficultyBand", "usefulnessBand", "partOfSpeech", "register"]) if (!ENUMS[field].has(record[field])) fail(field);
      if (!Array.isArray(record.topics) || record.topics.length < 1 || record.topics.length > 8 || record.topics.some((topic) => text(topic, "topics", 64) !== topic)) fail("topics");
      if (record.reviewed !== true) throw new TypeError("Vocabulary records must be reviewed.");
      for (const field of ["root", "pattern"]) if (Object.hasOwn(record, field) && record[field] !== undefined) text(record[field], field, 128);
      if (Object.hasOwn(record, "relatedIds") && record.relatedIds !== undefined) {
        if (!Array.isArray(record.relatedIds) || record.relatedIds.length > 16 || record.relatedIds.some((id) => !ID.test(id))) fail("relatedIds");
      }
      if (JSON.stringify(record).length > 8192) fail("record size");
      const normalized = { ...record };
      if (normalized.relatedIds) normalized.relatedIds = Object.freeze([...normalized.relatedIds]);
      normalized.topics = Object.freeze([...normalized.topics]);
      return Object.freeze(normalized);
    });
    for (const record of records) if (record.relatedIds && record.relatedIds.some((id) => !ids.has(id))) fail("related IDs");
    return Object.freeze(records);
  }

  function findWord(vocabulary, id) {
    return vocabulary.find((word) => word.id === id);
  }

  function canonicalSearchKey(value) {
    if (typeof value !== "string" || value.length === 0) return "";
    return value
      .trim()
      .toLowerCase()
      .replace(/\u0640/g, "")
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي");
  }

  function rankVocabulary(vocabulary, query) {
    if (!Array.isArray(vocabulary)) return [];
    const canonicalQuery = canonicalSearchKey(query);
    if (!canonicalQuery) {
      return [...vocabulary].filter((word) => word && word.reviewed === true);
    }

    const scored = [];
    for (const item of vocabulary) {
      if (!item || item.reviewed !== true) continue;

      const headword = canonicalSearchKey(item.word);
      const normalized = canonicalSearchKey(item.normalized);

      let tier = null;
      if (headword === canonicalQuery || normalized === canonicalQuery) {
        tier = 1;
      } else if (headword.startsWith(canonicalQuery) || normalized.startsWith(canonicalQuery)) {
        tier = 2;
      } else if (headword.includes(canonicalQuery) || normalized.includes(canonicalQuery)) {
        tier = 3;
      } else {
        const matchesMeta = (
          (item.root && canonicalSearchKey(item.root).includes(canonicalQuery)) ||
          (item.pattern && canonicalSearchKey(item.pattern).includes(canonicalQuery)) ||
          (item.meaningAr && canonicalSearchKey(item.meaningAr).includes(canonicalQuery)) ||
          (item.meaningEn && canonicalSearchKey(item.meaningEn).includes(canonicalQuery)) ||
          (item.contextAr && canonicalSearchKey(item.contextAr).includes(canonicalQuery)) ||
          (item.contextEn && canonicalSearchKey(item.contextEn).includes(canonicalQuery)) ||
          (item.exampleAr && canonicalSearchKey(item.exampleAr).includes(canonicalQuery)) ||
          (item.partOfSpeech && canonicalSearchKey(item.partOfSpeech).includes(canonicalQuery)) ||
          (item.register && canonicalSearchKey(item.register).includes(canonicalQuery)) ||
          (item.pronunciation && canonicalSearchKey(item.pronunciation).includes(canonicalQuery)) ||
          (Array.isArray(item.topics) && item.topics.some((t) => canonicalSearchKey(t).includes(canonicalQuery)))
        );
        if (matchesMeta) {
          tier = 4;
        }
      }

      if (tier !== null) {
        scored.push({ item, tier });
      }
    }

    scored.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const uDiff = (USEFULNESS_ORDER[b.item.usefulnessBand] || 0) - (USEFULNESS_ORDER[a.item.usefulnessBand] || 0);
      if (uDiff !== 0) return uDiff;
      const dDiff = (DIFFICULTY_ORDER[a.item.difficultyBand] || 0) - (DIFFICULTY_ORDER[b.item.difficultyBand] || 0);
      if (dDiff !== 0) return dDiff;
      return a.item.id.localeCompare(b.item.id);
    });

    return scored.map((entry) => entry.item);
  }

  return { validateVocabulary, findWord, canonicalSearchKey, rankVocabulary };
});
