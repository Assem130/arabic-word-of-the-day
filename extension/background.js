if (!globalThis.KalimatVocabulary && typeof importScripts === "function") {
  importScripts("shared/api.js", "shared/date.js", "shared/vocabulary.js", "shared/state.js", "shared/selector.js");
}

const dependencies = typeof module === "object" && module.exports
  ? {
    date: require("./shared/date.js"),
    vocabulary: require("./shared/vocabulary.js"),
    state: require("./shared/state.js"),
    selector: require("./shared/selector.js"),
  }
  : { date: globalThis.KalimatDate, vocabulary: globalThis.KalimatVocabulary, state: globalThis.KalimatState, selector: globalThis.KalimatSelector };
const ExtApi = globalThis.browser ?? globalThis.chrome;
const PROFILE_KEY = "kalimat.profile";
const REMINDER_KEY = "kalimat.reminder";
const REMINDER_ALARM = "kalimat.reminder";
const DEFAULT_REMINDER = Object.freeze({ enabled: false, time: "09:00" });
let queue = Promise.resolve();
let sessionFallback = null;
let vocabularyPromise = null;

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

function assignedResult(profile, dateKey, wordId) {
  const result = { kind: "assigned", wordId, dateKey };
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
  if (Object.hasOwn(loaded.profile.assignments, dateKey)) return warning(assignedResult(loaded.profile, dateKey, selected.wordId), loaded.warning);
  if (loaded.profile.assignmentOrdinal === Number.MAX_SAFE_INTEGER) throw new RangeError("Assignment counter exhausted.");
  const profile = dependencies.state.pruneAssignments({
    ...loaded.profile,
    assignments: { ...loaded.profile.assignments, [dateKey]: { wordId: selected.wordId } },
    assignmentOrdinal: loaded.profile.assignmentOrdinal + 1,
    recentIds: [selected.wordId, ...loaded.profile.recentIds.filter((id) => id !== selected.wordId)].slice(0, 16),
  });
  return warning(assignedResult(profile, dateKey, selected.wordId), await persistProfile(profile, loaded));
}

async function updateProfile(change) {
  const vocabulary = await getVocabulary();
  const loaded = await loadProfile(vocabulary);
  if (loaded.recoveryRaw !== undefined) return recovery(loaded);
  const profile = await change(loaded.profile, vocabulary);
  return warning({ kind: "ok" }, await persistProfile(profile, loaded));
}

function exactMessage(message, keys) {
  return message && typeof message === "object" && !Array.isArray(message)
    && Object.keys(message).every((key) => keys.has(key));
}

async function configureReminder(message) {
  if (!exactMessage(message, new Set(["type", "enabled", "time"])) || typeof message.enabled !== "boolean" || (message.time !== undefined && !timeIsValid(message.time))) throw new TypeError("Invalid reminder.");
  const current = await readReminder();
  const requested = { enabled: message.enabled, time: message.time ?? current.time };
  if (!requested.enabled || !await reminderPermissions()) {
    return disableReminder(requested.time);
  }
  try {
    await ExtApi.storage.local.set({ [REMINDER_KEY]: requested });
  } catch (_) {
    await clearReminder().catch(() => undefined);
    return { ...current, storageWarning: true };
  }
  await clearReminder();
  await ensureReminderNow();
  return readReminder();
}

async function readReminder() {
  const stored = await ExtApi.storage.local.get(REMINDER_KEY);
  return validReminder(stored[REMINDER_KEY]) ? stored[REMINDER_KEY] : { ...DEFAULT_REMINDER };
}

async function reminderPermissions() {
  try {
    return await ExtApi.permissions.contains({ permissions: ["alarms", "notifications"] });
  } catch (_) {
    return false;
  }
}

async function clearReminder() {
  if (ExtApi.alarms) await ExtApi.alarms.clear(REMINDER_ALARM);
}

async function disableReminder(time) {
  const disabled = { enabled: false, time };
  let failed = false;
  try {
    await ExtApi.storage.local.set({ [REMINDER_KEY]: disabled });
  } catch (_) {
    failed = true;
  }
  try { await clearReminder(); } catch (_) { failed = true; }
  return failed ? { ...disabled, storageWarning: true } : disabled;
}

async function ensureReminderNow() {
  const settings = await readReminder();
  if (!settings.enabled) {
    await clearReminder();
    return settings;
  }
  if (!await reminderPermissions()) {
    return disableReminder(settings.time);
  }
  const when = nextOccurrence(settings.time);
  const existing = await ExtApi.alarms.get(REMINDER_ALARM);
  if (!existing || (existing.scheduledTime ?? existing.when) !== when) {
    if (existing) await clearReminder();
    await ExtApi.alarms.create(REMINDER_ALARM, { when });
  }
  return settings;
}

function ensureReminder() {
  return serialized(ensureReminderNow);
}

function eventEntry(work) {
  return (...args) => serialized(() => work(...args)).catch(() => undefined);
}

async function notificationClick(notificationId) {
  if (notificationId !== REMINDER_ALARM) return;
  const dateKey = dependencies.date.getLocalDateKey(new Date());
  await ExtApi.tabs.create({ url: ExtApi.runtime.getURL(`atlas/atlas.html?date=${encodeURIComponent(dateKey)}`) });
}

async function alarmFired(alarm) {
  if (!alarm || alarm.name !== REMINDER_ALARM) return;
  await clearReminder();
  const settings = await ensureReminderNow();
  if (settings.enabled) {
    await ExtApi.notifications.create(REMINDER_ALARM, {
      type: "basic",
      iconUrl: ExtApi.runtime.getURL("icons/icon-128.png"),
      title: "كلمات",
      message: "كلمتك العربية جاهزة.",
    });
  }
}

function handleMessage(message) {
  return serialized(async () => {
    if (!message || typeof message.type !== "string") throw new TypeError("Invalid message.");
    if (message.type === "assignment.get") {
      if (!exactMessage(message, new Set(["type", "dateKey"])) || (message.dateKey !== undefined && !dependencies.date.isDateKey(message.dateKey))) throw new TypeError("Invalid assignment.");
      return assignment(message.dateKey);
    }
    if (message.type === "settings.get") {
      if (!exactMessage(message, new Set(["type"]))) throw new TypeError("Invalid settings.");
      return { kind: "settings", reminder: await readReminder() };
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
      return updateProfile((profile) => dependencies.state.applyFeedback(profile, { dateKey: message.dateKey, wordId: message.wordId, status: message.status }));
    }
    if (message.type === "word.save") return updateProfile(async (profile, vocabulary) => {
      if (!exactMessage(message, new Set(["type", "wordId", "saved"])) || typeof message.wordId !== "string" || typeof message.saved !== "boolean" || !vocabulary.some((word) => word.id === message.wordId)) throw new TypeError("Invalid save.");
      return { ...profile, wordStates: { ...profile.wordStates, [message.wordId]: { ...profile.wordStates[message.wordId], saved: message.saved } } };
    });
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
      return warning({ kind: "ok" }, profileWarning || reminderWarning);
    }
    if (message.type === "reminder.configure") return configureReminder(message);
    throw new TypeError("Unknown message.");
  });
}

ExtApi.runtime.onMessage.addListener(handleMessage);
ExtApi.runtime.onStartup.addListener(eventEntry(ensureReminderNow));
ExtApi.runtime.onInstalled.addListener(eventEntry(ensureReminderNow));
ExtApi.alarms.onAlarm.addListener(eventEntry(alarmFired));
ExtApi.notifications.onClicked.addListener(eventEntry(notificationClick));
if (ExtApi.permissions?.onRemoved) ExtApi.permissions.onRemoved.addListener(eventEntry(async (removed) => {
  if (removed?.permissions?.some((permission) => permission === "alarms" || permission === "notifications")) await ensureReminderNow();
}));
eventEntry(ensureReminderNow)();

if (typeof module === "object" && module.exports) module.exports = { handleMessage, ensureReminder };
