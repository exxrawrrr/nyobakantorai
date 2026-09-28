import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "README.md", "SECURITY.md", "CONTRIBUTING.md", "LICENSE",
  ".gitignore", ".env.example", "package.json",
  "office/package.json", "office/server.mjs", "office/src/asset-manifest.json",
  "packages/runtime-adapter/index.mjs", "packages/runtime-adapter/index.test.mjs", "packages/runtime-adapter/README.md",
  "docs/THREAT-MODEL.md", "docs/PRIVACY.md", "docs/RUNTIME-ADAPTER-SPEC.md", "docs/APPROVAL-MODEL.md",
  "docs/DEMO.md", "docs/RELEASE-CHECKLIST.md", "docs/PUBLICATION-RUNBOOK.md", "CHANGELOG.md", "SUPPORT.md", "CODE_OF_CONDUCT.md",
  "docs/assets/README.md", "docs/assets/office-overview.png", "docs/assets/approval-flow.png",
];
for (const file of required) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing required public project file: ${file}`);
}

const readme = readFileSync(resolve(root, "README.md"), "utf8");
if (!readme.includes("git clone https://github.com/exxrawrrr/nyobakantorai.git")) throw new Error("README does not point to the canonical repository URL.");
if (readme.includes("nyobakantorai-release")) throw new Error("README still references the temporary release-candidate repository name.");

const pkg = JSON.parse(readFileSync(resolve(root, "office/package.json"), "utf8"));
if (pkg.name !== "nyobakantorai") throw new Error("Office package name is not portable.");

const core = ["office/server.mjs", "office/stop.mjs", "office/package.json"];
const privateMarkers = [
  /D:\\RAFDI_DATA/i, /C:\\Users\\User/i, /03_AI_OFFICE/i, /Office-Next/i,
  /AI-OFFICE-OPERATIONS/i, /Office-Preview/i,
];
for (const file of core) {
  const content = readFileSync(resolve(root, file), "utf8");
  for (const marker of privateMarkers) {
    if (marker.test(content)) throw new Error(`Private/legacy marker leaked into product core: ${file}`);
  }
}

const manifest = JSON.parse(readFileSync(resolve(root, "office/src/asset-manifest.json"), "utf8"));
if (manifest.schema !== 2 || manifest.license !== "MIT") throw new Error("Asset manifest lacks public provenance/license.");
for (const asset of manifest.assets ?? []) {
  if (!asset.output?.endsWith(".svg") || asset.provenance !== "original_svg_generated_for_nyobakantorai") {
    throw new Error(`Asset provenance rejected: ${asset.output ?? "unknown"}`);
  }
  for (const forbidden of ["source_file", "source_sha256", "source_runtime_path", "crop"]) {
    if (forbidden in asset) throw new Error(`Private reference metadata leaked into asset: ${asset.output}`);
  }
}

const expectedScreenshots = new Map([
  ["docs/assets/office-overview.png", "9BD001D8AD182411761D910562094B096A636FCE08BF5CA5D00D5389F4D92D7B"],
  ["docs/assets/approval-flow.png", "6B894CDEF9D117615AF705C31320708F4CF57C8578BF32B63B07CFBEB9D02BF2"],
]);
for (const [file, expected] of expectedScreenshots) {
  const digest = createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex").toUpperCase();
  if (digest !== expected) throw new Error(`Public screenshot provenance changed unexpectedly: ${file}`);
}

const server = readFileSync(resolve(root, "office/server.mjs"), "utf8");
if (!/runtime_adapter_api:\s*1/.test(server) || !/human_approval_gate:\s*true/.test(server)) {
  throw new Error("Capability contract is missing adapter API or human approval gate.");
}

const adapter = readFileSync(resolve(root, "packages/runtime-adapter/index.mjs"), "utf8");
for (const forbiddenCapability of ["write", "dispatch", "external_write", "paid_action", "account_change", "destructive"]) {
  if (!adapter.includes(`"${forbiddenCapability}"`)) throw new Error(`Runtime adapter safety contract is missing: ${forbiddenCapability}`);
}

console.log("Repository product-surface audit passed.");
