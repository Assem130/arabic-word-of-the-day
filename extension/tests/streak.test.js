const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isDateKey,
  calculateStreak,
  formatStreakText,
  toArabicDigits,
} = require("../shared/streak.js");

test("isDateKey validates Gregorian calendar date keys correctly", () => {
  assert.equal(isDateKey("2026-08-14"), true);
  assert.equal(isDateKey("2026-01-01"), true);
  assert.equal(isDateKey("2026-12-31"), true);
  assert.equal(isDateKey("2024-02-29"), true, "2024 is a leap year");
  assert.equal(isDateKey("2000-02-29"), true, "2000 is a century leap year");

  assert.equal(isDateKey("2023-02-29"), false, "2023 is not a leap year");
  assert.equal(isDateKey("2026-02-30"), false, "February 30th does not exist");
  assert.equal(isDateKey("2026-04-31"), false, "April has only 30 days");
  assert.equal(isDateKey("2026-06-31"), false, "June has only 30 days");
  assert.equal(isDateKey("2026-13-01"), false, "Month 13 does not exist");
  assert.equal(isDateKey("2026-00-10"), false, "Month 00 does not exist");
  assert.equal(isDateKey("2026-05-00"), false, "Day 00 does not exist");
  assert.equal(isDateKey("2026-05-32"), false, "Day 32 does not exist");

  assert.equal(isDateKey(""), false);
  assert.equal(isDateKey("2026/08/14"), false);
  assert.equal(isDateKey("2026-8-14"), false);
  assert.equal(isDateKey("not-a-date"), false);
  assert.equal(isDateKey(null), false);
  assert.equal(isDateKey(undefined), false);
  assert.equal(isDateKey(12345), false);
  assert.equal(isDateKey({}), false);
});

test("calculateStreak returns zero streak on empty, null, or invalid inputs", () => {
  const expectedZero = { currentStreak: 0, maxStreak: 0, isTodayVisited: false };
  assert.deepEqual(calculateStreak(null, "2026-08-14"), expectedZero);
  assert.deepEqual(calculateStreak(undefined, "2026-08-14"), expectedZero);
  assert.deepEqual(calculateStreak({}, "2026-08-14"), expectedZero);
  assert.deepEqual(calculateStreak([], "2026-08-14"), expectedZero);
  assert.deepEqual(calculateStreak(new Set(), "2026-08-14"), expectedZero);
  assert.deepEqual(calculateStreak(["2026-08-14"], "invalid-today"), expectedZero);
  assert.deepEqual(calculateStreak(["2026-08-14"], null), expectedZero);
  assert.deepEqual(calculateStreak(["2026-08-14"], ""), expectedZero);
});

test("calculateStreak handles single-day visits for today and yesterday", () => {
  const todayOnly = calculateStreak(["2026-08-14"], "2026-08-14");
  assert.deepEqual(todayOnly, { currentStreak: 1, maxStreak: 1, isTodayVisited: true });

  const yesterdayOnly = calculateStreak(["2026-08-13"], "2026-08-14");
  assert.deepEqual(yesterdayOnly, { currentStreak: 1, maxStreak: 1, isTodayVisited: false });

  const twoDaysAgoOnly = calculateStreak(["2026-08-12"], "2026-08-14");
  assert.deepEqual(twoDaysAgoOnly, { currentStreak: 0, maxStreak: 1, isTodayVisited: false });
});

test("calculateStreak handles active multi-day consecutive streaks", () => {
  const twoDays = calculateStreak(["2026-08-13", "2026-08-14"], "2026-08-14");
  assert.deepEqual(twoDays, { currentStreak: 2, maxStreak: 2, isTodayVisited: true });

  const fiveDays = calculateStreak(
    ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"],
    "2026-08-14"
  );
  assert.deepEqual(fiveDays, { currentStreak: 5, maxStreak: 5, isTodayVisited: true });

  const threeDaysActiveGrace = calculateStreak(
    ["2026-08-11", "2026-08-12", "2026-08-13"],
    "2026-08-14"
  );
  assert.deepEqual(threeDaysActiveGrace, { currentStreak: 3, maxStreak: 3, isTodayVisited: false });
});

test("calculateStreak collapses duplicate visits on the same day", () => {
  const duplicates = calculateStreak(
    [
      { dateKey: "2026-08-14" },
      { dateKey: "2026-08-14" },
      { dateKey: "2026-08-13" },
      { dateKey: "2026-08-13" },
      { dateKey: "2026-08-13" },
    ],
    "2026-08-14"
  );
  assert.deepEqual(duplicates, { currentStreak: 2, maxStreak: 2, isTodayVisited: true });
});

test("calculateStreak seamlessly traverses calendar boundaries", () => {
  const monthBoundary = calculateStreak(
    ["2026-01-30", "2026-01-31", "2026-02-01"],
    "2026-02-01"
  );
  assert.deepEqual(monthBoundary, { currentStreak: 3, maxStreak: 3, isTodayVisited: true });

  const leapYearBoundary = calculateStreak(
    ["2024-02-28", "2024-02-29", "2024-03-01"],
    "2024-03-01"
  );
  assert.deepEqual(leapYearBoundary, { currentStreak: 3, maxStreak: 3, isTodayVisited: true });

  const yearBoundary = calculateStreak(
    ["2025-12-30", "2025-12-31", "2026-01-01"],
    "2026-01-01"
  );
  assert.deepEqual(yearBoundary, { currentStreak: 3, maxStreak: 3, isTodayVisited: true });
});

test("calculateStreak calculates broken streaks and historical max streak", () => {
  const brokenStreak = calculateStreak(
    ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"],
    "2026-08-14"
  );
  assert.deepEqual(brokenStreak, { currentStreak: 0, maxStreak: 4, isTodayVisited: false });

  const historicalLongerStreak = calculateStreak(
    [
      "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05",
      "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10",
      "2026-08-13", "2026-08-14",
    ],
    "2026-08-14"
  );
  assert.deepEqual(historicalLongerStreak, { currentStreak: 2, maxStreak: 10, isTodayVisited: true });

  const multipleBrokenPeriods = calculateStreak(
    [
      "2026-02-01", "2026-02-02", "2026-02-03",
      "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14", "2026-03-15", "2026-03-16",
      "2026-05-01", "2026-05-02",
    ],
    "2026-08-14"
  );
  assert.deepEqual(multipleBrokenPeriods, { currentStreak: 0, maxStreak: 7, isTodayVisited: false });
});

test("calculateStreak supports varied data structures and Profile assignments", () => {
  const setInput = new Set(["2026-08-13", "2026-08-14"]);
  assert.deepEqual(calculateStreak(setInput, "2026-08-14"), { currentStreak: 2, maxStreak: 2, isTodayVisited: true });

  const objFirstSeen = {
    1: { firstSeen: "2026-08-13" },
    2: { firstSeen: "2026-08-14" },
  };
  assert.deepEqual(calculateStreak(objFirstSeen, "2026-08-14"), { currentStreak: 2, maxStreak: 2, isTodayVisited: true });

  const objDate = {
    1: { date: "2026-08-13" },
    2: { date: "2026-08-14" },
  };
  assert.deepEqual(calculateStreak(objDate, "2026-08-14"), { currentStreak: 2, maxStreak: 2, isTodayVisited: true });

  const objDirectStrings = {
    1: "2026-08-13",
    2: "2026-08-14",
  };
  assert.deepEqual(calculateStreak(objDirectStrings, "2026-08-14"), { currentStreak: 2, maxStreak: 2, isTodayVisited: true });

  const profileAssignments = {
    assignments: {
      "2026-08-12": { wordId: "w1", status: "known" },
      "2026-08-13": { wordId: "w2", status: "known" },
      "2026-08-14": { wordId: "w3", status: "difficult" },
    },
    wordStates: {
      w1: { status: "known", dateKey: "2026-08-12" },
      w2: { status: "known", dateKey: "2026-08-13" },
      w3: { status: "difficult", dateKey: "2026-08-14" },
    },
  };
  assert.deepEqual(calculateStreak(profileAssignments, "2026-08-14"), { currentStreak: 3, maxStreak: 3, isTodayVisited: true });
});

test("formatStreakText applies Classical Arabic pluralization and agreement rules", () => {
  assert.equal(formatStreakText(0), "لا يوجد تتابع بعد");
  assert.equal(formatStreakText(-1), "لا يوجد تتابع بعد");
  assert.equal(formatStreakText(-10), "لا يوجد تتابع بعد");
  assert.equal(formatStreakText(NaN), "لا يوجد تتابع بعد");
  assert.equal(formatStreakText(null), "لا يوجد تتابع بعد");
  assert.equal(formatStreakText(undefined), "لا يوجد تتابع بعد");
  assert.equal(formatStreakText("invalid"), "لا يوجد تتابع بعد");

  assert.equal(formatStreakText(1), "يوم واحد");
  assert.equal(formatStreakText(2), "يومان متتاليان");
  assert.equal(formatStreakText(3), "3 أيام متتالية");
  assert.equal(formatStreakText(5), "5 أيام متتالية");
  assert.equal(formatStreakText(10), "10 أيام متتالية");
  assert.equal(formatStreakText(11), "11 يوماً متتالياً");
  assert.equal(formatStreakText(25), "25 يوماً متتالياً");
  assert.equal(formatStreakText(99), "99 يوماً متتالياً");
  assert.equal(formatStreakText(100), "100 يوماً متتالياً");
  assert.equal(formatStreakText(365), "365 يوماً متتالياً");
});

test("toArabicDigits converts Western digits to Eastern Arabic numerals", () => {
  assert.equal(toArabicDigits("0123456789"), "٠١٢٣٤٥٦٧٨٩");
  assert.equal(toArabicDigits(12345), "١٢٣٤٥");
  assert.equal(toArabicDigits("🔥 5 أيام متتالية"), "🔥 ٥ أيام متتالية");
  assert.equal(toArabicDigits("🔥 11 يوماً متتالياً"), "🔥 ١١ يوماً متتالياً");
  assert.equal(toArabicDigits("🔥 100 يوماً متتالياً"), "🔥 ١٠٠ يوماً متتالياً");
  assert.equal(toArabicDigits(0), "٠");
  assert.equal(toArabicDigits(""), "");
  assert.equal(toArabicDigits(null), "");
  assert.equal(toArabicDigits(undefined), "");
});

test("KalimatStreak exports to globalThis in browser environment", () => {
  assert.equal(typeof globalThis.KalimatStreak, "object");
  assert.equal(typeof globalThis.KalimatStreak.isDateKey, "function");
  assert.equal(typeof globalThis.KalimatStreak.calculateStreak, "function");
  assert.equal(typeof globalThis.KalimatStreak.formatStreakText, "function");
  assert.equal(typeof globalThis.KalimatStreak.toArabicDigits, "function");
});
