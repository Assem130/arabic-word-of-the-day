const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const extensionRoot = path.join(__dirname, "..");
const distRoot = path.join(extensionRoot, "dist");
const browsers = ["chrome", "firefox"];
const runtimeFiles = [
  "background.js",
  "data/vocabulary.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "atlas/atlas.html",
  "atlas/atlas.css",
  "atlas/atlas.js",
  "popup/popup.html",
  "popup/popup.css",
  "popup/popup.js",
  "shared/date.js",
  "shared/selector.js",
  "shared/state.js",
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

function assertSafeManifest(value) {
  assert.equal(value.manifest_version, 3);
  assert.deepEqual(value.permissions, ["storage"]);
  assert.deepEqual(value.optional_permissions, ["alarms", "notifications"]);
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
  const remoteUrl = /\b(?:https?|wss?):\/\//i;
  const unsafeSink = /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function\s*\(|Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'])/;
  const secret = /-----BEGIN [^-]+ PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|secret[_-]?key|password)\s*[:=]\s*["'][^"']{8,}["']|\b(?:sk|pk|ghp|github_pat|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/i;
  for (const relative of listFiles(path.join(distRoot, browser))) {
    assert.equal(forbiddenPath.test(relative), false, `${browser}/${relative} is development-only`);
  }
  for (const { relative, text } of files) {
    assert.equal(remoteUrl.test(text), false, `${browser}/${relative} contains a remote URL`);
    assert.equal(unsafeSink.test(text), false, `${browser}/${relative} contains an unsafe sink`);
    assert.equal(secret.test(text), false, `${browser}/${relative} contains a secret-like value`);
    assert.equal(/sourceMappingURL=/i.test(text), false, `${browser}/${relative} contains a source map reference`);
    if (/\.html$/i.test(relative)) {
      assert.equal(/<script(?![^>]*\bsrc\s*=)/i.test(text), false, `${browser}/${relative} contains inline script`);
      assert.equal(/\son[a-z]+\s*=/i.test(text), false, `${browser}/${relative} contains an inline event handler`);
    }
  }
}

test("Chrome manifest uses a MV3 service worker with no unsafe permissions", () => {
  const chrome = manifest("chrome");
  assertSafeManifest(chrome);
  assert.deepEqual(Object.keys(chrome.background), ["service_worker"]);
  assert.equal(chrome.background.service_worker, "background.js");
});

test("Firefox manifest uses ordered event-page scripts with no unsafe permissions", () => {
  const firefox = manifest("firefox");
  assertSafeManifest(firefox);
  assert.deepEqual(Object.keys(firefox.background), ["scripts"]);
  assert.deepEqual(firefox.background.scripts, ["shared/date.js", "shared/vocabulary.js", "shared/state.js", "shared/selector.js", "background.js"]);
});

test("privacy document states local storage, no backend analytics, optional reminders, export, and deletion", () => {
  const privacy = fs.readFileSync(path.join(extensionRoot, "PRIVACY.md"), "utf8");
  assert.match(privacy, /(?:browser|local) storage|storage\.local/i);
  assert.match(privacy, /no (?:analytics|tracking)|without (?:analytics|tracking)/i);
  assert.match(privacy, /no (?:backend|server)|without a backend/i);
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
    assert.doesNotThrow(() => assertSafeManifest(packageManifest(browser)));
    assert.equal(packageManifest(browser).background.service_worker ?? undefined, browser === "chrome" ? "background.js" : undefined);
    if (browser === "firefox") assert.deepEqual(packageManifest(browser).background.scripts, manifest("firefox").background.scripts);
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
