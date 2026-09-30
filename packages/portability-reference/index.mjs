import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalJson, sha256 } from "../execution-receipt/index.mjs";
import { PORTABLE_EMPLOYEE_BY_ID } from "../../lib/workforce.mjs";
import { defineRuntimeExecutionPolicy, normalizeRuntimeExecutionTask } from "../runtime-execution-adapter/index.mjs";

export const PORTABILITY_REFERENCE_CASE_ID = "siti-portability-reference-v1";
export const PORTABILITY_REFERENCE_SKILLS = Object.freeze([
  "nyoba-independent-qa",
  "nyoba-source-provenance",
  "nyoba-verification-before-completion",
  "nyoba-approval-and-evidence",
  "nyoba-safe-tool-use",
]);

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function canonicalHash(value) {
  return sha256(canonicalJson(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeRuntimeDescriptor(input = {}) {
  const adapterId = String(input.adapter_id || "").trim().toLowerCase();
  const provider = String(input.provider || "").trim().toLowerCase();
  const runtimeRef = String(input.runtime_ref || "").trim();
  assert(/^[a-z][a-z0-9-]{1,63}$/.test(adapterId), "runtime adapter_id must be a lowercase slug");
  assert(/^[a-z][a-z0-9-]{1,63}$/.test(provider), "runtime provider must be a lowercase slug");
  assert(runtimeRef, "runtime_ref required");
  return Object.freeze({
    adapter_id:adapterId,
    adapter_version:String(input.adapter_version || "").trim() || "UNSPECIFIED",
    provider,
    runtime_ref:runtimeRef,
    provider_version:input.provider_version == null ? null : String(input.provider_version).trim(),
  });
}

export async function buildPortabilityReferenceCase({ root = process.cwd() } = {}) {
  const fixtureRoot = resolve(root, "benchmarks/portability/reference-case");
  const worker = structuredClone(PORTABLE_EMPLOYEE_BY_ID.siti);
  assert(worker?.id === "siti", "portable Siti worker contract missing");
  const workerText = canonicalJson(worker);
  assert(!/"preferred_toolsets"|"optional_integrations"|"profile"/.test(workerText), "portable worker leaked runtime preferences");
  assert(!/HERMES/i.test(workerText), "portable worker contains Hermes-specific semantics");

  const task = normalizeRuntimeExecutionTask(await readJson(resolve(fixtureRoot, "task.json")));
  assert(task.task_id === PORTABILITY_REFERENCE_CASE_ID, "task id/reference case id mismatch");
  assert(task.employee_id === "siti", "reference task must use Siti");
  assert(task.risk_class === "READ_ONLY", "reference task must remain READ_ONLY");
  assert(canonicalJson(task.required_skills) === canonicalJson(PORTABILITY_REFERENCE_SKILLS), "reference skill order/content drifted");
  for (const skill of task.required_skills) {
    assert(worker.skills.includes(skill), `reference task requires skill not owned by Siti: ${skill}`);
  }

  const policyRaw = await readJson(resolve(root, "config/runtime-execution-policy.json"));
  const policy = defineRuntimeExecutionPolicy(policyRaw);
  assert(canonicalJson(policy.allowed_risk_classes) === canonicalJson(["READ_ONLY"]), "reference execution policy must remain READ_ONLY-only");

  const sourceArtifact = await readJson(resolve(fixtureRoot, "source-artifact.json"));
  const expectedResult = await readJson(resolve(fixtureRoot, "expected-result.json"));
  const verificationContract = await readJson(resolve(fixtureRoot, "verification-contract.json"));
  const evidenceExpectations = await readJson(resolve(fixtureRoot, "evidence-expectations.json"));

  const skills = [];
  for (const id of PORTABILITY_REFERENCE_SKILLS) {
    const path = resolve(root, "skills/canonical", id, "SKILL.md");
    const content = await readFile(path, "utf8");
    assert(content.trim(), `empty canonical skill: ${id}`);
    skills.push(Object.freeze({
      id,
      path:`skills/canonical/${id}/SKILL.md`,
      sha256:sha256(Buffer.from(content, "utf8")),
      byte_length:Buffer.byteLength(content, "utf8"),
      content,
    }));
  }

  const hashes = Object.freeze({
    worker_sha256:sha256(workerText),
    task_sha256:canonicalHash(task),
    policy_sha256:canonicalHash(policyRaw),
    source_artifact_sha256:canonicalHash(sourceArtifact),
    expected_result_sha256:canonicalHash(expectedResult),
    verification_contract_sha256:canonicalHash(verificationContract),
    evidence_expectations_sha256:canonicalHash(evidenceExpectations),
    skill_bundle_sha256:canonicalHash(skills.map(({ id, sha256:skillSha256, byte_length }) => ({
      id,
      sha256:skillSha256,
      byte_length,
    }))),
  });

  const coreBundle = freeze({
    schema:1,
    reference_case_id:PORTABILITY_REFERENCE_CASE_ID,
    worker,
    task,
    policy:policyRaw,
    source_artifact:sourceArtifact,
    expected_result:expectedResult,
    verification_contract:verificationContract,
    evidence_expectations:evidenceExpectations,
    skills:skills.map(({ id, path, sha256:skillSha256, byte_length, content }) => ({
      id,
      path,
      sha256:skillSha256,
      byte_length,
      content,
    })),
  });
  const coreBundleBytes = Buffer.from(canonicalJson(coreBundle), "utf8");
  const coreBundleSha256 = sha256(coreBundleBytes);

  const manifest = freeze({
    schema:1,
    reference_case_id:PORTABILITY_REFERENCE_CASE_ID,
    worker_id:"siti",
    risk_class:"READ_ONLY",
    required_skills:[...PORTABILITY_REFERENCE_SKILLS],
    component_sha256:hashes,
    core_bundle_sha256:coreBundleSha256,
    core_bundle_byte_length:coreBundleBytes.length,
    claim_limit:"Byte identity proves that runtime adapters received the same canonical core inputs. It does not prove equal behavior, correct external-world execution, or global portability.",
  });

  return freeze({
    manifest,
    core_bundle:coreBundle,
    core_bundle_bytes:coreBundleBytes,
  });
}

export function createPortabilityRunEnvelope(reference, runtimeInput) {
  assert(reference?.manifest?.core_bundle_sha256, "reference manifest required");
  const runtime = normalizeRuntimeDescriptor(runtimeInput);
  return freeze({
    schema:1,
    reference_case_id:reference.manifest.reference_case_id,
    core_bundle_sha256:reference.manifest.core_bundle_sha256,
    component_sha256:structuredClone(reference.manifest.component_sha256),
    core_input:reference.core_bundle,
    runtime,
  });
}

export function comparePortabilityCoreIdentity(left, right) {
  const reasons = [];
  if (left?.reference_case_id !== right?.reference_case_id) reasons.push("REFERENCE_CASE_ID_MISMATCH");
  if (left?.core_bundle_sha256 !== right?.core_bundle_sha256) reasons.push("CORE_BUNDLE_HASH_MISMATCH");
  if (canonicalJson(left?.component_sha256) !== canonicalJson(right?.component_sha256)) reasons.push("COMPONENT_HASH_MISMATCH");
  if (canonicalJson(left?.core_input) !== canonicalJson(right?.core_input)) reasons.push("CORE_INPUT_BYTES_MISMATCH");
  return Object.freeze({
    identical:reasons.length === 0,
    reasons:Object.freeze(reasons),
    core_bundle_sha256:left?.core_bundle_sha256 || null,
  });
}
