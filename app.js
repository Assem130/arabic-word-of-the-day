// ponytail: words.js and app-core.js load before this script.
const Core = window.KalimatCore;
const STORAGE_KEY = "arabic_words_state";
const VALID_WORD_IDS = new Set(WORDS_DB.map(word => word.id));
let appState = Core.createDefaultState();
let currentWord = null;
let activeDateKey = "";

const elMainWord = document.getElementById("main-word");
const elDateDisplay = document.getElementById("date-display");
const elVocalization = document.getElementById("word-vocalization");
const elWeight = document.getElementById("word-weight");
const elRoot = document.getElementById("word-root");
const elCategory = document.getElementById("word-category");
const elMeaning = document.getElementById("word-meaning");
const elExampleText = document.getElementById("word-example-text");
const elCountdownTimer = document.getElementById("countdown-timer");
const btnSpeak = document.getElementById("btn-speak");
const btnShare = document.getElementById("btn-share");
const btnCopyLink = document.getElementById("btn-copy-link");
const btnToggleHistory = document.getElementById("btn-toggle-history");
const btnCloseHistory = document.getElementById("btn-close-history");
const btnToggleMenu = document.getElementById("btn-toggle-menu");
const btnToggleEnglish = document.getElementById("btn-toggle-english");
const btnExportHistory = document.getElementById("btn-export-history");
const btnImportHistory = document.getElementById("btn-import-history");
const inputImportHistory = document.getElementById("input-import-history");
const historyDialog = document.getElementById("history-dialog");
const listHistory = document.getElementById("history-list");
const countHistoryBadge = document.getElementById("history-count");
const drawerEmptyMsg = document.getElementById("drawer-empty-msg");
const dropdownMenu = document.getElementById("app-menu-dropdown");
const toast = document.getElementById("toast");

document.addEventListener("DOMContentLoaded", () => {
    loadState();
    activeDateKey = Core.getLocalDateKey(new Date());
    renderWord(determineTodayWord());
    setupSpeech();
    setupEventListeners();
    startCountdown();
});

function loadState() {
    const fallbackDate = Core.getLocalDateKey(new Date());
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        appState = Core.normalizeState(raw, VALID_WORD_IDS, fallbackDate);
        saveState();
    } catch {
        appState = Core.createDefaultState();
        document.getElementById("storage-warning").hidden = false;
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch {
        document.getElementById("storage-warning").hidden = false;
    }
}

function determineTodayWord(now = new Date()) {
    const dateKey = Core.getLocalDateKey(now);
    const word = WORDS_DB[Core.getDailyWordIndex(dateKey, WORDS_DB.length)];
    if (!appState.history[word.id]) appState.history[word.id] = { firstSeen: dateKey };
    saveState();
    return word;
}

function renderWord(word) {
    currentWord = word;
    elMainWord.textContent = word.word;
    elVocalization.textContent = word.vocalization;
    elWeight.textContent = word.weight;
    elRoot.textContent = word.root;
    elCategory.textContent = word.category;
    document.getElementById("word-pronunciation").textContent = word.pronunciation;
    elMeaning.textContent = word.meaning;
    const english = document.getElementById("word-meaning-en");
    english.textContent = word.englishMeaning;
    english.hidden = !appState.preferences.showEnglish;
    btnToggleEnglish.setAttribute("aria-pressed", String(appState.preferences.showEnglish));
    btnToggleEnglish.textContent = appState.preferences.showEnglish ? "إخفاء الإنجليزية" : "إظهار الإنجليزية";

    renderExample(word);
    elDateDisplay.textContent = getFormattedArabicDate(new Date());
    updateHistoryUI();
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

function getFormattedArabicDate(date) {
    return date.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function getArabicDateFromKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return getFormattedArabicDate(new Date(year, month - 1, day));
}

function setupSpeech() {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
        btnSpeak.disabled = true;
        btnSpeak.setAttribute("aria-label", "النطق غير متاح على هذا الجهاز");
        return;
    }

    btnSpeak.addEventListener("click", () => {
        if (!currentWord) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(currentWord.word);
        utterance.lang = "ar-SA";
        const arVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.startsWith("ar"));
        if (arVoice) utterance.voice = arVoice;
        utterance.rate = 0.75;
        utterance.pitch = 1;
        setSpeaking(true);
        utterance.onend = utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
    });
}

function setSpeaking(isSpeaking) {
    const icon = isSpeaking ? "i-waveform" : "i-volume-high";
    btnSpeak.innerHTML = `<svg class="icon"><use href="#${icon}"/></svg>`;
    btnSpeak.classList.toggle("speaking", isSpeaking);
}

function updateHistoryUI() {
    const history = Object.entries(appState.history)
        .map(([id, record]) => ({ word: WORDS_DB.find(item => item.id === Number(id)), firstSeen: record.firstSeen }))
        .filter(item => item.word)
        .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
    countHistoryBadge.textContent = String(history.length);
    drawerEmptyMsg.hidden = history.length !== 0;
    listHistory.replaceChildren();

    for (const item of history) {
        const li = document.createElement("li");
        li.className = "history-item";
        const button = document.createElement("button");
        button.type = "button";
        const header = document.createElement("div");
        header.className = "history-item-header";
        const wordEl = document.createElement("span");
        wordEl.className = "history-word";
        wordEl.textContent = item.word.word;
        const dateEl = document.createElement("span");
        dateEl.className = "history-date";
        dateEl.textContent = getArabicDateFromKey(item.firstSeen);
        const meaningEl = document.createElement("p");
        meaningEl.className = "history-meaning";
        meaningEl.textContent = item.word.meaning;
        header.append(wordEl, dateEl);
        button.append(header, meaningEl);
        button.addEventListener("click", () => {
            renderWord(item.word);
            historyDialog.close();
        });
        li.appendChild(button);
        listHistory.appendChild(li);
    }
}

function exportHistory() {
    const blob = new Blob([Core.serializeBackup(appState)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kalimat-history-${Core.getLocalDateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("تم تصدير المخزون.");
}

async function importHistory(file) {
    try {
        const incoming = Core.parseBackup(await file.text(), VALID_WORD_IDS);
        appState = Core.mergeStates(appState, incoming, VALID_WORD_IDS);
        saveState();
        updateHistoryUI();
        showToast("تم دمج المخزون بنجاح.");
    } catch (error) {
        showToast(error.message === "Unsupported backup version."
            ? "إصدار ملف المخزون غير مدعوم."
            : "ملف المخزون غير صالح.");
    }
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}

function setupEventListeners() {
    btnToggleHistory.addEventListener("click", () => historyDialog.showModal());
    btnCloseHistory.addEventListener("click", () => historyDialog.close());
    btnToggleMenu.addEventListener("click", event => {
        event.stopPropagation();
        dropdownMenu.classList.toggle("open");
    });
    document.addEventListener("click", event => {
        if (!dropdownMenu.contains(event.target) && !btnToggleMenu.contains(event.target)) dropdownMenu.classList.remove("open");
    });
    btnToggleEnglish.addEventListener("click", () => {
        appState.preferences.showEnglish = !appState.preferences.showEnglish;
        saveState();
        renderWord(currentWord);
    });
    btnExportHistory.addEventListener("click", exportHistory);
    btnImportHistory.addEventListener("click", () => inputImportHistory.click());
    inputImportHistory.addEventListener("change", async () => {
        const [file] = inputImportHistory.files;
        if (file) await importHistory(file);
        inputImportHistory.value = "";
    });
    btnCopyLink.addEventListener("click", () => {
        if (currentWord) copyToClipboard(getShareText(currentWord));
        dropdownMenu.classList.remove("open");
    });
    btnShare.addEventListener("click", () => {
        if (!currentWord) return;
        const shareText = getShareText(currentWord);
        dropdownMenu.classList.remove("open");
        if (navigator.share) {
            navigator.share({ title: `كَلِمات | كلمة اليوم: ${currentWord.word}`, text: shareText })
                .then(() => showToast("تمت المشاركة بنجاح!"))
                .catch(error => { if (error.name !== "AbortError") copyToClipboard(shareText); });
        } else {
            copyToClipboard(shareText);
        }
    });
}

function getShareText(word) {
    return `✨ كلمة اليوم من تطبيق "كَلِمات" ✨

الكلمة: ${word.word}
النطق: ${word.pronunciation || ""}
الضبط: ${word.vocalization} (وزن ${word.weight})
الجذر: ${word.root}
التصنيف: ${word.category}

المعنى والدلالة:
${word.meaning}

الشاهد الأدبي:
${word.example}

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
        renderWord(determineTodayWord(now));
    }
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const diffMs = tomorrow - now;
    const hours = String(Math.floor(diffMs / 3600000)).padStart(2, "0");
    const minutes = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, "0");
    const seconds = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, "0");
    elCountdownTimer.textContent = `${hours}:${minutes}:${seconds}`;
}
