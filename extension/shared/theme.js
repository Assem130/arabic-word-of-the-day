(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatTheme = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const VALID_THEMES = Object.freeze(["paper", "emerald", "midnight"]);
  const DEFAULT_THEME = "paper";
  const PRIMARY_STORAGE_KEY = "kalimat.theme";
  const LEGACY_STORAGE_KEY = "kalimat_theme";

  const THEME_PALETTES = Object.freeze({
    paper: Object.freeze({
      ink: "#14211b",
      inkSoft: "#24332b",
      paper: "#d8cfbf",
      paperLight: "#f3efe5",
      lime: "#d9ff76",
      lineDark: "rgba(20, 33, 27, 0.34)",
      lineLight: "rgba(243, 239, 229, 0.40)",
      navBg: "rgba(20, 33, 27, 0.94)",
    }),
    emerald: Object.freeze({
      ink: "#062c22",
      inkSoft: "#114b3d",
      paper: "#e2dabf",
      paperLight: "#f4f0e6",
      lime: "#d4af37",
      lineDark: "rgba(6, 44, 34, 0.34)",
      lineLight: "rgba(244, 240, 230, 0.40)",
      navBg: "rgba(6, 44, 34, 0.94)",
    }),
    midnight: Object.freeze({
      ink: "#f1f5f9",
      inkSoft: "#cbd5e1",
      paper: "#152244",
      paperLight: "#0b1329",
      lime: "#38bdf8",
      lineDark: "rgba(241, 245, 249, 0.20)",
      lineLight: "rgba(241, 245, 249, 0.15)",
      navBg: "rgba(7, 13, 28, 0.94)",
    }),
  });

  /**
   * Normalizes theme input against the valid theme whitelist.
   * Falls back to "paper" for invalid or corrupt inputs.
   *
   * @param {*} theme
   * @returns {"paper"|"emerald"|"midnight"}
   */
  function normalizeTheme(theme) {
    if (typeof theme !== "string") return DEFAULT_THEME;
    const trimmed = theme.trim().toLowerCase();
    return VALID_THEMES.includes(trimmed) ? trimmed : DEFAULT_THEME;
  }

  /**
   * Applies the theme attribute to the document element (e.g. <html data-theme="...">).
   *
   * @param {string} theme
   * @param {Document} [targetDoc]
   * @returns {string} The normalized applied theme
   */
  function applyTheme(theme, targetDoc) {
    const normalized = normalizeTheme(theme);
    const doc = targetDoc || (typeof document !== "undefined" ? document : null);
    if (doc && doc.documentElement && typeof doc.documentElement.setAttribute === "function") {
      doc.documentElement.setAttribute("data-theme", normalized);
    }
    return normalized;
  }

  function markThemeReady(targetDoc) {
    const doc = targetDoc || (typeof document !== "undefined" ? document : null);
    if (doc && doc.documentElement && typeof doc.documentElement.setAttribute === "function") {
      doc.documentElement.setAttribute("data-theme-ready", "true");
    }
  }

  /**
   * Resolves the extension storage local area.
   * @param {*} [storageArea]
   * @returns {*}
   */
  function resolveStorageArea(storageArea) {
    if (storageArea) return storageArea;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    return null;
  }

  /**
   * Reads the active theme from storage asynchronously.
   *
   * @param {*} [storageArea]
   * @returns {Promise<string>}
   */
  async function getStoredTheme(storageArea) {
    const area = resolveStorageArea(storageArea);

    if (area && typeof area.get === "function") {
      try {
        let result;
        if (area.get.length >= 2) {
          result = await new Promise((resolve) => {
            try {
              const ret = area.get([PRIMARY_STORAGE_KEY, LEGACY_STORAGE_KEY], (data) => resolve(data));
              if (ret && typeof ret.then === "function") {
                ret.then(resolve).catch(() => resolve(null));
              }
            } catch {
              resolve(null);
            }
          });
        } else {
          const ret = area.get([PRIMARY_STORAGE_KEY, LEGACY_STORAGE_KEY]);
          result = ret && typeof ret.then === "function" ? await ret : ret;
        }

        if (result && typeof result === "object") {
          const raw = result[PRIMARY_STORAGE_KEY] ?? result[LEGACY_STORAGE_KEY];
          if (raw !== undefined && raw !== null) {
            return normalizeTheme(raw);
          }
        }
      } catch {
        // Fallback on storage errors
      }
    }

    try {
      if (typeof localStorage !== "undefined") {
        const local = localStorage.getItem(PRIMARY_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (local) return normalizeTheme(local);
      }
    } catch {}

    return DEFAULT_THEME;
  }

  /**
   * Persists the selected theme to storage and applies it to the DOM.
   *
   * @param {string} theme
   * @param {*} [storageArea]
   * @param {Document} [targetDoc]
   * @returns {Promise<string>}
   */
  async function setStoredTheme(theme, storageArea, targetDoc) {
    const normalized = normalizeTheme(theme);
    applyTheme(normalized, targetDoc);

    const area = resolveStorageArea(storageArea);
    if (area && typeof area.set === "function") {
      try {
        const payload = {
          [PRIMARY_STORAGE_KEY]: normalized,
          [LEGACY_STORAGE_KEY]: normalized,
        };
        if (area.set.length >= 2) {
          await new Promise((resolve) => {
            try {
              const ret = area.set(payload, () => resolve());
              if (ret && typeof ret.then === "function") {
                ret.then(resolve).catch(() => resolve());
              }
            } catch {
              resolve();
            }
          });
        } else {
          const ret = area.set(payload);
          if (ret && typeof ret.then === "function") {
            await ret;
          }
        }
      } catch {
        // Storage failure fallback
      }
    }

    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(PRIMARY_STORAGE_KEY, normalized);
        localStorage.setItem(LEGACY_STORAGE_KEY, normalized);
      }
    } catch {}

    return normalized;
  }

  /**
   * Initializes the theme controller, hydrating the active theme immediately to prevent FOUC,
   * binding UI select dropdowns, and subscribing to storage changes for cross-view synchronization.
   *
   * @param {object} [options]
   * @param {*} [options.storageArea]
   * @param {Document} [options.targetDoc]
   * @param {HTMLSelectElement} [options.selectElement]
   * @param {Function} [options.onChange]
   * @returns {object} Controller instance with getTheme, setTheme, and cleanup methods.
   */
  function initThemeController(options = {}) {
    const { storageArea, targetDoc, selectElement, onChange } = options;
    const doc = targetDoc || (typeof document !== "undefined" ? document : null);
    let select = selectElement;
    if (!select && doc && typeof doc.getElementById === "function") {
      select = doc.getElementById("theme-select");
    }

    let currentTheme = DEFAULT_THEME;
    let themeRevision = 0;
    const initRevision = ++themeRevision;

    // 1. Immediate anti-FOUC DOM hydration from synchronous localStorage or document attribute
    try {
      if (typeof localStorage !== "undefined") {
        const local = localStorage.getItem(PRIMARY_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (local) currentTheme = normalizeTheme(local);
      }
    } catch {}
    if (doc && doc.documentElement && typeof doc.documentElement.getAttribute === "function") {
      const existingAttr = doc.documentElement.getAttribute("data-theme");
      if (existingAttr && VALID_THEMES.includes(existingAttr)) {
        currentTheme = existingAttr;
      }
    }
    applyTheme(currentTheme, doc);
    if (select) {
      select.value = currentTheme;
    }

    // 2. Asynchronous storage hydration (discard if user/external action occurred)
    getStoredTheme(storageArea)
      .then((stored) => {
        if (themeRevision === initRevision && stored && stored !== currentTheme) {
          currentTheme = stored;
          applyTheme(stored, doc);
          if (select) select.value = stored;
          if (typeof onChange === "function") onChange(stored);
        }
        markThemeReady(doc);
      })
      .catch(() => markThemeReady(doc));

    // 3. UI select change handler
    const handleSelectChange = (event) => {
      ++themeRevision;
      const val =
        event && event.target && event.target.value !== undefined
          ? event.target.value
          : select
            ? select.value
            : "";
      const normalized = normalizeTheme(val);
      currentTheme = normalized;
      if (select) select.value = normalized;
      setStoredTheme(normalized, storageArea, doc);
      if (typeof onChange === "function") onChange(normalized);
    };

    if (select && typeof select.addEventListener === "function") {
      select.addEventListener("change", handleSelectChange);
    }

    // 4. Storage change listener for live cross-view synchronization
    const handleStorageChange = (changes, areaName) => {
      if (areaName && areaName !== "local") return;
      if (changes && (changes[PRIMARY_STORAGE_KEY] || changes[LEGACY_STORAGE_KEY])) {
        const change = changes[PRIMARY_STORAGE_KEY] || changes[LEGACY_STORAGE_KEY];
        if (change && change.newValue !== undefined) {
          const newTheme = normalizeTheme(change.newValue);
          if (newTheme !== currentTheme) {
            ++themeRevision;
            currentTheme = newTheme;
            applyTheme(newTheme, doc);
            if (select) select.value = newTheme;
            if (typeof onChange === "function") onChange(newTheme);
          }
        }
      }
    };

    let storageSource = null;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      storageSource = chrome.storage.onChanged;
    } else if (typeof browser !== "undefined" && browser.storage && browser.storage.onChanged) {
      storageSource = browser.storage.onChanged;
    } else if (storageArea && storageArea.onChanged) {
      storageSource = storageArea.onChanged;
    }

    if (storageSource && typeof storageSource.addListener === "function") {
      storageSource.addListener(handleStorageChange);
    }

    return {
      getTheme() {
        return currentTheme;
      },
      async setTheme(theme) {
        ++themeRevision;
        const normalized = normalizeTheme(theme);
        currentTheme = normalized;
        if (select) select.value = normalized;
        await setStoredTheme(normalized, storageArea, doc);
        if (typeof onChange === "function") onChange(normalized);
        return normalized;
      },
      cleanup() {
        if (select && typeof select.removeEventListener === "function") {
          select.removeEventListener("change", handleSelectChange);
        }
        if (storageSource && typeof storageSource.removeListener === "function") {
          storageSource.removeListener(handleStorageChange);
        }
      },
    };
  }

  /**
   * Parses a hex color string into [R, G, B] integer channels.
   * @param {string} hex
   * @returns {[number, number, number]}
   */
  function parseHexColor(hex) {
    if (typeof hex !== "string") return [0, 0, 0];
    const clean = hex.replace(/^#/, "").trim();
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16);
      const g = parseInt(clean[1] + clean[1], 16);
      const b = parseInt(clean[2] + clean[2], 16);
      return [r, g, b];
    }
    const num = parseInt(clean, 16);
    if (Number.isNaN(num)) return [0, 0, 0];
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  /**
   * Computes W3C relative luminance from sRGB integer channels.
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {number}
   */
  function getRelativeLuminance(r, g, b) {
    const rs = r / 255;
    const gs = g / 255;
    const bs = b / 255;
    const rl = rs <= 0.04045 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
    const gl = gs <= 0.04045 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
    const bl = bs <= 0.04045 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  }

  /**
   * Computes the WCAG 2.1 contrast ratio between two hex colors.
   * @param {string} hex1
   * @param {string} hex2
   * @returns {number}
   */
  function getContrastRatio(hex1, hex2) {
    const [r1, g1, b1] = parseHexColor(hex1);
    const [r2, g2, b2] = parseHexColor(hex2);
    const l1 = getRelativeLuminance(r1, g1, b1);
    const l2 = getRelativeLuminance(r2, g2, b2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  return {
    VALID_THEMES,
    DEFAULT_THEME,
    PRIMARY_STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    THEME_PALETTES,
    normalizeTheme,
    applyTheme,
    getStoredTheme,
    setStoredTheme,
    initThemeController,
    parseHexColor,
    getRelativeLuminance,
    getContrastRatio,
  };
});
