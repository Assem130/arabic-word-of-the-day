(function (root, factory) {
    const api = factory(root.KalimatCore, root.KalimatSpeech);
    if (typeof module === "object" && module.exports) module.exports = api;
    root.KalimatWebUI = api;
})(typeof globalThis === "object" ? globalThis : this, function (Core, Speech) {
    "use strict";
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
            const roots = Core.getLexiconRoots(wordsDb);
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
            const weights = Core.getLexiconWeights(wordsDb);
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
            const categories = Core.getLexiconCategories(wordsDb);
            const frag = document.createDocumentFragment();

            const allChip = document.createElement("button");
            allChip.type = "button";
            allChip.className = "lexicon-chip active";
            allChip.dataset.category = "all";
            allChip.setAttribute("aria-pressed", "true");
            allChip.textContent = `الكل (${wordsDb.length})`;
            frag.appendChild(allChip);

            categories.forEach(({ category, count }) => {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "lexicon-chip";
                chip.dataset.category = category;
                chip.setAttribute("aria-pressed", "false");
                chip.textContent = `${category} (${count})`;
                frag.appendChild(chip);
            });
            categoryChips.replaceChildren(frag);
        }

        // 4. Populate Letter Bar
        if (letterBar) {
            const letters = Core.getLexiconLetters(wordsDb);
            const frag = document.createDocumentFragment();

            const allBtn = document.createElement("button");
            allBtn.type = "button";
            allBtn.className = "lexicon-letter-btn active";
            allBtn.dataset.letter = "all";
            allBtn.setAttribute("aria-pressed", "true");
            allBtn.textContent = "الكل";
            allBtn.title = "جميع الحروف";
            frag.appendChild(allBtn);

            letters.forEach(letter => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "lexicon-letter-btn";
                btn.dataset.letter = letter;
                btn.setAttribute("aria-pressed", "false");
                btn.textContent = letter;
                btn.title = `الجذور التي تبدأ بحرف (${letter})`;
                frag.appendChild(btn);
            });
            letterBar.replaceChildren(frag);
        }

        // Filter & Render logic
        function applyFilters() {
            const filtered = Core.filterLexicon(wordsDb, {
                query: currentFilters.query,
                category: currentFilters.category,
                root: currentFilters.root,
                rootLetter: currentFilters.rootLetter,
                weight: currentFilters.weight
            });

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

            if (!hasActiveFilters) {
                if (resultsCount) {
                    resultsCount.textContent = "اقتراحات من المعجم";
                }
                if (emptyState) {
                    emptyState.hidden = true;
                }
                renderCards(wordsDb.slice(0, 8));
                return;
            }

            if (resultsCount) {
                resultsCount.textContent = Core.formatLexiconCountText(filtered.length, wordsDb.length);
            }

            if (emptyState) {
                emptyState.hidden = filtered.length > 0;
            }

            renderCards(filtered);
        }

        function renderCards(words) {
            if (!grid) return;
            const frag = document.createDocumentFragment();

            const getSafeWordId = (value) => {
                try {
                    const numericId = Number(value);
                    return Number.isSafeInteger(numericId) && numericId > 0 ? String(numericId) : "";
                } catch {
                    return "";
                }
            };

            const setData = (element, name, value) => {
                const stringValue = String(value ?? "");
                element.dataset[name] = stringValue;
                const attributeName = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
                element.setAttribute(`data-${attributeName}`, stringValue);
            };

            const setText = (element, value) => {
                element.textContent = value == null ? "" : String(value);
            };

            words.forEach(word => {
                const card = document.createElement("article");
                card.className = "lexicon-card";
                const wordId = getSafeWordId(word && word.id);
                setData(card, "wordId", wordId);

                const header = document.createElement("div");
                header.className = "lexicon-card-header";
                const headingWrap = document.createElement("div");
                headingWrap.className = "lexicon-card-heading-wrap";
                const heading = document.createElement("h3");
                heading.className = "lexicon-card-word";
                setText(heading, word && word.word);
                headingWrap.appendChild(heading);
                const pronunciation = document.createElement("span");
                pronunciation.className = "lexicon-card-pronunciation";
                pronunciation.setAttribute("dir", "ltr");
                pronunciation.dir = "ltr";
                setText(pronunciation, word && word.pronunciation);
                headingWrap.appendChild(pronunciation);

                const audioBtn = document.createElement("button");
                audioBtn.type = "button";
                audioBtn.setAttribute("type", "button");
                audioBtn.className = "lexicon-audio-btn";
                setData(audioBtn, "wordId", wordId);
                audioBtn.setAttribute("aria-label", `استمع إلى نطق ${word && word.word != null ? String(word.word) : ""}`);
                audioBtn.setAttribute("title", "استمع إلى النطق");
                audioBtn.title = "استمع إلى النطق";
                const audioIcon = document.createElement("svg");
                audioIcon.className = "icon";
                audioIcon.setAttribute("aria-hidden", "true");
                const audioUse = document.createElement("use");
                audioUse.setAttribute("href", "#i-volume-high");
                audioIcon.appendChild(audioUse);
                audioBtn.appendChild(audioIcon);
                header.append(headingWrap, audioBtn);

                const meta = document.createElement("div");
                meta.className = "lexicon-card-meta";
                const catPill = document.createElement("button");
                catPill.type = "button";
                catPill.setAttribute("type", "button");
                catPill.className = "lexicon-pill lexicon-pill-cat";
                setData(catPill, "category", word && word.category);
                catPill.setAttribute("title", `تصفية حسب تصنيف «${word && word.category != null ? String(word.category) : ""}»`);
                setText(catPill, word && word.category);

                const rootPill = document.createElement("button");
                rootPill.type = "button";
                rootPill.setAttribute("type", "button");
                rootPill.className = "lexicon-pill lexicon-pill-root";
                setData(rootPill, "root", word && word.root);
                rootPill.setAttribute("title", `تصفية حسب جذر «${word && word.root != null ? String(word.root) : ""}»`);
                const rootKicker = document.createElement("span");
                rootKicker.className = "pill-kicker";
                setText(rootKicker, "الجذر:");
                const rootValue = document.createElement("strong");
                setText(rootValue, word && word.root);
                rootPill.append(rootKicker, rootValue);

                const weightPill = document.createElement("button");
                weightPill.type = "button";
                weightPill.setAttribute("type", "button");
                weightPill.className = "lexicon-pill lexicon-pill-weight";
                setData(weightPill, "weight", word && word.weight);
                weightPill.setAttribute("title", `تصفية حسب وزن «${word && word.weight != null ? String(word.weight) : ""}»`);
                const weightKicker = document.createElement("span");
                weightKicker.className = "pill-kicker";
                setText(weightKicker, "الوزن:");
                const weightValue = document.createElement("strong");
                setText(weightValue, word && word.weight);
                weightPill.append(weightKicker, weightValue);
                meta.append(catPill, rootPill, weightPill);

                const body = document.createElement("div");
                body.className = "lexicon-card-body";
                const meaning = document.createElement("p");
                meaning.className = "lexicon-card-meaning";
                setText(meaning, word && word.meaning);
                body.appendChild(meaning);

                const footer = document.createElement("div");
                footer.className = "lexicon-card-footer";
                const readBtn = document.createElement("a");
                readBtn.className = "lexicon-read-btn";
                const href = wordId ? `word.html?id=${wordId}` : "word.html";
                readBtn.setAttribute("href", href);
                readBtn.href = href;
                setData(readBtn, "wordId", wordId);
                const readLabel = document.createElement("span");
                setText(readLabel, "اقرأ الكلمة كاملة");
                const readIcon = document.createElement("svg");
                readIcon.className = "icon";
                const readUse = document.createElement("use");
                readUse.setAttribute("href", "#i-arrow");
                readIcon.appendChild(readUse);
                readBtn.append(readLabel, readIcon);
                footer.appendChild(readBtn);

                card.append(header, meta, body, footer);

                audioBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    playWordAudio(word, audioBtn);
                });
                catPill.addEventListener("click", (e) => {
                    e.stopPropagation();
                    setCategoryFilter(word.category);
                });
                rootPill.addEventListener("click", (e) => {
                    e.stopPropagation();
                    setRootFilter(word.root);
                });
                weightPill.addEventListener("click", (e) => {
                    e.stopPropagation();
                    setWeightFilter(word.weight);
                });
                if (typeof onWordSelect === "function") {
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
                    const isActive = (c.dataset.category || "") === category;
                    c.classList.toggle("active", isActive);
                    c.setAttribute("aria-pressed", String(isActive));
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
                    const isActive = (b.dataset.letter || "") === letter;
                    b.classList.toggle("active", isActive);
                    b.setAttribute("aria-pressed", String(isActive));
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
                    const isActive = c.dataset.category === "all";
                    c.classList.toggle("active", isActive);
                    c.setAttribute("aria-pressed", String(isActive));
                });
            }
            if (letterBar) {
                letterBar.querySelectorAll(".lexicon-letter-btn").forEach(b => {
                    const isActive = b.dataset.letter === "all";
                    b.classList.toggle("active", isActive);
                    b.setAttribute("aria-pressed", String(isActive));
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

        let speechReadinessCancel = null;
        let speechToastTimer = null;

        function getSpeechVoices(speech) {
            if (typeof speech?.getVoices !== "function") return [];
            try {
                const voices = speech.getVoices();
                return voices == null ? null : Array.from(voices);
            } catch { return null; }
        }

        function showSpeechFeedback(message) {
            const announcer = document.getElementById("audio-announcer");
            if (announcer) announcer.textContent = message;
            const toast = document.getElementById("toast");
            if (!toast) return;
            if (speechToastTimer !== null && typeof clearTimeout === "function") clearTimeout(speechToastTimer);
            toast.textContent = message;
            toast.classList.add("show");
            if (typeof setTimeout === "function") {
                speechToastTimer = setTimeout(() => {
                    toast.classList.remove("show");
                    speechToastTimer = null;
                }, 2500);
            }
        }

        function speakAfterVoiceReadiness(speech, callback) {
            const voices = getSpeechVoices(speech);
            if (!speech?.speak || voices === null || typeof speech.getVoices !== "function" || voices.length > 0) {
                return callback();
            }

            let settled = false;
            let timerId = null;
            const cleanup = () => {
                speech.removeEventListener?.("voiceschanged", onVoicesChanged);
                if (timerId !== null && typeof clearTimeout === "function") clearTimeout(timerId);
                if (speechReadinessCancel === cancel) speechReadinessCancel = null;
            };
            const cancel = () => {
                if (settled) return;
                settled = true;
                cleanup();
            };
            const onVoicesChanged = () => {
                const voices = getSpeechVoices(speech);
                if (settled || !voices || voices.length === 0) return;
                settled = true;
                cleanup();
                callback();
            };

            speechReadinessCancel = cancel;
            speech.addEventListener?.("voiceschanged", onVoicesChanged);
            if (typeof setTimeout === "function") {
                timerId = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    callback();
                }, 250);
            }
            return { kind: "pending" };
        }

        function playWordAudio(word, buttonEl) {
            if (!word) return;
            const speech = Speech || globalThis.KalimatSpeech || window.KalimatSpeech;
            const fallbackMessage = "النطق غير متاح على هذا الجهاز. يُرجى استخدام متصفح يدعم النطق الصوتي.";
            const noVoiceMessage = "لم يتم العثور على صوت عربي على هذا الجهاز. يُرجى تفعيل أو تثبيت حزمة الصوت العربي من إعدادات النظام للاستماع للنطق.";
            const reset = () => buttonEl?.classList.remove("speaking");
            document.querySelectorAll(".lexicon-audio-btn.speaking").forEach((button) => button.classList.remove("speaking"));
            if (!speech?.speak || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
                reset();
                showSpeechFeedback(fallbackMessage);
                return;
            }

            buttonEl?.classList.add("speaking");
            speechReadinessCancel?.();
            speech.cancel?.(window.speechSynthesis);
            return speakAfterVoiceReadiness(window.speechSynthesis, () => {
                const result = speech.speak(Core.extractSpokenText(word.word) || word.word, {
                    target: window,
                    speech: window.speechSynthesis,
                    Utterance: window.SpeechSynthesisUtterance,
                    requireVoice: true,
                    rate: 0.85,
                    onEnd: reset,
                    onError: () => {
                        reset();
                        showSpeechFeedback(fallbackMessage);
                    }
                }) || { kind: "unavailable" };
                if (result.kind !== "ok") {
                    reset();
                    showSpeechFeedback(result.kind === "no-arabic-voice" ? noVoiceMessage : fallbackMessage);
                }
                return result;
            });
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

    return { setupThemeController, initLexiconExplorer };
});
