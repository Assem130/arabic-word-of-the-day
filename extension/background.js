if (!globalThis.KalimatVocabulary && typeof importScripts === "function") {
  importScripts("shared/date.js", "shared/vocabulary.js", "shared/state.js", "shared/selector.js", "shared/lookup.js");
}

const dependencies = typeof module === "object" && module.exports
  ? {
    date: require("./shared/date.js"),
    vocabulary: require("./shared/vocabulary.js"),
    state: require("./shared/state.js"),
    selector: require("./shared/selector.js"),
    lookup: require("./shared/lookup.js"),
  }
  : {
    date: globalThis.KalimatDate,
    vocabulary: globalThis.KalimatVocabulary,
    state: globalThis.KalimatState,
    selector: globalThis.KalimatSelector,
    lookup: globalThis.KalimatLookup,
  };
const ExtApi = globalThis.browser ?? globalThis.chrome;
const PROFILE_KEY = "kalimat.profile";
const REMINDER_KEY = "kalimat.reminder";
const REMINDER_WARNING_KEY = "kalimat.reminder.warning";
const REMINDER_ALARM = "kalimat.reminder";
const DEFAULT_REMINDER = Object.freeze({ enabled: false, time: "09:00" });
let queue = Promise.resolve();
let sessionFallback = null;
let vocabularyPromise = null;
let reminderWarningFallback = false;
let alarmListenerRegistered = false;
let notificationListenerRegistered = false;

function serialized(work) {
  const result = queue.then(work, work);
  queue = result.catch(() => undefined);
  return result;
}

function randomSeed() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timeIsValid(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours < 24 && minutes < 60;
}

function nextOccurrence(time, now = new Date()) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function validReminder(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 2 && Object.hasOwn(value, "enabled") && Object.hasOwn(value, "time")
    && typeof value.enabled === "boolean" && timeIsValid(value.time);
}

async function getVocabulary() {
  if (!vocabularyPromise) {
    vocabularyPromise = fetch(ExtApi.runtime.getURL("data/vocabulary.json"))
      .then((response) => {
        if (!response.ok) throw new Error("Vocabulary unavailable.");
        return response.json();
      })
      .then(dependencies.vocabulary.validateVocabulary);
  }
  return vocabularyPromise;
}

async function loadProfile(vocabulary) {
  try {
    const stored = await ExtApi.storage.local.get(PROFILE_KEY);
    const raw = stored[PROFILE_KEY];
    if (raw === undefined) {
      if (sessionFallback && sessionFallback.base === null) {
        const fallback = sessionFallback;
        const storageWarning = await saveProfile(fallback.profile, null);
        return { profile: fallback.profile, warning: storageWarning, base: null };
      }
      sessionFallback = null;
      return { profile: dependencies.state.createProfile({ seedHex: randomSeed() }), warning: false, base: null };
    }
    const checked = dependencies.state.validateStoredProfile(raw, vocabulary);
    if (!checked.canPersist) return { recoveryRaw: checked.recoveryRaw };
    if (checked.migrated) {
      const storageWarning = await saveProfile(checked.profile, checked.profile);
      return { profile: checked.profile, warning: storageWarning, base: checked.profile };
    }
    if (sessionFallback) {
      if (sameProfile(checked.profile, sessionFallback.base)) {
        const fallback = sessionFallback;
        const storageWarning = await saveProfile(fallback.profile, fallback.base);
        return { profile: fallback.profile, warning: storageWarning, base: fallback.base };
      }
      sessionFallback = null;
    }
    return { profile: checked.profile, warning: false, base: checked.profile };
  } catch (_) {
    sessionFallback ??= { profile: dependencies.state.createProfile({ seedHex: randomSeed() }), base: null };
    return { profile: sessionFallback.profile, warning: true, base: sessionFallback.base };
  }
}

function sameProfile(left, right) {
  return !!right && dependencies.state.serializeExport(left) === dependencies.state.serializeExport(right);
}

async function saveProfile(profile, base = null) {
  try {
    await ExtApi.storage.local.set({ [PROFILE_KEY]: profile });
    sessionFallback = null;
    return false;
  } catch (_) {
    sessionFallback = { profile, base };
    return true;
  }
}

async function persistProfile(profile, loaded) {
  if (loaded.warning) {
    sessionFallback = { profile, base: loaded.base };
    return true;
  }
  return saveProfile(profile, loaded.base);
}

function recovery(loaded) {
  return { kind: "recovery", recoveryRaw: loaded.recoveryRaw };
}

function assignedResult(profile, dateKey, wordId, vocabulary) {
  const result = { kind: "assigned", wordId, dateKey, word: dependencies.vocabulary.findWord(vocabulary, wordId) };
  const wordState = profile.wordStates[wordId];
  const status = profile.assignments[dateKey]?.status ?? wordState?.status;
  if (status) result.status = status;
  if (wordState?.saved === true) result.saved = true;
  if (profile.showEnglish === false) result.showEnglish = false;
  return result;
}

function warning(result, hasWarning) {
  return hasWarning ? { ...result, storageWarning: true } : result;
}

async function assignment(requestedDateKey) {
  const vocabulary = await getVocabulary();
  const loaded = await loadProfile(vocabulary);
  if (loaded.recoveryRaw !== undefined) return recovery(loaded);
  const currentDateKey = dependencies.date.getLocalDateKey(new Date());
  const dateKey = requestedDateKey ?? currentDateKey;
  if (requestedDateKey && !Object.hasOwn(loaded.profile.assignments, dateKey)) return warning({ kind: "no-new-word", dateKey }, loaded.warning);
  const selected = await dependencies.selector.selectDaily({ vocabulary, profile: loaded.profile, dateKey });
  if (selected.kind !== "assigned") return warning(selected, loaded.warning);
  if (Object.hasOwn(loaded.profile.assignments, dateKey)) return warning(assignedResult(loaded.profile, dateKey, selected.wordId, vocabulary), loaded.warning);
  if (loaded.profile.assignmentOrdinal === Number.MAX_SAFE_INTEGER) throw new RangeError("Assignment counter exhausted.");
  const profile = dependencies.state.pruneAssignments({
    ...loaded.profile,
    assignments: { ...loaded.profile.assignments, [dateKey]: { wordId: selected.wordId } },
    assignmentOrdinal: loaded.profile.assignmentOrdinal + 1,
    recentIds: [selected.wordId, ...loaded.profile.recentIds.filter((id) => id !== selected.wordId)].slice(0, 16),
  });
  return warning(assignedResult(profile, dateKey, selected.wordId, vocabulary), await persistProfile(profile, loaded));
}

async function updateProfile(change, resultFields = () => ({})) {
  const vocabulary = await getVocabulary();
  const loaded = await loadProfile(vocabulary);
  if (loaded.recoveryRaw !== undefined) return recovery(loaded);
  const profile = await change(loaded.profile, vocabulary);
  return warning({ kind: "ok", ...resultFields(profile) }, await persistProfile(profile, loaded));
}

function exactMessage(message, keys) {
  return message && typeof message === "object" && !Array.isArray(message)
    && Object.keys(message).every((key) => keys.has(key));
}

async function configureReminder(message) {
  if (!exactMessage(message, new Set(["type", "enabled", "time"])) || typeof message.enabled !== "boolean" || (message.time !== undefined && !timeIsValid(message.time))) throw new TypeError("Invalid reminder.");
  registerReminderListeners();
  const current = await readReminder();
  const requested = { enabled: message.enabled, time: message.time ?? current.time };
  if (!requested.enabled || !await reminderPermissions()) return disableReminder(requested.time, current);
  const snapshot = await readReminderAlarm();
  try {
    await ExtApi.storage.local.set({ [REMINDER_KEY]: requested });
  } catch (_) {
    return warningReminder(current);
  }
  try {
    await scheduleReminder(requested);
    return (await clearReminderWarning()) ? { ...requested, storageWarning: true } : requested;
  } catch (_) {
    const rollback = await rollbackReminder(current, snapshot);
    return warningReminder(rollback.actual);
  }
}

async function readReminder() {
  const stored = await ExtApi.storage.local.get(REMINDER_KEY);
  return validReminder(stored[REMINDER_KEY]) ? stored[REMINDER_KEY] : { ...DEFAULT_REMINDER };
}

async function readReminderWarning() {
  try {
    const stored = await ExtApi.storage.local.get(REMINDER_WARNING_KEY);
    if (stored[REMINDER_WARNING_KEY] === true) {
      reminderWarningFallback = false;
      return true;
    }
    if (!reminderWarningFallback) return false;
    await setReminderWarning(true);
    return true;
  } catch (_) {
    return true;
  }
}

async function setReminderWarning(value) {
  try {
    await ExtApi.storage.local.set({ [REMINDER_WARNING_KEY]: value });
    reminderWarningFallback = false;
    return false;
  } catch (_) {
    if (value) reminderWarningFallback = true;
    return true;
  }
}

async function clearReminderWarning() {
  return (await readReminderWarning()) ? setReminderWarning(false) : false;
}

async function warningReminder(result) {
  await setReminderWarning(true);
  return { ...result, storageWarning: true };
}

async function reminderPermissions() {
  if (typeof ExtApi?.alarms?.get !== "function" || typeof ExtApi?.alarms?.create !== "function" || typeof ExtApi?.alarms?.clear !== "function" || typeof ExtApi?.notifications?.create !== "function") return false;
  try {
    return await ExtApi.permissions.contains({ permissions: ["alarms", "notifications"] });
  } catch (_) {
    return false;
  }
}

async function clearReminder() {
  if (ExtApi?.alarms) await ExtApi.alarms.clear(REMINDER_ALARM);
}

async function readReminderAlarm() {
  if (typeof ExtApi?.alarms?.get !== "function") return { alarm: null, alarmSnapshotKnown: false };
  try {
    return { alarm: await ExtApi.alarms.get(REMINDER_ALARM), alarmSnapshotKnown: true };
  } catch (_) {
    return { alarm: null, alarmSnapshotKnown: false };
  }
}

function alarmDetails(alarm) {
  if (!alarm || typeof alarm !== "object") return null;
  const when = alarm.when ?? alarm.scheduledTime;
  if (Number.isFinite(when)) return { when };
  const details = {};
  for (const key of ["delayInMinutes", "periodInMinutes"]) if (Number.isFinite(alarm[key])) details[key] = alarm[key];
  return Object.keys(details).length ? details : null;
}

async function scheduleReminder(settings) {
  if (!settings.enabled) return clearReminder();
  if (!await reminderPermissions()) throw new Error("Reminder permissions unavailable.");
  const when = nextOccurrence(settings.time);
  const existing = await ExtApi.alarms.get(REMINDER_ALARM);
  if (!existing || (existing.scheduledTime ?? existing.when) !== when) await ExtApi.alarms.create(REMINDER_ALARM, { when });
}

async function restoreAlarm(snapshot) {
  if (!snapshot.alarmSnapshotKnown) return false;
  const alarm = snapshot.alarm;
  let failed = false;
  try { await clearReminder(); } catch (_) { failed = true; }
  if (alarm) {
    const details = alarmDetails(alarm);
    if (!details) failed = true;
    else {
      try { await ExtApi.alarms.create(REMINDER_ALARM, details); } catch (_) { failed = true; }
    }
  }
  return failed;
}

async function rollbackReminder(current, snapshot) {
  let failed = false;
  try { await ExtApi.storage.local.set({ [REMINDER_KEY]: current }); } catch (_) { failed = true; }
  failed ||= await restoreAlarm(snapshot);
  let actual = current;
  try { actual = await readReminder(); } catch (_) { /* keep the last authoritative snapshot */ }
  return { actual, failed };
}

async function disableReminder(time, currentOverride = null) {
  let current = currentOverride;
  if (!current) {
    try { current = await readReminder(); }
    catch (_) { return warningReminder({ enabled: false, time }); }
  }
  const snapshot = await readReminderAlarm();
  const disabled = { enabled: false, time };
  try {
    await ExtApi.storage.local.set({ [REMINDER_KEY]: disabled });
  } catch (_) {
    return warningReminder(current);
  }
  try {
    await clearReminder();
    return (await clearReminderWarning()) ? { ...disabled, storageWarning: true } : disabled;
  } catch (_) {
    const rollback = await rollbackReminder(current, snapshot);
    return warningReminder(rollback.actual);
  }
}

async function ensureReminderNow() {
  const settings = await readReminder();
  if (!settings.enabled) {
    try {
      await clearReminder();
      return (await clearReminderWarning()) ? { ...settings, storageWarning: true } : settings;
    } catch (_) {
      return warningReminder(settings);
    }
  }
  if (!await reminderPermissions()) return disableReminder(settings.time, settings);
  try {
    await scheduleReminder(settings);
    return (await clearReminderWarning()) ? { ...settings, storageWarning: true } : settings;
  } catch (_) {
    return warningReminder(settings);
  }
}

function ensureReminder() {
  return serialized(ensureReminderNow);
}

function eventEntry(work) {
  return (...args) => serialized(() => work(...args)).catch(() => undefined);
}

async function notificationClick(notificationId) {
  if (notificationId !== REMINDER_ALARM) return;
  await ExtApi.tabs.create({ url: ExtApi.runtime.getURL("atlas/atlas.html") });
}

async function alarmFired(alarm) {
  if (!alarm || alarm.name !== REMINDER_ALARM) return;
  try { await clearReminder(); }
  catch (_) { await setReminderWarning(true); return; }
  const settings = await ensureReminderNow();
  if (settings.enabled) {
    if (typeof ExtApi?.notifications?.create !== "function") return warningReminder(settings);
    await ExtApi.notifications.create(REMINDER_ALARM, {
      type: "basic",
      iconUrl: ExtApi.runtime.getURL("icons/icon-128.png"),
      title: "كلمات",
      message: "كلمتك العربية جاهزة.",
    });
  }
}

function escapeXml(unsafe) {
  if (typeof unsafe !== "string") return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function updateBadge(profile, vocabulary) {
  if (!ExtApi?.action || typeof ExtApi.action.setBadgeText !== "function") return;
  try {
    const todayKey = dependencies.date.todayDateKey ? dependencies.date.todayDateKey() : dependencies.date.getLocalDateKey(new Date());
    const dueWords = dependencies.state.getDueReviewWords ? dependencies.state.getDueReviewWords(profile, vocabulary, todayKey) : [];
    const count = dueWords.length;
    if (count > 0) {
      await ExtApi.action.setBadgeText({ text: String(count) });
      if (typeof ExtApi.action.setBadgeBackgroundColor === "function") {
        await ExtApi.action.setBadgeBackgroundColor({ color: "#2E7D32" });
      }
    } else {
      await ExtApi.action.setBadgeText({ text: "" });
    }
  } catch (_) {}
}

function ensureContextMenu() {
  if (typeof ExtApi?.contextMenus?.create === "function") {
    try {
      const result = ExtApi.contextMenus.create({
        id: "kalimat-lookup-selection",
        title: "ابحث في كَلِمات",
        contexts: ["selection"],
      }, () => {
        if (ExtApi.runtime?.lastError) {
          // Ignored if already created
        }
      });
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (_) {}
  }
}

function registerReminderListeners() {
  if (!alarmListenerRegistered && typeof ExtApi?.alarms?.onAlarm?.addListener === "function") {
    ExtApi.alarms.onAlarm.addListener(eventEntry(alarmFired));
    alarmListenerRegistered = true;
  }
  if (!notificationListenerRegistered && typeof ExtApi?.notifications?.onClicked?.addListener === "function") {
    ExtApi.notifications.onClicked.addListener(eventEntry(notificationClick));
    notificationListenerRegistered = true;
  }
}

function handleMessage(message) {
  return serialized(async () => {
    if (!message || typeof message.type !== "string") throw new TypeError("Invalid message.");
    if (message.type === "assignment.get") {
      if (!exactMessage(message, new Set(["type", "dateKey"])) || (message.dateKey !== undefined && !dependencies.date.isDateKey(message.dateKey))) throw new TypeError("Invalid assignment.");
      return assignment(message.dateKey);
    }
    if (message.type === "review.queue") {
      if (!exactMessage(message, new Set(["type", "dateKey", "limit"]))) throw new TypeError("Invalid review queue.");
      const vocabulary = await getVocabulary();
      const loaded = await loadProfile(vocabulary);
      if (loaded.recoveryRaw !== undefined) return recovery(loaded);
      const dateKey = message.dateKey || (dependencies.date.todayDateKey ? dependencies.date.todayDateKey() : dependencies.date.getLocalDateKey(new Date()));
      const dueWords = dependencies.state.getDueReviewWords(loaded.profile, vocabulary, dateKey, message.limit);
      return { kind: "queue", words: dueWords, dueCount: dueWords.length };
    }
    if (message.type === "word.review") {
      if (!exactMessage(message, new Set(["type", "wordId", "rating", "dateKey"]))) throw new TypeError("Invalid review.");
      const vocabulary = await getVocabulary();
      const loaded = await loadProfile(vocabulary);
      if (loaded.recoveryRaw !== undefined) return recovery(loaded);
      const dateKey = message.dateKey || (dependencies.date.todayDateKey ? dependencies.date.todayDateKey() : dependencies.date.getLocalDateKey(new Date()));
      const updatedProfile = dependencies.state.recordReview(loaded.profile, message.wordId, message.rating, dateKey, vocabulary);
      const warningResult = loaded.recoveryRaw !== undefined ? await saveProfile(updatedProfile) : await persistProfile(updatedProfile, loaded);
      await updateBadge(updatedProfile, vocabulary);
      const dueWords = dependencies.state.getDueReviewWords(updatedProfile, vocabulary, dateKey);
      const targetId = typeof message.wordId === "number" ? message.wordId : (String(message.wordId).startsWith("w") ? parseInt(String(message.wordId).slice(1), 10) : message.wordId);
      return {
        kind: "ok",
        srs: updatedProfile.srs ? (updatedProfile.srs[targetId] || updatedProfile.srs[message.wordId]) : null,
        dueCount: dueWords.length,
        storageWarning: warningResult,
      };
    }
    if (message.type === "review.stats") {
      if (!exactMessage(message, new Set(["type", "dateKey"]))) throw new TypeError("Invalid review stats.");
      const vocabulary = await getVocabulary();
      const loaded = await loadProfile(vocabulary);
      if (loaded.recoveryRaw !== undefined) return recovery(loaded);
      const dateKey = message.dateKey || (dependencies.date.todayDateKey ? dependencies.date.todayDateKey() : dependencies.date.getLocalDateKey(new Date()));
      const stats = dependencies.state.getReviewStats(loaded.profile, vocabulary, dateKey);
      return { kind: "stats", stats };
    }
    if (message.type === "settings.get") {
      if (!exactMessage(message, new Set(["type"]))) throw new TypeError("Invalid settings.");
      const reminder = await readReminder();
      const settings = { kind: "settings", reminder };
      return (await readReminderWarning()) ? { ...settings, storageWarning: true } : settings;
    }
    if (message.type === "onboarding.complete") {
      if (!exactMessage(message, new Set(["type", "level", "interests"]))) throw new TypeError("Invalid onboarding.");
      const vocabulary = await getVocabulary();
      const loaded = await loadProfile(vocabulary);
      if (loaded.recoveryRaw !== undefined) return recovery(loaded);
      const checked = dependencies.state.validateStoredProfile({ ...loaded.profile, level: message.level ?? 1, interests: message.interests ?? [] }, vocabulary);
      if (!checked.canPersist) throw new TypeError("Invalid onboarding.");
      return warning({ kind: "ok" }, await persistProfile(checked.profile, loaded));
    }
    if (message.type === "word.feedback") {
      if (!exactMessage(message, new Set(["type", "dateKey", "wordId", "status"]))) throw new TypeError("Invalid feedback.");
      return updateProfile(
        (profile) => dependencies.state.applyFeedback(profile, { dateKey: message.dateKey, wordId: message.wordId, status: message.status }),
        (profile) => ({ wordId: message.wordId, dateKey: message.dateKey, status: profile.assignments[message.dateKey]?.status }),
      );
    }
    if (message.type === "word.save") return updateProfile(async (profile, vocabulary) => {
      if (!exactMessage(message, new Set(["type", "wordId", "saved"])) || typeof message.wordId !== "string" || typeof message.saved !== "boolean" || !vocabulary.some((word) => word.id === message.wordId)) throw new TypeError("Invalid save.");
      return { ...profile, wordStates: { ...profile.wordStates, [message.wordId]: { ...profile.wordStates[message.wordId], saved: message.saved } } };
    }, (profile) => ({ wordId: message.wordId, saved: profile.wordStates[message.wordId]?.saved === true }));
    if (message.type === "settings.update") return updateProfile((profile, vocabulary) => {
      if (!exactMessage(message, new Set(["type", "level", "interests", "showEnglish"])) || (message.showEnglish !== undefined && typeof message.showEnglish !== "boolean")) throw new TypeError("Invalid settings.");
      const checked = dependencies.state.validateStoredProfile({ ...profile, level: message.level ?? profile.level, interests: message.interests ?? profile.interests, showEnglish: message.showEnglish ?? profile.showEnglish }, vocabulary);
      if (!checked.canPersist) throw new TypeError("Invalid settings.");
      return checked.profile;
    });
    if (message.type === "state.export") {
      if (!exactMessage(message, new Set(["type"]))) throw new TypeError("Invalid export.");
      const vocabulary = await getVocabulary();
      const loaded = await loadProfile(vocabulary);
      return loaded.recoveryRaw !== undefined ? recovery(loaded) : warning({ kind: "export", text: dependencies.state.serializeExport(loaded.profile) }, loaded.warning);
    }
    if (message.type === "state.import") {
      if (!exactMessage(message, new Set(["type", "text"]))) throw new TypeError("Invalid import.");
      const vocabulary = await getVocabulary();
      const loaded = await loadProfile(vocabulary);
      const profile = dependencies.state.parseImport(message.text, vocabulary);
      return warning({ kind: "ok" }, loaded.recoveryRaw !== undefined ? await saveProfile(profile) : await persistProfile(profile, loaded));
    }
    if (message.type === "state.clear") {
      if (!exactMessage(message, new Set(["type"]))) throw new TypeError("Invalid clear.");
      const vocabulary = await getVocabulary();
      const loaded = await loadProfile(vocabulary);
      const profile = dependencies.state.createProfile({ seedHex: randomSeed() });
      const profileWarning = loaded.recoveryRaw !== undefined ? await saveProfile(profile) : await persistProfile(profile, loaded);
      let reminderWarning = false;
      let reminderTime = DEFAULT_REMINDER.time;
      try { reminderTime = (await readReminder()).time; } catch (_) { reminderWarning = true; }
      const reminder = await disableReminder(reminderTime);
      reminderWarning ||= reminder.storageWarning === true;
      return warning({ kind: "ok", reminderWarning }, profileWarning || reminderWarning);
    }
    if (message.type === "reminder.configure") return configureReminder(message);
    if (message.type === "online.lookup") {
      if (!exactMessage(message, new Set(["type", "query"])) || typeof message.query !== "string") {
        throw new TypeError("Invalid lookup.");
      }
      const lookupApi = dependencies.lookup ?? (typeof require === "function" ? require("./shared/lookup.js") : globalThis.KalimatLookup);
      let validatedQuery;
      try {
        validatedQuery = lookupApi.validateQuery(message.query);
      } catch (_) {
        throw new TypeError("Invalid lookup.");
      }

      let hasHostPerm = false;
      if (typeof ExtApi?.permissions?.contains === "function") {
        try {
          hasHostPerm = await ExtApi.permissions.contains({ origins: ["https://ar.wiktionary.org/*"] });
        } catch (_) {
          hasHostPerm = false;
        }
      }

      if (!hasHostPerm) {
        if (typeof globalThis.browser !== "undefined" && typeof globalThis.chrome === "undefined") {
          return { kind: "unsupported" };
        }
        return { kind: "permission-needed" };
      }

      return lookupApi.performLookup(validatedQuery, globalThis.fetch);
    }
    throw new TypeError("Unknown message.");
  });
}

ExtApi?.runtime?.onMessage?.addListener?.(handleMessage);
ExtApi?.runtime?.onStartup?.addListener?.(eventEntry(ensureReminderNow));
ExtApi?.runtime?.onInstalled?.addListener?.(eventEntry(ensureReminderNow));
registerReminderListeners();
ensureContextMenu();

if (typeof ExtApi?.contextMenus?.onClicked?.addListener === "function") {
  ExtApi.contextMenus.onClicked.addListener(eventEntry(async (info) => {
    const text = typeof info?.selectionText === "string" ? info.selectionText.trim() : "";
    if (!text) return;
    if (typeof ExtApi.tabs?.create === "function") {
      await ExtApi.tabs.create({ url: ExtApi.runtime.getURL(`atlas/atlas.html?view=explore&q=${encodeURIComponent(text)}`) });
    }
  }));
}

if (typeof ExtApi?.omnibox?.onInputChanged?.addListener === "function") {
  ExtApi.omnibox.onInputChanged.addListener(async (text, suggest) => {
    try {
      const query = (text || "").trim();
      if (!query) {
        suggest([]);
        return;
      }
      const vocabulary = await getVocabulary();
      let ranked;
      if (typeof dependencies.vocabulary.rankVocabulary === "function") {
        ranked = dependencies.vocabulary.rankVocabulary(vocabulary, query);
      } else {
        const norm = query.normalize("NFD").replace(/[\u064B-\u065F\u0670]/g, "");
        ranked = vocabulary.filter((w) => (w.word && w.word.includes(norm)) || (w.meaningAr && w.meaningAr.includes(norm)));
      }

      const suggestions = ranked.slice(0, 6).map((word) => {
        const headword = escapeXml(word.word || "");
        const meaning = escapeXml(word.meaningAr || word.meaning || "");
        const en = escapeXml(word.englishMeaning || word.meaningEn || "");
        const desc = `<match>${headword}</match> <dim>—</dim> ${meaning} <dim>(${en})</dim>`;
        return {
          content: String(word.id),
          description: desc,
        };
      });
      suggest(suggestions);
    } catch (_) {
      suggest([]);
    }
  });
}

if (typeof ExtApi?.omnibox?.onInputEntered?.addListener === "function") {
  ExtApi.omnibox.onInputEntered.addListener(async (text) => {
    try {
      const query = (text || "").trim();
      if (!query) return;
      if (typeof ExtApi.tabs?.create === "function") {
        await ExtApi.tabs.create({ url: ExtApi.runtime.getURL(`atlas/atlas.html?view=explore&q=${encodeURIComponent(query)}`) });
      }
    } catch (_) {}
  });
}

if (ExtApi?.permissions?.onRemoved) ExtApi.permissions.onRemoved.addListener(eventEntry(async (removed) => {
  if (removed?.permissions?.some((permission) => permission === "alarms" || permission === "notifications")) await ensureReminderNow();
}));
if (ExtApi) eventEntry(ensureReminderNow)();

if (typeof module === "object" && module.exports) module.exports = { handleMessage, ensureReminder, updateBadge, escapeXml, ensureContextMenu };
