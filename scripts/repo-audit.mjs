import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "README.md", "SECURITY.md", "config/upstream-sources.json", "config/integrations.json", "config/capability-taxonomy.json", "config/capability-catalog.json", "schemas/capability.schema.json", "config/skill-provenance.json", "config/memory-policy.json", "CONTRIBUTING.md", "LICENSE", "ACKNOWLEDGEMENTS.md", "config/employees.json", "config/capabilities.json", "scripts/generate-workforce.mjs", "scripts/generate-capability-catalog.mjs", "scripts/capability-catalog.test.mjs", "office/workforce.mjs", "install.ps1", "install.sh", "scripts/preflight.mjs", "scripts/hermes-bootstrap.mjs", "scripts/hermes-profile-distribution.test.mjs", "scripts/employee-selection.mjs", "scripts/employee-pack.mjs", "scripts/validate-agent-skills.py",
  ".gitignore", ".env.example", "package.json",
  "office/package.json", "office/server.mjs", "office/src/asset-manifest.json",
  "packages/runtime-adapter/index.mjs", "packages/runtime-adapter/index.test.mjs", "packages/runtime-adapter/http-readonly.mjs", "packages/runtime-adapter/http-readonly.test.mjs", "packages/runtime-adapter/README.md", "packages/capability-router/index.mjs", "packages/capability-router/index.test.mjs", "packages/capability-router/README.md",
  "docs/MARKDOWN-KNOWLEDGE.md", "docs/UPSTREAM-SOURCE-CATALOG.md", "docs/EMPLOYEE-PACKS.md", "docs/PERSONALITY-CONTRACT.md", "docs/MEMORY-LEARNING.md", "docs/SKILL-PORTABILITY.md", "docs/EVALUATION.md", "docs/THREAT-MODEL.md", "docs/PRIVACY.md", "docs/RUNTIME-ADAPTER-SPEC.md", "docs/APPROVAL-MODEL.md", "docs/HERMES-FIRST-SETUP.md", "docs/EMPLOYEE-ARCHITECTURE.md", "docs/CAPABILITY-MODEL.md", "docs/AUTONOMY-MODES.md", "docs/ADS-WORKERS.md", "docs/TELEGRAM-OFFICE.md", "docs/V0.3-UPGRADE.md", "docs/ADDING-EMPLOYEE.md",
  "docs/DEMO.md", "docs/RELEASE-CHECKLIST.md", "docs/PUBLICATION-RUNBOOK.md", "CHANGELOG.md", "SUPPORT.md", "CODE_OF_CONDUCT.md",
  "docs/assets/README.md", "docs/assets/office-overview.png", "docs/assets/approval-flow.png", "docs/assets/meet-the-office.gif", "docs/assets/employee-showcase.html",
  "scripts/smoke-test.mjs", "scripts/upstream-provenance.test.mjs", "scripts/new-employee.mjs", "scripts/new-employee.test.mjs", "scripts/personality-contract.test.mjs", "scripts/employee-contract.test.mjs", "scripts/employee-selection.test.mjs", "scripts/employee-pack.test.mjs", "scripts/memory-policy.test.mjs", "packages/context-guard/index.mjs", "packages/context-guard/index.test.mjs", "benchmarks/context-compaction/fixtures.json", "benchmarks/context-compaction/run.mjs", "benchmarks/context-compaction/README.md", "schemas/learning-event.schema.json", "schemas/skill-candidate.schema.json", "packages/memory-learning/index.mjs", "packages/memory-learning/index.test.mjs", "benchmarks/adversarial-policy/run.mjs", "benchmarks/adversarial-policy/README.md", "packages/evidence-verifier/index.mjs", "packages/evidence-verifier/index.test.mjs", "scripts/hermes-remove-selected.mjs", "scripts/hermes-remove-selected.test.mjs", "config/harness-compatibility.json", "scripts/export-skills.mjs", "scripts/export-skills.test.mjs", "scripts/workforce-doctor.mjs",
];
for (const file of required) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing required public project file: ${file}`);
}

const workforceRegistry = JSON.parse(readFileSync(resolve(root, "config/employees.json"), "utf8"));
if (!Array.isArray(workforceRegistry.employees) || workforceRegistry.employees.length !== workforceRegistry.employee_count || workforceRegistry.employees.length < 16) {
  throw new Error("Canonical employee registry is incomplete.");
}
for (const employee of workforceRegistry.employees) {
  const manifest = `hermes-profiles/${employee.id}/distribution.yaml`;
  if (!existsSync(resolve(root, manifest))) throw new Error(`Missing Hermes profile distribution: ${manifest}`);
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
if (manifest.schema !== 3 || manifest.license !== "MIT") throw new Error("Asset manifest lacks public provenance/license.");
for (const asset of manifest.assets ?? []) {
  if (!asset.output?.endsWith(".png") || asset.provenance !== "owner_authored_character_sprite") {
    throw new Error(`Asset provenance rejected: ${asset.output ?? "unknown"}`);
  }
  const assetPath = resolve(root, "office/src", asset.output);
  const digest = createHash("sha256").update(readFileSync(assetPath)).digest("hex").toUpperCase();
  if (digest !== asset.sha256) throw new Error(`Character sprite hash mismatch: ${asset.output}`);
  for (const forbidden of ["source_file", "source_sha256", "source_runtime_path", "crop"]) {
    if (forbidden in asset) throw new Error(`Private reference metadata leaked into asset: ${asset.output}`);
  }
}

const expectedScreenshots = new Map([
  ["docs/assets/office-overview.png", "9985852162B8658AC69BE0E7873ACB45130395F45ACFF56780D8E6DA4AA1F88C"],
  ["docs/assets/approval-flow.png", "D19B14F3BBB83B016F0072B888C2DCA0B5973802C967FFA8CFA380F47A70595F"],
  ["docs/assets/meet-the-office.gif", "08E47736358796FD6BEBD33DFCCA7BE2E3626F08B2EFA29BCB48DCB04633D0F1"],
]);
for (const [file, expected] of expectedScreenshots) {
  const digest = createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex").toUpperCase();
  if (digest !== expected) throw new Error(`Public screenshot provenance changed unexpectedly: ${file}`);
}

const server = readFileSync(resolve(root, "office/server.mjs"), "utf8");
if (!/runtime_adapter_api:\s*1/.test(server) || !/human_approval_gate:\s*true/.test(server) || !server.includes("/api/workforce")) {
  throw new Error("Capability contract is missing adapter API or human approval gate.");
}

const adapter = readFileSync(resolve(root, "packages/runtime-adapter/index.mjs"), "utf8");
for (const forbiddenCapability of ["write", "dispatch", "external_write", "paid_action", "account_change", "destructive"]) {
  if (!adapter.includes(`"${forbiddenCapability}"`)) throw new Error(`Runtime adapter safety contract is missing: ${forbiddenCapability}`);
}

console.log("Repository product-surface audit passed.");
