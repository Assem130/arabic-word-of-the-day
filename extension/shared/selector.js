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

  async function sha256Hex(text) {
    const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(text));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function validCandidate(word) {
    return word && typeof word.id === "string" && word.id.length > 0 && word.reviewed === true
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
    return profile.assignments && typeof profile.assignments === "object" ? Object.keys(profile.assignments).length : 0;
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
    const existing = profile.assignments && profile.assignments[dateKey];
    if (existing && typeof existing.wordId === "string" && vocabulary.some((word) => word && word.id === existing.wordId)) {
      return { kind: "assigned", wordId: existing.wordId };
    }

    const states = profile.wordStates || {};
    const reviewed = vocabulary.filter(validCandidate);
    const eligible = reviewed.filter((word) => states[word.id]?.status !== "known");
    if (!eligible.length) return { kind: "no-new-word" };

    const recentIds = Array.isArray(profile.recentIds) ? profile.recentIds : [];
    const byId = new Map(reviewed.map((word) => [word.id, word]));
    const recentWords = recentIds.map((id) => byId.get(id)).filter(Boolean);
    const cooldown = Math.min(14, Math.floor(eligible.length / 3));
    const level = Number.isInteger(profile.level) ? profile.level : 1;
    let candidates = pickBand(eligible, level, recentIds, cooldown);
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
    if (!explain) return { kind: "assigned", wordId: winner.id };
    return { kind: "assigned", wordId: winner.id, explanation: { cooldown, cooldownRelaxed, abilityDistance: Math.abs(DIFFICULTY[winner.difficultyBand] - level), broaden, tuple: ranked[0].tuple } };
  }

  return { sha256Hex, rankCandidates, selectDaily };
});
