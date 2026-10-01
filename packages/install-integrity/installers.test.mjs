import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("shell installer defaults to immutable stable release and requires explicit development opt-in", async () => {
  const text = await read("install.sh");
  assert.match(text, /CHANNEL="stable"/);
  assert.match(text, /--channel\) CHANNEL="\$2"/);
  assert.match(text, /CHANNEL="development"/);
  assert.match(text, /RELEASE_API="https:\/\/api\.github\.com\/repos\/exxrawrrr\/nyobakantorai\/releases\/latest"/);
  assert.match(text, /install-manifest\.json/);
  assert.match(text, /INSTALL-SHA256SUMS\.txt/);
  assert.match(text, /nyobakantorai-core-\$VERSION\.tar\.gz/);
  assert.match(text, /Stable release integrity verification failed\. No fallback source will be used\./);
  assert.match(text, /\.nyobakantorai-install\.json/);
  assert.doesNotMatch(text, /archive\/refs\/heads\//);
  assert.doesNotMatch(text, /git\s+-C\s+"\$INSTALL_DIR"\s+pull/);
});

test("PowerShell installer defaults to immutable stable release and requires explicit development opt-in", async () => {
  const text = await read("install.ps1");
  assert.match(text, /\[string\]\$Channel = "stable"/);
  assert.match(text, /\$Channel = "development"/);
  assert.match(text, /\$ReleaseApi = "https:\/\/api\.github\.com\/repos\/exxrawrrr\/nyobakantorai\/releases\/latest"/);
  assert.match(text, /install-manifest\.json/);
  assert.match(text, /INSTALL-SHA256SUMS\.txt/);
  assert.match(text, /nyobakantorai-core-\$Version\.zip/);
  assert.match(text, /Stable release integrity verification failed\. No fallback source will be used\./);
  assert.match(text, /\.nyobakantorai-install\.json/);
  assert.doesNotMatch(text, /archive\/refs\/heads\//);
  assert.doesNotMatch(text, /git\s+-C\s+\$InstallDir\s+pull/);
});

test("both installers record required provenance fields", async () => {
  const [sh, ps] = await Promise.all([read("install.sh"), read("install.ps1")]);
  for (const [name, text] of [["install.sh", sh], ["install.ps1", ps]]) {
    for (const field of [
      "install_channel",
      "version",
      "source_commit",
      "artifact_sha256",
      "integrity_verified",
      "installed_at",
      "selected_employees",
    ]) {
      assert.ok(text.includes(field), name + " missing metadata field " + field);
    }
  }
});

test("tagged release workflow builds and publishes immutable install assets from exact Git SHA", async () => {
  const text = await read(".github/workflows/release.yml");
  assert.match(text, /Build immutable core install assets/);
  assert.match(text, /git archive --format=tar\.gz/);
  assert.match(text, /git archive --format=zip/);
  assert.match(text, /\$\{GITHUB_SHA\}/);
  assert.match(text, /build-install-assets\.mjs/);
  assert.match(text, /install-manifest\.json/);
  assert.match(text, /INSTALL-SHA256SUMS\.txt/);
  assert.match(text, /nyobakantorai-core-\*\.tar\.gz/);
  assert.match(text, /nyobakantorai-core-\*\.zip/);
  assert.match(text, /dist\/install-assets\/install\.sh/);
  assert.match(text, /dist\/install-assets\/install\.ps1/);
});


test("README presents release assets as stable quick-start and labels main as development", async () => {
  const text = await read("README.md");
  assert.match(text, /releases\/latest\/download\/install\.sh/);
  assert.match(text, /releases\/latest\/download\/install\.ps1/);
  assert.match(text, /Mutable development path — explicit opt-in only/);
  assert.match(text, /--channel development --ref main/);
  assert.match(text, /-Channel development -Ref main/);
  const installStart = text.indexOf("## Install");
  const devStart = text.indexOf("### Mutable development path");
  assert.ok(installStart >= 0 && devStart > installStart);
  const stableSection = text.slice(installStart, devStart);
  assert.doesNotMatch(stableSection, /raw\.githubusercontent\.com\/exxrawrrr\/nyobakantorai\/main\/install/);
});
