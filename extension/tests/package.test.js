const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function manifest(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", `manifest.${name}.json`), "utf8"));
}

function assertSafeManifest(value) {
  assert.equal(value.manifest_version, 3);
  assert.deepEqual(value.permissions, ["storage"]);
  assert.deepEqual(value.optional_permissions, ["alarms", "notifications"]);
  assert.equal(Object.hasOwn(value, "host_permissions"), false);
  assert.equal(Object.hasOwn(value, "content_scripts"), false);
  assert.match(value.content_security_policy.extension_pages, /^script-src 'self'; object-src 'self';?$/);
  assert.equal(value.action.default_popup, "popup/popup.html");
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
  assert.deepEqual(firefox.background.scripts, ["shared/api.js", "shared/date.js", "shared/vocabulary.js", "shared/state.js", "shared/selector.js", "background.js"]);
});

test("packages only the runtime allowlist for both browsers", () => {
  childProcess.execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "..", "tools", "package.ps1")], { stdio: "pipe" });
  for (const browser of ["chrome", "firefox"]) {
    const files = fs.readdirSync(path.join(__dirname, "..", "dist", browser), { recursive: true }).map((file) => String(file).replaceAll("\\", "/"));
    assert.equal(files.includes("manifest.chrome.json"), false);
    assert.equal(files.includes("manifest.firefox.json"), false);
    assert.equal(files.some((file) => file.startsWith("tests") || file.startsWith("tools")), false);
    assert.equal(files.includes("shared/state.js"), true);
    assert.equal(files.includes("shared/selector.js"), true);
    assert.equal(files.includes("popup/popup.css"), true);
    assert.equal(files.includes("popup/popup.js"), true);
    assert.equal(files.includes("atlas/atlas.html"), true);
    assert.equal(files.includes("atlas/atlas.css"), true);
    assert.equal(files.includes("atlas/atlas.js"), true);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dist", browser, "manifest.json"), "utf8")));
  }
});

test("packaged runtime content matches source for both browsers", () => {
  const runtimeFiles = [
    "background.js", "data/vocabulary.json", "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png",
    "atlas/atlas.html", "atlas/atlas.css", "atlas/atlas.js", "popup/popup.html", "popup/popup.css", "popup/popup.js",
    "shared/api.js", "shared/date.js", "shared/selector.js", "shared/state.js", "shared/vocabulary.js",
  ];
  const extensionRoot = path.join(__dirname, "..");
  const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  for (const browser of ["chrome", "firefox"]) {
    for (const relative of runtimeFiles) assert.equal(hash(path.join(extensionRoot, relative)), hash(path.join(extensionRoot, "dist", browser, relative)), `${browser}/${relative} drifted from source`);
  }
});
