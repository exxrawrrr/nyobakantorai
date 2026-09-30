import test from "node:test";
import assert from "node:assert/strict";
import { inspectEvaluationReadiness } from "../../scripts/evaluation-doctor.mjs";
import { buildReleaseClaimSnapshot } from "./index.mjs";
import { buildDeferredEvidenceSnapshot, validateDeferredEvidenceLedger } from "../deferred-evidence/index.mjs";
import { readFile } from "node:fs/promises";
import { readAndValidateEvidenceInventory, buildEvidenceClassificationSnapshot } from "../evidence-classification/index.mjs";
import { readMaturityInputs, validateMaturityModel, buildMaturitySnapshot } from "../maturity-model/index.mjs";

test("release claims preserve mixed evaluated and UNPROVEN provider state", async () => {
  const report = await inspectEvaluationReadiness();
  const snapshot = buildReleaseClaimSnapshot(report);
  assert.equal(snapshot.evaluation_records_valid, true);
  assert.equal(snapshot.live_evaluation_complete, false);
  assert.ok(snapshot.browser.length >= 2);
  assert.deepEqual(
    snapshot.browser.find((item)=>item.provider_id==="playwright-mcp"),
    {provider_id:"playwright-mcp",status:"COMPLETED",acceptance_passed:true}
  );
  assert.deepEqual(
    snapshot.browser.find((item)=>item.provider_id==="browser-use"),
    {provider_id:"browser-use",status:"NOT_RUN",acceptance_passed:false}
  );
  assert.ok(snapshot.memory.length >= 1);
  assert.ok(snapshot.memory.every((item) => item.status === "NOT_RUN" && item.acceptance_passed === false));
  assert.equal(snapshot.real_tasks.status, "COLLECTING");
  assert.equal(snapshot.real_tasks.cases, 1);
  assert.equal(snapshot.real_tasks.acceptance_passed, false);
});

test("release claims fail closed when evaluation records are invalid", () => {
  assert.throws(
    () => buildReleaseClaimSnapshot({ valid:false }),
    /invalid evaluation records/
  );
});


test("release claims carry owner-accepted deferred-evidence snapshot when supplied", async () => {
  const readJson=async(path)=>JSON.parse(await readFile(new URL(path,import.meta.url),"utf8"));
  const [ledger,crossHarness,memoryResults,browserResults,realTaskStatus]=await Promise.all([
    readJson("../../config/v0.4-deferred-evidence.json"),
    readJson("../../benchmarks/cross-harness/run-2026-09-29.json"),
    readJson("../../benchmarks/provider-evaluations/memory-results.json"),
    readJson("../../benchmarks/provider-evaluations/browser-results.json"),
    readJson("../../benchmarks/real-tasks/collection-status-2026-09-29.json"),
  ]);
  const validation=validateDeferredEvidenceLedger({ledger,crossHarness,memoryResults,browserResults,realTaskStatus});
  assert.equal(validation.ok,true,validation.errors.join("\n"));
  const deferredEvidence=buildDeferredEvidenceSnapshot({ledger,validation});
  const report=await inspectEvaluationReadiness();
  const snapshot=buildReleaseClaimSnapshot(report,{deferredEvidence});
  assert.equal(snapshot.deferred_evidence.decision,"RELEASE_WITH_ACCEPTED_DEFERRALS");
  assert.equal(snapshot.deferred_evidence.open_blockers,0);
  assert.equal(snapshot.deferred_evidence.accepted_deferred,6);
  assert.equal(snapshot.deferred_evidence.stable_promotion_allowed,true);
});

test("release claim model is provider-neutral for synthetic evidence", () => {
  const snapshot = buildReleaseClaimSnapshot({
    valid: true,
    live_evaluation_complete: false,
    browser: {
      evaluated: [
        { provider_id: "runtime-browser-a", status: "COMPLETED", acceptance_passed: true },
        { provider_id: "runtime-browser-b", status: "NOT_RUN", acceptance_passed: false },
      ],
    },
    memory: {
      evaluated: [
        { provider_id: "runtime-memory-a", status: "UNPROVEN", acceptance_passed: false },
      ],
    },
    real_tasks: {
      status: "COLLECTING",
      claim_state: "UNPROVEN",
      cases: 2,
      false_successes: 0,
      acceptance_passed: false,
    },
  }, {
    deferredEvidence: {
      schema: 1,
      decision: "HOLD",
      items: [{ id: "generic-runtime-proof", status: "UNPROVEN" }],
    },
  });
  assert.deepEqual(snapshot.browser[0], {
    provider_id: "runtime-browser-a",
    status: "COMPLETED",
    acceptance_passed: true,
  });
  assert.equal(snapshot.memory[0].provider_id, "runtime-memory-a");
  assert.equal(snapshot.deferred_evidence.items[0].id, "generic-runtime-proof");
  assert.equal(snapshot.truth_boundary, "cataloged != installed != connected != authorized != executed != succeeded != verified");
});


test("release claims expose evidence inventory and multidimensional maturity without promoting open claims",async()=>{
 const {inventory,validation:evidenceValidation}=await readAndValidateEvidenceInventory();assert.equal(evidenceValidation.ok,true,evidenceValidation.errors.join("\n"));const evidenceInventory=buildEvidenceClassificationSnapshot({inventory,validation:evidenceValidation});
 const inputs=await readMaturityInputs();const maturityValidation=await validateMaturityModel(inputs.model,{evidenceValidation,...inputs});assert.equal(maturityValidation.ok,true,maturityValidation.errors.join("\n"));const maturity=buildMaturitySnapshot({model:inputs.model,validation:maturityValidation});
 const report=await inspectEvaluationReadiness();const snapshot=buildReleaseClaimSnapshot(report,{evidenceInventory,maturity});
 assert.equal(snapshot.evidence_inventory.claims["reference-case-portability"].status,"UNPROVEN");assert.equal(snapshot.evidence_inventory.claims["real-world-workflow-demonstrated"].status,"COLLECTING");assert.equal(snapshot.maturity.dimensions.artifact,"candidate");assert.equal(snapshot.maturity.dimensions.behavioral_evidence,"evaluated-case");assert.equal(snapshot.maturity.dimensions.real_world_workflow,"collecting");assert.match(snapshot.maturity.truth_boundary,/artifact maturity != contract maturity/);
});
