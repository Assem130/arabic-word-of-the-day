"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Core = require("./app-core.js");

class FakeElement {
    constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.listeners = new Map();
        this.classList = {
            values: new Set(),
            add: (...names) => names.forEach(name => this.classList.values.add(name)),
            remove: (...names) => names.forEach(name => this.classList.values.delete(name)),
            toggle: (name, force) => {
                const shouldAdd = force !== undefined ? Boolean(force) : !this.classList.values.has(name);
                if (shouldAdd) {
                    this.classList.values.add(name);
                    return true;
                }
                this.classList.values.delete(name);
                return false;
            }
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

const ids = new Set([1, 2, 3]);

assert.equal(Core.getLocalDateKey(new Date(2026, 6, 20)), "2026-07-20");
assert.equal(Core.getDailyWordIndex("1970-01-01", 60), 0);
assert.equal(Core.getDailyWordIndex("1970-01-02", 60), 1);
assert.equal(Core.getDailyWordIndex("2026-07-20", 60), Core.getDailyWordIndex("2026-07-20", 60));
assert.throws(() => Core.getDailyWordIndex("2026-02-30", 60), /Invalid daily word input/);

const defaults = Core.createDefaultState();
assert.deepEqual(defaults, {
    version: 2,
    schemaVersion: 2,
    srs: {},
    history: {},
    favorites: {},
    preferences: { showEnglish: true, speechRate: 0.85, speechRepeat: 1, dailyReviewLimit: 20 }
});

const normalized = Core.normalizeState({
    schemaVersion: 1,
    history: {
        1: { firstSeen: "2026-07-20" },
        99: { firstSeen: "2026-07-19" }
    },
    favorites: {
        1: true,
        99: true
    },
    preferences: { showEnglish: false }
}, ids, "2026-07-21");
assert.deepEqual(normalized.history, { 1: { firstSeen: "2026-07-20" } });
assert.deepEqual(normalized.favorites, { 1: true });
assert.equal(normalized.preferences.showEnglish, false);

const migrated = Core.normalizeState({
    learnedWords: [{ id: 2 }, { id: 3 }]
}, ids, "2026-07-21");
assert.deepEqual(migrated.history, {
    2: { firstSeen: "2026-07-21" },
    3: { firstSeen: "2026-07-21" }
});
assert.deepEqual(migrated.favorites, {});

const inspectedCurrent = Core.inspectStoredState({
    schemaVersion: 1,
    history: { 1: { firstSeen: "2026-07-20" } },
    preferences: { showEnglish: true }
}, ids, "2026-07-21");
assert.equal(inspectedCurrent.canPersist, true);
assert.deepEqual(inspectedCurrent.state.history, { 1: { firstSeen: "2026-07-20" } });
assert.deepEqual(inspectedCurrent.state.favorites, {});

const inspectedLegacy = Core.inspectStoredState({ learnedWords: [{ id: 2 }] }, ids, "2026-07-21");
assert.equal(inspectedLegacy.canPersist, true);
assert.deepEqual(inspectedLegacy.state.history, { 2: { firstSeen: "2026-07-21" } });
for (const raw of [
    { schemaVersion: 99, history: {}, preferences: { showEnglish: true } },
    { schemaVersion: 1, history: { 1: { firstSeen: "not-a-date" } }, preferences: { showEnglish: true } },
    { history: {} }
]) {
    const inspected = Core.inspectStoredState(raw, ids, "2026-07-21");
    assert.equal(inspected.canPersist, false, "unrecognized stored state must block overwrites");
    assert.deepEqual(inspected.state, Core.createDefaultState());
}

const resetResult = Core.resetCorruptedStorage();
assert.equal(resetResult.canPersist, true, "resetCorruptedStorage must enable persistence");
assert.deepEqual(resetResult.state, Core.createDefaultState(), "resetCorruptedStorage must return default state");

const merged = Core.mergeStates(
    { schemaVersion: 1, history: { 1: { firstSeen: "2026-07-20" } }, favorites: { 1: true }, preferences: { showEnglish: false } },
    { schemaVersion: 1, history: { 1: { firstSeen: "2026-07-18" }, 2: { firstSeen: "2026-07-19" } }, favorites: { 2: true }, preferences: { showEnglish: true } },
    ids
);
assert.deepEqual(merged.history, {
    1: { firstSeen: "2026-07-18" },
    2: { firstSeen: "2026-07-19" }
});
assert.deepEqual(merged.favorites, { 1: true, 2: true });
assert.equal(merged.preferences.showEnglish, false);

const exported = Core.serializeBackup(merged);
assert.deepEqual(Core.parseBackup(exported, ids), merged);
assert.throws(() => Core.parseBackup("not json", ids), /Invalid backup file/);
assert.throws(() => Core.parseBackup('{"schemaVersion":1}'), /Invalid backup file/);
assert.throws(() => Core.parseBackup('{"schemaVersion":99}', ids), /Unsupported backup version/);
assert.throws(() => Core.parseBackup('{"schemaVersion":1,"history":{"1":{"firstSeen":"not-a-date"}},"preferences":{"showEnglish":true}}', ids), /Invalid backup file/);
assert.throws(() => Core.parseBackup('{"schemaVersion":1,"history":{},"preferences":{"showEnglish":"false"}}', ids), /Invalid backup file/);
assert.deepEqual(Core.parseBackup('{"schemaVersion":1,"history":{"99":{"firstSeen":"2026-07-20"}},"preferences":{"showEnglish":false}}', ids), {
    version: 2,
    schemaVersion: 2,
    srs: {},
    history: {},
    favorites: {},
    preferences: { showEnglish: false, speechRate: 0.85, speechRepeat: 1, dailyReviewLimit: 20 }
});

// Test spoken text extraction
assert.equal(Core.extractSpokenText("«تجري الرياح بما لا تشتهي السفن» — المتنبي"), "تجري الرياح بما لا تشتهي السفن");
assert.equal(Core.extractSpokenText("«كانَ عَمَلُهُ دِيمَةً»"), "كانَ عَمَلُهُ دِيمَةً");
assert.equal(Core.extractSpokenText("قوله تعالى: ﴿وَلَهُ الدِّينُ وَاصِبًا﴾ [سورة النحل: 52]"), "قوله تعالى: وَلَهُ الدِّينُ وَاصِبًا");
assert.equal(Core.extractSpokenText("«كانَ عَمَلُهُ دِيمَةً» (أي مستمراً في هدوء وسكينة)."), "كانَ عَمَلُهُ دِيمَةً.");
assert.equal(Core.extractSpokenText("كـَـلِـمَـاتٌ[1] بَلِيغَةٌ¹ — مؤلف"), "كَلِمَاتٌ بَلِيغَةٌ");
assert.equal(Core.extractSpokenText("أعينيّ جودا ولا تجمدا ... ألا تبكيان — الخنساء"), "أعينيّ جودا ولا تجمدا، ألا تبكيان");
assert.equal(Core.extractSpokenText(null), "");
assert.equal(Core.extractSpokenText("[سورة البقرة: 255]"), "");

// Test human audio URL resolution (Core.getHumanAudioUrl)
assert.equal(typeof Core.getHumanAudioUrl, "function", "Core.getHumanAudioUrl must be exported");
assert.equal(Core.getHumanAudioUrl({ id: 1 }), "assets/audio/words/1.mp3");
assert.equal(Core.getHumanAudioUrl({ id: 5 }, "word"), "assets/audio/words/5.mp3");
assert.equal(Core.getHumanAudioUrl({ id: 12 }, "example"), "assets/audio/examples/12.mp3");
assert.equal(Core.getHumanAudioUrl({ id: 2, audioUrl: "https://cdn.example.com/audio/2.mp3" }), "https://cdn.example.com/audio/2.mp3");
assert.equal(Core.getHumanAudioUrl({ id: 3, audio: "custom/audio/3.mp3" }), "custom/audio/3.mp3");
assert.equal(Core.getHumanAudioUrl({ id: 4, exampleAudioUrl: "https://cdn.example.com/ex4.mp3" }, "example"), "https://cdn.example.com/ex4.mp3");
assert.equal(Core.getHumanAudioUrl({ id: 4, exampleAudio: "custom/ex4.mp3" }, "example"), "custom/ex4.mp3");
assert.equal(Core.getHumanAudioUrl(7), "assets/audio/words/7.mp3");
assert.equal(Core.getHumanAudioUrl("7"), "assets/audio/words/7.mp3");
assert.equal(Core.getHumanAudioUrl(7, "example"), "assets/audio/examples/7.mp3");
assert.equal(Core.getHumanAudioUrl(null), "");
assert.equal(Core.getHumanAudioUrl(undefined), "");
assert.equal(Core.getHumanAudioUrl({}), "");
assert.equal(Core.getHumanAudioUrl("invalid"), "");

// Test word citation formatting
const mockWord = {
    id: 1,
    word: "السَّمَيْدَع",
    vocalization: "بفتح السين والميم",
    weight: "فَعَيْلَل",
    root: "س م د ع",
    meaning: "السيد الشريف الشجاع",
    example: "ألا تبكيان الفتى السَّمَيْدَعا؟ — الخنساء"
};
const citation = Core.formatWordCitation(mockWord);
assert.ok(citation.includes("السَّمَيْدَع"));
assert.ok(citation.includes("الخنساء"));
assert.ok(citation.includes("كَلِمات"));

// Test quiz generation
const sampleDb = [
    { id: 1, word: "أ", root: "ا ا ا", weight: "فعل", meaning: "معنى أ" },
    { id: 2, word: "ب", root: "ب ب ب", weight: "فاعل", meaning: "معنى ب" },
    { id: 3, word: "ج", root: "ج ج ج", weight: "مفعول", meaning: "معنى ج" },
    { id: 4, word: "د", root: "د د د", weight: "فعيل", meaning: "معنى د" }
];
const quizFromEmpty = Core.generateQuizQuestions([], sampleDb, 3);
assert.equal(quizFromEmpty.length, 3);
// Test Arabic normalization
assert.equal(Core.normalizeArabicText("السَّمَيْـدَعُ"), "السميدع");
assert.equal(Core.normalizeArabicText("إِقْدَامٌ"), "اقدام");
assert.equal(Core.normalizeArabicText("الْهُدَى"), "الهدي");

// Test lexicon search
const searchDb = [
    { id: 1, word: "السَّمَيْدَع", root: "س م د ع", weight: "فَعَيْلَل", category: "شجاعة", meaning: "السيد الشريف", englishMeaning: "noble leader" },
    { id: 2, word: "الخِنْذِيذ", root: "خ ن ذ ذ", weight: "فِعْلِيل", category: "بلاغة", meaning: "السيد الحليم", englishMeaning: "patient leader" },
    { id: 3, word: "الدَّيْمَة", root: "د و م", weight: "فَعْلَة", category: "مطر", meaning: "المطر المستمر", englishMeaning: "gentle rain" }
];
assert.equal(Core.searchLexicon("سميدع", searchDb).length, 1);
assert.equal(Core.searchLexicon("س م د ع", searchDb).length, 1);
assert.equal(Core.searchLexicon("سيد", searchDb).length, 2);
assert.equal(Core.searchLexicon("rain", searchDb).length, 1);
assert.equal(Core.searchLexicon("", searchDb).length, 3);

// Test related words finder
const related = Core.findRelatedWords(searchDb[0], [
    searchDb[0],
    { id: 4, word: "السَّمْدَع", root: "س م د ع", weight: "فَعْلَل", category: "شجاعة", meaning: "السيد" },
    { id: 5, word: "الهَيْلَع", root: "هـ ي ل ع", weight: "فَعَيْلَل", category: "طبيعة", meaning: "الضعيف" }
]);
assert.equal(related.sameRoot.length, 1);
assert.equal(related.sameRoot[0].id, 4);
assert.equal(related.sameWeight.length, 1);
assert.equal(related.sameWeight[0].id, 5);

// Arabic Voice Discovery & Prioritization Unit Tests
assert.equal(Core.isArabicVoice({ lang: "ar-SA" }), true);
assert.equal(Core.isArabicVoice({ lang: "ar-EG" }), true);
assert.equal(Core.isArabicVoice({ lang: "ar-AE" }), true);
assert.equal(Core.isArabicVoice({ lang: "ar-KW" }), true);
assert.equal(Core.isArabicVoice({ lang: "ar-XA" }), true);
assert.equal(Core.isArabicVoice({ lang: "ar-001" }), true);
assert.equal(Core.isArabicVoice({ lang: "ara-001" }), true);
assert.equal(Core.isArabicVoice({ lang: "arb-001" }), true);
assert.equal(Core.isArabicVoice({ lang: "ar_SA" }), true);
assert.equal(Core.isArabicVoice({ lang: "AR-EG" }), true);
assert.equal(Core.isArabicVoice({ lang: "ar" }), true);
assert.equal(Core.isArabicVoice({ lang: "en-US" }), false);
assert.equal(Core.isArabicVoice({ lang: "fr-FR" }), false);
assert.equal(Core.isArabicVoice({ lang: "es-ES" }), false);
assert.equal(Core.isArabicVoice(null), false);
assert.equal(Core.isArabicVoice({}), false);
assert.equal(Core.isArabicVoice({ lang: "" }), false);

// Voice scoring & prioritization
const sampleVoices = [
    { name: "Microsoft David", lang: "en-US" },
    { name: "eSpeak Arabic", lang: "ar" },
    { name: "Arabic Saudi", lang: "ar-SA" },
    { name: "Google tarek", lang: "ar-XA" },
    { name: "Microsoft Naayf Online (Natural) - Arabic (Saudi Arabia)", lang: "ar-SA" },
    { name: "Maged (Enhanced)", lang: "ar-001" },
    { name: "نايف (طبيعي) - العربية", lang: "ar-SA" }
];
assert.equal(Core.scoreArabicVoice(sampleVoices[0]), -1, "Non-Arabic voice returns score -1");
assert.ok(Core.scoreArabicVoice(sampleVoices[4]) > Core.scoreArabicVoice(sampleVoices[2]), "Natural/Online Naayf must score higher than generic Arabic");
assert.ok(Core.scoreArabicVoice(sampleVoices[5]) > Core.scoreArabicVoice(sampleVoices[1]), "Enhanced Maged with ar-001 must score higher than eSpeak Arabic");
assert.ok(Core.scoreArabicVoice(sampleVoices[6]) > Core.scoreArabicVoice(sampleVoices[2]), "Arabic-script localized Naayf must score higher than generic Arabic");

const filteredVoices = Core.filterArabicVoices(sampleVoices);
assert.equal(filteredVoices.length, 6, "Must exclude non-Arabic voices");
assert.equal(filteredVoices.some(v => v.lang === "en-US"), false, "English voices must never be included");
assert.ok(filteredVoices[0].name.includes("Naayf") || filteredVoices[0].name.includes("نايف"), "Top prioritized voice must be Neural/Natural Naayf");

const bestVoice = Core.findBestArabicVoice(sampleVoices);
assert.ok(bestVoice.name.includes("Naayf") || bestVoice.name.includes("نايف"));
assert.equal(Core.findBestArabicVoice([]), null);
assert.equal(Core.findBestArabicVoice([{ name: "English", lang: "en-US" }]), null);
assert.equal(Core.findBestArabicVoice(null), null);

class FakeCanvasElement extends FakeElement {
    constructor() {
        super("canvas");
        this.width = 0;
        this.height = 0;
    }
    getContext(type) {
        if (type !== "2d") return null;
        return {
            createLinearGradient: () => ({ addColorStop() {} }),
            fillRect: () => {},
            strokeRect: () => {},
            fillText: () => {},
            measureText: (text) => ({ width: String(text || "").length * 10 }),
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {}
        };
    }
    toBlob(callback, type) {
        const fakeBlob = new Blob(["fake-png-bytes"], { type: type || "image/png" });
        if (typeof callback === "function") callback(fakeBlob);
    }
    toDataURL(type) {
        return "data:image/png;base64,fakePngData";
    }
}

// Streak Calculation Unit Tests
assert.deepEqual(Core.calculateStreak({}, "2026-08-14"), { currentStreak: 0, maxStreak: 0, isTodayVisited: false });
assert.deepEqual(Core.calculateStreak(null, "2026-08-14"), { currentStreak: 0, maxStreak: 0, isTodayVisited: false });
assert.deepEqual(Core.calculateStreak(undefined, "2026-08-14"), { currentStreak: 0, maxStreak: 0, isTodayVisited: false });
assert.deepEqual(Core.calculateStreak({ 1: { firstSeen: "2026-08-14" } }, "not-a-date"), { currentStreak: 0, maxStreak: 0, isTodayVisited: false });

const singleDayToday = Core.calculateStreak({ 1: { firstSeen: "2026-08-14" } }, "2026-08-14");
assert.equal(singleDayToday.currentStreak, 1);
assert.equal(singleDayToday.maxStreak, 1);
assert.equal(singleDayToday.isTodayVisited, true);

const yesterdayOnly = Core.calculateStreak({ 1: { firstSeen: "2026-08-13" } }, "2026-08-14");
assert.equal(yesterdayOnly.currentStreak, 1);
assert.equal(yesterdayOnly.maxStreak, 1);
assert.equal(yesterdayOnly.isTodayVisited, false);

const twoDays = Core.calculateStreak({
    1: { firstSeen: "2026-08-13" },
    2: { firstSeen: "2026-08-14" }
}, "2026-08-14");
assert.equal(twoDays.currentStreak, 2);
assert.equal(twoDays.maxStreak, 2);
assert.equal(twoDays.isTodayVisited, true);

const fiveDays = Core.calculateStreak([
    "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"
], "2026-08-14");
assert.equal(fiveDays.currentStreak, 5);
assert.equal(fiveDays.maxStreak, 5);
assert.equal(fiveDays.isTodayVisited, true);

const sameDayMultiple = Core.calculateStreak({
    1: { firstSeen: "2026-08-14" },
    2: { firstSeen: "2026-08-14" },
    3: { firstSeen: "2026-08-13" },
    4: { firstSeen: "2026-08-13" }
}, "2026-08-14");
assert.equal(sameDayMultiple.currentStreak, 2);
assert.equal(sameDayMultiple.maxStreak, 2);

const monthBoundary = Core.calculateStreak([
    "2026-01-30", "2026-01-31", "2026-02-01"
], "2026-02-01");
assert.equal(monthBoundary.currentStreak, 3);
assert.equal(monthBoundary.maxStreak, 3);

const leapYearStreak = Core.calculateStreak([
    "2024-02-28", "2024-02-29", "2024-03-01"
], "2024-03-01");
assert.equal(leapYearStreak.currentStreak, 3);
assert.equal(leapYearStreak.maxStreak, 3);

const yearBoundary = Core.calculateStreak([
    "2025-12-31", "2026-01-01"
], "2026-01-01");
assert.equal(yearBoundary.currentStreak, 2);
assert.equal(yearBoundary.maxStreak, 2);

const brokenStreak = Core.calculateStreak([
    "2026-08-10", "2026-08-11", "2026-08-12"
], "2026-08-14");
assert.equal(brokenStreak.currentStreak, 0);
assert.equal(brokenStreak.maxStreak, 3);
assert.equal(brokenStreak.isTodayVisited, false);

const histMaxStreak = Core.calculateStreak([
    "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05",
    "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10",
    "2026-08-13", "2026-08-14"
], "2026-08-14");
assert.equal(histMaxStreak.currentStreak, 2);
assert.equal(histMaxStreak.maxStreak, 10);
assert.equal(histMaxStreak.isTodayVisited, true);

const setStreak = Core.calculateStreak(new Set(["2026-08-13", "2026-08-14"]), "2026-08-14");
assert.equal(setStreak.currentStreak, 2);

const directStringObjectStreak = Core.calculateStreak({ 1: "2026-08-14" }, "2026-08-14");
assert.equal(directStringObjectStreak.currentStreak, 1);

// Arabic Pluralization Helper (formatStreakText)
assert.equal(Core.formatStreakText(0), "لا يوجد تتابع بعد");
assert.equal(Core.formatStreakText(-5), "لا يوجد تتابع بعد");
assert.equal(Core.formatStreakText(NaN), "لا يوجد تتابع بعد");
assert.equal(Core.formatStreakText(null), "لا يوجد تتابع بعد");
assert.equal(Core.formatStreakText(1), "يوم واحد");
assert.equal(Core.formatStreakText(2), "يومان");
assert.equal(Core.formatStreakText(3), "3 أيام");
assert.equal(Core.formatStreakText(5), "5 أيام");
assert.equal(Core.formatStreakText(10), "10 أيام");
assert.equal(Core.formatStreakText(11), "11 يوماً");
assert.equal(Core.formatStreakText(25), "25 يوماً");
assert.equal(Core.formatStreakText(100), "100 يوماً");

// Anki CSV Export Unit Tests
const testWords = [
    { id: 1, word: "الغَسَق", root: "غ س ق", weight: "فَعَل", vocalization: "غَسَقٌ", meaning: "ظلمة أول الليل", englishMeaning: "Twilight; the darkness of early night.", example: "أَقِمِ الصَّلَاةَ لِدُلُوكِ الشَّمْسِ إِلَىٰ غَسَقِ اللَّيْلِ — سورة الإسراء" },
    { id: 2, word: "الوَصَب", root: "و ص ب", weight: "فَعَل", vocalization: "وَصَبٌ", meaning: "المرض الدائم والألم الملازم", englishMeaning: "Chronic illness, continuous pain or fatigue.", example: "مَا يُصِيبُ المُسْلِمَ مِنْ نَصَبٍ وَلاَ وَصَبٍ — حديث نبوي" }
];
const fullAnkiCsv = Core.serializeAnkiCSV(null, testWords);
assert.equal(fullAnkiCsv.startsWith("\uFEFF"), true, "Anki CSV must start with UTF-8 BOM");
assert.equal(fullAnkiCsv.includes('"Word","Root","Weight","Vocalization","Meaning","English Meaning","Example"'), true, "Anki CSV must have correct header");
assert.equal(fullAnkiCsv.includes('"الغَسَق","غ س ق","فَعَل","غَسَقٌ","ظلمة أول الليل","Twilight; the darkness of early night."'), true, "Anki CSV data row matches RFC 4180 format");
assert.equal(fullAnkiCsv.includes("\r\n"), true, "Anki CSV must use CRLF line endings");

// Anki CSV Filtering with History
const filteredAnkiCsv = Core.serializeAnkiCSV({ 1: { firstSeen: "2026-08-14" } }, testWords);
assert.equal(filteredAnkiCsv.includes("الغَسَق"), true);
assert.equal(filteredAnkiCsv.includes("الوَصَب"), false);

// Anki CSV RFC 4180 Escaping Test with quotes & commas
const quoteWord = [{
    id: 3,
    word: 'كَلِمَة',
    root: 'ك ل م',
    weight: 'فَعِلَة',
    vocalization: 'كَلِمَةٌ',
    meaning: 'لفظ دال، "قول"',
    englishMeaning: 'A word, "speech", or utterance.',
    example: '«وقالت: "مرحباً"»'
}];
const escapedCsv = Core.serializeAnkiCSV(null, quoteWord);
assert.equal(escapedCsv.includes('""قول""'), true, 'Double quotes must be escaped as double-double quotes in RFC 4180');
assert.equal(escapedCsv.includes('""speech""'), true);

// Alias generateAnkiCsv compatibility
assert.equal(Core.generateAnkiCsv(testWords), fullAnkiCsv);

// Deep Link Query Parameter Parser (parseWordIdFromQuery)
assert.equal(Core.parseWordIdFromQuery("?id=1", 60), 1);
assert.equal(Core.parseWordIdFromQuery("?id=60", 60), 60);
assert.equal(Core.parseWordIdFromQuery("?id=5", 60), 5);
assert.equal(Core.parseWordIdFromQuery("id=42", 60), 42);
assert.equal(Core.parseWordIdFromQuery("https://kalimaat.app/word.html?id=12", 60), 12);
assert.equal(Core.parseWordIdFromQuery("?ref=share&id=33&theme=paper", 60), 33);
assert.equal(Core.parseWordIdFromQuery(new URLSearchParams("id=20"), 60), 20);
assert.equal(Core.parseWordIdFromQuery("?id=0", 60), null);
assert.equal(Core.parseWordIdFromQuery("?id=61", 60), null);
assert.equal(Core.parseWordIdFromQuery("?id=-3", 60), null);
assert.equal(Core.parseWordIdFromQuery("?id=abc", 60), null);
assert.equal(Core.parseWordIdFromQuery("?id=5.5", 60), null);
assert.equal(Core.parseWordIdFromQuery("?id=", 60), null);
assert.equal(Core.parseWordIdFromQuery("?foo=bar", 60), null);
assert.equal(Core.parseWordIdFromQuery("", 60), null);
assert.equal(Core.parseWordIdFromQuery(null, 60), null);
assert.equal(Core.parseWordIdFromQuery(undefined, 60), null);

// resolveWordSelection
const selDeep = Core.resolveWordSelection("?id=2", testWords, "2026-08-14");
assert.equal(selDeep.isDeepLink, true);
assert.equal(selDeep.requestedId, 2);
assert.equal(selDeep.word.id, 2);

const selInvalid = Core.resolveWordSelection("?id=999", testWords, "2026-08-14");
assert.equal(selInvalid.isDeepLink, false);
assert.equal(selInvalid.requestedId, null);
assert.equal(selInvalid.word.id, testWords[Core.getDailyWordIndex("2026-08-14", testWords.length)].id);

const words = require("./words.js");
assert.equal(words.length, 365);
assert.equal(new Set(words.map(word => word.id)).size, words.length);
assert.deepEqual(words.map(word => word.id), Array.from({ length: 365 }, (_, index) => index + 1));
assert.equal(words[32].englishMeaning, "Wishing for a similar blessing for oneself without wanting it removed from another person.");
const browser = { globalThis: {} };
vm.runInNewContext(fs.readFileSync(require.resolve("./words.js"), "utf8"), browser);
assert.equal(Array.isArray(browser.globalThis.WORDS_DB), true);
assert.equal(browser.globalThis.WORDS_DB.length, 365);
assert.deepEqual(Array.from(browser.globalThis.WORDS_DB, word => word.id), Array.from({ length: 365 }, (_, index) => index + 1));
const wordPage = fs.readFileSync("word.html", "utf8");
const homePage = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("revamp.css", "utf8");
const revamp = fs.readFileSync("revamp.js", "utf8");
const appSource = fs.readFileSync("app.js", "utf8");
const wordsScript = wordPage.indexOf('<script src="words.js"');
const coreScript = wordPage.indexOf('<script src="app-core.js"');
const appScript = wordPage.indexOf('<script src="app.js"');
assert.equal(wordsScript >= 0 && wordsScript < coreScript && coreScript < appScript, true, "word.html must load words.js, app-core.js, then app.js");
for (const id of ["word-pronunciation", "word-meaning-en", "btn-toggle-english", "history-dialog", "btn-export-history", "btn-import-history", "input-import-history", "storage-warning", "btn-reset-storage", "streak-badge", "btn-export-card", "btn-export-anki"]) {
    assert.equal(wordPage.includes(`id="${id}"`), true, `word.html must include ${id}`);
}
assert.match(wordPage, /id="btn-toggle-menu"[^>]*aria-expanded="false"/, "menu trigger must expose its collapsed state");
assert.match(wordPage, /<div class="app-menu-dropdown" id="app-menu-dropdown" hidden>/, "menu must be hidden before it is opened");
for (const page of [wordPage, homePage]) {
    assert.match(page, /class="skip-link" href="#main-content"/, "each page needs a skip link");
    assert.match(page, /<main class="page-shell" id="main-content" tabindex="-1">/, "each page needs a main target");
    assert.match(page, /<div id="streak-badge" class="streak-badge"/, "each page needs #streak-badge element");
    assert.doesNotMatch(page, /<script[^>]+src=["']https?:/i, "HTML pages must contain zero external CDN script tags");
    assert.match(page, /Content-Security-Policy"[^>]+script-src 'self';/, "HTML pages must enforce strict script-src 'self' CSP");
    assert.match(page, /<select id="theme-select" class="theme-select" aria-label="اختر المظهر">/, "each page needs theme select dropdown");
    assert.match(page, /<option value="paper">كلاسيكي ورقي<\/option>/, "theme select paper option");
    assert.match(page, /<option value="emerald">أندلسي زمردي<\/option>/, "theme select emerald option");
    assert.match(page, /<option value="midnight">واحة الليل<\/option>/, "theme select midnight option");
}

assert.match(css, /html\[data-theme="paper"\]/, "revamp.css must define paper theme");
assert.match(css, /html\[data-theme="emerald"\]/, "revamp.css must define emerald theme");
assert.match(css, /html\[data-theme="midnight"\]/, "revamp.css must define midnight theme");

assert.match(css, /--ink:\s*#14211b/, "paper theme ink color");
assert.match(css, /--ink-soft:\s*#24332b/, "paper theme ink-soft color");
assert.match(css, /--paper:\s*#d8cfbf/, "paper theme paper color");
assert.match(css, /--paper-light:\s*#f3efe5/, "paper theme paper-light color");
assert.match(css, /--lime:\s*#d9ff76/, "paper theme lime color");
assert.match(css, /--line-dark:\s*rgba\(20,\s*33,\s*27,\s*0\.34\)/, "paper theme line-dark color");
assert.match(css, /--line-light:\s*rgba\(243,\s*239,\s*229,\s*0\.40\)/, "paper theme line-light color");
assert.match(css, /--nav-bg:\s*rgba\(20,\s*33,\s*27,\s*0\.94\)/, "paper theme nav-bg color");

assert.match(css, /--ink:\s*#062c22/, "emerald theme ink color");
assert.match(css, /--ink-soft:\s*#114b3d/, "emerald theme ink-soft color");
assert.match(css, /--paper:\s*#e2dabf/, "emerald theme paper color");
assert.match(css, /--paper-light:\s*#f4f0e6/, "emerald theme paper-light color");
assert.match(css, /--lime:\s*#d4af37/, "emerald theme lime color");
function parseHexColor(hex) {
    const cleanHex = hex.replace("#", "").trim();
    const num = parseInt(cleanHex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return [r, g, b];
}

function getRelativeLuminance(r, g, b) {
    const rs = r / 255;
    const gs = g / 255;
    const bs = b / 255;
    const rl = rs <= 0.04045 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
    const gl = gs <= 0.04045 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
    const bl = bs <= 0.04045 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function getContrastRatio(hex1, hex2) {
    const [r1, g1, b1] = parseHexColor(hex1);
    const [r2, g2, b2] = parseHexColor(hex2);
    const l1 = getRelativeLuminance(r1, g1, b1);
    const l2 = getRelativeLuminance(r2, g2, b2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

const midnightNavContrast = getContrastRatio("#f1f5f9", "#0b1329");
assert.equal(midnightNavContrast >= 4.5, true, `Midnight nav text contrast (${midnightNavContrast.toFixed(2)}:1) must meet WCAG AA (>= 4.5:1)`);

const midnightButtonContrast = getContrastRatio("#0b1329", "#38bdf8");
assert.equal(midnightButtonContrast >= 4.5, true, `Midnight button text contrast (${midnightButtonContrast.toFixed(2)}:1) must meet WCAG AA (>= 4.5:1)`);

const midnightHeroContrast = getContrastRatio("#f1f5f9", "#0b1329");
assert.equal(midnightHeroContrast >= 4.5, true, `Midnight hero text contrast (${midnightHeroContrast.toFixed(2)}:1) must meet WCAG AA (>= 4.5:1)`);

const midnightHeroAccentContrast = getContrastRatio("#38bdf8", "#0b1329");
assert.equal(midnightHeroAccentContrast >= 4.5, true, `Midnight hero accent contrast (${midnightHeroAccentContrast.toFixed(2)}:1) must meet WCAG AA (>= 4.5:1)`);

const midnightHeroSoftContrast = getContrastRatio("#cbd5e1", "#0b1329");
assert.equal(midnightHeroSoftContrast >= 4.5, true, `Midnight hero soft text contrast (${midnightHeroSoftContrast.toFixed(2)}:1) must meet WCAG AA (>= 4.5:1)`);

assert.match(css, /--line-dark:\s*rgba\(6,\s*44,\s*34,\s*0\.34\)/, "emerald theme line-dark color");
assert.match(css, /--line-light:\s*rgba\(244,\s*240,\s*230,\s*0\.40\)/, "emerald theme line-light color");
assert.match(css, /--nav-bg:\s*rgba\(6,\s*44,\s*34,\s*0\.94\)/, "emerald theme nav-bg color");

assert.match(css, /--ink:\s*#f1f5f9/, "midnight theme ink color");
assert.match(css, /--ink-soft:\s*#cbd5e1/, "midnight theme ink-soft color");
assert.match(css, /--paper:\s*#152244/, "midnight theme paper color");
assert.match(css, /--paper-light:\s*#0b1329/, "midnight theme paper-light color");
assert.match(css, /--lime:\s*#38bdf8/, "midnight theme lime color");
assert.match(css, /--line-dark:\s*rgba\(241,\s*245,\s*249,\s*0\.20\)/, "midnight theme line-dark color");
assert.match(css, /--line-light:\s*rgba\(241,\s*245,\s*249,\s*0\.15\)/, "midnight theme line-light color");
assert.match(css, /--nav-bg:\s*rgba\(7,\s*13,\s*28,\s*0\.94\)/, "midnight theme nav-bg color");

assert.match(css, /\.nav\s*\{[^}]*background:\s*var\(--nav-bg\)/, ".nav background must use var(--nav-bg)");
assert.match(css, /\.theme-select\s*\{/, "revamp.css must style .theme-select");
assert.match(css, /\.theme-select\s+option\s*\{/, "revamp.css must style .theme-select option");

assert.match(css, /@media\s+print\s*\{/, "revamp.css must contain @media print block");
assert.match(css, /background:\s*white\s*!important;\s*color:\s*black\s*!important;/, "@media print body reset");
assert.match(css, /\.skip-link,\s*\.nav-wrap,\s*\.nav,\s*\.footer,\s*\.back-link,\s*#btn-speak,\s*\.reading-sidebar,\s*\.app-menu-dropdown,\s*#history-dialog,\s*#storage-warning,\s*\.toast,\s*button,\s*svg\.svg-sprite/, "@media print chrome hiding selectors");
assert.match(css, /\.word-experience,\s*\n?\s*\.word-card,\s*\n?\s*\.word-reading/, "@media print word experience selectors including .word-reading");

const homeCoreIndex = homePage.indexOf('<script src="app-core.js"');
const homeRevampIndex = homePage.indexOf('<script src="revamp.js"');
assert.equal(homeCoreIndex >= 0 && homeCoreIndex < homeRevampIndex, true, "index.html must load app-core.js before revamp.js");

assert.equal(typeof Core.setupThemeController, "function", "KalimatCore must export setupThemeController");
assert.doesNotMatch(appSource, /function\s+setupThemeController\s*\(/, "app.js must not contain duplicate setupThemeController definition");
assert.doesNotMatch(revamp, /function\s+setupThemeController\s*\(/, "revamp.js must not contain duplicate setupThemeController definition");

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
const themeSelectEl = new FakeElement("select");
const revampDocumentElement = new FakeElement("html");
const revampContext = {
    document: {
        documentElement: revampDocumentElement,
        addEventListener(type, listener) { revampListeners.set(type, listener); },
        querySelectorAll(selector) { assert.equal(selector, ".horizontal-accordion details"); return touchPanels; },
        getElementById(id) { return id === "theme-select" ? themeSelectEl : null; }
    },
    matchMedia(query) { return { matches: query === "(hover: none)" }; },
    window: {}
};
revampContext.globalThis = revampContext;
revampContext.window = revampContext;
vm.runInNewContext(fs.readFileSync("app-core.js", "utf8"), revampContext);
vm.runInNewContext(revamp, revampContext);
revampListeners.get("DOMContentLoaded")();
assert.deepEqual(touchPanels.map(panel => panel.open), [true, true, true], "touch initialization must open all disclosure cards");
assert.equal(revampDocumentElement.getAttribute("data-theme"), "paper", "revamp.js must set default data-theme to paper");
assert.equal(themeSelectEl.value, "paper", "revamp.js must set theme-select value to paper");
themeSelectEl.emit("change", { target: { value: "midnight" } });
assert.equal(revampDocumentElement.getAttribute("data-theme"), "midnight", "revamp.js theme change must update data-theme attribute");
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
class FakeAudioElement {
    constructor(src = "") {
        this.src = src;
        this.playbackRate = 1.0;
        this.paused = true;
        this.ended = false;
        this.currentTime = 0;
        this.duration = 2.5;
        this.readyState = 0;
        this.networkState = 0;
        this.error = null;

        this.onended = null;
        this.onerror = null;
        this.onabort = null;
        this.onpause = null;
        this.onplay = null;

        this._listeners = new Map();
        this._autoEndTimer = null;
        this._playDelayTimer = null;

        this.behavior = FakeAudioElement.defaultBehavior || "success";
        this.playDelayMs = FakeAudioElement.defaultPlayDelayMs || 0;
        this.autoEndDelayMs = FakeAudioElement.defaultAutoEndDelayMs !== undefined
            ? FakeAudioElement.defaultAutoEndDelayMs
            : 10;

        FakeAudioElement.instances.push(this);
    }

    static instances = [];
    static playCalls = [];
    static pauseCalls = [];
    static defaultBehavior = "success";
    static defaultPlayDelayMs = 0;
    static defaultAutoEndDelayMs = 10;

    static reset() {
        FakeAudioElement.instances.forEach(inst => inst.pause());
        FakeAudioElement.instances = [];
        FakeAudioElement.playCalls = [];
        FakeAudioElement.pauseCalls = [];
        FakeAudioElement.defaultBehavior = "success";
        FakeAudioElement.defaultPlayDelayMs = 0;
        FakeAudioElement.defaultAutoEndDelayMs = 10;
    }

    addEventListener(type, listener) {
        if (typeof listener !== "function") return;
        const current = this._listeners.get(type) || [];
        this._listeners.set(type, [...current, listener]);
    }

    removeEventListener(type, listener) {
        const current = this._listeners.get(type) || [];
        this._listeners.set(type, current.filter(fn => fn !== listener));
    }

    emit(type, event = { type, target: this }) {
        const propHandler = this["on" + type];
        if (typeof propHandler === "function") {
            try {
                propHandler.call(this, event);
            } catch (err) {
                console.error(`Error in FakeAudioElement on${type} handler:`, err);
            }
        }
        const listeners = this._listeners.get(type) || [];
        for (const listener of listeners) {
            try {
                listener.call(this, event);
            } catch (err) {
                console.error(`Error in FakeAudioElement addEventListener(${type}):`, err);
            }
        }
    }

    load() {
        this.networkState = 1;
        this.readyState = 4;
        this.emit("loadedmetadata");
        this.emit("canplay");
    }

    async play() {
        FakeAudioElement.playCalls.push({
            instance: this,
            src: this.src,
            playbackRate: this.playbackRate,
            time: Date.now()
        });

        if (this.playDelayMs > 0) {
            await new Promise(resolve => {
                this._playDelayTimer = setTimeout(resolve, this.playDelayMs);
            });
        }

        if (this.behavior === "not-allowed") {
            const err = new Error("The play() request was interrupted by a new load request or autoplay not allowed.");
            err.name = "NotAllowedError";
            this.error = err;
            this.emit("error", { type: "error", error: err });
            return Promise.reject(err);
        }

        if (this.behavior === "network-error") {
            const err = new Error("MEDIA_ELEMENT_ERROR: Network failure or 404 resource not found.");
            err.name = "MediaError";
            err.code = 2;
            this.error = err;
            this.networkState = 3;
            this.emit("error", { type: "error", error: err });
            return Promise.reject(err);
        }

        if (this.behavior === "timeout") {
            return new Promise(() => {});
        }

        this.paused = false;
        this.ended = false;
        this.readyState = 4;
        this.emit("play");
        this.emit("playing");

        if (this.autoEndDelayMs >= 0) {
            this._autoEndTimer = setTimeout(() => {
                if (!this.paused) {
                    this.paused = true;
                    this.ended = true;
                    this.currentTime = this.duration;
                    this.emit("ended");
                }
            }, this.autoEndDelayMs);
        }

        return Promise.resolve();
    }

    pause() {
        FakeAudioElement.pauseCalls.push({
            instance: this,
            src: this.src,
            time: Date.now()
        });

        if (this._playDelayTimer) {
            clearTimeout(this._playDelayTimer);
            this._playDelayTimer = null;
        }
        if (this._autoEndTimer) {
            clearTimeout(this._autoEndTimer);
            this._autoEndTimer = null;
        }

        if (!this.paused) {
            this.paused = true;
            this.emit("pause");
        }
    }
}

function loadBrowserApp({ state, rawStorage, storageFails = false, exportProbe, theme, search = "", audioMock = null, onLine = true } = {}) {
    const elementIds = [
        "main-word", "date-display", "word-vocalization", "word-weight", "word-root", "word-category",
        "word-meaning", "word-pronunciation", "word-meaning-en", "word-example-text", "countdown-timer",
        "btn-speak", "btn-speak-example", "btn-copy-quote", "btn-favorite", "btn-share", "btn-copy-link",
        "btn-toggle-history", "btn-close-history", "btn-toggle-menu", "btn-toggle-english", "btn-export-history",
        "btn-import-history", "input-import-history", "history-dialog", "history-list", "history-count",
        "count-history-all", "count-history-favs", "tab-history-all", "tab-history-favs", "drawer-empty-msg",
        "app-menu-dropdown", "storage-warning", "toast", "audio-announcer", "archive-preview-note", "btn-return-today",
        "btn-reset-storage", "theme-select", "streak-badge", "btn-export-card", "btn-export-anki",
        "practice-dialog", "practice-body", "btn-start-practice", "btn-menu-practice", "btn-close-practice",
        "shortcuts-dialog", "btn-menu-shortcuts", "btn-close-shortcuts", "btn-audio-speed", "btn-audio-repeat",
        "input-search-history", "related-words-container"
    ];
    const elements = Object.fromEntries(elementIds.map(id => [id, new FakeElement(id === "input-import-history" || id === "input-search-history" ? "input" : id === "theme-select" ? "select" : "div")]));
    elements["storage-warning"].hidden = true;
    const initialWarningHidden = elements["storage-warning"].hidden;
    const documentListeners = new Map();
    const documentElement = new FakeElement("html");
    const body = new FakeElement("body");
    const document = {
        documentElement,
        body,
        getElementById: id => elements[id],
        createElement: tagName => {
            if (tagName === "canvas") {
                const canvas = new FakeCanvasElement();
                if (exportProbe) exportProbe.canvas = canvas;
                return canvas;
            }
            const element = new FakeElement(tagName);
            if (tagName === "a" && exportProbe) {
                exportProbe.links = (exportProbe.links || []).concat(element);
                exportProbe.link = element;
            }
            return element;
        },
        fonts: { ready: Promise.resolve() },
        addEventListener(type, listener) { documentListeners.set(type, [...(documentListeners.get(type) || []), listener]); },
        async emit(type, event = { target: document, stopPropagation() {} }) {
            for (const listener of documentListeners.get(type) || []) await listener(event);
        }
    };
    const values = new Map(rawStorage !== undefined ? [["arabic_words_state", rawStorage]] : state ? [["arabic_words_state", JSON.stringify(state)]] : []);
    if (theme !== undefined) {
        values.set("kalimat_theme", theme);
    }
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
        console, document, localStorage, navigator: { onLine }, setInterval: () => 0, setTimeout: callback => timers.push(callback),
        clearTimeout: id => clearTimeout(id),
        window: {
            location: { search: search || "", origin: "https://kalimaat.app", pathname: "/word.html" }
        }
    };
    if (audioMock) {
        context.Audio = audioMock;
        context.window.Audio = audioMock;
        context.HTMLAudioElement = audioMock;
    }
    context.globalThis = context;
    context.window.KalimatCore = Core;
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

const corruptStorage = loadBrowserApp({ state: { schemaVersion: 99, history: {}, preferences: { showEnglish: true } } });
assert.equal(corruptStorage.localStorage.value("arabic_words_state").includes('"schemaVersion":99'), true, "unsupported stored data must not be overwritten");
assert.equal(corruptStorage.elements["storage-warning"].hidden, false, "blocked persistence must be explained");
await corruptStorage.elements["btn-reset-storage"].emit("click");
assert.equal(corruptStorage.elements["storage-warning"].hidden, true, "clicking reset storage button must hide warning");
assert.equal(JSON.parse(corruptStorage.localStorage.value("arabic_words_state")).schemaVersion, 2, "resetting storage restores clean schema version 2 state");

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

const speechTest = loadBrowserApp({ state: savedState });
let spokenUtterance = null;
let canceled = false;
let voiceschangedHandler = null;

speechTest.context.window.SpeechSynthesisUtterance = class FakeSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = "";
        this.voice = null;
        this.rate = 1;
        this.pitch = 1;
        this.onend = null;
        this.onerror = null;
    }
};

speechTest.context.window.speechSynthesis = {
    cancel() { canceled = true; },
    getVoices() {
        return [
            { name: "Arabic Voice", lang: "ar-SA" },
            { name: "English Voice", lang: "en-US" }
        ];
    },
    addEventListener(type, listener) {
        if (type === "voiceschanged") voiceschangedHandler = listener;
    },
    speak(utt) {
        spokenUtterance = utt;
    }
};

speechTest.context.setupSpeech();
assert.equal(typeof voiceschangedHandler, "function", "voiceschanged listener must be registered when addEventListener is supported");

await speechTest.elements["btn-speak"].emit("click");

assert.equal(canceled, true, "speech click must cancel ongoing speech");
assert.equal(speechTest.context.window._activeUtterance, spokenUtterance, "active utterance must be anchored to window._activeUtterance");
assert.equal(spokenUtterance.voice?.lang, "ar-SA", "arabic voice must be selected when available");
assert.equal(speechTest.elements["btn-speak"].classList.values.has("speaking"), true, "btn-speak must indicate speaking state");

spokenUtterance.onend();
assert.equal(speechTest.context.window._activeUtterance, null, "onend must clear window._activeUtterance anchor");
assert.equal(speechTest.elements["btn-speak"].classList.values.has("speaking"), false, "onend must clear speaking class");
assert.equal(speechTest.elements["btn-speak"].getAttribute("aria-pressed"), "false", "onend must reset aria-pressed to false");

// Test example quote speech
await speechTest.elements["btn-speak-example"].emit("click");
assert.notEqual(spokenUtterance, null);
assert.equal(speechTest.context.window._activeUtterance, spokenUtterance);
assert.equal(spokenUtterance.voice?.lang, "ar-SA");
assert.equal(spokenUtterance.rate, 0.85, "default speech rate is 0.85");
assert.equal(spokenUtterance.pitch, 1.0, "speech pitch calibrated to natural 1.0");
assert.equal(speechTest.elements["btn-speak-example"].classList.values.has("speaking"), true);
assert.equal(speechTest.elements["btn-speak-example"].getAttribute("aria-pressed"), "true");
spokenUtterance.onend();
assert.equal(speechTest.elements["btn-speak-example"].classList.values.has("speaking"), false);
assert.equal(speechTest.elements["btn-speak-example"].getAttribute("aria-pressed"), "false");

await speechTest.elements["btn-speak"].emit("click");
assert.notEqual(speechTest.context.window._activeUtterance, null, "active utterance anchored on speak");
spokenUtterance.onerror();
assert.equal(speechTest.context.window._activeUtterance, null, "onerror must clear window._activeUtterance anchor");

await speechTest.elements["btn-speak"].emit("click");
const utt1 = spokenUtterance;
assert.equal(speechTest.context.window._activeUtterance, utt1, "first click sets active utterance to utt1");
assert.equal(speechTest.elements["btn-speak"].classList.values.has("speaking"), true, "first click enables speaking state");

await speechTest.elements["btn-speak"].emit("click");
const utt2 = spokenUtterance;
assert.notEqual(utt1, utt2, "second click creates a new utterance instance");
assert.equal(speechTest.context.window._activeUtterance, utt2, "second click sets active utterance to utt2");
assert.equal(speechTest.elements["btn-speak"].classList.values.has("speaking"), true, "speaking state preserved after second click");

utt1.onend();
assert.equal(speechTest.context.window._activeUtterance, utt2, "cancelled utterance onend must not clear window._activeUtterance of new utterance");
assert.equal(speechTest.elements["btn-speak"].classList.values.has("speaking"), true, "cancelled utterance onend must not clear speaking state of active utterance");

utt2.onend();
assert.equal(speechTest.context.window._activeUtterance, null, "active utterance onend must clear window._activeUtterance");
assert.equal(speechTest.elements["btn-speak"].classList.values.has("speaking"), false, "active utterance onend must clear speaking class");

// Missing Arabic voice fallback detection & toast notification test
const noArabicVoiceApp = loadBrowserApp({ state: savedState });
let speakInvokedOnNoVoice = false;
noArabicVoiceApp.context.window.SpeechSynthesisUtterance = class FakeSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = "";
    }
};
noArabicVoiceApp.context.window.speechSynthesis = {
    cancel() {},
    getVoices() {
        return [
            { name: "Microsoft David", lang: "en-US" },
            { name: "Microsoft Zira", lang: "en-US" }
        ];
    },
    speak() { speakInvokedOnNoVoice = true; }
};
noArabicVoiceApp.context.setupSpeech();
await noArabicVoiceApp.elements["btn-speak"].emit("click");
assert.equal(speakInvokedOnNoVoice, false, "speechSynthesis.speak must NOT be called when no Arabic voice exists");
assert.equal(noArabicVoiceApp.elements["btn-speak"].classList.values.has("speaking"), false, "btn-speak must not have speaking class when no voice found");
assert.equal(noArabicVoiceApp.elements["btn-speak"].getAttribute("aria-pressed"), "false", "aria-pressed must be false when no voice found");
assert.ok(noArabicVoiceApp.elements.toast.textContent.includes("صوت عربي"), "Toast must display informative guidance about missing Arabic voice");

await noArabicVoiceApp.elements["btn-speak-example"].emit("click");
assert.equal(speakInvokedOnNoVoice, false, "speechSynthesis.speak must NOT be called for example quote when no Arabic voice exists");
assert.equal(noArabicVoiceApp.elements["btn-speak-example"].classList.values.has("speaking"), false);
assert.equal(noArabicVoiceApp.elements["btn-speak-example"].getAttribute("aria-pressed"), "false");
assert.ok(noArabicVoiceApp.elements.toast.textContent.includes("صوت عربي"));

const nullVoicesTest = loadBrowserApp({ state: savedState });
nullVoicesTest.context.window.SpeechSynthesisUtterance = class FakeSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = "";
    }
};
nullVoicesTest.context.window.speechSynthesis = {
    cancel() {},
    getVoices() { return null; },
    speak() {}
};
nullVoicesTest.context.setupSpeech();
let nullVoicesError = null;
try {
    await nullVoicesTest.elements["btn-speak"].emit("click");
} catch (err) {
    nullVoicesError = err;
}
assert.equal(nullVoicesError, null, "clicking speak when getVoices() returns null must not throw TypeError");
assert.ok(nullVoicesTest.elements.toast.textContent.includes("صوت عربي"), "Toast guidance shown when getVoices() returns null");

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

const defaultApp = loadBrowserApp();
assert.equal(defaultApp.document.documentElement.getAttribute("data-theme"), "paper", "default theme must be paper");
assert.equal(defaultApp.elements["theme-select"].value, "paper", "default theme-select value must be paper");

const emeraldApp = loadBrowserApp({ theme: "emerald" });
assert.equal(emeraldApp.document.documentElement.getAttribute("data-theme"), "emerald", "theme from storage must set data-theme to emerald");
assert.equal(emeraldApp.elements["theme-select"].value, "emerald", "theme from storage must set theme-select value to emerald");

const invalidThemeApp = loadBrowserApp({ theme: "unknown_theme" });
assert.equal(invalidThemeApp.document.documentElement.getAttribute("data-theme"), "paper", "invalid stored theme must fall back to paper");
assert.equal(invalidThemeApp.elements["theme-select"].value, "paper", "invalid stored theme must set theme-select value to paper");

const themeSwitchApp = loadBrowserApp();
await themeSwitchApp.elements["theme-select"].emit("change", { target: { value: "midnight" } });
assert.equal(themeSwitchApp.document.documentElement.getAttribute("data-theme"), "midnight", "theme select change must update data-theme to midnight");
assert.equal(themeSwitchApp.localStorage.value("kalimat_theme"), "midnight", "theme select change must persist theme to localStorage");

await themeSwitchApp.elements["theme-select"].emit("change", { target: { value: "invalid_choice" } });
assert.equal(themeSwitchApp.document.documentElement.getAttribute("data-theme"), "midnight", "invalid theme change must be ignored");

// ==========================================
// R3.1 Streak Badge Browser UI Verification
// ==========================================
const streakOneApp = loadBrowserApp({ state: { schemaVersion: 1, history: {}, preferences: { showEnglish: true } } });
assert.equal(streakOneApp.elements["streak-badge"].textContent, "🔥 يوم واحد", "Initial day visit streak badge must render '🔥 يوم واحد'");
assert.equal(streakOneApp.elements["streak-badge"].getAttribute("aria-label"), "تتابع القراءة: يوم واحد");

const todayStr = Core.getLocalDateKey(new Date());
const yesterdayDate = new Date();
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const yesterdayStr = Core.getLocalDateKey(yesterdayDate);

const streakTwoApp = loadBrowserApp({
    state: {
        schemaVersion: 1,
        history: {
            1: { firstSeen: yesterdayStr },
            2: { firstSeen: todayStr }
        },
        preferences: { showEnglish: true }
    }
});
assert.equal(streakTwoApp.elements["streak-badge"].textContent, "🔥 يومان متتاليان", "2 streak badge must render '🔥 يومان متتاليان'");
assert.equal(streakTwoApp.elements["streak-badge"].getAttribute("aria-label"), "تتابع القراءة: يومان متتاليان");

// ==========================================
// R3.2 Canvas 1080x1080 Social Card Export
// ==========================================
const cardProbe = {};
const cardApp = loadBrowserApp({ state: savedState, exportProbe: cardProbe });
cardApp.elements["app-menu-dropdown"].hidden = false;
await cardApp.elements["btn-export-card"].emit("click");
assert.equal(cardProbe.canvas.width, 1080, "Social card canvas width must be 1080px");
assert.equal(cardProbe.canvas.height, 1080, "Social card canvas height must be 1080px");
assert.equal(cardProbe.link.hidden, true, "Card export download link must be hidden");
assert.equal(cardProbe.link.clickCount, 1, "Card export link must be clicked");
assert.match(cardProbe.link.download, /^kalimat-word-\d+\.png$/, "Card export filename must follow kalimat-word-{id}.png pattern");
assert.equal(cardProbe.link.parentNode, null, "Card export link must be removed from DOM");
assert.equal(cardApp.elements["app-menu-dropdown"].hidden, true, "Menu must be closed after exporting card");
cardApp.timers[0]();
assert.equal(cardProbe.revoked, "blob:kalimat-test", "Object URL must be revoked after card export");

// ==========================================
// R3.3 Anki CSV Deck Exporter UI
// ==========================================
const ankiProbe = {};
const ankiApp = loadBrowserApp({ state: savedState, exportProbe: ankiProbe });
await ankiApp.elements["btn-export-anki"].emit("click");
assert.equal(ankiProbe.link.hidden, true, "Anki export download link must be hidden");
assert.equal(ankiProbe.link.clickCount, 1, "Anki export link must be clicked");
assert.equal(ankiProbe.link.download, "kalimat-anki-deck.csv", "Anki deck export filename must be kalimat-anki-deck.csv");
assert.equal(ankiProbe.link.parentNode, null, "Anki export link must be removed from DOM");
assert.equal(ankiApp.elements.toast.textContent, "تم تصدير بطاقات Anki بنجاح!", "Toast must confirm Anki export");
ankiApp.timers[0]();
assert.equal(ankiProbe.revoked, "blob:kalimat-test", "Object URL must be revoked after Anki export");

// ==========================================
// R3.4 URL Deep-Linking & Routing
// ==========================================
const deepLinkedApp = loadBrowserApp({ search: "?id=5" });
assert.equal(deepLinkedApp.elements["main-word"].textContent, words[4].word, "word.html?id=5 must load word ID 5");
const parsedStoredDeep = JSON.parse(deepLinkedApp.localStorage.value("arabic_words_state"));
assert.equal(Boolean(parsedStoredDeep.history[5]), true, "Deep-linked word must be registered in history");

// Test return to today from deep link
if (words[4].id !== words[Core.getDailyWordIndex(todayStr, words.length)].id) {
    assert.equal(deepLinkedApp.elements["archive-preview-note"].hidden, false, "Deep link for non-today word must show archive notice");
    assert.equal(deepLinkedApp.elements["btn-return-today"].hidden, false, "Deep link for non-today word must show return button");
    await deepLinkedApp.elements["btn-return-today"].emit("click");
    assert.equal(deepLinkedApp.elements["archive-preview-note"].hidden, true, "Returning to today must hide archive notice");
    assert.equal(deepLinkedApp.elements["main-word"].textContent, words[Core.getDailyWordIndex(todayStr, words.length)].word, "Returning to today must restore today's word");
}

const invalidDeepApp = loadBrowserApp({ search: "?id=999" });
assert.equal(invalidDeepApp.elements["main-word"].textContent, words[Core.getDailyWordIndex(todayStr, words.length)].word, "Invalid deep-link ID must fall back to today's word");
assert.equal(invalidDeepApp.elements["archive-preview-note"].hidden, true, "Invalid deep link fallback must not show archive notice");

// Share text deep-linking
const shareApp = loadBrowserApp({ state: savedState });
const shareWord = words[0];
const generatedShareText = shareApp.context.getShareText(shareWord);
assert.match(generatedShareText, /kalimaat\.app\/word\.html\?id=1/, "Share text must include deep link URL with word ID");

// ==========================================
// Milestone M2: Dual-Engine Audio & Cascading Fallback Integration Checks
// ==========================================
// M2.1 window.KalimatApp global export contract
assert.ok(shareApp.context.window.KalimatApp, "window.KalimatApp must be exported");
assert.equal(typeof shareApp.context.window.KalimatApp.speakText, "function", "KalimatApp.speakText must be a function");
assert.equal(typeof shareApp.context.window.KalimatApp.stopSpeech, "function", "KalimatApp.stopSpeech must be a function");

// M2.2 Pre-recorded Audio Playback Success (Tier 1)
FakeAudioElement.reset();
const m2AudioApp = loadBrowserApp({ state: savedState, audioMock: FakeAudioElement });
let m2TtsCalls = [];
m2AudioApp.context.window.SpeechSynthesisUtterance = class FakeSpeechSynthesisUtterance {
    constructor(text) { this.text = text; this.lang = ""; }
};
m2AudioApp.context.window.speechSynthesis = {
    cancel() {},
    getVoices() { return [{ name: "Naayf", lang: "ar-SA" }]; },
    speak(u) { m2TtsCalls.push(u); }
};
m2AudioApp.context.setupSpeech();

const m2SpeakPromise = m2AudioApp.elements["btn-speak"].emit("click");
assert.equal(FakeAudioElement.playCalls.length, 1, "FakeAudioElement play() called on click");
assert.ok(FakeAudioElement.playCalls[0].src.includes("assets/audio/words/"), "Target is assets/audio/words/");
assert.equal(m2AudioApp.elements["btn-speak"].classList.values.has("speaking"), true);

await m2SpeakPromise;
await new Promise(r => setTimeout(r, 25));

assert.equal(m2TtsCalls.length, 0, "speechSynthesis must NOT be called when audio succeeds");
assert.equal(m2AudioApp.elements["btn-speak"].classList.values.has("speaking"), false);
assert.equal(m2AudioApp.elements["btn-speak"].getAttribute("aria-pressed"), "false");

// M2.3 Audio Failure Cascading Fallback to Web Speech API (Tier 2)
FakeAudioElement.reset();
FakeAudioElement.defaultBehavior = "network-error";
const m2FallbackApp = loadBrowserApp({ state: savedState, audioMock: FakeAudioElement });
let m2FallbackTts = [];
m2FallbackApp.context.window.SpeechSynthesisUtterance = class FakeSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = "";
        this.voice = null;
        this.rate = 1;
        this.pitch = 1;
        this.onend = null;
        this.onerror = null;
    }
};
m2FallbackApp.context.window.speechSynthesis = {
    cancel() {},
    getVoices() { return [{ name: "Naayf", lang: "ar-SA" }]; },
    speak(u) { m2FallbackTts.push(u); }
};
m2FallbackApp.context.setupSpeech();

await m2FallbackApp.elements["btn-speak"].emit("click");
assert.ok(FakeAudioElement.playCalls.length >= 1, "Audio element attempted first");
assert.equal(m2FallbackTts.length, 1, "Web Speech API fallback seamlessly invoked on audio error");
assert.equal(m2FallbackTts[0].voice?.name, "Naayf");
assert.equal(m2FallbackApp.elements.toast.classList.values.has("show"), false, "Toast not shown when fallback succeeds");

// M3.1 Accessible Multi-State Audio UI Controls & Live Region Tests
const m3App = loadBrowserApp({ state: savedState });
const m3Btn = m3App.elements["btn-speak"];
const m3Announcer = m3App.elements["audio-announcer"];

// Test setButtonPlaybackState multi-state transitions
m3App.context.window.KalimatApp.setButtonPlaybackState(m3Btn, "loading");
assert.equal(m3Btn.classList.values.has("loading"), true);
assert.equal(m3Btn.getAttribute("aria-busy"), "true");
assert.equal(m3Btn.getAttribute("aria-pressed"), "false");

m3App.context.window.KalimatApp.setButtonPlaybackState(m3Btn, "buffering");
assert.equal(m3Btn.classList.values.has("buffering"), true);
assert.equal(m3Btn.getAttribute("aria-busy"), "true");
assert.equal(m3Btn.getAttribute("aria-pressed"), "true");

m3App.context.window.KalimatApp.setButtonPlaybackState(m3Btn, "speaking");
assert.equal(m3Btn.classList.values.has("speaking"), true);
assert.equal(m3Btn.classList.values.has("loading"), false);
assert.equal(m3Btn.getAttribute("aria-busy"), "false");
assert.equal(m3Btn.getAttribute("aria-pressed"), "true");

m3App.context.window.KalimatApp.setButtonPlaybackState(m3Btn, "idle");
assert.equal(m3Btn.classList.values.has("speaking"), false);
assert.equal(m3Btn.getAttribute("aria-busy"), "false");
assert.equal(m3Btn.getAttribute("aria-pressed"), "false");

// Test announceAudioStatus polite screen reader dispatches
m3App.context.window.KalimatApp.announceAudioStatus("استماع لنطق كلمة «المجد»");
if (m3App.timers && m3App.timers.length > 0) {
    m3App.timers.shift()();
}
assert.equal(m3Announcer.textContent, "استماع لنطق كلمة «المجد»");

// M3.2 File and CSS Consistency Verification
const m3WordHtml = fs.readFileSync("word.html", "utf-8");
const m3RevampCss = fs.readFileSync("revamp.css", "utf-8");
assert.ok(m3WordHtml.includes('id="audio-announcer"'));
assert.ok(m3WordHtml.includes('aria-busy="false"'));
assert.ok(m3RevampCss.includes(".sr-only"));
assert.ok(m3RevampCss.includes(".speak-button.loading"));
assert.ok(m3RevampCss.includes(".speak-button.buffering"));
assert.ok(m3RevampCss.includes('@keyframes pulse-buffering'));
assert.ok(m3RevampCss.includes('html[data-theme="midnight"] .example-action-btn.speaking'));
assert.ok(m3RevampCss.includes('html[data-theme="midnight"] .audio-option-btn.active'));

}

browserChecks()
    .then(() => console.log("All checks passed."))
    .catch(error => { console.error(error); process.exitCode = 1; });
