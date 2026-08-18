"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../app-core.js");

test("Schema Migration — Null, Undefined & Empty States", async (t) => {
    await t.test("null or undefined rawState returns fresh Schema v2 defaults", () => {
        const migratedNull = Core.migrateState(null, "2026-08-16");
        assert.equal(migratedNull.version, 2);
        assert.equal(migratedNull.schemaVersion, 2);
        assert.deepEqual(migratedNull.srs, {});
        assert.deepEqual(migratedNull.history, {});
        assert.deepEqual(migratedNull.favorites, {});
        assert.deepEqual(migratedNull.preferences, {
            showEnglish: true,
            speechRate: 0.85,
            speechRepeat: 1,
            dailyReviewLimit: 20
        });

        const migratedUndefined = Core.migrateState(undefined, "2026-08-16");
        assert.equal(migratedUndefined.version, 2);
        assert.deepEqual(migratedUndefined.srs, {});
    });

    await t.test("empty object returns fresh Schema v2 defaults", () => {
        const migratedEmpty = Core.migrateState({}, "2026-08-16");
        assert.equal(migratedEmpty.version, 2);
        assert.deepEqual(migratedEmpty.srs, {});
        assert.deepEqual(migratedEmpty.history, {});
        assert.deepEqual(migratedEmpty.favorites, {});
    });

    await t.test("stringified JSON or invalid string inputs", () => {
        const jsonStr = JSON.stringify({ schemaVersion: 1, history: { 1: { firstSeen: "2026-08-10" } } });
        const fromJson = Core.migrateState(jsonStr, "2026-08-16");
        assert.equal(fromJson.version, 2);
        assert.ok(fromJson.history[1]);
        assert.ok(fromJson.srs[1]);

        const invalidStr = Core.migrateState("not valid json", "2026-08-16");
        assert.equal(invalidStr.version, 2);
        assert.deepEqual(invalidStr.srs, {});
    });
});

test("Schema Migration — review limit accepts only bounded integers", () => {
    const overLimit = Core.migrateState({ preferences: { dailyReviewLimit: 101 } }, "2026-08-17");
    const fractional = Core.migrateState({ preferences: { dailyReviewLimit: 2.5 } }, "2026-08-17");
    const valid = Core.migrateState({ preferences: { dailyReviewLimit: 15 } }, "2026-08-17");

    assert.equal(overLimit.preferences.dailyReviewLimit, 20);
    assert.equal(fractional.preferences.dailyReviewLimit, 20);
    assert.equal(valid.preferences.dailyReviewLimit, 15);
});

test("Schema inspection — current v2 payloads require the complete contract", () => {
    const valid = {
        version: 2,
        schemaVersion: 2,
        history: { 1: { firstSeen: "2026-08-17" } },
        favorites: { 1: false },
        srs: {
            1: {
                wordId: 1,
                repetition: 0,
                interval: 0,
                ef: 2.5,
                nextReviewDate: "2026-08-17",
                lastReviewedDate: null,
                reviewCount: 0,
                lapses: 0,
                history: []
            }
        },
        preferences: {
            showEnglish: true,
            speechRate: 0.85,
            speechRepeat: 1,
            dailyReviewLimit: 20
        }
    };

    const accepted = Core.inspectStoredState(valid, new Set([1]), "2026-08-18");
    assert.equal(accepted.canPersist, true);

    for (const [label, mutate] of [
        ["history map", state => { state.history = "bad"; }],
        ["SRS record", state => { state.srs = { 1: "bad" }; }],
        ["speech rate", state => { state.preferences.speechRate = 99; }]
    ]) {
        const malformed = JSON.parse(JSON.stringify(valid));
        mutate(malformed);
        const inspected = Core.inspectStoredState(malformed, new Set([1]), "2026-08-18");
        assert.equal(inspected.canPersist, false, `${label} must block persistence`);
        assert.deepEqual(inspected.state, Core.createDefaultState(), `${label} must leave defaults untouched`);
    }
});

test("Schema Migration — imported SRS values stay finite and bounded", () => {
    const rawJson = JSON.stringify({
        schemaVersion: 2,
        history: { 1: { firstSeen: "2026-08-10" } },
        srs: {
            1: {
                wordId: 1,
                repetition: 2,
                interval: "__SRS_INTERVAL__",
                ef: "__SRS_EF__",
                nextReviewDate: "2026-08-17",
                lastReviewedDate: "2026-08-16",
                reviewCount: 2,
                lapses: 0,
                history: [{ date: "2026-08-16", grade: 4, rating: "good", interval: "__SRS_INTERVAL__", ef: "__SRS_EF__" }]
            }
        }
    }).replace(/"__SRS_INTERVAL__"/g, "1e400").replace(/"__SRS_EF__"/g, "1e400");

    const migrated = Core.migrateState(rawJson, "2026-08-18");
    const current = migrated.srs[1];
    assert.equal(current.interval, 0);
    assert.equal(current.ef, 2.5);
    assert.equal(current.history[0].interval, 0);
    assert.equal(current.history[0].ef, 2.5);

    const assertFiniteReview = (review) => {
        assert.ok(Number.isFinite(review.interval));
        assert.match(review.nextReviewDate, /^\d{4}-\d{2}-\d{2}$/);
    };
    for (const review of Object.values(Core.getReviewOptions(current, "2026-08-18"))) {
        assertFiniteReview(review);
    }

    const recorded = Core.recordReview(migrated, 1, "good", "2026-08-18");
    assertFiniteReview(recorded.reviewResult);
    assert.ok(Number.isFinite(recorded.srsItem.ef));
    const stats = Core.getReviewStats(recorded.updatedState, "2026-08-18");
    assert.ok(Number.isFinite(stats.averageEF));
    assert.ok(Number.isFinite(stats.retentionRate));
});

test("Schema Migration — SRS bounds preserve valid values and reset overages", () => {
    const migrated = Core.migrateState({
        srs: {
            1: { wordId: 1, interval: 100000, ef: 10, history: [{ grade: 4, interval: 100000, ef: 10 }] },
            2: { wordId: 2, interval: 100000.0001, ef: 10.0001, history: [{ grade: 4, interval: 100000.0001, ef: 10.0001 }] }
        }
    }, "2026-08-18");

    assert.equal(migrated.srs[1].interval, 100000);
    assert.equal(migrated.srs[1].ef, 10);
    assert.equal(migrated.srs[1].history[0].interval, 100000);
    assert.equal(migrated.srs[1].history[0].ef, 10);
    assert.equal(migrated.srs[2].interval, 0);
    assert.equal(migrated.srs[2].ef, 2.5);
    assert.equal(migrated.srs[2].history[0].interval, 0);
    assert.equal(migrated.srs[2].history[0].ef, 2.5);
});

test("Schema Migration — Legacy v0 (learnedWords Array)", async (t) => {
    await t.test("migrates learnedWords array with objects [{ id: 1 }, { id: 2 }]", () => {
        const v0State = {
            learnedWords: [
                { id: 1 },
                { id: 2 },
                { id: 3 }
            ]
        };

        const migrated = Core.migrateState(v0State, "2026-08-16");
        assert.equal(migrated.version, 2);
        assert.equal(Object.keys(migrated.history).length, 3);
        assert.equal(Object.keys(migrated.srs).length, 3);

        for (const id of [1, 2, 3]) {
            assert.deepEqual(migrated.history[id], { firstSeen: "2026-08-16" });
            assert.equal(migrated.srs[id].wordId, id);
            assert.equal(migrated.srs[id].repetition, 0);
            assert.equal(migrated.srs[id].interval, 0);
            assert.equal(migrated.srs[id].ef, 2.5);
            assert.equal(migrated.srs[id].nextReviewDate, "2026-08-16");
            assert.equal(migrated.srs[id].reviewCount, 0);
            assert.equal(migrated.srs[id].lapses, 0);
        }
    });

    await t.test("migrates learnedWords array with primitive numbers [1, 2, 3]", () => {
        const v0Numbers = {
            learnedWords: [10, 20]
        };

        const migrated = Core.migrateState(v0Numbers, "2026-08-16");
        assert.equal(migrated.version, 2);
        assert.ok(migrated.history[10]);
        assert.ok(migrated.srs[10]);
        assert.ok(migrated.history[20]);
        assert.ok(migrated.srs[20]);
    });
});

test("Schema Migration — Schema v1 (history, favorites, preferences)", async (t) => {
    await t.test("migrates Schema v1 preserving history firstSeen and favorites", () => {
        const v1State = {
            schemaVersion: 1,
            history: {
                1: { firstSeen: "2026-08-01" },
                2: { firstSeen: "2026-08-05" },
                3: { firstSeen: "2026-08-10" }
            },
            favorites: {
                1: true,
                3: true
            },
            preferences: {
                showEnglish: false,
                speechRate: 1.2,
                speechRepeat: 3
            },
            streak: 5
        };

        const migrated = Core.migrateState(v1State, "2026-08-16");
        assert.equal(migrated.version, 2);
        assert.equal(migrated.schemaVersion, 2);

        // History preserved
        assert.equal(migrated.history[1].firstSeen, "2026-08-01");
        assert.equal(migrated.history[2].firstSeen, "2026-08-05");
        assert.equal(migrated.history[3].firstSeen, "2026-08-10");

        // Favorites preserved
        assert.equal(migrated.favorites[1], true);
        assert.equal(migrated.favorites[2], undefined);
        assert.equal(migrated.favorites[3], true);

        // Preferences preserved
        assert.equal(migrated.preferences.showEnglish, false);
        assert.equal(migrated.preferences.speechRate, 1.2);
        assert.equal(migrated.preferences.speechRepeat, 3);
        assert.equal(migrated.preferences.dailyReviewLimit, 20);

        // Streak preserved
        assert.equal(migrated.streak, 5);

        // SRS records created and initialized with original firstSeen as nextReviewDate
        assert.equal(migrated.srs[1].wordId, 1);
        assert.equal(migrated.srs[1].repetition, 0);
        assert.equal(migrated.srs[1].interval, 0);
        assert.equal(migrated.srs[1].ef, 2.5);
        assert.equal(migrated.srs[1].nextReviewDate, "2026-08-01");

        assert.equal(migrated.srs[2].nextReviewDate, "2026-08-05");
        assert.equal(migrated.srs[3].nextReviewDate, "2026-08-10");
    });

    await t.test("migrates Schema v1 with array-formatted favorites", () => {
        const v1ArrayFavs = {
            schemaVersion: 1,
            history: { 1: { firstSeen: "2026-08-01" } },
            favorites: [1, 5, 8]
        };

        const migrated = Core.migrateState(v1ArrayFavs, "2026-08-16");
        assert.equal(migrated.favorites[1], true);
        assert.equal(migrated.favorites[5], true);
        assert.equal(migrated.favorites[8], true);
    });
});

test("Schema Migration — Schema v2 & Self-Healing", async (t) => {
    await t.test("preserves existing valid Schema v2 state", () => {
        const v2State = {
            version: 2,
            schemaVersion: 2,
            history: {
                1: { firstSeen: "2026-08-01" }
            },
            srs: {
                1: {
                    wordId: 1,
                    repetition: 3,
                    interval: 15,
                    ef: 2.6,
                    nextReviewDate: "2026-08-25",
                    lastReviewedDate: "2026-08-10",
                    reviewCount: 3,
                    lapses: 0,
                    history: [
                        { date: "2026-08-01", grade: 4, interval: 1, ef: 2.5 },
                        { date: "2026-08-02", grade: 4, interval: 6, ef: 2.5 },
                        { date: "2026-08-10", grade: 5, interval: 15, ef: 2.6 }
                    ]
                }
            },
            favorites: { 1: true },
            preferences: { showEnglish: true, speechRate: 0.85, speechRepeat: 1, dailyReviewLimit: 25 }
        };

        const migrated = Core.migrateState(v2State, "2026-08-16");
        assert.equal(migrated.version, 2);
        assert.equal(migrated.srs[1].repetition, 3);
        assert.equal(migrated.srs[1].interval, 15);
        assert.equal(migrated.srs[1].ef, 2.6);
        assert.equal(migrated.srs[1].nextReviewDate, "2026-08-25");
        assert.equal(migrated.srs[1].history.length, 3);
        assert.equal(migrated.preferences.dailyReviewLimit, 25);
    });

    await t.test("self-heals missing history when word exists in srs", () => {
        const partialV2 = {
            version: 2,
            history: {}, // Missing word 7
            srs: {
                7: {
                    wordId: 7,
                    repetition: 2,
                    interval: 6,
                    ef: 2.5,
                    nextReviewDate: "2026-08-20",
                    lastReviewedDate: "2026-08-14",
                    reviewCount: 2,
                    lapses: 0
                }
            }
        };

        const migrated = Core.migrateState(partialV2, "2026-08-16");
        assert.ok(migrated.history[7], "Missing history must be self-healed");
        assert.equal(migrated.history[7].firstSeen, "2026-08-14");
    });

    await t.test("self-heals missing srs when word exists in history", () => {
        const partialV2 = {
            version: 2,
            history: {
                9: { firstSeen: "2026-08-12" }
            },
            srs: {} // Missing word 9
        };

        const migrated = Core.migrateState(partialV2, "2026-08-16");
        assert.ok(migrated.srs[9], "Missing SRS record must be auto-created");
        assert.equal(migrated.srs[9].wordId, 9);
        assert.equal(migrated.srs[9].nextReviewDate, "2026-08-12");
    });

    await t.test("self-heals corrupted fields (negative repetition, EF below 1.3, invalid dates)", () => {
        const corrupted = {
            version: 2,
            history: {
                4: { firstSeen: "not-a-date" }
            },
            srs: {
                4: {
                    wordId: 4,
                    repetition: -3,
                    interval: -10,
                    ef: 0.5, // Below 1.3
                    nextReviewDate: "invalid-date",
                    lastReviewedDate: "corrupted-date",
                    reviewCount: -1,
                    lapses: -2,
                    history: "not an array"
                }
            },
            preferences: {
                showEnglish: "yes", // Not a boolean
                speechRate: 99.0,   // Out of bounds
                speechRepeat: 10,   // Invalid option
                dailyReviewLimit: -5
            }
        };

        const healed = Core.migrateState(corrupted, "2026-08-16");
        assert.equal(healed.srs[4].repetition, 0);
        assert.equal(healed.srs[4].interval, 0);
        assert.equal(healed.srs[4].ef, 2.5, "EF below 1.3 must reset to the default");
        assert.equal(healed.srs[4].nextReviewDate, "2026-08-16");
        assert.equal(healed.srs[4].lastReviewedDate, null);
        assert.equal(healed.srs[4].reviewCount, 0);
        assert.equal(healed.srs[4].lapses, 0);
        assert.deepEqual(healed.srs[4].history, []);

        assert.equal(healed.preferences.showEnglish, true);
        assert.equal(healed.preferences.speechRate, 0.85);
        assert.equal(healed.preferences.speechRepeat, 1);
        assert.equal(healed.preferences.dailyReviewLimit, 20);
    });

    await t.test("filters words outside validIds set when validIds is provided", () => {
        const validIds = new Set([1, 2, 3]);
        const stateWithExtra = {
            schemaVersion: 1,
            history: {
                1: { firstSeen: "2026-08-01" },
                999: { firstSeen: "2026-08-01" }
            },
            favorites: {
                1: true,
                999: true
            }
        };

        const migrated = Core.migrateState(stateWithExtra, "2026-08-16", validIds);
        assert.ok(migrated.history[1]);
        assert.ok(migrated.srs[1]);
        assert.equal(migrated.favorites[1], true);

        assert.equal(migrated.history[999], undefined);
        assert.equal(migrated.srs[999], undefined);
        assert.equal(migrated.favorites[999], undefined);
    });

    await t.test("idempotence: migrating an already migrated state produces identical output", () => {
        const v1 = {
            schemaVersion: 1,
            history: { 1: { firstSeen: "2026-08-01" }, 2: { firstSeen: "2026-08-05" } },
            favorites: { 1: true }
        };

        const once = Core.migrateState(v1, "2026-08-16");
        const twice = Core.migrateState(once, "2026-08-16");
        assert.deepEqual(once, twice);
    });
});
