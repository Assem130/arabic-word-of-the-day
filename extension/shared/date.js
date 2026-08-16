(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatDate = api;
})(globalThis, function () {
  "use strict";

  const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

  function isDateKey(value) {
    if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function todayDateKey() {
    return getLocalDateKey(new Date());
  }

  function addDaysToDateKey(dateKey, days) {
    if (!isDateKey(dateKey) || typeof days !== "number") return dateKey;
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + days));
    return date.toISOString().slice(0, 10);
  }

  function getDaysDifference(dateKey1, dateKey2) {
    if (!isDateKey(dateKey1) || !isDateKey(dateKey2)) return 0;
    const [y1, m1, d1] = dateKey1.split("-").map(Number);
    const [y2, m2, d2] = dateKey2.split("-").map(Number);
    const ord1 = Math.floor(Date.UTC(y1, m1 - 1, d1) / 86400000);
    const ord2 = Math.floor(Date.UTC(y2, m2 - 1, d2) / 86400000);
    return ord2 - ord1;
  }

  return { getLocalDateKey, todayDateKey, isDateKey, addDaysToDateKey, getDaysDifference };
});
