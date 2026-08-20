const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const extensionRoot = path.join(__dirname, "..");
const distRoot = path.join(extensionRoot, "dist");
const browsers = ["chrome", "firefox"];
const archiveNames = {
  chrome: "kalimat-chrome-0.3.0.zip",
  firefox: "kalimat-firefox-0.3.0.zip",
};
const runtimeFiles = [
  "assets/fonts/Amiri-Bold.woff2",
  "assets/fonts/Amiri-Regular.woff2",
  "assets/fonts/OFL.txt",
  "assets/fonts/Outfit-Medium.woff2",
  "assets/fonts/Outfit-Regular.woff2",
  "assets/fonts/Outfit-SemiBold.woff2",
  "atlas/atlas.css",
  "atlas/atlas.html",
  "atlas/atlas.js",
  "background.js",
  "data/vocabulary.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "popup/popup.css",
  "popup/popup.html",
  "popup/popup.js",
  "shared/date.js",
  "shared/export.js",
  "shared/lookup.js",
  "shared/review-policy.js",
  "shared/review-session.js",
  "shared/speech.js",
  "shared/selector.js",
  "shared/state.js",
  "shared/streak.js",
  "shared/theme.css",
  "shared/theme-init.js",
  "shared/theme.js",
  "shared/vocabulary.js",
];
const expectedPackageFiles = new Set([...runtimeFiles, "manifest.json"]);
let packageOutput = "";
let packageChecked = false;

function listFiles(root, prefix = "") {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listFiles(path.join(root, entry.name), relative);
    return [relative.replaceAll("\\", "/")];
  });
}

function manifest(name) {
  return JSON.parse(fs.readFileSync(path.join(extensionRoot, `manifest.${name}.json`), "utf8"));
}

function packageManifest(browser) {
  return JSON.parse(fs.readFileSync(path.join(distRoot, browser, "manifest.json"), "utf8"));
}

function archiveEntries(browser) {
  const bytes = fs.readFileSync(path.join(distRoot, archiveNames[browser]));
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, `${browser} archive is missing its end record`);
  const count = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50, `${browser} archive has an invalid central entry`);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameLength).replaceAll("\\", "/");
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const compressed = bytes.subarray(
      localOffset + 30 + localNameLength + localExtraLength,
      localOffset + 30 + localNameLength + localExtraLength + compressedSize,
    );
    const content = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed) : null;
    assert.ok(content, `${browser}/${name} uses an unsupported ZIP method`);
    assert.equal(content.length, uncompressedSize, `${browser}/${name} has an invalid size`);
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function assertSafeManifest(value, browser = "chrome") {
  assert.equal(value.manifest_version, 3);
  assert.deepEqual(value.permissions, ["storage", "contextMenus"]);
  assert.deepEqual(value.optional_permissions, ["alarms", "notifications"]);
  assert.deepEqual(value.omnibox, { keyword: "km" });
  if (browser === "chrome") {
    assert.deepEqual(value.optional_host_permissions, ["https://ar.wiktionary.org/*"]);
  } else {
    assert.equal(Object.hasOwn(value, "optional_host_permissions"), false);
  }
  assert.equal(Object.hasOwn(value, "host_permissions"), false);
  assert.equal(Object.hasOwn(value, "content_scripts"), false);
  assert.equal(value.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'");
  assert.equal(value.action.default_popup, "popup/popup.html");
}

function ensurePackages() {
  if (packageChecked) return;
  if (process.env.KALIMAT_PACKAGE_ALREADY_BUILT !== "1") {
    packageOutput = childProcess.execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(extensionRoot, "tools", "package.ps1")],
      { stdio: "pipe" },
    ).toString();
  }
  packageChecked = true;
}

function packageTextFiles(browser) {
  return listFiles(path.join(distRoot, browser))
    .filter((relative) => /\.(?:css|html|js|json|md)$/i.test(relative))
    .map((relative) => ({ relative, text: fs.readFileSync(path.join(distRoot, browser, relative), "utf8") }));
}

function assertNoUnsafePayload(browser) {
  const files = packageTextFiles(browser);
  const forbiddenPath = /(?:^|\/)(?:tests|tools)(?:\/|$)|\.map$|(?:^|\/)manifest\.(?:chrome|firefox)\.json$|(?:^|\/)PRIVACY\.md$/i;
  const allowedRemoteUrl = /^https:\/\/ar\.wiktionary\.org\//i;
  const remoteUrlRegex = /\b(?:https?|wss?):\/\/[^\s"'`<>]+/gi;
  const unsafeSink = /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function\s*\(|Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'])/;
  const secret = /-----BEGIN [^-]+ PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|secret[_-]?key|password)\s*[:=]\s*["'][^"']{8,}["']|\b(?:sk|pk|ghp|github_pat|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/i;
  for (const relative of listFiles(path.join(distRoot, browser))) {
    assert.equal(forbiddenPath.test(relative), false, `${browser}/${relative} is development-only`);
  }
  for (const { relative, text } of files) {
    const urls = text.match(remoteUrlRegex) || [];
    for (const url of urls) {
      const isAllowed =
        (relative === "manifest.json" && browser === "chrome" && allowedRemoteUrl.test(url)) ||
        (["background.js", "atlas/atlas.js", "shared/lookup.js"].includes(relative) && allowedRemoteUrl.test(url));
      assert.ok(isAllowed, `${browser}/${relative} contains unauthorized remote URL: ${url}`);
    }
    assert.equal(unsafeSink.test(text), false, `${browser}/${relative} contains an unsafe sink`);
    assert.equal(secret.test(text), false, `${browser}/${relative} contains a secret-like value`);
    assert.equal(/sourceMappingURL=/i.test(text), false, `${browser}/${relative} contains a source map reference`);
    if (/\.html$/i.test(relative)) {
      assert.equal(/<script(?![^>]*\bsrc\s*=)/i.test(text), false, `${browser}/${relative} contains inline script`);
      assert.equal(/\son[a-z]+\s*=/i.test(text), false, `${browser}/${relative} contains an inline event handler`);
    }
  }
}

test("Chrome manifest uses a MV3 service worker with fixed optional ar.wiktionary.org host permission", () => {
  const chrome = manifest("chrome");
  assertSafeManifest(chrome, "chrome");
  assert.equal(chrome.version, "0.3.0");
  assert.deepEqual(Object.keys(chrome.background), ["service_worker"]);
  assert.equal(chrome.background.service_worker, "background.js");
});

test("Firefox manifest uses ordered event-page scripts with no host permissions", () => {
  const firefox = manifest("firefox");
  assertSafeManifest(firefox, "firefox");
  assert.equal(firefox.version, "0.3.0");
  assert.deepEqual(firefox.browser_specific_settings, {
    gecko: {
      id: "kalimat@assem130.github.io",
      data_collection_permissions: { required: ["none"] },
    },
  });
  assert.deepEqual(Object.keys(firefox.background), ["scripts"]);
  assert.deepEqual(firefox.background.scripts, ["shared/date.js", "shared/vocabulary.js", "shared/review-policy.js", "shared/state.js", "shared/selector.js", "shared/lookup.js", "background.js"]);
});

test("packaged CSS enforces design tokens, system Arabic typography, and accessible focus styles", () => {
  for (const rel of ["popup/popup.css", "atlas/atlas.css", "shared/theme.css"]) {
    const css = fs.readFileSync(path.join(extensionRoot, rel), "utf8");
    assert.doesNotMatch(css, /@import\s+url\(/i, `${rel} must not import remote stylesheets`);
    assert.doesNotMatch(css, /https?:\/\//i, `${rel} must not contain remote URLs`);
    assert.match(css, /--[a-z0-9-]+:/i, `${rel} must declare CSS custom properties (theme tokens)`);
    if (rel === "shared/theme.css") {
      assert.match(css, /--(?:sans|serif):[^;]+(?:Amiri|Traditional Arabic|Outfit|Segoe UI|system-ui|sans-serif)/i, `${rel} must declare local typography tokens`);
      assert.match(css, /@font-face\s*\{[^}]*font-family:\s*["']?Amiri["']?[^}]*url\(["']?\.\.\/assets\/fonts\/Amiri-Regular\.woff2["']?\)/i);
      assert.match(css, /@font-face\s*\{[^}]*font-family:\s*["']?Outfit["']?[^}]*url\(["']?\.\.\/assets\/fonts\/Outfit-Regular\.woff2["']?\)/i);
    } else {
      assert.match(css, /font-family:[^;]+(?:system-ui|Segoe UI|Amiri|Traditional Arabic|Outfit|sans-serif|var\(--(?:sans|serif)\))/i, `${rel} must use native/system Arabic typography stack`);
    }
    assert.match(css, /:focus-visible/i, `${rel} must define focus-visible indicators`);
  }
});

test("privacy document states local learning storage, online-query scope, analytics limits, and controls", () => {
  const privacy = fs.readFileSync(path.join(extensionRoot, "PRIVACY.md"), "utf8");
  assert.match(privacy, /(?:browser|local) storage|storage\.local/i);
  assert.match(privacy, /learning data stays in the browser's local extension storage/i);
  assert.match(privacy, /only the normalized query/i);
  assert.match(privacy, /Wikimedia servers|ar\.wiktionary\.org/i);
  assert.match(privacy, /unreviewed/i);
  assert.match(privacy, /cannot be saved/i);
  assert.match(privacy, /Firefox remains local-only/i);
  assert.doesNotMatch(privacy, /No backend or server receives your data/i);
  assert.match(privacy, /no (?:analytics|tracking)|without (?:analytics|tracking)/i);
  assert.match(privacy, /optional reminder|reminder.{0,24}optional/i);
  assert.match(privacy, /export/i);
  assert.match(privacy, /delete|deletion|clear/i);
});

test("packager reports per-browser file and byte totals", () => {
  ensurePackages();
  if (process.env.KALIMAT_PACKAGE_ALREADY_BUILT === "1") {
    const script = fs.readFileSync(path.join(extensionRoot, "tools", "package.ps1"), "utf8");
    assert.match(script, /vocabulary/i);
    assert.match(script, /popup/i);
    assert.match(script, /bytes/i);
  } else {
    assert.match(packageOutput, /Chrome.*files.*bytes/i);
    assert.match(packageOutput, /Firefox.*files.*bytes/i);
  }
});

test("both packages contain exactly the runtime allowlist and selected manifest", () => {
  ensurePackages();
  for (const browser of browsers) {
    assert.deepEqual(new Set(listFiles(path.join(distRoot, browser))), expectedPackageFiles, `${browser} package drifted from the allowlist`);
    assert.doesNotThrow(() => assertSafeManifest(packageManifest(browser), browser));
    assert.deepEqual(packageManifest(browser), manifest(browser));
    assert.equal(manifest(browser).version, "0.3.0");
    assert.equal(packageManifest(browser).background.service_worker ?? undefined, browser === "chrome" ? "background.js" : undefined);
    if (browser === "firefox") assert.deepEqual(packageManifest(browser).background.scripts, manifest("firefox").background.scripts);
  }
});

test("ZIP archives have expected flat roots and browser-selected manifests", () => {
  ensurePackages();
  for (const browser of browsers) {
    const archive = path.join(distRoot, archiveNames[browser]);
    assert.equal(fs.existsSync(archive), true, `${archiveNames[browser]} was not created`);
    const entries = archiveEntries(browser);
    assert.deepEqual(new Set(entries.keys()), expectedPackageFiles, `${browser} archive drifted from the runtime allowlist`);
    assert.deepEqual(JSON.parse(entries.get("manifest.json").toString("utf8")), manifest(browser));
  }
});

test("ZIP archive bytes match their selected source files exactly", () => {
  ensurePackages();
  for (const browser of browsers) {
    const entries = archiveEntries(browser);
    for (const relative of expectedPackageFiles) {
      const sourceRelative = relative === "manifest.json" ? `manifest.${browser}.json` : relative;
      assert.deepEqual(entries.get(relative), fs.readFileSync(path.join(extensionRoot, sourceRelative)), `${browser}/${relative} drifted from source`);
    }
  }
});

test("packaged runtime files match source exactly", () => {
  ensurePackages();
  const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  for (const browser of browsers) {
    for (const relative of runtimeFiles) {
      assert.equal(hash(path.join(extensionRoot, relative)), hash(path.join(distRoot, browser, relative)), `${browser}/${relative} drifted from source`);
    }
  }
});

test("packages contain no remote code, unsafe sinks, secrets, or development files", () => {
  ensurePackages();
  for (const browser of browsers) assertNoUnsafePayload(browser);
});

test("runtime vocabulary and popup code stay below release budgets", () => {
  ensurePackages();
  for (const browser of browsers) {
    const packageRoot = path.join(distRoot, browser);
    assert.ok(fs.statSync(path.join(packageRoot, "data/vocabulary.json")).size < 2_097_152, `${browser} vocabulary exceeds 2 MiB`);
    const popupBytes = ["popup/popup.html", "popup/popup.css", "popup/popup.js"]
      .reduce((total, relative) => total + fs.statSync(path.join(packageRoot, relative)).size, 0);
    assert.ok(popupBytes < 102_400, `${browser} popup code exceeds 100 KiB`);
  }
});

test("packager cleanup is scoped to validated browser targets", () => {
  const script = fs.readFileSync(path.join(extensionRoot, "tools", "package.ps1"), "utf8");
  assert.doesNotMatch(script, /Remove-Item\s+[^\r\n]*\$distRoot\s+-Recurse/i);
  assert.match(script, /Remove-Item\s+[^\r\n]*\$target\s+-Recurse/i);
});
