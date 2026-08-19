const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

globalThis.crypto ??= webcrypto;

const realVocabulary = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "vocabulary.json"), "utf8"));

function word(id, overrides = {}) {
  return {
    id,
    contentVersion: 1,
    word: "word",
    normalized: "word",
    pronunciation: "/word/",
    meaningAr: "meaning",
    meaningEn: "meaning",
    exampleAr: "example",
    difficultyBand: "beginner",
    usefulnessBand: "high",
    topics: ["language"],
    partOfSpeech: "noun",
    register: "standard",
    reviewed: true,
    ...overrides,
  };
}

function fakeEvent() {
  return { listeners: [], addListener(listener) { this.listeners.push(listener); } };
}

function fakeExtension({ profile, reminder, vocabulary = [word("w1"), word("w2")], storageFailure = false, storageSetFailures = 0, reminderWarningSetFailures = 0, permissions = true, hostPermissions = true, reminderApis = true, alarm, alarmGetFailures = 0, alarmCreateFailures = 0, alarmClearFailures = 0, notificationFailure = false, tabFailure = false, api = "chrome" } = {}) {
  const values = Object.create(null);
  if (profile !== undefined) values["kalimat.profile"] = profile;
  if (reminder !== undefined) values["kalimat.reminder"] = reminder;
  const alarms = new Map();
  if (alarm) alarms.set(alarm.name, alarm);
  const calls = { set: 0, clear: 0, create: [], contextMenus: [], notifications: [], tabs: [], permissionRequests: 0 };
  let remainingSetFailures = storageSetFailures;
  let remainingReminderWarningSetFailures = reminderWarningSetFailures;
  let remainingAlarmGetFailures = alarmGetFailures;
  let remainingAlarmCreateFailures = alarmCreateFailures;
  let remainingAlarmClearFailures = alarmClearFailures;
  let storageAvailable = !storageFailure;
  let permissionsGranted = permissions;
  let hostPermissionsGranted = hostPermissions;
  const runtime = { onMessage: fakeEvent(), onStartup: fakeEvent(), onInstalled: fakeEvent(), getURL: (path) => `extension://kalimat/${path}` };
  const alarmApi = {
    onAlarm: fakeEvent(),
    async get(name) { if (remainingAlarmGetFailures-- > 0) throw new Error("alarm unavailable"); return alarms.get(name); },
    async create(name, details) { if (remainingAlarmCreateFailures-- > 0) throw new Error("alarm unavailable"); calls.create.push({ name, details }); alarms.set(name, { name, ...details }); },
    async clear(name) { calls.clear += 1; if (remainingAlarmClearFailures-- > 0) throw new Error("alarm unavailable"); return alarms.delete(name); },
  };
  const notificationApi = {
    onClicked: fakeEvent(),
    async create(id, options) { if (notificationFailure) throw new Error("notification unavailable"); calls.notifications.push({ id, options }); },
  };
  const contextMenuApi = {
    onClicked: fakeEvent(),
    create(details, callback) { calls.contextMenus.push(details); callback?.(); },
  };
  const extension = {
    storage: { local: {
      async get(key) { if (!storageAvailable) throw new Error("storage unavailable"); return { [key]: values[key] }; },
      async set(next) {
        if (!storageAvailable || remainingSetFailures-- > 0 || (Object.hasOwn(next, "kalimat.reminder.warning") && remainingReminderWarningSetFailures-- > 0)) throw new Error("storage unavailable");
        calls.set += 1;
        Object.assign(values, next);
      },
    } },
    permissions: {
      onRemoved: fakeEvent(),
      async contains(query) {
        if (query?.origins?.length || query?.permissions?.some((p) => p.includes("wiktionary") || p.includes("wikimedia") || p.startsWith("http"))) {
          return hostPermissionsGranted;
        }
        return permissionsGranted;
      },
      async request(query) {
        calls.permissionRequests += 1;
        if (query?.origins?.length || query?.permissions?.some((p) => p.includes("wiktionary") || p.includes("wikimedia") || p.startsWith("http"))) {
          return hostPermissionsGranted;
        }
        return permissionsGranted;
      },
    },
    contextMenus: contextMenuApi,
    runtime,
    tabs: { async create(details) { if (tabFailure) throw new Error("tab unavailable"); calls.tabs.push(details); } },
  };
  function installReminderApis() {
    extension.alarms = alarmApi;
    extension.notifications = notificationApi;
  }
  if (reminderApis) installReminderApis();
  return { extension, values, alarms, calls, vocabulary, api, installReminderApis, setPermissions(value) { permissionsGranted = value; }, setHostPermissions(value) { hostPermissionsGranted = value; }, setStorageAvailable(value) { storageAvailable = value; } };
}

function loadBackground(options = {}) {
  const fake = fakeExtension(options);
  const prior = { chrome: globalThis.chrome, browser: globalThis.browser, fetch: globalThis.fetch };
  if (fake.api === "browser") {
    delete globalThis.chrome;
    globalThis.browser = fake.extension;
  } else {
    delete globalThis.browser;
    globalThis.chrome = fake.extension;
  }
  globalThis.fetch = async (url, fetchOptions) => {
    if (typeof url === "string" && url.includes("vocabulary.json")) {
      if (typeof options.vocabularyFetch === "function") return options.vocabularyFetch(url, fetchOptions);
      return { ok: true, async json() { return fake.vocabulary; }, async text() { return JSON.stringify(fake.vocabulary); } };
    }
    if (typeof options.fetch === "function") return options.fetch(url, fetchOptions);
    return { ok: true, async json() { return fake.vocabulary; }, async text() { return JSON.stringify(fake.vocabulary); } };
  };
  delete require.cache[require.resolve("../background.js")];
  const background = require("../background.js");
  return {
    ...fake,
    background,
    restore() {
      if (prior.chrome === undefined) delete globalThis.chrome; else globalThis.chrome = prior.chrome;
      if (prior.browser === undefined) delete globalThis.browser; else globalThis.browser = prior.browser;
      globalThis.fetch = prior.fetch;
      delete require.cache[require.resolve("../background.js")];
    },
  };
}

async function withBackground(options, callback) {
  const fixture = loadBackground(options);
  try { await callback(fixture); } finally { fixture.restore(); }
}

async function withLocalDay(day, callback) {
  const RealDate = globalThis.Date;
  globalThis.Date = class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [`${day}T12:00:00`])); }
  };
  try { await callback(); } finally { globalThis.Date = RealDate; }
}

function profile(overrides = {}) {
  const { createProfile } = require("../shared/state.js");
  return { ...createProfile({ seedHex: "a".repeat(32), level: 1, interests: ["language"] }), ...overrides };
}

test("concurrent assignment requests persist and return one local-day word", async () => {
  await withBackground({}, async ({ background, values }) => {
    await withLocalDay("2026-07-30", async () => {
      const results = await Promise.all([background.handleMessage({ type: "assignment.get" }), background.handleMessage({ type: "assignment.get" })]);
      assert.deepEqual(results[0], results[1]);
      assert.equal(Object.keys(values["kalimat.profile"].assignments).length, 1);
      assert.equal(values["kalimat.profile"].assignmentOrdinal, 1);
    });
  });
});

test("Firefox browser APIs use the same background message adapter", async () => {
  await withBackground({ api: "browser" }, async ({ background, extension }) => {
    assert.equal(extension.runtime.onMessage.listeners.length, 1);
    await withLocalDay("2026-07-30", async () => {
      const result = await background.handleMessage({ type: "assignment.get" });
      assert.equal(result.kind, "assigned");
      assert.equal(result.dateKey, "2026-07-30");
    });
  });
});

test("first-run background serves settings and assignments without optional reminder APIs", async () => {
  let fixture;
  assert.doesNotThrow(() => { fixture = loadBackground({ permissions: false, reminderApis: false }); });
  try {
    assert.deepEqual(await fixture.background.handleMessage({ type: "settings.get" }), { kind: "settings", reminder: { enabled: false, time: "09:00" } });
    assert.equal((await fixture.background.handleMessage({ type: "assignment.get" })).kind, "assigned");
  } finally { fixture?.restore(); }
});

test("real numeric vocabulary keeps assignment, save, and review canonical and transactional", async () => {
  await withBackground({ vocabulary: realVocabulary, permissions: false, reminderApis: false }, async ({ background, values }) => {
    await withLocalDay("2026-08-17", async () => {
      const assigned = await background.handleMessage({ type: "assignment.get" });
      assert.equal(assigned.kind, "assigned");
      assert.equal(Number.isInteger(assigned.wordId), true);
      assert.ok(assigned.wordId >= 1 && assigned.wordId <= realVocabulary.length);

      const saved = await background.handleMessage({ type: "word.save", wordId: `w${assigned.wordId}`, saved: true });
      assert.equal(saved.kind, "ok");
      assert.equal(saved.wordId, assigned.wordId);
      assert.equal(saved.saved, true);

      const beforeInvalid = JSON.stringify(values["kalimat.profile"]);
      await assert.rejects(background.handleMessage({ type: "word.review", wordId: "w999", rating: "good", dateKey: "2026-08-17" }), /unknown/i);
      await assert.rejects(background.handleMessage({ type: "word.review", wordId: assigned.wordId, rating: "invalid", dateKey: "2026-08-17" }), /rating/i);
      assert.equal(JSON.stringify(values["kalimat.profile"]), beforeInvalid);

      const reviewed = await background.handleMessage({ type: "word.review", wordId: `w${assigned.wordId}`, rating: "good", dateKey: "2026-08-17" });
      assert.equal(reviewed.kind, "ok");
      assert.equal(reviewed.srs.wordId, assigned.wordId);
      assert.equal(reviewed.srs.reviewCount, 1);
      const afterReview = JSON.stringify(values["kalimat.profile"]);

      const replay = await background.handleMessage({ type: "word.review", wordId: assigned.wordId, rating: "good", dateKey: "2026-08-17" });
      assert.equal(replay.srs.reviewCount, 1);
      assert.equal(JSON.stringify(values["kalimat.profile"]), afterReview);
    });
  });
});

test("a rejected vocabulary load is cleared so the next message can retry", async () => {
  let attempts = 0;
  await withBackground({
    vocabularyFetch: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 503 };
      return { ok: true, async json() { return [word("w1"), word("w2")]; } };
    },
  }, async ({ background, vocabulary }) => {
    await assert.rejects(background.handleMessage({ type: "assignment.get" }), /Vocabulary unavailable/);
    let result;
    await withLocalDay("2026-07-30", async () => { result = await background.handleMessage({ type: "assignment.get" }); });
    assert.equal(result.kind, "assigned");
    assert.equal(result.word.id, result.wordId);
    assert.ok(vocabulary.some((item) => item.id === result.word.id));
  });
  assert.equal(attempts, 2);
});

test("review queue reports total and remaining counts when the daily limit caps visibility", async () => {
  const vocabulary = Array.from({ length: 21 }, (_, index) => word(`w${index + 1}`));
  const base = profile({
    srs: Object.fromEntries(vocabulary.map((item) => [item.id, {
      wordId: item.id,
      repetition: 0,
      interval: 0,
      ef: 2.5,
      nextReviewDate: "2026-08-17",
      lastReviewedDate: null,
      reviewCount: 0,
      lapses: 0,
      history: [],
    }])),
    history: Object.fromEntries(vocabulary.map((item) => [item.id, { firstSeen: "2026-08-17" }])),
  });

  await withBackground({ profile: base, vocabulary, permissions: false, reminderApis: false }, async ({ background }) => {
    const result = await background.handleMessage({ type: "review.queue", dateKey: "2026-08-17" });
    assert.equal(result.kind, "queue");
    assert.equal(result.dueCount, 21);
    assert.equal(result.visibleCount, 20);
    assert.equal(result.remainingCount, 1);
    assert.equal(result.words.length, 20);
  });
});

test("browser background bootstrap imports the six shared domain modules", async () => {
  const fake = fakeExtension({ permissions: false, reminderApis: false });
  const imported = [];
  const context = vm.createContext({ chrome: fake.extension, console, crypto: webcrypto, TextEncoder, fetch: async () => ({ ok: true, async json() { return fake.vocabulary; } }) });
  context.globalThis = context;
  context.importScripts = (...relativePaths) => {
    for (const relative of relativePaths) {
      imported.push(relative);
      vm.runInContext(fs.readFileSync(path.join(__dirname, "..", relative), "utf8"), context, { filename: relative });
    }
  };
  assert.doesNotThrow(() => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), context, { filename: "background.js" }));
  assert.deepEqual(imported, ["shared/date.js", "shared/vocabulary.js", "shared/review-policy.js", "shared/state.js", "shared/selector.js", "shared/lookup.js"]);
  for (const name of ["KalimatDate", "KalimatVocabulary", "KalimatReviewPolicy", "KalimatState", "KalimatSelector", "KalimatLookup"]) assert.equal(typeof context[name], "object");
  assert.equal((await fake.extension.runtime.onMessage.listeners[0]({ type: "settings.get" })).kind, "settings");
});

test("background registers the selection context menu on worker startup", () => {
  const fixture = loadBackground({ permissions: false, reminderApis: false });
  try {
    assert.deepEqual(fixture.calls.contextMenus, [{
      id: "kalimat-lookup-selection",
      title: "ابحث في كَلِمات",
      contexts: ["selection"],
    }]);
    assert.equal(fixture.extension.contextMenus.onClicked.listeners.length, 1);
  } finally { fixture.restore(); }
});

test("reminder configuration registers newly available optional API listeners once", async () => {
  await withBackground({ permissions: false, reminderApis: false }, async ({ background, extension, installReminderApis, setPermissions }) => {
    installReminderApis();
    setPermissions(true);
    assert.deepEqual(await background.handleMessage({ type: "reminder.configure", enabled: true, time: "09:00" }), { enabled: true, time: "09:00" });
    await background.handleMessage({ type: "reminder.configure", enabled: true, time: "10:00" });
    assert.equal(extension.alarms.onAlarm.listeners.length, 1);
    assert.equal(extension.notifications.onClicked.listeners.length, 1);
  });
});

test("available optional reminder APIs register listeners synchronously on worker restart", () => {
  const fixture = loadBackground({ permissions: true });
  try {
    assert.equal(fixture.extension.alarms.onAlarm.listeners.length, 1);
    assert.equal(fixture.extension.notifications.onClicked.listeners.length, 1);
  } finally { fixture.restore(); }
});

test("an existing assignment survives feedback and settings changes", async () => {
  const existing = profile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  await withBackground({ profile: existing }, async ({ background }) => {
    await background.handleMessage({ type: "word.feedback", dateKey: "2026-07-30", wordId: "w1", status: "known" });
    await background.handleMessage({ type: "settings.update", level: 2, interests: ["travel"] });
    await withLocalDay("2026-07-30", async () => {
      assert.deepEqual(await background.handleMessage({ type: "assignment.get" }), { kind: "assigned", wordId: "w1", dateKey: "2026-07-30", word: word("w1"), status: "known" });
    });
  });
});

test("feedback rejects unknown message fields before changing profile state", async () => {
  const existing = profile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  await withBackground({ profile: existing }, async ({ background, values }) => {
    await assert.rejects(background.handleMessage({ type: "word.feedback", dateKey: "2026-07-30", wordId: "w1", status: "known", extra: true }), /Invalid feedback/);
    assert.equal(values["kalimat.profile"].assignments["2026-07-30"].status, undefined);
  });
});

test("read-only messages reject unknown fields", async () => {
  await withBackground({}, async ({ background }) => {
    await assert.rejects(background.handleMessage({ type: "assignment.get", extra: true }), /Invalid assignment/);
    await assert.rejects(background.handleMessage({ type: "assignment.get", dateKey: "not-a-date" }), /Invalid assignment/);
    await assert.rejects(background.handleMessage({ type: "settings.get", extra: true }), /Invalid settings/);
    await assert.rejects(background.handleMessage({ type: "state.export", extra: true }), /Invalid export/);
  });
});

test("Atlas can read a retained date without creating an assignment for another day", async () => {
  const existing = profile({ assignments: { "2026-07-28": { wordId: "w2" } }, assignmentOrdinal: 1 });
  await withBackground({ profile: existing }, async ({ background, values }) => {
    assert.deepEqual(await background.handleMessage({ type: "assignment.get", dateKey: "2026-07-28" }), { kind: "assigned", wordId: "w2", dateKey: "2026-07-28", word: word("w2") });
    assert.deepEqual(await background.handleMessage({ type: "assignment.get", dateKey: "2026-07-29" }), { kind: "no-new-word", dateKey: "2026-07-29" });
    assert.deepEqual(values["kalimat.profile"].assignments, existing.assignments);
  });
});

test("a dated query is read-only even when it names the current day", async () => {
  const existing = profile();
  await withBackground({ profile: existing }, async ({ background, values }) => {
    await withLocalDay("2026-07-30", async () => {
      assert.deepEqual(await background.handleMessage({ type: "assignment.get", dateKey: "2026-07-30" }), { kind: "no-new-word", dateKey: "2026-07-30" });
    });
    assert.deepEqual(Object.keys(values["kalimat.profile"].assignments), []);
    assert.equal(values["kalimat.profile"].assignmentOrdinal, 0);
  });
});

test("settings snapshot returns only the current validated reminder", async () => {
  await withBackground({ reminder: { enabled: true, time: "18:45" } }, async ({ background }) => {
    assert.deepEqual(await background.handleMessage({ type: "settings.get" }), { kind: "settings", reminder: { enabled: true, time: "18:45" } });
  });
});

test("onboarding, save, export, import, and clear use validated profile state", async () => {
  await withBackground({}, async ({ background, values }) => {
    await background.handleMessage({ type: "onboarding.complete", level: 2, interests: ["travel"] });
    await background.handleMessage({ type: "word.save", wordId: "w1", saved: true });
    const exported = await background.handleMessage({ type: "state.export" });
    assert.equal(exported.kind, "export");
    assert.equal(JSON.parse(exported.text).wordStates.w1.saved, true);
    await background.handleMessage({ type: "state.clear" });
    assert.deepEqual(Object.keys(values["kalimat.profile"].wordStates), []);
    await background.handleMessage({ type: "state.import", text: exported.text });
    assert.equal(values["kalimat.profile"].level, 2);
    assert.equal(values["kalimat.profile"].wordStates.w1.saved, true);
  });
});

test("settings retain English visibility alongside level and interests", async () => {
  const initial = profile({
    showEnglish: true,
    preferences: { ...profile().preferences, showEnglish: true },
  });
  await withBackground({ profile: initial }, async ({ background, vocabulary }) => {
    await background.handleMessage({ type: "settings.update", level: 3, interests: ["travel"], showEnglish: false });
    const exported = await background.handleMessage({ type: "state.export" });
    const parsed = JSON.parse(exported.text);
    assert.equal(parsed.showEnglish, false);
    assert.equal(parsed.preferences.showEnglish, false);
    const checked = require("../shared/state.js").validateStoredProfile(parsed, vocabulary);
    assert.equal(checked.canPersist, true);
    assert.equal(checked.profile.preferences.showEnglish, false);
  });
});

test("settings update persists valid speech preferences and rejects invalid fields atomically", async () => {
  const initial = profile({
    preferences: { ...profile().preferences, speechRate: 0.85, speechRepeat: 1 },
  });
  await withBackground({ profile: initial }, async ({ background, values }) => {
    const result = await background.handleMessage({ type: "settings.update", level: 2, interests: ["travel"], speechRate: 1.25, speechRepeat: 3 });
    assert.equal(result.kind, "ok");
    assert.equal(values["kalimat.profile"].preferences.speechRate, 1.25);
    assert.equal(values["kalimat.profile"].preferences.speechRepeat, 3);

    const persisted = JSON.stringify(values["kalimat.profile"]);
    await assert.rejects(background.handleMessage({ type: "settings.update", speechRate: 0.49 }), /Invalid settings/);
    await assert.rejects(background.handleMessage({ type: "settings.update", speechRate: 1.51 }), /Invalid settings/);
    await assert.rejects(background.handleMessage({ type: "settings.update", speechRepeat: 2 }), /Invalid settings/);
    await assert.rejects(background.handleMessage({ type: "settings.update", speechRate: 1, unknown: true }), /Invalid settings/);
    assert.equal(JSON.stringify(values["kalimat.profile"]), persisted);
  });
});

test("legacy stored profile missing showEnglish is persisted with the safe default", async () => {
  const legacy = profile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  delete legacy.showEnglish;
  await withBackground({ profile: legacy }, async ({ background, values }) => {
    await withLocalDay("2026-07-30", async () => background.handleMessage({ type: "assignment.get" }));
    assert.equal(values["kalimat.profile"].showEnglish, true);
  });
});

test("assignment response restores validated feedback, save, and English visibility", async () => {
  const existing = profile({
    showEnglish: false,
    assignments: { "2026-07-30": { wordId: "w1", status: "known" } },
    wordStates: { w1: { status: "known", dateKey: "2026-07-30", saved: true } },
    assignmentOrdinal: 1,
  });
  await withBackground({ profile: existing }, async ({ background }) => {
    await withLocalDay("2026-07-30", async () => {
      assert.deepEqual(await background.handleMessage({ type: "assignment.get" }), {
        kind: "assigned", wordId: "w1", dateKey: "2026-07-30", word: word("w1"), status: "known", saved: true, showEnglish: false,
      });
    });
  });
});

test("a storage failure keeps one session assignment and reports a warning", async () => {
  await withBackground({ storageFailure: true }, async ({ background }) => {
    await withLocalDay("2026-07-30", async () => {
      const first = await background.handleMessage({ type: "assignment.get" });
      const second = await background.handleMessage({ type: "assignment.get" });
      assert.deepEqual(first, second);
      assert.equal(first.storageWarning, true);
      assert.equal((await background.handleMessage({ type: "state.export" })).storageWarning, true);
    });
  });
});

test("a transient write failure keeps the session assignment until persistence succeeds", async () => {
  const original = profile();
  await withBackground({ profile: original, storageSetFailures: 1 }, async ({ background, values }) => {
    await withLocalDay("2026-07-30", async () => {
      assert.equal((await background.handleMessage({ type: "assignment.get" })).storageWarning, true);
      const exported = await background.handleMessage({ type: "state.export" });
      assert.ok(JSON.parse(exported.text).assignments["2026-07-30"]);
      assert.ok(values["kalimat.profile"].assignments["2026-07-30"]);
    });
  });
});

test("a newer persisted profile wins over a stale session fallback", async () => {
  const original = profile();
  const newer = profile({ level: 3 });
  await withBackground({ profile: original, storageSetFailures: 1 }, async ({ background, values }) => {
    await withLocalDay("2026-07-30", async () => {
      await background.handleMessage({ type: "assignment.get" });
      values["kalimat.profile"] = newer;
      const exported = await background.handleMessage({ type: "state.export" });
      assert.equal(JSON.parse(exported.text).level, 3);
      assert.equal(JSON.parse(exported.text).assignments["2026-07-30"], undefined);
    });
  });
});

test("a transient import write retries against its original storage baseline", async () => {
  const imported = profile({ level: 3 });
  await withBackground({ profile: profile(), storageSetFailures: 1 }, async ({ background, values }) => {
    const result = await background.handleMessage({ type: "state.import", text: JSON.stringify(imported) });
    assert.equal(result.storageWarning, true);
    const exported = await background.handleMessage({ type: "state.export" });
    assert.equal(JSON.parse(exported.text).level, 3);
    assert.equal(values["kalimat.profile"].level, 3);
  });
});

test("a transient clear write retries against its original storage baseline", async () => {
  const original = profile({ wordStates: { w1: { saved: true } } });
  await withBackground({ profile: original, storageSetFailures: 1 }, async ({ background, values }) => {
    const result = await background.handleMessage({ type: "state.clear" });
    assert.equal(result.storageWarning, true);
    assert.equal(result.reminderWarning, false);
    const exported = await background.handleMessage({ type: "state.export" });
    assert.deepEqual(JSON.parse(exported.text).wordStates, {});
    assert.deepEqual(Object.keys(values["kalimat.profile"].wordStates), []);
  });
});

test("a newer profile wins after a transient import write failure", async () => {
  const newer = profile({ level: 4 });
  await withBackground({ profile: profile(), storageSetFailures: 1 }, async ({ background, values }) => {
    await background.handleMessage({ type: "state.import", text: JSON.stringify(profile({ level: 3 })) });
    values["kalimat.profile"] = newer;
    const exported = await background.handleMessage({ type: "state.export" });
    assert.equal(JSON.parse(exported.text).level, 4);
  });
});

test("an import after a failed read retains the session profile until storage returns", async () => {
  await withBackground({ storageFailure: true }, async ({ background, values, setStorageAvailable }) => {
    const result = await background.handleMessage({ type: "state.import", text: JSON.stringify(profile({ level: 3 })) });
    assert.equal(result.storageWarning, true);
    setStorageAvailable(true);
    const exported = await background.handleMessage({ type: "state.export" });
    assert.equal(JSON.parse(exported.text).level, 3);
    assert.equal(values["kalimat.profile"].level, 3);
  });
});

test("valid recovery import replaces raw state and exits recovery mode", async () => {
  const invalid = { schemaVersion: 999, marker: "keep" };
  const imported = profile({ level: 3 });
  await withBackground({ profile: invalid }, async ({ background, values }) => {
    assert.deepEqual(await background.handleMessage({ type: "assignment.get" }), { kind: "recovery", recoveryRaw: invalid });
    assert.deepEqual(await background.handleMessage({ type: "state.import", text: JSON.stringify(imported) }), { kind: "ok" });
    assert.equal((await background.handleMessage({ type: "state.export" })).kind, "export");
    assert.equal(JSON.parse((await background.handleMessage({ type: "state.export" })).text).level, 3);
    assert.equal(values["kalimat.profile"].schemaVersion, 1);
  });
});

test("invalid stored state remains untouched and returns recovery mode", async () => {
  const invalid = { schemaVersion: 999, marker: "keep" };
  await withBackground({ profile: invalid }, async ({ background, values, calls }) => {
    assert.deepEqual(await background.handleMessage({ type: "assignment.get" }), { kind: "recovery", recoveryRaw: invalid });
    assert.deepEqual(values["kalimat.profile"], invalid);
    assert.equal(calls.set, 0);
  });
});

test("onboarding leaves invalid stored state in recovery mode", async () => {
  const invalid = { schemaVersion: 999, marker: "keep" };
  await withBackground({ profile: invalid }, async ({ background, values, calls }) => {
    assert.deepEqual(await background.handleMessage({ type: "onboarding.complete", level: 2, interests: ["travel"] }), { kind: "recovery", recoveryRaw: invalid });
    assert.deepEqual(values["kalimat.profile"], invalid);
    assert.equal(calls.set, 0);
  });
});

test("clearing state disables the separate reminder and cancels its alarm", async () => {
  await withBackground({ profile: profile(), reminder: { enabled: true, time: "09:00" }, alarm: { name: "kalimat.reminder", when: Date.now() + 1000 } }, async ({ background, values, alarms, calls }) => {
    const result = await background.handleMessage({ type: "state.clear" });
    assert.equal(result.kind, "ok");
    assert.deepEqual(values["kalimat.reminder"], { enabled: false, time: "09:00" });
    assert.equal(alarms.has("kalimat.reminder"), false);
    assert.ok(calls.clear >= 1);
  });
});

test("clearing state reports storage warning without clearing an alarm when reminder persistence fails", async () => {
  await withBackground({ profile: profile(), reminder: { enabled: true, time: "09:00" }, alarm: { name: "kalimat.reminder", when: Date.now() + 1000 }, storageSetFailures: 2 }, async ({ background, alarms }) => {
    const result = await background.handleMessage({ type: "state.clear" });
    assert.equal(result.kind, "ok");
    assert.equal(result.storageWarning, true);
    assert.equal(result.reminderWarning, true);
    assert.equal(alarms.has("kalimat.reminder"), true);
  });
});

test("background never requests optional permissions", async () => {
  await withBackground({ permissions: false }, async ({ background, calls }) => {
    await background.handleMessage({ type: "reminder.configure", enabled: true, time: "09:00" });
    assert.equal(calls.permissionRequests, 0);
  });
});

test("reminder configuration stores a valid time and schedules the next local occurrence", async () => {
  await withBackground({ permissions: true }, async ({ background, values, calls }) => {
    const result = await background.handleMessage({ type: "reminder.configure", enabled: true, time: "09:00" });
    assert.deepEqual(result, { enabled: true, time: "09:00" });
    assert.deepEqual(values["kalimat.reminder"], { enabled: true, time: "09:00" });
    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].name, "kalimat.reminder");
    assert.ok(calls.create[0].details.when > Date.now());
  });
});

test("reminder enable rolls storage back when alarm creation fails", async () => {
  await withBackground({ permissions: true, alarmCreateFailures: 1 }, async ({ background, values, alarms }) => {
    const result = await background.handleMessage({ type: "reminder.configure", enabled: true, time: "09:00" });
    assert.deepEqual(result, { enabled: false, time: "09:00", storageWarning: true });
    assert.deepEqual(values["kalimat.reminder"], { enabled: false, time: "09:00" });
    assert.equal(alarms.has("kalimat.reminder"), false);
  });
});

test("reminder disable rolls storage back when alarm clearing fails", async () => {
  const alarm = { name: "kalimat.reminder", when: Date.now() + 60000 };
  await withBackground({ reminder: { enabled: true, time: "09:00" }, alarm, alarmClearFailures: 1 }, async ({ background, values, alarms }) => {
    const result = await background.handleMessage({ type: "reminder.configure", enabled: false, time: "09:00" });
    assert.deepEqual(result, { enabled: true, time: "09:00", storageWarning: true });
    assert.deepEqual(values["kalimat.reminder"], { enabled: true, time: "09:00" });
    assert.equal(alarms.has("kalimat.reminder"), true);
  });
});

test("failed reminder persistence leaves the existing alarm and setting authoritative", async () => {
  const alarm = { name: "kalimat.reminder", when: Date.now() + 60000 };
  await withBackground({ reminder: { enabled: true, time: "09:00" }, alarm, storageSetFailures: 1 }, async ({ background, values, alarms }) => {
    const result = await background.handleMessage({ type: "reminder.configure", enabled: true, time: "10:00" });
    assert.deepEqual(result, { enabled: true, time: "09:00", storageWarning: true });
    assert.deepEqual(values["kalimat.reminder"], { enabled: true, time: "09:00" });
    assert.equal(alarms.has("kalimat.reminder"), true);
  });
});

test("unknown alarm snapshots never clear an existing alarm during a failed disable rollback", async () => {
  const alarm = { name: "kalimat.reminder", when: Date.now() + 60000 };
  await withBackground({ reminder: { enabled: true, time: "09:00" }, alarm, alarmGetFailures: 2, alarmClearFailures: 1 }, async ({ background, values, alarms }) => {
    const result = await background.handleMessage({ type: "reminder.configure", enabled: false, time: "09:00" });
    assert.deepEqual(result, { enabled: true, time: "09:00", storageWarning: true });
    assert.deepEqual(values["kalimat.reminder"], { enabled: true, time: "09:00" });
    assert.equal(alarms.has("kalimat.reminder"), true);
  });
});

test("startup reconciliation create failures are surfaced by settings", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" }, alarmCreateFailures: 1 }, async ({ background }) => {
    const settings = await background.handleMessage({ type: "settings.get" });
    assert.deepEqual(settings, { kind: "settings", reminder: { enabled: true, time: "09:00" }, storageWarning: true });
  });
});

test("startup reconciliation retains and retries a warning whose marker write fails", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" }, alarmCreateFailures: 2, reminderWarningSetFailures: 2 }, async ({ background, extension, values }) => {
    await extension.runtime.onStartup.listeners[0]();
    const settings = await background.handleMessage({ type: "settings.get" });
    assert.deepEqual(settings, { kind: "settings", reminder: { enabled: true, time: "09:00" }, storageWarning: true });
    assert.equal(values["kalimat.reminder.warning"], true);
  });
});

test("disabled stale-alarm reconciliation failures are surfaced by settings", async () => {
  const alarm = { name: "kalimat.reminder", when: Date.now() + 60000 };
  await withBackground({ reminder: { enabled: false, time: "09:00" }, alarm, alarmClearFailures: 1 }, async ({ background }) => {
    const settings = await background.handleMessage({ type: "settings.get" });
    assert.deepEqual(settings, { kind: "settings", reminder: { enabled: false, time: "09:00" }, storageWarning: true });
  });
});

test("permission revocation clear failures surface a warning without claiming disabled storage", async () => {
  const alarm = { name: "kalimat.reminder", when: Date.now() + 60000 };
  await withBackground({ reminder: { enabled: true, time: "09:00" }, alarm, alarmClearFailures: 1 }, async ({ background, extension, setPermissions }) => {
    await new Promise(setImmediate);
    setPermissions(false);
    await extension.permissions.onRemoved.listeners[0]({ permissions: ["notifications"] });
    const settings = await background.handleMessage({ type: "settings.get" });
    assert.deepEqual(settings, { kind: "settings", reminder: { enabled: true, time: "09:00" }, storageWarning: true });
  });
});

test("permission revocation retains and retries a warning whose marker write fails", async () => {
  const alarm = { name: "kalimat.reminder", when: Date.now() + 60000 };
  await withBackground({ reminder: { enabled: true, time: "09:00" }, alarm, alarmClearFailures: 1, reminderWarningSetFailures: 1 }, async ({ background, extension, setPermissions, values }) => {
    await new Promise(setImmediate);
    setPermissions(false);
    await extension.permissions.onRemoved.listeners[0]({ permissions: ["notifications"] });
    const settings = await background.handleMessage({ type: "settings.get" });
    assert.deepEqual(settings, { kind: "settings", reminder: { enabled: true, time: "09:00" }, storageWarning: true });
    assert.equal(values["kalimat.reminder.warning"], true);
  });
});

test("notifications use Arabic title and body", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" }, permissions: true }, async ({ extension, calls }) => {
    await new Promise(setImmediate);
    await extension.alarms.onAlarm.listeners[0]({ name: "kalimat.reminder" });
    assert.match(calls.notifications[0].options.title, /[\u0600-\u06ff]/);
    assert.match(calls.notifications[0].options.message, /[\u0600-\u06ff]/);
  });
});

test("notification failure persists a reminder warning after the alarm clears", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" }, notificationFailure: true }, async ({ extension, calls, values }) => {
    await new Promise(setImmediate);
    await extension.alarms.onAlarm.listeners[0]({ name: "kalimat.reminder" });
    assert.ok(calls.clear >= 1);
    assert.equal(values["kalimat.reminder.warning"], true);
  });
});

test("startup recreates a missing enabled reminder alarm", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" } }, async ({ extension, calls }) => {
    await extension.runtime.onStartup.listeners[0]();
    assert.equal(calls.create.length, 1);
  });
});

test("notification clicks open Atlas so the normal daily assignment flow runs", async () => {
  await withBackground({}, async ({ extension, calls }) => {
    await withLocalDay("2026-07-30", async () => extension.notifications.onClicked.listeners[0]("kalimat.reminder"));
    assert.deepEqual(calls.tabs, [{ url: "extension://kalimat/atlas/atlas.html" }]);
  });
});

test("revoked permissions disable reminders without changing assignments", async () => {
  const existing = profile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  await withBackground({ profile: existing, reminder: { enabled: true, time: "09:00" }, permissions: true }, async ({ extension, values, calls, setPermissions }) => {
    setPermissions(false);
    await extension.permissions.onRemoved.listeners[0]({ permissions: ["notifications"] });
    assert.deepEqual(values["kalimat.reminder"], { enabled: false, time: "09:00" });
    assert.equal(values["kalimat.profile"].assignments["2026-07-30"].wordId, "w1");
    assert.ok(calls.clear >= 1);
  });
});

test("permission revocation preserves the alarm when disabling settings fails", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" }, permissions: true, storageSetFailures: 1 }, async ({ extension, values, alarms, calls, setPermissions }) => {
    await new Promise(setImmediate);
    setPermissions(false);
    await assert.doesNotReject(extension.permissions.onRemoved.listeners[0]({ permissions: ["notifications"] }));
    assert.equal(alarms.has("kalimat.reminder"), true);
    assert.equal(calls.clear, 0);
    assert.deepEqual(values["kalimat.reminder"], { enabled: true, time: "09:00" });
  });
});

test("alarm and notification event listeners consume failing side effects", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" }, notificationFailure: true, tabFailure: true }, async ({ extension }) => {
    await new Promise(setImmediate);
    await assert.doesNotReject(extension.alarms.onAlarm.listeners[0]({ name: "kalimat.reminder" }));
    await assert.doesNotReject(extension.notifications.onClicked.listeners[0]("kalimat.reminder"));
  });
});

test("alarm firing surfaces a reminder warning when clearing the alarm fails", async () => {
  const alarm = { name: "kalimat.reminder", when: Date.now() + 60000 };
  await withBackground({ reminder: { enabled: true, time: "09:00" }, alarm, alarmClearFailures: 1 }, async ({ background, extension }) => {
    await new Promise(setImmediate);
    await extension.alarms.onAlarm.listeners[0]({ name: "kalimat.reminder" });
    const settings = await background.handleMessage({ type: "settings.get" });
    assert.deepEqual(settings, { kind: "settings", reminder: { enabled: true, time: "09:00" }, storageWarning: true });
  });
});

test("startup and install listeners consume reminder storage failures", async () => {
  await withBackground({ storageFailure: true }, async ({ extension }) => {
    await assert.doesNotReject(extension.runtime.onStartup.listeners[0]());
    await assert.doesNotReject(extension.runtime.onInstalled.listeners[0]());
  });
});

test("background evaluation realigns an enabled stale reminder alarm", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" }, alarm: { name: "kalimat.reminder", when: 0 } }, async ({ calls }) => {
    await new Promise(setImmediate);
    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].name, "kalimat.reminder");
  });
});

test("a new valid-date assignment prunes 5,001 records while lifetime cadence continues", async () => {
  const assignments = Object.create(null);
  for (let index = 0; index < 5000; index += 1) assignments[new Date(Date.UTC(2000, 0, index + 1)).toISOString().slice(0, 10)] = { wordId: "interest" };
  const existing = profile({ assignments, assignmentOrdinal: 5004 });
  await withBackground({ profile: existing, vocabulary: [word("interest"), word("outside", { topics: ["food"], usefulnessBand: "low" })] }, async ({ background, values }) => {
    await withLocalDay("2026-07-30", async () => {
      assert.deepEqual(await background.handleMessage({ type: "assignment.get" }), { kind: "assigned", wordId: "outside", dateKey: "2026-07-30", word: word("outside", { topics: ["food"], usefulnessBand: "low" }) });
    });
    assert.equal(Object.keys(values["kalimat.profile"].assignments).length, 5000);
    assert.equal(values["kalimat.profile"].assignmentOrdinal, 5005);
    assert.equal(values["kalimat.profile"].assignments["2026-07-30"].wordId, "outside");
    assert.equal(Object.hasOwn(values["kalimat.profile"].assignments, "2000-01-01"), false);
  });
});

test("online.lookup rejects unknown fields, wordId/lang options, malformed queries, and prototype keys", async () => {
  await withBackground({}, async ({ background }) => {
    // Extra/unexpected fields
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "كلمة", wordId: "w1" }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "كلمة", word: "كلمة" }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "كلمة", lang: "ar" }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "كلمة", provider: "wiktionary" }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "كلمة", url: "https://ar.wiktionary.org" }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "كلمة", headers: {} }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "كلمة", options: {} }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "كلمة", extra: true }), /Invalid lookup/i);
    // Malformed query values
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "" }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "   " }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: 123 }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "a".repeat(257) }), /Invalid lookup/i);
    await assert.rejects(background.handleMessage({ type: "online.lookup", query: "__proto__" }), /Invalid lookup/i);
  });
});

test("online.lookup returns permission-needed when Chrome optional host permission is not granted", async () => {
  await withBackground({ hostPermissions: false }, async ({ background, calls }) => {
    const result = await background.handleMessage({ type: "online.lookup", query: "كلمة" });
    assert.deepEqual(result, { kind: "permission-needed" });
    assert.equal(calls.permissionRequests, 0, "Background service worker must never request permissions directly");
  });
});

test("online.lookup returns unsupported on Firefox without host permissions", async () => {
  await withBackground({ api: "browser", hostPermissions: false }, async ({ background }) => {
    const result = await background.handleMessage({ type: "online.lookup", query: "كلمة" });
    assert.deepEqual(result, { kind: "unsupported" });
  });
});

test("online.lookup canonicalizes Arabic query for the fixed plain-text API and preserves hamzas", async () => {
  const urls = [];
  await withBackground({
    hostPermissions: true,
    fetch: async (url) => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json; charset=utf-8"]]),
        async text() {
          return JSON.stringify({ query: { pages: [{ pageid: 1, title: "\u0627\u0644\u064a", extract: "\u062a\u0639\u0631\u064a\u0641" }] } });
        },
      };
    },
  }, async ({ background }) => {
    const result = await background.handleMessage({ type: "online.lookup", query: "\u0640\u0625\u0650\u0644\u064e\u0649\u0670" });
    assert.equal(result.kind, "online-result");
    assert.equal(result.query, "\u0627\u0644\u064a");
    assert.equal(new URL(urls[0]).searchParams.get("titles"), "\u0627\u0644\u064a");

    await background.handleMessage({ type: "online.lookup", query: "\u0624\u0626" });
    assert.equal(new URL(urls[1]).searchParams.get("titles"), "\u0624\u0626");
  });
});

test("online.lookup requires JSON content type and rejects HTML-shaped or malformed payloads", async () => {
  for (const response of [
    { ok: true, status: 200, async text() { return JSON.stringify({ query: { pages: [{ pageid: 1, title: "\u0643\u0644\u0645\u0629", extract: "\u0645\u0639\u0646\u0649" }] } }); } },
    { ok: true, status: 200, headers: new Map([["content-type", "text/html"]]), async text() { return "<p>\u0645\u0639\u0646\u0649</p>"; } },
    { ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), async text() { return JSON.stringify({ parse: { title: "\u0643\u0644\u0645\u0629", text: { "*": "<p>\u0645\u0639\u0646\u0649</p>" } } }); } },
    { ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), async text() { return JSON.stringify({ query: { pages: [{ pageid: 1, title: "\u0643\u0644\u0645\u0629" }] } }); } },
    { ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), async text() { return JSON.stringify({ error: { code: "badrequest" } }); } },
    { ok: false, status: 503, headers: new Map([["content-type", "application/json"]]), async text() { return JSON.stringify({}); } },
    { ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), async text() { return "x".repeat(262145); } },
  ]) {
    await withBackground({ hostPermissions: true, fetch: async () => response }, async ({ background }) => {
      const result = await background.handleMessage({ type: "online.lookup", query: "\u0643\u0644\u0645\u0629" });
      assert.equal(result.kind, "error");
    });
  }
});

test("online.lookup uses fixed ar.wiktionary.org endpoint with security options and returns safe online-result DTO", async () => {
  const hostilePayload = {
    query: { pages: [{ pageid: 1, title: "كَلِمَة", extract: "لفظ يدل على معنى." }] },
  };
  let capturedFetchOptions = null;
  await withBackground({
    hostPermissions: true,
    fetch: async (url, options) => {
      capturedFetchOptions = { url, ...options };
      assert.match(url, /^https:\/\/ar\.wiktionary\.org\//i, "Must only fetch from fixed ar.wiktionary.org endpoint");
      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
        async json() { return hostilePayload; },
        async text() { return JSON.stringify(hostilePayload); },
      };
    },
  }, async ({ background }) => {
    const result = await background.handleMessage({ type: "online.lookup", query: "كَلِمَة" });
    assert.equal(result.kind, "online-result");
    assert.equal(result.query, "كلمة");
    assert.equal(result.unreviewed, true);
    assert.equal(typeof result.headword, "string");
    assert.equal(typeof result.definitionAr, "string");
    assert.equal(typeof result.sourceUrl, "string");
    assert.match(result.sourceUrl, /^https:\/\/ar\.wiktionary\.org\//i);
    assert.equal(typeof result.retrievedAt, "string");
    assert.doesNotMatch(result.definitionAr, /<script|<img|onerror|javascript:/i, "definitionAr must remain plain text");
    assert.ok(result.definitionAr.length > 0);

    // Verify fetch security constraints
    assert.equal(capturedFetchOptions.credentials, "omit");
    assert.equal(capturedFetchOptions.redirect, "error");
    assert.equal(capturedFetchOptions.cache, "no-store");
    assert.ok(capturedFetchOptions.signal !== undefined, "Fetch must include an abort signal timeout");
  });
});

test("online.lookup handles remote 404, network errors, and hostile/oversized responses safely", async () => {
  await withBackground({
    hostPermissions: true,
    fetch: async () => ({ ok: false, status: 404, async json() { return {}; }, async text() { return "Not found"; } }),
  }, async ({ background }) => {
    const result = await background.handleMessage({ type: "online.lookup", query: "غيرموجود" });
    assert.equal(result.kind, "not-found");
  });

  await withBackground({
    hostPermissions: true,
    fetch: async () => { throw new Error("Network offline"); },
  }, async ({ background }) => {
    const result = await background.handleMessage({ type: "online.lookup", query: "كلمة" });
    assert.equal(result.kind, "error");
  });
});

test("online.lookup is strictly read-only and never modifies profile or assignment state", async () => {
  const initialProfile = profile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  await withBackground({
    profile: initialProfile,
    hostPermissions: true,
    fetch: async () => ({ ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), async text() { return JSON.stringify({ query: { pages: [{ pageid: 1, title: "كلمة", extract: "معنى" }] } }); } }),
  }, async ({ background, values, calls }) => {
    await background.handleMessage({ type: "online.lookup", query: "كلمة" });
    assert.deepEqual(values["kalimat.profile"].assignments, initialProfile.assignments);
    assert.equal(values["kalimat.profile"].assignmentOrdinal, 1);
    assert.equal(calls.set, 0);
  });
});
