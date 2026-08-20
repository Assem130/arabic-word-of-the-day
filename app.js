// ponytail: words.js and app-core.js load before this script.
const Core = window.KalimatCore;
const STORAGE_KEY = "arabic_words_state";
const VALID_WORD_IDS = new Set(WORDS_DB.map(word => word.id));
let appState = Core.createDefaultState();
let currentWord = null;
let activeDateKey = "";
let activeArchiveDateKey = "";
let persistenceBlocked = false;
const MAX_BACKUP_BYTES = 1024 * 1024;

const elMainWord = document.getElementById("main-word");
const elDateDisplay = document.getElementById("date-display");
const elDateLabel = document.getElementById("date-label");
const elVocalization = document.getElementById("word-vocalization");
const elWeight = document.getElementById("word-weight");
const elRoot = document.getElementById("word-root");
const elCategory = document.getElementById("word-category");
const elMeaning = document.getElementById("word-meaning");
const elWordContext = document.getElementById("word-context-text");
const elWordContextEnglish = document.getElementById("word-context-en");
const elExampleText = document.getElementById("word-example-text");
const elCountdownTimer = document.getElementById("countdown-timer");
const btnSpeak = document.getElementById("btn-speak");
const btnSpeakExample = document.getElementById("btn-speak-example");
const btnCopyQuote = document.getElementById("btn-copy-quote");
const btnFavorite = document.getElementById("btn-favorite");
const btnAudioSpeed = document.getElementById("btn-audio-speed");
const btnAudioRepeat = document.getElementById("btn-audio-repeat");
const btnShare = document.getElementById("btn-share");
const btnCopyLink = document.getElementById("btn-copy-link");
const btnToggleHistory = document.getElementById("btn-toggle-history");
const btnCloseHistory = document.getElementById("btn-close-history");
const btnToggleMenu = document.getElementById("btn-toggle-menu");
const btnToggleEnglish = document.getElementById("btn-toggle-english");
const btnExportHistory = document.getElementById("btn-export-history");
const btnImportHistory = document.getElementById("btn-import-history");
const btnClearLearningData = document.getElementById("btn-clear-learning-data");
const inputImportHistory = document.getElementById("input-import-history");
const inputSearchHistory = document.getElementById("input-search-history");
const relatedWordsSection = document.getElementById("related-words-section");
const relatedWordsContainer = document.getElementById("related-words-container");
const historyDialog = document.getElementById("history-dialog");
const listHistory = document.getElementById("history-list");
const countHistoryBadge = document.getElementById("history-count");
const countHistoryAll = document.getElementById("count-history-all");
const countHistoryFavs = document.getElementById("count-history-favs");
const tabHistoryAll = document.getElementById("tab-history-all");
const tabHistoryFavs = document.getElementById("tab-history-favs");
const drawerEmptyMsg = document.getElementById("drawer-empty-msg");
const dropdownMenu = document.getElementById("app-menu-dropdown");
const toast = document.getElementById("toast");
const audioAnnouncer = document.getElementById("audio-announcer");
const archivePreviewNote = document.getElementById("archive-preview-note");
const btnReturnToday = document.getElementById("btn-return-today");
const streakBadge = document.getElementById("streak-badge");
const dueReviewBadge = document.getElementById("due-review-badge");
const dueCountEl = document.getElementById("due-count");
const btnInlineReview = document.getElementById("btn-inline-review");
const inlineReviewCount = document.getElementById("inline-review-count");
const btnExportCard = document.getElementById("btn-export-card");
const btnExportAnki = document.getElementById("btn-export-anki");
const practiceDialog = document.getElementById("practice-dialog");
const practiceBody = document.getElementById("practice-body");
const btnStartPractice = document.getElementById("btn-start-practice");
const btnMenuPractice = document.getElementById("btn-menu-practice");
const btnClosePractice = document.getElementById("btn-close-practice");
const shortcutsDialog = document.getElementById("shortcuts-dialog");
const btnMenuShortcuts = document.getElementById("btn-menu-shortcuts");
const btnCloseShortcuts = document.getElementById("btn-close-shortcuts");

let currentHistoryFilter = "all";
let searchHistoryQuery = "";

let practiceDialogInvoker = null;
let historyDialogInvoker = null;
let shortcutsDialogInvoker = null;
let activeReviewQueue = [];
let activeReviewIndex = 0;
let isFlashcardFlipped = false;
let activeReviewDueCount = 0;
let activeReviewRemainingCount = 0;
let sessionReviewStats = { totalReviewed: 0, ratings: { again: 0, hard: 0, good: 0, easy: 0 } };

function toArabicDigits(value) {
    return String(value ?? "").replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[digit]);
}

function formatReviewCount(count) {
    const value = Math.max(0, Number(count) || 0);
    if (value === 1) return "مراجعة واحدة";
    if (value === 2) return "مراجعتين";
    if (value >= 3 && value <= 10) return `${toArabicDigits(value)} مراجعات`;
    return `${toArabicDigits(value)} مراجعة`;
}

document.addEventListener("DOMContentLoaded", () => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./sw.js").catch(() => {});
        });
    }
    const themeFn = window.KalimatWebUI?.setupThemeController;
    if (typeof themeFn === "function") themeFn();
    loadState();
    activeDateKey = Core.getLocalDateKey(new Date());

    const search = (typeof window !== "undefined" && window.location) ? window.location.search : "";
    const queryId = Core.parseWordIdFromQuery(search, WORDS_DB.length);
    const queryDateKey = parseArchiveDateKey(search);
    if (queryId !== null) {
        const foundWord = WORDS_DB.find(item => item.id === queryId);
        if (foundWord) {
            const todayWord = determineTodayWord();
            const historyDateKey = appState.history[foundWord.id]?.firstSeen;
            const archiveDateKey = queryDateKey || historyDateKey || activeDateKey;
            if (foundWord.id === todayWord.id && !queryDateKey) {
                renderTodayWord();
            } else {
                if (!appState.history[foundWord.id]) {
                    appState.history[foundWord.id] = { firstSeen: archiveDateKey };
                    saveState();
                }
                renderWord(foundWord, archiveDateKey);
                if (archivePreviewNote) archivePreviewNote.hidden = false;
                if (btnReturnToday) btnReturnToday.hidden = false;
            }
        } else {
            renderTodayWord();
        }
    } else {
        renderTodayWord();
    }

    setupSpeech();
    setupEventListeners();
    setupKeyboardShortcuts();
    startCountdown();
    updateStreakUI();
    updateDueReviewBadge();

    let action = null;
    try {
        if (typeof URLSearchParams !== "undefined") {
            action = new URLSearchParams(search).get("action");
        } else if (typeof window !== "undefined" && window.URLSearchParams) {
            action = new window.URLSearchParams(search).get("action");
        } else if (typeof search === "string") {
            const match = search.match(/(?:^|[?&])action=([^&]*)/);
            action = match ? decodeURIComponent(match[1]) : null;
        }
    } catch (_) {}

    if (action === "practice") {
        setTimeout(startSpacedRepetitionReview, 0);
    }
});

function loadState() {
    const fallbackDate = Core ? Core.getLocalDateKey(new Date()) : "";
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        const stored = Core.inspectStoredState(raw, VALID_WORD_IDS, fallbackDate);
        appState = stored.state;
        persistenceBlocked = !stored.canPersist;
        if (persistenceBlocked) document.getElementById("storage-warning").hidden = false;
        else saveState();
    } catch {
        appState = (Core && typeof Core.createDefaultState === "function") ? Core.createDefaultState() : { version: 2, schemaVersion: 2, srs: {}, history: {}, favorites: {}, preferences: {} };
        persistenceBlocked = true;
        document.getElementById("storage-warning").hidden = false;
    }
}

function saveState() {
    if (persistenceBlocked) return false;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        return true;
    } catch {
        document.getElementById("storage-warning").hidden = false;
        return false;
    }
}

function determineTodayWord(now = new Date()) {
    const dateKey = Core.getLocalDateKey(now);
    const word = WORDS_DB[Core.getDailyWordIndex(dateKey, WORDS_DB.length)];
    if (!appState.history) appState.history = {};
    if (!appState.history[word.id]) appState.history[word.id] = { firstSeen: dateKey };
    if (!appState.srs) appState.srs = {};
    if (!appState.srs[word.id] && Core && typeof Core.createDefaultSrsItem === "function") {
        appState.srs[word.id] = Core.createDefaultSrsItem(word.id, dateKey);
    }
    saveState();
    return word;
}

function renderTodayWord() {
    renderWord(determineTodayWord(), null);
}

function renderWord(word, archiveDateKey) {
    stopSpeech();

    currentWord = word;
    activeArchiveDateKey = isValidDateKey(archiveDateKey) ? archiveDateKey : "";
    elMainWord.textContent = word.word;
    elMainWord.setAttribute("aria-label", word.word + (word.vocalization ? " - " + word.vocalization : ""));
    elVocalization.textContent = word.vocalization;
    elWeight.textContent = word.weight;
    elRoot.textContent = word.root;
    elCategory.textContent = word.category;
    document.getElementById("word-pronunciation").textContent = word.pronunciation;
    elMeaning.textContent = word.meaning;
    elWordContext.textContent = word.context || "";
    elWordContextEnglish.textContent = word.contextEnglish || "";
    const showEnglish = Boolean(appState.preferences.showEnglish);
    const english = document.getElementById("word-meaning-en");
    english.textContent = word.englishMeaning;
    english.hidden = !showEnglish;
    elWordContextEnglish.hidden = !showEnglish;
    btnToggleEnglish.setAttribute("aria-pressed", String(showEnglish));
    btnToggleEnglish.textContent = showEnglish ? "إخفاء الإنجليزية" : "إظهار الإنجليزية";

    renderExample(word);
    updateFavoriteButton(word);
    renderRelatedWords(word);
    updateAudioControlsUI();

    const isArchivePreview = Boolean(activeArchiveDateKey);
    const displayDate = isArchivePreview ? getArabicDateFromKey(activeArchiveDateKey) : getFormattedArabicDate(new Date());
    if (elDateLabel) elDateLabel.textContent = isArchivePreview ? "التاريخ" : "اليوم";
    elDateDisplay.textContent = displayDate;
    archivePreviewNote.hidden = !isArchivePreview;
    if (isArchivePreview) archivePreviewNote.textContent = `أنت تستعرض كلمة من مخزونك بتاريخ ${displayDate}، وليست كلمة اليوم.`;
    btnReturnToday.hidden = !isArchivePreview;
    updateHistoryUI();
    updateStreakUI();
    updateDueReviewBadge();
}

function renderRelatedWords(word) {
    if (!relatedWordsSection || !relatedWordsContainer || !word) return;
    const { sameRoot, sameWeight } = Core.findRelatedWords(word, WORDS_DB);
    const combined = [];

    sameRoot.forEach(w => combined.push({ word: w, relation: "نفس الجذر" }));
    sameWeight.forEach(w => {
        if (!combined.some(item => item.word.id === w.id)) {
            combined.push({ word: w, relation: "نفس الوزن" });
        }
    });

    if (combined.length === 0) {
        relatedWordsSection.hidden = true;
        relatedWordsContainer.replaceChildren();
        return;
    }

    relatedWordsSection.hidden = false;
    relatedWordsContainer.replaceChildren();

    combined.slice(0, 6).forEach(({ word: relWord, relation }) => {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "related-word-pill";
        pill.innerHTML = `<span>${relWord.word}</span> <span class="related-word-badge">(${relation})</span>`;
        pill.title = `استعرض «${relWord.word}» (${relWord.meaning})`;
        pill.addEventListener("click", () => {
            if (!appState.history[relWord.id]) {
                appState.history[relWord.id] = { firstSeen: activeDateKey || Core.getLocalDateKey(new Date()) };
                saveState();
            }
            renderWord(relWord, activeArchiveDateKey || appState.history[relWord.id]?.firstSeen || activeDateKey);
            showToast(`استعراض كلمة «${relWord.word}» من المعجم`);
        });
        relatedWordsContainer.appendChild(pill);
    });
}

function updateAudioControlsUI() {
    if (btnAudioSpeed) {
        const rate = appState.preferences.speechRate || 0.85;
        btnAudioSpeed.textContent = `${rate}x`;
        btnAudioSpeed.setAttribute("aria-label", `سرعة النطق: ${rate}x`);
        btnAudioSpeed.title = `تغيير سرعة النطق (الحالية: ${rate}x)`;
    }
    if (btnAudioRepeat) {
        const rep = appState.preferences.speechRepeat || 1;
        btnAudioRepeat.textContent = `تكرار x${rep}`;
        btnAudioRepeat.classList.toggle("active", rep > 1);
        btnAudioRepeat.setAttribute("aria-pressed", String(rep > 1));
        btnAudioRepeat.setAttribute("aria-label", rep > 1 ? "تكرار النطق ٣ مرات مفعل" : "تكرار النطق مرة واحدة");
        btnAudioRepeat.title = rep > 1 ? "تكرار النطق للحفظ (مفعل ٣ مرات)" : "تكرار النطق للحفظ (مرة واحدة)";
    }
}

function renderExample(word) {
    const cleanWord = word.word.replace(/[\u064B-\u065F]/g, "");
    const pattern = new RegExp(cleanWord.split("").join("[\\u064B-\\u065F]*"), "g");
    const highlighted = word.example.replace(pattern, match => `<span class="highlight-word">${match}</span>`);
    const parts = highlighted.split(" — ");
    elExampleText.innerHTML = parts.length > 1
        ? `«${parts[0]}» <cite>— ${parts[1]}</cite>`
        : `«${highlighted}»`;
}

function updateFavoriteButton(word) {
    if (!btnFavorite || !word) return;
    const isFav = Boolean(appState.favorites && appState.favorites[word.id]);
    btnFavorite.setAttribute("aria-pressed", String(isFav));
    btnFavorite.classList.toggle("active", isFav);
    btnFavorite.title = isFav ? "إزالة من المفضلة (F)" : "إضافة إلى المفضلة (F)";
    btnFavorite.setAttribute("aria-label", isFav ? "إزالة من المفضلة" : "إضافة إلى المفضلة");
    const icon = isFav ? "i-star-filled" : "i-star";
    btnFavorite.querySelector("use")?.setAttribute("href", `#${icon}`);
}

function toggleFavorite() {
    if (!currentWord) return;
    if (!appState.favorites) appState.favorites = {};
    const isFav = Boolean(appState.favorites[currentWord.id]);
    if (isFav) {
        delete appState.favorites[currentWord.id];
        showToast("تمت الإزالة من المفضلة.");
    } else {
        appState.favorites[currentWord.id] = true;
        showToast("تمت الإضافة إلى المفضلة ⭐");
    }
    saveState();
    updateFavoriteButton(currentWord);
    updateHistoryUI();
}

function getFormattedArabicDate(date) {
    return date.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function isValidDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseArchiveDateKey(search) {
    let raw = "";
    try {
        if (typeof URLSearchParams !== "undefined") {
            raw = new URLSearchParams(search || "").get("date") || "";
        } else {
            const match = String(search || "").match(/(?:^|[?&])date=(\d{4}-\d{2}-\d{2})(?:&|$)/);
            raw = match ? match[1] : "";
        }
    } catch {}
    return isValidDateKey(raw) ? raw : "";
}

function getArabicDateFromKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return getFormattedArabicDate(new Date(year, month - 1, day));
}

function updateStreakUI() {
    const badge = streakBadge || (typeof document !== "undefined" && document.getElementById ? document.getElementById("streak-badge") : null);
    if (!badge || !Core) return;
    const today = activeDateKey || (Core.getLocalDateKey ? Core.getLocalDateKey(new Date()) : "");
    const streakResult = Core.calculateStreak(appState.history || {}, today);
    const count = typeof streakResult === "object" ? streakResult.currentStreak : Number(streakResult);
    if (count <= 0) {
        badge.textContent = "🔥 لا يوجد تتابع بعد";
        badge.setAttribute("aria-label", "تتابع القراءة: لا يوجد تتابع بعد");
    } else if (count === 1) {
        badge.textContent = "🔥 يوم واحد";
        badge.setAttribute("aria-label", "تتابع القراءة: يوم واحد");
    } else if (count === 2) {
        badge.textContent = "🔥 يومان متتاليان";
        badge.setAttribute("aria-label", "تتابع القراءة: يومان متتاليان");
    } else if (count >= 3 && count <= 10) {
        badge.textContent = `🔥 ${count} أيام متتالية`;
        badge.setAttribute("aria-label", `تتابع القراءة: ${count} أيام متتالية`);
    } else {
        badge.textContent = `🔥 ${count} يوماً متتالياً`;
        badge.setAttribute("aria-label", `تتابع القراءة: ${count} يوماً متتالياً`);
    }
    badge.title = "تتابع القراءة اليومي";
}

function stopSpeech() {
    const speech = globalThis.KalimatSpeech;
    if (speech && typeof speech.cancel === "function") {
        try { speech.cancel(window.speechSynthesis); } catch {}
    }
    resetAllSpeakButtons();
    document.querySelectorAll?.(".flashcard-audio-btn.speaking").forEach((button) => button.classList.remove("speaking"));
}

const SPEECH_UNAVAILABLE_MSG = "النطق غير متاح على هذا الجهاز. يُرجى استخدام متصفح يدعم النطق الصوتي.";
const NO_ARABIC_VOICE_MSG = "لم يتم العثور على صوت عربي على هذا الجهاز. يُرجى تفعيل أو تثبيت حزمة الصوت العربي من إعدادات النظام للاستماع للنطق.";

function setupSpeech() {
    if (!globalThis.KalimatSpeech?.speak || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function" || typeof window.speechSynthesis.speak !== "function") {
        if (btnSpeak) {
            btnSpeak.disabled = true;
            btnSpeak.setAttribute("aria-label", SPEECH_UNAVAILABLE_MSG);
            btnSpeak.setAttribute("title", SPEECH_UNAVAILABLE_MSG);
            btnSpeak.setAttribute("aria-pressed", "false");
            btnSpeak.setAttribute("aria-busy", "false");
        }
        if (btnSpeakExample) {
            btnSpeakExample.disabled = true;
            btnSpeakExample.setAttribute("aria-label", SPEECH_UNAVAILABLE_MSG);
            btnSpeakExample.setAttribute("title", SPEECH_UNAVAILABLE_MSG);
            btnSpeakExample.setAttribute("aria-pressed", "false");
            btnSpeakExample.setAttribute("aria-busy", "false");
        }
        announceAudioStatus(SPEECH_UNAVAILABLE_MSG);
        showToast(SPEECH_UNAVAILABLE_MSG);
        return;
    }

    if (btnSpeak) {
        btnSpeak.disabled = false;
        btnSpeak.setAttribute("aria-pressed", "false");
        btnSpeak.setAttribute("aria-busy", "false");
        btnSpeak.addEventListener("click", () => {
            if (!currentWord) return;
            return speakText(currentWord.word, btnSpeak, "i-waveform", "i-volume-high", { word: currentWord, type: "word" });
        });
    }

    if (btnSpeakExample) {
        btnSpeakExample.disabled = false;
        btnSpeakExample.setAttribute("aria-pressed", "false");
        btnSpeakExample.setAttribute("aria-busy", "false");
        btnSpeakExample.addEventListener("click", () => {
            if (!currentWord) return;
            const spokenQuote = Core.extractSpokenText(currentWord.example);
            return speakText(spokenQuote, btnSpeakExample, "i-waveform", "i-volume-high", { word: currentWord, type: "example" });
        });
    }

    if (btnAudioSpeed) {
        btnAudioSpeed.addEventListener("click", () => {
            const speeds = [0.70, 0.85, 1.0];
            const currentSpeed = appState.preferences.speechRate || 0.85;
            const nextIdx = (speeds.indexOf(currentSpeed) + 1) % speeds.length;
            appState.preferences.speechRate = speeds[nextIdx];
            saveState();
            updateAudioControlsUI();
            showToast(`سرعة النطق: ${appState.preferences.speechRate}x`);
            announceAudioStatus(`سرعة النطق: ${appState.preferences.speechRate}x`);
        });
    }

    if (btnAudioRepeat) {
        btnAudioRepeat.addEventListener("click", () => {
            const currentRep = appState.preferences.speechRepeat || 1;
            appState.preferences.speechRepeat = currentRep === 1 ? 3 : 1;
            saveState();
            updateAudioControlsUI();
            showToast(appState.preferences.speechRepeat > 1 ? "تفعيل تكرار النطق ٣ مرات للحفظ 🔁" : "تكرار النطق: مرة واحدة");
            announceAudioStatus(appState.preferences.speechRepeat > 1 ? "تكرار النطق 3 مرات للحفظ" : "تكرار النطق مرة واحدة");
        });
    }
}

function resetAllSpeakButtons() {
    if (btnSpeak) setButtonPlaybackState(btnSpeak, "idle", "i-waveform", "i-volume-high");
    if (btnSpeakExample) setButtonPlaybackState(btnSpeakExample, "idle", "i-waveform", "i-volume-high");
}

function speakText(text, buttonEl, activeIcon = "i-waveform", idleIcon = "i-volume-high", optionsOrWord = null) {
    if (!text) return;

    stopSpeech();
    const cleanSpeechText = (typeof text === "string")
        ? text.replace(/[\u200B-\u200F\uFEFF\u0640]/g, "").replace(/\s*\.{2,}\s*|\s*…\s*/g, "، ").trim()
        : text;

    if (!cleanSpeechText) return;

    const repeatCount = (typeof appState.preferences?.speechRepeat === "number" && (appState.preferences.speechRepeat === 1 || appState.preferences.speechRepeat === 3))
        ? appState.preferences.speechRepeat
        : 1;
    const targetRate = (typeof appState.preferences?.speechRate === "number" && Number.isFinite(appState.preferences.speechRate) && appState.preferences.speechRate >= 0.5 && appState.preferences.speechRate <= 1.5)
        ? appState.preferences.speechRate
        : 0.85;

    const type = optionsOrWord && typeof optionsOrWord === "object" ? optionsOrWord.type : "word";
    if (type === "example") {
        announceAudioStatus("استماع للشاهد الأدبي");
    } else {
        announceAudioStatus(`استماع لنطق كلمة «${cleanSpeechText}»`);
    }

    const speech = globalThis.KalimatSpeech;
    setButtonPlaybackState(buttonEl, "speaking", activeIcon, idleIcon);
    const result = speech?.speak(cleanSpeechText, {
        target: window,
        speech: window.speechSynthesis,
        Utterance: window.SpeechSynthesisUtterance,
        requireVoice: true,
        rate: targetRate,
        repeat: repeatCount,
        gapMs: 500,
        onStart: () => setButtonPlaybackState(buttonEl, "speaking", activeIcon, idleIcon),
        onEnd: () => setButtonPlaybackState(buttonEl, "idle", activeIcon, idleIcon),
        onError: () => {
            setButtonPlaybackState(buttonEl, "idle", activeIcon, idleIcon);
            announceAudioStatus(SPEECH_UNAVAILABLE_MSG);
            showToast(SPEECH_UNAVAILABLE_MSG);
        }
    });

    if (result?.kind === "no-arabic-voice") {
        resetAllSpeakButtons();
        announceAudioStatus(NO_ARABIC_VOICE_MSG);
        showToast(NO_ARABIC_VOICE_MSG);
        if (buttonEl) buttonEl.setAttribute("title", NO_ARABIC_VOICE_MSG);
        return result;
    }
    if (result?.kind !== "ok") {
        resetAllSpeakButtons();
        announceAudioStatus(SPEECH_UNAVAILABLE_MSG);
        showToast(SPEECH_UNAVAILABLE_MSG);
        if (buttonEl) buttonEl.setAttribute("title", SPEECH_UNAVAILABLE_MSG);
        return result;
    }

    return result;
}

function setButtonPlaybackState(buttonEl, state, activeIcon = "i-waveform", idleIcon = "i-volume-high") {
    if (!buttonEl) return;
    if (typeof state === "boolean") {
        state = state ? "speaking" : "idle";
    }
    const isSpeaking = (state === "speaking");
    const isBuffering = (state === "buffering");
    const isLoading = (state === "loading");

    if (buttonEl.classList) {
        if (typeof buttonEl.classList.remove === "function") {
            buttonEl.classList.remove("loading", "buffering", "speaking");
        }
        if (isLoading && typeof buttonEl.classList.add === "function") {
            buttonEl.classList.add("loading");
        }
        if (isBuffering && typeof buttonEl.classList.add === "function") {
            buttonEl.classList.add("buffering");
            buttonEl.classList.add("speaking");
        }
        if (isSpeaking && typeof buttonEl.classList.add === "function") {
            buttonEl.classList.add("speaking");
        }
    }

    const ariaBusy = (isLoading || isBuffering);
    const ariaPressed = (isSpeaking || isBuffering);
    if (typeof buttonEl.setAttribute === "function") {
        if (buttonEl.dataset && !buttonEl.dataset.idleAriaLabel) {
            buttonEl.dataset.idleAriaLabel = buttonEl.getAttribute("aria-label") || "استمع إلى النطق";
        }
        const labels = {
            loading: "جارٍ تحميل النطق",
            buffering: "جارٍ تجهيز النطق",
            speaking: "إيقاف النطق",
            idle: buttonEl.dataset?.idleAriaLabel || "استمع إلى النطق"
        };
        buttonEl.setAttribute("aria-busy", String(ariaBusy));
        buttonEl.setAttribute("aria-pressed", String(ariaPressed));
        buttonEl.setAttribute("aria-label", labels[state] || labels.idle);
    }

    const icon = (isSpeaking || isBuffering) ? activeIcon : idleIcon;
    const useEl = buttonEl.querySelector ? buttonEl.querySelector("use") : null;
    if (useEl && typeof useEl.setAttribute === "function") {
        useEl.setAttribute("href", `#${icon}`);
    }
}

function setButtonSpeakingState(buttonEl, isSpeaking, activeIcon = "i-waveform", idleIcon = "i-volume-high") {
    return setButtonPlaybackState(buttonEl, isSpeaking ? "speaking" : "idle", activeIcon, idleIcon);
}

function updateHistoryUI() {
    const allHistory = getSortedHistoryItems()
        .map(item => ({
            ...item,
            isFavorite: Boolean(appState.favorites && appState.favorites[item.id])
        }));

    const favoritesList = allHistory.filter(item => item.isFavorite);

    if (countHistoryBadge) countHistoryBadge.textContent = String(allHistory.length);
    if (countHistoryAll) countHistoryAll.textContent = String(allHistory.length);
    if (countHistoryFavs) countHistoryFavs.textContent = String(favoritesList.length);

    let displayList = currentHistoryFilter === "favorites" ? favoritesList : allHistory;

    // Apply Live Search Filter
    if (searchHistoryQuery && searchHistoryQuery.trim()) {
        const queryWords = displayList.map(item => item.word);
        const filteredWords = Core.searchLexicon(searchHistoryQuery, queryWords);
        const matchedIds = new Set(filteredWords.map(w => w.id));
        displayList = displayList.filter(item => matchedIds.has(item.word.id));
    }

    drawerEmptyMsg.hidden = displayList.length !== 0;
    drawerEmptyMsg.textContent = searchHistoryQuery.trim()
        ? `لم يُعثر على نتائج مطابقة لـ «${searchHistoryQuery}».`
        : (currentHistoryFilter === "favorites"
            ? "لم تقم بتمييز أي كلمات بنجمة المفضلة بعد."
            : "لم تفتح أي كلمات بعد.");

    listHistory.replaceChildren();

    for (const item of displayList) {
        const li = document.createElement("li");
        li.className = `history-item ${item.isFavorite ? "is-favorite" : ""}`;
        const button = document.createElement("button");
        button.type = "button";
        const header = document.createElement("div");
        header.className = "history-item-header";
        const wordEl = document.createElement("span");
        wordEl.className = "history-word";
        wordEl.textContent = item.word.word;
        if (item.isFavorite) {
            const starSpan = document.createElement("span");
            starSpan.className = "history-item-star";
            starSpan.textContent = "⭐";
            wordEl.appendChild(starSpan);
        }
        const dateEl = document.createElement("span");
        dateEl.className = "history-date";
        dateEl.textContent = getArabicDateFromKey(item.firstSeen);
        const meaningEl = document.createElement("p");
        meaningEl.className = "history-meaning";
        meaningEl.textContent = item.word.meaning;
        header.append(wordEl, dateEl);
        button.append(header, meaningEl);
        button.addEventListener("click", () => {
            renderWord(item.word, item.firstSeen);
            historyDialog.close();
        });
        li.appendChild(button);
        listHistory.appendChild(li);
    }
}

function getSortedHistoryItems() {
    return Object.entries(appState.history || {})
        .map(([id, record]) => ({
            id: Number(id),
            word: WORDS_DB.find(item => item.id === Number(id)),
            firstSeen: record && record.firstSeen
        }))
        .filter(item => item.word && Number.isSafeInteger(item.id) && isValidDateKey(item.firstSeen))
        .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.id - b.id);
}

function exportHistory() {
    const blob = new Blob([Core.serializeBackup(appState)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kalimat-history-${Core.getLocalDateKey(new Date())}.json`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setMenuOpen(false);
    showToast("تم تصدير المخزون.");
}

function exportAnkiDeck() {
    const csvContent = Core.serializeAnkiCSV(appState.history, WORDS_DB);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kalimat-anki-deck.csv";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("تم تصدير بطاقات Anki بنجاح!");
}

async function renderSocialCard(word) {
    if (!word) return;
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
        try {
            await document.fonts.ready;
        } catch {}
    }

    if (typeof document === "undefined" || typeof document.createElement !== "function") return;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return;

    // Background: Dark Editorial styling (#0f172a / #14211b)
    const bgGrad = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 1080, 1080) : null;
    if (bgGrad && typeof bgGrad.addColorStop === "function") {
        bgGrad.addColorStop(0, "#0f172a");
        bgGrad.addColorStop(1, "#14211b");
        ctx.fillStyle = bgGrad;
    } else {
        ctx.fillStyle = "#0f172a";
    }
    ctx.fillRect(0, 0, 1080, 1080);

    // Outer borders & Gold/Lime accent (#84cc16)
    ctx.strokeStyle = "#84cc16";
    ctx.lineWidth = 6;
    ctx.strokeRect(36, 36, 1008, 1008);

    ctx.strokeStyle = "rgba(243, 239, 229, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(48, 48, 984, 984);

    // Watermark Calligraphy glyph
    if (typeof ctx.save === "function") ctx.save();
    ctx.font = "bold 320px 'Amiri', serif";
    ctx.fillStyle = "rgba(132, 204, 22, 0.05)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = "rtl";
    if (typeof ctx.fillText === "function") ctx.fillText("ض", 540, 540);
    if (typeof ctx.restore === "function") ctx.restore();

    // Header Branding
    if (typeof ctx.save === "function") ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "right";

    ctx.fillStyle = "#84cc16";
    ctx.font = "bold 36px 'Outfit', sans-serif";
    if (typeof ctx.fillText === "function") ctx.fillText("كَلِمات", 980, 110);

    ctx.fillStyle = "rgba(243, 239, 229, 0.75)";
    ctx.font = "500 24px 'Outfit', sans-serif";
    if (typeof ctx.fillText === "function") ctx.fillText("كلمة اليوم من الفصحى", 980, 150);

    ctx.textAlign = "left";
    ctx.direction = "ltr";
    ctx.font = "600 22px 'Outfit', sans-serif";
    ctx.fillStyle = "rgba(243, 239, 229, 0.6)";
    if (typeof ctx.fillText === "function") ctx.fillText("kalimaat.app", 100, 110);
    if (typeof ctx.restore === "function") ctx.restore();

    // Divider
    ctx.strokeStyle = "rgba(243, 239, 229, 0.2)";
    ctx.lineWidth = 1;
    if (typeof ctx.beginPath === "function") {
        ctx.beginPath();
        ctx.moveTo(100, 185);
        ctx.lineTo(980, 185);
        ctx.stroke();
    }

    // Headword
    if (typeof ctx.save === "function") ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f3efe5";
    ctx.font = "bold 100px 'Amiri', serif";
    if (typeof ctx.fillText === "function") ctx.fillText(word.word, 540, 310);

    // Vocalization
    ctx.fillStyle = "#84cc16";
    ctx.font = "34px 'Amiri', serif";
    if (typeof ctx.fillText === "function") ctx.fillText(word.vocalization || "", 540, 370);
    if (typeof ctx.restore === "function") ctx.restore();

    // Metadata Badges (Root, Weight, Category)
    const metadata = [
        { label: "الجذر", val: word.root },
        { label: "الوزن", val: word.weight },
        { label: "التصنيف", val: word.category }
    ];

    const boxWidth = 260;
    const boxHeight = 75;
    const boxY = 415;
    const boxGap = 40;
    const totalWidth = 3 * boxWidth + 2 * boxGap;
    const startX = (1080 - totalWidth) / 2;

    metadata.forEach((item, index) => {
        const x = startX + index * (boxWidth + boxGap);
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        ctx.fillRect(x, boxY, boxWidth, boxHeight);
        ctx.strokeStyle = "rgba(243, 239, 229, 0.2)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, boxY, boxWidth, boxHeight);

        if (typeof ctx.save === "function") ctx.save();
        ctx.direction = "rtl";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(243, 239, 229, 0.7)";
        ctx.font = "20px 'Outfit', sans-serif";
        if (typeof ctx.fillText === "function") ctx.fillText(item.label, x + boxWidth / 2, boxY + 28);

        ctx.fillStyle = "#f3efe5";
        ctx.font = "bold 24px 'Amiri', serif";
        if (typeof ctx.fillText === "function") ctx.fillText(item.val || "—", x + boxWidth / 2, boxY + 60);
        if (typeof ctx.restore === "function") ctx.restore();
    });

    function wrapText(text, maxWidth, font, direction = "rtl") {
        ctx.font = font;
        ctx.direction = direction;
        const words = String(text || "").split(" ");
        const lines = [];
        let currentLine = "";
        for (const w of words) {
            const testLine = currentLine ? `${currentLine} ${w}` : w;
            const metrics = ctx.measureText ? ctx.measureText(testLine) : { width: testLine.length * 10 };
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = w;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
    }

    // Meaning Section
    if (typeof ctx.save === "function") ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#84cc16";
    ctx.font = "bold 22px 'Outfit', sans-serif";
    if (typeof ctx.fillText === "function") ctx.fillText("المعنى والدلالة:", 980, 540);

    ctx.fillStyle = "#f3efe5";
    const meaningLines = wrapText(word.meaning, 880, "30px 'Amiri', serif", "rtl");
    let currentY = 585;
    meaningLines.slice(0, 3).forEach(line => {
        if (typeof ctx.fillText === "function") ctx.fillText(line, 980, currentY);
        currentY += 42;
    });

    if (word.englishMeaning) {
        if (typeof ctx.save === "function") ctx.save();
        ctx.direction = "ltr";
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(243, 239, 229, 0.75)";
        const enLines = wrapText(word.englishMeaning, 880, "italic 22px 'Outfit', sans-serif", "ltr");
        currentY += 8;
        enLines.slice(0, 2).forEach(line => {
            if (typeof ctx.fillText === "function") ctx.fillText(line, 100, currentY);
            currentY += 30;
        });
        if (typeof ctx.restore === "function") ctx.restore();
    }
    if (typeof ctx.restore === "function") ctx.restore();

    // Literary Example Box
    if (word.example) {
        const exBoxY = Math.max(currentY + 20, 770);
        const exBoxHeight = 180;
        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.fillRect(100, exBoxY, 880, exBoxHeight);
        ctx.strokeStyle = "#84cc16";
        ctx.lineWidth = 3;
        if (typeof ctx.beginPath === "function") {
            ctx.beginPath();
            ctx.moveTo(980, exBoxY);
            ctx.lineTo(980, exBoxY + exBoxHeight);
            ctx.stroke();
        }

        if (typeof ctx.save === "function") ctx.save();
        ctx.direction = "rtl";
        ctx.textAlign = "right";
        ctx.fillStyle = "#84cc16";
        ctx.font = "bold 20px 'Outfit', sans-serif";
        if (typeof ctx.fillText === "function") ctx.fillText("الشاهد الأدبي:", 960, exBoxY + 35);

        ctx.fillStyle = "#f3efe5";
        const exLines = wrapText(`«${word.example}»`, 830, "26px 'Amiri', serif", "rtl");
        let exY = exBoxY + 75;
        exLines.slice(0, 2).forEach(line => {
            if (typeof ctx.fillText === "function") ctx.fillText(line, 960, exY);
            exY += 38;
        });
        if (typeof ctx.restore === "function") ctx.restore();
    }

    // Footer Branding
    if (typeof ctx.save === "function") ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(243, 239, 229, 0.5)";
    ctx.font = "500 20px 'Outfit', sans-serif";
    if (typeof ctx.fillText === "function") ctx.fillText("كَلِمات — تجربة يومية للاحتفاء بجماليات اللغة العربية وثراء مفرداتها", 540, 1015);
    if (typeof ctx.restore === "function") ctx.restore();

    const filename = `kalimat-word-${word.id}.png`;
    if (typeof canvas.toBlob === "function") {
        canvas.toBlob(blob => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = filename;
                link.hidden = true;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 0);
            } else if (typeof canvas.toDataURL === "function") {
                const link = document.createElement("a");
                link.href = canvas.toDataURL("image/png");
                link.download = filename;
                link.hidden = true;
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
            showToast("تم تصدير بطاقة الكلمة بنجاح!");
        }, "image/png");
    } else if (typeof canvas.toDataURL === "function") {
        const link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = filename;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast("تم تصدير بطاقة الكلمة بنجاح!");
    }
    setMenuOpen(false);
}

async function importHistory(file) {
    try {
        if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup file is too large.");
        const incoming = Core.parseBackup(await file.text(), VALID_WORD_IDS);
        appState = Core.mergeStates(appState, incoming, VALID_WORD_IDS);
        persistenceBlocked = false;
        const saved = saveState();
        updateHistoryUI();
        updateStreakUI();
        showToast(saved ? "تم دمج المخزون بنجاح." : "تم دمج المخزون لهذه الجلسة، لكن تعذّر حفظه.");
    } catch (error) {
        showToast(error.message === "Unsupported backup version."
            ? "إصدار ملف المخزون غير مدعوم."
            : "ملف المخزون غير صالح.");
    }
}

let announcerTimer = null;

function announceAudioStatus(message) {
    const el = audioAnnouncer || (typeof document !== "undefined" && document.getElementById ? document.getElementById("audio-announcer") : null);
    if (!el || !message) return;
    if (announcerTimer && typeof clearTimeout === "function") {
        clearTimeout(announcerTimer);
        announcerTimer = null;
    }
    el.textContent = "";
    if (typeof setTimeout === "function") {
        announcerTimer = setTimeout(() => {
            el.textContent = message;
            announcerTimer = null;
        }, 50);
    } else {
        el.textContent = message;
    }
}

let toastTimer = null;

function showToast(message) {
    if (!toast) return;
    if (toastTimer && typeof clearTimeout === "function") {
        clearTimeout(toastTimer);
        toastTimer = null;
    }
    toast.textContent = message;
    toast.classList.add("show");
    if (typeof setTimeout === "function") {
        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
            toastTimer = null;
        }, 2500);
    }
}

function setupEventListeners() {
    btnToggleHistory.addEventListener("click", () => {
        stopSpeech();
        setMenuOpen(false);
        historyDialogInvoker = document.activeElement || btnToggleHistory;
        historyDialog.showModal();
        if (typeof btnCloseHistory.focus === "function") btnCloseHistory.focus();
    });
    btnCloseHistory.addEventListener("click", () => {
        stopSpeech();
        historyDialog.close();
    });
    btnReturnToday.addEventListener("click", renderTodayWord);

    if (dueReviewBadge) {
        dueReviewBadge.addEventListener("click", () => {
            setMenuOpen(false);
            stopSpeech();
            startSpacedRepetitionReview();
        });
    }
    if (btnInlineReview) {
        btnInlineReview.addEventListener("click", () => startSpacedRepetitionReview());
    }

    if (historyDialog) {
        historyDialog.addEventListener("close", () => {
            stopSpeech();
            if (historyDialogInvoker && typeof historyDialogInvoker.focus === "function") {
                try { historyDialogInvoker.focus(); } catch {}
            }
            historyDialogInvoker = null;
        });
    }
    if (practiceDialog) {
        practiceDialog.addEventListener("close", () => {
            stopSpeech();
            updateDueReviewBadge();
            if (practiceDialogInvoker && typeof practiceDialogInvoker.focus === "function") {
                try { practiceDialogInvoker.focus(); } catch {}
            }
        });

        practiceDialog.addEventListener("keydown", (event) => {
            if (event.key === "Tab") {
                const focusables = Array.from(practiceDialog.querySelectorAll(
                    'button:not([disabled]):not([hidden]), [tabindex="0"], select:not([disabled]), input:not([disabled]), a[href]'
                )).filter(el => !el.hidden && (el.offsetParent !== null || el.tabIndex >= 0));

                if (focusables.length > 0) {
                    const firstEl = focusables[0];
                    const lastEl = focusables[focusables.length - 1];
                    if (event.shiftKey) {
                        if (document.activeElement === firstEl || !practiceDialog.contains(document.activeElement)) {
                            event.preventDefault();
                            lastEl.focus();
                        }
                    } else {
                        if (document.activeElement === lastEl || !practiceDialog.contains(document.activeElement)) {
                            event.preventDefault();
                            firstEl.focus();
                        }
                    }
                }
            } else if (event.key === "Escape") {
                event.preventDefault();
                practiceDialog.close();
            } else if (event.key === " " || event.code === "Space" || event.key === "Enter") {
                const tag = document.activeElement?.tagName;
                if (tag !== "BUTTON" && tag !== "A" && tag !== "INPUT") {
                    event.preventDefault();
                    flipFlashcard();
                }
            } else if (event.key === "1" || event.key === "Digit1" || event.key === "Numpad1" || event.key === "١") {
                if (isFlashcardFlipped) {
                    event.preventDefault();
                    handleRatingSubmission("again");
                }
            } else if (event.key === "2" || event.key === "Digit2" || event.key === "Numpad2" || event.key === "٢") {
                if (isFlashcardFlipped) {
                    event.preventDefault();
                    handleRatingSubmission("hard");
                }
            } else if (event.key === "3" || event.key === "Digit3" || event.key === "Numpad3" || event.key === "٣") {
                if (isFlashcardFlipped) {
                    event.preventDefault();
                    handleRatingSubmission("good");
                }
            } else if (event.key === "4" || event.key === "Digit4" || event.key === "Numpad4" || event.key === "٤") {
                if (isFlashcardFlipped) {
                    event.preventDefault();
                    handleRatingSubmission("easy");
                }
            } else if (event.key === "p" || event.key === "P" || event.key === "ح") {
                const currentItem = activeReviewQueue[activeReviewIndex];
                if (currentItem && currentItem.word) {
                    event.preventDefault();
                    const audioBtn = document.getElementById("fc-btn-audio");
                    speakText(currentItem.word.word, audioBtn, "i-waveform", "i-volume-high", { word: currentItem.word, type: "word" });
                }
            }
        });
    }
    if (shortcutsDialog) {
        shortcutsDialog.addEventListener("close", stopSpeech);
    }
    if (typeof window !== "undefined") {
        if (typeof window.addEventListener === "function") {
            window.addEventListener("pagehide", stopSpeech);
            window.addEventListener("beforeunload", stopSpeech);
        }
    }

    if (btnFavorite) {
        btnFavorite.addEventListener("click", toggleFavorite);
    }

    if (inputSearchHistory) {
        inputSearchHistory.addEventListener("input", () => {
            searchHistoryQuery = inputSearchHistory.value || "";
            updateHistoryUI();
        });
    }

    if (btnCopyQuote) {
        btnCopyQuote.addEventListener("click", () => {
            if (!currentWord) return;
            const text = Core.formatWordCitation(currentWord);
            copyToClipboard(text);
        });
    }

    if (tabHistoryAll && tabHistoryFavs) {
        tabHistoryAll.addEventListener("click", () => {
            currentHistoryFilter = "all";
            tabHistoryAll.classList.add("active");
            tabHistoryAll.setAttribute("aria-selected", "true");
            tabHistoryFavs.classList.remove("active");
            tabHistoryFavs.setAttribute("aria-selected", "false");
            updateHistoryUI();
        });
        tabHistoryFavs.addEventListener("click", () => {
            currentHistoryFilter = "favorites";
            tabHistoryFavs.classList.add("active");
            tabHistoryFavs.setAttribute("aria-selected", "true");
            tabHistoryAll.classList.remove("active");
            tabHistoryAll.setAttribute("aria-selected", "false");
            updateHistoryUI();
        });
    }

    if (btnStartPractice) {
        btnStartPractice.addEventListener("click", () => {
            if (historyDialog && historyDialog.open) historyDialog.close();
            startSpacedRepetitionReview();
        });
    }

    if (btnMenuPractice) {
        btnMenuPractice.addEventListener("click", () => {
            setMenuOpen(false);
            startSpacedRepetitionReview();
        });
    }

    if (btnClosePractice && practiceDialog) {
        btnClosePractice.addEventListener("click", () => practiceDialog.close());
    }

    if (btnMenuShortcuts && shortcutsDialog) {
        btnMenuShortcuts.addEventListener("click", () => {
            shortcutsDialogInvoker = btnToggleMenu;
            setMenuOpen(false);
            shortcutsDialog.showModal();
            if (typeof btnCloseShortcuts.focus === "function") btnCloseShortcuts.focus();
        });
    }

    if (btnCloseShortcuts && shortcutsDialog) {
        btnCloseShortcuts.addEventListener("click", () => shortcutsDialog.close());
    }
    if (shortcutsDialog) {
        shortcutsDialog.addEventListener("close", () => {
            stopSpeech();
            if (shortcutsDialogInvoker && typeof shortcutsDialogInvoker.focus === "function") {
                try { shortcutsDialogInvoker.focus(); } catch {}
            }
            shortcutsDialogInvoker = null;
        });
    }

    btnToggleMenu.addEventListener("click", event => {
        event.stopPropagation();
        setMenuOpen(dropdownMenu.hidden);
    });
    document.addEventListener("click", event => {
        if (!dropdownMenu.contains(event.target) && !btnToggleMenu.contains(event.target)) setMenuOpen(false);
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            if (dropdownMenu && !dropdownMenu.hidden) {
                setMenuOpen(false);
                if (btnToggleMenu && typeof btnToggleMenu.focus === "function") {
                    btnToggleMenu.focus();
                }
            }
            stopSpeech();
        }
    });
    btnToggleEnglish.addEventListener("click", () => {
        appState.preferences.showEnglish = !appState.preferences.showEnglish;
        saveState();
        renderWord(currentWord, activeArchiveDateKey);
        setMenuOpen(false);
    });
    btnExportHistory.addEventListener("click", exportHistory);
    if (btnExportCard) {
        btnExportCard.addEventListener("click", async () => {
            if (currentWord) await renderSocialCard(currentWord);
            setMenuOpen(false);
        });
    }
    if (btnExportAnki) {
        btnExportAnki.addEventListener("click", () => {
            exportAnkiDeck();
            setMenuOpen(false);
        });
    }
    btnImportHistory.addEventListener("click", () => {
        setMenuOpen(false);
        inputImportHistory.click();
    });
    inputImportHistory.addEventListener("change", async () => {
        const [file] = inputImportHistory.files;
        if (file) await importHistory(file);
        inputImportHistory.value = "";
    });
    if (btnClearLearningData) {
        btnClearLearningData.addEventListener("click", clearLearningData);
    }
    btnCopyLink.addEventListener("click", () => {
        if (currentWord) copyToClipboard(getShareText(currentWord));
        setMenuOpen(false);
    });
    btnShare.addEventListener("click", () => {
        if (!currentWord) return;
        const shareText = getShareText(currentWord);
        setMenuOpen(false);
        if (navigator.share) {
            navigator.share({ title: getShareTitle(currentWord), text: shareText })
                .then(() => showToast("تمت المشاركة بنجاح!"))
                .catch(error => { if (error.name !== "AbortError") copyToClipboard(shareText); });
        } else {
            copyToClipboard(shareText);
        }
    });
    const btnResetStorage = document.getElementById("btn-reset-storage");
    if (btnResetStorage) {
        btnResetStorage.addEventListener("click", () => {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch {}
            const recovered = Core.resetCorruptedStorage
                ? Core.resetCorruptedStorage()
                : { state: Core.createDefaultState(), canPersist: true };
            appState = recovered.state;
            persistenceBlocked = !recovered.canPersist;
            saveState();
            const warningEl = document.getElementById("storage-warning");
            if (warningEl) warningEl.hidden = true;
            updateHistoryUI();
            renderTodayWord();
            updateStreakUI();
            showToast("تمت إعادة ضبط التخزين بنجاح.");
        });
    }
}

function updateDueReviewBadge() {
    const badge = document.getElementById("due-review-badge");
    const countEl = document.getElementById("due-count");
    if (!badge && !countEl && !btnInlineReview && !inlineReviewCount) return;
    if (!Core || typeof Core.getReviewStats !== "function") return;

    const stats = Core.getReviewStats(appState, activeDateKey || Core.getLocalDateKey(new Date()), WORDS_DB);
    const dueCount = stats.dueToday || 0;

    if (countEl) {
        countEl.textContent = String(dueCount);
    }
    if (badge) {
        badge.setAttribute("aria-label", `المراجعات المستحقة اليوم: ${dueCount} كلمات`);
        if (dueCount > 0) {
            badge.classList.add("has-due", "pulse");
        } else {
            badge.classList.remove("has-due", "pulse");
        }
    }
    if (inlineReviewCount) inlineReviewCount.textContent = toArabicDigits(dueCount);
    if (btnInlineReview) {
        btnInlineReview.hidden = dueCount === 0;
        btnInlineReview.setAttribute("aria-label", `راجع الكلمات المستحقة: ${toArabicDigits(dueCount)} ${formatReviewCount(dueCount)}`);
    }
}

function startSpacedRepetitionReview() {
    stopSpeech();
    if (!practiceDialog || !practiceBody) return;

    practiceDialogInvoker = document.activeElement;
    const todayKey = activeDateKey || (Core ? Core.getLocalDateKey(new Date()) : "");
    const stats = (Core && typeof Core.getReviewStats === "function")
        ? Core.getReviewStats(appState, todayKey, WORDS_DB)
        : null;
    const configuredLimit = Number.isInteger(appState.preferences?.dailyReviewLimit)
        && appState.preferences.dailyReviewLimit >= 1
        && appState.preferences.dailyReviewLimit <= 100
        ? appState.preferences.dailyReviewLimit
        : 20;
    const dueItems = (Core && typeof Core.getDueReviewWords === "function")
        ? Core.getDueReviewWords(appState, WORDS_DB, todayKey, configuredLimit)
        : [];

    activeReviewQueue = Array.isArray(dueItems) ? dueItems : [];
    activeReviewDueCount = Number.isInteger(stats?.dueCount) ? stats.dueCount : activeReviewQueue.length;
    activeReviewRemainingCount = Math.max(0, activeReviewDueCount - activeReviewQueue.length);

    activeReviewIndex = 0;
    sessionReviewStats = { totalReviewed: 0, ratings: { again: 0, hard: 0, good: 0, easy: 0 } };

    if (activeReviewQueue.length === 0) {
        renderEmptyReviewQueue();
        if (typeof practiceDialog.showModal === "function") practiceDialog.showModal();
        announceAudioStatus("لا توجد كلمات مستحقة للمراجعة اليوم 🎉.");
        return;
    }

    announceAudioStatus(`بدأت جلسة المراجعة. متبقي ${activeReviewQueue.length} بطاقات مستحقة. اضغط مسافة لكشف البطاقة.`);
    if (typeof practiceDialog.showModal === "function") practiceDialog.showModal();
    renderFlashcardStep();
}

function startPracticeQuiz() {
    startSpacedRepetitionReview();
}

function renderEmptyReviewQueue() {
    if (!practiceBody) return;
    practiceBody.replaceChildren();

    const summary = document.createElement("div");
    summary.className = "practice-summary";

    const title = document.createElement("h3");
    title.className = "practice-summary-title";
    title.textContent = "🎉 لا توجد مراجعات مستحقة اليوم";

    const desc = document.createElement("p");
    desc.className = "practice-summary-desc";
    desc.textContent = "رائع! لقد أتممت جميع مراجعاتك المجدولة حتى الآن. عُد غداً لمتابعة تثبيت الألفاظ الجديدة.";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "practice-cta-btn";
    closeBtn.textContent = "إغلاق النافذة";
    closeBtn.addEventListener("click", () => {
        if (practiceDialog && typeof practiceDialog.close === "function") practiceDialog.close();
    });

    summary.append(title, desc, closeBtn);
    practiceBody.appendChild(summary);
    if (typeof closeBtn.focus === "function") closeBtn.focus();
}

function renderFlashcardStep() {
    if (!practiceBody) return;
    if (activeReviewIndex >= activeReviewQueue.length) {
        renderReviewCompletionSummary();
        return;
    }

    isFlashcardFlipped = false;
    const currentItem = activeReviewQueue[activeReviewIndex];
    const word = currentItem.word;
    const todayKey = activeDateKey || (Core ? Core.getLocalDateKey(new Date()) : "");
    const srs = currentItem.srs || (appState.srs && appState.srs[word.id]) || (Core ? Core.createDefaultSrsItem(word.id, todayKey) : { ef: 2.5 });

    practiceBody.replaceChildren();

    const container = document.createElement("div");
    container.className = "practice-container";
    container.id = "practice-container";

    // Progress Bar Header
    const headerStatus = document.createElement("div");
    headerStatus.className = "practice-header-status";

    const progressWrap = document.createElement("div");
    progressWrap.className = "practice-progress-bar-wrap";
    progressWrap.setAttribute("role", "progressbar");
    progressWrap.setAttribute("aria-valuenow", String(activeReviewIndex + 1));
    progressWrap.setAttribute("aria-valuemin", "1");
    progressWrap.setAttribute("aria-valuemax", String(activeReviewQueue.length));
    progressWrap.setAttribute("aria-label", "تقدم جلسة المراجعة");

    const progressFill = document.createElement("div");
    progressFill.className = "practice-progress-bar-fill";
    progressFill.id = "practice-progress-fill";
    const percent = Math.round(((activeReviewIndex + 1) / activeReviewQueue.length) * 100);
    progressFill.style.width = `${percent}%`;
    progressWrap.appendChild(progressFill);

    const progressInfo = document.createElement("div");
    progressInfo.className = "practice-progress-info";

    const progressText = document.createElement("span");
    progressText.id = "practice-progress-text";
    progressText.textContent = `البطاقة ${activeReviewIndex + 1} من ${activeReviewQueue.length}`;

    const dueTag = document.createElement("span");
    dueTag.className = "practice-due-pill";
    dueTag.id = "practice-card-due-tag";
    dueTag.textContent = currentItem.isOverdue ? "متأخرة" : "مستحقة اليوم";

    progressInfo.append(progressText, dueTag);
    headerStatus.append(progressWrap, progressInfo);

    // 3D Flashcard Scene
    const scene = document.createElement("div");
    scene.className = "flashcard-scene";
    scene.id = "flashcard-scene";

    const flipButton = document.createElement("button");
    flipButton.type = "button";
    flipButton.className = "card-front-flip";
    flipButton.id = "card-front-flip";
    flipButton.setAttribute("aria-pressed", "false");
    flipButton.setAttribute("aria-label", "اقلب البطاقة");
    flipButton.textContent = "اقلب البطاقة";

    const card = document.createElement("div");
    card.className = "flashcard-card";
    card.id = "flashcard-card";
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", "بطاقة الكلمة");

    // Front Face
    const front = document.createElement("div");
    front.className = "flashcard-face flashcard-front";
    front.id = "card-front-face";
    front.setAttribute("aria-hidden", "false");

    const frontMeta = document.createElement("div");
    frontMeta.className = "flashcard-meta-top";
    const frontCat = document.createElement("span");
    frontCat.className = "flashcard-badge-category";
    frontCat.id = "fc-front-category";
    frontCat.textContent = word.category || "";
    const frontEase = document.createElement("span");
    frontEase.className = "flashcard-badge-ease";
    frontEase.id = "fc-front-ease";
    frontEase.textContent = `عامل السهولة: ${(srs.ef || 2.5).toFixed(1)}`;
    frontMeta.append(frontCat, frontEase);

    const frontCenter = document.createElement("div");
    frontCenter.className = "flashcard-front-center";

    const frontWord = document.createElement("h3");
    frontWord.className = "flashcard-word";
    frontWord.id = "fc-front-word";
    frontWord.textContent = word.word;

    const frontPronunciation = document.createElement("p");
    frontPronunciation.className = "flashcard-transliteration";
    frontPronunciation.id = "fc-front-pronunciation";
    frontPronunciation.textContent = word.pronunciation || "";

    const frontRootWeight = document.createElement("p");
    frontRootWeight.className = "flashcard-root-weight";
    frontRootWeight.id = "fc-front-root-weight";
    frontRootWeight.textContent = `الجذر: ${word.root || ""} | الوزن: ${word.weight || ""}`;

    const frontVocalization = document.createElement("p");
    frontVocalization.className = "flashcard-vocalization";
    frontVocalization.id = "fc-front-vocalization";
    frontVocalization.textContent = word.vocalization || "";

    frontCenter.append(frontWord, frontPronunciation, frontRootWeight, frontVocalization);

    const frontBottom = document.createElement("div");
    frontBottom.className = "flashcard-front-bottom";

    const frontAudioBtn = document.createElement("button");
    frontAudioBtn.type = "button";
    frontAudioBtn.className = "flashcard-audio-btn";
    frontAudioBtn.id = "fc-btn-audio";
    frontAudioBtn.disabled = false;
    frontAudioBtn.title = "استمع إلى النطق (P)";
    frontAudioBtn.setAttribute("aria-label", "استمع إلى نطق الكلمة");
    frontAudioBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-volume-high"/></svg> <span>استمع</span>';

    frontAudioBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        speakText(word.word, frontAudioBtn, "i-waveform", "i-volume-high", { word, type: "word" });
    });

    const frontHint = document.createElement("p");
    frontHint.className = "flashcard-hint-text review-helper";
    frontHint.textContent = "اقلب البطاقة، ثم اختر مدى تذكّرك؛ سنحدد موعد عودتها.";

    frontBottom.append(frontAudioBtn, frontHint);
    front.append(frontMeta, frontCenter, frontBottom);

    // Back Face
    const back = document.createElement("div");
    back.className = "flashcard-face flashcard-back";
    back.id = "card-back-face";
    back.setAttribute("aria-hidden", "true");

    const backMeta = document.createElement("div");
    backMeta.className = "flashcard-meta-top";
    const backCat = document.createElement("span");
    backCat.className = "flashcard-badge-category";
    backCat.textContent = word.category || "";
    const backVocalization = document.createElement("span");
    backVocalization.className = "flashcard-vocalization";
    backVocalization.id = "fc-back-vocalization";
    backVocalization.textContent = word.vocalization || "";
    backMeta.append(backCat, backVocalization);

    const backCenter = document.createElement("div");
    backCenter.className = "flashcard-back-center";

    const backMeaning = document.createElement("p");
    backMeaning.className = "flashcard-meaning";
    backMeaning.id = "fc-back-meaning";
    backMeaning.textContent = word.meaning || "";

    const backMeaningEn = document.createElement("p");
    backMeaningEn.className = "flashcard-meaning-en";
    backMeaningEn.id = "fc-back-meaning-en";
    backMeaningEn.dir = "ltr";
    backMeaningEn.lang = "en";
    backMeaningEn.textContent = word.englishMeaning || "";

    const backRoot = document.createElement("p");
    backRoot.className = "flashcard-back-root";
    backRoot.id = "fc-back-root";
    backRoot.textContent = `الجذر: ${word.root || ""} | الوزن: ${word.weight || ""}`;

    const backExample = document.createElement("blockquote");
    backExample.className = "flashcard-example";
    backExample.id = "fc-back-example";
    backExample.textContent = word.example || "";

    backCenter.append(backMeaning, backMeaningEn, backRoot, backExample);

    const backBottom = document.createElement("div");
    backBottom.className = "flashcard-back-bottom";
    const backAudioBtn = document.createElement("button");
    backAudioBtn.type = "button";
    backAudioBtn.className = "flashcard-audio-btn";
    backAudioBtn.id = "fc-btn-back-audio";
    backAudioBtn.disabled = true;
    backAudioBtn.title = "استمع إلى المثال";
    backAudioBtn.setAttribute("aria-label", "استمع إلى نطق المثال");
    backAudioBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-volume-high"/></svg> <span>استمع إلى المثال</span>';
    backAudioBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        speakText(word.example || word.word, backAudioBtn, "i-waveform", "i-volume-high", { word, type: "example" });
    });
    backBottom.append(backAudioBtn);

    back.append(backMeta, backCenter, backBottom);
    card.append(front, back);

    const ratingSection = document.createElement("div");
    ratingSection.className = "flashcard-rating-section";
    ratingSection.id = "flashcard-rating-section";
    ratingSection.hidden = true;
    ratingSection.setAttribute("aria-hidden", "true");

    const backPrompt = document.createElement("p");
    backPrompt.className = "flashcard-rate-prompt";
    backPrompt.id = "fc-back-prompt";
    backPrompt.textContent = "قيّم مستوى استحضارك للفظ:";
    ratingSection.append(backPrompt);

    // 4-Tier SM-2 Rating Controls Bar
    const ratingBar = document.createElement("div");
    ratingBar.className = "flashcard-rating-bar";
    ratingBar.id = "flashcard-rating-bar";
    ratingBar.setAttribute("role", "group");
    ratingBar.setAttribute("aria-label", "خيارات تقييم الاستذكار");
    ratingBar.setAttribute("aria-hidden", "true");
    ratingBar.hidden = true;

    const ratingConfigs = [
        { grade: 1, key: "1", canonical: "again", title: "مجدداً", class: "rating-again", aria: "إعادة (اضغط 1): لم أتذكرها" },
        { grade: 3, key: "2", canonical: "hard", title: "صعب", class: "rating-hard", aria: "صعب (اضغط 2): تذكرتها بصعوبة" },
        { grade: 4, key: "3", canonical: "good", title: "جيد", class: "rating-good", aria: "جيد (اضغط 3): تذكرتها جيداً" },
        { grade: 5, key: "4", canonical: "easy", title: "سهل", class: "rating-easy", aria: "سهل (اضغط 4): راسخة تماماً" }
    ];

    ratingConfigs.forEach(cfg => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `rating-btn ${cfg.class}`;
        btn.setAttribute("data-rating", String(cfg.grade));
        btn.setAttribute("aria-label", cfg.aria);
        btn.disabled = true;

        const keyBadge = document.createElement("span");
        keyBadge.className = "rating-badge-key";
        keyBadge.textContent = cfg.key;

        const titleSpan = document.createElement("span");
        titleSpan.className = "rating-title";
        titleSpan.textContent = cfg.title;

        const intSpan = document.createElement("span");
        intSpan.className = "rating-interval";
        intSpan.textContent = currentItem.reviewOptions?.[cfg.canonical]?.label || "—";

        btn.append(keyBadge, titleSpan, intSpan);

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleRatingSubmission(cfg.canonical);
        });

        ratingBar.appendChild(btn);
    });

    ratingSection.append(ratingBar);
    flipButton.addEventListener("click", flipFlashcard);

    scene.append(flipButton, card);
    container.append(headerStatus, scene, ratingSection);
    practiceBody.appendChild(container);

    if (typeof flipButton.focus === "function") {
        flipButton.focus();
    }
}

function flipFlashcard() {
    const card = document.getElementById("flashcard-card");
    if (!card) return;
    card.classList.toggle("is-flipped");
    isFlashcardFlipped = card.classList.contains("is-flipped");

    const front = document.getElementById("card-front-face");
    const back = document.getElementById("card-back-face");
    const frontAudioBtn = document.getElementById("fc-btn-audio");
    const backAudioBtn = document.getElementById("fc-btn-back-audio");
    if (front) front.setAttribute("aria-hidden", String(isFlashcardFlipped));
    if (back) back.setAttribute("aria-hidden", String(!isFlashcardFlipped));
    if (frontAudioBtn) frontAudioBtn.disabled = isFlashcardFlipped;
    if (backAudioBtn) backAudioBtn.disabled = !isFlashcardFlipped;

    const flipButton = document.getElementById("card-front-flip");
    if (flipButton) {
        const label = isFlashcardFlipped ? "أخفِ المعنى" : "اقلب البطاقة";
        flipButton.setAttribute("aria-pressed", String(isFlashcardFlipped));
        flipButton.setAttribute("aria-label", label);
        flipButton.textContent = label;
    }

    const ratingBar = document.getElementById("flashcard-rating-bar");
    const ratingSection = document.getElementById("flashcard-rating-section");
    if (ratingSection) {
        ratingSection.hidden = !isFlashcardFlipped;
        ratingSection.setAttribute("aria-hidden", String(!isFlashcardFlipped));
    }
    if (ratingBar) {
        ratingBar.hidden = !isFlashcardFlipped;
        ratingBar.setAttribute("aria-hidden", String(!isFlashcardFlipped));
        ratingBar.querySelectorAll("button").forEach((button) => {
            button.disabled = !isFlashcardFlipped;
        });
    }

    announceAudioStatus(isFlashcardFlipped ? "كُشف المعنى." : "أُخفي المعنى.");

    if (isFlashcardFlipped) {
        const goodBtn = ratingBar?.querySelector?.('.rating-good') || ratingBar?.querySelector?.('button');
        if (goodBtn && typeof goodBtn.focus === "function") goodBtn.focus();
    } else if (flipButton && typeof flipButton.focus === "function") {
        flipButton.focus();
    }
}

function handleRatingSubmission(rating) {
    const currentItem = activeReviewQueue[activeReviewIndex];
    if (!currentItem || !currentItem.word) return;

    const todayKey = activeDateKey || (Core ? Core.getLocalDateKey(new Date()) : "");
    const previousState = appState;
    let candidateState;
    if (Core && typeof Core.recordReview === "function") {
        const result = Core.recordReview(previousState, currentItem.word.id, rating, todayKey, VALID_WORD_IDS);
        candidateState = result && result.updatedState;
    } else {
        candidateState = {
            ...previousState,
            history: { ...(previousState.history || {}) }
        };
        if (!candidateState.history[currentItem.word.id]) candidateState.history[currentItem.word.id] = { firstSeen: todayKey };
    }

    if (!candidateState) return;
    appState = candidateState;
    if (!saveState()) {
        appState = previousState;
        announceAudioStatus("تعذّر حفظ المراجعة. حاول مجددًا.");
        return;
    }

    updateDueReviewBadge();
    updateStreakUI();
    updateHistoryUI();

    sessionReviewStats.totalReviewed += 1;
    const rKey = (rating === 1 || rating === "again") ? "again"
        : (rating === 2 || rating === "hard") ? "hard"
        : (rating === 3 || rating === "good") ? "good"
        : "easy";
    if (sessionReviewStats.ratings[rKey] !== undefined) {
        sessionReviewStats.ratings[rKey] += 1;
    }

    const ratingLabels = { again: "مجدداً", hard: "صعب", good: "جيد", easy: "سهل", 1: "مجدداً", 2: "صعب", 3: "جيد", 4: "سهل" };
    const remaining = activeReviewQueue.length - (activeReviewIndex + 1);
    announceAudioStatus(`تم تقييم الكلمة: ${ratingLabels[rating] || rating}. متبقي ${remaining} بطاقات.`);

    activeReviewIndex += 1;
    renderFlashcardStep();
}

function renderReviewCompletionSummary() {
    if (!practiceBody) return;
    practiceBody.replaceChildren();

    const summary = document.createElement("div");
    summary.className = "practice-summary";

    const title = document.createElement("h3");
    title.className = "practice-summary-title";
    title.textContent = "🎉 اكتملت مراجعة اليوم";

    const count = sessionReviewStats.totalReviewed;
    const wordPlural = count === 1 ? "كلمة واحدة" : count === 2 ? "كلمتين" : count <= 10 ? `${count} كلمات` : `${count} كلمة`;

    const desc = document.createElement("p");
    desc.className = "practice-summary-desc";
    const remainingCount = Math.max(0, activeReviewRemainingCount + activeReviewQueue.length - count);
    const cappedMessage = remainingCount > 0
        ? `أتممت ${toArabicDigits(count)} من ${toArabicDigits(activeReviewDueCount)} مراجعة؛ تبقت ${formatReviewCount(remainingCount)}.`
        : "";
    desc.textContent = cappedMessage || `أحسنت! راجعت ${wordPlural} بنجاح. المراجعة اليومية المنتظمة تثبت المفردات في الذاكرة طويلة المدى.`;

    const todayKey = activeDateKey || (Core ? Core.getLocalDateKey(new Date()) : "");
    const stats = (Core && typeof Core.getReviewStats === "function") ? Core.getReviewStats(appState, todayKey, WORDS_DB) : null;

    const statsGrid = document.createElement("div");
    statsGrid.className = "practice-stats-grid";

    const stat1 = document.createElement("div");
    stat1.className = "practice-stat-box";
    stat1.innerHTML = `<span>تمت مراجعتها</span><strong>${count}</strong>`;

    const stat2 = document.createElement("div");
    stat2.className = "practice-stat-box";
    stat2.innerHTML = `<span>نسبة الاستذكار</span><strong>${stats ? stats.retentionRate : 100}%</strong>`;

    const stat3 = document.createElement("div");
    stat3.className = "practice-stat-box";
    stat3.innerHTML = `<span>كلمات راسخة</span><strong>${stats ? stats.masteredCount : 0}</strong>`;

    statsGrid.append(stat1, stat2, stat3);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "practice-cta-btn";
    closeBtn.id = "btn-close-summary";
    closeBtn.textContent = "إغلاق المراجعة";
    closeBtn.addEventListener("click", () => {
        if (practiceDialog && typeof practiceDialog.close === "function") practiceDialog.close();
    });

    summary.append(title, desc, statsGrid, closeBtn);
    practiceBody.appendChild(summary);

    if (remainingCount > 0 && dueReviewBadge) {
        dueReviewBadge.hidden = false;
        dueReviewBadge.setAttribute("aria-label", `المراجعات المتبقية بعد الجلسة: ${toArabicDigits(remainingCount)} ${formatReviewCount(remainingCount)}`);
        if (dueCountEl) dueCountEl.textContent = String(remainingCount);
    }
    announceAudioStatus(cappedMessage || `🎉 أحسنت! اكتملت مراجعة اليوم بنجاح. راجعت ${wordPlural}.`);
    if (typeof closeBtn.focus === "function") {
        closeBtn.focus();
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener("keydown", event => {
        // Ignore if user is inside an input, textarea, or select
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

        // Ignore if modal dialog is open (except for ESC handled natively)
        if (historyDialog?.open || practiceDialog?.open || shortcutsDialog?.open) return;

        // Spacebar should only trigger pronunciation if not currently focused on a button or link
        if (event.code === "Space") {
            if (document.activeElement && (document.activeElement.tagName === "BUTTON" || document.activeElement.tagName === "A")) {
                return;
            }
            event.preventDefault();
            if (currentWord && btnSpeak) {
                speakText(currentWord.word, btnSpeak, "i-waveform", "i-volume-high", { word: currentWord, type: "word" });
            }
            return;
        }

        if (event.key === "p" || event.key === "P" || event.key === "ح") {
            event.preventDefault();
            if (currentWord && btnSpeak) {
                speakText(currentWord.word, btnSpeak, "i-waveform", "i-volume-high", { word: currentWord, type: "word" });
            }
        } else if (event.key === "f" || event.key === "F" || event.key === "ب") {
            event.preventDefault();
            toggleFavorite();
        } else if (event.key === "h" || event.key === "H" || event.key === "ا") {
            event.preventDefault();
            if (historyDialog) {
                historyDialogInvoker = document.activeElement || btnToggleHistory;
                historyDialog.showModal();
                if (btnCloseHistory && typeof btnCloseHistory.focus === "function") btnCloseHistory.focus();
            }
        } else if (event.key === "q" || event.key === "Q" || event.key === "ض") {
            event.preventDefault();
            startSpacedRepetitionReview();
        } else if (event.key === "?" || event.key === "؟") {
            event.preventDefault();
            if (shortcutsDialog) {
                shortcutsDialogInvoker = document.activeElement || btnMenuShortcuts || btnToggleMenu;
                shortcutsDialog.showModal();
                if (btnCloseShortcuts && typeof btnCloseShortcuts.focus === "function") btnCloseShortcuts.focus();
            }
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "j" || event.key === "k") {
            // Browse history words chronologically
            const historyIds = getSortedHistoryItems().map(item => item.id);
            if (historyIds.length > 1 && currentWord) {
                const curIdx = historyIds.indexOf(currentWord.id);
                if (curIdx !== -1) {
                    const isNext = (event.key === "ArrowLeft" || event.key === "j"); // RTL forward is Left
                    let targetIdx = isNext ? curIdx + 1 : curIdx - 1;
                    if (targetIdx < 0) targetIdx = historyIds.length - 1;
                    if (targetIdx >= historyIds.length) targetIdx = 0;
                    const nextWord = WORDS_DB.find(w => w.id === historyIds[targetIdx]);
                    if (nextWord) {
                        event.preventDefault();
                        renderWord(nextWord, appState.history[nextWord.id]?.firstSeen);
                    }
                }
            }
        }
    });
}

function setMenuOpen(isOpen) {
    if (!dropdownMenu || !btnToggleMenu) return;
    const wasOpen = !dropdownMenu.hidden;
    const restoreFocus = wasOpen && dropdownMenu.contains(document.activeElement);
    dropdownMenu.hidden = !isOpen;
    btnToggleMenu.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
        const controls = [];
        const collectVisibleControls = (parent, parentHidden = false) => {
            for (const child of parent.children || []) {
                const hidden = parentHidden || child.hidden;
                if (!hidden && ["A", "BUTTON", "SELECT"].includes(child.tagName) && child.getAttribute("aria-hidden") !== "true") {
                    controls.push(child);
                }
                collectVisibleControls(child, hidden);
            }
        };
        collectVisibleControls(dropdownMenu);
        controls[0]?.focus();
    }
    else if (restoreFocus && typeof btnToggleMenu.focus === "function") btnToggleMenu.focus();
}

function clearLearningData() {
    if (!btnClearLearningData) return;
    const confirmed = typeof window.confirm === "function"
        && window.confirm("هل تريد مسح مخزونك اللغوي من هذا الجهاز؟");
    if (!confirmed) {
        btnClearLearningData.focus();
        return;
    }
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {}
    if (window.location && typeof window.location.reload === "function") window.location.reload();
}

function getShareTitle(word, archiveDateKey = activeArchiveDateKey) {
    return archiveDateKey
        ? `كَلِمات | كلمة من المخزون: ${word.word} — ${getArabicDateFromKey(archiveDateKey)}`
        : `كَلِمات | كلمة اليوم: ${word.word}`;
}

function getShareText(word, archiveDateKey = activeArchiveDateKey) {
    const origin = (typeof window !== "undefined" && window.location && window.location.origin) ? window.location.origin : "https://kalimaat.app";
    const pathname = (typeof window !== "undefined" && window.location && window.location.pathname) ? window.location.pathname.replace(/\/[^/]*$/, "/word.html") : "/word.html";
    const dateKey = isValidDateKey(archiveDateKey) ? archiveDateKey : (activeDateKey || Core.getLocalDateKey(new Date()));
    const isArchivePreview = Boolean(archiveDateKey);
    const shareUrl = `${origin}${pathname}?id=${word.id}${isArchivePreview ? `&date=${dateKey}` : ""}`;
    const dateText = getArabicDateFromKey(dateKey);

    return `✨ ${isArchivePreview ? "كلمة من مخزون" : "كلمة اليوم"} من تطبيق "كَلِمات" ✨

الكلمة: ${word.word}
التاريخ: ${dateKey} (${dateText})
النطق: ${word.pronunciation || ""}
الضبط: ${word.vocalization} (وزن ${word.weight})
الجذر: ${word.root}
التصنيف: ${word.category}

المعنى والدلالة:
${word.meaning}

الشاهد الأدبي:
${word.example}

رابط الكلمة: ${shareUrl}

تعلم كلمة جديدة كل يوم وأثرِ مخزونك اللغوي!`;
}

function copyToClipboard(text) {
    const copy = navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject();
    copy.then(() => showToast("تم نسخ تفاصيل الكلمة إلى الحافظة!"))
        .catch(() => {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            let copied = false;
            if (typeof document.execCommand === "function") {
                try {
                    copied = document.execCommand("copy");
                } catch {}
            }
            textarea.remove();
            showToast(copied ? "تم نسخ تفاصيل الكلمة إلى الحافظة!" : "تعذّر النسخ؛ يرجى المحاولة مجدداً.");
        });
}

function startCountdown() {
    updateTimer();
    setInterval(updateTimer, 1000);
}

function updateTimer() {
    const now = new Date();
    const dateKey = Core.getLocalDateKey(now);
    if (dateKey !== activeDateKey) {
        activeDateKey = dateKey;
        renderTodayWord();
    }
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const diffMs = tomorrow - now;
    const hours = String(Math.floor(diffMs / 3600000)).padStart(2, "0");
    const minutes = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, "0");
    const seconds = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, "0");
    elCountdownTimer.textContent = `${hours}:${minutes}:${seconds}`;
}

if (typeof window !== "undefined") {
    window.KalimatApp = {
        speakText,
        stopSpeech,
        setupSpeech,
        setButtonSpeakingState,
        setButtonPlaybackState,
        announceAudioStatus,
        renderWord,
        renderTodayWord,
        loadState,
        saveState,
        getShareText,
        copyToClipboard,
        exportHistory,
        exportAnkiDeck,
        clearLearningData,
        renderSocialCard,
        startSpacedRepetitionReview,
        startPracticeQuiz: startSpacedRepetitionReview,
        flipFlashcard,
        handleRatingSubmission,
        updateDueReviewBadge,
        renderFlashcardStep,
        renderReviewCompletionSummary,
        renderEmptyReviewQueue,
        getActiveReviewQueue: () => activeReviewQueue,
        getActiveReviewIndex: () => activeReviewIndex,
        isFlashcardFlipped: () => isFlashcardFlipped,
        getSessionReviewStats: () => sessionReviewStats
    };
}
