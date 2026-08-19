document.addEventListener("DOMContentLoaded", () => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./sw.js").catch(() => {});
        });
    }
    const themeFn = window.KalimatWebUI?.setupThemeController;
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

    const menuButton = document.getElementById("btn-toggle-menu");
    const menu = document.getElementById("app-menu-dropdown");
    if (menuButton && menu) {
        const setMenuOpen = (isOpen) => {
            const wasOpen = !menu.hidden;
            const restoreFocus = !isOpen && wasOpen && menu.contains(document.activeElement);
            menu.hidden = !isOpen;
            menuButton.setAttribute("aria-expanded", String(isOpen));
            if (isOpen) {
                const firstFocusable = menu.querySelector("a[href], button:not([disabled]), select:not([disabled])");
                if (firstFocusable && typeof firstFocusable.focus === "function") firstFocusable.focus();
            } else if (restoreFocus && typeof menuButton.focus === "function") {
                menuButton.focus();
            }
        };

        menuButton.addEventListener("click", (event) => {
            event.stopPropagation();
            setMenuOpen(menu.hidden);
        });
        document.addEventListener("click", (event) => {
            if (!menu.contains(event.target) && !menuButton.contains(event.target)) setMenuOpen(false);
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !menu.hidden) {
                setMenuOpen(false);
                if (typeof menuButton.focus === "function") menuButton.focus();
            }
        });
        menu.querySelectorAll("a[href]").forEach(link => {
            link.addEventListener("click", () => setMenuOpen(false));
        });
    }

    const btnClosePractice = document.getElementById("btn-close-practice");
    const practiceDialog = document.getElementById("practice-dialog");
    if (btnClosePractice && practiceDialog) {
        btnClosePractice.addEventListener("click", () => {
            if (typeof practiceDialog.close === "function") practiceDialog.close();
        });
    }

    // Initialize Lexicon & Root Tree Explorer
    if (Core && typeof window.KalimatWebUI?.initLexiconExplorer === "function") {
        const wordsList = (typeof WORDS_DB !== "undefined" && Array.isArray(WORDS_DB)) ? WORDS_DB : (typeof WORDS !== "undefined" && Array.isArray(WORDS) ? WORDS : []);
        window.KalimatWebUI.initLexiconExplorer({
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
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const heroCopy = typeof document.querySelector === "function" ? document.querySelector(".hero-copy") : null;
        if (heroCopy) heroCopy.classList.add("is-visible");
        return;
    }

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
