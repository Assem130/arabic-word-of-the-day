(function (root, factory) {
  const DateApi = typeof module === "object" && module.exports ? require("./date.js") : root.KalimatDate;
  const isDateKey = DateApi.isDateKey;
  const getLocalDateKey = DateApi.getLocalDateKey || ((d) => d.toISOString().slice(0, 10));
  const addDaysToDateKey = DateApi.addDaysToDateKey || ((k, n) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  });
  const getDaysDifference = DateApi.getDaysDifference || ((k1, k2) => {
    const [y1, m1, d1] = k1.split("-").map(Number);
    const [y2, m2, d2] = k2.split("-").map(Number);
    return Math.floor(Date.UTC(y2, m2 - 1, d2) / 86400000) - Math.floor(Date.UTC(y1, m1 - 1, d1) / 86400000);
  });

  const api = factory({ isDateKey, getLocalDateKey, addDaysToDateKey, getDaysDifference });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatState = api;
})(globalThis, function (DateApi) {
  "use strict";

  const isDateKey = DateApi.isDateKey;
  const getLocalDateKey = DateApi.getLocalDateKey || ((d) => d.toISOString().slice(0, 10));
  const addDaysToDateKey = DateApi.addDaysToDateKey || ((k, n) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  });
  const getDaysDifference = DateApi.getDaysDifference || ((k1, k2) => {
    const [y1, m1, d1] = k1.split("-").map(Number);
    const [y2, m2, d2] = k2.split("-").map(Number);
    return Math.floor(Date.UTC(y2, m2 - 1, d2) / 86400000) - Math.floor(Date.UTC(y1, m1 - 1, d1) / 86400000);
  });

  const SCHEMA_VERSION = 1;
  const ALGORITHM_VERSION = 1;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const MAX_RECORDS = 10000;
  const MAX_ASSIGNMENTS = 5000;
  const MAX_ARRAY = 16;
  const MAX_RECORD_BYTES = 16 * 1024;
  const MAX_CANONICAL_ID = 365;
  const MAX_REVIEW_LIMIT = 100;
  const encoder = new TextEncoder();
  const INTERESTS = new Set(["classical-arabic", "daily-life", "family", "food", "language", "travel"]);
  const STATUSES = new Set(["known", "difficult"]);
  const PROFILE_KEYS = new Set([
    "schemaVersion",
    "version",
    "algorithmVersion",
    "seedHex",
    "level",
    "interests",
    "showEnglish",
    "wordStates",
    "assignments",
    "recentIds",
    "evidenceCutoff",
    "assignmentOrdinal",
    "srs",
    "history",
    "favorites",
    "preferences",
    "streak",
    "streakData",
  ]);
  const WORD_STATE_KEYS = new Set(["status", "dateKey", "saved"]);
  const ASSIGNMENT_KEYS = new Set(["wordId", "status"]);
  const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const ID = /^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9][A-Za-z0-9_-]*$/;

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
    if (typeof value === "number") {
      if (!Number.isInteger(value) || value < 1 || value > 10000) fail(label);
      return value;
    }
    if (typeof value !== "string" || Array.from(value).length < 1 || Array.from(value).length > 64 || !ID.test(value)) fail(label);
    return value;
  }

  function numericAlias(value) {
    const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
    const match = /^(?:w)?(\d+)$/i.exec(text);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_CANONICAL_ID ? parsed : null;
  }

  function vocabularyIndex(vocabulary) {
    if (!Array.isArray(vocabulary) || vocabulary.length > MAX_RECORDS) fail("vocabulary");
    const canonicalMode = vocabulary.some((word) => word && typeof word.id === "number")
      || (vocabulary.length === MAX_CANONICAL_ID && vocabulary.every((word) => numericAlias(word?.id) !== null));
    const aliases = new Map();
    const records = new Map();
    const aliasesByCanonical = new Map();
    for (const word of vocabulary) {
      if (!word || (typeof word.id !== "string" && typeof word.id !== "number")) fail("vocabulary");
      const numeric = canonicalMode ? numericAlias(word.id) : null;
      const canonical = numeric ?? word.id;
      if (records.has(canonical) && records.get(canonical) !== word) fail("vocabulary ID collision");
      records.set(canonical, word);
      const aliasesForWord = aliasesByCanonical.get(canonical) || [];
      const rawAliases = [String(word.id), String(canonical)];
      if (numeric !== null) rawAliases.push(`w${numeric}`);
      for (const alias of rawAliases) {
        const prior = aliases.get(alias);
        if (prior !== undefined && prior !== canonical) fail("vocabulary ID collision");
        aliases.set(alias, canonical);
        if (!aliasesForWord.includes(alias)) aliasesForWord.push(alias);
      }
      aliasesByCanonical.set(canonical, aliasesForWord);
    }
    return { aliases, records, aliasesByCanonical };
  }

  function canonicalWordId(value, index, label = "word ID") {
    id(value, label);
    if (!index) return value;
    const canonical = index.aliases.get(String(value));
    if (canonical === undefined) fail(`${label} unknown`);
    return canonical;
  }

  function canonicalKey(value, index, label = "word ID") {
    return String(canonicalWordId(value, index, label));
  }

  function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function putUnique(map, key, value, label) {
    if (Object.hasOwn(map, key) && !sameValue(map[key], value)) fail(`${label} collision`);
    map[key] = value;
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

  function copyAssignment(value, index = null) {
    recordSize(value, "assignment size");
    safeKeys(value, ASSIGNMENT_KEYS, "assignment");
    if (!Object.hasOwn(value, "wordId")) fail("assignment wordId");
    const result = { wordId: canonicalWordId(value.wordId, index, "assignment wordId") };
    if (Object.hasOwn(value, "status")) {
      if (!STATUSES.has(value.status)) fail("assignment status");
      result.status = value.status;
    }
    return result;
  }

  function vocabularyIds(vocabulary) {
    return vocabularyIndex(vocabulary).aliases;
  }

  function mapRatingToGrade(rating) {
    if (typeof rating === "number") {
      if (isNaN(rating)) return 4;
      return Math.min(5, Math.max(0, Math.round(rating)));
    }
    if (typeof rating === "string") {
      const trimmed = rating.trim().toLowerCase();
      if (/^\d+$/.test(trimmed)) {
        const parsed = parseInt(trimmed, 10);
        return Math.min(5, Math.max(0, parsed));
      }
      if (trimmed === "again" || trimmed === "أعد" || trimmed === "اعد" || trimmed === "مجددا" || trimmed === "مجدداً") return 1;
      if (trimmed === "hard" || trimmed === "صعب") return 3;
      if (trimmed === "good" || trimmed === "جيد") return 4;
      if (trimmed === "easy" || trimmed === "سهل") return 5;
    }
    return 4;
  }

  function createDefaultSrsItem(wordId, initialDateKey) {
    const today = isDateKey(initialDateKey) ? initialDateKey : getLocalDateKey(new Date());
    const numericId = typeof wordId === "number" ? wordId : (/^\d+$/.test(String(wordId)) ? Number(wordId) : null);
    return {
      wordId: Number.isInteger(numericId) ? numericId : wordId,
      repetition: 0,
      interval: 0,
      ef: 2.5,
      nextReviewDate: today,
      lastReviewedDate: null,
      reviewCount: 0,
      lapses: 0,
      history: [],
    };
  }

  function calculateSM2(item, rating, reviewDateKey) {
    const q = mapRatingToGrade(rating);
    const dateKey = isDateKey(reviewDateKey) ? reviewDateKey : getLocalDateKey(new Date());

    const prevRepetition = (item && Number.isInteger(item.repetition) && item.repetition >= 0) ? item.repetition : 0;
    const prevInterval = (item && typeof item.interval === "number" && item.interval >= 0) ? item.interval : 0;
    const prevEf = (item && typeof item.ef === "number" && !isNaN(item.ef) && item.ef >= 1.3) ? item.ef : 2.5;
    const prevLapses = (item && Number.isInteger(item.lapses) && item.lapses >= 0) ? item.lapses : 0;
    const prevReviewCount = (item && Number.isInteger(item.reviewCount) && item.reviewCount >= 0) ? item.reviewCount : 0;
    const prevHistory = (item && Array.isArray(item.history)) ? [...item.history] : [];

    const rawEf = prevEf + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    const roundedEf = Math.round(rawEf * 100) / 100;
    const newEf = Math.max(1.3, roundedEf);

    let newRepetition = 0;
    let newInterval = 1;
    let newLapses = prevLapses;

    const ratingStr = typeof rating === "string" ? rating.toLowerCase().trim() : "";

    if (q < 3) {
      newRepetition = 0;
      newInterval = 1;
      newLapses = prevLapses + 1;
    } else {
      if (prevRepetition === 0) {
        newInterval = 1;
      } else if (prevRepetition === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(prevInterval * newEf);
      }
      newRepetition = prevRepetition + 1;
    }

    const nextReviewDate = addDaysToDateKey(dateKey, newInterval);
    const lastReviewedDate = dateKey;

    const canonicalRating = ratingStr || (q === 1 ? "again" : q === 3 ? "hard" : q === 4 ? "good" : q === 5 ? "easy" : String(q));
    const historyEntry = {
      date: dateKey,
      grade: q,
      rating: canonicalRating,
      interval: newInterval,
      ef: newEf,
    };

    const updatedHistory = [...prevHistory, historyEntry].slice(-50);

    const result = {
      repetition: newRepetition,
      interval: newInterval,
      ef: newEf,
      nextReviewDate,
      lastReviewedDate,
      reviewCount: prevReviewCount + 1,
      lapses: newLapses,
      historyEntry,
      history: updatedHistory,
    };

    if (item && item.wordId !== undefined) {
      result.wordId = item.wordId;
    }

    return result;
  }

  function copyProfile(raw, vocabulary, assignmentMaximum = MAX_ASSIGNMENTS) {
    safeKeys(raw, PROFILE_KEYS, "profile");
    for (const key of ["schemaVersion", "algorithmVersion", "seedHex", "level", "interests", "wordStates", "assignments", "recentIds", "evidenceCutoff"]) {
      if (!Object.hasOwn(raw, key)) fail(`profile ${key}`);
    }
    if ((raw.schemaVersion !== SCHEMA_VERSION && raw.schemaVersion !== 2 && raw.schemaVersion !== 3) || raw.algorithmVersion !== ALGORITHM_VERSION) fail("schema version");
    if (typeof raw.seedHex !== "string" || !/^[0-9a-f]{32}$/.test(raw.seedHex)) fail("seedHex");
    if (!Number.isInteger(raw.level) || raw.level < 1 || raw.level > 4) fail("level");
    if (!Array.isArray(raw.interests) || raw.interests.length > 3 || raw.interests.some((interest) => !INTERESTS.has(interest)) || new Set(raw.interests).size !== raw.interests.length) fail("interests");
    if (Object.hasOwn(raw, "showEnglish") && typeof raw.showEnglish !== "boolean") fail("showEnglish");
    if (!Array.isArray(raw.recentIds) || raw.recentIds.length > MAX_ARRAY) fail("recentIds");
    const index = vocabulary ? vocabularyIndex(vocabulary) : null;
    const recentIds = [];
    const seenRecent = new Set();
    for (const value of raw.recentIds) {
      const canonical = canonicalWordId(value, index, "recent ID");
      if (!seenRecent.has(String(canonical))) {
        recentIds.push(canonical);
        seenRecent.add(String(canonical));
      }
    }
    if (raw.evidenceCutoff !== null && !isDateKey(raw.evidenceCutoff)) fail("evidence cutoff");
    if (!plainObject(raw.wordStates) || !plainObject(raw.assignments)) fail("keyed state");
    const wordStateEntries = Object.entries(raw.wordStates);
    const assignmentEntries = Object.entries(raw.assignments);
    if (wordStateEntries.length > MAX_RECORDS || assignmentEntries.length > assignmentMaximum) fail("records");

    const wordStates = nullMap();
    for (const [wordId, state] of wordStateEntries) {
      const canonical = canonicalKey(wordId, index, "word ID");
      putUnique(wordStates, canonical, copyWordState(state), "word ID");
    }
    const assignments = nullMap();
    for (const [dateKey, assignment] of assignmentEntries) {
      if (!isDateKey(dateKey)) fail("assignment date");
      const copy = copyAssignment(assignment, index);
      assignments[dateKey] = copy;
    }
    const assignmentOrdinal = Object.hasOwn(raw, "assignmentOrdinal") ? raw.assignmentOrdinal : assignmentEntries.length;
    if (!Number.isSafeInteger(assignmentOrdinal) || assignmentOrdinal < assignmentEntries.length) fail("assignment ordinal");

    // Copy or initialize SRS, History, Favorites, Preferences, Streak
    const srs = nullMap();
    if (raw.srs && typeof raw.srs === "object" && !Array.isArray(raw.srs)) {
      for (const [rawWordId, item] of Object.entries(raw.srs)) {
        if (item && typeof item === "object") {
          const rawKeyId = canonicalWordId(rawWordId, index, "srs word ID");
          const wId = canonicalWordId(item.wordId ?? rawWordId, index, "srs word ID");
          if (String(rawKeyId) !== String(wId)) fail("srs word ID collision");
          srs[wId] = {
            wordId: wId,
            repetition: Number.isInteger(item.repetition) && item.repetition >= 0 ? item.repetition : 0,
            interval: typeof item.interval === "number" && item.interval >= 0 ? Math.round(item.interval) : 0,
            ef: typeof item.ef === "number" && !isNaN(item.ef) ? Math.max(1.3, Math.round(item.ef * 100) / 100) : 2.5,
            nextReviewDate: isDateKey(item.nextReviewDate) ? item.nextReviewDate : getLocalDateKey(new Date()),
            lastReviewedDate: isDateKey(item.lastReviewedDate) ? item.lastReviewedDate : null,
            reviewCount: Number.isInteger(item.reviewCount) && item.reviewCount >= 0 ? item.reviewCount : 0,
            lapses: Number.isInteger(item.lapses) && item.lapses >= 0 ? item.lapses : 0,
            history: Array.isArray(item.history) ? item.history.slice(-50) : [],
          };
        }
      }
    }

    const history = nullMap();
    if (raw.history && typeof raw.history === "object" && !Array.isArray(raw.history)) {
      for (const [rawWordId, item] of Object.entries(raw.history)) {
        const canonical = canonicalKey(rawWordId, index, "history word ID");
        const firstSeen = (item && typeof item === "object" && isDateKey(item.firstSeen))
          ? item.firstSeen
          : ((item && typeof item === "object" && isDateKey(item.date)) ? item.date : getLocalDateKey(new Date()));
        putUnique(history, canonical, { firstSeen }, "history word ID");
      }
    }

    const favorites = nullMap();
    if (raw.favorites && typeof raw.favorites === "object" && !Array.isArray(raw.favorites)) {
      for (const [rawWordId, val] of Object.entries(raw.favorites)) {
        const canonical = canonicalKey(rawWordId, index, "favorite word ID");
        if (val) favorites[canonical] = true;
      }
    }

    // Populate SRS/History/Favorites from wordStates if not already populated
    for (const [wId, ws] of Object.entries(wordStates)) {
      const numericId = numericAlias(wId);
      const targetId = index?.aliases.has(String(wId)) ? index.aliases.get(String(wId)) : (numericId ?? wId);

      if (ws.saved && !favorites[targetId] && !favorites[wId]) {
        favorites[targetId] = true;
      }
      if (ws.dateKey && !history[targetId] && !history[wId]) {
        history[targetId] = { firstSeen: ws.dateKey };
      }
      if (!srs[targetId] && !srs[wId]) {
        const item = createDefaultSrsItem(targetId, ws.dateKey || getLocalDateKey(new Date()));
        if (ws.status === "known") {
          item.repetition = 1;
          item.interval = 1;
          item.reviewCount = 1;
        } else if (ws.status === "difficult") {
          item.repetition = 0;
          item.interval = 1;
          item.lapses = 1;
          item.reviewCount = 1;
          item.ef = 2.3;
        }
        srs[targetId] = item;
      }
    }

    const preferences = {
      showEnglish: raw.preferences?.showEnglish ?? raw.showEnglish ?? true,
      speechRate: typeof raw.preferences?.speechRate === "number" ? raw.preferences.speechRate : 0.85,
      speechRepeat: typeof raw.preferences?.speechRepeat === "number" ? raw.preferences.speechRepeat : 1,
      dailyReviewLimit: typeof raw.preferences?.dailyReviewLimit === "number" ? raw.preferences.dailyReviewLimit : 20,
    };

    const streak = raw.streak || raw.streakData || null;

    return {
      schemaVersion: raw.schemaVersion ?? SCHEMA_VERSION,
      version: raw.version ?? (raw.schemaVersion === 1 ? 1 : 2),
      algorithmVersion: ALGORITHM_VERSION,
      seedHex: raw.seedHex,
      level: raw.level,
      interests: [...raw.interests],
      showEnglish: raw.showEnglish ?? preferences.showEnglish,
      wordStates,
      assignments,
      assignmentOrdinal,
      recentIds,
      evidenceCutoff: raw.evidenceCutoff,
      srs,
      history,
      favorites,
      preferences,
      streak,
    };
  }

  function createProfile({ seedHex = "0".repeat(32), level = 1, interests = [], showEnglish = true } = {}) {
    return copyProfile({
      schemaVersion: SCHEMA_VERSION,
      version: 1,
      algorithmVersion: ALGORITHM_VERSION,
      seedHex,
      level,
      interests,
      showEnglish,
      wordStates: nullMap(),
      assignments: nullMap(),
      assignmentOrdinal: 0,
      recentIds: [],
      evidenceCutoff: null,
      srs: nullMap(),
      history: nullMap(),
      favorites: nullMap(),
      preferences: { showEnglish, speechRate: 0.85, speechRepeat: 1, dailyReviewLimit: 20 },
      streak: null,
    });
  }

  function validateStoredProfile(raw, vocabulary) {
    try {
      const profile = copyProfile(raw, vocabulary);
      return { profile, canPersist: true, recoveryRaw: null, migrated: !Object.hasOwn(raw, "showEnglish") };
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

  function applyFeedback(profile, input, vocabulary = null) {
    const index = vocabulary ? vocabularyIndex(vocabulary) : null;
    const current = copyProfile(profile, vocabulary);
    if (!plainObject(input) || Object.keys(input).some((key) => !new Set(["dateKey", "wordId", "status"]).has(key))) fail("feedback");
    if (!isDateKey(input.dateKey) || !STATUSES.has(input.status)) fail("feedback");
    const targetId = canonicalWordId(input.wordId, index, "feedback wordId");
    const assignment = current.assignments[input.dateKey];
    if (!assignment || String(assignment.wordId) !== String(targetId)) fail("feedback assignment");

    const priorShift = shiftAtCutoff(current);
    const stateKey = String(targetId);
    const previous = current.wordStates[stateKey] || {};
    current.wordStates[stateKey] = { ...previous, status: input.status, dateKey: input.dateKey };
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

    // Also update SM-2 state accordingly
    const currentSrs = current.srs[targetId] || current.srs[input.wordId] || createDefaultSrsItem(targetId, input.dateKey);
    const rating = input.status === "known" ? "good" : "again";
    const sm2Result = calculateSM2(currentSrs, rating, input.dateKey);
    current.srs[targetId] = sm2Result;
    current.history[targetId] = { firstSeen: current.history[targetId]?.firstSeen || input.dateKey };

    return current;
  }

  function canonicalReviewRating(rating) {
    if (typeof rating === "number") {
      if (!Number.isInteger(rating) || rating < 0 || rating > 5) fail("review rating");
      return rating === 1 ? "again" : rating === 3 ? "hard" : rating === 4 ? "good" : rating === 5 ? "easy" : String(rating);
    }
    if (typeof rating !== "string") fail("review rating");
    const trimmed = rating.trim().toLowerCase();
    if (["again", "أعد", "اعد", "مجددا", "مجدداً"].includes(trimmed)) return "again";
    if (["hard", "صعب"].includes(trimmed)) return "hard";
    if (["good", "جيد"].includes(trimmed)) return "good";
    if (["easy", "سهل"].includes(trimmed)) return "easy";
    if (/^[0-5]$/.test(trimmed)) return canonicalReviewRating(Number(trimmed));
    fail("review rating");
  }

  function recordReview(profile, wordId, rating, dateKey, vocabulary = null) {
    const index = vocabulary ? vocabularyIndex(vocabulary) : null;
    const targetId = canonicalWordId(wordId, index, "review wordId");
    if (!isDateKey(dateKey)) fail("review date");
    const canonicalRating = canonicalReviewRating(rating);
    const current = copyProfile(profile, vocabulary);
    const todayKey = dateKey;

    const currentSrs = current.srs[targetId] || current.srs[wordId] || createDefaultSrsItem(targetId, todayKey);
    if (Array.isArray(currentSrs.history) && currentSrs.history.some((entry) => {
      if (!entry || entry.date !== todayKey) return false;
      try { return canonicalReviewRating(entry.rating ?? entry.grade) === canonicalRating; } catch (_) { return false; }
    })) return current;
    const sm2Result = calculateSM2(currentSrs, canonicalRating, todayKey);
    sm2Result.wordId = targetId;

    const persistedSrs = { ...sm2Result };
    delete persistedSrs.historyEntry;
    current.srs[targetId] = persistedSrs;
    if (!current.history[targetId]) {
      current.history[targetId] = { firstSeen: todayKey };
    }

    // Sync to legacy wordStates for backward compatibility
    const stateKey = String(targetId);
    const prevWs = current.wordStates[stateKey] || {};
    const status = sm2Result.repetition > 0 ? "known" : "difficult";
    current.wordStates[stateKey] = { ...prevWs, status, dateKey: todayKey };

    return current;
  }

  function getDueReviewWords(profile, vocabulary, dateKey, limit = null) {
    if (!Array.isArray(vocabulary) || vocabulary.length === 0) return [];
    if (!isDateKey(dateKey)) fail("review queue date");
    if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_REVIEW_LIMIT)) fail("review queue limit");
    const todayKey = dateKey;
    const current = copyProfile(profile, vocabulary);
    const index = vocabularyIndex(vocabulary);

    const wordsMap = new Map();
    for (const w of vocabulary) {
      if (w) {
        wordsMap.set(canonicalWordId(w.id, index), w);
      }
    }

    const dueItems = [];
    for (const [rawId, srsItem] of Object.entries(current.srs)) {
      if (!srsItem || typeof srsItem !== "object") continue;
      const id = srsItem.wordId !== undefined ? canonicalWordId(srsItem.wordId, index, "review word ID") : canonicalWordId(rawId, index, "review word ID");
      const word = wordsMap.get(id);
      if (!word) continue;

      const nextDate = isDateKey(srsItem.nextReviewDate) ? srsItem.nextReviewDate : todayKey;
      if (nextDate <= todayKey) {
        const daysOverdue = Math.max(0, getDaysDifference(nextDate, todayKey));
        dueItems.push({
          word,
          srs: srsItem,
          isOverdue: daysOverdue > 0,
          daysOverdue,
        });
      }
    }

    dueItems.sort((a, b) => {
      if (b.daysOverdue !== a.daysOverdue) {
        return b.daysOverdue - a.daysOverdue;
      }
      const intA = typeof a.srs.interval === "number" ? a.srs.interval : 0;
      const intB = typeof b.srs.interval === "number" ? b.srs.interval : 0;
      if (intA !== intB) return intA - intB;
      const efA = typeof a.srs.ef === "number" ? a.srs.ef : 2.5;
      const efB = typeof b.srs.ef === "number" ? b.srs.ef : 2.5;
      if (efA !== efB) return efA - efB;
      const repA = typeof a.srs.repetition === "number" ? a.srs.repetition : 0;
      const repB = typeof b.srs.repetition === "number" ? b.srs.repetition : 0;
      if (repA !== repB) return repA - repB;
      return (Number(a.word.id) || 0) - (Number(b.word.id) || 0);
    });

    if (typeof limit === "number" && limit > 0) {
      return dueItems.slice(0, Math.floor(limit));
    }

    return dueItems;
  }

  function getReviewStats(profile, vocabulary, dateKey) {
    if (!isDateKey(dateKey)) fail("review stats date");
    const todayKey = dateKey;
    const current = copyProfile(profile, vocabulary);
    const srsList = Object.values(current.srs);

    const totalCards = srsList.length;
    let dueToday = 0;
    let reviewedToday = 0;
    let totalGrade = 0;
    let successReviews = 0;
    let totalReviews = 0;
    let learningCount = 0;
    let reviewCount = 0;
    let masteredCount = 0;
    let sumEf = 0;

    for (const item of srsList) {
      if (!item) continue;
      sumEf += item.ef || 2.5;
      if (item.nextReviewDate && item.nextReviewDate <= todayKey) {
        dueToday++;
      }
      if (item.lastReviewedDate === todayKey) {
        reviewedToday++;
      }
      if (item.repetition === 0) {
        learningCount++;
      } else if (item.repetition >= 4 && item.interval >= 21) {
        masteredCount++;
      } else {
        reviewCount++;
      }
      if (Array.isArray(item.history)) {
        for (const h of item.history) {
          if (h && typeof h === "object") {
            totalReviews++;
            const grade = typeof h.grade === "number" ? h.grade : mapRatingToGrade(h.rating);
            if (grade >= 3) successReviews++;
          }
        }
      }
    }

    const retentionRate = totalReviews > 0 ? Math.round((successReviews / totalReviews) * 1000) / 10 : 100;
    const averageEF = totalCards > 0 ? Math.round((sumEf / totalCards) * 100) / 100 : 2.5;

    return {
      totalCards,
      dueToday,
      reviewedToday,
      retentionRate,
      learningCount,
      reviewCount,
      masteredCount,
      averageEF,
    };
  }

  function migrateLegacyToV2(profile) {
    return copyProfile(profile);
  }

  function migrateState(rawState, currentDateKey, validIds = null) {
    const fallbackDate = isDateKey(currentDateKey) ? currentDateKey : getLocalDateKey(new Date());
    let raw = rawState;
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch { raw = null; }
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return createProfile();
    }
    return copyProfile(raw);
  }

  function parseImport(text, vocabulary) {
    try {
      if (typeof text !== "string" || encoder.encode(text).byteLength > MAX_IMPORT_BYTES) throw new TypeError("size");
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("invalid");
      for (const key of Object.keys(parsed)) {
        if (DANGEROUS_KEYS.has(key)) throw new TypeError("dangerous key");
      }
      return copyProfile(parsed, vocabulary);
    } catch (_) {
      throw new TypeError("Invalid import.");
    }
  }

  function serializeExport(profile) {
    const copy = copyProfile(profile);
    return `${JSON.stringify(copy)}\n`;
  }

  function pruneAssignments(profile) {
    const copy = copyProfile(profile, undefined, MAX_RECORDS);
    const newest = Object.keys(copy.assignments).sort().slice(-MAX_ASSIGNMENTS);
    const assignments = nullMap();
    for (const dateKey of newest) assignments[dateKey] = copy.assignments[dateKey];
    return { ...copy, assignments };
  }

  return {
    createProfile,
    validateStoredProfile,
    applyFeedback,
    recordReview,
    getDueReviewWords,
    getReviewStats,
    calculateSM2,
    createDefaultSrsItem,
    mapRatingToGrade,
    canonicalReviewRating,
    normalizeWordId: canonicalWordId,
    vocabularyIndex,
    migrateLegacyToV2,
    migrateState,
    parseImport,
    serializeExport,
    pruneAssignments,
  };
});
