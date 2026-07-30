(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatVocabulary = api;
})(globalThis, function () {
  "use strict";

  const REQUIRED_KEYS = ["id", "contentVersion", "word", "normalized", "pronunciation", "meaningAr", "meaningEn", "exampleAr", "difficultyBand", "usefulnessBand", "topics", "partOfSpeech", "register", "reviewed"];
  const OPTIONAL_KEYS = ["root", "pattern", "relatedIds"];
  const ALLOWED_KEYS = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
  const ENUMS = {
    difficultyBand: new Set(["beginner", "intermediate", "advanced"]),
    usefulnessBand: new Set(["low", "medium", "high"]),
    partOfSpeech: new Set(["noun", "verb", "adjective", "adverb", "phrase", "other"]),
    register: new Set(["standard", "classical", "colloquial"]),
  };
  const ID = /^(?!__proto__$|constructor$|prototype$)[A-Za-z][A-Za-z0-9_-]{0,63}$/;

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
      if (keys.length > REQUIRED_KEYS.length + OPTIONAL_KEYS.length || keys.some((key) => !ALLOWED_KEYS.has(key)) || REQUIRED_KEYS.some((key) => !Object.hasOwn(record, key))) fail("record keys");
      if (!ID.test(record.id) || ids.has(record.id)) fail(ids.has(record.id) ? "unique IDs" : "id");
      ids.add(record.id);
      if (!Number.isInteger(record.contentVersion) || record.contentVersion < 1 || record.contentVersion > 1000) fail("contentVersion");
      for (const field of ["word", "normalized", "pronunciation", "meaningAr", "meaningEn", "exampleAr"]) text(record[field], field);
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

  return { validateVocabulary, findWord };
});
