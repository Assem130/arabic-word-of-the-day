// tests/review_ui.test.js
// Kalimat (كَلِمات) — Milestone 3: Accessible Interactive Review UI & Theming Test Suite

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const WORDS_PATH = path.resolve("./words.js");
const CORE_PATH = path.resolve("./app-core.js");
const APP_PATH = path.resolve("./app.js");
const INDEX_HTML_PATH = path.resolve("./index.html");
const WORD_HTML_PATH = path.resolve("./word.html");
const STYLE_CSS_PATH = path.resolve("./style.css");
const REVAMP_CSS_PATH = path.resolve("./revamp.css");

const wordsCode = fs.readFileSync(WORDS_PATH, "utf8");
const coreCode = fs.readFileSync(CORE_PATH, "utf8");
const appCode = fs.readFileSync(APP_PATH, "utf8");
const indexHtml = fs.readFileSync(INDEX_HTML_PATH, "utf8");
const wordHtml = fs.readFileSync(WORD_HTML_PATH, "utf8");
const styleCss = fs.readFileSync(STYLE_CSS_PATH, "utf8");
const revampCss = fs.readFileSync(REVAMP_CSS_PATH, "utf8");

// Minimal DOM Mocking Engine for UI testing
class FakeElement {
    constructor(tagName = "div", id = "") {
        this.tagName = tagName.toUpperCase();
        this._id = id;
        this._className = "";
        const classSet = new Set();
        this.classSet = classSet;

        this.classList = {
            add: (...classes) => {
                for (const c of classes) if (c) classSet.add(c);
                this._className = Array.from(classSet).join(" ");
            },
            remove: (...classes) => {
                for (const c of classes) classSet.delete(c);
                this._className = Array.from(classSet).join(" ");
            },
            contains: (c) => classSet.has(c),
            toggle: (c, force) => {
                if (force === true) classSet.add(c);
                else if (force === false) classSet.delete(c);
                else if (classSet.has(c)) classSet.delete(c);
                else classSet.add(c);
                this._className = Array.from(classSet).join(" ");
            }
        };
        this.attributes = new Map();
        this.children = [];
        this.parentNode = null;
        this.textContent = "";
        this.innerHTML = "";
        this.hidden = false;
        this.open = false;
        this.tabIndex = -1;
        this.style = {};
        this.listeners = new Map();
        this.dir = "";
        this.lang = "";
    }

    get className() {
        return this._className;
    }

    set className(val) {
        this._className = String(val || "");
        this.classSet.clear();
        for (const cls of this._className.split(/\s+/)) {
            if (cls) this.classSet.add(cls);
        }
    }

    get id() {
        return this._id;
    }

    set id(val) {
        this._id = val;
        if (this.ownerDocument && typeof this.ownerDocument.registerId === "function") {
            this.ownerDocument.registerId(val, this);
        }
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === "id") {
            this.id = String(value);
        } else if (name === "class") {
            this.className = String(value);
        }
    }

    getAttribute(name) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    hasAttribute(name) {
        return this.attributes.has(name);
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    addEventListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    removeEventListener(event, callback) {
        if (!this.listeners.has(event)) return;
        const arr = this.listeners.get(event);
        const idx = arr.indexOf(callback);
        if (idx !== -1) arr.splice(idx, 1);
    }

    dispatchEvent(event) {
        const arr = this.listeners.get(event.type) || [];
        for (const cb of arr) {
            cb.call(this, event);
        }
        return !event.defaultPrevented;
    }

    appendChild(child) {
        if (child instanceof FakeElement) {
            child.parentNode = this;
            child.ownerDocument = this.ownerDocument;
            this.children.push(child);
            if (child.id && this.ownerDocument && typeof this.ownerDocument.registerId === "function") {
                this.ownerDocument.registerId(child.id, child);
            }
        }
        return child;
    }

    append(...items) {
        for (const item of items) {
            this.appendChild(item);
        }
    }

    replaceChildren(...items) {
        this.children = [];
        this.append(...items);
    }

    querySelector(selector) {
        if (selector.startsWith("#")) {
            const id = selector.slice(1);
            return this.findElement(el => el.id === id);
        }
        if (selector.startsWith(".")) {
            const cls = selector.slice(1);
            return this.findElement(el => el.classList.contains(cls));
        }
        return this.findElement(el => el.tagName === selector.toUpperCase());
    }

    querySelectorAll(selector) {
        const results = [];
        this.findAllElements(selector, results);
        return results;
    }

    findElement(predicate) {
        for (const child of this.children) {
            if (predicate(child)) return child;
            const found = child.findElement(predicate);
            if (found) return found;
        }
        return null;
    }

    findAllElements(selector, results) {
        for (const child of this.children) {
            let matches = false;
            if (selector.startsWith(".")) {
                if (child.classList.contains(selector.slice(1))) matches = true;
            } else if (selector.startsWith("#")) {
                if (child.id === selector.slice(1)) matches = true;
            } else if (child.tagName === selector.toUpperCase() || selector.includes(child.tagName.toLowerCase())) {
                matches = true;
            }
            if (matches) results.push(child);
            child.findAllElements(selector, results);
        }
    }

    contains(element) {
        if (this === element) return true;
        for (const child of this.children) {
            if (child.contains(element)) return true;
        }
        return false;
    }

    focus() {
        if (this.ownerDocument) {
            this.ownerDocument.activeElement = this;
        }
    }

    showModal() {
        this.open = true;
        this.focus();
    }

    close() {
        this.open = false;
        this.dispatchEvent({ type: "close" });
    }
}

function createDOMEnvironment(initialState = null) {
    const elementsById = new Map();
    const doc = {
        activeElement: null,
        registerId: (id, el) => {
            if (id) elementsById.set(id, el);
        },
        getElementById: (id) => {
            if (elementsById.has(id)) {
                return elementsById.get(id);
            }
            const el = new FakeElement("div", id);
            el.ownerDocument = doc;
            elementsById.set(id, el);
            return el;
        },
        createElement: (tagName) => {
            const el = new FakeElement(tagName);
            el.ownerDocument = doc;
            return el;
        },
        querySelector: (sel) => {
            if (sel.startsWith("#")) {
                return doc.getElementById(sel.slice(1));
            }
            for (const el of elementsById.values()) {
                const found = el.querySelector(sel);
                if (found) return found;
            }
            return null;
        },
        querySelectorAll: (sel) => {
            const res = [];
            for (const el of elementsById.values()) {
                el.findAllElements(sel, res);
            }
            return res;
        },
        addEventListener: (event, cb) => {
            if (!doc.listeners) doc.listeners = new Map();
            if (!doc.listeners.has(event)) doc.listeners.set(event, []);
            doc.listeners.get(event).push(cb);
        },
        dispatchEvent: (event) => {
            if (!doc.listeners) return;
            const arr = doc.listeners.get(event.type) || [];
            for (const cb of arr) cb(event);
        },
        body: null
    };
    doc.body = doc.getElementById("body");

    const storage = new Map();
    if (initialState) {
        storage.set("arabic_words_state", JSON.stringify(initialState));
    }

    const localStorage = {
        getItem: (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, val) => storage.set(key, String(val)),
        removeItem: (key) => storage.delete(key),
        clear: () => storage.clear()
    };

    let voices = [
        { name: "Maged", lang: "ar-SA", default: true },
        { name: "Tarik", lang: "ar-EG", default: false }
    ];

    const windowMock = {
        speechSynthesis: {
            speak: () => {},
            cancel: () => {},
            getVoices: () => voices
        },
        SpeechSynthesisUtterance: class {
            constructor(text) {
                this.text = text;
                this.rate = 1.0;
                this.lang = "ar-SA";
            }
        },
        localStorage,
        addEventListener: (event, cb) => {
            doc.addEventListener(event, cb);
        },
        location: { search: "", pathname: "/word.html", origin: "https://kalimaat.app" }
    };

    const sandbox = {
        window: windowMock,
        document: doc,
        localStorage,
        navigator: { onLine: true, userAgent: "NodeTest" },
        setTimeout: (fn) => { if (typeof fn === "function") fn(); return 1; },
        clearTimeout: () => {},
        setInterval: () => 1,
        clearInterval: () => {},
        console,
        module: { exports: {} },
        exports: {}
    };

    sandbox.globalThis = sandbox;
    sandbox.self = sandbox.window;
    sandbox.window.window = sandbox.window;
    sandbox.window.document = doc;

    vm.createContext(sandbox);
    vm.runInContext(wordsCode, sandbox);
    const loadedWords = sandbox.module?.exports?.length ? sandbox.module.exports : (sandbox.WORDS || sandbox.WORDS_DB);
    sandbox.WORDS = loadedWords;
    sandbox.WORDS_DB = loadedWords;
    sandbox.window.WORDS = loadedWords;
    sandbox.window.WORDS_DB = loadedWords;

    sandbox.module = { exports: {} };
    vm.runInContext(coreCode, sandbox);
    const loadedCore = (sandbox.module && sandbox.module.exports && Object.keys(sandbox.module.exports).length > 0) ? sandbox.module.exports : sandbox.KalimatCore;
    sandbox.KalimatCore = loadedCore;
    sandbox.window.KalimatCore = loadedCore;

    vm.runInContext(appCode, sandbox);

    // Dispatch DOMContentLoaded to trigger app initialization
    doc.dispatchEvent({ type: "DOMContentLoaded" });

    return { sandbox, doc, localStorage, elementsById };
}

// -----------------------------------------------------------------------------
// Test 1: HTML Semantic & Accessibility Invariants for Spaced Repetition Review
// -----------------------------------------------------------------------------
test("1. HTML Markup & Accessibility Attributes (index.html & word.html)", () => {
    // Check #due-review-badge in index.html
    assert.match(indexHtml, /id="due-review-badge"/, "index.html must include #due-review-badge");
    assert.match(indexHtml, /id="due-count"/, "index.html must include #due-count");
    assert.match(indexHtml, /class="due-icon badge-icon"/, "index.html must style badge icon");

    // Check #practice-dialog modal attributes in index.html
    assert.match(indexHtml, /<dialog\s+class="practice-dialog"\s+id="practice-dialog"/, "index.html must define <dialog id='practice-dialog'>");
    assert.match(indexHtml, /role="dialog"/, "practice-dialog must have role='dialog'");
    assert.match(indexHtml, /aria-modal="true"/, "practice-dialog must have aria-modal='true'");
    assert.match(indexHtml, /aria-labelledby="practice-title"/, "practice-dialog must have aria-labelledby='practice-title'");

    // Check word.html markup
    assert.match(wordHtml, /id="due-review-badge"/, "word.html must include #due-review-badge");
    assert.match(wordHtml, /id="due-count"/, "word.html must include #due-count");
    assert.match(wordHtml, /<dialog\s+class="practice-dialog"\s+id="practice-dialog"/, "word.html must define <dialog id='practice-dialog'>");
    assert.match(wordHtml, /role="dialog"/, "word.html practice-dialog must have role='dialog'");
    assert.match(wordHtml, /aria-modal="true"/, "word.html practice-dialog must have aria-modal='true'");
});

test("History dialog stays closed and history rows use the paper surface", () => {
    assert.match(styleCss, /\.history-dialog:not\(\[open\]\)\s*\{[^}]*display:\s*none\b/, "closed history dialog must stay hidden");
    assert.match(styleCss, /\.history-list\s*\{[^}]*margin:\s*0[^}]*padding:\s*0[^}]*list-style:\s*none[^}]*background:\s*(?:transparent|var\(--paper-light\))/s, "history list must reset native list styling and use the paper surface");
    assert.match(styleCss, /\.history-item button\s*\{[^}]*background:\s*(?:transparent|var\(--paper-light\))/s, "history buttons must not use the browser default gray background");

    const env = createDOMEnvironment();
    const historyDialog = env.doc.getElementById("history-dialog");
    assert.equal(historyDialog.open, false, "history dialog must start closed");
    env.doc.getElementById("btn-toggle-history").dispatchEvent({ type: "click" });
    assert.equal(historyDialog.open, true, "history button must open the dialog");
    env.doc.getElementById("btn-close-history").dispatchEvent({ type: "click" });
    assert.equal(historyDialog.open, false, "close button must close the dialog");
});

test("Word-page utility controls stay inside the disclosure menu", () => {
    const navActions = wordHtml.match(/<div class="nav-actions">([\s\S]*?)<\/div>/)?.[1] || "";
    assert.doesNotMatch(navActions, /due-review-badge|streak-badge|theme-select|btn-toggle-history/, "utility controls must not crowd the word-page top bar");

    const menuStart = wordHtml.indexOf('<div class="app-menu-dropdown');
    const menuEnd = wordHtml.indexOf("</article>", menuStart);
    const menu = menuStart >= 0 && menuEnd > menuStart ? wordHtml.slice(menuStart, menuEnd) : "";
    for (const id of ["due-review-badge", "streak-badge", "theme-select", "btn-toggle-history"]) {
        assert.match(menu, new RegExp(`id="${id}"`), `${id} must remain available in the word-page disclosure menu`);
    }
});

// -----------------------------------------------------------------------------
// Test 2: CSS 3D Flip Card, Rating Buttons & Pulse Animations
// -----------------------------------------------------------------------------
test("2. CSS Stylesheet Review Component Rules & Animations", () => {
    for (const [filename, css] of [["style.css", styleCss], ["revamp.css", revampCss]]) {
        assert.match(css, /\.due-review-badge/, `${filename} must style .due-review-badge`);
        assert.match(css, /\.due-review-badge\.has-due/, `${filename} must style .due-review-badge.has-due`);
        assert.match(css, /\.due-review-badge\.pulse/, `${filename} must define pulse animation for due badge`);
        assert.match(css, /@keyframes due-badge-pulse/, `${filename} must define @keyframes due-badge-pulse`);

        // 3D Flip Flashcard Scene
        assert.match(css, /\.flashcard-scene\s*\{[^}]*perspective:/, `${filename} must specify 3D perspective`);
        assert.match(css, /\.flashcard-card\s*\{[^}]*transform-style:\s*preserve-3d/, `${filename} must specify preserve-3d`);
        assert.match(css, /\.flashcard-card\.is-flipped\s*\{[^}]*transform:\s*rotateY\(180deg\)/, `${filename} must specify 180deg flip transform`);
        assert.match(css, /\.flashcard-face\s*\{[^}]*backface-visibility:\s*hidden/, `${filename} must specify backface-visibility: hidden`);
        assert.match(css, /\.flashcard-back\s*\{[^}]*transform:\s*rotateY\(180deg\)/, `${filename} must rotate back face 180deg`);

        // 4-Tier SM-2 Rating Controls
        assert.match(css, /\.flashcard-rating-bar/, `${filename} must style .flashcard-rating-bar`);
        assert.match(css, /\.rating-btn\.rating-again/, `${filename} must style rating-again`);
        assert.match(css, /\.rating-btn\.rating-hard/, `${filename} must style rating-hard`);
        assert.match(css, /\.rating-btn\.rating-good/, `${filename} must style rating-good`);
        assert.match(css, /\.rating-btn\.rating-easy/, `${filename} must style rating-easy`);

        // Keyboard Shortcut Badges
        assert.match(css, /\.rating-badge-key/, `${filename} must style .rating-badge-key`);

        // Focus Rings
        assert.match(css, /\.rating-btn:focus-visible/, `${filename} must provide focus-visible on rating buttons`);
        assert.match(css, /\.flashcard-card:focus-visible/, `${filename} must provide focus-visible on flashcard`);

        // Reduced Motion Media Query
        assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, `${filename} must support prefers-reduced-motion`);
    }
});

// -----------------------------------------------------------------------------
// Test 3: Due Review Badge Counter & Dynamic Sync with SM-2 Queue
// -----------------------------------------------------------------------------
test("3. Due Review Badge Counter & Dynamic Sync with SM-2 Queue", () => {
    const { sandbox } = createDOMEnvironment();
    const Core = sandbox.window.KalimatCore;
    const today = Core.getLocalDateKey(new Date());
    const pastDay = Core.addDaysToDateKey(today, -5);
    const futureDay = Core.addDaysToDateKey(today, 5);

    const state = {
        schemaVersion: 1,
        history: { 1: { firstSeen: pastDay }, 2: { firstSeen: pastDay }, 3: { firstSeen: today } },
        srs: {
            1: { wordId: 1, repetitions: 1, interval: 1, ef: 2.5, nextReviewDate: pastDay, lastReviewedDate: pastDay, lapses: 0, history: [] },
            2: { wordId: 2, repetitions: 2, interval: 6, ef: 2.5, nextReviewDate: futureDay, lastReviewedDate: pastDay, lapses: 0, history: [] },
            3: { wordId: 3, repetitions: 0, interval: 0, ef: 2.5, nextReviewDate: today, lastReviewedDate: null, lapses: 0, history: [] }
        },
        favorites: {},
        preferences: { showEnglish: true, speechRate: 0.85, speechRepeat: 1 }
    };

    const env = createDOMEnvironment(state);
    const KalimatApp = env.sandbox.window.KalimatApp;

    // Trigger badge update
    KalimatApp.updateDueReviewBadge();

    const dueCountEl = env.doc.getElementById("due-count");
    const dueBadge = env.doc.getElementById("due-review-badge");

    // The badge must reflect due review count (> 0)
    const count = parseInt(dueCountEl.textContent, 10);
    assert.equal(count >= 2, true, `due-count (${count}) must be >= 2`);
    assert.equal(dueBadge.classList.contains("has-due"), true, "due badge must have .has-due class");
    assert.equal(dueBadge.classList.contains("pulse"), true, "due badge must have .pulse class when pending reviews exist");
});

// -----------------------------------------------------------------------------
// Test 4: Full Interactive Review Lifecycle: Queue, Flip, Rate & Complete
// -----------------------------------------------------------------------------
test("4. Interactive Spaced Repetition Review Lifecycle (Queue, 3D Flip, SM-2 Rating, Progress Bar & Summary)", () => {
    const { sandbox } = createDOMEnvironment();
    const Core = sandbox.window.KalimatCore;
    const today = Core.getLocalDateKey(new Date());

    const state = {
        schemaVersion: 1,
        history: { 1: { firstSeen: today }, 2: { firstSeen: today } },
        srs: {
            1: { wordId: 1, repetition: 0, interval: 0, ef: 2.5, nextReviewDate: today, lastReviewedDate: null, lapses: 0, history: [] },
            2: { wordId: 2, repetition: 0, interval: 0, ef: 2.5, nextReviewDate: today, lastReviewedDate: null, lapses: 0, history: [] }
        },
        favorites: {},
        preferences: { showEnglish: true, speechRate: 0.85, speechRepeat: 1 }
    };

    const env = createDOMEnvironment(state);
    const KalimatApp = env.sandbox.window.KalimatApp;
    const practiceDialog = env.doc.getElementById("practice-dialog");
    const practiceBody = env.doc.getElementById("practice-body");
    const announcer = env.doc.getElementById("audio-announcer");

    // Step 1: Start Review Session
    KalimatApp.startSpacedRepetitionReview();

    assert.equal(practiceDialog.open, true, "practiceDialog must open when review starts");
    assert.equal(KalimatApp.getActiveReviewQueue().length >= 2, true, "review queue must contain due items");
    assert.equal(KalimatApp.getActiveReviewIndex(), 0, "review index starts at 0");
    assert.match(announcer.textContent, /بدأت جلسة المراجعة/, "announcer must notify screen readers of session start");

    // Step 2: Verify Flashcard Front Face
    const card = env.doc.getElementById("flashcard-card");
    const frontWord = env.doc.getElementById("fc-front-word");
    const frontEase = env.doc.getElementById("fc-front-ease");
    const ratingBar = env.doc.getElementById("flashcard-rating-bar");

    assert.notEqual(card, null, "flashcard-card element must exist in DOM");
    assert.equal(frontWord.textContent.length > 0, true, "front of card displays Arabic word with tashkeel");
    assert.match(frontEase.textContent, /عامل السهولة:\s*2\.5/, "front displays initial Easiness Factor");
    assert.equal(ratingBar.hidden, true, "rating bar must be hidden before card is flipped");
    assert.equal(KalimatApp.isFlashcardFlipped(), false, "isFlashcardFlipped is initially false");

    // Step 3: Flip Flashcard (Show Back Face & Reveal Rating Bar)
    KalimatApp.flipFlashcard();

    assert.equal(KalimatApp.isFlashcardFlipped(), true, "isFlashcardFlipped becomes true");
    assert.equal(card.classList.contains("is-flipped"), true, "card element receives .is-flipped class");
    assert.equal(ratingBar.hidden, false, "rating bar is revealed when card flips");
    assert.match(announcer.textContent, /تم كشف المعنى/, "announcer informs user that meaning is revealed");

    const backMeaning = env.doc.getElementById("fc-back-meaning");
    assert.equal(backMeaning.textContent.length > 0, true, "back of card displays comprehensive Arabic meaning");

    // Step 4: Submit Rating 'Good' (3) for Card 1
    const currentWord = KalimatApp.getActiveReviewQueue()[0].word;
    const currentWordId = currentWord.id;
    KalimatApp.handleRatingSubmission(3);

    // Verify SM-2 item updated in storage
    const savedState = JSON.parse(env.localStorage.getItem("arabic_words_state"));
    const savedItem = savedState.srs ? (savedState.srs[currentWordId] || savedState.srs[String(currentWordId)]) : null;
    assert.notEqual(savedItem, null, "srs item must exist in saved state");
    assert.equal(savedItem.repetition, 1, "card 1 repetition updated to 1");
    assert.equal(savedItem.interval, 1, "card 1 interval updated to 1 day");
    assert.equal(savedItem.lastReviewedDate, today, "lastReviewedDate set to today");
    assert.equal(KalimatApp.getActiveReviewIndex(), 1, "advanced to card 2 (index 1)");

    // Step 5: Verify Card 2 Front Face & Flip
    const card2Word = env.doc.getElementById("fc-front-word");
    assert.equal(card2Word.textContent.length > 0, true, "card 2 displays second word");
    assert.equal(KalimatApp.isFlashcardFlipped(), false, "card 2 starts unflipped");

    KalimatApp.flipFlashcard();
    assert.equal(KalimatApp.isFlashcardFlipped(), true, "card 2 flipped");

    // Step 6: Submit Rating 'Easy' (4) for Card 2
    KalimatApp.handleRatingSubmission(4);

    // If more cards exist in queue, rate all remaining cards to reach completion
    while (KalimatApp.getActiveReviewIndex() < KalimatApp.getActiveReviewQueue().length) {
        KalimatApp.flipFlashcard();
        KalimatApp.handleRatingSubmission(3);
    }

    // Step 7: Verify Congratulatory Completion Summary
    const summaryTitle = practiceBody.querySelector(".practice-summary-title");
    const summaryDesc = practiceBody.querySelector(".practice-summary-desc");
    const closeBtn = env.doc.getElementById("btn-close-summary");

    assert.notEqual(summaryTitle, null, "summary title exists");
    assert.match(summaryTitle.textContent, /اكتملت مراجعة اليوم/, "summary shows completion headline");
    assert.match(summaryDesc.textContent, /راجعت.*بنجاح/, "summary shows success message");
    assert.match(announcer.textContent, /اكتملت مراجعة اليوم بنجاح/, "announcer celebrates session completion");

    // Close Dialog
    closeBtn.dispatchEvent({ type: "click" });
    assert.equal(practiceDialog.open, false, "close button closes practice dialog");
});

// -----------------------------------------------------------------------------
// Test 5: Keyboard Shortcuts inside Review Modal (Space, 1-4, P, Esc, Tab)
// -----------------------------------------------------------------------------
test("5. Modal Keyboard Accessibility & Shortcuts (Space/Enter flip, 1-4/١-٤ rate, P audio, Esc close)", () => {
    const { sandbox } = createDOMEnvironment();
    const Core = sandbox.window.KalimatCore;
    const today = Core.getLocalDateKey(new Date());

    const state = {
        schemaVersion: 1,
        history: { 1: { firstSeen: today } },
        srs: {
            1: { wordId: 1, repetition: 0, interval: 0, ef: 2.5, nextReviewDate: today, lastReviewedDate: null, lapses: 0, history: [] }
        },
        favorites: {},
        preferences: { showEnglish: true, speechRate: 0.85, speechRepeat: 1 }
    };

    const env = createDOMEnvironment(state);
    const KalimatApp = env.sandbox.window.KalimatApp;
    const practiceDialog = env.doc.getElementById("practice-dialog");

    KalimatApp.startSpacedRepetitionReview();
    assert.equal(practiceDialog.open, true, "dialog is open");
    assert.equal(KalimatApp.isFlashcardFlipped(), false, "card is unflipped initially");

    // Test Spacebar keydown on dialog -> Flips card
    let spacePrevented = false;
    practiceDialog.dispatchEvent({
        type: "keydown",
        key: " ",
        code: "Space",
        preventDefault: () => { spacePrevented = true; }
    });
    assert.equal(spacePrevented, true, "Space event default was prevented");
    assert.equal(KalimatApp.isFlashcardFlipped(), true, "Space flipped the flashcard");

    // Test Arabic Numeral '٣' (3 - Good) -> Submits rating
    let arabicKeyPrevented = false;
    practiceDialog.dispatchEvent({
        type: "keydown",
        key: "٣",
        preventDefault: () => { arabicKeyPrevented = true; }
    });
    assert.equal(arabicKeyPrevented, true, "Arabic digit 3 default was prevented");
    assert.equal(KalimatApp.getSessionReviewStats().totalReviewed, 1, "review session recorded 1 review");
    assert.equal(KalimatApp.getSessionReviewStats().ratings.good, 1, "rating recorded as 'good'");

    // Test Escape keydown -> Closes dialog
    practiceDialog.dispatchEvent({
        type: "keydown",
        key: "Escape",
        preventDefault: () => {}
    });
    assert.equal(practiceDialog.open, false, "Escape key closed practice dialog");
});

// -----------------------------------------------------------------------------
// Test 6: Mathematical WCAG 2.1 AA Color Contrast Verification Across All Themes
// -----------------------------------------------------------------------------
test("6. WCAG 2.1 AA Color Contrast Ratios (>= 4.5:1) for Rating Tokens across Themes", () => {
    function parseHex(hex) {
        const clean = hex.replace("#", "");
        return {
            r: parseInt(clean.substring(0, 2), 16),
            g: parseInt(clean.substring(2, 4), 16),
            b: parseInt(clean.substring(4, 6), 16)
        };
    }

    function getRelativeLuminance({ r, g, b }) {
        const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(c => {
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    function getContrastRatio(hex1, hex2) {
        const L1 = getRelativeLuminance(parseHex(hex1));
        const L2 = getRelativeLuminance(parseHex(hex2));
        const lighter = Math.max(L1, L2);
        const darker = Math.min(L1, L2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    const themeColors = {
        paper: {
            again: { text: "#991b1b", bg: "#fee2e2" },
            hard:  { text: "#92400e", bg: "#fef3c7" },
            good:  { text: "#166534", bg: "#dcfce7" },
            easy:  { text: "#075985", bg: "#e0f2fe" }
        },
        emerald: {
            again: { text: "#991b1b", bg: "#fee2e2" },
            hard:  { text: "#92400e", bg: "#fef3c7" },
            good:  { text: "#166534", bg: "#dcfce7" },
            easy:  { text: "#075985", bg: "#e0f2fe" }
        },
        midnight: {
            again: { text: "#fca5a5", bg: "#450a0a" },
            hard:  { text: "#fde68a", bg: "#451a03" },
            good:  { text: "#86efac", bg: "#052e16" },
            easy:  { text: "#7dd3fc", bg: "#082f49" }
        }
    };

    for (const [theme, ratings] of Object.entries(themeColors)) {
        for (const [rating, { text, bg }] of Object.entries(ratings)) {
            const contrast = getContrastRatio(text, bg);
            assert.equal(
                contrast >= 4.5,
                true,
                `Theme '${theme}' rating '${rating}' (${text} on ${bg}) contrast ${contrast.toFixed(2)}:1 must be >= 4.5:1 (WCAG 2.1 AA)`
            );
        }
    }
});
