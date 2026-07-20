(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.KalimatCore = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";

    const SCHEMA_VERSION = 1;
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

    function getDailyWordIndex(dateKey, wordCount) {
        if (!isDateKey(dateKey) || !Number.isInteger(wordCount) || wordCount < 1) {
            throw new TypeError("Invalid daily word input.");
        }
        const [year, month, day] = dateKey.split("-").map(Number);
        const ordinal = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
        return ((ordinal % wordCount) + wordCount) % wordCount;
    }

    function createDefaultState() {
        return { schemaVersion: SCHEMA_VERSION, history: {}, preferences: { showEnglish: true } };
    }

    function isHistoryRecord(record) {
        return !!record && typeof record === "object" && !Array.isArray(record) && isDateKey(record.firstSeen);
    }

    function isCurrentState(raw) {
        return !!raw && typeof raw === "object" && !Array.isArray(raw)
            && raw.schemaVersion === SCHEMA_VERSION
            && raw.history && typeof raw.history === "object" && !Array.isArray(raw.history)
            && raw.preferences && typeof raw.preferences === "object" && !Array.isArray(raw.preferences)
            && typeof raw.preferences.showEnglish === "boolean"
            && Object.entries(raw.history).every(([id, record]) => Number.isInteger(Number(id)) && isHistoryRecord(record));
    }

    function isLegacyState(raw) {
        return !!raw && typeof raw === "object" && !Array.isArray(raw)
            && !Object.hasOwn(raw, "schemaVersion") && Array.isArray(raw.learnedWords)
            && raw.learnedWords.every(item => item && typeof item === "object" && Number.isInteger(item.id));
    }

    function normalizeState(raw, validIds, fallbackDate) {
        const state = createDefaultState();
        if (!raw || typeof raw !== "object") return state;

        const sourceHistory = raw.schemaVersion === SCHEMA_VERSION && raw.history && typeof raw.history === "object" && !Array.isArray(raw.history)
            ? Object.entries(raw.history)
            : Array.isArray(raw.learnedWords)
                ? raw.learnedWords.map(item => [item.id, { firstSeen: fallbackDate }])
                : [];

        for (const [rawId, record] of sourceHistory) {
            const id = Number(rawId);
            if (!validIds.has(id) || !record || !isDateKey(record.firstSeen)) continue;
            state.history[id] = { firstSeen: record.firstSeen };
        }

        if (raw.preferences && typeof raw.preferences === "object") {
            state.preferences.showEnglish = raw.preferences.showEnglish !== false;
        }
        return state;
    }

    function inspectStoredState(raw, validIds, fallbackDate) {
        if (raw === null) return { state: createDefaultState(), canPersist: true };
        if (isCurrentState(raw) || isLegacyState(raw)) {
            return { state: normalizeState(raw, validIds, fallbackDate), canPersist: true };
        }
        return { state: createDefaultState(), canPersist: false };
    }

    function mergeStates(local, incoming, validIds) {
        const merged = normalizeState(local, validIds, getLocalDateKey(new Date()));
        const other = normalizeState(incoming, validIds, getLocalDateKey(new Date()));
        for (const [id, record] of Object.entries(other.history)) {
            const current = merged.history[id];
            if (!current || record.firstSeen < current.firstSeen) merged.history[id] = record;
        }
        return merged;
    }

    function parseBackup(text, validIds) {
        let raw;
        try { raw = JSON.parse(text); } catch { throw new Error("Invalid backup file."); }
        if (!raw || raw.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported backup version.");
        if (!isCurrentState(raw)) throw new Error("Invalid backup file.");
        return normalizeState(raw, validIds, getLocalDateKey(new Date()));
    }

    function serializeBackup(state) {
        return `${JSON.stringify(state, null, 2)}\n`;
    }

    return { SCHEMA_VERSION, getLocalDateKey, getDailyWordIndex, createDefaultState, normalizeState, inspectStoredState, mergeStates, parseBackup, serializeBackup };
});
