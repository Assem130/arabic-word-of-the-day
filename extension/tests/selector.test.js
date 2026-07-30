const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const childProcess = require("node:child_process");

globalThis.crypto ??= webcrypto;

const { createProfile } = require("../shared/state.js");
const { getLocalDateKey } = require("../shared/date.js");
const { selectDaily, sha256Hex, rankCandidates } = require("../shared/selector.js");

const seedHex = "a".repeat(32);
const dateKey = "2026-07-30";

function word(id, overrides = {}) {
  return {
    id,
    difficultyBand: "beginner",
    usefulnessBand: "medium",
    topics: ["language"],
    partOfSpeech: "noun",
    register: "standard",
    reviewed: true,
    ...overrides,
  };
}

function profile(overrides = {}) {
  const base = createProfile({ seedHex, level: 1, interests: ["language"] });
  return {
    ...base,
    ...overrides,
    assignments: { ...base.assignments, ...overrides.assignments },
    wordStates: { ...base.wordStates, ...overrides.wordStates },
    recentIds: overrides.recentIds ?? base.recentIds,
  };
}

async function selected(vocabulary, profileValue = profile(), date = dateKey) {
  return selectDaily({ vocabulary, profile: profileValue, dateKey: date });
}

test("same inputs select the same word regardless of corpus order", async () => {
  const vocabulary = [word("w1"), word("w2"), word("w3")];
  const a = await selected(vocabulary);
  const b = await selected([...vocabulary].reverse());
  assert.deepEqual(a, b);
});

test("all-known corpus terminates explicitly", async () => {
  const vocabulary = [word("w1"), word("w2")];
  const allKnownProfile = profile({
    wordStates: {
      w1: { status: "known", dateKey },
      w2: { status: "known", dateKey },
    },
  });
  assert.deepEqual(await selected(vocabulary, allKnownProfile), { kind: "no-new-word" });
});

test("existing local dates survive timezone travel, DST, leap day, forward jumps, and rollback", async () => {
  const vocabulary = [word("w1"), word("w2")];
  const zoneDate = (zone) => childProcess.execFileSync(process.execPath, ["-e", "process.stdout.write(require('./extension/shared/date.js').getLocalDateKey(new Date('2026-07-30T00:30:00Z')))"], { cwd: require("node:path").join(__dirname, "..", ".."), env: { ...process.env, TZ: zone } }).toString();
  const losAngeles = zoneDate("America/Los_Angeles");
  const tokyo = zoneDate("Asia/Tokyo");
  assert.equal(losAngeles, "2026-07-29");
  assert.equal(tokyo, "2026-07-30");
  const fixed = profile({ assignments: { "2024-02-29": { wordId: "w2" }, "2026-11-01": { wordId: "w1" }, [losAngeles]: { wordId: "w1" }, [tokyo]: { wordId: "w2" }, "2026-08-15": { wordId: "w2" } } });
  assert.deepEqual(await selected(vocabulary, fixed, "2024-02-29"), { kind: "assigned", wordId: "w2" });
  assert.deepEqual(await selected(vocabulary, fixed, "2026-11-01"), { kind: "assigned", wordId: "w1" });
  assert.deepEqual(await selected(vocabulary, fixed, losAngeles), { kind: "assigned", wordId: "w1" });
  assert.deepEqual(await selected(vocabulary, fixed, tokyo), { kind: "assigned", wordId: "w2" });
  assert.deepEqual(await selected(vocabulary, fixed, getLocalDateKey(new Date(2026, 7, 15))), { kind: "assigned", wordId: "w2" });
  assert.equal((await selected(vocabulary, fixed, "2026-07-30")).kind, "assigned");
});

test("exact ability beats more useful farther difficulty", async () => {
  const result = await selected([
    word("beginner", { usefulnessBand: "low" }),
    word("advanced", { difficultyBand: "advanced", usefulnessBand: "high" }),
  ]);
  assert.deepEqual(result, { kind: "assigned", wordId: "beginner" });
});

test("widens exactly one ability band before farther bands", async () => {
  const result = await selected([
    word("advanced", { difficultyBand: "advanced" }),
    word("intermediate", { difficultyBand: "intermediate" }),
  ], profile({ level: 1 }));
  assert.deepEqual(result, { kind: "assigned", wordId: "intermediate" });
});

test("cooldown is min(14, floor(eligible / 3)) and relaxes only after all bands are exhausted", async () => {
  const vocabulary = [word("recent"), word("other-a"), word("other-b")];
  const result = await selected(vocabulary, profile({ recentIds: ["recent", "other-a", "other-b"] }));
  assert.equal(result.kind, "assigned");

  const wideVocabulary = [word("recent"), word("advanced", { difficultyBand: "advanced" }), word("another", { difficultyBand: "advanced" })];
  const wideResult = await selected(wideVocabulary, profile({ recentIds: ["recent"] }));
  assert.notEqual(wideResult.wordId, "recent");

  const digest = async (value) => value.endsWith("\u001frecent-2") ? "0".repeat(64) : "f".repeat(64);
  const floorVocabulary = [word("recent-1"), word("recent-2"), word("available"), ...Array.from({ length: 5 }, (_, index) => word(`advanced-${index}`, { difficultyBand: "advanced" }))];
  assert.deepEqual(await selectDaily({ vocabulary: floorVocabulary, profile: profile({ recentIds: ["recent-1", "recent-2"] }), dateKey, digestHex: digest }), { kind: "assigned", wordId: "available" });

  const cappedVocabulary = [...Array.from({ length: 15 }, (_, index) => word(`recent-${index}`)), ...Array.from({ length: 30 }, (_, index) => word(`advanced-cap-${index}`, { difficultyBand: "advanced" }))];
  assert.deepEqual(await selectDaily({ vocabulary: cappedVocabulary, profile: profile({ recentIds: Array.from({ length: 15 }, (_, index) => `recent-${index}`) }), dateKey, digestHex: digest }), { kind: "assigned", wordId: "recent-14" });
});

test("skips known, unreviewed, and malformed candidates", async () => {
  const result = await selected([
    word("known"),
    word("unreviewed", { reviewed: false }),
    { id: "broken", reviewed: true },
    word("usable"),
  ], profile({ wordStates: { known: { status: "known", dateKey } } }));
  assert.deepEqual(result, { kind: "assigned", wordId: "usable" });
});

test("diversifies root, topic, register, and part of speech before usefulness", async () => {
  const vocabulary = [
    word("recent", { root: "k-t-b", topics: ["travel"], register: "classical", partOfSpeech: "verb" }),
    word("same", { root: "k-t-b", topics: ["travel"], register: "classical", partOfSpeech: "verb", usefulnessBand: "high" }),
    word("varied", { root: "q-r-a", topics: ["food"], register: "colloquial", partOfSpeech: "adjective", usefulnessBand: "low" }),
  ];
  const result = await selected(vocabulary, profile({ interests: [], recentIds: ["recent"] }));
  assert.deepEqual(result, { kind: "assigned", wordId: "varied" });
});

test("known recent words still diversify the next assignment", async () => {
  const vocabulary = [word("known", { root: "k-t-b", topics: ["travel"], register: "classical", partOfSpeech: "verb" }), word("same", { root: "k-t-b", topics: ["travel"], register: "classical", partOfSpeech: "verb", usefulnessBand: "high" }), word("varied", { root: "q-r-a", topics: ["food"], register: "colloquial", partOfSpeech: "adjective" })];
  assert.deepEqual(await selected(vocabulary, profile({ interests: [], recentIds: ["known"], wordStates: { known: { status: "known", dateKey } } })), { kind: "assigned", wordId: "varied" });
});

test("every seventh new assignment broadens beyond the learner interests", async () => {
  const vocabulary = [
    word("interest", { topics: ["language"], usefulnessBand: "high" }),
    word("outside", { topics: ["food"], usefulnessBand: "low" }),
  ];
  assert.deepEqual(await selected(vocabulary), { kind: "assigned", wordId: "interest" });
  const assignments = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`2026-07-${String(index + 1).padStart(2, "0")}`, { wordId: "interest" }]));
  assert.deepEqual(await selected(vocabulary, profile({ assignments })), { kind: "assigned", wordId: "outside" });
});

test("usefulness orders otherwise equal candidates and optional metadata is optional", async () => {
  const result = await selected([
    word("low", { usefulnessBand: "low", root: undefined }),
    word("high", { usefulnessBand: "high", root: undefined, pattern: undefined, relatedIds: undefined }),
  ], profile({ interests: [] }));
  assert.deepEqual(result, { kind: "assigned", wordId: "high" });
});

test("SHA-256 uses UTF-8 bytes and ranks Unicode IDs deterministically", async () => {
  assert.equal(await sha256Hex("كلمة"), "259d7f07e205d2f8d10db102faafb028c8a2ea3bb4e1cf18abd81201f9b419dc");
  const ranked = await rankCandidates({
    candidates: [word("é"), word("z")],
    profile: profile({ interests: [] }),
    dateKey,
    recentWords: [],
    broaden: false,
  });
  assert.deepEqual(ranked.map((candidate) => candidate.id).sort(), ["z", "é"].sort());
  assert.deepEqual(ranked.map((candidate) => candidate.id), (await rankCandidates({
    candidates: [word("z"), word("é")], profile: profile({ interests: [] }), dateKey, recentWords: [], broaden: false,
  })).map((candidate) => candidate.id));
});

test("explain mode exposes the winning tuple without changing default results", async () => {
  const result = await selectDaily({ vocabulary: [word("w1")], profile: profile(), dateKey, digestHex: async () => "0".repeat(64), explain: true });
  assert.deepEqual(result, { kind: "assigned", wordId: "w1", explanation: { cooldown: 0, cooldownRelaxed: false, abilityDistance: 0, broaden: false, tuple: [0, 0, 0, 0, 0, 1, "0".repeat(64)] } });
  assert.deepEqual(await selected([word("w1")]), { kind: "assigned", wordId: "w1" });
});

test("fixed learner profiles select an assigned word for every local day in a leap year", async () => {
  const vocabulary = Array.from({ length: 60 }, (_, index) => word(`w${index}`, {
    difficultyBand: ["beginner", "intermediate", "advanced"][index % 3],
    usefulnessBand: ["high", "medium", "low"][index % 3],
    topics: [["language"], ["travel"], ["food"]][index % 3],
    root: `r${index % 9}`,
    register: ["standard", "classical", "colloquial"][index % 3],
    partOfSpeech: ["noun", "verb", "adjective"][index % 3],
  }));
  for (const settings of [{ level: 1, interests: [] }, { level: 2, interests: ["travel"] }, { level: 4, interests: ["food", "language"] }]) {
    let simulated = profile(settings);
    for (let ordinal = 0; ordinal < 366; ordinal += 1) {
      const day = new Date(Date.UTC(2024, 0, ordinal + 1)).toISOString().slice(0, 10);
      const result = await selected(vocabulary, simulated, day);
      assert.equal(result.kind, "assigned", `${JSON.stringify(settings)} ${day}`);
      simulated = {
        ...simulated,
        assignments: { ...simulated.assignments, [day]: { wordId: result.wordId } },
        recentIds: [result.wordId, ...simulated.recentIds].slice(0, 16),
      };
    }
  }
});
