(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatSpeech = api;
})(typeof globalThis === "object" ? globalThis : this, function (root) {
  "use strict";

  let active = null;

  function clean(text) {
    return String(text || "").replace(/[\u200B-\u200F\uFEFF\u0640]/g, "").trim();
  }

  function selectArabicVoice(voices) {
    return voices.find((voice) => {
      const language = String(voice?.lang || "").toLowerCase();
      const name = String(voice?.name || "").toLowerCase();
      return language.startsWith("ar") && ["natural", "neural", "online", "siri", "enhanced"].some((kind) => name.includes(kind));
    }) || voices.find((voice) => String(voice?.lang || "").toLowerCase().startsWith("ar")) || null;
  }

  function speak(text, options = {}) {
    const target = options.target || root.window || root;
    const speech = options.speech || root.speechSynthesis;
    const Utterance = options.Utterance || root.SpeechSynthesisUtterance;
    const value = clean(text);
    if (!value || !speech || typeof speech.speak !== "function" || typeof Utterance !== "function") return { kind: "unavailable" };
    const voices = typeof speech.getVoices === "function" ? Array.from(speech.getVoices() || []) : [];
    const voice = (typeof options.selectVoice === "function" ? options.selectVoice(voices) : selectArabicVoice(voices)) || null;
    if (options.requireVoice === true && !voice) return { kind: "no-arabic-voice" };
    const token = {};
    active = token;
    try { speech.cancel?.(); } catch (_) {}
    let remaining = Number.isInteger(options.repeat) && options.repeat > 0 ? options.repeat : 1;
    const run = () => {
      if (active !== token) return;
      let utterance;
      try {
        utterance = new Utterance(value);
        utterance.lang = voice?.lang || "ar-SA";
        utterance.voice = voice;
        utterance.rate = Number.isFinite(options.rate) ? options.rate : 0.85;
        utterance.pitch = 1;
        target._activeUtterance = utterance;
        utterance.onstart = () => { if (active === token) options.onStart?.(); };
        utterance.onend = () => {
          if (active !== token) return;
          if (--remaining > 0) {
            if (Number.isFinite(options.gapMs) && options.gapMs > 0 && typeof root.setTimeout === "function") return root.setTimeout(run, options.gapMs);
            return run();
          }
          active = null;
          if (target._activeUtterance === utterance) target._activeUtterance = null;
          options.onEnd?.();
        };
        utterance.onerror = () => {
          if (active !== token) return;
          active = null;
          if (target._activeUtterance === utterance) target._activeUtterance = null;
          options.onError?.();
        };
        speech.speak(utterance);
      } catch (_) {
        if (active === token) {
          active = null;
          if (target._activeUtterance === utterance) target._activeUtterance = null;
          options.onError?.();
        }
      }
    };
    run();
    return { kind: "ok", voice };
  }

  function cancel(speech = root.speechSynthesis) {
    active = null;
    (root.window || root)._activeUtterance = null;
    try { speech?.cancel?.(); } catch (_) {}
  }

  return { clean, selectArabicVoice, speak, cancel };
});
