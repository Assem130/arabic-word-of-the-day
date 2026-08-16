(() => {
  "use strict";

  const ExtApi = globalThis.browser ?? globalThis.chrome;
  const byId = (id) => document.getElementById(id);
  const state = {
    word: null,
    dateKey: null,
    profile: null,
    showEnglish: true,
    reminder: null,
    reminderReady: false,
    reminderWarning: false,
    reminderError: "",
    reminderBusy: false,
    speakAvailable: false,
    view: "",
  };
  let elements;
  let reminderQueue = null;
  let themeController = null;
  let reviewQueue = [];
  let currentReviewIndex = 0;

  function show(name) {
    state.view = name;
    for (const section of ["onboarding", "assigned", "empty", "error", "recovery"]) {
      if (elements[section]) elements[section].hidden = section !== name;
    }
    const heading = elements[`${name}Title`];
    if (heading) heading.focus();
    const active = name === "assigned";
    for (const control of [elements.known, elements.difficult, elements.save, elements.explore, elements.btnExportAnki, elements.btnExportCard]) {
      if (control) control.disabled = !active;
    }
    if (elements.speak) elements.speak.disabled = !active || !state.speakAvailable;
    if (elements.reminder) elements.reminder.disabled = !active || !state.reminderReady || state.reminderError !== "";
    if (elements.reminderTime) elements.reminderTime.disabled = !active || !state.reminderReady || state.reminderError !== "";
  }

  function status(message) {
    if (elements.status) elements.status.textContent = message;
  }

  function actionStatus(message, isError = false) {
    const target = elements.actionStatus;
    if (!target) return;
    target.textContent = message;
    target.setAttribute("role", isError ? "alert" : "status");
    target.setAttribute("aria-live", isError ? "assertive" : "polite");
  }

  function warning(visible) {
    if (elements.warning) elements.warning.hidden = !visible;
  }

  function renderReminder(reminder) {
    if (!reminder || typeof reminder.enabled !== "boolean" || !/^\d{2}:\d{2}$/.test(reminder.time)) return false;
    state.reminderReady = true;
    state.reminderError = "";
    state.reminder = { enabled: reminder.enabled, time: reminder.time };
    elements.reminderTime.value = reminder.time;
    elements.reminderTime.disabled = state.view !== "assigned";
    elements.reminder.disabled = state.view !== "assigned";
    elements.reminder.setAttribute("aria-pressed", String(reminder.enabled));
    elements.reminder.setAttribute("aria-label", reminder.enabled ? "إيقاف التذكير اليومي" : "تفعيل التذكير اليومي");
    return true;
  }

  async function loadReminder() {
    try {
      const settings = await ExtApi.runtime.sendMessage({ type: "settings.get" });
      if (!settings || settings.kind !== "settings" || !renderReminder(settings.reminder)) throw new Error("Invalid settings.");
      state.reminderWarning = settings.storageWarning === true;
      warning(state.reminderWarning);
    } catch (_) {
      state.reminderReady = true;
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

  function updateStreak(assignments, todayKey) {
    if (!elements?.streakBadge) return;
    const profileAssignments = assignments ?? state.profile?.assignments ?? state.profile;
    const key = todayKey || state.dateKey || (globalThis.KalimatDate?.todayDateKey ? globalThis.KalimatDate.todayDateKey() : new Date().toISOString().slice(0, 10));
    const streak = globalThis.KalimatStreak?.calculateStreak
      ? globalThis.KalimatStreak.calculateStreak(profileAssignments, key)
      : { currentStreak: 0 };
    const formattedStreak = globalThis.KalimatStreak?.formatStreakText
      ? globalThis.KalimatStreak.formatStreakText(streak.currentStreak)
      : (streak.currentStreak === 1 ? "يوم واحد" : `${streak.currentStreak} أيام`);
    const digits = globalThis.KalimatStreak?.toArabicDigits
      ? globalThis.KalimatStreak.toArabicDigits(formattedStreak)
      : formattedStreak;
    elements.streakBadge.textContent = `🔥 ${digits}`;
  }

  async function loadDueReviews() {
    try {
      const res = await ExtApi.runtime.sendMessage({ type: "review.queue" });
      if (res && res.kind === "queue") {
        reviewQueue = Array.isArray(res.words) ? res.words : [];
        const count = typeof res.dueCount === "number" ? res.dueCount : reviewQueue.length;
        if (elements.dueReviewBadge) {
          if (count > 0) {
            elements.dueReviewBadge.hidden = false;
            elements.dueReviewBadge.textContent = `${count} مستحقة`;
          } else {
            elements.dueReviewBadge.hidden = true;
          }
        }
      }
    } catch (_) {}
  }

  function openPracticeModal() {
    if (!elements.practiceDialog) return;
    if (reviewQueue.length === 0) {
      loadDueReviews().then(() => {
        if (reviewQueue.length === 0) {
          showPracticeFinished();
        } else {
          currentReviewIndex = 0;
          showPracticeCard(currentReviewIndex);
        }
        if (typeof elements.practiceDialog.showModal === "function") {
          elements.practiceDialog.showModal();
        } else {
          elements.practiceDialog.setAttribute("open", "");
        }
      });
      return;
    }
    currentReviewIndex = 0;
    showPracticeCard(currentReviewIndex);
    if (typeof elements.practiceDialog.showModal === "function") {
      elements.practiceDialog.showModal();
    } else {
      elements.practiceDialog.setAttribute("open", "");
    }
  }

  function closePracticeModal() {
    if (!elements.practiceDialog) return;
    if (typeof elements.practiceDialog.close === "function") {
      elements.practiceDialog.close();
    } else {
      elements.practiceDialog.removeAttribute("open");
    }
    loadDueReviews();
  }

  function showPracticeCard(index) {
    if (index < 0 || index >= reviewQueue.length) {
      showPracticeFinished();
      return;
    }
    if (elements.practiceBody) elements.practiceBody.hidden = false;
    if (elements.practiceFinished) elements.practiceFinished.hidden = true;

    const item = reviewQueue[index];
    const word = item.word || item;

    if (elements.flashcardCard) elements.flashcardCard.classList.remove("flipped");
    if (elements.practiceProgress) {
      elements.practiceProgress.textContent = `${index + 1} / ${reviewQueue.length}`;
    }
    if (elements.cardFrontWord) elements.cardFrontWord.textContent = word.word || "";
    if (elements.cardFrontVocalization) elements.cardFrontVocalization.textContent = word.vocalization || word.pronunciation || "";
    if (elements.cardFrontWeight) elements.cardFrontWeight.textContent = word.sarfWeight || word.weight || "";
    if (elements.cardFrontRoot) elements.cardFrontRoot.textContent = word.root ? `الجذر: ${word.root}` : "";
    if (elements.cardBackMeaningAr) elements.cardBackMeaningAr.textContent = word.meaningAr || word.meaning || "";
    if (elements.cardBackMeaningEn) {
      elements.cardBackMeaningEn.textContent = word.meaningEn || word.englishMeaning || "";
      elements.cardBackMeaningEn.hidden = !state.showEnglish || !elements.cardBackMeaningEn.textContent;
    }
    if (elements.cardBackExampleAr) elements.cardBackExampleAr.textContent = word.contextAr || word.exampleAr || "";
    if (elements.cardBackContext) elements.cardBackContext.textContent = word.literaryAr || word.example || "";
  }

  function showPracticeFinished() {
    if (elements.practiceBody) elements.practiceBody.hidden = true;
    if (elements.practiceFinished) elements.practiceFinished.hidden = false;
    if (elements.dueReviewBadge) elements.dueReviewBadge.hidden = true;
  }

  function flipCard() {
    if (elements.flashcardCard) {
      elements.flashcardCard.classList.toggle("flipped");
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
        dateKey: state.dateKey,
      });
    } catch (_) {}
    currentReviewIndex++;
    if (currentReviewIndex < reviewQueue.length) {
      showPracticeCard(currentReviewIndex);
    } else {
      showPracticeFinished();
    }
  }

  function collectElements() {
    return {
      onboarding: byId("onboarding"),
      assigned: byId("assigned"),
      empty: byId("empty"),
      error: byId("error"),
      recovery: byId("recovery"),
      warning: byId("warning"),
      status: byId("status"),
      onboardingTitle: byId("onboarding-title"),
      emptyTitle: byId("empty-title"),
      errorTitle: byId("error-title"),
      recoveryTitle: byId("recovery-title"),
      word: byId("word"),
      meaningAr: byId("meaning-ar"),
      meaningEn: byId("meaning-en"),
      example: byId("example"),
      contextEn: byId("example-en"),
      pronunciation: byId("pronunciation"),
      known: byId("known"),
      difficult: byId("difficult"),
      save: byId("save"),
      speak: byId("speak"),
      explore: byId("explore"),
      reminder: byId("reminder"),
      reminderTime: byId("reminder-time"),
      onboardingSubmit: byId("onboarding-submit"),
      actionStatus: byId("action-status"),
      themeSelect: byId("theme-select"),
      streakBadge: byId("streak-badge"),
      dueReviewBadge: byId("due-review-badge"),
      btnExportAnki: byId("btn-export-anki"),
      btnExportCard: byId("btn-export-card"),
      interests: document.querySelectorAll('input[name="interest"]'),
      levels: document.querySelectorAll('input[name="level"]'),
      practiceDialog: byId("practice-dialog"),
      practiceBody: byId("practice-body"),
      practiceProgress: byId("practice-progress"),
      practiceClose: byId("practice-close"),
      practiceFinished: byId("practice-finished"),
      practiceFinishBtn: byId("practice-finish-btn"),
      flashcardCard: byId("flashcard-card"),
      cardFrontWord: byId("card-front-word"),
      cardFrontVocalization: byId("card-front-vocalization"),
      cardFrontWeight: byId("card-front-weight"),
      cardFrontRoot: byId("card-front-root"),
      cardFrontSpeak: byId("card-front-speak"),
      cardBackMeaningAr: byId("card-back-meaning-ar"),
      cardBackMeaningEn: byId("card-back-meaning-en"),
      cardBackExampleAr: byId("card-back-example-ar"),
      cardBackContext: byId("card-back-context"),
      rateAgain: byId("rate-again"),
      rateHard: byId("rate-hard"),
      rateGood: byId("rate-good"),
      rateEasy: byId("rate-easy"),
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
    elements.example.textContent = word.contextAr || word.exampleAr || "";
    if (elements.contextEn) {
      elements.contextEn.textContent = word.contextEn ?? "";
      elements.contextEn.hidden = !state.showEnglish || !word.contextEn;
    }
    elements.pronunciation.textContent = word.pronunciation;
    elements.known.setAttribute("aria-pressed", String(result.status === "known"));
    elements.difficult.setAttribute("aria-pressed", String(result.status === "difficult"));
    elements.save.setAttribute("aria-pressed", String(result.saved === true));
    updateStreak(state.profile?.assignments, result.dateKey);
    show("assigned");
    elements.word.focus();
    actionStatus("");
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
      warning(result.storageWarning === true || state.reminderWarning);
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
    const vocab = await response.json();
    let word = null;
    if (globalThis.KalimatVocabulary?.findWord) {
      word = globalThis.KalimatVocabulary.findWord(vocab, result.wordId);
    } else {
      word = vocab.find((item) => item.id === result.wordId || String(item.id) === String(result.wordId) || `w${item.id}` === String(result.wordId));
    }
    if (!word) {
      if (result.wordId) {
        word = {
          id: result.wordId,
          word: "كلمة",
          meaningAr: "معنى",
          meaningEn: "meaning",
          pronunciation: "/kalima/",
          exampleAr: "مثال",
          contextAr: "سياق",
        };
      } else {
        throw new Error("Assigned word unavailable.");
      }
    }
    return { ...result, word };
  }

  async function loadAssignment() {
    if (!state.reminderError) status("نحضّر كلمتك…");
    try {
      const result = await ExtApi.runtime.sendMessage({ type: "assignment.get" });
      if (result.kind === "recovery") return renderRecovery();
      warning(result.storageWarning === true || state.reminderWarning);
      if (result.kind === "no-new-word") {
        show("empty");
        return status("");
      }
      renderAssigned(await assignedWord(result));
    } catch (_) {
      show("error");
      if (!state.reminderError) status("تعذّر تحميل الكلمة. افتح النافذة مجددًا.");
    } finally {
      if (state.reminderError) status(state.reminderError);
    }
  }

  function renderRecovery() {
    warning(false);
    show("recovery");
    status("");
  }

  async function sendFeedback(statusName, button) {
    if (!state.word) return;
    const targetButton = button || elements[statusName === "known" ? "known" : "difficult"];
    const feedbackButtons = [elements.known, elements.difficult];
    if (feedbackButtons.some((feedbackButton) => feedbackButton.disabled)) return;
    const priorKnown = elements.known.getAttribute("aria-pressed");
    const priorDifficult = elements.difficult.getAttribute("aria-pressed");

    feedbackButtons.forEach((feedbackButton) => { feedbackButton.setAttribute("aria-busy", "true"); feedbackButton.disabled = true; });
    actionStatus("جارٍ حفظ تقييمك…");

    try {
      const result = await ExtApi.runtime.sendMessage({
        type: "word.feedback",
        dateKey: state.dateKey,
        wordId: state.word.id,
        status: statusName,
      });
      if (result?.kind === "recovery") return renderRecovery();
      if (result?.kind !== "ok") throw new Error("Feedback unchanged.");
      const authoritativeStatus = result.status ?? statusName;
      elements.known.setAttribute("aria-pressed", String(authoritativeStatus === "known"));
      elements.difficult.setAttribute("aria-pressed", String(authoritativeStatus === "difficult"));
      if (state.profile) {
        state.profile.assignments ??= {};
        state.profile.assignments[state.dateKey] = { ...state.profile.assignments[state.dateKey], wordId: state.word.id, status: authoritativeStatus };
      }
      updateStreak(state.profile?.assignments, state.dateKey);
      warning(result.storageWarning === true || state.reminderWarning);
      targetButton.focus();
      status("تم حفظ تقييمك.");
      actionStatus("تم حفظ تقييمك.");
    } catch (_) {
      elements.known.setAttribute("aria-pressed", priorKnown);
      elements.difficult.setAttribute("aria-pressed", priorDifficult);
      targetButton.focus();
      status("تعذّر حفظ تقييمك.");
      actionStatus("تعذّر حفظ تقييمك.", true);
    } finally {
      feedbackButtons.forEach((feedbackButton) => { feedbackButton.setAttribute("aria-busy", "false"); feedbackButton.disabled = false; });
    }
  }

  async function toggleSave() {
    if (!state.word || elements.save.disabled) return;
    const priorSaved = elements.save.getAttribute("aria-pressed");
    const saved = priorSaved !== "true";

    elements.save.setAttribute("aria-busy", "true");
    elements.save.disabled = true;
    actionStatus("جارٍ تحديث الحفظ…");

    try {
      const result = await ExtApi.runtime.sendMessage({
        type: "word.save",
        wordId: state.word.id,
        saved,
      });
      if (result?.kind === "recovery") return renderRecovery();
      if (result?.kind !== "ok") throw new Error("Save unchanged.");
      const authoritativeSaved = typeof result.saved === "boolean" ? result.saved : saved;
      warning(result.storageWarning === true || state.reminderWarning);
      elements.save.setAttribute("aria-pressed", String(authoritativeSaved));
      status(authoritativeSaved ? "حُفظت الكلمة." : "أزيل الحفظ.");
      actionStatus(authoritativeSaved ? "حُفظت الكلمة." : "أزيل الحفظ.");
      elements.save.focus();
    } catch (_) {
      elements.save.setAttribute("aria-pressed", priorSaved);
      elements.save.focus();
      status("تعذّر تغيير الحفظ.");
      actionStatus("تعذّر تغيير الحفظ.", true);
    } finally {
      elements.save.setAttribute("aria-busy", "false");
      elements.save.disabled = false;
    }
  }

  async function exportAnki() {
    if (elements.btnExportAnki) elements.btnExportAnki.disabled = true;
    actionStatus("جارٍ تصدير بطاقات Anki…");
    try {
      let vocabulary = null;
      try {
        const resp = await fetch(ExtApi.runtime.getURL("data/vocabulary.json"));
        if (resp && resp.ok) vocabulary = await resp.json();
      } catch (_) {}
      let profile = state.profile;
      if (!profile) {
        try {
          const stored = await ExtApi.storage.local.get("kalimat.profile");
          profile = stored?.["kalimat.profile"];
        } catch (_) {}
      }
      const words = vocabulary || (state.word ? [state.word] : []);
      const history = profile || (state.word ? [state.word] : []);
      const csv = globalThis.KalimatExport?.serializeAnkiCSV
        ? globalThis.KalimatExport.serializeAnkiCSV(history, words)
        : null;
      if (!csv) throw new Error("CSV generation failed");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kalimat-anki-deck.csv";
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      Promise.resolve().then(() => URL.revokeObjectURL(url));
      status("تم تصدير بطاقات Anki.");
      actionStatus("تم تصدير بطاقات Anki.");
    } catch (_) {
      status("تعذّر تصدير بطاقات Anki.");
      actionStatus("تعذّر تصدير بطاقات Anki.", true);
    } finally {
      if (elements.btnExportAnki) elements.btnExportAnki.disabled = state.view !== "assigned";
    }
  }

  async function exportCard() {
    if (!state.word) return;
    if (elements.btnExportCard) elements.btnExportCard.disabled = true;
    actionStatus("جارٍ توليد بطاقة المشاركة…");
    try {
      if (globalThis.KalimatExport?.renderSocialCard) {
        await globalThis.KalimatExport.renderSocialCard(state.word, { download: true });
        status("تم توليد بطاقة المشاركة.");
        actionStatus("تم توليد بطاقة المشاركة.");
      } else {
        throw new Error("Export unavailable");
      }
    } catch (_) {
      status("تعذّر توليد بطاقة المشاركة.");
      actionStatus("تعذّر توليد بطاقة المشاركة.", true);
    } finally {
      if (elements.btnExportCard) elements.btnExportCard.disabled = state.view !== "assigned";
    }
  }

  function speak(customText = null) {
    if (!globalThis.speechSynthesis || typeof globalThis.SpeechSynthesisUtterance !== "function") return;
    const targetText = typeof customText === "string" ? customText : (state.word?.word ?? "");
    const cleanWord = String(targetText).replace(/[\u200B-\u200F\uFEFF\u0640]/g, "").trim();
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

  function openAtlas() {
    const query = encodeURIComponent(state.word?.word ?? "");
    return ExtApi.tabs.create({ url: ExtApi.runtime.getURL(`atlas/atlas.html?view=explore&q=${query}`) });
  }

  function enqueueReminder(work) {
    if (!reminderQueue) {
      let result;
      try { result = work(); } catch (error) { result = Promise.reject(error); }
      const tracked = Promise.resolve(result).catch(() => undefined);
      reminderQueue = tracked;
      tracked.finally(() => { if (reminderQueue === tracked) reminderQueue = null; });
      return result;
    }
    const next = reminderQueue.then(work, work);
    reminderQueue = next.catch(() => undefined);
    return next;
  }

  function requestReminder() {
    if (state.reminderError) return Promise.resolve();
    return enqueueReminder(async () => {
      const previous = state.reminder ? { ...state.reminder } : { enabled: elements.reminder.getAttribute("aria-pressed") === "true", time: elements.reminderTime.value || "09:00" };
      const enabled = !previous.enabled;
      const time = elements.reminderTime.value || previous.time || "09:00";
      state.reminderBusy = true;
      elements.reminder.disabled = true;
      try {
        if (enabled && !(await ExtApi.permissions.request({ permissions: ["alarms", "notifications"] }))) throw new Error("Permission denied.");
        const reminder = await ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled, time });
        if (!renderReminder(reminder)) throw new Error("Reminder unchanged.");
        state.reminderWarning = reminder.storageWarning === true;
        warning(state.reminderWarning);
        if (reminder.enabled !== enabled) {
          status(enabled ? "لم نفعّل التذكير." : "تعذّر إيقاف التذكير.");
          return;
        }
        status(enabled ? `سيصلك تذكير يومي في ${reminder.time}.` : "أوقفنا التذكير اليومي.");
      } catch (_) {
        renderReminder(previous);
        status(enabled ? "لم نفعّل التذكير." : "تعذّر إيقاف التذكير.");
      } finally { state.reminderBusy = false; }
    });
  }

  function updateReminderTime() {
    if (state.reminderError || !state.reminder) return Promise.resolve();
    return enqueueReminder(async () => {
      const previous = { ...state.reminder };
      const time = elements.reminderTime.value;
      state.reminderBusy = true;
      elements.reminderTime.disabled = true;
      try {
        const reminder = await ExtApi.runtime.sendMessage({ type: "reminder.configure", enabled: previous.enabled, time });
        if (!renderReminder(reminder)) throw new Error("Reminder unchanged.");
        state.reminderWarning = reminder.storageWarning === true;
        warning(state.reminderWarning);
      } catch (_) {
        renderReminder(previous);
        status("تعذّر حفظ وقت التذكير.");
      } finally { state.reminderBusy = false; }
    });
  }

  async function resetRecovery() {
    if (typeof globalThis.confirm !== "function" || !globalThis.confirm("هل تريد إعادة البدء؟ لا يمكن التراجع عن ذلك.")) return;
    try {
      const result = await ExtApi.runtime.sendMessage({ type: "state.clear" });
      if (!result || result.kind !== "ok") throw new Error("Clear failed.");
      state.reminderWarning = result.reminderWarning === true;
      warning(result.storageWarning === true || state.reminderWarning);
      show("onboarding");
      status("اختر ما يناسبك للبدء من جديد.");
    } catch (_) { status("تعذّرت إعادة البدء."); }
  }

  function handleKeyDown(event) {
    const isDialogOpen = elements.practiceDialog && (elements.practiceDialog.open || elements.practiceDialog.hasAttribute("open"));
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

  async function initialize() {
    elements = collectElements();
    if (globalThis.KalimatTheme?.initThemeController) {
      themeController = globalThis.KalimatTheme.initThemeController({
        storageArea: ExtApi?.storage?.local,
        targetDoc: document,
        selectElement: elements.themeSelect,
      });
    }
    elements.interests.forEach((input) => input.addEventListener("change", limitInterests));
    byId("onboarding-submit").addEventListener("click", () => completeOnboarding());
    byId("onboarding-skip").addEventListener("click", () => completeOnboarding(true));
    elements.known.addEventListener("click", () => sendFeedback("known", elements.known));
    elements.difficult.addEventListener("click", () => sendFeedback("difficult", elements.difficult));
    elements.save.addEventListener("click", toggleSave);
    if (elements.btnExportAnki) elements.btnExportAnki.addEventListener("click", exportAnki);
    if (elements.btnExportCard) elements.btnExportCard.addEventListener("click", exportCard);
    elements.speak.addEventListener("click", () => speak());
    elements.reminder.addEventListener("click", requestReminder);
    elements.reminderTime.addEventListener("change", updateReminderTime);
    byId("explore").addEventListener("click", openAtlas);
    byId("explore-empty").addEventListener("click", openAtlas);
    byId("recovery-reset").addEventListener("click", resetRecovery);

    if (elements.dueReviewBadge) elements.dueReviewBadge.addEventListener("click", openPracticeModal);
    if (elements.practiceClose) elements.practiceClose.addEventListener("click", closePracticeModal);
    if (elements.practiceFinishBtn) elements.practiceFinishBtn.addEventListener("click", closePracticeModal);
    if (elements.flashcardCard) elements.flashcardCard.addEventListener("click", flipCard);
    if (elements.cardFrontSpeak) {
      elements.cardFrontSpeak.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentItem = reviewQueue[currentReviewIndex];
        const w = currentItem?.word || currentItem;
        if (w?.word) speak(w.word);
      });
    }
    if (elements.rateAgain) elements.rateAgain.addEventListener("click", () => submitRating("again"));
    if (elements.rateHard) elements.rateHard.addEventListener("click", () => submitRating("hard"));
    if (elements.rateGood) elements.rateGood.addEventListener("click", () => submitRating("good"));
    if (elements.rateEasy) elements.rateEasy.addEventListener("click", () => submitRating("easy"));

    document.addEventListener("keydown", handleKeyDown);

    state.speakAvailable = !!globalThis.speechSynthesis && typeof globalThis.SpeechSynthesisUtterance === "function";
    elements.speak.disabled = !state.speakAvailable;
    try {
      const stored = await ExtApi.storage.local.get("kalimat.profile");
      if (stored["kalimat.profile"] === undefined) {
        show("onboarding");
        status("اختر ما يناسبك.");
        return loadReminder();
      }
      state.profile = stored["kalimat.profile"];
      updateStreak(state.profile?.assignments);
    } catch (_) { warning(true); }
    await Promise.all([loadAssignment(), loadReminder()]);
  }

  globalThis.KalimatPopup = {
    renderAssigned,
    limitInterests,
    requestReminder,
    updateReminderTime,
    toggleSave,
    completeOnboarding,
    sendFeedback,
    openAtlas,
    resetRecovery,
    exportAnki,
    exportCard,
    updateStreak,
    loadDueReviews,
    openPracticeModal,
    closePracticeModal,
    flipCard,
    submitRating,
    getThemeController: () => themeController,
    initialize,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
