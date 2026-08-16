const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
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
} = require("../shared/theme.js");

const themeCssPath = path.join(__dirname, "..", "shared", "theme.css");

function createMockDocument(initialTheme = null) {
  const attributes = Object.create(null);
  if (initialTheme) {
    attributes["data-theme"] = { name: "data-theme", value: initialTheme };
  }
  const documentElement = {
    attributes,
    setAttribute(name, value) {
      this.attributes[name] = { name, value: String(value) };
    },
    getAttribute(name) {
      return this.attributes[name]?.value ?? null;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
  };

  const elements = new Map();
  return {
    documentElement,
    registerElement(id, el) {
      elements.set(id, el);
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
  };
}

function createMockSelect(initialValue = "") {
  const listeners = {};
  return {
    value: initialValue,
    listeners,
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((l) => l !== fn);
    },
    emit(type, eventObj) {
      if (!listeners[type]) return;
      for (const fn of listeners[type]) {
        fn(eventObj || { target: this });
      }
    },
  };
}

function createMockStorageArea(initialData = {}, options = {}) {
  const store = { ...initialData };
  const listeners = [];
  return {
    store,
    listeners,
    async get(keys) {
      if (options.failGet) throw new Error("Storage get failure");
      const result = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        if (store[k] !== undefined) result[k] = store[k];
      }
      return result;
    },
    async set(items) {
      if (options.failSet) throw new Error("Storage set failure");
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: store[k], newValue: v };
        store[k] = v;
      }
      for (const fn of listeners) {
        fn(changes, "local");
      }
    },
    onChanged: {
      addListener(fn) {
        listeners.push(fn);
      },
      removeListener(fn) {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      },
    },
  };
}

// -----------------------------------------------------------------------------
// 1. Color Parsing, Relative Luminance & WCAG 2.1 AA Contrast Tests
// -----------------------------------------------------------------------------

test("parseHexColor correctly converts standard and short hex colors to RGB tuples", () => {
  assert.deepEqual(parseHexColor("#14211b"), [20, 33, 27]);
  assert.deepEqual(parseHexColor("#f3efe5"), [243, 239, 229]);
  assert.deepEqual(parseHexColor("#062c22"), [6, 44, 34]);
  assert.deepEqual(parseHexColor("#0b1329"), [11, 19, 41]);
  assert.deepEqual(parseHexColor("#fff"), [255, 255, 255]);
  assert.deepEqual(parseHexColor("#000"), [0, 0, 0]);
  assert.deepEqual(parseHexColor("invalid"), [0, 0, 0]);
  assert.deepEqual(parseHexColor(null), [0, 0, 0]);
});

test("getRelativeLuminance computes accurate W3C sRGB relative luminance", () => {
  const whiteL = getRelativeLuminance(255, 255, 255);
  const blackL = getRelativeLuminance(0, 0, 0);
  assert.equal(Math.abs(whiteL - 1.0) < 0.0001, true, "White luminance must be 1.0");
  assert.equal(Math.abs(blackL - 0.0) < 0.0001, true, "Black luminance must be 0.0");
});

test("Paper theme satisfies WCAG 2.1 AA contrast requirements (>= 4.5:1) across all UI element pairs", () => {
  const { ink, inkSoft, paper, paperLight, lime } = THEME_PALETTES.paper;

  // Primary text on page background
  const inkOnPage = getContrastRatio(ink, paperLight);
  assert.ok(inkOnPage >= 4.5, `Paper ink on paper-light (${inkOnPage.toFixed(2)}:1) must be >= 4.5:1`);
  assert.ok(inkOnPage >= 7.0, "Paper ink on paper-light satisfies AAA requirement (>= 7.0:1)");

  // Secondary text on page background
  const inkSoftOnPage = getContrastRatio(inkSoft, paperLight);
  assert.ok(inkSoftOnPage >= 4.5, `Paper ink-soft on paper-light (${inkSoftOnPage.toFixed(2)}:1) must be >= 4.5:1`);

  // Primary text on card surface
  const inkOnCard = getContrastRatio(ink, paper);
  assert.ok(inkOnCard >= 4.5, `Paper ink on paper card (${inkOnCard.toFixed(2)}:1) must be >= 4.5:1`);

  // Primary text on accent button
  const inkOnLime = getContrastRatio(ink, lime);
  assert.ok(inkOnLime >= 4.5, `Paper ink on lime button (${inkOnLime.toFixed(2)}:1) must be >= 4.5:1`);

  // Inverted header / dark nav text
  const lightOnDarkNav = getContrastRatio(paperLight, ink);
  assert.ok(lightOnDarkNav >= 4.5, `Paper light text on dark nav (${lightOnDarkNav.toFixed(2)}:1) must be >= 4.5:1`);
});

test("Emerald theme satisfies WCAG 2.1 AA contrast requirements (>= 4.5:1) across all UI element pairs", () => {
  const { ink, inkSoft, paper, paperLight, lime } = THEME_PALETTES.emerald;

  // Primary text on page background
  const inkOnPage = getContrastRatio(ink, paperLight);
  assert.ok(inkOnPage >= 4.5, `Emerald ink on paper-light (${inkOnPage.toFixed(2)}:1) must be >= 4.5:1`);
  assert.ok(inkOnPage >= 7.0, "Emerald ink on paper-light satisfies AAA requirement (>= 7.0:1)");

  // Secondary text on page background
  const inkSoftOnPage = getContrastRatio(inkSoft, paperLight);
  assert.ok(inkSoftOnPage >= 4.5, `Emerald ink-soft on paper-light (${inkSoftOnPage.toFixed(2)}:1) must be >= 4.5:1`);

  // Primary text on card surface
  const inkOnCard = getContrastRatio(ink, paper);
  assert.ok(inkOnCard >= 4.5, `Emerald ink on paper card (${inkOnCard.toFixed(2)}:1) must be >= 4.5:1`);

  // Button text on gold accent
  const inkOnGold = getContrastRatio(ink, lime);
  assert.ok(inkOnGold >= 4.5, `Emerald ink on gold accent (${inkOnGold.toFixed(2)}:1) must be >= 4.5:1`);

  // Light text on dark nav
  const lightOnNav = getContrastRatio(paperLight, ink);
  assert.ok(lightOnNav >= 4.5, `Emerald light text on dark nav (${lightOnNav.toFixed(2)}:1) must be >= 4.5:1`);
});

test("Midnight theme satisfies WCAG 2.1 AA contrast requirements (>= 4.5:1) across all UI element pairs", () => {
  const { ink, inkSoft, paper, paperLight, lime } = THEME_PALETTES.midnight;

  // Primary text on dark page background
  const inkOnDark = getContrastRatio(ink, paperLight);
  assert.ok(inkOnDark >= 4.5, `Midnight ink on dark background (${inkOnDark.toFixed(2)}:1) must be >= 4.5:1`);
  assert.ok(inkOnDark >= 7.0, "Midnight ink on dark background satisfies AAA requirement (>= 7.0:1)");

  // Secondary text on dark page background
  const inkSoftOnDark = getContrastRatio(inkSoft, paperLight);
  assert.ok(inkSoftOnDark >= 4.5, `Midnight ink-soft on dark background (${inkSoftOnDark.toFixed(2)}:1) must be >= 4.5:1`);

  // Primary text on navy card surface
  const inkOnNavyCard = getContrastRatio(ink, paper);
  assert.ok(inkOnNavyCard >= 4.5, `Midnight ink on navy card (${inkOnNavyCard.toFixed(2)}:1) must be >= 4.5:1`);

  // Dark text on cyan accent button
  const darkOnCyan = getContrastRatio(paperLight, lime);
  assert.ok(darkOnCyan >= 4.5, `Midnight dark text on cyan accent (${darkOnCyan.toFixed(2)}:1) must be >= 4.5:1`);

  // Cyan accent on dark page background
  const cyanOnDark = getContrastRatio(lime, paperLight);
  assert.ok(cyanOnDark >= 4.5, `Midnight cyan on dark background (${cyanOnDark.toFixed(2)}:1) must be >= 4.5:1`);
});

// -----------------------------------------------------------------------------
// 2. Theme Normalization & Fallbacks
// -----------------------------------------------------------------------------

test("normalizeTheme returns valid theme names unchanged", () => {
  assert.equal(normalizeTheme("paper"), "paper");
  assert.equal(normalizeTheme("emerald"), "emerald");
  assert.equal(normalizeTheme("midnight"), "midnight");
});

test("normalizeTheme handles casing and whitespace gracefully", () => {
  assert.equal(normalizeTheme("  PAPER  "), "paper");
  assert.equal(normalizeTheme("Emerald"), "emerald");
  assert.equal(normalizeTheme("MIDNIGHT"), "midnight");
});

test("normalizeTheme reverts invalid and corrupt inputs to default 'paper' theme", () => {
  assert.equal(normalizeTheme("dark"), "paper");
  assert.equal(normalizeTheme("light"), "paper");
  assert.equal(normalizeTheme("sepia"), "paper");
  assert.equal(normalizeTheme(""), "paper");
  assert.equal(normalizeTheme("   "), "paper");
  assert.equal(normalizeTheme(null), "paper");
  assert.equal(normalizeTheme(undefined), "paper");
  assert.equal(normalizeTheme(123), "paper");
  assert.equal(normalizeTheme({}), "paper");
  assert.equal(normalizeTheme(["emerald"]), "paper");
  assert.equal(normalizeTheme(true), "paper");
});

// -----------------------------------------------------------------------------
// 3. applyTheme DOM Application
// -----------------------------------------------------------------------------

test("applyTheme applies data-theme attribute to documentElement", () => {
  const doc = createMockDocument();
  assert.equal(applyTheme("emerald", doc), "emerald");
  assert.equal(doc.documentElement.getAttribute("data-theme"), "emerald");

  assert.equal(applyTheme("midnight", doc), "midnight");
  assert.equal(doc.documentElement.getAttribute("data-theme"), "midnight");

  assert.equal(applyTheme("invalid-theme", doc), "paper");
  assert.equal(doc.documentElement.getAttribute("data-theme"), "paper");
});

test("applyTheme gracefully handles missing or null document", () => {
  assert.doesNotThrow(() => {
    const res = applyTheme("emerald", null);
    assert.equal(res, "emerald");
  });
});

// -----------------------------------------------------------------------------
// 4. Storage Persistence: getStoredTheme & setStoredTheme
// -----------------------------------------------------------------------------

test("getStoredTheme reads primary key 'kalimat.theme' from storage", async () => {
  const storage = createMockStorageArea({ [PRIMARY_STORAGE_KEY]: "midnight" });
  const theme = await getStoredTheme(storage);
  assert.equal(theme, "midnight");
});

test("getStoredTheme reads legacy key 'kalimat_theme' when primary is absent", async () => {
  const storage = createMockStorageArea({ [LEGACY_STORAGE_KEY]: "emerald" });
  const theme = await getStoredTheme(storage);
  assert.equal(theme, "emerald");
});

test("getStoredTheme falls back to 'paper' on corrupt or unknown stored value", async () => {
  const storage = createMockStorageArea({ [PRIMARY_STORAGE_KEY]: "cyberpunk-neon" });
  const theme = await getStoredTheme(storage);
  assert.equal(theme, "paper");
});

test("getStoredTheme falls back to 'paper' on empty storage or storage get error", async () => {
  const emptyStorage = createMockStorageArea({});
  assert.equal(await getStoredTheme(emptyStorage), "paper");

  const failingStorage = createMockStorageArea({}, { failGet: true });
  assert.equal(await getStoredTheme(failingStorage), "paper");
});

test("setStoredTheme persists normalized theme to storage and updates DOM", async () => {
  const doc = createMockDocument();
  const storage = createMockStorageArea({});

  const result = await setStoredTheme("emerald", storage, doc);
  assert.equal(result, "emerald");
  assert.equal(storage.store[PRIMARY_STORAGE_KEY], "emerald");
  assert.equal(storage.store[LEGACY_STORAGE_KEY], "emerald");
  assert.equal(doc.documentElement.getAttribute("data-theme"), "emerald");
});

test("setStoredTheme safely handles storage set errors without throwing", async () => {
  const doc = createMockDocument();
  const failingStorage = createMockStorageArea({}, { failSet: true });

  await assert.doesNotReject(async () => {
    const result = await setStoredTheme("midnight", failingStorage, doc);
    assert.equal(result, "midnight");
    assert.equal(doc.documentElement.getAttribute("data-theme"), "midnight");
  });
});

// -----------------------------------------------------------------------------
// 5. Theme Controller & Cross-View Synchronization
// -----------------------------------------------------------------------------

test("initThemeController hydrates DOM immediately and sets select value", async () => {
  const doc = createMockDocument();
  const select = createMockSelect("paper");
  doc.registerElement("theme-select", select);

  const storage = createMockStorageArea({ [PRIMARY_STORAGE_KEY]: "midnight" });
  const controller = initThemeController({
    storageArea: storage,
    targetDoc: doc,
    selectElement: select,
  });

  // Immediate anti-FOUC hydration defaults to paper (or current)
  assert.equal(doc.documentElement.getAttribute("data-theme"), "paper");

  // Asynchronous storage load resolves to midnight
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(doc.documentElement.getAttribute("data-theme"), "midnight");
  assert.equal(select.value, "midnight");
  assert.equal(controller.getTheme(), "midnight");
  assert.equal(doc.documentElement.getAttribute("data-theme-ready"), "true");

  controller.cleanup();
});

test("initThemeController select change updates theme and persists to storage", async () => {
  const doc = createMockDocument();
  const select = createMockSelect("paper");
  doc.registerElement("theme-select", select);

  let notifiedTheme = null;
  const storage = createMockStorageArea({ [PRIMARY_STORAGE_KEY]: "paper" });
  const controller = initThemeController({
    storageArea: storage,
    targetDoc: doc,
    selectElement: select,
    onChange: (t) => {
      notifiedTheme = t;
    },
  });

  // User selects "emerald" in dropdown
  select.value = "emerald";
  select.emit("change", { target: select });

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(doc.documentElement.getAttribute("data-theme"), "emerald");
  assert.equal(storage.store[PRIMARY_STORAGE_KEY], "emerald");
  assert.equal(notifiedTheme, "emerald");
  assert.equal(controller.getTheme(), "emerald");

  controller.cleanup();
});

test("initThemeController syncs theme across tabs/views via storage.onChanged", async () => {
  const doc = createMockDocument();
  const select = createMockSelect("paper");
  doc.registerElement("theme-select", select);

  let changeCallbackCalledWith = null;
  const storage = createMockStorageArea({ [PRIMARY_STORAGE_KEY]: "paper" });
  const controller = initThemeController({
    storageArea: storage,
    targetDoc: doc,
    selectElement: select,
    onChange: (t) => {
      changeCallbackCalledWith = t;
    },
  });

  // Simulate another tab/view writing "midnight" to storage
  await storage.set({ [PRIMARY_STORAGE_KEY]: "midnight" });

  assert.equal(doc.documentElement.getAttribute("data-theme"), "midnight");
  assert.equal(select.value, "midnight");
  assert.equal(changeCallbackCalledWith, "midnight");
  assert.equal(controller.getTheme(), "midnight");

  controller.cleanup();
});

test("initThemeController setTheme method updates DOM, storage, and select element", async () => {
  const doc = createMockDocument();
  const select = createMockSelect("paper");
  doc.registerElement("theme-select", select);

  const storage = createMockStorageArea({ [PRIMARY_STORAGE_KEY]: "paper" });
  const controller = initThemeController({
    storageArea: storage,
    targetDoc: doc,
    selectElement: select,
  });

  await controller.setTheme("emerald");

  assert.equal(doc.documentElement.getAttribute("data-theme"), "emerald");
  assert.equal(select.value, "emerald");
  assert.equal(storage.store[PRIMARY_STORAGE_KEY], "emerald");
  assert.equal(controller.getTheme(), "emerald");

  controller.cleanup();
});

test("initThemeController cleanup removes select and storage listeners", async () => {
  const doc = createMockDocument();
  const select = createMockSelect("paper");
  doc.registerElement("theme-select", select);

  const storage = createMockStorageArea({ [PRIMARY_STORAGE_KEY]: "paper" });
  const controller = initThemeController({
    storageArea: storage,
    targetDoc: doc,
    selectElement: select,
  });

  assert.equal(select.listeners["change"].length, 1);
  assert.equal(storage.listeners.length, 1);

  controller.cleanup();

  assert.equal(select.listeners["change"].length, 0);
  assert.equal(storage.listeners.length, 0);
});

// -----------------------------------------------------------------------------
// 6. Theme CSS Tokens & Diacritic Protection Static Verification
// -----------------------------------------------------------------------------

test("theme.css defines all required theme tokens and diacritic protection rules", () => {
  const css = fs.readFileSync(themeCssPath, "utf8");

  // Palettes
  assert.match(css, /html\[data-theme="paper"\]|:root/, "must define paper theme");
  assert.match(css, /html\[data-theme="emerald"\]/, "must define emerald theme");
  assert.match(css, /html\[data-theme="midnight"\]/, "must define midnight theme");

  // Paper tokens
  assert.match(css, /--ink:\s*#14211b/);
  assert.match(css, /--ink-soft:\s*#24332b/);
  assert.match(css, /--paper:\s*#d8cfbf/);
  assert.match(css, /--paper-light:\s*#f3efe5/);
  assert.match(css, /--lime:\s*#d9ff76/);
  assert.match(css, /--line-dark:\s*rgba\(20,\s*33,\s*27,\s*0\.34\)/);
  assert.match(css, /--line-light:\s*rgba\(243,\s*239,\s*229,\s*0\.40\)/);
  assert.match(css, /--nav-bg:\s*rgba\(20,\s*33,\s*27,\s*0\.94\)/);

  // Emerald tokens
  assert.match(css, /--ink:\s*#062c22/);
  assert.match(css, /--ink-soft:\s*#114b3d/);
  assert.match(css, /--paper:\s*#e2dabf/);
  assert.match(css, /--paper-light:\s*#f4f0e6/);
  assert.match(css, /--lime:\s*#d4af37/);
  assert.match(css, /--line-dark:\s*rgba\(6,\s*44,\s*34,\s*0\.34\)/);
  assert.match(css, /--line-light:\s*rgba\(244,\s*240,\s*230,\s*0\.40\)/);
  assert.match(css, /--nav-bg:\s*rgba\(6,\s*44,\s*34,\s*0\.94\)/);

  // Midnight tokens
  assert.match(css, /--ink:\s*#f1f5f9/);
  assert.match(css, /--ink-soft:\s*#cbd5e1/);
  assert.match(css, /--paper:\s*#152244/);
  assert.match(css, /--paper-light:\s*#0b1329/);
  assert.match(css, /--lime:\s*#38bdf8/);
  assert.match(css, /--line-dark:\s*rgba\(241,\s*245,\s*249,\s*0\.20\)/);
  assert.match(css, /--line-light:\s*rgba\(241,\s*245,\s*249,\s*0\.15\)/);
  assert.match(css, /--nav-bg:\s*rgba\(7,\s*13,\s*28,\s*0\.94\)/);

  // Typography tokens
  assert.match(css, /--serif:\s*"Amiri"/);
  assert.match(css, /--sans:\s*"Outfit"/);

  // Diacritic protection line heights
  assert.match(css, /line-height:\s*1\.35/, "headword line height must protect harakat");
  assert.match(css, /line-height:\s*1\.45/, "meaning line height must protect harakat");
  assert.match(css, /line-height:\s*1\.65/, "example line height must protect harakat");

  // Accessibility
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
});
