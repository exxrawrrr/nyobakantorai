import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalJson } from "../execution-receipt/index.mjs";
import {
  PORTABILITY_REFERENCE_CASE_ID,
  PORTABILITY_REFERENCE_SKILLS,
  buildPortabilityReferenceCase,
  comparePortabilityCoreIdentity,
  createPortabilityRunEnvelope,
} from "./index.mjs";

const root = resolve(import.meta.dirname, "../..");

test("canonical Siti reference case binds the exact worker, task, policy, source, verification and skill set", async () => {
  const reference = await buildPortabilityReferenceCase({ root });
  assert.equal(reference.manifest.reference_case_id, PORTABILITY_REFERENCE_CASE_ID);
  assert.equal(reference.core_bundle.worker.id, "siti");
  assert.equal(reference.core_bundle.task.employee_id, "siti");
  assert.equal(reference.core_bundle.task.risk_class, "READ_ONLY");
  assert.deepEqual(reference.core_bundle.task.required_skills, [...PORTABILITY_REFERENCE_SKILLS]);
  assert.deepEqual(reference.core_bundle.policy.allowed_risk_classes, ["READ_ONLY"]);
  assert.equal(reference.core_bundle.source_artifact.facts.production_repository_mutated, false);
  assert.equal(reference.core_bundle.source_artifact.facts.external_write_performed, false);
  assert.equal(reference.core_bundle.source_artifact.facts.source_status, "CANDIDATE");
  assert.equal(reference.core_bundle.verification_contract.self_verification_sufficient, false);
  assert.equal(reference.core_bundle.expected_result.review_state, "FAIL");
  assert.deepEqual(
    reference.core_bundle.expected_result.claims.map(({ claim_id, verdict }) => [claim_id, verdict]),
    [
      ["claim-worker","SUPPORTED"],
      ["claim-write","CONTRADICTED"],
      ["claim-verified","CONTRADICTED"],
    ],
  );
});

test("portable worker bytes contain no runtime distribution/preferences or Hermes semantics", async () => {
  const reference = await buildPortabilityReferenceCase({ root });
  const worker = canonicalJson(reference.core_bundle.worker);
  assert.equal(worker.includes("preferred_toolsets"), false);
  assert.equal(worker.includes("optional_integrations"), false);
  assert.equal(worker.includes('"profile"'), false);
  assert.equal(/HERMES/i.test(worker), false);
});

test("checked-in manifest equals freshly derived repository hashes", async () => {
  const reference = await buildPortabilityReferenceCase({ root });
  const manifest = JSON.parse(await readFile(resolve(root, "benchmarks/portability/reference-case/manifest.json"), "utf8"));
  assert.deepEqual(manifest, reference.manifest);
  assert.match(manifest.core_bundle_sha256, /^[a-f0-9]{64}$/);
  for (const value of Object.values(manifest.component_sha256)) assert.match(value, /^[a-f0-9]{64}$/);
});

test("Hermes and Codex envelopes have byte-identical core inputs while runtime metadata stays outside the core hash", async () => {
  const reference = await buildPortabilityReferenceCase({ root });
  const hermes = createPortabilityRunEnvelope(reference, {
    adapter_id:"hermes-reference",
    adapter_version:"fixture",
    provider:"hermes",
    runtime_ref:"hermes:reference-case",
  });
  const codex = createPortabilityRunEnvelope(reference, {
    adapter_id:"codex-reference",
    adapter_version:"fixture",
    provider:"codex",
    runtime_ref:"codex:reference-case",
  });
  const identity = comparePortabilityCoreIdentity(hermes, codex);
  assert.equal(identity.identical, true);
  assert.deepEqual(identity.reasons, []);
  assert.notDeepEqual(hermes.runtime, codex.runtime);
  assert.equal(hermes.core_bundle_sha256, codex.core_bundle_sha256);
  assert.equal(canonicalJson(hermes.core_input), canonicalJson(codex.core_input));
});

test("one-byte-equivalent core drift is detected instead of hidden by runtime normalization", async () => {
  const reference = await buildPortabilityReferenceCase({ root });
  const hermes = createPortabilityRunEnvelope(reference, {
    adapter_id:"hermes-reference",
    provider:"hermes",
    runtime_ref:"hermes:reference-case",
  });
  const codex = structuredClone(createPortabilityRunEnvelope(reference, {
    adapter_id:"codex-reference",
    provider:"codex",
    runtime_ref:"codex:reference-case",
  }));
  codex.core_input.source_artifact.facts.source_status = "VERIFIED";
  const identity = comparePortabilityCoreIdentity(hermes, codex);
  assert.equal(identity.identical, false);
  assert.ok(identity.reasons.includes("CORE_INPUT_BYTES_MISMATCH"));
});

test("protected atoms encode the expected QA truth without granting VERIFIED status", async () => {
  const reference = await buildPortabilityReferenceCase({ root });
  const atoms = Object.fromEntries(reference.core_bundle.verification_contract.protected_atoms.map((item) => [item.path, item.expected]));
  assert.equal(atoms.review_state, "FAIL");
  assert.equal(atoms["claims.claim-worker.verdict"], "SUPPORTED");
  assert.equal(atoms["claims.claim-write.verdict"], "CONTRADICTED");
  assert.equal(atoms["claims.claim-verified.verdict"], "CONTRADICTED");
  assert.equal(reference.core_bundle.source_artifact.facts.evidence_packet_complete, false);
});

test("skill bundle hashes the exact canonical SKILL.md bytes in fixed order", async () => {
  const reference = await buildPortabilityReferenceCase({ root });
  assert.deepEqual(reference.core_bundle.skills.map((skill) => skill.id), [...PORTABILITY_REFERENCE_SKILLS]);
  for (const skill of reference.core_bundle.skills) {
    assert.match(skill.sha256, /^[a-f0-9]{64}$/);
    assert.ok(skill.byte_length > 100);
    assert.ok(skill.content.includes("## Verification"));
  }
});
