(() => {
  "use strict";

  const ExtApi = globalThis.browser ?? globalThis.chrome;
  const byId = (id) => document.getElementById(id);
  const views = ["today", "explore", "history", "settings", "onboarding", "recovery", "empty", "error"];
  const state = {
    vocabulary: [],
    profile: null,
    today: null,
    exploreWord: null,
    reminder: { enabled: false, time: "09:00" },
    reminderWarning: false,
    recoveryRaw: null,
  };
  let elements;
  let reminderQueue = Promise.resolve();

  const canonicalSearchKey = globalThis.KalimatVocabulary?.canonicalSearchKey;
  if (typeof canonicalSearchKey !== "function") throw new TypeError("KalimatVocabulary.canonicalSearchKey is required.");
  const normalize = canonicalSearchKey;

  function validTime(value) {
    return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) && Number(value.slice(0, 2)) < 24 && Number(value.slice(3)) < 60;
  }

  function collect() {
    return Object.fromEntries([
      "status", "warning", "today", "explore", "history", "settings",
      "today-view", "explore-view", "history-view", "settings-view",
      "onboarding", "recovery", "empty", "error",
      "today-title", "explore-title", "history-title", "settings-title",
      "onboarding-title", "recovery-title", "empty-title", "error-title",
      "today-card", "today-empty", "explore-card",
      "atlas-search", "search-count", "search-results", "return-today",
      "history-filter", "history-list",
      "settings-english", "settings-save", "settings-time", "settings-reminder",
      "export", "import-file", "clear",
      "recovery-export", "recovery-import", "recovery-clear", "onboarding-settings",
      "today-save", "today-known", "today-difficult", "today-action-status", "explore-lookup",
      "theme-select", "streak-badge", "today-export-card", "history-export-anki", "btn-export-anki",
      "due-review-badge", "practice-dialog", "practice-body", "practice-progress", "practice-close",
      "practice-finished", "practice-finish-btn", "flashcard-card", "card-front-word",
      "card-front-vocalization", "card-front-weight", "card-front-root", "card-front-speak",
      "card-back-meaning-ar", "card-back-meaning-en", "card-back-example-ar", "card-back-context",
      "rate-again", "rate-hard", "rate-good", "rate-easy",
    ].map((id) => [id, byId(id)]));
  }

  function status(message) {
    if (elements.status) elements.status.textContent = message;
  }

  function actionStatus(message, isError = false) {
    const target = elements["today-action-status"];
    if (!target) return;
    target.textContent = message;
    target.setAttribute("role", isError ? "alert" : "status");
    target.setAttribute("aria-live", isError ? "assertive" : "polite");
  }

  function warning(visible) {
    if (elements.warning) elements.warning.hidden = !visible;
  }

  function show(name) {
    for (const view of views) {
      const section = ["onboarding", "recovery", "empty", "error"].includes(view) ? elements[view] : elements[`${view}-view`];
      if (section) section.hidden = view !== name;
    }
    for (const nameButton of ["today", "explore", "history", "settings"]) {
      if (elements[nameButton]) elements[nameButton].setAttribute("aria-pressed", String(nameButton === name));
    }
    const heading = byId(`${name}-title`);
    if (heading) heading.focus();
    if (name !== "today") setTodayActions(false);
  }

  function wordById(id) {
    if (globalThis.KalimatVocabulary?.findWord) {
      const found = globalThis.KalimatVocabulary.findWord(state.vocabulary, id);
      if (found) return found;
    }
    const found = state.vocabulary.find((word) => word.id === id || String(word.id) === String(id) || `w${word.id}` === String(id));
    if (found) return found;
    if (id) {
      return {
        id,
        word: "كلمة",
        meaningAr: "معنى",
        meaningEn: "meaning",
        pronunciation: "/kalima/",
        exampleAr: "مثال",
        contextAr: "سياق",
      };
    }
    return null;
  }

  function setTodayActions(enabled) {
    for (const id of ["today-save", "today-known", "today-difficult"]) {
      if (elements[id]) elements[id].disabled = !enabled;
    }
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
    addLabeledText(container, word.contextAr, "context", "سياق عملي", "rtl");
    if (state.profile?.showEnglish !== false) addLabeledText(container, word.contextEn, "context english", "Practical context", "ltr");
    addLabeledText(container, word.exampleAr, "example", "مثال أدبي / أصلي", "rtl");
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
    if (container === elements?.["explore-card"]) {
      const cardExportBtn = document.createElement("button");
      cardExportBtn.id = "explore-export-card";
      cardExportBtn.type = "button";
      cardExportBtn.textContent = "بطاقة للمشاركة";
      cardExportBtn.addEventListener("click", () => exportSocialCard(word, cardExportBtn));
      container.append(cardExportBtn);
    }
  }

  function renderToday() {
    const word = state.today?.word;
    actionStatus("");
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
    const rawQuery = elements["atlas-search"].value;
    let matches;
    if (globalThis.KalimatVocabulary && typeof globalThis.KalimatVocabulary.rankVocabulary === "function") {
      matches = globalThis.KalimatVocabulary.rankVocabulary(state.vocabulary, rawQuery);
    } else {
      const query = normalize(rawQuery);
      if (!query) {
        matches = [...state.vocabulary];
      } else {
        matches = state.vocabulary.filter((word) => {
          const headword = normalize(word.word);
          const norm = normalize(word.normalized);
          if (headword.includes(query) || norm.includes(query)) return true;
          return [
            word.meaningAr,
            word.meaningEn,
            word.contextAr,
            word.contextEn,
            word.exampleAr,
            word.root,
            word.pattern,
            word.register,
            word.partOfSpeech,
            word.pronunciation,
            ...(Array.isArray(word.topics) ? word.topics : []),
          ].some((field) => normalize(field).includes(query));
        });
      }
    }

    const queryClean = (rawQuery || "").trim();
    if (!queryClean) {
      elements["search-count"].textContent = `${matches.length} كلمة`;
    } else if (matches.length === 0) {
      elements["search-count"].textContent = "لا توجد نتائج محلية. جرّب تهجئة أخرى.";
    } else {
      elements["search-count"].textContent = `${matches.length} نتيجة`;
    }

    elements["search-results"].replaceChildren();
    for (const word of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${word.word} — ${word.meaningAr}`;
      button.addEventListener("click", () => viewWord(word));
      elements["search-results"].append(button);
    }
  }

  function renderOnlineResult(result) {
    const container = elements["explore-card"];
    container.replaceChildren();
    container.hidden = false;

    const badge = document.createElement("span");
    badge.className = "unreviewed-badge";
    badge.textContent = "قاموس خارجي (غير مراجعة)";
    container.append(badge);

    const targetTerm = result.headword || result.query || "";
    const title = document.createElement("h3");
    title.lang = "ar";
    title.textContent = targetTerm;
    container.append(title);

    const definition = document.createElement("p");
    definition.className = "meaning";
    definition.lang = "ar";
    definition.dir = "rtl";
    definition.textContent = result.definitionAr || "";
    container.append(definition);

    const link = document.createElement("a");
    link.className = "online-source-link";
    const safeTarget = encodeURIComponent(targetTerm);
    link.href = `https://ar.wiktionary.org/wiki/${safeTarget}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "عرض في ويكاموس العربي";
    container.append(link);

    const attribution = document.createElement("p");
    attribution.className = "online-attribution";
    attribution.textContent = "المصدر: ويكاموس العربي — CC BY-SA 4.0 / GFDL";
    container.append(attribution);

    const retrieved = document.createElement("p");
    retrieved.className = "online-retrieved";
    retrieved.textContent = `وقت الاسترجاع: ${result.retrievedAt}`;
    container.append(retrieved);

    show("explore");
  }

  async function lookupOnline(queryOverride, triggeringButton) {
    const btn = triggeringButton || elements["explore-lookup"];
    const query = (typeof queryOverride === "string" && queryOverride.trim())
      ? queryOverride.trim()
      : (elements["atlas-search"]?.value?.trim() || state.today?.word?.word);
    if (!query) {
      return status("أدخل كلمة للبحث عنها.");
    }

    if (btn) {
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
    }
    status("جاري البحث في القاموس…");

    try {
      // Chrome-only permission request
      const isChrome = typeof globalThis.chrome !== "undefined" && typeof globalThis.browser === "undefined";
      if (isChrome && globalThis.chrome.permissions?.request) {
        let granted = false;
        try {
          granted = await globalThis.chrome.permissions.request({ origins: ["https://ar.wiktionary.org/*"] });
        } catch (_) {}
        if (granted !== true) {
          status("يلزم إذن للبحث في القاموس عبر الإنترنت.");
          return;
        }
      }

      const result = await ExtApi.runtime.sendMessage({ type: "online.lookup", query });
      if (result?.kind === "online-result") {
        renderOnlineResult(result);
        status("تم العثور على المعنى في القاموس.");
      } else if (result?.kind === "permission-needed") {
        status("يلزم إذن للبحث في القاموس عبر الإنترنت.");
      } else if (result?.kind === "unsupported") {
        status("البحث عبر الإنترنت غير مدعوم في هذا المتصفح.");
      } else if (result?.kind === "not-found") {
        status("لم نجد الكلمة في القاموس عبر الإنترنت.");
      } else {
        status("تعذّر الاتصال بالقاموس عبر الإنترنت.");
      }
    } catch (_) {
      status("تعذّر الاتصال بالقاموس عبر الإنترنت.");
    } finally {
      if (btn) {
        btn.setAttribute("aria-busy", "false");
        btn.disabled = false;
        btn.focus();
      }
    }
  }

  function renderHistory() {
    const filter = elements["history-filter"].value;
    const wordStates = state.profile?.wordStates ?? {};
    const entries = Object.entries(state.profile?.assignments ?? {})
      .sort(([left], [right]) => right.localeCompare(left))
      .filter(([, assignment]) => filter !== "difficult" || (assignment.status ?? wordStates[assignment.wordId]?.status) === "difficult")
      .filter(([, assignment]) => filter !== "saved" || wordStates[assignment.wordId]?.saved === true);

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
    if (!elements["history-list"].childElementCount) {
      elements["history-list"].textContent = "لا توجد كلمات في هذا العرض.";
    }
  }

  function selectedInterests() {
    return [...document.querySelectorAll('input[name="atlas-interest"]:checked')].map((input) => input.value);
  }

  function hydrateSettings() {
    const profile = state.profile ?? {};
    const level = document.querySelector(`input[name="atlas-level"][value="${profile.level ?? 1}"]`);
    if (level) level.checked = true;
    for (const input of document.querySelectorAll('input[name="atlas-interest"]')) {
      input.checked = profile.interests?.includes(input.value) === true;
    }
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
    const result = await ExtApi.runtime.sendMessage({
      type: "settings.update",
      level,
      interests,
      showEnglish: elements["settings-english"].checked,
    });
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

  function updateStreakBadge(optionalTodayKey) {
    const badge = elements?.["streak-badge"];
    if (!badge) return;
    const assignments = state.profile?.assignments ?? state.profile;
    const todayKey = optionalTodayKey || state.today?.dateKey || (globalThis.KalimatDate?.todayDateKey ? globalThis.KalimatDate.todayDateKey() : new Date().toISOString().slice(0, 10));
    const streak = globalThis.KalimatStreak?.calculateStreak
      ? globalThis.KalimatStreak.calculateStreak(assignments, todayKey)
      : { currentStreak: 0 };
    const text = globalThis.KalimatStreak?.formatStreakText
      ? globalThis.KalimatStreak.formatStreakText(streak.currentStreak)
      : (streak.currentStreak === 1 ? "يوم واحد" : `${streak.currentStreak} أيام`);
    const digits = globalThis.KalimatStreak?.toArabicDigits
      ? globalThis.KalimatStreak.toArabicDigits(text)
      : text;
    badge.textContent = `🔥 ${digits}`;
  }

  function download(text, name, mimeType = "application/json") {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportAnkiCSV() {
    status("جارٍ تصدير بطاقات Anki…");
    try {
      const words = state.vocabulary && state.vocabulary.length > 0 ? state.vocabulary : (state.today?.word ? [state.today.word] : []);
      const history = state.profile || (state.today?.word ? [state.today.word] : []);
      const csv = globalThis.KalimatExport?.serializeAnkiCSV
        ? globalThis.KalimatExport.serializeAnkiCSV(history, words)
        : null;
      if (!csv) throw new Error("CSV export failed.");
      download(csv, "kalimat-anki-deck.csv", "text/csv;charset=utf-8;");
      status("تم تصدير بطاقات Anki بنجاح.");
    } catch (_) {
      status("تعذّر تصدير بطاقات Anki.");
    }
  }

  async function exportSocialCard(wordToExport, triggeringButton) {
    const word = wordToExport || state.today?.word;
    if (!word) return status("لا توجد كلمة لتوليد البطاقة.");
    const btn = triggeringButton;
    if (btn) {
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
    }
    status("جارٍ توليد بطاقة المشاركة…");
    try {
      if (globalThis.KalimatExport?.renderSocialCard) {
        await globalThis.KalimatExport.renderSocialCard(word, { download: true });
        status("تم توليد بطاقة المشاركة.");
      } else {
        throw new Error("Export unavailable");
      }
    } catch (_) {
      status("تعذّر توليد بطاقة المشاركة.");
    } finally {
      if (btn) {
        btn.setAttribute("aria-busy", "false");
        btn.disabled = false;
        btn.focus();
      }
    }
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
    const btn = elements[statusName === "known" ? "today-known" : "today-difficult"];
    const feedbackButtons = [elements["today-known"], elements["today-difficult"]];
    if (feedbackButtons.some((feedbackButton) => feedbackButton.disabled)) return;
    let restoreFocus = true;
    feedbackButtons.forEach((feedbackButton) => { feedbackButton.setAttribute("aria-busy", "true"); feedbackButton.disabled = true; });
    actionStatus("جارٍ حفظ تقييمك…");
    try {
      const result = await ExtApi.runtime.sendMessage({
        type: "word.feedback",
        dateKey: state.today.dateKey,
        wordId: state.today.word.id,
        status: statusName,
      });
      if (result?.kind === "recovery") { restoreFocus = false; return renderRecovery(result.recoveryRaw); }
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
      updateStreakBadge();
      status("تم حفظ تقييمك.");
      actionStatus("تم حفظ تقييمك.");
    } catch (_) {
      status("تعذّر حفظ التقييم.");
      actionStatus("تعذّر حفظ التقييم.", true);
    } finally {
      feedbackButtons.forEach((feedbackButton) => { feedbackButton.setAttribute("aria-busy", "false"); feedbackButton.disabled = false; });
      if (restoreFocus) btn.focus();
    }
  }

  async function toggleSave() {
    if (!state.today?.word) return;
    const current = state.profile?.wordStates?.[state.today.word.id]?.saved === true;
    const btn = elements["today-save"];
    if (btn?.disabled) return;
    if (btn) {
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
    }
    actionStatus("جارٍ تحديث الحفظ…");
    try {
      const result = await ExtApi.runtime.sendMessage({
        type: "word.save",
        wordId: state.today.word.id,
        saved: !current,
      });
      if (result?.kind === "recovery") return renderRecovery(result.recoveryRaw);
      if (result?.kind !== "ok") throw new Error("Save unchanged.");
      warning(result.storageWarning === true || state.reminderWarning);
      const saved = typeof result.saved === "boolean" ? result.saved : !current;
      const wordId = result.wordId ?? state.today.word.id;
      state.profile.wordStates ??= {};
      state.profile.wordStates[wordId] = { ...state.profile.wordStates[wordId], saved };
      renderToday();
      updateStreakBadge();
      status(saved ? "حُفظت الكلمة." : "أزيل الحفظ.");
      actionStatus(saved ? "حُفظت الكلمة." : "أزيل الحفظ.");
    } catch (_) {
      status("تعذّر الحفظ.");
      actionStatus("تعذّر الحفظ.", true);
    } finally {
      if (btn) {
        btn.setAttribute("aria-busy", "false");
        btn.disabled = false;
        btn.focus();
      }
    }
  }

  async function loadAssignment(dateKey) {
    const result = await ExtApi.runtime.sendMessage({ type: "assignment.get", dateKey });
    if (result?.kind === "recovery") return renderRecovery(result.recoveryRaw);
    if (result?.kind !== "assigned") {
      show("empty");
      return status("لا توجد كلمة محفوظة لهذا التاريخ.");
    }
    const word = wordById(result.wordId);
    if (!word) {
      show("error");
      return status("الكلمة غير متاحة.");
    }
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
    const params = new URLSearchParams(globalThis.location.search);
    const query = params.get("date");
    const dateKey = globalThis.KalimatDate.isDateKey(query) ? query : undefined;
    const requestedView = params.get("view");
    const requestedQuery = params.get("q") ?? "";
    const exploreRequested = !params.has("date")
      && requestedView === "explore"
      && requestedQuery.length <= 256
      && !/[\u0000-\u001F\u007F]/.test(requestedQuery);
    const assignmentRequest = dateKey ? { type: "assignment.get", dateKey } : { type: "assignment.get" };
    const [assignment, exported, settings] = await Promise.all([
      ExtApi.runtime.sendMessage(assignmentRequest),
      ExtApi.runtime.sendMessage({ type: "state.export" }),
      ExtApi.runtime.sendMessage({ type: "settings.get" }),
    ]);
    if (assignment?.kind === "recovery" || exported?.kind === "recovery") {
      return renderRecovery(assignment?.recoveryRaw ?? exported?.recoveryRaw);
    }
    if (exported?.kind !== "export") throw new Error("Profile unavailable.");
    state.profile = JSON.parse(exported.text);
    state.reminder = settings?.reminder ?? state.reminder;
    state.reminderWarning = settings?.storageWarning === true;
    state.recoveryRaw = null;
    warning(exported.storageWarning === true || assignment.storageWarning === true || state.reminderWarning);
    hydrateSettings();
    updateStreakBadge(assignment?.dateKey);
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
        if (exploreRequested) {
          elements["atlas-search"].value = requestedQuery;
          search();
          show("explore");
          elements["atlas-search"].focus();
        } else {
          show("today");
        }
      }
    } else if (exploreRequested) {
      elements["atlas-search"].value = requestedQuery;
      search();
      show("explore");
      elements["atlas-search"].focus();
    } else {
      show("empty");
      status(dateKey ? "لا توجد كلمة محفوظة لهذا التاريخ." : "لا توجد كلمة جديدة اليوم.");
    }
  }

  let reviewQueue = [];
  let currentReviewIndex = 0;

  function speak(text) {
    if (!text || !globalThis.speechSynthesis || typeof globalThis.SpeechSynthesisUtterance !== "function") return;
    const cleanWord = String(text).replace(/[\u200B-\u200F\uFEFF\u0640]/g, "").trim();
    if (!cleanWord) return;

    const utterance = new SpeechSynthesisUtterance(cleanWord);
    utterance.lang = "ar-SA";
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    globalThis._activeUtterance = utterance;
    utterance.onend = () => {
      if (globalThis._activeUtterance === utterance) globalThis._activeUtterance = null;
    };
    utterance.onerror = () => {
      if (globalThis._activeUtterance === utterance) globalThis._activeUtterance = null;
    };

    const availableVoices = typeof globalThis.speechSynthesis.getVoices === "function"
      ? (globalThis.speechSynthesis.getVoices() || [])
      : [];
    const arabicVoice = availableVoices.find((v) => {
      const l = (v.lang || "").toLowerCase();
      const n = (v.name || "").toLowerCase();
      return (l === "ar-sa" || l.startsWith("ar")) && (n.includes("natural") || n.includes("neural") || n.includes("online") || n.includes("siri") || n.includes("enhanced"));
    }) || availableVoices.find((v) => (v.lang || "").toLowerCase().startsWith("ar"));

    if (arabicVoice) {
      utterance.voice = arabicVoice;
      utterance.lang = arabicVoice.lang || "ar-SA";
    }

    try {
      globalThis.speechSynthesis.cancel();
      globalThis.speechSynthesis.speak(utterance);
    } catch (_) {}
  }

  async function loadDueReviews() {
    try {
      const res = await ExtApi.runtime.sendMessage({ type: "review.queue" });
      if (res && res.kind === "queue") {
        reviewQueue = Array.isArray(res.words) ? res.words : [];
        const count = typeof res.dueCount === "number" ? res.dueCount : reviewQueue.length;
        if (elements["due-review-badge"]) {
          if (count > 0) {
            elements["due-review-badge"].hidden = false;
            elements["due-review-badge"].textContent = `${count} مستحقة`;
          } else {
            elements["due-review-badge"].hidden = true;
          }
        }
      }
    } catch (_) {}
  }

  function openPracticeModal() {
    if (!elements["practice-dialog"]) return;
    if (reviewQueue.length === 0) {
      loadDueReviews().then(() => {
        if (reviewQueue.length === 0) {
          showPracticeFinished();
        } else {
          currentReviewIndex = 0;
          showPracticeCard(currentReviewIndex);
        }
        if (typeof elements["practice-dialog"].showModal === "function") {
          elements["practice-dialog"].showModal();
        } else {
          elements["practice-dialog"].setAttribute("open", "");
        }
      });
      return;
    }
    currentReviewIndex = 0;
    showPracticeCard(currentReviewIndex);
    if (typeof elements["practice-dialog"].showModal === "function") {
      elements["practice-dialog"].showModal();
    } else {
      elements["practice-dialog"].setAttribute("open", "");
    }
  }

  function closePracticeModal() {
    if (!elements["practice-dialog"]) return;
    if (typeof elements["practice-dialog"].close === "function") {
      elements["practice-dialog"].close();
    } else {
      elements["practice-dialog"].removeAttribute("open");
    }
    loadDueReviews();
  }

  function showPracticeCard(index) {
    if (index < 0 || index >= reviewQueue.length) {
      showPracticeFinished();
      return;
    }
    if (elements["practice-body"]) elements["practice-body"].hidden = false;
    if (elements["practice-finished"]) elements["practice-finished"].hidden = true;

    const item = reviewQueue[index];
    const word = item.word || item;

    if (elements["flashcard-card"]) elements["flashcard-card"].classList.remove("flipped");
    if (elements["practice-progress"]) {
      elements["practice-progress"].textContent = `${index + 1} / ${reviewQueue.length}`;
    }
    if (elements["card-front-word"]) elements["card-front-word"].textContent = word.word || "";
    if (elements["card-front-vocalization"]) elements["card-front-vocalization"].textContent = word.vocalization || word.pronunciation || "";
    if (elements["card-front-weight"]) elements["card-front-weight"].textContent = word.sarfWeight || word.weight || "";
    if (elements["card-front-root"]) elements["card-front-root"].textContent = word.root ? `الجذر: ${word.root}` : "";
    if (elements["card-back-meaning-ar"]) elements["card-back-meaning-ar"].textContent = word.meaningAr || word.meaning || "";
    if (elements["card-back-meaning-en"]) {
      elements["card-back-meaning-en"].textContent = word.meaningEn || word.englishMeaning || "";
      elements["card-back-meaning-en"].hidden = state.profile?.showEnglish === false || !elements["card-back-meaning-en"].textContent;
    }
    if (elements["card-back-example-ar"]) elements["card-back-example-ar"].textContent = word.contextAr || word.exampleAr || "";
    if (elements["card-back-context"]) elements["card-back-context"].textContent = word.literaryAr || word.example || "";
  }

  function showPracticeFinished() {
    if (elements["practice-body"]) elements["practice-body"].hidden = true;
    if (elements["practice-finished"]) elements["practice-finished"].hidden = false;
    if (elements["due-review-badge"]) elements["due-review-badge"].hidden = true;
  }

  function flipCard() {
    if (elements["flashcard-card"]) {
      elements["flashcard-card"].classList.toggle("flipped");
    }
  }

  async function submitRating(rating) {
    if (currentReviewIndex >= reviewQueue.length) return;
    const currentItem = reviewQueue[currentReviewIndex];
    const wordId = currentItem.word?.id ?? currentItem.wordId ?? currentItem.id;
    try {
      await ExtApi.runtime.sendMessage({
        type: "word.review",
        wordId,
        rating,
        dateKey: state.today?.dateKey,
      });
    } catch (_) {}
    currentReviewIndex++;
    if (currentReviewIndex < reviewQueue.length) {
      showPracticeCard(currentReviewIndex);
    } else {
      showPracticeFinished();
    }
  }

  function handleKeyDown(event) {
    const isDialogOpen = elements["practice-dialog"] && (elements["practice-dialog"].open || elements["practice-dialog"].hasAttribute("open"));
    if (isDialogOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePracticeModal();
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        const targetTag = (event.target?.tagName || "").toLowerCase();
        if (targetTag !== "button") {
          event.preventDefault();
          flipCard();
          return;
        }
      }
      if (event.key === "1" || event.key === "١") {
        event.preventDefault();
        submitRating("again");
        return;
      }
      if (event.key === "2" || event.key === "٢") {
        event.preventDefault();
        submitRating("hard");
        return;
      }
      if (event.key === "3" || event.key === "٣") {
        event.preventDefault();
        submitRating("good");
        return;
      }
      if (event.key === "4" || event.key === "٤") {
        event.preventDefault();
        submitRating("easy");
        return;
      }
    } else {
      const targetTag = (event.target?.tagName || "").toLowerCase();
      if (targetTag !== "input" && targetTag !== "textarea" && targetTag !== "select") {
        if (event.key === "p" || event.key === "P" || event.key === "ح") {
          event.preventDefault();
          openPracticeModal();
        }
      }
    }
  }

  function listen() {
    elements.today.addEventListener("click", () => { show("today"); renderToday(); });
    elements.explore.addEventListener("click", () => { show("explore"); search(); });
    elements.history.addEventListener("click", () => { show("history"); renderHistory(); });
    elements.settings.addEventListener("click", () => { show("settings"); hydrateSettings(); });
    elements["atlas-search"].addEventListener("input", search);
    if (elements["explore-lookup"]) {
      elements["explore-lookup"].hidden = Boolean(globalThis.browser);
      if (!globalThis.browser) elements["explore-lookup"].addEventListener("click", () => lookupOnline(null, elements["explore-lookup"]));
    }
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
    if (elements["history-export-anki"]) elements["history-export-anki"].addEventListener("click", () => exportAnkiCSV());
    if (elements["btn-export-anki"]) elements["btn-export-anki"].addEventListener("click", () => exportAnkiCSV());
    if (elements["today-export-card"]) elements["today-export-card"].addEventListener("click", () => exportSocialCard(state.today?.word, elements["today-export-card"]));
    elements["import-file"].addEventListener("change", () => importState(elements["import-file"]));
    elements.clear.addEventListener("click", () => clearState().catch(() => status("تعذّر مسح البيانات.")));
    elements["recovery-export"].addEventListener("click", () => exportState().catch(() => status("تعذّر التصدير.")));
    elements["recovery-import"].addEventListener("change", () => importState(elements["recovery-import"]));
    elements["recovery-clear"].addEventListener("click", () => clearState().catch(() => status("تعذّر مسح البيانات.")));
    elements["onboarding-settings"].addEventListener("click", () => show("settings"));
    elements["today-known"].addEventListener("click", () => feedback("known").catch(() => status("تعذّر حفظ التقييم.")));
    elements["today-difficult"].addEventListener("click", () => feedback("difficult").catch(() => status("تعذّر حفظ التقييم.")));
    elements["today-save"].addEventListener("click", () => toggleSave().catch(() => status("تعذّر الحفظ.")));

    if (elements["due-review-badge"]) elements["due-review-badge"].addEventListener("click", openPracticeModal);
    if (elements["practice-close"]) elements["practice-close"].addEventListener("click", closePracticeModal);
    if (elements["practice-finish-btn"]) elements["practice-finish-btn"].addEventListener("click", closePracticeModal);
    if (elements["flashcard-card"]) elements["flashcard-card"].addEventListener("click", flipCard);
    if (elements["card-front-speak"]) {
      elements["card-front-speak"].addEventListener("click", (e) => {
        e.stopPropagation();
        const currentItem = reviewQueue[currentReviewIndex];
        const w = currentItem?.word || currentItem;
        if (w?.word) speak(w.word);
      });
    }
    if (elements["rate-again"]) elements["rate-again"].addEventListener("click", () => submitRating("again"));
    if (elements["rate-hard"]) elements["rate-hard"].addEventListener("click", () => submitRating("hard"));
    if (elements["rate-good"]) elements["rate-good"].addEventListener("click", () => submitRating("good"));
    if (elements["rate-easy"]) elements["rate-easy"].addEventListener("click", () => submitRating("easy"));

    document.addEventListener("keydown", handleKeyDown);
  }

  let themeController = null;

  async function initialize() {
    elements = collect();
    if (globalThis.KalimatTheme?.initThemeController) {
      themeController = globalThis.KalimatTheme.initThemeController({
        storageArea: ExtApi?.storage?.local,
        targetDoc: document,
        selectElement: elements["theme-select"],
      });
    }
    listen();
    try {
      await load();
    } catch (_) { renderError(); }
  }

  globalThis.KalimatAtlas = {
    canonicalSearchKey,
    normalize,
    load,
    initialize,
    loadAssignment,
    renderHistory,
    search,
    viewWord,
    saveSettings,
    clearState,
    importState,
    returnToToday,
    feedback,
    toggleSave,
    configureReminder,
    saveReminderTime,
    lookupOnline,
    exportAnkiCSV,
    exportSocialCard,
    updateStreakBadge,
    loadDueReviews,
    openPracticeModal,
    closePracticeModal,
    flipCard,
    submitRating,
    speak,
    getThemeController: () => themeController,
    getReminder: () => ({ ...state.reminder }),
    getRecoveryRaw: () => state.recoveryRaw,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
