import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildDeferredEvidenceSnapshot,
  validateDeferredEvidenceLedger,
} from "./index.mjs";

const readJson=async(path)=>JSON.parse(await readFile(new URL(path,import.meta.url),"utf8"));
const [ledger,crossHarness,memoryResults,browserResults,realTaskStatus]=await Promise.all([
  readJson("../../config/v0.4-deferred-evidence.json"),
  readJson("../../benchmarks/cross-harness/run-2026-09-29.json"),
  readJson("../../benchmarks/provider-evaluations/memory-results.json"),
  readJson("../../benchmarks/provider-evaluations/browser-results.json"),
  readJson("../../benchmarks/real-tasks/collection-status-2026-09-29.json"),
]);

function validate(overrides={}){
  return validateDeferredEvidenceLedger({
    ledger:overrides.ledger??ledger,
    crossHarness:overrides.crossHarness??crossHarness,
    memoryResults:overrides.memoryResults??memoryResults,
    browserResults:overrides.browserResults??browserResults,
    realTaskStatus:overrides.realTaskStatus??realTaskStatus,
  });
}

test("deferred evidence ledger matches every current canonical blocker",()=>{
  const result=validate();
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(result.decision,"HOLD");
  assert.equal(result.open_blockers,6);
  assert.equal(result.stable_promotion_allowed,false);
  assert.deepEqual(result.blocker_ids,[
    "cross-harness-live-parity",
    "cognee-live-provider",
    "browser-use-live-provider",
    "real-task-baseline",
    "department-real-workflow-coverage",
    "real-clean-machine-hermes-lifecycle",
  ]);
});

test("canonical cross-harness promotion without ledger update fails closed",()=>{
  const changed=structuredClone(crossHarness);
  changed.claim_state="EVALUATED";
  const result=validate({crossHarness:changed});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>/cross-harness ledger drift/.test(x)));
});

test("canonical Cognee state transition requires explicit release ledger review",()=>{
  const changed=structuredClone(memoryResults);
  const provider=changed.providers.find(x=>x.provider_id==="cognee-hermes");
  provider.status="COMPLETED";
  provider.claim_state="EVALUATED_CANDIDATE";
  provider.summary.acceptance_passed=true;
  const result=validate({memoryResults:changed});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>/canonical Cognee state changed/.test(x)));
});

test("canonical Browser Use state transition requires explicit release ledger review",()=>{
  const changed=structuredClone(browserResults);
  const provider=changed.providers.find(x=>x.provider_id==="browser-use");
  provider.status="COMPLETED";
  provider.claim_state="EVALUATED_CANDIDATE";
  provider.summary.acceptance_passed=true;
  const result=validate({browserResults:changed});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>/canonical Browser Use state changed/.test(x)));
});

test("real-task count drift cannot silently remain 1/20",()=>{
  const changed=structuredClone(realTaskStatus);
  changed.eligible_cases=2;
  changed.remaining_cases=18;
  const result=validate({realTaskStatus:changed});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>/real-task ledger eligible_cases drift/.test(x)));
  assert.ok(result.errors.some(x=>/real-task ledger remaining_cases drift/.test(x)));
});

test("real-task publication gate opening forces release-decision review",()=>{
  const changed=structuredClone(realTaskStatus);
  changed.publication_gate_passed=true;
  const result=validate({realTaskStatus:changed});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>/publication gate is no longer closed/.test(x)));
});

test("blocking item cannot be relabeled non-blocking while decision remains HOLD",()=>{
  const changed=structuredClone(ledger);
  changed.items[0].blocking_stable_promotion=false;
  const result=validate({ledger:changed});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>/blocking_stable_promotion must be true/.test(x)));
});

test("release snapshot remains compact and contains no free-form next actions",()=>{
  const validation=validate();
  const snapshot=buildDeferredEvidenceSnapshot({ledger,validation});
  assert.equal(snapshot.decision,"HOLD");
  assert.equal(snapshot.open_blockers,6);
  assert.equal(snapshot.stable_promotion_allowed,false);
  assert.equal(snapshot.items.length,6);
  assert.equal(JSON.stringify(snapshot).includes("safe_next_action"),false);
  assert.equal(JSON.stringify(snapshot).includes("completion_criterion"),false);
});
