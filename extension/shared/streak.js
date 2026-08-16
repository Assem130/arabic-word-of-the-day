(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatStreak = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

  /**
   * Validates a date string as a real Gregorian calendar date in YYYY-MM-DD format.
   * @param {*} value
   * @returns {boolean}
   */
  function isDateKey(value) {
    if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  /**
   * Calculates current active streak, historical maximum streak, and today's visit status.
   * Supports Array, Set, Profile object, or key-value history dictionaries.
   *
   * @param {*} historyOrAssignments
   * @param {string} todayKey
   * @returns {{ currentStreak: number, maxStreak: number, isTodayVisited: boolean }}
   */
  function calculateStreak(historyOrAssignments, todayKey) {
    if (!isDateKey(todayKey)) {
      return { currentStreak: 0, maxStreak: 0, isTodayVisited: false };
    }

    const dateSet = new Set();

    if (historyOrAssignments) {
      if (Array.isArray(historyOrAssignments)) {
        for (const item of historyOrAssignments) {
          if (typeof item === "string" && isDateKey(item)) {
            dateSet.add(item);
          } else if (item && typeof item === "object") {
            if (typeof item.dateKey === "string" && isDateKey(item.dateKey)) {
              dateSet.add(item.dateKey);
            } else if (typeof item.firstSeen === "string" && isDateKey(item.firstSeen)) {
              dateSet.add(item.firstSeen);
            } else if (typeof item.date === "string" && isDateKey(item.date)) {
              dateSet.add(item.date);
            }
          }
        }
      } else if (historyOrAssignments instanceof Set) {
        for (const item of historyOrAssignments) {
          if (typeof item === "string" && isDateKey(item)) {
            dateSet.add(item);
          }
        }
      } else if (typeof historyOrAssignments === "object") {
        // Handle profile-like objects containing assignments or wordStates
        if (historyOrAssignments.assignments && typeof historyOrAssignments.assignments === "object") {
          for (const [key, val] of Object.entries(historyOrAssignments.assignments)) {
            if (isDateKey(key)) dateSet.add(key);
            if (val && typeof val === "object") {
              if (typeof val.dateKey === "string" && isDateKey(val.dateKey)) dateSet.add(val.dateKey);
              else if (typeof val.firstSeen === "string" && isDateKey(val.firstSeen)) dateSet.add(val.firstSeen);
              else if (typeof val.date === "string" && isDateKey(val.date)) dateSet.add(val.date);
            }
          }
        }
        if (historyOrAssignments.wordStates && typeof historyOrAssignments.wordStates === "object") {
          for (const val of Object.values(historyOrAssignments.wordStates)) {
            if (val && typeof val === "object") {
              if (typeof val.dateKey === "string" && isDateKey(val.dateKey)) dateSet.add(val.dateKey);
              else if (typeof val.firstSeen === "string" && isDateKey(val.firstSeen)) dateSet.add(val.firstSeen);
              else if (typeof val.date === "string" && isDateKey(val.date)) dateSet.add(val.date);
            }
          }
        }

        // Handle direct dictionary mapping (e.g. dateKey -> assignment or wordId -> { firstSeen })
        for (const [key, val] of Object.entries(historyOrAssignments)) {
          if (key === "assignments" || key === "wordStates" || key === "preferences" || key === "recentIds") continue;
          if (isDateKey(key)) {
            dateSet.add(key);
          }
          if (typeof val === "string" && isDateKey(val)) {
            dateSet.add(val);
          } else if (val && typeof val === "object") {
            if (typeof val.dateKey === "string" && isDateKey(val.dateKey)) {
              dateSet.add(val.dateKey);
            } else if (typeof val.firstSeen === "string" && isDateKey(val.firstSeen)) {
              dateSet.add(val.firstSeen);
            } else if (typeof val.date === "string" && isDateKey(val.date)) {
              dateSet.add(val.date);
            }
          }
        }
      }
    }

    if (dateSet.size === 0) {
      return { currentStreak: 0, maxStreak: 0, isTodayVisited: false };
    }

    const ordinals = Array.from(dateSet).map((d) => {
      const [y, m, day] = d.split("-").map(Number);
      return Math.floor(Date.UTC(y, m - 1, day) / 86400000);
    });

    const ordinalSet = new Set(ordinals);
    const [ty, tm, td] = todayKey.split("-").map(Number);
    const todayOrdinal = Math.floor(Date.UTC(ty, tm - 1, td) / 86400000);

    const isTodayVisited = ordinalSet.has(todayOrdinal);

    // Active streak calculation (grace period: alive if visited today OR yesterday)
    let currentStreak = 0;
    let startOrdinal = null;
    if (isTodayVisited) {
      startOrdinal = todayOrdinal;
    } else if (ordinalSet.has(todayOrdinal - 1)) {
      startOrdinal = todayOrdinal - 1;
    }

    if (startOrdinal !== null) {
      let curr = startOrdinal;
      while (ordinalSet.has(curr)) {
        currentStreak++;
        curr--;
      }
    }

    // Historical max streak calculation
    const sortedUniqueOrdinals = Array.from(ordinalSet).sort((a, b) => a - b);
    let maxStreak = 0;
    let runningStreak = 0;
    let prev = null;
    for (const ord of sortedUniqueOrdinals) {
      if (prev === null || ord === prev + 1) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
      if (runningStreak > maxStreak) {
        maxStreak = runningStreak;
      }
      prev = ord;
    }

    return {
      currentStreak,
      maxStreak,
      isTodayVisited,
    };
  }

  /**
   * Formats streak count using Classical Arabic pluralization and agreement rules.
   * @param {number} streakCount
   * @returns {string}
   */
  function formatStreakText(streakCount) {
    const num = Number(streakCount);
    if (!Number.isInteger(num) || num <= 0) {
      return "لا يوجد تتابع بعد";
    }
    if (num === 1) {
      return "يوم واحد";
    }
    if (num === 2) {
      return "يومان متتاليان";
    }
    if (num >= 3 && num <= 10) {
      return `${num} أيام متتالية`;
    }
    return `${num} يوماً متتالياً`;
  }

  /**
   * Converts Arabic-Indic (Western) digits 0-9 to Eastern Arabic digits.
   * @param {number|string} num
   * @returns {string}
   */
  function toArabicDigits(num) {
    return String(num ?? "").replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  }

  return {
    isDateKey,
    calculateStreak,
    formatStreakText,
    toArabicDigits,
  };
});
