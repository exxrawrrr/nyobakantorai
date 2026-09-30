import test from "node:test";
import assert from "node:assert/strict";
import { inspectEvaluationReadiness } from "../../scripts/evaluation-doctor.mjs";
import { buildReleaseClaimSnapshot } from "./index.mjs";
import { buildDeferredEvidenceSnapshot, validateDeferredEvidenceLedger } from "../deferred-evidence/index.mjs";
import { readFile } from "node:fs/promises";

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
