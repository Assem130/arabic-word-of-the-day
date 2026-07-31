(() => {
  "use strict";

  const ExtApi = globalThis.browser ?? globalThis.chrome;
  const byId = (id) => document.getElementById(id);
  const state = { word: null, dateKey: null, showEnglish: true, reminder: null, reminderError: "", reminderBusy: false, speakAvailable: false };
  let elements;

  function show(name) {
    for (const section of ["onboarding", "assigned", "empty", "error", "recovery"]) elements[section].hidden = section !== name;
    const heading = elements[`${name}Title`];
    if (heading) heading.focus();
    const active = name === "assigned";
    for (const control of [elements.known, elements.difficult, elements.save, elements.explore]) if (control) control.disabled = !active;
    if (elements.speak) elements.speak.disabled = !active || !state.speakAvailable;
    if (elements.reminder) elements.reminder.disabled = !active || state.reminderError !== "";
    if (elements.reminderTime) elements.reminderTime.disabled = !active || state.reminderError !== "";
  }

  function status(message) {
    elements.status.textContent = message;
  }

  function warning(visible) {
    elements.warning.hidden = !visible;
  }

  function renderReminder(reminder) {
    if (!reminder || typeof reminder.enabled !== "boolean" || !/^\d{2}:\d{2}$/.test(reminder.time)) return false;
    state.reminderError = "";
    state.reminder = { enabled: reminder.enabled, time: reminder.time };
    elements.reminderTime.value = reminder.time;
    elements.reminderTime.disabled = false;
    elements.reminder.disabled = false;
    elements.reminder.setAttribute("aria-pressed", String(reminder.enabled));
    elements.reminder.setAttribute("aria-label", reminder.enabled ? "إيقاف التذكير اليومي" : "تفعيل التذكير اليومي");
    return true;
  }

  async function loadReminder() {
    try {
      const settings = await ExtApi.runtime.sendMessage({ type: "settings.get" });
      if (!settings || settings.kind !== "settings" || !renderReminder(settings.reminder)) throw new Error("Invalid settings.");
    } catch (_) {
      state.reminder = null;
      state.reminderError = "تعذّر تحميل إعدادات التذكير.";
      elements.reminderTime.value = "";
      elements.reminderTime.disabled = true;
      elements.reminder.disabled = true;
      elements.reminder.setAttribute("aria-pressed", "false");
      elements.reminder.setAttribute("aria-label", "التذكير غير متاح");
      status(state.reminderError);
    }
  }

  function collectElements() {
    return {
      onboarding: byId("onboarding"), assigned: byId("assigned"), empty: byId("empty"), error: byId("error"), recovery: byId("recovery"), warning: byId("warning"), status: byId("status"),
      onboardingTitle: byId("onboarding-title"), emptyTitle: byId("empty-title"), errorTitle: byId("error-title"), recoveryTitle: byId("recovery-title"),
      word: byId("word"), meaningAr: byId("meaning-ar"), meaningEn: byId("meaning-en"), example: byId("example"), pronunciation: byId("pronunciation"),
      known: byId("known"), difficult: byId("difficult"), save: byId("save"), speak: byId("speak"), explore: byId("explore"), reminder: byId("reminder"), reminderTime: byId("reminder-time"), onboardingSubmit: byId("onboarding-submit"),
      interests: document.querySelectorAll('input[name="interest"]'), levels: document.querySelectorAll('input[name="level"]'),
    };
  }

  function renderAssigned(result) {
    elements ??= collectElements();
    const word = result.word;
    state.word = word;
    state.dateKey = result.dateKey;
    state.showEnglish = result.showEnglish !== false;
    elements.word.textContent = word.word;
    elements.meaningAr.textContent = word.meaningAr;
    elements.meaningEn.textContent = word.meaningEn ?? "";
    elements.meaningEn.hidden = !state.showEnglish || !word.meaningEn;
    elements.example.textContent = word.exampleAr;
    elements.pronunciation.textContent = word.pronunciation;
    elements.known.setAttribute("aria-pressed", String(result.status === "known"));
    elements.difficult.setAttribute("aria-pressed", String(result.status === "difficult"));
    elements.save.setAttribute("aria-pressed", String(result.saved === true));
    show("assigned");
    elements.word.focus();
    status("كلمتك جاهزة.");
  }

  function limitInterests(event) {
    elements ??= collectElements();
    const chosen = [...elements.interests].filter((input) => input.checked);
    if (chosen.length > 3) event.target.checked = false;
  }

  async function completeOnboarding(skip = false) {
    const level = skip ? 1 : Number([...elements.levels].find((input) => input.checked)?.value ?? 1);
    const interests = skip ? [] : [...elements.interests].filter((input) => input.checked).map((input) => input.value);
    elements.onboardingSubmit.disabled = true;
    try {
      const result = await ExtApi.runtime.sendMessage({ type: "onboarding.complete", level, interests });
      if (result.kind === "recovery") return renderRecovery();
      warning(result.storageWarning === true);
      await loadAssignment();
    } catch (_) {
      status("تعذّر حفظ اختياراتك. حاول مرة أخرى.");
    } finally {
      elements.onboardingSubmit.disabled = false;
    }
  }

  async function assignedWord(result) {
    if (result.word) return result;
    const response = await fetch(ExtApi.runtime.getURL("data/vocabulary.json"));
    if (!response.ok) throw new Error("Vocabulary unavailable.");
    const word = (await response.json()).find((item) => item.id === result.wordId);
    if (!word) throw new Error("Assigned word unavailable.");
    return { ...result, word };
  }

  async function loadAssignment() {
    if (!state.reminderError) status("نحضّر كلمتك…");
    try {
      const result = await ExtApi.runtime.sendMessage({ type: "assignment.get" });
      if (result.kind === "recovery") return renderRecovery();
      warning(result.storageWarning === true);
      if (result.kind === "no-new-word") {
        show("empty");
        return status("");
      }
      renderAssigned(await assignedWord(result));
    } catch (_) {
      show("error");
      if (!state.reminderError) status("تعذّر تحميل الكلمة. افتح النافذة مجددًا.");
    } finally { if (state.reminderError) status(state.reminderError); }
  }

  function renderRecovery() {
    warning(false);
    show("recovery");
    status("");
  }

  async function sendFeedback(statusName, button) {
    if (!state.word) return;
    try {
      const result = await ExtApi.runtime.sendMessage({ type: "word.feedback", dateKey: state.dateKey, wordId: state.word.id, status: statusName });
      if (result?.kind === "recovery") return renderRecovery();
      if (result?.kind !== "ok") throw new Error("Feedback unchanged.");
      elements.known.setAttribute("aria-pressed", String(statusName === "known"));
      elements.difficult.setAttribute("aria-pressed", String(statusName === "difficult"));
      warning(result.storageWarning === true);
      button.focus();
      status("تم حفظ تقييمك.");
    } catch (_) { status("تعذّر حفظ تقييمك."); }
  }

  async function toggleSave() {
    if (!state.word) return;
    const saved = elements.save.getAttribute("aria-pressed") !== "true";
    try {
      const result = await ExtApi.runtime.sendMessage({ type: "word.save", wordId: state.word.id, saved });
      if (result?.kind === "recovery") return renderRecovery();
      if (result?.kind !== "ok") throw new Error("Save unchanged.");
      elements.save.setAttribute("aria-pressed", String(saved));
      warning(result.storageWarning === true);
      status(saved ? "حُفظت الكلمة." : "أزيل الحفظ.");
    } catch (_) { status("تعذّر تغيير الحفظ."); }
  }

  function speak() {
    if (!state.word || !globalThis.speechSynthesis || typeof globalThis.SpeechSynthesisUtterance !== "function") return;
    const utterance = new SpeechSynthesisUtterance(state.word.word);
    utterance.lang = "ar";
    globalThis.speechSynthesis.cancel();
    globalThis.speechSynthesis.speak(utterance);
  }

  function openAtlas() {
    return ExtApi.tabs.create({ url: ExtApi.runtime.getURL("atlas/atlas.html") });
  }

  function requestReminder() {
    if (state.reminderError || state.reminderBusy) return Promise.resolve();
    const previous = state.reminder ? { ...state.reminder } : { enabled: elements.reminder.getAttribute("aria-pressed") === "true", time: elements.reminderTime.value || "09:00" };
    const enabled = !previous.enabled;
    const time = elements.reminderTime.value || "09:00";
    state.reminderBusy = true;
    elements.reminder.disabled = true;
    const permission = enabled ? Promise.resolve(ExtApi.permissions.request({ permissions: ["alarms", "notifications"] })).then((granted) => { if (!granted) throw new Error("Permission denied."); }) : Promise.resolve();
    return permission.then(() => ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled, time })).then((reminder) => {
      if (!renderReminder(reminder) || reminder.enabled !== enabled) throw new Error("Reminder unchanged.");
      warning(reminder.storageWarning === true);
      status(enabled ? `سيصلك تذكير يومي في ${reminder.time}.` : "أوقفنا التذكير اليومي.");
    }).catch(() => {
      renderReminder(previous);
      status(enabled ? "لم نفعّل التذكير." : "تعذّر إيقاف التذكير.");
    }).finally(() => { state.reminderBusy = false; });
  }

  function updateReminderTime() {
    if (state.reminderError || state.reminderBusy || !state.reminder) return Promise.resolve();
    const previous = { ...state.reminder };
    const time = elements.reminderTime.value;
    state.reminderBusy = true;
    elements.reminderTime.disabled = true;
    return ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled: previous.enabled, time }).then((reminder) => {
      if (!renderReminder(reminder) || reminder.enabled !== previous.enabled) throw new Error("Reminder unchanged.");
      warning(reminder.storageWarning === true);
    }).catch(() => {
      renderReminder(previous);
      status("تعذّر حفظ وقت التذكير.");
    }).finally(() => { state.reminderBusy = false; });
  }

  async function resetRecovery() {
    try {
      const result = await ExtApi.runtime.sendMessage({ type: "state.clear" });
      if (!result || result.kind !== "ok") throw new Error("Clear failed.");
      warning(result.storageWarning === true);
      show("onboarding");
      status("اختر ما يناسبك للبدء من جديد.");
    } catch (_) { status("تعذّرت إعادة البدء."); }
  }

  async function initialize() {
    elements = collectElements();
    elements.interests.forEach((input) => input.addEventListener("change", limitInterests));
    byId("onboarding-submit").addEventListener("click", () => completeOnboarding());
    byId("onboarding-skip").addEventListener("click", () => completeOnboarding(true));
    elements.known.addEventListener("click", () => sendFeedback("known", elements.known));
    elements.difficult.addEventListener("click", () => sendFeedback("difficult", elements.difficult));
    elements.save.addEventListener("click", toggleSave);
    elements.speak.addEventListener("click", speak);
    elements.reminder.addEventListener("click", requestReminder);
    elements.reminderTime.addEventListener("change", updateReminderTime);
    byId("explore").addEventListener("click", openAtlas);
    byId("explore-empty").addEventListener("click", openAtlas);
    byId("recovery-reset").addEventListener("click", resetRecovery);
    state.speakAvailable = !!globalThis.speechSynthesis && typeof globalThis.SpeechSynthesisUtterance === "function";
    elements.speak.disabled = !state.speakAvailable;
    await loadReminder();
    try {
      const stored = await ExtApi.storage.local.get("kalimat.profile");
      if (stored["kalimat.profile"] === undefined) {
        show("onboarding");
        return status(state.reminderError || "اختر ما يناسبك.");
      }
    } catch (_) { warning(true); }
    await loadAssignment();
  }

  globalThis.KalimatPopup = { renderAssigned, limitInterests, requestReminder, updateReminderTime, toggleSave, completeOnboarding, sendFeedback, initialize };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
