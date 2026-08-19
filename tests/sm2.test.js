"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../app-core.js");
const ExtensionState = require("../extension/shared/state.js");

test("website and extension use the same review policy", () => {
    const item = { wordId: 7, repetition: 2, interval: 6, ef: 2.5, lapses: 0, reviewCount: 2, history: [] };
    assert.deepEqual(
        { ...Core.calculateSM2(item, "easy", "2026-08-19") },
        { ...ExtensionState.calculateSM2(item, "easy", "2026-08-19") }
    );
    assert.deepEqual(Core.getReviewOptions(item, "2026-08-19"), ExtensionState.getReviewOptions(item, "2026-08-19"));
});

test("SM-2 Engine — mapRatingToGrade rating normalization", async (t) => {
    await t.test("maps 4-point rating strings correctly", () => {
        assert.equal(Core.mapRatingToGrade("again"), 1);
        assert.equal(Core.mapRatingToGrade("Again"), 1);
        assert.equal(Core.mapRatingToGrade("AGAIN"), 1);
        assert.equal(Core.mapRatingToGrade("  again  "), 1);

        assert.equal(Core.mapRatingToGrade("hard"), 3);
        assert.equal(Core.mapRatingToGrade("Hard"), 3);

        assert.equal(Core.mapRatingToGrade("good"), 4);
        assert.equal(Core.mapRatingToGrade("Good"), 4);

        assert.equal(Core.mapRatingToGrade("easy"), 5);
        assert.equal(Core.mapRatingToGrade("Easy"), 5);
    });

    await t.test("maps Arabic rating strings correctly", () => {
        assert.equal(Core.mapRatingToGrade("أعد"), 1);
        assert.equal(Core.mapRatingToGrade("اعد"), 1);
        assert.equal(Core.mapRatingToGrade("مجدداً"), 1);
        assert.equal(Core.mapRatingToGrade("مجددا"), 1);
        assert.equal(Core.mapRatingToGrade("صعب"), 3);
        assert.equal(Core.mapRatingToGrade("جيد"), 4);
        assert.equal(Core.mapRatingToGrade("سهل"), 5);
    });

    await t.test("maps numeric grades 0 to 5 directly", () => {
        assert.equal(Core.mapRatingToGrade(0), 0);
        assert.equal(Core.mapRatingToGrade(1), 1);
        assert.equal(Core.mapRatingToGrade(2), 2);
        assert.equal(Core.mapRatingToGrade(3), 3);
        assert.equal(Core.mapRatingToGrade(4), 4);
        assert.equal(Core.mapRatingToGrade(5), 5);
    });

    await t.test("maps numeric string digits 0 to 5", () => {
        assert.equal(Core.mapRatingToGrade("0"), 0);
        assert.equal(Core.mapRatingToGrade("1"), 1);
        assert.equal(Core.mapRatingToGrade("2"), 2);
        assert.equal(Core.mapRatingToGrade("3"), 3);
        assert.equal(Core.mapRatingToGrade("4"), 4);
        assert.equal(Core.mapRatingToGrade("5"), 5);
    });

    await t.test("clamps out-of-range numeric grades and handles edge cases", () => {
        assert.equal(Core.mapRatingToGrade(-5), 0);
        assert.equal(Core.mapRatingToGrade(10), 5);
        assert.equal(Core.mapRatingToGrade(3.7), 4);
        assert.equal(Core.mapRatingToGrade(null), 4);
        assert.equal(Core.mapRatingToGrade(undefined), 4);
        assert.equal(Core.mapRatingToGrade("unknown_rating"), 4);
    });
});

test("SM-2 Engine — Date Key Math & Overdue Difference", async (t) => {
    await t.test("addDaysToDateKey calculates correct dates across leap years and month boundaries", () => {
        assert.equal(Core.addDaysToDateKey("2026-08-16", 1), "2026-08-17");
        assert.equal(Core.addDaysToDateKey("2026-08-16", 6), "2026-08-22");
        assert.equal(Core.addDaysToDateKey("2026-08-31", 1), "2026-09-01");
        assert.equal(Core.addDaysToDateKey("2026-12-31", 1), "2027-01-01");

        // Leap year transition (2024 is leap year)
        assert.equal(Core.addDaysToDateKey("2024-02-28", 1), "2024-02-29");
        assert.equal(Core.addDaysToDateKey("2024-02-29", 1), "2024-03-01");

        // Non-leap year transition (2025 is non-leap year)
        assert.equal(Core.addDaysToDateKey("2025-02-28", 1), "2025-03-01");

        // Large intervals
        assert.equal(Core.addDaysToDateKey("2026-01-01", 100), "2026-04-11");
    });

    await t.test("getDaysDifference calculates accurate day offsets", () => {
        assert.equal(Core.getDaysDifference("2026-08-10", "2026-08-16"), 6);
        assert.equal(Core.getDaysDifference("2026-08-16", "2026-08-10"), -6);
        assert.equal(Core.getDaysDifference("2026-08-16", "2026-08-16"), 0);
        assert.equal(Core.getDaysDifference("2025-12-31", "2026-01-01"), 1);
        assert.equal(Core.getDaysDifference("invalid", "2026-08-16"), 0);
    });
});

test("SM-2 Engine — Standard Interval Progression (Good Rating)", async (t) => {
    const today = "2026-08-16";
    let item = Core.createDefaultSrsItem(1, today);

    // Initial state
    assert.equal(item.repetition, 0);
    assert.equal(item.interval, 0);
    assert.equal(item.ef, 2.5);
    assert.equal(item.lapses, 0);
    assert.equal(item.reviewCount, 0);

    // Review 1: Good (q=4) -> n=1, I=1, EF=2.5
    item = Core.calculateSM2(item, "good", "2026-08-16");
    assert.equal(item.repetition, 1);
    assert.equal(item.interval, 1);
    assert.equal(item.ef, 2.5);
    assert.equal(item.nextReviewDate, "2026-08-17");
    assert.equal(item.reviewCount, 1);
    assert.equal(item.lapses, 0);

    // Review 2: Good (q=4) -> n=2, I=6, EF=2.5
    item = Core.calculateSM2(item, "good", "2026-08-17");
    assert.equal(item.repetition, 2);
    assert.equal(item.interval, 6);
    assert.equal(item.ef, 2.5);
    assert.equal(item.nextReviewDate, "2026-08-23");
    assert.equal(item.reviewCount, 2);

    // Review 3: Good (q=4) -> n=3, I=round(6 * 2.5) = 15, EF=2.5
    item = Core.calculateSM2(item, "good", "2026-08-23");
    assert.equal(item.repetition, 3);
    assert.equal(item.interval, 15);
    assert.equal(item.ef, 2.5);
    assert.equal(item.nextReviewDate, "2026-09-07");
    assert.equal(item.reviewCount, 3);

    // Review 4: Good (q=4) -> n=4, I=round(15 * 2.5) = 38, EF=2.5
    item = Core.calculateSM2(item, "good", "2026-09-07");
    assert.equal(item.repetition, 4);
    assert.equal(item.interval, 38);
    assert.equal(item.ef, 2.5);
    assert.equal(item.nextReviewDate, "2026-10-15");
    assert.equal(item.reviewCount, 4);

    // Review 5: Good (q=4) -> n=5, I=round(38 * 2.5) = 95, EF=2.5
    item = Core.calculateSM2(item, "good", "2026-10-15");
    assert.equal(item.repetition, 5);
    assert.equal(item.interval, 95);
    assert.equal(item.ef, 2.5);
    assert.equal(item.nextReviewDate, "2027-01-18");
    assert.equal(item.reviewCount, 5);
});

test("SM-2 Engine — Easiness Factor (EF) Delta Mathematical Exactness", async (t) => {
    // q=5: Delta EF = +0.10
    const r5 = Core.calculateSM2({ repetition: 2, interval: 6, ef: 2.5 }, 5, "2026-08-16");
    assert.equal(r5.ef, 2.6);

    // q=4: Delta EF = 0.00
    const r4 = Core.calculateSM2({ repetition: 2, interval: 6, ef: 2.5 }, 4, "2026-08-16");
    assert.equal(r4.ef, 2.5);

    // q=3: Delta EF = -0.14
    const r3 = Core.calculateSM2({ repetition: 2, interval: 6, ef: 2.5 }, 3, "2026-08-16");
    assert.equal(r3.ef, 2.36);

    // q=2: Delta EF = -0.32
    const r2 = Core.calculateSM2({ repetition: 2, interval: 6, ef: 2.5 }, 2, "2026-08-16");
    assert.equal(r2.ef, 2.18);

    // q=1: Delta EF = -0.54
    const r1 = Core.calculateSM2({ repetition: 2, interval: 6, ef: 2.5 }, 1, "2026-08-16");
    assert.equal(r1.ef, 1.96);

    // q=0: Delta EF = -0.80
    const r0 = Core.calculateSM2({ repetition: 2, interval: 6, ef: 2.5 }, 0, "2026-08-16");
    assert.equal(r0.ef, 1.70);
});

test("SM-2 Engine — Minimum Easiness Factor Clamp (EF >= 1.3)", async (t) => {
    let item = { repetition: 2, interval: 6, ef: 1.5, lapses: 0, reviewCount: 2, history: [] };

    // Grade 1: EF would be 1.5 - 0.54 = 0.96 -> clamped to 1.30
    item = Core.calculateSM2(item, 1, "2026-08-16");
    assert.equal(item.ef, 1.3);
    assert.equal(item.repetition, 0);
    assert.equal(item.interval, 1);
    assert.equal(item.lapses, 1);

    // Grade 0: EF would be 1.3 - 0.80 = 0.50 -> clamped to 1.30
    item = Core.calculateSM2(item, 0, "2026-08-17");
    assert.equal(item.ef, 1.3);
    assert.equal(item.repetition, 0);
    assert.equal(item.interval, 1);
    assert.equal(item.lapses, 2);

    // Subsequent good review from EF=1.3: EF unchanged at 1.3
    item = Core.calculateSM2(item, 4, "2026-08-18");
    assert.equal(item.ef, 1.3);
    assert.equal(item.repetition, 1);
    assert.equal(item.interval, 1);

    // Subsequent easy review from EF=1.3: EF increases to 1.4
    item = Core.calculateSM2(item, 5, "2026-08-19");
    assert.equal(item.ef, 1.4);
    assert.equal(item.repetition, 2);
    assert.equal(item.interval, 6);
});

test("SM-2 Engine — Standard interval progression for Easy and Hard", async (t) => {
    // Easy rating at repetition 2:
    // EF becomes 2.5 + 0.10 = 2.6
    // Standard interval = round(6 * 2.6) = 16
    const easyRes = Core.calculateSM2({ repetition: 2, interval: 6, ef: 2.5 }, "easy", "2026-08-16");
    assert.equal(easyRes.ef, 2.6);
    assert.equal(easyRes.interval, 16);
    assert.equal(easyRes.nextReviewDate, "2026-09-01");

    // Hard rating at repetition 2:
    // EF becomes 2.5 - 0.14 = 2.36
    // Standard interval = round(6 * 2.36) = 14
    const hardRes = Core.calculateSM2({ repetition: 2, interval: 6, ef: 2.5 }, "hard", "2026-08-16");
    assert.equal(hardRes.ef, 2.36);
    assert.equal(hardRes.interval, 14);
    assert.equal(hardRes.nextReviewDate, "2026-08-30");
});

test("SM-2 review options expose exact next dates and Arabic interval labels", () => {
    const today = "2026-08-17";
    const firstReview = Core.createDefaultSrsItem(1, today);
    const options = Core.getReviewOptions(firstReview, today);

    assert.equal(options.again.interval, Core.calculateSM2(firstReview, "again", today).interval);
    assert.equal(options.again.nextReviewDate, "2026-08-18");
    assert.equal(options.easy.label, "غدًا");

    const later = Core.getReviewOptions({ repetition: 1, interval: 1, ef: 2.5 }, today);
    assert.equal(later.good.interval, 6);
    assert.equal(later.good.nextReviewDate, "2026-08-23");
    assert.equal(later.good.label, "بعد 6 أيام");

    const twoDays = Core.getReviewOptions({ repetition: 2, interval: 1, ef: 1.7 }, today).good;
    assert.equal(twoDays.interval, 2);
    assert.equal(twoDays.nextReviewDate, "2026-08-19");
    assert.equal(twoDays.label, "بعد يومين");

    const threeDays = Core.getReviewOptions({ repetition: 2, interval: 1, ef: 3 }, today).good;
    assert.equal(threeDays.interval, 3);
    assert.equal(threeDays.nextReviewDate, "2026-08-20");
    assert.equal(threeDays.label, "بعد 3 أيام");

    const twelveDays = Core.getReviewOptions({ repetition: 2, interval: 2, ef: 6 }, today).good;
    assert.equal(twelveDays.interval, 12);
    assert.equal(twelveDays.nextReviewDate, "2026-08-29");
    assert.equal(twelveDays.label, "بعد 12 يومًا");
});

test("SM-2 Engine — Lapse Handling and Recovery Cycle", async (t) => {
    let item = {
        wordId: 42,
        repetition: 4,
        interval: 38,
        ef: 2.5,
        nextReviewDate: "2026-08-16",
        lastReviewedDate: "2026-07-09",
        reviewCount: 4,
        lapses: 0,
        history: []
    };

    // User forgets card ("again" / Grade 1)
    item = Core.calculateSM2(item, "again", "2026-08-16");
    assert.equal(item.repetition, 0, "Repetition must reset to 0 on lapse");
    assert.equal(item.interval, 1, "Interval must reset to 1 day on lapse");
    assert.equal(item.ef, 1.96, "EF drops by 0.54");
    assert.equal(item.lapses, 1, "Lapses count increments to 1");
    assert.equal(item.nextReviewDate, "2026-08-17");
    assert.equal(item.reviewCount, 5);

    // Relearning Step 1 (Good): n=1, I=1
    item = Core.calculateSM2(item, "good", "2026-08-17");
    assert.equal(item.repetition, 1);
    assert.equal(item.interval, 1);
    assert.equal(item.ef, 1.96);
    assert.equal(item.lapses, 1);
    assert.equal(item.nextReviewDate, "2026-08-18");

    // Relearning Step 2 (Good): n=2, I=6
    item = Core.calculateSM2(item, "good", "2026-08-18");
    assert.equal(item.repetition, 2);
    assert.equal(item.interval, 6);
    assert.equal(item.ef, 1.96);
    assert.equal(item.nextReviewDate, "2026-08-24");

    // Relearning Step 3 (Good): n=3, I=round(6 * 1.96) = 12
    item = Core.calculateSM2(item, "good", "2026-08-24");
    assert.equal(item.repetition, 3);
    assert.equal(item.interval, 12);
    assert.equal(item.ef, 1.96);
    assert.equal(item.nextReviewDate, "2026-09-05");
});

test("SM-2 Engine — History Log Bounding (Max 50 entries)", async (t) => {
    let item = Core.createDefaultSrsItem(1, "2026-01-01");

    for (let i = 1; i <= 65; i++) {
        item = Core.calculateSM2(item, "good", `2026-01-01`);
    }

    assert.equal(item.reviewCount, 65);
    assert.equal(item.history.length, 50, "History log must be bounded to the 50 most recent entries");
    assert.equal(item.history[49].grade, 4);
});

test("SM-2 Engine — Due Words Queue (getDueReviewWords)", async (t) => {
    const mockWords = [
        { id: 1, word: "كلمة 1" },
        { id: 2, word: "كلمة 2" },
        { id: 3, word: "كلمة 3" },
        { id: 4, word: "كلمة 4" },
        { id: 5, word: "كلمة 5" }
    ];

    const state = {
        version: 2,
        srs: {
            1: { wordId: 1, repetition: 2, interval: 6, ef: 2.5, nextReviewDate: "2026-08-10" }, // 6 days overdue
            2: { wordId: 2, repetition: 1, interval: 1, ef: 2.5, nextReviewDate: "2026-08-14" }, // 2 days overdue
            3: { wordId: 3, repetition: 3, interval: 15, ef: 2.5, nextReviewDate: "2026-08-16" }, // Due today (0 days overdue)
            4: { wordId: 4, repetition: 4, interval: 38, ef: 2.5, nextReviewDate: "2026-08-20" }, // Future (not due)
            5: { wordId: 5, repetition: 0, interval: 1, ef: 2.1, nextReviewDate: "2026-08-14" }  // 2 days overdue, lower EF
        }
    };

    const dueList = Core.getDueReviewWords(state, mockWords, "2026-08-16");
    assert.equal(dueList.length, 4, "Must return exactly the 4 due items");

    // Urgency sort order check:
    // 1st: Word 1 (6 days overdue)
    assert.equal(dueList[0].word.id, 1);
    assert.equal(dueList[0].daysOverdue, 6);
    assert.equal(dueList[0].isOverdue, true);

    // 2nd and 3rd: Word 5 and Word 2 (2 days overdue)
    // Word 5 has lower EF (2.1 vs 2.5), so it comes before Word 2
    assert.equal(dueList[1].word.id, 5);
    assert.equal(dueList[1].daysOverdue, 2);
    assert.equal(dueList[2].word.id, 2);
    assert.equal(dueList[2].daysOverdue, 2);

    // 4th: Word 3 (0 days overdue / due today)
    assert.equal(dueList[3].word.id, 3);
    assert.equal(dueList[3].daysOverdue, 0);
    assert.equal(dueList[3].isOverdue, false);

    // Test limit parameter
    const limited = Core.getDueReviewWords(state, mockWords, "2026-08-16", 2);
    assert.equal(limited.length, 2);
    assert.equal(limited[0].word.id, 1);
    assert.equal(limited[1].word.id, 5);
});

test("SM-2 public API accepts spec field names and returns due IDs", () => {
    const next = Core.calculateNextReview({ repetitions: 1, interval: 1, easeFactor: 2.5 }, 4, "2026-08-16");
    assert.equal(next.repetitions, 2);
    assert.equal(next.easeFactor, 2.5);
    assert.equal(next.lastReviewed, "2026-08-16");

    const dueIds = Core.getDueReviewWords({
        7: { wordId: 7, repetitions: 1, interval: 1, easeFactor: 2.5, nextReviewDate: "2026-08-15" },
        8: { wordId: 8, repetitions: 1, interval: 1, easeFactor: 2.5, nextReviewDate: "2026-08-20" },
    }, "2026-08-16");
    assert.deepEqual(dueIds, [7]);
});

test("SM-2 Engine — Review Recording (recordReview)", async (t) => {
    const initialState = {
        version: 2,
        history: { 10: { firstSeen: "2026-08-15" } },
        srs: {
            10: { wordId: 10, repetition: 1, interval: 1, ef: 2.5, nextReviewDate: "2026-08-16", reviewCount: 1, lapses: 0, history: [] }
        },
        favorites: {},
        preferences: { showEnglish: true }
    };

    const { updatedState, srsItem, reviewResult } = Core.recordReview(initialState, 10, "good", "2026-08-16");

    assert.equal(srsItem.repetition, 2);
    assert.equal(srsItem.interval, 6);
    assert.equal(srsItem.nextReviewDate, "2026-08-22");
    assert.equal(srsItem.lastReviewedDate, "2026-08-16");
    assert.equal(srsItem.reviewCount, 2);

    assert.equal(updatedState.srs[10].repetition, 2);
    assert.equal(updatedState.srs[10].interval, 6);
    assert.ok(updatedState.history[10]);

    // Immutability: original state must not be mutated
    assert.equal(initialState.srs[10].repetition, 1);
    assert.equal(initialState.srs[10].interval, 1);
});

test("SM-2 Engine — Review Statistics (getReviewStats)", async (t) => {
    const state = {
        version: 2,
        srs: {
            1: {
                wordId: 1, repetition: 4, interval: 25, ef: 2.6, nextReviewDate: "2026-08-20", lastReviewedDate: "2026-08-16", reviewCount: 4,
                history: [{ grade: 4 }, { grade: 4 }, { grade: 5 }, { grade: 5 }]
            },
            2: {
                wordId: 2, repetition: 2, interval: 6, ef: 2.5, nextReviewDate: "2026-08-16", lastReviewedDate: "2026-08-10", reviewCount: 2,
                history: [{ grade: 4 }, { grade: 4 }]
            },
            3: {
                wordId: 3, repetition: 0, interval: 1, ef: 1.96, nextReviewDate: "2026-08-16", lastReviewedDate: "2026-08-16", reviewCount: 3,
                history: [{ grade: 4 }, { grade: 4 }, { grade: 1 }]
            }
        }
    };

    const stats = Core.getReviewStats(state, "2026-08-16");
    assert.equal(stats.totalCards, 3);
    assert.equal(stats.totalLearned, 3);
    assert.equal(stats.dueToday, 2, "Word 2 and Word 3 are due today");
    assert.equal(stats.reviewedToday, 2, "Word 1 and Word 3 were reviewed today");
    assert.equal(stats.masteredCount, 1, "Word 1 is mastered (rep >= 4 and interval >= 21)");
    assert.equal(stats.learningCount, 2, "Word 2 and Word 3 are in learning");
    assert.equal(stats.reviewCount, 9, "Total review count is 4 + 2 + 3 = 9");

    // Total history logs = 4 + 2 + 3 = 9. Successful (grade >= 3) = 8.
    // Retention rate = 8 / 9 = 88.9%
    assert.equal(stats.retentionRate, 88.9);
});

test("SM-2 Engine — Review Statistics ignore SRS IDs outside the supplied vocabulary", () => {
    const state = {
        version: 2,
        schemaVersion: 2,
        history: {
            1: { firstSeen: "2026-08-16" },
            999: { firstSeen: "2026-08-16" }
        },
        favorites: {},
        preferences: { showEnglish: true, speechRate: 0.85, speechRepeat: 1, dailyReviewLimit: 20 },
        srs: {
            1: {
                wordId: 1,
                repetition: 1,
                interval: 1,
                ef: 2.5,
                nextReviewDate: "2026-08-16",
                lastReviewedDate: "2026-08-16",
                reviewCount: 2,
                lapses: 0,
                history: [
                    { date: "2026-08-16", grade: 4, rating: "good", interval: 1, ef: 2.5 },
                    { date: "2026-08-15", grade: 4, rating: "good", interval: 1, ef: 2.5 }
                ]
            },
            999: {
                wordId: 999,
                repetition: 5,
                interval: 30,
                ef: 2.5,
                nextReviewDate: "2026-08-16",
                lastReviewedDate: "2026-08-16",
                reviewCount: 99,
                lapses: 0,
                history: [
                    { date: "2026-08-16", grade: 1, rating: "again", interval: 1, ef: 2.5 }
                ]
            }
        }
    };

    const stats = Core.getReviewStats(state, "2026-08-16", [{ id: 1 }]);
    assert.equal(stats.totalCards, 1);
    assert.equal(stats.dueToday, 1);
    assert.equal(stats.reviewedToday, 1);
    assert.equal(stats.reviewCount, 2);
    assert.equal(stats.retentionRate, 100);
});

test("SM-2 Engine — scheduleDailyWordSrs Auto-Enrollment", async (t) => {
    const state = Core.createDefaultState();
    const enrolled = Core.scheduleDailyWordSrs(state, 5, "2026-08-16");

    assert.equal(enrolled.version, 2);
    assert.ok(enrolled.history[5]);
    assert.equal(enrolled.history[5].firstSeen, "2026-08-16");
    assert.ok(enrolled.srs[5]);
    assert.equal(enrolled.srs[5].wordId, 5);
    assert.equal(enrolled.srs[5].repetition, 0);
    assert.equal(enrolled.srs[5].interval, 0);
    assert.equal(enrolled.srs[5].nextReviewDate, "2026-08-16");
});
