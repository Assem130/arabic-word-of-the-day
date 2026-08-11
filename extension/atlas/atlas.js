(() => {
  "use strict";

  const ExtApi = globalThis.browser ?? globalThis.chrome;
  const byId = (id) => document.getElementById(id);
  const views = ["today", "explore", "history", "settings", "onboarding", "recovery", "empty", "error"];
  const state = { vocabulary: [], profile: null, today: null, exploreWord: null, reminder: { enabled: false, time: "09:00" }, reminderWarning: false, recoveryRaw: null };
  let elements;
  let reminderQueue = Promise.resolve();

  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u064B-\u065F\u0670]/g, "").toLowerCase();
  }

  function validTime(value) {
    return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) && Number(value.slice(0, 2)) < 24 && Number(value.slice(3)) < 60;
  }

  function collect() {
    return Object.fromEntries(["status", "warning", "today", "explore", "history", "settings", "today-view", "explore-view", "history-view", "settings-view", "onboarding", "recovery", "empty", "error", "today-title", "explore-title", "history-title", "settings-title", "onboarding-title", "recovery-title", "empty-title", "error-title", "today-card", "today-empty", "explore-card", "atlas-search", "search-count", "search-results", "return-today", "history-filter", "history-list", "settings-english", "settings-save", "settings-time", "settings-reminder", "export", "import-file", "clear", "recovery-export", "recovery-import", "recovery-clear", "onboarding-settings", "today-save", "today-known", "today-difficult"].map((id) => [id, byId(id)]));
  }

  function status(message) { elements.status.textContent = message; }

  function warning(visible) { elements.warning.hidden = !visible; }

  function show(name) {
    for (const view of views) {
      const section = ["onboarding", "recovery", "empty", "error"].includes(view) ? elements[view] : elements[`${view}-view`];
      section.hidden = view !== name;
    }
    for (const nameButton of ["today", "explore", "history", "settings"]) elements[nameButton].setAttribute("aria-pressed", String(nameButton === name));
    const heading = byId(`${name}-title`);
    if (heading) heading.focus();
    if (name !== "today") setTodayActions(false);
  }

  function wordById(id) { return state.vocabulary.find((word) => word.id === id) ?? null; }

  function setTodayActions(enabled) {
    for (const id of ["today-save", "today-known", "today-difficult"]) elements[id].disabled = !enabled;
  }

  function addText(parent, tag, value, className, direction) {
    if (!value) return;
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (direction) node.dir = direction;
    node.textContent = value;
    parent.append(node);
  }

  function addLabeledText(parent, value, className, label, direction) {
    if (!value) return;
    const node = document.createElement("p");
    node.className = className;
    if (direction) node.dir = direction;
    addText(node, "span", label, "label", direction);
    addText(node, "span", value, "text", direction);
    parent.append(node);
  }

  const REGISTER_LABELS = { standard: "فصيح معاصر", classical: "كلاسيكي", colloquial: "عامي" };
  const PART_LABELS = { noun: "اسم", verb: "فعل", adjective: "صفة", adverb: "ظرف", phrase: "عبارة", other: "أخرى" };

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
    addLabeledText(container, word.contextAr, "context", "\u0633\u064a\u0627\u0642 \u0639\u0645\u0644\u064a", "rtl");
    if (state.profile?.showEnglish !== false) addLabeledText(container, word.contextEn, "context english", "Practical context", "ltr");
    addLabeledText(container, word.exampleAr, "example", "\u0645\u062b\u0627\u0644 \u0623\u062f\u0628\u064a / \u0623\u0635\u0644\u064a", "rtl");
    if (word.root || word.pattern) {
      const details = document.createElement("p");
      details.className = "root metadata";
      if (word.root) addText(details, "span", `الجذر: ${word.root}`);
      if (word.pattern) addText(details, "span", `الوزن: ${word.pattern}`);
      container.append(details);
    }
    if (word.register || word.partOfSpeech) {
      const details = document.createElement("p");
      details.className = "metadata";
      if (word.register) addText(details, "span", `السجل: ${REGISTER_LABELS[word.register] ?? word.register}`);
      if (word.partOfSpeech) addText(details, "span", `نوع الكلمة: ${PART_LABELS[word.partOfSpeech] ?? word.partOfSpeech}`);
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
    const word = state.today?.word;
    renderWord(elements["today-card"], word);
    elements["today-card"].hidden = !word;
    elements["today-empty"].hidden = !!word;
    setTodayActions(!!word);
    const wordState = word && state.profile?.wordStates?.[word.id];
    elements["today-save"].setAttribute("aria-pressed", String(wordState?.saved === true));
    elements["today-known"].setAttribute("aria-pressed", String(wordState?.status === "known"));
    elements["today-difficult"].setAttribute("aria-pressed", String(wordState?.status === "difficult"));
  }

  function viewWord(word) {
    state.exploreWord = word;
    renderWord(elements["explore-card"], word);
    elements["explore-card"].hidden = false;
    elements["return-today"].hidden = word.id === state.today?.word?.id;
  }

  function mergeAssignment(result) {
    state.profile.assignments ??= {};
    state.profile.assignments[result.dateKey] = { ...state.profile.assignments[result.dateKey], wordId: result.wordId, ...(result.status ? { status: result.status } : {}) };
    if (result.status || result.saved !== undefined) {
      state.profile.wordStates ??= {};
      state.profile.wordStates[result.wordId] = {
        ...state.profile.wordStates[result.wordId],
        ...(result.status ? { status: result.status, dateKey: result.dateKey } : {}),
        ...(result.saved !== undefined ? { saved: result.saved === true } : {}),
      };
    }
  }

  function search() {
    const query = normalize(elements["atlas-search"].value).trim();
    const matches = query ? state.vocabulary.filter((word) => [word.word, word.normalized, word.meaningAr, word.meaningEn, word.contextAr, word.contextEn, word.root, word.pattern, word.register, word.partOfSpeech].some((value) => normalize(value).includes(query))).slice(0, 20) : [];
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
    const entries = Object.entries(state.profile?.assignments ?? {}).sort(([left], [right]) => right.localeCompare(left)).filter(([, assignment]) => filter !== "difficult" || (assignment.status ?? wordStates[assignment.wordId]?.status) === "difficult").filter(([, assignment]) => filter !== "saved" || wordStates[assignment.wordId]?.saved === true);
    elements["history-list"].replaceChildren();
    for (const [dateKey, assignment] of entries) {
      const word = wordById(assignment.wordId);
      if (!word) continue;
      const responseStatus = assignment.status ?? wordStates[assignment.wordId]?.status;
      const label = responseStatus === "known" ? "معروف" : responseStatus === "difficult" ? "صعب" : "غير مقيّمة";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${dateKey} — ${word.word} — ${label}`;
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
    const wasOnboarding = state.profile === null;
    const result = await ExtApi.runtime.sendMessage({ type: "settings.update", level, interests, showEnglish: elements["settings-english"].checked });
    if (result?.kind === "recovery") return renderRecovery(result.recoveryRaw);
    if (result?.kind !== "ok") throw new Error("Settings unchanged.");
    warning(result.storageWarning === true || state.reminderWarning);
    state.profile = { ...state.profile, level, interests, showEnglish: elements["settings-english"].checked };
    if (wasOnboarding) await loadAssignment();
    else {
      renderToday();
      if (state.exploreWord) renderWord(elements["explore-card"], state.exploreWord);
    }
    status("حُفظت الإعدادات.");
  }

  function enqueueReminder(work) {
    const next = reminderQueue.catch(() => undefined).then(work);
    reminderQueue = next.catch(() => undefined);
    return next;
  }

  function configureReminder() {
    return enqueueReminder(async () => {
      const enabled = !state.reminder.enabled;
      const time = elements["settings-time"].value;
      if (!validTime(time)) return status("اختر وقتًا صالحًا.");
      if (enabled && !(await ExtApi.permissions.request({ permissions: ["alarms", "notifications"] }))) return status("لم تُمنح أذونات التذكير.");
      const reminder = await ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled, time });
      if (!reminder || typeof reminder.enabled !== "boolean" || !validTime(reminder.time)) throw new Error("Invalid reminder.");
      state.reminder = { enabled: reminder.enabled, time: reminder.time };
      state.reminderWarning = reminder.storageWarning === true;
      warning(state.reminderWarning);
      hydrateSettings();
      return state.reminder;
    });
  }

  function saveReminderTime() {
    const time = elements["settings-time"].value;
    return enqueueReminder(async () => {
      if (!validTime(time)) return status("اختر وقتًا صالحًا.");
      const reminder = await ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled: state.reminder.enabled, time });
      if (!reminder || typeof reminder.enabled !== "boolean" || !validTime(reminder.time)) throw new Error("Invalid reminder.");
      state.reminder = { enabled: reminder.enabled, time: reminder.time };
      state.reminderWarning = reminder.storageWarning === true;
      warning(state.reminderWarning);
      hydrateSettings();
      return state.reminder;
    });
  }

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportState() {
    const result = await ExtApi.runtime.sendMessage({ type: "state.export" });
    if (result?.kind === "recovery") return download(JSON.stringify(result.recoveryRaw, null, 2), "kalimat-recovery.json");
    if (result?.kind !== "export") throw new Error("Invalid export.");
    download(result.text, "kalimat-data.json");
  }

  async function importState(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return status("ملف الاستيراد كبير جدًا.");
    let committed = false;
    try {
      const text = await file.text();
      const result = await ExtApi.runtime.sendMessage({ type: "state.import", text });
      if (result?.kind !== "ok") throw new Error("Import failed.");
      committed = true;
      state.recoveryRaw = null;
      warning(result.storageWarning === true || state.reminderWarning);
      await load();
    } catch (_) {
      status(committed ? "استوردنا الملف، لكن تعذّر تحديث العرض. افتح الأطلس مجددًا." : "تعذّر استيراد الملف. لم نغيّر بياناتك.");
    }
    input.value = "";
  }

  async function clearState() {
    if (!globalThis.confirm("هل تريد مسح بيانات كلمات؟ لا يمكن التراجع عن ذلك.")) return;
    const result = await ExtApi.runtime.sendMessage({ type: "state.clear" });
    if (result?.kind !== "ok") throw new Error("Clear failed.");
    state.reminderWarning = result.reminderWarning === true;
    warning(result.storageWarning === true || state.reminderWarning);
    state.profile = null;
    state.today = null;
    state.exploreWord = null;
    state.recoveryRaw = null;
    show("onboarding");
    status("مُسحت البيانات.");
  }

  async function feedback(statusName) {
    if (!state.today?.word) return;
    const result = await ExtApi.runtime.sendMessage({ type: "word.feedback", dateKey: state.today.dateKey, wordId: state.today.word.id, status: statusName });
    if (result?.kind === "recovery") return renderRecovery(result.recoveryRaw);
    if (result?.kind !== "ok") throw new Error("Feedback unchanged.");
    warning(result.storageWarning === true || state.reminderWarning);
    const authoritativeStatus = result.status ?? statusName;
    const dateKey = result.dateKey ?? state.today.dateKey;
    const wordId = result.wordId ?? state.today.word.id;
    state.profile.wordStates ??= {};
    state.profile.wordStates[wordId] = { ...state.profile.wordStates[wordId], status: authoritativeStatus, dateKey };
    state.profile.assignments ??= {};
    state.profile.assignments[dateKey] = { ...state.profile.assignments[dateKey], wordId, status: authoritativeStatus };
    renderToday();
  }

  async function toggleSave() {
    if (!state.today?.word) return;
    const current = state.profile?.wordStates?.[state.today.word.id]?.saved === true;
    const result = await ExtApi.runtime.sendMessage({ type: "word.save", wordId: state.today.word.id, saved: !current });
    if (result?.kind === "recovery") return renderRecovery(result.recoveryRaw);
    if (result?.kind !== "ok") throw new Error("Save unchanged.");
    warning(result.storageWarning === true || state.reminderWarning);
    const saved = typeof result.saved === "boolean" ? result.saved : !current;
    const wordId = result.wordId ?? state.today.word.id;
    state.profile.wordStates ??= {};
    state.profile.wordStates[wordId] = { ...state.profile.wordStates[wordId], saved };
    renderToday();
  }

  async function loadAssignment(dateKey) {
    const result = await ExtApi.runtime.sendMessage({ type: "assignment.get", dateKey });
    if (result?.kind === "recovery") return renderRecovery(result.recoveryRaw);
    if (result?.kind !== "assigned") { show("empty"); return status("لا توجد كلمة محفوظة لهذا التاريخ."); }
    const word = wordById(result.wordId);
    if (!word) { show("error"); return status("الكلمة غير متاحة."); }
    warning(result.storageWarning === true || state.reminderWarning);
    if (!dateKey) {
      mergeAssignment(result);
      state.today = { ...result, word };
      renderToday();
      show("today");
      return;
    }
    viewWord(word);
    show("explore");
  }

  function renderRecovery(raw) {
    state.recoveryRaw = raw;
    show("recovery");
    status("");
  }

  function renderError(message = "تعذّر تحميل الأطلس.") {
    show("error");
    status(message);
  }

  function returnToToday() {
    if (!state.today?.word) return show("empty");
    elements["return-today"].hidden = true;
    elements["explore-card"].hidden = true;
    show("today");
    renderToday();
  }

  async function load() {
    const response = await fetch(ExtApi.runtime.getURL("data/vocabulary.json"));
    if (!response.ok) throw new Error("Vocabulary unavailable.");
    state.vocabulary = await response.json();
    const query = new URLSearchParams(globalThis.location.search).get("date");
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(query ?? "") ? query : undefined;
    const assignmentRequest = dateKey ? { type: "assignment.get", dateKey } : { type: "assignment.get" };
    const [assignment, exported, settings] = await Promise.all([ExtApi.runtime.sendMessage(assignmentRequest), ExtApi.runtime.sendMessage({ type: "state.export" }), ExtApi.runtime.sendMessage({ type: "settings.get" })]);
    if (assignment?.kind === "recovery" || exported?.kind === "recovery") return renderRecovery(assignment?.recoveryRaw ?? exported?.recoveryRaw);
    if (exported?.kind !== "export") throw new Error("Profile unavailable.");
    state.profile = JSON.parse(exported.text);
    state.reminder = settings?.reminder ?? state.reminder;
    state.reminderWarning = settings?.storageWarning === true;
    state.recoveryRaw = null;
    warning(exported.storageWarning === true || assignment.storageWarning === true || state.reminderWarning);
    hydrateSettings();
    if (assignment?.kind === "assigned") {
      const word = wordById(assignment.wordId);
      if (!word) return renderError("الكلمة غير متاحة.");
      if (dateKey) {
        viewWord(word);
        show("explore");
      } else {
        mergeAssignment(assignment);
        state.today = { ...assignment, word };
        renderToday();
        show("today");
      }
    } else {
      show("empty");
      status(dateKey ? "لا توجد كلمة محفوظة لهذا التاريخ." : "لا توجد كلمة جديدة اليوم.");
    }
  }

  function listen() {
    elements.today.addEventListener("click", () => { show("today"); renderToday(); });
    elements.explore.addEventListener("click", () => show("explore"));
    elements.history.addEventListener("click", () => { show("history"); renderHistory(); });
    elements.settings.addEventListener("click", () => { show("settings"); hydrateSettings(); });
    elements["atlas-search"].addEventListener("input", search);
    document.querySelectorAll("label.file-button").forEach((label) => label.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); label.click(); }
    }));
    elements["return-today"].addEventListener("click", returnToToday);
    elements["history-filter"].addEventListener("change", renderHistory);
    elements["settings-save"].addEventListener("click", () => saveSettings().catch(() => status("تعذّر حفظ الإعدادات.")));
    document.querySelectorAll('input[name="atlas-interest"]').forEach((input) => input.addEventListener("change", () => { if (selectedInterests().length > 3) input.checked = false; }));
    elements["settings-reminder"].addEventListener("click", () => configureReminder().catch(() => status("تعذّر تغيير التذكير.")));
    elements["settings-time"].addEventListener("change", () => saveReminderTime().catch(() => status("تعذّر حفظ الوقت.")));
    elements.export.addEventListener("click", () => exportState().catch(() => status("تعذّر التصدير.")));
    elements["import-file"].addEventListener("change", () => importState(elements["import-file"]));
    elements.clear.addEventListener("click", () => clearState().catch(() => status("تعذّر مسح البيانات.")));
    elements["recovery-export"].addEventListener("click", () => exportState().catch(() => status("تعذّر التصدير.")));
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
    try { await load(); } catch (_) { renderError(); }
  }

  globalThis.KalimatAtlas = { normalize, load, initialize, loadAssignment, renderHistory, search, viewWord, saveSettings, clearState, importState, returnToToday, feedback, toggleSave, configureReminder, saveReminderTime, getReminder: () => ({ ...state.reminder }), getRecoveryRaw: () => state.recoveryRaw };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
