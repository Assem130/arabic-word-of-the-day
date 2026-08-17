(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.KalimatCore = api;
    if (typeof root === "object" && root !== null) {
        root.setupThemeController = api.setupThemeController;
    }
})(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";

    const SCHEMA_VERSION = 2;
    const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

    function setupThemeController() {
        const THEME_KEY = "kalimat_theme";
        const VALID_THEMES = new Set(["paper", "emerald", "midnight"]);
        let theme = "paper";
        try {
            if (typeof localStorage !== "undefined") {
                const saved = localStorage.getItem(THEME_KEY);
                if (saved && VALID_THEMES.has(saved)) {
                    theme = saved;
                }
            }
        } catch {
            theme = "paper";
        }

        if (typeof document !== "undefined" && document.documentElement && typeof document.documentElement.setAttribute === "function") {
            document.documentElement.setAttribute("data-theme", theme);
        }

        if (typeof document !== "undefined" && typeof document.getElementById === "function") {
            const selectEl = document.getElementById("theme-select");
            if (selectEl) {
                selectEl.value = theme;
                selectEl.addEventListener("change", (e) => {
                    const selected = (e.target && e.target.value !== undefined) ? e.target.value : selectEl.value;
                    if (VALID_THEMES.has(selected)) {
                        theme = selected;
                        if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
                            document.documentElement.setAttribute("data-theme", theme);
                        }
                        try {
                            if (typeof localStorage !== "undefined") {
                                localStorage.setItem(THEME_KEY, theme);
                            }
                        } catch {
                            // Safe fallback for restricted storage environments
                        }
                    }
                });
            }
        }
    }

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

    function calculateStreak(historyOrDates, todayKey) {
        if (!isDateKey(todayKey)) {
            return { currentStreak: 0, maxStreak: 0, isTodayVisited: false };
        }

        const dateSet = new Set();
        if (historyOrDates) {
            if (Array.isArray(historyOrDates)) {
                for (const item of historyOrDates) {
                    if (typeof item === "string" && isDateKey(item)) {
                        dateSet.add(item);
                    } else if (item && typeof item === "object") {
                        if (typeof item.firstSeen === "string" && isDateKey(item.firstSeen)) {
                            dateSet.add(item.firstSeen);
                        } else if (typeof item.date === "string" && isDateKey(item.date)) {
                            dateSet.add(item.date);
                        }
                    }
                }
            } else if (historyOrDates instanceof Set) {
                for (const item of historyOrDates) {
                    if (typeof item === "string" && isDateKey(item)) {
                        dateSet.add(item);
                    }
                }
            } else if (typeof historyOrDates === "object") {
                for (const val of Object.values(historyOrDates)) {
                    if (typeof val === "string" && isDateKey(val)) {
                        dateSet.add(val);
                    } else if (val && typeof val === "object") {
                        if (typeof val.firstSeen === "string" && isDateKey(val.firstSeen)) {
                            dateSet.add(val.firstSeen);
                        } else if (typeof val.date === "string" && isDateKey(val.date)) {
                            dateSet.add(val.date);
                        }
                    }
                }
            }
        }

        if (dateSet.size === 0) {
            return { currentStreak: 0, maxStreak: 0, isTodayVisited: false };
        }

        const ordinals = Array.from(dateSet).map(d => {
            const [y, m, day] = d.split("-").map(Number);
            return Math.floor(Date.UTC(y, m - 1, day) / 86400000);
        });

        const ordinalSet = new Set(ordinals);
        const [ty, tm, td] = todayKey.split("-").map(Number);
        const todayOrdinal = Math.floor(Date.UTC(ty, tm - 1, td) / 86400000);

        const isTodayVisited = ordinalSet.has(todayOrdinal);

        let currentStreak = 0;
        let startOrdinal = null;
        if (isTodayVisited) {
            startOrdinal = todayOrdinal;
        } else if (ordinalSet.has(todayOrdinal - 1)) {
            startOrdinal = todayOrdinal - 1;
        }

        if (startOrdinal !== null) {
            let curr = startOrdinal;
            while (ordinalSet.has(curr)) {
                currentStreak++;
                curr--;
            }
        }

        const sortedUniqueOrdinals = Array.from(ordinalSet).sort((a, b) => a - b);
        let maxStreak = 0;
        let runningStreak = 0;
        let prev = null;
        for (const ord of sortedUniqueOrdinals) {
            if (prev === null || ord === prev + 1) {
                runningStreak++;
            } else {
                runningStreak = 1;
            }
            if (runningStreak > maxStreak) {
                maxStreak = runningStreak;
            }
            prev = ord;
        }

        return {
            currentStreak,
            maxStreak,
            isTodayVisited
        };
    }

    function formatStreakText(count) {
        const num = Number(count);
        if (!Number.isInteger(num) || num <= 0) {
            return "لا يوجد تتابع بعد";
        }
        if (num === 1) {
            return "يوم واحد";
        }
        if (num === 2) {
            return "يومان";
        }
        if (num >= 3 && num <= 10) {
            return `${num} أيام`;
        }
        return `${num} يوماً`;
    }

    function serializeAnkiCSV(history, words) {
        let wordsList = [];
        if (Array.isArray(history) && (words === undefined || !Array.isArray(words))) {
            wordsList = history;
        } else if (Array.isArray(words)) {
            if (history && typeof history === "object") {
                const targetIds = new Set();
                if (Array.isArray(history)) {
                    for (const item of history) {
                        if (item && typeof item === "object" && Number.isInteger(item.id)) {
                            targetIds.add(item.id);
                        } else if (Number.isInteger(Number(item))) {
                            targetIds.add(Number(item));
                        }
                    }
                } else {
                    for (const id of Object.keys(history)) {
                        const numId = Number(id);
                        if (Number.isInteger(numId)) targetIds.add(numId);
                    }
                }
                wordsList = words.filter(w => w && targetIds.has(w.id));
            } else {
                wordsList = words;
            }
        } else if (Array.isArray(history)) {
            wordsList = history;
        }

        const headers = ["Word", "Root", "Weight", "Vocalization", "Meaning", "English Meaning", "Example"];
        const escapeField = val => `"${String(val ?? "").replace(/"/g, '""')}"`;
        const rows = [headers.map(escapeField).join(",")];
        for (const w of wordsList) {
            if (!w || typeof w !== "object") continue;
            rows.push([
                w.word,
                w.root,
                w.weight,
                w.vocalization,
                w.meaning,
                w.englishMeaning,
                w.example
            ].map(escapeField).join(","));
        }
        return `\uFEFF${rows.join("\r\n")}\r\n`;
    }

    function generateAnkiCsv(historyOrWords, words) {
        return serializeAnkiCSV(historyOrWords, words);
    }

    function parseWordIdFromQuery(searchStringOrParams, maxWords = 60) {
        if (!searchStringOrParams) return null;
        let rawId = null;
        if (typeof searchStringOrParams === "string") {
            let search = searchStringOrParams;
            const qIndex = search.indexOf("?");
            if (qIndex !== -1) search = search.slice(qIndex + 1);
            if (typeof URLSearchParams !== "undefined") {
                const params = new URLSearchParams(search);
                rawId = params.get("id");
            } else {
                const match = search.match(/(?:^|&)id=([^&]*)/);
                rawId = match ? decodeURIComponent(match[1]) : null;
            }
        } else if ((typeof URLSearchParams !== "undefined" && searchStringOrParams instanceof URLSearchParams) || (typeof searchStringOrParams === "object" && typeof searchStringOrParams.get === "function")) {
            rawId = searchStringOrParams.get("id");
        } else if (typeof searchStringOrParams === "object" && searchStringOrParams.id !== undefined) {
            rawId = String(searchStringOrParams.id);
        }

        if (typeof rawId !== "string" || !/^\d+$/.test(rawId)) {
            return null;
        }

        const id = parseInt(rawId, 10);
        const max = Number.isInteger(maxWords) && maxWords >= 1 ? maxWords : 60;
        if (id < 1 || id > max) {
            return null;
        }
        return id;
    }

    function resolveWordSelection(searchParams, wordsDb, todayDateKey) {
        if (!Array.isArray(wordsDb) || wordsDb.length === 0) return null;
        const requestedId = parseWordIdFromQuery(searchParams, wordsDb.length);

        if (requestedId !== null) {
            const found = wordsDb.find(item => item.id === requestedId);
            if (found) {
                return { word: found, isDeepLink: true, requestedId };
            }
        }

        const dateKey = isDateKey(todayDateKey) ? todayDateKey : getLocalDateKey(new Date());
        const index = getDailyWordIndex(dateKey, wordsDb.length);
        return { word: wordsDb[index], isDeepLink: false, requestedId: null };
    }

    function createDefaultState() {
        return {
            version: SCHEMA_VERSION,
            schemaVersion: SCHEMA_VERSION,
            srs: {},
            history: {},
            favorites: {},
            preferences: {
                showEnglish: true,
                speechRate: 0.85,
                speechRepeat: 1,
                dailyReviewLimit: 20
            }
        };
    }

    function isHistoryRecord(record) {
        return !!record && typeof record === "object" && !Array.isArray(record) && isDateKey(record.firstSeen);
    }

    function isCurrentState(raw) {
        return !!raw && typeof raw === "object" && !Array.isArray(raw)
            && raw.schemaVersion === SCHEMA_VERSION
            && raw.srs && typeof raw.srs === "object" && !Array.isArray(raw.srs)
            && raw.history && typeof raw.history === "object" && !Array.isArray(raw.history)
            && (!raw.favorites || (typeof raw.favorites === "object" && !Array.isArray(raw.favorites)))
            && raw.preferences && typeof raw.preferences === "object" && !Array.isArray(raw.preferences)
            && typeof raw.preferences.showEnglish === "boolean"
            && Object.entries(raw.history).every(([id, record]) => Number.isInteger(Number(id)) && isHistoryRecord(record));
    }

    function isV1State(raw) {
        return !!raw && typeof raw === "object" && !Array.isArray(raw)
            && raw.schemaVersion === 1
            && raw.history && typeof raw.history === "object" && !Array.isArray(raw.history)
            && (!raw.favorites || (typeof raw.favorites === "object" && !Array.isArray(raw.favorites)))
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
        return migrateState(raw, fallbackDate, validIds);
    }

    function inspectStoredState(raw, validIds, fallbackDate) {
        if (raw === null || raw === undefined) return { state: createDefaultState(), canPersist: true };
        if (isCurrentState(raw) || isV1State(raw) || isLegacyState(raw) || (raw && raw.schemaVersion === 2)) {
            return { state: normalizeState(raw, validIds, fallbackDate), canPersist: true };
        }
        return { state: createDefaultState(), canPersist: false };
    }

    function resetCorruptedStorage() {
        return { state: createDefaultState(), canPersist: true };
    }

    function mergeStates(local, incoming, validIds) {
        const fallback = getLocalDateKey(new Date());
        const merged = migrateState(local, fallback, validIds);
        const other = migrateState(incoming, fallback, validIds);
        for (const [id, record] of Object.entries(other.history)) {
            const current = merged.history[id];
            if (!current || record.firstSeen < current.firstSeen) merged.history[id] = record;
        }
        for (const [id, val] of Object.entries(other.favorites || {})) {
            if (val) merged.favorites[id] = true;
        }
        for (const [id, incomingItem] of Object.entries(other.srs || {})) {
            const currentItem = merged.srs[id];
            if (!currentItem) {
                merged.srs[id] = incomingItem;
                continue;
            }
            const incomingDate = isDateKey(incomingItem.lastReviewedDate) ? incomingItem.lastReviewedDate : "";
            const currentDate = isDateKey(currentItem.lastReviewedDate) ? currentItem.lastReviewedDate : "";
            if (incomingDate > currentDate || (incomingDate === currentDate && incomingItem.reviewCount > currentItem.reviewCount)) {
                merged.srs[id] = incomingItem;
            }
        }
        return merged;
    }

    function parseBackup(text, validIds) {
        let raw;
        try { raw = JSON.parse(text); } catch { throw new Error("Invalid backup file."); }
        if (!raw || (raw.schemaVersion !== 1 && raw.schemaVersion !== SCHEMA_VERSION)) throw new Error("Unsupported backup version.");
        if (raw.schemaVersion === 1 && !isV1State(raw)) throw new Error("Invalid backup file.");
        if (raw.schemaVersion === SCHEMA_VERSION && !isCurrentState(raw)) throw new Error("Invalid backup file.");
        return migrateState(raw, getLocalDateKey(new Date()), validIds);
    }

    function serializeBackup(state) {
        return `${JSON.stringify(state, null, 2)}\n`;
    }

    function extractSpokenText(quote) {
        if (typeof quote !== "string" || !quote.trim()) return "";
        let text = quote.split(/\s*[-—–―‒]{2,}\s*|\s*[—–―‒]\s*|\s+-\s+/)[0];
        text = text
            .replace(/\[[^\]]*\]/g, "")
            .replace(/\([^)]*\)/g, "")
            .replace(/〔[^〕]*〕/g, "")
            .replace(/【[^】]*】/g, "")
            .replace(/⟨[^⟩]*⟩/g, "")
            .replace(/⟦[^⟧]*⟧/g, "");
        text = text.replace(/[\u00B9\u00B2\u00B3\u2070\u2074-\u2079\u2080-\u2089†‡*]/g, "");
        text = text.replace(/[\u0640\u200B-\u200F\uFEFF\u00AD\u202A-\u202E\u2066-\u2069\u061C]/g, "");
        text = text.replace(/[\u06D6-\u06ED]/g, "");
        text = text.replace(/[«»"“”„‟‹›‘’'`﴿﴾]/g, "");
        text = text.replace(/\s*(?:\.{2,}|\u2026|(?:\.\s+){2,}\.)\s*/g, "، ");
        return text
            .replace(/\s*([،,؛:!?.])\s*/g, "$1 ")
            .replace(/([،,])\s*([،,])+/g, "$1")
            .replace(/\s*([،,])\s*([.!?؛])/g, "$2")
            .replace(/\s+/g, " ")
            .replace(/^\s*[،,؛:\-–—.]+\s*/, "")
            .replace(/\s*[،,؛:\-–—]+\s*$/, "")
            .trim();
    }

    function formatWordCitation(word) {
        if (!word || typeof word !== "object") return "";
        return `«${word.word}» (${word.vocalization})\nالوزن: ${word.weight} | الجذر: ${word.root}\nالمعنى: ${word.meaning}\nالشاهد: ${word.example}\n— عبر كَلِمات`;
    }

    function generateQuizQuestions(historyOrIds, wordsDb, questionCount = 3) {
        if (!Array.isArray(wordsDb) || wordsDb.length === 0) return [];
        const count = Math.min(questionCount, wordsDb.length);
        const targetWordIds = [];

        if (Array.isArray(historyOrIds)) {
            for (const item of historyOrIds) {
                const id = typeof item === "object" && item !== null ? item.id : Number(item);
                if (Number.isInteger(id) && wordsDb.some(w => w.id === id) && !targetWordIds.includes(id)) {
                    targetWordIds.push(id);
                }
            }
        } else if (historyOrIds && typeof historyOrIds === "object") {
            for (const key of Object.keys(historyOrIds)) {
                const id = Number(key);
                if (Number.isInteger(id) && wordsDb.some(w => w.id === id) && !targetWordIds.includes(id)) {
                    targetWordIds.push(id);
                }
            }
        }

        // Shuffle candidate IDs
        const shuffledTargets = [...targetWordIds].sort(() => 0.5 - Math.random());

        // Fallback: Pad targets with other words from DB if count < requested count
        if (shuffledTargets.length < count) {
            const remaining = wordsDb.map(w => w.id).filter(id => !shuffledTargets.includes(id));
            remaining.sort(() => 0.5 - Math.random());
            shuffledTargets.push(...remaining.slice(0, count - shuffledTargets.length));
        }

        const selectedIds = shuffledTargets.slice(0, count);
        const questionTypes = ["meaning", "root", "weight"];
        const questions = [];

        for (let i = 0; i < selectedIds.length; i++) {
            const targetId = selectedIds[i];
            const target = wordsDb.find(w => w.id === targetId);
            if (!target) continue;

            const qType = questionTypes[i % questionTypes.length];
            let prompt = "";
            let correctAnswer = "";
            let getOptionValue = w => "";

            if (qType === "root") {
                prompt = `ما جذر كلمة «${target.word}»؟`;
                correctAnswer = target.root;
                getOptionValue = w => w.root;
            } else if (qType === "weight") {
                prompt = `ما الوزن الصرفي لكلمة «${target.word}»؟`;
                correctAnswer = target.weight;
                getOptionValue = w => w.weight;
            } else {
                prompt = `ما معنى كلمة «${target.word}»؟`;
                correctAnswer = target.meaning;
                getOptionValue = w => w.meaning;
            }

            // Gather distinct distractors
            const distractors = [];
            const otherWords = wordsDb.filter(w => w.id !== target.id).sort(() => 0.5 - Math.random());
            for (const other of otherWords) {
                const val = getOptionValue(other);
                if (val && val !== correctAnswer && !distractors.includes(val)) {
                    distractors.push(val);
                    if (distractors.length >= 3) break;
                }
            }

            const allOptions = [correctAnswer, ...distractors].sort(() => 0.5 - Math.random());
            const correctIndex = allOptions.indexOf(correctAnswer);

            questions.push({
                wordId: target.id,
                word: target.word,
                vocalization: target.vocalization,
                type: qType,
                prompt,
                options: allOptions,
                correctIndex,
                explanation: `«${target.word}» (${target.vocalization}): ${target.meaning} (الجذر: ${target.root}، الوزن: ${target.weight})`
            });
        }
        return questions;
    }

    function normalizeArabicText(text) {
        if (typeof text !== "string") return "";
        return text
            .replace(/\u0640/g, "") // Tatweel
            .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // Tashkeel / Diacritics
            .replace(/[أإآٱ]/g, "ا") // Alef variants
            .replace(/ى/g, "ي") // Alif Maqsura
            .trim();
    }

    function searchLexicon(query, wordsDb) {
        if (!Array.isArray(wordsDb) || wordsDb.length === 0) return [];
        const rawQ = typeof query === "string" ? query.trim() : "";
        if (!rawQ) return [...wordsDb];
        const normQ = normalizeArabicText(rawQ).toLowerCase();
        const compactQ = normQ.replace(/\s+/g, "");

        return wordsDb.filter(w => {
            if (!w || typeof w !== "object") return false;
            const normWord = normalizeArabicText(w.word);
            const normRoot = normalizeArabicText(w.root);
            const compactRoot = normRoot.replace(/\s+/g, "");
            const normWeight = normalizeArabicText(w.weight);
            const normCategory = normalizeArabicText(w.category);
            const normMeaning = normalizeArabicText(w.meaning);
            const normEnglish = String(w.englishMeaning || "").toLowerCase();

            return normWord.includes(normQ)
                || compactRoot.includes(compactQ)
                || normRoot.includes(normQ)
                || normWeight.includes(normQ)
                || normCategory.includes(normQ)
                || normMeaning.includes(normQ)
                || normEnglish.includes(rawQ.toLowerCase());
        });
    }

    function findRelatedWords(targetWord, wordsDb) {
        if (!targetWord || !Array.isArray(wordsDb)) return { sameRoot: [], sameWeight: [] };
        const normRoot = normalizeArabicText(targetWord.root).replace(/\s+/g, "");
        const normWeight = normalizeArabicText(targetWord.weight);

        const sameRoot = [];
        const sameWeight = [];

        for (const w of wordsDb) {
            if (!w || w.id === targetWord.id) continue;
            const wRoot = normalizeArabicText(w.root).replace(/\s+/g, "");
            const wWeight = normalizeArabicText(w.weight);

            if (normRoot && wRoot === normRoot) {
                sameRoot.push(w);
            } else if (normWeight && wWeight === normWeight) {
                sameWeight.push(w);
            }
        }

        return { sameRoot, sameWeight };
    }

    function isArabicVoice(voice) {
        if (!voice || typeof voice !== "object") return false;
        if (typeof voice.lang !== "string") return false;
        const lang = voice.lang.trim().toLowerCase().replace(/_/g, "-");
        return lang === "ar" || lang.startsWith("ar-")
            || lang === "ara" || lang.startsWith("ara-")
            || lang === "arb" || lang.startsWith("arb-");
    }

    function scoreArabicVoice(voice) {
        if (!isArabicVoice(voice)) return -1;

        let score = 100;
        const lang = (voice.lang || "").trim().toLowerCase().replace(/_/g, "-");
        const name = String(voice.name || "").toLowerCase();
        const uri = String(voice.voiceURI || "").toLowerCase();
        const combined = `${name} ${uri}`;

        if (lang === "ar-sa" || lang === "ara-sa" || lang === "arb-sa" || lang === "ar-001" || lang === "ara-001" || lang === "arb-001") {
            score += 30;
        } else if (lang === "ar-xa" || lang === "ara-xa" || lang === "arb-xa") {
            score += 28;
        } else if (lang === "ar-eg" || lang === "ara-eg") {
            score += 25;
        } else if (lang === "ar-ae" || lang === "ara-ae") {
            score += 25;
        } else if (lang === "ar-kw" || lang === "ar-qa" || lang === "ar-bh" || lang === "ar-om" || lang === "ar-jo" || lang === "ar-lb") {
            score += 20;
        } else if (lang.startsWith("ar-") || lang.startsWith("ara-") || lang.startsWith("arb-")) {
            score += 15;
        } else {
            score += 5;
        }

        if (combined.includes("natural") || /طبيعي|طبيعية|عصبي/.test(combined)) score += 60;
        if (combined.includes("neural")) score += 60;
        if (combined.includes("online") || combined.includes("سحابي") || voice.localService === false) score += 40;
        if (combined.includes("enhanced") || combined.includes("premium") || combined.includes("studio") || combined.includes("wavenet") || combined.includes("neural2") || /محسن|مطور|فائق|احترافي/.test(combined)) {
            score += 50;
        }

        if (/naayf|hoda|shakir|fatima|hamed|salma|zariyah|zeina|نايف|هدى|شاكر|فاطمة|حامد|سلمى|زرية|زينة/.test(combined)) {
            score += 35;
        }
        if (/maged|majid|tarik|tariq|laila|layla|mariam|maryam|siri|ماجد|طارق|ليلى|مريم|سيري/.test(combined)) {
            score += 35;
        }
        if (combined.includes("google") || /جوجل|غوغل/.test(combined)) {
            score += 30;
        }
        if (combined.includes("samsung") || /سامسونج|سامسونغ/.test(combined)) {
            score += 20;
        }

        if (voice.default === true) {
            score += 2;
        }

        return score;
    }

    function filterArabicVoices(voices) {
        if (!Array.isArray(voices)) return [];
        return voices
            .filter(isArabicVoice)
            .sort((a, b) => scoreArabicVoice(b) - scoreArabicVoice(a));
    }

    function findBestArabicVoice(voices) {
        const sorted = filterArabicVoices(voices);
        return sorted.length > 0 ? sorted[0] : null;
    }

    function getHumanAudioUrl(item, type = "word") {
        if (!item) return "";
        const isExample = type === "example";
        if (typeof item === "object" && item !== null) {
            if (isExample) {
                if (typeof item.exampleAudioUrl === "string" && item.exampleAudioUrl.trim()) {
                    return item.exampleAudioUrl.trim();
                }
                if (typeof item.exampleAudio === "string" && item.exampleAudio.trim()) {
                    return item.exampleAudio.trim();
                }
                if (Number.isInteger(item.id) && item.id >= 1) {
                    return `assets/audio/examples/${item.id}.mp3`;
                }
            } else {
                if (typeof item.audioUrl === "string" && item.audioUrl.trim()) {
                    return item.audioUrl.trim();
                }
                if (typeof item.audio === "string" && item.audio.trim()) {
                    return item.audio.trim();
                }
                if (Number.isInteger(item.id) && item.id >= 1) {
                    return `assets/audio/words/${item.id}.mp3`;
                }
            }
        } else if (Number.isInteger(Number(item)) && Number(item) >= 1) {
            const numId = Number(item);
            return isExample ? `assets/audio/examples/${numId}.mp3` : `assets/audio/words/${numId}.mp3`;
        }
        return "";
    }

    function getNaturalAudioUrl(text) {
        // Local-first policy: remote TTS is intentionally disabled.
        return "";
    }

    function addDaysToDateKey(dateKey, days) {
        if (!isDateKey(dateKey)) {
            dateKey = getLocalDateKey(new Date());
        }
        const numDays = Number.isInteger(days) ? days : Math.round(Number(days) || 0);
        const [y, m, d] = dateKey.split("-").map(Number);
        const date = new Date(Date.UTC(y, m - 1, d + numDays));
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function getDaysDifference(dateKey1, dateKey2) {
        if (!isDateKey(dateKey1) || !isDateKey(dateKey2)) return 0;
        const [y1, m1, d1] = dateKey1.split("-").map(Number);
        const [y2, m2, d2] = dateKey2.split("-").map(Number);
        const ord1 = Math.floor(Date.UTC(y1, m1 - 1, d1) / 86400000);
        const ord2 = Math.floor(Date.UTC(y2, m2 - 1, d2) / 86400000);
        return ord2 - ord1;
    }

    function mapRatingToGrade(rating) {
        if (typeof rating === "number") {
            if (isNaN(rating)) return 4;
            const clamped = Math.min(5, Math.max(0, Math.round(rating)));
            return clamped;
        }
        if (typeof rating === "string") {
            const trimmed = rating.trim().toLowerCase();
            if (/^\d+$/.test(trimmed)) {
                const parsed = parseInt(trimmed, 10);
                return Math.min(5, Math.max(0, parsed));
            }
            if (trimmed === "again" || trimmed === "أعد" || trimmed === "اعد" || trimmed === "مجددا" || trimmed === "مجدداً") return 1;
            if (trimmed === "hard" || trimmed === "صعب") return 3;
            if (trimmed === "good" || trimmed === "جيد") return 4;
            if (trimmed === "easy" || trimmed === "سهل") return 5;
        }
        return 4;
    }

    function createDefaultSrsItem(wordId, initialDateKey) {
        const dateKey = isDateKey(initialDateKey) ? initialDateKey : getLocalDateKey(new Date());
        return {
            wordId: Number(wordId),
            repetition: 0,
            interval: 0,
            ef: 2.5,
            nextReviewDate: dateKey,
            lastReviewedDate: null,
            reviewCount: 0,
            lapses: 0,
            history: []
        };
    }

    function calculateNextReview(item, rating, reviewDateKey) {
        const q = mapRatingToGrade(rating);
        const dateKey = isDateKey(reviewDateKey) ? reviewDateKey : getLocalDateKey(new Date());

        const prevRepetition = (item && Number.isInteger(item.repetition) && item.repetition >= 0) ? item.repetition : 0;
        const prevInterval = (item && typeof item.interval === "number" && item.interval >= 0) ? item.interval : 0;
        const prevEf = (item && typeof item.ef === "number" && !isNaN(item.ef) && item.ef >= 1.3) ? item.ef : 2.5;
        const prevLapses = (item && Number.isInteger(item.lapses) && item.lapses >= 0) ? item.lapses : 0;
        const prevReviewCount = (item && Number.isInteger(item.reviewCount) && item.reviewCount >= 0) ? item.reviewCount : 0;
        const prevHistory = (item && Array.isArray(item.history)) ? [...item.history] : [];

        // Calculate new Easiness Factor (EF)
        // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
        const rawEf = prevEf + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
        const roundedEf = Math.round(rawEf * 100) / 100;
        const newEf = Math.max(1.3, roundedEf);

        let newRepetition = 0;
        let newInterval = 1;
        let newLapses = prevLapses;

        const ratingStr = typeof rating === "string" ? rating.toLowerCase().trim() : "";

        if (q < 3) {
            // Recall failure / Lapse: reset repetition to 0, interval to 1 day, increment lapses
            newRepetition = 0;
            newInterval = 1;
            newLapses = prevLapses + 1;
        } else {
            // Successful recall (q >= 3)
            if (prevRepetition === 0) {
                newInterval = 1;
            } else if (prevRepetition === 1) {
                newInterval = 6;
            } else {
                newInterval = Math.round(prevInterval * newEf);
            }
            newRepetition = prevRepetition + 1;
        }

        const nextReviewDate = addDaysToDateKey(dateKey, newInterval);
        const lastReviewedDate = dateKey;

        const canonicalRating = ratingStr || (q === 1 ? "again" : q === 3 ? "hard" : q === 4 ? "good" : q === 5 ? "easy" : String(q));
        const historyEntry = {
            date: dateKey,
            grade: q,
            rating: canonicalRating,
            interval: newInterval,
            ef: newEf
        };

        const updatedHistory = [...prevHistory, historyEntry].slice(-50);

        const result = {
            repetition: newRepetition,
            interval: newInterval,
            ef: newEf,
            nextReviewDate,
            lastReviewedDate,
            reviewCount: prevReviewCount + 1,
            lapses: newLapses,
            historyEntry,
            history: updatedHistory
        };

        if (item && item.wordId !== undefined) {
            result.wordId = Number(item.wordId);
        }

        return result;
    }

    function calculateSM2(item, rating, reviewDateKey) {
        return calculateNextReview(item, rating, reviewDateKey);
    }

    function migrateState(rawState, currentDateKey, validIds = null) {
        const fallbackDate = isDateKey(currentDateKey) ? currentDateKey : getLocalDateKey(new Date());

        let raw = rawState;
        if (typeof raw === "string") {
            try {
                raw = JSON.parse(raw);
            } catch {
                raw = null;
            }
        }

        const state = {
            version: 2,
            schemaVersion: 2,
            srs: {},
            history: {},
            favorites: {},
            preferences: {
                showEnglish: true,
                speechRate: 0.85,
                speechRepeat: 1,
                dailyReviewLimit: 20
            }
        };

        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            return state;
        }

        // 1. Migrate / Copy Preferences
        if (raw.preferences && typeof raw.preferences === "object" && !Array.isArray(raw.preferences)) {
            if (typeof raw.preferences.showEnglish === "boolean") {
                state.preferences.showEnglish = raw.preferences.showEnglish;
            }
            if (typeof raw.preferences.speechRate === "number" && raw.preferences.speechRate >= 0.5 && raw.preferences.speechRate <= 1.5) {
                state.preferences.speechRate = raw.preferences.speechRate;
            }
            if (typeof raw.preferences.speechRepeat === "number" && (raw.preferences.speechRepeat === 1 || raw.preferences.speechRepeat === 3)) {
                state.preferences.speechRepeat = raw.preferences.speechRepeat;
            }
            if (typeof raw.preferences.dailyReviewLimit === "number" && raw.preferences.dailyReviewLimit >= 1) {
                state.preferences.dailyReviewLimit = Math.round(raw.preferences.dailyReviewLimit);
            }
        }

        // 2. Migrate / Copy Favorites
        if (raw.favorites) {
            if (Array.isArray(raw.favorites)) {
                for (const item of raw.favorites) {
                    const id = Number(typeof item === "object" && item !== null ? item.id : item);
                    if (Number.isInteger(id) && id >= 1 && (!validIds || validIds.has(id))) {
                        state.favorites[id] = true;
                    }
                }
            } else if (typeof raw.favorites === "object") {
                for (const [rawId, val] of Object.entries(raw.favorites)) {
                    const id = Number(rawId);
                    if (Number.isInteger(id) && id >= 1 && Boolean(val) && (!validIds || validIds.has(id))) {
                        state.favorites[id] = true;
                    }
                }
            }
        }

        // 3. Migrate / Copy History & Learned Words
        if (Array.isArray(raw.learnedWords)) {
            // Legacy v0 format
            for (const item of raw.learnedWords) {
                const id = Number(typeof item === "object" && item !== null ? item.id : item);
                if (Number.isInteger(id) && id >= 1 && (!validIds || validIds.has(id))) {
                    state.history[id] = { firstSeen: fallbackDate };
                }
            }
        }

        if (raw.history) {
            if (Array.isArray(raw.history)) {
                for (const item of raw.history) {
                    const id = Number(typeof item === "object" && item !== null ? (item.id || item.wordId) : item);
                    if (Number.isInteger(id) && id >= 1 && (!validIds || validIds.has(id))) {
                        const date = (item && typeof item === "object" && isDateKey(item.firstSeen))
                            ? item.firstSeen
                            : ((item && typeof item === "object" && isDateKey(item.date)) ? item.date : fallbackDate);
                        state.history[id] = { firstSeen: date };
                    }
                }
            } else if (typeof raw.history === "object") {
                for (const [rawId, record] of Object.entries(raw.history)) {
                    const id = Number(rawId);
                    if (Number.isInteger(id) && id >= 1 && (!validIds || validIds.has(id))) {
                        const firstSeen = (record && typeof record === "object" && isDateKey(record.firstSeen))
                            ? record.firstSeen
                            : ((record && typeof record === "object" && isDateKey(record.date)) ? record.date : fallbackDate);
                        state.history[id] = { firstSeen };
                    }
                }
            }
        }

        // 4. Migrate / Sanitize SRS Data
        if (raw.srs && typeof raw.srs === "object") {
            const srsEntries = Array.isArray(raw.srs)
                ? raw.srs.map(item => [item?.wordId || item?.id, item])
                : Object.entries(raw.srs);

            for (const [rawId, item] of srsEntries) {
                const id = Number(item?.wordId !== undefined ? item.wordId : rawId);
                if (!Number.isInteger(id) || id < 1 || (validIds && !validIds.has(id)) || !item || typeof item !== "object") {
                    continue;
                }

                const repetition = Number.isInteger(item.repetition) && item.repetition >= 0 ? item.repetition : 0;
                const interval = typeof item.interval === "number" && item.interval >= 0 ? Math.round(item.interval) : 0;
                const ef = typeof item.ef === "number" && !isNaN(item.ef) ? Math.max(1.3, Math.round(item.ef * 100) / 100) : 2.5;
                const nextReviewDate = isDateKey(item.nextReviewDate) ? item.nextReviewDate : fallbackDate;
                const lastReviewedDate = isDateKey(item.lastReviewedDate) ? item.lastReviewedDate : null;
                const reviewCount = Number.isInteger(item.reviewCount) && item.reviewCount >= 0 ? item.reviewCount : (repetition > 0 ? repetition : 0);
                const lapses = Number.isInteger(item.lapses) && item.lapses >= 0 ? item.lapses : 0;
                const srsHistory = Array.isArray(item.history)
                    ? item.history
                        .filter(h => h && typeof h === "object" && (typeof h.grade === "number" || typeof h.rating === "string" || typeof h.grade === "string"))
                        .map(h => {
                            const grade = typeof h.grade === "number"
                                ? Math.max(0, Math.min(5, Math.round(h.grade)))
                                : mapRatingToGrade(h.rating ?? h.grade);
                            const rating = typeof h.rating === "string"
                                ? h.rating
                                : (grade === 1 ? "again" : grade === 3 ? "hard" : grade === 4 ? "good" : grade === 5 ? "easy" : String(grade));
                            return {
                                date: isDateKey(h.date) ? h.date : (isDateKey(item.lastReviewedDate) ? item.lastReviewedDate : fallbackDate),
                                grade,
                                rating,
                                interval: typeof h.interval === "number" ? Math.max(0, Math.round(h.interval)) : 0,
                                ef: typeof h.ef === "number" ? Math.max(1.3, Math.round(h.ef * 100) / 100) : 2.5
                            };
                        })
                        .slice(-50)
                    : [];

                state.srs[id] = {
                    wordId: id,
                    repetition,
                    interval,
                    ef,
                    nextReviewDate,
                    lastReviewedDate,
                    reviewCount,
                    lapses,
                    history: srsHistory
                };

                if (!state.history[id]) {
                    state.history[id] = { firstSeen: lastReviewedDate || nextReviewDate || fallbackDate };
                }
            }
        }

        // 5. Ensure all words in history have an SRS record
        for (const [rawId, record] of Object.entries(state.history)) {
            const id = Number(rawId);
            if (!state.srs[id]) {
                state.srs[id] = createDefaultSrsItem(id, record.firstSeen || fallbackDate);
            }
        }

        // 6. Preserve streak info if present
        if (raw.streak !== undefined) {
            state.streak = raw.streak;
        } else if (raw.streakData !== undefined) {
            state.streak = raw.streakData;
        }

        return state;
    }

    function getDueReviewWords(state, wordsList, dateKey, limit = null) {
        if (!Array.isArray(wordsList) || wordsList.length === 0) return [];
        const todayKey = isDateKey(dateKey) ? dateKey : getLocalDateKey(new Date());
        const normalizedState = migrateState(state, todayKey);
        const srsMap = normalizedState.srs;

        const wordsMap = new Map();
        for (const w of wordsList) {
            if (w && Number.isInteger(w.id)) {
                wordsMap.set(w.id, w);
            }
        }

        const dueItems = [];
        for (const [rawId, srsItem] of Object.entries(srsMap)) {
            if (!srsItem || typeof srsItem !== "object") continue;
            const id = Number(srsItem.wordId || rawId);
            const word = wordsMap.get(id);
            if (!word) continue;

            const nextDate = isDateKey(srsItem.nextReviewDate) ? srsItem.nextReviewDate : todayKey;
            if (nextDate <= todayKey) {
                const daysOverdue = Math.max(0, getDaysDifference(nextDate, todayKey));
                dueItems.push({
                    word,
                    srs: srsItem,
                    isOverdue: daysOverdue > 0,
                    daysOverdue
                });
            }
        }

        // Sort by urgency:
        // 1. Most overdue first (daysOverdue desc)
        // 2. Smaller interval first (interval asc)
        // 3. Lower EF first (harder words first)
        // 4. Lower repetition first
        // 5. Stable tie-breaker by word ID
        dueItems.sort((a, b) => {
            if (b.daysOverdue !== a.daysOverdue) {
                return b.daysOverdue - a.daysOverdue;
            }
            const intA = typeof a.srs.interval === "number" ? a.srs.interval : 0;
            const intB = typeof b.srs.interval === "number" ? b.srs.interval : 0;
            if (intA !== intB) {
                return intA - intB;
            }
            const efA = typeof a.srs.ef === "number" ? a.srs.ef : 2.5;
            const efB = typeof b.srs.ef === "number" ? b.srs.ef : 2.5;
            if (efA !== efB) {
                return efA - efB;
            }
            const repA = typeof a.srs.repetition === "number" ? a.srs.repetition : 0;
            const repB = typeof b.srs.repetition === "number" ? b.srs.repetition : 0;
            if (repA !== repB) {
                return repA - repB;
            }
            return (a.word.id || 0) - (b.word.id || 0);
        });

        if (typeof limit === "number" && limit > 0) {
            return dueItems.slice(0, Math.floor(limit));
        }

        return dueItems;
    }

    function recordReview(state, wordId, rating, dateKey, validIds = null) {
        const todayKey = isDateKey(dateKey) ? dateKey : getLocalDateKey(new Date());
        const updatedState = migrateState(state, todayKey, validIds);
        const id = Number(wordId);

        const currentSrs = updatedState.srs[id] || createDefaultSrsItem(id, todayKey);
        const srsResult = calculateSM2(currentSrs, rating, todayKey);
        srsResult.wordId = id;

        updatedState.srs[id] = srsResult;
        if (!updatedState.history[id]) {
            updatedState.history[id] = { firstSeen: todayKey };
        }

        return {
            updatedState,
            srsItem: srsResult,
            reviewResult: srsResult
        };
    }

    function getReviewStats(state, dateKey, wordsDb = null) {
        const todayKey = isDateKey(dateKey) ? dateKey : getLocalDateKey(new Date());
        const normalizedState = migrateState(state, todayKey);
        const srsMap = normalizedState.srs;

        const items = Object.values(srsMap).filter(item => item && typeof item === "object");
        const totalCards = items.length;

        let dueToday = 0;
        let reviewedToday = 0;
        let learningCount = 0;
        let masteredCount = 0;
        let totalReviewCount = 0;
        let totalEf = 0;

        let allLogsTotal = 0;
        let allLogsSuccess = 0;

        for (const item of items) {
            const nextDate = isDateKey(item.nextReviewDate) ? item.nextReviewDate : todayKey;
            if (nextDate <= todayKey) {
                dueToday++;
            }

            if (item.lastReviewedDate === todayKey) {
                reviewedToday++;
            } else if (Array.isArray(item.history) && item.history.some(h => h && h.date === todayKey)) {
                reviewedToday++;
            }

            const rep = Number.isInteger(item.repetition) ? item.repetition : 0;
            const interval = typeof item.interval === "number" ? item.interval : 0;
            const revCount = Number.isInteger(item.reviewCount) ? item.reviewCount : 0;
            totalReviewCount += revCount;

            const ef = typeof item.ef === "number" && !isNaN(item.ef) ? item.ef : 2.5;
            totalEf += ef;

            if (rep >= 4 && interval >= 21) {
                masteredCount++;
            } else if (rep > 0 || revCount > 0) {
                learningCount++;
            }

            if (Array.isArray(item.history)) {
                for (const log of item.history) {
                    if (log && typeof log.grade === "number") {
                        allLogsTotal++;
                        if (log.grade >= 3) {
                            allLogsSuccess++;
                        }
                    }
                }
            }
        }

        const retentionRate = allLogsTotal > 0
            ? Math.round((allLogsSuccess / allLogsTotal) * 1000) / 10
            : 100;

        const averageEF = totalCards > 0
            ? Math.round((totalEf / totalCards) * 100) / 100
            : 2.5;

        return {
            totalCards,
            totalLearned: totalCards,
            dueToday,
            dueCount: dueToday,
            reviewedToday,
            reviewedTodayCount: reviewedToday,
            retentionRate,
            learningCount,
            reviewCount: totalReviewCount,
            masteredCount,
            averageEF
        };
    }

    function scheduleDailyWordSrs(state, wordId, dateKey) {
        const todayKey = isDateKey(dateKey) ? dateKey : getLocalDateKey(new Date());
        const id = Number(wordId);
        const nextState = migrateState(state, todayKey);

        if (!nextState.history[id]) {
            nextState.history[id] = { firstSeen: todayKey };
        }
        if (!nextState.srs[id]) {
            nextState.srs[id] = createDefaultSrsItem(id, todayKey);
        }

        return nextState;
    }

    function getLexiconRoots(wordsDb) {
        if (!Array.isArray(wordsDb)) return [];
        const rootMap = new Map();
        for (const w of wordsDb) {
            if (!w || !w.root) continue;
            const root = String(w.root).trim();
            const count = rootMap.get(root) || 0;
            rootMap.set(root, count + 1);
        }
        return Array.from(rootMap.entries())
            .map(([root, count]) => {
                const firstLetter = root.split(/\s+/)[0] || "";
                return { root, count, letter: firstLetter, firstLetter };
            })
            .sort((a, b) => a.root.localeCompare(b.root, "ar"));
    }

    function getLexiconWeights(wordsDb) {
        if (!Array.isArray(wordsDb)) return [];
        const weightMap = new Map();
        for (const w of wordsDb) {
            if (!w || !w.weight) continue;
            const weight = String(w.weight).trim();
            const count = weightMap.get(weight) || 0;
            weightMap.set(weight, count + 1);
        }
        return Array.from(weightMap.entries())
            .map(([weight, count]) => ({ weight, count }))
            .sort((a, b) => b.count - a.count || a.weight.localeCompare(b.weight, "ar"));
    }

    function getLexiconCategories(wordsDb) {
        if (!Array.isArray(wordsDb)) return [];
        const catMap = new Map();
        for (const w of wordsDb) {
            if (!w || !w.category) continue;
            const category = String(w.category).trim();
            const count = catMap.get(category) || 0;
            catMap.set(category, count + 1);
        }
        return Array.from(catMap.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, "ar"));
    }

    function getLexiconLetters(wordsDb) {
        if (!Array.isArray(wordsDb)) return [];
        const letterSet = new Set();
        for (const w of wordsDb) {
            if (!w || !w.root) continue;
            const firstLetter = normalizeArabicText(String(w.root).trim().split(/\s+/)[0] || "");
            if (firstLetter) letterSet.add(firstLetter);
        }
        return Array.from(letterSet).sort((a, b) => a.localeCompare(b, "ar"));
    }

    function filterLexicon(wordsDb, filters = {}) {
        if (!Array.isArray(wordsDb)) return [];
        const { query = "", category = "", root = "", rootLetter = "", weight = "" } = filters;
        let results = wordsDb;

        const rawQ = typeof query === "string" ? query.trim() : "";
        if (rawQ) {
            results = searchLexicon(rawQ, results);
        }

        if (category && typeof category === "string" && category !== "all" && category !== "الكل") {
            const normCat = normalizeArabicText(category);
            results = results.filter(w => w && normalizeArabicText(w.category) === normCat);
        }

        if (root && typeof root === "string" && root !== "all" && root !== "الكل") {
            const normRoot = normalizeArabicText(root).replace(/\s+/g, "");
            results = results.filter(w => w && normalizeArabicText(w.root).replace(/\s+/g, "") === normRoot);
        }

        if (rootLetter && typeof rootLetter === "string" && rootLetter !== "all" && rootLetter !== "الكل") {
            const normLetter = normalizeArabicText(rootLetter);
            results = results.filter(w => {
                if (!w || !w.root) return false;
                const first = normalizeArabicText(String(w.root).trim().split(/\s+/)[0] || "");
                return first === normLetter;
            });
        }

        if (weight && typeof weight === "string" && weight !== "all" && weight !== "الكل") {
            const normWeight = normalizeArabicText(weight);
            results = results.filter(w => w && normalizeArabicText(w.weight) === normWeight);
        }

        return results;
    }

    function formatLexiconCountText(count, total = 365) {
        const c = Number(count) || 0;
        const tot = Number(total) || 365;
        if (c === 0) return "لا توجد ألفاظ مطابقة لمعايير البحث الحالية";
        if (c === tot) return `عرض ${tot} من أصل ${tot} لفظاً`;
        if (c === 1) return `عرض لفظ واحد من أصل ${tot} لفظاً`;
        if (c === 2) return `عرض لفظين من أصل ${tot} لفظاً`;
        if (c >= 3 && c <= 10) return `عرض ${c} ألفاظ من أصل ${tot} لفظاً`;
        return `عرض ${c} لفظاً من أصل ${tot} لفظاً`;
    }

    function initLexiconExplorer(options = {}) {
        if (typeof document === "undefined") return null;
        const {
            wordsDb = (typeof WORDS_DB !== "undefined" ? WORDS_DB : (typeof WORDS !== "undefined" ? WORDS : [])),
            searchInputId = "input-lexicon-search",
            rootSelectId = "select-lexicon-root",
            weightSelectId = "select-lexicon-weight",
            categoryChipsId = "lexicon-category-chips",
            letterBarId = "lexicon-letter-bar",
            resultsCountId = "lexicon-results-count",
            gridId = "lexicon-grid",
            emptyStateId = "lexicon-empty-state",
            clearBtnId = "btn-clear-lexicon-filters",
            resetEmptyBtnId = "btn-reset-lexicon-empty",
            onWordSelect = null
        } = options;

        const searchInput = document.getElementById(searchInputId);
        const rootSelect = document.getElementById(rootSelectId);
        const weightSelect = document.getElementById(weightSelectId);
        const categoryChips = document.getElementById(categoryChipsId);
        const letterBar = document.getElementById(letterBarId);
        const resultsCount = document.getElementById(resultsCountId);
        const grid = document.getElementById(gridId);
        const emptyState = document.getElementById(emptyStateId);
        const clearBtn = document.getElementById(clearBtnId);
        const resetEmptyBtn = document.getElementById(resetEmptyBtnId);

        if (!grid || !Array.isArray(wordsDb) || wordsDb.length === 0) return null;

        const currentFilters = {
            query: "",
            category: "all",
            root: "all",
            rootLetter: "all",
            weight: "all"
        };

        // 1. Populate Roots dropdown
        if (rootSelect) {
            const roots = getLexiconRoots(wordsDb);
            const frag = document.createDocumentFragment();
            const defaultOpt = document.createElement("option");
            defaultOpt.value = "all";
            defaultOpt.textContent = `جميع الجذور (${roots.length} جذراً)`;
            frag.appendChild(defaultOpt);

            roots.forEach(({ root, count }) => {
                const opt = document.createElement("option");
                opt.value = root;
                opt.textContent = `${root} (${count})`;
                frag.appendChild(opt);
            });
            rootSelect.replaceChildren(frag);
        }

        // 2. Populate Weights dropdown
        if (weightSelect) {
            const weights = getLexiconWeights(wordsDb);
            const frag = document.createDocumentFragment();
            const defaultOpt = document.createElement("option");
            defaultOpt.value = "all";
            defaultOpt.textContent = `جميع الأوزان الصرفية (${weights.length} وزناً)`;
            frag.appendChild(defaultOpt);

            weights.forEach(({ weight, count }) => {
                const opt = document.createElement("option");
                opt.value = weight;
                opt.textContent = `${weight} (${count})`;
                frag.appendChild(opt);
            });
            weightSelect.replaceChildren(frag);
        }

        // 3. Populate Category Chips
        if (categoryChips) {
            const categories = getLexiconCategories(wordsDb);
            const frag = document.createDocumentFragment();

            const allChip = document.createElement("button");
            allChip.type = "button";
            allChip.className = "lexicon-chip active";
            allChip.dataset.category = "all";
            allChip.textContent = `الكل (${wordsDb.length})`;
            frag.appendChild(allChip);

            categories.forEach(({ category, count }) => {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "lexicon-chip";
                chip.dataset.category = category;
                chip.textContent = `${category} (${count})`;
                frag.appendChild(chip);
            });
            categoryChips.replaceChildren(frag);
        }

        // 4. Populate Letter Bar
        if (letterBar) {
            const letters = getLexiconLetters(wordsDb);
            const frag = document.createDocumentFragment();

            const allBtn = document.createElement("button");
            allBtn.type = "button";
            allBtn.className = "lexicon-letter-btn active";
            allBtn.dataset.letter = "all";
            allBtn.textContent = "الكل";
            allBtn.title = "جميع الحروف";
            frag.appendChild(allBtn);

            letters.forEach(letter => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "lexicon-letter-btn";
                btn.dataset.letter = letter;
                btn.textContent = letter;
                btn.title = `الجذور التي تبدأ بحرف (${letter})`;
                frag.appendChild(btn);
            });
            letterBar.replaceChildren(frag);
        }

        // Filter & Render logic
        function applyFilters() {
            const filtered = filterLexicon(wordsDb, {
                query: currentFilters.query,
                category: currentFilters.category,
                root: currentFilters.root,
                rootLetter: currentFilters.rootLetter,
                weight: currentFilters.weight
            });

            if (resultsCount) {
                resultsCount.textContent = formatLexiconCountText(filtered.length, wordsDb.length);
            }

            const hasActiveFilters = Boolean(
                currentFilters.query.trim() ||
                currentFilters.category !== "all" ||
                currentFilters.root !== "all" ||
                currentFilters.rootLetter !== "all" ||
                currentFilters.weight !== "all"
            );
            if (clearBtn) {
                clearBtn.hidden = !hasActiveFilters;
            }

            if (emptyState) {
                emptyState.hidden = filtered.length > 0;
            }

            renderCards(filtered);
        }

        function renderCards(words) {
            if (!grid) return;
            const frag = document.createDocumentFragment();

            words.forEach(word => {
                const card = document.createElement("article");
                card.className = "lexicon-card";
                card.dataset.wordId = String(word.id);

                card.innerHTML = `
                    <div class="lexicon-card-header">
                        <div class="lexicon-card-heading-wrap">
                            <h3 class="lexicon-card-word">${word.word}</h3>
                            <span class="lexicon-card-pronunciation" dir="ltr">${word.pronunciation}</span>
                        </div>
                        <button type="button" class="lexicon-audio-btn" data-word-id="${word.id}" aria-label="استمع إلى نطق ${word.word}" title="استمع إلى النطق">
                            <svg class="icon" aria-hidden="true"><use href="#i-volume-high"/></svg>
                        </button>
                    </div>
                    <div class="lexicon-card-meta">
                        <button type="button" class="lexicon-pill lexicon-pill-cat" data-category="${word.category}" title="تصفية حسب تصنيف «${word.category}»">${word.category}</button>
                        <button type="button" class="lexicon-pill lexicon-pill-root" data-root="${word.root}" title="تصفية حسب جذر «${word.root}»"><span class="pill-kicker">الجذر:</span> <strong>${word.root}</strong></button>
                        <button type="button" class="lexicon-pill lexicon-pill-weight" data-weight="${word.weight}" title="تصفية حسب وزن «${word.weight}»"><span class="pill-kicker">الوزن:</span> <strong>${word.weight}</strong></button>
                    </div>
                    <div class="lexicon-card-body">
                        <p class="lexicon-card-vocalization">${word.vocalization}</p>
                        <p class="lexicon-card-meaning">${word.meaning}</p>
                        <p class="lexicon-card-english" dir="ltr" lang="en">${word.englishMeaning}</p>
                        <blockquote class="lexicon-card-example">«${word.example}»</blockquote>
                    </div>
                    <div class="lexicon-card-footer">
                        <a href="word.html?id=${word.id}" class="lexicon-read-btn" data-word-id="${word.id}">
                            <span>اقرأ الكلمة كاملة</span>
                            <svg class="icon"><use href="#i-arrow"/></svg>
                        </a>
                    </div>
                `;

                const audioBtn = card.querySelector(".lexicon-audio-btn");
                if (audioBtn) {
                    audioBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        playWordAudio(word, audioBtn);
                    });
                }

                const catPill = card.querySelector(".lexicon-pill-cat");
                if (catPill) {
                    catPill.addEventListener("click", (e) => {
                        e.stopPropagation();
                        setCategoryFilter(word.category);
                    });
                }

                const rootPill = card.querySelector(".lexicon-pill-root");
                if (rootPill) {
                    rootPill.addEventListener("click", (e) => {
                        e.stopPropagation();
                        setRootFilter(word.root);
                    });
                }

                const weightPill = card.querySelector(".lexicon-pill-weight");
                if (weightPill) {
                    weightPill.addEventListener("click", (e) => {
                        e.stopPropagation();
                        setWeightFilter(word.weight);
                    });
                }

                const readBtn = card.querySelector(".lexicon-read-btn");
                if (readBtn && typeof onWordSelect === "function") {
                    readBtn.addEventListener("click", (e) => {
                        e.preventDefault();
                        onWordSelect(word);
                    });
                }

                frag.appendChild(card);
            });

            grid.replaceChildren(frag);
        }

        function setCategoryFilter(category) {
            currentFilters.category = category;
            if (categoryChips) {
                categoryChips.querySelectorAll(".lexicon-chip").forEach(c => {
                    c.classList.toggle("active", (c.dataset.category || "") === category);
                });
            }
            applyFilters();
        }

        function setRootFilter(root) {
            currentFilters.root = root;
            if (rootSelect) {
                rootSelect.value = root;
            }
            applyFilters();
        }

        function setWeightFilter(weight) {
            currentFilters.weight = weight;
            if (weightSelect) {
                weightSelect.value = weight;
            }
            applyFilters();
        }

        function setLetterFilter(letter) {
            currentFilters.rootLetter = letter;
            if (letterBar) {
                letterBar.querySelectorAll(".lexicon-letter-btn").forEach(b => {
                    b.classList.toggle("active", (b.dataset.letter || "") === letter);
                });
            }
            applyFilters();
        }

        function clearAllFilters() {
            currentFilters.query = "";
            currentFilters.category = "all";
            currentFilters.root = "all";
            currentFilters.rootLetter = "all";
            currentFilters.weight = "all";

            if (searchInput) searchInput.value = "";
            if (rootSelect) rootSelect.value = "all";
            if (weightSelect) weightSelect.value = "all";
            if (categoryChips) {
                categoryChips.querySelectorAll(".lexicon-chip").forEach(c => {
                    c.classList.toggle("active", c.dataset.category === "all");
                });
            }
            if (letterBar) {
                letterBar.querySelectorAll(".lexicon-letter-btn").forEach(b => {
                    b.classList.toggle("active", b.dataset.letter === "all");
                });
            }
            applyFilters();
        }

        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                currentFilters.query = e.target.value;
                applyFilters();
            });
        }

        if (rootSelect) {
            rootSelect.addEventListener("change", (e) => {
                currentFilters.root = e.target.value;
                applyFilters();
            });
        }

        if (weightSelect) {
            weightSelect.addEventListener("change", (e) => {
                currentFilters.weight = e.target.value;
                applyFilters();
            });
        }

        if (categoryChips) {
            categoryChips.addEventListener("click", (e) => {
                const btn = e.target.closest(".lexicon-chip");
                if (!btn) return;
                const cat = btn.dataset.category || "all";
                setCategoryFilter(cat);
            });
        }

        if (letterBar) {
            letterBar.addEventListener("click", (e) => {
                const btn = e.target.closest(".lexicon-letter-btn");
                if (!btn) return;
                const letter = btn.dataset.letter || "all";
                setLetterFilter(letter);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener("click", clearAllFilters);
        }

        if (resetEmptyBtn) {
            resetEmptyBtn.addEventListener("click", clearAllFilters);
        }

        // Audio Playback with V8 GC Anchoring
        let currentExplorerAudio = null;
        let explorerSessionId = 0;

        function playWordAudio(word, buttonEl) {
            if (!word) return;
            explorerSessionId++;
            const sessionId = explorerSessionId;

            document.querySelectorAll(".lexicon-audio-btn.speaking").forEach(b => {
                b.classList.remove("speaking");
            });

            if (currentExplorerAudio) {
                try {
                    currentExplorerAudio.pause();
                    currentExplorerAudio.src = "";
                    currentExplorerAudio = null;
                } catch {}
            }
            if (typeof window !== "undefined" && window.speechSynthesis && typeof window.speechSynthesis.cancel === "function") {
                try { window.speechSynthesis.cancel(); } catch {}
            }
            if (typeof window !== "undefined") {
                window._activeUtterance = null;
            }

            if (buttonEl) buttonEl.classList.add("speaking");

            const resetBtn = () => {
                if (buttonEl && sessionId === explorerSessionId) {
                    buttonEl.classList.remove("speaking");
                }
            };

            const humanUrl = getHumanAudioUrl(word, "word");
            if (humanUrl && typeof Audio !== "undefined") {
                try {
                    const audio = new Audio(humanUrl);
                    currentExplorerAudio = audio;
                    audio.onended = () => {
                        currentExplorerAudio = null;
                        resetBtn();
                    };
                    audio.onerror = () => {
                        currentExplorerAudio = null;
                        fallbackToSpeech(word, buttonEl, sessionId, resetBtn);
                    };
                    const playPromise = audio.play();
                    if (playPromise && typeof playPromise.catch === "function") {
                        playPromise.catch(() => {
                            currentExplorerAudio = null;
                            fallbackToSpeech(word, buttonEl, sessionId, resetBtn);
                        });
                    }
                    return;
                } catch {
                    currentExplorerAudio = null;
                }
            }

            fallbackToSpeech(word, buttonEl, sessionId, resetBtn);
        }

        function fallbackToSpeech(word, buttonEl, sessionId, resetBtn) {
            if (typeof window === "undefined" || !window.speechSynthesis) {
                resetBtn();
                return;
            }

            const cleanWord = extractSpokenText(word.word) || word.word;
            let voices = [];
            try {
                voices = Array.from(window.speechSynthesis.getVoices() || []);
            } catch {}

            const arVoice = findBestArabicVoice ? findBestArabicVoice(voices) : null;
            const UtteranceClass = window.SpeechSynthesisUtterance || (typeof SpeechSynthesisUtterance !== "undefined" ? SpeechSynthesisUtterance : null);
            const fallbackMessage = "لم يتم العثور على صوت عربي على هذا الجهاز. يُرجى تفعيل أو تثبيت حزمة الصوت العربي من إعدادات النظام للاستماع للنطق.";
            if (!arVoice || !UtteranceClass) {
                resetBtn();
                const toast = document.getElementById("toast");
                if (toast) {
                    toast.textContent = fallbackMessage;
                    toast.classList.add("show");
                    setTimeout(() => toast.classList.remove("show"), 2500);
                }
                const announcer = document.getElementById("audio-announcer");
                if (announcer) announcer.textContent = fallbackMessage;
                return;
            }

            try {
                const utterance = new UtteranceClass(cleanWord);
                utterance.voice = arVoice;
                utterance.lang = arVoice.lang || "ar-SA";
                utterance.rate = 0.85;

                window._activeUtterance = utterance;

                utterance.onend = utterance.onerror = () => {
                    if (window._activeUtterance === utterance) {
                        window._activeUtterance = null;
                    }
                    resetBtn();
                };

                window.speechSynthesis.speak(utterance);
            } catch {
                if (window._activeUtterance) {
                    window._activeUtterance = null;
                }
                resetBtn();
            }
        }

        applyFilters();

        return {
            applyFilters,
            setCategoryFilter,
            setRootFilter,
            setWeightFilter,
            setLetterFilter,
            clearAllFilters
        };
    }

    return {
        SCHEMA_VERSION,
        getLocalDateKey,
        getDailyWordIndex,
        calculateStreak,
        formatStreakText,
        serializeAnkiCSV,
        generateAnkiCsv,
        parseWordIdFromQuery,
        resolveWordSelection,
        createDefaultState,
        normalizeState,
        inspectStoredState,
        resetCorruptedStorage,
        mergeStates,
        parseBackup,
        serializeBackup,
        setupThemeController,
        extractSpokenText,
        getHumanAudioUrl,
        getNaturalAudioUrl,
        formatWordCitation,
        generateQuizQuestions,
        normalizeArabicText,
        searchLexicon,
        findRelatedWords,
        isArabicVoice,
        scoreArabicVoice,
        filterArabicVoices,
        findBestArabicVoice,
        // SM-2 & Schema v2 Exports
        addDaysToDateKey,
        getDaysDifference,
        mapRatingToGrade,
        createDefaultSrsItem,
        calculateNextReview,
        calculateSM2,
        migrateState,
        getDueReviewWords,
        recordReview,
        getReviewStats,
        scheduleDailyWordSrs,
        // Lexicon & Root Explorer Exports
        getLexiconRoots,
        getLexiconWeights,
        getLexiconCategories,
        getLexiconLetters,
        filterLexicon,
        formatLexiconCountText,
        initLexiconExplorer
    };
});
