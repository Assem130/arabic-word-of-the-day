const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createProfile,
  validateStoredProfile,
  applyFeedback,
  getDueReviewWords,
  getReviewOptions,
  parseImport,
  serializeExport,
  pruneAssignments,
} = require("../shared/state.js");

const vocabulary = ["w1", "w2", "w3"].map((id) => ({ id }));
const seed = "a".repeat(32);

function profileWithAssignment(dateKey, wordId = "w1", overrides = {}) {
  const profile = createProfile({ seedHex: seed, level: 2, interests: ["travel"] });
  const assignments = { ...profile.assignments, ...overrides.assignments, [dateKey]: { wordId } };
  return { ...profile, ...overrides, assignments, assignmentOrdinal: Math.max(overrides.assignmentOrdinal ?? 0, Object.keys(assignments).length) };
}

function feedbackFor(profile, dateKey) {
  return profile.assignments[dateKey].status;
}

function rejected(raw) {
  const result = validateStoredProfile(raw, vocabulary);
  assert.equal(result.canPersist, false);
  assert.deepEqual(result.recoveryRaw, raw);
}

test("future and corrupt state stays recoverable and read-only", () => {
  const raw = { schemaVersion: 999, marker: "keep-me" };
  const result = validateStoredProfile(raw, vocabulary);
  assert.equal(result.canPersist, false);
  assert.deepEqual(result.recoveryRaw, raw);
});

test("future schemas and malformed preferences stay recoverable and read-only", () => {
  const base = profileWithAssignment("2026-07-30");
  for (const raw of [
    { ...base, schemaVersion: 2 },
    { ...base, schemaVersion: 3 },
    { ...base, preferences: { ...base.preferences, speechRate: 9 } },
    { ...base, preferences: { ...base.preferences, dailyReviewLimit: -1 } },
    { ...base, preferences: "bad" },
    { ...base, preferences: { ...base.preferences, unexpected: true } },
  ]) {
    rejected(raw);
  }
});

test("supplied preference fields validate while missing fields use defaults", () => {
  const base = profileWithAssignment("2026-07-30");
  const partial = validateStoredProfile({ ...base, preferences: { speechRate: 1.25 } }, vocabulary);
  assert.equal(partial.canPersist, true);
  assert.deepEqual(partial.profile.preferences, {
    showEnglish: true,
    speechRate: 1.25,
    speechRepeat: 1,
    dailyReviewLimit: 20,
  });
  for (const preferences of [
    { showEnglish: "yes" },
    { speechRate: 0.49 },
    { speechRate: 1.51 },
    { speechRepeat: 2 },
    { dailyReviewLimit: 2.5 },
    { dailyReviewLimit: 101 },
  ]) {
    rejected({ ...base, preferences });
  }
});

test("clear-data defaults create a bounded canonical profile", () => {
  const profile = createProfile({});
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.algorithmVersion, 1);
  assert.match(profile.seedHex, /^[0-9a-f]{32}$/);
  assert.equal(profile.level, 1);
  assert.deepEqual(profile.interests, []);
  assert.deepEqual(Object.keys(profile.wordStates), []);
  assert.equal(Object.getPrototypeOf(profile.wordStates), null);
  assert.equal(Object.getPrototypeOf(profile.assignments), null);
  assert.equal(profile.evidenceCutoff, null);
  assert.equal(profile.assignmentOrdinal, 0);
});

test("review queue is bounded and carries exact SM-2 options", () => {
  const reviewVocabulary = Array.from({ length: 21 }, (_, index) => ({ id: `w${index + 1}` }));
  const reviewProfile = createProfile({ seedHex: seed, level: 1, interests: ["language"] });
  reviewProfile.srs = Object.fromEntries(reviewVocabulary.map((item) => [item.id, {
    wordId: item.id,
    repetition: 0,
    interval: 0,
    ef: 2.5,
    nextReviewDate: "2026-08-17",
    lastReviewedDate: null,
    reviewCount: 0,
    lapses: 0,
    history: [],
  }]));
  reviewProfile.history = Object.fromEntries(reviewVocabulary.map((item) => [item.id, { firstSeen: "2026-08-17" }]));

  const due = getDueReviewWords(reviewProfile, reviewVocabulary, "2026-08-17", 20);
  assert.equal(due.length, 20);
  assert.equal(due[0].reviewOptions.good.nextReviewDate, "2026-08-18");
  assert.deepEqual(due[0].reviewOptions.easy, getReviewOptions(due[0].srs, "2026-08-17").easy);
});

test("legacy profiles migrate a bounded lifetime assignment ordinal without recovery mode", () => {
  const legacy = profileWithAssignment("2026-07-30");
  delete legacy.assignmentOrdinal;
  const migrated = validateStoredProfile(legacy, vocabulary);
  assert.equal(migrated.canPersist, true);
  assert.equal(migrated.profile.assignmentOrdinal, 1);

  const explicit = validateStoredProfile({ ...legacy, assignmentOrdinal: 5004 }, vocabulary);
  assert.equal(explicit.profile.assignmentOrdinal, 5004);
  assert.equal(validateStoredProfile({ ...legacy, assignmentOrdinal: -1 }, vocabulary).canPersist, false);
});

test("legacy profiles and imports missing showEnglish migrate to Arabic-first defaults", () => {
  const legacy = profileWithAssignment("2026-07-30");
  delete legacy.showEnglish;
  const stored = validateStoredProfile(legacy, vocabulary);
  assert.equal(stored.canPersist, true);
  assert.equal(stored.profile.showEnglish, true);
  assert.equal(stored.migrated, true);

  const imported = parseImport(JSON.stringify(legacy), vocabulary);
  assert.equal(imported.showEnglish, true);
});

test("existing assignments and word state remain readable across the 0.2.0 corpus refresh", () => {
  const currentVocabulary = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "vocabulary.json"), "utf8"));
  const stored = profileWithAssignment("2026-07-30", "w60", {
    wordStates: { w57: { status: "known", dateKey: "2026-07-29", saved: true } },
    recentIds: ["w57", "w60"],
  });
  const result = validateStoredProfile(stored, currentVocabulary);
  assert.equal(result.canPersist, true);
  assert.equal(result.profile.assignments["2026-07-30"].wordId, 60);
  assert.equal(result.profile.wordStates[57].saved, true);
  assert.deepEqual(result.profile.recentIds, [57, 60]);
});

test("unknown or malformed showEnglish data remains read-only recovery", () => {
  const valid = profileWithAssignment("2026-07-30");
  rejected({ ...valid, showEnglish: "yes" });
  rejected({ ...valid, showEnglish: false, unknown: true });
});

test("stored profiles reject unknown, dangerous, malformed, and invalid enum data without changing it", () => {
  const valid = profileWithAssignment("2026-07-30");
  rejected({ ...valid, unexpected: true });
  rejected(JSON.parse('{"schemaVersion":1,"__proto__":{"polluted":true}}'));
  rejected({ ...valid, seedHex: "A".repeat(32) });
  rejected({ ...valid, level: 5 });
  rejected({ ...valid, interests: ["travel", "food", "family", "language"] });
  rejected({ ...valid, interests: ["uncontrolled"] });
  rejected({ ...valid, assignments: { "2026-02-29": { wordId: "w1" } } });
  rejected({ ...valid, wordStates: { w1: { status: "maybe", dateKey: "2026-07-30", saved: false } } });
  rejected([]);
  rejected(null);
});

test("feedback edits replace rather than duplicate evidence", () => {
  const original = profileWithAssignment("2026-07-30", "w1", {
    wordStates: { w1: { status: "known", dateKey: "2026-07-30", saved: true } },
  });
  const once = applyFeedback(original, { dateKey: "2026-07-30", wordId: "w1", status: "known" });
  const edited = applyFeedback(once, { dateKey: "2026-07-30", wordId: "w1", status: "difficult" });
  assert.equal(edited.wordStates.w1.status, "difficult");
  assert.equal(edited.wordStates.w1.saved, true);
  assert.equal(feedbackFor(edited, "2026-07-30"), "difficult");
  assert.equal(Object.keys(edited.assignments).length, 1);
  assert.equal(original.assignments["2026-07-30"].status, undefined);
  assert.equal(Object.getPrototypeOf(edited.wordStates), null);
});

test("feedback shifts ability only for six matching distinct post-cutoff daily responses", () => {
  let rising = createProfile({ seedHex: seed, level: 2, interests: [] });
  for (let day = 1; day <= 8; day += 1) {
    const dateKey = `2026-07-${String(day).padStart(2, "0")}`;
    rising = applyFeedback(profileWithAssignment(dateKey, "w1", rising), {
      dateKey, wordId: "w1", status: day <= 6 ? "known" : "difficult",
    });
  }
  assert.equal(rising.level, 3);
  assert.equal(rising.evidenceCutoff, "2026-07-08");

  const reversed = applyFeedback(rising, { dateKey: "2026-07-01", wordId: "w1", status: "difficult" });
  assert.equal(reversed.level, 2);
  assert.equal(reversed.evidenceCutoff, null);
  assert.equal(reversed.assignments["2026-07-01"].status, "difficult");

  const afterCutoff = applyFeedback(profileWithAssignment("2026-07-09", "w1", rising), {
    dateKey: "2026-07-09", wordId: "w1", status: "known",
  });
  const editedAfterCutoff = applyFeedback(afterCutoff, {
    dateKey: "2026-07-09", wordId: "w1", status: "difficult",
  });
  assert.equal(editedAfterCutoff.level, 3);
  assert.equal(editedAfterCutoff.evidenceCutoff, "2026-07-08");

  let mixed = createProfile({ seedHex: seed, level: 2, interests: [] });
  for (let day = 1; day <= 6; day += 1) {
    const dateKey = `2026-06-${String(day).padStart(2, "0")}`;
    mixed = applyFeedback(profileWithAssignment(dateKey, "w1", mixed), {
      dateKey, wordId: "w1", status: day <= 5 ? "known" : "difficult",
    });
  }
  assert.equal(mixed.level, 2);
  assert.equal(mixed.evidenceCutoff, null);
});

test("imports reject bounded hostile data before returning a separate profile", () => {
  const valid = profileWithAssignment("2026-07-30");
  const imported = parseImport(serializeExport(valid), vocabulary);
  imported.assignments["2026-07-30"].wordId = "w2";
  assert.equal(valid.assignments["2026-07-30"].wordId, "w1");

  assert.throws(() => parseImport("x".repeat(2 * 1024 * 1024 + 1), vocabulary), /import/i);
  assert.throws(() => parseImport("[]", vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, schemaVersion: 2 }), vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, schemaVersion: 3 }), vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, unknown: true }), vocabulary), /import/i);
  assert.throws(() => parseImport('{"schemaVersion":1,"__proto__":{}}', vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, assignments: { "2026-07-30": { wordId: "x".repeat(65) } } }), vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, seedHex: "a".repeat(2001) }), vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, recentIds: Array(17).fill("w1") }), vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, assignments: { "2026-07-30": { wordId: "w1", extra: "x".repeat(16 * 1024) } } }), vocabulary), /import/i);

  const largeVocabulary = Array.from({ length: 10001 }, (_, index) => ({ id: `w${index}` }));
  const wordStates = Object.fromEntries(largeVocabulary.map(({ id }) => [id, { status: "known", dateKey: "2026-07-30", saved: false }]));
  assert.throws(() => parseImport(JSON.stringify({ ...valid, wordStates }), largeVocabulary), /import/i);

  const assignments = {};
  for (let day = 1; day <= 5001; day += 1) {
    assignments[new Date(Date.UTC(2000, 0, day)).toISOString().slice(0, 10)] = { wordId: "w1" };
  }
  rejected({ ...valid, assignments });
  assert.throws(() => parseImport(JSON.stringify({ ...valid, assignments }), vocabulary), /import/i);
});

test("pruning retains the newest 5000 assignments and export is newline-terminated without mutations", () => {
  const assignments = {};
  for (let day = 1; day <= 5001; day += 1) {
    const date = new Date(Date.UTC(2000, 0, day));
    assignments[date.toISOString().slice(0, 10)] = { wordId: "w1" };
  }
  const original = profileWithAssignment("2026-07-30", "w1", { assignments });
  const pruned = pruneAssignments(original);
  assert.equal(Object.keys(pruned.assignments).length, 5000);
  assert.equal(Object.hasOwn(pruned.assignments, "2000-01-01"), false);
  assert.equal(Object.hasOwn(original.assignments, "2000-01-01"), true);
  assert.equal(Object.getPrototypeOf(pruned.assignments), null);

  const exported = serializeExport(pruned);
  assert.equal(exported.endsWith("\n"), true);
  const parsed = JSON.parse(exported);
  parsed.assignments["2000-01-03"].wordId = "w2";
  assert.equal(pruned.assignments["2000-01-03"].wordId, "w1");
});
