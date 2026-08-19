(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatReviewSession = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const sessions = new WeakMap();

  function data(session) {
    const value = sessions.get(session);
    if (!value) throw new TypeError("Invalid review session.");
    return value;
  }

  function parseQueue(response) {
    if (!response || response.kind !== "queue" || !Array.isArray(response.words)) return null;
    for (const key of ["dueCount", "visibleCount", "remainingCount"]) {
      if (response[key] !== undefined && (!Number.isInteger(response[key]) || response[key] < 0)) return null;
    }
    if (response.words.some((item) => {
      const word = item?.word && typeof item.word === "object" ? item.word : item;
      return !item || typeof item !== "object" || !(item.wordId || item.id || word?.id)
        || typeof word?.word !== "string" || !word.word.trim()
        || !(typeof word.meaningAr === "string" && word.meaningAr.trim()) && !(typeof word.meaning === "string" && word.meaning.trim());
    })) return null;
    const dueCount = response.dueCount ?? response.words.length;
    const visibleCount = response.visibleCount ?? response.words.length;
    const remainingCount = response.remainingCount ?? Math.max(0, dueCount - visibleCount);
    if (visibleCount !== response.words.length || visibleCount > dueCount || remainingCount !== dueCount - visibleCount) return null;
    if (response.words.length === 0 && dueCount !== 0) return null;
    return { words: response.words, dueCount, visibleCount, remainingCount, storageWarning: response.storageWarning === true };
  }

  function create() {
    const session = {};
    sessions.set(session, {
      words: [],
      meta: { dueCount: 0, visibleCount: 0, remainingCount: 0 },
      loaded: false,
      index: 0,
      revealed: false,
      submitting: false,
      error: "",
      recovery: false,
    });
    return session;
  }

  function reset(session) {
    const current = data(session);
    current.words = [];
    current.meta = { dueCount: 0, visibleCount: 0, remainingCount: 0 };
    current.loaded = false;
    current.index = 0;
    current.revealed = false;
    current.submitting = false;
    current.error = "";
    current.recovery = false;
    return session;
  }

  function acceptQueue(session, queue) {
    reset(session);
    const current = data(session);
    current.words = queue.words;
    current.meta = { dueCount: queue.dueCount, visibleCount: queue.visibleCount, remainingCount: queue.remainingCount };
    current.loaded = true;
    return session;
  }

  function fail(session, message) {
    reset(session);
    data(session).error = message;
    return session;
  }

  function recover(session) {
    reset(session);
    data(session).recovery = true;
    return session;
  }

  function showCard(session, index) {
    const current = data(session);
    current.index = index;
    current.revealed = false;
    current.submitting = false;
    current.error = "";
    current.recovery = false;
    return current.words[index] || null;
  }

  function toggleReveal(session) {
    const current = data(session);
    current.revealed = !current.revealed;
    return current.revealed;
  }

  function beginSubmission(session) {
    const current = data(session);
    if (!current.revealed || current.submitting || current.index >= current.words.length) return null;
    current.submitting = true;
    return current.words[current.index];
  }

  function advance(session) {
    const current = data(session);
    current.index += 1;
    current.revealed = false;
    current.submitting = false;
    return current.index < current.words.length ? current.index : null;
  }

  function finishSubmission(session) {
    data(session).submitting = false;
    return session;
  }

  function resetCard(session) {
    const current = data(session);
    current.revealed = false;
    current.submitting = false;
    return session;
  }

  function isLoaded(session) { return data(session).loaded; }
  function isRecovery(session) { return data(session).recovery; }
  function hasError(session) { return data(session).error !== ""; }
  function error(session) { return data(session).error; }
  function isRevealed(session) { return data(session).revealed; }
  function isSubmitting(session) { return data(session).submitting; }
  function count(session) { return data(session).words.length; }
  function index(session) { return data(session).index; }
  function current(session) { const value = data(session); return value.words[value.index] || null; }
  function meta(session) { return { ...data(session).meta }; }

  async function load(session, requestQueue, errorMessage = "تعذّر تحميل المراجعات. حاول مجددًا.") {
    reset(session);
    try {
      const response = await requestQueue();
      if (response?.kind === "recovery") {
        recover(session);
        return { kind: "recovery", recoveryRaw: response.recoveryRaw };
      }
      const queue = parseQueue(response);
      if (!queue) throw new Error("Invalid review queue.");
      acceptQueue(session, queue);
      return { kind: "queue", queue };
    } catch (_) {
      fail(session, errorMessage);
      return { kind: "error" };
    }
  }

  return { parseQueue, create, reset, acceptQueue, fail, recover, showCard, toggleReveal, beginSubmission, advance, finishSubmission, resetCard, isLoaded, isRecovery, hasError, error, isRevealed, isSubmitting, count, index, current, meta, load };
});
