const test = require("node:test");
const assert = require("node:assert/strict");

const {
  serializeAnkiCSV,
  renderSocialCard,
  wrapText,
} = require("../shared/export.js");

// Mock Canvas & DOM primitives for zero-dependency testing
class MockCanvasContext {
  constructor() {
    this.calls = [];
    this.font = "";
    this.fillStyle = "";
    this.strokeStyle = "";
    this.lineWidth = 1;
    this.textAlign = "start";
    this.textBaseline = "alphabetic";
    this.direction = "inherit";
  }

  createLinearGradient(x0, y0, x1, y1) {
    this.calls.push({ method: "createLinearGradient", args: [x0, y0, x1, y1] });
    return {
      addColorStop: (offset, color) => {
        this.calls.push({ method: "addColorStop", args: [offset, color] });
      },
    };
  }

  fillRect(x, y, w, h) {
    this.calls.push({ method: "fillRect", args: [x, y, w, h], fillStyle: this.fillStyle });
  }

  strokeRect(x, y, w, h) {
    this.calls.push({
      method: "strokeRect",
      args: [x, y, w, h],
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }

  fillText(text, x, y) {
    this.calls.push({
      method: "fillText",
      args: [text, x, y],
      font: this.font,
      fillStyle: this.fillStyle,
      textAlign: this.textAlign,
      direction: this.direction,
    });
  }

  measureText(text) {
    return { width: String(text || "").length * 10 };
  }

  save() {
    this.calls.push({ method: "save" });
  }

  restore() {
    this.calls.push({ method: "restore" });
  }

  beginPath() {
    this.calls.push({ method: "beginPath" });
  }

  moveTo(x, y) {
    this.calls.push({ method: "moveTo", args: [x, y] });
  }

  lineTo(x, y) {
    this.calls.push({ method: "lineTo", args: [x, y] });
  }

  stroke() {
    this.calls.push({ method: "stroke", strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
  }
}

class MockCanvasElement {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.context = new MockCanvasContext();
  }

  getContext(type) {
    if (type === "2d") return this.context;
    return null;
  }

  toBlob(callback, type = "image/png") {
    const blob = { type, size: 1024, isBlob: true };
    if (typeof callback === "function") callback(blob);
  }

  toDataURL(type = "image/png") {
    return `data:${type};base64,mockPngData`;
  }
}

// ----------------------------------------------------
// Anki CSV Serializer Tests
// ----------------------------------------------------

const sampleWordsJs = [
  {
    id: 1,
    word: "الغَسَق",
    root: "غ س ق",
    weight: "فَعَل",
    vocalization: "غَسَقٌ",
    meaning: "ظلمة أول الليل",
    englishMeaning: "Twilight; the darkness of early night.",
    example: "أَقِمِ الصَّلَاةَ لِدُلُوكِ الشَّمْسِ إِلَىٰ غَسَقِ اللَّيْلِ — سورة الإسراء",
  },
  {
    id: 2,
    word: "الوَصَب",
    root: "و ص ب",
    weight: "فَعَل",
    vocalization: "وَصَبٌ",
    meaning: "المرض الدائم والألم الملازم",
    englishMeaning: "Chronic illness, continuous pain or fatigue.",
    example: "مَا يُصِيبُ المُسْلِمَ مِنْ نَصَبٍ وَلاَ وَصَبٍ — حديث نبوي",
  },
];

const sampleVocabularyJson = [
  {
    id: "w1",
    word: "السَّمَيْدَع",
    root: "س م د ع",
    pattern: "فَعَيْلَل",
    pronunciation: "/as-samayda‘/",
    meaningAr: "السيد الشريف الشجاع الكريم",
    meaningEn: "A noble, brave and generous leader",
    exampleAr: "يَرِدُ لفظ السَّمَيْدَع في المدح القديم",
  },
  {
    id: "w2",
    word: "الخِنْذِيذ",
    root: "خ ن ذ ذ",
    pattern: "فِعْلِيل",
    pronunciation: "/al-khindheedh/",
    meaningAr: "السيد الحليم الواسع الصبر",
    meaningEn: "A patient noble leader",
    exampleAr: "يَرِدُ الخِنْذِيذ في الشعر القديم",
  },
];

test("serializeAnkiCSV prepends UTF-8 BOM, generates valid RFC 4180 CSV, and uses CRLF", () => {
  const csv = serializeAnkiCSV(null, sampleWordsJs);
  assert.equal(csv.startsWith("\uFEFF"), true, "Must start with UTF-8 BOM (\\uFEFF)");
  assert.equal(csv.endsWith("\r\n"), true, "Must end with trailing CRLF");

  const lines = csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
  assert.equal(lines.length, 3, "1 header row + 2 data rows");
  assert.equal(
    lines[0],
    '"Word","Root","Weight","Vocalization","Meaning","English Meaning","Example"',
    "Header line must match 7 specified columns"
  );
  assert.equal(
    lines[1],
    '"الغَسَق","غ س ق","فَعَل","غَسَقٌ","ظلمة أول الليل","Twilight; the darkness of early night.","أَقِمِ الصَّلَاةَ لِدُلُوكِ الشَّمْسِ إِلَىٰ غَسَقِ اللَّيْلِ — سورة الإسراء"'
  );
});

test("serializeAnkiCSV maps vocabulary.json schema properties seamlessly", () => {
  const csv = serializeAnkiCSV(null, sampleVocabularyJson);
  assert.equal(csv.startsWith("\uFEFF"), true);
  const lines = csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
  assert.equal(lines.length, 3);
  assert.equal(
    lines[1],
    '"السَّمَيْدَع","س م د ع","فَعَيْلَل","/as-samayda‘/","السيد الشريف الشجاع الكريم","A noble, brave and generous leader","يَرِدُ لفظ السَّمَيْدَع في المدح القديم"'
  );
});

test("serializeAnkiCSV escapes double quotes as double-double quotes and handles special characters", () => {
  const quoteWords = [
    {
      id: 10,
      word: 'كَلِمَة',
      root: 'ك ل م',
      weight: 'فَعِلَة',
      vocalization: 'كَلِمَةٌ',
      meaning: 'لفظ دال، "قول"',
      englishMeaning: 'A word, "speech", or utterance, with, commas.',
      example: '«وقالت: "مرحباً بكم"\r\nفي دمشق»',
    },
  ];

  const csv = serializeAnkiCSV(null, quoteWords);
  assert.equal(csv.includes('""قول""'), true, 'Double quotes in meaning must be escaped as ""');
  assert.equal(csv.includes('""speech""'), true, 'Double quotes in englishMeaning must be escaped as ""');
  assert.equal(csv.includes('""مرحباً بكم""'), true, 'Double quotes in example must be escaped as ""');
});

test("serializeAnkiCSV filters by history/assignments in multiple formats", () => {
  // 1. Filter by Set of IDs
  const csvFromSet = serializeAnkiCSV(new Set([1]), sampleWordsJs);
  assert.equal(csvFromSet.includes("الغَسَق"), true);
  assert.equal(csvFromSet.includes("الوَصَب"), false);

  // 2. Filter by Array of ID strings
  const csvFromArray = serializeAnkiCSV(["w2"], sampleVocabularyJson);
  assert.equal(csvFromArray.includes("الخِنْذِيذ"), true);
  assert.equal(csvFromArray.includes("السَّمَيْدَع"), false);

  // 3. Filter by Array of objects
  const csvFromObjArray = serializeAnkiCSV([{ wordId: "w1" }], sampleVocabularyJson);
  assert.equal(csvFromObjArray.includes("السَّمَيْدَع"), true);
  assert.equal(csvFromObjArray.includes("الخِنْذِيذ"), false);

  // 4. Filter by dictionary mapping
  const csvFromDict = serializeAnkiCSV({ 2: { firstSeen: "2026-08-14" } }, sampleWordsJs);
  assert.equal(csvFromDict.includes("الوَصَب"), true);
  assert.equal(csvFromDict.includes("الغَسَق"), false);

  // 5. Filter by Profile object
  const profile = {
    assignments: {
      "2026-08-14": { wordId: "w1", status: "known" },
    },
    wordStates: {
      w1: { status: "known" },
    },
  };
  const csvFromProfile = serializeAnkiCSV(profile, sampleVocabularyJson);
  assert.equal(csvFromProfile.includes("السَّمَيْدَع"), true);
  assert.equal(csvFromProfile.includes("الخِنْذِيذ"), false);
});

test("serializeAnkiCSV handles empty or missing inputs gracefully", () => {
  const emptyCsv = serializeAnkiCSV(null, []);
  assert.equal(emptyCsv, '\uFEFF"Word","Root","Weight","Vocalization","Meaning","English Meaning","Example"\r\n');

  const directWordList = serializeAnkiCSV(sampleWordsJs);
  assert.equal(directWordList.includes("الغَسَق"), true);
});

// ----------------------------------------------------
// wrapText Utility Tests
// ----------------------------------------------------

test("wrapText splits long text into wrapped lines according to canvas measurement", () => {
  const ctx = {
    measureText: (text) => ({ width: text.length * 10 }),
  };

  const lines = wrapText(ctx, "one two three four five six", 100, "16px sans-serif", "rtl");
  assert.equal(Array.isArray(lines), true);
  assert.equal(lines.length > 1, true);
  assert.equal(lines.join(" "), "one two three four five six");

  // Single word longer than max width
  const singleLong = wrapText(ctx, "supercalifragilistic", 50);
  assert.deepEqual(singleLong, ["supercalifragilistic"]);

  // Empty string
  const empty = wrapText(ctx, "", 100);
  assert.deepEqual(empty, []);
});

// ----------------------------------------------------
// renderSocialCard Canvas Generator Tests
// ----------------------------------------------------

test("renderSocialCard generates a complete 1080x1080 social card with all graphic layers", async () => {
  const canvas = new MockCanvasElement();
  const word = {
    id: "w1",
    word: "السَّمَيْدَع",
    root: "س م د ع",
    pattern: "فَعَيْلَل",
    pronunciation: "/as-samayda‘/",
    meaningAr: "السيد الشريف الشجاع الكريم، الجريء في أفعاله الذي لا يهاب المصاعب.",
    meaningEn: "A noble, brave and generous leader, bold in deeds and unafraid of hardship.",
    exampleAr: "يَرِدُ لفظ السَّمَيْدَع في المدح القديم لوصف قائد نبيل شجاع.",
    topics: ["classical-arabic", "language"],
  };

  const blob = await renderSocialCard(word, { canvas, download: false });
  assert.equal(canvas.width, 1080, "Canvas width must be 1080px");
  assert.equal(canvas.height, 1080, "Canvas height must be 1080px");
  assert.equal(blob !== null, true, "Returns generated blob");

  const calls = canvas.context.calls;

  // 1. Background fill
  const bgFill = calls.find((c) => c.method === "fillRect" && c.args[2] === 1080 && c.args[3] === 1080);
  assert.equal(Boolean(bgFill), true, "Fills background at 1080x1080");

  // 2. Dual borders
  const outerBorder = calls.find((c) => c.method === "strokeRect" && c.args[0] === 36 && c.args[2] === 1008);
  assert.equal(Boolean(outerBorder), true, "Draws outer border at (36, 36, 1008, 1008)");
  assert.equal(outerBorder.strokeStyle, "#84cc16");
  assert.equal(outerBorder.lineWidth, 6);

  const innerBorder = calls.find((c) => c.method === "strokeRect" && c.args[0] === 48 && c.args[2] === 984);
  assert.equal(Boolean(innerBorder), true, "Draws inner border at (48, 48, 984, 984)");

  // 3. Watermark calligraphy
  const watermark = calls.find((c) => c.method === "fillText" && c.args[0] === "ض");
  assert.equal(Boolean(watermark), true, "Renders 'ض' calligraphy watermark");
  assert.equal(watermark.args[1], 540);
  assert.equal(watermark.args[2], 540);

  // 4. Header branding
  const brandArabic = calls.find((c) => c.method === "fillText" && c.args[0] === "كَلِمات");
  assert.equal(Boolean(brandArabic), true, "Renders 'كَلِمات' header branding");
  const brandSub = calls.find((c) => c.method === "fillText" && c.args[0] === "كلمة اليوم من الفصحى");
  assert.equal(Boolean(brandSub), true, "Renders subtitle");
  const brandUrl = calls.find((c) => c.method === "fillText" && c.args[0] === "kalimaat.app");
  assert.equal(Boolean(brandUrl), true, "Renders URL");

  // 5. Headword & Pronunciation
  const headword = calls.find((c) => c.method === "fillText" && c.args[0] === "السَّمَيْدَع");
  assert.equal(Boolean(headword), true, "Renders headword text");
  assert.equal(headword.args[1], 540);
  assert.equal(headword.args[2], 310);

  const pronunciation = calls.find((c) => c.method === "fillText" && c.args[0] === "/as-samayda‘/");
  assert.equal(Boolean(pronunciation), true, "Renders pronunciation");
  assert.equal(pronunciation.args[1], 540);
  assert.equal(pronunciation.args[2], 370);

  // 6. Metadata badges (Root, Pattern, Topic)
  const rootVal = calls.find((c) => c.method === "fillText" && c.args[0] === "س م د ع");
  assert.equal(Boolean(rootVal), true, "Renders root badge value");
  const weightVal = calls.find((c) => c.method === "fillText" && c.args[0] === "فَعَيْلَل");
  assert.equal(Boolean(weightVal), true, "Renders weight/pattern badge value");
  const categoryVal = calls.find((c) => c.method === "fillText" && c.args[0] === "classical-arabic");
  assert.equal(Boolean(categoryVal), true, "Renders category/topic badge value");

  // 7. Meaning block & English meaning
  const meaningTitle = calls.find((c) => c.method === "fillText" && c.args[0] === "المعنى والدلالة:");
  assert.equal(Boolean(meaningTitle), true, "Renders meaning section header");

  // 8. Literary example box
  const exampleTitle = calls.find((c) => c.method === "fillText" && c.args[0] === "الشاهد الأدبي:");
  assert.equal(Boolean(exampleTitle), true, "Renders literary example section header");

  // 9. Footer Tagline
  const footer = calls.find((c) => c.method === "fillText" && c.args[0]?.includes("كَلِمات — تجربة يومية"));
  assert.equal(Boolean(footer), true, "Renders footer tagline");
});

test("renderSocialCard manages browser download triggers and object URL cleanup", async () => {
  const canvas = new MockCanvasElement();
  const createdElements = [];
  const clickedLinks = [];
  let revokedUrl = null;

  globalThis.document = {
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        href: "",
        download: "",
        hidden: false,
        clickCount: 0,
        click: function () {
          this.clickCount++;
          clickedLinks.push(this);
        },
        remove: function () {
          this.removed = true;
        },
      };
      createdElements.push(el);
      return el;
    },
    body: {
      appendChild: (child) => {
        child.parentNode = globalThis.document.body;
      },
    },
    fonts: {
      ready: Promise.resolve(),
    },
  };

  globalThis.URL = {
    createObjectURL: (blob) => "blob:kalimat-test-card",
    revokeObjectURL: (url) => {
      revokedUrl = url;
    },
  };

  const word = { id: 42, word: "البَذَخ", root: "ب ذ خ", weight: "فَعَل", meaning: "الفخر والتطاول" };
  await renderSocialCard(word, { canvas, download: true });

  assert.equal(clickedLinks.length, 1, "Download link must be clicked");
  assert.equal(clickedLinks[0].download, "kalimat-word-42.png", "Download attribute must be kalimat-word-42.png");
  assert.equal(clickedLinks[0].href, "blob:kalimat-test-card");
  assert.equal(clickedLinks[0].removed, true, "Download link must be removed from DOM");

  // Await microtask/timer for URL cleanup
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(revokedUrl, "blob:kalimat-test-card", "Object URL must be revoked after download");

  // Clean up global mocks
  delete globalThis.document;
  delete globalThis.URL;
});

test("renderSocialCard handles words without optional fields without crashing", async () => {
  const canvas = new MockCanvasElement();
  const minimalWord = {
    id: "min-1",
    word: "كَلِمَة",
  };

  const blob = await renderSocialCard(minimalWord, { canvas, download: false });
  assert.equal(blob !== null, true);
});

test("KalimatExport exports to globalThis in browser environment", () => {
  assert.equal(typeof globalThis.KalimatExport, "object");
  assert.equal(typeof globalThis.KalimatExport.serializeAnkiCSV, "function");
  assert.equal(typeof globalThis.KalimatExport.renderSocialCard, "function");
  assert.equal(typeof globalThis.KalimatExport.wrapText, "function");
});
