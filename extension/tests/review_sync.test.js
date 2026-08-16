const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const State = require("../shared/state.js");
const Vocabulary = require("../shared/vocabulary.js");
const DateApi = require("../shared/date.js");
const Background = require("../background.js");

const rawVocab = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/vocabulary.json"), "utf8"));
const vocabulary = rawVocab.slice(0, 50);

test("SM-2 calculateSM2 handles initial learning, correct progression, and lapses", () => {
  const item = State.createDefaultSrsItem(1, "2026-08-16");
  assert.equal(item.repetition, 0);
  assert.equal(item.interval, 0);
  assert.equal(item.ef, 2.5);
  assert.equal(item.lapses, 0);

  // Rating Good (4) on first review
  const r1 = State.calculateSM2(item, "good", "2026-08-16");
  assert.equal(r1.repetition, 1);
  assert.equal(r1.interval, 1);
  assert.equal(r1.nextReviewDate, "2026-08-17");
  assert.equal(r1.lastReviewedDate, "2026-08-16");
  assert.equal(r1.reviewCount, 1);
  assert.equal(r1.lapses, 0);

  // Rating Good (4) on second review
  const r2 = State.calculateSM2(r1, "good", "2026-08-17");
  assert.equal(r2.repetition, 2);
  assert.equal(r2.interval, 6);
  assert.equal(r2.nextReviewDate, "2026-08-23");
  assert.equal(r2.reviewCount, 2);

  // Rating Hard (3) on third review
  const r3 = State.calculateSM2(r2, "hard", "2026-08-23");
  assert.equal(r3.repetition, 3);
  assert.equal(r3.interval, 14); // round(6 * 2.36) = 14
  assert.equal(r3.nextReviewDate, "2026-09-06");

  // Rating Again (1) on fourth review -> Lapse
  const r4 = State.calculateSM2(r3, "again", "2026-09-06");
  assert.equal(r4.repetition, 0);
  assert.equal(r4.interval, 1);
  assert.equal(r4.lapses, 1);
  assert.equal(r4.nextReviewDate, "2026-09-07");
});

test("SM-2 EF bounds clamp at minimum 1.30", () => {
  let item = State.createDefaultSrsItem(1, "2026-08-16");
  for (let i = 0; i < 10; i++) {
    item = State.calculateSM2(item, "again", "2026-08-16");
  }
  assert.ok(item.ef >= 1.30);
  assert.equal(item.ef, 1.3);
});

test("getDueReviewWords sorts by urgency: daysOverdue desc, interval asc, ef asc, repetition asc, id asc", () => {
  let profile = State.createProfile({ seedHex: "0".repeat(32) });
  profile.srs[1] = { wordId: 1, repetition: 2, interval: 6, ef: 2.5, nextReviewDate: "2026-08-10", lapses: 0, history: [] }; // 6 days overdue
  profile.srs[2] = { wordId: 2, repetition: 1, interval: 1, ef: 2.3, nextReviewDate: "2026-08-15", lapses: 0, history: [] }; // 1 day overdue, interval 1
  profile.srs[3] = { wordId: 3, repetition: 1, interval: 3, ef: 2.5, nextReviewDate: "2026-08-15", lapses: 0, history: [] }; // 1 day overdue, interval 3
  profile.srs[4] = { wordId: 4, repetition: 5, interval: 30, ef: 2.7, nextReviewDate: "2026-08-20", lapses: 0, history: [] }; // not due

  const due = State.getDueReviewWords(profile, vocabulary, "2026-08-16");
  assert.equal(due.length, 3);
  assert.equal(due[0].word.id, 1);
  assert.equal(due[0].daysOverdue, 6);
  assert.equal(due[1].word.id, 2);
  assert.equal(due[1].daysOverdue, 1);
  assert.equal(due[2].word.id, 3);
  assert.equal(due[2].daysOverdue, 1);
});

test("recordReview updates SRS, history, and legacy wordStates idempotently", () => {
  let profile = State.createProfile({ seedHex: "0".repeat(32) });
  profile = State.recordReview(profile, 1, "good", "2026-08-16", vocabulary);

  assert.ok(profile.srs[1]);
  assert.equal(profile.srs[1].repetition, 1);
  assert.equal(profile.srs[1].interval, 1);
  assert.ok(profile.history[1]);
  assert.equal(profile.history[1].firstSeen, "2026-08-16");
  assert.equal(profile.wordStates[1]?.status, "known");
  assert.equal(profile.wordStates["w1"]?.status, "known");
});

test("getReviewStats calculates correct statistics across learning and mastered cards", () => {
  let profile = State.createProfile({ seedHex: "0".repeat(32) });
  profile.srs[1] = { wordId: 1, repetition: 0, interval: 1, ef: 2.5, nextReviewDate: "2026-08-16", lastReviewedDate: "2026-08-16", reviewCount: 1, lapses: 0, history: [{ grade: 1 }] };
  profile.srs[2] = { wordId: 2, repetition: 4, interval: 25, ef: 2.6, nextReviewDate: "2026-08-16", lastReviewedDate: "2026-08-16", reviewCount: 4, lapses: 0, history: [{ grade: 4 }, { grade: 4 }, { grade: 4 }, { grade: 4 }] };

  const stats = State.getReviewStats(profile, vocabulary, "2026-08-16");
  assert.equal(stats.totalCards, 2);
  assert.equal(stats.dueToday, 2);
  assert.equal(stats.reviewedToday, 2);
  assert.equal(stats.learningCount, 1);
  assert.equal(stats.masteredCount, 1);
  assert.equal(stats.retentionRate, 80); // 4 out of 5 reviews had grade >= 3 -> 80%
});

test("Cross-platform state export and import preserves 100% of SRS and preferences", () => {
  let profile = State.createProfile({ seedHex: "0".repeat(32) });
  profile = State.recordReview(profile, 5, "easy", "2026-08-16", vocabulary);
  profile.favorites[5] = true;
  profile.preferences.speechRate = 0.9;

  const exported = State.serializeExport(profile);
  assert.ok(exported.endsWith("\n"));

  const imported = State.parseImport(exported, vocabulary);
  assert.equal(imported.srs[5].repetition, 1);
  assert.equal(imported.favorites[5], true);
  assert.equal(imported.preferences.speechRate, 0.9);
});

test("Omnibox XML escaping protects against XML injection in suggestion descriptions", () => {
  const escapeXml = Background.escapeXml;
  assert.equal(escapeXml("Apple & Pear"), "Apple &amp; Pear");
  assert.equal(escapeXml("<script>alert('xss')</script>"), "&lt;script&gt;alert(&apos;xss&apos;)&lt;/script&gt;");
  assert.equal(escapeXml('"Quotes"'), "&quot;Quotes&quot;");
});
