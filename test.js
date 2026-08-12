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

const inspectedCurrent = Core.inspectStoredState({
    schemaVersion: 1,
    history: { 1: { firstSeen: "2026-07-20" } },
    preferences: { showEnglish: true }
}, ids, "2026-07-21");
assert.equal(inspectedCurrent.canPersist, true);
assert.deepEqual(inspectedCurrent.state.history, { 1: { firstSeen: "2026-07-20" } });
const inspectedLegacy = Core.inspectStoredState({ learnedWords: [{ id: 2 }] }, ids, "2026-07-21");
assert.equal(inspectedLegacy.canPersist, true);
assert.deepEqual(inspectedLegacy.state.history, { 2: { firstSeen: "2026-07-21" } });
for (const raw of [
    { schemaVersion: 2, history: {}, preferences: { showEnglish: true } },
    { schemaVersion: 1, history: { 1: { firstSeen: "not-a-date" } }, preferences: { showEnglish: true } },
    { history: {} }
]) {
    const inspected = Core.inspectStoredState(raw, ids, "2026-07-21");
    assert.equal(inspected.canPersist, false, "unrecognized stored state must block overwrites");
    assert.deepEqual(inspected.state, Core.createDefaultState());
}

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
assert.throws(() => Core.parseBackup('{"schemaVersion":1,"history":{"1":{"firstSeen":"not-a-date"}},"preferences":{"showEnglish":true}}', ids), /Invalid backup file/);
assert.throws(() => Core.parseBackup('{"schemaVersion":1,"history":{},"preferences":{"showEnglish":"false"}}', ids), /Invalid backup file/);
assert.deepEqual(Core.parseBackup('{"schemaVersion":1,"history":{"99":{"firstSeen":"2026-07-20"}},"preferences":{"showEnglish":false}}', ids), {
    schemaVersion: 1, history: {}, preferences: { showEnglish: false }
});

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
const homePage = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("revamp.css", "utf8");
const revamp = fs.readFileSync("revamp.js", "utf8");
const appSource = fs.readFileSync("app.js", "utf8");
const wordsScript = wordPage.indexOf('<script src="words.js"');
const coreScript = wordPage.indexOf('<script src="app-core.js"');
const appScript = wordPage.indexOf('<script src="app.js"');
assert.equal(wordsScript >= 0 && wordsScript < coreScript && coreScript < appScript, true, "word.html must load words.js, app-core.js, then app.js");
for (const id of ["word-pronunciation", "word-meaning-en", "btn-toggle-english", "history-dialog", "btn-export-history", "btn-import-history", "input-import-history", "storage-warning"]) {
    assert.equal(wordPage.includes(`id="${id}"`), true, `word.html must include ${id}`);
}
assert.match(wordPage, /id="btn-toggle-menu"[^>]*aria-expanded="false"/, "menu trigger must expose its collapsed state");
assert.match(wordPage, /<div class="app-menu-dropdown" id="app-menu-dropdown" hidden>/, "menu must be hidden before it is opened");
for (const page of [wordPage, homePage]) {
    assert.match(page, /class="skip-link" href="#main-content"/, "each page needs a skip link");
    assert.match(page, /<main class="page-shell" id="main-content" tabindex="-1">/, "each page needs a main target");
}
assert.match(css, /@media \(hover: none\)/, "touch users must be able to read accordion details");
assert.match(css, /button:focus-visible, a:focus-visible, summary:focus-visible, \[tabindex\]:focus-visible \{ outline: 3px solid var\(--ink\)/, "focus must remain visible on light surfaces");
assert.match(css, /\.nav :is\(button, a\):focus-visible, \.word-identity :is\(button, a\):focus-visible \{ outline: 3px solid var\(--lime\)/, "focus must remain visible on dark surfaces");
assert.equal((homePage.match(/<details>/g) || []).length, 3, "landing page must expose three native disclosure cards");
assert.equal((homePage.match(/<summary><span>/g) || []).length, 3, "each disclosure card must have a native summary");
assert.doesNotMatch(homePage, /<article\b[^>]*tabindex\s*=\s*["']0/, "accordion cards must not use focusable articles");
assert.match(css, /summary:focus-visible/, "disclosure focus ring must belong to summary");
assert.match(css, /\.horizontal-accordion details:hover, \.horizontal-accordion details:focus-within, \.horizontal-accordion details\[open\]/, "disclosures must expand for hover, focus, and open states");
assert.match(css, /summary::-webkit-details-marker \{ display: none; \}/, "native disclosure marker must be visually hidden");
assert.match(css, /\.hero a:focus-visible, \.horizontal-accordion details:nth-child\(-n\+2\) summary:focus-visible \{ outline-color: var\(--lime\)/, "all dark homepage surfaces need a light focus ring");
const touchPanels = [{ open: false }, { open: false }, { open: false }];
const revampListeners = new Map();
const revampContext = {
    document: {
        addEventListener(type, listener) { revampListeners.set(type, listener); },
        querySelectorAll(selector) { assert.equal(selector, ".horizontal-accordion details"); return touchPanels; }
    },
    matchMedia(query) { return { matches: query === "(hover: none)" }; },
    window: {}
};
revampContext.globalThis = revampContext;
vm.runInNewContext(revamp, revampContext);
revampListeners.get("DOMContentLoaded")();
assert.deepEqual(touchPanels.map(panel => panel.open), [true, true, true], "touch initialization must open all disclosure cards");
const exportSource = appSource.slice(appSource.indexOf("function exportHistory()"), appSource.indexOf("async function importHistory"));
assert.match(exportSource, /link\.hidden = true;[\s\S]*document\.body\.appendChild\(link\);[\s\S]*link\.click\(\);[\s\S]*link\.remove\(\);[\s\S]*setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 0\);[\s\S]*setMenuOpen\(false\);\s*showToast/, "history export must clean up its temporary link, defer URL cleanup, close the menu, then toast");
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

class FakeElement {
    constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.listeners = new Map();
        this.classList = {
            values: new Set(),
            add: (...names) => names.forEach(name => this.classList.values.add(name)),
            remove: (...names) => names.forEach(name => this.classList.values.delete(name)),
            toggle: name => this.classList.values.has(name)
                ? (this.classList.values.delete(name), false)
                : (this.classList.values.add(name), true)
        };
        this.style = {};
        this.attributes = new Map();
        this.hidden = false;
        this.disabled = false;
        this.value = "";
        this.files = [];
        this.textContent = "";
        this.innerHTML = "";
        this.parentNode = null;
        this.clickCount = 0;
    }

    addEventListener(type, listener) {
        this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
    }

    async emit(type, event = { target: this, stopPropagation() {} }) {
        for (const listener of this.listeners.get(type) || []) await listener(event);
    }

    click() { this.clickCount += 1; return this.emit("click"); }
    append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
    appendChild(child) { this.append(child); return child; }
    replaceChildren(...children) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name); }
    contains(target) { return target === this || this.children.some(child => child.contains?.(target)); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    select() {}
    focus() { this.focused = true; }
    querySelector() { return null; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
}

function loadBrowserApp({ state, rawStorage, storageFails = false, exportProbe } = {}) {
    const elementIds = [
        "main-word", "date-display", "word-vocalization", "word-weight", "word-root", "word-category",
        "word-meaning", "word-pronunciation", "word-meaning-en", "word-example-text", "countdown-timer",
        "btn-speak", "btn-share", "btn-copy-link", "btn-toggle-history", "btn-close-history", "btn-toggle-menu",
        "btn-toggle-english", "btn-export-history", "btn-import-history", "input-import-history", "history-dialog",
        "history-list", "history-count", "drawer-empty-msg", "app-menu-dropdown", "storage-warning", "toast",
        "archive-preview-note", "btn-return-today"
    ];
    const elements = Object.fromEntries(elementIds.map(id => [id, new FakeElement(id === "input-import-history" ? "input" : "div")]));
    elements["storage-warning"].hidden = true;
    const initialWarningHidden = elements["storage-warning"].hidden;
    const documentListeners = new Map();
    const body = new FakeElement("body");
    const document = {
        body,
        getElementById: id => elements[id],
        createElement: tagName => {
            const element = new FakeElement(tagName);
            if (tagName === "a" && exportProbe) exportProbe.link = element;
            return element;
        },
        addEventListener(type, listener) { documentListeners.set(type, [...(documentListeners.get(type) || []), listener]); },
        async emit(type, event = { target: document, stopPropagation() {} }) {
            for (const listener of documentListeners.get(type) || []) await listener(event);
        }
    };
    const values = new Map(rawStorage !== undefined ? [["arabic_words_state", rawStorage]] : state ? [["arabic_words_state", JSON.stringify(state)]] : []);
    const localStorage = {
        getItem(key) { if (storageFails) throw new Error("storage unavailable"); return values.get(key) || null; },
        setItem(key, value) { if (storageFails) throw new Error("storage unavailable"); values.set(key, value); },
        value: key => values.get(key)
    };
    const timers = [];
    const urlApi = exportProbe ? {
        createObjectURL(blob) { exportProbe.blob = blob; return "blob:kalimat-test"; },
        revokeObjectURL(url) { exportProbe.revoked = url; }
    } : URL;
    const context = {
        Array, Blob, Boolean, Date, JSON, Map, Math, Number, Object, Promise, RegExp, Set, String, URL: urlApi,
        console, document, localStorage, navigator: {}, setInterval: () => 0, setTimeout: callback => timers.push(callback)
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    for (const file of ["words.js", "app-core.js", "app.js"]) {
        vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
    }
    document.emit("DOMContentLoaded");
    return { context, document, elements, initialWarningHidden, localStorage, timers };
}

async function browserChecks() {
const menuMarkup = wordPage.match(/<div class="app-menu-dropdown"[^>]*>([\s\S]*?)<\/div>/);
assert.equal(menuMarkup[1].includes("storage-warning"), false, "storage warning must not be hidden inside the menu");

const storageFailure = loadBrowserApp({ storageFails: true });
assert.equal(storageFailure.initialWarningHidden, true, "storage warning must start hidden before initialization");
assert.equal(storageFailure.elements["storage-warning"].hidden, false, "storage failures must reveal the warning");
assert.equal(storageFailure.elements["btn-speak"].disabled, true, "missing speech APIs must disable speech");

const savedState = { schemaVersion: 1, history: { 1: { firstSeen: "2099-01-01" } }, preferences: { showEnglish: true } };
const archive = loadBrowserApp({ state: savedState });
archive.elements["app-menu-dropdown"].hidden = true;
await archive.elements["btn-toggle-menu"].emit("click");
assert.equal(archive.elements["app-menu-dropdown"].hidden, false, "menu trigger must reveal the menu");
assert.equal(archive.elements["btn-toggle-menu"].getAttribute("aria-expanded"), "true", "menu trigger must expose its expanded state");
await archive.document.emit("click");
assert.equal(archive.elements["app-menu-dropdown"].hidden, true, "outside click must hide the menu");
assert.equal(archive.elements["btn-toggle-menu"].getAttribute("aria-expanded"), "false", "outside click must reset the menu state");
const archiveButton = archive.elements["history-list"].children[0].children[0];
assert.equal(archiveButton.tagName, "BUTTON", "archive entries must contain native buttons");
archive.elements["history-dialog"].open = true;
archiveButton.emit("click");
assert.equal(archive.elements["main-word"].textContent, words[0].word, "archive button must preview its word");
assert.equal(archive.elements["history-dialog"].open, false, "archive preview must close the dialog");
assert.equal(archive.elements["archive-preview-note"].hidden, false, "archive preview must identify itself");
assert.equal(archive.elements["btn-return-today"].hidden, false, "archive preview must offer a return to today");
await archive.elements["btn-return-today"].emit("click");
assert.equal(archive.elements["archive-preview-note"].hidden, true, "returning to today must clear the archive state");

const corruptStorage = loadBrowserApp({ state: { schemaVersion: 2, history: {}, preferences: { showEnglish: true } } });
assert.equal(corruptStorage.localStorage.value("arabic_words_state").includes('"schemaVersion":2'), true, "unsupported stored data must not be overwritten");
assert.equal(corruptStorage.elements["storage-warning"].hidden, false, "blocked persistence must be explained");

const invalidStorage = loadBrowserApp({ rawStorage: "{not-json" });
assert.equal(invalidStorage.localStorage.value("arabic_words_state"), "{not-json", "invalid stored JSON must not be overwritten");
assert.equal(invalidStorage.elements["storage-warning"].hidden, false, "invalid stored JSON must be explained");

const importer = loadBrowserApp({ state: savedState });
const countBeforeImport = importer.elements["history-count"].textContent;
const itemsBeforeImport = importer.elements["history-list"].children.length;
const stateBeforeImport = importer.localStorage.value("arabic_words_state");
importer.elements["input-import-history"].value = "invalid-backup.json";
importer.elements["input-import-history"].files = [{ text: async () => "not json" }];
await importer.elements["input-import-history"].emit("change");
assert.equal(importer.elements["history-count"].textContent, countBeforeImport, "invalid import must keep the history count");
assert.equal(importer.elements["history-list"].children.length, itemsBeforeImport, "invalid import must keep history UI intact");
assert.equal(importer.localStorage.value("arabic_words_state"), stateBeforeImport, "invalid import must not replace saved state");
assert.equal(importer.elements.toast.textContent, "ملف المخزون غير صالح.", "invalid import must show the failure toast");
assert.equal(importer.elements["input-import-history"].value, "", "invalid import must reset the file input");

const preferences = loadBrowserApp({ state: savedState });
await preferences.elements["btn-toggle-english"].emit("click");
assert.equal(JSON.parse(preferences.localStorage.value("arabic_words_state")).preferences.showEnglish, false, "English toggle must persist its preference");
assert.equal(preferences.elements["word-meaning-en"].hidden, true, "English toggle must hide the gloss");

const speaking = loadBrowserApp({ state: savedState });
speaking.elements["btn-speak"].textContent = "استمع إلى النطق";
speaking.context.window.speechSynthesis = { cancel() {}, getVoices: () => [], speak() {} };
speaking.context.window.SpeechSynthesisUtterance = function () {};
assert.equal(fs.readFileSync("app.js", "utf8").includes("btnSpeak.innerHTML"), false, "speech state must not replace the visible button label");

const clipboard = loadBrowserApp({ state: savedState });
let unhandled;
const onUnhandled = error => { unhandled = error; };
process.once("unhandledRejection", onUnhandled);
await clipboard.elements["btn-copy-link"].emit("click");
await new Promise(resolve => setImmediate(resolve));
process.removeListener("unhandledRejection", onUnhandled);
assert.equal(unhandled, undefined, "missing clipboard APIs must not create an unhandled rejection");
assert.equal(clipboard.elements.toast.textContent, "تعذّر النسخ؛ يرجى المحاولة مجدداً.", "missing clipboard APIs must show the failure toast");

const exportProbe = {};
const exporter = loadBrowserApp({ state: savedState, exportProbe });
exporter.elements["app-menu-dropdown"].hidden = false;
await exporter.elements["btn-export-history"].emit("click");
assert.equal(exportProbe.link.hidden, true, "history export link must be hidden");
assert.equal(exportProbe.link.clickCount, 1, "history export link must be clicked");
assert.equal(exportProbe.link.parentNode, null, "history export link must be removed after download");
assert.equal(exportProbe.revoked, undefined, "object URL cleanup must be deferred");
assert.equal(exporter.elements["app-menu-dropdown"].hidden, true, "history export must close the menu before feedback");
assert.equal(exporter.elements.toast.textContent, "تم تصدير المخزون.", "history export must show success feedback");
exporter.timers[0]();
assert.equal(exportProbe.revoked, "blob:kalimat-test", "deferred cleanup must revoke the object URL");

}

browserChecks()
    .then(() => console.log("All checks passed."))
    .catch(error => { console.error(error); process.exitCode = 1; });
