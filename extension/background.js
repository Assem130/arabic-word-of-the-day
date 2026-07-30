if (!globalThis.KalimatVocabulary && typeof importScripts === "function") {
  importScripts("shared/api.js", "shared/date.js", "shared/vocabulary.js");
}
