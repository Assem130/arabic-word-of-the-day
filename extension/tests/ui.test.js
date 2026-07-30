const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const popup = path.join(__dirname, "..", "popup");
const files = Object.fromEntries(["popup.html", "popup.css", "popup.js"].map((name) => [name, path.join(popup, name)]));

function source(name) {
  return fs.readFileSync(files[name], "utf8");
}

function element() {
  const attributes = Object.create(null);
  return {
    textContent: "", hidden: false, disabled: false, checked: false, value: "", dataset: {}, attributes, focuses: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(name, value) { this.attributes[name] = { name, value: String(value) }; },
    getAttribute(name) { return this.attributes[name]?.value ?? null; },
    addEventListener(type, listener) { this.listeners[type] = listener; }, listeners: {}, focus() { this.focuses += 1; },
  };
}

function popupApi(responses = {}) {
  const elements = new Map();
  const ids = ["status", "onboarding", "assigned", "empty", "recovery", "warning", "word", "meaning-ar", "meaning-en", "example", "pronunciation", "fixed-label", "save", "speak", "reminder", "reminder-time", "onboarding-submit", "onboarding-skip", "explore", "known", "difficult"];
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
    runtime: { sendMessage(message) { calls.push(message); return Promise.resolve(responses[message.type] ?? {}); }, getURL(value) { return `extension://kalimat/${value}`; } },
    permissions: { request(value) { calls.push({ permission: value }); return Promise.resolve(true); } },
    tabs: { create(value) { calls.push({ tab: value }); return Promise.resolve(); } },
  };
  const context = { document, chrome: extension, Promise, console, globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(source("popup.js"), context, { filename: files["popup.js"] });
  return { api: context.KalimatPopup, elements, inputs, calls };
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
  assert.match(html, /<h1[^>]*>كلمات<\/h1>/);
  assert.match(html, /id="status"[^>]+aria-live="polite"/);
  assert.match(html, /aria-label="المستوى"/);
  assert.equal((html.match(/name="level"/g) || []).length, 4);
  assert.equal((html.match(/name="interest"/g) || []).length, 6);
  for (const label of ["تخطي الآن", "ثابتة لليوم", "معروف", "صعب", "حفظ", "استكشف", "تذكير يومي"]) assert.match(html, new RegExp(`>${label}<`));
  for (const id of ["known", "difficult", "save", "speak", "explore", "reminder", "onboarding-submit", "onboarding-skip"]) assert.match(html, new RegExp(`<button[^>]+id="${id}"`));
  assert.match(html, /<h2 id="word"[^>]+tabindex="-1"/);
  assert.match(html, /<input[^>]+id="reminder-time"[^>]+type="time"[^>]+value="09:00"/);
  assert.match(html, /<button[^>]+id="reminder"[^>]+aria-pressed="false"/);
  assert.match(source("popup.css"), /grid-template-columns:\s*repeat\(4, 1fr\)/);
});

test("popup renders hostile assigned-word content as text and caps interests", () => {
  const { api, elements, inputs } = popupApi();
  assert.ok(api);
  api.renderAssigned({ kind: "assigned", word: { id: "w1", word: "<img onerror=alert(1)>", meaningAr: "معنى", meaningEn: "meaning", exampleAr: "مثال", pronunciation: "/test/" } });
  assert.equal(elements.get("word").textContent, "<img onerror=alert(1)>");
  inputs.slice(0, 3).forEach((input) => { input.checked = true; });
  inputs[3].checked = true;
  api.limitInterests({ target: inputs[3] });
  assert.equal(inputs[3].checked, false);
});

test("reminder requests optional permissions in the click handler before configuration", async () => {
  const { api, calls } = popupApi();
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
