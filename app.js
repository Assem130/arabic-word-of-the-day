// ponytail: shared word data loads locally from words.js before this script, avoiding fetch/CORS issues under file://


// App State Management (ponytail: native localStorage state to manage daily assignment & learned history)
let appState = {
    todayWord: null,
    todayDateString: "",
    learnedWords: []
};

const STORAGE_KEY = "arabic_words_state";

// DOM Elements
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
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const btnToggleMenu = document.getElementById("btn-toggle-menu");

const drawerHistory = document.getElementById("history-drawer");
const listHistory = document.getElementById("history-list");
const countHistoryBadge = document.getElementById("history-count");
const drawerEmptyMsg = document.getElementById("drawer-empty-msg");
const dropdownMenu = document.getElementById("app-menu-dropdown");

const toast = document.getElementById("toast");

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
    loadState();
    determineTodayWord();
    renderTodayWord();
    setupSpeech();
    setupEventListeners();
    startCountdown();
});

// Load state from localStorage (ponytail: standard JSON parsing from localStorage)
function loadState() {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
        try {
            appState = JSON.parse(savedState);
        } catch (e) {
            console.error("Failed to parse state, resetting", e);
        }
    }
    
    // Ensure lists exist
    if (!appState.learnedWords) {
        appState.learnedWords = [];
    }
}

// Save state back to localStorage
function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

// Determine the word of the day without repeating until all are exhausted
function determineTodayWord() {
    const today = new Date();
    const todayStr = getLocalDateKey(today);

    // If word is already set for today, just load it
    if (appState.todayDateString === todayStr && appState.todayWord) {
        // Double-check if the word still exists in database (defensive)
        const wordExists = WORDS_DB.find(w => w.id === appState.todayWord.id);
        if (wordExists) {
            appState.todayWord = wordExists;
            return;
        }
    }

    // Otherwise, pick a new word that has not been learned yet
    const learnedIds = appState.learnedWords.map(w => w.id);
    let unseenWords = WORDS_DB.filter(w => !learnedIds.includes(w.id));

    // If all words have been learned, reset the history pool but keep it in the history display
    if (unseenWords.length === 0) {
        // ponytail: reset cycle but preserve the history of what has been learned
        unseenWords = [...WORDS_DB];
    }

    // Pick a random word from unseen
    const randomIndex = Math.floor(Math.random() * unseenWords.length);
    const selectedWord = unseenWords[randomIndex];

    // Update state
    appState.todayWord = selectedWord;
    appState.todayDateString = todayStr;
    
    // Add to learned list if not already there
    if (!appState.learnedWords.some(w => w.id === selectedWord.id)) {
        appState.learnedWords.push({
            id: selectedWord.id,
            word: selectedWord.word,
            meaning: selectedWord.meaning,
            learnedDate: getFormattedArabicDate(today)
        });
    }

    saveState();
}

function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// Render the current word on the UI
function renderTodayWord() {
    const word = appState.todayWord;
    if (!word) return;

    elMainWord.innerText = word.word;
    if (elVocalization) elVocalization.innerText = word.vocalization || "";
    if (elWeight) elWeight.innerText = word.weight || "";
    if (elRoot) elRoot.innerText = word.root || "";
    if (elCategory) elCategory.innerText = word.category || "";
    elMeaning.innerText = word.meaning;
    
    // Highlight the word inside the example/blockquote if present
    const cleanWord = word.word.replace(/[\u064B-\u065F]/g, ""); // Strip tashkeel for matching
    let highlightedExample = word.example;
    
    // ponytail: simple regex matching for Arabic words without heavy diacritic stripping libs
    const wordPattern = new RegExp(cleanWord.split('').join('[\\u064B-\\u065F]*'), 'g');
    highlightedExample = highlightedExample.replace(wordPattern, (match) => `<span class="highlight-word">${match}</span>`);

    // Splitting example by dash to format the author name beautifully
    const parts = highlightedExample.split(" — ");
    if (parts.length > 1) {
        highlightedExample = `«${parts[0]}» <cite>— ${parts[1]}</cite>`;
    } else {
        highlightedExample = `«${highlightedExample}»`;
    }
    elExampleText.innerHTML = highlightedExample;

    // Set today's date label in readable format
    const today = new Date();
    elDateDisplay.innerText = getFormattedArabicDate(today);

    // Update history drawer count
    updateHistoryUI();
}

// Format date nicely in Arabic (e.g. "الأحد، ٢١ يونيو ٢٠٢٦")
function getFormattedArabicDate(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('ar-EG', options);
}

// Setup Speech Synthesis for classical pronunciation (ponytail: native SpeechSynthesis to speak word)
function setupSpeech() {
    btnSpeak.addEventListener("click", () => {
        if (!appState.todayWord) return;

        // Stop any currently playing speech
        window.speechSynthesis.cancel();

        // Create utterance with Tashkeel for perfect reading
        const utterance = new SpeechSynthesisUtterance(appState.todayWord.word);
        utterance.lang = "ar-SA"; // Saudi Arabic voice standard
        
        // Find best Arabic voice
        const voices = window.speechSynthesis.getVoices();
        const arVoice = voices.find(voice => voice.lang.startsWith("ar"));
        if (arVoice) {
            utterance.voice = arVoice;
        }

        utterance.rate = 0.75; // Slow down slightly for clarity & eloquence
        utterance.pitch = 1.0;

        // Button micro-animation when speaking
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

// Render history list inside the drawer
function updateHistoryUI() {
    const count = appState.learnedWords.length;
    countHistoryBadge.innerText = count;
    
    if (count === 0) {
        drawerEmptyMsg.style.display = "block";
        listHistory.innerHTML = "";
        return;
    }

    drawerEmptyMsg.style.display = "none";
    listHistory.innerHTML = "";

    // Show latest learned words first
    const reversedHistory = [...appState.learnedWords].reverse();
    
    reversedHistory.forEach(item => {
        const li = document.createElement("li");
        li.className = "history-item";
        // ponytail: build with textContent — history comes from tamperable localStorage, so never interpolate it into innerHTML
        const header = document.createElement("div");
        header.className = "history-item-header";
        const wordEl = document.createElement("span");
        wordEl.className = "history-word";
        wordEl.textContent = item.word;
        const dateEl = document.createElement("span");
        dateEl.className = "history-date";
        dateEl.textContent = item.learnedDate;
        header.append(wordEl, dateEl);
        const meaningEl = document.createElement("p");
        meaningEl.className = "history-meaning";
        meaningEl.textContent = item.meaning;
        li.append(header, meaningEl);

        // Click to view that word in detail
        li.addEventListener("click", () => {
            const originalWord = WORDS_DB.find(w => w.id === item.id);
            if (originalWord) {
                appState.todayWord = originalWord;
                renderTodayWord();
                // Close drawer on selection for better mobile experience
                drawerHistory.classList.remove("open");
            }
        });
        
        listHistory.appendChild(li);
    });
}

// Toast notification trigger
function showToast(message) {
    toast.innerText = message;
    toast.classList.add("show");
    
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

// Setup other event listeners
function setupEventListeners() {
    // Drawer toggle
    btnToggleHistory.addEventListener("click", (e) => {
        e.stopPropagation();
        drawerHistory.classList.add("open");
    });

    btnCloseDrawer.addEventListener("click", () => {
        drawerHistory.classList.remove("open");
    });

    // Menu toggle
    btnToggleMenu.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle("open");
    });

    // Close drawer and dropdown when clicking outside (ponytail: lightweight listener instead of complex modal backdrops)
    document.addEventListener("click", (e) => {
        if (!drawerHistory.contains(e.target) && 
            !btnToggleHistory.contains(e.target) && 
            drawerHistory.classList.contains("open")) {
            drawerHistory.classList.remove("open");
        }
        if (!dropdownMenu.contains(e.target) && 
            !btnToggleMenu.contains(e.target) && 
            dropdownMenu.classList.contains("open")) {
            dropdownMenu.classList.remove("open");
        }
    });

    // Copy Link / Copy Details button
    btnCopyLink.addEventListener("click", () => {
        const word = appState.todayWord;
        if (!word) return;
        
        const shareText = getShareText(word);
        copyToClipboard(shareText);
        dropdownMenu.classList.remove("open");
    });

    // Share word functionality (ponytail: native sharing API or clipboard fallback)
    btnShare.addEventListener("click", () => {
        const word = appState.todayWord;
        if (!word) return;

        const shareText = getShareText(word);
        dropdownMenu.classList.remove("open");

        if (navigator.share) {
            navigator.share({
                title: `كَلِمات | كلمة اليوم: ${word.word}`,
                text: shareText
            })
            .then(() => showToast("تمت المشاركة بنجاح!"))
            .catch(err => {
                // Ignore cancel errors
                if (err.name !== "AbortError") {
                    copyToClipboard(shareText);
                }
            });
        } else {
            copyToClipboard(shareText);
        }
    });
}

// ponytail: unified helper to compile share copy text
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
    const copy = navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(text)
        : Promise.reject();

    copy
        .then(() => {
            showToast("تم نسخ تفاصيل الكلمة إلى الحافظة!");
        })
        .catch(() => {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            const copied = document.execCommand("copy");
            textarea.remove();
            showToast(copied ? "تم نسخ تفاصيل الكلمة إلى الحافظة!" : "تعذّر النسخ؛ يرجى المحاولة مجدداً.");
        });
}

// Countdown timer to midnight (ponytail: simple setInterval timer to keep UI fresh and trigger updates)
function startCountdown() {
    updateTimer();
    setInterval(updateTimer, 1000);
}

function updateTimer() {
    const now = new Date();
    const tomorrow = new Date();
    
    // Set to next midnight
    tomorrow.setHours(24, 0, 0, 0);
    
    const diffMs = tomorrow - now;
    
    if (diffMs <= 0) {
        // Midnight reached! Pick a new word for today
        determineTodayWord();
        renderTodayWord();
        return;
    }
    
    const hours = String(Math.floor(diffMs / (1000 * 60 * 60))).padStart(2, '0');
    const minutes = String(Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
    const seconds = String(Math.floor((diffMs % (1000 * 60)) / 1000)).padStart(2, '0');
    
    elCountdownTimer.innerText = `${hours}:${minutes}:${seconds}`;
}
