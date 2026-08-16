"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Core = require("../app-core.js");

const words = require("../words.js");

const CANONICAL_CATEGORIES = {
    "طبيعة وفلك": 31,     // Nature & Cosmos
    "حكمة وفلسفة": 30,    // Wisdom & Philosophy
    "شمائل ومروءة": 31,   // Human Character & Virtue
    "إيمان وروحانية": 30, // Faith & Spirituality
    "علم ومعرفة": 30,     // Knowledge & Intellect
    "أدب وشعر": 30,       // Arts & Poetry
    "مجتمع وألفة": 30,     // Society & Community
    "مشاعر وفؤاد": 31,     // Emotion & Heart
    "زمن وفصول": 31,      // Time & Seasons
    "رحلة وعزم": 30,      // Journey & Striving
    "خلق وحياة": 30,      // Creation & Life
    "لغة وفصاحة": 31      // Language & Eloquence
};

const MANDATORY_FIELDS = [
    "id",
    "word",
    "pronunciation",
    "vocalization",
    "weight",
    "root",
    "category",
    "meaning",
    "englishMeaning",
    "example",
    "context",
    "contextEnglish"
];

test("Corpus Suite — 365-Day Classical Arabic Vocabulary Invariants", async (t) => {

    await t.test("1. Cardinality & Sequential Identifiers", () => {
        // Exact count
        assert.equal(words.length, 365, "Corpus must contain exactly 365 words");

        // Sequential 1-based IDs without gaps
        for (let i = 0; i < words.length; i++) {
            assert.equal(words[i].id, i + 1, `Word at index ${i} must have id === ${i + 1}`);
            assert.ok(Number.isInteger(words[i].id), `Word #${words[i].id} ID must be an integer`);
            assert.ok(words[i].id >= 1 && words[i].id <= 365, `Word #${words[i].id} ID must be within 1..365`);
        }

        // Complete uniqueness
        const uniqueIds = new Set(words.map(w => w.id));
        assert.equal(uniqueIds.size, 365, "All 365 word IDs must be unique");

        // Headwords uniqueness
        const uniqueWords = new Set(words.map(w => w.word));
        assert.equal(uniqueWords.size, 365, "All 365 headwords must be distinct lexical entries");
    });

    await t.test("2. Mandatory 12-Field Schema Inventory", () => {
        for (const w of words) {
            for (const field of MANDATORY_FIELDS) {
                assert.ok(Object.hasOwn(w, field), `Word #${w.id} (${w.word}) must contain property '${field}'`);
                const val = w[field];
                if (field === "id") {
                    assert.equal(typeof val, "number", `Field 'id' in word #${w.id} must be a number`);
                } else {
                    assert.equal(typeof val, "string", `Field '${field}' in word #${w.id} must be a string`);
                    assert.ok(val.trim().length > 0, `Field '${field}' in word #${w.id} must not be empty or whitespace-only`);
                }
            }

            // Specific structural validations
            assert.ok(w.pronunciation.startsWith("/") && w.pronunciation.endsWith("/"), `Word #${w.id} pronunciation must be enclosed in slashes`);
            assert.ok(w.context.length >= 10, `Word #${w.id} Arabic context must be a meaningful sentence`);
            assert.ok(w.contextEnglish.length >= 10, `Word #${w.id} English context must be a meaningful sentence`);
        }
    });

    await t.test("3. Tashkeel & Phonetic Diacritics Verification", () => {
        const TASHKEEL_REGEX = /[\u064B-\u065F\u0670]/;

        for (const w of words) {
            assert.ok(TASHKEEL_REGEX.test(w.word), `Word #${w.id} (${w.word}) must contain Arabic diacritics / tashkeel`);
            assert.ok(TASHKEEL_REGEX.test(w.weight), `Weight in word #${w.id} (${w.weight}) must contain Arabic diacritics`);
            assert.ok(!w.word.includes("ـ"), `Word #${w.id} (${w.word}) must not contain tatweel (kashida)`);
        }
    });

    await t.test("4. Sarf Morphological Root Letter Validation", () => {
        const ROOT_REGEX = /^[\u0621-\u064A](\s+[\u0621-\u064A]){2,3}$/;

        for (const w of words) {
            assert.ok(ROOT_REGEX.test(w.root), `Word #${w.id} root '${w.root}' must be 3 or 4 space-separated Arabic letters`);
            assert.ok(!/[a-zA-Z0-9\u0640\u064B-\u065F]/.test(w.root), `Word #${w.id} root '${w.root}' must not contain Latin chars, digits, tatweel, or tashkeel`);
        }
    });

    await t.test("5. 12-Category Master Taxonomy Distribution", () => {
        const counts = {};
        for (const w of words) {
            assert.ok(Object.hasOwn(CANONICAL_CATEGORIES, w.category), `Word #${w.id} category '${w.category}' is not one of the 12 canonical categories`);
            counts[w.category] = (counts[w.category] || 0) + 1;
        }

        assert.equal(Object.keys(counts).length, 12, "Corpus must span all 12 canonical categories");

        let categoriesWith31 = 0;
        let categoriesWith30 = 0;

        for (const [cat, target] of Object.entries(CANONICAL_CATEGORIES)) {
            const actual = counts[cat] || 0;
            assert.equal(actual, target, `Category '${cat}' count must be exactly ${target}, got ${actual}`);
            if (actual === 31) categoriesWith31++;
            if (actual === 30) categoriesWith30++;
        }

        assert.equal(categoriesWith31, 5, "Exactly 5 categories must contain 31 words");
        assert.equal(categoriesWith30, 7, "Exactly 7 categories must contain 30 words");
        assert.equal(5 * 31 + 7 * 30, 365, "5*31 + 7*30 must equal 365");
    });

    await t.test("6. Literary Citations & Audio Extraction Invariants", () => {
        for (const w of words) {
            // Example quote must have valid literary attribution
            const hasAttribution = /[—–―‒]/.test(w.example) || /﴿[^﴾]+﴾/.test(w.example) || /«[^»]+»/.test(w.example);
            assert.ok(hasAttribution, `Word #${w.id} example quote must have an attribution dash or scripture brackets: '${w.example}'`);

            // Audio extractor must produce clean spoken text
            const spoken = Core.extractSpokenText(w.example);
            assert.ok(typeof spoken === "string" && spoken.trim().length > 0, `Word #${w.id} must produce non-empty spoken text`);
            assert.doesNotMatch(spoken, /[—–―‒\[\]\(\)〔〕【】⟨⟩⟦⟧«»"“”„‟‹›‘’'`﴿﴾ـ\u200B-\u200F\uFEFF]/, `Word #${w.id} spoken text must not retain metadata/brackets`);
            assert.ok(/[\u064B-\u0652\u0670]/.test(spoken), `Word #${w.id} spoken text must retain phonetic tashkeel`);
        }
    });

    await t.test("7. Universal Module Definition & Browser Interoperability", () => {
        // Node CommonJS export
        assert.ok(Array.isArray(words), "CommonJS require must return an array");
        assert.equal(words.length, 365);

        // Browser VM script execution
        const browserEnv = { globalThis: {} };
        const wordsSource = fs.readFileSync(path.resolve(__dirname, "../words.js"), "utf8");
        vm.runInNewContext(wordsSource, browserEnv);

        assert.ok(Array.isArray(browserEnv.globalThis.WORDS_DB), "WORDS_DB must be defined on globalThis");
        assert.ok(Array.isArray(browserEnv.globalThis.WORDS), "WORDS must be defined on globalThis");
        assert.equal(browserEnv.globalThis.WORDS_DB.length, 365, "WORDS_DB must have length 365");
        assert.equal(browserEnv.globalThis.WORDS.length, 365, "WORDS must have length 365");
    });

    await t.test("8. Deterministic Annual Calendar Rotation & Leap Year Stability", () => {
        // Non-Leap Year (2025: 365 days)
        const days2025 = [];
        const startDate2025 = new Date(Date.UTC(2025, 0, 1));
        for (let day = 0; day < 365; day++) {
            const d = new Date(startDate2025.getTime() + day * 86400000);
            const dateKey = Core.getLocalDateKey(d);
            const index = Core.getDailyWordIndex(dateKey, 365);
            assert.ok(index >= 0 && index < 365, `Index ${index} for ${dateKey} must be in [0, 364]`);
            days2025.push(index);
        }
        assert.equal(new Set(days2025).size, 365, "Non-leap year of 365 days must produce 365 unique word indices");

        // Leap Year (2024: 366 days, includes 2024-02-29)
        const days2024 = [];
        const startDate2024 = new Date(Date.UTC(2024, 0, 1));
        for (let day = 0; day < 366; day++) {
            const d = new Date(startDate2024.getTime() + day * 86400000);
            const dateKey = Core.getLocalDateKey(d);
            const index = Core.getDailyWordIndex(dateKey, 365);
            assert.ok(index >= 0 && index < 365, `Index ${index} for leap-year date ${dateKey} must be in [0, 364]`);
            days2024.push(index);
        }
        assert.equal(days2024.length, 366, "Leap year must generate 366 daily selections");

        // Negative epoch dates (pre-1970)
        assert.equal(Core.getDailyWordIndex("1969-12-31", 365), ((Math.floor(Date.UTC(1969, 11, 31) / 86400000) % 365) + 365) % 365);
        assert.ok(Core.getDailyWordIndex("1900-01-01", 365) >= 0);
    });

    await t.test("9. Lexicon Search & Related Words Connections", () => {
        // Search by exact word
        const exactRes = Core.searchLexicon("السميدع", words);
        assert.ok(exactRes.length >= 1, "Search for 'السميدع' must find at least 1 match");
        assert.equal(exactRes[0].id, 1);

        // Search by English meaning
        const engRes = Core.searchLexicon("rain", words);
        assert.ok(engRes.length >= 5, "Search for 'rain' must find multiple meteorological entries");

        // Related words by root & weight
        const related = Core.findRelatedWords(words[0], words); // السَّمَيْدَع
        assert.ok(Array.isArray(related.sameRoot), "Related sameRoot must be an array");
        assert.ok(Array.isArray(related.sameWeight), "Related sameWeight must be an array");
    });

    await t.test("10. Anki CSV Deck Formatting Across All 365 Words", () => {
        const csv = Core.serializeAnkiCSV(null, words);
        assert.ok(csv.startsWith("\uFEFF"), "Anki CSV must start with UTF-8 BOM");
        const lines = csv.trim().split("\r\n");
        assert.equal(lines.length, 366, "Anki CSV must contain 1 header line + 365 word lines");
        assert.ok(lines[0].includes('"Word","Root","Weight","Vocalization","Meaning","English Meaning","Example"'), "CSV header must match standard structure");
    });
});
