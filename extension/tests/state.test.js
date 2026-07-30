const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createProfile,
  validateStoredProfile,
  applyFeedback,
  parseImport,
  serializeExport,
  pruneAssignments,
} = require("../shared/state.js");

const vocabulary = ["w1", "w2", "w3"].map((id) => ({ id }));
const seed = "a".repeat(32);

function profileWithAssignment(dateKey, wordId = "w1", overrides = {}) {
  const profile = createProfile({ seedHex: seed, level: 2, interests: ["travel"] });
  return { ...profile, ...overrides, assignments: { ...profile.assignments, ...overrides.assignments, [dateKey]: { wordId } } };
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
  assert.throws(() => parseImport(JSON.stringify({ ...valid, unknown: true }), vocabulary), /import/i);
  assert.throws(() => parseImport('{"schemaVersion":1,"__proto__":{}}', vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, assignments: { "2026-07-30": { wordId: "x".repeat(65) } } }), vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, seedHex: "a".repeat(2001) }), vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, recentIds: Array(17).fill("w1") }), vocabulary), /import/i);
  assert.throws(() => parseImport(JSON.stringify({ ...valid, assignments: { "2026-07-30": { wordId: "w1", extra: "x".repeat(16 * 1024) } } }), vocabulary), /import/i);

  const largeVocabulary = Array.from({ length: 10001 }, (_, index) => ({ id: `w${index}` }));
  const wordStates = Object.fromEntries(largeVocabulary.map(({ id }) => [id, { status: "known", dateKey: "2026-07-30", saved: false }]));
  assert.throws(() => parseImport(JSON.stringify({ ...valid, wordStates }), largeVocabulary), /import/i);
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
