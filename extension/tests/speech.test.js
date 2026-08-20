const test = require("node:test");
const assert = require("node:assert/strict");
const Speech = require("../shared/speech.js");

test("speech playback selects Arabic, repeats, and cancels stale playback", () => {
  const spoken = [];
  let cancelled = 0;
  class Utterance {
    constructor(text) { this.text = text; }
  }
  const speech = {
    getVoices: () => [{ name: "Arabic Natural", lang: "ar-SA" }],
    cancel: () => { cancelled++; },
    speak: (utterance) => spoken.push(utterance),
  };

  const result = Speech.speak("ـكلمة‎", { speech, Utterance, repeat: 2 });
  assert.equal(result.kind, "ok");
  assert.equal(spoken[0].text, "كلمة");
  spoken[0].onend();
  assert.equal(spoken.length, 2);
  Speech.cancel(speech);
  assert.equal(cancelled, 2);
  spoken[1].onend();
  assert.equal(spoken.length, 2);
});

test("speech playback refuses a required Arabic voice", () => {
  class Utterance { constructor(text) { this.text = text; } }
  const result = Speech.speak("كلمة", { speech: { getVoices: () => [], speak() {} }, Utterance, requireVoice: true });
  assert.equal(result.kind, "no-arabic-voice");
});

test("speech playback handles a throwing voice list without throwing", () => {
  class Utterance { constructor(text) { this.text = text; } }
  const result = Speech.speak("كلمة", {
    speech: {
      getVoices() { throw new Error("voices unavailable"); },
      speak() { throw new Error("speech must not start"); }
    },
    Utterance,
    requireVoice: true
  });
  assert.equal(result.kind, "unavailable");
});
