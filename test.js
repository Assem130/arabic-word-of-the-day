"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Core = require("./app-core.js");

const ids = new Set([1, 2, 3]);

assert.equal(Core.getLocalDateKey(new Date(2026, 6, 20)), "2026-07-20");
assert.equal(Core.getDailyWordIndex("1970-01-01", 60), 0);
assert.equal(Core.getDailyWordIndex("1970-01-02", 60), 1);
assert.equal(Core.getDailyWordIndex("2026-07-20", 60), Core.getDailyWordIndex("2026-07-20", 60));
assert.throws(() => Core.getDailyWordIndex("2026-02-30", 60), /Invalid daily word input/);

const defaults = Core.createDefaultState();
assert.deepEqual(defaults, {
    schemaVersion: 1,
    history: {},
    preferences: { showEnglish: true }
});

const normalized = Core.normalizeState({
    schemaVersion: 1,
    history: {
        1: { firstSeen: "2026-07-20" },
        99: { firstSeen: "2026-07-19" }
    },
    preferences: { showEnglish: false }
}, ids, "2026-07-21");
assert.deepEqual(normalized.history, { 1: { firstSeen: "2026-07-20" } });
assert.equal(normalized.preferences.showEnglish, false);

const migrated = Core.normalizeState({
    learnedWords: [{ id: 2 }, { id: 3 }]
}, ids, "2026-07-21");
assert.deepEqual(migrated.history, {
    2: { firstSeen: "2026-07-21" },
    3: { firstSeen: "2026-07-21" }
});

const merged = Core.mergeStates(
    { schemaVersion: 1, history: { 1: { firstSeen: "2026-07-20" } }, preferences: { showEnglish: false } },
    { schemaVersion: 1, history: { 1: { firstSeen: "2026-07-18" }, 2: { firstSeen: "2026-07-19" } }, preferences: { showEnglish: true } },
    ids
);
assert.deepEqual(merged.history, {
    1: { firstSeen: "2026-07-18" },
    2: { firstSeen: "2026-07-19" }
});
assert.equal(merged.preferences.showEnglish, false);

const exported = Core.serializeBackup(merged);
assert.deepEqual(Core.parseBackup(exported, ids), merged);
assert.throws(() => Core.parseBackup("not json", ids), /Invalid backup file/);
assert.throws(() => Core.parseBackup('{"schemaVersion":1}'), /Invalid backup file/);
assert.throws(() => Core.parseBackup('{"schemaVersion":2}', ids), /Unsupported backup version/);

const words = require("./words.js");
assert.equal(words.length, 60);
assert.equal(new Set(words.map(word => word.id)).size, words.length);
assert.deepEqual(words.map(word => word.id), Array.from({ length: 60 }, (_, index) => index + 1));
assert.equal(words[32].englishMeaning, "Wishing for a similar blessing for oneself without wanting it removed from another person.");
const browser = { globalThis: {} };
vm.runInNewContext(fs.readFileSync(require.resolve("./words.js"), "utf8"), browser);
assert.equal(Array.isArray(browser.globalThis.WORDS_DB), true);
assert.equal(browser.globalThis.WORDS_DB.length, 60);
assert.deepEqual(Array.from(browser.globalThis.WORDS_DB, word => word.id), Array.from({ length: 60 }, (_, index) => index + 1));
const wordPage = fs.readFileSync("word.html", "utf8");
const wordsScript = wordPage.indexOf('<script src="words.js"');
const coreScript = wordPage.indexOf('<script src="app-core.js"');
const appScript = wordPage.indexOf('<script src="app.js"');
assert.equal(wordsScript >= 0 && wordsScript < coreScript && coreScript < appScript, true, "word.html must load words.js, app-core.js, then app.js");
for (const id of ["word-pronunciation", "word-meaning-en", "btn-toggle-english", "history-dialog", "btn-export-history", "btn-import-history", "input-import-history", "storage-warning"]) {
    assert.equal(wordPage.includes(`id="${id}"`), true, `word.html must include ${id}`);
}
for (const word of words) {
    assert.equal(Number.isInteger(word.id), true);
    for (const field of ["word", "pronunciation", "vocalization", "weight", "root", "category", "meaning", "englishMeaning", "example"]) {
        assert.equal(typeof word[field], "string", `Word ${word.id} ${field} must be a string`);
        assert.equal(word[field].trim().length > 0, true, `Word ${word.id} ${field} must not be empty`);
    }
    assert.equal(word.englishMeaning.length <= 180, true, `Word ${word.id} English gloss is too long`);
}

const todayKey = Core.getLocalDateKey(new Date(2026, 6, 20));
const todayWord = words[Core.getDailyWordIndex(todayKey, words.length)];
assert.equal(words.includes(todayWord), true);

const viewed = Core.createDefaultState();
viewed.history[todayWord.id] = { firstSeen: todayKey };
const viewedAgain = Core.mergeStates(viewed, viewed, new Set(words.map(word => word.id)));
assert.equal(Object.keys(viewedAgain.history).length, 1);
assert.equal(viewedAgain.history[todayWord.id].firstSeen, todayKey);

console.log("All checks passed.");
