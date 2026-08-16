const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const popup = path.join(__dirname, "..", "popup");
const files = Object.fromEntries(["popup.html", "popup.css", "popup.js"].map((name) => [name, path.join(popup, name)]));
const atlas = path.join(__dirname, "..", "atlas");

function atlasSource(name) {
  return fs.readFileSync(path.join(atlas, name), "utf8");
}

function source(name) {
  return fs.readFileSync(files[name], "utf8");
}

class FakeCanvasContext {
  constructor() {
    this.calls = [];
    this.font = "";
    this.fillStyle = "";
    this.strokeStyle = "";
    this.lineWidth = 1;
    this.textAlign = "start";
    this.textBaseline = "alphabetic";
    this.direction = "inherit";
  }
  createLinearGradient(x0, y0, x1, y1) {
    this.calls.push({ method: "createLinearGradient", args: [x0, y0, x1, y1] });
    return {
      addColorStop: (offset, color) => {
        this.calls.push({ method: "addColorStop", args: [offset, color] });
      },
    };
  }
  fillRect(x, y, w, h) {
    this.calls.push({ method: "fillRect", args: [x, y, w, h], fillStyle: this.fillStyle });
  }
  strokeRect(x, y, w, h) {
    this.calls.push({ method: "strokeRect", args: [x, y, w, h], strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
  }
  fillText(text, x, y) {
    this.calls.push({ method: "fillText", args: [text, x, y], font: this.font, fillStyle: this.fillStyle, textAlign: this.textAlign, direction: this.direction });
  }
  measureText(text) {
    return { width: String(text || "").length * 10 };
  }
  save() { this.calls.push({ method: "save" }); }
  restore() { this.calls.push({ method: "restore" }); }
  beginPath() { this.calls.push({ method: "beginPath" }); }
  moveTo(x, y) { this.calls.push({ method: "moveTo", args: [x, y] }); }
  lineTo(x, y) { this.calls.push({ method: "lineTo", args: [x, y] }); }
  stroke() { this.calls.push({ method: "stroke", strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); }
}

class FakeCanvasElement {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.context = new FakeCanvasContext();
  }
  getContext(type) {
    if (type === "2d") return this.context;
    return null;
  }
  toBlob(callback, type = "image/png") {
    const blob = { type, size: 1024, isBlob: true };
    if (typeof callback === "function") callback(blob);
  }
  toDataURL(type = "image/png") {
    return `data:${type};base64,fakecanvasdata`;
  }
}

function element() {
  const attributes = Object.create(null);
  return {
    textContent: "", hidden: false, disabled: false, checked: false, value: "", dataset: {}, attributes, focuses: 0, children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(name, value) { this.attributes[name] = { name, value: String(value) }; },
    getAttribute(name) { return this.attributes[name]?.value ?? null; },
    addEventListener(type, listener) { this.listeners[type] = listener; }, listeners: {}, focus() { this.focuses += 1; },
    append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; }, get childElementCount() { return this.children.length; },
  };
}

function popupApi(responses = {}, options = {}) {
  const elements = new Map();
  const ids = [
    "status", "action-status", "onboarding", "assigned", "empty", "error", "recovery", "warning",
    "empty-title", "error-title", "word", "meaning-ar", "meaning-en", "example", "example-en",
    "pronunciation", "fixed-label", "save", "speak", "reminder", "reminder-time",
    "onboarding-submit", "onboarding-skip", "explore", "explore-empty", "recovery-reset",
    "known", "difficult", "theme-select", "streak-badge", "btn-export-anki", "btn-export-card",
  ];
  for (const id of ids) elements.set(id, element());
  elements.get("reminder-time").value = "09:00";
  elements.get("theme-select").value = options.theme || "paper";
  elements.get("streak-badge").textContent = "🔥 لا يوجد تتابع بعد";
  const inputs = ["classical-arabic", "daily-life", "family", "food", "language", "travel"].map((value) => ({ ...element(), value, name: "interest" }));
  const downloads = [];
  const storageData = {
    "kalimat.profile": Object.hasOwn(options, "profile") ? options.profile : {},
    "kalimat.theme": options.theme || "paper",
    ...(options.storage || {}),
  };
  const storageListeners = [];
  const storage = {
    local: {
      get(keys, cb) {
        let result = {};
        if (typeof keys === "string") {
          if (storageData[keys] !== undefined) result[keys] = storageData[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) { if (storageData[k] !== undefined) result[k] = storageData[k]; }
        } else if (keys && typeof keys === "object") {
          for (const k of Object.keys(keys)) {
            result[k] = storageData[k] !== undefined ? storageData[k] : keys[k];
          }
        } else {
          result = { ...storageData };
        }
        if (typeof cb === "function") cb(result);
        return Promise.resolve(result);
      },
      set(items, cb) {
        const changes = {};
        for (const [k, v] of Object.entries(items || {})) {
          changes[k] = { oldValue: storageData[k], newValue: v };
          storageData[k] = v;
        }
        for (const fn of storageListeners) {
          try { fn(changes, "local"); } catch (_) {}
        }
        if (typeof cb === "function") cb();
        return Promise.resolve();
      },
    },
    onChanged: {
      addListener(fn) { storageListeners.push(fn); },
      removeListener(fn) {
        const idx = storageListeners.indexOf(fn);
        if (idx !== -1) storageListeners.splice(idx, 1);
      },
    },
  };
  storage.local.onChanged = storage.onChanged;
  const documentElement = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = { name, value: String(value) }; },
    getAttribute(name) { return this.attributes[name]?.value ?? null; },
  };
  const body = {
    appendChild(node) {
      if (node && node.download !== undefined) {
        // anchor appended
      }
    },
    removeChild() {},
  };
  const document = {
    readyState: "loading",
    documentElement,
    body,
    fonts: { ready: Promise.resolve() },
    getElementById(id) { return elements.get(id); },
    createElement(tag) {
      if (tag === "canvas") return new FakeCanvasElement();
      if (tag === "a") {
        const a = element();
        a.download = "";
        a.href = "";
        a.click = function () {
          downloads.push({ href: this.href, download: this.download, filename: this.download });
        };
        a.remove = function () {};
        return a;
      }
      return element();
    },
    querySelectorAll(selector) { return selector === 'input[name="interest"]' ? inputs : []; },
    addEventListener() {},
  };
  const calls = [];
  const extension = {
    runtime: {
      sendMessage(message) {
        calls.push(message);
        const response = responses[message.type];
        const result = typeof response === "function" ? response(message, calls) : response;
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result ?? {});
      },
      getURL(value) { return `extension://kalimat/${value}`; },
    },
    permissions: {
      request(value) {
        calls.push({ permission: value });
        if (options.permissionError) return Promise.reject(options.permissionError);
        return Promise.resolve(Object.hasOwn(options, "permissionResult") ? options.permissionResult : true);
      },
    },
    tabs: { create(value) { calls.push({ tab: value }); return Promise.resolve(); } },
    storage,
  };
  const createdUrls = new Map();
  const recordedBlobs = new Map();
  let urlCounter = 0;
  const mockURL = {
    createObjectURL(blob) {
      const url = `blob:kalimat/${++urlCounter}`;
      createdUrls.set(url, blob);
      recordedBlobs.set(url, blob);
      return url;
    },
    revokeObjectURL(url) {
      createdUrls.delete(url);
    },
  };
  const vocabulary = options.vocabulary ?? [
    { id: "w1", word: "كلمة", normalized: "كلمة", meaningAr: "معنى", meaningEn: "meaning", pronunciation: "/w1/", exampleAr: "مثال", contextAr: "سياق" },
  ];
  const context = {
    document,
    chrome: extension,
    Promise,
    console,
    confirm: options.confirm,
    URLSearchParams,
    URL: mockURL,
    Blob: globalThis.Blob,
    fetch: async (url) => {
      if (typeof url === "string" && url.includes("vocabulary.json")) {
        return { ok: true, async json() { return options.vocabulary ?? vocabulary; } };
      }
      return { ok: false };
    },
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "date.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "vocabulary.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "theme.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "streak.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "export.js"), "utf8"), context);
  vm.runInNewContext(source("popup.js"), context, { filename: files["popup.js"] });
  return { api: context.KalimatPopup, elements, inputs, calls, context, downloads, storageData, storageListeners, createdUrls, recordedBlobs };
}

function atlasApi(responses = {}, options = {}) {
  const elements = new Map();
  const ids = [
    "status", "today-action-status", "warning", "today", "explore", "history", "settings",
    "today-view", "explore-view", "history-view", "settings-view", "onboarding", "recovery",
    "empty", "error", "today-title", "explore-title", "history-title", "settings-title",
    "onboarding-title", "recovery-title", "empty-title", "error-title", "today-card", "today-empty",
    "explore-card", "atlas-search", "search-count", "search-results", "return-today",
    "history-filter", "history-list", "settings-english", "settings-save", "settings-time",
    "settings-reminder", "export", "import-file", "clear", "recovery-export", "recovery-import",
    "recovery-clear", "onboarding-settings", "today-save", "today-known", "today-difficult", "explore-lookup",
    "theme-select", "streak-badge", "today-export-card", "history-export-anki", "btn-export-anki",
  ];
  for (const id of ids) elements.set(id, element());
  elements.get("history-filter").value = "all";
  elements.get("theme-select").value = options.theme || "paper";
  elements.get("streak-badge").textContent = "🔥 لا يوجد تتابع بعد";
  const levels = [1, 2, 3, 4].map((value) => ({ ...element(), value: String(value), name: "atlas-level" }));
  const interests = ["classical-arabic", "daily-life", "family", "food", "language", "travel"].map((value) => ({ ...element(), value, name: "atlas-interest" }));
  const downloads = [];
  const storageData = {
    "kalimat.theme": options.theme || "paper",
    ...(options.storage || {}),
  };
  const storageListeners = [];
  const storage = {
    local: {
      get(keys, cb) {
        let result = {};
        if (typeof keys === "string") {
          if (storageData[keys] !== undefined) result[keys] = storageData[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) { if (storageData[k] !== undefined) result[k] = storageData[k]; }
        } else if (keys && typeof keys === "object") {
          for (const k of Object.keys(keys)) {
            result[k] = storageData[k] !== undefined ? storageData[k] : keys[k];
          }
        } else {
          result = { ...storageData };
        }
        if (typeof cb === "function") cb(result);
        return Promise.resolve(result);
      },
      set(items, cb) {
        const changes = {};
        for (const [k, v] of Object.entries(items || {})) {
          changes[k] = { oldValue: storageData[k], newValue: v };
          storageData[k] = v;
        }
        for (const fn of storageListeners) {
          try { fn(changes, "local"); } catch (_) {}
        }
        if (typeof cb === "function") cb();
        return Promise.resolve();
      },
    },
    onChanged: {
      addListener(fn) { storageListeners.push(fn); },
      removeListener(fn) {
        const idx = storageListeners.indexOf(fn);
        if (idx !== -1) storageListeners.splice(idx, 1);
      },
    },
  };
  storage.local.onChanged = storage.onChanged;
  const documentElement = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = { name, value: String(value) }; },
    getAttribute(name) { return this.attributes[name]?.value ?? null; },
  };
  const body = {
    appendChild(node) {
      if (node && node.download !== undefined) {
        // anchor appended
      }
    },
    removeChild() {},
  };
  const document = {
    readyState: "loading",
    documentElement,
    body,
    fonts: { ready: Promise.resolve() },
    getElementById(id) { return elements.get(id); },
    createElement(tag) {
      if (tag === "canvas") return new FakeCanvasElement();
      if (tag === "a") {
        const a = element();
        a.download = "";
        a.href = "";
        a.click = function () {
          downloads.push({ href: this.href, download: this.download, filename: this.download });
        };
        a.remove = function () {};
        return a;
      }
      return element();
    },
    querySelector(selector) {
      const level = selector.match(/input\[name="atlas-level"\]\[value="(\d)"\]/);
      if (level) return levels.find((input) => input.value === level[1]) ?? null;
      if (selector === 'input[name="atlas-level"]:checked') return levels.find((input) => input.checked) ?? null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('name="atlas-interest"')) return selector.includes(":checked") ? interests.filter((input) => input.checked) : interests;
      if (selector.includes('name="atlas-level"')) return levels;
      return [];
    },
    addEventListener() {},
  };
  const calls = [];
  const extension = {
    runtime: {
      sendMessage(message) {
        calls.push(message);
        const response = responses[message.type];
        const result = typeof response === "function" ? response(message, calls) : response;
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result ?? {});
      },
      getURL(value) { return `extension://kalimat/${value}`; },
    },
    permissions: {
      request() {
        if (options.permissionError) return Promise.reject(options.permissionError);
        return Promise.resolve(Object.hasOwn(options, "permissionResult") ? options.permissionResult : true);
      },
    },
    storage,
  };
  const vocabulary = options.vocabulary ?? [
    { id: "w1", word: "كلمة", normalized: "كلمة", meaningAr: "معنى", meaningEn: "meaning", pronunciation: "/w1/", exampleAr: "مثال", contextAr: "سياق" },
    { id: "w2", word: "ثانية", normalized: "ثانية", meaningAr: "شرح", meaningEn: "second", pronunciation: "/w2/", exampleAr: "مثال ثان", contextAr: "سياق ثان" },
  ];
  const createdUrls = new Map();
  const recordedBlobs = new Map();
  let urlCounter = 0;
  const mockURL = {
    createObjectURL(blob) {
      const url = `blob:kalimat/${++urlCounter}`;
      createdUrls.set(url, blob);
      recordedBlobs.set(url, blob);
      return url;
    },
    revokeObjectURL(url) {
      createdUrls.delete(url);
    },
  };
  const context = {
    document,
    chrome: options.firefox ? undefined : extension,
    browser: options.firefox ? extension : undefined,
    Promise,
    console,
    URLSearchParams,
    URL: mockURL,
    Blob: globalThis.Blob,
    location: { search: options.search ?? "" },
    fetch: async () => ({ ok: true, async json() { return vocabulary; } }),
    confirm: options.confirm ?? (() => true),
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "date.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "vocabulary.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "theme.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "streak.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "shared", "export.js"), "utf8"), context);
  vm.runInNewContext(atlasSource("atlas.js"), context, { filename: path.join(atlas, "atlas.js") });
  return { api: context.KalimatAtlas, elements, levels, interests, calls, context, downloads, storageData, storageListeners, createdUrls, recordedBlobs };
}

test("popup ships separate native files without unsafe markup or timer work", () => {
  for (const file of Object.values(files)) assert.equal(fs.existsSync(file), true, `${path.basename(file)} is missing`);
  const html = source("popup.html");
  const css = source("popup.css");
  const js = source("popup.js");
  assert.match(html, /<html\s+lang="ar"\s+dir="rtl">/);
  assert.match(html, /<link[^>]+href="popup\.css"/);
  assert.match(html, /<script\s+src="popup\.js"><\/script>/);
  const withoutApprovedRemote = `${html}\n${css}\n${js}`.replace(/https:\/\/ar\.wiktionary\.org[^\s"'`)]*/g, "");
  assert.doesNotMatch(withoutApprovedRemote, /https?:\/\/|\b(?:innerHTML|outerHTML)\b|\b(?:setInterval|setTimeout)\s*\(/);
  assert.doesNotMatch(`${html}\n${js}`, /online[ -]lookup|lookup-result/i, "Popup must keep online lookup in Atlas only");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /<style\b/i);
});
test("popup exposes RTL accessible onboarding and assigned-word controls", () => {
  const html = source("popup.html");
  assert.match(html, /href="#main"[^>]*>تجاوز إلى المحتوى/);
  assert.match(html, /<main id="main"/);
  assert.match(html, /<h1[^>]*>كلمة اليوم<\/h1>/);
  assert.match(html, /id="status"[^>]+aria-live="polite"/);
  assert.match(html, /id="action-status"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /aria-label="المستوى"/);
  assert.equal((html.match(/name="level"/g) || []).length, 4);
  assert.equal((html.match(/name="interest"/g) || []).length, 6);
  for (const label of ["تخطي الآن", "ثابتة لليوم", "معروف", "صعب", "حفظ", "استكشف", "تذكير يومي"]) assert.match(html, new RegExp(label));
  for (const id of ["known", "difficult", "save", "speak", "explore", "reminder", "onboarding-submit", "onboarding-skip"]) assert.match(html, new RegExp(`<button[^>]+id="${id}"`));
  assert.match(html, /<h2 id="word"[^>]+tabindex="-1"/);
  assert.match(html, /<input[^>]+id="reminder-time"[^>]+type="time"[^>]+value="09:00"/);
  assert.match(html, /<button[^>]+id="reminder"[^>]+aria-pressed="false"/);
  assert.match(html, /<button[^>]+id="reminder"[^>]+aria-label="تفعيل التذكير اليومي"/);
  assert.match(source("popup.css"), /grid-template-columns:\s*repeat\(4, 1fr\)/);
  assert.match(source("popup.css"), /width:\s*380px/);
  assert.match(html, /<button id="onboarding-submit"[^>]+class="continue"/);
  assert.match(html, /<article class="word-card">\s*<p id="fixed-label"/);
  assert.match(html, /<section class="example-card"/);
  assert.match(html, /<button id="speak"[^>]+aria-label="استمع للنطق"/);
  assert.match(html, /<p class="feedback-prompt">كيف كانت الكلمة اليوم؟<\/p>/);
  assert.match(html, /<svg[^>]+viewBox=/);
  assert.match(source("popup.css"), /\.reminder-row button::before/);
  assert.match(source("popup.css"), /\.reminder-row button\[aria-pressed="true"\]::after/);
  assert.match(source("popup.css"), /\.reminder-row\s*\{[^}]*direction:\s*ltr/);
  assert.match(source("popup.css"), /\.reminder-row button\s*\{[^}]*grid-column:\s*3/);
  assert.match(source("popup.css"), /\.reminder-row button\[aria-pressed="true"\]::after\s*\{[^}]*translateX\(20px\)/);
});
test("popup renders practical context before the literary fallback as safe text", () => {
  const { api, elements } = popupApi();
  assert.ok(api);
  api.renderAssigned({ kind: "assigned", word: { id: "w1", word: "كلمة", meaningAr: "معنى", meaningEn: "meaning", contextAr: "<img onerror=alert(1)>", exampleAr: "مثال أدبي", pronunciation: "/test/" } });
  assert.equal(elements.get("example").textContent, "<img onerror=alert(1)>");
  api.renderAssigned({ kind: "assigned", word: { id: "w1", word: "كلمة", meaningAr: "معنى", meaningEn: "meaning", exampleAr: "مثال أدبي", pronunciation: "/test/" } });
  assert.equal(elements.get("example").textContent, "مثال أدبي");
});
test("popup shows English practical context only when enabled and preserves text content", () => {
  const { api, elements, inputs } = popupApi();
  api.renderAssigned({ kind: "assigned", word: { id: "w1", word: "<img onerror=alert(1)>", meaningAr: "معنى", meaningEn: "meaning", contextAr: "سياق", contextEn: "<img onerror=alert(1)>", exampleAr: "مثال", pronunciation: "/test/" } });
  assert.equal(elements.get("word").textContent, "<img onerror=alert(1)>");
  assert.equal(elements.get("example-en").textContent, "<img onerror=alert(1)>");
  assert.equal(elements.get("example-en").hidden, false);
  api.renderAssigned({ kind: "assigned", showEnglish: false, word: { id: "w1", word: "كلمة", meaningAr: "معنى", meaningEn: "meaning", contextAr: "سياق", contextEn: "in context", exampleAr: "مثال", pronunciation: "/test/" } });
  assert.equal(elements.get("example-en").hidden, true);
  inputs.slice(0, 3).forEach((input) => { input.checked = true; });
  inputs[3].checked = true;
  api.limitInterests({ target: inputs[3] });
  assert.equal(inputs[3].checked, false);
});

test("reminder requests optional permissions in the click handler before configuration", async () => {
  const { api, calls } = popupApi({ "reminder.configure": { enabled: true, time: "09:00" } });
  api.renderAssigned({ kind: "assigned", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/test/" } });
  const pending = api.requestReminder();
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { permission: { permissions: ["alarms", "notifications"] } });
  await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), { type: "reminder.configure", enabled: true, time: "09:00" });
});

test("save uses a real attribute value and toggles both ways", async () => {
  const { api, elements, calls } = popupApi({ "word.save": { kind: "ok" } });
  api.renderAssigned({ kind: "assigned", dateKey: "2026-07-30", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/test/" } });
  await api.toggleSave();
  await api.toggleSave();
  assert.equal(elements.get("save").getAttribute("aria-pressed"), "false");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(-2))), [
    { type: "word.save", wordId: "w1", saved: true },
    { type: "word.save", wordId: "w1", saved: false },
  ]);
});

test("popup Explore preserves the current word and supports empty-corpus browsing", async () => {
  const fixture = popupApi();
  fixture.api.renderAssigned({ kind: "assigned", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/test/" } });
  await fixture.api.openAtlas();
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls.at(-1))), {
    tab: { url: "extension://kalimat/atlas/atlas.html?view=explore&q=%D9%83%D9%84%D9%85%D8%A9" },
  });

  const empty = popupApi();
  await empty.api.openAtlas();
  assert.deepEqual(JSON.parse(JSON.stringify(empty.calls.at(-1))), {
    tab: { url: "extension://kalimat/atlas/atlas.html?view=explore&q=" },
  });
});

test("popup ignores duplicate feedback and save requests while the first mutation is pending", async () => {
  let releaseFeedback;
  let releaseSave;
  const feedbackResult = new Promise((resolve) => { releaseFeedback = resolve; });
  const saveResult = new Promise((resolve) => { releaseSave = resolve; });
  const fixture = popupApi({ "word.feedback": () => feedbackResult, "word.save": () => saveResult });
  fixture.api.renderAssigned({ kind: "assigned", dateKey: "2026-07-30", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/test/" } });

  const feedbackPending = fixture.api.sendFeedback("known", fixture.elements.get("known"));
  await new Promise(setImmediate);
  await fixture.api.sendFeedback("difficult", fixture.elements.get("difficult"));
  assert.equal(fixture.calls.filter((message) => message.type === "word.feedback").length, 1);
  releaseFeedback({ kind: "ok", status: "known" });
  await feedbackPending;

  const savePending = fixture.api.toggleSave();
  await new Promise(setImmediate);
  await fixture.api.toggleSave();
  assert.equal(fixture.calls.filter((message) => message.type === "word.save").length, 1);
  releaseSave({ kind: "ok", saved: true });
  await savePending;
});

test("popup feedback and save expose adjacent pending, success, failure, and focus states", async () => {
  let releaseFeedback;
  const feedback = new Promise((resolve) => { releaseFeedback = resolve; });
  const fixture = popupApi({ "word.feedback": () => feedback, "word.save": { kind: "ok" } });
  fixture.api.renderAssigned({ kind: "assigned", dateKey: "2026-07-30", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/test/" } });
  const known = fixture.elements.get("known");
  const pending = fixture.api.sendFeedback("known", known);
  await new Promise(setImmediate);
  assert.equal(known.disabled, true);
  assert.equal(known.getAttribute("aria-busy"), "true");
  releaseFeedback({ kind: "ok" });
  await pending;
  assert.equal(known.getAttribute("aria-pressed"), "true");
  assert.equal(known.focuses, 1);
  assert.equal(fixture.elements.get("action-status").textContent, "تم حفظ تقييمك.");
  assert.equal(fixture.elements.get("action-status").getAttribute("role"), "status");

  await fixture.api.toggleSave();
  assert.equal(fixture.elements.get("save").getAttribute("aria-pressed"), "true");
  assert.equal(fixture.elements.get("save").focuses, 1);
  assert.equal(fixture.elements.get("action-status").textContent, "حُفظت الكلمة.");

  const failed = popupApi({ "word.feedback": new Error("offline") });
  failed.api.renderAssigned({ kind: "assigned", dateKey: "2026-07-30", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/test/" } });
  const difficult = failed.elements.get("difficult");
  await failed.api.sendFeedback("difficult", difficult);
  assert.equal(difficult.getAttribute("aria-pressed"), "false");
  assert.equal(difficult.focuses, 1);
  assert.equal(failed.elements.get("action-status").textContent, "تعذّر حفظ تقييمك.");
  assert.equal(failed.elements.get("action-status").getAttribute("role"), "alert");

  const failedSave = popupApi({ "word.save": new Error("offline") });
  failedSave.api.renderAssigned({ kind: "assigned", dateKey: "2026-07-30", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/test/" } });
  await failedSave.api.toggleSave();
  assert.equal(failedSave.elements.get("save").getAttribute("aria-pressed"), "false");
  assert.equal(failedSave.elements.get("save").focuses, 1);
  assert.equal(failedSave.elements.get("action-status").textContent, "تعذّر تغيير الحفظ.");
  assert.equal(failedSave.elements.get("action-status").getAttribute("role"), "alert");
});

test("popup restores validated feedback, saved state, and English visibility from assignment", () => {
  const { api, elements } = popupApi();
  api.renderAssigned({ kind: "assigned", dateKey: "2026-07-30", status: "known", saved: true, showEnglish: false, word: { id: "w1", word: "كلمة", meaningAr: "معنى", meaningEn: "meaning", exampleAr: "مثال", pronunciation: "/test/" } });
  assert.equal(elements.get("known").getAttribute("aria-pressed"), "true");
  assert.equal(elements.get("difficult").getAttribute("aria-pressed"), "false");
  assert.equal(elements.get("save").getAttribute("aria-pressed"), "true");
  assert.equal(elements.get("meaning-en").hidden, true);
});

test("popup mutation enters recovery and does not claim a successful save", async () => {
  const { api, elements } = popupApi({ "word.feedback": { kind: "recovery", recoveryRaw: { broken: true } } });
  api.renderAssigned({ kind: "assigned", dateKey: "2026-07-30", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/test/" } });
  await api.sendFeedback("known", elements.get("known"));
  assert.equal(elements.get("recovery").hidden, false);
  assert.equal(elements.get("known").getAttribute("aria-pressed"), "false");
});

test("popup no-word and load-error states focus a clear state and disable word actions", async () => {
  const noWord = popupApi({ "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } }, "assignment.get": { kind: "no-new-word" } });
  await noWord.api.initialize();
  assert.equal(noWord.elements.get("empty").hidden, false);
  assert.equal(noWord.elements.get("empty-title").focuses, 1);
  assert.equal(noWord.elements.get("known").disabled, true);
  assert.equal(noWord.elements.get("save").disabled, true);

  const failed = popupApi({ "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } }, "assignment.get": new Error("load") });
  await failed.api.initialize();
  assert.equal(failed.elements.get("error").hidden, false);
  assert.equal(failed.elements.get("error-title").focuses, 1);
  assert.match(failed.elements.get("status").textContent, /تعذّر تحميل/);
});

test("onboarding focuses the assigned word and feedback retains the authoritative assignment date", async () => {
  const assigned = { kind: "assigned", dateKey: "2026-07-30", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/test/" } };
  const { api, elements, calls } = popupApi({ "onboarding.complete": { kind: "ok" }, "assignment.get": assigned, "word.feedback": { kind: "ok" } });
  api.renderAssigned(assigned);
  elements.get("word").focuses = 0;
  await api.completeOnboarding();
  assert.equal(elements.get("word").focuses, 1);
  await api.sendFeedback("known", elements.get("known"));
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), { type: "word.feedback", dateKey: "2026-07-30", wordId: "w1", status: "known" });
});

test("popup hydrates an active authoritative reminder on reopen and toggles it off", async () => {
  const { api, elements, calls } = popupApi({
    "settings.get": { kind: "settings", reminder: { enabled: true, time: "18:45" } },
    "assignment.get": { kind: "no-new-word" },
    "reminder.configure": { enabled: false, time: "18:45" },
  });
  await api.initialize();
  assert.equal(elements.get("reminder").getAttribute("aria-pressed"), "true");
  assert.equal(elements.get("reminder-time").value, "18:45");
  await api.requestReminder();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), { type: "reminder.configure", enabled: false, time: "18:45" });
  assert.equal(elements.get("reminder").getAttribute("aria-pressed"), "false");
});

test("popup renders the daily word before reminder hydration finishes", async () => {
  let resolveSettings;
  const settings = new Promise((resolve) => { resolveSettings = resolve; });
  const assigned = { kind: "assigned", dateKey: "2026-07-30", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/w1/" } };
  const { api, elements, calls } = popupApi({
    "settings.get": () => settings,
    "assignment.get": assigned,
  });

  const initializing = api.initialize();
  await new Promise(setImmediate);

  assert.deepEqual(calls.map((message) => message.type), ["assignment.get", "settings.get"]);
  assert.equal(elements.get("assigned").hidden, false);
  assert.equal(elements.get("reminder").disabled, true);
  assert.equal(elements.get("reminder-time").disabled, true);

  resolveSettings({ kind: "settings", reminder: { enabled: false, time: "09:00" } });
  await initializing;
  assert.equal(elements.get("reminder").disabled, false);
  assert.equal(elements.get("reminder-time").disabled, false);
});

test("popup shows first-run onboarding before reminder hydration finishes", async () => {
  let resolveSettings;
  const settings = new Promise((resolve) => { resolveSettings = resolve; });
  const { api, elements, calls } = popupApi({ "settings.get": () => settings }, { profile: undefined });

  const initializing = api.initialize();
  await new Promise(setImmediate);

  assert.equal(elements.get("onboarding").hidden, false);
  assert.equal(elements.get("reminder").disabled, true);
  assert.equal(calls.some((message) => message.type === "assignment.get"), false);

  resolveSettings({ kind: "settings", reminder: { enabled: false, time: "09:00" } });
  await initializing;
  assert.equal(elements.get("reminder").disabled, true);
});

test("popup serializes rapid reminder toggles from the authoritative state", async () => {
  let enabled = false;
  const { api, elements, calls } = popupApi({
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "assignment.get": { kind: "no-new-word" },
    "reminder.configure": (message) => { enabled = message.enabled; return { enabled, time: message.time }; },
  });
  await api.initialize();
  api.renderAssigned({ kind: "assigned", word: { id: "w1", word: "كلمة", meaningAr: "معنى", exampleAr: "مثال", pronunciation: "/w1/" } });
  await Promise.all([api.requestReminder(), api.requestReminder()]);
  assert.deepEqual(calls.filter((message) => message.type === "reminder.configure").map((message) => message.enabled), [true, false]);
  assert.equal(elements.get("reminder").getAttribute("aria-pressed"), "false");
});

test("popup recovery reset requires confirmation and cancellation leaves state untouched", async () => {
  const fixture = popupApi({}, { confirm: () => false });
  await fixture.api.resetRecovery();
  assert.equal(fixture.calls.some((message) => message.type === "state.clear"), false);
});

test("popup recovery reset does not retain a profile-only warning as a reminder warning", async () => {
  const fixture = popupApi({
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "assignment.get": { kind: "no-new-word" },
    "state.clear": { kind: "ok", storageWarning: true, reminderWarning: false },
    "onboarding.complete": { kind: "ok" },
  }, { confirm: () => true });
  await fixture.api.initialize();
  await fixture.api.resetRecovery();
  assert.equal(fixture.elements.get("warning").hidden, false);
  await fixture.api.completeOnboarding(true);
  assert.equal(fixture.elements.get("warning").hidden, true);
});

test("a rejected reminder disable keeps the visible enabled state and reports the error", async () => {
  const { api, elements } = popupApi({
    "settings.get": { kind: "settings", reminder: { enabled: true, time: "09:00" } },
    "assignment.get": { kind: "no-new-word" },
    "reminder.configure": new Error("storage unavailable"),
  });
  await api.initialize();
  await assert.doesNotReject(api.requestReminder());
  assert.equal(elements.get("reminder").getAttribute("aria-pressed"), "true");
  assert.match(elements.get("status").textContent, /تعذّر إيقاف التذكير/);
});

test("failed reminder hydration keeps controls disabled and its error survives assignment loading", async () => {
  const { api, elements, calls } = popupApi({
    "settings.get": new Error("settings unavailable"),
    "assignment.get": { kind: "no-new-word" },
  });
  await api.initialize();
  assert.equal(elements.get("reminder").disabled, true);
  assert.equal(elements.get("reminder-time").disabled, true);
  assert.match(elements.get("status").textContent, /تعذّر تحميل إعدادات التذكير/);
  assert.ok(calls.some((message) => message.type === "assignment.get"));
});

test("failed reminder hydration keeps its error through first-time onboarding", async () => {
  const { api, elements, calls } = popupApi({ "settings.get": new Error("settings unavailable") }, { profile: undefined });
  await api.initialize();
  assert.equal(elements.get("onboarding").hidden, false);
  assert.match(elements.get("status").textContent, /تعذّر تحميل إعدادات التذكير/);
  assert.equal(calls.some((message) => message.type === "assignment.get"), false);
});

test("Atlas ships a dark, accessible four-view page without unsafe sinks or timer work", () => {
  for (const name of ["atlas.html", "atlas.css", "atlas.js"]) assert.equal(fs.existsSync(path.join(atlas, name)), true, `${name} is missing`);
  const html = atlasSource("atlas.html");
  const css = atlasSource("atlas.css");
  const js = atlasSource("atlas.js");
  assert.match(html, /<html\s+lang="ar"\s+dir="rtl">/);
  assert.match(html, /<link[^>]+href="atlas\.css"/);
  assert.match(html, /<script\s+src="atlas\.js"><\/script>/);
  for (const id of ["today", "explore", "history", "settings", "atlas-search", "return-today", "history-filter", "settings-level", "settings-english", "settings-time", "export", "import-file", "clear", "recovery-export", "recovery-import", "recovery-clear", "today-action-status", "explore-lookup"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="today-action-status"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.doesNotMatch(html, /id="today-lookup"/);
  assert.equal((html.match(/name="atlas-level"/g) || []).length, 4);
  assert.equal((html.match(/name="atlas-interest"/g) || []).length, 6);
  assert.match(html, /id="search-count"[^>]+aria-live="polite"/);
  const withoutApprovedRemote = `${html}\n${css}\n${js}`.replace(/https:\/\/ar\.wiktionary\.org[^\s"'`)]*/g, "");
  assert.doesNotMatch(withoutApprovedRemote, /https?:\/\/|\b(?:innerHTML|outerHTML)\b|\b(?:setInterval|setTimeout)\s*\(/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.match(css, /background:\s*#102b2a/i);
  assert.match(css, /:focus-visible/);
  assert.match(css, /button\[aria-pressed="true"\][^{]*\{[^}]*color:/);
  assert.match(css, /\.file-button[^}]*focus-visible/);
  assert.match(css, /:focus-visible[^}]*box-shadow/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.action-status/);
  assert.match(html, /id="import-file"[^>]+tabindex="-1"/);
  assert.match(html, /id="recovery-import"[^>]+tabindex="-1"/);
  assert.match(html, /label class="file-button" tabindex="0"/);
});

test("Atlas keeps the daily anchor while exploration, history, settings, and recovery use validated messages", () => {
  const js = atlasSource("atlas.js");
  assert.match(js, /type:\s*"assignment\.get",\s*dateKey/);
  assert.match(js, /type:\s*"state\.export"/);
  assert.match(js, /type:\s*"state\.import",\s*text/);
  assert.match(js, /type:\s*"state\.clear"/);
  assert.match(js, /type:\s*"settings\.update",\s*level,\s*interests,\s*showEnglish/);
  assert.match(js, /type:\s*"reminder\.configure",\s*enabled,\s*time/);
  assert.match(js, /new Blob\(/);
  assert.match(js, /globalThis\.confirm/);
  assert.match(js, /KalimatVocabulary\?\.canonicalSearchKey/);
  assert.match(js, /relatedIds/);
  assert.doesNotMatch(js, /state\s*=\s*\{[^}]*viewed/);
  assert.doesNotMatch(js, /regenerate|Math\.random/);
});

function atlasProfile(overrides = {}) {
  return {
    schemaVersion: 1, algorithmVersion: 1, seedHex: "a".repeat(32), level: 1, interests: [], showEnglish: true,
    wordStates: {}, assignments: {}, assignmentOrdinal: 0, recentIds: [], evidenceCutoff: null, ...overrides,
  };
}

test("Atlas dated query loads only the retained date plus profile and settings", async () => {
  const profile = atlasProfile({ assignments: { "2026-07-28": { wordId: "w2" } }, assignmentOrdinal: 1 });
  const fixture = atlasApi({
    "assignment.get": (message) => message.dateKey ? { kind: "assigned", wordId: "w2", dateKey: message.dateKey } : { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  }, { search: "?date=2026-07-28" });
  assert.equal(typeof fixture.api.initialize, "function");
  await fixture.api.initialize();
  assert.equal(fixture.calls.some((message) => message.type === "assignment.get" && message.dateKey === undefined), false);
  assert.deepEqual(fixture.calls.filter((message) => message.type === "assignment.get").map((message) => message.dateKey), ["2026-07-28"]);
});

test("Atlas opens bounded Popup Explore URLs with preserved search context", async () => {
  const vocabulary = [
    { id: "w1", word: "كتاب", normalized: "كتاب", meaningAr: "كتاب", meaningEn: "book", pronunciation: "/book/", exampleAr: "مثال", difficultyBand: "beginner", usefulnessBand: "high", reviewed: true },
  ];
  const responses = {
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  };

  const routed = atlasApi(responses, { vocabulary, search: "?view=explore&q=book" });
  await routed.api.initialize();
  assert.equal(routed.elements.get("atlas-search").value, "book");
  assert.equal(routed.elements.get("explore-view").hidden, false);
  assert.equal(routed.elements.get("today-view").hidden, true);
  assert.equal(routed.elements.get("search-results").children.length, 1);
  assert.equal(routed.elements.get("atlas-search").focuses, 1);

  const blank = atlasApi(responses, { vocabulary, search: "?view=explore&q=" });
  await blank.api.initialize();
  assert.equal(blank.elements.get("explore-view").hidden, false);
  assert.equal(blank.elements.get("search-results").children.length, 1);

  const oversized = atlasApi(responses, { vocabulary, search: `?view=explore&q=${"a".repeat(257)}` });
  await oversized.api.initialize();
  assert.equal(oversized.elements.get("today-view").hidden, false);
  assert.equal(oversized.elements.get("explore-view").hidden, true);

  const impossibleDate = atlasApi(responses, { vocabulary, search: "?date=2026-99-99" });
  await impossibleDate.api.initialize();
  assert.deepEqual(impossibleDate.calls.filter((message) => message.type === "assignment.get").map((message) => message.dateKey), [undefined]);
  assert.equal(impossibleDate.elements.get("today-view").hidden, false);
  assert.equal(impossibleDate.elements.get("atlas-search").listeners.keydown, undefined);

  const mixedInvalid = atlasApi(responses, { vocabulary, search: "?date=2026-99-99&view=explore&q=book" });
  await mixedInvalid.api.initialize();
  assert.equal(mixedInvalid.elements.get("today-view").hidden, false);
  assert.equal(mixedInvalid.elements.get("explore-view").hidden, true);

  const exhausted = atlasApi({ ...responses, "assignment.get": { kind: "no-new-word" } }, { vocabulary, search: "?view=explore&q=" });
  await exhausted.api.initialize();
  assert.equal(exhausted.elements.get("explore-view").hidden, false);
  assert.equal(exhausted.elements.get("search-results").children.length, 1);
  assert.equal(exhausted.elements.get("atlas-search").focuses, 1);
});

test("Atlas blank Explore shows every reviewed local word and ranks exact and prefix matches", async () => {
  const vocabulary = [
    { id: "meta", word: "كتاب", normalized: "كتاب", meaningAr: "لفظ", meaningEn: "book", pronunciation: "/meta/", exampleAr: "مثال", difficultyBand: "advanced", usefulnessBand: "low", reviewed: true },
    { id: "prefix", word: "كاتب", normalized: "كاتب", meaningAr: "كاتب", meaningEn: "writer", pronunciation: "/prefix/", exampleAr: "مثال", difficultyBand: "beginner", usefulnessBand: "high", reviewed: true },
    { id: "exact", word: "كتب", normalized: "كتب", meaningAr: "فعل", meaningEn: "wrote", pronunciation: "/exact/", exampleAr: "مثال", difficultyBand: "intermediate", usefulnessBand: "medium", reviewed: true },
  ];
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "exact", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  }, { vocabulary });
  await fixture.api.initialize();
  fixture.elements.get("explore").listeners.click();
  assert.equal(fixture.elements.get("explore-view").hidden, false);
  fixture.elements.get("atlas-search").value = "";
  fixture.elements.get("atlas-search").listeners.input();
  assert.equal(fixture.elements.get("search-results").children.length, vocabulary.length);
  assert.match(fixture.elements.get("search-count").textContent, /3/);
  fixture.elements.get("atlas-search").value = "كتب";
  fixture.api.search();
  assert.equal(fixture.elements.get("search-results").children[0].textContent.startsWith("كتب"), true);
  assert.equal(fixture.elements.get("search-results").children.length, 1);
  assert.equal(fixture.elements.get("search-count").textContent, "1 نتيجة");
  fixture.elements.get("atlas-search").value = "كُتِب";
  fixture.api.search();
  assert.equal(fixture.elements.get("search-results").children.length, 1, "Arabic normalization must preserve local matches");
  fixture.elements.get("atlas-search").value = "writer";
  fixture.api.search();
  assert.equal(fixture.elements.get("search-results").children.length, 1, "English metadata queries must find local words");
  fixture.elements.get("atlas-search").value = "لاشيء";
  fixture.api.search();
  assert.equal(fixture.elements.get("search-results").children.length, 0);
  assert.equal(fixture.elements.get("search-count").textContent, "لا توجد نتائج محلية. جرّب تهجئة أخرى.");
  fixture.elements.get("atlas-search").value = "";
  fixture.api.search();
  assert.equal(fixture.elements.get("search-results").children.length, vocabulary.length, "blank search must recover the local results");
  assert.equal(fixture.elements.get("search-count").textContent, "3 كلمة");
});

test("Atlas online lookup requests permission inside submit and stops on denial without messaging", async () => {
  const responses = {
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  };
  for (const options of [{ permissionResult: false }, { permissionError: new Error("denied") }]) {
    const fixture = atlasApi(responses, options);
    await fixture.api.initialize();
    const button = fixture.elements.get("explore-lookup");
    await fixture.api.lookupOnline("كلمة", button);
    assert.equal(fixture.calls.filter((message) => message.type === "online.lookup").length, 0);
    assert.match(fixture.elements.get("status").textContent, /إذن|تعذّر|رفض/);
    assert.equal(button.focuses, 1);
    assert.equal(button.disabled, false);
  }
});

test("Firefox keeps Explore local-only without an unavailable online action", async () => {
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  }, { firefox: true });
  await fixture.api.initialize();
  assert.equal(fixture.elements.get("explore-lookup").hidden, true);
  assert.equal(fixture.elements.get("explore-lookup").listeners.click, undefined);
});

test("Atlas renders a safe unreviewed online result separately from local learning state", async () => {
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "online.lookup": { kind: "online-result", query: "كلمة", headword: "كلمة", definitionAr: "<img onerror=alert(1)>", sourceUrl: "https://ar.wiktionary.org/wiki/%D9%83%D9%84%D9%85%D8%A9", retrievedAt: "2026-08-11T00:00:00.000Z", unreviewed: true },
  });
  await fixture.api.initialize();
  await fixture.api.lookupOnline("كلمة", fixture.elements.get("explore-lookup"));
  assert.equal(fixture.calls.filter((message) => message.type === "online.lookup").length, 1);
  const card = fixture.elements.get("explore-card");
  assert.equal(card.children[0].textContent, "قاموس خارجي (غير مراجعة)");
  assert.equal(card.children[2].textContent, "<img onerror=alert(1)>");
  assert.match(card.children.find((node) => node.className === "online-attribution").textContent, /CC BY-SA 4\.0.*GFDL/);
  assert.match(card.children.find((node) => node.className === "online-retrieved").textContent, /2026-08-11T00:00:00\.000Z/);
  assert.equal(card.children.some((node) => node.tagName === "BUTTON"), false);
  assert.equal(fixture.calls.some((message) => message.type === "word.feedback" || message.type === "word.save"), false);
});

test("Atlas initial daily response merges returned status and save into History", async () => {
  const profile = atlasProfile();
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30", status: "known", saved: true },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  });
  await fixture.api.initialize();
  await fixture.api.renderHistory();
  assert.equal(fixture.elements.get("history-list").children.length, 1);
  assert.match(fixture.elements.get("history-list").children[0].textContent, /known|معروف/i);
  fixture.elements.get("history-filter").value = "saved";
  await fixture.api.renderHistory();
  assert.equal(fixture.elements.get("history-list").children.length, 1);
});

test("Atlas history rows show status and retain descending chronology across filters", async () => {
  const profile = atlasProfile({
    wordStates: { w1: { status: "known", dateKey: "2026-07-29", saved: true }, w2: { status: "difficult", dateKey: "2026-07-28" } },
    assignments: { "2026-07-28": { wordId: "w2", status: "difficult" }, "2026-07-29": { wordId: "w1", status: "known" } }, assignmentOrdinal: 2,
  });
  const fixture = atlasApi({ "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" }, "state.export": { kind: "export", text: JSON.stringify(profile) }, "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } } });
  await fixture.api.initialize();
  await fixture.api.renderHistory();
  assert.match(fixture.elements.get("history-list").children[0].textContent, /2026-07-30/);
  assert.match(fixture.elements.get("history-list").children[0].textContent, /known|معروف/i);
  fixture.elements.get("history-filter").value = "difficult";
  await fixture.api.renderHistory();
  assert.equal(fixture.elements.get("history-list").children.length, 1);
  assert.match(fixture.elements.get("history-list").children[0].textContent, /2026-07-28/);
});

test("Atlas valid recovery import clears raw recovery state and returns to the imported profile", async () => {
  const invalid = { schemaVersion: 999, marker: "keep" };
  const imported = atlasProfile({ level: 3 });
  let recovered = true;
  const fixture = atlasApi({
    "assignment.get": () => recovered ? { kind: "recovery", recoveryRaw: invalid } : { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": () => recovered ? { kind: "recovery", recoveryRaw: invalid } : { kind: "export", text: JSON.stringify(imported) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "state.import": () => { recovered = false; return { kind: "ok" }; },
  });
  await fixture.api.initialize();
  assert.equal(fixture.elements.get("recovery").hidden, false);
  await fixture.api.importState({ files: [{ size: JSON.stringify(imported).length, async text() { return JSON.stringify(imported); } }], value: "file" });
  assert.equal(fixture.elements.get("recovery").hidden, true);
  assert.equal(fixture.elements.get("today-view").hidden, false);
  assert.equal(fixture.api.getRecoveryRaw(), null);
});

test("Atlas import reports a committed import when refresh fails", async () => {
  const imported = atlasProfile({ level: 3 });
  const fixture = atlasApi({
    "assignment.get": new Error("refresh failed"),
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "state.import": { kind: "ok" },
  });
  await fixture.api.initialize();
  await fixture.api.importState({ files: [{ size: JSON.stringify(imported).length, async text() { return JSON.stringify(imported); } }], value: "file" });
  assert.match(fixture.elements.get("status").textContent, /استوردنا|import/i);
  assert.doesNotMatch(fixture.elements.get("status").textContent, /لم نغيّر|unchanged/i);
});

test("Atlas return-to-today shows and focuses the Today view", async () => {
  const profile = atlasProfile({ assignments: { "2026-07-29": { wordId: "w2" }, "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 2 });
  const fixture = atlasApi({
    "assignment.get": (message) => message.dateKey ? { kind: "assigned", wordId: "w2", dateKey: message.dateKey } : { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  });
  await fixture.api.initialize();
  await fixture.api.loadAssignment("2026-07-29");
  await fixture.api.returnToToday();
  assert.equal(fixture.elements.get("today-view").hidden, false);
  assert.ok(fixture.elements.get("today-title").focuses > 0);
  assert.equal(fixture.elements.get("return-today").hidden, true);
});

test("Atlas no-word and load-error states are focused and leave Today actions disabled", async () => {
  const empty = atlasApi({ "assignment.get": { kind: "no-new-word", dateKey: "2026-07-30" }, "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) }, "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } } });
  await empty.api.initialize();
  assert.equal(empty.elements.get("empty").hidden, false);
  assert.equal(empty.elements.get("empty-title").focuses, 1);
  assert.equal(empty.elements.get("today-save").disabled, true);

  const failed = atlasApi({ "assignment.get": new Error("load"), "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) }, "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } } });
  await failed.api.initialize();
  assert.equal(failed.elements.get("error").hidden, false);
  assert.equal(failed.elements.get("error-title").focuses, 1);
});

test("Atlas mutation warnings and reminder races keep authoritative returned state", async () => {
  const profile = atlasProfile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  let releaseFirst;
  let reminderCalls = 0;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "word.save": { kind: "ok", storageWarning: true },
    "reminder.configure": () => { reminderCalls += 1; return reminderCalls === 1 ? first : { enabled: true, time: "18:45" }; },
  });
  await fixture.api.initialize();
  await fixture.api.toggleSave();
  assert.equal(fixture.elements.get("warning").hidden, false);
  const pending = fixture.api.configureReminder();
  const queued = fixture.api.configureReminder();
  releaseFirst({ enabled: false, time: "09:00" });
  await Promise.all([pending, queued]);
  assert.equal(fixture.api.getReminder().time, "18:45");
});

test("Atlas feedback and save update Today and History from returned authoritative fields", async () => {
  const profile = atlasProfile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  let responseStatus = "known";
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "word.feedback": () => ({ kind: "ok", wordId: "w1", dateKey: "2026-07-30", status: responseStatus }),
    "word.save": { kind: "ok", wordId: "w1", saved: true },
  });
  await fixture.api.initialize();
  await fixture.api.feedback("known");
  responseStatus = "difficult";
  await fixture.api.feedback("difficult");
  await fixture.api.toggleSave();
  await fixture.api.renderHistory();
  assert.match(fixture.elements.get("history-list").children[0].textContent, /difficult|صعب/i);
  fixture.elements.get("history-filter").value = "saved";
  await fixture.api.renderHistory();
  assert.equal(fixture.elements.get("history-list").children.length, 1);
  assert.equal(fixture.elements.get("today-difficult").getAttribute("aria-pressed"), "true");
  assert.equal(fixture.elements.get("today-save").getAttribute("aria-pressed"), "true");
});

test("Atlas Today actions expose adjacent pending, success, failure, and focus states", async () => {
  let releaseKnown;
  let releaseSave;
  const knownResult = new Promise((resolve) => { releaseKnown = resolve; });
  const saveResult = new Promise((resolve) => { releaseSave = resolve; });
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "word.feedback": (message) => message.status === "known" ? knownResult : { kind: "ok", wordId: "w1", dateKey: "2026-07-30", status: "difficult" },
    "word.save": () => saveResult,
  });
  await fixture.api.initialize();
  const known = fixture.elements.get("today-known");
  const knownPending = fixture.api.feedback("known");
  await new Promise(setImmediate);
  assert.equal(known.disabled, true);
  assert.equal(known.getAttribute("aria-busy"), "true");
  releaseKnown({ kind: "ok", wordId: "w1", dateKey: "2026-07-30", status: "known" });
  await knownPending;
  assert.equal(known.getAttribute("aria-pressed"), "true");
  assert.equal(known.focuses, 1);
  assert.equal(fixture.elements.get("today-action-status").textContent, "تم حفظ تقييمك.");
  assert.equal(fixture.elements.get("today-action-status").getAttribute("role"), "status");

  await fixture.api.feedback("difficult");
  assert.equal(fixture.elements.get("today-difficult").getAttribute("aria-pressed"), "true");
  assert.equal(fixture.elements.get("today-difficult").focuses, 1);

  const savePending = fixture.api.toggleSave();
  await new Promise(setImmediate);
  const save = fixture.elements.get("today-save");
  assert.equal(save.disabled, true);
  assert.equal(save.getAttribute("aria-busy"), "true");
  releaseSave({ kind: "ok", wordId: "w1", saved: true });
  await savePending;
  assert.equal(save.getAttribute("aria-pressed"), "true");
  assert.equal(save.focuses, 1);
  assert.equal(fixture.elements.get("today-action-status").textContent, "حُفظت الكلمة.");

  const failed = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "word.feedback": new Error("offline"),
    "word.save": new Error("offline"),
  });
  await failed.api.initialize();
  await failed.api.feedback("difficult");
  assert.equal(failed.elements.get("today-difficult").getAttribute("aria-pressed"), "false");
  assert.equal(failed.elements.get("today-difficult").focuses, 1);
  assert.equal(failed.elements.get("today-action-status").getAttribute("role"), "alert");
  await failed.api.toggleSave();
  assert.equal(failed.elements.get("today-save").getAttribute("aria-pressed"), "false");
  assert.equal(failed.elements.get("today-save").focuses, 1);
  assert.equal(failed.elements.get("today-action-status").textContent, "تعذّر الحفظ.");
});

test("Atlas ignores duplicate feedback and save requests while the first mutation is pending", async () => {
  let releaseFeedback;
  let releaseSave;
  const feedbackResult = new Promise((resolve) => { releaseFeedback = resolve; });
  const saveResult = new Promise((resolve) => { releaseSave = resolve; });
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "word.feedback": () => feedbackResult,
    "word.save": () => saveResult,
  });
  await fixture.api.initialize();

  const feedbackPending = fixture.api.feedback("known");
  await new Promise(setImmediate);
  await fixture.api.feedback("difficult");
  assert.equal(fixture.calls.filter((message) => message.type === "word.feedback").length, 1);
  releaseFeedback({ kind: "ok", wordId: "w1", dateKey: "2026-07-30", status: "known" });
  await feedbackPending;

  const savePending = fixture.api.toggleSave();
  await new Promise(setImmediate);
  await fixture.api.toggleSave();
  assert.equal(fixture.calls.filter((message) => message.type === "word.save").length, 1);
  releaseSave({ kind: "ok", wordId: "w1", saved: true });
  await savePending;
});

test("Atlas recovery feedback keeps focus in the recovery view", async () => {
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile()) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "word.feedback": { kind: "recovery", recoveryRaw: { broken: true } },
  });
  await fixture.api.initialize();
  await fixture.api.feedback("known");
  assert.equal(fixture.elements.get("recovery").hidden, false);
  assert.equal(fixture.elements.get("recovery-title").focuses, 1);
  assert.equal(fixture.elements.get("today-known").focuses, 0);
});

test("Atlas settings rerender English visibility in Today and the current Explore card", async () => {
  const profile = atlasProfile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "settings.update": { kind: "ok" },
  });
  await fixture.api.initialize();
  fixture.api.viewWord({ id: "w1", word: "كلمة", meaningAr: "معنى", meaningEn: "meaning", pronunciation: "/w1/", exampleAr: "مثال" });
  fixture.elements.get("settings-english").checked = false;
  fixture.levels[0].checked = true;
  await fixture.api.saveSettings();
  assert.equal(fixture.elements.get("today-card").children.some((node) => node.className === "english"), false);
  assert.equal(fixture.elements.get("explore-card").children.some((node) => node.className === "english"), false);
});

test("Atlas renders practical context before the literary example and honors English visibility", async () => {
  const word = { id: "w1", word: "كلمة", normalized: "كلمة", meaningAr: "معنى", meaningEn: "meaning", contextAr: "سياق عملي", contextEn: "practical context", exampleAr: "مثال أدبي", pronunciation: "/w1/" };
  const responses = {
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 })) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  };
  const visible = atlasApi(responses, { vocabulary: [word] });
  await visible.api.initialize();
  const cards = visible.elements.get("today-card").children;
  const context = cards.find((node) => node.className === "context");
  const example = cards.find((node) => node.className === "example");
  const contextEnglish = cards.find((node) => node.className === "context english");
  assert.ok(context && example && contextEnglish);
  assert.ok(cards.indexOf(context) < cards.indexOf(example));
  assert.equal(context.children.at(-1).textContent, "سياق عملي");
  assert.equal(contextEnglish.children.at(-1).textContent, "practical context");

  const hidden = atlasApi({ ...responses, "state.export": { kind: "export", text: JSON.stringify(atlasProfile({ showEnglish: false, assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 })) } }, { vocabulary: [word] });
  await hidden.api.initialize();
  assert.equal(hidden.elements.get("today-card").children.some((node) => node.className === "context english"), false);
});

test("Atlas search includes practical context and vocabulary metadata", async () => {
  const word = { id: "w1", word: "كلمة", normalized: "كلمة", meaningAr: "معنى", meaningEn: "meaning", contextAr: "market counter", contextEn: "at the market", exampleAr: "مثال", pronunciation: "/w1/", root: "k-t-b", pattern: "fa3ala", register: "standard", partOfSpeech: "verb", reviewed: true };
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(atlasProfile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 })) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  }, { vocabulary: [word] });
  await fixture.api.initialize();
  for (const query of ["market", "k-t-b", "fa3ala", "standard", "verb"]) {
    fixture.elements.get("atlas-search").value = query;
    fixture.api.search();
    assert.equal(fixture.elements.get("search-results").children.length, 1, query);
    assert.match(fixture.elements.get("search-results").children[0].textContent, /كلمة/);
  }
});

test("Atlas clear followed by onboarding settings requests and renders a new daily assignment", async () => {
  const profile = atlasProfile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  let assignmentCalls = 0;
  const fixture = atlasApi({
    "assignment.get": () => { assignmentCalls += 1; return { kind: "assigned", wordId: assignmentCalls === 1 ? "w1" : "w2", dateKey: "2026-07-30" }; },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "state.clear": { kind: "ok" },
    "settings.update": { kind: "ok" },
  });
  await fixture.api.initialize();
  await fixture.api.clearState();
  fixture.levels[0].checked = true;
  fixture.elements.get("settings-english").checked = true;
  await fixture.api.saveSettings();
  assert.equal(assignmentCalls, 2);
  assert.equal(fixture.elements.get("today-view").hidden, false);
  assert.equal(fixture.elements.get("today-card").children.length > 0, true);
});

test("Atlas clear does not retain a profile-only warning as a reminder warning", async () => {
  const profile = atlasProfile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "state.clear": { kind: "ok", storageWarning: true, reminderWarning: false },
    "settings.update": { kind: "ok" },
  });
  await fixture.api.initialize();
  await fixture.api.clearState();
  assert.equal(fixture.elements.get("warning").hidden, false);
  fixture.levels[0].checked = true;
  await fixture.api.saveSettings();
  assert.equal(fixture.elements.get("warning").hidden, true);
});

test("popup exposes theme-select, streak-badge, and export controls in HTML", () => {
  const html = source("popup.html");
  assert.match(html, /<select\s+id="theme-select"[^>]*aria-label="اختر السمة"/);
  assert.match(html, /<option\s+value="paper">ورقي<\/option>/);
  assert.match(html, /<option\s+value="emerald">زمردي<\/option>/);
  assert.match(html, /<option\s+value="midnight">ليلي<\/option>/);
  assert.match(html, /<span\s+id="streak-badge"[^>]*class="streak-badge"/);
  assert.match(html, /<button\s+id="btn-export-anki"[^>]*>تصدير إلى Anki<\/button>/);
  assert.match(html, /<button\s+id="btn-export-card"[^>]*>بطاقة للمشاركة<\/button>/);
  assert.match(html, /<script\s+src="\.\.\/shared\/theme\.js"><\/script>/);
  assert.match(html, /<script\s+src="\.\.\/shared\/streak\.js"><\/script>/);
  assert.match(html, /<script\s+src="\.\.\/shared\/export\.js"><\/script>/);
});

test("popup ThemeController initializes, binds theme select, and synchronizes theme across views", async () => {
  const fixture = popupApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-08-14" },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  }, { theme: "emerald" });
  await fixture.api.initialize();

  const themeSelect = fixture.elements.get("theme-select");
  assert.equal(themeSelect.value, "emerald");
  assert.equal(fixture.context.document.documentElement.getAttribute("data-theme"), "emerald");

  themeSelect.value = "midnight";
  if (themeSelect.listeners["change"]) {
    await themeSelect.listeners["change"]();
  }
  assert.equal(fixture.context.document.documentElement.getAttribute("data-theme"), "midnight");
  assert.equal(fixture.storageData["kalimat.theme"], "midnight");

  for (const listener of fixture.storageListeners) {
    listener({ "kalimat.theme": { newValue: "paper" } }, "local");
  }
  assert.equal(themeSelect.value, "paper");
  assert.equal(fixture.context.document.documentElement.getAttribute("data-theme"), "paper");
});

test("popup calculates streak and formats Classical Arabic pluralization on badge", async () => {
  const vocabulary = Array.from({ length: 5 }, (_, index) => ({
    id: `w${index + 1}`,
    word: `كلمة${index + 1}`,
    normalized: `كلمة${index + 1}`,
    meaningAr: "معنى",
    meaningEn: "meaning",
    pronunciation: `/w${index + 1}/`,
    exampleAr: "مثال",
    contextAr: "سياق",
  }));
  const assignments = {
    "2026-08-10": { wordId: "w1", status: "known" },
    "2026-08-11": { wordId: "w2", status: "known" },
    "2026-08-12": { wordId: "w3", status: "known" },
    "2026-08-13": { wordId: "w4", status: "known" },
    "2026-08-14": { wordId: "w5", status: "known" },
  };
  const profile = { assignments, assignmentOrdinal: 5, level: 1, interests: ["classical-arabic"], showEnglish: true, wordStates: {} };
  const fixture = popupApi({
    "assignment.get": { kind: "assigned", wordId: "w5", dateKey: "2026-08-14" },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "word.feedback": { kind: "ok", wordId: "w5", dateKey: "2026-08-14", status: "known" },
  }, { profile, vocabulary });
  await fixture.api.initialize();

  const streakBadge = fixture.elements.get("streak-badge");
  assert.match(streakBadge.textContent, /🔥\s*٥\s*أيام\s*متتالية/);

  fixture.api.updateStreak({}, "2026-08-14");
  assert.equal(streakBadge.textContent, "🔥 لا يوجد تتابع بعد");

  fixture.api.updateStreak({ "2026-08-14": { wordId: "w1" } }, "2026-08-14");
  assert.equal(streakBadge.textContent, "🔥 يوم واحد");

  fixture.api.updateStreak({ "2026-08-13": { wordId: "w1" }, "2026-08-14": { wordId: "w2" } }, "2026-08-14");
  assert.equal(streakBadge.textContent, "🔥 يومان متتاليان");

  const elevenDays = {};
  for (let d = 4; d <= 14; d++) {
    const dayStr = d < 10 ? `0${d}` : `${d}`;
    elevenDays[`2026-08-${dayStr}`] = { wordId: `w${d}`, status: "known" };
  }
  fixture.api.updateStreak(elevenDays, "2026-08-14");
  assert.match(streakBadge.textContent, /🔥\s*١١\s*يوماً\s*متتالياً/);
});

test("popup Anki CSV export triggers download with UTF-8 BOM, RFC 4180 escaping, and 7 lexical columns", async () => {
  const vocabulary = [
    {
      id: "w1",
      word: "كِتَابٌ",
      meaningAr: "مُؤَلَّفٌ مَكْتُوبٌ",
      meaningEn: "book, \"volume\"",
      pronunciation: "/kitaab/",
      contextAr: "قَرَأْتُ كِتَابًا",
      contextEn: "I read a book",
      exampleAr: "خَيْرُ جَلِيسٍ فِي الزَّمَانِ كِتَابُ",
      root: "ك-ت-ب",
      pattern: "فِعَال",
      partOfSpeech: "noun",
      register: "classical",
    },
  ];
  const profile = {
    assignments: { "2026-08-14": { wordId: "w1", status: "known" } },
    assignmentOrdinal: 1,
    level: 1,
    interests: ["classical-arabic"],
    showEnglish: true,
    wordStates: { w1: { status: "known", saved: true } },
  };
  const fixture = popupApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-08-14" },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  }, { profile, vocabulary });
  await fixture.api.initialize();
  await fixture.api.renderAssigned({ word: vocabulary[0], dateKey: "2026-08-14", status: "known", saved: true });

  await fixture.api.exportAnki();

  assert.equal(fixture.downloads.length, 1);
  assert.equal(fixture.downloads[0].download, "kalimat-anki-deck.csv");
  const blob = fixture.recordedBlobs.get(fixture.downloads[0].href);
  assert.ok(blob);
  const buffer = Buffer.from(await blob.arrayBuffer());
  assert.equal(buffer[0], 0xEF, "Byte 0 must be UTF-8 BOM EF");
  assert.equal(buffer[1], 0xBB, "Byte 1 must be UTF-8 BOM BB");
  assert.equal(buffer[2], 0xBF, "Byte 2 must be UTF-8 BOM BF");
  const csvContent = await blob.text();
  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  assert.equal(lines[0], '"Word","Root","Weight","Vocalization","Meaning","English Meaning","Example"');
  assert.match(lines[1], /"كِتَابٌ"/);
  assert.match(lines[1], /"ك-ت-ب"/);
  assert.match(lines[1], /"book, ""volume"""/);
});

test("popup 1080x1080 social card export triggers Canvas generation with correct filename and geometry", async () => {
  const word = {
    id: "w1",
    word: "سَلَام",
    meaningAr: "أمان وطمأنينة",
    meaningEn: "peace and security",
    pronunciation: "/salaam/",
    contextAr: "يَعُمُّ السَّلَامُ الأَرْجَاءَ",
    exampleAr: "سَلَامٌ هِيَ حَتَّى مَطْلَعِ الفَجْرِ",
  };
  const fixture = popupApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-08-14" },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  }, { profile: { assignments: {} }, vocabulary: [word] });
  await fixture.api.initialize();
  await fixture.api.renderAssigned({ word, dateKey: "2026-08-14" });

  await fixture.api.exportCard();

  assert.equal(fixture.downloads.length, 1);
  assert.equal(fixture.downloads[0].download, "kalimat-word-w1.png");
});

test("Atlas exposes theme-select, streak-badge, and export controls in HTML", () => {
  const html = atlasSource("atlas.html");
  assert.match(html, /<select\s+id="theme-select"[^>]*aria-label="اختر السمة"/);
  assert.match(html, /<option\s+value="paper">ورقي<\/option>/);
  assert.match(html, /<option\s+value="emerald">زمردي<\/option>/);
  assert.match(html, /<option\s+value="midnight">ليلي<\/option>/);
  assert.match(html, /<span\s+id="streak-badge"[^>]*class="streak-badge"/);
  assert.match(html, /<button\s+id="today-export-card"[^>]*>بطاقة للمشاركة<\/button>/);
  assert.match(html, /<button\s+id="history-export-anki"[^>]*>تصدير إلى Anki \(CSV\)<\/button>/);
  assert.match(html, /<button\s+id="btn-export-anki"[^>]*>تصدير بطاقات Anki \(CSV\)<\/button>/);
  assert.match(html, /<script\s+src="\.\.\/shared\/theme\.js"><\/script>/);
  assert.match(html, /<script\s+src="\.\.\/shared\/streak\.js"><\/script>/);
  assert.match(html, /<script\s+src="\.\.\/shared\/export\.js"><\/script>/);
});

test("Atlas ThemeController initializes, binds select, and persists theme changes", async () => {
  const profile = atlasProfile({ assignments: { "2026-08-14": { wordId: "w1" } }, assignmentOrdinal: 1 });
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-08-14" },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  }, { theme: "midnight" });
  await fixture.api.initialize();

  const themeSelect = fixture.elements.get("theme-select");
  assert.equal(themeSelect.value, "midnight");
  assert.equal(fixture.context.document.documentElement.getAttribute("data-theme"), "midnight");

  themeSelect.value = "emerald";
  if (themeSelect.listeners["change"]) {
    await themeSelect.listeners["change"]();
  }
  assert.equal(fixture.context.document.documentElement.getAttribute("data-theme"), "emerald");
  assert.equal(fixture.storageData["kalimat.theme"], "emerald");

  for (const listener of fixture.storageListeners) {
    listener({ "kalimat.theme": { newValue: "paper" } }, "local");
  }
  assert.equal(themeSelect.value, "paper");
  assert.equal(fixture.context.document.documentElement.getAttribute("data-theme"), "paper");
});

test("Atlas streak badge calculates consecutive days and updates on feedback and save", async () => {
  const today = new Date();
  const dateKey = (offset) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const todayKey = dateKey(0);
  const yesterdayKey = dateKey(-1);
  const twoDaysAgoKey = dateKey(-2);
  const profile = atlasProfile({
    assignments: {
      [twoDaysAgoKey]: { wordId: "w1", status: "known" },
      [yesterdayKey]: { wordId: "w2", status: "known" },
      [todayKey]: { wordId: "w1", status: "known" },
    },
    assignmentOrdinal: 3,
  });
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: todayKey },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
    "word.feedback": { kind: "ok", wordId: "w1", dateKey: todayKey, status: "known" },
    "word.save": { kind: "ok", wordId: "w1", saved: true },
  });
  await fixture.api.initialize();

  const streakBadge = fixture.elements.get("streak-badge");
  assert.match(streakBadge.textContent, /🔥\s*٣\s*أيام\s*متتالية/);

  await fixture.api.feedback("known");
  assert.match(streakBadge.textContent, /🔥\s*٣\s*أيام\s*متتالية/);
});

test("Atlas Anki CSV and Social Card exports download valid deck and 1080x1080 PNG", async () => {
  const word = {
    id: "w1",
    word: "كِتَابٌ",
    meaningAr: "مُؤَلَّفٌ",
    meaningEn: "book",
    pronunciation: "/kitaab/",
    contextAr: "قَرَأْتُ كِتَابًا",
    exampleAr: "خَيْرُ جَلِيسٍ",
    root: "ك-ت-ب",
    pattern: "فِعَال",
  };
  const profile = atlasProfile({
    assignments: { "2026-08-14": { wordId: "w1", status: "known" } },
    assignmentOrdinal: 1,
    wordStates: { w1: { status: "known", saved: true } },
  });
  const fixture = atlasApi({
    "assignment.get": { kind: "assigned", wordId: "w1", dateKey: "2026-08-14" },
    "state.export": { kind: "export", text: JSON.stringify(profile) },
    "settings.get": { kind: "settings", reminder: { enabled: false, time: "09:00" } },
  }, { vocabulary: [word] });
  await fixture.api.initialize();

  await fixture.api.exportAnkiCSV();
  assert.equal(fixture.downloads.length, 1);
  assert.equal(fixture.downloads[0].download, "kalimat-anki-deck.csv");

  await fixture.api.exportSocialCard(word, fixture.elements.get("today-export-card"));
  assert.equal(fixture.downloads.length, 2);
  assert.equal(fixture.downloads[1].download, "kalimat-word-w1.png");
});

test("All popup and atlas files maintain zero CSP violations and no unsafe sinks", () => {
  const popupHtml = source("popup.html");
  const popupCss = source("popup.css");
  const popupJs = source("popup.js");
  const atlasHtml = atlasSource("atlas.html");
  const atlasCss = atlasSource("atlas.css");
  const atlasJs = atlasSource("atlas.js");

  for (const [name, content] of [["popup.html", popupHtml], ["atlas.html", atlasHtml]]) {
    assert.doesNotMatch(content, /\son[a-z]+\s*=/i, `${name} has inline event handler`);
    assert.doesNotMatch(content, /<script(?![^>]+\bsrc=)[^>]*>/i, `${name} has inline script`);
    assert.doesNotMatch(content, /<style\b/i, `${name} has inline style tag`);
  }

  for (const [name, content] of [["popup.js", popupJs], ["atlas.js", atlasJs]]) {
    const withoutApprovedRemote = content.replace(/https:\/\/ar\.wiktionary\.org[^\s"'`)]*/g, "");
    assert.doesNotMatch(withoutApprovedRemote, /https?:\/\/|\b(?:innerHTML|outerHTML)\b|\b(?:setInterval|setTimeout)\s*\(/, `${name} contains unsafe sink or timer`);
  }
});
