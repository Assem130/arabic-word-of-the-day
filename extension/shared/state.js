(function (root, factory) {
  const isDateKey = typeof module === "object" && module.exports ? require("./date.js").isDateKey : root.KalimatDate.isDateKey;
  const api = factory(isDateKey);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatState = api;
})(globalThis, function (isDateKey) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const ALGORITHM_VERSION = 1;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const MAX_RECORDS = 10000;
  const MAX_ASSIGNMENTS = 5000;
  const MAX_ARRAY = 16;
  const MAX_RECORD_BYTES = 16 * 1024;
  const encoder = new TextEncoder();
  const INTERESTS = new Set(["classical-arabic", "daily-life", "family", "food", "language", "travel"]);
  const STATUSES = new Set(["known", "difficult"]);
  const PROFILE_KEYS = new Set(["schemaVersion", "algorithmVersion", "seedHex", "level", "interests", "wordStates", "assignments", "recentIds", "evidenceCutoff"]);
  const WORD_STATE_KEYS = new Set(["status", "dateKey", "saved"]);
  const ASSIGNMENT_KEYS = new Set(["wordId", "status"]);
  const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const ID = /^(?!__proto__$|constructor$|prototype$)[A-Za-z][A-Za-z0-9_-]*$/;

  function fail(message) {
    throw new TypeError(`Invalid profile: ${message}`);
  }

  function plainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function safeKeys(value, allowed, label) {
    if (!plainObject(value)) fail(label);
    const keys = Object.keys(value);
    if (keys.some((key) => DANGEROUS_KEYS.has(key) || !allowed.has(key))) fail(`${label} keys`);
    return keys;
  }

  function id(value, label) {
    if (typeof value !== "string" || Array.from(value).length < 1 || Array.from(value).length > 64 || !ID.test(value)) fail(label);
    return value;
  }

  function recordSize(value, label) {
    if (encoder.encode(JSON.stringify(value)).byteLength > MAX_RECORD_BYTES) fail(label);
  }

  function nullMap() {
    return Object.create(null);
  }

  function copyWordState(value) {
    recordSize(value, "word state size");
    const keys = safeKeys(value, WORD_STATE_KEYS, "word state");
    if (!keys.length) fail("word state");
    const result = {};
    if (Object.hasOwn(value, "status")) {
      if (!STATUSES.has(value.status) || !Object.hasOwn(value, "dateKey") || !isDateKey(value.dateKey)) fail("word state status");
      result.status = value.status;
      result.dateKey = value.dateKey;
    } else if (Object.hasOwn(value, "dateKey")) {
      fail("word state date");
    }
    if (Object.hasOwn(value, "saved")) {
      if (typeof value.saved !== "boolean") fail("word state saved");
      result.saved = value.saved;
    }
    return result;
  }

  function copyAssignment(value) {
    recordSize(value, "assignment size");
    safeKeys(value, ASSIGNMENT_KEYS, "assignment");
    if (!Object.hasOwn(value, "wordId")) fail("assignment wordId");
    const result = { wordId: id(value.wordId, "assignment wordId") };
    if (Object.hasOwn(value, "status")) {
      if (!STATUSES.has(value.status)) fail("assignment status");
      result.status = value.status;
    }
    return result;
  }

  function vocabularyIds(vocabulary) {
    if (!Array.isArray(vocabulary) || vocabulary.length > MAX_RECORDS) fail("vocabulary");
    const ids = new Set();
    for (const word of vocabulary) {
      if (!word || typeof word.id !== "string") fail("vocabulary");
      ids.add(word.id);
    }
    return ids;
  }

  function copyProfile(raw, vocabulary, assignmentMaximum = MAX_ASSIGNMENTS) {
    safeKeys(raw, PROFILE_KEYS, "profile");
    for (const key of PROFILE_KEYS) if (!Object.hasOwn(raw, key)) fail(`profile ${key}`);
    if (raw.schemaVersion !== SCHEMA_VERSION || raw.algorithmVersion !== ALGORITHM_VERSION) fail("schema version");
    if (typeof raw.seedHex !== "string" || !/^[0-9a-f]{32}$/.test(raw.seedHex)) fail("seedHex");
    if (!Number.isInteger(raw.level) || raw.level < 1 || raw.level > 4) fail("level");
    if (!Array.isArray(raw.interests) || raw.interests.length > 3 || raw.interests.some((interest) => !INTERESTS.has(interest)) || new Set(raw.interests).size !== raw.interests.length) fail("interests");
    if (!Array.isArray(raw.recentIds) || raw.recentIds.length > MAX_ARRAY) fail("recentIds");
    const allowedIds = vocabulary ? vocabularyIds(vocabulary) : null;
    const recentIds = raw.recentIds.map((value) => id(value, "recent ID"));
    if (allowedIds && recentIds.some((value) => !allowedIds.has(value))) fail("recent ID");
    if (raw.evidenceCutoff !== null && !isDateKey(raw.evidenceCutoff)) fail("evidence cutoff");
    if (!plainObject(raw.wordStates) || !plainObject(raw.assignments)) fail("keyed state");
    const wordStateEntries = Object.entries(raw.wordStates);
    const assignmentEntries = Object.entries(raw.assignments);
    if (wordStateEntries.length > MAX_RECORDS || assignmentEntries.length > assignmentMaximum) fail("records");

    const wordStates = nullMap();
    for (const [wordId, state] of wordStateEntries) {
      id(wordId, "word ID");
      if (allowedIds && !allowedIds.has(wordId)) fail("word ID");
      wordStates[wordId] = copyWordState(state);
    }
    const assignments = nullMap();
    for (const [dateKey, assignment] of assignmentEntries) {
      if (!isDateKey(dateKey)) fail("assignment date");
      const copy = copyAssignment(assignment);
      if (allowedIds && !allowedIds.has(copy.wordId)) fail("assignment wordId");
      assignments[dateKey] = copy;
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
      seedHex: raw.seedHex,
      level: raw.level,
      interests: [...raw.interests],
      wordStates,
      assignments,
      recentIds,
      evidenceCutoff: raw.evidenceCutoff,
    };
  }

  function createProfile({ seedHex = "0".repeat(32), level = 1, interests = [] } = {}) {
    return copyProfile({
      schemaVersion: SCHEMA_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
      seedHex,
      level,
      interests,
      wordStates: nullMap(),
      assignments: nullMap(),
      recentIds: [],
      evidenceCutoff: null,
    });
  }

  function validateStoredProfile(raw, vocabulary) {
    try {
      return { profile: copyProfile(raw, vocabulary), canPersist: true, recoveryRaw: null };
    } catch (_) {
      return { profile: createProfile(), canPersist: false, recoveryRaw: raw };
    }
  }

  function evidence(profile) {
    return Object.entries(profile.assignments)
      .filter(([dateKey, assignment]) => assignment.status && (!profile.evidenceCutoff || dateKey > profile.evidenceCutoff))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8);
  }

  function shiftAtCutoff(profile) {
    if (!profile.evidenceCutoff) return null;
    const responses = Object.entries(profile.assignments)
      .filter(([dateKey, assignment]) => dateKey <= profile.evidenceCutoff && assignment.status)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8);
    if (responses.length !== 8) return null;
    const known = responses.filter(([, response]) => response.status === "known").length;
    const difficult = responses.filter(([, response]) => response.status === "difficult").length;
    const status = known >= 6 ? "known" : difficult >= 6 ? "difficult" : null;
    return status && { status, dates: new Set(responses.map(([dateKey]) => dateKey)) };
  }

  function applyFeedback(profile, input) {
    const current = copyProfile(profile);
    if (!plainObject(input) || Object.keys(input).some((key) => !new Set(["dateKey", "wordId", "status"]).has(key))) fail("feedback");
    if (!isDateKey(input.dateKey) || !STATUSES.has(input.status) || id(input.wordId, "feedback wordId") !== input.wordId) fail("feedback");
    const assignment = current.assignments[input.dateKey];
    if (!assignment || assignment.wordId !== input.wordId) fail("feedback assignment");

    const priorShift = shiftAtCutoff(current);
    const previous = current.wordStates[input.wordId] || {};
    current.wordStates[input.wordId] = { ...previous, status: input.status, dateKey: input.dateKey };
    current.assignments[input.dateKey] = { ...assignment, status: input.status };
    if (priorShift && priorShift.dates.has(input.dateKey) && priorShift.status === assignment.status && assignment.status !== input.status) {
      current.level += priorShift.status === "known" ? -1 : 1;
      current.evidenceCutoff = null;
    }
    const responses = evidence(current);
    if (responses.length === 8) {
      const known = responses.filter(([, response]) => response.status === "known").length;
      const difficult = responses.filter(([, response]) => response.status === "difficult").length;
      if (known >= 6 && current.level < 4) {
        current.level += 1;
        current.evidenceCutoff = responses.at(-1)[0];
      } else if (difficult >= 6 && current.level > 1) {
        current.level -= 1;
        current.evidenceCutoff = responses.at(-1)[0];
      }
    }
    return current;
  }

  function parseImport(text, vocabulary) {
    try {
      if (typeof text !== "string" || encoder.encode(text).byteLength > MAX_IMPORT_BYTES) throw new TypeError("size");
      return copyProfile(JSON.parse(text), vocabulary);
    } catch (_) {
      throw new TypeError("Invalid import.");
    }
  }

  function serializeExport(profile) {
    return `${JSON.stringify(copyProfile(profile))}\n`;
  }

  function pruneAssignments(profile) {
    const copy = copyProfile(profile, undefined, MAX_RECORDS);
    const newest = Object.keys(copy.assignments).sort().slice(-MAX_ASSIGNMENTS);
    const assignments = nullMap();
    for (const dateKey of newest) assignments[dateKey] = copy.assignments[dateKey];
    return { ...copy, assignments };
  }

  return { createProfile, validateStoredProfile, applyFeedback, parseImport, serializeExport, pruneAssignments };
});
