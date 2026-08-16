(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatVocabulary = api;
})(globalThis, function () {
  "use strict";

  const REQUIRED_KEYS = ["id", "contentVersion", "word", "normalized", "pronunciation", "difficultyBand", "usefulnessBand", "topics", "partOfSpeech", "register", "reviewed"];
  const V2_KEYS = ["contextAr", "contextEn"];
  const ALIAS_KEYS = ["vocalization", "category", "weight", "pattern", "meaning", "meaningAr", "englishMeaning", "meaningEn", "example", "exampleAr", "context", "contextAr", "contextEnglish", "contextEn", "root", "relatedIds"];
  const ALLOWED_KEYS = new Set([...REQUIRED_KEYS, ...V2_KEYS, ...ALIAS_KEYS]);
  const ENUMS = {
    difficultyBand: new Set(["beginner", "intermediate", "advanced"]),
    usefulnessBand: new Set(["low", "medium", "high"]),
    partOfSpeech: new Set(["noun", "verb", "adjective", "adverb", "phrase", "other"]),
    register: new Set(["standard", "classical", "colloquial"]),
  };
  const ID = /^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_-]{1,64}$/;
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
      if (keys.some((key) => !ALLOWED_KEYS.has(key))) fail("record keys");
      if (REQUIRED_KEYS.some((key) => !Object.hasOwn(record, key))) fail("record keys");

      const isIdValid = (Number.isInteger(record.id) && record.id >= 1 && record.id <= 10000) || (typeof record.id === "string" && ID.test(record.id));
      if (!isIdValid || ids.has(record.id)) fail(ids.has(record.id) ? "unique IDs" : "id");
      ids.add(record.id);

      if (!Number.isInteger(record.contentVersion) || record.contentVersion < 1 || record.contentVersion > 1000) fail("contentVersion");

      for (const field of ["word", "normalized", "pronunciation"]) text(record[field], field);

      const meaningAr = record.meaningAr || record.meaning;
      const meaningEn = record.meaningEn || record.englishMeaning;
      const exampleAr = record.exampleAr || record.example;
      text(meaningAr, "meaningAr");
      text(meaningEn, "meaningEn");
      text(exampleAr, "exampleAr");

      if (record.contentVersion === 2) {
        const contextAr = record.contextAr || record.context;
        const contextEn = record.contextEn || record.contextEnglish;
        text(contextAr, "contextAr");
        text(contextEn, "contextEn");
      }

      for (const field of ["difficultyBand", "usefulnessBand", "partOfSpeech", "register"]) if (!ENUMS[field].has(record[field])) fail(field);
      if (!Array.isArray(record.topics) || record.topics.length < 1 || record.topics.length > 8 || record.topics.some((topic) => text(topic, "topics", 64) !== topic)) fail("topics");
      if (record.reviewed !== true) throw new TypeError("Vocabulary records must be reviewed.");

      for (const field of ["root", "pattern", "weight", "vocalization", "category"]) {
        if (Object.hasOwn(record, field) && record[field] !== undefined) text(record[field], field, 512);
      }

      if (Object.hasOwn(record, "relatedIds") && record.relatedIds !== undefined) {
        if (!Array.isArray(record.relatedIds) || record.relatedIds.length > 16 || record.relatedIds.some((id) => !ID.test(String(id)))) fail("relatedIds");
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
    if (!Array.isArray(vocabulary) || id === null || id === undefined) return undefined;
    const strId = String(id);
    const numId = typeof id === "number" ? id : (strId.startsWith("w") ? parseInt(strId.slice(1), 10) : parseInt(strId, 10));
    return vocabulary.find((word) => {
      if (!word) return false;
      if (word.id === id || String(word.id) === strId) return true;
      if (Number.isInteger(numId) && (word.id === numId || word.id === `w${numId}` || String(word.id) === String(numId))) {
        return true;
      }
      return false;
    });
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
      if (item.word === query.trim()) {
        tier = 0.5;
      } else if (headword === canonicalQuery || normalized === canonicalQuery) {
        tier = 1;
      } else if (headword.startsWith(canonicalQuery) || normalized.startsWith(canonicalQuery)) {
        tier = 2;
      } else if (headword.includes(canonicalQuery) || normalized.includes(canonicalQuery)) {
        tier = 3;
      } else {
        const metaFields = [
          item.root,
          item.pattern || item.weight,
          item.meaningAr || item.meaning,
          item.meaningEn || item.englishMeaning,
          item.contextAr || item.context,
          item.contextEn || item.contextEnglish,
          item.exampleAr || item.example,
          item.category,
          item.vocalization,
          item.partOfSpeech,
          item.register,
          item.pronunciation,
        ];
        let matchesMeta = metaFields.some((f) => f && canonicalSearchKey(f).includes(canonicalQuery));
        if (!matchesMeta && Array.isArray(item.topics)) {
          matchesMeta = item.topics.some((t) => t && canonicalSearchKey(t).includes(canonicalQuery));
        }
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
      return String(a.item.id).localeCompare(String(b.item.id), undefined, { numeric: true });
    });

    return scored.map((entry) => entry.item);
  }

  return { validateVocabulary, findWord, canonicalSearchKey, rankVocabulary };
});
