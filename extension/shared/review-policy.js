(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatReviewPolicy = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const MAX_INTERVAL = 100000;
  const MAX_EF = 10;

  function mapRatingToGrade(rating) {
    if (typeof rating === "number") return Number.isNaN(rating) ? 4 : Math.min(5, Math.max(0, Math.round(rating)));
    if (typeof rating === "string") {
      const value = rating.trim().toLowerCase();
      if (/^\d+$/.test(value)) return Math.min(5, Math.max(0, Number(value)));
      if (["again", "أعد", "اعد", "مجددا", "مجدداً"].includes(value)) return 1;
      if (["hard", "صعب"].includes(value)) return 3;
      if (["good", "جيد"].includes(value)) return 4;
      if (["easy", "سهل"].includes(value)) return 5;
    }
    return 4;
  }

  function interval(value) {
    return Number.isFinite(value) && value >= 0 && value <= MAX_INTERVAL ? Math.round(value) : 0;
  }

  function easeFactor(value) {
    return Number.isFinite(value) && value >= 1.3 && value <= MAX_EF ? Math.round(value * 100) / 100 : 2.5;
  }

  function ratingName(rating, grade) {
    if (typeof rating === "string" && rating.trim()) return rating.trim().toLowerCase();
    return grade === 1 ? "again" : grade === 3 ? "hard" : grade === 4 ? "good" : grade === 5 ? "easy" : String(grade);
  }

  function calculate(item, rating, dateKey, dates) {
    if (!dates || !dates.isDateKey || !dates.getLocalDateKey || !dates.addDaysToDateKey) throw new TypeError("Review dates are required.");
    const reviewDate = dates.isDateKey(dateKey) ? dateKey : dates.getLocalDateKey(new Date());
    const grade = mapRatingToGrade(rating);
    const repetition = Number.isInteger(item?.repetition) && item.repetition >= 0
      ? item.repetition : (Number.isInteger(item?.repetitions) && item.repetitions >= 0 ? item.repetitions : 0);
    const previousInterval = interval(item?.interval);
    const previousEf = easeFactor(typeof item?.ef === "number" ? item.ef : item?.easeFactor);
    const lapses = Number.isInteger(item?.lapses) && item.lapses >= 0 ? item.lapses : 0;
    const reviewCount = Number.isInteger(item?.reviewCount) && item.reviewCount >= 0 ? item.reviewCount : 0;
    const history = Array.isArray(item?.history) ? [...item.history] : [];
    const ef = Math.max(1.3, Math.round((previousEf + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))) * 100) / 100);
    const failed = grade < 3;
    const nextInterval = failed ? 1 : repetition === 0 ? 1 : repetition === 1 ? 6 : Math.round(previousInterval * ef);
    const historyEntry = { date: reviewDate, grade, rating: ratingName(rating, grade), interval: nextInterval, ef };
    return {
      ...(item?.wordId === undefined ? {} : { wordId: item.wordId }),
      repetition: failed ? 0 : repetition + 1,
      interval: nextInterval,
      ef,
      nextReviewDate: dates.addDaysToDateKey(reviewDate, nextInterval),
      lastReviewedDate: reviewDate,
      reviewCount: reviewCount + 1,
      lapses: failed ? lapses + 1 : lapses,
      historyEntry,
      history: [...history, historyEntry].slice(-50),
    };
  }

  function formatInterval(value) {
    if (value === 1) return "غدًا";
    if (value === 2) return "بعد يومين";
    if (value >= 3 && value <= 10) return `بعد ${value} أيام`;
    return `بعد ${value} يومًا`;
  }

  function getOptions(item, dateKey, dates) {
    return Object.fromEntries(["again", "hard", "good", "easy"].map((rating) => {
      const next = calculate(item, rating, dateKey, dates);
      return [rating, { interval: next.interval, nextReviewDate: next.nextReviewDate, label: formatInterval(next.interval) }];
    }));
  }

  function sortDue(items, getId = (item) => item?.word?.id ?? item?.id ?? 0) {
    return [...items].sort((a, b) => {
      if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
      const aSrs = a.srs || a;
      const bSrs = b.srs || b;
      const intervalDiff = interval(aSrs.interval) - interval(bSrs.interval);
      if (intervalDiff) return intervalDiff;
      const easeDiff = easeFactor(aSrs.ef) - easeFactor(bSrs.ef);
      if (easeDiff) return easeDiff;
      const repetitionDiff = (Number.isInteger(aSrs.repetition) ? aSrs.repetition : 0) - (Number.isInteger(bSrs.repetition) ? bSrs.repetition : 0);
      if (repetitionDiff) return repetitionDiff;
      return Number(getId(a)) - Number(getId(b));
    });
  }

  function summarize(items, dateKey, options = {}) {
    const reviewedFromHistory = options.reviewedFromHistory === true;
    let dueToday = 0;
    let reviewedToday = 0;
    let totalReviewCount = 0;
    let historyCount = 0;
    let successfulHistoryCount = 0;
    let totalEf = 0;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      if (item.nextReviewDate && item.nextReviewDate <= dateKey) dueToday++;
      if (item.lastReviewedDate === dateKey || (reviewedFromHistory && Array.isArray(item.history) && item.history.some((entry) => entry?.date === dateKey))) reviewedToday++;
      totalReviewCount += Number.isInteger(item.reviewCount) && item.reviewCount >= 0 ? item.reviewCount : 0;
      totalEf += easeFactor(item.ef);
      for (const entry of Array.isArray(item.history) ? item.history : []) {
        if (!entry || typeof entry !== "object") continue;
        historyCount++;
        if (mapRatingToGrade(entry.grade ?? entry.rating) >= 3) successfulHistoryCount++;
      }
    }
    const totalCards = items.length;
    return {
      totalCards,
      dueToday,
      reviewedToday,
      totalReviewCount,
      historyCount,
      retentionRate: historyCount ? Math.round((successfulHistoryCount / historyCount) * 1000) / 10 : 100,
      averageEF: totalCards ? Math.round((totalEf / totalCards) * 100) / 100 : 2.5,
    };
  }

  return { mapRatingToGrade, calculate, formatInterval, getOptions, sortDue, summarize };
});
