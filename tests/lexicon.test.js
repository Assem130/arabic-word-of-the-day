"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Core = require("../app-core.js");
const WebUI = require("../web-ui.js");
const words = require("../words.js");

// Mock Element for VM sandbox testing
class MockElement {
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
            },
            contains: (name) => this.classList.values.has(name)
        };
        this.dataset = {};
        this.style = {};
        this.attributes = new Map();
        this.hidden = false;
        this.disabled = false;
        this.value = "";
        this.textContent = "";
        this._innerHTML = "";
        this.parentNode = null;
        this.open = false;
    }

    set className(val) {
        this._className = val;
        this.classList.values.clear();
        if (typeof val === "string") {
            val.trim().split(/\s+/).forEach(c => { if (c) this.classList.values.add(c); });
        }
    }

    get className() {
        return Array.from(this.classList.values).join(" ") || this._className || "";
    }

    set innerHTML(html) {
        this._innerHTML = html;
        this.children = [];
    }

    get innerHTML() {
        return this._innerHTML || "";
    }

    addEventListener(type, listener) {
        this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
    }

    async emit(type, event = { target: this, stopPropagation() {}, preventDefault() {} }) {
        if (event && !event.target) event.target = this;
        let stopped = false;
        const origStop = event.stopPropagation;
        event.stopPropagation = () => {
            stopped = true;
            if (typeof origStop === "function") origStop.call(event);
        };

        let curr = this;
        while (curr) {
            for (const listener of curr.listeners.get(type) || []) {
                await listener(event);
                if (stopped) return;
            }
            curr = curr.parentNode;
        }
    }

    append(...children) {
        for (const child of children) {
            if (child) {
                child.parentNode = this;
                this.children.push(child);
            }
        }
    }

    appendChild(child) {
        this.append(child);
        return child;
    }

    replaceChildren(...children) {
        this.children.forEach(child => { if (child) child.parentNode = null; });
        this.children = [];
        for (const child of children) {
            if (child && child.tagName === "FRAGMENT") {
                for (const fragmentChild of [...child.children]) {
                    this.appendChild(fragmentChild);
                }
            } else if (child) {
                this.appendChild(child);
            }
        }
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name); }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }

    querySelector(selector) {
        const matches = this.querySelectorAll(selector);
        return matches.length > 0 ? matches[0] : null;
    }

    querySelectorAll(selector) {
        const results = [];
        const matchElement = (el) => {
            if (!el) return;
            if (selector.startsWith(".")) {
                const className = selector.slice(1);
                if (el.classList.values.has(className)) results.push(el);
            } else if (selector.startsWith("#")) {
                const id = selector.slice(1);
                if (el.id === id) results.push(el);
            } else if (selector.toLowerCase() === el.tagName.toLowerCase()) {
                results.push(el);
            }
            for (const child of el.children) matchElement(child);
        };
        for (const child of this.children) matchElement(child);
        return results;
    }

    closest(selector) {
        let curr = this;
        while (curr) {
            if (selector.startsWith(".")) {
                const className = selector.slice(1);
                if (curr.classList.values.has(className)) return curr;
            } else if (selector.startsWith("#")) {
                const id = selector.slice(1);
                if (curr.id === id) return curr;
            } else if (selector.toLowerCase() === curr.tagName.toLowerCase()) {
                return curr;
            }
            curr = curr.parentNode;
        }
        return null;
    }

    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
}

function setupLexiconSandbox(wordsDb = words) {
    const elements = {
        "input-lexicon-search": new MockElement("input"),
        "select-lexicon-root": new MockElement("select"),
        "select-lexicon-weight": new MockElement("select"),
        "lexicon-category-chips": new MockElement("div"),
        "lexicon-letter-bar": new MockElement("div"),
        "lexicon-results-count": new MockElement("span"),
        "lexicon-grid": new MockElement("div"),
        "lexicon-empty-state": new MockElement("div"),
        "btn-clear-lexicon-filters": new MockElement("button"),
        "btn-reset-lexicon-empty": new MockElement("button"),
        "lexicon-dialog": new MockElement("dialog")
    };

    elements["input-lexicon-search"].id = "input-lexicon-search";
    elements["select-lexicon-root"].id = "select-lexicon-root";
    elements["select-lexicon-weight"].id = "select-lexicon-weight";
    elements["lexicon-category-chips"].id = "lexicon-category-chips";
    elements["lexicon-letter-bar"].id = "lexicon-letter-bar";
    elements["lexicon-results-count"].id = "lexicon-results-count";
    elements["lexicon-grid"].id = "lexicon-grid";
    elements["lexicon-empty-state"].id = "lexicon-empty-state";
    elements["btn-clear-lexicon-filters"].id = "btn-clear-lexicon-filters";
    elements["btn-reset-lexicon-empty"].id = "btn-reset-lexicon-empty";
    elements["lexicon-dialog"].id = "lexicon-dialog";

    const documentMock = {
        getElementById: (id) => elements[id] || null,
        createElement: (tagName) => new MockElement(tagName),
        createDocumentFragment: () => new MockElement("fragment"),
        querySelectorAll: (sel) => {
            const list = [];
            for (const el of Object.values(elements)) {
                list.push(...el.querySelectorAll(sel));
            }
            return list;
        }
    };

    let spokenUtterance = null;
    let canceled = false;

    const windowMock = {
        _activeUtterance: null,
        speechSynthesis: {
            cancel: () => {
                canceled = true;
                windowMock._activeUtterance = null;
            },
            getVoices: () => [{ name: "Naayf", lang: "ar-SA" }],
            speak: (utt) => { spokenUtterance = utt; }
        },
        SpeechSynthesisUtterance: class FakeSpeechSynthesisUtterance {
            constructor(text) {
                this.text = text;
                this.lang = "ar-SA";
                this.voice = null;
                this.rate = 0.85;
                this.pitch = 1.0;
                this.onend = null;
                this.onerror = null;
            }
        },
        KalimatCore: Core
    };

    return {
        elements,
        documentMock,
        windowMock,
        getSpokenUtterance: () => spokenUtterance,
        isCanceled: () => canceled
    };
}

// ============================================================================
// TEST SUITES
// ============================================================================

test("1. Lexicon Corpus Metrics & Aggregations", () => {
    assert.equal(words.length, 365, "Total words database must contain exactly 365 words");

    // 1.1 Roots aggregation
    const roots = Core.getLexiconRoots(words);
    assert.equal(roots.length, 332, "Corpus must contain exactly 332 unique roots");
    assert.ok(roots.every(r => r.root && r.count >= 1 && r.letter), "Every root entry must contain root, count, and starting letter");

    // 1.2 Sarf Weights aggregation
    const weights = Core.getLexiconWeights(words);
    assert.equal(weights.length, 66, "Corpus must contain exactly 66 unique Sarf morphological weights");
    assert.ok(weights.every(w => w.weight && w.count >= 1), "Every weight entry must contain weight and count");

    // 1.3 Thematic Categories aggregation
    const categories = Core.getLexiconCategories(words);
    assert.equal(categories.length, 12, "Corpus must contain exactly 12 thematic categories");
    const totalWordsFromCategories = categories.reduce((sum, c) => sum + c.count, 0);
    assert.equal(totalWordsFromCategories, 365, "Sum of category word counts must equal 365");

    // 1.4 Distinct Root Letters aggregation
    const letters = Core.getLexiconLetters(words);
    assert.equal(letters.length, 27, "Corpus must contain exactly 27 distinct root initial letters");
});

test("2. Zero-Latency Multi-Facet Filtering (filterLexicon)", () => {
    // 2.1 Empty filter returns all 365 words
    const all = Core.filterLexicon(words, {});
    assert.equal(all.length, 365, "Empty filter must return full 365-word corpus");

    // 2.2 Text search with Tashkeel tolerance
    const matchTashkeel = Core.filterLexicon(words, { query: "السَّمَيْدَعُ" });
    assert.ok(matchTashkeel.some(w => w.id === 1), "Search with full tashkeel must match word ID 1");

    const matchClean = Core.filterLexicon(words, { query: "السميدع" });
    assert.ok(matchClean.some(w => w.id === 1), "Search without tashkeel must match word ID 1");

    // 2.3 Filter by category
    const wisdomWords = Core.filterLexicon(words, { category: "حكمة وفلسفة" });
    assert.equal(wisdomWords.length, 30, "Category 'حكمة وفلسفة' must return exactly 30 words");
    assert.ok(wisdomWords.every(w => w.category === "حكمة وفلسفة"), "All returned words must belong to the filtered category");

    // 2.4 Filter by Root
    const smdcWords = Core.filterLexicon(words, { root: "س م د ع" });
    assert.equal(smdcWords.length, 1, "Root 'س م د ع' must return word 1");
    assert.equal(smdcWords[0].id, 1);

    // 2.5 Filter by Root Letter
    const shinWords = Core.filterLexicon(words, { rootLetter: "ش" });
    assert.ok(shinWords.length > 0, "Roots starting with 'ش' must return words");
    assert.ok(shinWords.every(w => w.root.replace(/[\sـ\u064B-\u065F]/g, "").startsWith("ش")), "All returned words must have root starting with 'ش'");

    // 2.6 Filter by Sarf Morphological Weight
    const fuaalWords = Core.filterLexicon(words, { weight: "فُعَال" });
    assert.ok(fuaalWords.length > 0, "Weight 'فُعَال' must return words");
    assert.ok(fuaalWords.every(w => w.weight.replace(/[\u064B-\u065F]/g, "") === "فعال" || w.weight === "فُعَال"));

    // 2.7 Multi-facet intersection
    const multiMatch = Core.filterLexicon(words, {
        category: "لغة وفصاحة",
        rootLetter: "ف"
    });
    assert.ok(multiMatch.length >= 1, "Intersection of category and root letter must return matching words");
    assert.ok(multiMatch.every(w => w.category === "لغة وفصاحة" && w.root.startsWith("ف")));
});

test("3. Classical Arabic Dual/Plural Grammar (formatLexiconCountText)", () => {
    assert.equal(Core.formatLexiconCountText(0, 365), "لا توجد ألفاظ مطابقة لمعايير البحث الحالية");
    assert.equal(Core.formatLexiconCountText(1, 365), "عرض لفظ واحد من أصل 365 لفظاً");
    assert.equal(Core.formatLexiconCountText(2, 365), "عرض لفظين من أصل 365 لفظاً");
    assert.equal(Core.formatLexiconCountText(3, 365), "عرض 3 ألفاظ من أصل 365 لفظاً");
    assert.equal(Core.formatLexiconCountText(10, 365), "عرض 10 ألفاظ من أصل 365 لفظاً");
    assert.equal(Core.formatLexiconCountText(11, 365), "عرض 11 لفظاً من أصل 365 لفظاً");
    assert.equal(Core.formatLexiconCountText(365, 365), "عرض 365 من أصل 365 لفظاً");
});

test("4. Interactive Explorer Controller & Reactive DOM Sync (initLexiconExplorer)", async () => {
    const sandbox = setupLexiconSandbox(words);
    const originalDocument = global.document;
    const originalWindow = global.window;
    const selectedWords = [];
    global.document = sandbox.documentMock;
    global.window = sandbox.windowMock;

    try {
        const explorer = WebUI.initLexiconExplorer({
            wordsDb: words,
            searchInputId: "input-lexicon-search",
            rootSelectId: "select-lexicon-root",
            weightSelectId: "select-lexicon-weight",
            categoryChipsId: "lexicon-category-chips",
            letterBarId: "lexicon-letter-bar",
            resultsCountId: "lexicon-results-count",
            gridId: "lexicon-grid",
            emptyStateId: "lexicon-empty-state",
            clearBtnId: "btn-clear-lexicon-filters",
            resetEmptyBtnId: "btn-reset-lexicon-empty",
            onWordSelect: (word) => selectedWords.push(word)
        });

        assert.ok(explorer, "initLexiconExplorer must return controller instance");

        // Verify deterministic first-load preview state
        const grid = sandbox.elements["lexicon-grid"];
        assert.equal(grid.children.length, 8, "No active filter must render exactly eight preview cards");
        assert.deepEqual(
            grid.children.map(card => card.dataset.wordId),
            words.slice(0, 8).map(word => String(word.id)),
            "Preview cards must use the deterministic first eight corpus entries"
        );

        const countEl = sandbox.elements["lexicon-results-count"];
        assert.equal(countEl.textContent, "اقتراحات من المعجم");
        assert.equal(sandbox.elements["btn-clear-lexicon-filters"].hidden, true, "Clear filters must stay hidden for the preview");

        const rootSelect = sandbox.elements["select-lexicon-root"];
        assert.equal(rootSelect.children.length, 333, "Root dropdown must contain 332 roots + 1 default option");

        const weightSelect = sandbox.elements["select-lexicon-weight"];
        assert.equal(weightSelect.children.length, 67, "Weight dropdown must contain 66 weights + 1 default option");

        const catChips = sandbox.elements["lexicon-category-chips"];
        assert.equal(catChips.children.length, 13, "Category chips must contain 12 categories + 1 all chip");
        assert.equal(catChips.children.filter(chip => chip.getAttribute("aria-pressed") === "true").length, 1, "Exactly one category chip must be pressed initially");
        assert.ok(catChips.children.slice(1).every(chip => chip.getAttribute("aria-pressed") === "false"), "Inactive category chips must expose aria-pressed=false");

        const letterBar = sandbox.elements["lexicon-letter-bar"];
        assert.equal(letterBar.children.length, 28, "Letter bar must contain 27 letters + 1 all button");
        assert.equal(letterBar.children.filter(button => button.getAttribute("aria-pressed") === "true").length, 1, "Exactly one letter button must be pressed initially");
        assert.ok(letterBar.children.slice(1).every(button => button.getAttribute("aria-pressed") === "false"), "Inactive letter buttons must expose aria-pressed=false");

        // Test Live Search Event
        const searchInput = sandbox.elements["input-lexicon-search"];
        searchInput.value = "السميدع";
        await searchInput.emit("input", { target: searchInput });
        await new Promise(resolve => setTimeout(resolve, 200)); // input is debounced
        assert.equal(grid.children.length, 1, "Searching 'السميدع' must filter to 1 card");
        assert.equal(countEl.textContent, "عرض لفظ واحد من أصل 365 لفظاً");
        assert.equal(sandbox.elements["btn-clear-lexicon-filters"].hidden, false, "Clear filters button must be shown when filtered");
        assert.equal(
            grid.children[0].querySelector(".lexicon-card-meaning").textContent,
            words[0].meaning,
            "Compact cards must retain the Arabic meaning"
        );
        assert.equal(grid.children[0].querySelector(".lexicon-card-vocalization"), null, "Compact cards must omit vocalization copy");
        assert.equal(grid.children[0].querySelector(".lexicon-card-english"), null, "Compact cards must omit English copy");
        assert.equal(grid.children[0].querySelector(".lexicon-card-example"), null, "Compact cards must omit example copy");

        const readBtn = grid.children[0].querySelector(".lexicon-read-btn");
        assert.equal(readBtn.getAttribute("href"), "word.html?id=1", "Read links must retain the numeric word id");
        assert.equal(readBtn.dataset.wordId, "1", "Read links must expose the word id dataset");
        const clickEvent = { target: readBtn, prevented: false, stopPropagation() {}, preventDefault() { this.prevented = true; } };
        await readBtn.emit("click", clickEvent);
        assert.equal(clickEvent.prevented, true, "Read link selection must prevent the default navigation");
        assert.deepEqual(selectedWords, [words[0]], "Read link must invoke onWordSelect with the selected word");

        // Test Clear Filters
        const clearBtn = sandbox.elements["btn-clear-lexicon-filters"];
        await clearBtn.emit("click", { target: clearBtn });
        assert.equal(grid.children.length, 8, "Clearing filters must return to the deterministic preview");
        assert.equal(countEl.textContent, "اقتراحات من المعجم");
        assert.equal(clearBtn.hidden, true, "Clear filters button must be hidden after reset");
        assert.equal(catChips.children.filter(chip => chip.getAttribute("aria-pressed") === "true").length, 1, "Reset leaves one pressed category chip");
        assert.equal(catChips.children[0].getAttribute("aria-pressed"), "true");
        assert.ok(catChips.children.slice(1).every(chip => chip.getAttribute("aria-pressed") === "false"));
        assert.equal(letterBar.children.filter(button => button.getAttribute("aria-pressed") === "true").length, 1, "Reset leaves one pressed letter button");
        assert.equal(letterBar.children[0].getAttribute("aria-pressed"), "true");
        assert.ok(letterBar.children.slice(1).every(button => button.getAttribute("aria-pressed") === "false"));

        // Test card filter-pill listeners
        const previewCard = grid.children[0];
        const categoryPill = previewCard.querySelector(".lexicon-pill-cat");
        await categoryPill.emit("click", { target: categoryPill });
        assert.ok(grid.children.length > 0, "Category pill must filter to matching cards");
        assert.ok(grid.children.every(card => card.querySelector(".lexicon-pill-cat").dataset.category === words[0].category), "Category pill must apply the card category");
        await clearBtn.emit("click", { target: clearBtn });

        const rootPill = grid.children[0].querySelector(".lexicon-pill-root");
        await rootPill.emit("click", { target: rootPill });
        assert.equal(grid.children.length, 1, "Root pill must filter to the selected root");
        assert.equal(grid.children[0].querySelector(".lexicon-pill-root").dataset.root, words[0].root, "Root pill must apply the card root");
        await clearBtn.emit("click", { target: clearBtn });

        const weightPill = grid.children[0].querySelector(".lexicon-pill-weight");
        await weightPill.emit("click", { target: weightPill });
        assert.ok(grid.children.length > 0, "Weight pill must filter to matching cards");
        assert.ok(grid.children.every(card => card.querySelector(".lexicon-pill-weight").dataset.weight === words[0].weight), "Weight pill must apply the card weight");
        await clearBtn.emit("click", { target: clearBtn });

        // Test Root Letter Bar Click
        const jimLetterBtn = letterBar.children.find(b => b.dataset.letter === "ج");
        assert.ok(jimLetterBtn, "Letter button for 'ج' must exist");
        await jimLetterBtn.emit("click", { target: jimLetterBtn });
        assert.ok(grid.children.length > 0 && grid.children.length < 365, "Clicking 'ج' letter button must filter cards");
        assert.ok(jimLetterBtn.classList.values.has("active"), "Clicked letter button must have 'active' class");
        assert.equal(letterBar.children.filter(button => button.getAttribute("aria-pressed") === "true").length, 1);
        assert.equal(jimLetterBtn.getAttribute("aria-pressed"), "true");
        assert.ok(letterBar.children.filter(button => button !== jimLetterBtn).every(button => button.getAttribute("aria-pressed") === "false"));

        // Test Category Chip Click
        const langChip = catChips.children.find(c => c.dataset.category === "لغة وفصاحة");
        assert.ok(langChip, "Category chip for 'لغة وفصاحة' must exist");
        await langChip.emit("click", { target: langChip });
        assert.ok(grid.children.length <= 31, "Category filter must narrow down results");
        assert.ok(langChip.classList.values.has("active"), "Active category chip must have 'active' class");
        assert.equal(catChips.children.filter(chip => chip.getAttribute("aria-pressed") === "true").length, 1);
        assert.equal(langChip.getAttribute("aria-pressed"), "true");
        assert.ok(catChips.children.filter(chip => chip !== langChip).every(chip => chip.getAttribute("aria-pressed") === "false"));
    } finally {
        global.document = originalDocument;
        global.window = originalWindow;
    }
});

test("5. Lexicon cards render hostile corpus fields as literal text", () => {
    const payload = '<img src=x onerror="alert(1)">';
    const hostileWord = {
        id: payload,
        word: payload,
        pronunciation: payload,
        category: payload,
        root: payload,
        weight: payload,
        meaning: payload
    };
    const sandbox = setupLexiconSandbox([hostileWord]);
    const originalDocument = global.document;
    const originalWindow = global.window;
    global.document = sandbox.documentMock;
    global.window = sandbox.windowMock;

    try {
        WebUI.initLexiconExplorer({
            wordsDb: [hostileWord],
            gridId: "lexicon-grid"
        });

        const card = sandbox.elements["lexicon-grid"].children[0];
        assert.ok(card, "Hostile fixture must still render a card");
        assert.equal(card.className, "lexicon-card", "Cards must retain the lexicon-card class");

        const heading = card.querySelector(".lexicon-card-word");
        const pronunciation = card.querySelector(".lexicon-card-pronunciation");
        const categoryPill = card.querySelector(".lexicon-pill-cat");
        const rootPill = card.querySelector(".lexicon-pill-root");
        const weightPill = card.querySelector(".lexicon-pill-weight");
        const meaning = card.querySelector(".lexicon-card-meaning");
        const audioBtn = card.querySelector(".lexicon-audio-btn");
        const readBtn = card.querySelector(".lexicon-read-btn");

        assert.ok(card.querySelector(".lexicon-card-header"), "Card header must remain present");
        assert.ok(card.querySelector(".lexicon-card-heading-wrap"), "Card heading wrapper must remain present");
        assert.ok(card.querySelector(".lexicon-card-meta"), "Card metadata wrapper must remain present");
        assert.ok(card.querySelector(".lexicon-card-body"), "Card body must remain present");
        assert.ok(card.querySelector(".lexicon-card-footer"), "Card footer must remain present");
        assert.equal(heading.textContent, payload, "Word text must remain literal");
        assert.equal(pronunciation.textContent, payload, "Pronunciation text must remain literal");
        assert.equal(pronunciation.getAttribute("dir"), "ltr", "Pronunciation direction must remain ltr");
        assert.equal(pronunciation.dir, "ltr", "Pronunciation dir property must remain ltr");
        assert.equal(audioBtn.getAttribute("type"), "button", "Audio control type must remain button");
        assert.equal(audioBtn.getAttribute("title"), "استمع إلى النطق", "Audio title must remain present");
        assert.equal(audioBtn.querySelector("svg").getAttribute("aria-hidden"), "true", "Audio icon must remain hidden from assistive technology");
        assert.equal(audioBtn.querySelector("use").getAttribute("href"), "#i-volume-high", "Audio icon reference must remain present");
        assert.equal(categoryPill.textContent, payload, "Category text must remain literal");
        assert.equal(categoryPill.dataset.category, payload, "Category dataset must remain literal");
        assert.equal(categoryPill.getAttribute("data-category"), payload, "Category data attribute must remain literal");
        assert.ok(categoryPill.getAttribute("title").includes(payload), "Category title must preserve literal corpus text");
        assert.equal(rootPill.querySelector("strong").textContent, payload, "Root text must remain literal");
        assert.equal(rootPill.dataset.root, payload, "Root dataset must remain literal");
        assert.equal(rootPill.getAttribute("data-root"), payload, "Root data attribute must remain literal");
        assert.ok(rootPill.getAttribute("title").includes(payload), "Root title must preserve literal corpus text");
        assert.equal(rootPill.querySelector(".pill-kicker").textContent, "الجذر:", "Root pill label must remain present");
        assert.equal(weightPill.querySelector("strong").textContent, payload, "Weight text must remain literal");
        assert.equal(weightPill.dataset.weight, payload, "Weight dataset must remain literal");
        assert.equal(weightPill.getAttribute("data-weight"), payload, "Weight data attribute must remain literal");
        assert.ok(weightPill.getAttribute("title").includes(payload), "Weight title must preserve literal corpus text");
        assert.equal(weightPill.querySelector(".pill-kicker").textContent, "الوزن:", "Weight pill label must remain present");
        assert.equal(meaning.textContent, payload, "Meaning text must remain literal");
        assert.ok(audioBtn.getAttribute("aria-label").includes(payload), "Audio label must preserve literal corpus text");
        assert.equal(card.dataset.wordId, "", "Hostile ids must not enter card datasets");
        assert.equal(card.getAttribute("data-word-id"), "", "Hostile ids must not enter card attributes");
        assert.equal(audioBtn.dataset.wordId, "", "Hostile ids must not enter audio datasets");
        assert.equal(audioBtn.getAttribute("data-word-id"), "", "Hostile ids must not enter audio attributes");
        assert.equal(readBtn.dataset.wordId, "", "Hostile ids must not enter link datasets");
        assert.equal(readBtn.getAttribute("data-word-id"), "", "Hostile ids must not enter link attributes");
        assert.equal(readBtn.getAttribute("href"), "word.html", "Hostile ids must not enter link targets");
        assert.equal(readBtn.href, "word.html", "Hostile ids must not enter link href properties");
        assert.equal(readBtn.querySelector("span").textContent, "اقرأ الكلمة كاملة", "Read-link label must remain present");
        assert.equal(readBtn.querySelector("use").getAttribute("href"), "#i-arrow", "Read-link icon reference must remain present");
        assert.equal(card.querySelector("img"), null, "Corpus markup must not create an IMG payload element");

        const nodes = [];
        const collect = (node) => {
            nodes.push(node);
            node.children.forEach(collect);
        };
        collect(card);
        assert.ok(
            nodes.every(node => [...node.attributes.keys()].every(name => !/^on/i.test(name))),
            "Corpus fields must not create event-handler attributes"
        );
    } finally {
        global.document = originalDocument;
        global.window = originalWindow;
    }
});

test("6. Resilient Web Audio V8 GC Anchoring (R4)", async () => {
    const sandbox = setupLexiconSandbox(words);
    const originalDocument = global.document;
    const originalWindow = global.window;
    global.document = sandbox.documentMock;
    global.window = sandbox.windowMock;

    try {
        const explorer = WebUI.initLexiconExplorer({
            wordsDb: words,
            gridId: "lexicon-grid"
        });
        explorer.setCategoryFilter(words[0].category);

        const grid = sandbox.elements["lexicon-grid"];
        const firstCard = grid.children[0];
        assert.ok(firstCard, "First card must exist");

        const audioBtn = firstCard.querySelector(".lexicon-audio-btn");
        assert.ok(audioBtn, "Card audio button must exist");

        // Click to trigger pronunciation
        await audioBtn.emit("click", { target: audioBtn, stopPropagation() {} });

        const activeUtt = sandbox.windowMock._activeUtterance;
        assert.notEqual(activeUtt, null, "SpeechSynthesisUtterance must be anchored to window._activeUtterance");
        assert.equal(activeUtt.lang, "ar-SA", "Utterance language must be ar-SA");
        assert.equal(audioBtn.classList.values.has("speaking"), true, "Audio button must have 'speaking' class during playback");

        // Complete speech
        activeUtt.onend();
        assert.equal(sandbox.windowMock._activeUtterance, null, "window._activeUtterance must be cleaned up on onend");
        assert.equal(audioBtn.classList.values.has("speaking"), false, "Audio button must remove 'speaking' class on completion");

        // Error handling
        await audioBtn.emit("click", { target: audioBtn, stopPropagation() {} });
        const errUtt = sandbox.windowMock._activeUtterance;
        assert.notEqual(errUtt, null);
        errUtt.onerror();
        assert.equal(sandbox.windowMock._activeUtterance, null, "window._activeUtterance must be cleaned up on onerror");
    } finally {
        global.document = originalDocument;
        global.window = originalWindow;
    }
});

test("7. Tashkeel Typography & CSS Design Tokens Compliance", () => {
    const styleCss = fs.readFileSync("style.css", "utf8");
    const indexHtml = fs.readFileSync("index.html", "utf8");
    const wordHtml = fs.readFileSync("word.html", "utf8");

    // 6.1 Strict Arabic Typography: Normal Letter Spacing
    assert.ok(styleCss.includes(".lexicon-card-word"), "style.css must contain .lexicon-card-word");
    assert.ok(styleCss.includes("letter-spacing: normal"), "Arabic elements must enforce letter-spacing: normal");
    assert.ok(styleCss.includes("line-height: 1.35") || styleCss.includes("line-height: 1.4"), "Arabic cards must have adequate line-height for stacked tashkeel");

    // 6.2 HTML Markup
    assert.ok(indexHtml.includes('id="lexicon-grid"'), "index.html must include lexicon-grid");
    assert.ok(indexHtml.includes('id="lexicon-explorer"'), "index.html must own the lexicon explorer");
    assert.match(indexHtml, /id="btn-toggle-menu"[^>]*aria-expanded="false"[^>]*aria-controls="app-menu-dropdown"/, "Homepage menu trigger must expose disclosure state and controls");
    assert.match(indexHtml, /class="app-menu-dropdown home-menu-dropdown"[^>]*id="app-menu-dropdown"[^>]*hidden/, "Homepage controls must live in a hidden disclosure panel");
    const navActions = indexHtml.match(/<div class="nav-actions">([\s\S]*?)<\/div>/)?.[1] || "";
    assert.equal((navActions.match(/class="nav-word-link"/g) || []).length, 1, "Only the word-of-day link may remain visible in the homepage nav actions");
    assert.equal(navActions.includes("nav-explorer-link"), false, "Explorer link must move into the homepage disclosure");
    assert.equal((indexHtml.match(/class="accordion-teaser"/g) || []).length, 3, "Each landing-page method card must include a concise teaser");
    assert.match(styleCss, /\.home-menu-dropdown,\s*\.word-menu-dropdown\s*\{[^}]*left:\s*max\([^}]*right:\s*auto/s, "Homepage menu must anchor from the left side");
    assert.equal(wordHtml.includes('id="lexicon-dialog"'), false, "word.html must not ship a dead duplicate lexicon dialog");
    assert.equal(wordHtml.includes('id="btn-toggle-explorer"'), false, "word.html must not advertise an unbound explorer trigger");
});
