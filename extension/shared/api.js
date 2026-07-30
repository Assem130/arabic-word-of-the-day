const ExtApi = globalThis.browser ?? globalThis.chrome;
if (!ExtApi) throw new Error("WebExtension API unavailable.");
if (typeof module === "object" && module.exports) module.exports = { ExtApi };
