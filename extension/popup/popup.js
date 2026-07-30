(() => {
  "use strict";

  const ExtApi = globalThis.browser ?? globalThis.chrome;
  const byId = (id) => document.getElementById(id);
  const state = { word: null, dateKey: null };
  let elements;

  function show(name) {
    for (const section of ["onboarding", "assigned", "empty", "recovery"]) elements[section].hidden = section !== name;
  }

  function status(message) {
    elements.status.textContent = message;
  }

  function warning(visible) {
    elements.warning.hidden = !visible;
  }

  function collectElements() {
    return {
      onboarding: byId("onboarding"), assigned: byId("assigned"), empty: byId("empty"), recovery: byId("recovery"), warning: byId("warning"), status: byId("status"),
      word: byId("word"), meaningAr: byId("meaning-ar"), meaningEn: byId("meaning-en"), example: byId("example"), pronunciation: byId("pronunciation"),
      known: byId("known"), difficult: byId("difficult"), save: byId("save"), speak: byId("speak"), reminder: byId("reminder"), reminderTime: byId("reminder-time"), onboardingSubmit: byId("onboarding-submit"),
      interests: document.querySelectorAll('input[name="interest"]'), levels: document.querySelectorAll('input[name="level"]'),
    };
  }

  function renderAssigned(result) {
    elements ??= collectElements();
    const word = result.word;
    state.word = word;
    state.dateKey = result.dateKey;
    elements.word.textContent = word.word;
    elements.meaningAr.textContent = word.meaningAr;
    elements.meaningEn.textContent = word.meaningEn ?? "";
    elements.meaningEn.hidden = !word.meaningEn;
    elements.example.textContent = word.exampleAr;
    elements.pronunciation.textContent = word.pronunciation;
    elements.known.setAttribute("aria-pressed", "false");
    elements.difficult.setAttribute("aria-pressed", "false");
    elements.save.setAttribute("aria-pressed", "false");
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
    status("نحضّر كلمتك…");
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
      status("تعذّر تحميل الكلمة. افتح النافذة مجددًا.");
    }
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
    const enabled = elements.reminder.getAttribute("aria-pressed") !== "true";
    const time = elements.reminderTime.value || "09:00";
    if (!enabled) return ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled: false, time }).then(() => {
      elements.reminder.setAttribute("aria-pressed", "false");
      elements.reminder.textContent = "فعّل";
      status("أوقفنا التذكير اليومي.");
    });
    const permission = ExtApi.permissions.request({ permissions: ["alarms", "notifications"] });
    return Promise.resolve(permission).then((granted) => {
      if (!granted) throw new Error("Permission denied.");
      return ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled: true, time });
    }).then(() => {
      elements.reminder.setAttribute("aria-pressed", "true");
      elements.reminder.textContent = "أوقف";
      status(`سيصلك تذكير يومي في ${time}.`);
    }, () => status("لم نفعّل التذكير."));
  }

  async function resetRecovery() {
    try {
      await ExtApi.runtime.sendMessage({ type: "state.clear" });
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
    byId("explore").addEventListener("click", openAtlas);
    byId("explore-empty").addEventListener("click", openAtlas);
    byId("recovery-reset").addEventListener("click", resetRecovery);
    elements.speak.disabled = !globalThis.speechSynthesis || typeof globalThis.SpeechSynthesisUtterance !== "function";
    try {
      const stored = await ExtApi.storage.local.get("kalimat.profile");
      if (stored["kalimat.profile"] === undefined) {
        show("onboarding");
        return status("اختر ما يناسبك.");
      }
    } catch (_) { warning(true); }
    await loadAssignment();
  }

  globalThis.KalimatPopup = { renderAssigned, limitInterests, requestReminder, toggleSave, completeOnboarding, sendFeedback };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
