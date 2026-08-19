(() => {
  "use strict";

  const ExtApi = globalThis.browser ?? globalThis.chrome;
  const ReviewSession = globalThis.KalimatReviewSession;
  const byId = (id) => document.getElementById(id);
  const state = {
    word: null,
    dateKey: null,
    profile: null,
    showEnglish: true,
    reminder: null,
    reminderReady: false,
    reminderWarning: false,
    storageWarning: false,
    reminderError: "",
    reminderBusy: false,
    speakAvailable: false,
    view: "",
  };
  let elements;
  let reminderQueue = null;
  let themeController = null;
  let onboardingInFlight = false;
  const reviewSession = ReviewSession.create();
  let reviewQueueLoad = null;
  let reviewInvoker = null;

  function toArabicDigits(value) {
    if (globalThis.KalimatStreak?.toArabicDigits) return globalThis.KalimatStreak.toArabicDigits(value);
    return String(value ?? "").replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[digit]);
  }

  function formatReviewCount(count) {
    const value = Math.max(0, Number(count) || 0);
    if (value === 1) return "مراجعة واحدة";
    if (value === 2) return "مراجعتين";
    if (value >= 3 && value <= 10) return `${toArabicDigits(value)} مراجعات`;
    return `${toArabicDigits(value)} مراجعة`;
  }

  const ARABIC_DATE_OPTIONS = { weekday: "long", year: "numeric", month: "long", day: "numeric" };

  function formatDateKey(dateKey) {
    if (typeof globalThis.KalimatDate?.isDateKey !== "function" || !globalThis.KalimatDate.isDateKey(dateKey)) return "";
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("ar-EG", ARABIC_DATE_OPTIONS);
  }

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
    elements.reminder.setAttribute("aria-checked", String(reminder.enabled));
    elements.reminder.setAttribute("aria-label", reminder.enabled ? "إيقاف التذكير اليومي" : "تفعيل التذكير اليومي");
    return true;
  }

  async function loadReminder() {
    try {
      const settings = await ExtApi.runtime.sendMessage({ type: "settings.get" });
      if (!settings || settings.kind !== "settings" || !renderReminder(settings.reminder)) throw new Error("Invalid settings.");
      state.reminderWarning = settings.storageWarning === true;
      warning(state.reminderWarning || state.storageWarning);
    } catch (_) {
      state.reminderReady = true;
      state.reminder = null;
      state.reminderError = "تعذّر تحميل إعدادات التذكير.";
      elements.reminderTime.value = "";
      elements.reminderTime.disabled = true;
      elements.reminder.disabled = true;
      elements.reminder.setAttribute("aria-checked", "false");
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
    elements.streakBadge.setAttribute("aria-label", `تتابع القراءة والزيارة: ${digits}`);
    elements.streakBadge.title = "تتابع القراءة والزيارة";
  }

  function hideReviewBadge() {
    if (elements.dueReviewBadge) elements.dueReviewBadge.hidden = true;
  }

  function reviewButtons() {
    return [elements.rateAgain, elements.rateHard, elements.rateGood, elements.rateEasy].filter(Boolean);
  }

  function syncReviewControls() {
    const revealed = ReviewSession.isRevealed(reviewSession);
    if (elements.practiceRatings) elements.practiceRatings.hidden = !revealed;
    for (const button of reviewButtons()) button.disabled = !revealed || ReviewSession.isSubmitting(reviewSession);
    if (elements.cardFrontSpeak) elements.cardFrontSpeak.disabled = revealed;
    if (elements.cardFrontFace) elements.cardFrontFace.setAttribute("aria-hidden", String(revealed));
    if (elements.cardBackFace) elements.cardBackFace.setAttribute("aria-hidden", String(!revealed));
    if (elements.flashcardCard) elements.flashcardCard.classList.toggle("flipped", revealed);
    if (elements.cardFrontFlip) {
      elements.cardFrontFlip.setAttribute("aria-pressed", String(revealed));
      const label = revealed ? "أخفِ المعنى" : "اقلب البطاقة";
      elements.cardFrontFlip.setAttribute("aria-label", label);
      elements.cardFrontFlip.textContent = label;
    }
  }

  function clearPracticeCard() {
    ReviewSession.resetCard(reviewSession);
    for (const element of [elements.cardFrontWord, elements.cardFrontVocalization, elements.cardFrontWeight, elements.cardFrontRoot, elements.cardBackMeaningAr, elements.cardBackMeaningEn, elements.cardBackExampleAr, elements.cardBackContext]) {
      if (element) element.textContent = "";
    }
    if (elements.practiceProgress) elements.practiceProgress.textContent = "";
    for (const button of reviewButtons()) {
      const interval = button.querySelector?.(".rate-interval");
      if (interval) interval.textContent = "—";
      button.setAttribute("aria-busy", "false");
    }
    syncReviewControls();
  }

  function loadDueReviews({ force = false } = {}) {
    if (!force && ReviewSession.isLoaded(reviewSession)) return Promise.resolve();
    if (reviewQueueLoad) return reviewQueueLoad;

    hideReviewBadge();
    reviewQueueLoad = (async () => {
      const result = await ReviewSession.load(reviewSession, () => ExtApi.runtime.sendMessage({ type: "review.queue" }));
      if (result.kind === "recovery") {
          hideReviewBadge();
          renderRecovery(result.recoveryRaw);
          return result;
      }
      if (result.kind === "queue") {
        const queue = result.queue;
        warning(queue.storageWarning || state.reminderWarning || state.storageWarning);
        if (elements.dueReviewBadge) {
          if (queue.dueCount > 0) {
            elements.dueReviewBadge.hidden = false;
            elements.dueReviewBadge.textContent = `${queue.dueCount} مستحقة`;
            elements.dueReviewBadge.setAttribute("aria-label", `المراجعات المستحقة اليوم: ${formatReviewCount(queue.dueCount)}`);
          } else {
            elements.dueReviewBadge.hidden = true;
          }
        }
      } else {
        hideReviewBadge();
        clearPracticeCard();
      }
      return result;
    })();
    const pending = reviewQueueLoad;
    pending.then(() => {
      if (reviewQueueLoad === pending) reviewQueueLoad = null;
    }, () => {
      if (reviewQueueLoad === pending) reviewQueueLoad = null;
    });
    return pending;
  }

  function presentPracticeDialog() {
    if (!elements.practiceDialog) return;
    if (typeof elements.practiceDialog.showModal === "function") elements.practiceDialog.showModal();
    else elements.practiceDialog.setAttribute("open", "");
  }

  function showPracticeError() {
    if (elements.practiceBody) elements.practiceBody.hidden = false;
    if (elements.practiceFinished) elements.practiceFinished.hidden = true;
    if (elements.practiceError) elements.practiceError.hidden = false;
    if (elements.practiceErrorMessage) elements.practiceErrorMessage.textContent = ReviewSession.error(reviewSession) || "تعذّر تحميل المراجعات. حاول مجددًا.";
    clearPracticeCard();
    status(ReviewSession.error(reviewSession) || "تعذّر تحميل المراجعات. حاول مجددًا.");
  }

  function showPracticeContent() {
    if (ReviewSession.isRecovery(reviewSession)) return;
    if (ReviewSession.hasError(reviewSession)) return showPracticeError();
    if (ReviewSession.count(reviewSession) === 0) return showPracticeFinished();
    showPracticeCard(0);
  }

  function openPracticeModal() {
    if (!elements.practiceDialog) return;
    reviewInvoker = document.activeElement && typeof document.activeElement.focus === "function" ? document.activeElement : null;
    if (ReviewSession.hasError(reviewSession)) {
      loadDueReviews({ force: true }).then((result) => {
        if (result?.kind === "recovery" || ReviewSession.isRecovery(reviewSession)) return;
        showPracticeContent();
        presentPracticeDialog();
      });
      return;
    }
    const needsLoad = !ReviewSession.isLoaded(reviewSession) || ReviewSession.count(reviewSession) === 0;
    if (needsLoad) {
      loadDueReviews().then((result) => {
        if (result?.kind === "recovery" || ReviewSession.isRecovery(reviewSession)) return;
        showPracticeContent();
        presentPracticeDialog();
      });
      return;
    }
    showPracticeContent();
    presentPracticeDialog();
  }

  function restoreReviewFocus() {
    const invoker = reviewInvoker;
    reviewInvoker = null;
    if (invoker && typeof invoker.focus === "function") invoker.focus();
  }

  function closePracticeModal() {
    if (!elements.practiceDialog) return;
    if (typeof elements.practiceDialog.close === "function") elements.practiceDialog.close();
    else {
      elements.practiceDialog.removeAttribute("open");
      restoreReviewFocus();
    }
    loadDueReviews({ force: true });
  }

  function handlePracticeDialogClose() {
    if (ReviewSession.isRecovery(reviewSession)) {
      reviewInvoker = null;
      return;
    }
    restoreReviewFocus();
  }

  function dismissPracticeForRecovery() {
    if (elements.practiceDialog) {
      if (typeof elements.practiceDialog.close === "function") elements.practiceDialog.close();
      else elements.practiceDialog.removeAttribute("open");
    }
    if (elements.practiceBody) elements.practiceBody.hidden = true;
    if (elements.practiceFinished) elements.practiceFinished.hidden = true;
    if (elements.practiceError) elements.practiceError.hidden = true;
    clearPracticeCard();
  }

  function showPracticeCard(index) {
    if (index < 0 || index >= ReviewSession.count(reviewSession)) {
      showPracticeFinished();
      return;
    }
    if (elements.practiceBody) elements.practiceBody.hidden = false;
    if (elements.practiceFinished) elements.practiceFinished.hidden = true;

    const item = ReviewSession.showCard(reviewSession, index);
    const word = item.word || item;
    if (elements.practiceError) elements.practiceError.hidden = true;
    const reviewOptions = item.reviewOptions || {};
    for (const [key, button] of [["again", elements.rateAgain], ["hard", elements.rateHard], ["good", elements.rateGood], ["easy", elements.rateEasy]]) {
      const label = reviewOptions[key]?.label;
      if (!button || !label) continue;
      const interval = button.querySelector?.(".rate-interval");
      if (interval) interval.textContent = label;
    }
    if (elements.practiceProgress) {
      elements.practiceProgress.textContent = `${index + 1} / ${ReviewSession.count(reviewSession)}`;
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
    if (elements.cardBackExampleAr) elements.cardBackExampleAr.textContent = word.exampleAr || word.example || "";
    if (elements.cardBackContext) elements.cardBackContext.textContent = word.contextAr || word.context || "";
    syncReviewControls();
  }

  function showPracticeFinished() {
    if (elements.practiceBody) elements.practiceBody.hidden = true;
    if (elements.practiceFinished) elements.practiceFinished.hidden = false;
    if (elements.practiceError) elements.practiceError.hidden = true;
    clearPracticeCard();
    const reviewMeta = ReviewSession.meta(reviewSession);
    const remainingCount = Math.max(0, reviewMeta.remainingCount);
    const finishedMessage = elements.practiceFinishedMessage;
    if (remainingCount > 0) {
      const message = `أتممت ${toArabicDigits(reviewMeta.visibleCount)} من ${toArabicDigits(reviewMeta.dueCount)} مراجعة؛ تبقت ${formatReviewCount(remainingCount)}.`;
      if (finishedMessage) finishedMessage.textContent = message;
      if (elements.dueReviewBadge) {
        elements.dueReviewBadge.hidden = false;
        elements.dueReviewBadge.textContent = `${remainingCount} مستحقة`;
        elements.dueReviewBadge.setAttribute("aria-label", `المراجعات المتبقية بعد الجلسة: ${formatReviewCount(remainingCount)}`);
      }
      status(message);
    } else {
      if (finishedMessage) finishedMessage.textContent = "🎉 أحسنت! أنهيت جميع مراجعات اليوم.";
      if (elements.dueReviewBadge) elements.dueReviewBadge.hidden = true;
    }
  }

  function flipCard() {
    ReviewSession.toggleReveal(reviewSession);
    syncReviewControls();
    status(ReviewSession.isRevealed(reviewSession) ? "كُشف المعنى." : "أُخفي المعنى.");
  }

  async function submitRating(rating) {
    const currentItem = ReviewSession.beginSubmission(reviewSession);
    if (!currentItem) return;
    const wordId = currentItem.word?.id ?? currentItem.wordId ?? currentItem.id;
    const buttons = reviewButtons();
    syncReviewControls();
    buttons.forEach((button) => button.setAttribute("aria-busy", "true"));
    try {
      const result = await ExtApi.runtime.sendMessage({
        type: "word.review",
        wordId,
        rating,
        dateKey: state.dateKey || (globalThis.KalimatDate?.todayDateKey ? globalThis.KalimatDate.todayDateKey() : new Date().toISOString().slice(0, 10)),
      });
      if (result?.kind === "recovery") return renderRecovery();
      if (result?.kind !== "ok") throw new Error("Review unchanged.");
      const nextIndex = ReviewSession.advance(reviewSession);
      if (nextIndex !== null) {
        showPracticeCard(nextIndex);
        status("تم حفظ المراجعة.");
      } else {
        showPracticeFinished();
        if (ReviewSession.meta(reviewSession).remainingCount === 0) status("تم حفظ المراجعة.");
      }
    } catch (_) {
      ReviewSession.finishSubmission(reviewSession);
      syncReviewControls();
      status("تعذّر حفظ المراجعة. حاول مجددًا.");
    } finally {
      ReviewSession.finishSubmission(reviewSession);
      buttons.forEach((button) => button.setAttribute("aria-busy", "false"));
    }
  }

  function collectElements() {
    return {
      onboarding: byId("onboarding"),
      assigned: byId("assigned"),
      assignedTitle: byId("assigned-title"),
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
      onboardingSkip: byId("onboarding-skip"),
      actionStatus: byId("action-status"),
      themeSelect: byId("theme-select"),
      streakBadge: byId("streak-badge"),
      assignmentDate: byId("assignment-date"),
      interestCount: byId("interest-count"),
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
      practiceFinishedMessage: byId("practice-finished-message"),
      practiceError: byId("practice-error"),
      practiceErrorMessage: byId("practice-error-message"),
      practiceRetry: byId("practice-retry"),
      practiceFinishBtn: byId("practice-finish-btn"),
      flashcardCard: byId("flashcard-card"),
      cardFrontFace: byId("card-front-face"),
      cardBackFace: byId("card-back-face"),
      cardFrontFlip: byId("card-front-flip"),
      cardFrontWord: byId("card-front-word"),
      cardFrontVocalization: byId("card-front-vocalization"),
      cardFrontWeight: byId("card-front-weight"),
      cardFrontRoot: byId("card-front-root"),
      cardFrontSpeak: byId("card-front-speak"),
      cardBackMeaningAr: byId("card-back-meaning-ar"),
      cardBackMeaningEn: byId("card-back-meaning-en"),
      cardBackExampleAr: byId("card-back-example-ar"),
      cardBackContext: byId("card-back-context"),
      practiceRatings: byId("practice-ratings"),
      rateAgain: byId("rate-again"),
      rateHard: byId("rate-hard"),
      rateGood: byId("rate-good"),
      rateEasy: byId("rate-easy"),
    };
  }

  function renderAssigned(result) {
    elements ??= collectElements();
    const word = result.word;
    const formattedDate = formatDateKey(result.dateKey);
    state.word = word;
    state.dateKey = formattedDate ? result.dateKey : null;
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
    if (elements.assignmentDate) {
      elements.assignmentDate.textContent = formattedDate;
      elements.assignmentDate.hidden = !formattedDate;
    }
    show("assigned");
    elements.word.focus();
    actionStatus("");
    status("كلمتك جاهزة.");
  }

  function updateInterestCount() {
    const chosen = [...(elements?.interests ?? [])].filter((input) => input.checked).length;
    if (elements?.interestCount) elements.interestCount.textContent = `${chosen}/3`;
    return chosen;
  }

  function limitInterests(event) {
    elements ??= collectElements();
    const chosen = [...elements.interests].filter((input) => input.checked);
    if (chosen.length > 3) {
      if (event?.target) event.target.checked = false;
      updateInterestCount();
      status("يمكنك اختيار ثلاثة اهتمامات فقط.");
      return;
    }
    updateInterestCount();
  }

  async function completeOnboarding(skip = false) {
    if (onboardingInFlight) return;
    onboardingInFlight = true;
    const level = skip ? 1 : Number([...elements.levels].find((input) => input.checked)?.value ?? 1);
    const interests = skip ? [] : [...elements.interests].filter((input) => input.checked).map((input) => input.value);
    elements.onboardingSubmit.disabled = true;
    elements.onboardingSkip.disabled = true;
    try {
      const result = await ExtApi.runtime.sendMessage({ type: "onboarding.complete", level, interests });
      if (result.kind === "recovery") return renderRecovery();
      state.storageWarning = result.storageWarning === true;
      warning(state.storageWarning || state.reminderWarning);
      await loadAssignment();
    } catch (_) {
      status("تعذّر حفظ اختياراتك. حاول مرة أخرى.");
    } finally {
      elements.onboardingSubmit.disabled = false;
      elements.onboardingSkip.disabled = false;
      onboardingInFlight = false;
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
    if (!word) throw new Error("Assigned word unavailable.");
    return { ...result, word };
  }

  async function loadAssignment() {
    if (!state.reminderError) status("نحضّر كلمتك…");
    try {
      const result = await ExtApi.runtime.sendMessage({ type: "assignment.get" });
      if (result.kind === "recovery") {
        renderRecovery();
        return false;
      }
      state.storageWarning = result.storageWarning === true;
      warning(state.storageWarning || state.reminderWarning);
      if (result.kind === "no-new-word") {
        show("empty");
        status("");
        return true;
      }
      const assignment = await assignedWord(result);
      if (assignment.kind !== "assigned" || !formatDateKey(assignment.dateKey)) throw new Error("Invalid assignment.");
      renderAssigned(assignment);
      return true;
    } catch (_) {
      show("error");
      if (!state.reminderError) status("تعذّر تحميل الكلمة. افتح النافذة مجددًا.");
      return false;
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
      warning(result.storageWarning === true || state.reminderWarning || state.storageWarning);
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
    const targetText = typeof customText === "string" ? customText : (state.word?.word ?? "");
    const result = globalThis.KalimatSpeech?.speak(targetText, {
      rate: state.profile?.preferences?.speechRate ?? 0.85,
      repeat: state.profile?.preferences?.speechRepeat ?? 1,
      requireVoice: true,
    });
    if (result?.kind === "no-arabic-voice") {
      status("لم يتم العثور على صوت عربي. فعّل حزمة صوت عربية في إعدادات النظام ثم حاول مجددًا.");
    } else if (result?.kind === "unavailable") {
      status("تعذّر تشغيل النطق على هذا الجهاز.");
    }
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
      const previous = state.reminder ? { ...state.reminder } : { enabled: elements.reminder.getAttribute("aria-checked") === "true", time: elements.reminderTime.value || "09:00" };
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
      state.storageWarning = result.storageWarning === true;
      warning(state.storageWarning || state.reminderWarning);
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
        if (!ReviewSession.isRevealed(reviewSession)) return;
        event.preventDefault();
        submitRating("again");
        return;
      }
      if (event.key === "2" || event.key === "٢") {
        if (!ReviewSession.isRevealed(reviewSession)) return;
        event.preventDefault();
        submitRating("hard");
        return;
      }
      if (event.key === "3" || event.key === "٣") {
        if (!ReviewSession.isRevealed(reviewSession)) return;
        event.preventDefault();
        submitRating("good");
        return;
      }
      if (event.key === "4" || event.key === "٤") {
        if (!ReviewSession.isRevealed(reviewSession)) return;
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
    if (elements.assigned) elements.assigned.hidden = true;
    if (elements.assignmentDate) {
      elements.assignmentDate.hidden = true;
      elements.assignmentDate.textContent = "";
    }
    updateInterestCount();
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
    if (elements.practiceRetry) elements.practiceRetry.addEventListener("click", () => {
      loadDueReviews({ force: true }).then((result) => {
        if (result?.kind === "recovery" || ReviewSession.isRecovery(reviewSession)) {
          dismissPracticeForRecovery();
          return;
        }
        showPracticeContent();
      });
    });
    if (elements.practiceDialog) elements.practiceDialog.addEventListener("close", handlePracticeDialogClose);
    if (elements.cardFrontFlip) elements.cardFrontFlip.addEventListener("click", flipCard);
    if (elements.cardFrontSpeak) {
      elements.cardFrontSpeak.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentItem = ReviewSession.current(reviewSession);
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
    } catch (_) {
      warning(true);
      return;
    }
    const [assignmentReady] = await Promise.all([loadAssignment(), loadReminder()]);
    if (assignmentReady) await loadDueReviews();
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
