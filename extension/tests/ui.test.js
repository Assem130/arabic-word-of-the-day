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
  const ids = ["status", "onboarding", "assigned", "empty", "error", "recovery", "warning", "empty-title", "error-title", "word", "meaning-ar", "meaning-en", "example", "example-en", "pronunciation", "fixed-label", "save", "speak", "reminder", "reminder-time", "onboarding-submit", "onboarding-skip", "explore", "explore-empty", "recovery-reset", "known", "difficult"];
  for (const id of ids) elements.set(id, element());
  elements.get("reminder-time").value = "09:00";
  const inputs = ["classical-arabic", "daily-life", "family", "food", "language", "travel"].map((value) => ({ ...element(), value, name: "interest" }));
  const document = {
    readyState: "loading", getElementById(id) { return elements.get(id); },
    querySelectorAll(selector) { return selector === 'input[name="interest"]' ? inputs : []; },
    addEventListener() {},
  };
  const calls = [];
  const extension = {
    runtime: { sendMessage(message) { calls.push(message); const response = responses[message.type]; const result = typeof response === "function" ? response(message, calls) : response; return result instanceof Error ? Promise.reject(result) : Promise.resolve(result ?? {}); }, getURL(value) { return `extension://kalimat/${value}`; } },
    permissions: { request(value) { calls.push({ permission: value }); return Promise.resolve(true); } },
    tabs: { create(value) { calls.push({ tab: value }); return Promise.resolve(); } },
    storage: { local: { get() { return Promise.resolve({ "kalimat.profile": Object.hasOwn(options, "profile") ? options.profile : {} }); } } },
  };
  const context = { document, chrome: extension, Promise, console, confirm: options.confirm, globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(source("popup.js"), context, { filename: files["popup.js"] });
  return { api: context.KalimatPopup, elements, inputs, calls };
}

function atlasApi(responses = {}, options = {}) {
  const elements = new Map();
  const ids = ["status", "warning", "today", "explore", "history", "settings", "today-view", "explore-view", "history-view", "settings-view", "onboarding", "recovery", "empty", "error", "today-title", "explore-title", "history-title", "settings-title", "onboarding-title", "recovery-title", "empty-title", "error-title", "today-card", "today-empty", "explore-card", "atlas-search", "search-count", "search-results", "return-today", "history-filter", "history-list", "settings-english", "settings-save", "settings-time", "settings-reminder", "export", "import-file", "clear", "recovery-export", "recovery-import", "recovery-clear", "onboarding-settings", "today-save", "today-known", "today-difficult"];
  for (const id of ids) elements.set(id, element());
  elements.get("history-filter").value = "all";
  const levels = [1, 2, 3, 4].map((value) => ({ ...element(), value: String(value), name: "atlas-level" }));
  const interests = ["classical-arabic", "daily-life", "family", "food", "language", "travel"].map((value) => ({ ...element(), value, name: "atlas-interest" }));
  const document = {
    readyState: "loading",
    getElementById(id) { return elements.get(id); },
    createElement() { return element(); },
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
    permissions: { request() { return Promise.resolve(true); } },
  };
  const vocabulary = options.vocabulary ?? [
    { id: "w1", word: "كلمة", normalized: "كلمة", meaningAr: "معنى", meaningEn: "meaning", pronunciation: "/w1/", exampleAr: "مثال" },
    { id: "w2", word: "ثانية", normalized: "ثانية", meaningAr: "شرح", meaningEn: "second", pronunciation: "/w2/", exampleAr: "مثال ثان" },
  ];
  const context = {
    document, chrome: extension, Promise, console, URLSearchParams, URL, Blob,
    location: { search: options.search ?? "" },
    fetch: async () => ({ ok: true, async json() { return vocabulary; } }),
    confirm: options.confirm ?? (() => true),
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(atlasSource("atlas.js"), context, { filename: path.join(atlas, "atlas.js") });
  return { api: context.KalimatAtlas, elements, levels, interests, calls, context };
}

test("popup ships separate native files without unsafe markup or timer work", () => {
  for (const file of Object.values(files)) assert.equal(fs.existsSync(file), true, `${path.basename(file)} is missing`);
  const html = source("popup.html");
  const css = source("popup.css");
  const js = source("popup.js");
  assert.match(html, /<html\s+lang="ar"\s+dir="rtl">/);
  assert.match(html, /<link[^>]+href="popup\.css"/);
  assert.match(html, /<script\s+src="popup\.js"><\/script>/);
  assert.doesNotMatch(`${html}\n${css}\n${js}`, /https?:\/\/|\b(?:innerHTML|outerHTML)\b|\b(?:setInterval|setTimeout)\s*\(/);
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
  assert.match(html, /aria-label="المستوى"/);
  assert.equal((html.match(/name="level"/g) || []).length, 4);
  assert.equal((html.match(/name="interest"/g) || []).length, 6);
  for (const label of ["تخطي الآن", "ثابتة لليوم", "معروف", "صعب", "حفظ", "استكشف", "تذكير يومي"]) assert.match(html, new RegExp(`>${label}<`));
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
  for (const id of ["today", "explore", "history", "settings", "atlas-search", "return-today", "history-filter", "settings-level", "settings-english", "settings-time", "export", "import-file", "clear", "recovery-export", "recovery-import", "recovery-clear"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.equal((html.match(/name="atlas-level"/g) || []).length, 4);
  assert.equal((html.match(/name="atlas-interest"/g) || []).length, 6);
  assert.match(html, /id="search-count"[^>]+aria-live="polite"/);
  assert.doesNotMatch(`${html}\n${css}\n${js}`, /https?:\/\/|\b(?:innerHTML|outerHTML)\b|\b(?:setInterval|setTimeout)\s*\(/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.match(css, /background:\s*#102b2a/i);
  assert.match(css, /:focus-visible/);
  assert.match(css, /button\[aria-pressed="true"\][^{]*\{[^}]*color:/);
  assert.match(css, /\.file-button[^}]*focus-visible/);
  assert.match(css, /:focus-visible[^}]*box-shadow/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
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
  assert.match(js, /normalize\("NFD"\)/);
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
  const word = { id: "w1", word: "كلمة", normalized: "كلمة", meaningAr: "معنى", meaningEn: "meaning", contextAr: "market counter", contextEn: "at the market", exampleAr: "مثال", pronunciation: "/w1/", root: "k-t-b", pattern: "fa3ala", register: "standard", partOfSpeech: "verb" };
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
