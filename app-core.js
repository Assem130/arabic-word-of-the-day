(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.KalimatCore = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";

    const SCHEMA_VERSION = 2;
    const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
    const ReviewPolicy = (typeof module === "object" && module.exports && typeof require === "function")
        ? require("./extension/shared/review-policy.js")
        : globalThis.KalimatReviewPolicy;



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
        // ponytail: leading '=+-@ get a quote prefix (CSV formula-injection guard);
        // drop the prefix if exports are only ever opened in plain-text tools.
        const escapeField = val => {
            const text = String(val ?? "").replace(/"/g, '""');
            return `"${/^[=+\-@]/.test(text) ? `'${text}` : text}"`;
        };
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

    function isPlainMap(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }

    function isValidStateId(rawId) {
        const id = Number(rawId);
        return Number.isSafeInteger(id) && id >= 1;
    }

    function isBoundedCounter(value) {
        return Number.isSafeInteger(value) && value >= 0;
    }

    function isValidSrsHistoryEntry(entry) {
        return isPlainMap(entry)
            && isDateKey(entry.date)
            && Number.isInteger(entry.grade) && entry.grade >= 0 && entry.grade <= 5
            && typeof entry.rating === "string" && entry.rating.trim().length > 0
            && Number.isInteger(entry.interval) && entry.interval >= 0 && entry.interval <= MAX_SRS_INTERVAL
            && Number.isFinite(entry.ef) && entry.ef >= 1.3 && entry.ef <= MAX_SRS_EF;
    }

    function isValidSrsRecord(record, id) {
        return isPlainMap(record)
            && Number.isSafeInteger(record.wordId) && record.wordId === id
            && isBoundedCounter(record.repetition)
            && Number.isInteger(record.interval) && record.interval >= 0 && record.interval <= MAX_SRS_INTERVAL
            && Number.isFinite(record.ef) && record.ef >= 1.3 && record.ef <= MAX_SRS_EF
            && isDateKey(record.nextReviewDate)
            && (record.lastReviewedDate === null || isDateKey(record.lastReviewedDate))
            && isBoundedCounter(record.reviewCount)
            && isBoundedCounter(record.lapses)
            && Array.isArray(record.history)
            && record.history.every(isValidSrsHistoryEntry);
    }

    function isCurrentState(raw) {
        if (!isPlainMap(raw)
            || raw.version !== SCHEMA_VERSION
            || raw.schemaVersion !== SCHEMA_VERSION) return false;

        if (!isPlainMap(raw.srs) || !isPlainMap(raw.history) || !isPlainMap(raw.favorites) || !isPlainMap(raw.preferences)) {
            return false;
        }
        const preferences = raw.preferences;
        if (typeof preferences.showEnglish !== "boolean"
            || !Number.isFinite(preferences.speechRate)
            || preferences.speechRate < 0.5 || preferences.speechRate > 1.5
            || (preferences.speechRepeat !== 1 && preferences.speechRepeat !== 3)
            || !Number.isInteger(preferences.dailyReviewLimit)
            || preferences.dailyReviewLimit < 1 || preferences.dailyReviewLimit > 100) {
            return false;
        }

        for (const [id, record] of Object.entries(raw.history)) {
            if (!isValidStateId(id) || !isPlainMap(record) || !isHistoryRecord(record)) return false;
        }
        for (const [id, favorite] of Object.entries(raw.favorites)) {
            if (!isValidStateId(id) || typeof favorite !== "boolean") return false;
        }
        for (const [rawId, record] of Object.entries(raw.srs)) {
            const id = Number(rawId);
            if (!isValidStateId(rawId) || !isValidSrsRecord(record, id)) return false;
        }
        return true;
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
        if (isCurrentState(raw) || isV1State(raw) || isLegacyState(raw)) {
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
        return ReviewPolicy.mapRatingToGrade(rating);
    }

    function withSrsAliases(item) {
        Object.defineProperties(item, {
            repetitions: {
                configurable: true,
                enumerable: false,
                get() { return this.repetition; },
                set(value) { this.repetition = value; }
            },
            easeFactor: {
                configurable: true,
                enumerable: false,
                get() { return this.ef; },
                set(value) { this.ef = value; }
            },
            lastReviewed: {
                configurable: true,
                enumerable: false,
                get() { return this.lastReviewedDate; },
                set(value) { this.lastReviewedDate = value; }
            }
        });
        return item;
    }

    function createDefaultSrsItem(wordId, initialDateKey) {
        const dateKey = isDateKey(initialDateKey) ? initialDateKey : getLocalDateKey(new Date());
        return withSrsAliases({
            wordId: Number(wordId),
            repetition: 0,
            interval: 0,
            ef: 2.5,
            nextReviewDate: dateKey,
            lastReviewedDate: null,
            reviewCount: 0,
            lapses: 0,
            history: []
        });
    }

    const MAX_SRS_INTERVAL = 100000;
    const MAX_SRS_EF = 10;

    function normalizeSrsInterval(value) {
        return Number.isFinite(value) && value >= 0 && value <= MAX_SRS_INTERVAL
            ? Math.round(value)
            : 0;
    }

    function normalizeSrsEf(value) {
        return Number.isFinite(value) && value >= 1.3 && value <= MAX_SRS_EF
            ? Math.round(value * 100) / 100
            : 2.5;
    }

    function calculateNextReview(item, rating, reviewDateKey) {
        return withSrsAliases(ReviewPolicy.calculate(item, rating, reviewDateKey, {
            isDateKey,
            getLocalDateKey,
            addDaysToDateKey
        }));
    }

    function calculateSM2(item, rating, reviewDateKey) {
        return calculateNextReview(item, rating, reviewDateKey);
    }

    function formatReviewInterval(interval) {
        return ReviewPolicy.formatInterval(interval);
    }

    function getReviewOptions(item, reviewDateKey) {
        return ReviewPolicy.getOptions(item, reviewDateKey, { isDateKey, getLocalDateKey, addDaysToDateKey });
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
            if (Number.isInteger(raw.preferences.dailyReviewLimit) && raw.preferences.dailyReviewLimit >= 1 && raw.preferences.dailyReviewLimit <= 100) {
                state.preferences.dailyReviewLimit = raw.preferences.dailyReviewLimit;
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

                const repetition = Number.isInteger(item.repetition) && item.repetition >= 0
                    ? item.repetition
                    : (Number.isInteger(item.repetitions) && item.repetitions >= 0 ? item.repetitions : 0);
                const interval = normalizeSrsInterval(item.interval);
                const rawEf = typeof item.ef === "number" ? item.ef : item.easeFactor;
                const ef = normalizeSrsEf(rawEf);
                const nextReviewDate = isDateKey(item.nextReviewDate) ? item.nextReviewDate : fallbackDate;
                const lastReviewedDate = isDateKey(item.lastReviewedDate)
                    ? item.lastReviewedDate
                    : (isDateKey(item.lastReviewed) ? item.lastReviewed : null);
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
                                interval: normalizeSrsInterval(h.interval),
                                ef: normalizeSrsEf(h.ef)
                            };
                        })
                        .slice(-50)
                    : [];

                state.srs[id] = withSrsAliases({
                    wordId: id,
                    repetition,
                    interval,
                    ef,
                    nextReviewDate,
                    lastReviewedDate,
                    reviewCount,
                    lapses,
                    history: srsHistory
                });

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

        // 6. Preserve streak info if present (type-validated; never trust imported shapes)
        const rawStreak = raw.streak !== undefined ? raw.streak : raw.streakData;
        if (Number.isInteger(rawStreak) && rawStreak >= 0) {
            state.streak = rawStreak;
        }

        return state;
    }

    function getDueReviewWords(state, wordsList, dateKey, limit = null) {
        const idsOnly = typeof wordsList === "string" && dateKey === undefined;
        if (idsOnly) {
            dateKey = wordsList;
            wordsList = null;
            if (Array.isArray(state)) {
                state = { srs: Object.fromEntries(state.map((item) => [item?.wordId ?? item?.id, item])) };
            } else if (state && typeof state === "object" && !state.srs) {
                state = { srs: state.history && typeof state.history === "object" ? state.history : state };
            }
        }
        if (!idsOnly && (!Array.isArray(wordsList) || wordsList.length === 0)) return [];
        const todayKey = isDateKey(dateKey) ? dateKey : getLocalDateKey(new Date());
        const normalizedState = migrateState(state, todayKey);
        const srsMap = normalizedState.srs;

        const wordsMap = new Map();
        for (const w of wordsList || []) {
            if (w && Number.isInteger(w.id)) {
                wordsMap.set(w.id, w);
            }
        }

        const dueItems = [];
        for (const [rawId, srsItem] of Object.entries(srsMap)) {
            if (!srsItem || typeof srsItem !== "object") continue;
            const id = Number(srsItem.wordId || rawId);
            const word = wordsMap.get(id);
            if (!idsOnly && !word) continue;

            const nextDate = isDateKey(srsItem.nextReviewDate) ? srsItem.nextReviewDate : todayKey;
            if (nextDate <= todayKey) {
                const daysOverdue = Math.max(0, getDaysDifference(nextDate, todayKey));
                dueItems.push({
                    id,
                    ...(word ? { word } : {}),
                    srs: srsItem,
                    reviewOptions: getReviewOptions(srsItem, todayKey),
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
        const orderedItems = ReviewPolicy.sortDue(dueItems, (item) => item.id || item.word?.id || 0);

        const result = typeof limit === "number" && limit > 0
            ? orderedItems.slice(0, Math.floor(limit))
            : orderedItems;
        if (idsOnly) return result.map((item) => item.id);
        return result.map(({ id, ...item }) => item);
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
        const validIds = Array.isArray(wordsDb)
            ? new Set(wordsDb
                .map(word => Number(word && word.id))
                .filter(id => Number.isSafeInteger(id) && id >= 1))
            : null;
        const normalizedState = migrateState(state, todayKey, validIds);
        const srsMap = normalizedState.srs;

        const items = Object.values(srsMap).filter(item => item && typeof item === "object");
        const summary = ReviewPolicy.summarize(items, todayKey, { reviewedFromHistory: true });
        let learningCount = 0;
        let masteredCount = 0;

        for (const item of items) {
            const rep = Number.isInteger(item.repetition) ? item.repetition : 0;
            const interval = typeof item.interval === "number" ? item.interval : 0;
            const revCount = Number.isInteger(item.reviewCount) ? item.reviewCount : 0;

            if (rep >= 4 && interval >= 21) {
                masteredCount++;
            } else if (rep > 0 || revCount > 0) {
                learningCount++;
            }
        }

        return {
            totalCards: summary.totalCards,
            totalLearned: summary.totalCards,
            dueToday: summary.dueToday,
            dueCount: summary.dueToday,
            reviewedToday: summary.reviewedToday,
            reviewedTodayCount: summary.reviewedToday,
            retentionRate: summary.retentionRate,
            learningCount,
            reviewCount: summary.totalReviewCount,
            masteredCount,
            averageEF: summary.averageEF
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
        extractSpokenText,
        getHumanAudioUrl,
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
        getReviewOptions,
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
        formatLexiconCountText
    };
});
