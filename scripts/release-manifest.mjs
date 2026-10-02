import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inspectEvaluationReadiness } from "./evaluation-doctor.mjs";
import { buildReleaseClaimSnapshot } from "../packages/release-claims/index.mjs";
import { buildDeferredEvidenceSnapshot, validateDeferredEvidenceLedger } from "../packages/release-claims/deferred-evidence.mjs";
import { buildEvidenceClassificationSnapshot, validateEvidenceInventory } from "../packages/evidence-classification/index.mjs";
import { buildMaturitySnapshot, validateMaturityModel } from "../packages/maturity-model/index.mjs";
import { buildV05ReadinessSnapshot, readAndAssessV05ReleaseReadiness, buildV06ReadinessSnapshot, readAndAssessV06ReleaseReadiness } from "../packages/release-readiness/index.mjs";

const root = resolve(import.meta.dirname, "..");
const outPath = resolve(root, "release", "manifest.json");
const check = process.argv.includes("--check");
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean)
  .filter((file) => file !== "release/manifest.json")
  .sort();

const files = tracked.map((file) => {
  const bytes = readFileSync(resolve(root, file));
  return {
    path: file.replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});

let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch {}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const evaluationReport = await inspectEvaluationReadiness();
const deferredLedger = JSON.parse(readFileSync(resolve(root, "config", "v0.4-deferred-evidence.json"), "utf8"));
const crossHarness = JSON.parse(readFileSync(resolve(root, "benchmarks", "cross-harness", "run-2026-09-29.json"), "utf8"));
const memoryResults = JSON.parse(readFileSync(resolve(root, "benchmarks", "provider-evaluations", "memory-results.json"), "utf8"));
const browserResults = JSON.parse(readFileSync(resolve(root, "benchmarks", "provider-evaluations", "browser-results.json"), "utf8"));
const realTaskStatus = JSON.parse(readFileSync(resolve(root, "benchmarks", "real-tasks", "collection-status-2026-09-29.json"), "utf8"));
const evidenceInventoryConfig = JSON.parse(readFileSync(resolve(root, "config", "evidence-classification.json"), "utf8"));
const maturityModelConfig = JSON.parse(readFileSync(resolve(root, "config", "maturity-model.json"), "utf8"));
const deferredValidation = validateDeferredEvidenceLedger({
  ledger:deferredLedger,
  crossHarness,
  memoryResults,
  browserResults,
  realTaskStatus,
});
if (!deferredValidation.ok) {
  throw new Error("deferred evidence ledger invalid: " + deferredValidation.errors.join("; "));
}
const deferredEvidence = buildDeferredEvidenceSnapshot({ledger:deferredLedger,validation:deferredValidation});
const evidenceValidation = await validateEvidenceInventory(evidenceInventoryConfig,{root});
if (!evidenceValidation.ok) throw new Error("evidence classification invalid: " + evidenceValidation.errors.join("; "));
const evidenceInventory = buildEvidenceClassificationSnapshot({inventory:evidenceInventoryConfig,validation:evidenceValidation});
const maturityValidation = await validateMaturityModel(maturityModelConfig,{root,evidenceValidation,browserResults,memoryResults,realTaskStatus});
if (!maturityValidation.ok) throw new Error("maturity model invalid: " + maturityValidation.errors.join("; "));
const maturity = buildMaturitySnapshot({model:maturityModelConfig,validation:maturityValidation});
const claims = buildReleaseClaimSnapshot(evaluationReport,{deferredEvidence,evidenceInventory,maturity});
const {config:v05ReadinessConfig,assessment:v05ReadinessAssessment}=await readAndAssessV05ReleaseReadiness({root});
if(!v05ReadinessAssessment.ok) throw new Error("v0.5 readiness invalid: "+v05ReadinessAssessment.errors.join("; "));
const v05Readiness=buildV05ReadinessSnapshot({config:v05ReadinessConfig,assessment:v05ReadinessAssessment});
const {config:v06ReadinessConfig,assessment:v06ReadinessAssessment}=await readAndAssessV06ReleaseReadiness({root});
if(!v06ReadinessAssessment.ok) throw new Error("v0.6 readiness invalid: "+v06ReadinessAssessment.errors.join("; "));
const v06Readiness=buildV06ReadinessSnapshot({config:v06ReadinessConfig,assessment:v06ReadinessAssessment});
const manifest = {
  schema: 1,
  project: pkg.name,
  version: pkg.version,
  commit,
  claims,
  v0_5_readiness:v05Readiness,
  v0_6_readiness:v06Readiness,
  tracked_files: files.length,
  files,
};

if (check) {
  console.log(`Release manifest check passed: ${files.length} files @ ${commit.slice(0, 12)} · live_evaluation_complete=${claims.live_evaluation_complete} · deferred=${claims.deferred_evidence?.open_blockers ?? "n/a"} · behavior=${claims.maturity?.dimensions?.behavioral_evidence ?? "n/a"} · portability=${claims.evidence_inventory?.claims?.["reference-case-portability"]?.status ?? "n/a"} · v0.5_readiness=${v05Readiness.decision}(${v05Readiness.blocker_count}) · v0.6_readiness=${v06Readiness.decision}(${v06Readiness.blocker_count})`);
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Release manifest written: ${files.length} files @ ${commit.slice(0, 12)}`);
}
