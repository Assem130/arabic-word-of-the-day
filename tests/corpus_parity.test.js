"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const words = require("../words.js");
const extensionVocabulary = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "extension", "data", "vocabulary.json"), "utf8")
);

const FIELD_MAP = [
  ["word", "word"],
  ["pronunciation", "pronunciation"],
  ["vocalization", "vocalization"],
  ["weight", "pattern"],
  ["root", "root"],
  ["category", "category"],
  ["meaning", "meaningAr"],
  ["englishMeaning", "meaningEn"],
  ["context", "contextAr"],
  ["contextEnglish", "contextEn"],
];

const EXAMPLE_OVERRIDES = {
  24: "فاحَ أَرِيجُ الياسمين في الفناء بعد أن سُقيت الأزهار.",
  25: "أثارَت الرسالةُ القديمةُ في نفسه شَجَنًا ممزوجًا بالشوق.",
  32: "سادَ الوِئامُ بين أفراد الفريق بعد حوار صريح.",
  41: "أضاءَ القمرُ الطريقَ وسطَ الدُّجى.",
  46: "بدا وجهُ الطفل نَضيرًا بعد نوم هادئ.",
};

const GENERIC_ATTRIBUTION = /— شاعر (?:قديم|حديث)$/;

function indexByNumericId(records) {
  return new Map(records.map((record) => [Number(record.id), record]));
}

test("website and extension vocabularies stay lexically identical by ID", () => {
  const websiteById = indexByNumericId(words);
  const extensionById = indexByNumericId(extensionVocabulary);
  const websiteIds = [...websiteById.keys()].sort((a, b) => a - b);
  const extensionIds = [...extensionById.keys()].sort((a, b) => a - b);

  assert.deepEqual(extensionIds, websiteIds, "Corpus ID sets must match");

  for (const id of websiteIds) {
    const website = websiteById.get(id);
    const extension = extensionById.get(id);
    for (const [websiteField, extensionField] of FIELD_MAP) {
      assert.equal(
        extension[extensionField],
        website[websiteField],
        `Corpus parity mismatch for record ${id}, field ${websiteField} -> ${extensionField}`
      );
    }

    if (Object.hasOwn(EXAMPLE_OVERRIDES, id)) {
      assert.match(website.example, GENERIC_ATTRIBUTION, `Record ${id} must retain its generic attribution in the website corpus`);
      assert.equal(extension.exampleAr, EXAMPLE_OVERRIDES[id], `Corpus parity mismatch for record ${id}, field example -> exampleAr`);
      assert.notEqual(extension.exampleAr, website.example, `Record ${id} must use the moderated extension example`);
      assert.doesNotMatch(extension.exampleAr, GENERIC_ATTRIBUTION, `Record ${id} extension example must not keep generic attribution`);
    } else {
      assert.equal(extension.exampleAr, website.example, `Corpus parity mismatch for record ${id}, field example -> exampleAr`);
    }
  }

  const differingExampleIds = websiteIds.filter((id) => websiteById.get(id).example !== extensionById.get(id).exampleAr);
  assert.deepEqual(
    differingExampleIds,
    Object.keys(EXAMPLE_OVERRIDES).map(Number).sort((a, b) => a - b),
    "Only the documented generic-attribution examples may differ"
  );
});
