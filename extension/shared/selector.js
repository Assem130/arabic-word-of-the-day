(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatSelector = api;
})(globalThis, function () {
  "use strict";

  const encoder = new TextEncoder();
  const DIFFICULTY = { beginner: 1, intermediate: 2, advanced: 3 };
  const USEFULNESS = { high: 0, medium: 1, low: 2 };
  const PARTS = new Set(["noun", "verb", "adjective", "adverb", "phrase", "other"]);
  const REGISTERS = new Set(["standard", "classical", "colloquial"]);
  const MAX_CANONICAL_ID = 365;

  async function sha256Hex(text) {
    const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(text));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function numericAlias(value) {
    const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
    const match = /^(?:w)?(\d+)$/i.exec(text);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_CANONICAL_ID ? parsed : null;
  }

  function vocabularyIndex(vocabulary) {
    if (!Array.isArray(vocabulary)) throw new TypeError("Invalid vocabulary.");
    // Legacy fixtures may still use wN IDs. The shipped corpus is numeric, so
    // only that corpus (or a corpus containing numeric IDs) opts into aliases.
    const canonicalMode = vocabulary.some((word) => word && typeof word.id === "number")
      || (vocabulary.length === MAX_CANONICAL_ID && vocabulary.every((word) => numericAlias(word?.id) !== null));
    const aliases = new Map();
    const records = new Map();
    const aliasesByCanonical = new Map();
    for (const word of vocabulary) {
      if (!word) continue;
      const rawId = word.id;
      const numeric = canonicalMode ? numericAlias(rawId) : null;
      const canonical = numeric ?? rawId;
      if (records.has(canonical) && records.get(canonical) !== word) throw new TypeError("Vocabulary ID collision.");
      records.set(canonical, word);
      const rawAliases = [String(rawId), String(canonical)];
      if (numeric !== null) rawAliases.push(`w${numeric}`);
      const knownAliases = aliasesByCanonical.get(canonical) || [];
      for (const alias of rawAliases) {
        const prior = aliases.get(alias);
        if (prior !== undefined && prior !== canonical) throw new TypeError("Vocabulary ID collision.");
        aliases.set(alias, canonical);
        if (!knownAliases.includes(alias)) knownAliases.push(alias);
      }
      aliasesByCanonical.set(canonical, knownAliases);
    }
    return { aliases, records, aliasesByCanonical };
  }

  function canonicalId(value, index) {
    if (index?.aliases.has(String(value))) return index.aliases.get(String(value));
    return value;
  }

  function validCandidate(word) {
    return word && ((typeof word.id === "string" && word.id.length > 0) || (Number.isInteger(word.id) && word.id >= 1)) && word.reviewed === true
      && Object.hasOwn(DIFFICULTY, word.difficultyBand) && Object.hasOwn(USEFULNESS, word.usefulnessBand)
      && Array.isArray(word.topics) && word.topics.length > 0 && word.topics.every((topic) => typeof topic === "string" && topic.length > 0)
      && PARTS.has(word.partOfSpeech) && REGISTERS.has(word.register);
  }

  function intersects(left, right) {
    return left.some((item) => right.includes(item));
  }

  function metadataMatch(candidate, recentWords, key) {
    const value = candidate[key];
    if (value === undefined || value === "") return 0;
    return recentWords.some((recent) => recent[key] === value) ? 1 : 0;
  }

  function topicMatch(candidate, recentWords) {
    return recentWords.some((recent) => Array.isArray(recent.topics) && intersects(candidate.topics, recent.topics)) ? 1 : 0;
  }

  function interestPenalty(candidate, interests, broaden) {
    if (!interests.length) return 0;
    const matches = intersects(candidate.topics, interests);
    return broaden ? (matches ? 1 : 0) : (matches ? 0 : 1);
  }

  function compareTuples(left, right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  }

  async function rankCandidates({ candidates, profile, dateKey, recentWords = [], broaden = false, digestHex = sha256Hex, explain = false }) {
    const algorithmVersion = profile.algorithmVersion;
    const ranked = await Promise.all(candidates.map(async (candidate) => {
      const digest = await digestHex(`${algorithmVersion}\u001f${profile.seedHex}\u001f${dateKey}\u001f${candidate.id}`);
      if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) throw new TypeError("Invalid selector digest.");
      return {
        candidate,
        tuple: [
          interestPenalty(candidate, profile.interests || [], broaden),
          metadataMatch(candidate, recentWords, "root"),
          topicMatch(candidate, recentWords),
          metadataMatch(candidate, recentWords, "register"),
          metadataMatch(candidate, recentWords, "partOfSpeech"),
          USEFULNESS[candidate.usefulnessBand],
          digest,
        ],
      };
    }));
    ranked.sort((left, right) => compareTuples(left.tuple, right.tuple));
    return explain ? ranked : ranked.map(({ candidate }) => candidate);
  }

  function assignmentCount(profile) {
    if (Number.isSafeInteger(profile.assignmentOrdinal) && profile.assignmentOrdinal >= 0) return profile.assignmentOrdinal;
    return profile.assignments && typeof profile.assignments === "object" ? Object.keys(profile.assignments).length : 0;
  }

  function stateFor(states, canonical, index) {
    if (!states || typeof states !== "object") return undefined;
    const aliases = index?.aliasesByCanonical.get(canonical) || [String(canonical)];
    let found;
    for (const alias of aliases) {
      if (!Object.hasOwn(states, alias)) continue;
      const value = states[alias];
      if (found && JSON.stringify(found) !== JSON.stringify(value)) throw new TypeError("Word state ID collision.");
      found = value;
    }
    return found;
  }

  function normalizeLevel(level) {
    return Number.isInteger(level) ? Math.min(3, Math.max(1, level)) : 1;
  }

  function pickBand(candidates, level, recentIds, cooldown) {
    const blocked = new Set(recentIds.slice(0, cooldown));
    const available = candidates.filter((candidate) => !blocked.has(candidate.id));
    for (let distance = 0; distance <= 3; distance += 1) {
      const band = available.filter((candidate) => Math.abs(DIFFICULTY[candidate.difficultyBand] - level) === distance);
      if (band.length) return band;
    }
    return [];
  }

  async function selectDaily({ vocabulary, profile, dateKey, digestHex = sha256Hex, explain = false }) {
    const index = vocabularyIndex(vocabulary);
    const existing = profile.assignments && profile.assignments[dateKey];
    if (existing) {
      const existingId = canonicalId(existing.wordId, index);
      if (index.records.has(existingId)) return { kind: "assigned", wordId: existingId };
    }

    const states = profile.wordStates || {};
    const reviewed = vocabulary.filter(validCandidate).map((word) => ({ ...word, id: canonicalId(word.id, index) }));
    const eligible = reviewed.filter((word) => {
      const canonical = canonicalId(word.id, index);
      return stateFor(states, canonical, index)?.status !== "known";
    });
    if (!eligible.length) return { kind: "no-new-word" };

    const recentIds = Array.isArray(profile.recentIds) ? profile.recentIds : [];
    const byId = new Map(reviewed.map((word) => [canonicalId(word.id, index), word]));
    const canonicalRecentIds = recentIds.map((id) => canonicalId(id, index));
    const recentWords = canonicalRecentIds.map((id) => byId.get(id)).filter(Boolean);
    const cooldown = Math.min(14, Math.floor(eligible.length / 3));
    const level = normalizeLevel(profile.level);
    let candidates = pickBand(eligible, level, canonicalRecentIds, cooldown);
    const cooldownRelaxed = !candidates.length;
    if (cooldownRelaxed) candidates = pickBand(eligible, level, [], 0);
    if (!candidates.length) return { kind: "no-new-word" };

    const broaden = (assignmentCount(profile) + 1) % 7 === 0;
    const ranked = await rankCandidates({
      candidates,
      profile,
      dateKey,
      recentWords,
      broaden,
      digestHex,
      explain,
    });
    const winner = explain ? ranked[0].candidate : ranked[0];
    const winnerId = canonicalId(winner.id, index);
    if (!explain) return { kind: "assigned", wordId: winnerId };
    return { kind: "assigned", wordId: winnerId, explanation: { cooldown, cooldownRelaxed, abilityDistance: Math.abs(DIFFICULTY[winner.difficultyBand] - level), broaden, tuple: ranked[0].tuple } };
  }

  return { sha256Hex, rankCandidates, selectDaily, canonicalId, vocabularyIndex };
});
