(function (root, factory) {
  const vocabulary = root.KalimatVocabulary || (typeof require === "function" ? require("./vocabulary.js") : null);
  const api = factory(vocabulary);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatLookup = api;
})(globalThis, function (vocabulary) {
  "use strict";

  const canonicalSearchKey = vocabulary?.canonicalSearchKey;
  if (typeof canonicalSearchKey !== "function") throw new TypeError("KalimatVocabulary.canonicalSearchKey is required.");

  const WIKTIONARY_API = "https://ar.wiktionary.org/w/api.php";
  const WIKTIONARY_WIKI = "https://ar.wiktionary.org/wiki";
  const MAX_QUERY_CODE_POINTS = 64;
  const MAX_BODY_BYTES = 262144; // 256 KiB
  const TIMEOUT_MS = 8000;

  function validateQuery(query) {
    if (typeof query !== "string") {
      throw new TypeError("Invalid lookup: query must be a string.");
    }
    if (/[\x00-\x1F\x7F-\x9F]/.test(query)) {
      throw new TypeError("Invalid lookup: query contains control characters.");
    }
    const rawTrimmed = query.trim();
    if (rawTrimmed.length === 0) {
      throw new TypeError("Invalid lookup: query cannot be empty.");
    }
    if (/^(?:__proto__|constructor|prototype)$/.test(rawTrimmed)) {
      throw new TypeError("Invalid lookup: query contains forbidden prototype key.");
    }

    const normalized = canonicalSearchKey(query);
    if (normalized.length === 0) {
      throw new TypeError("Invalid lookup: query cannot be empty after normalization.");
    }
    const codePoints = [...normalized];
    if (codePoints.length < 1 || codePoints.length > MAX_QUERY_CODE_POINTS || query.length > 256) {
      throw new TypeError("Invalid lookup: query length out of bounds.");
    }
    if (/^(?:__proto__|constructor|prototype)$/.test(normalized)) {
      throw new TypeError("Invalid lookup: query contains forbidden prototype key.");
    }
    return normalized;
  }

  function createTimeoutSignal(ms) {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(ms);
    }
    if (typeof AbortController !== "undefined") {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    }
    return undefined;
  }

  function getUtf8ByteLength(text) {
    if (typeof Buffer !== "undefined" && typeof Buffer.byteLength === "function") {
      return Buffer.byteLength(text, "utf8");
    }
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(text).length;
    }
    return text.length;
  }

  async function readLimitedBody(response, maxBytes) {
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength || value.length || 0;
          if (totalBytes > maxBytes) {
            try { await reader.cancel(); } catch (_) {}
            throw new Error("Response exceeds size limit.");
          }
          chunks.push(value);
        }
      }
      if (chunks.length === 0) return "";
      if (typeof Buffer !== "undefined" && Buffer.concat) {
        return Buffer.concat(chunks).toString("utf8");
      }
      const decoder = new TextDecoder("utf-8");
      let result = "";
      for (const chunk of chunks) result += decoder.decode(chunk, { stream: true });
      return result + decoder.decode();
    }

    if (typeof response.text === "function") {
      const text = await response.text();
      if (typeof text !== "string") throw new Error("Response text must be a string.");
      if (getUtf8ByteLength(text) > maxBytes) throw new Error("Response exceeds size limit.");
      return text;
    }
    if (typeof response.json === "function") {
      const obj = await response.json();
      const jsonStr = JSON.stringify(obj);
      if (getUtf8ByteLength(jsonStr) > maxBytes) throw new Error("Response exceeds size limit.");
      return jsonStr;
    }
    throw new Error("Cannot read response body.");
  }

  function contentTypeIsJson(response) {
    if (!response?.headers || typeof response.headers.get !== "function") return false;
    const contentType = response.headers.get("content-type");
    return typeof contentType === "string" && contentType.split(";", 1)[0].trim().toLowerCase() === "application/json";
  }

  function validPlainTextPage(data) {
    if (!data || typeof data !== "object" || !data.query || typeof data.query !== "object" || !Array.isArray(data.query.pages) || data.query.pages.length !== 1) return null;
    const page = data.query.pages[0];
    if (!page || typeof page !== "object") return null;
    if (page.pageid === -1) return { notFound: true };
    if (typeof page.title !== "string" || page.title.trim().length === 0 || typeof page.extract !== "string" || page.extract.trim().length === 0) return null;
    const definitionAr = page.extract.trim();
    if (/[<>]/.test(definitionAr)) return null;
    return { title: page.title.trim(), definitionAr };
  }

  async function performLookup(rawQuery, customFetch) {
    const query = validateQuery(rawQuery);
    const fetchFn = customFetch || globalThis.fetch;
    if (typeof fetchFn !== "function") return { kind: "error" };

    const params = new URLSearchParams({
      action: "query",
      prop: "extracts",
      explaintext: "1",
      redirects: "1",
      titles: query,
      format: "json",
      formatversion: "2",
    });
    const targetUrl = `${WIKTIONARY_API}?${params.toString()}`;
    const signal = createTimeoutSignal(TIMEOUT_MS);

    try {
      const response = await fetchFn(targetUrl, {
        method: "GET",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal,
      });

      if (!response || !response.ok) return response?.status === 404 ? { kind: "not-found" } : { kind: "error" };
      if (!contentTypeIsJson(response)) return { kind: "error" };

      const text = await readLimitedBody(response, MAX_BODY_BYTES);
      let data;
      try { data = JSON.parse(text); } catch (_) { return { kind: "error" }; }
      if (data?.error) return { kind: "error" };

      const page = validPlainTextPage(data);
      if (!page) return { kind: "error" };
      if (page.notFound) return { kind: "not-found" };

      return {
        kind: "online-result",
        query,
        headword: page.title,
        definitionAr: page.definitionAr,
        sourceUrl: `${WIKTIONARY_WIKI}/${encodeURIComponent(page.title)}`,
        retrievedAt: new Date().toISOString(),
        unreviewed: true,
      };
    } catch (_) {
      return { kind: "error" };
    }
  }

  return { canonicalSearchKey, validateQuery, performLookup };
});
