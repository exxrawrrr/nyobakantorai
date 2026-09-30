import test from "node:test";
import assert from "node:assert/strict";
import { reconcileClaims, sanitizeRuntimeTask } from "../reconcile.mjs";
import { EMPLOYEE_IDS } from "../workforce.mjs";

const official = [{ id:"runtime-123", assignee:"praroro", status:"blocked", created_by:"owner:office", created_at:1 }];
const claim = { id:"local-1", execution_mode:"RUNTIME", runtime_provider:"example", runtime_ref:"runtime-123", runtime_state:"blocked", assignee_id:"praroro" };

test("confirms only an exact runtime-source match", () => {
  const [result] = reconcileClaims([claim], official, "2026-09-19T00:00:00.000Z", { providerId:"example", sourceId:"fixture" });
  assert.equal(result.provenance,"AUTHORITATIVE_RUNTIME");
  assert.equal(result.quarantined,false);
  assert.equal(result.runtime_evidence.id,"runtime-123");
  assert.equal(result.runtime_evidence.provider_id,"example");
  assert.equal(result.runtime_evidence.source_id,"fixture");
});

test("quarantines fabricated, mismatched, and stale-status claims", () => {
  for (const candidate of [
    { ...claim, runtime_ref:"forged" },
    { ...claim, assignee_id:"siti" },
    { ...claim, runtime_state:"completed" },
    { ...claim, runtime_ref:"bad id with spaces" },
  ]) {
    const [result] = reconcileClaims([candidate], official);
    assert.equal(result.provenance,"LOCAL_CLAIM");
    assert.equal(result.quarantined,true);
  }
});

test("reconciliation accepts every canonical employee without provider-specific task IDs", () => {
  assert.ok(EMPLOYEE_IDS.length >= 16);
  for (const employee of EMPLOYEE_IDS) {
    const id = "task:" + employee;
    const task = sanitizeRuntimeTask({ id, assignee:employee, status:"blocked", created_by:"owner:office", created_at:1 });
    assert.ok(task,employee);
    assert.equal(task.assignee,employee);
    const [result] = reconcileClaims([{
      id:"local-" + employee, execution_mode:"RUNTIME", runtime_provider:"fixture", runtime_ref:id,
      runtime_state:"blocked", assignee_id:employee,
    }], [{ id, assignee:employee, status:"blocked", created_by:"owner:office", created_at:1 }],
    "2026-09-29T04:30:00.000Z",{providerId:"fixture",sourceId:"test-runtime"});
    assert.equal(result.provenance,"AUTHORITATIVE_RUNTIME",employee);
    assert.equal(result.quarantined,false,employee);
  }
});
