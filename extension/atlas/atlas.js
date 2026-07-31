(() => {
  "use strict";

  const ExtApi = globalThis.browser ?? globalThis.chrome;
  const byId = (id) => document.getElementById(id);
  const views = ["today", "explore", "history", "settings", "onboarding", "recovery"];
  const state = { vocabulary: [], profile: null, today: null, viewed: null, reminder: { enabled: false, time: "09:00" }, recoveryRaw: null };
  let elements;

  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u064B-\u065F\u0670]/g, "").toLowerCase();
  }

  function validTime(value) {
    return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) && Number(value.slice(0, 2)) < 24 && Number(value.slice(3)) < 60;
  }

  function collect() {
    return Object.fromEntries(["status", "today", "explore", "history", "settings", "today-view", "explore-view", "history-view", "settings-view", "onboarding", "recovery", "today-title", "explore-title", "history-title", "settings-title", "onboarding-title", "recovery-title", "today-card", "explore-card", "atlas-search", "search-count", "search-results", "return-today", "history-filter", "history-list", "settings-english", "settings-save", "settings-time", "settings-reminder", "export", "import-file", "clear", "recovery-export", "recovery-import", "recovery-clear", "onboarding-settings", "today-save", "today-known", "today-difficult"].map((id) => [id, byId(id)]));
  }

  function status(message) { elements.status.textContent = message; }

  function show(name) {
    for (const view of views) {
      const section = view === "onboarding" || view === "recovery" ? elements[view] : elements[`${view}-view`];
      section.hidden = view !== name;
    }
    for (const nameButton of ["today", "explore", "history", "settings"]) elements[nameButton].setAttribute("aria-pressed", String(nameButton === name));
    const heading = byId(`${name}-title`);
    if (heading) heading.focus();
  }

  function wordById(id) { return state.vocabulary.find((word) => word.id === id) ?? null; }

  function addText(parent, tag, value, className, direction) {
    if (!value) return;
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (direction) node.dir = direction;
    node.textContent = value;
    parent.append(node);
  }

  function renderWord(container, word) {
    container.replaceChildren();
    if (!word) return;
    const title = document.createElement("h3");
    title.lang = "ar";
    title.textContent = word.word;
    container.append(title);
    addText(container, "p", word.meaningAr, "meaning", "rtl");
    if (state.profile?.showEnglish !== false) addText(container, "p", word.meaningEn, "english", "ltr");
    addText(container, "p", word.pronunciation, "pronunciation", "ltr");
    addText(container, "p", word.exampleAr, "example", "rtl");
    if (word.root || word.pattern) {
      const details = document.createElement("p");
      details.className = "root";
      if (word.root) addText(details, "span", `الجذر: ${word.root}`);
      if (word.pattern) addText(details, "span", `الوزن: ${word.pattern}`);
      container.append(details);
    }
    if (Array.isArray(word.relatedIds)) {
      const related = document.createElement("div");
      for (const id of word.relatedIds) {
        const other = wordById(id);
        if (!other) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = other.word;
        button.addEventListener("click", () => { viewWord(other); show("explore"); });
        related.append(button);
      }
      if (related.childElementCount) container.append(related);
    }
  }

  function renderToday() {
    renderWord(elements["today-card"], state.today?.word);
    const wordState = state.today?.word && state.profile?.wordStates?.[state.today.word.id];
    elements["today-save"].setAttribute("aria-pressed", String(wordState?.saved === true));
    elements["today-known"].setAttribute("aria-pressed", String(wordState?.status === "known"));
    elements["today-difficult"].setAttribute("aria-pressed", String(wordState?.status === "difficult"));
  }

  function viewWord(word) {
    state.viewed = word;
    renderWord(elements["explore-card"], word);
    elements["explore-card"].hidden = false;
    elements["return-today"].hidden = word.id === state.today?.word?.id;
  }

  function search() {
    const query = normalize(elements["atlas-search"].value).trim();
    const matches = query ? state.vocabulary.filter((word) => [word.word, word.normalized, word.meaningAr, word.meaningEn].some((value) => normalize(value).includes(query))).slice(0, 20) : [];
    elements["search-results"].replaceChildren();
    elements["search-count"].textContent = query ? `${matches.length} نتيجة` : "";
    for (const word of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${word.word} — ${word.meaningAr}`;
      button.addEventListener("click", () => viewWord(word));
      elements["search-results"].append(button);
    }
  }

  function renderHistory() {
    const filter = elements["history-filter"].value;
    const wordStates = state.profile?.wordStates ?? {};
    const entries = Object.entries(state.profile?.assignments ?? {}).sort(([left], [right]) => right.localeCompare(left)).filter(([, assignment]) => filter !== "difficult" || assignment.status === "difficult").filter(([, assignment]) => filter !== "saved" || wordStates[assignment.wordId]?.saved === true);
    elements["history-list"].replaceChildren();
    for (const [dateKey, assignment] of entries) {
      const word = wordById(assignment.wordId);
      if (!word) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${dateKey} — ${word.word}`;
      button.addEventListener("click", () => loadAssignment(dateKey));
      elements["history-list"].append(button);
    }
    if (!elements["history-list"].childElementCount) elements["history-list"].textContent = "لا توجد كلمات في هذا العرض.";
  }

  function selectedInterests() { return [...document.querySelectorAll('input[name="atlas-interest"]:checked')].map((input) => input.value); }

  function hydrateSettings() {
    const profile = state.profile ?? {};
    const level = document.querySelector(`input[name="atlas-level"][value="${profile.level ?? 1}"]`);
    if (level) level.checked = true;
    for (const input of document.querySelectorAll('input[name="atlas-interest"]')) input.checked = profile.interests?.includes(input.value) === true;
    elements["settings-english"].checked = profile.showEnglish !== false;
    elements["settings-time"].value = state.reminder.time;
    elements["settings-reminder"].setAttribute("aria-pressed", String(state.reminder.enabled));
    elements["settings-reminder"].textContent = state.reminder.enabled ? "إيقاف التذكير اليومي" : "تفعيل التذكير اليومي";
  }

  async function saveSettings() {
    const interests = selectedInterests();
    const level = Number(document.querySelector('input[name="atlas-level"]:checked')?.value);
    if (!Number.isInteger(level) || interests.length > 3) return status("اختر مستوى وحتى ثلاثة اهتمامات.");
    const result = await ExtApi.runtime.sendMessage({ type: "settings.update", level, interests, showEnglish: elements["settings-english"].checked });
    if (result?.kind === "recovery") return renderRecovery(result.recoveryRaw);
    state.profile = { ...state.profile, level, interests, showEnglish: elements["settings-english"].checked };
    renderToday();
    status("حُفظت الإعدادات.");
  }

  async function configureReminder() {
    const enabled = elements["settings-reminder"].getAttribute("aria-pressed") !== "true";
    const time = elements["settings-time"].value;
    if (!validTime(time)) return status("اختر وقتًا صالحًا.");
    if (enabled && !(await ExtApi.permissions.request({ permissions: ["alarms", "notifications"] }))) return status("لم تُمنح أذونات التذكير.");
    const reminder = await ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled, time });
    if (!reminder || typeof reminder.enabled !== "boolean") throw new Error("Invalid reminder.");
    state.reminder = reminder;
    hydrateSettings();
  }

  async function saveReminderTime() {
    const time = elements["settings-time"].value;
    if (!validTime(time)) return status("اختر وقتًا صالحًا.");
    state.reminder = await ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled: state.reminder.enabled, time });
  }

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportState(raw = false) {
    const result = await ExtApi.runtime.sendMessage({ type: "state.export" });
    if (result?.kind === "recovery") return download(JSON.stringify(result.recoveryRaw, null, 2), "kalimat-recovery.json");
    if (result?.kind !== "export") throw new Error("Invalid export.");
    download(raw ? JSON.stringify(state.recoveryRaw, null, 2) : result.text, "kalimat-data.json");
  }

  async function importState(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return status("ملف الاستيراد كبير جدًا.");
    try {
      const text = await file.text();
      const result = await ExtApi.runtime.sendMessage({ type: "state.import", text });
      if (result?.kind !== "ok") throw new Error("Import failed.");
      await load();
    } catch (_) { status("تعذّر استيراد الملف. لم نغيّر بياناتك."); }
    input.value = "";
  }

  async function clearState() {
    if (!globalThis.confirm("هل تريد مسح بيانات كلمات؟ لا يمكن التراجع عن ذلك.")) return;
    const result = await ExtApi.runtime.sendMessage({ type: "state.clear" });
    if (result?.kind !== "ok") throw new Error("Clear failed.");
    state.profile = null;
    state.today = null;
    show("onboarding");
    status("مُسحت البيانات.");
  }

  async function feedback(statusName) {
    if (!state.today?.word) return;
    const result = await ExtApi.runtime.sendMessage({ type: "word.feedback", dateKey: state.today.dateKey, wordId: state.today.word.id, status: statusName });
    if (result?.kind === "recovery") return renderRecovery(result.recoveryRaw);
    state.profile.wordStates ??= {};
    state.profile.wordStates[state.today.word.id] = { ...state.profile.wordStates[state.today.word.id], status: statusName, dateKey: state.today.dateKey };
    renderToday();
  }

  async function toggleSave() {
    if (!state.today?.word) return;
    const current = state.profile?.wordStates?.[state.today.word.id]?.saved === true;
    await ExtApi.runtime.sendMessage({ type: "word.save", wordId: state.today.word.id, saved: !current });
    state.profile.wordStates ??= {};
    state.profile.wordStates[state.today.word.id] = { ...state.profile.wordStates[state.today.word.id], saved: !current };
    renderToday();
  }

  async function loadAssignment(dateKey) {
    const result = await ExtApi.runtime.sendMessage({ type: "assignment.get", dateKey });
    if (result?.kind === "recovery") return renderRecovery(result.recoveryRaw);
    if (result?.kind !== "assigned") return status("لا توجد كلمة محفوظة لهذا التاريخ.");
    const word = wordById(result.wordId);
    if (!word) return status("الكلمة غير متاحة.");
    if (!dateKey || dateKey === state.today?.dateKey) state.today = { ...result, word };
    viewWord(word);
    show("explore");
  }

  function renderRecovery(raw) {
    state.recoveryRaw = raw;
    show("recovery");
    status("");
  }

  async function load() {
    const response = await fetch(ExtApi.runtime.getURL("data/vocabulary.json"));
    if (!response.ok) throw new Error("Vocabulary unavailable.");
    state.vocabulary = await response.json();
    const query = new URLSearchParams(globalThis.location.search).get("date");
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(query ?? "") ? query : undefined;
    const [assignment, requested, exported, settings] = await Promise.all([ExtApi.runtime.sendMessage({ type: "assignment.get" }), dateKey ? ExtApi.runtime.sendMessage({ type: "assignment.get", dateKey }) : Promise.resolve(null), ExtApi.runtime.sendMessage({ type: "state.export" }), ExtApi.runtime.sendMessage({ type: "settings.get" })]);
    if (assignment?.kind === "recovery" || requested?.kind === "recovery" || exported?.kind === "recovery") return renderRecovery(assignment?.recoveryRaw ?? requested?.recoveryRaw ?? exported?.recoveryRaw);
    if (exported?.kind !== "export") throw new Error("Profile unavailable.");
    state.profile = JSON.parse(exported.text);
    state.reminder = settings?.reminder ?? state.reminder;
    hydrateSettings();
    if (assignment?.kind === "assigned") {
      const word = wordById(assignment.wordId);
      if (word) state.today = { ...assignment, word };
      renderToday();
    } else status(dateKey ? "لا توجد كلمة محفوظة لهذا التاريخ." : "لا توجد كلمة جديدة اليوم.");
    if (requested?.kind === "assigned") {
      const word = wordById(requested.wordId);
      if (word) {
        viewWord(word);
        show("explore");
      }
    } else if (dateKey) status("لا توجد كلمة محفوظة لهذا التاريخ.");
  }

  function listen() {
    elements.today.addEventListener("click", () => { show("today"); renderToday(); });
    elements.explore.addEventListener("click", () => show("explore"));
    elements.history.addEventListener("click", () => { show("history"); renderHistory(); });
    elements.settings.addEventListener("click", () => { show("settings"); hydrateSettings(); });
    elements["atlas-search"].addEventListener("input", search);
    elements["return-today"].addEventListener("click", () => { if (state.today?.word) viewWord(state.today.word); });
    elements["history-filter"].addEventListener("change", renderHistory);
    elements["settings-save"].addEventListener("click", () => saveSettings().catch(() => status("تعذّر حفظ الإعدادات.")));
    document.querySelectorAll('input[name="atlas-interest"]').forEach((input) => input.addEventListener("change", () => { if (selectedInterests().length > 3) input.checked = false; }));
    elements["settings-reminder"].addEventListener("click", () => configureReminder().catch(() => status("تعذّر تغيير التذكير.")));
    elements["settings-time"].addEventListener("change", () => saveReminderTime().catch(() => status("تعذّر حفظ الوقت.")));
    elements.export.addEventListener("click", () => exportState().catch(() => status("تعذّر التصدير.")));
    elements["import-file"].addEventListener("change", () => importState(elements["import-file"]));
    elements.clear.addEventListener("click", () => clearState().catch(() => status("تعذّر مسح البيانات.")));
    elements["recovery-export"].addEventListener("click", () => exportState(true).catch(() => status("تعذّر التصدير.")));
    elements["recovery-import"].addEventListener("change", () => importState(elements["recovery-import"]));
    elements["recovery-clear"].addEventListener("click", () => clearState().catch(() => status("تعذّر مسح البيانات.")));
    elements["onboarding-settings"].addEventListener("click", () => show("settings"));
    elements["today-known"].addEventListener("click", () => feedback("known").catch(() => status("تعذّر حفظ التقييم.")));
    elements["today-difficult"].addEventListener("click", () => feedback("difficult").catch(() => status("تعذّر حفظ التقييم.")));
    elements["today-save"].addEventListener("click", () => toggleSave().catch(() => status("تعذّر الحفظ.")));
  }

  async function initialize() {
    elements = collect();
    listen();
    try { await load(); } catch (_) { status("تعذّر تحميل الأطلس."); }
  }

  globalThis.KalimatAtlas = { normalize, loadAssignment, renderHistory, search };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
