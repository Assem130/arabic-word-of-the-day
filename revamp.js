document.addEventListener("DOMContentLoaded", () => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./sw.js").catch(() => {});
        });
    }
    const themeFn = typeof setupThemeController === "function" ? setupThemeController : (window.setupThemeController || (window.KalimatCore && window.KalimatCore.setupThemeController));
    if (typeof themeFn === "function") themeFn();

    const Core = window.KalimatCore;
    const today = Core ? Core.getLocalDateKey(new Date()) : "";
    let rawState = null;
    try {
        rawState = JSON.parse(localStorage.getItem("arabic_words_state") || "null");
    } catch {}

    const streakBadge = document.getElementById("streak-badge");
    if (streakBadge && Core && rawState && rawState.history) {
        try {
            const streak = Core.calculateStreak(rawState.history, today);
            const count = streak.currentStreak;
            if (count > 0) {
                streakBadge.textContent = `🔥 ${Core.formatStreakText(count)}`;
            }
        } catch {}
    }

    const dueBadge = document.getElementById("due-review-badge");
    const dueCountEl = document.getElementById("due-count");
    if (dueBadge && Core) {
        try {
            const wordsList = (typeof WORDS_DB !== "undefined" && Array.isArray(WORDS_DB)) ? WORDS_DB : (typeof WORDS !== "undefined" && Array.isArray(WORDS) ? WORDS : null);
            const stats = Core.getReviewStats(rawState || {}, today, wordsList);
            const dueCount = stats.dueToday || 0;
            if (dueCountEl) dueCountEl.textContent = String(dueCount);
            dueBadge.setAttribute("aria-label", `المراجعات المستحقة اليوم: ${dueCount} كلمات`);
            if (dueCount > 0) {
                dueBadge.classList.add("has-due", "pulse");
            } else {
                dueBadge.classList.remove("has-due", "pulse");
            }
            dueBadge.addEventListener("click", () => {
                window.location.href = "word.html?action=practice";
            });
        } catch {}
    }

    const btnClosePractice = document.getElementById("btn-close-practice");
    const practiceDialog = document.getElementById("practice-dialog");
    if (btnClosePractice && practiceDialog) {
        btnClosePractice.addEventListener("click", () => {
            if (typeof practiceDialog.close === "function") practiceDialog.close();
        });
    }

    // Initialize Lexicon & Root Tree Explorer
    if (Core && typeof Core.initLexiconExplorer === "function") {
        const wordsList = (typeof WORDS_DB !== "undefined" && Array.isArray(WORDS_DB)) ? WORDS_DB : (typeof WORDS !== "undefined" && Array.isArray(WORDS) ? WORDS : []);
        Core.initLexiconExplorer({
            wordsDb: wordsList,
            searchInputId: "input-lexicon-search",
            rootSelectId: "select-lexicon-root",
            weightSelectId: "select-lexicon-weight",
            categoryChipsId: "lexicon-category-chips",
            letterBarId: "lexicon-letter-bar",
            resultsCountId: "lexicon-results-count",
            gridId: "lexicon-grid",
            emptyStateId: "lexicon-empty-state",
            clearBtnId: "btn-clear-lexicon-filters",
            resetEmptyBtnId: "btn-reset-lexicon-empty"
        });
    }

    if (typeof matchMedia === "function" && matchMedia("(hover: none)").matches) {
        if (typeof document.querySelectorAll === "function") {
            document.querySelectorAll(".horizontal-accordion details").forEach(panel => { panel.open = true; });
        }
    }
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (typeof document.querySelector === "function") {
        const heroCopy = document.querySelector(".hero-copy");
        if (heroCopy) {
            if (typeof IntersectionObserver !== "undefined") {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add("is-visible");
                            observer.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0.1 });
                observer.observe(heroCopy);
            } else {
                heroCopy.classList.add("is-visible");
            }
        }

        const hero = document.querySelector(".hero");
        const glyph = document.querySelector(".hero-glyph");
        if (hero && glyph && typeof window !== "undefined" && typeof window.addEventListener === "function") {
            let ticking = false;
            const updateGlyphScale = () => {
                const rect = hero.getBoundingClientRect();
                if (rect.bottom > 0 && rect.top < (window.innerHeight || 800)) {
                    const progress = Math.min(Math.max(-rect.top / rect.height, 0), 1);
                    const scale = 0.9 + (0.14 * progress);
                    glyph.style.transform = `scale(${scale.toFixed(3)})`;
                }
                ticking = false;
            };
            window.addEventListener("scroll", () => {
                if (!ticking) {
                    if (typeof requestAnimationFrame === "function") {
                        requestAnimationFrame(updateGlyphScale);
                    } else {
                        updateGlyphScale();
                    }
                    ticking = true;
                }
            }, { passive: true });
            updateGlyphScale();
        }
    }
});
