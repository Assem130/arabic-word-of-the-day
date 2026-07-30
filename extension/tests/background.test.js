const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

globalThis.crypto ??= webcrypto;

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

function fakeExtension({ profile, reminder, vocabulary = [word("w1"), word("w2")], storageFailure = false, storageSetFailures = 0, permissions = true, alarm, notificationFailure = false, tabFailure = false, api = "chrome" } = {}) {
  const values = Object.create(null);
  if (profile !== undefined) values["kalimat.profile"] = profile;
  if (reminder !== undefined) values["kalimat.reminder"] = reminder;
  const alarms = new Map();
  if (alarm) alarms.set(alarm.name, alarm);
  const calls = { set: 0, clear: 0, create: [], notifications: [], tabs: [], permissionRequests: 0 };
  let remainingSetFailures = storageSetFailures;
  let storageAvailable = !storageFailure;
  let permissionsGranted = permissions;
  const runtime = { onMessage: fakeEvent(), onStartup: fakeEvent(), onInstalled: fakeEvent(), getURL: (path) => `extension://kalimat/${path}` };
  const extension = {
    storage: { local: {
      async get(key) { if (!storageAvailable) throw new Error("storage unavailable"); return { [key]: values[key] }; },
      async set(next) { if (!storageAvailable || remainingSetFailures-- > 0) throw new Error("storage unavailable"); calls.set += 1; Object.assign(values, next); },
    } },
    alarms: {
      onAlarm: fakeEvent(),
      async get(name) { return alarms.get(name); },
      async create(name, details) { calls.create.push({ name, details }); alarms.set(name, { name, ...details }); },
      async clear(name) { calls.clear += 1; return alarms.delete(name); },
    },
    notifications: { onClicked: fakeEvent(), async create(id, options) { if (notificationFailure) throw new Error("notification unavailable"); calls.notifications.push({ id, options }); } },
    permissions: { onRemoved: fakeEvent(), async contains() { return permissionsGranted; }, async request() { calls.permissionRequests += 1; return permissionsGranted; } },
    runtime,
    tabs: { async create(details) { if (tabFailure) throw new Error("tab unavailable"); calls.tabs.push(details); } },
  };
  return { extension, values, alarms, calls, vocabulary, api, setPermissions(value) { permissionsGranted = value; }, setStorageAvailable(value) { storageAvailable = value; } };
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
  globalThis.fetch = async () => ({ ok: true, async json() { return fake.vocabulary; } });
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

test("an existing assignment survives feedback and settings changes", async () => {
  const existing = profile({ assignments: { "2026-07-30": { wordId: "w1" } }, assignmentOrdinal: 1 });
  await withBackground({ profile: existing }, async ({ background }) => {
    await background.handleMessage({ type: "word.feedback", dateKey: "2026-07-30", wordId: "w1", status: "known" });
    await background.handleMessage({ type: "settings.update", level: 2, interests: ["travel"] });
    await withLocalDay("2026-07-30", async () => {
      assert.deepEqual(await background.handleMessage({ type: "assignment.get" }), { kind: "assigned", wordId: "w1", dateKey: "2026-07-30" });
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
    await assert.rejects(background.handleMessage({ type: "state.export", extra: true }), /Invalid export/);
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

test("a storage failure keeps one session assignment and reports a warning", async () => {
  await withBackground({ storageFailure: true }, async ({ background }) => {
    await withLocalDay("2026-07-30", async () => {
      const first = await background.handleMessage({ type: "assignment.get" });
      const second = await background.handleMessage({ type: "assignment.get" });
      assert.deepEqual(first, second);
      assert.equal(first.storageWarning, true);
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

test("startup recreates a missing enabled reminder alarm", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" } }, async ({ extension, calls }) => {
    await extension.runtime.onStartup.listeners[0]();
    assert.equal(calls.create.length, 1);
  });
});

test("notification clicks open the matching Atlas local-day view", async () => {
  await withBackground({}, async ({ extension, calls }) => {
    await withLocalDay("2026-07-30", async () => extension.notifications.onClicked.listeners[0]("kalimat.reminder"));
    assert.deepEqual(calls.tabs, [{ url: "extension://kalimat/atlas/atlas.html?date=2026-07-30" }]);
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

test("permission revocation clears alarms even when disabling settings fails", async () => {
  await withBackground({ reminder: { enabled: true, time: "09:00" }, permissions: true, storageSetFailures: 1 }, async ({ extension, values, alarms, calls, setPermissions }) => {
    await new Promise(setImmediate);
    setPermissions(false);
    await assert.doesNotReject(extension.permissions.onRemoved.listeners[0]({ permissions: ["notifications"] }));
    assert.equal(alarms.has("kalimat.reminder"), false);
    assert.ok(calls.clear >= 1);
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
      assert.deepEqual(await background.handleMessage({ type: "assignment.get" }), { kind: "assigned", wordId: "outside", dateKey: "2026-07-30" });
    });
    assert.equal(Object.keys(values["kalimat.profile"].assignments).length, 5000);
    assert.equal(values["kalimat.profile"].assignmentOrdinal, 5005);
    assert.equal(values["kalimat.profile"].assignments["2026-07-30"].wordId, "outside");
    assert.equal(Object.hasOwn(values["kalimat.profile"].assignments, "2000-01-01"), false);
  });
});
